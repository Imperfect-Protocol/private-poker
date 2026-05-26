import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccountSession } from '@/contexts/AccountSessionContext.jsx';
import { useListenForSignals, usePrivatePokerSignal } from '@/hooks/usePrivatePokerSignal';
import { useRequireBLS } from '@/hooks/useRequireBLS';
import { PokerRtcSession } from '@/lib/PokerRtcSession';

const normalizeAddress = (value) => value?.toLowerCase() ?? '';

function makePlayersKey(players = []) {
  return players
    .map((player) => [
      normalizeAddress(player?.playerAddress),
      normalizeAddress(player?.operator),
      player?.annoncePublicKey ?? '',
    ].join('/'))
    .join('|');
}

function makeSessionConfigKey({
  playerAddress,
  operator,
  tableId,
  lobbyId,
  publicKey,
  privateKey,
  playersKey,
  isTableFull,
  tableCapacity,
}) {
  return [
    normalizeAddress(playerAddress),
    normalizeAddress(operator),
    tableId ?? '',
    lobbyId ?? '',
    publicKey ?? '',
    privateKey ? 'private-key-ready' : '',
    isTableFull ? 'full' : 'waiting',
    tableCapacity ?? 0,
    playersKey,
  ].join('::');
}

export function useNetwork({
  tableId,
  lobbyId,
  tableDetails,
  seats = [],
  onActivity,
  onOperatorTopUp,
  isTableFull = false,
  tableCapacity = 0,
  localMediaStream = null,
} = {}) {
  const { accountSession } = useAccountSession();
  const playerAddress = accountSession?.walletAddress;
  const { sendSignal } = usePrivatePokerSignal({ onOperatorTopUp });
  const { blsKeys, generateKeys } = useRequireBLS(tableDetails);
  const publicKey = blsKeys?.publicKey;
  const privateKey = blsKeys?.privateKey;
  const operatorPrivateKey = blsKeys?.operatorPrivateKey;
  const operator = blsKeys?.operator;
  const loggedUpdateKeysRef = useRef(new Set());
  const players = useMemo(
    () => seats
      .filter((seat) => seat?.playerAddress)
      .map((seat) => ({
        seatNo: seat.seatNo,
        playerAddress: seat.playerAddress,
        operator: seat.operator,
        annoncePublicKey: seat.announcePublicKey,
      })),
    [seats],
  );
  const playersKey = makePlayersKey(players);
  const mySeatAnnouncePublicKey = players.find(
    (player) => normalizeAddress(player.playerAddress) === normalizeAddress(playerAddress),
  )?.annoncePublicKey;
  const [session] = useState(
    () => new PokerRtcSession({
      sendSignal: () => {},
      onActivity: () => {},
      onStateChange: () => {},
    }),
  );
  const [networkSnapshot, setNetworkSnapshot] = useState(() => session.getSnapshot());

  useEffect(() => {
    const sessionConfigKey = makeSessionConfigKey({
      playerAddress,
      operator,
      tableId,
      lobbyId,
      publicKey,
      privateKey,
      playersKey,
      isTableFull,
      tableCapacity,
    });

    if (!loggedUpdateKeysRef.current.has(sessionConfigKey)) {
      loggedUpdateKeysRef.current.add(sessionConfigKey);
      console.log('session.update()');
    }

    session.setCallbacks({
      sendSignal,
      onActivity,
      onStateChange: setNetworkSnapshot,
    });
    session.update({
      playerAddress,
      operator,
      tableId,
      lobbyId,
      publicKey,
      privateKey,
      operatorPrivateKey,
      players,
      isTableFull,
      tableCapacity,
    });
    session.setLocalMediaStream(localMediaStream);
  }, [
    isTableFull,
    localMediaStream,
    lobbyId,
    onActivity,
    playerAddress,
    players,
    playersKey,
    privateKey,
    publicKey,
    operatorPrivateKey,
    operator,
    sendSignal,
    session,
    tableCapacity,
    tableId,
  ]);

  useListenForSignals(playerAddress, async (signalData) => {
    console.log('handleSignal', signalData);
    await session.handleSignal(signalData);
  });

  useEffect(() => () => {
    console.log('session.destroy()');
    session.destroy();
  }, [session]);

  const publishMessage = useCallback((message) => {
    console.log('session.publishMessage()', message);
    session.publishMessage(message);
  }, [session]);

  const armBadSignatureOnce = useCallback(() => {
    session.armBadSignatureOnce();
  }, [session]);

  const armDropNextMessage = useCallback(() => {
    session.armDropNextMessage();
  }, [session]);

  const armDuplicateNextMessage = useCallback(() => {
    session.armDuplicateNextMessage();
  }, [session]);

  const subscribeTo = useCallback(async (peerPlayerAddress, peerAnnouncePubKey, callback, options = {}) => {
    const keys = blsKeys ?? await generateKeys(tableDetails);
    const generatedPublicKey = `0x${keys.publicKey}`;
    if (
      mySeatAnnouncePublicKey
      && normalizeAddress(generatedPublicKey) !== normalizeAddress(mySeatAnnouncePublicKey)
    ) {
      throw new Error(
        'Generated BLS key does not match the announce public key stored on-chain for this table. Rejoin this table so the table stores the current deterministic announce key.',
      );
    }
    session.update({
      playerAddress,
      operator: keys.operator,
      tableId,
      lobbyId,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      operatorPrivateKey: keys.operatorPrivateKey,
      players,
      isTableFull,
      tableCapacity,
    });
    session.setLocalMediaStream(localMediaStream);
    await session.subscribeTo(peerPlayerAddress, peerAnnouncePubKey, callback, options);
  }, [
    blsKeys,
    generateKeys,
    isTableFull,
    localMediaStream,
    lobbyId,
    mySeatAnnouncePublicKey,
    playerAddress,
    players,
    session,
    tableCapacity,
    tableDetails,
    tableId,
  ]);

  const prepareNetworkSession = useCallback(async () => {
    const keys = blsKeys ?? await generateKeys(tableDetails);
    session.update({
      playerAddress,
      operator: keys.operator,
      tableId,
      lobbyId,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      operatorPrivateKey: keys.operatorPrivateKey,
      players,
      isTableFull,
      tableCapacity,
    });
    session.setLocalMediaStream(localMediaStream);
    return keys;
  }, [
    blsKeys,
    generateKeys,
    isTableFull,
    localMediaStream,
    lobbyId,
    playerAddress,
    players,
    session,
    tableCapacity,
    tableDetails,
    tableId,
  ]);

  return [
    publishMessage,
    subscribeTo,
    networkSnapshot,
    prepareNetworkSession,
    armBadSignatureOnce,
    armDropNextMessage,
    armDuplicateNextMessage,
  ];
}
