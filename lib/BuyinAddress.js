import { privateKeyToAccount } from 'viem/accounts';
import { getBufferedGasOverrides } from '@/lib/gas';
import { createPokerWalletClient, publicPokerClient } from '@/lib/publicPokerClient';

const GAS_TOP_UP_MULTIPLIER = 4n;

export class BuyinAddress {
  constructor({ privateKey, topUp }) {
    if (!privateKey) {
      throw new Error('BuyinAddress requires a private key.');
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

    const topUpAmount = amount * GAS_TOP_UP_MULTIPLIER;
    console.log('buyinAddress top-up requested', {
      buyinAddress: this.address,
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

    console.log('buyinAddress transaction prepared', {
      buyinAddress: this.address,
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
    console.log('buyinAddress transaction sent', {
      buyinAddress: this.address,
      contract,
      functionName,
      hash,
    });
    return hash;
  }
}
