// contexts/BLSContext.js
"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useConnection, useSignMessage } from 'wagmi';
import { keccak256, toBytes } from 'viem';
import * as bls from '@noble/bls12-381';

const DERIVATION_MESSAGE = `Welcome to Private Poker!

Sign this message to generate your secure in-game communication key. 

This key is used to encrypt your peer-to-peer WebRTC signals and verify your actions at the table.

This request will not trigger a blockchain transaction or cost any gas.`;

const BLSContext = createContext(null);

export function BLSProvider({ children }) {
    const { address, isConnected } = useConnection();
    const { mutateAsync } = useSignMessage();

    const [blsKeys, setBlsKeys] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [activeAddress, setActiveAddress] = useState(address);

    const channelRef = useRef(null);
    const promptLock = useRef(false); // The lock that kills the infinite loop

    // 1. Wipe keys if the user disconnects or changes accounts
    useEffect(() => {
        if (!isConnected || !address) {
            setBlsKeys(null);
            setActiveAddress(null);
            promptLock.current = false;
        } else if (activeAddress && address !== activeAddress) {
            // THE FIX: Wallet switched! Nuke the old keys.
            setBlsKeys(null);
            setActiveAddress(address);
            promptLock.current = false;
        } else if (!activeAddress && address) {
            setActiveAddress(address);
        }
    }, [isConnected, address, activeAddress]);

    // 2. Cross-tab sync
    useEffect(() => {
        channelRef.current = new BroadcastChannel('poker_key_sync');

        channelRef.current.onmessage = (event) => {
            const { type, keys, owner } = event.data;
            if (type === 'SHARE_KEY' && owner === address && !blsKeys) {
                setBlsKeys(keys);
                promptLock.current = true; // Lock prompts since we got the key
            } else if (type === 'REQUEST_KEY' && blsKeys) {
                channelRef.current.postMessage({ type: 'SHARE_KEY', keys: blsKeys, owner: address });
            }
        };

        if (isConnected && address && !blsKeys) {
            channelRef.current.postMessage({ type: 'REQUEST_KEY' });
        }

        return () => channelRef.current?.close();
    }, [isConnected, address, blsKeys]);

    // 3. The Derivation Logic
    const generateKeys = useCallback(async () => {
        // If we don't have an address, or we are already asking, abort!
        if (!address || promptLock.current) return;

        promptLock.current = true;
        setIsGenerating(true);

        try {
            const signature = await mutateAsync({ message: DERIVATION_MESSAGE });
            const seedHex = keccak256(signature);
            const privateKeyBytes = toBytes(seedHex);
            const publicKeyBytes = bls.getPublicKey(privateKeyBytes);

            const keys = {
                privateKey: Buffer.from(privateKeyBytes).toString('hex'),
                publicKey: Buffer.from(publicKeyBytes).toString('hex')
            };

            console.log("Generate BLS Keys", `0x${keys.publicKey}`);

            setBlsKeys(keys);
            channelRef.current?.postMessage({ type: 'SHARE_KEY', keys, owner: address });
            return keys;
        } catch (error) {
            console.error("User cancelled or signature failed:", error);
            promptLock.current = false; // Unlock so they can try again later
            throw error;
        } finally {
            setIsGenerating(false);
        }
    }, [address, mutateAsync]);

    return (
        <BLSContext.Provider value={{ blsKeys, isGenerating, generateKeys, isConnected }}>
            {children}
        </BLSContext.Provider>
    );
}

// Custom hook to use the context easily
export const useBLS = () => useContext(BLSContext);
