import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccountSession } from '@/contexts/AccountSessionContext.jsx';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import { useNetwork } from '@/hooks/useNetwork';
import { useNetworkTopology } from '@/hooks/useNetworkTopology';
import { CHAIN_POLLING_INTERVAL } from '@/lib/chain';

const mapTableDetail = (detail) => ({
  id: detail.info.id,
  name: detail.info.name,
  gameType: detail.info.gameType ?? 1,
  buyin: detail.info.buyIn,
  maxSeats: detail.info.flags,
  players: detail.players,
  current_hand: { min_bet: 10, max_bet: 100, bet_step: 10, community_cards: '' },
});

const buildSeats = (tableData) => {
  const seatCount = Number(tableData?.maxSeats || tableData?.max_players || 0);
  return Array.from({ length: seatCount }, (_, index) => {
    const player = tableData?.players?.[index];
    return {
      seatNo: index,
      playerAddress: player?.playerAddress ?? null,
      operator: player?.operator ?? null,
      announcePublicKey: player?.annoncePublicKey ?? null,
    };
  });
};

const normalizeAddress = (value) => value?.toLowerCase() ?? '';

const makeSeatsKey = (seats) => seats
  .map((seat) => [
    seat.seatNo,
    normalizeAddress(seat.playerAddress),
    normalizeAddress(seat.operator),
    seat.announcePublicKey ?? '',
  ].join('/'))
  .join('|');

export function useTable({
  tableId,
  lobbyId,
  initialTableData = null,
  initialIsSeated = null,
  onActivity,
  onSeat: onSeatEvent,
  networkEnabled = false,
  onOperatorTopUp,
  localMediaStream = null,
} = {}) {
  const { accountSession } = useAccountSession();
  const playerAddress = accountSession?.walletAddress;
  const { getTableDetail, getPlayerTables } = usePrivatePokerLobby();
  const [liveTableData, setLiveTableData] = useState(initialTableData);
  const [isLoading, setIsLoading] = useState(!initialTableData);
  const [isSeated, setIsSeated] = useState(initialIsSeated);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const onSeatEventRef = useRef(onSeatEvent);
  onSeatEventRef.current = onSeatEvent;

  const activeTableId = liveTableData?.id ?? tableId;
  const tableName = liveTableData?.name ?? '';
  const tableCapacity = Number(liveTableData?.maxSeats || liveTableData?.max_players || 0);
  const seatedPlayerCount = liveTableData?.players?.length ?? 0;
  const isTableFull = tableCapacity > 0 && seatedPlayerCount >= tableCapacity;
  const seats = useMemo(() => buildSeats(liveTableData), [liveTableData]);
  const seatsKey = makeSeatsKey(seats);

  const tableSessionDetails = useMemo(() => ({
    lobbyId,
    tableId: activeTableId,
    tableName,
    buyIn: liveTableData?.buyin,
    blinds: liveTableData?.blinds,
    stakesLabel: liveTableData?.stakes,
  }), [activeTableId, lobbyId, liveTableData?.blinds, liveTableData?.buyin, liveTableData?.stakes, tableName]);
  const subscribedPrecedingPeerKeyRef = useRef(null);

  const onSeat = useCallback((seatNo, seatEvent) => {
    onSeatEventRef.current?.(seatNo, seatEvent);
  }, []);

  const network = useNetwork({
    tableId: activeTableId,
    lobbyId,
    tableDetails: tableSessionDetails,
    seats,
    onActivity,
    onOperatorTopUp,
    isTableFull,
    tableCapacity,
    localMediaStream,
  });
  const [
    publishMessage,
    subscribeTo,
    networkSnapshot,
    prepareNetworkSession,
    armBadSignatureOnce,
    armDropNextMessage,
    armDuplicateNextMessage,
  ] = network;
  const [getPreviousSeat, getNextSeat] = useNetworkTopology(seats.length);

  const mySeatNo = useMemo(() => (
    seats.find((seat) => normalizeAddress(seat.playerAddress) === normalizeAddress(playerAddress))?.seatNo ?? null
  ), [playerAddress, seatsKey]);

  const previousSeatNo = getPreviousSeat(mySeatNo);
  const previousSeat = previousSeatNo === null ? null : seats[previousSeatNo];
  const subscriptionKey = [
    normalizeAddress(playerAddress),
    lobbyId ?? '',
    activeTableId ?? '',
    previousSeatNo ?? '',
    normalizeAddress(previousSeat?.playerAddress),
    previousSeat?.announcePublicKey ?? '',
  ].join('::');

  const subscribeToPreviousSeat = useCallback(async ({ immediateOffer = false } = {}) => {
    if (!isTableFull || !previousSeat?.playerAddress) return;

    const { playerAddress: peerPlayerAddress, announcePublicKey } = previousSeat;
    await subscribeTo(peerPlayerAddress, announcePublicKey, (seatNo, event) => {
      onSeat(seatNo, {
        kind: 'network',
        playerAddress: peerPlayerAddress,
        event,
      });
    }, { immediateOffer });
  }, [isTableFull, onSeat, previousSeat, subscribeTo]);

  const retryInboundConnection = useCallback(() => (
    subscribeToPreviousSeat({ immediateOffer: true })
  ), [subscribeToPreviousSeat]);

  useEffect(() => {
    if (!networkEnabled) return;
    if (!isTableFull || !previousSeat?.playerAddress) return;
    if (subscribedPrecedingPeerKeyRef.current === subscriptionKey) return;

    subscribedPrecedingPeerKeyRef.current = subscriptionKey;
    subscribeToPreviousSeat();
  }, [isTableFull, networkEnabled, subscribeToPreviousSeat, subscriptionKey]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer = null;
    let inFlight = false;

    const loadTable = async ({ silent = false } = {}) => {
      if (inFlight || !lobbyId || !tableId) return;
      inFlight = true;

      try {
        if (!silent && !liveTableData) setIsLoading(true);
        const detail = await getTableDetail(lobbyId, tableId);
        if (cancelled) return;

        setLiveTableData((current) => ({
          ...mapTableDetail(detail),
          current_hand: {
            ...mapTableDetail(detail).current_hand,
            ...current?.current_hand,
          },
        }));

        if (playerAddress) {
          const userTables = await getPlayerTables(playerAddress);
          if (cancelled) return;
          setIsSeated(userTables.includes(tableId.toString()));
        } else {
          setIsSeated(null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load table:', error);
        }
      } finally {
        if (!cancelled && !silent) setIsLoading(false);
        inFlight = false;
      }
    };

    const poll = async () => {
      await loadTable({ silent: true });
      if (!cancelled) {
        pollTimer = setTimeout(poll, CHAIN_POLLING_INTERVAL);
      }
    };

    loadTable();
    pollTimer = setTimeout(poll, CHAIN_POLLING_INTERVAL);

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  }, [playerAddress, lobbyId, refreshTrigger, tableId]);

  useEffect(() => {
    seats.forEach((seat) => {
      if (!seat.playerAddress) return;
      onSeat(seat.seatNo, {
        kind: 'blockchain',
        playerAddress: seat.playerAddress,
        operator: seat.operator,
        announcePublicKey: seat.announcePublicKey,
      });
    });
  }, [seatsKey]);

  const currentSeat = useMemo(() => ({
    playerAddress,
    seatNo: mySeatNo,
    isSeated: isSeated === true,
  }), [playerAddress, isSeated, mySeatNo]);

  const result = [activeTableId, tableName, lobbyId, liveTableData?.gameType ?? 1, seats, onSeat];
  return Object.assign(result, {
    onSeat,
    currentSeat,
    tableData: liveTableData,
    setTableData: setLiveTableData,
    isLoading,
    isSeated,
    setIsSeated,
    refresh: () => setRefreshTrigger((current) => current + 1),
    hasJoinedTable: isSeated === true,
    network,
    networkSnapshot,
    playerNetworkStates: networkSnapshot?.peerStates ?? {},
    prepareNetworkSession,
    publishMessage,
    armBadSignatureOnce,
    armDropNextMessage,
    armDuplicateNextMessage,
    retryInboundConnection,
    seats,
    subscribeTo,
  });
}
