// components/TableClient.js
"use client";

import React, { useState, useEffect } from 'react';
import PokerTable from '@/components/PokerTable';
import PokerActionBar from '@/components/PokerActionBar';
import { useConnection } from 'wagmi';
import { usePokerRTC } from '@/hooks/usePokerRTC';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';

export default function TableClient({ tableId, lobbyId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  // State for the blockchain data
  const [liveTableData, setLiveTableData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeated, setIsSeated] = useState(false);

  const { address } = useConnection();
  const { getTableDetail, getPlayerTables } = usePrivatePokerLobby();

  // 1. Fetch the exact TableDetail from Stylus on mount
  useEffect(() => {
    const loadTable = async () => {
      try {
        setIsLoading(true);
        const detail = await getTableDetail(lobbyId, tableId);

        // Map the smart contract data to the format your UI components expect
        setLiveTableData({
          id: detail.info.id,
          name: detail.info.name,
          buyin: detail.info.buyIn,
          players: detail.players, // Passes the array of {address, chips} directly

          // Mock the hand data temporarily so PokerActionBar doesn't crash 
          // before the WebRTC state channel takes over
          current_hand: {
            min_bet: 10,
            max_bet: 100,
            bet_step: 10,
            community_cards: ""
          }
        });

        if (address) {
          const userTables = await getPlayerTables(address);
          console.log(userTables);
          setIsSeated(userTables.includes(tableId.toString()));
        }
      } catch (error) {
        console.error("Failed to load table from Stylus:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTable();
  }, [lobbyId, tableId]);

  // 2. Initialize RTC (Keeping your existing hook logic)
  const { status, sendMessage } = usePokerRTC(tableId, (incoming) => {
    if (incoming.type === "GAME_UPDATE") {
      setLiveTableData(prev => prev ? ({
        ...prev,
        current_hand: {
          ...prev.current_hand,
          ...incoming.data
        }
      }) : prev);
    } else if (incoming.type === "CHAT") {
      setMessages((prev) => [...prev, { text: incoming.text, sender: "Peer" }]);
    }
  });

  const handleSend = (e) => {
    e.preventDefault();
    if (!input) return;

    sendMessage({ type: "CHAT", text: input });
    setMessages((prev) => [...prev, { text: input, sender: "Me" }]);
    setInput("");
  };

  const handleDealTest = () => {
    const suits = ['h', 'd', 's', 'c'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

    const getRandomCard = () => ranks[Math.floor(Math.random() * ranks.length)] + suits[Math.floor(Math.random() * suits.length)];
    const newFlop = getRandomCard() + getRandomCard() + getRandomCard();

    console.log("🎲 Dealing Flop:", newFlop);

    sendMessage({
      type: "GAME_UPDATE",
      data: { community_cards: newFlop }
    });
  };

  // 3. Block render until contract data resolves
  if (isLoading || !liveTableData) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-teal-600/50 font-mono text-xs uppercase tracking-widest border border-dashed border-teal-500/20 rounded-xl p-8 bg-slate-900/30">
          Syncing Table Details from Arbitrum...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 md:px-24 md:py-8 text-white relative flex flex-col">

      {/* Header with Status */}
      <div className="max-w-7xl mx-auto w-full flex justify-between items-start mb-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase">{liveTableData.name}</h1>
        </div>

        <div className="flex items-center gap-3 bg-slate-900/80 border border-teal-500/20 px-4 py-2 rounded-xl backdrop-blur-md">
          <span className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-teal-400 animate-pulse' : 'bg-amber-500'}`} />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
            {status === 'connected' ? 'P2P_ESTABLISHED' : 'SIGNALING_PEERS...'}
          </span>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex items-center justify-center relative">
        {/* Notice currentUserName is hardcoded here, we will likely need to map this to the wallet address soon */}
        <PokerTable tableData={liveTableData} currentUserAddress={address} />

        {/* --- P2P DEBUG CHAT TERMINAL --- */}
        <div className="absolute bottom-[0px] left-[0px] w-64 h-48 bg-slate-900/90 border border-teal-500/20 rounded-lg flex flex-col overflow-hidden backdrop-blur-md shadow-2xl z-50">
          <div className="bg-slate-950 px-3 py-1 border-b border-teal-500/10 flex justify-between">
            <span className="text-[9px] font-mono text-teal-500 uppercase">Comm_Link</span>
            <span className="text-[9px] font-mono text-slate-600">ID: {tableId}</span>
          </div>
          <button
            onClick={handleDealTest}
            className="mt-2 w-full py-1 bg-teal-600 text-[9px] font-black uppercase tracking-tighter hover:bg-teal-400 text-slate-950 transition-colors"
          >
            Force Flop Deal (Broadcast)
          </button>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`text-[11px] font-mono ${m.sender === 'Me' ? 'text-cyan-400' : 'text-teal-500'}`}>
                <span className="opacity-50">[{m.sender}]:</span> {m.text}
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} className="p-2 bg-slate-950/50">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ENTER MESSAGE..."
              className="w-full bg-transparent border-none text-[11px] font-mono text-teal-400 focus:outline-none placeholder-teal-900"
            />
          </form>
        </div>
      </div>

      {isSeated && (
        <PokerActionBar
          minBet={liveTableData.current_hand.min_bet}
          maxBet={liveTableData.current_hand.max_bet}
          step={liveTableData.current_hand.bet_step}
        />
      )}
    </main>
  );
}