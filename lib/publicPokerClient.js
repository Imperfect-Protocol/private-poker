import { createPublicClient, createWalletClient, http } from 'viem';
import { CHAIN_RPC_URL } from '@/lib/chain';

export const publicPokerClient = createPublicClient({
  transport: http(CHAIN_RPC_URL),
});

export function createPokerWalletClient(account) {
  return createWalletClient({
    account,
    transport: http(CHAIN_RPC_URL),
  });
}
