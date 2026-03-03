import MainLobby from '@/components/MainLobby';

export default async function Home() {
  // Fetching your lobbies.json
  const req = await fetch("http://localhost:3000/game.json", { cache: 'no-store' });
  const data = await req.json();

  return <MainLobby lobbies={data.lobbies} />;
}