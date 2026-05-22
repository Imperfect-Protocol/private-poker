import { useCallback } from 'react';
import { usePokerChips } from '@/hooks/usePokerChips';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import { useRequireBLS } from '@/hooks/useRequireBLS';
import { toChipUnits } from '@/lib/constants';

export function useCreateTable({ onOperatorTopUp } = {}) {
  const {
    createTable,
    getLobbyById,
    getTableCount,
    getTablesRange,
  } = usePrivatePokerLobby({ onOperatorTopUp });
  const { ensureOperatorBuyInAllowance } = usePokerChips({ onOperatorTopUp });
  const { generateKeys } = useRequireBLS();

  const createTableWithBuyIn = useCallback(async ({
    lobbyId,
    lobbyName,
    tableId,
    tableName,
    buyIn,
    blinds,
    stakesLabel,
    numPlayers,
    onStep,
  }) => {
    onStep?.('signature', 'active');
    const keys = await generateKeys({
      lobbyId,
      lobbyName,
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
    await createTable(lobbyId, tableId, tableName, toChipUnits(buyIn), numPlayers, keys.playerAddress, keys.operator, publicKeyBytes, keys.operatorPrivateKey);
    onStep?.('transfer', 'complete');
    return { publicKeyBytes, keys };
  }, [createTable, ensureOperatorBuyInAllowance, generateKeys]);

  return {
    createTableWithBuyIn,
    getLobbyById,
    getTableCount,
    getTablesRange,
  };
}
