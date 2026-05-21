import { useCallback } from 'react';
import { usePokerChips } from '@/hooks/usePokerChips';
import { LOBBY_ABI, usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import { useRequireBLS } from '@/hooks/useRequireBLS';
import { useBuyinAddress } from '@/hooks/useBuyinAddress';
import { LOBBY_CONTRACT_ADDRESS } from '@/lib/chain';

export function useJoinTable() {
  const { joinTable } = usePrivatePokerLobby();
  const { ensureBuyInAllowance } = usePokerChips();
  const { generateKeys } = useRequireBLS();
  const { ensureBuyinAddressGasForContract } = useBuyinAddress();

  const joinTableWithBuyIn = useCallback(async ({
    lobbyId,
    tableId,
    tableName,
    buyIn,
    blinds,
    stakesLabel,
  }) => {
    const keys = await generateKeys({
      lobbyId,
      tableId,
      tableName,
      buyIn,
      blinds,
      stakesLabel,
    });
    const publicKeyBytes = `0x${keys.publicKey}`;
    const buyinSigner = {
      buyinAddress: keys.buyinAddress,
      buyinPrivateKey: keys.buyinPrivateKey,
    };
    await ensureBuyInAllowance(buyIn, buyinSigner);
    await ensureBuyinAddressGasForContract({
      buyinPrivateKey: keys.buyinPrivateKey,
      contract: LOBBY_CONTRACT_ADDRESS,
      abi: LOBBY_ABI,
      functionName: 'joinTable',
      args: [BigInt(lobbyId), BigInt(tableId), publicKeyBytes],
    });
    await joinTable(lobbyId, tableId, buyIn, publicKeyBytes, buyinSigner);
    return { publicKeyBytes, keys };
  }, [ensureBuyInAllowance, ensureBuyinAddressGasForContract, generateKeys, joinTable]);

  return { joinTableWithBuyIn };
}
