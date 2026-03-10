import { usePublicClient, useWriteContract, useWatchContractEvent } from 'wagmi';
import { decodeAbiParameters, parseAbi } from 'viem';

const LOBBY_CONTRACT_ADDRESS = "0xe547a947fc6c8683c210a6a56a9de05dd87142ea";

const LOBBY_ABI = parseAbi([
    // Reads
    "function getLobbyCount() view returns (uint256)",
    "function getLobbyAt(uint256 index) view returns (bytes)",
    "function getTableCount(uint256 lobbyId) view returns (uint256)",
    "function getTableAt(uint256 lobbyId, uint256 index) view returns (bytes)",
    
    // Writes (Updated to match privatepoker_lobby.rs)
    "function addLobby(uint256 id, uint256 gameType, uint256 flags, string name)",
    "function createTable(uint256 lobbyId, uint256 tableId, string name, uint256 buyIn, bytes annoncePublicKey)",
    "function removeLobby(uint256 id)",
    "function removeTable(uint256 lobbyId, uint256 tableId)",
    
    // Events
    "event LobbyCreated(uint256 id, string name)",
    "event TableCreated(uint256 id, string name, uint256 buy_in)"
]);

export function usePrivatePokerLobby() {
    const publicClient = usePublicClient();
    const { mutateAsync } = useWriteContract();

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

        const [lobby] = decodeAbiParameters(
            [
                {
                    type: 'tuple',
                    components: [
                        { name: 'lobbyId', type: 'uint256' },
                        { name: 'lobbyGameType', type: 'uint256' },
                        { name: 'lobbyFlags', type: 'uint256' },
                        { name: 'lobbyTableCount', type: 'uint256' },
                        { name: 'lobbyTotalVolume', type: 'uint256' },
                        { name: 'lobbyName', type: 'string' }
                    ]
                }
            ],
            blob
        );

        return {
            id: lobby.lobbyId.toString(),
            gameType: Number(lobby.lobbyGameType),
            flags: Number(lobby.lobbyFlags),
            tableCount: Number(lobby.lobbyTableCount),
            totalVolume: lobby.lobbyTotalVolume.toString(),
            name: lobby.lobbyName,
        };
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

    const getTableAt = async (lobbyId, index) => {
        const blob = await publicClient.readContract({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'getTableAt',
            args: [BigInt(lobbyId), BigInt(index)],
        });

        const [table] = decodeAbiParameters(
            [
                {
                    type: 'tuple',
                    components: [
                        { name: 'tableId', type: 'uint256' },
                        { name: 'tableFlags', type: 'uint256' },
                        { name: 'tableBuyin', type: 'uint256' },
                        { name: 'tablePlayerCount', type: 'uint256' },
                        { name: 'tableTotalBuyin', type: 'uint256' },
                        { name: 'tableName', type: 'string' }
                    ]
                }
            ],
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
        getLobbyCount, getLobbyAt, getTableCount, getTableAt,
        addLobby, createTable, removeLobby, removeTable,
    };
}

// -- LISTEN TO EVENTS

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

