import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  G1,
  bytesToHex,
  hexToBytes,
  make_public_key_from_signing_key,
  make_signing_key_from_seed,
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

const POKER_ACTION_MESSAGE = 'POKER_ACTION';
const POKER_GAME_MESSAGE = 'POKER_GAME_MESSAGE';
const CHAT_MESSAGE = 'ChatMessage';
const BETTING_UI_STATES = new Set(['PreFlop', 'Flop', 'Turn', 'River']);
const BAD_UNMASK_G1 = G1.BASE.toRawBytes(true);

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
    return new PokerActionEnvelopeWire({
      table_id: encoded.table_id,
      hand_id: encoded.hand_id,
      from: encoded.from,
      sequence: encoded.sequence,
      expected_state: encoded.expected_state,
      nop: encoded.nop,
      log_lines: encoded.log_lines ?? [],
    });
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

function makePokerTable(numPlayers) {
  const table = PokerTable.new(numPlayers, POKER_HOLDEM_ROUNDS);
  for (let player = 1; player <= numPlayers; player += 1) {
    table.join(player);
  }
  table.start_hand(Array(numPlayers).fill(INITIAL_CHIPS), SMALL_BLIND, 0);
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

function currentGameStateFrom(game, viewerSeatNo = null) {
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

export function usePokerTable({
  table,
  networkSnapshot,
  publishMessage,
  prepareNetworkSession,
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
  const [terminalResult, setTerminalResult] = useState(null);
  const gameRef = useRef(null);
  const lastPatchRef = useRef(null);
  const lastSnapshotRef = useRef(snapshot);
  const protocolActionInFlightRef = useRef(null);
  const debugCheatsRef = useRef({
    badPk: false,
    badShuffle: false,
    badUnmask: false,
  });
  const tableSeats = useMemo(() => table?.seats ?? [], [table?.seats]);

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

  const tableId = table?.tableData?.id;
  const tableMaxSeats = table?.tableData?.maxSeats;
  const currentSeatNo = table?.currentSeat?.seatNo;

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
      shuffleTrace: null,
      seenFinished: false,
    };
    return gameRef.current;
  }, [currentSeatNo, tableId, tableMaxSeats]);

  useEffect(() => {
    resetGame();
    setTerminalResult(null);
  }, [resetGame]);

  const updateView = useCallback(({ force = false } = {}) => {
    const game = gameRef.current;
    const hand = game?.clientState.current_hand();
    if (!game || !hand) return null;

    const viewerSeatNo = currentSeatNo ?? null;
    const patch = tableViewPatch(game.clientState, game.signingKey, viewerSeatNo);
    const currentGameState = currentGameStateFrom(game, viewerSeatNo);
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

  const ensureKeys = useCallback(async () => {
    const game = gameRef.current ?? resetGame();
    if (!game) return null;
    if (game.signingKey && game.publicKey) return game;
    if (currentSeatNo == null || !prepareNetworkSession) return null;

    const keys = await prepareNetworkSession();
    const signingKey = make_signing_key_from_seed(hexToBytes(keys.privateKey));
    const nextGame = {
      ...game,
      signingKey,
      publicKey: make_public_key_from_signing_key(signingKey),
    };
    gameRef.current = nextGame;
    return nextGame;
  }, [currentSeatNo, prepareNetworkSession, resetGame]);

  const publishWire = useCallback((wire) => {
    const message = {
      type: POKER_GAME_MESSAGE,
      wire: encodeWire(wire),
    };
    publishMessage(message);
  }, [publishMessage]);

  const applyDebugCheatsToWire = useCallback((wire, game) => {
    const cheats = debugCheatsRef.current;
    if (cheats.badUnmask && corruptUnmaskWire(wire)) {
      cheats.badUnmask = false;
    }

    if (wire?.action?.type === 'SubmitPublicKey') {
      if (cheats.badShuffle && corruptShuffleTrace(wire)) {
        cheats.badShuffle = false;
      }

      if (cheats.badPk && corruptPublicKey(wire, game)) {
        cheats.badPk = false;
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

  const submitNop = useCallback((game, currentPlayer = currentActingPlayer(game)) => {
    if (!game || currentPlayer == null) return null;
    const wire = game.clientState.submit_nop({
      current_player: currentPlayer,
      reason: 'your turn not mine',
    });
    publishWire(wire);
    return wire;
  }, [publishWire]);

  const submitAction = useCallback((action, logLines) => {
    const game = gameRef.current;
    if (!game) return null;

    const envelope = game.clientState.submit_local_action(action);
    const displayLines = botTraceLines(game, action, envelope.result, logLines);
    const wire = envelope.to_wire(displayLines);
    applyDebugCheatsToWire(wire, game);
    publishWire(wire);
    appendTraceLines(displayLines, action.player);
    updateView();
    return wire;
  }, [appendTraceLines, applyDebugCheatsToWire, publishWire, updateView]);

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
        if (!game.shuffleTrace) return null;
        const traces = game.shuffleTrace;
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
      if (built.action.type === 'SubmitPublicKey') {
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
    game.shuffleTrace = null;
    game.seenFinished = false;
    protocolActionInFlightRef.current = null;

    const events = game.clientState.table.drain_events?.() ?? [];
    appendTraceLines(eventDisplayLines(events), game.clientState.player_index);
    updateView({ force: true });
    return true;
  }, [appendTraceLines, updateView]);

  const handleNetworkMessage = useCallback(async (message, playerAddress = null) => {
    if (
      message?.type !== POKER_ACTION_MESSAGE
      && message?.type !== POKER_GAME_MESSAGE
      && message?.type !== CHAT_MESSAGE
    ) return false;

    if (message.type === CHAT_MESSAGE) {
      appendGameLog(message.text ?? '', senderForAddress(playerAddress));
      return true;
    }

    const game = gameRef.current ?? resetGame();
    if (!game) return true;

    const wire = decodeWire(message.wire);
    while (wire.hand_id > game.clientState.hand_id) {
      if (!startNextHand()) return true;
    }

    if (wire.nop) {
      const applied = game.clientState.apply_nop_wire(wire);
      if (!applied) return true;

      const hand = game.clientState.current_hand();
      const handState = hand?.get_current_state();
      if (handState?.get_current_player() !== game.clientState.player_index) {
        submitNop(game, handState?.get_current_player());
        return true;
      }

      if (!isHumanActionState(handState)) {
        await submitProtocolAction();
        return true;
      }

      updateView({ force: true });
      return true;
    }

    let envelope;
    let appliedResult;
    try {
      envelope = wire.to_envelope();
      appliedResult = game.clientState.apply_envelope_result(envelope);
    } catch (error) {
      appendGameLog(error.message, senderForAddress(playerAddress), 'error');
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
        publishMessage(message);
        return true;
      }

      if (handState?.get_current_player() !== game.clientState.player_index) {
        submitNop(game, handState?.get_current_player());
        return true;
      }

      if (!isHumanActionState(handState)) {
        await submitProtocolAction();
        return true;
      }

      updateView({ force: true });
    }
    return true;
  }, [
    appendGameLog,
    appendTraceLines,
    publishMessage,
    resetGame,
    senderForAddress,
    startNextHand,
    submitNop,
    submitProtocolAction,
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

  useEffect(() => {
    if (networkSnapshot?.status !== 'connected') return;
    if (table?.currentSeat?.seatNo == null) return;
    ensureKeys().then(() => {
      updateView();
    });
  }, [ensureKeys, networkSnapshot?.status, table?.currentSeat?.seatNo, updateView]);

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
    terminalResult,
  }), [actionBarProps, gameMessages, snapshot, terminalResult]);

  const pokerTableActions = useMemo(() => ({
    handleNetworkMessage,
    armPokerDebugCheat,
    submitProtocolAction,
    submitBet,
    submitChat,
    startNextHand,
  }), [armPokerDebugCheat, handleNetworkMessage, startNextHand, submitBet, submitChat, submitProtocolAction]);

  return [pokerTableState, pokerTableActions];
}
