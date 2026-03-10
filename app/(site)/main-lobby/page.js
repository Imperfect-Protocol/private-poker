"use client";

import { useState, useEffect } from 'react';
import LobbyCard from '@/components/LobbyCard.js';
import { usePrivatePokerLobby, useListenForNewLobbies } from '@/hooks/usePrivatePokerLobby';

export default function MainLobbyPage() {
    const [lobbies, setLobbies] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Bring in your custom hook
    const { getLobbyCount, getLobbyAt } = usePrivatePokerLobby();

    useListenForNewLobbies((newLobbyArgs) => {
        console.log("New lobby detected on-chain!", newLobbyArgs);
        setRefreshTrigger(prev => prev + 1);
    });

    useEffect(() => {
        const fetchLobbies = async () => {
            try {
                if (refreshTrigger === 0) { setIsLoading(true); }
                const count = await getLobbyCount();
                const fetchedLobbies = [];
                console.log(`lobbyCount = ${count}`);

                for (let i = 0; i < count; i++) {
                    const lobbyData = await getLobbyAt(i);

                    // Construct the object exactly as LobbyCard expects it from game.json
                    fetchedLobbies.push({
                        id: lobbyData.id,
                        active: "true",
                        name: lobbyData.name,
                        table_count: lobbyData.tableCount.toString(),
                        // Placeholders until we aggregate table data from the contract
                        total_players: "0",
                        total_buyin: "$0"
                    });
                }

                setLobbies(fetchedLobbies);
            } catch (error) {
                console.error("Failed to fetch lobbies from Stylus:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchLobbies();
    }, [refreshTrigger]);

    return (
        <main className="min-h-screen bg-slate-950 p-4 md:px-24 md:py-8 flex flex-col items-center justify-start">
            <div className="w-full max-w-5xl">
                <div className="flex flex-col md:flex-row justify-between items-end mb-8 px-2">
                    <h1 className="text-4xl font-black text-white tracking-tighter uppercase">
                        Lobbies
                    </h1>
                </div>

                {isLoading ? (
                    <div className="w-full text-center py-16 text-teal-600/50 font-mono text-xs uppercase tracking-widest border border-dashed border-teal-500/20 rounded-xl bg-slate-900/30">
                        Syncing with Arbitrum Stylus...
                    </div>
                ) : lobbies.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {lobbies.map((lobby) => (
                            <LobbyCard key={lobby.id} lobby={lobby} />
                        ))}
                    </div>
                ) : (
                    <div className="w-full text-center py-16 text-teal-600/50 font-mono text-xs uppercase tracking-widest border border-dashed border-teal-500/20 rounded-xl bg-slate-900/30">
                        No active lobbies found.
                    </div>
                )}
            </div>
        </main>
    );
}