const formatAddress = (address) => {
  if (!address) return "0x00...0000";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export default function Name({ player, isEmptySeat, isMe = false }) {
  return (
    <p className={`${isMe ? 'text-[11px]' : 'text-[10px]'} font-bold truncate uppercase tracking-tighter ${isEmptySeat ? 'text-slate-600' : 'text-slate-300'}`}>
      {isEmptySeat ? 'Open Seat' : player.displayName || formatAddress(player.playerAddress)}
    </p>
  );
}
