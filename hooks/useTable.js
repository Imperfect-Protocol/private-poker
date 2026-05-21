import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import { useNetwork } from '@/hooks/useNetwork';
import { useNetworkTopology } from '@/hooks/useNetworkTopology';
import { useRequireBLS } from '@/hooks/useRequireBLS';
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
      buyinAddress: player?.buyinAddress ?? null,
      announcePublicKey: player?.annoncePublicKey ?? null,
    };
  });
};

const normalizeAddress = (value) => value?.toLowerCase() ?? '';

const makeSeatsKey = (seats) => seats
  .map((seat) => [
    seat.seatNo,
    normalizeAddress(seat.buyinAddress),
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
} = {}) {
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
  const { blsKeys } = useRequireBLS(tableSessionDetails);
  const buyinAddress = blsKeys?.buyinAddress ?? null;

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
    isTableFull,
    tableCapacity,
  });
  const [publishMessage, subscribeTo] = network;
  const [getPreviousSeat, getNextSeat] = useNetworkTopology(seats.length);

  const mySeatNo = useMemo(() => (
    seats.find((seat) => normalizeAddress(seat.buyinAddress) === normalizeAddress(buyinAddress))?.seatNo ?? null
  ), [buyinAddress, seatsKey]);

  const previousSeatNo = getPreviousSeat(mySeatNo);
  const previousSeat = previousSeatNo === null ? null : seats[previousSeatNo];
  const subscriptionKey = [
    normalizeAddress(buyinAddress),
    lobbyId ?? '',
    activeTableId ?? '',
    previousSeatNo ?? '',
    normalizeAddress(previousSeat?.buyinAddress),
    previousSeat?.announcePublicKey ?? '',
  ].join('::');

  useEffect(() => {
    if (!isTableFull || !previousSeat?.buyinAddress) return;
    if (subscribedPrecedingPeerKeyRef.current === subscriptionKey) return;

    subscribedPrecedingPeerKeyRef.current = subscriptionKey;
    const { buyinAddress, announcePublicKey } = previousSeat;
    subscribeTo(buyinAddress, announcePublicKey, (seatNo, event) => {
      onSeat(seatNo, {
        kind: 'network',
        buyinAddress,
        event,
      });
    });
  }, [isTableFull, subscriptionKey]);

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

        if (buyinAddress) {
          const userTables = await getPlayerTables(buyinAddress);
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
  }, [buyinAddress, lobbyId, refreshTrigger, tableId]);

  useEffect(() => {
    seats.forEach((seat) => {
      if (!seat.buyinAddress) return;
      onSeat(seat.seatNo, {
        kind: 'blockchain',
        buyinAddress: seat.buyinAddress,
        announcePublicKey: seat.announcePublicKey,
      });
    });
  }, [seatsKey]);

  const currentSeat = useMemo(() => ({
    buyinAddress,
    seatNo: mySeatNo,
    isSeated: isSeated === true,
  }), [buyinAddress, isSeated, mySeatNo]);

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
    publishMessage,
    subscribeTo,
  });
}
