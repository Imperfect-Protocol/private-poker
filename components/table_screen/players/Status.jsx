import { Coins } from 'lucide-react';

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
      <ChipAmount amount={chipStack ?? 0} />
    );
  }

  if (networkState === 'connecting') {
    return (
      <>
        <p className="text-xs font-mono text-yellow-300 font-black animate-pulse">
          Seating...
        </p>
        {chipStack != null && (
          <ChipAmount amount={chipStack} />
        )}
      </>
    );
  }

  return (
    <>
      <p className="text-xs font-mono text-slate-500 font-black">Sitting Out</p>
      {chipStack != null && (
        <ChipAmount amount={chipStack} />
      )}
    </>
  );
}

function ChipAmount({ amount }) {
  return (
    <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-mono text-white font-black">
      <Coins size={15} className="text-yellow-200 drop-shadow-[0_0_8px_rgba(250,204,21,0.35)]" />
      <span>{amount}</span>
    </p>
  );
}
