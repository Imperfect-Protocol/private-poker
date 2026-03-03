"use client";
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

export default function WalletAuth() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <div className="flex items-center gap-4 bg-slate-900 border border-teal-500/30 px-4 py-2 rounded-lg">
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-teal-600 font-mono uppercase leading-none">Identity Verified</span>
          <span className="text-xs text-teal-400 font-mono font-bold">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
        </div>
        <button 
          onClick={() => disconnect()}
          className="text-red-500 hover:text-red-400 transition-colors cursor-pointer"
        >
          <span className="text-lg">⏻</span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="px-6 py-2 bg-teal-500 text-slate-950 font-black text-xs uppercase tracking-widest rounded-lg hover:bg-teal-400 transition-all shadow-[0_0_20px_rgba(20,184,166,0.3)] cursor-pointer"
    >
      Initialize Wallet_
    </button>
  );
}