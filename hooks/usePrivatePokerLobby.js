import { usePublicClient, useWriteContract, useWatchContractEvent } from 'wagmi';
import { decodeAbiParameters, parseAbi } from 'viem';

const LOBBY_CONTRACT_ADDRESS = "0xab8e440727a38bbb180f7032ca4a8009e7b52b80";

const LOBBY_ABI = parseAbi([
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
    "function createTable(uint256 lobby_id, uint256 table_id, string calldata name, uint256 buy_in, bytes calldata annonce_public_key)",
    "function removeLobby(uint256 id)",
    "function removeTable(uint256 lobbyId, uint256 tableId)",

    // Events
    "event LobbyCreated(uint256 id, string name)",
    "event TableCreated(uint256 id, uint256 lobby_id, string name, uint256 buy_in)"
]);

export function usePrivatePokerLobby() {
    const publicClient = usePublicClient();
    const { mutateAsync } = useWriteContract();

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
            buyIn: table.tableBuyin.toString(),
            playerCount: Number(table.tablePlayerCount),
            totalBuyIn: table.tableTotalBuyin.toString(),
            name: table.tableName,
        };
    };

    // --- READ OPERATIONS ---

    const getLobbyCount = async () => {
        const count = await publicClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getLobbyCount',
        });
        return Number(count);
    };

    const getLobbyAt = async (index) => {
        const blob = await publicClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getLobbyAt',
            args: [BigInt(index)],
        });
        return decodeLobbyBlob(blob);
    };

    const getLobbyById = async (lobbyId) => {
        const blob = await publicClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getLobbyById',
            args: [BigInt(lobbyId)],
        });
        return decodeLobbyBlob(blob);
    };

    const getTableCount = async (lobbyId) => {
        const count = await publicClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getTableCount',
            args: [BigInt(lobbyId)],
        });
        return Number(count);
    };

    const getTablesRange = async (lobbyId, offset, count) => {
        const blobs = await publicClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getTablesRange',
            args: [BigInt(lobbyId), BigInt(offset), BigInt(count)],
        });
        return blobs.map(decodeTableBlob);
    };

    const getTableDetail = async (lobbyId, tableId) => {
        const blob = await publicClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getTableDetail',
            args: [BigInt(lobbyId), BigInt(tableId)],
        });

        const [detail] = decodeAbiParameters(
            [
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
                                { name: 'playerChips', type: 'uint256' }
                            ]
                        }
                    ]
                }
            ],
            blob
        );

        return {
            info: {
                id: detail.info.tableId.toString(),
                flags: Number(detail.info.tableFlags),
                buyIn: detail.info.tableBuyin.toString(),
                playerCount: Number(detail.info.tablePlayerCount),
                totalBuyIn: detail.info.tableTotalBuyin.toString(),
                name: detail.info.tableName,
            },
            players: detail.players.map(p => ({
                address: p.playerAddress,
                chips: p.playerChips.toString()
            }))
        };
    };

    const getPlayerTables = async (playerAddress) => {
        if (!playerAddress) return [];

        const tableIds = await publicClient.readContract({
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
        return await mutateAsync({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'addLobby',
            args: [BigInt(id), BigInt(gameType), BigInt(flags), name],
        });
    };

    const createTable = async (lobbyId, tableId, name, buyIn, publicKeyBytes) => {
        console.log("createTable()", lobbyId, tableId, name, buyIn, publicKeyBytes);
        return await mutateAsync({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'createTable',
            args: [BigInt(lobbyId), BigInt(tableId), name, BigInt(buyIn), publicKeyBytes],
        });
    };

    const removeLobby = async (id) => {
        return await mutateAsync({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'removeLobby',
            args: [BigInt(id)],
        });
    };

    const removeTable = async (lobbyId, tableId) => {
        return await mutateAsync({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'removeTable',
            args: [BigInt(lobbyId), BigInt(tableId)],
        });
    };

    return {
        getLobbyCount, getLobbyAt, getLobbyById,
        getTableCount, getTablesRange, getTableDetail, getPlayerTables,
        addLobby, createTable, removeLobby, removeTable,
    };
}

// -- LISTEN TO EVENTS --

export function useListenForNewLobbies(onLobbyCreated) {
    useWatchContractEvent({
        address: LOBBY_CONTRACT_ADDRESS,
        abi: LOBBY_ABI,
        eventName: 'LobbyCreated',
        onLogs: (logs) => {
            logs.forEach(log => {
                onLobbyCreated(log.args);
            });
        },
    });
}

export function useListenForNewTables(onTableCreated) {
    useWatchContractEvent({
        address: LOBBY_CONTRACT_ADDRESS,
        abi: LOBBY_ABI,
        eventName: 'TableCreated',
        onLogs: (logs) => {
            logs.forEach(log => {
                onTableCreated(log.args);
            });
        },
    });
}