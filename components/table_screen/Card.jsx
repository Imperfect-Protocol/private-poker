export function parseCards(cardString) {
  if (!cardString) return [];

  const cards = [];
  for (let i = 0; i < cardString.length; i += 2) {
    cards.push(cardString.substring(i, i + 2));
  }
  return cards;
}

export function Card({ suit, rank, isHidden, size = "sm" }) {
  const sizeClasses = size === "lg"
    ? "w-12 h-16 md:w-16 md:h-24 text-lg md:text-xl"
    : "w-8 h-12 text-xs";
  const iconSize = size === "lg" ? "text-2xl md:text-3xl" : "text-lg";

  if (isHidden) {
    return (
      <div className={`${sizeClasses} bg-slate-800 border-2 border-slate-600 rounded shadow-lg flex items-center justify-center transform transition-transform hover:-translate-y-1`}>
        <div className="w-full h-full border border-slate-700/50 m-0.5 rounded-sm bg-[radial-gradient(circle,_#334155_1px,_transparent_1px)] bg-[size:4px_4px]" />
      </div>
    );
  }

  const isRed = suit === 'h' || suit === 'd';
  const suitSymbol = { s: '♠', h: '♥', d: '♦', c: '♣' }[suit];
  const displayRank = rank === 'T' ? '10' : rank;

  return (
    <div className={`${sizeClasses} bg-slate-100 rounded border-2 border-slate-300 shadow-md flex flex-col items-center justify-center transform transition-transform hover:-translate-y-1`}>
      <span className={`font-black leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>{displayRank}</span>
      <span className={`${iconSize} leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>{suitSymbol}</span>
    </div>
  );
}
