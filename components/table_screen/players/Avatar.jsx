export default function Avatar({ player, isMe, isEmptySeat, isTheirTurn }) {
  return (
    <div className={`w-14 h-14 md:w-16 md:h-16 rounded-full bg-slate-950 border-2 ${isEmptySeat ? 'border-dashed border-slate-600 shadow-none' : isMe ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]' : 'border-teal-500 shadow-[0_0_15px_rgba(20,184,166,0.5)]'} flex items-center justify-center relative overflow-hidden group-hover:scale-110 transition-transform z-10`}>
      <div className={`absolute inset-0 bg-gradient-to-tr ${isEmptySeat ? 'from-slate-800/50 to-transparent' : 'from-teal-900/50 to-transparent'}`} />
      <span className={`relative z-10 text-xl font-black uppercase italic ${isEmptySeat ? 'text-slate-600' : 'text-white'}`}>
        {isEmptySeat ? '+' : player.playerAddress?.substring(2, 4)}
      </span>

      {isTheirTurn && (
        <div className="absolute bottom-0 w-full h-1.5 bg-cyan-400 animate-pulse" />
      )}
    </div>
  );
}
