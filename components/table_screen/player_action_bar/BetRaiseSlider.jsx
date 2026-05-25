import Slider from '@/components/slider/Component';

export default function BetRaiseSlider({
  minBet,
  maxBet,
  step,
  betAmount,
  presets,
  disabled = false,
  onChange,
}) {
  return (
    <div className={disabled ? 'opacity-45 grayscale pointer-events-none' : ''}>
      <Slider
        min={minBet}
        max={maxBet}
        step={step}
        value={betAmount}
        presets={presets}
        ariaLabel="Bet amount"
        disabled={disabled}
        hideHandle={disabled}
        colorScheme="heat"
        onChange={onChange}
      />
    </div>
  );
}
