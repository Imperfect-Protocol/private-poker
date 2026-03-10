"use client";

import { useState, useEffect, use } from 'react';
import GameLobby from '@/components/GameLobby';
import { usePrivatePokerLobby, useListenForNewTables } from '@/hooks/usePrivatePokerLobby';
import { getBlindsForBuyin } from '@/lib/stakes';
import { getGameTypeName, getTableState } from '@/lib/constants';

export default function LobbyPage({ params }) {
  // 1. Unwrap the params properly for a Next.js 15 Client Component
  const { id } = use(params);

  const [tables, setTables] = useState([]);
  const [lobbyName, setLobbyName] = useState("Loading Lobby...");
  const [lobbyGameType, setLobbyGameType] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Bring in the read functions from your hook
  const { getLobbyCount, getLobbyAt, getTableCount, getTableAt } = usePrivatePokerLobby();

  useListenForNewTables((newTableArgs) => {
      console.log("New table detected on-chain!", newTableArgs);
      setRefreshTrigger(prev => prev + 1);
  });

  useEffect(() => {
    const fetchLobbyAndTables = async () => {
      try {
        if (refreshTrigger === 0) setIsLoading(true);

        // 2. Fetch the lobby name (optional, but makes the UI look good)
        const lobbyCount = await getLobbyCount();
        let currentGameType = 1;

        let lobbyGame = 0;
        for (let i = 0; i < lobbyCount; i++) {
          const lobbyData = await getLobbyAt(i);
          if (lobbyData.id === id) {
            setLobbyName(lobbyData.name);
            currentGameType = lobbyData.gameType;
            setLobbyGameType(currentGameType);
            break;
          }
        }

        // 3. Fetch all tables for this specific lobby ID
        const count = await getTableCount(id);
        const fetchedTables = [];

        for (let i = 0; i < count; i++) {
          const tableData = await getTableAt(id, i);

          fetchedTables.push({
            id: tableData.id,
            name: tableData.name,
            buyin: tableData.buyIn, 
            game: getGameTypeName(currentGameType),
            blinds: getBlindsForBuyin(tableData.buyIn),
            max_players: 6,
            current_players: tableData.playerCount, // Mapped to new property
            state: getTableState(tableData.flags),
          });
        }

        fetchedTables.sort((a, b) => a.id - b.id);
        setTables(fetchedTables);
      } catch (error) {
        console.error(`Failed to fetch tables for lobby ${id}:`, error);
      } finally {
        setIsLoading(false);
      }
    };

    // FIXED: We actually call the function now
    fetchLobbyAndTables();
  }, [id, refreshTrigger]);

  return (
    <main className="min-h-screen bg-slate-950 p-4 md:px-24 md:py-8 flex flex-col items-center justify-start">
      <div className="w-full max-w-5xl">

        <div className="flex flex-col md:flex-row justify-between items-end mb-8 px-2">
          <div>
            {/* FIXED: Using the state variable instead of the undefined lobby object */}
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase">
              {lobbyName}
            </h1>
          </div>

          <div className="hidden md:block text-right">
            <p className="text-slate-500 text-[10px] font-mono leading-none">STATUS: CONNECTED</p>
            {/* FIXED: Using tables.length from state */}
            <p className="text-teal-400 text-xs font-mono">ACTIVE_TABLES: {tables.length}</p>
          </div>
        </div>

        {/* Added a loading state so the UI doesn't crash or look empty while fetching */}
        {isLoading ? (
          <div className="w-full text-center py-16 text-teal-600/50 font-mono text-xs uppercase tracking-widest border border-dashed border-teal-500/20 rounded-xl bg-slate-900/30">
            Syncing Tables with Arbitrum Stylus...
          </div>
        ) : (
          <GameLobby tables={tables} lobbyId={id} lobbyName={lobbyName} gameType={lobbyGameType} />
        )}
      </div>
    </main>
  );
}