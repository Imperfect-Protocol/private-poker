import { useCallback } from 'react';
import { useSendTransaction } from 'wagmi';
import { BuyinAddress } from '@/lib/BuyinAddress';
import { publicPokerClient } from '@/lib/publicPokerClient';

export function useBuyinAddress() {
  const { sendTransactionAsync } = useSendTransaction();

  const topUpGasToken = useCallback(async (buyinAddress, amount) => {
    const hash = await sendTransactionAsync({
      to: buyinAddress,
      value: amount,
    });
    console.log('buyinAddress top-up transaction sent', {
      buyinAddress,
      hash,
    });
    await publicPokerClient.waitForTransactionReceipt({ hash });
    console.log('buyinAddress top-up confirmed', {
      buyinAddress,
      hash,
    });
  }, [sendTransactionAsync]);

  const createBuyinAddress = useCallback((keysOrPrivateKey) => {
    const privateKey = typeof keysOrPrivateKey === 'string'
      ? keysOrPrivateKey
      : keysOrPrivateKey?.buyinPrivateKey;

    return new BuyinAddress({
      privateKey,
      topUp: topUpGasToken,
    });
  }, [topUpGasToken]);

  const writeContractFromBuyinAddress = useCallback(async ({
    buyinPrivateKey,
    contract,
    abi,
    functionName,
    args,
  }) => {
    const buyinAddress = createBuyinAddress(buyinPrivateKey);
    return buyinAddress.writeContract({
      contract,
      abi,
      functionName,
      args,
    });
  }, [createBuyinAddress]);

  const ensureBuyinAddressGasForContract = useCallback(async ({
    buyinPrivateKey,
    contract,
    abi,
    functionName,
    args,
  }) => {
    const buyinAddress = createBuyinAddress(buyinPrivateKey);
    await buyinAddress.ensureGasForContract({
      contract,
      abi,
      functionName,
      args,
    });
  }, [createBuyinAddress]);

  return {
    createBuyinAddress,
    ensureBuyinAddressGasForContract,
    topUpGasToken,
    writeContractFromBuyinAddress,
  };
}
