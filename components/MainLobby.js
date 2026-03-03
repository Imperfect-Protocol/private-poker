"use client";

import { useState, useEffect } from 'react';

export default function MainLobby({ lobbies }) {
    const [showSplash, setShowSplash] = useState(true);
    const [fadeSplash, setFadeSplash] = useState(false);

    useEffect(() => {
        // Wait 2 seconds, then start the CSS fade out
        const fadeTimer = setTimeout(() => setFadeSplash(true), 2000);
        // Wait 2.5 seconds, then remove the splash screen from the DOM entirely
        const removeTimer = setTimeout(() => setShowSplash(false), 2500);

        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(removeTimer);
        };
    }, []);

    return (
        <>
            {/* --- SPLASH SCREEN --- */}
            {showSplash && (
                <div
                    className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 transition-opacity duration-500 ease-in-out ${fadeSplash ? 'opacity-0' : 'opacity-100'
                        }`}
                >
                    {/* Splash Background Image */}
                    <div className="absolute inset-0 z-0">
                        {/* Make sure you have splash.jpg in your /public folder */}
                        <img
                            src="/splash.jpg"
                            alt="Splash Background"
                            className="w-full h-full object-cover opacity-20"
                        />
                        {/* Gradient overlay to make text pop */}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/30" />
                    </div>

                    {/* Splash Text */}
                    <div className="relative z-10 text-center flex flex-col items-center">
                        <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400 tracking-tighter uppercase mb-4 drop-shadow-[0_0_25px_rgba(20,184,166,0.6)]">
                            Private Poker
                        </h1>
                        <div className="border-t border-teal-500/50 pt-3 px-8">
                            <p className="text-teal-600 font-mono text-xs md:text-sm tracking-[0.5em] uppercase font-bold">
                                Imperfect Protocol
                            </p>
                        </div>

                        {/* Optional Loading Bar effect */}
                        <div className="mt-12 w-48 h-1 bg-slate-900 rounded-full overflow-hidden border border-teal-500/20">
                            <div className="w-full h-full bg-teal-400 animate-[pulse_1s_ease-in-out_infinite]" />
                        </div>
                    </div>
                </div>
            )}

            {/* --- NETWORK SELECTOR (Main Lobby) --- */}
            {!showSplash && (
                <main className="min-h-screen bg-slate-950 p-4 md:p-16 xl:p-24 animate-in fade-in duration-1000">
                    <div className="max-w-6xl mx-auto">

                        {/* Header */}
                        <div className="mb-12 text-center md:text-left">
                            <p className="text-teal-500 font-mono text-xs tracking-[0.3em] uppercase mb-2">
                                Imperfect Protocol // Select Node
                            </p>
                            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase">
                                Active Networks
                            </h2>
                        </div>

                        {/* Grid of Lobbies */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {lobbies.map((lobby) => {
                                const isActive = parseInt(lobby.tables) > 0;

                                return (
                                    <a
                                        key={lobby.id}
                                        // Assuming your original lobby table page is at /lobby
                                        href={isActive ? `/lobby` : '#'}
                                        className={`relative p-1 rounded-2xl transition-all duration-300 ${isActive
                                            ? 'bg-gradient-to-br from-teal-500/40 to-cyan-600/40 hover:from-teal-400 hover:to-cyan-400 shadow-[0_0_20px_rgba(20,184,166,0.1)] hover:shadow-[0_0_30px_rgba(20,184,166,0.3)] hover:-translate-y-1 group'
                                            : 'bg-slate-900 border border-slate-800 opacity-60 cursor-not-allowed'
                                            }`}
                                    >
                                        <div className="bg-slate-950 p-6 rounded-[14px] h-full flex flex-col justify-between">
                                            {/* Card Header */}
                                            <div className="mb-6">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h3 className={`text-2xl font-black uppercase tracking-tight ${isActive ? 'text-slate-100' : 'text-slate-500'}`}>
                                                        {lobby.name}
                                                    </h3>
                                                    {/* Pulse dot for active lobbies */}
                                                    {isActive && <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse mt-2 shadow-[0_0_10px_rgba(20,184,166,0.8)]" />}
                                                </div>
                                                <p className="text-xs font-mono text-slate-500 uppercase">Protocol ID: {lobby.id}</p>
                                            </div>

                                            {/* Stats Grid */}
                                            <div className="grid grid-cols-2 gap-4 mb-6">
                                                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                                                    <p className="text-[10px] text-teal-600 font-mono uppercase mb-1">Tables</p>
                                                    <p className={`font-mono font-bold ${isActive ? 'text-teal-400' : 'text-slate-600'}`}>{lobby.tables}</p>
                                                </div>
                                                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                                                    <p className="text-[10px] text-teal-600 font-mono uppercase mb-1">Players</p>
                                                    <p className={`font-mono font-bold ${isActive ? 'text-teal-400' : 'text-slate-600'}`}>{lobby.total_players}</p>
                                                </div>
                                                <div className="col-span-2 bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                                                    <p className="text-[10px] text-teal-600 font-mono uppercase mb-1">Total Volume</p>
                                                    <p className={`font-mono font-bold text-lg ${isActive ? 'text-white' : 'text-slate-600'}`}>{lobby.total_buyin}</p>
                                                </div>
                                            </div>

                                            {/* Enter Button */}
                                            <div className={`text-center py-3 rounded-lg font-bold text-xs uppercase tracking-widest transition-all ${isActive
                                                ? 'bg-slate-900 text-teal-500 border border-teal-500/50 group-hover:bg-teal-400 group-hover:text-slate-950 group-hover:border-teal-400'
                                                : 'bg-slate-900 text-slate-600 border border-slate-800'
                                                }`}>
                                                {isActive ? 'Connect' : 'Offline'}
                                            </div>
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                </main>
            )}
        </>
    );
}