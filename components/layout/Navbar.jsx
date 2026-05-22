import WalletAuth from '@/components/wallet/WalletAuth'
import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="h-[var(--navbar-height)] shrink-0 flex justify-between items-center px-6 py-2 bg-slate-950 border-b border-slate-800">
      <div className="flex items-center gap-12">
        <Link
          href="/"
          className="flex flex-col group transition-opacity hover:opacity-80"
        >
          <span className="text-xl md:text-2xl font-black text-teal-500 tracking-tighter leading-none uppercase">
            Private Poker
          </span>

          <div className="border-t border-teal-500/50 mt-1 pt-1">
            <span className="text-[9px] md:text-[10px] text-teal-600 font-mono tracking-[0.38em] uppercase font-bold leading-none block">
              Imperfect Protocol
            </span>
          </div>
        </Link>

        <div className="hidden lg:flex gap-8 text-[0.8em] font-bold uppercase tracking-[0.2em] text-slate-500">
          <Link href="/main-lobby" className="hover:text-teal-400 transition-colors">Lobbies</Link>
          <Link href="/leaderboard" className="hover:text-teal-400 transition-colors">Rankings</Link>
          <Link href="/about" className="hover:text-teal-400 transition-colors">About</Link>
        </div>

      </div>

      <WalletAuth />
    </nav>
  )
}
