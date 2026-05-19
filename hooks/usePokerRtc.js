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
  topology = DEFAULT_RTC_TOPOLOGY,
) {
  const { address } = useConnection();
  const { sendSignal } = usePrivatePokerSignal();
  const publicKey = blsKeys?.publicKey;
  const privateKey = blsKeys?.privateKey;
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const [connectedPeerCount, setConnectedPeerCount] = useState(0);

  const channelsRef = useRef(new Map());
  const connectedPeersRef = useRef(new Set());
  const initiatedPeersRef = useRef(new Set());
  const peerConnectionsRef = useRef(new Map());
  const processedSignalsRef = useRef(new Set());
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const topologyPlan = useMemo(
    () => getRtcTopologyPlan(players, address, topology),
    [address, players, topology],
  );

  const expectedPeerAddresses = useMemo(() => {
    return topologyPlan.expectedPeers.map((player) => player.address);
  }, [topologyPlan]);

  const setPeerConnected = useCallback((peerAddress) => {
    setHasConnectionError(false);
    connectedPeersRef.current.add(normalizeAddress(peerAddress));
    setConnectedPeerCount(connectedPeersRef.current.size);
  }, []);

  const status = useMemo(() => {
    if (hasConnectionError) return 'error';

    if (!address || !privateKey || !publicKey) {
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
    privateKey,
    publicKey,
    topologyPlan.seatedPlayers.length,
  ]);

  const setupDataChannel = useCallback((peerAddress, dataChannel) => {
    dataChannel.onopen = () => {
      channelsRef.current.set(normalizeAddress(peerAddress), dataChannel);
      setPeerConnected(peerAddress);
    };

    dataChannel.onclose = () => {
      channelsRef.current.delete(normalizeAddress(peerAddress));
      connectedPeersRef.current.delete(normalizeAddress(peerAddress));
      setConnectedPeerCount(connectedPeersRef.current.size);
    };

    dataChannel.onmessage = (event) => {
      try {
        onMessageRef.current?.(JSON.parse(event.data));
      } catch (error) {
        console.error('Failed to parse RTC message:', error);
      }
    };
  }, [setPeerConnected]);

  const getPeerConnection = useCallback((peerAddress, createChannel = false) => {
    const key = normalizeAddress(peerAddress);
    const existing = peerConnectionsRef.current.get(key);
    if (existing) return existing;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setHasConnectionError(true);
      }
    };
    pc.ondatachannel = (event) => setupDataChannel(peerAddress, event.channel);

    if (createChannel) {
      setupDataChannel(peerAddress, pc.createDataChannel('poker-token-ring'));
    }

    peerConnectionsRef.current.set(key, pc);
    return pc;
  }, [setupDataChannel]);

  const encryptSignalForPeer = useCallback(async (recipientPubKey, signal) => {
    if (!publicKey) return;
    if (!recipientPubKey) return;

    const payload = JSON.stringify({
      ...signal,
      app: 'private-poker',
      version: 1,
      senderPubKey: publicKey,
    });
    const encryptedPayload = await encryptForPeer(recipientPubKey, payload);
    return toHex(new TextEncoder().encode(JSON.stringify(encryptedPayload)));
  }, [publicKey]);

  const sendEncryptedSignal = useCallback(async (recipientAddress, recipientPubKey, signal) => {
    if (!recipientAddress) return;

    const encryptedData = await encryptSignalForPeer(recipientPubKey, signal);
    if (!encryptedData) return;

    await sendSignal(lobbyId, tableId, recipientAddress, encryptedData);
  }, [encryptSignalForPeer, lobbyId, sendSignal, tableId]);

  const sendEncryptedSignals = useCallback(async (signals) => {
    const encryptedSignals = await Promise.all(
      signals.map(async ({ recipientAddress, recipientPubKey, signal }) => ({
        recipientAddress,
        encryptedData: await encryptSignalForPeer(recipientPubKey, signal),
      })),
    );
    const readySignals = encryptedSignals.filter(
      ({ recipientAddress, encryptedData }) => recipientAddress && encryptedData,
    );

    if (readySignals.length === 0) return;

    await sendSignal(
      lobbyId,
      tableId,
      readySignals.map(({ recipientAddress }) => recipientAddress),
      readySignals.map(({ encryptedData }) => encryptedData),
    );
  }, [encryptSignalForPeer, lobbyId, sendSignal, tableId]);

  const handleIncomingSignal = useCallback(async (senderAddress, signal) => {
    const peerPubKey = signal.senderPubKey;
    const pc = getPeerConnection(senderAddress, false);

    if (signal.type === 'offer') {
      if (!peerPubKey) throw new Error('Incoming offer did not include senderPubKey.');

      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceGatheringComplete(pc);

      await sendEncryptedSignal(senderAddress, peerPubKey, {
        type: 'answer',
        sdp: pc.localDescription.sdp,
      });
      return;
    }

    if (signal.type === 'answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      return;
    }

    if (signal.type === 'ice-candidate' && signal.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  }, [getPeerConnection, sendEncryptedSignal]);

  useListenForSignals(address, async (signalData) => {
    if (!privateKey || !tableId || !lobbyId) return;
    if (signalData.tableId !== tableId.toString() || signalData.lobbyId !== lobbyId.toString()) return;
    if (signalData.logId && processedSignalsRef.current.has(signalData.logId)) return;
    if (signalData.logId) {
      processedSignalsRef.current.add(signalData.logId);
      if (processedSignalsRef.current.size > MAX_PROCESSED_SIGNALS) {
        const [oldestSignalId] = processedSignalsRef.current;
        processedSignalsRef.current.delete(oldestSignalId);
      }
    }

    try {
      const payloadString = new TextDecoder().decode(hexToBytes(signalData.encryptedData));
      const encryptedPayload = JSON.parse(payloadString);
      const decryptedString = await decryptFromPeer(privateKey, encryptedPayload);
      const signal = JSON.parse(decryptedString);

      await handleIncomingSignal(signalData.sender, signal);
    } catch (error) {
      console.error('Failed to decrypt RTC signal:', error);
    }
  });

  useEffect(() => {
    if (!address || !publicKey || !tableId || !lobbyId) return;
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
        const outboundSignals = await Promise.all(targets.map(async (target) => {
          const pc = getPeerConnection(target.address, true);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
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
      } catch (error) {
        targets.forEach((target) => {
          initiatedPeersRef.current.delete(normalizeAddress(target.address));
        });
        console.error('Failed to initiate chain-signaled WebRTC:', error);
        setHasConnectionError(true);
      }
    };

    initiate();
  }, [
    address,
    getPeerConnection,
    lobbyId,
    publicKey,
    sendEncryptedSignals,
    tableId,
    topologyPlan,
  ]);

  useEffect(() => {
    const channels = channelsRef.current;
    const connectedPeers = connectedPeersRef.current;
    const initiatedPeers = initiatedPeersRef.current;
    const peerConnections = peerConnectionsRef.current;
    const processedSignals = processedSignalsRef.current;

    return () => {
      channels.forEach((channel) => {
        channel.onopen = null;
        channel.onclose = null;
        channel.onmessage = null;
        channel.close();
      });
      peerConnections.forEach((pc) => {
        pc.onconnectionstatechange = null;
        pc.ondatachannel = null;
        pc.close();
      });
      channels.clear();
      connectedPeers.clear();
      initiatedPeers.clear();
      peerConnections.clear();
      processedSignals.clear();
    };
  }, [lobbyId, tableId]);

  const sendMessage = useCallback((message) => {
    const payload = JSON.stringify(message);

    channelsRef.current.forEach((channel) => {
      if (channel.readyState === 'open') {
        channel.send(payload);
      }
    });
  }, []);

  return {
    connectedPeerCount,
    expectedPeerCount: expectedPeerAddresses.length,
    sendMessage,
    status,
    topology: topologyPlan.topology,
    topologyLabel: getRtcTopologyLabel(topologyPlan.topology),
  };
}
