import { privateKeyToAccount } from 'viem/accounts';
import { OPERATOR_GAS_MAX_TOPUP, OPERATOR_GAS_TOPUP_FACTOR } from '@/lib/constants';
import { getBufferedGasOverrides } from '@/lib/gas';
import { createPokerWalletClient, publicPokerClient } from '@/lib/publicPokerClient';

export class OperatorAddress {
  constructor({ privateKey, topUp }) {
    if (!privateKey) {
      throw new Error('OperatorAddress requires a private key.');
    }

    this.privateKey = privateKey;
    this.account = privateKeyToAccount(privateKey);
    this.address = this.account.address;
    this.topUp = topUp;
  }

  async ensureGas(amount) {
    if (amount <= 0n) return;

    const balance = await publicPokerClient.getBalance({ address: this.address });
    if (balance >= amount) return;

    let topUpAmount = amount * OPERATOR_GAS_TOPUP_FACTOR;
    if (topUpAmount > OPERATOR_GAS_MAX_TOPUP) {
      console.log('operator top-up amount capped', topUpAmount);
      topUpAmount = OPERATOR_GAS_MAX_TOPUP;
    }
    console.log('operator top-up requested', {
      operator: this.address,
      estimatedGasWei: amount.toString(),
      amountWei: topUpAmount.toString(),
    });
    await this.topUp(this.address, topUpAmount);
  }

  async estimateContractGasFee({ contract, abi, functionName, args }) {
    const gasOverrides = await getBufferedGasOverrides(publicPokerClient, {
      address: contract,
      abi,
      functionName,
      args,
      account: this.address,
    });
    const gasFee = gasOverrides.gas * (gasOverrides.maxFeePerGas ?? gasOverrides.gasPrice ?? 0n);

    return { gasFee, gasOverrides };
  }

  async ensureGasForContract({ contract, abi, functionName, args }) {
    const { gasFee } = await this.estimateContractGasFee({
      contract,
      abi,
      functionName,
      args,
    });
    await this.ensureGas(gasFee);
  }

  async writeContract({ contract, abi, functionName, args }) {
    const walletClient = createPokerWalletClient(this.account);
    const { gasFee, gasOverrides } = await this.estimateContractGasFee({
      contract,
      abi,
      functionName,
      args,
    });
    const balance = await publicPokerClient.getBalance({ address: this.address });

    console.log('operator transaction prepared', {
      operator: this.address,
      contract,
      functionName,
      balanceWei: balance.toString(),
      requiredGasWei: gasFee.toString(),
      args,
    });

    if (balance < gasFee) {
      await this.ensureGas(gasFee);
    }

    const hash = await walletClient.writeContract({
      address: contract,
      abi,
      functionName,
      args,
      ...gasOverrides,
    });
    console.log('operator transaction sent', {
      operator: this.address,
      contract,
      functionName,
      hash,
    });
    return hash;
  }
}
