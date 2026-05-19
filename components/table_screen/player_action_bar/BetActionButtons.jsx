import BetActionButton from '@/components/table_screen/player_action_bar/BetActionButton';

export default function BetActionButtons({ betAmount }) {
  return (
    <div className="flex justify-center gap-3 w-full">
      <BetActionButton kind="fold">Fold</BetActionButton>
      <BetActionButton kind="call">Call $40</BetActionButton>
      <BetActionButton kind="raise">
        <span className="text-[10px] font-black uppercase tracking-widest opacity-80 group-hover:opacity-100 mb-0.5">Raise</span>
        <span className="text-xl font-mono font-black tracking-tighter">${betAmount}</span>
      </BetActionButton>
    </div>
  );
}
