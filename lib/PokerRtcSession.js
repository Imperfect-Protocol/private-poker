import { hexToBytes, toHex } from 'viem';
import { decryptFromPeer, encryptForPeer, normalizePeerPublicKey } from '@/lib/crypto';
import {
  DEFAULT_RTC_TOPOLOGY,
  getRtcTopologyPlan,
} from '@/lib/rtcTopology';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const MAX_PROCESSED_SIGNALS = 300;

const RTC_LINK = {
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
};

const normalizeAddress = (value) => value?.toLowerCase() ?? '';
const linkKey = (peerAddress, direction) => `${direction}:${normalizeAddress(peerAddress)}`;
const formatPeer = (value) => (value ? `${value.slice(0, 6)}...${value.slice(-4)}` : 'unknown');
const formatKey = (value) => {
  if (!value) return 'missing';
  const normalized = value.startsWith('0x') ? value : `0x${value}`;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};
const formatSeat = (value) => (value ? value.slice(2, 4).toUpperCase() : '??');
const normalizePublicKey = (value) => (value ? normalizePeerPublicKey(value) : undefined);
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

export class PokerRtcSession {
  constructor({ sendSignal, onActivity, onMessage, onStateChange }) {
    this.sendSignal = sendSignal;
    this.onActivity = onActivity;
    this.onMessage = onMessage;
    this.onStateChange = onStateChange;

    this.channels = new Map();
    this.connectedLinks = new Set();
    this.connectedPeers = new Set();
    this.subscriptions = new Set();
    this.peerConnections = new Map();
    this.processedSignals = new Set();
    this.joinLog = new Set();
    this.resetLinks = new Set();
    this.ready = false;
    this.hasConnectionError = false;
    this.configKey = '';
    this.snapshotKey = '';
    this.config = {
      address: undefined,
      tableId: undefined,
      lobbyId: undefined,
      publicKey: undefined,
      privateKey: undefined,
      players: [],
      isTableFull: false,
      tableCapacity: 0,
      topology: DEFAULT_RTC_TOPOLOGY,
    };
    this.topologyPlan = getRtcTopologyPlan([], undefined, DEFAULT_RTC_TOPOLOGY);
  }

  setCallbacks({ sendSignal, onActivity, onMessage, onStateChange }) {
    this.sendSignal = sendSignal;
    this.onActivity = onActivity;
    this.onMessage = onMessage;
    this.onStateChange = onStateChange;
  }

  update(config) {
    const nextConfigKey = this.makeConfigKey(config);
    if (nextConfigKey === this.configKey) return;
    this.configKey = nextConfigKey;

    const previousTableId = this.config.tableId;
    const previousLobbyId = this.config.lobbyId;
    this.config = {
      ...this.config,
      ...config,
      players: config.players ?? [],
      topology: config.topology ?? DEFAULT_RTC_TOPOLOGY,
    };
    this.topologyPlan = getRtcTopologyPlan(
      this.config.players,
      this.config.address,
      this.config.topology,
    );

    if (
      previousTableId !== undefined
      && (previousTableId !== this.config.tableId || previousLobbyId !== this.config.lobbyId)
    ) {
      this.resetForTable();
    }

    this.logEntry();
    this.logJoins();
    this.updateConnectedPeers();
    this.publishInitialOffers();
  }

  makeConfigKey(config) {
    const players = config.players ?? [];
    const playersKey = players
      .map((player) => [
        normalizeAddress(player?.address),
        player?.annoncePublicKey ?? '',
        player?.chips ?? '',
      ].join('/'))
      .join('|');

    return [
      normalizeAddress(config.address),
      config.tableId ?? '',
      config.lobbyId ?? '',
      config.publicKey ?? '',
      config.privateKey ? 'private-key-ready' : '',
      config.isTableFull ? 'full' : 'waiting',
      config.tableCapacity ?? 0,
      config.topology ?? DEFAULT_RTC_TOPOLOGY,
      playersKey,
    ].join('::');
  }

  getSnapshot() {
    return {
      connectedPeerAddresses: Array.from(this.connectedPeers),
      connectedPeerCount: this.connectedPeers.size,
      expectedPeerCount: this.topologyPlan.expectedPeers.length,
      status: this.getStatus(),
    };
  }

  getStatus() {
    const { address, privateKey, publicKey, isTableFull } = this.config;
    if (this.hasConnectionError) return 'error';
    if (!address || !privateKey || !publicKey) return 'waiting';
    if (!isTableFull) return 'waiting';
    if (
      this.topologyPlan.expectedPeers.length > 0
      && this.connectedPeers.size >= this.topologyPlan.expectedPeers.length
    ) {
      return 'connected';
    }
    if (this.topologyPlan.seatedPlayers.length < 2) return 'waiting';
    return 'connecting';
  }

  emitState() {
    const snapshot = this.getSnapshot();
    const snapshotKey = [
      snapshot.status,
      snapshot.connectedPeerCount,
      snapshot.expectedPeerCount,
      snapshot.connectedPeerAddresses.join('|'),
    ].join('::');

    if (snapshotKey === this.snapshotKey) return;
    this.snapshotKey = snapshotKey;
    this.onStateChange?.(snapshot);
  }

  logActivity(text, details = undefined) {
    if (details === undefined) {
      console.debug(`[RTC debug] ${text}`);
    } else {
      console.debug(`[RTC debug] ${text}`, details);
    }
  }

  emitActivity(text, details = undefined) {
    if (details === undefined) {
      console.log(text);
    } else {
      console.log(text, details);
    }
    this.onActivity?.({ text, details, at: new Date(), display: true });
  }

  getPlayerPublicKey(peerAddress) {
    const peerKey = normalizeAddress(peerAddress);
    return this.topologyPlan.seatedPlayers.find(
      (player) => normalizeAddress(player.address) === peerKey,
    )?.annoncePublicKey;
  }

  getOutboundPeer(peerAddress) {
    const peerKey = normalizeAddress(peerAddress);
    return this.topologyPlan.outboundTargets.find(
      (player) => normalizeAddress(player.address) === peerKey,
    );
  }

  logEntry() {
    const { address, publicKey, tableId } = this.config;
    if (!publicKey || !address || !tableId) return;
    const key = `enter:${tableId}:${normalizeAddress(address)}:${publicKey}`;
    if (this.joinLog.has(key)) return;
    this.joinLog.add(key);
    this.emitActivity('Me :: Enter');
  }

  logJoins() {
    const { address, tableId } = this.config;
    this.topologyPlan.seatedPlayers.forEach((player) => {
      if (!player?.address || !player?.annoncePublicKey) return;

      const isMe = normalizeAddress(player.address) === normalizeAddress(address);
      const key = `join:${tableId}:${normalizeAddress(player.address)}:${player.annoncePublicKey}`;
      if (this.joinLog.has(key)) return;
      this.joinLog.add(key);

      if (isMe) {
        this.emitActivity(`Me :: Join ${formatKey(player.annoncePublicKey)}`);
      } else {
        this.emitActivity(`${formatSeat(player.address)} :: Join ${formatKey(player.annoncePublicKey)}`);
      }
    });
  }

  updateConnectedPeers() {
    const inboundPeers = new Set(
      this.topologyPlan.inboundSources.map((player) => normalizeAddress(player.address)),
    );
    const outboundPeers = new Set(
      this.topologyPlan.outboundTargets.map((player) => normalizeAddress(player.address)),
    );
    const nextConnectedPeers = new Set();

    this.topologyPlan.expectedPeers.forEach((player) => {
      const peerAddress = normalizeAddress(player.address);
      if (!peerAddress) return;

      const needsInbound = inboundPeers.has(peerAddress);
      const needsOutbound = outboundPeers.has(peerAddress);
      const hasInbound = !needsInbound || this.connectedLinks.has(linkKey(peerAddress, RTC_LINK.INBOUND));
      const hasOutbound = !needsOutbound || this.connectedLinks.has(linkKey(peerAddress, RTC_LINK.OUTBOUND));

      if (hasInbound && hasOutbound) {
        nextConnectedPeers.add(peerAddress);
      }
    });

    this.connectedPeers = nextConnectedPeers;
    const expectedCount = this.topologyPlan.expectedPeers.length;
    const isReady = expectedCount > 0 && nextConnectedPeers.size >= expectedCount;
    if (isReady && !this.ready) {
      this.emitActivity('Me :: Ready');
    }
    if (!isReady && this.ready) {
      this.emitActivity('Me :: Paused');
    }
    this.ready = isReady;
    this.emitState();
    return nextConnectedPeers;
  }

  markLinkConnected(peerAddress, direction) {
    const key = linkKey(peerAddress, direction);
    if (this.connectedLinks.has(key)) return;

    this.connectedLinks.add(key);
    this.hasConnectionError = false;
    this.emitActivity(`${formatSeat(peerAddress)} ${direction === RTC_LINK.OUTBOUND ? '<=' : '=>'} Connected ${formatKey(this.getPlayerPublicKey(peerAddress))}`);
    this.updateConnectedPeers();
  }

  resetPeerLink(peerAddress, direction, reason) {
    const peerKey = normalizeAddress(peerAddress);
    const key = linkKey(peerAddress, direction);
    if (!peerKey || this.resetLinks.has(key)) return;

    this.resetLinks.add(key);
    this.logActivity(`reset ${direction} ${formatPeer(peerAddress)}: ${reason}`);

    const wasLinkConnected = this.connectedLinks.has(key);
    const wasFullyConnected = this.connectedPeers.has(peerKey);
    const channel = this.channels.get(key);
    if (channel) {
      channel.onopen = null;
      channel.onclose = null;
      channel.onmessage = null;
      if (channel.readyState !== 'closed') {
        channel.close();
      }
    }

    const peerConnection = this.peerConnections.get(key);
    if (peerConnection) {
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.onicegatheringstatechange = null;
      peerConnection.onsignalingstatechange = null;
      peerConnection.ondatachannel = null;
      peerConnection.close();
    }

    this.channels.delete(key);
    this.peerConnections.delete(key);
    this.connectedLinks.delete(key);
    const connectedPeers = this.updateConnectedPeers();

    if (wasLinkConnected) {
      this.emitActivity(`${formatSeat(peerAddress)} ${direction === RTC_LINK.OUTBOUND ? '!<' : '!>'} Disconnected ${formatKey(this.getPlayerPublicKey(peerAddress))}`);
    }

    if (wasFullyConnected && !connectedPeers.has(peerKey)) {
      this.emitActivity(`${formatSeat(peerAddress)} !! Disconnected ${formatKey(this.getPlayerPublicKey(peerAddress))}`);
    }

    setTimeout(() => {
      this.resetLinks.delete(key);
    }, 0);
  }

  setupDataChannel(peerAddress, direction, dataChannel) {
    const key = linkKey(peerAddress, direction);
    this.logActivity(`${direction} channel attached ${formatPeer(peerAddress)} (${dataChannel.label})`);

    dataChannel.onopen = () => {
      this.channels.set(key, dataChannel);
      this.markLinkConnected(peerAddress, direction);
    };

    dataChannel.onclose = () => {
      this.resetPeerLink(peerAddress, direction, 'data channel closed');
    };

    dataChannel.onmessage = (event) => {
      try {
        this.onMessage?.(JSON.parse(event.data));
      } catch (error) {
        this.logActivity(`data message parse failed ${formatPeer(peerAddress)}: ${error.message}`);
        console.error('Failed to parse RTC message:', error);
      }
    };
  }

  createPeerConnection(peerAddress, direction, createChannel) {
    const key = linkKey(peerAddress, direction);
    const existing = this.peerConnections.get(key);
    if (existing && !isDeadPeerConnection(existing)) {
      return existing;
    }
    if (existing) {
      this.resetPeerLink(peerAddress, direction, `stale peer connection ${existing.connectionState}`);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onconnectionstatechange = () => {
      if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) {
        this.resetPeerLink(peerAddress, direction, `peer connection ${pc.connectionState}`);
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (['closed', 'failed', 'disconnected'].includes(pc.iceConnectionState)) {
        this.resetPeerLink(peerAddress, direction, `ice connection ${pc.iceConnectionState}`);
      }
    };
    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerAddress, direction, event.channel);
    };

    if (createChannel) {
      this.setupDataChannel(
        peerAddress,
        direction,
        pc.createDataChannel(`poker-token-ring-${direction}`),
      );
    }

    this.peerConnections.set(key, pc);
    return pc;
  }

  async encryptSignalForPeer(recipientPubKey, signal) {
    const { publicKey } = this.config;
    const encryptionPublicKey = normalizePublicKey(recipientPubKey);
    if (!publicKey || !encryptionPublicKey) return undefined;

    const payload = JSON.stringify({
      ...signal,
      app: 'private-poker',
      version: 1,
      senderPubKey: publicKey,
    });
    const encryptedPayload = await encryptForPeer(encryptionPublicKey, payload);
    return {
      encryptedData: toHex(new TextEncoder().encode(JSON.stringify(encryptedPayload))),
      encryptionPublicKey,
    };
  }

  async sendEncryptedSignal(recipientAddress, recipientPubKey, signal) {
    const { lobbyId, tableId } = this.config;
    const encryptedSignal = await this.encryptSignalForPeer(recipientPubKey, signal);
    if (!encryptedSignal) return;

    await this.sendSignal(lobbyId, tableId, recipientAddress, encryptedSignal.encryptedData);
    this.emitActivity(`${formatSeat(recipientAddress)} << ${signal.type === 'answer' ? 'Answer' : 'Offer'} ${formatKey(encryptedSignal.encryptionPublicKey)}`);
  }

  async sendOffer(peer) {
    const { address, publicKey, tableId, lobbyId, isTableFull } = this.config;
    if (!address || !publicKey || !tableId || !lobbyId) return;
    if (!peer?.address || !peer?.annoncePublicKey) return;
    if (!isTableFull) return;

    const inboundKey = linkKey(peer.address, RTC_LINK.INBOUND);
    if (this.connectedLinks.has(inboundKey)) return;

    if (this.peerConnections.has(inboundKey) || this.channels.has(inboundKey)) {
      this.resetPeerLink(peer.address, RTC_LINK.INBOUND, 'new subscription offer');
    }

    try {
      this.hasConnectionError = false;
      const pc = this.createPeerConnection(peer.address, RTC_LINK.INBOUND, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);
      await this.sendEncryptedSignal(peer.address, peer.annoncePublicKey, {
        type: 'offer',
        sdp: pc.localDescription.sdp,
      });
      this.emitState();
    } catch (error) {
      this.hasConnectionError = true;
      this.emitState();
      this.logActivity(`offer failed ${formatPeer(peer.address)}: ${error.message}`);
      console.error('Failed to send RTC offer:', error);
    }
  }

  async subscribeTo(playerAddress, playerAnnouncePubKey) {
    const peerKey = normalizeAddress(playerAddress);
    if (!peerKey || this.subscriptions.has(peerKey)) return;
    if (this.isInboundConnected(playerAddress)) return;

    this.subscriptions.add(peerKey);
    await this.sendOffer({
      address: playerAddress,
      annoncePublicKey: playerAnnouncePubKey,
    });
  }

  async sendInitialOffer(peer) {
    const peerKey = normalizeAddress(peer?.address);
    if (!peerKey || this.subscriptions.has(peerKey)) return;
    if (this.isInboundConnected(peer.address)) return;

    await this.subscribeTo(peer.address, peer.annoncePublicKey);
  }

  async sendAnswer(peerAddress, peerPubKey, offerSdp) {
    if (!this.config.isTableFull) return;

    this.resetPeerLink(peerAddress, RTC_LINK.OUTBOUND, 'incoming offer');
    const pc = this.createPeerConnection(peerAddress, RTC_LINK.OUTBOUND, false);
    await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(pc);
    await this.sendEncryptedSignal(peerAddress, peerPubKey, {
      type: 'answer',
      sdp: pc.localDescription.sdp,
    });
  }

  isExpectedInboundPeer(peerAddress) {
    const peerKey = normalizeAddress(peerAddress);
    return this.topologyPlan.inboundSources.some(
      (player) => normalizeAddress(player.address) === peerKey,
    );
  }

  findOutboundPeer(peerAddress) {
    const peerKey = normalizeAddress(peerAddress);
    return this.topologyPlan.outboundTargets.find(
      (player) => normalizeAddress(player.address) === peerKey,
    );
  }

  isExpectedOutboundPeer(peerAddress) {
    const peerKey = normalizeAddress(peerAddress);
    return this.topologyPlan.outboundTargets.some(
      (player) => normalizeAddress(player.address) === peerKey,
    );
  }

  isOutboundConnected(peerAddress) {
    return this.connectedLinks.has(linkKey(peerAddress, RTC_LINK.OUTBOUND));
  }

  isInboundConnected(peerAddress) {
    return this.connectedLinks.has(linkKey(peerAddress, RTC_LINK.INBOUND));
  }

  async handleIncomingSignal(senderAddress, signal) {
    const peerPubKey = signal.senderPubKey;

    if (signal.type === 'offer') {
      if (!peerPubKey) throw new Error('Incoming offer did not include senderPubKey.');

      this.emitActivity(`${formatSeat(senderAddress)} >> Offer ${formatKey(peerPubKey)}`);
      await this.sendAnswer(senderAddress, peerPubKey, signal.sdp);
      return;
    }

    if (signal.type === 'answer') {
      this.emitActivity(`${formatSeat(senderAddress)} >> Answer ${formatKey(peerPubKey)}`);
      const pc = this.peerConnections.get(linkKey(senderAddress, RTC_LINK.INBOUND));
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      }
    }
  }

  async handleSignal(signalData) {
    const { privateKey, tableId, lobbyId } = this.config;
    if (!tableId || !lobbyId) return;
    if (signalData.tableId !== tableId.toString() || signalData.lobbyId !== lobbyId.toString()) return;
    if (signalData.logId && this.processedSignals.has(signalData.logId)) return;
    if (signalData.logId) {
      this.processedSignals.add(signalData.logId);
      if (this.processedSignals.size > MAX_PROCESSED_SIGNALS) {
        const [oldestSignalId] = this.processedSignals;
        this.processedSignals.delete(oldestSignalId);
      }
    }

    if (signalData.isRecipient === false) return;

    if (!privateKey) return;

    try {
      const payloadString = new TextDecoder().decode(hexToBytes(signalData.encryptedData));
      const encryptedPayload = JSON.parse(payloadString);
      const decryptedString = await decryptFromPeer(privateKey, encryptedPayload);
      const signal = JSON.parse(decryptedString);
      await this.handleIncomingSignal(signalData.sender, signal);
    } catch (error) {
      this.hasConnectionError = true;
      this.emitState();
      this.logActivity(`signal failed: ${error.message}`);
      console.error('Failed to handle RTC signal:', error);
    }
  }

  publishInitialOffers() {
    const { address, publicKey, tableId, lobbyId, isTableFull, tableCapacity } = this.config;
    if (!address || !publicKey || !tableId || !lobbyId) return;
    if (!isTableFull) {
      this.logActivity(`waiting for full table ${this.topologyPlan.seatedPlayers.length}/${tableCapacity || 'N'}`);
      return;
    }
    if (this.topologyPlan.seatedPlayers.length < 2) return;

    this.topologyPlan.outboundTargets.forEach((peer) => {
      this.sendInitialOffer(peer);
    });
  }

  publishMessage(message) {
    const payload = JSON.stringify(message);
    let sentCount = 0;

    this.channels.forEach((channel, key) => {
      if (key.startsWith(`${RTC_LINK.OUTBOUND}:`) && channel.readyState === 'open') {
        channel.send(payload);
        sentCount += 1;
      }
    });
    this.logActivity(`broadcast message type=${message?.type ?? 'unknown'} open_channels=${sentCount}`);
  }

  sendMessage(message) {
    this.publishMessage(message);
  }

  resetForTable() {
    this.channels.forEach((channel) => {
      channel.onopen = null;
      channel.onclose = null;
      channel.onmessage = null;
      channel.close();
    });
    this.peerConnections.forEach((pc) => {
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.ondatachannel = null;
      pc.close();
    });
    this.channels.clear();
    this.connectedLinks.clear();
    this.connectedPeers.clear();
    this.subscriptions.clear();
    this.peerConnections.clear();
    this.processedSignals.clear();
    this.joinLog.clear();
    this.resetLinks.clear();
    this.ready = false;
    this.configKey = '';
    this.snapshotKey = '';
    this.emitState();
  }

  destroy() {
    this.resetForTable();
  }
}
