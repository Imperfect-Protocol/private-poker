// app/tables/[id]/page.js
import PokerTable from '@/components/PokerTable';
import PokerActionBar from '@/components/PokerActionBar';

export default async function TablePage({ params }) {
  const { id } = await params;
  const res = await fetch(`http://localhost:3000/table-${id}.json`);
  const tableData = await res.json();

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white overflow-hidden">
      {/* Header Info */}
      <div className="flex justify-between items-start max-w-7xl mx-auto border-b border-teal-500/20 pb-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-teal-400">{tableData.name}</h1>
          <p className="text-xs font-mono text-slate-500 uppercase">{tableData.game} • {tableData.blinds}</p>
        </div>
        <div className="text-right font-mono">
          <p className="text-[10px] text-slate-500 uppercase">Status</p>
          <p className="text-sm text-teal-400 font-bold uppercase animate-pulse">{tableData.state}</p>
        </div>
      </div>

      {/* The Poker Scene */}
      <div className="max-w-7xl mx-auto h-[70vh] flex items-center justify-center">
        <PokerTable tableData={tableData} />
      </div>
      {tableData.current_hand !== undefined && (
        <PokerActionBar
          minBet={tableData.current_hand.min_bet}
          maxBet={tableData.current_hand.max_bet}
          step={tableData.current_hand.bet_step}
        />
      )}

    </main>
  );
}