"use client";
import { useState } from 'react';

export default function PokerActionBar({ minBet = 40, maxBet = 1000, step = 10 }) {
    // Start the slider at the minimum bet
    const [betAmount, setBetAmount] = useState(minBet);

    // Handle dragging the slider
    const handleSliderChange = (e) => {
        setBetAmount(Number(e.target.value));
    };

    // Handle clicking the specific diamond presets
    const handlePresetClick = (percent) => {
        if (percent === 0) {
            setBetAmount(minBet);
            return;
        }
        const range = maxBet - minBet;
        const rawValue = minBet + (range * (percent / 100));

        // Lock it to the nearest allowed step (e.g., nearest $10)
        const steppedValue = Math.round(rawValue / step) * step;
        setBetAmount(Math.min(maxBet, Math.max(minBet, steppedValue)));
    };

    // Calculate where the bar and thumb should be visually
    const percentFill = ((betAmount - minBet) / (maxBet - minBet)) * 100;
    const presets = [0, 25, 50, 75, 100];

    return (
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-900/90 backdrop-blur-xl border-t border-teal-500/30 flex flex-col items-center gap-6 z-50">

            {/* THE SLIDER SECTION */}
            <div className="w-full max-w-xl relative pt-4 pb-2">

                {/* The Track */}
                <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="absolute top-0 bottom-0 left-0 bg-teal-400"
                        style={{ width: `${percentFill}%` }}
                    />
                </div>

                {/* The Preset Diamonds (25%, 50%, etc.) */}
                <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-[2px]">
                    {presets.map((p) => (
                        <div
                            key={p}
                            onClick={() => handlePresetClick(p)}
                            className={`w-3 h-3 rotate-45 border transition-colors cursor-pointer z-10 ${percentFill >= p
                                ? 'bg-teal-400 border-teal-200 shadow-[0_0_10px_rgba(45,212,191,0.8)]'
                                : 'bg-slate-900 border-slate-600 hover:border-teal-500'
                                }`}
                        />
                    ))}
                </div>

                {/* The Draggable Thumb Diamond */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-teal-300 rotate-45 border-1 border-slate-950 shadow-[0_0_15px_rgba(45,212,191,1)] pointer-events-none transition-all duration-75 z-20"
                    style={{ left: `calc(${percentFill * 0.975}% - 3.5px)` }}
                />

                {/* Invisible Native Input (Handles all the drag logic cleanly) */}
                <input
                    type="range"
                    min={minBet}
                    max={maxBet}
                    step={step}
                    value={betAmount}
                    onChange={handleSliderChange}
                    className="absolute top-1/2 -translate-y-1/2 left-0 w-full h-8 opacity-0 cursor-pointer z-30"
                />
            </div>

            <div className="flex justify-center gap-4 w-full max-w-xl">
                <button className="cursor-pointer flex-1 py-3 rounded-lg border border-red-500/50 text-red-500 font-bold hover:bg-red-500/10 transition-colors uppercase text-sm tracking-widest">
                    Fold
                </button>
                <button className="cursor-pointer flex-1 py-3 rounded-lg border border-teal-500/50 text-teal-500 font-bold hover:bg-teal-500/10 transition-colors uppercase text-sm tracking-widest">
                    Call $40
                </button>
                <button className="cursor-pointer flex-[2] py-2 rounded-lg bg-teal-500 text-slate-950 hover:bg-teal-400 transition-colors shadow-[0_0_20px_rgba(20,184,166,0.4)] flex flex-col items-center justify-center leading-none group">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80 group-hover:opacity-100">Raise</span>
                    <span className="text-xl font-mono font-black tracking-tighter">${betAmount}</span>
                </button>
            </div>
        </div>
    );
}