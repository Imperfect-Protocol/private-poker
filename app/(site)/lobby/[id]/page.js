import LobbyClient from '@/components/lobby/LobbyClient';

export default async function LobbyPage({ params }) {
  const { id } = await params;
  return <LobbyClient id={id} />;
}
