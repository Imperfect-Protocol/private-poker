"use client";

import { useState, useEffect, useRef } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { useConnection } from 'wagmi';
import GameLobby from '@/components/lobby/GameLobby';
import { usePrivatePokerLobby, useListenForNewTables } from '@/hooks/usePrivatePokerLobby';
import { getBlindsForBuyin } from '@/lib/stakes';
import { getGameTypeName } from '@/lib/constants';

// 1. Accept 'id' directly as a prop
export default function LobbyClient({ id }) {
  const { address } = useConnection();
  const { isConnected } = useAppKitAccount();
  const wasConnectedRef = useRef(isConnected);

  const [tables, setTables] = useState([]);
  const [lobbyInfo, setLobbyInfo] = useState({ name: "Loading...", gameType: 1 });
  const [userTables, setUserTables] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { getLobbyById, getTableCount, getTablesRange, getPlayerTables } = usePrivatePokerLobby();

  useListenForNewTables((newTableArgs) => {
    if (newTableArgs.lobby_id?.toString() === id.toString()) {
      setRefreshTrigger(prev => prev + 1);
    }
  });

  useEffect(() => {
    if (wasConnectedRef.current && !isConnected) {
      setRefreshTrigger(prev => prev + 1);
    }

    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    const fetchLobbyAndTables = async () => {
      try {
        if (refreshTrigger === 0) setIsLoading(true);

        const lobbyData = await getLobbyById(id);
        setLobbyInfo({
          name: lobbyData.name,
          gameType: lobbyData.gameType
        });

        // Fetch all tables in this lobby
        const count = await getTableCount(id);
        if (count > 0) {
          const rawTables = await getTablesRange(id, 0, count);
          const mappedTables = rawTables.map(tableData => ({
            id: tableData.id,
            name: tableData.name,
            buyin: tableData.buyIn,
            game: getGameTypeName(lobbyData.gameType),
            blinds: getBlindsForBuyin(tableData.buyIn),
            max_players: tableData.flags,
            current_players: tableData.playerCount,
            state: 'seating'
          }));
          setTables(mappedTables);
        } else {
          setTables([]);
        }

        // Fetch tables the current user is sitting at
        if (address) {
          const myTables = await getPlayerTables(address);
          setUserTables(myTables);
        } else {
          setUserTables([]);
        }

      } catch (error) {
        console.error(`Failed to fetch tables for lobby ${id}:`, error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLobbyAndTables();
  }, [id, address, refreshTrigger]);

  return (
    <main className="min-h-screen bg-slate-950 p-4 md:px-24 md:py-8 flex flex-col items-center justify-start">
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
