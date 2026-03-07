import LobbyCard from '@/components/LobbyCard.js';

export default async function MainLobbyPage() {
    const req = await fetch("http://localhost:3000/game.json", { cache: 'no-store' });
    const data = await req.json();
    const lobbies = data.lobbies;

    return (
        <main className="min-h-screen bg-slate-950 p-4 md:px-24 md:py-8 flex flex-col items-center justify-start">
            <div className="w-full max-w-5xl">
                <div className="flex flex-col md:flex-row justify-between items-end mb-8 px-2">
                    <h1 className="text-4xl font-black text-white tracking-tighter uppercase">
                        Lobbies
                    </h1>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {lobbies.map((lobby) => (
                        <LobbyCard key={lobby.id} lobby={lobby} />
                    ))}
                </div>
            </div>
        </main>
    );
}