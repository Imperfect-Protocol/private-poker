import { useEffect, useRef } from 'react';
import { useConnection, useWriteContract } from 'wagmi';
import { decodeAbiParameters, parseAbi } from 'viem';
import { LOBBY_CONTRACT_ADDRESS } from '@/lib/chain';
import { fromChipUnits } from '@/lib/constants';
import { getBufferedGasOverrides } from '@/lib/gas';
import { publicPokerClient } from '@/lib/publicPokerClient';
import { useOperatorAddress } from '@/hooks/useOperatorAddress';
import { usePublicContractEvent } from '@/hooks/usePublicContractEvent';

export const LOBBY_ABI = parseAbi([
    // Reads
    "function getLobbyCount() view returns (uint256)",
    "function getLobbyAt(uint256 index) view returns (bytes)",
    "function getLobbyById(uint256 lobbyId) view returns (bytes)",
    "function getTableCount(uint256 lobbyId) view returns (uint256)",
    "function getTablesRange(uint256 lobbyId, uint256 offset, uint256 count) view returns (bytes[])",
    "function getTableDetail(uint256 lobbyId, uint256 tableId) view returns (bytes)",
    "function getPlayerTables(address player) view returns (uint256[])",

    // Writes
    "function addLobby(uint256 id, uint256 gameType, uint256 flags, string name)",
    "function createTable(uint256 lobby_id, uint256 table_id, string calldata name, uint256 buy_in, uint256 num_players, address player_address, address operator, bytes calldata annonce_public_key)",
    "function joinTable(uint256 lobby_id, uint256 table_id, address player_address, address operator, bytes calldata annonce_public_key)",
    "function removeLobby(uint256 id)",
    "function removeTable(uint256 lobbyId, uint256 tableId)",

    // Events
    "event LobbyCreated(uint256 id, string name)",
    "event TableCreated(uint256 id, uint256 lobby_id, string name, uint256 buy_in)"
]);

export function usePrivatePokerLobby({ onOperatorTopUp } = {}) {
    const { address } = useConnection();
    const { mutateAsync } = useWriteContract();
    const { writeContractFromOperator } = useOperatorAddress({ onOperatorTopUp });

    const getWriteOverrides = async ({ functionName, args }) => {
        if (!address) return {};

        return getBufferedGasOverrides(publicPokerClient, {
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName,
            args,
            account: address,
        });
    };

    const writeLobbyContract = async ({ functionName, args, operatorPrivateKey }) => {
        if (operatorPrivateKey) {
            return writeContractFromOperator({
                operatorPrivateKey,
                contract: LOBBY_CONTRACT_ADDRESS,
                abi: LOBBY_ABI,
                functionName,
                args,
            });
        }

        const overrides = await getWriteOverrides({ functionName, args });

        return await mutateAsync({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName,
            args,
            ...overrides,
        });
    };

    // --- DECODERS ---

    const decodeLobbyBlob = (blob) => {
        const [lobby] = decodeAbiParameters(
            [{
                type: 'tuple',
                components: [
                    { name: 'lobbyId', type: 'uint256' },
                    { name: 'lobbyGameType', type: 'uint256' },
                    { name: 'lobbyFlags', type: 'uint256' },
                    { name: 'lobbyTableCount', type: 'uint256' },
                    { name: 'lobbyPlayerCount', type: 'uint256' },
                    { name: 'lobbyTotalVolume', type: 'uint256' },
                    { name: 'lobbyName', type: 'string' }
                ]
            }],
            blob
        );

        return {
            id: lobby.lobbyId.toString(),
            gameType: Number(lobby.lobbyGameType),
            flags: Number(lobby.lobbyFlags),
            tableCount: Number(lobby.lobbyTableCount),
            playerCount: Number(lobby.lobbyPlayerCount),
            totalVolume: lobby.lobbyTotalVolume.toString(),
            name: lobby.lobbyName,
        };
    };

    const decodeTableBlob = (blob) => {
        const [table] = decodeAbiParameters(
            [{
                type: 'tuple',
                components: [
                    { name: 'tableId', type: 'uint256' },
                    { name: 'tableFlags', type: 'uint256' },
                    { name: 'tableBuyin', type: 'uint256' },
                    { name: 'tablePlayerCount', type: 'uint256' },
                    { name: 'tableTotalBuyin', type: 'uint256' },
                    { name: 'tableName', type: 'string' }
                ]
            }],
            blob
        );

        return {
            id: table.tableId.toString(),
            flags: Number(table.tableFlags),
            buyIn: fromChipUnits(table.tableBuyin),
            playerCount: Number(table.tablePlayerCount),
            totalBuyIn: fromChipUnits(table.tableTotalBuyin),
            name: table.tableName,
        };
    };

    // --- READ OPERATIONS ---

    const getLobbyCount = async () => {
        const count = await publicPokerClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getLobbyCount',
        });
        return Number(count);
    };

    const getLobbyAt = async (index) => {
        const blob = await publicPokerClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getLobbyAt',
            args: [BigInt(index)],
        });
        return decodeLobbyBlob(blob);
    };

    const getLobbyById = async (lobbyId) => {
        const blob = await publicPokerClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getLobbyById',
            args: [BigInt(lobbyId)],
        });
        return decodeLobbyBlob(blob);
    };

    const getTableCount = async (lobbyId) => {
        const count = await publicPokerClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getTableCount',
            args: [BigInt(lobbyId)],
        });
        return Number(count);
    };

    const getTablesRange = async (lobbyId, offset, count) => {
        const blobs = await publicPokerClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getTablesRange',
            args: [BigInt(lobbyId), BigInt(offset), BigInt(count)],
        });
        return blobs.map(decodeTableBlob);
    };

    const getTableDetail = async (lobbyId, tableId) => {
        const blob = await publicPokerClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getTableDetail',
            args: [BigInt(lobbyId), BigInt(tableId)],
        });

        const tableDetailShape = (includeAnnoncePublicKey) => [
            {
                type: 'tuple',
                components: [
                    {
                        name: 'info',
                        type: 'tuple',
                        components: [
                            { name: 'tableId', type: 'uint256' },
                            { name: 'tableFlags', type: 'uint256' },
                            { name: 'tableBuyin', type: 'uint256' },
                            { name: 'tablePlayerCount', type: 'uint256' },
                            { name: 'tableTotalBuyin', type: 'uint256' },
                            { name: 'tableName', type: 'string' }
                        ]
                    },
                    {
                        name: 'players',
                        type: 'tuple[]',
                        components: [
                            { name: 'playerAddress', type: 'address' },
                            { name: 'operator', type: 'address' },
                            { name: 'playerChips', type: 'uint256' },
                            ...(includeAnnoncePublicKey
                                ? [{ name: 'playerAnnoncePublicKey', type: 'bytes' }]
                                : [])
                        ]
                    }
                ]
            }
        ];

        let detail;
        try {
            [detail] = decodeAbiParameters(tableDetailShape(true), blob);
        } catch {
            [detail] = decodeAbiParameters(tableDetailShape(false), blob);
        }

        return {
            info: {
                id: detail.info.tableId.toString(),
                flags: Number(detail.info.tableFlags),
                buyIn: fromChipUnits(detail.info.tableBuyin),
                playerCount: Number(detail.info.tablePlayerCount),
                totalBuyIn: fromChipUnits(detail.info.tableTotalBuyin),
                name: detail.info.tableName,
            },
            players: detail.players.map(p => ({
                playerAddress: p.playerAddress,
                operator: p.operator,
                chips: fromChipUnits(p.playerChips),
                annoncePublicKey: p.playerAnnoncePublicKey ?? null,
            }))
        };
    };

    const getPlayerTables = async (playerAddress) => {
        if (!playerAddress) return [];

        const tableIds = await publicPokerClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getPlayerTables',
            args: [playerAddress],
        });

        // Convert the returned BigInt array to strings for easy frontend comparison
        return tableIds.map(id => id.toString());
    };

    // --- WRITE OPERATIONS ---

    const addLobby = async (id, gameType, flags, name) => {
        return await writeLobbyContract({
            functionName: 'addLobby',
            args: [BigInt(id), BigInt(gameType), BigInt(flags), name],
        });
    };

    const createTable = async (lobbyId, tableId, name, buyIn, numPlayers, playerAddress, operator, publicKeyBytes = '0x', operatorPrivateKey = undefined) => {
        return await writeLobbyContract({
            functionName: 'createTable',
            args: [BigInt(lobbyId), BigInt(tableId), name, BigInt(buyIn), BigInt(numPlayers), playerAddress, operator, publicKeyBytes],
            operatorPrivateKey,
        });
    };

    const joinTable = async (lobbyId, tableId, buyIn, playerAddress, operator, publicKeyBytes = '0x', operatorPrivateKey = undefined) => {
        return await writeLobbyContract({
            functionName: 'joinTable',
            args: [BigInt(lobbyId), BigInt(tableId), playerAddress, operator, publicKeyBytes],
            operatorPrivateKey,
        });
    };

    const removeLobby = async (id) => {
        return await writeLobbyContract({
            functionName: 'removeLobby',
            args: [BigInt(id)],
        });
    };

    const removeTable = async (lobbyId, tableId) => {
        return await writeLobbyContract({
            functionName: 'removeTable',
            args: [BigInt(lobbyId), BigInt(tableId)],
        });
    };

    return {
        getLobbyCount, getLobbyAt, getLobbyById,
        getTableCount, getTablesRange, getTableDetail, getPlayerTables,
        addLobby, createTable, joinTable, removeLobby, removeTable,
    };
}

// -- LISTEN TO EVENTS --

export function useListenForNewLobbies(onLobbyCreated) {
    const onLobbyCreatedRef = useRef(onLobbyCreated);

    useEffect(() => {
        onLobbyCreatedRef.current = onLobbyCreated;
    }, [onLobbyCreated]);

    usePublicContractEvent({
        address: LOBBY_CONTRACT_ADDRESS,
        abi: LOBBY_ABI,
        eventName: 'LobbyCreated',
        onLogs: (logs) => {
            logs.forEach(log => {
                onLobbyCreatedRef.current?.(log.args);
            });
        },
    });
}

export function useListenForNewTables(onTableCreated) {
    const onTableCreatedRef = useRef(onTableCreated);

    useEffect(() => {
        onTableCreatedRef.current = onTableCreated;
    }, [onTableCreated]);

    usePublicContractEvent({
        address: LOBBY_CONTRACT_ADDRESS,
        abi: LOBBY_ABI,
        eventName: 'TableCreated',
        onLogs: (logs) => {
            logs.forEach(log => {
                onTableCreatedRef.current?.(log.args);
            });
        },
    });
}
