// app/layout.js
"use client";

import { Web3Provider } from '@/components/Web3Provider';
import { BLSProvider } from '@/contexts/BLSContext';
import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100">
        <Web3Provider>
          <BLSProvider>
            {children}
          </BLSProvider>
        </Web3Provider>
      </body>
    </html>
  );
}