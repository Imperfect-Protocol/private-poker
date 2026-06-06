import { chainConfig as devnodeChainConfig } from './devnode';
import { chainConfig as sepoliaChainConfig } from './sepolia';

const chainConfigs = {
  devnode: devnodeChainConfig,
  sepolia: sepoliaChainConfig,
};

const selectedChain = process.env.NEXT_PUBLIC_PRIVATE_POKER_CHAIN ?? 'sepolia';
const selectedChainKey = selectedChain.toLowerCase();

export const CHAIN_CONFIG = chainConfigs[selectedChainKey] ?? sepoliaChainConfig;

export const CHAIN_KEY = CHAIN_CONFIG.key;
export const CHAIN_ID = CHAIN_CONFIG.chainId;
export const CHAIN_RPC_URL = CHAIN_CONFIG.rpcUrl;
export const USDC_CONTRACT_ADDRESS = CHAIN_CONFIG.usdcContractAddress;
export const PRIVATE_POKER_CONTRACT_ADDRESS = CHAIN_CONFIG.privatePokerContractAddress;
export const LOBBY_CONTRACT_ADDRESS = CHAIN_CONFIG.privatePokerContractAddress;
export const ACCOUNT_CONTRACT_ADDRESS = CHAIN_CONFIG.privatePokerContractAddress;
export const CHIPS_CONTRACT_ADDRESS = CHAIN_CONFIG.privatePokerContractAddress;
export const CASHIER_CONTRACT_ADDRESS = CHAIN_CONFIG.privatePokerContractAddress;
export const VERIFY_SHUFFLE_CONTRACT_ADDRESS = CHAIN_CONFIG.privatePokerContractAddress;
export const VERIFY_UNMASKING_CONTRACT_ADDRESS = CHAIN_CONFIG.privatePokerContractAddress;
export const CHAIN_POLLING_INTERVAL = CHAIN_CONFIG.pollingInterval;
export const CHAIN_STALE_TIME = CHAIN_CONFIG.staleTime;
