export default function BetRaiseSlider({ minBet, maxBet, step, betAmount, percentFill, presets, onChange }) {
  return (
    <div className="relative w-full max-w-md h-8 flex items-center mx-auto">
      <div className="absolute left-0 right-0 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="absolute top-0 bottom-0 left-0 bg-teal-400 transition-all duration-75"
          style={{ width: `${percentFill}%` }}
        />
      </div>

      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none">
        {presets.map((preset) => (
          <div
            key={preset}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border transition-colors z-10 ${
              percentFill >= preset
                ? 'bg-teal-400 border-teal-200 shadow-[0_0_10px_rgba(45,212,191,0.8)]'
                : 'bg-slate-900 border-slate-600'
            }`}
            style={{ left: `${preset}%` }}
          />
        ))}
      </div>

      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-teal-300 rotate-45 border border-slate-950 shadow-[0_0_15px_rgba(45,212,191,1)] pointer-events-none transition-all duration-75 z-20"
        style={{ left: `${percentFill}%` }}
      />

      <input
        type="range"
        min={minBet}
        max={maxBet}
        step={step}
        value={betAmount}
        onChange={(event) => onChange(Number(event.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
      />
    </div>
  );
}
