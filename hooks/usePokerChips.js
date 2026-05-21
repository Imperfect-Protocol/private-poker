import { useConnection, useWriteContract } from 'wagmi';
import { isAddress, parseAbi } from 'viem';
import { CHIPS_CONTRACT_ADDRESS, LOBBY_CONTRACT_ADDRESS } from '@/lib/chain';
import { getBufferedGasOverrides } from '@/lib/gas';
import { publicPokerClient } from '@/lib/publicPokerClient';
import { useBuyinAddress } from '@/hooks/useBuyinAddress';

const CHIPS_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
]);

export function usePokerChips() {
  const { address } = useConnection();
  const { mutateAsync } = useWriteContract();
  const { writeContractFromBuyinAddress } = useBuyinAddress();

  const topUpChips = async (buyinAddress, amount) => {
    if (!buyinAddress || amount <= 0n) return;

    const walletBalance = await publicPokerClient.readContract({
      address: CHIPS_CONTRACT_ADDRESS,
      abi: CHIPS_ABI,
      functionName: 'balanceOf',
      args: [address],
    });
    if (walletBalance < amount) {
      throw new Error("Insufficient Chips balance for this buy-in.");
    }

    const transferArgs = [buyinAddress, amount];
    const transferRequest = {
      address: CHIPS_CONTRACT_ADDRESS,
      abi: CHIPS_ABI,
      functionName: 'transfer',
      args: transferArgs,
      account: address,
    };
    const transferOverrides = await getBufferedGasOverrides(publicPokerClient, transferRequest);
    const transferHash = await mutateAsync({
      address: CHIPS_CONTRACT_ADDRESS,
      abi: CHIPS_ABI,
      functionName: 'transfer',
      args: transferArgs,
      ...transferOverrides,
    });
    console.log('topUpChips transaction sent', {
      from: address,
      buyinAddress,
      amount: amount.toString(),
      hash: transferHash,
    });
    await publicPokerClient.waitForTransactionReceipt({ hash: transferHash });
    console.log('topUpChips confirmed', {
      buyinAddress,
      amount: amount.toString(),
      hash: transferHash,
    });
  };

  const ensureBuyInAllowance = async (buyIn, buyinSigner = undefined) => {
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
    const ownerAddress = buyinSigner?.buyinAddress ?? address;

    const [balance, allowance] = await Promise.all([
      publicPokerClient.readContract({
        address: CHIPS_CONTRACT_ADDRESS,
        abi: CHIPS_ABI,
        functionName: 'balanceOf',
        args: [ownerAddress],
      }),
      publicPokerClient.readContract({
        address: CHIPS_CONTRACT_ADDRESS,
        abi: CHIPS_ABI,
        functionName: 'allowance',
        args: [ownerAddress, LOBBY_CONTRACT_ADDRESS],
      }),
    ]);

    if (balance < amount) {
      if (!buyinSigner?.buyinAddress) {
        throw new Error("Insufficient Chips balance for this buy-in.");
      }

      const walletBalance = await publicPokerClient.readContract({
        address: CHIPS_CONTRACT_ADDRESS,
        abi: CHIPS_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      const missingAmount = amount - balance;
      if (walletBalance < missingAmount) {
        throw new Error("Insufficient Chips balance for this buy-in.");
      }

      await topUpChips(buyinSigner.buyinAddress, missingAmount);
    }
    if (allowance >= amount) return;

    const args = [LOBBY_CONTRACT_ADDRESS, amount];
    if (buyinSigner?.buyinPrivateKey) {
      const hash = await writeContractFromBuyinAddress({
        buyinPrivateKey: buyinSigner.buyinPrivateKey,
        contract: CHIPS_CONTRACT_ADDRESS,
        abi: CHIPS_ABI,
        functionName: 'approve',
        args,
      });
      await publicPokerClient.waitForTransactionReceipt({ hash });
      return;
    }

    const txRequest = {
      address: CHIPS_CONTRACT_ADDRESS,
      abi: CHIPS_ABI,
      functionName: 'approve',
      args,
      account: address,
    };
    const overrides = await getBufferedGasOverrides(publicPokerClient, txRequest);

    const hash = await mutateAsync({
      address: CHIPS_CONTRACT_ADDRESS,
      abi: CHIPS_ABI,
      functionName: 'approve',
      args,
      ...overrides,
    });

    await publicPokerClient.waitForTransactionReceipt({ hash });
  };

  return { ensureBuyInAllowance, topUpChips };
}
