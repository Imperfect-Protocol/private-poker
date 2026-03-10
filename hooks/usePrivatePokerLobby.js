import { usePublicClient, useWriteContract, useWatchContractEvent } from 'wagmi';
import { decodeAbiParameters, parseAbi } from 'viem';

const LOBBY_CONTRACT_ADDRESS = "0xab8e440727a38bbb180f7032ca4a8009e7b52b80";

const LOBBY_ABI = parseAbi([
    // Reads
    "function getLobbyCount() view returns (uint256)",
    "function getLobbyAt(uint256 index) view returns (bytes)",
    "function getTableCount(uint256 lobbyId) view returns (uint256)",
    "function getTableAt(uint256 lobbyId, uint256 index) view returns (bytes)",
    // Writes
    "function addLobby(uint256 id, string name)",
    "function createTable(uint256 lobbyId, uint256 tableId, string name, uint256 buyIn, string annoncePublicKey)",
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

        // Match the camelCase struct fields from Stylus
        const [lobby] = decodeAbiParameters(
            [
                {
                    type: 'tuple',
                    components: [
                        { name: 'lobbyId', type: 'uint256' },
                        { name: 'lobbyName', type: 'string' },
                        { name: 'tableCount', type: 'uint256' }
                    ]
                }
            ],
            blob
        );

        return {
            id: lobby.lobbyId.toString(),
            name: lobby.lobbyName,
            tableCount: Number(lobby.tableCount),
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
                        { name: 'tableName', type: 'string' },
                        { name: 'tableBuyin', type: 'uint256' }
                    ]
                }
            ],
            blob
        );

        return {
            id: table.tableId.toString(),
            name: table.tableName,
            buyIn: table.tableBuyin.toString(),
        };
    };

    // --- WRITE OPERATIONS ---

    const addLobby = async (id, name) => {
        return await mutateAsync({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'addLobby',
            args: [BigInt(id), name],
        });
    };

    const createTable = async (lobbyId, tableId, name, buyIn, publicKey) => {
        return await mutateAsync({
            address: LOBBY_CONTRACT_ADDRESS,
            abi: LOBBY_ABI,
            functionName: 'createTable',
            args: [BigInt(lobbyId), BigInt(tableId), name, BigInt(buyIn), publicKey],
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
        getLobbyCount,
        getLobbyAt,
        getTableCount,
        getTableAt,
        addLobby,
        createTable,
        removeLobby,
        removeTable,
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