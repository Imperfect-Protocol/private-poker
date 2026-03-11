import { Trophy, Zap, Activity } from 'lucide-react';

// Mock data following your protocol structure
const LEADERS = [
  { rank: 1, address: '0x85c4...aAdc', profit: '142.85 ETH', hands: '12,402', winRate: '68%', status: 'active' },
  { rank: 2, address: '0x32b1...fE92', profit: '91.12 ETH', hands: '8,980', winRate: '62%', status: 'active' },
  { rank: 3, address: '0x99a1...77b1', profit: '78.40 ETH', hands: '21,005', winRate: '55%', status: 'active' },
  { rank: 4, address: '0x55c2...cc32', profit: '45.20 ETH', hands: '4,501', winRate: '51%', status: 'standby' },
  { rank: 5, address: '0x11e4...bb21', profit: '32.05 ETH', hands: '8,902', winRate: '49%', status: 'standby' },
];

export default function LeaderboardPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-4 md:px-24 md:py-8 flex flex-col items-center justify-start">
      <div className="w-full max-w-5xl">
        <div className="flex flex-col md:flex-row justify-between items-end mb-8 px-2">
          <h1 className="text-4xl font-black text-white tracking-tighter uppercase">
            Ranking
          </h1>
          <div className="text-right hidden md:block">
            <p className="text-slate-500 text-[10px] font-mono leading-none">REGISTRY: SYNCHRONIZED</p>
            <p className="text-teal-400 text-xs font-mono uppercase">Total_Volume: 4,209 ETH</p>
          </div>
        </div>

        {/* --- TOP 3 HIGHLIGHTS --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {LEADERS.slice(0, 3).map((player) => (
            <div key={player.rank} className="p-1 rounded-2xl bg-gradient-to-br from-teal-500/40 to-cyan-600/40 shadow-[0_0_20px_rgba(20,184,166,0.1)]">
              <div className="bg-slate-950 p-6 rounded-[14px] h-full relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <Trophy size={100} className="text-teal-400" />
                </div>

                <div className="flex justify-between items-start mb-4">
                  <span className="text-4xl font-black text-teal-500/20 font-mono italic">0{player.rank}</span>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-teal-600 font-mono uppercase font-bold tracking-widest">Efficiency</span>
                    <span className="text-teal-400 font-mono font-bold text-lg">{player.winRate}</span>
                  </div>
                </div>

                <h3 className="text-sm font-mono text-slate-100 font-bold mb-1">{player.address}</h3>
                <p className="text-2xl font-black text-white tracking-tighter mb-6">{player.profit}</p>

                <div className="bg-slate-900/80 p-3 rounded-lg border border-teal-500/10 flex justify-between items-center">
                  <span className="text-[10px] text-slate-500 font-mono uppercase">Processed Hands</span>
                  <span className="text-xs text-teal-500 font-mono font-bold">{player.hands}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* --- FULL RANKING REGISTRY --- */}
        <section className="p-1 bg-gradient-to-br from-teal-500/80 to-cyan-600/80 rounded-2xl shadow-[0_0_30px_rgba(20,184,166,0.15)]">
          <div className="p-6 bg-slate-950/95 backdrop-blur-md rounded-[14px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-separate border-spacing-y-3 min-w-[700px]">
                <thead>
                  <tr className="text-teal-500/60 text-[10px] uppercase tracking-[0.2em] font-bold">
                    <th className="px-6 py-3">Rank</th>
                    <th className="px-6 py-3">Network Identity</th>
                    <th className="px-6 py-3 text-center">Profitability</th>
                    <th className="px-6 py-3 text-center">Throughput</th>
                    <th className="px-6 py-3 text-right">Protocol Status</th>
                  </tr>
                </thead>
                <tbody>
                  {LEADERS.map((player) => (
                    <tr key={player.rank} className="group transition-all duration-200">
                      <td className="px-6 py-4 bg-slate-900/60 backdrop-blur-sm border-y border-l border-teal-500/20 rounded-l-xl group-hover:border-teal-400 transition-colors">
                        <span className="font-mono font-bold text-teal-600 text-xs">#{player.rank}</span>
                      </td>
                      <td className="px-6 py-4 bg-slate-900/60 backdrop-blur-sm border-y border-teal-500/20 group-hover:border-teal-400 transition-colors">
                        <div className="font-bold text-slate-100 font-mono text-sm">{player.address}</div>
                      </td>
                      <td className="px-6 py-4 bg-slate-900/60 backdrop-blur-sm border-y border-teal-500/20 text-center group-hover:border-teal-400 transition-colors">
                        <div className="text-teal-400 font-mono font-black">{player.profit}</div>
                      </td>
                      <td className="px-6 py-4 bg-slate-900/60 backdrop-blur-sm border-y border-teal-500/20 text-center group-hover:border-teal-400 transition-colors">
                        <div className="text-slate-400 font-mono text-[11px]">{player.hands} HANDS</div>
                      </td>
                      <td className="px-6 py-4 bg-slate-900/60 backdrop-blur-sm border-y border-r border-teal-500/20 rounded-r-xl text-right group-hover:border-teal-400 transition-colors">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border tracking-wider ${player.status === 'active'
                          ? 'border-teal-500 text-teal-400 bg-teal-500/10 shadow-[0_0_8px_rgba(20,184,166,0.3)]'
                          : 'border-slate-700 text-slate-600'
                          }`}>
                          {player.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </main >
  );
}