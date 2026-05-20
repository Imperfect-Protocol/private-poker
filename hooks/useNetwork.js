import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection } from 'wagmi';
import { useListenForSignals, usePrivatePokerSignal } from '@/hooks/usePrivatePokerSignal';
import { useRequireBLS } from '@/hooks/useRequireBLS';
import { PokerRtcSession } from '@/lib/PokerRtcSession';

const normalizeAddress = (value) => value?.toLowerCase() ?? '';

function makePlayersKey(players = []) {
  return players
    .map((player) => [
      normalizeAddress(player?.address),
      player?.annoncePublicKey ?? '',
    ].join('/'))
    .join('|');
}

function makeSeatsKey(seats = []) {
  return seats
    .map((seat) => [
      seat?.seatNo ?? '',
      normalizeAddress(seat?.address),
      seat?.announcePublicKey ?? '',
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
}) {
  return [
    normalizeAddress(address),
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
  const { address } = useConnection();
  const { sendSignal } = usePrivatePokerSignal();
  const { blsKeys, generateKeys } = useRequireBLS(tableDetails);
  const publicKey = blsKeys?.publicKey;
  const privateKey = blsKeys?.privateKey;
  const loggedUpdateKeysRef = useRef(new Set());
  const seatsKey = makeSeatsKey(seats);
  const players = useMemo(
    () => seats
      .filter((seat) => seat?.address)
      .map((seat) => ({
        seatNo: seat.seatNo,
        address: seat.address,
        annoncePublicKey: seat.announcePublicKey,
      })),
    [seatsKey],
  );
  const playersKey = makePlayersKey(players);
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
      address,
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
      address,
      tableId,
      lobbyId,
      publicKey,
      privateKey,
      players,
      isTableFull,
      tableCapacity,
    });
  }, [
    address,
    isTableFull,
    lobbyId,
    playersKey,
    privateKey,
    publicKey,
    tableCapacity,
    tableId,
  ]);

  useListenForSignals(address, async (signalData) => {
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

  const subscribeTo = useCallback(async (playerAddress, playerAnnouncePubKey, callback) => {
    const keys = blsKeys ?? await generateKeys(tableDetails);
    session.update({
      address,
      tableId,
      lobbyId,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      players,
      isTableFull,
      tableCapacity,
    });
    await session.subscribeTo(playerAddress, playerAnnouncePubKey, callback);
  }, [
    address,
    blsKeys,
    generateKeys,
    isTableFull,
    lobbyId,
    playersKey,
    tableCapacity,
    tableDetails,
    tableId,
  ]);

  return [publishMessage, subscribeTo];
}
