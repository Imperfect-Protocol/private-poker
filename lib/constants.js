// lib/constants.js

export const GAME_TYPES = {
    1: "Texas Hold'em",
    2: "Omaha",
    3: "Draw Poker"
};

export const LOBBY_FLAGS = {
    0: "inactive",
    1: "active"
};

export const TABLE_FLAGS = {
    0: "seating",
    1: "playing",
    2: "finished"
};

export const CHIPS_DECIMALS = 6;
export const CHIPS_SCALE = 1_000_000n;
export const OPERATOR_GAS_TOPUP_FACTOR = 10n;
export const OPERATOR_GAS_MAX_TOPUP = 500_000_000_000_000n;

export const SUBSCRIPTION_TIERS = [
    {
        id: "starter",
        name: "Starter",
        monthlyUsd: 10,
        chips: 1_000,
        accent: "teal",
        description: "Casual tables, quiet bankroll, easy entry.",
    },
    {
        id: "regular",
        name: "Regular",
        monthlyUsd: 50,
        chips: 10_000,
        accent: "cyan",
        description: "Room for deeper games and regular sessions.",
    },
    {
        id: "professional",
        name: "Professional",
        monthlyUsd: 200,
        chips: 100_000,
        accent: "amber",
        description: "Serious stacks for high-volume play.",
    },
];

export const BLS_TABLE_SESSION_DOMAIN = {
    name: "PrivatePoker",
    version: "1",
};

export const BLS_TABLE_SESSION_TYPES = {
    PrivatePokerTableSession: [
        { name: "tableId", type: "uint256" },
        { name: "lobbyId", type: "uint256" },
    ],
};

export function getGameTypeName(gameTypeInt) {
    return GAME_TYPES[gameTypeInt] || "Unknown Game";
}

export function getLobbyStatus(flagInt) {
    return LOBBY_FLAGS[flagInt] || "inactive";
}

export function getTableState(flagInt) {
    return TABLE_FLAGS[flagInt] || "seating";
}

export function toChipUnits(chipsAmount) {
    return BigInt(chipsAmount) * CHIPS_SCALE;
}

export function fromChipUnits(chipUnits) {
    return (BigInt(chipUnits) / CHIPS_SCALE).toString();
}
