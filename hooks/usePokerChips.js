import { useConnection, usePublicClient, useWriteContract } from 'wagmi';
import { isAddress, parseAbi } from 'viem';
import { CHIPS_CONTRACT_ADDRESS, LOBBY_CONTRACT_ADDRESS } from '@/lib/chain';
import { getBufferedGasOverrides } from '@/lib/gas';

const CHIPS_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
]);

export function usePokerChips() {
  const publicClient = usePublicClient();
  const { address } = useConnection();
  const { mutateAsync } = useWriteContract();

  const ensureBuyInAllowance = async (buyIn) => {
    if (!isAddress(CHIPS_CONTRACT_ADDRESS)) {
      throw new Error("Poker Chips contract address is not configured.");
    }
    if (!isAddress(LOBBY_CONTRACT_ADDRESS)) {
      throw new Error("PrivatePokerLobby contract address is not configured.");
    }
    if (!address) {
      throw new Error("Connect wallet before buying in.");
    }

    const amount = BigInt(buyIn);
    if (amount === 0n) return;

    const [balance, allowance] = await Promise.all([
      publicClient.readContract({
        address: CHIPS_CONTRACT_ADDRESS,
        abi: CHIPS_ABI,
        functionName: 'balanceOf',
        args: [address],
      }),
      publicClient.readContract({
        address: CHIPS_CONTRACT_ADDRESS,
        abi: CHIPS_ABI,
        functionName: 'allowance',
        args: [address, LOBBY_CONTRACT_ADDRESS],
      }),
    ]);

    if (balance < amount) {
      throw new Error("Insufficient Chips balance for this buy-in.");
    }
    if (allowance >= amount) return;

    const args = [LOBBY_CONTRACT_ADDRESS, amount];
    const txRequest = {
      address: CHIPS_CONTRACT_ADDRESS,
      abi: CHIPS_ABI,
      functionName: 'approve',
      args,
      account: address,
    };
    const overrides = await getBufferedGasOverrides(publicClient, txRequest);

    const hash = await mutateAsync({
      address: CHIPS_CONTRACT_ADDRESS,
      abi: CHIPS_ABI,
      functionName: 'approve',
      args,
      ...overrides,
    });

    await publicClient.waitForTransactionReceipt({ hash });
  };

  return { ensureBuyInAllowance };
}
