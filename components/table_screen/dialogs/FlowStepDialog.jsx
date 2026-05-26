"use client";

import TableDialogOverlay from '@/components/dialog/TableDialogOverlay';

const STATUS_STYLES = {
  '': 'bg-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.75)]',
  pending: 'bg-slate-700',
  unverified: 'bg-slate-600',
  verifying: 'bg-yellow-400 animate-pulse shadow-[0_0_12px_rgba(250,204,21,0.8)]',
  listening: 'bg-sky-300 animate-pulse shadow-[0_0_12px_rgba(125,211,252,0.65)]',
  connecting: 'bg-yellow-400 animate-pulse shadow-[0_0_12px_rgba(250,204,21,0.8)]',
  active: 'bg-yellow-400 animate-pulse shadow-[0_0_12px_rgba(250,204,21,0.8)]',
  connected: 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]',
  complete: 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]',
  error: 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]',
  'not connected': 'bg-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.75)]',
  'peer subscribed': 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]',
  'no subscribers': 'bg-slate-600 shadow-[0_0_10px_rgba(148,163,184,0.28)]',
  poke: 'bg-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.75)]',
  optional: 'bg-slate-500',
};

const STATUS_TEXT_STYLES = {
  connected: 'text-emerald-300',
  complete: 'text-emerald-300',
  'peer subscribed': 'text-emerald-300',
  connecting: 'text-yellow-300',
  verifying: 'text-yellow-300',
  active: 'text-yellow-300',
  'not connected': 'text-yellow-300',
  listening: 'text-sky-300',
  error: 'text-red-300',
  'no subscribers': 'text-slate-400',
};

function StepRow({ label, status = 'pending', statusTone, action, children }) {
  const styleStatus = statusTone ?? status;
  const statusTextClass = STATUS_TEXT_STYLES[styleStatus] ?? 'text-slate-500';

  return (
    <div className="flex flex-col gap-3 bg-slate-950 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${STATUS_STYLES[styleStatus] ?? STATUS_STYLES.pending}`} />
          <span className="text-slate-200 font-mono text-xs uppercase tracking-widest">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {status && (
            <span className={`text-[10px] font-mono uppercase tracking-widest ${statusTextClass}`}>
              {status}
            </span>
          )}
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
  showOk = true,
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
            <StepRow key={step.id} label={step.label} status={step.status} statusTone={step.statusTone} action={step.action}>
              {step.body}
            </StepRow>
          ))}

        </div>

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-400 text-xs font-bold uppercase tracking-widest text-center">
            {error}
          </div>
        )}

        {showOk && (
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
        )}
      </div>
    </TableDialogOverlay>
  );
}
