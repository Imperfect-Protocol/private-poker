export default function AboutPage() {
  return (
    <main className="min-h-full bg-slate-950 p-4 md:px-24 md:py-8 flex flex-col items-center justify-start">
      <div className="w-full max-w-5xl">
        <div className="flex flex-col md:flex-row justify-between items-end mb-8 px-2 border-b border-teal-500/20 pb-4">
          <h1 className="text-4xl font-black text-white tracking-tighter uppercase">
            About
          </h1>
          <div className="hidden md:block text-right">
            <p className="text-slate-500 text-[10px] font-mono leading-none uppercase">v0.0.1</p>
            <p className="text-teal-400 text-xs font-mono uppercase mt-1">Status: Under Construction</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-8">
          {/* P2P Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 bg-teal-500" />
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Pure P2P Signaling</h2>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed font-mono">
              Private Poker (PP) removes the dealer. No centralized server sees the cards. We use direct WebRTC data channels to move game state between players. The blockchain acts only as the judge and the vault, never the host.
            </p>
          </section>

          {/* BLS Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 bg-teal-500" />
              <h2 className="text-xl font-black text-white uppercase tracking-tight">BLS Aggregate Trust</h2>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed font-mono">
              To verify outcomes without revealing private data, we use BLS (Boneh-Lynn-Shacham) signatures. Every hand action is signed. These signatures are aggregated into a single proof that the Stylus contract verifies on-chain.
            </p>
          </section>

          {/* Philosophy Section */}
          <section className="md:col-span-2 p-8 bg-slate-900/50 border border-teal-500/10 rounded-xl mt-4">
            <h3 className="text-teal-500 font-mono text-[10px] uppercase font-bold tracking-[0.4em] mb-4">The Imperfect Philosophy</h3>
            <p className="text-slate-300 text-lg font-black tracking-tight leading-snug">
              WE ARE NOT BUILDING A GAME. WE ARE BUILDING A ZERO-TRUST ARCHITECTURE FOR COMPETITIVE VALUE TRANSFER. PRIVACY IS NOT AN OPTION; IT IS THE RAW FOUNDATION OF THE METAL.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
