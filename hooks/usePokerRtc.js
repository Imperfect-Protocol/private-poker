import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection } from 'wagmi';
import { hexToBytes, toHex } from 'viem';
import { useListenForSignals, usePrivatePokerSignal } from '@/hooks/usePrivatePokerSignal';
import { decryptFromPeer, encryptForPeer } from '@/lib/crypto';
import {
  DEFAULT_RTC_TOPOLOGY,
  getRtcTopologyLabel,
  getRtcTopologyPlan,
} from '@/lib/rtcTopology';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const MAX_PROCESSED_SIGNALS = 300;
const normalizeAddress = (value) => value?.toLowerCase() ?? '';
const formatPeer = (value) => value ? `${value.slice(0, 6)}...${value.slice(-4)}` : 'unknown';
const formatKey = (value) => {
  if (!value) return 'missing';
  const normalized = value.startsWith('0x') ? value : `0x${value}`;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};
const formatSeat = (value) => value ? value.slice(2, 4).toUpperCase() : '??';

const waitForIceGatheringComplete = (pc) => {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();

  return new Promise((resolve) => {
    let timeout;

    const finish = () => {
      clearTimeout(timeout);
      pc.removeEventListener('icegatheringstatechange', handleStateChange);
      resolve();
    };

    const handleStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };

    timeout = setTimeout(finish, 8000);
    pc.addEventListener('icegatheringstatechange', handleStateChange);
  });
};

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
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const [connectedPeerCount, setConnectedPeerCount] = useState(0);
  const [reconnectTick, setReconnectTick] = useState(0);

  const channelsRef = useRef(new Map());
  const connectedPeersRef = useRef(new Set());
  const initiatedPeersRef = useRef(new Set());
  const peerConnectionsRef = useRef(new Map());
  const processedSignalsRef = useRef(new Set());
  const discoveredKeysRef = useRef(new Map());
  const resettingPeersRef = useRef(new Set());
  const onMessageRef = useRef(onMessage);
  const onActivityRef = useRef(onActivity);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onActivityRef.current = onActivity;
  }, [onActivity]);

  const logActivity = useCallback((text, details = undefined) => {
    const line = `[RTC] ${text}`;
    if (details === undefined) {
      console.debug(line);
    } else {
      console.debug(line, details);
    }
  }, []);

  const emitActivity = useCallback((text, details = undefined) => {
    const line = `[RTC] ${text}`;
    if (details === undefined) {
      console.log(line);
    } else {
      console.log(line, details);
    }
    onActivityRef.current?.({ text, details, at: new Date(), display: true });
  }, []);

  const topologyPlan = useMemo(
    () => getRtcTopologyPlan(players, address, topology),
    [address, players, topology],
  );

  const expectedPeerAddresses = useMemo(() => {
    return topologyPlan.expectedPeers.map((player) => player.address);
  }, [topologyPlan]);

  const setPeerConnected = useCallback((peerAddress) => {
    if (!connectedPeersRef.current.has(normalizeAddress(peerAddress))) {
      emitActivity(`${formatSeat(address)} = ${formatSeat(peerAddress)} Connected`);
    }
    logActivity(`peer connected ${formatPeer(peerAddress)}`);
    setHasConnectionError(false);
    connectedPeersRef.current.add(normalizeAddress(peerAddress));
    setConnectedPeerCount(connectedPeersRef.current.size);
  }, [address, emitActivity, logActivity]);

  const resetPeer = useCallback((peerAddress, reason) => {
    const key = normalizeAddress(peerAddress);
    if (!key || resettingPeersRef.current.has(key)) return;

    resettingPeersRef.current.add(key);
    logActivity(`reset peer ${formatPeer(peerAddress)}: ${reason}`);

    const wasConnected = connectedPeersRef.current.has(key);
    const channel = channelsRef.current.get(key);
    if (channel) {
      channel.onopen = null;
      channel.onclose = null;
      channel.onmessage = null;
      if (channel.readyState !== 'closed') {
        channel.close();
      }
    }

    const peerConnection = peerConnectionsRef.current.get(key);
    if (peerConnection) {
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.onicegatheringstatechange = null;
      peerConnection.onsignalingstatechange = null;
      peerConnection.ondatachannel = null;
      peerConnection.close();
    }

    channelsRef.current.delete(key);
    connectedPeersRef.current.delete(key);
    initiatedPeersRef.current.delete(key);
    peerConnectionsRef.current.delete(key);
    setConnectedPeerCount(connectedPeersRef.current.size);
    setHasConnectionError(false);
    setReconnectTick((value) => value + 1);

    if (wasConnected) {
      emitActivity(`${formatSeat(address)} ! ${formatSeat(peerAddress)} Disconnected`);
    }

    setTimeout(() => {
      resettingPeersRef.current.delete(key);
    }, 0);
  }, [address, emitActivity, logActivity]);

  const status = useMemo(() => {
    if (hasConnectionError) return 'error';

    if (!address || !privateKey || !publicKey) {
      return 'waiting';
    }

    if (!isTableFull) {
      return 'waiting';
    }

    const expectedCount = expectedPeerAddresses.length;
    if (connectedPeerCount > 0 && (expectedCount === 0 || connectedPeerCount >= expectedCount)) {
      return 'connected';
    }

    if (topologyPlan.seatedPlayers.length < 2) {
      return 'waiting';
    }

    return 'connecting';
  }, [
    address,
    connectedPeerCount,
    expectedPeerAddresses.length,
    hasConnectionError,
    isTableFull,
    privateKey,
    publicKey,
    topologyPlan.seatedPlayers.length,
  ]);

  const setupDataChannel = useCallback((peerAddress, dataChannel) => {
    logActivity(`data channel attached ${formatPeer(peerAddress)} (${dataChannel.label})`);

    dataChannel.onopen = () => {
      logActivity(`data channel open ${formatPeer(peerAddress)} (${dataChannel.label})`);
      channelsRef.current.set(normalizeAddress(peerAddress), dataChannel);
      setPeerConnected(peerAddress);
    };

    dataChannel.onclose = () => {
      logActivity(`data channel closed ${formatPeer(peerAddress)} (${dataChannel.label})`);
      resetPeer(peerAddress, 'data channel closed');
    };

    dataChannel.onmessage = (event) => {
      logActivity(`data message received ${formatPeer(peerAddress)} (${String(event.data).length} bytes)`);
      try {
        onMessageRef.current?.(JSON.parse(event.data));
      } catch (error) {
        logActivity(`data message parse failed ${formatPeer(peerAddress)}: ${error.message}`);
        console.error('Failed to parse RTC message:', error);
      }
    };
  }, [logActivity, resetPeer, setPeerConnected]);

  const getPeerConnection = useCallback((peerAddress, createChannel = false) => {
    const key = normalizeAddress(peerAddress);
    const existing = peerConnectionsRef.current.get(key);
    if (existing) {
      if (['closed', 'failed', 'disconnected'].includes(existing.connectionState)) {
        resetPeer(peerAddress, `stale peer connection ${existing.connectionState}`);
      } else {
        logActivity(`reuse peer connection ${formatPeer(peerAddress)} state=${existing.connectionState}`);
        return existing;
      }
    }

    logActivity(`create peer connection ${formatPeer(peerAddress)} create_channel=${createChannel}`);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onconnectionstatechange = () => {
      logActivity(`peer connection ${formatPeer(peerAddress)} state=${pc.connectionState}`);
      if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) {
        resetPeer(peerAddress, `peer connection ${pc.connectionState}`);
      }
    };
    pc.oniceconnectionstatechange = () => {
      logActivity(`ice connection ${formatPeer(peerAddress)} state=${pc.iceConnectionState}`);
      if (['closed', 'failed', 'disconnected'].includes(pc.iceConnectionState)) {
        resetPeer(peerAddress, `ice connection ${pc.iceConnectionState}`);
      }
    };
    pc.onicegatheringstatechange = () => {
      logActivity(`ice gathering ${formatPeer(peerAddress)} state=${pc.iceGatheringState}`);
    };
    pc.onsignalingstatechange = () => {
      logActivity(`signaling ${formatPeer(peerAddress)} state=${pc.signalingState}`);
    };
    pc.ondatachannel = (event) => {
      logActivity(`incoming data channel ${formatPeer(peerAddress)} (${event.channel.label})`);
      setupDataChannel(peerAddress, event.channel);
    };

    if (createChannel) {
      logActivity(`create outbound data channel ${formatPeer(peerAddress)}`);
      setupDataChannel(peerAddress, pc.createDataChannel('poker-token-ring'));
    }

    peerConnectionsRef.current.set(key, pc);
    return pc;
  }, [logActivity, resetPeer, setupDataChannel]);

  const encryptSignalForPeer = useCallback(async (recipientPubKey, signal) => {
    if (!publicKey) return;
    if (!recipientPubKey) return;

    logActivity(`encrypt ${signal.type} for ${formatKey(recipientPubKey)}`);
    const payload = JSON.stringify({
      ...signal,
      app: 'private-poker',
      version: 1,
      senderPubKey: publicKey,
    });
    const encryptedPayload = await encryptForPeer(recipientPubKey, payload);
    return toHex(new TextEncoder().encode(JSON.stringify(encryptedPayload)));
  }, [logActivity, publicKey]);

  const sendEncryptedSignal = useCallback(async (recipientAddress, recipientPubKey, signal) => {
    if (!recipientAddress) return;

    const encryptedData = await encryptSignalForPeer(recipientPubKey, signal);
    if (!encryptedData) return;

    logActivity(`${signal.type === 'answer' ? 'answer to' : `sent ${signal.type} to`} ${formatPeer(recipientAddress)}`);
    await sendSignal(lobbyId, tableId, recipientAddress, encryptedData);
    if (signal.type === 'answer') {
      emitActivity(`${formatSeat(address)} > ${formatSeat(recipientAddress)} Answer`);
    }
  }, [address, emitActivity, encryptSignalForPeer, lobbyId, logActivity, sendSignal, tableId]);

  const sendEncryptedSignals = useCallback(async (signals) => {
    const encryptedSignals = await Promise.all(
      signals.map(async ({ recipientAddress, recipientPubKey, signal }) => ({
        recipientAddress,
        signalType: signal.type,
        encryptedData: await encryptSignalForPeer(recipientPubKey, signal),
      })),
    );
    const readySignals = encryptedSignals.filter(
      ({ recipientAddress, encryptedData }) => recipientAddress && encryptedData,
    );

    if (readySignals.length === 0) {
      logActivity('no outbound signals ready');
      return;
    }

    readySignals.forEach(({ recipientAddress, signalType }) => {
      logActivity(`${signalType === 'answer' ? 'answer to' : `sent ${signalType} to`} ${formatPeer(recipientAddress)}`);
    });

    await sendSignal(
      lobbyId,
      tableId,
      readySignals.map(({ recipientAddress }) => recipientAddress),
      readySignals.map(({ encryptedData }) => encryptedData),
    );
  }, [encryptSignalForPeer, lobbyId, logActivity, sendSignal, tableId]);

  const handleIncomingSignal = useCallback(async (senderAddress, signal) => {
    const peerPubKey = signal.senderPubKey;
    logActivity(`handle signal ${signal.type ?? 'unknown'} from ${formatPeer(senderAddress)}`);
    const isExpectedInbound = topologyPlan.inboundSources.some(
      (player) => normalizeAddress(player.address) === normalizeAddress(senderAddress),
    );

    if (signal.type === 'offer' && !isExpectedInbound) {
      logActivity(`offer ignored from ${formatPeer(senderAddress)}: expected I-1 peer only`);
      return;
    }

    const pc = getPeerConnection(senderAddress, false);

    if (signal.type === 'offer') {
      if (!peerPubKey) throw new Error('Incoming offer did not include senderPubKey.');

      emitActivity(`${formatSeat(address)} < ${formatSeat(senderAddress)} Offer`);

      if (pc.signalingState !== 'stable') {
        logActivity(`rollback local offer before answering ${formatPeer(senderAddress)}`);
        await pc.setLocalDescription({ type: 'rollback' });
      }

      logActivity(`set remote offer ${formatPeer(senderAddress)}`);
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });

      logActivity(`create answer ${formatPeer(senderAddress)}`);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      logActivity(`wait for ICE gathering before answer ${formatPeer(senderAddress)}`);
      await waitForIceGatheringComplete(pc);

      await sendEncryptedSignal(senderAddress, peerPubKey, {
        type: 'answer',
        sdp: pc.localDescription.sdp,
      });
      return;
    }

    if (signal.type === 'answer') {
      if (pc.signalingState === 'stable') {
        logActivity(`answer ignored from ${formatPeer(senderAddress)}: peer connection already stable`);
        return;
      }
      logActivity(`set remote answer ${formatPeer(senderAddress)}`);
      await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      emitActivity(`${formatSeat(address)} < ${formatSeat(senderAddress)} Answer`);
      return;
    }

    if (signal.type === 'ice-candidate' && signal.candidate) {
      logActivity(`add ICE candidate ${formatPeer(senderAddress)}`);
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  }, [address, emitActivity, getPeerConnection, logActivity, sendEncryptedSignal, topologyPlan.inboundSources]);

  useListenForSignals(address, async (signalData) => {
    if (!privateKey || !tableId || !lobbyId) {
      logActivity('signal ignored: missing private key, table id, or lobby id');
      return;
    }
    if (signalData.tableId !== tableId.toString() || signalData.lobbyId !== lobbyId.toString()) {
      logActivity(`signal ignored: wrong table lobby=${signalData.lobbyId} table=${signalData.tableId}`);
      return;
    }
    if (signalData.logId && processedSignalsRef.current.has(signalData.logId)) {
      logActivity(`signal ignored: already processed ${signalData.logId}`);
      return;
    }
    if (signalData.logId) {
      processedSignalsRef.current.add(signalData.logId);
      if (processedSignalsRef.current.size > MAX_PROCESSED_SIGNALS) {
        const [oldestSignalId] = processedSignalsRef.current;
        processedSignalsRef.current.delete(oldestSignalId);
      }
    }

    try {
      logActivity(`handshake signal received from ${formatPeer(signalData.sender)}`);
      const payloadString = new TextDecoder().decode(hexToBytes(signalData.encryptedData));
      const encryptedPayload = JSON.parse(payloadString);
      logActivity(`decrypt handshake signal ${formatPeer(signalData.sender)}`);
      const decryptedString = await decryptFromPeer(privateKey, encryptedPayload);
      const signal = JSON.parse(decryptedString);

      await handleIncomingSignal(signalData.sender, signal);
    } catch (error) {
      logActivity(`signal decrypt/handle failed: ${error.message}`);
      console.error('Failed to decrypt RTC signal:', error);
    }
  });

  useEffect(() => {
    if (!publicKey) return;
    logActivity(`announce key ${formatKey(publicKey)}`);
  }, [logActivity, publicKey]);

  useEffect(() => {
    topologyPlan.seatedPlayers.forEach((player) => {
      if (!player?.address || !player?.annoncePublicKey) return;

      const key = normalizeAddress(player.address);
      const previousAnnounceKey = discoveredKeysRef.current.get(key);
      if (previousAnnounceKey === player.annoncePublicKey) return;

      discoveredKeysRef.current.set(key, player.annoncePublicKey);
      emitActivity(`${formatSeat(player.address)} ${formatKey(player.annoncePublicKey)}`);
    });
  }, [emitActivity, topologyPlan.seatedPlayers]);

  useEffect(() => {
    logActivity(`status=${status} connected=${connectedPeerCount}/${expectedPeerAddresses.length} topology=${getRtcTopologyLabel(topologyPlan.topology)}`);
  }, [connectedPeerCount, expectedPeerAddresses.length, logActivity, status, topologyPlan.topology]);

  useEffect(() => {
    if (!address) {
      logActivity('waiting for wallet address');
      return;
    }
    if (!privateKey || !publicKey) {
      logActivity(`waiting for BLS keys wallet=${formatPeer(address)}`);
      return;
    }
    if (topologyPlan.seatedPlayers.length < 2) {
      logActivity('waiting for peers at table');
      return;
    }
    if (!isTableFull) {
      logActivity(`waiting for full table ${topologyPlan.seatedPlayers.length}/${tableCapacity || 'N'}`);
      return;
    }
    logActivity(`expected peers: ${expectedPeerAddresses.map(formatPeer).join(', ') || 'none'}`);
  }, [
    address,
    expectedPeerAddresses,
    isTableFull,
    logActivity,
    privateKey,
    publicKey,
    tableCapacity,
    topologyPlan.seatedPlayers.length,
  ]);

  useEffect(() => {
    if (!address || !publicKey || !tableId || !lobbyId) return;
    if (!isTableFull) {
      logActivity(`signaling paused until table fills ${topologyPlan.seatedPlayers.length}/${tableCapacity || 'N'}`);
      return;
    }
    if (topologyPlan.seatedPlayers.length < 2) return;

    const targets = topologyPlan.outboundTargets
      .filter((player) => player?.address && player?.annoncePublicKey)
      .filter((player) => !initiatedPeersRef.current.has(normalizeAddress(player.address)));

    if (targets.length === 0) return;

    targets.forEach((target) => {
      initiatedPeersRef.current.add(normalizeAddress(target.address));
    });

    const initiate = async () => {
      try {
        setHasConnectionError(false);
        logActivity(`table full; prepare ${targets.length} outbound offer(s) to I+1`);
        const outboundSignals = await Promise.all(targets.map(async (target) => {
          const pc = getPeerConnection(target.address, true);
          logActivity(`create offer ${formatPeer(target.address)}`);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          logActivity(`wait for ICE gathering before offer ${formatPeer(target.address)}`);
          await waitForIceGatheringComplete(pc);

          return {
            recipientAddress: target.address,
            recipientPubKey: target.annoncePublicKey,
            signal: {
              type: 'offer',
              sdp: pc.localDescription.sdp,
            },
          };
        }));

        await sendEncryptedSignals(outboundSignals);
        targets.forEach((target) => {
          emitActivity(`${formatSeat(address)} > ${formatSeat(target.address)} Offer`);
        });
      } catch (error) {
        targets.forEach((target) => {
          initiatedPeersRef.current.delete(normalizeAddress(target.address));
        });
        logActivity(`offer publish failed: ${error.message}`);
        console.error('Failed to initiate chain-signaled WebRTC:', error);
        setHasConnectionError(true);
      }
    };

    initiate();
  }, [
    address,
    emitActivity,
    getPeerConnection,
    isTableFull,
    lobbyId,
    logActivity,
    publicKey,
    reconnectTick,
    sendEncryptedSignals,
    tableId,
    tableCapacity,
    topologyPlan,
  ]);

  useEffect(() => {
    const channels = channelsRef.current;
    const connectedPeers = connectedPeersRef.current;
    const initiatedPeers = initiatedPeersRef.current;
    const peerConnections = peerConnectionsRef.current;
    const processedSignals = processedSignalsRef.current;

    return () => {
      logActivity('closing RTC resources');
      channels.forEach((channel) => {
        channel.onopen = null;
        channel.onclose = null;
        channel.onmessage = null;
        channel.close();
      });
      peerConnections.forEach((pc) => {
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.onicegatheringstatechange = null;
        pc.onsignalingstatechange = null;
        pc.ondatachannel = null;
        pc.close();
      });
      channels.clear();
      connectedPeers.clear();
      initiatedPeers.clear();
      peerConnections.clear();
      processedSignals.clear();
      discoveredKeysRef.current.clear();
      resettingPeersRef.current.clear();
    };
  }, [lobbyId, tableId]);

  const sendMessage = useCallback((message) => {
    const payload = JSON.stringify(message);
    let sentCount = 0;

    channelsRef.current.forEach((channel) => {
      if (channel.readyState === 'open') {
        channel.send(payload);
        sentCount += 1;
      }
    });
    logActivity(`broadcast message type=${message?.type ?? 'unknown'} open_channels=${sentCount}`);
  }, [logActivity]);

  return {
    connectedPeerCount,
    expectedPeerCount: expectedPeerAddresses.length,
    sendMessage,
    status,
    topology: topologyPlan.topology,
    topologyLabel: getRtcTopologyLabel(topologyPlan.topology),
  };
}
