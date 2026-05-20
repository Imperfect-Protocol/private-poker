"use client";

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useConnection, useSignMessage } from 'wagmi';
import { keccak256, toBytes, toHex } from 'viem';
import * as bls from '@noble/bls12-381';

const normalizeAddress = (value) => value?.toLowerCase() ?? '';
const STAKES_BY_BUY_IN = [
    { buyIn: 1, name: 'Micro Stakes', blinds: '$0.01/$0.02' },
    { buyIn: 10, name: 'Low Stakes', blinds: '$0.10/$0.20' },
    { buyIn: 100, name: 'Mid Stakes', blinds: '$1/$2' },
    { buyIn: 1000, name: 'High Stakes', blinds: '$10/$20' },
    { buyIn: 10000, name: 'Large Stakes', blinds: '$100/$200' },
];

export function makeTableBlsSessionKey(tableDetails, walletAddress) {
    if (!tableDetails?.lobbyId || !tableDetails?.tableId || !walletAddress) return null;
    return [
        normalizeAddress(walletAddress),
        tableDetails.lobbyId,
        tableDetails.tableId,
    ].join(':');
}

function getStakeDetails(tableDetails) {
    const buyIn = Number(tableDetails.buyIn ?? tableDetails.buyin ?? 0);
    const option = STAKES_BY_BUY_IN.find((stake) => stake.buyIn === buyIn);

    return {
        buyInLabel: buyIn > 0 ? `$${buyIn} CHIPS` : 'Table buy-in',
        blindsLabel: option?.blinds ?? tableDetails.blindsLabel ?? tableDetails.blinds ?? 'Table blinds',
        stakesLabel: option?.name ?? tableDetails.stakesLabel ?? 'Table stakes',
    };
}

function buildDerivationMessage(tableDetails) {
    const { buyInLabel, blindsLabel, stakesLabel } = getStakeDetails(tableDetails);

    return `Welcome to PrivatePoker!

You are taking a seat at a peer-to-peer Private Poker table.

Please sign this message to create your table BLS key pair.
This key lets your browser join the private peer-to-peer table network,
encrypt table messages, and sign poker actions for this table only.

Table Details
-------------
Table: ${tableDetails.tableName ?? 'Private Poker Table'}
Table Scope: ${tableDetails.tableId}::${tableDetails.lobbyId}
Buy-in: ${buyInLabel}
Blinds: ${blindsLabel}
Stakes: ${stakesLabel}

This is not a blockchain transaction.
It costs no gas and does not move chips.`;
}

const BLSContext = createContext(null);

export function BLSProvider({ children }) {
    const { address, isConnected } = useConnection();
    const { mutateAsync } = useSignMessage();

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
            const signature = await mutateAsync({
                message: buildDerivationMessage(tableDetails),
            });
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
