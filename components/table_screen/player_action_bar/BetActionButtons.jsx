import BetActionButton from '@/components/table_screen/player_action_bar/BetActionButton';

export default function BetActionButtons({
  betAmount,
  callAmount = 0,
  disabled = false,
  hideCall = false,
  hideFold = false,
  primaryLabel = 'Raise',
  primaryAmount = null,
  onFold,
  onCall,
  onRaise,
}) {
  return (
    <div className="flex justify-center gap-3 w-full">
      {!hideFold && (
        <BetActionButton kind="fold" disabled={disabled} onClick={onFold}>Fold</BetActionButton>
      )}
      {!hideCall && (
        <BetActionButton kind="call" disabled={disabled} onClick={onCall}>Call ${callAmount}</BetActionButton>
      )}
      <BetActionButton kind="raise" disabled={disabled} onClick={onRaise}>
        <span className="text-[10px] font-black uppercase tracking-widest opacity-80 group-hover:opacity-100 mb-0.5">{primaryLabel}</span>
        <span className="text-xl font-mono font-black tracking-tighter">${primaryAmount ?? betAmount}</span>
      </BetActionButton>
    </div>
  );
}
