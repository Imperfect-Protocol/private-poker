import BetActionButton from '@/components/table_screen/player_action_bar/BetActionButton';
import { Coins } from 'lucide-react';

export default function BetActionButtons({
  betAmount,
  callAmount = 0,
  disabled = false,
  hideCall = false,
  hideFold = false,
  hideRaise = false,
  primaryLabel = 'Raise',
  primaryAmount = null,
  remainingChips = 0,
  onFold,
  onCall,
  onRaise,
}) {
  const actionAmount = primaryAmount ?? betAmount;
  const isCallAllIn = remainingChips > 0 && callAmount >= remainingChips;

  return (
    <div className="flex justify-center gap-3 w-full">
      {!hideFold && (
        <BetActionButton kind="fold" disabled={disabled} onClick={onFold}>Fold</BetActionButton>
      )}
      {!hideCall && (
        <BetActionButton kind={callAmount === 0 ? 'check' : 'call'} disabled={disabled} onClick={onCall}>
          {callAmount === 0 ? 'Check' : (
            <span className="inline-flex items-center justify-center gap-1.5">
              <span>{isCallAllIn ? 'All In' : 'Call'}</span>
              <AmountWithCoin amount={callAmount} iconSize={14} />
            </span>
          )}
        </BetActionButton>
      )}
      {!hideRaise && (
        <BetActionButton kind="raise" disabled={disabled} onClick={onRaise}>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-80 group-hover:opacity-100 mb-0.5">{primaryLabel}</span>
          <AmountWithCoin
            amount={actionAmount}
            iconSize={18}
            className="text-xl text-orange-950"
            iconClassName="text-orange-700 drop-shadow-none"
          />
        </BetActionButton>
      )}
    </div>
  );
}

function AmountWithCoin({ amount, iconSize, className = '', iconClassName = 'text-yellow-200 drop-shadow-[0_0_8px_rgba(250,204,21,0.35)]' }) {
  return (
    <span className={`inline-flex items-center justify-center gap-1.5 font-mono font-black tracking-tighter ${className}`}>
      <Coins size={iconSize} className={iconClassName} />
      <span>{amount}</span>
    </span>
  );
}
