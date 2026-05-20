import { useCallback, useEffect, useRef } from 'react';
import { useConnection, usePublicClient, useWriteContract } from 'wagmi';
import { isAddress, parseAbi } from 'viem';
import { SIGNAL_CONTRACT_ADDRESS } from '@/lib/chain';
import { getBufferedGasOverrides } from '@/lib/gas';
import { usePublicContractEvent } from '@/hooks/usePublicContractEvent';

const SIGNAL_ABI = parseAbi([
    "function sendSignal(uint256 lobby_id, uint256 table_id, address[] recipients, bytes[] encrypted_data)",
    "event HandshakeSignal(address sender, uint256 lobby_id, uint256 table_id, address[] recipients, bytes[] encrypted_data)"
]);

const hasSignalContract = isAddress(SIGNAL_CONTRACT_ADDRESS);

export function usePrivatePokerSignal() {
    const publicClient = usePublicClient();
    const { address } = useConnection();
    const { mutateAsync, isPending } = useWriteContract();

    const sendSignal = useCallback(async (lobbyId, tableId, recipientAddresses, encryptedDataBytes) => {
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
        const overrides = address
            ? await getBufferedGasOverrides(publicClient, {
                address: SIGNAL_CONTRACT_ADDRESS,
                abi: SIGNAL_ABI,
                functionName: 'sendSignal',
                args,
                account: address,
            })
            : {};

        return await mutateAsync({
            address: SIGNAL_CONTRACT_ADDRESS,
            abi: SIGNAL_ABI,
            functionName: 'sendSignal',
            args,
            ...overrides,
        });
    }, [address, mutateAsync, publicClient]);

    return { sendSignal, isSendingSignal: isPending };
}

export function useListenForSignals(myWalletAddress, onSignalReceived) {
    const onSignalReceivedRef = useRef(onSignalReceived);
    const seenLogsRef = useRef(new Set());

    useEffect(() => {
        onSignalReceivedRef.current = onSignalReceived;
    }, [onSignalReceived]);

    usePublicContractEvent({
        address: SIGNAL_CONTRACT_ADDRESS,
        abi: SIGNAL_ABI,
        eventName: 'HandshakeSignal',
        enabled: hasSignalContract && Boolean(myWalletAddress),
        onLogs: (logs) => {
            logs.forEach((log) => {
                const { sender, lobby_id, table_id, recipients, encrypted_data } = log.args;

                const isRecipient = recipients?.some(
                    (recipient) => recipient?.toLowerCase() === myWalletAddress?.toLowerCase(),
                );

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
                        console.debug('[RTC debug] signal callback failed', error);
                    });
                    return;
                }

                recipients?.forEach((recipient, index) => {
                    if (recipient?.toLowerCase() !== myWalletAddress?.toLowerCase()) return;

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
                        console.debug('[RTC debug] signal callback failed', error);
                    });
                });
            });
        },
    });
}
