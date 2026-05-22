import Slider from '@/components/slider/Component';

export default function BetRaiseSlider({ minBet, maxBet, step, betAmount, presets, onChange }) {
  return (
    <Slider
      min={minBet}
      max={maxBet}
      step={step}
      value={betAmount}
      presets={presets}
      ariaLabel="Bet amount"
      onChange={onChange}
    />
  );
}
