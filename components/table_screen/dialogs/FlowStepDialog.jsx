"use client";

import TableDialogOverlay from '@/components/dialog/TableDialogOverlay';

const STATUS_STYLES = {
  pending: 'bg-slate-700',
  active: 'bg-yellow-400 animate-pulse shadow-[0_0_12px_rgba(250,204,21,0.8)]',
  complete: 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]',
  error: 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]',
  optional: 'bg-slate-500',
};

function StepRow({ label, status = 'pending', action, children }) {
  return (
    <div className="flex flex-col gap-3 bg-slate-950 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${STATUS_STYLES[status] ?? STATUS_STYLES.pending}`} />
          <span className="text-slate-200 font-mono text-xs uppercase tracking-widest">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
            {status}
          </span>
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function FlowStepDialog({
  title,
  description,
  steps,
  error,
  isComplete,
  onOk,
}) {
  return (
    <TableDialogOverlay>
      <div className="bg-slate-950/50 p-6 border-b border-teal-500/20">
        <p className="text-teal-500 font-mono text-xs tracking-[0.3em] uppercase mb-1">
          Private Poker
        </p>
        <h1 className="text-2xl font-black text-white tracking-tighter uppercase">
          {title}
        </h1>
      </div>

      <div className="p-6 flex flex-col gap-4">
        <p className="text-sm leading-6 text-slate-300">
          {description}
        </p>

        <div className="flex flex-col gap-3">
          {steps.map((step) => (
            <StepRow key={step.id} label={step.label} status={step.status} action={step.action}>
              {step.body}
            </StepRow>
          ))}

        </div>

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-400 text-xs font-bold uppercase tracking-widest text-center">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={onOk}
          disabled={!isComplete}
          className={`mt-2 py-3 rounded-lg font-black transition-colors uppercase text-xs tracking-widest ${
            isComplete
              ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300 cursor-pointer shadow-[0_0_20px_rgba(52,211,153,0.3)]'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          OK
        </button>
      </div>
    </TableDialogOverlay>
  );
}
