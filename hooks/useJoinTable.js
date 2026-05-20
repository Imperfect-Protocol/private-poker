import { useCallback } from 'react';
import { usePokerChips } from '@/hooks/usePokerChips';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import { useRequireBLS } from '@/hooks/useRequireBLS';

export function useJoinTable() {
  const { joinTable } = usePrivatePokerLobby();
  const { ensureBuyInAllowance } = usePokerChips();
  const { generateKeys } = useRequireBLS();

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
    await ensureBuyInAllowance(buyIn);
    await joinTable(lobbyId, tableId, buyIn, publicKeyBytes);
    return { publicKeyBytes, keys };
  }, [ensureBuyInAllowance, generateKeys, joinTable]);

  return { joinTableWithBuyIn };
}
