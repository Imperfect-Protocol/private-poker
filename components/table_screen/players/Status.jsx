export default function Status({
  isEmptySeat,
  networkState,
}) {
  if (isEmptySeat) {
    return <p className="text-xs font-mono text-slate-600 font-black">Sitting Out</p>;
  }

  if (networkState === 'connected') return null;

  if (networkState === 'connecting') {
    return (
      <p className="text-xs font-mono text-yellow-300 font-black animate-pulse">
        Seating...
      </p>
    );
  }

  return <p className="text-xs font-mono text-slate-500 font-black">Sitting Out</p>;
}
