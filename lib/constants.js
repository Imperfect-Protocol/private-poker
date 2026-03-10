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

export function getGameTypeName(gameTypeInt) {
    return GAME_TYPES[gameTypeInt] || "Unknown Game";
}

export function getLobbyStatus(flagInt) {
    return LOBBY_FLAGS[flagInt] || "inactive";
}

export function getTableState(flagInt) {
    return TABLE_FLAGS[flagInt] || "seating";
}