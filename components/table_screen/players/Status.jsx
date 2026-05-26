import { Coins } from 'lucide-react';

const MAX_STACK = 1000;
const METER_SEGMENTS = 12;

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
      <ChipStack amount={chipStack ?? 0} isMe={isMe} />
    );
  }

  if (networkState === 'connecting') {
    return (
      <>
        <p className="text-xs font-mono text-yellow-300 font-black animate-pulse">
          Seating...
        </p>
        {chipStack != null && (
          <ChipStack amount={chipStack} isMe={isMe} />
        )}
      </>
    );
  }

  if (networkState === 'disconnected') {
    return (
      <>
        <p className="text-xs font-mono text-red-300 font-black animate-pulse">
          Disconnected
        </p>
        {chipStack != null && (
          <ChipStack amount={chipStack} isMe={isMe} />
        )}
      </>
    );
  }

  return (
    <>
      <p className="text-xs font-mono text-slate-500 font-black">Sitting Out</p>
      {chipStack != null && (
        <ChipStack amount={chipStack} isMe={isMe} />
      )}
    </>
  );
}

function ChipStack({ amount, isMe = false }) {
  return (
    <>
      <ChipAmount amount={amount} isMe={isMe} />
      <LifeMeter amount={amount} isMe={isMe} />
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

function LifeMeter({ amount, isMe = false }) {
  const ratio = Math.max(0, Math.min(Number(amount ?? 0) / MAX_STACK, 1));
  const filledSegments = Math.ceil(ratio * METER_SEGMENTS);
  const fillClass = ratio > 0.66
    ? 'bg-yellow-300 shadow-[0_0_7px_rgba(250,204,21,0.75)]'
    : ratio > 0.33
      ? 'bg-orange-400 shadow-[0_0_7px_rgba(251,146,60,0.72)]'
      : 'bg-red-500 shadow-[0_0_7px_rgba(239,68,68,0.74)]';

  return (
    <div className={`mx-auto mt-1 grid ${isMe ? 'w-[6.25rem]' : 'w-[5.75rem]'} grid-cols-12 gap-0.5`}>
      {Array.from({ length: METER_SEGMENTS }, (_, index) => (
        <div
          key={index}
          className={`h-1.5 rounded-[1px] border border-slate-950/60 ${index < filledSegments ? fillClass : 'bg-slate-800/85'}`}
        />
      ))}
    </div>
  );
}
