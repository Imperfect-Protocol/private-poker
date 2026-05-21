import { useCallback } from 'react';
import { usePokerChips } from '@/hooks/usePokerChips';
import { LOBBY_ABI, usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import { useRequireBLS } from '@/hooks/useRequireBLS';
import { useBuyinAddress } from '@/hooks/useBuyinAddress';
import { LOBBY_CONTRACT_ADDRESS } from '@/lib/chain';

export function useCreateTable() {
  const {
    createTable,
    getLobbyById,
    getTableCount,
    getTablesRange,
  } = usePrivatePokerLobby();
  const { ensureBuyInAllowance } = usePokerChips();
  const { generateKeys } = useRequireBLS();
  const { ensureBuyinAddressGasForContract } = useBuyinAddress();

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
    const buyinSigner = {
      buyinAddress: keys.buyinAddress,
      buyinPrivateKey: keys.buyinPrivateKey,
    };
    await ensureBuyInAllowance(buyIn, buyinSigner);
    await ensureBuyinAddressGasForContract({
      buyinPrivateKey: keys.buyinPrivateKey,
      contract: LOBBY_CONTRACT_ADDRESS,
      abi: LOBBY_ABI,
      functionName: 'createTable',
      args: [BigInt(lobbyId), BigInt(tableId), tableName, BigInt(buyIn), BigInt(numPlayers), publicKeyBytes],
    });
    await createTable(lobbyId, tableId, tableName, buyIn, numPlayers, publicKeyBytes, buyinSigner);
    return { publicKeyBytes, keys };
  }, [createTable, ensureBuyInAllowance, ensureBuyinAddressGasForContract, generateKeys]);

  return {
    createTableWithBuyIn,
    getLobbyById,
    getTableCount,
    getTablesRange,
  };
}
