"use client";

import { useState } from 'react';
import TableDialogOverlay from '@/components/dialog/TableDialogOverlay';

export default function BuyInDialog({ tableData, lobbyId, onClose, onJoinRequest }) {
  const [isPending, setIsPending] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const closeDialog = (afterClose) => {
    setIsClosing(true);
    setTimeout(afterClose, 220);
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setSubmitError("");

    try {
      setIsPending(true);
      const request = {
        lobbyId,
        tableId: tableData.id,
        tableName: tableData.name,
        buyIn: tableData.buyin,
        blinds: tableData.blinds,
        stakesLabel: tableData.stakes,
      };
      closeDialog(() => onJoinRequest?.(request));
    } catch (error) {
      console.error(error);
      setSubmitError(error.shortMessage || error.details || error.message || "Transaction failed or rejected.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <TableDialogOverlay isClosing={isClosing}>
      <div className="bg-slate-950/50 p-6 border-b border-teal-500/20">
        <p className="text-teal-500 font-mono text-xs tracking-[0.3em] uppercase mb-1">
          Private Poker
        </p>
        <h1 className="text-2xl font-black text-white tracking-tighter uppercase">
          Join {tableData.name}
        </h1>
      </div>

      <div className="p-6 flex flex-col gap-5">
        <div className="flex justify-between items-center p-4 bg-slate-950 border border-slate-800 rounded-lg">
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Required Buy-in</span>
          <span className="text-teal-400 font-mono font-bold text-lg">
            {tableData.buyin} CHIPS
          </span>
        </div>

        {submitError && (
          <div className="p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-400 text-xs font-bold uppercase tracking-widest text-center">
            {submitError}
          </div>
        )}

        <div className="flex gap-4 mt-2 pt-6 border-t border-slate-800">
          <button
            type="button"
            onClick={() => closeDialog(onClose)}
            disabled={isPending}
            className="flex-1 py-3 rounded-lg border border-slate-700 text-slate-400 font-bold hover:bg-slate-800 hover:text-slate-200 transition-colors uppercase text-xs tracking-widest disabled:opacity-50 cursor-pointer"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleJoin}
            disabled={isPending}
            className="flex-[2] py-3 rounded-lg bg-teal-500 text-slate-950 font-black hover:bg-teal-400 transition-colors uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(20,184,166,0.3)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex justify-center items-center"
          >
            Buy-in to join the table
          </button>
        </div>
      </div>
    </TableDialogOverlay>
  );
}
