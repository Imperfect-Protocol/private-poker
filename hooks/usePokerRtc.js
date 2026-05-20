import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection } from 'wagmi';
import { useListenForSignals, usePrivatePokerSignal } from '@/hooks/usePrivatePokerSignal';
import { PokerRtcSession } from '@/lib/PokerRtcSession';
import {
  DEFAULT_RTC_TOPOLOGY,
  getRtcTopologyLabel,
  getRtcTopologyPlan,
} from '@/lib/rtcTopology';

const sessionsByTable = new Map();

const normalizeAddress = (value) => value?.toLowerCase() ?? '';

function makePlayersKey(players = []) {
  return players
    .map((player) => [
      normalizeAddress(player?.address),
      player?.annoncePublicKey ?? '',
      player?.chips ?? '',
    ].join('/'))
    .join('|');
}

function makeSessionConfigKey({
  address,
  tableId,
  lobbyId,
  publicKey,
  privateKey,
  playersKey,
  isTableFull,
  tableCapacity,
  topology,
}) {
  return [
    normalizeAddress(address),
    tableId ?? '',
    lobbyId ?? '',
    publicKey ?? '',
    privateKey ? 'private-key-ready' : '',
    isTableFull ? 'full' : 'waiting',
    tableCapacity ?? 0,
    topology ?? DEFAULT_RTC_TOPOLOGY,
    playersKey,
  ].join('::');
}

function getSessionEntry(key, createSession) {
  const existing = sessionsByTable.get(key);
  if (existing) return existing;

  const entry = {
    callbacksInstalled: false,
    destroyTimer: null,
    loggedTopologyKeys: new Set(),
    loggedUpdateKeys: new Set(),
    session: createSession(),
    users: 0,
  };
  sessionsByTable.set(key, entry);
  return entry;
}

export function usePokerRTC(
  tableId,
  lobbyId,
  blsKeys,
  players = [],
  onMessage,
  onActivity,
  isTableFull = false,
  tableCapacity = 0,
  topology = DEFAULT_RTC_TOPOLOGY,
) {
  const { address } = useConnection();
  const { sendSignal } = usePrivatePokerSignal();
  const publicKey = blsKeys?.publicKey;
  const privateKey = blsKeys?.privateKey;
  const sessionKey = `${lobbyId ?? 'unknown'}:${tableId ?? 'unknown'}`;
  const playersKey = makePlayersKey(players);
  const sendSignalRef = useRef(sendSignal);
  const onActivityRef = useRef(onActivity);
  const onMessageRef = useRef(onMessage);
  const onStateChangeRef = useRef(() => {});

  sendSignalRef.current = sendSignal;
  onActivityRef.current = onActivity;
  onMessageRef.current = onMessage;

  const [sessionEntry] = useState(() => getSessionEntry(
    sessionKey,
    () => new PokerRtcSession({
      sendSignal: (...args) => sendSignalRef.current(...args),
      onActivity: (...args) => onActivityRef.current?.(...args),
      onMessage: (...args) => onMessageRef.current?.(...args),
      onStateChange: (...args) => onStateChangeRef.current?.(...args),
    }),
  ));
  const session = sessionEntry.session;
  const [snapshot, setSnapshot] = useState(() => session.getSnapshot());
  onStateChangeRef.current = setSnapshot;

  const topologyPlan = useMemo(
    () => {
      const plan = getRtcTopologyPlan(players, address, topology);
      const topologyKey = `${address ?? ''}::${topology ?? DEFAULT_RTC_TOPOLOGY}::${playersKey}`;
      if (!sessionEntry.loggedTopologyKeys.has(topologyKey)) {
        sessionEntry.loggedTopologyKeys.add(topologyKey);
        console.log("topologyPlan", plan);
      }
      return plan;
    },
    [address, playersKey, sessionEntry, topology],
  );

  useEffect(() => {
    if (sessionEntry.callbacksInstalled) return;

    sessionEntry.callbacksInstalled = true;
    console.log("session.setCallbacks()");
    session.setCallbacks({
      sendSignal: (...args) => sendSignalRef.current(...args),
      onActivity: (...args) => onActivityRef.current?.(...args),
      onMessage: (...args) => onMessageRef.current?.(...args),
      onStateChange: (...args) => onStateChangeRef.current?.(...args),
    });
  }, [session, sessionEntry]);

  useEffect(() => {
    const sessionConfigKey = makeSessionConfigKey({
      address,
      tableId,
      lobbyId,
      publicKey,
      privateKey,
      playersKey,
      isTableFull,
      tableCapacity,
      topology,
    });

    if (!sessionEntry.loggedUpdateKeys.has(sessionConfigKey)) {
      sessionEntry.loggedUpdateKeys.add(sessionConfigKey);
      console.log("session.update()");
    }

    session.update({
      address,
      tableId,
      lobbyId,
      publicKey,
      privateKey,
      players,
      isTableFull,
      tableCapacity,
      topology,
    });
  }, [
    address,
    isTableFull,
    lobbyId,
    playersKey,
    privateKey,
    publicKey,
    session,
    sessionEntry,
    tableCapacity,
    tableId,
    topology,
  ]);

  useListenForSignals(address, async (signalData) => {
    console.log("handleSignal", signalData);
    await session.handleSignal(signalData);
  });

  useEffect(() => {
    sessionEntry.users += 1;
    if (sessionEntry.destroyTimer) {
      clearTimeout(sessionEntry.destroyTimer);
      sessionEntry.destroyTimer = null;
    }

    return () => {
      sessionEntry.users -= 1;
      if (sessionEntry.users > 0) return;

      sessionEntry.destroyTimer = setTimeout(() => {
        if (sessionEntry.users > 0) return;

        console.log("session.destroy()");
        session.destroy();
        sessionsByTable.delete(sessionKey);
      }, 1000);
    };
  }, [session, sessionEntry, sessionKey]);

  const sendMessage = useCallback((message) => {
    console.log("session.sendMessage()", message);
    session.sendMessage(message);
  }, [session]);

  return {
    connectedPeerCount: snapshot.connectedPeerCount,
    connectedPeerAddresses: snapshot.connectedPeerAddresses,
    expectedPeerCount: snapshot.expectedPeerCount,
    sendMessage,
    status: snapshot.status,
    topology: topologyPlan.topology,
    topologyLabel: getRtcTopologyLabel(topologyPlan.topology),
  };
}
