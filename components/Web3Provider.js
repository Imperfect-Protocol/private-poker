'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { WagmiProvider } from 'wagmi'

import { arbitrumSepolia } from '@reown/appkit/networks'

const nitroDevNode = {
  id: 412346,
  name: 'Arbitrum NitroDevNode',
  network: 'nitro-devnode',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['/local-rpc'],
    },
    public: {
      http: ['/local-rpc'],
    },
  },
  testnet: true,
};


const projectId = 'fde97f2dd2d0616984b88e3250697e81'
const queryClient = new QueryClient()
const networks = [nitroDevNode]
// const networks = [arbitrumSepolia]

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true
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