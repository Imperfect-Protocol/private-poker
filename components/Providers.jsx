"use client";

import Web3Provider from '@/components/wallet/Web3Provider';
import { AccountSessionProvider } from '@/contexts/AccountSessionContext.jsx';
import { BLSProvider } from '@/contexts/BLSContext.jsx';

export function Providers({ children }) {
  return (
    <Web3Provider>
      <AccountSessionProvider>
        <BLSProvider>
          {children}
        </BLSProvider>
      </AccountSessionProvider>
    </Web3Provider>
  );
}
