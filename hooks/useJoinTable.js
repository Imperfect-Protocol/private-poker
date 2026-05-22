import { useCallback } from 'react';
import { usePokerChips } from '@/hooks/usePokerChips';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import { useRequireBLS } from '@/hooks/useRequireBLS';
import { toChipUnits } from '@/lib/constants';

export function useJoinTable({ onOperatorTopUp } = {}) {
  const { joinTable } = usePrivatePokerLobby({ onOperatorTopUp });
  const { ensureOperatorBuyInAllowance } = usePokerChips({ onOperatorTopUp });
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
    onStep?.('operatorApproval', 'active');
    await ensureOperatorBuyInAllowance({
      buyIn,
      playerAddress: keys.playerAddress,
      operatorPrivateKey: keys.operatorPrivateKey,
    });
    onStep?.('operatorApproval', 'complete');
    onStep?.('transfer', 'active');
    await joinTable(lobbyId, tableId, toChipUnits(buyIn), keys.playerAddress, keys.operator, publicKeyBytes, keys.operatorPrivateKey);
    onStep?.('transfer', 'complete');
    return { publicKeyBytes, keys };
  }, [ensureOperatorBuyInAllowance, generateKeys, joinTable]);

  return { joinTableWithBuyIn };
}
