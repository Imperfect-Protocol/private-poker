"use client";

import GameLobby from '@/components/lobby/GameLobby';
import { useLobby } from '@/hooks/useLobby';

export default function LobbyClient({ id }) {
  const { tables, lobbyInfo, userTables, isLoading } = useLobby(id);

  return (
    <main className="min-h-full bg-slate-950 p-4 md:px-24 md:py-8 flex flex-col items-center justify-start">
      <div className="w-full max-w-5xl">

        <div className="flex flex-col md:flex-row justify-between items-end mb-8 px-2">
          <div>
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase">
              {lobbyInfo.name}
            </h1>
          </div>

          <div className="hidden md:block text-right">
            <p className="text-slate-500 text-[10px] font-mono leading-none">STATUS: CONNECTED</p>
            <p className="text-teal-400 text-xs font-mono">ACTIVE_TABLES: {tables.length}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="w-full text-center py-16 text-teal-600/50 font-mono text-xs uppercase tracking-widest border border-dashed border-teal-500/20 rounded-xl bg-slate-900/30">
            Syncing Tables with Arbitrum Stylus...
          </div>
        ) : (
          <GameLobby
            tables={tables}
            lobbyId={id}
            lobbyName={lobbyInfo.name}
            gameType={lobbyInfo.gameType}
            userTables={userTables}
          />
        )}
      </div>
    </main>
  );
}
