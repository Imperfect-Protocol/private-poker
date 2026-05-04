// app/tables/[id]/page.js
"use client";

import { use } from 'react';
import dynamic from 'next/dynamic';

// Import the client dynamically, and strictly disable SSR
const DynamicTableClient = dynamic(
  () => import('@/components/TableClient'),
  { 
    ssr: false,
    loading: () => (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-teal-600 animate-pulse font-mono text-xs uppercase tracking-widest">
          Initializing Web3 Environment...
        </div>
      </main>
    )
  }
);

export default function TablePage({ params, searchParams }) {
  const resolvedParams = use(params);
  const resolvedSearchParams = use(searchParams);

  const tableId = resolvedParams.id;
  const lobbyId = resolvedSearchParams.lobbyId || "1";

  // Render the dynamic component, passing the un-wrapped params
  return <DynamicTableClient tableId={tableId} lobbyId={lobbyId} />;
}