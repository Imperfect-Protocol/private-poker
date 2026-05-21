import { useCallback } from 'react';
import { useSendTransaction } from 'wagmi';
import { OperatorAddress } from '@/lib/OperatorAddress';
import { publicPokerClient } from '@/lib/publicPokerClient';

export function useOperatorAddress() {
  const { sendTransactionAsync } = useSendTransaction();

  const topUpGasToken = useCallback(async (operator, amount) => {
    const hash = await sendTransactionAsync({
      to: operator,
      value: amount,
    });
    console.log('operator top-up transaction sent', {
      operator,
      hash,
    });
    await publicPokerClient.waitForTransactionReceipt({ hash });
    console.log('operator top-up confirmed', {
      operator,
      hash,
    });
  }, [sendTransactionAsync]);

  const createOperatorAddress = useCallback((keysOrPrivateKey) => {
    const privateKey = typeof keysOrPrivateKey === 'string'
      ? keysOrPrivateKey
      : keysOrPrivateKey?.operatorPrivateKey;

    return new OperatorAddress({
      privateKey,
      topUp: topUpGasToken,
    });
  }, [topUpGasToken]);

  const writeContractFromOperator = useCallback(async ({
    operatorPrivateKey,
    contract,
    abi,
    functionName,
    args,
  }) => {
    const operator = createOperatorAddress(operatorPrivateKey);
    return operator.writeContract({
      contract,
      abi,
      functionName,
      args,
    });
  }, [createOperatorAddress]);

  const ensureOperatorGasForContract = useCallback(async ({
    operatorPrivateKey,
    contract,
    abi,
    functionName,
    args,
  }) => {
    const operator = createOperatorAddress(operatorPrivateKey);
    await operator.ensureGasForContract({
      contract,
      abi,
      functionName,
      args,
    });
  }, [createOperatorAddress]);

  return {
    createOperatorAddress,
    ensureOperatorGasForContract,
    topUpGasToken,
    writeContractFromOperator,
  };
}
