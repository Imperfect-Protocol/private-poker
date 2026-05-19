import Link from 'next/link';

export default function LobbyCard({ lobby }) {
  const isActive = lobby.active === "true";

  return (
    <Link
      href={isActive ? `/lobby/${lobby.id}` : '#'}
      className={`group relative block transition-all duration-300 ${isActive ? 'cursor-pointer hover:-translate-y-2' : 'cursor-not-allowed'}`}
    >
      <div className={`h-full p-1 rounded-2xl bg-gradient-to-br transition-all duration-500 ${isActive
        ? 'from-teal-500/20 via-slate-800 to-cyan-500/20 group-hover:from-teal-400 group-hover:to-cyan-400'
        : 'from-slate-800 via-slate-900 to-slate-800 opacity-60'}`}>

        <div className="h-full bg-slate-950 p-6 rounded-[calc(1rem-1px)] flex flex-col justify-between border border-white/5">
          <div>
            {/* Header: Name and Status */}
            <div className="flex justify-between items-start mb-6">
              <h3 className={`text-2xl font-black uppercase tracking-tighter ${isActive ? 'text-white' : 'text-slate-500'}`}>
                {lobby.name}
              </h3>
              <div className={`flex items-center gap-2 px-2 py-1 rounded border text-[10px] font-mono font-bold uppercase ${isActive
                ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                : 'bg-slate-900 border-slate-800 text-slate-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-teal-500 animate-pulse' : 'bg-slate-700'}`} />
                {isActive ? 'Active' : 'Coming Soon'}
              </div>
            </div>

            {/* Description */}
            <p className={`text-sm leading-relaxed mb-8 ${isActive ? 'text-slate-400' : 'text-slate-600'}`}>
              {lobby.description}
            </p>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-8">
              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                <p className="text-[10px] text-teal-600 font-mono uppercase mb-1">Total Volume</p>
                <p className={`font-mono font-bold text-lg ${isActive ? 'text-white' : 'text-slate-600'}`}>
                  {lobby.total_buyin}
                </p>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                <p className="text-[10px] text-teal-600 font-mono uppercase mb-1">Total Tables</p>
                <p className={`font-mono font-bold text-lg ${isActive ? 'text-white' : 'text-slate-600'}`}>
                  {lobby.table_count}
                </p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className={`text-center py-3 rounded-lg font-bold text-xs uppercase tracking-widest transition-all ${isActive
            ? 'bg-slate-900 text-teal-500 border border-teal-500/50 group-hover:bg-teal-400 group-hover:text-slate-950 group-hover:border-teal-400'
            : 'bg-slate-900 text-slate-600 border border-slate-800'
            }`}>
            {isActive ? 'Enter' : 'Unavailable'}
          </div>
        </div>
      </div>
    </Link>
  );
}
