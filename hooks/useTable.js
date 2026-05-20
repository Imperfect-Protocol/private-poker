import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection } from 'wagmi';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import { useRequireBLS } from '@/hooks/useRequireBLS';
import { useNetwork } from '@/hooks/useNetwork';
import { CHAIN_POLLING_INTERVAL } from '@/lib/chain';
import { DEFAULT_RTC_TOPOLOGY, getRtcTopologyPlan } from '@/lib/rtcTopology';

const hasAnnounceKey = (player) => {
  const key = player?.annoncePublicKey;
  if (!key) return false;
  if (typeof key !== 'string') return true;
  return key !== '0x' && key.length > 2;
};

const mapTableDetail = (detail) => ({
  id: detail.info.id,
  name: detail.info.name,
  buyin: detail.info.buyIn,
  maxSeats: detail.info.flags,
  players: detail.players,
  current_hand: { min_bet: 10, max_bet: 100, bet_step: 10, community_cards: '' },
});

const buildSeats = (tableData) => {
  const seatCount = Number(tableData?.maxSeats || tableData?.max_players || 0);
  return Array.from({ length: seatCount }, (_, index) => {
    const player = tableData?.players?.[index];
    return [index, player?.address ?? null, player?.annoncePublicKey ?? null];
  });
};

export function useTable({
  tableId,
  lobbyId,
  initialTableData = null,
  initialIsSeated = null,
  onMessage,
  onActivity,
  topology = DEFAULT_RTC_TOPOLOGY,
} = {}) {
  const { address } = useConnection();
  const { getTableDetail, getPlayerTables } = usePrivatePokerLobby();
  const [liveTableData, setLiveTableData] = useState(initialTableData);
  const [isLoading, setIsLoading] = useState(!initialTableData);
  const [isSeated, setIsSeated] = useState(initialIsSeated);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const activeTableId = liveTableData?.id ?? tableId;
  const tableName = liveTableData?.name ?? '';
  const tableCapacity = Number(liveTableData?.maxSeats || liveTableData?.max_players || 0);
  const seatedPlayerCount = liveTableData?.players?.length ?? 0;
  const isTableFull = tableCapacity > 0 && seatedPlayerCount >= tableCapacity;
  const seats = useMemo(() => buildSeats(liveTableData), [liveTableData]);

  const tableSessionDetails = useMemo(() => ({
    lobbyId,
    tableId: activeTableId,
    tableName,
    buyIn: liveTableData?.buyin,
    blinds: liveTableData?.blinds,
    stakesLabel: liveTableData?.stakes,
  }), [activeTableId, lobbyId, liveTableData?.blinds, liveTableData?.buyin, liveTableData?.stakes, tableName]);

  const { blsKeys, isGenerating, generateKeys } = useRequireBLS(tableSessionDetails);
  const promptedSessionRef = useRef(null);

  const currentPlayer = useMemo(() => (
    liveTableData?.players?.find(
      (player) => player.address?.toLowerCase() === address?.toLowerCase(),
    )
  ), [address, liveTableData?.players]);

  const currentUserCanUseNetwork = Boolean(blsKeys && hasAnnounceKey(currentPlayer));

  const network = useNetwork({
    tableId: activeTableId,
    lobbyId,
    blsKeys: currentUserCanUseNetwork ? blsKeys : null,
    seats,
    onMessage,
    onActivity,
    isTableFull,
    tableCapacity,
    topology,
  });
  const [publishMessage, subscribeTo] = network;

  const joinNetwork = useCallback(async ({ force = false } = {}) => {
    if (!currentPlayer) return;
    if (blsKeys || isGenerating || !tableSessionDetails.tableId) return;
    if (!force && promptedSessionRef.current === tableSessionDetails.tableId) return;

    promptedSessionRef.current = tableSessionDetails.tableId;
    await generateKeys();
  }, [
    blsKeys,
    currentPlayer,
    generateKeys,
    isGenerating,
    tableSessionDetails.tableId,
  ]);

  useEffect(() => {
    if (!currentPlayer) return;
    if (blsKeys || isGenerating || !tableSessionDetails.tableId) return;
    if (promptedSessionRef.current === tableSessionDetails.tableId) return;

    const timer = setTimeout(() => {
      joinNetwork();
    }, 1000);

    return () => clearTimeout(timer);
  }, [blsKeys, currentPlayer, isGenerating, joinNetwork, tableSessionDetails.tableId]);

  useEffect(() => {
    if (!currentUserCanUseNetwork || !isTableFull) return;

    const players = seats
      .filter((seat) => seat?.[1])
      .map((seat) => ({
        seatNo: seat[0],
        address: seat[1],
        annoncePublicKey: seat[2],
      }));
    const plan = getRtcTopologyPlan(players, address, topology);
    plan.outboundTargets.forEach((player) => {
      subscribeTo(player.address, player.annoncePublicKey);
    });
  }, [address, currentUserCanUseNetwork, isTableFull, seats, subscribeTo, topology]);

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

        if (address) {
          const userTables = await getPlayerTables(address);
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
  }, [address, lobbyId, refreshTrigger, tableId]);

  const onPlayer = useMemo(() => ({
    address,
    seatNo: seats.find((seat) => seat?.[1]?.toLowerCase() === address?.toLowerCase())?.[0] ?? null,
    announcePublicKey: currentPlayer?.annoncePublicKey ?? null,
    isSeated: isSeated === true,
    hasBlsKey: Boolean(blsKeys),
    isGenerating,
    canUseNetwork: currentUserCanUseNetwork,
    joinNetwork,
  }), [address, blsKeys, currentPlayer?.annoncePublicKey, currentUserCanUseNetwork, isGenerating, isSeated, joinNetwork, seats]);

  const result = [activeTableId, tableName, lobbyId, liveTableData?.gameType, seats, onPlayer];
  return Object.assign(result, {
    tableData: liveTableData,
    setTableData: setLiveTableData,
    isLoading,
    isSeated,
    setIsSeated,
    refresh: () => setRefreshTrigger((current) => current + 1),
    hasJoinedTable: isSeated === true,
    blsKeys,
    network,
    publishMessage,
    subscribeTo,
    connectedPeerCount: network.connectedPeerCount,
    connectedPeerAddresses: network.connectedPeerAddresses,
    expectedPeerCount: network.expectedPeerCount,
    networkStatus: network.status,
    topologyLabel: network.topologyLabel,
    currentUserNetworkJoined: currentUserCanUseNetwork && network.status === 'connected',
  });
}
