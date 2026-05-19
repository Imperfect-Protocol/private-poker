"use client";

import { useEffect, useState } from 'react';
import LobbyCard from '@/components/lobby/LobbyCard';
import { useListenForNewLobbies, usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import { getLobbyStatus } from '@/lib/constants';

export default function MainLobby() {
  const [lobbies, setLobbies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { getLobbyCount, getLobbyAt } = usePrivatePokerLobby();

  useListenForNewLobbies(() => {
    setRefreshTrigger((current) => current + 1);
  });

  useEffect(() => {
    let cancelled = false;

    const fetchLobbies = async () => {
      try {
        if (refreshTrigger === 0) setIsLoading(true);
        const count = await getLobbyCount();
        const fetchedLobbies = [];

        for (let i = 0; i < count; i += 1) {
          const lobbyData = await getLobbyAt(i);
          fetchedLobbies.push({
            id: lobbyData.id,
            active: getLobbyStatus(lobbyData.flags) === 'active' ? "true" : "false",
            name: lobbyData.name,
            table_count: lobbyData.tableCount.toString(),
            total_players: lobbyData.playerCount.toString(),
            total_buyin: `$${lobbyData.totalVolume}`,
          });
        }

        if (!cancelled) {
          fetchedLobbies.sort((a, b) => a.id - b.id);
          setLobbies(fetchedLobbies);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch lobbies from Stylus:", error);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchLobbies();

    return () => {
      cancelled = true;
    };
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
