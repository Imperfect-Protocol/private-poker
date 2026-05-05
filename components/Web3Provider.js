import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { WagmiProvider, http } from 'wagmi'
import { CHAIN_ID, CHAIN_RPC_URL, CHAIN_STALE_TIME } from '@/lib/chain'

import { arbitrumSepolia } from '@reown/appkit/networks'
import { nitroDevNode } from '@/lib/nitroDevNode'

function getNetwork() {
  if (CHAIN_ID === arbitrumSepolia.id) return arbitrumSepolia;
  if (CHAIN_ID === nitroDevNode.id) return nitroDevNode;

  console.error("Unknown CHAIN_ID: ", CHAIN_ID);
  throw "Error: Unknown CHAIN_ID";
}

const projectId = 'fde97f2dd2d0616984b88e3250697e81'
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: CHAIN_STALE_TIME,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
const networks = [getNetwork()]

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  transports: {
    [CHAIN_ID]: http(CHAIN_RPC_URL),
  }
})

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  features: {
    analytics: true
  }
})

export function Web3Provider({ children }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
