// app/lobby/[id]/page.js
"use client";

import { use } from 'react';
import dynamic from 'next/dynamic';

// Import the client dynamically, and strictly disable SSR
const DynamicLobbyClient = dynamic(
  () => import('@/components/LobbyClient'),
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

export default function LobbyPage({ params }) {
  // Unwrap the dynamic route parameter safely
  const { id } = use(params);

  // Render the component and pass the ID down
  return <DynamicLobbyClient id={id} />;
}