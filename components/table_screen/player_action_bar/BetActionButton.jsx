export default function BetActionButton({ kind = 'secondary', children }) {
  if (kind === 'raise') {
    return (
      <button className="flex-[2] py-1 rounded-lg bg-teal-500 text-slate-950 hover:bg-teal-400 transition-colors shadow-[0_0_20px_rgba(20,184,166,0.4)] flex flex-col items-center justify-center leading-none group cursor-pointer">
        {children}
      </button>
    );
  }

  const colorClass = kind === 'fold'
    ? 'border-red-500/50 text-red-500 hover:bg-red-500/10'
    : 'border-teal-500/50 text-teal-500 hover:bg-teal-500/10';

  return (
    <button className={`flex-1 py-2 rounded-lg border ${colorClass} font-bold transition-colors uppercase text-sm tracking-widest cursor-pointer`}>
      {children}
    </button>
  );
}
