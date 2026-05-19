import { Suspense } from 'react';
import CreateTableScreen from '@/components/create_table_screen/Component';

export default function CreateTablePage() {
  return (
    <div className="min-h-screen bg-slate-950 relative">
      <Suspense fallback={
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="w-full max-w-lg text-center py-16 text-teal-600/50 font-mono text-xs uppercase tracking-widest border border-dashed border-teal-500/20 rounded-xl bg-slate-900/30">
            Loading Data Terminal...
          </div>
        </div>
      }>
        <CreateTableScreen />
      </Suspense>
    </div>
  );
}
