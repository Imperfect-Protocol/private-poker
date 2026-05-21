import { useCallback } from 'react';
import { useConnection } from 'wagmi';
import { usePokerChips } from '@/hooks/usePokerChips';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import { useRequireBLS } from '@/hooks/useRequireBLS';

export function useCreateTable() {
  const { address } = useConnection();
  const {
    createTable,
    getLobbyById,
    getTableCount,
    getTablesRange,
  } = usePrivatePokerLobby();
  const { ensureBuyInAllowance } = usePokerChips();
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
  }) => {
    const keys = await generateKeys({
      lobbyId,
      lobbyName,
      tableId,
      tableName,
      buyIn,
      blinds,
      stakesLabel,
    });
    const publicKeyBytes = `0x${keys.publicKey}`;
    await ensureBuyInAllowance(buyIn);
    await createTable(lobbyId, tableId, tableName, buyIn, numPlayers, address, keys.operator, publicKeyBytes);
    return { publicKeyBytes, keys: { ...keys, playerAddress: address } };
  }, [address, createTable, ensureBuyInAllowance, generateKeys]);

  return {
    createTableWithBuyIn,
    getLobbyById,
    getTableCount,
    getTablesRange,
  };
}
