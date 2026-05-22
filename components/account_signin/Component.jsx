"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnection, useWriteContract } from 'wagmi';
import { isAddress, parseAbi } from 'viem';
import { PRIVATE_POKER_CONTRACT_ADDRESS, USDC_CONTRACT_ADDRESS } from '@/lib/chain';
import { SUBSCRIPTION_TIERS } from '@/lib/constants';
import { getBufferedGasOverrides } from '@/lib/gas';
import { buildAccountSessionTypedData } from '@/lib/accountSession';
import { useAccountSession } from '@/contexts/AccountSessionContext.jsx';
import { useOperatorAddress } from '@/hooks/useOperatorAddress';
import { publicPokerClient } from '@/lib/publicPokerClient';

const USDC_SCALE = 1_000_000n;

const USDC_ABI = parseAbi([
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
]);

const ACCOUNT_ABI = parseAbi([
  "function subscribe(address player_address, address operator, bytes annonce_public_key, bytes encrypted_profile, uint8 subscription_tier)",
  "function isSubscriptionActive(address player_address) view returns (bool)",
]);

function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function TierCard({ tier, selected, onSelect }) {
  const accentClass = selected
    ? 'border-teal-300 bg-teal-400/10 shadow-[0_0_28px_rgba(45,212,191,0.18)]'
    : 'border-teal-500/15 bg-slate-900/70 hover:border-teal-400/50 hover:bg-slate-900';

  return (
    <button
      type="button"
      onClick={() => onSelect(tier)}
      className={`text-left rounded border p-5 transition-all ${accentClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-black uppercase tracking-tight text-white">{tier.name}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{tier.description}</p>
        </div>
        <div className="rounded border border-teal-500/30 bg-slate-950 px-3 py-2 text-right font-mono">
          <div className="text-lg font-black text-teal-300">${tier.monthlyUsd}</div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-teal-700">month</div>
        </div>
      </div>

      <div className="mt-6 border-t border-slate-800 pt-4">
        <div className="font-mono text-2xl font-black text-cyan-200">
          {tier.chips.toLocaleString()} CHIPS
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.28em] text-slate-500">
          credited on payment
        </div>
      </div>
    </button>
  );
}

function tierToContractId(tier) {
  const index = SUBSCRIPTION_TIERS.findIndex((entry) => entry.id === tier.id);
  return index + 1;
}

function tierUsdcAmount(tier) {
  return BigInt(tier.monthlyUsd) * USDC_SCALE;
}

export default function AccountSignin() {
  const router = useRouter();
  const { accountSession, isSigningIn, isWalletConnected, signIn } = useAccountSession();
  const { address } = useConnection();
  const { mutateAsync: writeWalletContract } = useWriteContract();
  const { createOperatorAddress } = useOperatorAddress();
  const [step, setStep] = useState('signin');
  const [selectedTier, setSelectedTier] = useState(SUBSCRIPTION_TIERS[1]);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isCheckingAccount, setIsCheckingAccount] = useState(false);
  const [subscriptionStep, setSubscriptionStep] = useState('');
  const [error, setError] = useState('');

  const signinData = useMemo(() => buildAccountSessionTypedData(), []);
  const signinFields = useMemo(() => (
    Object.entries(signinData.message).map(([field, value]) => ({
      field,
      value: typeof value === 'bigint' ? value.toString() : value,
    }))
  ), [signinData]);

  useEffect(() => {
    if (!accountSession?.walletAddress) return undefined;

    let isMounted = true;
    const checkAccount = async () => {
      if (!isAddress(PRIVATE_POKER_CONTRACT_ADDRESS)) {
        if (isMounted) setStep('subscription');
        return;
      }

      setIsCheckingAccount(true);
      try {
        const isActive = await publicPokerClient.readContract({
          address: PRIVATE_POKER_CONTRACT_ADDRESS,
          abi: ACCOUNT_ABI,
          functionName: 'isSubscriptionActive',
          args: [accountSession.walletAddress],
        });
        if (!isMounted) return;
        if (isActive) {
          router.replace('/main-lobby');
          return;
        }
        setStep('subscription');
      } catch (err) {
        console.error('Account subscription check failed:', err);
        if (isMounted) setStep('subscription');
      } finally {
        if (isMounted) setIsCheckingAccount(false);
      }
    };

    checkAccount();
    return () => {
      isMounted = false;
    };
  }, [accountSession?.walletAddress, router]);

  const handleSignin = async () => {
    setError('');

    try {
      const session = await signIn();
      if (session) setIsCheckingAccount(true);
    } catch (err) {
      console.error('Account sign-in failed:', err);
      setError('Signature cancelled. Sign in when you are ready.');
    }
  };

  const approveOperatorUsdc = async (session, amount) => {
    const allowance = await publicPokerClient.readContract({
      address: USDC_CONTRACT_ADDRESS,
      abi: USDC_ABI,
      functionName: 'allowance',
      args: [session.walletAddress, session.operator],
    });
    if (allowance >= amount) return;

    const args = [session.operator, amount];
    const overrides = await getBufferedGasOverrides(publicPokerClient, {
      address: USDC_CONTRACT_ADDRESS,
      abi: USDC_ABI,
      functionName: 'approve',
      args,
      account: session.walletAddress,
    });
    const hash = await writeWalletContract({
      address: USDC_CONTRACT_ADDRESS,
      abi: USDC_ABI,
      functionName: 'approve',
      args,
      ...overrides,
    });
    await publicPokerClient.waitForTransactionReceipt({ hash });
  };

  const handleContinue = async () => {
    setError('');

    try {
      if (!isAddress(USDC_CONTRACT_ADDRESS)) {
        throw new Error('USDC contract address is not configured.');
      }
      if (!isAddress(PRIVATE_POKER_CONTRACT_ADDRESS)) {
        throw new Error('PrivatePoker contract address is not configured.');
      }

      const session = accountSession ?? await signIn();
      if (!session) return;
      if (!address || address.toLowerCase() !== session.walletAddress.toLowerCase()) {
        throw new Error('Connected wallet does not match the signed-in account.');
      }

      setIsSubscribing(true);
      const amount = tierUsdcAmount(selectedTier);
      const operator = createOperatorAddress(session.operatorPrivateKey);

      setSubscriptionStep('Approve USDC for Operator...');
      await approveOperatorUsdc(session, amount);

      setSubscriptionStep('Operator transfers USDC into PrivatePoker...');
      const transferHash = await operator.writeContract({
        contract: USDC_CONTRACT_ADDRESS,
        abi: USDC_ABI,
        functionName: 'transferFrom',
        args: [session.walletAddress, PRIVATE_POKER_CONTRACT_ADDRESS, amount],
      });
      await publicPokerClient.waitForTransactionReceipt({ hash: transferHash });

      setSubscriptionStep('Operator creates account...');
      const subscribeHash = await operator.writeContract({
        contract: PRIVATE_POKER_CONTRACT_ADDRESS,
        abi: ACCOUNT_ABI,
        functionName: 'subscribe',
        args: [
          session.walletAddress,
          session.operator,
          session.operatorPublicKey ?? '0x',
          '0x',
          tierToContractId(selectedTier),
        ],
      });
      await publicPokerClient.waitForTransactionReceipt({ hash: subscribeHash });

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('private-poker:subscription-tier', selectedTier.id);
      }
      router.push('/main-lobby');
    } catch (err) {
      console.error('Subscription failed:', err);
      setError(err?.shortMessage ?? err?.message ?? 'Subscription failed.');
    } finally {
      setIsSubscribing(false);
      setSubscriptionStep('');
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 md:px-12">
      <div className="mx-auto grid min-h-[calc(100vh-7rem)] w-full max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
        <section className="relative overflow-hidden rounded border border-teal-500/15 bg-slate-900/70 p-8 shadow-2xl">
          <div className="absolute inset-0">
            <img src="/splash.jpg" alt="" className="h-full w-full object-cover opacity-15" />
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-950/85 to-teal-950/30" />
          </div>

          <div className="relative z-10">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.32em] text-teal-500">
              Account
            </p>
            <h1 className="mt-4 text-4xl font-black uppercase tracking-tight text-white md:text-6xl">
              Welcome to Private Poker
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-slate-300 md:text-base">
              Sign once to create your private session seed, then choose the subscription tier that funds your monthly CHIPS allowance.
            </p>

            <div className="mt-10 grid gap-3 font-mono text-xs uppercase tracking-[0.22em] text-slate-500">
              <div className={`border-l-2 pl-4 ${step === 'signin' ? 'border-teal-400 text-teal-300' : 'border-teal-900 text-slate-500'}`}>
                Signature
              </div>
              <div className={`border-l-2 pl-4 ${step === 'subscription' ? 'border-teal-400 text-teal-300' : 'border-teal-900 text-slate-500'}`}>
                Subscription
              </div>
              <div className="border-l-2 border-teal-900 pl-4">
                Lobbies
              </div>
            </div>
          </div>
        </section>

        <section className="rounded border border-teal-500/15 bg-slate-900/70 p-6 md:p-8">
          {isCheckingAccount ? (
            <div className="py-16 text-center">
              <h2 className="text-2xl font-black uppercase tracking-tight text-white">
                Checking Account
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Looking up your PrivatePoker subscription on chain.
              </p>
            </div>
          ) : step === 'signin' ? (
            <div>
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-6">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight text-white">Sign In</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Your wallet signs a message. No gas, no transaction, no funds moved.
                  </p>
                </div>
                {accountSession?.walletAddress && (
                  <div className="rounded border border-teal-500/25 bg-slate-950 px-3 py-2 font-mono text-xs font-bold text-teal-300">
                    {formatAddress(accountSession.walletAddress)}
                  </div>
                )}
              </div>

              <div className="mt-6 rounded border border-slate-800 bg-slate-950/70 p-5 font-mono text-xs leading-6">
                <div className="grid gap-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="uppercase tracking-[0.24em] text-slate-500">Domain</span>
                    <span className="text-teal-300">{signinData.domain.name} v{signinData.domain.version}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="uppercase tracking-[0.24em] text-slate-500">Type</span>
                    <span className="text-teal-300">{signinData.primaryType}</span>
                  </div>
                  {signinFields.map(({ field, value }) => (
                    <div key={field} className="grid grid-cols-[9rem_1fr] gap-4">
                      <span className="uppercase tracking-[0.18em] text-slate-500">{field}</span>
                      <span className="text-slate-300">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSignin}
                disabled={isSigningIn}
                className="mt-6 w-full rounded border border-teal-400 bg-teal-400 px-6 py-4 font-black uppercase tracking-[0.18em] text-slate-950 transition-all hover:bg-teal-300 disabled:cursor-wait disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {!isWalletConnected ? 'Connect Wallet' : isSigningIn ? 'Signing...' : 'Sign In'}
              </button>
            </div>
          ) : (
            <div>
              <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight text-white">Select Tier</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Choose your monthly subscription and CHIPS allowance.
                  </p>
                </div>
                {accountSession?.operator && (
                  <div className="rounded border border-cyan-500/25 bg-slate-950 px-3 py-2 font-mono text-xs text-cyan-200">
                    Operator {formatAddress(accountSession.operator)}
                  </div>
                )}
              </div>

              <div className="mt-6 grid gap-4">
                {SUBSCRIPTION_TIERS.map((tier) => (
                  <TierCard
                    key={tier.id}
                    tier={tier}
                    selected={selectedTier.id === tier.id}
                    onSelect={setSelectedTier}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={handleContinue}
                disabled={isSubscribing}
                className="mt-6 w-full rounded border border-teal-400 bg-teal-400 px-6 py-4 font-black uppercase tracking-[0.18em] text-slate-950 transition-all hover:bg-teal-300 disabled:cursor-wait disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {isSubscribing ? subscriptionStep : 'Continue'}
              </button>

              {error && (
                <div className="mt-4 rounded border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
