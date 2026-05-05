"use client";

import { Web3Provider } from '@/components/Web3Provider';
import { BLSProvider } from '@/contexts/BLSContext';

export function Providers({ children }) {
  return (
    <Web3Provider>
      <BLSProvider>
        {children}
      </BLSProvider>
    </Web3Provider>
  );
}
