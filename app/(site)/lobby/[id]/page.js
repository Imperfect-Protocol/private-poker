import Link from 'next/link';
import GameLobby from '@/components/GameLobby';

export default async function LobbyPage({ params }) {
  const { id } = await params;

  const req = await fetch(`http://localhost:3000/lobby-${id}.json`, { cache: 'no-store' });
  const lobby = await req.json();

  return (
    <main className="min-h-screen bg-slate-950 p-4 md:px-24 md:py-8 flex flex-col items-center justify-start">
      <div className="w-full max-w-5xl">

        <div className="flex flex-col md:flex-row justify-between items-end mb-8 px-2">
          <div>
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase">
              {lobby.name}
            </h1>
          </div>

          <div className="hidden md:block text-right">
            <p className="text-slate-500 text-[10px] font-mono leading-none">STATUS: CONNECTED</p>
            <p className="text-teal-400 text-xs font-mono">ACTIVE_TABLES: {lobby.tables.length}</p>
          </div>
        </div>

        <GameLobby tables={lobby.tables} />
      </div>
    </main>
  );
}