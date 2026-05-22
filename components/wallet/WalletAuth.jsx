"use client";

import { useState, useEffect } from 'react'
import { useAppKitAccount, useAppKit } from '@reown/appkit/react'
import { useDisconnect, useConnection } from 'wagmi'
import { formatUnits, isAddress, parseAbi } from 'viem';
import { CHIPS_CONTRACT_ADDRESS, USDC_CONTRACT_ADDRESS } from '@/lib/chain';
import { publicPokerClient } from '@/lib/publicPokerClient';

const CHIPS_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

function formatUsdcBalance(balance) {
  return Number(formatUnits(balance, 6)).toFixed(2);
}

function formatChipsBalance(balance) {
  return Number(formatUnits(balance, 6)).toFixed(2);
}

export default function WalletAuth() {
  const [mounted, setMounted] = useState(false)
  const [chipsBalance, setChipsBalance] = useState(null)
  const [usdcBalance, setUsdcBalance] = useState(null)
  const { open } = useAppKit()
  const { disconnect } = useDisconnect()
  const { isConnected } = useAppKitAccount()

  const { address } = useConnection();

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let cancelled = false;

    const loadTokenBalances = async () => {
      if (!address) {
        setChipsBalance(null);
        setUsdcBalance(null);
        return;
      }

      try {
        const [chips, usdc] = await Promise.all([
          isAddress(CHIPS_CONTRACT_ADDRESS)
            ? publicPokerClient.readContract({
              address: CHIPS_CONTRACT_ADDRESS,
              abi: CHIPS_ABI,
              functionName: 'balanceOf',
              args: [address],
            })
            : Promise.resolve(null),
          isAddress(USDC_CONTRACT_ADDRESS)
            ? publicPokerClient.readContract({
              address: USDC_CONTRACT_ADDRESS,
              abi: CHIPS_ABI,
              functionName: 'balanceOf',
              args: [address],
            })
            : Promise.resolve(null),
        ]);
        if (!cancelled) {
          setChipsBalance(chips);
          setUsdcBalance(usdc);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load token balances:', error);
          setChipsBalance(null);
          setUsdcBalance(null);
        }
      }
    };

    loadTokenBalances();
    const timer = setInterval(loadTokenBalances, 10000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [address]);

  // Hydration fix: shows a neutral placeholder during server/client hand-off
  if (!mounted) return <div className="w-48 h-9 bg-slate-900/50 rounded border border-slate-800 animate-pulse" />

  if (isConnected) {
    return (
      <div className="flex items-center bg-slate-900 border border-teal-500/20 rounded px-1 py-1">
        <div className="flex items-center gap-3 px-3 py-1 font-mono font-bold text-[0.8em]">
          <span className="text-cyan-300">
            {usdcBalance === null ? '... USDC' : `${formatUsdcBalance(usdcBalance)} USDC`}
          </span>
          <span className="text-slate-700">|</span>
          <span className="text-teal-400">
            {chipsBalance === null ? '... CHIPS' : `${formatChipsBalance(chipsBalance)} CHIPS`}
          </span>
          <span className="text-slate-700">|</span>
          <span className="text-teal-500">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
        </div>

        <button
          onClick={() => disconnect()}
          className="group relative flex items-center justify-center w-8 h-8 rounded bg-slate-950 border border-red-500/20 hover:border-red-500/60 transition-all hover:bg-red-500/5 ml-1"
          title="Disconnect"
        >
          <div className="w-4 h-4 rounded-full border-2 border-red-600 group-hover:border-red-500 flex items-center justify-center relative">
            <div className="w-0.5 h-2 bg-red-600 group-hover:bg-red-500 rounded-full" />
          </div>
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => open()}
      className="px-6 py-2 bg-slate-900 border border-teal-500/50 text-teal-400 font-bold text-[0.8em] uppercase tracking-widest rounded hover:bg-teal-500 hover:text-slate-950 transition-all active:scale-95 shadow-[0_0_15px_rgba(20,184,166,0.1)]"
    >
      Connect Wallet...
    </button>
  )
}
