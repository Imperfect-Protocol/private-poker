"use client";

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppKit } from '@reown/appkit/react';
import { useConnection, useSignMessage } from 'wagmi';
import { keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SUBSCRIPTION_TIERS } from '@/lib/constants';

const SESSION_STORAGE_KEY = 'private-poker:account-session';

function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function buildSigninMessage(address) {
  return [
    'Welcome to PrivatePoker!',
    '',
    'Sign this message to unlock your player account for this browser session.',
    '',
    'This signature does not spend gas and does not move funds.',
    'It creates a private session seed used for poker identities, table operators, and encrypted peer-to-peer play.',
    '',
    `Wallet: ${address}`,
    'Network: Arbitrum Sepolia',
    'Account Scope: PrivatePoker account sign-in',
  ].join('\n');
}

function deriveAccountSession(signature, address) {
  const seed = keccak256(signature);
  const operatorPrivateKey = keccak256(toBytes(`${signature}:PrivatePoker:AccountOperator`));
  const operatorAccount = privateKeyToAccount(operatorPrivateKey);

  return {
    walletAddress: address,
    seed,
    operator: operatorAccount.address,
    operatorPublicKey: operatorAccount.publicKey,
    signedAt: new Date().toISOString(),
  };
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

export default function AccountSignin() {
  const router = useRouter();
  const { open } = useAppKit();
  const { address, isConnected } = useConnection();
  const { signMessageAsync, isPending } = useSignMessage();
  const [step, setStep] = useState('signin');
  const [accountSession, setAccountSession] = useState(null);
  const [selectedTier, setSelectedTier] = useState(SUBSCRIPTION_TIERS[1]);
  const [error, setError] = useState('');

  const signinMessage = useMemo(() => (
    address ? buildSigninMessage(address) : ''
  ), [address]);

  const handleSignin = async () => {
    setError('');

    if (!isConnected || !address) {
      open();
      return;
    }

    try {
      const signature = await signMessageAsync({ message: signinMessage });
      const session = deriveAccountSession(signature, address);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      console.log('account session', {
        wallet: session.walletAddress,
        operator: session.operator,
      });
      setAccountSession(session);
      setStep('subscription');
    } catch (err) {
      console.error('Account sign-in failed:', err);
      setError('Signature cancelled. Sign in when you are ready.');
    }
  };

  const handleContinue = () => {
    const currentSession = accountSession ?? {
      walletAddress: address,
      signedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      ...currentSession,
      subscriptionTier: selectedTier.id,
    }));
    router.push('/main-lobby');
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
          {step === 'signin' ? (
            <div>
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-6">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight text-white">Sign In</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Your wallet signs a message. No gas, no transaction, no funds moved.
                  </p>
                </div>
                {address && (
                  <div className="rounded border border-teal-500/25 bg-slate-950 px-3 py-2 font-mono text-xs font-bold text-teal-300">
                    {formatAddress(address)}
                  </div>
                )}
              </div>

              <div className="mt-6 rounded border border-slate-800 bg-slate-950/70 p-5 font-mono text-xs leading-6 text-slate-400">
                {signinMessage || 'Connect your wallet to prepare your account signature.'}
              </div>

              {error && (
                <div className="mt-4 rounded border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSignin}
                disabled={isPending}
                className="mt-6 w-full rounded border border-teal-400 bg-teal-400 px-6 py-4 font-black uppercase tracking-[0.18em] text-slate-950 transition-all hover:bg-teal-300 disabled:cursor-wait disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {!isConnected ? 'Connect Wallet' : isPending ? 'Signing...' : 'Sign In'}
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
                className="mt-6 w-full rounded border border-teal-400 bg-teal-400 px-6 py-4 font-black uppercase tracking-[0.18em] text-slate-950 transition-all hover:bg-teal-300"
              >
                Continue
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
