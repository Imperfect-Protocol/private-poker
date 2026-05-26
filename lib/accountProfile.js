import { bytesToHex, hexToBytes } from 'viem';
import { decryptFromPeer, encryptForPeer } from '@/lib/crypto';

export const ACCOUNT_PROFILE_VERSION = 1;

export const EMPTY_ACCOUNT_PROFILE = {
  displayName: '',
  email: '',
  phone: '',
  legalName: '',
};

export function profileHasRequiredFields(profile) {
  return Boolean(
    profile?.displayName?.trim()
    && profile?.email?.trim()
    && profile?.phone?.trim()
    && profile?.legalName?.trim(),
  );
}

export function profileNeedsEdit(profileRecord) {
  return !profileRecord
    || profileRecord.version !== ACCOUNT_PROFILE_VERSION
    || !profileHasRequiredFields(profileRecord.profile);
}

export function encodeProfileBlob(profileRecord) {
  return bytesToHex(new TextEncoder().encode(JSON.stringify(profileRecord)));
}

export function decodeProfileBlob(blobHex) {
  if (!blobHex) return null;
  return JSON.parse(new TextDecoder().decode(hexToBytes(blobHex)));
}

export async function buildAccountProfileBlob(profile, accountSession) {
  if (!accountSession?.operatorBlsPublicKey) {
    throw new Error('Operator BLS public key is missing.');
  }

  const publicProfile = {
    displayName: profile.displayName.trim(),
  };
  const sensitiveProfile = {
    email: profile.email.trim(),
    phone: profile.phone.trim(),
    legalName: profile.legalName.trim(),
  };
  const encryptedSensitiveProfile = await encryptForPeer(
    accountSession.operatorBlsPublicKey,
    JSON.stringify(sensitiveProfile),
  );

  return encodeProfileBlob({
    type: 'PrivatePokerAccountProfile',
    version: ACCOUNT_PROFILE_VERSION,
    publicProfile,
    encryptedSensitiveProfile,
  });
}

export async function readAccountProfileBlob(blobHex, accountSession) {
  if (!blobHex || !accountSession?.operatorBlsPrivateKey) return null;

  const blob = decodeProfileBlob(blobHex);
  if (!blob?.encryptedSensitiveProfile) return null;

  const sensitiveProfile = JSON.parse(await decryptFromPeer(
    accountSession.operatorBlsPrivateKey,
    blob.encryptedSensitiveProfile,
  ));

  return {
    blobHex,
    version: blob.version,
    profile: {
      ...EMPTY_ACCOUNT_PROFILE,
      displayName: blob.publicProfile?.displayName ?? '',
      email: sensitiveProfile.email ?? '',
      phone: sensitiveProfile.phone ?? '',
      legalName: sensitiveProfile.legalName ?? '',
    },
  };
}

export function readAccountProfilePublicBlob(blobHex) {
  const blob = decodeProfileBlob(blobHex);
  return {
    version: blob?.version ?? null,
    displayName: blob?.publicProfile?.displayName ?? '',
  };
}
