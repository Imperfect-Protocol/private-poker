// components/PokerTable.js

export default function PokerTable({ tableData, currentUserAddress = "" }) {
  // Helper to format Ethereum addresses nicely
  const formatAddress = (address) => {
    if (!address) return "0x00...0000";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // 1. ROTATION LOGIC: Find the user and move them to the front of the list
  const userIndex = tableData?.players?.findIndex(
    p => p.address?.toLowerCase() === currentUserAddress?.toLowerCase()
  ) ?? -1;

  // If user isn't found, just use the normal array, otherwise rotate it
  const rotatedPlayers = userIndex >= 0
    ? [
      ...tableData.players.slice(userIndex),
      ...tableData.players.slice(0, userIndex)
    ]
    : (tableData?.players || []);

  const clockPositions = {
    12: "top-[-5%] left-1/2 -translate-x-1/2",
    1: "top-[5%] left-[75%] -translate-x-1/2",
    2: "top-[20%] left-[92%] -translate-y-1/2",
    3: "top-1/2 left-[95%] -translate-y-1/2",
    4: "bottom-[20%] left-[92%] -translate-y-1/2",
    5: "bottom-[5%] left-[75%] -translate-x-1/2",
    6: "bottom-[-5%] left-1/2 -translate-x-1/2",
    7: "bottom-[5%] left-[25%] -translate-x-1/2",
    8: "bottom-[20%] left-[8%] -translate-y-1/2",
    9: "top-1/2 left-[5%] -translate-y-1/2",
    10: "top-[20%] left-[8%] -translate-y-1/2",
    11: "top-[5%] left-[25%] -translate-x-1/2",
  };

  // 2. SEATING MAP: Ensures the first player in rotated array gets seat 6
  const getSeatingArrangement = (numPlayers) => {
    switch (numPlayers) {
      case 2: return [6, 12];
      case 3: return [6, 10, 2];
      case 4: return [6, 9, 12, 3];
      case 6: return [6, 8, 10, 12, 2, 4];
      default: return [6, 8, 10, 12, 2, 4].slice(0, numPlayers);
    }
  };

  const activeSeats = getSeatingArrangement(rotatedPlayers.length);

  // Helper to parse card strings like "As9dThJh" or "AhJs"
  const parseCards = (cardString) => {
    if (!cardString) return [];
    const cards = [];
    for (let i = 0; i < cardString.length; i += 2) {
      cards.push(cardString.substring(i, i + 2));
    }
    return cards;
  };

  const communityCards = parseCards(tableData?.current_hand?.community_cards);
  const heroCards = parseCards(tableData?.current_hand?.player_cards);

  // Helper Component for rendering individual cards
  const Card = ({ suit, rank, isHidden, size = "sm" }) => {
    // Sizing logic so we can reuse this for big community cards and small hole cards
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
  };

  return (
    <div className="relative w-full max-w-4xl aspect-[16/9] mx-auto mt-10 mb-20">

      {/* 1. THE TABLE IMAGE */}
      <div className="absolute inset-0 rounded-[100px] border-4 border-teal-500/10 shadow-[0_0_60px_rgba(20,184,166,0.15)] overflow-hidden">
        <img
          src="/table.jpg"
          alt="Poker Table"
          className="w-full h-full object-cover brightness-75 grayscale-[20%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/20 to-slate-950/90" />
      </div>

      {/* 2. THE CENTER (Community Cards & Pot) */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">

        {/* Community Cards Array */}
        {communityCards.length > 0 && (
          <div className="flex gap-2 mb-6 pointer-events-auto">
            {communityCards.map((card, idx) => (
              <Card key={idx} rank={card[0]} suit={card[1]} isHidden={false} size="lg" />
            ))}
          </div>
        )}

        {/* Dynamic Pot */}
        <div className="text-center group pointer-events-auto">
          <div className="bg-slate-900/90 border-2 border-teal-500/40 px-8 py-3 rounded-2xl backdrop-blur-xl shadow-[0_0_30px_rgba(20,184,166,0.2)]">
            <p className="text-[10px] text-teal-400 font-mono tracking-widest uppercase mb-1">Current Pot</p>
            <p className="text-3xl font-black text-white font-mono tracking-tighter italic">
              {tableData?.current_hand?.current_pot || tableData?.total_buyin || "0"}
            </p>
          </div>
        </div>
      </div>

      {/* 3. THE PLAYERS */}
      {rotatedPlayers.map((player, index) => {
        const clockHour = activeSeats[index];
        const positionClass = clockPositions[clockHour];

        const isMe = player.address?.toLowerCase() === currentUserAddress?.toLowerCase();

        // Find their original index in the un-rotated array to check if it's their turn
        const originalIndex = tableData.players.findIndex(p => p.address === player.address);
        const isTheirTurn = tableData.current_hand?.current_player === originalIndex.toString();

        return (
          <div
            key={player.address}
            className={`absolute ${positionClass} transition-all duration-700 ease-in-out z-20`}
          >
            <div className="flex flex-col items-center group relative">

              {/* HOLE CARDS - Dynamically adjust the top margin if they are the big hero cards */}
              <div className={`absolute flex gap-1 z-0 ${isMe ? '-top-12 md:-top-16' : '-top-6'}`}>
                {isMe && heroCards.length > 0 ? (
                  heroCards.map((card, idx) => (
                    <Card key={idx} rank={card[0]} suit={card[1]} isHidden={false} size="lg" />
                  ))
                ) : (
                  <>
                    <Card isHidden={true} size="sm" />
                    <Card isHidden={true} size="sm" />
                  </>
                )}
              </div>

              {/* Avatar - Extracts first two hex chars after 0x */}
              <div className={`w-14 h-14 md:w-16 md:h-16 rounded-full bg-slate-950 border-2 ${isMe ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]' : 'border-teal-500 shadow-[0_0_15px_rgba(20,184,166,0.5)]'} flex items-center justify-center relative overflow-hidden group-hover:scale-110 transition-transform z-10`}>
                <div className="absolute inset-0 bg-gradient-to-tr from-teal-900/50 to-transparent" />
                <span className="relative z-10 text-xl font-black text-white uppercase italic">
                  {player.address?.substring(2, 4)}
                </span>

                {/* Active Player Indicator */}
                {isTheirTurn && (
                  <div className="absolute bottom-0 w-full h-1.5 bg-cyan-400 animate-pulse" />
                )}
              </div>

              {/* Stats Box */}
              <div className="mt-3 bg-slate-900/95 border border-teal-500/30 px-4 py-1.5 rounded-lg shadow-xl min-w-[110px] backdrop-blur-sm text-center z-10">
                <p className="text-[10px] font-bold text-slate-300 truncate uppercase tracking-tighter">
                  {formatAddress(player.address)}
                </p>
                <p className="text-xs font-mono text-teal-400 font-black">
                  {player.chips}
                </p>
              </div>
            </div>
          </div>
        );
      })}

    </div>
  );
}