export function parseCards(cardString) {
  if (!cardString) return [];
  if (Array.isArray(cardString)) return cardString;

  const cards = [];
  for (let i = 0; i < cardString.length; i += 2) {
    cards.push(cardString.substring(i, i + 2));
  }
  return cards;
}

export function Card({ suit, rank, isHidden, size = "sm" }) {
  const sizeClasses = {
    lg: "w-12 h-16 md:w-16 md:h-24 text-lg md:text-xl",
    md: "w-10 h-14 md:w-12 md:h-[4.5rem] text-sm md:text-base",
    community: "w-10 h-14 md:w-11 md:h-16 text-sm md:text-base",
    sm: "w-8 h-12 text-xs",
  }[size] ?? "w-8 h-12 text-xs";
  const iconSize = {
    lg: "text-2xl md:text-3xl",
    md: "text-xl md:text-2xl",
    community: "text-xl md:text-2xl",
    sm: "text-lg",
  }[size] ?? "text-lg";

  if (isHidden) {
    return (
      <div className={`${sizeClasses} bg-white border-2 border-slate-200 rounded shadow-lg flex items-center justify-center transform transition-transform hover:-translate-y-1`}>
        <div className="m-0.5 h-full w-full rounded-sm border border-slate-300/80 bg-[linear-gradient(45deg,rgba(185,28,28,0.9)_25%,transparent_25%,transparent_75%,rgba(15,23,42,0.9)_75%),linear-gradient(45deg,rgba(15,23,42,0.9)_25%,transparent_25%,transparent_75%,rgba(185,28,28,0.9)_75%)] bg-[position:0_0,4px_4px] bg-[size:8px_8px]" />
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
