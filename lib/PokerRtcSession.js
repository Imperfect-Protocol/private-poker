import { hexToBytes, toHex } from 'viem';
import { decryptFromPeer, encryptForPeer, normalizePeerPublicKey } from '@/lib/crypto';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const MAX_PROCESSED_SIGNALS = 300;
const OFFER_DELAY_MIN_MS = 1000;
const OFFER_DELAY_MAX_MS = 3000;

const RTC_LINK = {
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
};

const SUBSCRIPTION_STATE = {
  CREATED: 'Created',
  OFFER_SENT: 'OfferSent',
  ACCEPT_RECEIVED: 'AcceptReceived',
  ACCEPT_SENT: 'AcceptSent',
  CONNECTED: 'Connected',
  DISCONNECTED: 'Disconnected',
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

const randomOfferDelay = () => (
  OFFER_DELAY_MIN_MS + Math.floor(Math.random() * (OFFER_DELAY_MAX_MS - OFFER_DELAY_MIN_MS + 1))
);

const wait = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

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
  constructor({ sendSignal, onActivity, onStateChange }) {
    this.sendSignal = sendSignal;
    this.onActivity = onActivity;
    this.onStateChange = onStateChange;

    this.connectedLinks = new Set();
    this.connectedPeers = new Set();
    this.inboundSubscriptions = new Map();
    this.outboundSubscriptions = new Map();
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
    };
  }

  setCallbacks({ sendSignal, onActivity, onStateChange }) {
    this.sendSignal = sendSignal;
    this.onActivity = onActivity;
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
    };

    if (
      previousTableId !== undefined
      && (previousTableId !== this.config.tableId || previousLobbyId !== this.config.lobbyId)
    ) {
      this.resetForTable();
    }

    this.logEntry();
    this.logJoins();
    this.updateConnectedPeers();
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
      playersKey,
    ].join('::');
  }

  getSnapshot() {
    return {
      connectedPeerAddresses: Array.from(this.connectedPeers),
      connectedPeerCount: this.connectedPeers.size,
      expectedPeerCount: this.inboundSubscriptions.size,
      status: this.getStatus(),
    };
  }

  getStatus() {
    const { address, privateKey, publicKey, isTableFull } = this.config;
    if (this.hasConnectionError) return 'error';
    if (!address || !privateKey || !publicKey) return 'waiting';
    if (!isTableFull) return 'waiting';
    if (this.inboundSubscriptions.size === 0) return 'waiting';
    if (this.connectedPeers.size >= this.inboundSubscriptions.size) return 'connected';
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

  getSubscription(peerAddress, direction) {
    const subscriptions = direction === RTC_LINK.OUTBOUND
      ? this.outboundSubscriptions
      : this.inboundSubscriptions;
    return subscriptions.get(normalizeAddress(peerAddress));
  }

  createSubscription(playerAddress, playerAnnouncePubKey, direction, callback) {
    const peerKey = normalizeAddress(playerAddress);
    const subscription = {
      address: playerAddress,
      publicAnnounceKey: playerAnnouncePubKey,
      direction,
      webRtcChannel: null,
      state: SUBSCRIPTION_STATE.CREATED,
      callback,
      peerConnection: null,
    };
    if (direction === RTC_LINK.OUTBOUND) {
      this.outboundSubscriptions.set(peerKey, subscription);
    } else {
      this.inboundSubscriptions.set(peerKey, subscription);
    }
    return subscription;
  }

  setSubscriptionState(peerAddress, direction, state, webRtcChannel = undefined) {
    const peerKey = normalizeAddress(peerAddress);
    const subscription = direction === RTC_LINK.OUTBOUND
      ? this.outboundSubscriptions.get(peerKey)
      : this.inboundSubscriptions.get(peerKey);
    if (!subscription) return;

    subscription.state = state;
    if (webRtcChannel !== undefined) {
      subscription.webRtcChannel = webRtcChannel;
    }
    subscription.callback?.(this.getPlayerSeatNo(subscription.address), {
      kind: 'network',
      state,
      address: subscription.address,
    });
  }

  getPlayerPublicKey(peerAddress) {
    const peerKey = normalizeAddress(peerAddress);
    return this.config.players.find(
      (player) => normalizeAddress(player.address) === peerKey,
    )?.annoncePublicKey;
  }

  getPlayerSeatNo(peerAddress) {
    const peerKey = normalizeAddress(peerAddress);
    return this.config.players.find(
      (player) => normalizeAddress(player.address) === peerKey,
    )?.seatNo ?? null;
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
    this.config.players.forEach((player) => {
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
    const nextConnectedPeers = new Set();

    this.inboundSubscriptions.forEach((_, peerAddress) => {
      if (this.connectedLinks.has(linkKey(peerAddress, RTC_LINK.INBOUND))) {
        nextConnectedPeers.add(peerAddress);
      }
    });

    this.connectedPeers = nextConnectedPeers;
    const expectedCount = this.inboundSubscriptions.size;
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
    const subscription = direction === RTC_LINK.INBOUND
      ? this.getSubscription(peerAddress, RTC_LINK.INBOUND)
      : this.getSubscription(peerAddress, RTC_LINK.OUTBOUND);
    const channel = direction === RTC_LINK.INBOUND
      ? subscription?.webRtcChannel
      : subscription?.webRtcChannel;
    if (channel) {
      channel.onopen = null;
      channel.onclose = null;
      channel.onmessage = null;
      if (channel.readyState !== 'closed') {
        channel.close();
      }
    }

    const peerConnection = direction === RTC_LINK.INBOUND
      ? subscription?.peerConnection
      : subscription?.peerConnection;
    if (peerConnection) {
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.onicegatheringstatechange = null;
      peerConnection.onsignalingstatechange = null;
      peerConnection.ondatachannel = null;
      peerConnection.close();
    }

    if (subscription) {
      subscription.webRtcChannel = null;
      subscription.peerConnection = null;
    }
    this.connectedLinks.delete(key);
    const connectedPeers = this.updateConnectedPeers();

    if (wasLinkConnected) {
      this.emitActivity(`${formatSeat(peerAddress)} ${direction === RTC_LINK.OUTBOUND ? '!<' : '!>'} Disconnected ${formatKey(this.getPlayerPublicKey(peerAddress))}`);
    }

    if (direction === RTC_LINK.INBOUND) {
      this.setSubscriptionState(peerAddress, RTC_LINK.INBOUND, SUBSCRIPTION_STATE.DISCONNECTED, null);
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
      this.setSubscriptionState(peerAddress, direction, SUBSCRIPTION_STATE.CONNECTED, dataChannel);
      this.markLinkConnected(peerAddress, direction);
    };

    dataChannel.onclose = () => {
      this.resetPeerLink(peerAddress, direction, 'data channel closed');
    };

    dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (direction === RTC_LINK.INBOUND) {
          const subscription = this.getSubscription(peerAddress, RTC_LINK.INBOUND);
          subscription?.callback?.(this.getPlayerSeatNo(subscription.address), {
            kind: 'message',
            message,
            address: subscription.address,
          });
        }
      } catch (error) {
        this.logActivity(`data message parse failed ${formatPeer(peerAddress)}: ${error.message}`);
        console.error('Failed to parse RTC message:', error);
      }
    };
  }

  createPeerConnection(peerAddress, direction, createChannel) {
    const key = linkKey(peerAddress, direction);
    const subscription = this.getSubscription(peerAddress, direction);
    const existing = subscription?.peerConnection;
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

    if (subscription) {
      subscription.peerConnection = pc;
    }
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
    this.emitActivity(`${formatSeat(recipientAddress)} << ${signal.type === 'accept' ? 'Accept' : 'Offer'} ${formatKey(encryptedSignal.encryptionPublicKey)}`);
  }

  async sendOffer(peer) {
    const { address, publicKey, tableId, lobbyId } = this.config;
    if (!address || !publicKey || !tableId || !lobbyId || !peer?.address || !peer?.annoncePublicKey) return;
    const subscription = this.getSubscription(peer.address, RTC_LINK.INBOUND);

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
      this.setSubscriptionState(peer.address, RTC_LINK.INBOUND, SUBSCRIPTION_STATE.OFFER_SENT);
      this.emitState();
    } catch (error) {
      this.hasConnectionError = true;
      this.emitState();
      this.logActivity(`offer failed ${formatPeer(peer.address)}: ${error.message}`);
      console.error('Failed to send RTC offer:', error);
    }
  }

  async subscribeTo(playerAddress, playerAnnouncePubKey, callback) {
    const peerKey = normalizeAddress(playerAddress);
    if (!peerKey) return;
    this.resetPeerLink(playerAddress, RTC_LINK.INBOUND, 'new subscribeTo call');
    this.inboundSubscriptions.delete(peerKey);
    this.createSubscription(playerAddress, playerAnnouncePubKey, RTC_LINK.INBOUND, callback);
    callback?.(this.getPlayerSeatNo(playerAddress), {
      kind: 'network',
      state: SUBSCRIPTION_STATE.CREATED,
      address: playerAddress,
    });
    await wait(randomOfferDelay());
    await this.sendOffer({
      address: playerAddress,
      annoncePublicKey: playerAnnouncePubKey,
    });
  }

  async sendAccept(peerAddress, peerPubKey, offerSdp) {
    this.resetPeerLink(peerAddress, RTC_LINK.OUTBOUND, 'incoming offer');
    this.outboundSubscriptions.delete(normalizeAddress(peerAddress));
    this.createSubscription(peerAddress, peerPubKey, RTC_LINK.OUTBOUND);
    const pc = this.createPeerConnection(peerAddress, RTC_LINK.OUTBOUND, false);
    await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    const accept = await pc.createAnswer();
    await pc.setLocalDescription(accept);
    await waitForIceGatheringComplete(pc);
    await this.sendEncryptedSignal(peerAddress, peerPubKey, {
      type: 'accept',
      sdp: pc.localDescription.sdp,
    });
    this.setSubscriptionState(peerAddress, RTC_LINK.OUTBOUND, SUBSCRIPTION_STATE.ACCEPT_SENT);
  }

  async handleIncomingSignal(senderAddress, signal) {
    const peerPubKey = signal.senderPubKey;

    if (signal.type === 'offer') {
      if (!peerPubKey) throw new Error('Incoming offer did not include senderPubKey.');

      this.emitActivity(`${formatSeat(senderAddress)} >> Offer ${formatKey(peerPubKey)}`);
      await this.sendAccept(senderAddress, peerPubKey, signal.sdp);
      return;
    }

    if (signal.type === 'accept' || signal.type === 'answer') {
      this.emitActivity(`${formatSeat(senderAddress)} >> Accept ${formatKey(peerPubKey)}`);
      const pc = this.getSubscription(senderAddress, RTC_LINK.INBOUND)?.peerConnection;
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        this.setSubscriptionState(senderAddress, RTC_LINK.INBOUND, SUBSCRIPTION_STATE.ACCEPT_RECEIVED);
      }
    }
  }

  async handleSignal(signalData) {
    const { address, privateKey, tableId, lobbyId } = this.config;
    if (!tableId || !lobbyId) return;
    if (signalData.tableId !== tableId.toString() || signalData.lobbyId !== lobbyId.toString()) return;
    if (normalizeAddress(signalData.sender) === normalizeAddress(address)) return;
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
      this.logActivity(`signal ignored: ${error.message}`);
      console.debug('Ignored undecryptable RTC signal:', error);
    }
  }

  publishMessage(message) {
    const payload = JSON.stringify(message);
    let sentCount = 0;

    this.outboundSubscriptions.forEach((subscription) => {
      if (subscription.webRtcChannel?.readyState === 'open') {
        subscription.webRtcChannel.send(payload);
        sentCount += 1;
      }
    });
    this.logActivity(`broadcast message type=${message?.type ?? 'unknown'} open_channels=${sentCount}`);
  }

  resetForTable() {
    this.inboundSubscriptions.forEach((subscription) => {
      if (subscription.webRtcChannel) {
        subscription.webRtcChannel.onopen = null;
        subscription.webRtcChannel.onclose = null;
        subscription.webRtcChannel.onmessage = null;
        subscription.webRtcChannel.close();
      }
      if (subscription.peerConnection) {
        subscription.peerConnection.onconnectionstatechange = null;
        subscription.peerConnection.oniceconnectionstatechange = null;
        subscription.peerConnection.ondatachannel = null;
        subscription.peerConnection.close();
      }
    });
    this.outboundSubscriptions.forEach((subscription) => {
      if (subscription.webRtcChannel) {
        subscription.webRtcChannel.onopen = null;
        subscription.webRtcChannel.onclose = null;
        subscription.webRtcChannel.onmessage = null;
        subscription.webRtcChannel.close();
      }
      if (subscription.peerConnection) {
        subscription.peerConnection.onconnectionstatechange = null;
        subscription.peerConnection.oniceconnectionstatechange = null;
        subscription.peerConnection.ondatachannel = null;
        subscription.peerConnection.close();
      }
    });
    this.connectedLinks.clear();
    this.connectedPeers.clear();
    this.inboundSubscriptions.clear();
    this.outboundSubscriptions.clear();
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
