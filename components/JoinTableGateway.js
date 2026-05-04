// components/JoinTableGateway.js
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireBLS } from '@/hooks/useRequireBLS';
import { formatUnits } from 'viem';
// You will need to add a joinTable write function to usePrivatePokerLobby
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';

export default function JoinTableGateway({ tableData, lobbyId, onJoined }) {
  const router = useRouter();
  const { blsKeys, isGenerating, generateKeys } = useRequireBLS();
  const { joinTable } = usePrivatePokerLobby(); // Assume you add this hook

  const [isPending, setIsPending] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleJoin = async (e) => {
    e.preventDefault();
    setSubmitError("");

    if (!blsKeys?.publicKey) {
      setSubmitError("Session key missing. Please authorize your session.");
      return;
    }

    try {
      setIsPending(true);
      // Example transaction: Sending the buyIn and the BLS key to the contract
      await joinTable(lobbyId, tableData.id, tableData.buyin, `0x${blsKeys.publicKey}`);

      // Tell the parent component we are in!
      onJoined();
    } catch (error) {
      console.error(error);
      setSubmitError("Transaction failed or rejected.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 relative flex items-center justify-center p-4">
      <div className="absolute inset-0 z-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-teal-900 via-slate-950 to-slate-950" />

      <div className="relative z-10 w-full max-w-lg bg-slate-900/90 backdrop-blur-xl border border-teal-500/30 rounded-2xl shadow-[0_0_50px_rgba(20,184,166,0.15)] overflow-hidden">
        <div className="bg-slate-950/50 p-6 border-b border-teal-500/20">
          <p className="text-teal-500 font-mono text-xs tracking-[0.3em] uppercase mb-1">
            Private Poker
          </p>
          <h1 className="text-2xl font-black text-white tracking-tighter uppercase">
            Join {tableData.name}
          </h1>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Display Table Stats Here */}
          <div className="flex justify-between items-center p-4 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Required Buy-in</span>
            <span className="text-teal-400 font-mono font-bold text-lg">
              {formatUnits(tableData.buyin, 18)} ETH
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
              onClick={() => router.push('/main-lobby')}
              disabled={isPending}
              className="flex-1 py-3 rounded-lg border border-slate-700 text-slate-400 font-bold hover:bg-slate-800 hover:text-slate-200 transition-colors uppercase text-xs tracking-widest disabled:opacity-50 cursor-pointer"
            >
              Abort
            </button>

            {!blsKeys ? (
              <button
                type="button"
                onClick={generateKeys}
                disabled={isGenerating}
                className="flex-[2] py-3 rounded-lg bg-teal-600 text-slate-950 font-black hover:bg-teal-500 transition-colors uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(20,184,166,0.3)] disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? "Generating Session Key..." : "Authorize Session"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleJoin}
                disabled={isPending}
                className="flex-[2] py-3 rounded-lg bg-teal-500 text-slate-950 font-black hover:bg-teal-400 transition-colors uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(20,184,166,0.3)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex justify-center items-center"
              >
                {isPending ? "Awaiting Transaction..." : "Pay Buy-in & Join"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}