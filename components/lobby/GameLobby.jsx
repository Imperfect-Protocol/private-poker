"use client";

import { useEffect, useState, useMemo } from 'react';
import { useRtcSessionPool } from '@/hooks/useRtcSessionPool';

const formatSeat = (value) => (value ? value.slice(2, 4).toUpperCase() : '??');

// 1. EXTRACTED COMPONENT: Prevents unmounting/remounting on every parent render
const TableRow = ({ table, highlight = false, isJoined= false }) => {
  const { id, name, game, buyin, blinds, current_players, max_players, state } = table;

  const currentCount = parseInt(current_players, 10);
  const maxCount = parseInt(max_players, 10);
  const isFull = currentCount >= maxCount;
  const isPlaying = state === "playing";

  return (
    <tr className="group transition-colors duration-200">
      <td className={`px-4 py-4 bg-slate-900/60 backdrop-blur-sm border-y border-l transition-all rounded-l-xl ${highlight ? 'border-yellow-500/50 bg-slate-900/90' : 'border-teal-500/20 group-hover:border-teal-400 group-hover:bg-slate-900'}`}>
        <div className="font-bold text-slate-100 flex items-center gap-2">
          {name}
          {isJoined && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping shadow-[0_0_8px_rgba(250,204,21,0.8)]" aria-label="Active Session" />}
        </div>
        <div className="text-[10px] text-teal-500/70 font-mono italic">{game}</div>
      </td>

      <td className={`px-4 py-4 bg-slate-900/60 backdrop-blur-sm border-y transition-all text-center ${highlight ? 'border-yellow-500/50' : 'border-teal-500/20 group-hover:border-teal-400 group-hover:bg-slate-900'}`}>
        <div className="text-cyan-400 font-mono font-bold">{buyin}</div>
        <div className="text-[10px] text-slate-400 italic uppercase">Blinds {blinds}</div>
      </td>

      <td className={`px-4 py-4 bg-slate-900/60 backdrop-blur-sm border-y transition-all text-center font-mono ${highlight ? 'border-yellow-500/50' : 'border-teal-500/20 group-hover:border-teal-400 group-hover:bg-slate-900'}`}>
        <span className={isFull && !isJoined ? 'text-slate-500' : 'text-teal-400'}>
          {currentCount}/{maxCount}
        </span>
      </td>

      <td className={`px-4 py-4 bg-slate-900/60 backdrop-blur-sm border-y transition-all text-center ${highlight ? 'border-yellow-500/50' : 'border-teal-500/20 group-hover:border-teal-400 group-hover:bg-slate-900'}`}>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border tracking-wider ${isJoined ? 'border-yellow-500 text-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.3)]' :
          state === 'seating' ? 'border-teal-500 text-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.3)]' :
            'border-amber-500/50 text-amber-500'
          }`}>
          {isJoined ? 'ACTIVE' : state}
        </span>
      </td>

      <td className={`px-4 py-4 bg-slate-900/60 backdrop-blur-sm border-y border-r transition-all rounded-r-xl text-right ${highlight ? 'border-yellow-500/50' : 'border-teal-500/20 group-hover:border-teal-400 group-hover:bg-slate-900'}`}>
        <a
          href={`/tables/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-block px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${isJoined
            ? 'bg-yellow-500 text-slate-950 hover:bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.4)] focus-visible:ring-yellow-400'
            : (isPlaying || isFull)
              ? 'bg-slate-900 text-teal-500 border border-teal-500/50 hover:border-teal-400 focus-visible:ring-teal-500'
              : 'bg-teal-400 text-slate-950 hover:bg-teal-300 shadow-[0_0_15px_rgba(20,184,166,0.4)] focus-visible:ring-teal-400'
            }`}
        >
          {isJoined ? "Return" : isPlaying || isFull ? 'Watch' : 'Join'}
        </a>
      </td>
    </tr>
  );
};

export default function GameLobby({ tables = [], lobbyId, userTables = [] }) {
  useRtcSessionPool({ role: 'lobby' });
  const [searchQuery, setSearchQuery] = useState('');
  const [waitingPeer, setWaitingPeer] = useState(null);

  useEffect(() => {
    const handleWaitingPeer = (event) => {
      const detail = event.detail ?? {};
      if (String(detail.lobbyId) !== String(lobbyId)) return;
      setWaitingPeer(detail);
    };

    window.addEventListener('private-poker:peer-waiting-for-table', handleWaitingPeer);
    return () => {
      window.removeEventListener('private-poker:peer-waiting-for-table', handleWaitingPeer);
    };
  }, [lobbyId]);

  // 2. MEMOIZATION: Only recalculate arrays when data or search changes
  const { myTables, otherTables } = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return tables.reduce((acc, table) => {
      // Check if the current table ID is in the user's list of joined tables
      const isSeated = userTables.includes(table.id.toString());

      if (isSeated) {
        acc.myTables.push(table);
      } else if (table.name.toLowerCase().includes(query)) {
        acc.otherTables.push(table);
      }
      
      return acc;
    }, { myTables: [], otherTables: [] });
  }, [tables, searchQuery, userTables]);

  return (
    <div className="flex flex-col gap-8 w-full">
      {waitingPeer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-6 py-10 backdrop-blur-sm">
          <div className="w-[min(520px,100%)] rounded-2xl border border-yellow-300/45 bg-slate-950 p-2 shadow-[0_0_60px_rgba(250,204,21,0.22)]">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-7 py-8 text-center sm:px-9 sm:py-9">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-yellow-300/50 bg-yellow-300/10 shadow-[0_0_24px_rgba(250,204,21,0.18)]">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-300 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-yellow-200" />
                </span>
              </div>

              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.32em] text-yellow-300">
                Connection Request
              </p>
              <h2 className="mt-3 text-2xl font-black uppercase leading-tight tracking-tight text-slate-50 sm:text-3xl">
                {formatSeat(waitingPeer.from)} is waiting for you
              </h2>

              <div className="mx-auto mt-5 max-w-sm rounded-lg border border-slate-700/80 bg-slate-950/80 px-5 py-4">
                <p className="font-mono text-xs leading-6 text-slate-300">
                  Their lobby can reach you over the silent RTC pool, but this table needs your tab open before the poker channel can complete.
                </p>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  Table {waitingPeer.tableId}
                </p>
              </div>

              <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
                <a
                  href={`/tables/${waitingPeer.tableId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWaitingPeer(null)}
                  className="cursor-pointer rounded-lg bg-yellow-300 px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-950 transition-colors hover:bg-yellow-200"
                >
                  Open Table
                </a>
                <button
                  type="button"
                  onClick={() => setWaitingPeer(null)}
                  className="cursor-pointer rounded-lg border border-slate-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SECTION 1: MY ACTIVE SESSIONS --- */}
      {myTables.length > 0 && (
        <section aria-label="Your Active Sessions">
          <div className="p-1 bg-gradient-to-br from-yellow-500/40 to-orange-600/40 rounded-2xl shadow-[0_0_40px_rgba(234,179,8,0.1)] transition-all hover:shadow-[0_0_50px_rgba(234,179,8,0.2)]">
            <div className="p-6 bg-slate-950/95 backdrop-blur-md rounded-[14px]">
              <h2 className="text-xl font-black text-yellow-500 tracking-tighter uppercase mb-4 flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                </span>
                Your Active Protocols
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-separate border-spacing-y-2 min-w-[600px]">
                  <tbody>
                    {myTables.map(table => (
                      <TableRow key={`active-${table.id}`} table={table} highlight={true} isJoined={true} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* --- SECTION 2: DISCOVER TABLES --- */}
      <section aria-label="Available Tables">
        <div className="p-1 bg-gradient-to-br from-teal-500/80 to-cyan-600/80 rounded-2xl shadow-[0_0_30px_rgba(20,184,166,0.15)] transition-all hover:shadow-[0_0_40px_rgba(20,184,166,0.25)]">
          <div className="p-6 bg-slate-950/95 backdrop-blur-md rounded-[14px] overflow-hidden">

            <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
              <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400 tracking-tighter uppercase m-0 whitespace-nowrap">
                Live Tables
              </h2>

              <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">

                {/* 2. The Create Table Button */}
                <a
                  href={`/tables/create?lobbyId=${lobbyId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whitespace-nowrap px-6 py-3 rounded-lg font-bold text-xs uppercase tracking-widest bg-slate-900 border-2 border-teal-400 text-teal-400 hover:bg-teal-400 hover:text-slate-950 transition-all shadow-[0_0_15px_rgba(45,212,191,0.15)] hover:shadow-[0_0_20px_rgba(45,212,191,0.5)] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                >
                  + Create New Table
                </a>

                {/* 3. The Search Bar */}
                <div className="relative w-full md:w-80 group flex-shrink-0">
                  <input
                    type="search"
                    placeholder="SEARCH PROTOCOL..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-full min-h-[44px] bg-slate-900 border border-teal-500/30 text-teal-400 text-xs font-mono px-4 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 placeholder-teal-700/50 transition-all shadow-inner"
                    aria-label="Search available tables"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-teal-400/50 group-focus-within:bg-teal-400 group-focus-within:animate-pulse transition-colors" />
                </div>
              </div>
            </header>

            <div className="overflow-auto max-h-[420px] pr-2 custom-scrollbar">
              <table className="w-full text-left border-separate border-spacing-y-3 min-w-[600px]">
                <thead className="sticky top-0 bg-slate-950/95 backdrop-blur-md z-10 shadow-[0_10px_10px_-5px_rgba(2,6,23,0.8)]">
                  <tr className="text-teal-500/60 text-[10px] uppercase tracking-[0.2em] font-bold">
                    <th scope="col" className="px-4 py-3 font-medium">Session</th>
                    <th scope="col" className="px-4 py-3 text-center font-medium">Stakes</th>
                    <th scope="col" className="px-4 py-3 text-center font-medium">Capacity</th>
                    <th scope="col" className="px-4 py-3 text-center font-medium">Network</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {otherTables.length > 0 ? (
                    otherTables.map(table => (
                      <TableRow key={`open-${table.id}`} table={table} />
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="text-center py-16 text-teal-600/50 font-mono text-xs uppercase tracking-widest border border-dashed border-teal-500/20 rounded-xl bg-slate-900/30">
                        {searchQuery ? `No tables match "${searchQuery}"` : "No tables available."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
