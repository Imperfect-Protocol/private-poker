import { useCallback } from 'react';
import { useConnection, useSendTransaction } from 'wagmi';
import { OPERATOR_GAS_MAX_TOPUP, OPERATOR_GAS_TOPUP_FACTOR } from '@/lib/constants';
import { OperatorAddress } from '@/lib/OperatorAddress';
import { publicPokerClient } from '@/lib/publicPokerClient';

const FALLBACK_GAS_TOKEN_TRANSFER_GAS = 100_000n;

const maxBigInt = (left, right) => (left > right ? left : right);
const minBigInt = (left, right) => (left < right ? left : right);

async function getOperatorTopUpGasOverrides({ account, operator, amount }) {
  try {
    const [gas, fees, block] = await Promise.all([
      publicPokerClient.estimateGas({
        account,
        to: operator,
        value: amount,
      }),
      publicPokerClient.estimateFeesPerGas(),
      publicPokerClient.getBlock(),
    ]);
    const baseFee = block?.baseFeePerGas ?? 0n;
    const priorityFee = fees?.maxPriorityFeePerGas ?? 1_000_000n;
    const maxFeePerGas = maxBigInt(
      fees?.maxFeePerGas ?? 0n,
      (baseFee * 2n) + priorityFee,
    );
    const maxPriorityFeePerGas = minBigInt(
      priorityFee,
      maxFeePerGas > baseFee ? maxFeePerGas - baseFee : priorityFee,
    );

    return {
      gas: gas + (gas / 5n),
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
  } catch {
    const gasPrice = await publicPokerClient.getGasPrice();
    return {
      gas: FALLBACK_GAS_TOKEN_TRANSFER_GAS,
      gasPrice,
    };
  }
}

export function useOperatorAddress() {
  const { address } = useConnection();
  const { sendTransactionAsync } = useSendTransaction();

  const topUpGasToken = useCallback(async (operator, amount) => {
    const gasOverrides = await getOperatorTopUpGasOverrides({
      account: address,
      operator,
      amount,
    });
    console.log('operator top-up prepared', {
      from: address,
      operator,
      amountWei: amount.toString(),
      gasOverrides,
    });
    const hash = await sendTransactionAsync({
      to: operator,
      value: amount,
      ...gasOverrides,
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
  }, [address, sendTransactionAsync]);

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
