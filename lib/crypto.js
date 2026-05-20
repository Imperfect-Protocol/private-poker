// lib/crypto.js
import { bls12_381 } from '@noble/curves/bls12-381';
import { bytesToHex, hexToBytes } from 'viem';

const ensureHexPrefix = (value) => {
    const normalized = value ?? '';
    return normalized.startsWith('0x') ? normalized : `0x${normalized}`;
};

export const normalizePeerPublicKey = (value) => ensureHexPrefix(value);

async function deriveAesKeyFromSharedPoint(sharedPointBytes) {
    const digest = await crypto.subtle.digest('SHA-256', sharedPointBytes);

    return await crypto.subtle.importKey(
        'raw',
        digest,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
}

function deriveSharedPoint(privateKeyBytes, publicKeyBytes) {
    const scalar = bls12_381.G1.normPrivateKeyToScalar(privateKeyBytes);
    return bls12_381.G1.ProjectivePoint
        .fromHex(publicKeyBytes)
        .multiply(scalar)
        .toRawBytes(true);
}

export async function encryptForPeer(recipientPubKeyHex, message) {
    // 1. Generate an ephemeral keypair
    const ephemeralPrivKey = bls12_381.utils.randomPrivateKey();
    const ephemeralPubKey = bls12_381.getPublicKey(ephemeralPrivKey);

    // 2. Use BLS G1 scalar multiplication to derive a shared point.
    const recipientPubKey = hexToBytes(normalizePeerPublicKey(recipientPubKeyHex));
    const sharedPoint = deriveSharedPoint(ephemeralPrivKey, recipientPubKey);

    // 3. Encrypt the message with the shared secret
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const cryptoKey = await deriveAesKeyFromSharedPoint(sharedPoint);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        data
    );

    // Return the payload structure needed for decryption
    return {
        ephemeralPubKey: bytesToHex(ephemeralPubKey),
        iv: bytesToHex(new Uint8Array(iv)),
        ciphertext: bytesToHex(new Uint8Array(ciphertext))
    };
}

export async function decryptFromPeer(myPrivKeyHex, encryptedPayload) {
    const { ephemeralPubKey, iv, ciphertext } = encryptedPayload;

    // 1. Reconstruct shared secret
    const myPrivKey = hexToBytes(ensureHexPrefix(myPrivKeyHex));
    const theirsPubKey = hexToBytes(ensureHexPrefix(ephemeralPubKey));
    const sharedPoint = deriveSharedPoint(myPrivKey, theirsPubKey);

    // 2. Import secret as AES key
    const cryptoKey = await deriveAesKeyFromSharedPoint(sharedPoint);

    // 3. Decrypt
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: hexToBytes(ensureHexPrefix(iv)) },
        cryptoKey,
        hexToBytes(ensureHexPrefix(ciphertext))
    );

    return new TextDecoder().decode(decrypted);
}
