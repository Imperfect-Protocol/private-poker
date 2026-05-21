"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTable } from '@/hooks/useTable';
import ActiveTableView from '@/components/table/ActiveTableView';
import BuyInDialog from '@/components/table_screen/dialogs/BuyInDialog';

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

  const tableRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showBuyInDialog, setShowBuyInDialog] = useState(true);
  const [buyInDialogReady, setBuyInDialogReady] = useState(false);

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

  const handleRtcMessage = useCallback((incoming) => {
    if (incoming.type === 'GAME_UPDATE') {
      tableRef.current?.setTableData((prev) => ({
        ...prev,
        current_hand: {
          ...prev.current_hand,
          ...incoming.data,
        },
      }));
    } else if (incoming.type === 'CHAT') {
      addDebugMessage({ text: incoming.text, sender: 'Peer' });
    }
  }, [addDebugMessage]);

  const handleSeatEvent = useCallback((seatNo, seatEvent) => {
    if (seatEvent.kind !== 'network') return;
    const networkEvent = seatEvent.event;
    if (networkEvent?.kind === 'message') {
      handleRtcMessage(networkEvent.message);
      return;
    }
    if (networkEvent?.kind === 'network') {
      addDebugMessage({
        text: `Seat ${seatNo} ${networkEvent.state}`,
        sender: 'RTC',
        level: 'info',
      });
    }
  }, [addDebugMessage, handleRtcMessage]);

  const table = useTable({
    tableId,
    lobbyId,
    initialTableData: bootTableData,
    initialIsSeated: bootIsSeated,
    onActivity: handleRtcActivity,
    onSeat: handleSeatEvent,
  });
  tableRef.current = table;
  const currentBuyinAddress = table.currentSeat?.buyinAddress ?? null;

  useEffect(() => {
    setShowBuyInDialog(true);
    setBuyInDialogReady(false);
  }, [lobbyId, tableId, currentBuyinAddress]);

  useEffect(() => {
    setBuyInDialogReady(false);
    if (!table.tableData || table.isSeated !== false || !showBuyInDialog) return;

    const timer = setTimeout(() => {
      setBuyInDialogReady(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [showBuyInDialog, table.isSeated, table.tableData]);

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
          onJoined={() => {
            table.setIsSeated(true);
            setShowBuyInDialog(false);
            table.refresh();
          }}
        />
      )}
    </ActiveTableView>
  );
}
