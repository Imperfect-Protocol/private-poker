import { useState } from 'react';

export default function PokerActionBar({ minBet = 20, maxBet = 100, step = 5 }) {
  const [betAmount, setBetAmount] = useState(minBet);

  const handleSliderChange = (e) => {
    setBetAmount(Number(e.target.value));
  };

  const percentFill = ((betAmount - minBet) / (maxBet - minBet)) * 100;
  const presets = [0, 25, 50, 75, 100];

  return (
    <div className="fixed bottom-2 left-0 right-0 px-4 flex justify-center pointer-events-none z-50">

      <div className="w-full max-w-xl bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-xl p-3 shadow-2xl flex flex-col gap-4 pointer-events-auto">

        {/* THE SLIDER SECTION */}
        <div className="relative w-full max-w-md h-8 flex items-center mx-auto">

          {/* The Track Background */}
          <div className="absolute left-0 right-0 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="absolute top-0 bottom-0 left-0 bg-teal-400 transition-all duration-75"
              style={{ width: `${percentFill}%` }}
            />
          </div>

          {/* The Visual Preset Diamonds */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none">
            {presets.map((p) => (
              <div
                key={p}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border transition-colors z-10 ${percentFill >= p
                  ? 'bg-teal-400 border-teal-200 shadow-[0_0_10px_rgba(45,212,191,0.8)]'
                  : 'bg-slate-900 border-slate-600'
                  }`}
                style={{ left: `${p}%` }}
              />
            ))}
          </div>

          {/* The Draggable Thumb Diamond */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-teal-300 rotate-45 border border-slate-950 shadow-[0_0_15px_rgba(45,212,191,1)] pointer-events-none transition-all duration-75 z-20"
            style={{ left: `${percentFill}%` }}
          />

          {/* Invisible Native Input */}
          <input
            type="range"
            min={minBet}
            max={maxBet}
            step={step}
            value={betAmount}
            onChange={handleSliderChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
          />
        </div>

        {/* THE BUTTONS SECTION */}
        <div className="flex justify-center gap-3 w-full">
          <button className="flex-1 py-2 rounded-lg border border-red-500/50 text-red-500 font-bold hover:bg-red-500/10 transition-colors uppercase text-sm tracking-widest cursor-pointer">
            Fold
          </button>
          <button className="flex-1 py-2 rounded-lg border border-teal-500/50 text-teal-500 font-bold hover:bg-teal-500/10 transition-colors uppercase text-sm tracking-widest cursor-pointer">
            Call $40
          </button>

          <button className="flex-[2] py-1 rounded-lg bg-teal-500 text-slate-950 hover:bg-teal-400 transition-colors shadow-[0_0_20px_rgba(20,184,166,0.4)] flex flex-col items-center justify-center leading-none group cursor-pointer">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-80 group-hover:opacity-100 mb-0.5">Raise</span>
            <span className="text-xl font-mono font-black tracking-tighter">${betAmount}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
