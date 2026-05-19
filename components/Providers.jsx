"use client";

import Web3Provider from '@/components/wallet/Web3Provider';
import { BLSProvider } from '@/contexts/BLSContext.jsx';

export function Providers({ children }) {
  return (
    <Web3Provider>
      <BLSProvider>
        {children}
      </BLSProvider>
    </Web3Provider>
  );
}
