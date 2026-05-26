import { Coins } from 'lucide-react';
import TableDialogOverlay from '@/components/dialog/TableDialogOverlay';

export default function TerminalResultDialog({ result, onCloseTab }) {
  const won = result?.type === 'win';
  const cheated = result?.type === 'cheated';
  const title = cheated ? result?.title : won ? 'You Won' : 'You Lose';
  const titleClass = cheated
    ? result?.cheat?.isViewerCheater ? 'text-red-300' : 'text-purple-300'
    : won ? 'text-emerald-300' : 'text-red-300';

  return (
    <TableDialogOverlay>
      <div className="bg-slate-950/50 p-6 border-b border-teal-500/20 text-center">
        <p className="text-teal-500 font-mono text-xs tracking-[0.3em] uppercase mb-1">
          Private Poker
        </p>
        <h1 className={`text-4xl font-black tracking-widest uppercase italic ${titleClass}`}>
          {title}
        </h1>
        {cheated && result?.subtitle && (
          <p className={`mt-3 font-mono text-sm font-black uppercase tracking-[0.22em] ${titleClass}`}>
            {result.subtitle}
          </p>
        )}
      </div>

      <div className="p-6 flex flex-col gap-5">
        {won && (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-yellow-300/30 bg-slate-950 px-4 py-5 text-white">
            <Coins size={24} className="text-yellow-200 drop-shadow-[0_0_10px_rgba(250,204,21,0.35)]" />
            <span className="font-mono text-2xl font-black">{result?.chips ?? 0}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onCloseTab}
          className="w-full py-3 rounded-lg bg-teal-500 text-slate-950 font-black hover:bg-teal-400 transition-colors uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(20,184,166,0.3)] cursor-pointer"
        >
          OK
        </button>
      </div>
    </TableDialogOverlay>
  );
}
