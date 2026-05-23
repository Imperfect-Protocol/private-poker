"use client";

import { useMemo, useState } from 'react';
import TableDialogOverlay from '@/components/dialog/TableDialogOverlay';
import Slider from '@/components/slider/Component';
import { OPERATOR_GAS_MAX_TOPUP } from '@/lib/constants';

function formatGwei(value) {
  const wei = BigInt(value ?? 0n);
  const roundedMilliGwei = (wei + 500_000n) / 1_000_000n;
  const whole = roundedMilliGwei / 1_000n;
  const fraction = (roundedMilliGwei % 1_000n).toString().padStart(3, '0');
  return `${whole}.${fraction}`;
}

export default function TopUpOperatorGasDialog({
  requiredAmount,
  operator,
  onConfirm,
}) {
  const [factor, setFactor] = useState(10);
  const topUpAmount = useMemo(() => {
    const requestedAmount = BigInt(requiredAmount ?? 0n) * BigInt(factor);
    return requestedAmount < OPERATOR_GAS_MAX_TOPUP ? requestedAmount : OPERATOR_GAS_MAX_TOPUP;
  }, [factor, requiredAmount]);

  return (
    <TableDialogOverlay>
      <div className="bg-slate-950/50 p-6 border-b border-teal-500/20">
        <p className="text-teal-500 font-mono text-xs tracking-[0.3em] uppercase mb-1">
          Private Poker
        </p>
        <h1 className="text-2xl font-black text-white tracking-tighter uppercase">
          Top-Up Operator Gas
        </h1>
      </div>

      <div className="p-6 flex flex-col gap-5">
        <p className="text-sm leading-6 text-slate-300">
          Your Player Operator needs gas to continue signing table and peer-to-peer transactions without more wallet prompts.
        </p>

        <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Operator</span>
            <span className="text-xs text-cyan-200">{operator?.slice(0, 6)}...{operator?.slice(-4)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Required</span>
            <span className="text-xs text-slate-300">{formatGwei(requiredAmount)} GWei</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Top-Up</span>
            <span className="text-sm font-black text-teal-300">{formatGwei(topUpAmount)} GWei</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
              Multiplier
            </span>
            <span className="text-teal-300 font-mono text-sm font-black">
              {factor}x
            </span>
          </div>
          <Slider
            min={5}
            max={25}
            step={1}
            value={factor}
            presets={[0, 25, 50, 75, 100]}
            ariaLabel="Operator top-up factor"
            onChange={setFactor}
          />
        </div>

        <button
          type="button"
          onClick={() => onConfirm?.(topUpAmount)}
          className="mt-2 py-3 rounded-lg font-black transition-colors uppercase text-xs tracking-widest bg-teal-400 text-slate-950 hover:bg-teal-300 cursor-pointer shadow-[0_0_20px_rgba(45,212,191,0.3)]"
        >
          Top Up
        </button>
      </div>
    </TableDialogOverlay>
  );
}
