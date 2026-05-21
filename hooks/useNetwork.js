import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useListenForSignals, usePrivatePokerSignal } from '@/hooks/usePrivatePokerSignal';
import { useRequireBLS } from '@/hooks/useRequireBLS';
import { PokerRtcSession } from '@/lib/PokerRtcSession';

const normalizeAddress = (value) => value?.toLowerCase() ?? '';

function makePlayersKey(players = []) {
  return players
    .map((player) => [
      normalizeAddress(player?.buyinAddress),
      player?.annoncePublicKey ?? '',
    ].join('/'))
    .join('|');
}

function makeSeatsKey(seats = []) {
  return seats
    .map((seat) => [
      seat?.seatNo ?? '',
      normalizeAddress(seat?.buyinAddress),
      seat?.announcePublicKey ?? '',
    ].join('/'))
    .join('|');
}

function makeSessionConfigKey({
  buyinAddress,
  tableId,
  lobbyId,
  publicKey,
  privateKey,
  playersKey,
  isTableFull,
  tableCapacity,
}) {
  return [
    normalizeAddress(buyinAddress),
    tableId ?? '',
    lobbyId ?? '',
    publicKey ?? '',
    privateKey ? 'private-key-ready' : '',
    buyinAddress ?? '',
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
  const { sendSignal } = usePrivatePokerSignal();
  const { blsKeys, generateKeys } = useRequireBLS(tableDetails);
  const publicKey = blsKeys?.publicKey;
  const privateKey = blsKeys?.privateKey;
  const buyinPrivateKey = blsKeys?.buyinPrivateKey;
  const buyinAddress = blsKeys?.buyinAddress;
  const loggedUpdateKeysRef = useRef(new Set());
  const seatsKey = makeSeatsKey(seats);
  const players = useMemo(
    () => seats
      .filter((seat) => seat?.buyinAddress)
      .map((seat) => ({
        seatNo: seat.seatNo,
        buyinAddress: seat.buyinAddress,
        annoncePublicKey: seat.announcePublicKey,
      })),
    [seatsKey],
  );
  const playersKey = makePlayersKey(players);
  const mySeatAnnouncePublicKey = players.find(
    (player) => normalizeAddress(player.buyinAddress) === normalizeAddress(buyinAddress),
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
      buyinAddress,
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
      buyinAddress,
      tableId,
      lobbyId,
      publicKey,
      privateKey,
      buyinPrivateKey,
      players,
      isTableFull,
      tableCapacity,
    });
  }, [
    isTableFull,
    lobbyId,
    playersKey,
    privateKey,
    publicKey,
    buyinPrivateKey,
    buyinAddress,
    tableCapacity,
    tableId,
  ]);

  useListenForSignals(buyinAddress, async (signalData) => {
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

  const subscribeTo = useCallback(async (peerBuyinAddress, peerAnnouncePubKey, callback) => {
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
      buyinAddress: keys.buyinAddress,
      tableId,
      lobbyId,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      buyinPrivateKey: keys.buyinPrivateKey,
      players,
      isTableFull,
      tableCapacity,
    });
    await session.subscribeTo(peerBuyinAddress, peerAnnouncePubKey, callback);
  }, [
    blsKeys,
    generateKeys,
    isTableFull,
    lobbyId,
    mySeatAnnouncePublicKey,
    playersKey,
    tableCapacity,
    tableDetails,
    tableId,
  ]);

  return [publishMessage, subscribeTo];
}
