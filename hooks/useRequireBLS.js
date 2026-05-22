import { useBLS } from '@/contexts/BLSContext.jsx';

export function useRequireBLS(tableDetails = null) {
  const { getKeys, isGenerating, generateKeys, isConnected } = useBLS();
  const blsKeys = tableDetails ? getKeys(tableDetails) : null;

  const requireKeys = async (details = tableDetails) => {
    if (!details) {
      throw new Error('Table details are required before authorizing this table session.');
    }
    return generateKeys(details);
  };

  return { blsKeys, isGenerating, generateKeys: requireKeys };
}
