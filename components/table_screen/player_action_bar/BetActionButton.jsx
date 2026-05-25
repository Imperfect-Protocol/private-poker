export default function BetActionButton({
  kind = 'secondary',
  disabled = false,
  onClick,
  children,
}) {
  if (kind === 'raise') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="flex-[2] py-1 rounded-lg bg-amber-400 text-slate-950 hover:bg-yellow-300 transition-colors shadow-[0_0_20px_rgba(251,191,36,0.35)] flex flex-col items-center justify-center leading-none group cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {children}
      </button>
    );
  }

  const colorClass = kind === 'fold'
    ? 'border-red-500/50 text-red-500 hover:bg-red-500/10'
    : kind === 'call'
      ? 'border-amber-300/60 text-amber-200 hover:bg-amber-400/10'
    : 'border-sky-400/50 text-sky-300 hover:bg-sky-400/10';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 py-2 rounded-lg border ${colorClass} font-bold transition-colors uppercase text-sm tracking-widest cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}
