export default function Status({
  isEmptySeat,
  networkState,
  chipStack = null,
}) {
  if (isEmptySeat) {
    return <p className="text-xs font-mono text-slate-600 font-black">Sitting Out</p>;
  }

  if (networkState === 'connected') {
    return (
      <p className="text-xs font-mono text-emerald-200 font-black">
        {chipStack ?? 0} CHIPS
      </p>
    );
  }

  if (networkState === 'connecting') {
    return (
      <>
        <p className="text-xs font-mono text-yellow-300 font-black animate-pulse">
          Seating...
        </p>
        {chipStack != null && (
          <p className="text-[10px] font-mono text-slate-400 font-black">
            {chipStack} CHIPS
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <p className="text-xs font-mono text-slate-500 font-black">Sitting Out</p>
      {chipStack != null && (
        <p className="text-[10px] font-mono text-slate-400 font-black">
          {chipStack} CHIPS
        </p>
      )}
    </>
  );
}
