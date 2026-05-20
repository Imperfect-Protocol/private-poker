"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TableScreen from '@/components/table_screen/Component';
import { useConnection } from 'wagmi';
import { usePokerRTC } from '@/hooks/usePokerRtc';
import { useRequireBLS } from '@/hooks/useRequireBLS';

const hasAnnounceKey = (player) => {
  const key = player?.annoncePublicKey;
  if (!key) return false;
  if (typeof key !== "string") return true;
  return key !== "0x" && key.length > 2;
};

// 1. Correct the name and accept the pre-fetched `tableData`
export default function ActiveTableView({ tableData: initialTableData, lobbyId, children }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  // 2. Load the parent's data into local state so WebRTC can update it
  const [liveTableData, setLiveTableData] = useState(initialTableData);

  const { address } = useConnection();
  // Extract the ID for the RTC hook and table-scoped BLS session.
  const tableId = liveTableData.id;
  const tableSessionDetails = useMemo(() => ({
    lobbyId,
    tableId,
    tableName: liveTableData.name,
    buyIn: liveTableData.buyin,
    blinds: liveTableData.blinds,
    stakesLabel: liveTableData.stakes,
  }), [lobbyId, liveTableData.blinds, liveTableData.buyin, liveTableData.name, liveTableData.stakes, tableId]);
  const { blsKeys, isGenerating, generateKeys } = useRequireBLS(tableSessionDetails);
  const promptedSessionRef = useRef(null);
  const currentPlayer = useMemo(() => {
    return liveTableData.players?.find(
      (player) => player.address?.toLowerCase() === address?.toLowerCase(),
    );
  }, [address, liveTableData.players]);
  const currentUserCanUseNetwork = Boolean(blsKeys && hasAnnounceKey(currentPlayer));
  const tableCapacity = Number(liveTableData?.maxSeats || liveTableData?.max_players || 0);
  const seatedPlayerCount = liveTableData?.players?.length ?? 0;
  const isTableFull = tableCapacity > 0 && seatedPlayerCount >= tableCapacity;

  useEffect(() => {
    setLiveTableData((current) => ({
      ...initialTableData,
      current_hand: {
        ...initialTableData.current_hand,
        ...current?.current_hand,
      },
    }));
  }, [initialTableData]);

  const addDebugMessage = useCallback((message) => {
    setMessages((prev) => [...prev, message].slice(-160));
  }, []);

  const joinNetwork = useCallback(async ({ force = false } = {}) => {
    if (!currentPlayer) return;
    if (blsKeys || isGenerating || !tableSessionDetails.tableId) return;
    if (!force && promptedSessionRef.current === tableSessionDetails.tableId) return;

    promptedSessionRef.current = tableSessionDetails.tableId;
    try {
      await generateKeys();
      if (!hasAnnounceKey(currentPlayer)) {
        const text = 'This table entry does not have an announce public key on-chain. Rejoin/create must pass the table-scoped key in the table transaction.';
        console.warn(text);
        addDebugMessage({ text, sender: "RTC", level: "warn" });
      }
    } catch (error) {
      addDebugMessage({ text: `BLS session failed: ${error.message}`, sender: "RTC", level: "error" });
      console.error('Failed to authorize table BLS session:', error);
    }
  }, [
    addDebugMessage,
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

  // 3. Initialize RTC
  const handleRtcActivity = useCallback((activity) => {
    if (!activity.display) return;

    addDebugMessage({
      text: activity.text,
      sender: "RTC",
      level: activity.text?.includes("failed") || activity.text?.includes("error") ? "error" : "info",
    });
  }, [addDebugMessage]);

  const { connectedPeerCount, connectedPeerAddresses, expectedPeerCount, status, sendMessage, topologyLabel } = usePokerRTC(
    tableId,
    lobbyId,
    currentUserCanUseNetwork ? blsKeys : null,
    liveTableData.players,
    (incoming) => {
      if (incoming.type === "GAME_UPDATE") {
        setLiveTableData(prev => ({
          ...prev,
          current_hand: {
            ...prev.current_hand,
            ...incoming.data
          }
        }));
      } else if (incoming.type === "CHAT") {
        addDebugMessage({ text: incoming.text, sender: "Peer" });
      }
    },
    handleRtcActivity,
    isTableFull,
    tableCapacity,
  );
  const currentUserNetworkJoined = currentUserCanUseNetwork && status === "connected";

  const handleSend = (e) => {
    e.preventDefault();
    if (!input) return;

    sendMessage({ type: "CHAT", text: input });
    addDebugMessage({ text: input, sender: "Me" });
    setInput("");
  };

  const handleDealTest = () => {
    const suits = ['h', 'd', 's', 'c'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

    const getRandomCard = () => ranks[Math.floor(Math.random() * ranks.length)] + suits[Math.floor(Math.random() * suits.length)];
    const newFlop = getRandomCard() + getRandomCard() + getRandomCard();
    const newHand = getRandomCard() + getRandomCard();

    setLiveTableData(prev => ({
      ...prev,
      current_hand: {
        ...prev.current_hand,
        ...{ community_cards: newFlop, player_cards: newHand }
      }
    }));

    sendMessage({
      type: "GAME_UPDATE",
      data: { community_cards: newFlop }
    });
  };

  return (
    <TableScreen
      tableData={liveTableData}
      currentUserAddress={address}
      currentUserBlsKey={blsKeys}
      currentUserNetworkJoined={currentUserNetworkJoined}
      currentUserNetworkStatus={status}
      connectedPeerAddresses={connectedPeerAddresses}
      isJoiningNetwork={isGenerating}
      onJoinNetwork={() => joinNetwork({ force: true })}
      status={status}
      expectedPeerCount={expectedPeerCount}
      connectedPeerCount={connectedPeerCount}
      topologyLabel={topologyLabel}
      debugConsole={{
        tableId,
        messages,
        input,
        onInputChange: setInput,
        onSubmit: handleSend,
        onDealTest: handleDealTest,
      }}
      showActionBar={liveTableData !== undefined}
      actionBarProps={{
        // minBet: liveTableData.current_hand.min_bet,
        // maxBet: liveTableData.current_hand.max_bet,
        // step: liveTableData.current_hand.bet_step,
      }}
    >
      {children}
    </TableScreen>
  );
}
