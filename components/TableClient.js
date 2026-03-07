// components/TableClient.js
"use client";

import React, { useState } from 'react';
import PokerTable from '@/components/PokerTable';
import PokerActionBar from '@/components/PokerActionBar';
import { usePokerRTC } from '@/hooks/usePokerRTC';

export default function TableClient({ id, tableData }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");

    // Initialize RTC with a callback to handle incoming P2P messages
    const [liveTableData, setLiveTableData] = useState(tableData);

    const { status, sendMessage } = usePokerRTC(id, (incoming) => {
        if (incoming.type === "GAME_UPDATE") {
            setLiveTableData(prev => ({
                ...prev,
                current_hand: {
                    ...prev.current_hand,
                    ...incoming.data
                }
            }));
        } else if (incoming.type === "CHAT") { // Check for CHAT type
            setMessages((prev) => [...prev, { text: incoming.text, sender: "Peer" }]);
        }
    });

    const handleSend = (e) => {
        e.preventDefault();
        if (!input) return;

        const msg = { type: "CHAT", text: input }; // Added Type
        sendMessage(msg);

        setMessages((prev) => [...prev, { text: input, sender: "Me" }]);
        setInput("");
    };

    const handleDealTest = () => {
        const suits = ['h', 'd', 's', 'c'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

        // Generate 3 random cards for a "Flop"
        const getRandomCard = () => ranks[Math.floor(Math.random() * ranks.length)] + suits[Math.floor(Math.random() * suits.length)];
        const newFlop = getRandomCard() + getRandomCard() + getRandomCard();

        console.log("🎲 Dealing Flop:", newFlop);

        // BROADCAST via WebRTC
        sendMessage({
            type: "GAME_UPDATE",
            data: { community_cards: newFlop }
        });
    };

    return (
        <main className="min-h-screen bg-slate-950 p-4 md:px-24 md:py-8 text-white relative flex flex-col">

            {/* Header with Status */}
            <div className="max-w-7xl mx-auto w-full flex justify-between items-start mb-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter uppercase">{tableData.name}</h1>
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
                <PokerTable tableData={liveTableData} currentUserName="Harry" />

                {/* --- P2P DEBUG CHAT TERMINAL --- */}
                <div className="absolute bottom-[0px] left-[0px] w-64 h-48 bg-slate-900/90 border border-teal-500/20 rounded-lg flex flex-col overflow-hidden backdrop-blur-md shadow-2xl">
                    <div className="bg-slate-950 px-3 py-1 border-b border-teal-500/10 flex justify-between">
                        <span className="text-[9px] font-mono text-teal-500 uppercase">Comm_Link</span>
                        <span className="text-[9px] font-mono text-slate-600">ID: {id}</span>
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

            {tableData.current_hand !== undefined && (
                <PokerActionBar
                    minBet={tableData.current_hand.min_bet}
                    maxBet={tableData.current_hand.max_bet}
                    step={tableData.current_hand.bet_step}
                />)}
        </main>
    );
}