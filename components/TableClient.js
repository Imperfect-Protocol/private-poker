// components/TableClient.js

import React, { useState, useEffect } from 'react';
import { useConnection } from 'wagmi';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import ActiveTableView from '@/components/ActiveTableView';
import JoinTableGateway from '@/components/JoinTableGateway';

export default function TableClient({ tableId, lobbyId }) {
  const [liveTableData, setLiveTableData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeated, setIsSeated] = useState(false);

  // 1. Add a trigger state to force a re-fetch
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { address } = useConnection();
  const { getTableDetail, getPlayerTables } = usePrivatePokerLobby();

  useEffect(() => {
    const loadTable = async () => {
      try {
        setIsLoading(true);
        const detail = await getTableDetail(lobbyId, tableId);

        setLiveTableData({
          id: detail.info.id,
          name: detail.info.name,
          buyin: detail.info.buyIn,
          players: detail.players,
          current_hand: { min_bet: 10, max_bet: 100, bet_step: 10, community_cards: "" }
        });

        if (address) {
          const userTables = await getPlayerTables(address);
          setIsSeated(userTables.includes(tableId.toString()));
        } else {
          setIsSeated(false);
        }
      } catch (error) {
        console.error("Failed to load table:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTable();
    // 2. Add refreshTrigger to the dependency array
  }, [lobbyId, tableId, address, refreshTrigger]);

  if (isLoading || !liveTableData) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-teal-600/50 font-mono text-xs uppercase tracking-widest border border-dashed border-teal-500/20 rounded-xl p-8 bg-slate-900/30">
          Syncing Table Details from Arbitrum...
        </div>
      </main>
    );
  }

  // 3. Update onJoined to trigger the refetch instead of just flipping the boolean
  return isSeated ? (
    <ActiveTableView tableData={liveTableData} lobbyId={lobbyId} />
  ) : (
    <JoinTableGateway
      tableData={liveTableData}
      lobbyId={lobbyId}
      onJoined={() => setRefreshTrigger(prev => prev + 1)}
    />
  );
}