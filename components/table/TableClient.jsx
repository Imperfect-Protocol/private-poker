"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTable } from '@/hooks/useTable';
import { usePokerTable } from '@/hooks/usePokerTable';
import ActiveTableView from '@/components/table/ActiveTableView';
import BuyInDialog from '@/components/table_screen/dialogs/BuyInDialog';
import JoinTableFlowDialog from '@/components/table_screen/dialogs/JoinTableFlowDialog';
import ReJoinTableFlowDialog from '@/components/table_screen/dialogs/ReJoinTableFlowDialog';
import TopUpOperatorGasDialog from '@/components/table_screen/dialogs/TopUpOperatorGasDialog';
import { submitConsoleLine } from '@/lib/crum_pkr';

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

const rtcMessageLabels = (message) => {
  if (!message?.type) return ['Unknown RTC Message'];
  if (message.type === 'CHAT') return [message.text ?? 'Chat Message'];
  if (message.type === 'POKER_ACTION' || message.type === 'POKER_GAME_MESSAGE') {
    if (message.wire?.log_lines?.length > 0) {
      return message.wire.log_lines;
    }
    return [submitConsoleLine(message.wire?.submit) ?? 'Poker Action'];
  }
  return [message.type];
};

const POKER_PROTOCOL_UI_STATES = new Set([
  'Shuffling',
  'UnmaskHoleCards',
  'UnmaskCommunityCards',
  'UnmaskFlop',
  'UnmaskTurn',
  'UnmaskRiver',
  'UnmaskShowdown',
  'SubmitPublicKey',
  'Finished',
]);

export default function TableClient({ tableId, lobbyId, initialTableData = null, initialIsSeated = null }) {
  const [initialSnapshot] = useState(() => readCreatedTableSnapshot(tableId));

  const bootTableData = initialTableData ?? initialSnapshot?.tableData ?? null;
  const bootIsSeated = initialIsSeated ?? initialSnapshot?.isSeated ?? null;

  const tableRef = useRef(null);
  const pokerTableRef = useRef(null);
  const lastProtocolActionKeyRef = useRef(null);
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
    const sender = formatSeatAddress(playerAddress);
    const messageLabels = rtcMessageLabels(incoming);

    if (incoming?.type === 'POKER_ACTION' || incoming?.type === 'POKER_GAME_MESSAGE') {
      pokerTableRef.current?.handleNetworkMessage(incoming);
      return;
    }

    if (incoming.type === 'CHAT') {
      messageLabels.forEach((text) => addDebugMessage({ text, sender }));
      return;
    }

    messageLabels.forEach((text) => addDebugMessage({ text, sender }));
  }, [addDebugMessage]);

  const handleSeatEvent = useCallback((seatNo, seatEvent) => {
    if (seatEvent.kind !== 'network') return;
    const networkEvent = seatEvent.event;
    if (networkEvent?.kind === 'message') {
      handleRtcMessage(networkEvent.message, networkEvent.playerAddress);
      return;
    }
  }, [handleRtcMessage]);

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

  const [pokerTableState, pokerTableActions] = usePokerTable({
    table,
    networkSnapshot: table.networkSnapshot,
    publishMessage: table.publishMessage,
    prepareNetworkSession: table.prepareNetworkSession,
  });

  const displayTable = useMemo(() => ({
    ...table,
    tableData: table.tableData
      ? {
        ...table.tableData,
        current_hand: {
          ...table.tableData.current_hand,
          ...pokerTableState.viewPatch,
          current_pot: pokerTableState.currentGameState?.pot?.toString?.()
            ?? pokerTableState.viewPatch?.current_pot
            ?? table.tableData.current_hand?.current_pot,
        },
      }
      : table.tableData,
  }), [pokerTableState.currentGameState, pokerTableState.viewPatch, table]);

  const currentGameState = pokerTableState.currentGameState;
  const protocolActionState = pokerTableState.protocolActionState;
  const submitProtocolAction = pokerTableActions.submitProtocolAction;
  const debugMessages = useMemo(() => (
    [...messages, ...pokerTableState.gameMessages].slice(-160)
  ), [messages, pokerTableState.gameMessages]);
  const p2pEstablished = table.networkSnapshot?.status === 'connected';

  useEffect(() => {
    if (!protocolActionState) return;
    if (protocolActionState.seat !== table.currentSeat?.seatNo) return;
    if (!POKER_PROTOCOL_UI_STATES.has(protocolActionState.state)) return;

    const actionKey = [
      protocolActionState.state,
      protocolActionState.seat,
      currentGameState.pot,
      currentGameState.minBet,
      currentGameState.maxBet,
      currentGameState.step,
    ].join(':');
    if (lastProtocolActionKeyRef.current === actionKey) return;
    lastProtocolActionKeyRef.current = actionKey;

    submitProtocolAction();
  }, [currentGameState, protocolActionState, submitProtocolAction, table.currentSeat?.seatNo]);

  useEffect(() => {
    tableRef.current = table;
    pokerTableRef.current = pokerTableActions;
  }, [pokerTableActions, table]);

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
    if (p2pEstablished) return;

    setReJoinDismissed(false);
    setShowReJoinDialog(true);
  }, [joinRequest, p2pEstablished, showReJoinDialog, table.hasJoinedTable]);

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
    addDebugMessage({
      text: 'Direct state broadcast is disabled; gameplay sync uses PokerHand submit calls.',
      sender: 'Game',
      level: 'warn',
    });
  };

  return (
    <ActiveTableView
      table={displayTable}
      debugConsole={{
        tableId,
        messages: debugMessages,
        input,
        onInputChange: setInput,
        onSubmit: handleSend,
        onDealTest: handleDealTest,
      }}
      actionBarProps={pokerTableState.actionBarProps}
      gameState={currentGameState}
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

      {table.hasJoinedTable && showReJoinDialog && !joinRequest && !p2pEstablished && (
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
