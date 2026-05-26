import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  G1,
  bytesToHex,
  hexToBytes,
  make_public_key_from_compressed_slice,
  make_public_key_from_signing_key,
  make_signature_from_compressed_slice,
  make_signing_key_from_seed,
  mask as blsMask,
  sign as blsSign,
  verify as blsVerify,
} from '@/lib/crum_bls';
import {
  HAND_ID,
  INITIAL_CHIPS,
  PokerAction,
  PokerActionEnvelopeWire,
  PokerClientState,
  SMALL_BLIND,
  poker_action_wire_to_submit,
} from '@/lib/crum_net';
import {
  POKER_HAND_STATE_BET,
  POKER_HAND_STATE_BIG_BLIND,
  POKER_HAND_STATE_FINISHED,
  POKER_HAND_STATE_SMALL_BLIND,
  POKER_HOLDEM_ROUNDS,
  PokerTable,
  communityCardConsoleLines,
} from '@/lib/crum_pkr';
import { holdemShowdown } from '@/lib/crum_pkr/hand_evaluator';

const HISTORY_MESSAGE = 'History';
const CHAT_MESSAGE = 'ChatMessage';
const ACTION_SIGNATURE_SCHEME = 'BLS12-381-G1-PK-G2-SIG';
const BETTING_UI_STATES = new Set(['PreFlop', 'Flop', 'Turn', 'River']);
const BAD_UNMASK_G1 = G1.BASE.toRawBytes(true);
const textEncoder = new TextEncoder();

function shallowEqual(left, right) {
  const leftKeys = Object.keys(left ?? {});
  const rightKeys = Object.keys(right ?? {});
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === rightValue) return true;
    if (typeof leftValue === 'object' && typeof rightValue === 'object') {
      return JSON.stringify(leftValue) === JSON.stringify(rightValue);
    }
    return false;
  });
}

function createCryptoRng() {
  return () => {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0] / 0x100000000;
  };
}

function hexPoint(bytes) {
  return bytesToHex(bytes, { prefix: true });
}

function bytesPoint(hex) {
  return hexToBytes(hex);
}

function encodeCardSet(cards) {
  return cards.map(hexPoint);
}

function decodeCardSet(cards) {
  return cards.map(bytesPoint);
}

function refreshWireSubmit(wire) {
  if (!wire?.action) return wire;
  wire.submit = poker_action_wire_to_submit(wire.action);
  return wire;
}

function corruptShuffleTrace(wire) {
  const traces = wire?.action?.traces;
  if (!Array.isArray(traces) || traces.length === 0) return false;

  const firstTrace = traces[0];
  const beforeIndex = Array.isArray(firstTrace)
    ? firstTrace[1]
    : firstTrace.claimed_before_index;
  const nextBeforeIndex = (Number(beforeIndex ?? 0) + 1) % Math.max(traces.length, 1);

  if (Array.isArray(firstTrace)) {
    firstTrace[1] = nextBeforeIndex;
  } else {
    firstTrace.claimed_before_index = nextBeforeIndex;
  }
  refreshWireSubmit(wire);
  return true;
}

function corruptPublicKey(wire, game) {
  if (wire?.action?.type !== 'SubmitPublicKey') return false;
  const badPublicKey = game?.publicKey?.negate?.();
  if (!badPublicKey?.toRawBytes) return false;

  wire.action.public_key_g2_compressed = badPublicKey.toRawBytes(true);
  refreshWireSubmit(wire);
  return true;
}

function replaceFirstCard(cardSets) {
  if (!Array.isArray(cardSets)) return false;
  for (const cardSet of cardSets) {
    if (Array.isArray(cardSet) && cardSet.length > 0) {
      cardSet[0] = BAD_UNMASK_G1;
      return true;
    }
  }
  return false;
}

function corruptUnmaskWire(wire) {
  if (!wire?.action) return false;

  if (wire.action.type === 'SubmitCommunityCards') {
    if (!Array.isArray(wire.action.cards_g1_compressed) || wire.action.cards_g1_compressed.length === 0) {
      return false;
    }
    wire.action.cards_g1_compressed[0] = BAD_UNMASK_G1;
    refreshWireSubmit(wire);
    return true;
  }

  if (
    wire.action.type === 'SubmitPlayerCards'
    || wire.action.type === 'SubmitShowdownCards'
  ) {
    const changed = replaceFirstCard(wire.action.player_cards_g1_compressed);
    if (changed) refreshWireSubmit(wire);
    return changed;
  }

  return false;
}

function encodeWire(wire) {
  const encoded = {
    table_id: wire.table_id,
    hand_id: wire.hand_id,
    from: wire.from,
    sequence: wire.sequence,
    sequence_number: wire.sequence_number ?? null,
    expected_state: wire.expected_state,
    log_lines: wire.log_lines,
  };

  if (wire.nop) {
    return {
      ...encoded,
      nop: wire.nop,
    };
  }

  const action = wire.action;
  encoded.action = { type: action.type, player: action.player };

  switch (action.type) {
    case 'SubmitShuffledDeck':
      encoded.action.deck_g1_compressed = encodeCardSet(action.deck_g1_compressed);
      break;
    case 'SubmitPlayerCards':
    case 'SubmitShowdownCards':
      encoded.action.player_cards_g1_compressed = action.player_cards_g1_compressed.map(encodeCardSet);
      break;
    case 'SubmitCommunityCards':
      encoded.action.round = action.round;
      encoded.action.cards_g1_compressed = encodeCardSet(action.cards_g1_compressed);
      break;
    case 'SubmitBet':
      encoded.action.amount = action.amount;
      break;
    case 'SubmitPublicKey':
      encoded.action.public_key_g2_compressed = hexPoint(action.public_key_g2_compressed);
      encoded.action.traces = action.traces;
      break;
    default:
      break;
  }

  encoded.submit = poker_action_wire_to_submit(encoded.action);
  delete encoded.action;

  return encoded;
}

function decodeWire(encoded) {
  if (encoded.nop) {
    const wire = new PokerActionEnvelopeWire({
      table_id: encoded.table_id,
      hand_id: encoded.hand_id,
      from: encoded.from,
      sequence: encoded.sequence,
      sequence_number: encoded.sequence_number ?? null,
      expected_state: encoded.expected_state,
      nop: encoded.nop,
      log_lines: encoded.log_lines ?? [],
    });
    return wire;
  }

  const action = encoded.action ? { ...encoded.action } : null;

  if (action) {
    switch (action.type) {
      case 'SubmitShuffledDeck':
        action.deck_g1_compressed = decodeCardSet(action.deck_g1_compressed);
        break;
      case 'SubmitPlayerCards':
      case 'SubmitShowdownCards':
        action.player_cards_g1_compressed = action.player_cards_g1_compressed.map(decodeCardSet);
        break;
      case 'SubmitCommunityCards':
        action.cards_g1_compressed = decodeCardSet(action.cards_g1_compressed);
        break;
      case 'SubmitPublicKey':
        action.public_key_g2_compressed = bytesPoint(action.public_key_g2_compressed);
        break;
      default:
        break;
    }
  }

  return new PokerActionEnvelopeWire({
    table_id: encoded.table_id,
    hand_id: encoded.hand_id,
    from: encoded.from,
    sequence: encoded.sequence,
    sequence_number: encoded.sequence_number ?? null,
    expected_state: encoded.expected_state,
    action,
    submit: action ? encoded.submit : decodeSubmit(encoded.submit),
    log_lines: encoded.log_lines ?? [],
  });
}

function decodeSubmit(submit) {
  if (!submit) return null;
  const args = [...(submit.args ?? submit.data?.args ?? [])];

  switch (submit.method) {
    case 'submit_shuffled_deck':
      args[1] = decodeCardSet(args[1]);
      break;
    case 'submit_player_cards':
    case 'submit_player_cards_showdown':
      args[1] = args[1].map(decodeCardSet);
      break;
    case 'submit_community_cards':
      args[2] = decodeCardSet(args[2]);
      break;
    case 'submit_public_key':
      args[1] = bytesPoint(args[1]);
      break;
    default:
      break;
  }

  return {
    method: submit.method,
    args,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function ensureHexPrefix(value) {
  const normalized = String(value ?? '');
  return normalized.startsWith('0x') ? normalized : `0x${normalized}`;
}

function historyEntryPayload(wire) {
  return textEncoder.encode(canonicalJson({
    type: 'PokerHandAction',
    wire,
  }));
}

function wireHistoryKey(wire) {
  if (!wire) return '';
  return [
    wire.hand_id,
    wire.sequence_number ?? '',
    wire.from ?? '',
    wire.sequence ?? '',
    wire.nop ? 'nop' : wire.submit?.method ?? wire.action?.type ?? 'action',
  ].join(':');
}

function tableSequenceNumber(game) {
  return Number(game?.clientState?.table?.sequence_number ?? 0);
}

function handHistorySequenceNumber(historyEntries = []) {
  return Math.max(
    0,
    ...historyEntries.map((entry) => Number(entry?.sequence_number ?? entry?.wire?.sequence_number ?? 0)),
  );
}

function handHistoryTipKey({ tableId, handId, historyEntries = [] } = {}) {
  const orderedEntries = [...historyEntries]
    .sort((left, right) => Number(left.sequence_number ?? 0) - Number(right.sequence_number ?? 0));
  const lastEntry = orderedEntries.at(-1);
  return [
    tableId ?? '',
    handId ?? '',
    handHistorySequenceNumber(orderedEntries),
    orderedEntries.length,
    wireHistoryKey(lastEntry?.wire),
  ].join(':');
}

function makePokerTable(numPlayers) {
  const table = PokerTable.new(numPlayers, POKER_HOLDEM_ROUNDS);
  for (let player = 1; player <= numPlayers; player += 1) {
    table.join(player);
  }
  table.start_hand(Array(numPlayers).fill(INITIAL_CHIPS), SMALL_BLIND, 0);
  return table;
}

function makePokerTableForHand(numPlayers, handSetup) {
  const table = PokerTable.new(numPlayers, POKER_HOLDEM_ROUNDS);
  for (let player = 1; player <= numPlayers; player += 1) {
    table.join(player);
  }
  const handNumber = Math.max(1, Number(handSetup?.hand_number ?? handSetup?.hand_id ?? HAND_ID));
  const initialChips = Array.isArray(handSetup?.initial_chips) && handSetup.initial_chips.length === numPlayers
    ? handSetup.initial_chips.map((chips) => Number(chips))
    : Array(numPlayers).fill(INITIAL_CHIPS);
  const smallBlind = Number(handSetup?.small_blind ?? SMALL_BLIND);
  const dealerButton = Number(handSetup?.dealer_button ?? 0);
  table.hand_number = handNumber - 1;
  table.start_hand(initialChips, smallBlind, dealerButton);
  table.hand_number = handNumber;
  table.clear_events?.();
  return table;
}

function cardsToStrings(cards) {
  return cards
    .filter(Boolean)
    .map((card) => card.toString());
}

function safeCallAmount(hand, player) {
  try {
    return hand.get_call_amount_required(player);
  } catch {
    return 0;
  }
}

function safeChipsRemaining(hand, player) {
  try {
    return hand.get_chips_remaining(player);
  } catch {
    return 0;
  }
}

function chipStacks(hand, winner = null, payout = 0) {
  const stacks = [...(hand?.betting_state?.player_chips ?? [])];
  if (winner != null && stacks[winner] != null) {
    stacks[winner] += payout;
  }
  return stacks;
}

function finalHandStacks(hand) {
  if (!hand) return [];
  const activePlayers = hand.betting_state?.active_players ?? [];
  const payoutAmount = Number(hand.betting_state?.pot?.toString?.() ?? 0);
  const foldedWinner = activePlayers.filter(Boolean).length === 1
    ? activePlayers.findIndex(Boolean)
    : null;

  if (foldedWinner != null) {
    return chipStacks(hand, foldedWinner, payoutAmount);
  }

  const deck = hand.get_poker_deck();
  const playerCards = hand.get_player_cards().map((cardSet) => {
    try {
      return cardsToStrings(deck.unmasked_cards(cardSet));
    } catch {
      return [];
    }
  });
  const communityCards = [];
  for (let round = 0; round < POKER_HOLDEM_ROUNDS; round += 1) {
    const cards = hand.get_community_cards(round);
    if (cards) {
      communityCards.push(...cardsToStrings(deck.unmasked_cards(cards)));
    }
  }

  const showdown = holdemShowdown(playerCards, communityCards, activePlayers);
  return chipStacks(hand, showdown.winner, showdown.winner == null ? 0 : payoutAmount);
}

function nextDealerSeatNumber(pokerTable) {
  const maxPlayers = pokerTable?.get_max_players?.() ?? 0;
  if (!maxPlayers) return 0;
  return ((pokerTable.dealer_button ?? 0) + 1) % maxPlayers;
}

function chipStackSize(chips) {
  if (chips <= INITIAL_CHIPS * 0.5) return 'Small';
  if (chips <= INITIAL_CHIPS) return 'Medium';
  if (chips <= INITIAL_CHIPS * 1.5) return 'Big';
  return 'ExtraLarge';
}

function chipStackSizes(stacks) {
  return stacks.map(chipStackSize);
}

function tableViewPatch(clientState, signingKey, viewerSeatNo = null) {
  const hand = clientState?.current_hand();
  if (!hand) return {};
  const patch = clientState.table.to_display_data(viewerSeatNo, signingKey).current_hand;
  const activePlayers = patch.active_players ?? [];
  const isShowdownState = ['UnmaskShowdown', 'SubmitPublicKey', 'Finished'].includes(patch.state_type);
  const isPokerRulesShowdown = activePlayers.filter(Boolean).length > 1;
  const playerCardsBySeat = Object.fromEntries(
    Object.entries(patch.player_cards_by_seat ?? {}).map(([seat, cards]) => (
      activePlayers[Number(seat)] === false || (isShowdownState && !isPokerRulesShowdown)
        ? [seat, []]
        : [seat, cards]
    )),
  );

  return {
    ...patch,
    own_player_cards: activePlayers[viewerSeatNo] === false ? [] : patch.own_player_cards,
    player_cards_by_seat: playerCardsBySeat,
  };
}

function streetName(round) {
  switch (round) {
    case 0:
      return 'PreFlop';
    case 1:
      return 'Flop';
    case 2:
      return 'Turn';
    case 3:
      return 'River';
    default:
      return 'UnknownStreet';
  }
}

function eventRoundName(round) {
  switch (round) {
    case 0:
      return 'Blinds';
    case 1:
      return 'PreFlop';
    case 2:
      return 'Flop';
    case 3:
      return 'Turn';
    case 4:
      return 'River';
    default:
      return 'UnknownStreet';
  }
}

function eventDisplayLine(event) {
  if (!event?.type) return null;
  const seat = event.seat_number == null ? null : Number(event.seat_number) + 1;
  switch (event.type) {
    case 'hand_started':
      return `Hand ${event.hand_number ?? ''} started`.trim();
    case 'deck_shuffled':
      return `Deck Shuffled on Player ${seat}`;
    case 'round_started':
      return `Round Started: ${eventRoundName(Number(event.round_number ?? 0))} on Player ${seat}`;
    case 'small_blind_posted':
      return `Small Blind Posted by Player ${seat}: $${event.small_blind}`;
    case 'big_blind_posted':
      return `Big Blind Posted by Player ${seat}: $${event.big_blind}`;
    case 'bet':
      return `Player ${seat} Bet: $${event.amount}`;
    case 'fold':
      return `Player ${seat} Folded`;
    case 'hand_ended':
      return `Hand Ended; Player ${seat} submits public key first`;
    case 'hand_result':
      return `Hand Result: Player ${seat} pot $${event.pot_size}`;
    default:
      return null;
  }
}

function eventDisplayLines(events, fallbackLines = []) {
  const lines = (events ?? []).map(eventDisplayLine).filter(Boolean);
  return lines.length > 0 ? lines : fallbackLines;
}

function botTraceLines(game, action, result, fallbackLines = []) {
  const hand = game?.clientState.current_hand();
  if (!hand) return fallbackLines;

  if (action.type === 'SubmitBet') {
    const didFold = result?.events?.some((event) => event.type === 'fold');
    const verb = didFold ? 'Folded' : `Bet: $${action.amount}`;
    return [
      `Player ${action.player + 1} ${verb}`,
    ];
  }

  const events = result?.events ?? [];
  const startedRound = events.find((event) => event.type === 'round_started');
  if (startedRound?.round_number === 1) {
    return fallbackLines;
  }
  if (startedRound?.round_number > 1) {
    return [...fallbackLines, ...communityCardConsoleLines(hand)];
  }
  if (events.some((event) => event.type === 'hand_ended')) {
    return fallbackLines;
  }
  if (events.some((event) => event.type === 'hand_result')) {
    return [...fallbackLines, ...communityCardConsoleLines(hand)];
  }

  return fallbackLines;
}

function gameStateName(pokerState) {
  if (!pokerState) return 'Waiting';
  if (pokerState.type === 'Shuffle') return 'Shuffling';
  if (pokerState.type === 'Bet') return streetName(pokerState.round);
  if (pokerState.type === 'UnmaskCommunityCards') return `Unmask${streetName(pokerState.round)}`;
  return pokerState.type;
}

function currentGameStateFrom(game, viewerSeatNo = null, cheatReport = null) {
  const hand = game?.clientState.current_hand();
  const viewerPlayerIndex = viewerSeatNo ?? game?.clientState.player_index ?? 0;
  if (!game || !hand) {
    return {
      state: 'Waiting',
      seat: null,
      pot: 0,
      minBet: 0,
      maxBet: 0,
      step: 0,
      chipStacks: [],
      chipStackSizes: [],
      payout: null,
      activePlayers: [],
      allInPlayers: [],
    };
  }

  const handState = hand.get_current_state();
  const pokerState = handState.to_enum();
  const seat = 'player' in pokerState ? pokerState.player : handState.get_current_player();
  if (cheatReport) {
    const stacks = chipStacks(hand);
    const activePlayers = hand.betting_state?.active_players ?? [];
    const allInPlayers = hand.betting_state?.allin_players ?? [];
    return {
      state: 'Cheated',
      seat,
      canStartNextHand: true,
      pot: Number(hand.betting_state?.pot?.toString?.() ?? 0),
      minBet: safeCallAmount(hand, viewerPlayerIndex),
      maxBet: safeChipsRemaining(hand, viewerPlayerIndex),
      step: hand.get_small_blind(),
      chipStacks: stacks,
      chipStackSizes: chipStackSizes(stacks),
      hands: hand.get_player_cards().map(() => ({ cards: [], rank: null, isWinner: false })),
      winner: null,
      resultText: cheatReport.player === viewerPlayerIndex ? 'Cheater' : 'Game Cheated',
      resultRank: null,
      resultWinner: null,
      payout: null,
      cheat: {
        ...cheatReport,
        isViewerCheater: cheatReport.player === viewerPlayerIndex,
      },
      activePlayers,
      allInPlayers,
    };
  }
  const deck = hand.get_poker_deck();
  const isShowdownState = pokerState.type === 'UnmaskShowdown'
    || pokerState.type === 'SubmitPublicKey'
    || pokerState.type === 'Finished';

  if (isShowdownState) {
    const activePlayers = hand.betting_state?.active_players ?? [];
    const playerCards = hand.get_player_cards().map((cardSet, player) => {
      if (activePlayers[player] === false) return [];
      try {
        return cardsToStrings(deck.unmasked_cards(cardSet));
      } catch {
        return [];
      }
    });
    const communityCards = [];
    for (let round = 0; round < POKER_HOLDEM_ROUNDS; round += 1) {
      const cards = hand.get_community_cards(round);
      if (cards) {
        communityCards.push(...cardsToStrings(deck.unmasked_cards(cards)));
      }
    }
    const allInPlayers = hand.betting_state?.allin_players ?? [];
    const payoutAmount = Number(hand.betting_state?.pot?.toString?.() ?? 0);
    const foldedWinner = activePlayers.filter(Boolean).length === 1
      ? activePlayers.findIndex(Boolean)
      : null;
    const showdown = foldedWinner == null
      ? holdemShowdown(playerCards, communityCards, activePlayers)
      : {
        hands: playerCards.map(() => ({
          cards: [],
          rank: null,
        })),
        winner: foldedWinner,
      };
    const hands = showdown.hands.map((showdownHand, index) => ({
      ...showdownHand,
      isWinner: showdown.winner === index,
    }));
    const playerWon = showdown.winner != null && showdown.winner === viewerPlayerIndex;
    const stacks = chipStacks(hand, showdown.winner, showdown.winner == null ? 0 : payoutAmount);

    return {
      state: 'Showdown',
      seat,
      canStartNextHand: pokerState.type === 'Finished',
      pot: payoutAmount,
      minBet: safeCallAmount(hand, viewerPlayerIndex),
      maxBet: safeChipsRemaining(hand, viewerPlayerIndex),
      step: hand.get_small_blind(),
      chipStacks: stacks,
      chipStackSizes: chipStackSizes(stacks),
      hands,
      winner: showdown.winner,
      resultText: showdown.winner == null ? null : playerWon ? 'You Win' : 'You Lose',
      resultRank: showdown.winner == null ? null : hands[showdown.winner]?.rank ?? null,
      resultWinner: showdown.winner,
      payout: showdown.winner == null
        ? null
        : {
          amount: payoutAmount,
          winner: showdown.winner,
          icon: 'coins',
        },
      activePlayers,
      allInPlayers,
    };
  }

  const activePlayers = hand.betting_state?.active_players ?? [];
  const allInPlayers = hand.betting_state?.allin_players ?? [];

  return {
    state: gameStateName(pokerState),
    seat,
    pot: Number(hand.betting_state?.pot?.toString?.() ?? 0),
    minBet: safeCallAmount(hand, viewerPlayerIndex),
    maxBet: safeChipsRemaining(hand, viewerPlayerIndex),
    step: hand.get_small_blind(),
    chipStacks: chipStacks(hand),
    chipStackSizes: chipStackSizes(chipStacks(hand)),
    payout: null,
    activePlayers,
    allInPlayers,
  };
}

function protocolActionStateFrom(game) {
  const hand = game?.clientState.current_hand();
  if (!game || !hand) return null;
  const pokerState = hand.get_current_state().to_enum();
  const seat = 'player' in pokerState ? pokerState.player : hand.get_current_state().get_current_player();
  return {
    state: gameStateName(pokerState),
    seat,
  };
}

function currentActingPlayer(game) {
  const hand = game?.clientState.current_hand();
  return hand?.get_current_state().get_current_player() ?? null;
}

function pointKey(point) {
  return bytesToHex(point.toRawBytes(true), { prefix: true });
}

function reconstructShuffleTrace(hand, playerIndex, signingKey) {
  const numPlayers = Number(hand?.current_state?.num_players ?? 0);
  const dealerButton = Number(hand?.current_state?.dealer_button ?? 0);
  if (!hand || playerIndex == null || !signingKey || numPlayers <= 0) return null;

  const stepIndex = (Number(playerIndex) + numPlayers - dealerButton) % numPlayers;
  const nextDeck = hand.shuffle_history?.[stepIndex]?.cards?.();
  if (!Array.isArray(nextDeck)) return null;
  const prevDeck = stepIndex === 0
    ? hand.get_poker_deck().cards()
    : hand.shuffle_history?.[stepIndex - 1]?.cards?.();
  if (!Array.isArray(prevDeck)) return null;

  const beforeIndexByMaskedCard = new Map();
  prevDeck.forEach((card, beforeIndex) => {
    beforeIndexByMaskedCard.set(pointKey(blsMask(card, signingKey)), beforeIndex);
  });

  const traces = [];
  const usedBeforeIndices = new Set();
  for (let afterIndex = 0; afterIndex < nextDeck.length; afterIndex += 1) {
    const beforeIndex = beforeIndexByMaskedCard.get(pointKey(nextDeck[afterIndex]));
    if (beforeIndex == null || usedBeforeIndices.has(beforeIndex)) return null;
    usedBeforeIndices.add(beforeIndex);
    traces.push({
      after_index: afterIndex,
      claimed_before_index: beforeIndex,
    });
  }
  return traces;
}

function isHumanActionState(handState) {
  return [
    POKER_HAND_STATE_BET,
    POKER_HAND_STATE_SMALL_BLIND,
    POKER_HAND_STATE_BIG_BLIND,
  ].includes(handState?.current_state);
}

function isOnlyCheckBetState(hand, player) {
  if (!hand || player == null) return false;
  const bettingState = hand.betting_state;
  const activePlayers = bettingState?.active_players ?? [];
  const allInPlayers = bettingState?.allin_players ?? [];
  const bettingPlayers = activePlayers.filter((active, seat) => active && !allInPlayers[seat]);
  const activeAllInCount = activePlayers.filter((active, seat) => active && allInPlayers[seat]).length;

  return activePlayers[player] === true
    && allInPlayers[player] !== true
    && bettingPlayers.length === 1
    && activeAllInCount > 0
    && safeCallAmount(hand, player) === 0;
}

function actionSnapshotFromState({
  currentGameState,
  protocolActionState,
  viewPatch,
  previousSnapshot,
  playerIndex,
}) {
  const stateName = protocolActionState?.state;
  const isMyTurn = protocolActionState?.seat === playerIndex;
  const activePlayers = currentGameState?.activePlayers ?? [];
  const allInPlayers = currentGameState?.allInPlayers ?? [];
  const bettingPlayers = activePlayers
    .map((active, player) => active && !allInPlayers[player])
    .filter(Boolean);
  const activeAllInCount = activePlayers.filter((active, player) => active && allInPlayers[player]).length;
  const isFolded = activePlayers[playerIndex] === false;
  const isAllIn = allInPlayers[playerIndex] === true;
  const waitingForBet = BETTING_UI_STATES.has(stateName) && isMyTurn && !isFolded && !isAllIn;
  const waitingForSmallBlind = stateName === 'SmallBlind' && isMyTurn && !isAllIn;
  const waitingForBigBlind = stateName === 'BigBlind' && isMyTurn && !isAllIn;
  const waitingForBlind = waitingForSmallBlind || waitingForBigBlind;
  const availableChips = Number(currentGameState?.maxBet ?? viewPatch?.max_bet ?? INITIAL_CHIPS);
  const requiredBlindAmount = waitingForSmallBlind
    ? Number(viewPatch?.small_blind ?? SMALL_BLIND)
    : waitingForBigBlind
      ? Number(viewPatch?.big_blind ?? SMALL_BLIND * 2)
      : Number(currentGameState?.minBet ?? viewPatch?.min_bet ?? SMALL_BLIND);
  const blindAmount = waitingForBlind
    ? Math.max(0, Math.min(requiredBlindAmount, availableChips))
    : requiredBlindAmount;
  const actionMinBet = waitingForBlind
    ? blindAmount
    : Number(currentGameState?.minBet ?? viewPatch?.min_bet ?? SMALL_BLIND);
  const onlyCallMode = waitingForBet
    && bettingPlayers.length === 1
    && activePlayers[playerIndex] === true
    && allInPlayers[playerIndex] !== true
    && activeAllInCount > 0;
  const onlyCheckMode = onlyCallMode && actionMinBet === 0;

  return {
    ...previousSnapshot,
    started: true,
    showActionBar: (waitingForBet && !onlyCheckMode) || waitingForBlind,
    waitingForBet,
    waitingForBlind,
    canAct: isMyTurn && !isFolded && !isAllIn,
    stateLabel: viewPatch?.state_label ?? previousSnapshot.stateLabel,
    minBet: actionMinBet,
    maxBet: availableChips,
    step: Number(currentGameState?.step ?? viewPatch?.bet_step ?? SMALL_BLIND),
    actionAmount: waitingForBlind ? blindAmount : actionMinBet,
    primaryLabel: waitingForSmallBlind
      ? 'Small Blind'
      : waitingForBigBlind
        ? 'Big Blind'
        : 'Raise',
    sliderDisabled: waitingForBlind,
    hideCall: waitingForBlind,
    hideFold: waitingForBlind,
    onlyCallMode,
    onlyCheckMode,
    currentGameState,
    protocolActionState,
    viewPatch,
  };
}

const formatSeatSender = (address, seatNo) => (
  address ? address.slice(2, 4).toUpperCase() : `P${seatNo + 1}`
);

function formatPokerProtocolError(error, fallbackPlayer = null) {
  const cheat = cheatReportFromError(error, fallbackPlayer);
  if (cheat) {
    return `Cheat detected: Player ${cheat.player + 1} cheated ${cheat.kind.toLowerCase()}`;
  }

  return error?.message ?? String(error);
}

function cheatReportFromError(error, fallbackPlayer = null) {
  const message = error?.message ?? String(error);
  const unmaskMatch = message.match(/^Player cheated during unmasking\s+(\d+)$/);
  if (unmaskMatch) {
    return {
      player: Number(unmaskMatch[1]),
      kind: 'UNMASKING',
    };
  }

  if (message === 'Player cheated during shuffle') {
    return {
      player: fallbackPlayer == null ? 0 : Number(fallbackPlayer),
      kind: 'SHUFFLE',
    };
  }

  return null;
}

export function usePokerTable({
  table,
  networkSnapshot,
  publishMessage,
  prepareNetworkSession,
  prepareHandSession,
} = {}) {
  const [snapshot, setSnapshot] = useState({
    started: false,
    showActionBar: false,
    waitingForBet: false,
    waitingForBlind: false,
    canAct: false,
    stateLabel: 'Waiting',
    minBet: SMALL_BLIND,
    maxBet: 100,
    step: SMALL_BLIND,
    actionAmount: SMALL_BLIND,
    primaryLabel: 'Raise',
    sliderDisabled: false,
    hideCall: false,
    hideFold: false,
    onlyCallMode: false,
    onlyCheckMode: false,
    currentGameState: {
      state: 'Waiting',
      seat: null,
      pot: 0,
      minBet: 0,
      maxBet: 0,
      step: 0,
      activePlayers: [],
      allInPlayers: [],
    },
    protocolActionState: null,
    viewPatch: {},
  });
  const [gameMessages, setGameMessages] = useState([]);
  const [cheatReport, setCheatReport] = useState(null);
  const [terminalResult, setTerminalResult] = useState(null);
  const gameRef = useRef(null);
  const cheatReportRef = useRef(null);
  const lastPatchRef = useRef(null);
  const lastSnapshotRef = useRef(snapshot);
  const handHistoryRef = useRef([]);
  const seenHistoryTipsRef = useRef(new Set());
  const previousConnectedRef = useRef(false);
  const pendingHistorySyncRef = useRef(false);
  const protocolActionInFlightRef = useRef(null);
  const debugCheatsRef = useRef({
    badPk: false,
    badShuffle: false,
    badUnmask: false,
  });
  const tableSeats = useMemo(() => table?.seats ?? [], [table?.seats]);
  const tableId = table?.tableData?.id;
  const tableMaxSeats = table?.tableData?.maxSeats;
  const currentSeatNo = table?.currentSeat?.seatNo;

  const senderForSeat = useCallback((seatNo) => {
    const seat = tableSeats[seatNo];
    return formatSeatSender(seat?.playerAddress, seatNo);
  }, [tableSeats]);

  const senderForAddress = useCallback((address) => {
    const normalizedAddress = address?.toLowerCase();
    const seatNo = tableSeats.findIndex((seat) => (
      seat.playerAddress?.toLowerCase() === normalizedAddress
    ));
    return seatNo >= 0 ? senderForSeat(seatNo) : formatSeatSender(address, 0);
  }, [senderForSeat, tableSeats]);

  const senderForLine = useCallback((line, fallbackSeatNo = null) => {
    const playerLine = line.match(/^Player\s+(\d+)\b/);
    if (playerLine) return senderForSeat(Number(playerLine[1]) - 1);

    const actionLine = line.match(/\bon Player\s+(\d+)\b/);
    if (actionLine) return senderForSeat(Number(actionLine[1]) - 1);

    if (fallbackSeatNo != null) return senderForSeat(fallbackSeatNo);
    return 'Game';
  }, [senderForSeat]);

  const appendGameLog = useCallback((line, sender = 'Game', level = 'info') => {
    setGameMessages((prev) => [...prev, { text: line, sender, level }].slice(-160));
  }, []);

  const appendTraceLines = useCallback((lines, fallbackSeatNo = null) => {
    lines.forEach((line) => appendGameLog(line, senderForLine(line, fallbackSeatNo)));
  }, [appendGameLog, senderForLine]);

  const resetGame = useCallback(() => {
    const numPlayers = Number(tableMaxSeats || 0);
    if (!numPlayers || tableId == null) return null;

    const pokerTable = makePokerTable(numPlayers);
    const clientState = PokerClientState.new(
      currentSeatNo ?? 0,
      Number(tableId),
      HAND_ID,
      pokerTable,
    );
    gameRef.current = {
      clientState,
      signingKey: null,
      publicKey: null,
      handKeyHandId: null,
      handKeys: new Map(),
      currentHandSetup: {
        hand_id: HAND_ID,
        hand_number: HAND_ID,
        initial_chips: Array(numPlayers).fill(INITIAL_CHIPS),
        small_blind: SMALL_BLIND,
        dealer_button: 0,
      },
      shuffleTrace: null,
      seenFinished: false,
    };
    return gameRef.current;
  }, [currentSeatNo, tableId, tableMaxSeats]);

  useEffect(() => {
    resetGame();
    handHistoryRef.current = [];
    seenHistoryTipsRef.current = new Set();
    previousConnectedRef.current = false;
    pendingHistorySyncRef.current = false;
    cheatReportRef.current = null;
    setCheatReport(null);
    setTerminalResult(null);
  }, [resetGame, tableMaxSeats]);

  const updateView = useCallback(({ force = false } = {}) => {
    const game = gameRef.current;
    const hand = game?.clientState.current_hand();
    if (!game || !hand) return null;

    const viewerSeatNo = currentSeatNo ?? null;
    const patch = tableViewPatch(game.clientState, game.signingKey, viewerSeatNo);
    const currentGameState = currentGameStateFrom(game, viewerSeatNo, cheatReportRef.current);
    const protocolActionState = protocolActionStateFrom(game);
    const nextCurrentGameState = !force && shallowEqual(
      lastSnapshotRef.current.currentGameState,
      currentGameState,
    )
      ? lastSnapshotRef.current.currentGameState
      : currentGameState;

    const nextPatch = !force && shallowEqual(lastPatchRef.current, patch) ? lastPatchRef.current : patch;
    lastPatchRef.current = nextPatch;

    const nextSnapshot = actionSnapshotFromState({
      currentGameState: nextCurrentGameState,
      protocolActionState,
      viewPatch: nextPatch,
      previousSnapshot: lastSnapshotRef.current,
      playerIndex: viewerSeatNo,
    });

    if (force || !shallowEqual(lastSnapshotRef.current, nextSnapshot)) {
      lastSnapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }, [currentSeatNo]);

  const ensureKeys = useCallback(async (handNumber = null) => {
    const game = gameRef.current ?? resetGame();
    if (!game) return null;
    const targetHandNumber = Number(handNumber ?? game.clientState.hand_id ?? HAND_ID);
    if (
      game.signingKey
      && game.publicKey
      && Number(game.handKeyHandId) === targetHandNumber
    ) return game;
    if (currentSeatNo == null || (!prepareHandSession && !prepareNetworkSession)) return null;

    const cachedKeys = game.handKeys?.get(targetHandNumber);
    const keys = cachedKeys
      ?? (prepareHandSession
        ? await prepareHandSession(targetHandNumber)
        : await prepareNetworkSession());
    if (!cachedKeys) {
      const handKeys = game.handKeys ?? new Map();
      handKeys.set(targetHandNumber, keys);
      game.handKeys = handKeys;
    }
    const signingKey = make_signing_key_from_seed(hexToBytes(keys.privateKey));
    const nextGame = {
      ...game,
      signingKey,
      publicKey: make_public_key_from_signing_key(signingKey),
      handKeyHandId: targetHandNumber,
    };
    gameRef.current = nextGame;
    return nextGame;
  }, [currentSeatNo, prepareHandSession, prepareNetworkSession, resetGame]);

  const signWireHistoryEntry = useCallback((wire, game = gameRef.current) => {
    if (wire?.nop || !wire?.sequence_number || !game?.signingKey || !game?.publicKey) return null;
    const encodedWire = encodeWire(wire);
    const signature = blsSign(historyEntryPayload(encodedWire), game.signingKey);
    return {
      sequence_number: Number(encodedWire.sequence_number ?? 0),
      from: encodedWire.from,
      wire: encodedWire,
      action_signature: {
        scheme: ACTION_SIGNATURE_SCHEME,
        signer_seat: encodedWire.from,
        public_key: hexPoint(game.publicKey.toRawBytes(true)),
        signature: hexPoint(signature.toRawBytes(true)),
      },
    };
  }, []);

  const verifyHistoryEntrySignature = useCallback((entry) => {
    const wire = entry?.wire;
    const signature = entry?.action_signature;
    const signerSeat = Number(entry?.from ?? wire?.from);
    if (!wire || !signature?.signature || !Number.isInteger(signerSeat)) return false;
    if (Number(wire.from) !== signerSeat) return false;
    if (signature.scheme !== ACTION_SIGNATURE_SCHEME) return false;
    if (signature.signer_seat != null && Number(signature.signer_seat) !== signerSeat) return false;

    const publicKeyCandidates = [
      signature.public_key,
      tableSeats[signerSeat]?.announcePublicKey,
    ].filter(Boolean);

    return publicKeyCandidates.some((candidate) => {
      try {
        const publicKey = make_public_key_from_compressed_slice(hexToBytes(ensureHexPrefix(candidate)));
        const signed = make_signature_from_compressed_slice(hexToBytes(ensureHexPrefix(signature.signature)));
        return blsVerify(historyEntryPayload(wire), publicKey, signed);
      } catch {
        return false;
      }
    });
  }, [tableSeats]);

  const rememberHistoryEntry = useCallback((entry) => {
    if (!entry?.wire?.sequence_number) return;
    const key = wireHistoryKey(entry.wire);
    const currentHistory = handHistoryRef.current ?? [];
    if (currentHistory.some((entry) => wireHistoryKey(entry.wire) === key)) return;
    handHistoryRef.current = [
      ...currentHistory,
      entry,
    ].sort((left, right) => Number(left.sequence_number ?? 0) - Number(right.sequence_number ?? 0));
  }, []);

  const rememberWire = useCallback((wire, entry = null) => {
    const historyEntry = entry ?? signWireHistoryEntry(wire);
    if (historyEntry) rememberHistoryEntry(historyEntry);
  }, [rememberHistoryEntry, signWireHistoryEntry]);

  const publishWire = useCallback((wire, { sync = false } = {}) => {
    const game = gameRef.current;
    const entry = signWireHistoryEntry(wire, game);
    if (entry) rememberHistoryEntry(entry);
    const handHistory = [...(handHistoryRef.current ?? [])];
    const latestHandHistorySequence = Math.max(
      tableSequenceNumber(game),
      handHistorySequenceNumber(handHistory),
      Number(wire.sequence_number ?? 0),
    );
    if (wire.nop) {
      wire.sequence_number = latestHandHistorySequence;
    }
    const message = {
      type: HISTORY_MESSAGE,
      table_id: wire.table_id,
      hand_id: wire.hand_id,
      hand_number: wire.hand_id,
      hand_setup: game?.currentHandSetup ?? null,
      timestamp: Date.now(),
      sync,
      sequence_number: latestHandHistorySequence,
      hand_history: handHistory,
      wire: encodeWire(wire),
    };
    publishMessage(message);
  }, [
    publishMessage,
    rememberHistoryEntry,
    signWireHistoryEntry,
  ]);

  const applyDebugCheatsToWire = useCallback((wire, game) => {
    const cheats = debugCheatsRef.current;
    if (cheats.badUnmask && corruptUnmaskWire(wire)) {
      cheats.badUnmask = false;
      const report = { player: game.clientState.player_index, kind: 'UNMASKING' };
      cheatReportRef.current = report;
      setCheatReport(report);
    }

    if (wire?.action?.type === 'SubmitPublicKey') {
      if (cheats.badShuffle && corruptShuffleTrace(wire)) {
        cheats.badShuffle = false;
        const report = { player: wire.action.player, kind: 'SHUFFLE' };
        cheatReportRef.current = report;
        setCheatReport(report);
      }

      if (cheats.badPk && corruptPublicKey(wire, game)) {
        cheats.badPk = false;
        const report = { player: wire.action.player, kind: 'PUBLIC KEY' };
        cheatReportRef.current = report;
        setCheatReport(report);
      }
    }

    return wire;
  }, []);

  const submitChat = useCallback((text) => {
    const chatText = text?.trim();
    if (!chatText) return false;

    publishMessage({ type: CHAT_MESSAGE, text: chatText });
    appendGameLog(chatText, 'Me');
    return true;
  }, [appendGameLog, publishMessage]);

  const armPokerDebugCheat = useCallback((name) => {
    switch (name) {
      case 'badpk':
        debugCheatsRef.current.badPk = true;
        return true;
      case 'badshuffle':
        debugCheatsRef.current.badShuffle = true;
        return true;
      case 'badunmask':
        debugCheatsRef.current.badUnmask = true;
        return true;
      default:
        return false;
    }
  }, []);

  const submitNop = useCallback((game, currentPlayer = currentActingPlayer(game), { sync = false } = {}) => {
    if (!game || currentPlayer == null) return null;
    const wire = game.clientState.submit_nop({
      current_player: currentPlayer,
      reason: 'hand history forwarded',
    });
    publishWire(wire, { sync });
    return wire;
  }, [publishWire]);

  const submitAction = useCallback((action, logLines) => {
    const game = gameRef.current;
    if (!game) return null;

    let envelope;
    try {
      envelope = game.clientState.submit_local_action(action);
    } catch (error) {
      const report = cheatReportFromError(error, action.player);
      if (report) {
        cheatReportRef.current = report;
        setCheatReport(report);
      }
      appendGameLog(formatPokerProtocolError(error, action.player), 'Game', 'error');
      updateView({ force: true });
      return null;
    }

    const displayLines = botTraceLines(game, action, envelope.result, logLines);
    const wire = envelope.to_wire(displayLines);
    applyDebugCheatsToWire(wire, game);
    publishWire(wire);
    appendTraceLines(displayLines, action.player);
    updateView();
    return wire;
  }, [appendGameLog, appendTraceLines, applyDebugCheatsToWire, publishWire, updateView]);

  const buildAutomaticAction = useCallback((game) => {
    const hand = game.clientState.current_hand();
    const pokerState = hand.get_current_state().to_enum();
    const playerIndex = game.clientState.player_index;

    if ('player' in pokerState && pokerState.player !== playerIndex) return null;

    switch (pokerState.type) {
      case 'Shuffle': {
        const cards = pokerState.is_dealer
          ? hand.get_poker_deck().masked_cards()
          : hand.get_shuffled_deck().clone();
        cards.mask(game.signingKey);
        game.shuffleTrace = cards.shuffle_traced(createCryptoRng());
        return {
          action: PokerAction.SubmitShuffledDeck({ player: playerIndex, deck: cards }),
          logLines: [`Shuffle on Player ${playerIndex + 1} (is_dealer=${pokerState.is_dealer})`],
        };
      }
      case 'UnmaskHoleCards': {
        const cards = hand.get_player_cards().map((cardSet) => cardSet.clone());
        cards.forEach((cardSet, index) => {
          if (index !== playerIndex) cardSet.unmask(game.signingKey);
        });
        return {
          action: PokerAction.SubmitPlayerCards({ player: playerIndex, cards }),
          logLines: [`Unmask Hole Cards on Player ${playerIndex + 1}`],
        };
      }
      case 'UnmaskCommunityCards': {
        const cards = hand.get_community_cards(pokerState.round)?.clone();
        if (!cards) throw new Error('No community cards for round');
        cards.unmask(game.signingKey);
        return {
          action: PokerAction.SubmitCommunityCards({
            player: playerIndex,
            round: pokerState.round,
            cards,
          }),
          logLines: [`Round ${pokerState.round + 1} Unmask Community Cards on Player ${playerIndex + 1}`],
        };
      }
      case 'UnmaskShowdown': {
        const cards = hand.get_player_cards().map((cardSet) => cardSet.clone());
        cards[playerIndex].unmask(game.signingKey);
        return {
          action: PokerAction.SubmitShowdownCards({ player: playerIndex, cards }),
          logLines: [`Unmask Showdown on Player ${playerIndex + 1}`],
        };
      }
      case 'SubmitPublicKey': {
        const traces = game.shuffleTrace
          ?? reconstructShuffleTrace(hand, playerIndex, game.signingKey);
        if (!traces) return null;
        game.shuffleTrace = traces;
        return {
          action: PokerAction.SubmitPublicKey({
            player: playerIndex,
            public_key: game.publicKey,
            traces,
          }),
          logLines: [`Submit Public Key on Player ${playerIndex + 1}`],
        };
      }
      case 'Bet':
      case 'Finished':
        return null;
      default:
        return null;
    }
  }, []);

  const submitProtocolAction = useCallback(async () => {
    const game = await ensureKeys();
    if (!game) return null;
    const hand = game.clientState.current_hand();
    if (!hand) return null;

    const handState = hand.get_current_state();
    if (handState.current_state === POKER_HAND_STATE_FINISHED) {
      if (!game.seenFinished) {
        game.seenFinished = true;
      }
      updateView();
      return null;
    }

    if (
      handState.current_state === POKER_HAND_STATE_SMALL_BLIND
      || handState.current_state === POKER_HAND_STATE_BIG_BLIND
    ) {
      return null;
    }

    if (handState.current_state === POKER_HAND_STATE_BET) {
      const player = game.clientState.player_index;
      if (
        handState.get_current_player() === player
        && isOnlyCheckBetState(hand, player)
      ) {
        return submitAction(
          PokerAction.SubmitBet({ player, amount: 0 }),
          [`Player ${player + 1} Bet: $0`],
        );
      }
      return null;
    }

    if (handState.get_current_player() !== game.clientState.player_index) {
      return submitNop(game, handState.get_current_player());
    }

    const actionKey = `${game.clientState.hand_id}:${handState.to_tuple().join(':')}`;
    if (protocolActionInFlightRef.current === actionKey) return null;

    protocolActionInFlightRef.current = actionKey;
    try {
      const built = buildAutomaticAction(game);
      if (!built) return null;
      const wire = submitAction(built.action, built.logLines);
      if (wire && built.action.type === 'SubmitPublicKey') {
        game.shuffleTrace = null;
      }
      return wire;
    } finally {
      if (protocolActionInFlightRef.current === actionKey) {
        protocolActionInFlightRef.current = null;
      }
    }
  }, [buildAutomaticAction, ensureKeys, submitAction, submitNop, updateView]);

  const startNextHand = useCallback(() => {
    const game = gameRef.current;
    const hand = game?.clientState.current_hand();
    if (!game || !hand?.get_current_state().is_finished()) return false;

    const nextStacks = finalHandStacks(hand);
    const initialChips = nextStacks.length > 0
      ? nextStacks
      : Array(game.clientState.table.get_current_player_count()).fill(INITIAL_CHIPS);
    const playerIndex = game.clientState.player_index;
    const playerChips = Number(initialChips[playerIndex] ?? 0);
    const playersWithChips = initialChips.filter((chips) => Number(chips) > 0).length;

    if (playerChips <= 0) {
      setTerminalResult({ type: 'lose', chips: 0 });
      updateView({ force: true });
      return false;
    }

    if (playersWithChips === 1) {
      setTerminalResult({ type: 'win', chips: playerChips });
      updateView({ force: true });
      return false;
    }

    const smallBlind = hand.get_small_blind();
    const dealerSeatNumber = nextDealerSeatNumber(game.clientState.table);

    game.clientState.table.start_hand(initialChips, smallBlind, dealerSeatNumber);
    game.clientState.hand_id += 1;
    game.clientState.sequence = 0;
    game.clientState.seen.clear();
    game.currentHandSetup = {
      hand_id: game.clientState.hand_id,
      hand_number: game.clientState.hand_id,
      initial_chips: initialChips.map((chips) => Number(chips)),
      small_blind: smallBlind,
      dealer_button: dealerSeatNumber,
    };
    game.signingKey = null;
    game.publicKey = null;
    game.handKeyHandId = null;
    game.shuffleTrace = null;
    game.seenFinished = false;
    handHistoryRef.current = [];
    seenHistoryTipsRef.current = new Set();
    protocolActionInFlightRef.current = null;

    const events = game.clientState.table.drain_events?.() ?? [];
    appendTraceLines(eventDisplayLines(events), game.clientState.player_index);
    updateView({ force: true });
    return true;
  }, [appendTraceLines, updateView]);

  const bootstrapHandFromSetup = useCallback(async (game, handSetup) => {
    const targetHandId = Number(handSetup?.hand_number ?? handSetup?.hand_id ?? 0);
    const numPlayers = Number(tableMaxSeats || 0);
    if (!game || !targetHandId || !numPlayers) return false;
    if (targetHandId <= Number(game.clientState.hand_id ?? 0)) return true;

    const pokerTable = makePokerTableForHand(numPlayers, handSetup);
    game.clientState.table = pokerTable;
    game.clientState.hand_id = targetHandId;
    game.clientState.sequence = 0;
    game.clientState.seen.clear();
    game.signingKey = null;
    game.publicKey = null;
    game.handKeyHandId = null;
    game.shuffleTrace = null;
    game.seenFinished = false;
    game.currentHandSetup = {
      hand_id: targetHandId,
      hand_number: targetHandId,
      initial_chips: [...(handSetup.initial_chips ?? [])].map((chips) => Number(chips)),
      small_blind: Number(handSetup.small_blind ?? SMALL_BLIND),
      dealer_button: Number(handSetup.dealer_button ?? 0),
    };
    handHistoryRef.current = [];
    seenHistoryTipsRef.current = new Set();
    protocolActionInFlightRef.current = null;
    await ensureKeys(targetHandId);
    updateView({ force: true });
    return true;
  }, [ensureKeys, tableMaxSeats, updateView]);

  const advanceToHistoryHand = useCallback(async (game, targetHandId, handSetup) => {
    while (targetHandId > game.clientState.hand_id) {
      if (startNextHand()) continue;
      return bootstrapHandFromSetup(game, handSetup);
    }
    return true;
  }, [bootstrapHandFromSetup, startNextHand]);

  const applyHistoryEntries = useCallback(async (historyEntries = [], playerAddress = null, handSetup = null) => {
    const game = gameRef.current ?? resetGame();
    if (!game || !Array.isArray(historyEntries)) return true;

    const orderedEntries = [...historyEntries]
      .sort((left, right) => Number(left.sequence_number ?? 0) - Number(right.sequence_number ?? 0));
    let latestAppliedAction = null;

    for (const entry of orderedEntries) {
      if (!verifyHistoryEntrySignature(entry)) {
        appendGameLog('Invalid signed hand history entry', senderForAddress(playerAddress), 'error');
        updateView({ force: true });
        return false;
      }

      const wire = decodeWire(entry.wire);

      const entrySequence = Number(entry.sequence_number ?? entry.wire?.sequence_number ?? 0);
      if (entrySequence <= tableSequenceNumber(game)) {
        rememberWire(wire, entry);
        continue;
      }

      if (!await advanceToHistoryHand(game, Number(wire.hand_id), handSetup)) return true;
      if (wire.hand_id !== game.clientState.hand_id) continue;
      await ensureKeys(wire.hand_id);

      if (wire.nop) {
        if (game.clientState.apply_nop_wire(wire)) {
          rememberWire(wire, entry);
        }
        continue;
      }

      let envelope;
      let appliedResult;
      try {
        envelope = wire.to_envelope();
        appliedResult = game.clientState.apply_envelope_result(envelope);
      } catch (error) {
        appendGameLog(
          formatPokerProtocolError(error, wire?.action?.player),
          senderForAddress(playerAddress),
          'error',
        );
        updateView({ force: true });
        return true;
      }

      const { applied, result } = appliedResult;
      if (applied) {
        rememberWire(wire, entry);
        const displayLines = wire.log_lines?.length > 0
          ? wire.log_lines
          : eventDisplayLines(result?.events);
        latestAppliedAction = { displayLines, from: envelope.from };
      } else {
        console.warn('[Poker history] newer entry not applied', {
          entrySequence,
          tableSequence: tableSequenceNumber(game),
          from: wire.from,
          sequence: wire.sequence,
          expectedState: wire.expected_state,
          result: appliedResult,
          wire: entry.wire,
        });
        const reason = appliedResult?.mismatch
          ? `state mismatch local=${JSON.stringify(appliedResult.mismatch.local)} expected=${JSON.stringify(appliedResult.mismatch.remote_expected)}`
          : 'duplicate or rejected';
        appendGameLog(`History action ${entrySequence} not applied: ${reason}`, senderForAddress(playerAddress), 'error');
        updateView({ force: true });
        return false;
      }
    }

    if (latestAppliedAction) {
      appendTraceLines(latestAppliedAction.displayLines, latestAppliedAction.from);
    }
    updateView({ force: true });
    return true;
  }, [
    appendGameLog,
    appendTraceLines,
    rememberWire,
    resetGame,
    ensureKeys,
    advanceToHistoryHand,
    senderForAddress,
    updateView,
    verifyHistoryEntrySignature,
  ]);

  const continueAfterPokerMessage = useCallback(async ({ sync = false } = {}) => {
    const game = gameRef.current;
    const hand = game?.clientState.current_hand();
    const handState = hand?.get_current_state();
    if (!game || !handState || handState?.is_finished()) {
      updateView({ force: true });
      return true;
    }

    if (handState.get_current_player() !== game.clientState.player_index) {
      submitNop(game, handState.get_current_player(), { sync });
      updateView({ force: true });
      return true;
    }

    const tipKey = handHistoryTipKey({
      tableId: game.clientState.table_id,
      handId: game.clientState.hand_id,
      historyEntries: handHistoryRef.current,
    });
    if (sync && !seenHistoryTipsRef.current.has(tipKey)) {
      seenHistoryTipsRef.current.add(tipKey);
      submitNop(game, handState.get_current_player(), { sync: true });
      updateView({ force: true });
      return true;
    }
    if (sync) {
      seenHistoryTipsRef.current.delete(tipKey);
    }

    if (!isHumanActionState(handState)) {
      await submitProtocolAction();
      return true;
    }

    updateView({ force: true });
    return true;
  }, [submitNop, submitProtocolAction, updateView]);

  const sendHistorySync = useCallback(() => {
    const game = gameRef.current ?? resetGame();
    if (!game) return false;
    submitNop(game, currentActingPlayer(game), { sync: true });
    appendGameLog('History sync sent', 'Game');
    return true;
  }, [appendGameLog, resetGame, submitNop]);

  const handleNetworkMessage = useCallback(async (message, playerAddress = null) => {
    if (
      message?.type !== HISTORY_MESSAGE
      && message?.type !== CHAT_MESSAGE
    ) return false;

    if (message.type === CHAT_MESSAGE) {
      appendGameLog(message.text ?? '', senderForAddress(playerAddress));
      return true;
    }

    const game = gameRef.current ?? resetGame();
    if (!game) return true;
    const messageHandNumber = Number(message.hand_number ?? message.hand_id ?? game.clientState.hand_id);
    await ensureKeys(messageHandNumber);

    const handHistory = Array.isArray(message.hand_history)
      ? message.hand_history
      : [];
    if (handHistory.length > 0) {
      const appliedHistory = await applyHistoryEntries(handHistory, playerAddress, message.hand_setup);
      if (!appliedHistory) return true;
    }

    const wire = decodeWire(message.wire);
    if (!await advanceToHistoryHand(game, Number(wire.hand_id), message.hand_setup)) return true;
    await ensureKeys(wire.hand_id);

    if (wire.nop) {
      game.clientState.apply_nop_wire(wire);
      return continueAfterPokerMessage({ sync: message.sync === true });
    }

    const wireAlreadyInHistory = handHistory.some((entry) => (
      wireHistoryKey(entry?.wire) === wireHistoryKey(encodeWire(wire))
    ));
    if (wireAlreadyInHistory) {
      return continueAfterPokerMessage({ sync: message.sync === true });
    }

    let envelope;
    let appliedResult;
    try {
      envelope = wire.to_envelope();
      appliedResult = game.clientState.apply_envelope_result(envelope);
    } catch (error) {
      const report = cheatReportFromError(error, wire?.action?.player);
      if (report) {
        cheatReportRef.current = report;
        setCheatReport(report);
      }
      appendGameLog(
        formatPokerProtocolError(error, wire?.action?.player),
        senderForAddress(playerAddress),
        'error',
      );
      updateView({ force: true });
      return true;
    }

    const { applied, result } = appliedResult;
    if (applied) {
      const displayLines = wire.log_lines?.length > 0
        ? wire.log_lines
        : eventDisplayLines(result?.events);
      appendTraceLines(displayLines, envelope.from);
      const hand = game.clientState.current_hand();
      const handState = hand?.get_current_state();
      if (handState?.is_finished()) {
        updateView({ force: true });
        return true;
      }

      return continueAfterPokerMessage({ sync: message.sync === true });
    }
    return true;
  }, [
    appendGameLog,
    appendTraceLines,
    advanceToHistoryHand,
    applyHistoryEntries,
    continueAfterPokerMessage,
    ensureKeys,
    resetGame,
    senderForAddress,
    updateView,
  ]);

  const submitBet = useCallback(async (amount) => {
    const game = await ensureKeys();
    if (!game) return;
    const hand = game.clientState.current_hand();
    const state = hand?.get_current_state();
    if (!state || state.current_state !== POKER_HAND_STATE_BET) return;
    if (state.get_current_player() !== game.clientState.player_index) return;

    const player = game.clientState.player_index;
    const remainingChips = safeChipsRemaining(hand, player);
    const cappedAmount = Math.max(0, Math.min(Number(amount), remainingChips));
    submitAction(
      PokerAction.SubmitBet({ player, amount: cappedAmount }),
      [`Player ${player + 1} Bet: $${cappedAmount}`],
    );
  }, [ensureKeys, submitAction]);

  const submitBlind = useCallback(async () => {
    const game = await ensureKeys();
    if (!game) return;
    const hand = game.clientState.current_hand();
    const state = hand?.get_current_state();
    if (!state) return;
    if (state.get_current_player() !== game.clientState.player_index) return;

    const player = game.clientState.player_index;
    if (state.current_state === POKER_HAND_STATE_SMALL_BLIND) {
      submitAction(
        PokerAction.SubmitSmallBlind({ player }),
        [`Small Blind on Player ${player + 1}`],
      );
      return;
    }

    if (state.current_state === POKER_HAND_STATE_BIG_BLIND) {
      submitAction(
        PokerAction.SubmitBigBlind({ player }),
        [`Big Blind on Player ${player + 1}`],
      );
    }
  }, [ensureKeys, submitAction]);

  const completeCheatCountdown = useCallback(() => {
    const report = cheatReportRef.current;
    if (!report) return false;
    const playerIndex = gameRef.current?.clientState?.player_index;
    setTerminalResult({
      type: 'cheated',
      cheat: {
        ...report,
        isViewerCheater: report.player === playerIndex,
      },
    });
    updateView({ force: true });
    return true;
  }, [updateView]);

  useEffect(() => {
    if (networkSnapshot?.status !== 'connected') return;
    if (table?.currentSeat?.seatNo == null) return;
    ensureKeys().then(() => {
      updateView();
    });
  }, [ensureKeys, networkSnapshot?.status, table?.currentSeat?.seatNo, updateView]);

  useEffect(() => {
    const connected = networkSnapshot?.inboundState === 'Connected'
      && networkSnapshot?.outboundState === 'Connected';
    const wasConnected = previousConnectedRef.current;
    previousConnectedRef.current = connected;

    if (!connected) {
      if (wasConnected) pendingHistorySyncRef.current = true;
      return;
    }

    if (wasConnected) return;

    ensureKeys().then(() => {
      if (pendingHistorySyncRef.current) {
        pendingHistorySyncRef.current = false;
        sendHistorySync();
        return;
      }
      if (currentSeatNo === 0) {
        continueAfterPokerMessage();
      }
    });
  }, [
    continueAfterPokerMessage,
    currentSeatNo,
    ensureKeys,
    networkSnapshot?.inboundState,
    networkSnapshot?.outboundState,
    sendHistorySync,
  ]);

  const actionBarProps = useMemo(() => {
    const remainingChips = Math.max(Number(snapshot.maxBet ?? 0), 0);
    const callAmount = Math.max(Math.min(Number(snapshot.minBet ?? 0), remainingChips), 0);
    const allInMode = !snapshot.onlyCallMode && !snapshot.waitingForBlind && remainingChips < callAmount * 2;
    const maxBet = remainingChips;
    const minimumSliderBet = Math.ceil(maxBet / 12);
    const minBet = snapshot.waitingForBlind
      ? callAmount
      : allInMode
        ? remainingChips
        : Math.max(Math.min(Math.max(callAmount * 2, minimumSliderBet), remainingChips), 0);
    const actionAmount = allInMode
      ? remainingChips
      : Math.max(Math.min(Number(snapshot.actionAmount ?? minBet), remainingChips), 0);

    return {
      minBet,
      maxBet,
      step: Math.max(1, Math.round((maxBet - minBet) / 12)),
      visible: snapshot.showActionBar,
      disabled: !snapshot.showActionBar,
      sliderDisabled: snapshot.sliderDisabled || allInMode || snapshot.onlyCallMode,
      hideCall: snapshot.hideCall || allInMode,
      hideFold: snapshot.hideFold || callAmount === 0,
      hideRaise: snapshot.onlyCallMode,
      callAmount,
      remainingChips,
      primaryLabel: allInMode ? 'All In' : snapshot.primaryLabel,
      primaryAmount: snapshot.waitingForBlind || allInMode ? actionAmount : null,
      onFold: () => submitBet(0),
      onCall: () => submitBet(callAmount),
      onRaise: (amount) => (snapshot.waitingForBlind ? submitBlind() : submitBet(amount)),
    };
  }, [
    snapshot.actionAmount,
    snapshot.hideCall,
    snapshot.hideFold,
    snapshot.maxBet,
    snapshot.minBet,
    snapshot.onlyCallMode,
    snapshot.primaryLabel,
    snapshot.showActionBar,
    snapshot.sliderDisabled,
    snapshot.waitingForBlind,
    submitBet,
    submitBlind,
  ]);

  const pokerTableState = useMemo(() => ({
    ...snapshot,
    gameMessages,
    actionBarProps,
    cheatReport,
    terminalResult,
  }), [actionBarProps, cheatReport, gameMessages, snapshot, terminalResult]);

  const pokerTableActions = useMemo(() => ({
    handleNetworkMessage,
    armPokerDebugCheat,
    completeCheatCountdown,
    submitProtocolAction,
    submitBet,
    submitChat,
    startNextHand,
  }), [
    armPokerDebugCheat,
    completeCheatCountdown,
    handleNetworkMessage,
    startNextHand,
    submitBet,
    submitChat,
    submitProtocolAction,
  ]);

  return [pokerTableState, pokerTableActions];
}
