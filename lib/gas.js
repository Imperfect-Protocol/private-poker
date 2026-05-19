export async function getBufferedGasOverrides(publicClient, gasRequest) {
  const gas = await publicClient.estimateContractGas(gasRequest);
  const gasWithBuffer = gas + (gas / 5n);

  try {
    const fees = await publicClient.estimateFeesPerGas();
    if (fees?.maxFeePerGas && fees?.maxPriorityFeePerGas) {
      return {
        gas: gasWithBuffer,
        maxFeePerGas: fees.maxFeePerGas + (fees.maxFeePerGas / 2n),
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas + (fees.maxPriorityFeePerGas / 2n),
      };
    }
  } catch {
    // Fall through to block/base-fee fallback.
  }

  try {
    const block = await publicClient.getBlock();
    if (block?.baseFeePerGas) {
      const maxPriorityFeePerGas = 1_000_000n;
      return {
        gas: gasWithBuffer,
        maxFeePerGas: (block.baseFeePerGas * 2n) + maxPriorityFeePerGas,
        maxPriorityFeePerGas,
      };
    }
  } catch {
    // Fall through to legacy gasPrice fallback.
  }

  const gasPrice = await publicClient.getGasPrice();
  return {
    gas: gasWithBuffer,
    gasPrice: gasPrice + (gasPrice / 2n),
  };
}
