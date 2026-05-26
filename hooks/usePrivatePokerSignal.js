import { useCallback, useEffect, useRef } from 'react';
import { useConnection, useWriteContract } from 'wagmi';
import { isAddress, parseAbi } from 'viem';
import { SIGNAL_CONTRACT_ADDRESS } from '@/lib/chain';
import { getBufferedGasOverrides } from '@/lib/gas';
import { publicPokerClient } from '@/lib/publicPokerClient';
import { useOperatorAddress } from '@/hooks/useOperatorAddress';
import { usePublicContractEvent } from '@/hooks/usePublicContractEvent';

const SIGNAL_ABI = parseAbi([
    "function sendSignal(uint256 lobby_id, uint256 table_id, address[] recipients, bytes[] encrypted_data)",
    "event HandshakeSignal(address sender, uint256 lobby_id, uint256 table_id, address[] recipients, bytes[] encrypted_data)"
]);

const hasSignalContract = isAddress(SIGNAL_CONTRACT_ADDRESS);
const formatPeer = (value) => {
    const text = value ? String(value) : '';
    if (!text) return 'unknown';
    return text.length <= 12 ? text : `${text.slice(0, 6)}...${text.slice(-4)}`;
};

export function usePrivatePokerSignal({ onOperatorTopUp } = {}) {
    const { address } = useConnection();
    const { mutateAsync, isPending } = useWriteContract();
    const { writeContractFromOperator } = useOperatorAddress({ onOperatorTopUp });

    const sendSignal = useCallback(async (lobbyId, tableId, recipientAddresses, encryptedDataBytes, operatorSigner = undefined) => {
        if (!hasSignalContract) {
            throw new Error("PrivatePokerSignal contract address is not configured.");
        }

        const recipients = Array.isArray(recipientAddresses)
            ? recipientAddresses
            : [recipientAddresses];
        const encryptedData = Array.isArray(encryptedDataBytes)
            ? encryptedDataBytes
            : [encryptedDataBytes];

        if (recipients.length !== encryptedData.length) {
            throw new Error("Signal recipient and payload counts must match.");
        }

        const args = [
            BigInt(lobbyId),
            BigInt(tableId),
            recipients,
            encryptedData,
        ];
        console.log('[RTC signal] send_signal submit', {
            lobbyId: String(lobbyId),
            tableId: String(tableId),
            recipients: recipients.map(formatPeer),
            payloads: encryptedData.length,
            viaOperator: Boolean(operatorSigner?.operatorPrivateKey),
        });

        if (operatorSigner?.operatorPrivateKey) {
            const result = await writeContractFromOperator({
                operatorPrivateKey: operatorSigner.operatorPrivateKey,
                contract: SIGNAL_CONTRACT_ADDRESS,
                abi: SIGNAL_ABI,
                functionName: 'sendSignal',
                args,
            });
            console.log('[RTC signal] send_signal submitted via operator', {
                lobbyId: String(lobbyId),
                tableId: String(tableId),
                recipients: recipients.map(formatPeer),
                result,
            });
            return result;
        }

        const overrides = address
            ? await getBufferedGasOverrides(publicPokerClient, {
                address: SIGNAL_CONTRACT_ADDRESS,
                abi: SIGNAL_ABI,
                functionName: 'sendSignal',
                args,
                account: address,
            })
            : {};

        const result = await mutateAsync({
            address: SIGNAL_CONTRACT_ADDRESS,
            abi: SIGNAL_ABI,
            functionName: 'sendSignal',
            args,
            ...overrides,
        });
        console.log('[RTC signal] send_signal submitted', {
            lobbyId: String(lobbyId),
            tableId: String(tableId),
            recipients: recipients.map(formatPeer),
            result,
        });
        return result;
    }, [address, mutateAsync, writeContractFromOperator]);

    return { sendSignal, isSendingSignal: isPending };
}

export function useListenForSignals(myPlayerAddress, onSignalReceived) {
    const onSignalReceivedRef = useRef(onSignalReceived);
    const seenLogsRef = useRef(new Set());

    useEffect(() => {
        onSignalReceivedRef.current = onSignalReceived;
    }, [onSignalReceived]);

    usePublicContractEvent({
        address: SIGNAL_CONTRACT_ADDRESS,
        abi: SIGNAL_ABI,
        eventName: 'HandshakeSignal',
        enabled: hasSignalContract && Boolean(myPlayerAddress),
        onLogs: (logs) => {
            logs.forEach((log) => {
                const { sender, lobby_id, table_id, recipients, encrypted_data } = log.args;

                const isRecipient = recipients?.some(
                    (recipient) => recipient?.toLowerCase() === myPlayerAddress?.toLowerCase(),
                );
                console.log('[RTC signal] HandshakeSignal observed', {
                    sender: formatPeer(sender),
                    lobbyId: lobby_id?.toString(),
                    tableId: table_id?.toString(),
                    recipients: recipients?.map(formatPeer) ?? [],
                    isRecipient,
                    tx: log.transactionHash,
                    index: log.logIndex,
                });

                if (!isRecipient) {
                    const logId = `${log.transactionHash}:${log.logIndex}:observed`;
                    if (seenLogsRef.current.has(logId)) return;
                    seenLogsRef.current.add(logId);
                    if (seenLogsRef.current.size > 500) {
                        const [oldestLogId] = seenLogsRef.current;
                        seenLogsRef.current.delete(oldestLogId);
                    }

                    Promise.resolve(onSignalReceivedRef.current?.({
                        sender,
                        lobbyId: lobby_id.toString(),
                        tableId: table_id.toString(),
                        recipients,
                        encryptedData: undefined,
                        logId,
                        isRecipient: false,
                    })).catch((error) => {
                        console.log('[RTC debug] signal callback failed', error);
                    });
                    return;
                }

                recipients?.forEach((recipient, index) => {
                    if (recipient?.toLowerCase() !== myPlayerAddress?.toLowerCase()) return;

                    const logId = `${log.transactionHash}:${log.logIndex}:${index}`;
                    if (seenLogsRef.current.has(logId)) return;
                    seenLogsRef.current.add(logId);
                    if (seenLogsRef.current.size > 500) {
                        const [oldestLogId] = seenLogsRef.current;
                        seenLogsRef.current.delete(oldestLogId);
                    }

                    Promise.resolve(onSignalReceivedRef.current?.({
                        sender,
                        lobbyId: lobby_id.toString(),
                        tableId: table_id.toString(),
                        recipients,
                        encryptedData: encrypted_data[index],
                        logId,
                        isRecipient: true,
                    })).catch((error) => {
                        console.log('[RTC debug] signal callback failed', error);
                    });
                });
            });
        },
    });
}
