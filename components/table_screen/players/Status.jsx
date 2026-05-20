export default function Status({
  isEmptySeat,
  isMe,
  player,
  isNetworkJoined,
  currentUserBlsKey,
  isJoiningNetwork,
  onJoinNetwork,
}) {
  if (isEmptySeat) {
    return <p className="text-xs font-mono text-slate-600 font-black">Sitting out</p>;
  }

  if (isMe && !isNetworkJoined && currentUserBlsKey) {
    return (
      <p className="mt-1 text-[9px] font-mono font-black uppercase tracking-widest text-amber-300 motion-safe:animate-pulse">
        Seating...
      </p>
    );
  }

  if (!isNetworkJoined && (!isMe || !currentUserBlsKey)) {
    if (!isMe) {
      return <p className="text-xs font-mono text-amber-300 font-black">Sitting out</p>;
    }

    return (
      <button
        type="button"
        onClick={onJoinNetwork}
        disabled={isJoiningNetwork}
        className="mt-1 rounded-md border border-amber-300/70 bg-amber-400/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.25)] transition-all hover:border-amber-200 hover:bg-amber-300 hover:text-slate-950 disabled:opacity-60 motion-safe:animate-pulse"
      >
        Take a seat
      </button>
    );
  }

  return (
    <p className="text-xs font-mono text-teal-400 font-black">
      {player.chips}
    </p>
  );
}
