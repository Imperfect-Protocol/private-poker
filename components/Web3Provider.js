"use client";

import { WagmiProvider, createConfig, http } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

// Create the config safely on the client side
const config = createConfig({
  chains: [arbitrum],
  transports: {
    [arbitrum.id]: http(), 
  },
});

export default function Web3Provider({ children }) {
  // Use state to ensure the QueryClient is only created once per user session
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}