export default function Title({
  tableName,
  status,
  currentUserNetworkJoined,
  expectedPeerCount = 0,
  connectedPeerCount = 0,
  topologyLabel = '',
}) {
  return (
    <div className="max-w-7xl mx-auto w-full flex justify-between items-start mb-4">
      <div>
        <h1 className="text-2xl font-black tracking-tighter uppercase">{tableName}</h1>
      </div>

      {status && (
        <div className="flex items-center gap-3 bg-slate-900/80 border border-teal-500/20 px-4 py-2 rounded-xl backdrop-blur-md">
          <span className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-teal-400 animate-pulse' : 'bg-amber-500'}`} />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
            {currentUserNetworkJoined && status === 'connected' ? 'Playing' : 'Table network'}
            {currentUserNetworkJoined && status !== 'connected' && expectedPeerCount > 0 ? ` ${connectedPeerCount}/${expectedPeerCount}` : ''}
          </span>
          {topologyLabel && (
            <span className="text-[9px] font-mono uppercase tracking-widest text-slate-600">
              {topologyLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
