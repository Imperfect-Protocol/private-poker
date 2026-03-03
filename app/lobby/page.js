import Link from 'next/link';
import GameLobby from '@/components/GameLobby';

export default async function LobbyPage() {
  const req = await fetch("http://localhost:3000/lobby.json", { cache: 'no-store' });
  const lobby = await req.json();

  return (
    <main className="min-h-screen bg-slate-950 p-4 md:px-24 md:py-8 flex flex-col items-center justify-start">
      <div className="w-full max-w-5xl">

        {/* --- NAVIGATION BAR --- */}
        <div className="mb-6 px-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-teal-600 hover:text-teal-400 font-mono text-xs uppercase tracking-[0.2em] transition-all group"
          >
            {/* The arrow moves left on hover */}
            <span className="text-lg leading-none group-hover:-translate-x-1 transition-transform shadow-[0_0_10px_rgba(20,184,166,0)] group-hover:shadow-[0_0_10px_rgba(20,184,166,0.5)]">
              ❮
            </span>
            Disconnect / Return
          </Link>
        </div>

        {/* --- HEADER SECTION --- */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-8 px-2">
          <div>
            <p className="text-teal-500 font-mono text-xs tracking-[0.3em] uppercase mb-1">
              Network Node #{lobby.id}
            </p>
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase">
              {lobby.name}
            </h1>
          </div>

          <div className="hidden md:block text-right">
            <p className="text-slate-500 text-[10px] font-mono leading-none">STATUS: CONNECTED</p>
            <p className="text-teal-400 text-xs font-mono">ACTIVE_TABLES: {lobby.tables.length}</p>
          </div>
        </div>

        {/* --- TABLE COMPONENT --- */}
        <GameLobby tables={lobby.tables} />
      </div>
    </main>
  );
}