import { hexToBytes, toHex } from 'viem';
import { decryptFromPeer, encryptForPeer, normalizePeerPublicKey } from '@/lib/crypto';

const RTC_POOL_SIGNAL = 'RTC_POOL_SIGNAL';
const RTC_POOL_BROADCAST_CHANNEL = 'private-poker:rtc-session-pool';
const DEFAULT_TTL = 6;
const MAX_SEEN_MESSAGES = 500;
const DELIVERY_TIMEOUT_MS = 800;
const SILENT_DELIVERY_TIMEOUT_MS = 8000;
const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};
const ENDPOINT = {
  TABLE: 'table',
  LOBBY: 'lobby',
};

const normalizeAddress = (value) => value?.toLowerCase() ?? '';
const formatPeer = (value) => {
  const text = value ? String(value) : '';
  if (!text) return 'unknown';
  return text.length <= 12 ? text : `${text.slice(0, 6)}...${text.slice(-4)}`;
};

function logPool(message, details = undefined) {
  if (details === undefined) {
    console.log(`[RTC pool] ${message}`);
    return;
  }
  console.log(`[RTC pool] ${message}`, details);
}

function sessionKey({ playerAddress, lobbyId, tableId, endpoint = ENDPOINT.TABLE }) {
  return [
    endpoint,
    normalizeAddress(playerAddress),
    String(lobbyId ?? ''),
    String(tableId ?? ''),
  ].join(':');
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

class LobbySilentRtcEndpoint {
  constructor({ pool, localSession, peer }) {
    this.pool = pool;
    this.localSession = localSession;
    this.peer = peer;
    this.config = {
      playerAddress: localSession.playerAddress,
      lobbyId: localSession.lobbyId,
      tableId: localSession.tableId,
      publicKey: localSession.publicKey,
      privateKey: localSession.privateKey,
      players: [peer],
    };
    this.endpoint = ENDPOINT.LOBBY;
    this.peerConnection = null;
    this.dataChannel = null;
    this.started = false;
    logPool('silent endpoint created', {
      local: formatPeer(localSession.playerAddress),
      peer: formatPeer(peer.playerAddress),
      lobbyId: localSession.lobbyId,
      tableId: localSession.tableId,
    });
  }

  get id() {
    return [
      normalizeAddress(this.localSession.playerAddress),
      normalizeAddress(this.peer.playerAddress),
      this.localSession.lobbyId,
      this.localSession.tableId,
    ].join(':');
  }

  async encryptSignal(signal) {
    const encryptionPublicKey = normalizePeerPublicKey(this.peer.announcePublicKey);
    const payload = JSON.stringify({
      ...signal,
      app: 'private-poker',
      version: 1,
      endpoint: ENDPOINT.LOBBY,
      senderPlayerAddress: this.localSession.playerAddress,
      senderPubKey: this.localSession.publicKey,
    });
    const encryptedPayload = await encryptForPeer(encryptionPublicKey, payload);
    return toHex(new TextEncoder().encode(JSON.stringify(encryptedPayload)));
  }

  async sendSignal(signal) {
    logPool(`silent ${signal.type} signal send`, {
      from: formatPeer(this.localSession.playerAddress),
      to: formatPeer(this.peer.playerAddress),
      endpoint: ENDPOINT.LOBBY,
    });
    const encryptedData = await this.encryptSignal(signal);
    const delivered = await this.pool.sendEncryptedSignal({
      originAddress: this.localSession.playerAddress,
      originEndpoint: ENDPOINT.LOBBY,
      targetAddress: this.peer.playerAddress,
      targetEndpoint: ENDPOINT.LOBBY,
      lobbyId: this.localSession.lobbyId,
      tableId: this.localSession.tableId,
      encryptedData,
      deliveryTimeoutMs: SILENT_DELIVERY_TIMEOUT_MS,
    });
    logPool(`silent ${signal.type} signal ${delivered ? 'delivered' : 'not delivered'}`, {
      from: formatPeer(this.localSession.playerAddress),
      to: formatPeer(this.peer.playerAddress),
    });
    return delivered;
  }

  createPeerConnection({ createChannel }) {
    if (this.peerConnection && this.peerConnection.connectionState !== 'closed') {
      return this.peerConnection;
    }

    logPool('silent peer connection create', {
      local: formatPeer(this.localSession.playerAddress),
      peer: formatPeer(this.peer.playerAddress),
      createChannel,
    });
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.ondatachannel = (event) => {
      logPool('silent data channel received', {
        local: formatPeer(this.localSession.playerAddress),
        peer: formatPeer(this.peer.playerAddress),
      });
      this.attachDataChannel(event.channel);
    };
    pc.onconnectionstatechange = () => {
      logPool(`silent peer connection state ${pc.connectionState}`, {
        local: formatPeer(this.localSession.playerAddress),
        peer: formatPeer(this.peer.playerAddress),
      });
      if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) {
        this.pool.unregisterLink({
          session: this,
          peerAddress: this.peer.playerAddress,
          direction: ENDPOINT.LOBBY,
        });
      }
    };

    if (createChannel) {
      this.attachDataChannel(pc.createDataChannel('private-poker-lobby-pool'));
    }

    this.peerConnection = pc;
    return pc;
  }

  attachDataChannel(channel) {
    this.dataChannel = channel;
    channel.onopen = () => {
      logPool('silent data channel open', {
        local: formatPeer(this.localSession.playerAddress),
        peer: formatPeer(this.peer.playerAddress),
      });
      this.pool.registerLink({
        session: this,
        peerAddress: this.peer.playerAddress,
        direction: ENDPOINT.LOBBY,
        channel,
        silent: true,
      });
    };
    channel.onclose = () => {
      logPool('silent data channel closed', {
        local: formatPeer(this.localSession.playerAddress),
        peer: formatPeer(this.peer.playerAddress),
      });
      this.pool.unregisterLink({
        session: this,
        peerAddress: this.peer.playerAddress,
        direction: ENDPOINT.LOBBY,
      });
    };
    channel.onmessage = (event) => {
      logPool('silent data channel message received', {
        local: formatPeer(this.localSession.playerAddress),
        peer: formatPeer(this.peer.playerAddress),
      });
      void this.pool.handleSilentDataMessage(this, this.peer.playerAddress, event.data);
    };
  }

  async start() {
    if (this.started) {
      logPool('silent endpoint start skipped, already started', {
        local: formatPeer(this.localSession.playerAddress),
        peer: formatPeer(this.peer.playerAddress),
      });
      return;
    }
    this.started = true;
    logPool('silent endpoint start', {
      local: formatPeer(this.localSession.playerAddress),
      peer: formatPeer(this.peer.playerAddress),
    });

    const pc = this.createPeerConnection({ createChannel: true });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);
    const delivered = await this.sendSignal({
      type: 'offer',
      endpoint: ENDPOINT.LOBBY,
      poolEndpointId: this.id,
      sdp: pc.localDescription.sdp,
    });
    if (!delivered) {
      logPool('silent endpoint offer not delivered, start reset', {
        local: formatPeer(this.localSession.playerAddress),
        peer: formatPeer(this.peer.playerAddress),
      });
      this.started = false;
    }
  }

  async handleRelayEncryptedSignal(envelope) {
    const payloadString = new TextDecoder().decode(hexToBytes(envelope.encryptedData));
    const encryptedPayload = JSON.parse(payloadString);
    const decryptedString = await decryptFromPeer(this.localSession.privateKey, encryptedPayload);
    const signal = JSON.parse(decryptedString);
    logPool(`silent relay signal received ${signal.type}`, {
      from: formatPeer(envelope.originAddress),
      to: formatPeer(envelope.targetAddress),
    });

    if (signal.type === 'offer') {
      const pc = this.createPeerConnection({ createChannel: false });
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceGatheringComplete(pc);
      await this.sendSignal({
        type: 'accept',
        endpoint: ENDPOINT.LOBBY,
        poolEndpointId: signal.poolEndpointId,
        sdp: pc.localDescription.sdp,
      });
      logPool('silent offer accepted', {
        local: formatPeer(this.localSession.playerAddress),
        peer: formatPeer(this.peer.playerAddress),
      });
      return;
    }

    if (signal.type === 'accept' || signal.type === 'answer') {
      const pc = this.peerConnection;
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        logPool('silent answer applied', {
          local: formatPeer(this.localSession.playerAddress),
          peer: formatPeer(this.peer.playerAddress),
        });
      }
    }
  }
}

function makeMessageId(originAddress, targetAddress, lobbyId, tableId) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return [
    normalizeAddress(originAddress),
    normalizeAddress(targetAddress),
    lobbyId,
    tableId,
    random,
  ].join(':');
}

class RtcSessionPool {
  constructor() {
    this.tabId = makeMessageId('tab', 'pool', '0', '0');
    this.role = 'table';
    this.sessions = new Map();
    this.links = new Map();
    this.knownPeers = new Map();
    this.silentEndpoints = new Map();
    this.seenMessages = new Set();
    this.pendingDeliveries = new Map();
    this.broadcastChannel = null;
    this.worker = null;
    this.workerReady = false;
    this.connectBroadcastChannel();
    this.connectSharedWorker();
    logPool('pool initialized', {
      tabId: this.tabId,
      role: this.role,
      broadcast: Boolean(this.broadcastChannel),
      sharedWorker: Boolean(this.worker),
    });
  }

  setRole(role) {
    this.role = role;
    logPool(`role set ${role}`);
    this.postBroadcast({
      type: 'RTC_POOL_ROLE',
      role,
    });
  }

  connectBroadcastChannel() {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;

    try {
      this.broadcastChannel = new BroadcastChannel(RTC_POOL_BROADCAST_CHANNEL);
      this.broadcastChannel.onmessage = (event) => {
        void this.handleBroadcastMessage(event.data);
      };
      logPool('BroadcastChannel connected');
    } catch (error) {
      logPool('BroadcastChannel unavailable', error);
      this.broadcastChannel = null;
    }
  }

  postBroadcast(message) {
    if (!this.broadcastChannel) return false;
    logPool(`broadcast post ${message.type}`, {
      signalId: message.signal?.id ?? message.id ?? null,
      target: formatPeer(message.signal?.targetAddress),
    });
    this.broadcastChannel.postMessage({
      ...message,
      tabId: this.tabId,
    });
    return true;
  }

  connectSharedWorker() {
    if (typeof window === 'undefined' || typeof SharedWorker === 'undefined') return;

    try {
      this.worker = new SharedWorker('/rtc-session-pool-worker.js');
      this.worker.port.onmessage = (event) => {
        void this.handleWorkerMessage(event.data);
      };
      this.worker.port.start();
      logPool('SharedWorker connected');
    } catch (error) {
      logPool('SharedWorker unavailable', error);
      this.worker = null;
    }
  }

  postWorker(message) {
    if (!this.worker) return false;
    logPool(`worker post ${message.type}`, {
      signalId: message.signal?.id ?? message.id ?? null,
      target: formatPeer(message.signal?.targetAddress),
    });
    this.worker.port.postMessage(message);
    return true;
  }

  async handleWorkerMessage(message) {
    if (message?.type === 'READY') {
      this.workerReady = true;
      logPool('SharedWorker ready', { portId: message.portId });
      this.sessions.forEach((session) => this.postRegisterSession(session));
      return;
    }

    if (message?.type === RTC_POOL_SIGNAL) {
      const signal = message.signal;
      logPool('worker signal received', {
        signalId: signal?.id,
        from: formatPeer(signal?.originAddress),
        to: formatPeer(signal?.targetAddress),
        endpoint: signal?.targetEndpoint,
      });
      if (!this.remember(signal?.id)) {
        logPool('worker signal ignored, already seen', { signalId: signal?.id });
        return;
      }
      await this.deliverOrScatter(signal);
      return;
    }

    if (message?.type === 'RTC_POOL_SIGNAL_DELIVERED') {
      logPool('worker delivery ack received', { signalId: message.id });
      this.resolveDelivery(message.id);
    }

    if (message?.type === 'SCATTER_RTC_POOL_SIGNAL') {
      const signal = message.signal;
      logPool('worker scatter received', {
        signalId: signal?.id,
        from: formatPeer(signal?.originAddress),
        to: formatPeer(signal?.targetAddress),
      });
      if (!this.remember(signal?.id)) {
        logPool('worker scatter ignored, already seen', { signalId: signal?.id });
        return;
      }
      this.scatter(signal);
    }
  }

  async handleBroadcastMessage(message) {
    if (!message || message.tabId === this.tabId) return;
    logPool(`broadcast received ${message.type}`, {
      signalId: message.signal?.id ?? message.id ?? null,
      fromTab: message.tabId,
    });

    if (message.type === 'RTC_POOL_PEER_CONNECTED') {
      const peerKey = normalizeAddress(message.peer?.playerAddress);
      if (!peerKey) return;
      logPool('peer discovered from table tab', {
        peer: formatPeer(message.peer?.playerAddress),
        ownerTabId: message.tabId,
        role: this.role,
      });
      this.knownPeers.set(peerKey, {
        ...message.peer,
        ownerTabId: message.tabId,
        seenAt: Date.now(),
      });
      if (this.role === 'lobby') {
        void this.ensureSilentConnection(message.peer);
      }
      return;
    }

    if (message.type === RTC_POOL_SIGNAL) {
      const signal = message.signal;
      if (!this.remember(signal?.id)) {
        logPool('broadcast signal ignored, already seen', { signalId: signal?.id });
        return;
      }
      await this.deliverOrScatter(signal);
      return;
    }

    if (message.type === 'RTC_POOL_SIGNAL_DELIVERED') {
      logPool('broadcast delivery ack received', { signalId: message.id });
      this.resolveDelivery(message.id);
      return;
    }

    if (message.type === 'SCATTER_RTC_POOL_SIGNAL') {
      const signal = message.signal;
      if (!this.remember(signal?.id)) {
        logPool('broadcast scatter ignored, already seen', { signalId: signal?.id });
        return;
      }
      this.scatter(signal);
    }
  }

  postRegisterSession(session) {
    const { playerAddress, lobbyId, tableId } = session.config ?? {};
    logPool('register session with worker', {
      player: formatPeer(playerAddress),
      lobbyId,
      tableId,
      endpoint: session.endpoint ?? ENDPOINT.TABLE,
    });
    this.postWorker({
      type: 'REGISTER_SESSION',
      session: { playerAddress, lobbyId, tableId, endpoint: session.endpoint ?? ENDPOINT.TABLE },
    });
  }

  postUnregisterSession(session) {
    const { playerAddress, lobbyId, tableId } = session.config ?? {};
    logPool('unregister session with worker', {
      player: formatPeer(playerAddress),
      lobbyId,
      tableId,
      endpoint: session.endpoint ?? ENDPOINT.TABLE,
    });
    this.postWorker({
      type: 'UNREGISTER_SESSION',
      session: { playerAddress, lobbyId, tableId, endpoint: session.endpoint ?? ENDPOINT.TABLE },
    });
  }

  registerSession(session) {
    const { playerAddress, lobbyId, tableId } = session.config ?? {};
    if (!playerAddress || !lobbyId || !tableId) return;
    const key = sessionKey({
      playerAddress,
      lobbyId,
      tableId,
      endpoint: session.endpoint ?? ENDPOINT.TABLE,
    });
    this.sessions.set(key, session);
    logPool('session registered', {
      key,
      player: formatPeer(playerAddress),
      lobbyId,
      tableId,
      endpoint: session.endpoint ?? ENDPOINT.TABLE,
    });
    this.postRegisterSession(session);
  }

  unregisterSession(session) {
    [...this.sessions.entries()].forEach(([key, value]) => {
      if (value === session) {
        this.sessions.delete(key);
        logPool('session unregistered', { key });
      }
    });
    this.postUnregisterSession(session);
  }

  registerLink({ session, peerAddress, direction, channel, silent = false }) {
    const peerKey = normalizeAddress(peerAddress);
    if (!peerKey || !channel) return;

    const links = this.links.get(peerKey) ?? [];
    const nextLinks = links.filter((link) => (
      link.session !== session || link.direction !== direction
    ));
    nextLinks.push({ session, peerAddress, direction, channel });
    this.links.set(peerKey, nextLinks);
    logPool('link registered', {
      peer: formatPeer(peerAddress),
      direction,
      silent,
      readyState: channel.readyState,
      linkCount: nextLinks.length,
    });

    const peer = session.config?.players?.find((candidate) => (
      normalizeAddress(candidate.playerAddress) === peerKey
    ));
    if (!silent) {
      this.postBroadcast({
        type: 'RTC_POOL_PEER_CONNECTED',
        peer: {
          playerAddress: peerAddress,
          announcePublicKey: peer?.annoncePublicKey ?? null,
          seatNo: peer?.seatNo ?? null,
          lobbyId: session.config?.lobbyId,
          tableId: session.config?.tableId,
          localSession: {
            playerAddress: session.config?.playerAddress,
            lobbyId: session.config?.lobbyId,
            tableId: session.config?.tableId,
            publicKey: session.config?.publicKey,
            privateKey: session.config?.privateKey,
          },
        },
      });
    }
  }

  async ensureSilentConnection(peer) {
    const localSession = peer?.localSession;
    if (
      !localSession?.playerAddress
      || !localSession?.publicKey
      || !localSession?.privateKey
      || !peer?.playerAddress
      || !peer?.announcePublicKey
    ) {
      logPool('silent connection skipped, missing peer/session details', {
        peer: formatPeer(peer?.playerAddress),
        hasLocalSession: Boolean(localSession),
        hasLocalPublicKey: Boolean(localSession?.publicKey),
        hasLocalPrivateKey: Boolean(localSession?.privateKey),
        hasPeerAnnounceKey: Boolean(peer?.announcePublicKey),
      });
      return null;
    }

    const endpoint = new LobbySilentRtcEndpoint({
      pool: this,
      localSession,
      peer,
    });
    if (this.silentEndpoints.has(endpoint.id)) {
      logPool('silent connection already exists', {
        local: formatPeer(localSession.playerAddress),
        peer: formatPeer(peer.playerAddress),
      });
      return this.silentEndpoints.get(endpoint.id);
    }

    this.silentEndpoints.set(endpoint.id, endpoint);
    this.sessions.set(sessionKey({
      playerAddress: localSession.playerAddress,
      lobbyId: localSession.lobbyId,
      tableId: localSession.tableId,
      endpoint: ENDPOINT.LOBBY,
    }), endpoint);
    this.postRegisterSession(endpoint);
    if (normalizeAddress(localSession.playerAddress) < normalizeAddress(peer.playerAddress)) {
      logPool('silent connection initiator selected', {
        local: formatPeer(localSession.playerAddress),
        peer: formatPeer(peer.playerAddress),
      });
      await endpoint.start();
    } else {
      logPool('silent connection waiting for peer offer', {
        local: formatPeer(localSession.playerAddress),
        peer: formatPeer(peer.playerAddress),
      });
    }
    return endpoint;
  }

  unregisterLink({ session, peerAddress, direction }) {
    const peerKey = normalizeAddress(peerAddress);
    if (!peerKey) return;

    const links = this.links.get(peerKey) ?? [];
    const nextLinks = links.filter((link) => (
      link.session !== session || link.direction !== direction
    ));
    if (nextLinks.length > 0) {
      this.links.set(peerKey, nextLinks);
    } else {
      this.links.delete(peerKey);
    }
    logPool('link unregistered', {
      peer: formatPeer(peerAddress),
      direction,
      remaining: nextLinks.length,
    });
  }

  remember(messageId) {
    if (!messageId) return false;
    if (this.seenMessages.has(messageId)) return false;

    this.seenMessages.add(messageId);
    if (this.seenMessages.size > MAX_SEEN_MESSAGES) {
      const [oldest] = this.seenMessages;
      this.seenMessages.delete(oldest);
    }
    return true;
  }

  waitForDelivery(messageId, timeoutMs = DELIVERY_TIMEOUT_MS) {
    if (!messageId) return Promise.resolve(false);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingDeliveries.delete(messageId);
        logPool('delivery timeout', { signalId: messageId, timeoutMs });
        resolve(false);
      }, timeoutMs);
      this.pendingDeliveries.set(messageId, (delivered) => {
        clearTimeout(timeout);
        logPool('delivery resolved', { signalId: messageId, delivered });
        resolve(delivered);
      });
    });
  }

  resolveDelivery(messageId) {
    const resolve = this.pendingDeliveries.get(messageId);
    if (resolve) {
      this.pendingDeliveries.delete(messageId);
      resolve(true);
    }
  }

  announceDelivery(messageId) {
    logPool('announce delivery', { signalId: messageId });
    this.resolveDelivery(messageId);
    this.postBroadcast({
      type: 'RTC_POOL_SIGNAL_DELIVERED',
      id: messageId,
    });
    this.postWorker({
      type: 'RTC_POOL_SIGNAL_DELIVERED',
      id: messageId,
    });
  }

  hasLocalAddress(playerAddress, lobbyId, tableId) {
    const playerKey = normalizeAddress(playerAddress);
    return [...this.sessions.values()].some((session) => (
      normalizeAddress(session.config?.playerAddress ?? session.localSession?.playerAddress) === playerKey
      && String(session.config?.lobbyId ?? session.localSession?.lobbyId) === String(lobbyId)
      && String(session.config?.tableId ?? session.localSession?.tableId) === String(tableId)
    ));
  }

  fanoutLocalEndpoint(message) {
    logPool('fanout to local tabs', {
      signalId: message.id,
      target: formatPeer(message.targetAddress),
      endpoint: message.targetEndpoint,
    });
    const sentToBroadcast = this.postBroadcast({
      type: RTC_POOL_SIGNAL,
      signal: message,
    });
    const sentToWorker = this.postWorker({
      type: RTC_POOL_SIGNAL,
      signal: message,
    });
    return sentToBroadcast || sentToWorker;
  }

  sendToLink(link, message) {
    if (link.channel?.readyState !== 'open') {
      logPool('link send skipped, channel not open', {
        peer: formatPeer(link.peerAddress),
        direction: link.direction,
        readyState: link.channel?.readyState,
        signalId: message.id,
      });
      return false;
    }
    logPool('link send', {
      peer: formatPeer(link.peerAddress),
      direction: link.direction,
      signalId: message.id,
      target: formatPeer(message.targetAddress),
    });
    link.channel.send(JSON.stringify(message));
    return true;
  }

  scatter(message, { excludePeerAddress = null } = {}) {
    const visited = new Set((message.visited ?? []).map(normalizeAddress));
    const excludePeerKey = normalizeAddress(excludePeerAddress);
    let sent = false;

    this.links.forEach((links, peerKey) => {
      if (peerKey === excludePeerKey || visited.has(peerKey)) return;
      links.forEach((link) => {
        sent = this.sendToLink(link, message) || sent;
      });
    });

    logPool(`scatter ${sent ? 'sent' : 'not sent'}`, {
      signalId: message.id,
      from: formatPeer(message.originAddress),
      to: formatPeer(message.targetAddress),
      exclude: formatPeer(excludePeerAddress),
      visited: message.visited,
      ttl: message.ttl,
      linkPeers: [...this.links.keys()].map(formatPeer),
    });
    return sent;
  }

  async sendEncryptedSignal({
    originAddress,
    originEndpoint = ENDPOINT.TABLE,
    targetAddress,
    targetEndpoint = ENDPOINT.TABLE,
    lobbyId,
    tableId,
    encryptedData,
    deliveryTimeoutMs = DELIVERY_TIMEOUT_MS,
  }) {
    const message = {
      type: RTC_POOL_SIGNAL,
      id: makeMessageId(originAddress, targetAddress, lobbyId, tableId),
      originAddress,
      originEndpoint,
      targetAddress,
      targetEndpoint,
      lobbyId: String(lobbyId),
      tableId: String(tableId),
      encryptedData,
      ttl: DEFAULT_TTL,
      visited: [normalizeAddress(originAddress)],
    };

    this.remember(message.id);
    logPool('send encrypted signal', {
      signalId: message.id,
      from: formatPeer(originAddress),
      fromEndpoint: originEndpoint,
      to: formatPeer(targetAddress),
      toEndpoint: targetEndpoint,
      lobbyId,
      tableId,
    });
    const sentLocally = this.scatter(message);
    const sentToBroadcast = this.postBroadcast({
      type: RTC_POOL_SIGNAL,
      signal: message,
    });
    const sentToWorker = this.postWorker({
      type: RTC_POOL_SIGNAL,
      signal: message,
    });
    logPool('send encrypted signal routed', {
      signalId: message.id,
      sentLocally,
      sentToBroadcast,
      sentToWorker,
    });
    if (!sentLocally && !sentToBroadcast && !sentToWorker) return false;
    const delivered = await this.waitForDelivery(message.id, deliveryTimeoutMs);
    logPool(`send encrypted signal ${delivered ? 'delivered' : 'undelivered'}`, {
      signalId: message.id,
      to: formatPeer(targetAddress),
    });
    return delivered;
  }

  async deliverOrScatter(message, { fromPeerAddress = null } = {}) {
    const localAddress = message.targetAddress;
    const endpoint = message.targetEndpoint ?? ENDPOINT.TABLE;
    const targetSession = endpoint === ENDPOINT.LOBBY
      ? [...this.silentEndpoints.values()].find((candidate) => (
        normalizeAddress(candidate.localSession.playerAddress) === normalizeAddress(localAddress)
        && normalizeAddress(candidate.peer.playerAddress) === normalizeAddress(message.originAddress)
        && String(candidate.localSession.lobbyId) === String(message.lobbyId)
        && String(candidate.localSession.tableId) === String(message.tableId)
      ))
      : this.sessions.get(sessionKey({
        playerAddress: localAddress,
        lobbyId: message.lobbyId,
        tableId: message.tableId,
        endpoint,
    }));

    if (targetSession) {
      logPool('deliver to local session', {
        signalId: message.id,
        endpoint,
        target: formatPeer(localAddress),
        from: formatPeer(message.originAddress),
      });
      this.announceDelivery(message.id);
      Promise.resolve(targetSession.handleRelayEncryptedSignal(message)).catch((error) => {
        logPool('delivered signal handling failed', error);
      });
      return true;
    }

    if (Number(message.ttl ?? 0) <= 0) {
      logPool('delivery skipped, ttl exhausted', {
        signalId: message.id,
        target: formatPeer(localAddress),
      });
      return true;
    }
    if (this.hasLocalAddress(localAddress, message.lobbyId, message.tableId)) {
      logPool('target player is local but endpoint is in another tab', {
        signalId: message.id,
        target: formatPeer(localAddress),
        endpoint,
      });
      this.fanoutLocalEndpoint(message);
      return true;
    }
    logPool('no local target, scattering', {
      signalId: message.id,
      target: formatPeer(localAddress),
      endpoint,
      fromPeer: formatPeer(fromPeerAddress),
    });
    this.scatter(message, { excludePeerAddress: fromPeerAddress });
    return true;
  }

  async handleMessage(receiverSession, fromPeerAddress, message) {
    if (message?.type !== RTC_POOL_SIGNAL) return true;
    logPool('data-channel pool message received', {
      signalId: message.id,
      receiver: formatPeer(receiverSession.config?.playerAddress),
      fromPeer: formatPeer(fromPeerAddress),
      target: formatPeer(message.targetAddress),
      ttl: message.ttl,
    });
    if (!this.remember(message.id)) {
      logPool('data-channel pool message ignored, already seen', { signalId: message.id });
      return true;
    }

    const localAddress = receiverSession.config?.playerAddress;
    const localKey = normalizeAddress(localAddress);
    const targetKey = normalizeAddress(message.targetAddress);
    const nextMessage = {
      ...message,
      ttl: Number(message.ttl ?? 0) - 1,
      visited: [...new Set([...(message.visited ?? []), localKey].filter(Boolean))],
    };

    if (targetKey === localKey) {
      logPool('data-channel pool message reached target', {
        signalId: message.id,
        target: formatPeer(message.targetAddress),
      });
      return this.deliverOrScatter(message);
    }

    if (nextMessage.ttl <= 0) {
      logPool('data-channel pool message ttl exhausted', { signalId: message.id });
      return true;
    }
    logPool('data-channel pool message forwarding', {
      signalId: nextMessage.id,
      receiver: formatPeer(localAddress),
      target: formatPeer(nextMessage.targetAddress),
      ttl: nextMessage.ttl,
    });
    this.scatter(nextMessage, { excludePeerAddress: fromPeerAddress });
    this.postBroadcast({
      type: RTC_POOL_SIGNAL,
      signal: nextMessage,
    });
    this.postWorker({
      type: RTC_POOL_SIGNAL,
      signal: nextMessage,
    });
    return true;
  }

  async handleSilentDataMessage(receiverSession, fromPeerAddress, rawData) {
    try {
      const message = JSON.parse(rawData);
      if (message?.type === RTC_POOL_SIGNAL) {
        logPool('silent data message parsed', {
          signalId: message.id,
          fromPeer: formatPeer(fromPeerAddress),
          target: formatPeer(message.targetAddress),
        });
        await this.handleMessage(receiverSession, fromPeerAddress, message);
      }
    } catch (error) {
      logPool('silent data message ignored', error);
    }
  }
}

export const rtcSessionPool = new RtcSessionPool();
export { RTC_POOL_SIGNAL, ENDPOINT };
