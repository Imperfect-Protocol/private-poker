import { useEffect, useRef } from 'react';
import { useWriteContract, useWatchContractEvent } from 'wagmi';
import { isAddress, parseAbi } from 'viem';
import { SIGNAL_CONTRACT_ADDRESS, CHAIN_POLLING_INTERVAL } from '@/lib/chain';

const SIGNAL_ABI = parseAbi([
    "function send_signal(uint256 lobby_id, uint256 table_id, address[] recipients, bytes[] encrypted_data)",
    "event HandshakeSignal(address sender, uint256 lobby_id, uint256 table_id, address[] recipients, bytes[] encrypted_data)"
]);

const hasSignalContract = isAddress(SIGNAL_CONTRACT_ADDRESS);

export function usePrivatePokerSignal() {
    const { mutateAsync, isPending } = useWriteContract();

    const sendSignal = async (lobbyId, tableId, recipientAddresses, encryptedDataBytes) => {
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

        return await mutateAsync({
            address: SIGNAL_CONTRACT_ADDRESS,
            abi: SIGNAL_ABI,
            functionName: 'send_signal',
            args: [
                BigInt(lobbyId),
                BigInt(tableId),
                recipients,
                encryptedData,
            ],
        });
    };

    return { sendSignal, isSendingSignal: isPending };
}

export function useListenForSignals(myWalletAddress, onSignalReceived) {
    const onSignalReceivedRef = useRef(onSignalReceived);

    useEffect(() => {
        onSignalReceivedRef.current = onSignalReceived;
    }, [onSignalReceived]);

    useWatchContractEvent({
        address: hasSignalContract ? SIGNAL_CONTRACT_ADDRESS : undefined,
        abi: SIGNAL_ABI,
        eventName: 'HandshakeSignal',
        enabled: hasSignalContract && Boolean(myWalletAddress),
        pollingInterval: CHAIN_POLLING_INTERVAL,
        onLogs: (logs) => {
            logs.forEach(log => {
                const { sender, lobby_id, table_id, recipients, encrypted_data } = log.args;

                recipients?.forEach((recipient, index) => {
                    if (recipient?.toLowerCase() !== myWalletAddress?.toLowerCase()) return;

                    onSignalReceivedRef.current?.({
                        sender,
                        lobbyId: lobby_id.toString(),
                        tableId: table_id.toString(),
                        encryptedData: encrypted_data[index],
                        logId: `${log.transactionHash}:${log.logIndex}:${index}`,
                    });
                });
            });
        },
    });
}
