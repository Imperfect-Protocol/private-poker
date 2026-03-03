"use client";

import { useState } from 'react';

export default function GameLobby({ tables }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTables = tables.filter((table) =>
    table.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-1 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-[0_0_30px_rgba(20,184,166,0.3)]">
      <div className="p-6 bg-slate-950 rounded-[14px] overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400 tracking-tighter uppercase m-0">
            Live Tables
          </h1>
          <div className="relative w-full md:w-72">
            <input
              type="text"
              placeholder="SEARCH PROTOCOL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-teal-500/30 text-teal-400 text-xs font-mono px-4 py-2.5 rounded-lg focus:outline-none focus:border-teal-400 focus:shadow-[0_0_15px_rgba(20,184,166,0.2)] placeholder-teal-700/50 transition-all"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
          </div>
        </div>

        <div className="overflow-auto max-h-[420px] pr-2 custom-scrollbar">
          <table className="w-full text-left border-separate border-spacing-y-3">
            <thead>
              <tr className="text-teal-500/60 text-xs uppercase tracking-[0.2em] font-bold">
                <th className="px-4 py-2">Session</th>
                <th className="px-4 py-2 text-center">Stakes</th>
                <th className="px-4 py-2 text-center">Capacity</th>
                <th className="px-4 py-2 text-center">Network</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTables.map((table) => {
                const isFull = parseInt(table.current_players) >= parseInt(table.max_players);
                const isPlaying = (table.state === "playing");
                return (
                  <tr key={table.id} className="group">
                    <td className="px-4 py-4 bg-slate-900/50 border-y border-l border-teal-500/30 group-hover:border-teal-400 group-hover:bg-slate-900 transition-all rounded-l-xl">
                      <div className="font-bold text-slate-100">{table.name}</div>
                      <div className="text-[10px] text-teal-500/70 font-mono italic">{table.game}</div>
                    </td>

                    <td className="px-4 py-4 bg-slate-900/50 border-y border-teal-500/30 group-hover:border-teal-400 group-hover:bg-slate-900 transition-all text-center">
                      <div className="text-cyan-400 font-mono font-bold">{table.buyin}</div>
                      <div className="text-[10px] text-slate-400 italic">BLINDS {table.blinds}</div>
                    </td>

                    <td className="px-4 py-4 bg-slate-900/50 border-y border-teal-500/30 group-hover:border-teal-400 group-hover:bg-slate-900 transition-all text-center text-teal-400 font-mono">
                      {table.current_players}/{table.max_players}
                    </td>

                    <td className="px-4 py-4 bg-slate-900/50 border-y border-teal-500/30 group-hover:border-teal-400 group-hover:bg-slate-900 transition-all text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${table.state === 'seating'
                        ? 'border-teal-500 text-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.4)]'
                        : 'border-amber-500/50 text-amber-500'
                        }`}>
                        {table.state}
                      </span>
                    </td>

                    <td className="px-4 py-4 bg-slate-900/50 border-y border-r border-teal-500/30 group-hover:border-teal-400 group-hover:bg-slate-900 transition-all rounded-r-xl text-right">
                      <a
                        href={`/tables/${table.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-block px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all ${isPlaying || isFull
                          ? 'bg-slate-900 text-teal-500 border border-teal-500/50 hover:border-teal-400 hover:text-teal-400 hover:bg-teal-900/40 hover:shadow-[0_0_15px_rgba(20,184,166,0.3)]'
                          : 'bg-teal-400 text-slate-950 hover:bg-teal-300 shadow-[0_0_15px_rgba(20,184,166,0.4)]'
                          }`}
                      >
                        {isPlaying || isFull ? 'Spec' : 'Enter'}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}