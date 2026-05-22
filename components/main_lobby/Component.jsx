"use client";

import LobbyCard from '@/components/lobby/LobbyCard';
import { useLobby } from '@/hooks/useLobby';

export default function MainLobby() {
  const { lobbies, isLoading } = useLobby();

  return (
    <main className="min-h-full bg-slate-950 p-4 md:px-24 md:py-8 flex flex-col items-center justify-start">
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
