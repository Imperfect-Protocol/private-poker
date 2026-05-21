import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection } from 'wagmi';
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

function makeSeatsKey(seats = []) {
  return seats
    .map((seat) => [
      seat?.seatNo ?? '',
      normalizeAddress(seat?.playerAddress),
      normalizeAddress(seat?.operator),
      seat?.announcePublicKey ?? '',
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
  isTableFull = false,
  tableCapacity = 0,
} = {}) {
  const { address: playerAddress } = useConnection();
  const { sendSignal } = usePrivatePokerSignal();
  const { blsKeys, generateKeys } = useRequireBLS(tableDetails);
  const publicKey = blsKeys?.publicKey;
  const privateKey = blsKeys?.privateKey;
  const operatorPrivateKey = blsKeys?.operatorPrivateKey;
  const operator = blsKeys?.operator;
  const loggedUpdateKeysRef = useRef(new Set());
  const seatsKey = makeSeatsKey(seats);
  const players = useMemo(
    () => seats
      .filter((seat) => seat?.playerAddress)
      .map((seat) => ({
        seatNo: seat.seatNo,
        playerAddress: seat.playerAddress,
        operator: seat.operator,
        annoncePublicKey: seat.announcePublicKey,
      })),
    [seatsKey],
  );
  const playersKey = makePlayersKey(players);
  const mySeatAnnouncePublicKey = players.find(
    (player) => normalizeAddress(player.playerAddress) === normalizeAddress(playerAddress),
  )?.annoncePublicKey;
  const sendSignalRef = useRef(sendSignal);
  const onActivityRef = useRef(onActivity);

  sendSignalRef.current = sendSignal;
  onActivityRef.current = onActivity;

  const [session] = useState(
    () => new PokerRtcSession({
      sendSignal: (...args) => sendSignalRef.current(...args),
      onActivity: (...args) => onActivityRef.current?.(...args),
      onStateChange: () => {},
    }),
  );

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
      sendSignal: (...args) => sendSignalRef.current(...args),
      onActivity: (...args) => onActivityRef.current?.(...args),
      onStateChange: () => {},
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
  }, [
    isTableFull,
    lobbyId,
    playerAddress,
    playersKey,
    privateKey,
    publicKey,
    operatorPrivateKey,
    operator,
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

  const subscribeTo = useCallback(async (peerPlayerAddress, peerAnnouncePubKey, callback) => {
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
    await session.subscribeTo(peerPlayerAddress, peerAnnouncePubKey, callback);
  }, [
    blsKeys,
    generateKeys,
    isTableFull,
    lobbyId,
    mySeatAnnouncePublicKey,
    playerAddress,
    playersKey,
    tableCapacity,
    tableDetails,
    tableId,
  ]);

  return [publishMessage, subscribeTo];
}
