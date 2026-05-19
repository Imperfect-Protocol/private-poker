// lib/crypto.js
import { bls12_381 } from '@noble/curves/bls12-381';
import { bytesToHex, hexToBytes } from 'viem';

export async function encryptForPeer(recipientPubKeyHex, message) {
    // 1. Generate an ephemeral keypair
    const ephemeralPrivKey = bls12_381.utils.randomPrivateKey();
    const ephemeralPubKey = bls12_381.getPublicKey(ephemeralPrivKey);

    // 2. Perform Diffie-Hellman to get a shared secret
    const recipientPubKey = hexToBytes(recipientPubKeyHex.replace('0x', ''));
    const sharedSecret = bls12_381.getSharedSecret(ephemeralPrivKey, recipientPubKey);

    // 3. Encrypt the message with the shared secret
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    
    const cryptoKey = await crypto.subtle.importKey(
        'raw', 
        sharedSecret.slice(0, 32), 
        { name: 'AES-GCM' }, 
        false, 
        ['encrypt']
    );

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
    const myPrivKey = hexToBytes(myPrivKeyHex.replace('0x', ''));
    const theirsPubKey = hexToBytes(ephemeralPubKey.replace('0x', ''));
    const sharedSecret = bls12_381.getSharedSecret(myPrivKey, theirsPubKey);

    // 2. Import secret as AES key
    const cryptoKey = await crypto.subtle.importKey(
        'raw', 
        sharedSecret.slice(0, 32), 
        { name: 'AES-GCM' }, 
        false, 
        ['decrypt']
    );

    // 3. Decrypt
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: hexToBytes(iv.replace('0x', '')) },
        cryptoKey,
        hexToBytes(ciphertext.replace('0x', ''))
    );

    return new TextDecoder().decode(decrypted);
}