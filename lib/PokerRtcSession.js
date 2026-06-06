import * as bls from '@noble/bls12-381';
import { hexToBytes, toHex } from 'viem';
import { decryptFromPeer, encryptForPeer, normalizePeerPublicKey } from '@/lib/crypto';
import { RTC_POOL_SIGNAL, rtcSessionPool } from '@/lib/RtcSessionPool';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const MAX_PROCESSED_SIGNALS = 300;
const MIN_OFFER_DELAY_MS = 2000;
const MAX_OFFER_DELAY_MS = 5000;
const OFFER_ACCEPT_TIMEOUT_MS = 10000;
const OFFER_RETRY_DELAY_MS = 1000;

const RTC_LINK = {
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
};

const oppositeLink = (direction) => (
  direction === RTC_LINK.OUTBOUND ? RTC_LINK.INBOUND : RTC_LINK.OUTBOUND
);

const SUBSCRIPTION_STATE = {
  CREATED: 'Created',
  OFFER_SENT: 'OfferSent',
  OFFER_TIMEOUT: 'OfferTimeout',
  ACCEPT_RECEIVED: 'AcceptReceived',
  ACCEPT_SENT: 'AcceptSent',
  CONNECTED: 'Connected',
  DISCONNECTED: 'Disconnected',
};

const RTC_CONTROL_MESSAGE = 'RTC_CONTROL';
const TRANSPORT_SIGNATURE_SCHEME = 'BLS12-381-G1-PK-G2-SIG';
const MAX_PUBLISHED_MESSAGE_CACHE = 200;

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
const ensureHexPrefix = (value) => {
  const normalized = String(value ?? '');
  return normalized.startsWith('0x') ? normalized : `0x${normalized}`;
};
const isDeadPeerConnection = (pc) => {
  return !pc || ['closed', 'failed', 'disconnected'].includes(pc.connectionState);
};

const wait = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const randomOfferDelay = () => (
  MIN_OFFER_DELAY_MS + Math.floor(Math.random() * (MAX_OFFER_DELAY_MS - MIN_OFFER_DELAY_MS + 1))
);

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function stripTransportFields(message) {
  if (!message || typeof message !== 'object') return message;
  const unsignedMessage = { ...message };
  delete unsignedMessage.rtcSignature;
  delete unsignedMessage.rtcDisagreement;
  return unsignedMessage;
}

function transportSignaturePayload(message, signerAddress) {
  return new TextEncoder().encode(canonicalJson({
    signerAddress: normalizeAddress(signerAddress),
    message: stripTransportFields(message),
  }));
}

function transportMessageKey(message) {
  const unsignedMessage = stripTransportFields(message);
  const wire = unsignedMessage?.wire;
  if (wire) {
    return [
      'wire',
      unsignedMessage.type ?? '',
      wire.table_id ?? '',
      wire.hand_id ?? '',
      wire.from ?? '',
      wire.sequence ?? '',
    ].join(':');
  }
  return canonicalJson(unsignedMessage);
}

function disagreementMessageKey(message) {
  return [
    transportMessageKey(message),
    normalizeAddress(message?.rtcDisagreement?.signer ?? message?.rtcSignature?.signer),
    normalizeAddress(message?.rtcDisagreement?.rejectedBy),
    message?.rtcDisagreement?.reason ?? '',
  ].join(':');
}

function badSignaturePayload(payload) {
  const badPayload = new Uint8Array(payload.length + 1);
  badPayload.set(payload);
  badPayload[payload.length] = 1;
  return badPayload;
}

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
  constructor({
    sendSignal,
    sendPooledSignal = null,
    onActivity,
    onStateChange,
    sessionPool = rtcSessionPool,
  }) {
    this.sendSignal = sendSignal;
    this.sendPooledSignal = sendPooledSignal;
    this.enqueueControlAction = async (type, task) => task();
    this.blsActionKey = null;
    this.onActivity = onActivity;
    this.onStateChange = onStateChange;
    this.sessionPool = sessionPool;

    this.connectedLinks = new Set();
    this.connectedPeers = new Set();
    this.inboundSubscriptions = new Map();
    this.outboundSubscriptions = new Map();
    this.processedSignals = new Set();
    this.joinLog = new Set();
    this.resetLinks = new Set();
    this.offerTimeouts = new Map();
    this.offerRetryTimers = new Map();
    this.publishedMessages = new Map();
    this.seenDisagreements = new Set();
    this.publishQueue = Promise.resolve();
    this.badSignatureOnce = false;
    this.dropNextMessage = false;
    this.duplicateNextMessage = false;
    this.localMediaStream = null;
    this.remoteMediaStreams = new Map();
    this.mediaSnapshotVersion = 0;
    this.ready = false;
    this.hasConnectionError = false;
    this.pendingRelayEnvelopes = [];
    this.drainingRelayEnvelopes = false;
    this.configKey = '';
    this.snapshotKey = '';
    this.config = {
      playerAddress: undefined,
      operator: undefined,
      tableId: undefined,
      lobbyId: undefined,
      publicKey: undefined,
      privateKey: undefined,
      operatorPrivateKey: undefined,
      players: [],
      isTableFull: false,
      tableCapacity: 0,
    };
  }

  setCallbacks({
    sendSignal,
    sendPooledSignal,
    enqueueControlAction,
    blsActionKey,
    onActivity,
    onStateChange,
  }) {
    this.sendSignal = sendSignal;
    if (sendPooledSignal !== undefined) {
      this.sendPooledSignal = sendPooledSignal;
    }
    if (enqueueControlAction !== undefined) {
      this.enqueueControlAction = enqueueControlAction;
    }
    if (blsActionKey !== undefined) {
      this.blsActionKey = blsActionKey;
    }
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
    this.sessionPool.registerSession(this);
    this.updateConnectedPeers();
    void this.drainPendingRelayEnvelopes();
  }

  makeConfigKey(config) {
    const players = config.players ?? [];
    const playersKey = players
      .map((player) => [
        normalizeAddress(player?.playerAddress),
        player?.annoncePublicKey ?? '',
        player?.chips ?? '',
      ].join('/'))
      .join('|');

    return [
      normalizeAddress(config.playerAddress),
      config.tableId ?? '',
      config.lobbyId ?? '',
      config.publicKey ?? '',
      config.privateKey ? 'private-key-ready' : '',
      config.playerAddress ?? '',
      config.isTableFull ? 'full' : 'waiting',
      config.tableCapacity ?? 0,
      playersKey,
    ].join('::');
  }

  getSnapshot() {
    const firstInbound = Array.from(this.inboundSubscriptions.values())[0] ?? null;
    const firstOutbound = Array.from(this.outboundSubscriptions.values())[0] ?? null;
    const peerStates = {};

    this.config.players.forEach((player) => {
      if (!player?.playerAddress) return;
      const peerAddress = player.playerAddress;
      const peerKey = normalizeAddress(peerAddress);
      const isMe = peerKey === normalizeAddress(this.config.playerAddress);
      if (isMe) {
        peerStates[peerKey] = this.getStatus() === 'connected'
          ? 'connected'
          : this.getStatus() === 'connecting'
            ? 'connecting'
            : 'sitting-out';
        return;
      }

      const inbound = this.getSubscription(peerAddress, RTC_LINK.INBOUND);
      const outbound = this.getSubscription(peerAddress, RTC_LINK.OUTBOUND);
      const inboundConnected = this.connectedLinks.has(linkKey(peerAddress, RTC_LINK.INBOUND));
      const outboundConnected = this.connectedLinks.has(linkKey(peerAddress, RTC_LINK.OUTBOUND));
      const hasDisconnectedLink = [inbound?.state, outbound?.state].some((state) => (
        state === SUBSCRIPTION_STATE.DISCONNECTED || state === SUBSCRIPTION_STATE.OFFER_TIMEOUT
      ));
      const hasConnectedLink = (inbound || outbound)
        && (!inbound || inboundConnected)
        && (!outbound || outboundConnected)
        && (inboundConnected || outboundConnected);
      const hasActiveLink = inbound || outbound;

      peerStates[peerKey] = hasDisconnectedLink
        ? 'disconnected'
        : hasConnectedLink
        ? 'connected'
        : hasActiveLink
          ? 'connecting'
          : 'sitting-out';
    });

    const remoteMediaStreams = {};
    this.remoteMediaStreams.forEach((stream, key) => {
      const [, peerAddress] = key.split(':');
      if (!peerAddress) return;

      const mergedStream = remoteMediaStreams[peerAddress] ?? new MediaStream();
      stream.getTracks().forEach((track) => {
        if (mergedStream.getTracks().some((existingTrack) => existingTrack.id === track.id)) return;
        mergedStream.addTrack(track);
      });
      remoteMediaStreams[peerAddress] = mergedStream;
    });

    return {
      connectedPeerAddresses: Array.from(this.connectedPeers),
      connectedPeerCount: this.connectedPeers.size,
      expectedPeerCount: this.inboundSubscriptions.size,
      inboundState: firstInbound?.state ?? 'None',
      outboundState: firstOutbound?.state ?? 'None',
      inboundPeerAddress: firstInbound?.playerAddress ?? null,
      outboundPeerAddress: firstOutbound?.playerAddress ?? null,
      peerStates,
      remoteMediaStreams,
      mediaSnapshotVersion: this.mediaSnapshotVersion,
      status: this.getStatus(),
    };
  }

  getStatus() {
    const { playerAddress, operatorPrivateKey, privateKey, publicKey, isTableFull } = this.config;
    if (this.hasConnectionError) return 'error';
    if (!playerAddress || !operatorPrivateKey || !privateKey || !publicKey) return 'waiting';
    if (!isTableFull) return 'waiting';
    if (this.inboundSubscriptions.size === 0) return 'waiting';

    const inboundConnected = Array.from(this.inboundSubscriptions.values()).every(
      (subscription) => this.connectedLinks.has(linkKey(subscription.playerAddress, RTC_LINK.INBOUND)),
    );
    const outboundConnected = this.outboundSubscriptions.size > 0
      && Array.from(this.outboundSubscriptions.values()).every(
        (subscription) => this.connectedLinks.has(linkKey(subscription.playerAddress, RTC_LINK.OUTBOUND)),
      );

    if (inboundConnected && outboundConnected) return 'connected';
    return 'connecting';
  }

  emitState() {
    const snapshot = this.getSnapshot();
    const snapshotKey = [
      snapshot.status,
      snapshot.connectedPeerCount,
      snapshot.expectedPeerCount,
      snapshot.inboundState,
      snapshot.outboundState,
      snapshot.connectedPeerAddresses.join('|'),
      JSON.stringify(snapshot.peerStates),
      snapshot.mediaSnapshotVersion,
    ].join('::');

    if (snapshotKey === this.snapshotKey) return;
    this.snapshotKey = snapshotKey;
    this.onStateChange?.(snapshot);
  }

  logActivity(text, details = undefined) {
    if (details === undefined) {
      console.log(`[RTC debug] ${text}`);
    } else {
      console.log(`[RTC debug] ${text}`, details);
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

  getSubscription(peerPlayerAddress, direction) {
    const subscriptions = direction === RTC_LINK.OUTBOUND
      ? this.outboundSubscriptions
      : this.inboundSubscriptions;
    return subscriptions.get(normalizeAddress(peerPlayerAddress));
  }

  createSubscription(peerPlayerAddress, peerAnnouncePubKey, direction, callback) {
    const peerKey = normalizeAddress(peerPlayerAddress);
    const subscription = {
      playerAddress: peerPlayerAddress,
      publicAnnounceKey: peerAnnouncePubKey,
      direction,
      webRtcChannel: null,
      state: SUBSCRIPTION_STATE.CREATED,
      callback,
      peerConnection: null,
      mediaSenders: new Map(),
    };
    if (direction === RTC_LINK.OUTBOUND) {
      this.outboundSubscriptions.set(peerKey, subscription);
    } else {
      this.inboundSubscriptions.set(peerKey, subscription);
    }
    return subscription;
  }

  bumpMediaSnapshot() {
    this.mediaSnapshotVersion += 1;
    this.snapshotKey = '';
    this.emitState();
  }

  setLocalMediaStream(stream) {
    if (this.localMediaStream === stream) return;
    this.localMediaStream = stream;
    this.syncAllLocalMediaTracks({ renegotiate: true });
  }

  getLocalMediaTracks() {
    return this.localMediaStream?.getTracks?.().filter((track) => (
      track.readyState !== 'ended'
    )) ?? [];
  }

  syncAllLocalMediaTracks({ renegotiate = false } = {}) {
    this.inboundSubscriptions.forEach((subscription) => {
      this.clearSubscriptionMedia(subscription);
    });
    this.outboundSubscriptions.forEach((subscription) => {
      const changed = this.syncSubscriptionMedia(subscription);
      if (changed && renegotiate) {
        void this.renegotiate(subscription.playerAddress, subscription.direction);
      }
    });
  }

  clearSubscriptionMedia(subscription) {
    const pc = subscription?.peerConnection;
    if (!pc || !subscription?.mediaSenders) return;

    subscription.mediaSenders.forEach((sender) => {
      if (pc.getSenders().includes(sender)) {
        pc.removeTrack(sender);
      }
    });
    subscription.mediaSenders.clear();
  }

  syncSubscriptionMedia(subscription) {
    const pc = subscription?.peerConnection;
    if (!pc || pc.signalingState === 'closed') return false;

    if (!subscription.mediaSenders) {
      subscription.mediaSenders = new Map();
    }

    let changed = false;
    const tracks = this.getLocalMediaTracks();
    const trackIds = new Set(tracks.map((track) => track.id));

    subscription.mediaSenders.forEach((sender, trackId) => {
      if (trackIds.has(trackId)) return;
      if (pc.getSenders().includes(sender)) {
        pc.removeTrack(sender);
        this.logActivity(`local media track removed ${subscription.direction} ${formatPeer(subscription.playerAddress)} ${sender.track?.kind ?? 'unknown'}`);
      }
      subscription.mediaSenders.delete(trackId);
      changed = true;
    });

    tracks.forEach((track) => {
      if (subscription.mediaSenders.has(track.id)) return;
      const sender = pc.addTrack(track, this.localMediaStream);
      subscription.mediaSenders.set(track.id, sender);
      this.logActivity(`local media track added ${subscription.direction} ${formatPeer(subscription.playerAddress)} ${track.kind}`);
      changed = true;
    });

    return changed;
  }

  sendControlMessage(peerAddress, direction, payload) {
    const subscription = this.getSubscription(peerAddress, direction);
    const channel = subscription?.webRtcChannel;
    if (channel?.readyState !== 'open') {
      this.logActivity(`control message skipped ${formatPeer(peerAddress)} ${direction}: channel ${channel?.readyState ?? 'missing'}`);
      return false;
    }

    channel.send(JSON.stringify({
      type: RTC_CONTROL_MESSAGE,
      payload,
    }));
    this.logActivity(`control message sent ${formatPeer(peerAddress)} ${direction}`);
    return true;
  }

  emitMediaDataChannelRequired(peerAddress) {
    this.emitActivity(`Media needs open data channel ${formatPeer(peerAddress)}`, {
      kind: 'media-data-channel-required',
      peerAddress,
    });
  }

  async renegotiate(peerAddress, direction) {
    const subscription = this.getSubscription(peerAddress, direction);
    const pc = subscription?.peerConnection;
    if (!pc || pc.signalingState !== 'stable' || isDeadPeerConnection(pc)) return;

    try {
      if (subscription.webRtcChannel?.readyState !== 'open') {
        this.emitMediaDataChannelRequired(peerAddress);
        return;
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);
      const signal = {
        type: 'offer',
        direction,
        sdp: pc.localDescription.sdp,
      };

      if (!this.sendControlMessage(peerAddress, direction, { signal })) {
        this.emitMediaDataChannelRequired(peerAddress);
        return;
      }
      this.logActivity(`media offer sent over data channel ${formatPeer(peerAddress)}`);
    } catch (error) {
      this.logActivity(`renegotiation failed ${formatPeer(peerAddress)}: ${error.message}`);
      console.error('Failed to renegotiate RTC media:', error);
    }
  }

  setSubscriptionState(peerPlayerAddress, direction, state, webRtcChannel = undefined) {
    const peerKey = normalizeAddress(peerPlayerAddress);
    const subscription = direction === RTC_LINK.OUTBOUND
      ? this.outboundSubscriptions.get(peerKey)
      : this.inboundSubscriptions.get(peerKey);
    if (!subscription) return;

    if (
      direction === RTC_LINK.INBOUND
      && [
        SUBSCRIPTION_STATE.ACCEPT_RECEIVED,
        SUBSCRIPTION_STATE.CONNECTED,
        SUBSCRIPTION_STATE.DISCONNECTED,
      ].includes(state)
    ) {
      this.clearOfferTimeout(peerPlayerAddress);
      this.clearOfferRetry(peerPlayerAddress);
    }

    subscription.state = state;
    if (webRtcChannel !== undefined) {
      subscription.webRtcChannel = webRtcChannel;
    }
    subscription.callback?.(this.getPlayerSeatNo(subscription.playerAddress), {
      kind: 'network',
      state,
      playerAddress: subscription.playerAddress,
    });
    this.emitState();
  }

  clearOfferTimeout(peerPlayerAddress) {
    const peerKey = normalizeAddress(peerPlayerAddress);
    const offerTimeout = this.offerTimeouts.get(peerKey);
    if (!offerTimeout) return;

    clearTimeout(offerTimeout.timeout);
    this.offerTimeouts.delete(peerKey);
  }

  clearOfferRetry(peerPlayerAddress) {
    const peerKey = normalizeAddress(peerPlayerAddress);
    const retryTimer = this.offerRetryTimers.get(peerKey);
    if (!retryTimer) return;

    clearTimeout(retryTimer);
    this.offerRetryTimers.delete(peerKey);
  }

  scheduleOfferRetry(peerPlayerAddress) {
    const peerKey = normalizeAddress(peerPlayerAddress);
    if (!peerKey || this.offerRetryTimers.has(peerKey)) return;

    const retryTimer = setTimeout(() => {
      this.offerRetryTimers.delete(peerKey);

      const subscription = this.getSubscription(peerPlayerAddress, RTC_LINK.INBOUND);
      const isConnected = this.connectedLinks.has(linkKey(peerPlayerAddress, RTC_LINK.INBOUND));
      const publicAnnounceKey = subscription?.publicAnnounceKey ?? this.getPlayerPublicKey(peerPlayerAddress);
      if (!subscription || isConnected || !publicAnnounceKey) return;

      this.resetPeerLink(peerPlayerAddress, RTC_LINK.INBOUND, 'offer retry');
      void this.sendOffer({
        playerAddress: peerPlayerAddress,
        annoncePublicKey: publicAnnounceKey,
      }, { immediate: true });
    }, OFFER_RETRY_DELAY_MS);

    this.offerRetryTimers.set(peerKey, retryTimer);
  }

  startOfferTimeout(peerPlayerAddress) {
    const peerKey = normalizeAddress(peerPlayerAddress);
    if (!peerKey) return;

    this.clearOfferTimeout(peerPlayerAddress);
    const deadline = Date.now() + OFFER_ACCEPT_TIMEOUT_MS;
    const timeout = setTimeout(() => {
      const offerTimeout = this.offerTimeouts.get(peerKey);
      if (!offerTimeout || offerTimeout.deadline !== deadline || Date.now() < deadline) {
        return;
      }

      const subscription = this.getSubscription(peerPlayerAddress, RTC_LINK.INBOUND);
      const isConnected = this.connectedLinks.has(linkKey(peerPlayerAddress, RTC_LINK.INBOUND));
      if (!subscription || isConnected || subscription.state !== SUBSCRIPTION_STATE.OFFER_SENT) {
        return;
      }

      this.offerTimeouts.delete(peerKey);
      this.emitActivity(`${formatSeat(peerPlayerAddress)} !! Offer Timeout ${formatKey(this.getPlayerPublicKey(peerPlayerAddress))}`);
      this.setSubscriptionState(peerPlayerAddress, RTC_LINK.INBOUND, SUBSCRIPTION_STATE.OFFER_TIMEOUT);
      this.scheduleOfferRetry(peerPlayerAddress);
    }, OFFER_ACCEPT_TIMEOUT_MS);
    this.offerTimeouts.set(peerKey, { deadline, timeout });
  }

  getPlayerPublicKey(peerPlayerAddress) {
    const peerKey = normalizeAddress(peerPlayerAddress);
    return this.config.players.find(
      (player) => normalizeAddress(player.playerAddress) === peerKey,
    )?.annoncePublicKey;
  }

  cachePublishedMessage(message) {
    const key = transportMessageKey(message);
    this.publishedMessages.set(key, stripTransportFields(message));
    if (this.publishedMessages.size <= MAX_PUBLISHED_MESSAGE_CACHE) return;

    const [oldestKey] = this.publishedMessages.keys();
    this.publishedMessages.delete(oldestKey);
  }

  armBadSignatureOnce() {
    this.badSignatureOnce = true;
  }

  armDropNextMessage() {
    this.dropNextMessage = true;
  }

  armDuplicateNextMessage() {
    this.duplicateNextMessage = true;
  }

  consumeBadSignatureOnce() {
    if (!this.badSignatureOnce) return false;
    this.badSignatureOnce = false;
    return true;
  }

  async signTransportMessage(message, { injectBadSignature = false } = {}) {
    const { playerAddress, privateKey, publicKey } = this.config;
    if (!playerAddress || !privateKey || !publicKey) {
      throw new Error('Cannot sign RTC message without table BLS keys.');
    }

    const unsignedMessage = stripTransportFields(message);
    const payload = transportSignaturePayload(unsignedMessage, playerAddress);
    const signaturePayload = injectBadSignature ? badSignaturePayload(payload) : payload;
    const signature = await bls.sign(signaturePayload, hexToBytes(ensureHexPrefix(privateKey)));

    return {
      ...unsignedMessage,
      rtcSignature: {
        scheme: TRANSPORT_SIGNATURE_SCHEME,
        signer: playerAddress,
        publicKey: ensureHexPrefix(publicKey),
        signature: toHex(signature),
      },
    };
  }

  async verifyTransportMessage(message, fallbackSenderAddress) {
    const signature = message?.rtcSignature;
    const signer = signature?.signer ?? fallbackSenderAddress;
    const signerPublicKey = this.getPlayerPublicKey(signer);

    if (!signature?.signature || !signer || !signerPublicKey) {
      return { ok: false, signer, reason: 'missing signature or announce public key' };
    }

    if (signature.scheme !== TRANSPORT_SIGNATURE_SCHEME) {
      return { ok: false, signer, reason: 'unsupported signature scheme' };
    }

    const payload = transportSignaturePayload(message, signer);
    try {
      const ok = await bls.verify(
        hexToBytes(ensureHexPrefix(signature.signature)),
        payload,
        hexToBytes(ensureHexPrefix(signerPublicKey)),
      );
      return { ok, signer, reason: ok ? undefined : 'signature mismatch' };
    } catch (error) {
      return { ok: false, signer, reason: error.message };
    }
  }

  sendTransportMessage(message) {
    if (this.dropNextMessage) {
      this.dropNextMessage = false;
      this.logActivity(`dropped message type=${message?.type ?? 'unknown'}`);
      return 0;
    }

    const payload = JSON.stringify(message);
    let sentCount = 0;
    const sendCount = this.duplicateNextMessage ? 2 : 1;
    this.duplicateNextMessage = false;

    this.outboundSubscriptions.forEach((subscription) => {
      if (subscription.webRtcChannel?.readyState === 'open') {
        for (let sendIndex = 0; sendIndex < sendCount; sendIndex += 1) {
          subscription.webRtcChannel.send(payload);
          sentCount += 1;
        }
      }
    });
    this.logActivity(`broadcast message type=${message?.type ?? 'unknown'} open_channels=${sentCount}`);
    return sentCount;
  }

  async publishSignedMessage(message) {
    const outgoingMessage = await this.signTransportMessage(message, {
      injectBadSignature: this.consumeBadSignatureOnce(),
    });
    this.cachePublishedMessage(outgoingMessage);
    this.sendTransportMessage(outgoingMessage);
  }

  async republishDisagreedMessage(message) {
    const cachedMessage = this.publishedMessages.get(transportMessageKey(message));
    const unsignedMessage = cachedMessage ?? stripTransportFields(message);
    const signedMessage = await this.signTransportMessage(unsignedMessage);
    this.cachePublishedMessage(signedMessage);
    this.sendTransportMessage(signedMessage);
  }

  forwardDisagreement(message) {
    this.sendTransportMessage(message);
  }

  async rejectTransportMessage(message, fallbackSenderAddress, reason) {
    const signer = message?.rtcSignature?.signer ?? fallbackSenderAddress;
    const rejectedMessage = {
      ...message,
      rtcDisagreement: {
        type: 'Disagreement',
        reason: 'SignatureMismatch',
        detail: reason,
        signer,
        rejectedBy: this.config.playerAddress,
      },
    };
    this.emitActivity(
      `[${formatSeat(this.config.playerAddress)}] Invalid Signature from [${formatSeat(signer)}]`,
    );
    this.forwardDisagreement(rejectedMessage);
  }

  async handleIncomingDataMessage(peerAddress, direction, rawData) {
    try {
      const message = JSON.parse(rawData);
      console.log('[RTC debug] received message', {
        peer: formatPeer(peerAddress),
        direction,
        type: message?.type ?? 'unknown',
        message,
      });

      if (message?.type === RTC_POOL_SIGNAL) {
        await this.sessionPool.handleMessage(this, peerAddress, message);
        return;
      }

      if (message?.type === RTC_CONTROL_MESSAGE) {
        await this.handleRtcControlMessage(peerAddress, direction, message.payload);
        return;
      }

      if (direction !== RTC_LINK.INBOUND) return;

      if (message?.rtcDisagreement) {
        const signer = message.rtcDisagreement.signer ?? message?.rtcSignature?.signer;
        const disagreementKey = disagreementMessageKey(message);
        if (this.seenDisagreements.has(disagreementKey)) return;
        this.seenDisagreements.add(disagreementKey);

        const rejectedBy = message.rtcDisagreement.rejectedBy;
        if (normalizeAddress(rejectedBy) === normalizeAddress(this.config.playerAddress)) {
          return;
        }

        this.emitActivity(
          `[${formatSeat(this.config.playerAddress)}] Seen Invalid Signature from [${formatSeat(signer)}]`,
        );
        if (normalizeAddress(signer) === normalizeAddress(this.config.playerAddress)) {
          await this.republishDisagreedMessage(message);
          return;
        }
        this.forwardDisagreement(message);
        return;
      }

      const verification = await this.verifyTransportMessage(message, peerAddress);
      if (!verification.ok) {
        await this.rejectTransportMessage(message, peerAddress, verification.reason);
        return;
      }

      const subscription = this.getSubscription(peerAddress, RTC_LINK.INBOUND);
      subscription?.callback?.(this.getPlayerSeatNo(subscription.playerAddress), {
        kind: 'message',
        message,
        playerAddress: subscription.playerAddress,
      });
    } catch (error) {
      this.logActivity(`data message parse failed ${formatPeer(peerAddress)}: ${error.message}`);
      console.error('Failed to parse RTC message:', error);
    }
  }

  async handleRtcControlMessage(peerAddress, direction, payload) {
    if (payload?.type === 'peer-disconnect') {
      this.resetPeerLink(peerAddress, direction, 'peer closed table');
      return;
    }

    const signal = payload?.signal;
    if (!signal) return;

    await this.handleIncomingSignal(peerAddress, signal, {
      viaDataChannel: true,
      receivedDirection: direction,
    });
  }

  sendDisconnectNotice(subscription) {
    const channel = subscription?.webRtcChannel;
    if (channel?.readyState !== 'open') return;

    try {
      channel.send(JSON.stringify({
        type: RTC_CONTROL_MESSAGE,
        payload: { type: 'peer-disconnect' },
      }));
    } catch {
      // Best effort before the local tab closes.
    }
  }

  getPlayerSeatNo(peerPlayerAddress) {
    const peerKey = normalizeAddress(peerPlayerAddress);
    return this.config.players.find(
      (player) => normalizeAddress(player.playerAddress) === peerKey,
    )?.seatNo ?? null;
  }

  logEntry() {
    const { playerAddress, publicKey, tableId } = this.config;
    if (!publicKey || !playerAddress || !tableId) return;
    const key = `enter:${tableId}:${normalizeAddress(playerAddress)}:${publicKey}`;
    if (this.joinLog.has(key)) return;
    this.joinLog.add(key);
  }

  logJoins() {
    const { playerAddress, tableId } = this.config;
    this.config.players.forEach((player) => {
      if (!player?.playerAddress || !player?.annoncePublicKey) return;

      const isMe = normalizeAddress(player.playerAddress) === normalizeAddress(playerAddress);
      const key = `join:${tableId}:${normalizeAddress(player.playerAddress)}:${player.annoncePublicKey}`;
      if (this.joinLog.has(key)) return;
      this.joinLog.add(key);

      if (isMe) {
        this.emitActivity(`[Me] :: Join ${formatKey(player.annoncePublicKey)}`);
      } else {
        this.emitActivity(`${formatSeat(player.playerAddress)} :: Join ${formatKey(player.annoncePublicKey)}`);
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
    const isReady = this.getStatus() === 'connected';
    if (isReady && !this.ready) {
      this.emitActivity('[Me]: Ready');
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
    if (direction === RTC_LINK.INBOUND) {
      this.clearOfferTimeout(peerAddress);
    }
    this.emitActivity(`${formatSeat(peerAddress)} ${direction === RTC_LINK.OUTBOUND ? '<=' : '=>'} Connected ${formatKey(this.getPlayerPublicKey(peerAddress))}`);
    this.updateConnectedPeers();
  }

  isInboundConnected(peerAddress) {
    return this.connectedLinks.has(linkKey(peerAddress, RTC_LINK.INBOUND));
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
      peerConnection.ontrack = null;
      peerConnection.close();
    }

    if (subscription) {
      subscription.webRtcChannel = null;
      subscription.peerConnection = null;
      subscription.mediaSenders = new Map();
    }
    this.remoteMediaStreams.delete(key);
    this.bumpMediaSnapshot();
    this.clearOfferTimeout(peerAddress);
    this.connectedLinks.delete(key);
    const connectedPeers = this.updateConnectedPeers();

    if (wasLinkConnected) {
      this.emitActivity(`${formatSeat(peerAddress)} ${direction === RTC_LINK.OUTBOUND ? '!<' : '!>'} Disconnected ${formatKey(this.getPlayerPublicKey(peerAddress))}`);
    }

    this.setSubscriptionState(peerAddress, direction, SUBSCRIPTION_STATE.DISCONNECTED, null);

    if (wasFullyConnected && !connectedPeers.has(peerKey)) {
      this.emitActivity(`${formatSeat(peerAddress)} !! Disconnected ${formatKey(this.getPlayerPublicKey(peerAddress))}`);
    }

    setTimeout(() => {
      this.resetLinks.delete(key);
    }, 0);
  }

  setupDataChannel(peerAddress, direction, dataChannel) {
    this.logActivity(`${direction} channel attached ${formatPeer(peerAddress)} (${dataChannel.label})`);

    dataChannel.onopen = () => {
      this.logActivity(`${direction} channel open ${formatPeer(peerAddress)} (${dataChannel.label})`);
      this.setSubscriptionState(peerAddress, direction, SUBSCRIPTION_STATE.CONNECTED, dataChannel);
      this.sessionPool.registerLink({
        session: this,
        peerAddress,
        direction,
        channel: dataChannel,
      });
      this.markLinkConnected(peerAddress, direction);
    };

    dataChannel.onclose = () => {
      this.logActivity(`${direction} channel closed ${formatPeer(peerAddress)} (${dataChannel.label})`);
      this.sessionPool.unregisterLink({
        session: this,
        peerAddress,
        direction,
      });
      this.resetPeerLink(peerAddress, direction, 'data channel closed');
    };

    dataChannel.onmessage = (event) => {
      this.logActivity(`${direction} channel message ${formatPeer(peerAddress)} (${dataChannel.label})`);
      void this.handleIncomingDataMessage(peerAddress, direction, event.data);
    };
  }

  createPeerConnection(peerAddress, direction, createChannel) {
    const subscription = this.getSubscription(peerAddress, direction);
    const existing = subscription?.peerConnection;
    if (existing && !isDeadPeerConnection(existing)) {
      this.logActivity(`reuse peer connection ${formatPeer(peerAddress)} ${direction} ${existing.connectionState}`);
      return existing;
    }
    if (existing) {
      this.resetPeerLink(peerAddress, direction, `stale peer connection ${existing.connectionState}`);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.logActivity(`peer connection created ${formatPeer(peerAddress)} ${direction} create_channel=${createChannel}`);
    pc.ontrack = (event) => {
      this.logActivity(`remote track received ${formatPeer(peerAddress)} ${direction} kind=${event.track?.kind ?? 'unknown'}`);
      const key = linkKey(peerAddress, direction);
      const stream = this.remoteMediaStreams.get(key) ?? new MediaStream();
      const incomingTracks = event.streams.flatMap((eventStream) => eventStream.getTracks());
      if (event.track) {
        incomingTracks.push(event.track);
      }

      incomingTracks.forEach((track) => {
        if (stream.getTracks().some((existingTrack) => existingTrack.id === track.id)) return;
        stream.addTrack(track);
        track.addEventListener('ended', () => {
          stream.removeTrack(track);
          this.bumpMediaSnapshot();
        }, { once: true });
      });

      this.remoteMediaStreams.set(key, stream);
      this.bumpMediaSnapshot();
    };
    pc.onconnectionstatechange = () => {
      this.logActivity(`peer connection state ${formatPeer(peerAddress)} ${direction} ${pc.connectionState}`);
      if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) {
        this.resetPeerLink(peerAddress, direction, `peer connection ${pc.connectionState}`);
      }
    };
    pc.oniceconnectionstatechange = () => {
      this.logActivity(`ice connection state ${formatPeer(peerAddress)} ${direction} ${pc.iceConnectionState}`);
      if (['closed', 'failed', 'disconnected'].includes(pc.iceConnectionState)) {
        this.resetPeerLink(peerAddress, direction, `ice connection ${pc.iceConnectionState}`);
      }
    };
    pc.ondatachannel = (event) => {
      this.logActivity(`data channel received ${formatPeer(peerAddress)} ${direction} (${event.channel.label})`);
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
      this.syncSubscriptionMedia(subscription);
    }
    return pc;
  }

  async encryptSignalForPeer(recipientPubKey, signal) {
    const { playerAddress, publicKey } = this.config;
    const encryptionPublicKey = normalizePublicKey(recipientPubKey);
    if (!publicKey || !encryptionPublicKey) return undefined;

    const payload = JSON.stringify({
      ...signal,
      app: 'private-poker',
      version: 1,
      senderPlayerAddress: playerAddress,
      senderPubKey: publicKey,
    });
    const encryptedPayload = await encryptForPeer(encryptionPublicKey, payload);
    return {
      encryptedData: toHex(new TextEncoder().encode(JSON.stringify(encryptedPayload))),
      encryptionPublicKey,
    };
  }

  async sendEncryptedSignal(recipientAddress, recipientPubKey, signal) {
    const { playerAddress, operatorPrivateKey, lobbyId, tableId } = this.config;
    const encryptedSignal = await this.encryptSignalForPeer(recipientPubKey, signal);
    if (!encryptedSignal) return;

    await this.sendSignal(lobbyId, tableId, recipientAddress, encryptedSignal.encryptedData, {
      playerAddress,
      operatorPrivateKey,
    });
    this.emitActivity(`${formatSeat(recipientAddress)} << ${signal.type === 'accept' ? 'Accept' : 'Offer'} ${formatKey(encryptedSignal.encryptionPublicKey)}`);
  }

  async sendPooledEncryptedSignal(recipientAddress, recipientPubKey, signal) {
    const { playerAddress, lobbyId, tableId } = this.config;
    const encryptedSignal = await this.encryptSignalForPeer(recipientPubKey, signal);
    if (!encryptedSignal) return false;

    const sendPooledSignal = this.sendPooledSignal ?? ((payload) => (
      this.sessionPool.sendEncryptedSignal(payload)
    ));
    const route = await sendPooledSignal({
      originAddress: playerAddress,
      targetAddress: recipientAddress,
      lobbyId,
      tableId,
      encryptedData: encryptedSignal.encryptedData,
    });
    const sent = route === true || route?.found === true;
    const waitingForTable = route?.reason === 'peer_table_not_open';

    if (sent) {
      this.logActivity(`pooled ${signal.type} routed ${formatPeer(recipientAddress)}`);
      this.emitActivity(`${formatSeat(recipientAddress)} <~ ${signal.type === 'accept' ? 'Accept' : 'Offer'} ${formatKey(encryptedSignal.encryptionPublicKey)}`);
    } else if (waitingForTable) {
      this.logActivity(`pooled ${signal.type} waiting for table ${formatPeer(recipientAddress)}`);
      this.emitActivity(`${formatSeat(recipientAddress)} :: Reachable, waiting for table`);
      return 'waiting_for_table';
    } else {
      this.logActivity(`pooled ${signal.type} unavailable ${formatPeer(recipientAddress)}`);
    }
    return sent;
  }

  async sendOffer(peer, { immediate = false } = {}) {
    const { playerAddress, operatorPrivateKey, publicKey, tableId, lobbyId } = this.config;
    if (!playerAddress || !operatorPrivateKey || !publicKey || !tableId || !lobbyId || !peer?.playerAddress || !peer?.annoncePublicKey) return;

    try {
      this.hasConnectionError = false;
      if (!immediate) {
        await wait(randomOfferDelay());
      }
      const pc = this.createPeerConnection(peer.playerAddress, RTC_LINK.INBOUND, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);
      const signal = {
        type: 'offer',
        direction: RTC_LINK.INBOUND,
        sdp: pc.localDescription.sdp,
      };
      const sentViaPool = await this.sendPooledEncryptedSignal(
        peer.playerAddress,
        peer.annoncePublicKey,
        signal,
      );
      if (sentViaPool === 'waiting_for_table') {
        this.setSubscriptionState(peer.playerAddress, RTC_LINK.INBOUND, SUBSCRIPTION_STATE.CREATED);
        return;
      }
      if (!sentViaPool) {
        this.logActivity(`Private Mesh fallback for offer ${formatPeer(peer.playerAddress)}`);
        await this.sendEncryptedSignal(peer.playerAddress, peer.annoncePublicKey, signal);
      }
      this.setSubscriptionState(peer.playerAddress, RTC_LINK.INBOUND, SUBSCRIPTION_STATE.OFFER_SENT);
      this.startOfferTimeout(peer.playerAddress);
      this.emitState();
    } catch (error) {
      this.hasConnectionError = true;
      this.emitState();
      this.logActivity(`offer failed ${formatPeer(peer.playerAddress)}: ${error.message}`);
      console.error('Failed to send RTC offer:', error);
    }
  }

  async subscribeTo(peerPlayerAddress, peerAnnouncePubKey, callback, { immediateOffer = false } = {}) {
    const peerKey = normalizeAddress(peerPlayerAddress);
    if (!peerKey) return;
    this.resetPeerLink(peerPlayerAddress, RTC_LINK.INBOUND, 'new subscribeTo call');
    this.inboundSubscriptions.delete(peerKey);
    this.createSubscription(peerPlayerAddress, peerAnnouncePubKey, RTC_LINK.INBOUND, callback);
    callback?.(this.getPlayerSeatNo(peerPlayerAddress), {
      kind: 'network',
      state: SUBSCRIPTION_STATE.CREATED,
      playerAddress: peerPlayerAddress,
    });
    this.emitState();
    await this.sendOffer({
      playerAddress: peerPlayerAddress,
      annoncePublicKey: peerAnnouncePubKey,
    }, { immediate: immediateOffer });
  }

  async sendAccept(peerAddress, peerPubKey, offerSdp, direction = RTC_LINK.OUTBOUND, { viaDataChannel = false, viaPool = false } = {}) {
    const peerKey = normalizeAddress(peerAddress);
    const existing = this.getSubscription(peerAddress, direction);
    const publicAnnounceKey = peerPubKey ?? existing?.publicAnnounceKey ?? this.getPlayerPublicKey(peerAddress);
    if (!existing || isDeadPeerConnection(existing.peerConnection)) {
      this.resetPeerLink(peerAddress, direction, 'incoming offer');
      if (direction === RTC_LINK.OUTBOUND) {
        this.outboundSubscriptions.delete(peerKey);
      } else {
        this.inboundSubscriptions.delete(peerKey);
      }
      this.createSubscription(peerAddress, publicAnnounceKey, direction);
    } else if (publicAnnounceKey) {
      existing.publicAnnounceKey = publicAnnounceKey;
    }

    const pc = this.createPeerConnection(peerAddress, direction, false);
    await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    const accept = await pc.createAnswer();
    await pc.setLocalDescription(accept);
    await waitForIceGatheringComplete(pc);
    const signal = {
      type: 'accept',
      direction,
      sdp: pc.localDescription.sdp,
    };

    if (viaDataChannel) {
      if (!this.sendControlMessage(peerAddress, direction, { signal })) {
        this.emitMediaDataChannelRequired(peerAddress);
        return;
      }
      this.logActivity(`media accept sent over data channel ${formatPeer(peerAddress)}`);
    } else if (viaPool) {
      const sentViaPool = await this.sendPooledEncryptedSignal(peerAddress, publicAnnounceKey, signal);
      if (!sentViaPool) {
        this.logActivity(`Private Mesh fallback for accept ${formatPeer(peerAddress)}`);
        await this.sendEncryptedSignal(peerAddress, publicAnnounceKey, signal);
      }
    } else {
      await this.sendEncryptedSignal(peerAddress, publicAnnounceKey, signal);
    }

    this.setSubscriptionState(peerAddress, direction, SUBSCRIPTION_STATE.ACCEPT_SENT);
  }

  async handleIncomingSignal(senderAddress, signal, { viaDataChannel = false, viaPool = false, receivedDirection = null } = {}) {
    const peerPubKey = signal.senderPubKey;

    if (signal.type === 'offer') {
      if (!viaDataChannel && !peerPubKey) throw new Error('Incoming offer did not include senderPubKey.');

      this.emitActivity(`${formatSeat(senderAddress)} ${viaPool ? '~>' : '>>'} Offer ${formatKey(peerPubKey)}`);
      await this.sendAccept(
        senderAddress,
        peerPubKey,
        signal.sdp,
        viaDataChannel ? receivedDirection : oppositeLink(signal.direction ?? RTC_LINK.INBOUND),
        { viaDataChannel, viaPool },
      );
      const inbound = this.getSubscription(senderAddress, RTC_LINK.INBOUND);
      const inboundConnected = this.connectedLinks.has(linkKey(senderAddress, RTC_LINK.INBOUND));
      if (
        !viaDataChannel
        && inbound
        && !inboundConnected
        && inbound.state !== SUBSCRIPTION_STATE.OFFER_SENT
      ) {
        this.logActivity(`retry inbound offer now that table is open ${formatPeer(senderAddress)}`);
        await this.sendOffer({
          playerAddress: senderAddress,
          annoncePublicKey: peerPubKey,
        }, { immediate: true });
      }
      return;
    }

    if (signal.type === 'accept' || signal.type === 'answer') {
      this.emitActivity(`${formatSeat(senderAddress)} ${viaPool ? '~>' : '>>'} Accept ${formatKey(peerPubKey)}`);
      const direction = viaDataChannel ? receivedDirection : oppositeLink(signal.direction ?? RTC_LINK.OUTBOUND);
      const pc = this.getSubscription(senderAddress, direction)?.peerConnection;
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        this.setSubscriptionState(senderAddress, direction, SUBSCRIPTION_STATE.ACCEPT_RECEIVED);
      }
    }
  }

  async handleSignal(signalData) {
    const { playerAddress, operator, privateKey, tableId, lobbyId } = this.config;
    if (!tableId || !lobbyId) return;
    if (signalData.tableId !== tableId.toString() || signalData.lobbyId !== lobbyId.toString()) return;
    if (normalizeAddress(signalData.sender) === normalizeAddress(playerAddress)) return;
    if (normalizeAddress(signalData.sender) === normalizeAddress(operator)) return;
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
      await this.handleIncomingSignal(signal.senderPlayerAddress ?? signalData.sender, signal);
    } catch (error) {
      this.logActivity(`signal ignored: ${error.message}`);
      console.log('Ignored undecryptable RTC signal:', error);
    }
  }

  async handleRelayEncryptedSignal(envelope) {
    return this.enqueueControlAction(
      'RTC pooled signal',
      () => this.handleRelayEncryptedSignalNow(envelope),
      { dependsOn: this.blsActionKey ? [this.blsActionKey] : [] },
    );
  }

  async handleRelayEncryptedSignalNow(envelope) {
    const { privateKey } = this.config;
    if (!envelope?.encryptedData) return;
    if (!privateKey) {
      if (!this.pendingRelayEnvelopes.some((pending) => pending.id === envelope.id)) {
        this.pendingRelayEnvelopes.push(envelope);
        if (this.pendingRelayEnvelopes.length > MAX_PROCESSED_SIGNALS) {
          this.pendingRelayEnvelopes.shift();
        }
      }
      this.logActivity(`pooled signal queued until key ready ${formatPeer(envelope.originAddress)}`);
      return;
    }

    try {
      const payloadString = new TextDecoder().decode(hexToBytes(envelope.encryptedData));
      const encryptedPayload = JSON.parse(payloadString);
      const decryptedString = await decryptFromPeer(privateKey, encryptedPayload);
      const signal = JSON.parse(decryptedString);
      await this.handleIncomingSignal(signal.senderPlayerAddress ?? envelope.originAddress, signal, {
        viaPool: true,
      });
    } catch (error) {
      this.logActivity(`pooled signal ignored: ${error.message}`);
      console.log('Ignored undecryptable pooled RTC signal:', error);
    }
  }

  async drainPendingRelayEnvelopes() {
    if (this.drainingRelayEnvelopes || !this.config.privateKey || this.pendingRelayEnvelopes.length === 0) {
      return;
    }

    this.drainingRelayEnvelopes = true;
    const pending = this.pendingRelayEnvelopes.splice(0);
    this.logActivity(`pooled signal drain ${pending.length}`);
    try {
      for (const envelope of pending) {
        await this.handleRelayEncryptedSignal(envelope);
      }
    } finally {
      this.drainingRelayEnvelopes = false;
    }
  }

  publishMessage(message) {
    this.publishQueue = this.publishQueue
      .then(() => this.publishSignedMessage(message))
      .catch((error) => {
        this.emitActivity(`[Me]: RTC message signing failed`);
        this.logActivity(`message signing failed: ${error.message}`);
        console.error('Failed to sign RTC message:', error);
      });
  }

  resetForTable() {
    this.sessionPool.unregisterSession(this);
    this.inboundSubscriptions.forEach((subscription) => {
      if (subscription.webRtcChannel) {
        this.sendDisconnectNotice(subscription);
        this.sessionPool.unregisterLink({
          session: this,
          peerAddress: subscription.playerAddress,
          direction: subscription.direction,
        });
        subscription.webRtcChannel.onopen = null;
        subscription.webRtcChannel.onclose = null;
        subscription.webRtcChannel.onmessage = null;
        subscription.webRtcChannel.close();
      }
      if (subscription.peerConnection) {
        subscription.peerConnection.onconnectionstatechange = null;
        subscription.peerConnection.oniceconnectionstatechange = null;
        subscription.peerConnection.ondatachannel = null;
        subscription.peerConnection.ontrack = null;
        subscription.peerConnection.close();
      }
    });
    this.outboundSubscriptions.forEach((subscription) => {
      if (subscription.webRtcChannel) {
        this.sendDisconnectNotice(subscription);
        this.sessionPool.unregisterLink({
          session: this,
          peerAddress: subscription.playerAddress,
          direction: subscription.direction,
        });
        subscription.webRtcChannel.onopen = null;
        subscription.webRtcChannel.onclose = null;
        subscription.webRtcChannel.onmessage = null;
        subscription.webRtcChannel.close();
      }
      if (subscription.peerConnection) {
        subscription.peerConnection.onconnectionstatechange = null;
        subscription.peerConnection.oniceconnectionstatechange = null;
        subscription.peerConnection.ondatachannel = null;
        subscription.peerConnection.ontrack = null;
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
    this.offerTimeouts.forEach((offerTimeout) => clearTimeout(offerTimeout.timeout));
    this.offerTimeouts.clear();
    this.offerRetryTimers.forEach((retryTimer) => clearTimeout(retryTimer));
    this.offerRetryTimers.clear();
    this.publishedMessages.clear();
    this.seenDisagreements.clear();
    this.localMediaStream = null;
    this.remoteMediaStreams.clear();
    this.mediaSnapshotVersion += 1;
    this.publishQueue = Promise.resolve();
    this.badSignatureOnce = false;
    this.dropNextMessage = false;
    this.duplicateNextMessage = false;
    this.ready = false;
    this.configKey = '';
    this.snapshotKey = '';
    this.emitState();
  }

  destroy() {
    this.resetForTable();
  }
}
