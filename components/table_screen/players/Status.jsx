import { Coins } from 'lucide-react';

export default function Status({
  isEmptySeat,
  isMe = false,
  networkState,
  chipStack = null,
}) {
  if (isEmptySeat) {
    return <p className="text-xs font-mono text-slate-600 font-black">Sitting Out</p>;
  }

  if (networkState === 'connected') {
    return (
      <ChipAmount amount={chipStack ?? 0} isMe={isMe} />
    );
  }

  if (networkState === 'connecting') {
    return (
      <>
        <p className="text-xs font-mono text-yellow-300 font-black animate-pulse">
          Seating...
        </p>
        {chipStack != null && (
          <ChipAmount amount={chipStack} isMe={isMe} />
        )}
      </>
    );
  }

  return (
    <>
      <p className="text-xs font-mono text-slate-500 font-black">Sitting Out</p>
      {chipStack != null && (
        <ChipAmount amount={chipStack} isMe={isMe} />
      )}
    </>
  );
}

function ChipAmount({ amount, isMe = false }) {
  return (
    <p className={`mt-1 flex items-center justify-center gap-1.5 ${isMe ? 'text-[15.4px]' : 'text-sm'} font-mono text-white font-black`}>
      <Coins size={isMe ? 17 : 15} className="text-yellow-200 drop-shadow-[0_0_8px_rgba(250,204,21,0.35)]" />
      <span>{amount}</span>
    </p>
  );
}
