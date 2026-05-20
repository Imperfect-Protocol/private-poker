export default function Status({
  isEmptySeat,
  player,
}) {
  if (isEmptySeat) {
    return <p className="text-xs font-mono text-slate-600 font-black">Sitting out</p>;
  }

  return (
    <p className="text-xs font-mono text-teal-400 font-black">
      {player.chips}
    </p>
  );
}
