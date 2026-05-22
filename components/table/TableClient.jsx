"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTable } from '@/hooks/useTable';
import ActiveTableView from '@/components/table/ActiveTableView';
import BuyInDialog from '@/components/table_screen/dialogs/BuyInDialog';
import JoinTableFlowDialog from '@/components/table_screen/dialogs/JoinTableFlowDialog';
import ReJoinTableFlowDialog from '@/components/table_screen/dialogs/ReJoinTableFlowDialog';
import TopUpOperatorGasDialog from '@/components/table_screen/dialogs/TopUpOperatorGasDialog';

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

const formatSeatAddress = (address) => (address ? address.slice(2, 4).toUpperCase() : 'Peer');

export default function TableClient({ tableId, lobbyId, initialTableData = null, initialIsSeated = null }) {
  const initialSnapshotRef = useRef(undefined);
  if (initialSnapshotRef.current === undefined) {
    initialSnapshotRef.current = readCreatedTableSnapshot(tableId);
  }

  const bootTableData = initialTableData ?? initialSnapshotRef.current?.tableData ?? null;
  const bootIsSeated = initialIsSeated ?? initialSnapshotRef.current?.isSeated ?? null;

  const tableRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showBuyInDialog, setShowBuyInDialog] = useState(true);
  const [buyInDialogReady, setBuyInDialogReady] = useState(false);
  const [joinRequest, setJoinRequest] = useState(null);
  const [networkEnabled, setNetworkEnabled] = useState(false);
  const [showReJoinDialog, setShowReJoinDialog] = useState(false);
  const [reJoinDismissed, setReJoinDismissed] = useState(false);
  const [topUpRequest, setTopUpRequest] = useState(null);

  const addDebugMessage = useCallback((message) => {
    setMessages((prev) => [...prev, message].slice(-160));
  }, []);

  const handleRtcActivity = useCallback((activity) => {
    if (!activity.display) return;

    addDebugMessage({
      text: activity.text,
      sender: 'RTC',
      level: activity.text?.includes('failed') || activity.text?.includes('error') ? 'error' : 'info',
    });
  }, [addDebugMessage]);

  const handleRtcMessage = useCallback((incoming, playerAddress) => {
    if (incoming.type === 'GAME_UPDATE') {
      tableRef.current?.setTableData((prev) => ({
        ...prev,
        current_hand: {
          ...prev.current_hand,
          ...incoming.data,
        },
      }));
    } else if (incoming.type === 'CHAT') {
      addDebugMessage({ text: incoming.text, sender: formatSeatAddress(playerAddress) });
    }
  }, [addDebugMessage]);

  const handleSeatEvent = useCallback((seatNo, seatEvent) => {
    if (seatEvent.kind !== 'network') return;
    const networkEvent = seatEvent.event;
    if (networkEvent?.kind === 'message') {
      handleRtcMessage(networkEvent.message, networkEvent.playerAddress);
      return;
    }
  }, [addDebugMessage, handleRtcMessage]);

  const handleOperatorTopUp = useCallback(({ operator, requiredAmount }) => {
    return new Promise((resolve) => {
      setTopUpRequest({
        operator,
        requiredAmount,
        resolve: (amount) => {
          setTopUpRequest(null);
          resolve(amount);
        },
      });
    });
  }, []);

  const table = useTable({
    tableId,
    lobbyId,
    initialTableData: bootTableData,
    initialIsSeated: bootIsSeated,
    onActivity: handleRtcActivity,
    onSeat: handleSeatEvent,
    networkEnabled,
    onOperatorTopUp: handleOperatorTopUp,
  });
  tableRef.current = table;
  const currentPlayerAddress = table.currentSeat?.playerAddress ?? null;

  useEffect(() => {
    setShowBuyInDialog(true);
    setBuyInDialogReady(false);
    setJoinRequest(null);
    setNetworkEnabled(false);
    setShowReJoinDialog(false);
    setReJoinDismissed(false);
  }, [lobbyId, tableId, currentPlayerAddress]);

  useEffect(() => {
    setBuyInDialogReady(false);
    if (!table.tableData || table.isSeated !== false || !showBuyInDialog) return;

    const timer = setTimeout(() => {
      setBuyInDialogReady(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [showBuyInDialog, table.isSeated, table.tableData]);

  useEffect(() => {
    if (!table.hasJoinedTable || joinRequest || reJoinDismissed) return;
    setShowReJoinDialog(true);
  }, [joinRequest, reJoinDismissed, table.hasJoinedTable]);

  useEffect(() => {
    if (!table.hasJoinedTable || joinRequest || showReJoinDialog) return;
    if (table.networkSnapshot?.status === 'connected') return;

    setReJoinDismissed(false);
    setShowReJoinDialog(true);
  }, [joinRequest, showReJoinDialog, table.hasJoinedTable, table.networkSnapshot?.status]);

  if (table.isLoading || !table.tableData) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-teal-600/50 font-mono text-xs uppercase tracking-widest border border-dashed border-teal-500/20 rounded-xl p-8 bg-slate-900/30">
          Syncing Table Details from Arbitrum...
        </div>
      </main>
    );
  }

  const handleSend = (e) => {
    e.preventDefault();
    if (!input) return;

    table.publishMessage({ type: 'CHAT', text: input });
    addDebugMessage({ text: input, sender: 'Me' });
    setInput('');
  };

  const handleDealTest = () => {
    const suits = ['h', 'd', 's', 'c'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

    const getRandomCard = () => ranks[Math.floor(Math.random() * ranks.length)] + suits[Math.floor(Math.random() * suits.length)];
    const newFlop = getRandomCard() + getRandomCard() + getRandomCard();
    const newHand = getRandomCard() + getRandomCard();

    table.setTableData((prev) => ({
      ...prev,
      current_hand: {
        ...prev.current_hand,
        community_cards: newFlop,
        player_cards: newHand,
      },
    }));

    table.publishMessage({
      type: 'GAME_UPDATE',
      data: { community_cards: newFlop },
    });
  };

  return (
    <ActiveTableView
      table={table}
      debugConsole={{
        tableId,
        messages,
        input,
        onInputChange: setInput,
        onSubmit: handleSend,
        onDealTest: handleDealTest,
      }}
    >
      {!table.hasJoinedTable && buyInDialogReady && (
        <BuyInDialog
          tableData={table.tableData}
          lobbyId={lobbyId}
          onClose={() => setShowBuyInDialog(false)}
          onJoinRequest={(request) => {
            setShowBuyInDialog(false);
            setJoinRequest(request);
          }}
        />
      )}

      {joinRequest && (
        <JoinTableFlowDialog
          request={joinRequest}
          onOperatorTopUp={handleOperatorTopUp}
          onComplete={() => {
            table.setIsSeated(true);
            setJoinRequest(null);
            setReJoinDismissed(false);
            setShowReJoinDialog(true);
            table.refresh();
          }}
        />
      )}

      {table.hasJoinedTable && showReJoinDialog && !joinRequest && (
        <ReJoinTableFlowDialog
          table={table}
          networkSnapshot={table.networkSnapshot}
          onEnableNetwork={() => setNetworkEnabled(true)}
          onReady={() => {
            setShowReJoinDialog(false);
            setReJoinDismissed(true);
          }}
        />
      )}

      {topUpRequest && (
        <TopUpOperatorGasDialog
          operator={topUpRequest.operator}
          requiredAmount={topUpRequest.requiredAmount}
          onConfirm={topUpRequest.resolve}
        />
      )}
    </ActiveTableView>
  );
}
