"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTable } from '@/hooks/useTable';
import { usePokerTable } from '@/hooks/usePokerTable';
import ActiveTableView from '@/components/table/ActiveTableView';
import BuyInDialog from '@/components/table_screen/dialogs/BuyInDialog';
import JoinTableFlowDialog from '@/components/table_screen/dialogs/JoinTableFlowDialog';
import ReJoinTableFlowDialog from '@/components/table_screen/dialogs/ReJoinTableFlowDialog';
import MediaDataChannelDialog from '@/components/table_screen/dialogs/MediaDataChannelDialog';
import TerminalResultDialog from '@/components/table_screen/dialogs/TerminalResultDialog';
import TopUpOperatorGasDialog from '@/components/table_screen/dialogs/TopUpOperatorGasDialog';
import { useAccounts } from '@/hooks/useAccounts';
import { useWebcam } from '@/hooks/useWebcam';
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
const ensureHexPrefix = (value) => {
  const normalized = String(value ?? '');
  return normalized.startsWith('0x') ? normalized : `0x${normalized}`;
};

const rtcMessageLabels = (message) => {
  if (!message?.type) return ['Unknown RTC Message'];
  if (message.type === 'ChatMessage') return [message.text ?? 'Chat Message'];
  if (message.type === 'History') {
    if (message.wire?.log_lines?.length > 0) {
      return message.wire.log_lines;
    }
    const lastHistoryEntry = Array.isArray(message.hand_history)
      ? message.hand_history.at(-1)
      : null;
    if (lastHistoryEntry?.wire?.log_lines?.length > 0) {
      return lastHistoryEntry.wire.log_lines;
    }
    return [submitConsoleLine(lastHistoryEntry?.wire?.submit ?? message.wire?.submit) ?? 'History'];
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
  'PreFlop',
  'Flop',
  'Turn',
  'River',
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
  const [forceHideReJoinDialog, setForceHideReJoinDialog] = useState(false);
  const [reJoinDismissed, setReJoinDismissed] = useState(false);
  const [showDebugConsole, setShowDebugConsole] = useState(false);
  const [topUpRequest, setTopUpRequest] = useState(null);
  const [showMediaDataChannelDialog, setShowMediaDataChannelDialog] = useState(false);
  const webcam = useWebcam();

  const addDebugMessage = useCallback((message) => {
    setMessages((prev) => [...prev, message].slice(-160));
  }, []);

  const handleRtcActivity = useCallback((activity) => {
    if (activity.details?.kind === 'media-data-channel-required') {
      setShowMediaDataChannelDialog(true);
    }

    if (!activity.display) return;

    addDebugMessage({
      text: activity.text,
      sender: 'RTC',
      level: /failed|error|invalid signature/i.test(activity.text ?? '') ? 'error' : 'info',
    });
  }, [addDebugMessage]);

  const handleRtcMessage = useCallback((incoming, playerAddress) => {
    const sender = formatSeatAddress(playerAddress);
    const messageLabels = rtcMessageLabels(incoming);

    if (
      incoming?.type === 'History'
      || incoming?.type === 'ChatMessage'
    ) {
      pokerTableRef.current?.handleNetworkMessage(incoming, playerAddress);
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
    localMediaStream: webcam.stream,
  });

  const [pokerTableState, pokerTableActions] = usePokerTable({
    table,
    networkSnapshot: table.networkSnapshot,
    publishMessage: table.publishMessage,
    prepareNetworkSession: table.prepareNetworkSession,
    prepareHandSession: table.prepareHandSession,
  });
  const playerAddresses = useMemo(() => (
    table.tableData?.players?.map((player) => player.playerAddress).filter(Boolean) ?? []
  ), [table.tableData?.players]);
  const { getPlayerDisplayname } = useAccounts({ playerAddresses });

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
  const consoleIdentity = useMemo(() => {
    const playerAddress = table.currentSeat?.playerAddress;
    const displayName = getPlayerDisplayname(playerAddress) || 'Console';
    const currentSeat = table.seats?.find((seat) => (
      seat.seatNo === table.currentSeat?.seatNo
      || seat.playerAddress?.toLowerCase() === playerAddress?.toLowerCase()
    ));
    const announceKey = currentSeat?.announcePublicKey;
    return {
      label: displayName,
      detail: playerAddress && announceKey
        ? `${ensureHexPrefix(playerAddress)}:${ensureHexPrefix(announceKey)}`
        : '',
    };
  }, [getPlayerDisplayname, table.currentSeat?.playerAddress, table.currentSeat?.seatNo, table.seats]);
  const terminalResult = useMemo(() => {
    const result = pokerTableState.terminalResult;
    if (result?.type !== 'cheated') return result;

    const cheaterAddress = table.tableData?.players?.[result.cheat?.player]?.playerAddress;
    const cheaterName = getPlayerDisplayname(cheaterAddress)
      || (cheaterAddress ? cheaterAddress.slice(2, 4).toUpperCase() : 'Player');
    const kind = result.cheat?.kind ?? 'CHEATING';
    return {
      ...result,
      title: result.cheat?.isViewerCheater ? 'CHEATER' : 'GAME CHEATED',
      subtitle: result.cheat?.isViewerCheater
        ? `CHEATED ${kind}`
        : `${cheaterName.toUpperCase()} CHEATED ${kind}`,
    };
  }, [getPlayerDisplayname, pokerTableState.terminalResult, table.tableData?.players]);
  const webcamView = useMemo(() => ({
    ...webcam,
    remoteStreams: table.networkSnapshot?.remoteMediaStreams ?? {},
  }), [table.networkSnapshot?.remoteMediaStreams, webcam]);

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

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!event.ctrlKey || event.repeat) return;
      if (event.key !== '`' && event.key !== '~' && event.code !== 'Backquote') return;

      event.preventDefault();
      setShowDebugConsole((current) => !current);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const currentPlayerAddress = table.currentSeat?.playerAddress ?? null;

  useEffect(() => {
    setShowBuyInDialog(true);
    setBuyInDialogReady(false);
    setJoinRequest(null);
    setNetworkEnabled(false);
    setShowReJoinDialog(false);
    setForceHideReJoinDialog(false);
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
    if (!table.hasJoinedTable || joinRequest || reJoinDismissed || forceHideReJoinDialog) return;
    setShowReJoinDialog(true);
  }, [forceHideReJoinDialog, joinRequest, reJoinDismissed, table.hasJoinedTable]);

  useEffect(() => {
    if (!table.hasJoinedTable || joinRequest || showReJoinDialog || forceHideReJoinDialog) return;
    if (p2pEstablished) return;

    setReJoinDismissed(false);
    setShowReJoinDialog(true);
  }, [forceHideReJoinDialog, joinRequest, p2pEstablished, showReJoinDialog, table.hasJoinedTable]);

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
    const command = input.trim();
    if (!command) return;

    switch (command.toLowerCase()) {
      case '/badsig':
        table.armBadSignatureOnce?.();
        setInput('');
        return;
      case '/dropnext':
        table.armDropNextMessage?.();
        setInput('');
        return;
      case '/dupenext':
        table.armDuplicateNextMessage?.();
        setInput('');
        return;
      case '/showtable':
        setForceHideReJoinDialog(true);
        setShowReJoinDialog(false);
        addDebugMessage({ sender: 'Game', text: 'P2P connection dialog hidden' });
        setInput('');
        return;
      case '/connect':
        setForceHideReJoinDialog(false);
        setReJoinDismissed(false);
        setShowReJoinDialog(true);
        addDebugMessage({ sender: 'Game', text: 'P2P connection dialog shown' });
        setInput('');
        return;
      case '/badshuffle':
        pokerTableActions.armPokerDebugCheat?.('badshuffle');
        setInput('');
        return;
      case '/badunmask':
        pokerTableActions.armPokerDebugCheat?.('badunmask');
        setInput('');
        return;
      case '/badpk':
        pokerTableActions.armPokerDebugCheat?.('badpk');
        setInput('');
        return;
      default:
        break;
    }

    if (pokerTableActions.submitChat(input)) {
      setInput('');
    }
  };

  const handleCloseTab = () => {
    window.close();
  };

  return (
    <ActiveTableView
      table={displayTable}
      debugConsole={showDebugConsole
        ? {
          consoleIdentity,
          messages: debugMessages,
          input,
          onInputChange: setInput,
          onSubmit: handleSend,
        }
        : null}
      actionBarProps={pokerTableState.actionBarProps}
      gameState={currentGameState}
      webcam={webcamView}
      onNextHandCountdownComplete={
        currentGameState?.cheat
          ? pokerTableActions.completeCheatCountdown
          : pokerTableActions.startNextHand
      }
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

      {table.hasJoinedTable && showReJoinDialog && !forceHideReJoinDialog && !joinRequest && !p2pEstablished && (
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

      {showMediaDataChannelDialog && (
        <MediaDataChannelDialog
          onClose={() => setShowMediaDataChannelDialog(false)}
        />
      )}

      {terminalResult && (
        <TerminalResultDialog
          result={terminalResult}
          onCloseTab={handleCloseTab}
        />
      )}
    </ActiveTableView>
  );
}
