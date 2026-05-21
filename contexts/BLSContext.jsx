"use client";

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useConnection, useSignTypedData } from 'wagmi';
import { keccak256, toBytes, toHex } from 'viem';
import * as bls from '@noble/bls12-381';
import { BLS_TABLE_SESSION_DOMAIN, BLS_TABLE_SESSION_TYPES } from '@/lib/constants';

const normalizeAddress = (value) => value?.toLowerCase() ?? '';
export function makeTableBlsSessionKey(tableDetails, walletAddress) {
    if (!tableDetails?.lobbyId || !tableDetails?.tableId || !walletAddress) return null;
    return [
        normalizeAddress(walletAddress),
        tableDetails.lobbyId,
        tableDetails.tableId,
    ].join(':');
}

function buildDerivationTypedData(tableDetails) {
    return {
        domain: BLS_TABLE_SESSION_DOMAIN,
        types: BLS_TABLE_SESSION_TYPES,
        primaryType: 'PrivatePokerTableSession',
        message: {
            tableId: BigInt(tableDetails.tableId),
            lobbyId: BigInt(tableDetails.lobbyId),
        },
    };
}

const BLSContext = createContext(null);

export function BLSProvider({ children }) {
    const { address, isConnected } = useConnection();
    const { mutateAsync } = useSignTypedData();

    const [tableKeys, setTableKeys] = useState({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [activeAddress, setActiveAddress] = useState(address);

    useEffect(() => {
        if (!isConnected || !address) {
            setTableKeys({});
            setActiveAddress(null);
        } else if (activeAddress && address !== activeAddress) {
            setTableKeys({});
            setActiveAddress(address);
        } else if (!activeAddress && address) {
            setActiveAddress(address);
        }
    }, [isConnected, address, activeAddress]);

    const getKeys = useCallback((tableDetails) => {
        const sessionKey = makeTableBlsSessionKey(tableDetails, address);
        return sessionKey ? tableKeys[sessionKey] ?? null : null;
    }, [address, tableKeys]);

    const generateKeys = useCallback(async (tableDetails) => {
        if (!address) {
            throw new Error('Wallet must be connected before creating a table session key.');
        }

        const sessionKey = makeTableBlsSessionKey(tableDetails, address);
        if (!sessionKey) {
            throw new Error('Table details are required before creating a table session key.');
        }
        if (tableKeys[sessionKey]) return tableKeys[sessionKey];

        setIsGenerating(true);

        try {
            const signature = await mutateAsync(buildDerivationTypedData(tableDetails));
            const seedHex = keccak256(signature);
            const privateKeyBytes = toBytes(seedHex);
            const publicKeyBytes = bls.getPublicKey(privateKeyBytes);

            const keys = {
                privateKey: toHex(privateKeyBytes).slice(2),
                publicKey: toHex(publicKeyBytes).slice(2),
                sessionKey,
            };

            setTableKeys((current) => ({
                ...current,
                [sessionKey]: keys,
            }));
            return keys;
        } catch (error) {
            console.error("User cancelled or signature failed:", error);
            throw error;
        } finally {
            setIsGenerating(false);
        }
    }, [address, mutateAsync, tableKeys]);
    
    return (
        <BLSContext.Provider value={{ getKeys, isGenerating, generateKeys, isConnected }}>
            {children}
        </BLSContext.Provider>
    );
}

export const useBLS = () => useContext(BLSContext);
