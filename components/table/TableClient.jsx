"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useConnection } from 'wagmi';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import ActiveTableView from '@/components/table/ActiveTableView';
import BuyInDialog from '@/components/table_screen/dialogs/BuyInDialog';
import { CHAIN_POLLING_INTERVAL } from '@/lib/chain';

const readCreatedTableSnapshot = (tableId) => {
  if (typeof window === 'undefined') return null;

  try {
    const key = `private-poker:new-table:${tableId}`;
    const rawSnapshot = window.sessionStorage.getItem(key);
    if (!rawSnapshot) return null;

    window.sessionStorage.removeItem(key);
    return JSON.parse(rawSnapshot);
  } catch {
    return null;
  }
};

export default function TableClient({ tableId, lobbyId, initialTableData = null, initialIsSeated = null }) {
  const initialSnapshotRef = useRef(undefined);
  if (initialSnapshotRef.current === undefined) {
    initialSnapshotRef.current = readCreatedTableSnapshot(tableId);
  }

  const bootTableData = initialTableData ?? initialSnapshotRef.current?.tableData ?? null;
  const bootIsSeated = initialIsSeated ?? initialSnapshotRef.current?.isSeated ?? null;

  const [liveTableData, setLiveTableData] = useState(bootTableData);
  const [isLoading, setIsLoading] = useState(!bootTableData);
  const [isSeated, setIsSeated] = useState(bootIsSeated);
  const [showBuyInDialog, setShowBuyInDialog] = useState(true);
  const [buyInDialogReady, setBuyInDialogReady] = useState(false);

  // 1. Add a trigger state to force a re-fetch
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { address } = useConnection();
  const { getTableDetail, getPlayerTables } = usePrivatePokerLobby();
  const hasTableData = Boolean(liveTableData);

  useEffect(() => {
    setShowBuyInDialog(true);
    setBuyInDialogReady(false);
  }, [lobbyId, tableId, address]);

  useEffect(() => {
    setBuyInDialogReady(false);
    if (!liveTableData || !address || isSeated !== false || !showBuyInDialog) return;

    const timer = setTimeout(() => {
      setBuyInDialogReady(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [address, isSeated, liveTableData?.id, showBuyInDialog]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer = null;
    let inFlight = false;

    const loadTable = async ({ silent = false } = {}) => {
      if (inFlight) return;
      inFlight = true;

      try {
        if (!silent && !hasTableData) setIsLoading(true);
        const detail = await getTableDetail(lobbyId, tableId);

        if (cancelled) return;

        setLiveTableData({
          id: detail.info.id,
          name: detail.info.name,
          buyin: detail.info.buyIn,
          maxSeats: detail.info.flags,
          players: detail.players,
          current_hand: { min_bet: 10, max_bet: 100, bet_step: 10, community_cards: "" }
        });

        if (address) {
          const userTables = await getPlayerTables(address);
          if (cancelled) return;
          setIsSeated(userTables.includes(tableId.toString()));
        } else {
          setIsSeated(null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load table:", error);
        }
      } finally {
        if (!cancelled && !silent) setIsLoading(false);
        inFlight = false;
      }
    };

    const poll = async () => {
      await loadTable({ silent: true });
      if (!cancelled) {
        pollTimer = setTimeout(poll, CHAIN_POLLING_INTERVAL);
      }
    };

    loadTable();
    pollTimer = setTimeout(poll, CHAIN_POLLING_INTERVAL);

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
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

  const hasJoinedTable = isSeated === true;

  return (
    <ActiveTableView tableData={liveTableData} lobbyId={lobbyId}>
      {!hasJoinedTable && buyInDialogReady && (
        <BuyInDialog
          tableData={liveTableData}
          lobbyId={lobbyId}
          onClose={() => setShowBuyInDialog(false)}
          onJoined={() => {
            setIsSeated(true);
            setShowBuyInDialog(false);
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      )}
    </ActiveTableView>
  );
}
