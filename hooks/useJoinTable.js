import { useCallback } from 'react';
import { useConnection } from 'wagmi';
import { usePokerChips } from '@/hooks/usePokerChips';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import { useRequireBLS } from '@/hooks/useRequireBLS';
import { toChipUnits } from '@/lib/constants';

export function useJoinTable() {
  const { address } = useConnection();
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
    onStep,
  }) => {
    onStep?.('signature', 'active');
    const keys = await generateKeys({
      lobbyId,
      tableId,
      tableName,
      buyIn,
      blinds,
      stakesLabel,
    });
    onStep?.('signature', 'complete');
    const publicKeyBytes = `0x${keys.publicKey}`;
    onStep?.('approval', 'active');
    await ensureBuyInAllowance(buyIn);
    onStep?.('approval', 'complete');
    onStep?.('transfer', 'active');
    await joinTable(lobbyId, tableId, toChipUnits(buyIn), address, keys.operator, publicKeyBytes);
    onStep?.('transfer', 'complete');
    return { publicKeyBytes, keys };
  }, [address, ensureBuyInAllowance, generateKeys, joinTable]);

  return { joinTableWithBuyIn };
}
