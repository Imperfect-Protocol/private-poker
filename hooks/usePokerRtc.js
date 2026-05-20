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
const RTC_LINK = {
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
};
const linkKey = (peerAddress, direction) => `${direction}:${normalizeAddress(peerAddress)}`;
const isDeadPeerConnection = (pc) => {
  return !pc || ['closed', 'failed', 'disconnected'].includes(pc.connectionState);
};

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
  const [connectedPeerAddresses, setConnectedPeerAddresses] = useState([]);

  const channelsRef = useRef(new Map());
  const connectedLinksRef = useRef(new Set());
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

  const updateConnectedPeers = useCallback(() => {
    const inboundPeers = new Set(
      topologyPlan.inboundSources.map((player) => normalizeAddress(player.address)),
    );
    const outboundPeers = new Set(
      topologyPlan.outboundTargets.map((player) => normalizeAddress(player.address)),
    );
    const nextConnectedPeers = new Set();

    topologyPlan.expectedPeers.forEach((player) => {
      const peerAddress = normalizeAddress(player.address);
      if (!peerAddress) return;

      const needsInbound = inboundPeers.has(peerAddress);
      const needsOutbound = outboundPeers.has(peerAddress);
      const hasInbound = !needsInbound || connectedLinksRef.current.has(linkKey(peerAddress, RTC_LINK.INBOUND));
      const hasOutbound = !needsOutbound || connectedLinksRef.current.has(linkKey(peerAddress, RTC_LINK.OUTBOUND));

      if (hasInbound && hasOutbound) {
        nextConnectedPeers.add(peerAddress);
      }
    });

    connectedPeersRef.current = nextConnectedPeers;
    setConnectedPeerCount(nextConnectedPeers.size);
    setConnectedPeerAddresses(Array.from(nextConnectedPeers));
    return nextConnectedPeers;
  }, [topologyPlan.expectedPeers, topologyPlan.inboundSources, topologyPlan.outboundTargets]);

  const setPeerConnected = useCallback((peerAddress, direction) => {
    const peerKey = normalizeAddress(peerAddress);
    const wasFullyConnected = connectedPeersRef.current.has(peerKey);
    connectedLinksRef.current.add(linkKey(peerAddress, direction));
    const connectedPeers = updateConnectedPeers();

    if (!wasFullyConnected && connectedPeers.has(peerKey)) {
      emitActivity(`${formatSeat(address)} = ${formatSeat(peerAddress)} Connected`);
    }
    logActivity(`peer ${direction} connected ${formatPeer(peerAddress)}`);
    setHasConnectionError(false);
  }, [address, emitActivity, logActivity, updateConnectedPeers]);

  const resetPeerLink = useCallback((peerAddress, direction, reason) => {
    const peerKey = normalizeAddress(peerAddress);
    const key = linkKey(peerAddress, direction);
    if (!peerKey || resettingPeersRef.current.has(key)) return;

    resettingPeersRef.current.add(key);
    logActivity(`reset ${direction} peer ${formatPeer(peerAddress)}: ${reason}`);

    const wasFullyConnected = connectedPeersRef.current.has(peerKey);
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
    connectedLinksRef.current.delete(key);
    peerConnectionsRef.current.delete(key);
    const connectedPeers = updateConnectedPeers();
    setHasConnectionError(false);

    if (wasFullyConnected && !connectedPeers.has(peerKey)) {
      emitActivity(`${formatSeat(address)} ! ${formatSeat(peerAddress)} Disconnected`);
    }

    setTimeout(() => {
      resettingPeersRef.current.delete(key);
    }, 0);
  }, [address, emitActivity, logActivity, updateConnectedPeers]);

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

  const setupDataChannel = useCallback((peerAddress, direction, dataChannel) => {
    const key = linkKey(peerAddress, direction);
    logActivity(`${direction} data channel attached ${formatPeer(peerAddress)} (${dataChannel.label})`);

    dataChannel.onopen = () => {
      logActivity(`${direction} data channel open ${formatPeer(peerAddress)} (${dataChannel.label})`);
      channelsRef.current.set(key, dataChannel);
      setPeerConnected(peerAddress, direction);
    };

    dataChannel.onclose = () => {
      logActivity(`${direction} data channel closed ${formatPeer(peerAddress)} (${dataChannel.label})`);
      resetPeerLink(peerAddress, direction, 'data channel closed');
    };

    dataChannel.onmessage = (event) => {
      logActivity(`${direction} data message received ${formatPeer(peerAddress)} (${String(event.data).length} bytes)`);
      try {
        onMessageRef.current?.(JSON.parse(event.data));
      } catch (error) {
        logActivity(`data message parse failed ${formatPeer(peerAddress)}: ${error.message}`);
        console.error('Failed to parse RTC message:', error);
      }
    };
  }, [logActivity, resetPeerLink, setPeerConnected]);

  const getPeerConnection = useCallback((peerAddress, direction, createChannel = false) => {
    const key = linkKey(peerAddress, direction);
    const existing = peerConnectionsRef.current.get(key);
    if (existing) {
      if (isDeadPeerConnection(existing)) {
        resetPeerLink(peerAddress, direction, `stale peer connection ${existing.connectionState}`);
      } else {
        logActivity(`reuse ${direction} peer connection ${formatPeer(peerAddress)} state=${existing.connectionState}`);
        return existing;
      }
    }

    logActivity(`create ${direction} peer connection ${formatPeer(peerAddress)} create_channel=${createChannel}`);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onconnectionstatechange = () => {
      logActivity(`${direction} peer connection ${formatPeer(peerAddress)} state=${pc.connectionState}`);
      if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) {
        resetPeerLink(peerAddress, direction, `peer connection ${pc.connectionState}`);
      }
    };
    pc.oniceconnectionstatechange = () => {
      logActivity(`${direction} ice connection ${formatPeer(peerAddress)} state=${pc.iceConnectionState}`);
      if (['closed', 'failed', 'disconnected'].includes(pc.iceConnectionState)) {
        resetPeerLink(peerAddress, direction, `ice connection ${pc.iceConnectionState}`);
      }
    };
    pc.onicegatheringstatechange = () => {
      logActivity(`${direction} ice gathering ${formatPeer(peerAddress)} state=${pc.iceGatheringState}`);
    };
    pc.onsignalingstatechange = () => {
      logActivity(`${direction} signaling ${formatPeer(peerAddress)} state=${pc.signalingState}`);
    };
    pc.ondatachannel = (event) => {
      logActivity(`${direction} incoming data channel ${formatPeer(peerAddress)} (${event.channel.label})`);
      setupDataChannel(peerAddress, direction, event.channel);
    };

    if (createChannel) {
      logActivity(`create ${direction} data channel ${formatPeer(peerAddress)}`);
      setupDataChannel(peerAddress, direction, pc.createDataChannel(`poker-token-ring-${direction}`));
    }

    peerConnectionsRef.current.set(key, pc);
    return pc;
  }, [logActivity, resetPeerLink, setupDataChannel]);

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

  const publishOutboundOffers = useCallback(async (outboundTargets, { force = false, reciprocal = false } = {}) => {
    if (!address || !publicKey || !tableId || !lobbyId) return;

    const targets = outboundTargets
      .filter((player) => player?.address && player?.annoncePublicKey)
      .filter((player) => {
        const peerKey = normalizeAddress(player.address);
        const outboundKey = linkKey(player.address, RTC_LINK.OUTBOUND);
        const existing = peerConnectionsRef.current.get(outboundKey);

        if (connectedLinksRef.current.has(outboundKey)) return false;
        if (force) return true;
        if (initiatedPeersRef.current.has(peerKey)) return false;
        if (existing && !isDeadPeerConnection(existing)) return false;
        return true;
      });

    if (targets.length === 0) return;

    targets.forEach((target) => {
      const peerKey = normalizeAddress(target.address);
      if (force) {
        resetPeerLink(target.address, RTC_LINK.OUTBOUND, 'refresh outbound offer');
        initiatedPeersRef.current.delete(peerKey);
      }
      initiatedPeersRef.current.add(peerKey);
    });

    try {
      setHasConnectionError(false);
      logActivity(`prepare ${targets.length} outbound offer(s) to I+1`);
      const outboundSignals = await Promise.all(targets.map(async (target) => {
        const pc = getPeerConnection(target.address, RTC_LINK.OUTBOUND, true);
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
            reciprocal,
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
  }, [
    address,
    emitActivity,
    getPeerConnection,
    lobbyId,
    logActivity,
    publicKey,
    resetPeerLink,
    sendEncryptedSignals,
    tableId,
  ]);

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

    if (signal.type === 'offer') {
      if (!peerPubKey) throw new Error('Incoming offer did not include senderPubKey.');

      emitActivity(`${formatSeat(address)} < ${formatSeat(senderAddress)} Offer`);
      const pc = getPeerConnection(senderAddress, RTC_LINK.INBOUND, false);

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

      const outboundPeer = topologyPlan.outboundTargets.find(
        (player) => normalizeAddress(player.address) === normalizeAddress(senderAddress),
      );
      if (outboundPeer && !signal.reciprocal) {
        await publishOutboundOffers([outboundPeer], { force: true, reciprocal: true });
      }
      return;
    }

    if (signal.type === 'answer') {
      const pc = peerConnectionsRef.current.get(linkKey(senderAddress, RTC_LINK.OUTBOUND));
      if (!pc) {
        logActivity(`answer ignored from ${formatPeer(senderAddress)}: no outbound offer exists`);
        return;
      }
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
      const pc = peerConnectionsRef.current.get(linkKey(senderAddress, RTC_LINK.OUTBOUND))
        ?? peerConnectionsRef.current.get(linkKey(senderAddress, RTC_LINK.INBOUND));
      if (!pc) return;
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  }, [
    address,
    emitActivity,
    getPeerConnection,
    logActivity,
    publishOutboundOffers,
    sendEncryptedSignal,
    topologyPlan.inboundSources,
    topologyPlan.outboundTargets,
  ]);

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

    publishOutboundOffers(topologyPlan.outboundTargets);
  }, [
    address,
    isTableFull,
    lobbyId,
    logActivity,
    publishOutboundOffers,
    publicKey,
    tableId,
    tableCapacity,
    topologyPlan,
  ]);

  useEffect(() => {
    const channels = channelsRef.current;
    const connectedLinks = connectedLinksRef.current;
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
      connectedLinks.clear();
      connectedPeers.clear();
      setConnectedPeerAddresses([]);
      setConnectedPeerCount(0);
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

    channelsRef.current.forEach((channel, key) => {
      if (key.startsWith(`${RTC_LINK.OUTBOUND}:`) && channel.readyState === 'open') {
        channel.send(payload);
        sentCount += 1;
      }
    });
    logActivity(`broadcast message type=${message?.type ?? 'unknown'} open_channels=${sentCount}`);
  }, [logActivity]);

  return {
    connectedPeerCount,
    connectedPeerAddresses,
    expectedPeerCount: expectedPeerAddresses.length,
    sendMessage,
    status,
    topology: topologyPlan.topology,
    topologyLabel: getRtcTopologyLabel(topologyPlan.topology),
  };
}
