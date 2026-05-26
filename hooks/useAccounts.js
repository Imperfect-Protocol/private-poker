import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnection, useWriteContract } from 'wagmi';
import { decodeAbiParameters, isAddress, parseAbi } from 'viem';
import { useAccountSession } from '@/contexts/AccountSessionContext.jsx';
import {
  EMPTY_ACCOUNT_PROFILE,
  buildAccountProfileBlob,
  profileHasRequiredFields,
  profileNeedsEdit,
  readAccountProfilePublicBlob,
  readAccountProfileBlob,
} from '@/lib/accountProfile';
import { buildAccountSessionTypedData } from '@/lib/accountSession';
import { PRIVATE_POKER_CONTRACT_ADDRESS, USDC_CONTRACT_ADDRESS } from '@/lib/chain';
import { SUBSCRIPTION_TIERS } from '@/lib/constants';
import { getBufferedGasOverrides } from '@/lib/gas';
import { publicPokerClient } from '@/lib/publicPokerClient';
import { useOperatorAddress } from '@/hooks/useOperatorAddress';

const USDC_SCALE = 1_000_000n;

const USDC_ABI = parseAbi([
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
]);

const ACCOUNT_ABI = parseAbi([
  "function subscribe(address player_address, address operator, bytes annonce_public_key, bytes encrypted_profile, uint8 subscription_tier)",
  "function updateAccount(address player_address, address operator, bytes annonce_public_key, bytes encrypted_profile)",
  "function isSubscriptionActive(address player_address) view returns (bool)",
  "function getAccount(address player_address) view returns (bytes)",
]);

const normalizeAddress = (value) => value?.toLowerCase() ?? '';

function tierToContractId(tier) {
  const index = SUBSCRIPTION_TIERS.findIndex((entry) => entry.id === tier.id);
  return index + 1;
}

function tierUsdcAmount(tier) {
  return BigInt(tier.monthlyUsd) * USDC_SCALE;
}

function decodeAccountBlob(blob) {
  const [account] = decodeAbiParameters(
    [{
      type: 'tuple',
      components: [
        { name: 'playerAddress', type: 'address' },
        { name: 'operator', type: 'address' },
        { name: 'annoncePublicKey', type: 'bytes' },
        { name: 'encryptedProfile', type: 'bytes' },
        { name: 'subscriptionTier', type: 'uint8' },
        { name: 'subscriptionPaidAt', type: 'uint256' },
        { name: 'subscriptionExpiresAt', type: 'uint256' },
      ],
    }],
    blob,
  );

  return account;
}

export function useAccounts({ playerAddresses = [] } = {}) {
  const router = useRouter();
  const { accountSession, isSigningIn, isWalletConnected, signIn } = useAccountSession();
  const { address } = useConnection();
  const { mutateAsync: writeWalletContract } = useWriteContract();
  const { createOperatorAddress } = useOperatorAddress();
  const [step, setStep] = useState('signin');
  const [profileMode, setProfileMode] = useState('edit');
  const [profile, setProfile] = useState(EMPTY_ACCOUNT_PROFILE);
  const [profileBlob, setProfileBlob] = useState('');
  const [hasOnchainAccount, setHasOnchainAccount] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSubscriptionActive, setIsSubscriptionActive] = useState(false);
  const [playerDisplaynames, setPlayerDisplaynames] = useState({});
  const [selectedTier, setSelectedTier] = useState(SUBSCRIPTION_TIERS[1]);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isCheckingAccount, setIsCheckingAccount] = useState(false);
  const [subscriptionStep, setSubscriptionStep] = useState('');
  const [error, setError] = useState('');

  const signinData = useMemo(() => buildAccountSessionTypedData(), []);
  const signinFields = useMemo(() => (
    Object.entries(signinData.message).map(([field, value]) => ({
      field,
      value: typeof value === 'bigint' ? value.toString() : value,
    }))
  ), [signinData]);

  const playerAddressesKey = useMemo(() => (
    [...new Set(playerAddresses.map(normalizeAddress).filter(Boolean))].sort().join('|')
  ), [playerAddresses]);

  const syncProfileBlobToAccount = useCallback(async (blobHex) => {
    if (!accountSession || !blobHex || !isAddress(PRIVATE_POKER_CONTRACT_ADDRESS)) return;

    const operator = createOperatorAddress(accountSession.operatorPrivateKey);
    const updateHash = await operator.writeContract({
      contract: PRIVATE_POKER_CONTRACT_ADDRESS,
      abi: ACCOUNT_ABI,
      functionName: 'updateAccount',
      args: [
        accountSession.walletAddress,
        accountSession.operator,
        accountSession.operatorBlsPublicKey ?? '0x',
        blobHex,
      ],
    });
    await publicPokerClient.waitForTransactionReceipt({ hash: updateHash });
  }, [accountSession, createOperatorAddress]);

  const loadAccountFromChain = useCallback(async (walletAddress, session) => {
    if (!isAddress(PRIVATE_POKER_CONTRACT_ADDRESS)) {
      return { exists: false, profileRecord: null, account: null };
    }

    const blob = await publicPokerClient.readContract({
      address: PRIVATE_POKER_CONTRACT_ADDRESS,
      abi: ACCOUNT_ABI,
      functionName: 'getAccount',
      args: [walletAddress],
    });
    const account = decodeAccountBlob(blob);
    const profileRecord = await readAccountProfileBlob(account.encryptedProfile, session);
    return { exists: true, profileRecord, account };
  }, []);

  useEffect(() => {
    if (!accountSession?.walletAddress) return undefined;

    let isMounted = true;
    const loadAccount = async () => {
      setIsCheckingAccount(true);
      if (!isAddress(PRIVATE_POKER_CONTRACT_ADDRESS)) {
        if (isMounted) {
          setHasOnchainAccount(false);
          setProfile(EMPTY_ACCOUNT_PROFILE);
          setProfileBlob('');
          setProfileMode('edit');
          setIsSubscriptionActive(false);
          setStep('profile');
          setIsCheckingAccount(false);
        }
        return;
      }

      try {
        const { exists, profileRecord } = await loadAccountFromChain(
          accountSession.walletAddress,
          accountSession,
        );
        const isActive = await publicPokerClient.readContract({
          address: PRIVATE_POKER_CONTRACT_ADDRESS,
          abi: ACCOUNT_ABI,
          functionName: 'isSubscriptionActive',
          args: [accountSession.walletAddress],
        });
        if (!isMounted) return;

        setHasOnchainAccount(exists);
        setProfile(profileRecord?.profile ?? EMPTY_ACCOUNT_PROFILE);
        setProfileBlob(profileRecord?.blobHex ?? '');
        setProfileMode(profileNeedsEdit(profileRecord) ? 'edit' : 'view');
        setIsSubscriptionActive(Boolean(isActive));
        setStep('profile');
      } catch (err) {
        console.debug('Account chain load failed:', err);
        if (isMounted) {
          setHasOnchainAccount(false);
          setProfile(EMPTY_ACCOUNT_PROFILE);
          setProfileBlob('');
          setProfileMode('edit');
          setIsSubscriptionActive(false);
          setStep('profile');
        }
      } finally {
        if (isMounted) setIsCheckingAccount(false);
      }
    };

    loadAccount();
    return () => {
      isMounted = false;
    };
  }, [accountSession, loadAccountFromChain]);

  useEffect(() => {
    if (!playerAddressesKey) return undefined;

    let isMounted = true;
    const addresses = playerAddressesKey.split('|').filter(Boolean);

    const loadDisplaynames = async () => {
      const entries = await Promise.all(addresses.map(async (playerAddress) => {
        try {
          const blob = await publicPokerClient.readContract({
            address: PRIVATE_POKER_CONTRACT_ADDRESS,
            abi: ACCOUNT_ABI,
            functionName: 'getAccount',
            args: [playerAddress],
          });
          const account = decodeAccountBlob(blob);
          const publicProfile = readAccountProfilePublicBlob(account.encryptedProfile);
          const displayName = publicProfile.displayName?.trim();
          return displayName ? [playerAddress, displayName] : null;
        } catch (err) {
          console.debug('Player display name lookup failed:', playerAddress, err);
          return null;
        }
      }));

      if (!isMounted) return;
      setPlayerDisplaynames((current) => ({
        ...current,
        ...Object.fromEntries(entries.filter(Boolean)),
      }));
    };

    loadDisplaynames();
    return () => {
      isMounted = false;
    };
  }, [playerAddressesKey]);

  const handleSignin = useCallback(async () => {
    setError('');

    try {
      const session = await signIn();
      if (session) setIsCheckingAccount(true);
    } catch (err) {
      console.error('Account sign-in failed:', err);
      setError('Signature cancelled. Sign in when you are ready.');
    }
  }, [signIn]);

  const handleProfileChange = useCallback((field, value) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const continueAfterProfile = useCallback(() => {
    if (isSubscriptionActive) {
      router.push('/main-lobby');
      return;
    }
    setStep('subscription');
  }, [isSubscriptionActive, router]);

  const handleProfileEdit = useCallback(() => {
    setProfileMode('edit');
    setError('');
  }, []);

  const handleProfileContinue = useCallback(async () => {
    if (!profileHasRequiredFields(profile) || !profileBlob) {
      setProfileMode('edit');
      setError('Complete your profile before continuing.');
      return;
    }
    setError('');
    setIsSavingProfile(true);
    try {
      continueAfterProfile();
    } catch (err) {
      console.error('Account profile sync failed:', err);
      setError(err?.message ?? 'Profile sync failed.');
    } finally {
      setIsSavingProfile(false);
    }
  }, [continueAfterProfile, profile, profileBlob]);

  const handleProfileSave = useCallback(async () => {
    setError('');
    if (!accountSession) return;
    if (!profileHasRequiredFields(profile)) {
      setError('Display name, email, phone number, and legal name are required.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const blobHex = await buildAccountProfileBlob(profile, accountSession);
      if (hasOnchainAccount && isAddress(PRIVATE_POKER_CONTRACT_ADDRESS)) {
        await syncProfileBlobToAccount(blobHex);
      }
      setProfileBlob(blobHex);
      setProfileMode('view');
      continueAfterProfile();
    } catch (err) {
      console.error('Account profile save failed:', err);
      setError(err?.message ?? 'Profile save failed.');
    } finally {
      setIsSavingProfile(false);
    }
  }, [accountSession, continueAfterProfile, hasOnchainAccount, profile, syncProfileBlobToAccount]);

  const getPlayerDisplayname = useCallback((playerAddress) => {
    const normalized = normalizeAddress(playerAddress);
    if (!normalized) return '';
    return playerDisplaynames[normalized] || '';
  }, [playerDisplaynames]);

  const approveOperatorUsdc = useCallback(async (session, amount) => {
    const allowance = await publicPokerClient.readContract({
      address: USDC_CONTRACT_ADDRESS,
      abi: USDC_ABI,
      functionName: 'allowance',
      args: [session.walletAddress, session.operator],
    });
    if (allowance >= amount) return;

    const args = [session.operator, amount];
    const overrides = await getBufferedGasOverrides(publicPokerClient, {
      address: USDC_CONTRACT_ADDRESS,
      abi: USDC_ABI,
      functionName: 'approve',
      args,
      account: session.walletAddress,
    });
    const hash = await writeWalletContract({
      address: USDC_CONTRACT_ADDRESS,
      abi: USDC_ABI,
      functionName: 'approve',
      args,
      ...overrides,
    });
    await publicPokerClient.waitForTransactionReceipt({ hash });
  }, [writeWalletContract]);

  const handleContinue = useCallback(async () => {
    setError('');

    try {
      if (!isAddress(USDC_CONTRACT_ADDRESS)) {
        throw new Error('USDC contract address is not configured.');
      }
      if (!isAddress(PRIVATE_POKER_CONTRACT_ADDRESS)) {
        throw new Error('PrivatePoker contract address is not configured.');
      }

      const session = accountSession ?? await signIn();
      if (!session) return;
      if (!profileBlob) {
        setStep('profile');
        setError('Complete your profile before subscribing.');
        return;
      }
      if (!address || address.toLowerCase() !== session.walletAddress.toLowerCase()) {
        throw new Error('Connected wallet does not match the signed-in account.');
      }

      setIsSubscribing(true);
      const amount = tierUsdcAmount(selectedTier);
      const operator = createOperatorAddress(session.operatorPrivateKey);

      setSubscriptionStep('Approve USDC for Operator...');
      await approveOperatorUsdc(session, amount);

      setSubscriptionStep('Operator transfers USDC into PrivatePoker...');
      const transferHash = await operator.writeContract({
        contract: USDC_CONTRACT_ADDRESS,
        abi: USDC_ABI,
        functionName: 'transferFrom',
        args: [session.walletAddress, PRIVATE_POKER_CONTRACT_ADDRESS, amount],
      });
      await publicPokerClient.waitForTransactionReceipt({ hash: transferHash });

      setSubscriptionStep('Operator creates account...');
      const subscribeHash = await operator.writeContract({
        contract: PRIVATE_POKER_CONTRACT_ADDRESS,
        abi: ACCOUNT_ABI,
        functionName: 'subscribe',
        args: [
          session.walletAddress,
          session.operator,
          session.operatorBlsPublicKey ?? '0x',
          profileBlob,
          tierToContractId(selectedTier),
        ],
      });
      await publicPokerClient.waitForTransactionReceipt({ hash: subscribeHash });

      setHasOnchainAccount(true);
      setIsSubscriptionActive(true);
      router.push('/main-lobby');
    } catch (err) {
      console.error('Subscription failed:', err);
      setError(err?.shortMessage ?? err?.message ?? 'Subscription failed.');
    } finally {
      setIsSubscribing(false);
      setSubscriptionStep('');
    }
  }, [
    accountSession,
    address,
    approveOperatorUsdc,
    createOperatorAddress,
    profileBlob,
    router,
    selectedTier,
    signIn,
  ]);

  return {
    accountSession,
    error,
    handleProfileChange,
    handleProfileContinue,
    handleProfileEdit,
    handleProfileSave,
    handleContinue,
    handleSignin,
    getPlayerDisplayname,
    isCheckingAccount,
    isSavingProfile,
    isSigningIn,
    isSubscribing,
    isWalletConnected,
    profile,
    profileBlob,
    profileMode,
    selectedTier,
    setSelectedTier,
    signinData,
    signinFields,
    step,
    subscriptionStep,
    subscriptionTiers: SUBSCRIPTION_TIERS,
  };
}
