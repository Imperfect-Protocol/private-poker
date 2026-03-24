import { useWriteContract, useWatchContractEvent } from 'wagmi';
import { parseAbi } from 'viem';
import { SIGNAL_CONTRACT_ADDRESS } from '@/lib/chain';

const SIGNAL_ABI = parseAbi([
    "function send_signal(uint256 lobby_id, uint256 table_id, address recipient, bytes encrypted_data)",
    "event HandshakeSignal(address sender, uint256 lobby_id, uint256 table_id, address recipient, bytes encrypted_data)"
]);

export function usePrivatePokerSignal() {
    const { mutateAsync, isPending } = useWriteContract();

    // 1. The "Knock" - Send the encrypted WebRTC offer/answer on-chain
    const sendSignal = async (lobbyId, tableId, recipientAddress, encryptedDataBytes) => {
        return await mutateAsync({
            address: SIGNAL_CONTRACT_ADDRESS,
            abi: SIGNAL_ABI,
            functionName: 'send_signal',
            args: [BigInt(lobbyId), BigInt(tableId), recipientAddress, encryptedDataBytes],
        });
    };

    return { sendSignal, isSendingSignal: isPending };
}

// 2. The "Listen" - Automatically triggers when someone knocks on your door
export function useListenForSignals(myWalletAddress, onSignalReceived) {
    useWatchContractEvent({
        address: SIGNAL_CONTRACT_ADDRESS,
        abi: SIGNAL_ABI,
        eventName: 'HandshakeSignal',
        onLogs: (logs) => {
            logs.forEach(log => {
                const { sender, lobby_id, table_id, recipient, encrypted_data } = log.args;
                
                // Only process the signal if it is addressed to the connected wallet
                if (recipient?.toLowerCase() === myWalletAddress?.toLowerCase()) {
                    onSignalReceived({
                        sender,
                        lobbyId: lobby_id.toString(),
                        tableId: table_id.toString(),
                        encryptedData: encrypted_data
                    });
                }
            });
        },
    });
}