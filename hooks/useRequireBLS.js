import { useEffect, useRef } from 'react';
import { useAppKit } from '@reown/appkit/react';
import { useConnection } from 'wagmi'; // <-- Add this import
import { useBLS } from '@/contexts/BLSContext';

export function useRequireBLS() {
  const { blsKeys, isGenerating, generateKeys, isConnected } = useBLS();
  const { address } = useConnection(); // <-- Get the active wallet address
  const { open } = useAppKit();
  
  // Track WHICH address we asked, instead of just true/false
  const firedForAddress = useRef(null);

  useEffect(() => {
    let timer;

    if (!isConnected) {
      timer = setTimeout(() => {
        open();
      }, 500);
      firedForAddress.current = null; // Reset if they disconnect entirely
      return () => clearTimeout(timer);
    }

    // If connected, no keys, and we haven't asked THIS SPECIFIC ADDRESS yet...
    if (isConnected && address && !blsKeys && !isGenerating && firedForAddress.current !== address) {
      
      // Wait 500ms for cross-tab sync
      timer = setTimeout(() => {
        firedForAddress.current = address; // Lock it for this specific account
        
        generateKeys().catch(() => {
          // If they reject, unlock so they can click the button to retry
          firedForAddress.current = null;
        });
      }, 500);

    }

    return () => clearTimeout(timer);
  }, [isConnected, address, blsKeys, isGenerating, generateKeys, open]);

  return { blsKeys, isGenerating, generateKeys };
}