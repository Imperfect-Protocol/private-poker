import { useAppKit } from '@reown/appkit/react';
import { useConnection } from 'wagmi';
import { useBLS } from '@/contexts/BLSContext.jsx';

export function useRequireBLS(tableDetails = null) {
  const { getKeys, isGenerating, generateKeys, isConnected } = useBLS();
  const { address } = useConnection();
  const { open } = useAppKit();
  const blsKeys = tableDetails ? getKeys(tableDetails) : null;

  const requireKeys = async (details = tableDetails) => {
    if (!isConnected || !address) {
      open();
      throw new Error('Connect wallet before authorizing this table session.');
    }
    if (!details) {
      throw new Error('Table details are required before authorizing this table session.');
    }
    return generateKeys(details);
  };

  return { blsKeys, isGenerating, generateKeys: requireKeys };
}
