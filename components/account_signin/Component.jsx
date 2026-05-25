"use client";

import { useAccounts } from '@/hooks/useAccounts';

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
      className={`cursor-pointer text-left rounded border p-5 transition-all ${accentClass}`}
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

function ProfileField({ label, value, field, type = 'text', editable, onChange }) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </span>
      {editable ? (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(field, event.target.value)}
          className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-teal-400"
        />
      ) : (
        <div className="mt-2 rounded border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm font-bold text-slate-200">
          {value}
        </div>
      )}
    </label>
  );
}

export default function AccountSignin() {
  const {
    accountSession,
    error,
    handleProfileChange,
    handleProfileContinue,
    handleProfileEdit,
    handleProfileSave,
    handleContinue,
    handleSignin,
    isCheckingAccount,
    isSavingProfile,
    isSigningIn,
    isSubscribing,
    isWalletConnected,
    profile,
    profileMode,
    selectedTier,
    setSelectedTier,
    signinData,
    signinFields,
    step,
    subscriptionStep,
    subscriptionTiers,
  } = useAccounts();

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
              <div className={`border-l-2 pl-4 ${step === 'profile' ? 'border-teal-400 text-teal-300' : 'border-teal-900 text-slate-500'}`}>
                Profile
              </div>
              <div className={`border-l-2 pl-4 ${step === 'subscription' ? 'border-teal-400 text-teal-300' : 'border-teal-900 text-slate-500'}`}>
                Subscription
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
                className="mt-6 w-full cursor-pointer rounded border border-teal-400 bg-teal-400 px-6 py-4 font-black uppercase tracking-[0.18em] text-slate-950 transition-all hover:bg-teal-300 disabled:cursor-wait disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {!isWalletConnected ? 'Connect Wallet' : isSigningIn ? 'Signing...' : 'Sign In'}
              </button>
            </div>
          ) : step === 'profile' ? (
            <div>
              <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight text-white">Profile</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Display name stays public. Contact and legal details are encrypted into your profile blob.
                  </p>
                </div>
                {profileMode === 'view' && (
                  <button
                    type="button"
                    onClick={handleProfileEdit}
                    className="cursor-pointer rounded border border-cyan-500/40 px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.18em] text-cyan-200 transition-colors hover:border-cyan-300 hover:bg-cyan-400/10"
                  >
                    Edit
                  </button>
                )}
              </div>

              <div className="mt-6 grid gap-4">
                <ProfileField
                  label="Display name"
                  field="displayName"
                  value={profile.displayName}
                  editable={profileMode === 'edit'}
                  onChange={handleProfileChange}
                />
                <ProfileField
                  label="Email address"
                  field="email"
                  type="email"
                  value={profile.email}
                  editable={profileMode === 'edit'}
                  onChange={handleProfileChange}
                />
                <ProfileField
                  label="Phone number"
                  field="phone"
                  type="tel"
                  value={profile.phone}
                  editable={profileMode === 'edit'}
                  onChange={handleProfileChange}
                />
                <ProfileField
                  label="Legal name"
                  field="legalName"
                  value={profile.legalName}
                  editable={profileMode === 'edit'}
                  onChange={handleProfileChange}
                />
              </div>

              {error && (
                <div className="mt-4 rounded border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {profileMode === 'edit' ? (
                <button
                  type="button"
                  onClick={handleProfileSave}
                  disabled={isSavingProfile}
                  className="mt-6 w-full cursor-pointer rounded border border-teal-400 bg-teal-400 px-6 py-4 font-black uppercase tracking-[0.18em] text-slate-950 transition-all hover:bg-teal-300 disabled:cursor-wait disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  {isSavingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleProfileContinue}
                  className="mt-6 w-full cursor-pointer rounded border border-teal-400 bg-teal-400 px-6 py-4 font-black uppercase tracking-[0.18em] text-slate-950 transition-all hover:bg-teal-300"
                >
                  Continue
                </button>
              )}
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
                {subscriptionTiers.map((tier) => (
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
                className="mt-6 w-full cursor-pointer rounded border border-teal-400 bg-teal-400 px-6 py-4 font-black uppercase tracking-[0.18em] text-slate-950 transition-all hover:bg-teal-300 disabled:cursor-wait disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
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
