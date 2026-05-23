"use client";

import { useState } from 'react';
import BetActionButtons from '@/components/table_screen/player_action_bar/BetActionButtons';
import BetRaiseSlider from '@/components/table_screen/player_action_bar/BetRaiseSlider';

export default function Component({
  minBet = 20,
  maxBet = 100,
  step = 5,
  disabled = false,
  sliderDisabled = false,
  hideCall = false,
  hideFold = false,
  callAmount = 0,
  primaryLabel = 'Raise',
  primaryAmount = null,
  onFold,
  onCall,
  onRaise,
}) {
  const [betAmount, setBetAmount] = useState(minBet);
  const sliderMin = Math.min(minBet, maxBet);
  const sliderMax = Math.max(maxBet, sliderMin);
  const clampedBetAmount = Math.max(sliderMin, Math.min(betAmount, sliderMax));

  const presets = [0, 25, 50, 75, 100];

  return (
    <div className="fixed bottom-2 left-0 right-0 px-4 flex justify-center pointer-events-none z-50">
      
      {/* Changed: Reduced padding from p-4/p-6 to p-3, and reduced gap from gap-6 to gap-4 */}
      <div className="w-full max-w-xl bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-xl p-3 shadow-2xl flex flex-col gap-4 pointer-events-auto">

        <BetRaiseSlider
          minBet={sliderMin}
          maxBet={sliderMax}
          step={step}
          betAmount={clampedBetAmount}
          presets={presets}
          disabled={sliderDisabled}
          onChange={setBetAmount}
        />

        <BetActionButtons
          betAmount={clampedBetAmount}
          callAmount={callAmount}
          disabled={disabled}
          hideCall={hideCall}
          hideFold={hideFold}
          primaryLabel={primaryLabel}
          primaryAmount={primaryAmount}
          onFold={onFold}
          onCall={onCall}
          onRaise={() => onRaise?.(clampedBetAmount)}
        />

      </div>
    </div>
  );
}
