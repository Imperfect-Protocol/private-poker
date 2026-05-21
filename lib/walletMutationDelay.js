const MIN_WALLET_MUTATION_DELAY_MS = 1000;
const MAX_WALLET_MUTATION_DELAY_MS = 3000;

export function randomWalletMutationDelayMs() {
  return MIN_WALLET_MUTATION_DELAY_MS
    + Math.floor(Math.random() * (MAX_WALLET_MUTATION_DELAY_MS - MIN_WALLET_MUTATION_DELAY_MS + 1));
}

export function waitForWalletMutationDelay() {
  return new Promise((resolve) => {
    setTimeout(resolve, randomWalletMutationDelayMs());
  });
}
