import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  bytesToHex,
  hexToBytes,
  make_public_key_from_signing_key,
  make_signing_key_from_seed,
} from '@/lib/crum_bls';
import {
  final_lines,
  HAND_ID,
  INITIAL_CHIPS,
  PokerAction,
  PokerActionEnvelopeWire,
  PokerClientState,
  SMALL_BLIND,
} from '@/lib/crum_net';
import {
  POKER_HAND_STATE_BET,
  POKER_HAND_STATE_BIG_BLIND,
  POKER_HAND_STATE_FINISHED,
  POKER_HAND_STATE_SMALL_BLIND,
  POKER_HOLDEM_ROUNDS,
  PokerTable,
} from '@/lib/crum_pkr';
import { holdemRank, holdemShowdown } from '@/lib/crum_pkr/hand_evaluator';

const POKER_ACTION_MESSAGE = 'POKER_ACTION';

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

function encodeWire(wire) {
  const action = wire.action;
  const encoded = {
    table_id: wire.table_id,
    hand_id: wire.hand_id,
    from: wire.from,
    sequence: wire.sequence,
    expected_state: wire.expected_state,
    log_lines: wire.log_lines,
    action: { type: action.type, player: action.player },
  };

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

  return encoded;
}

function decodeWire(encoded) {
  const action = { ...encoded.action };

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

  return new PokerActionEnvelopeWire({
    table_id: encoded.table_id,
    hand_id: encoded.hand_id,
    from: encoded.from,
    sequence: encoded.sequence,
    expected_state: encoded.expected_state,
    action,
    log_lines: encoded.log_lines ?? [],
  });
}

function makePokerTable(numPlayers) {
  const table = PokerTable.new(numPlayers, POKER_HOLDEM_ROUNDS);
  for (let player = 1; player <= numPlayers; player += 1) {
    table.join(player);
  }
  table.start_hand(INITIAL_CHIPS, SMALL_BLIND);
  return table;
}

function cardsToCompact(cards) {
  return cards
    .filter(Boolean)
    .map((card) => card.toString())
    .join('');
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

function chipStackSize(chips) {
  if (chips <= INITIAL_CHIPS * 0.5) return 'Small';
  if (chips <= INITIAL_CHIPS) return 'Medium';
  if (chips <= INITIAL_CHIPS * 1.5) return 'Big';
  return 'ExtraLarge';
}

function chipStackSizes(stacks) {
  return stacks.map(chipStackSize);
}

function stateLabel(hand) {
  const state = hand?.get_current_state().to_enum();
  if (!state) return 'Waiting';
  switch (state.type) {
    case 'Shuffle':
      return `Shuffle on Player ${state.player + 1}`;
    case 'SmallBlind':
      return `Small Blind on Player ${state.player + 1}`;
    case 'BigBlind':
      return `Big Blind on Player ${state.player + 1}`;
    case 'Bet':
      return `Bet on Player ${state.player + 1}`;
    case 'UnmaskHoleCards':
      return `Unmask Hole Cards on Player ${state.player + 1}`;
    case 'UnmaskCommunityCards':
      return `Round ${state.round + 1} Unmask Community Cards on Player ${state.player + 1}`;
    case 'UnmaskShowdown':
      return `Unmask Showdown on Player ${state.player + 1}`;
    case 'SubmitPublicKey':
      return `Submit Public Key on Player ${state.player + 1}`;
    case 'Finished':
      return 'Hand ended';
    default:
      return state.type;
  }
}

function tableViewPatch(clientState, signingKey) {
  const hand = clientState?.current_hand();
  if (!hand) return {};

  const deck = hand.get_poker_deck();
  const handState = hand.get_current_state();
  const pokerState = handState.to_enum();
  const communityCards = [];
  for (let round = 0; round < POKER_HOLDEM_ROUNDS; round += 1) {
    const cards = hand.get_community_cards(round);
    if (cards) {
      communityCards.push(...deck.unmasked_cards(cards));
    }
  }

  let playerCards = '';
  try {
    const mine = hand.get_player_cards()[clientState.player_index]?.clone();
    if (mine && signingKey) {
      mine.unmask(signingKey);
      playerCards = cardsToCompact(deck.unmasked_cards(mine));
    }
  } catch {
    playerCards = '';
  }

  const playerCardsBySeat = {};
  if (
    pokerState.type === 'UnmaskShowdown'
    || pokerState.type === 'SubmitPublicKey'
    || pokerState.type === 'Finished'
  ) {
    hand.get_player_cards().forEach((cardSet, seat) => {
      try {
        const compact = cardsToCompact(deck.unmasked_cards(cardSet));
        if (compact) playerCardsBySeat[seat] = compact;
      } catch {
        // Cards for this seat are still masked locally.
      }
    });
  }

  return {
    current_player: handState.get_current_player().toString(),
    current_state: handState.to_tuple().join(':'),
    state_label: stateLabel(hand),
    current_pot: hand.betting_state?.pot?.toString?.() ?? '0',
    min_bet: safeCallAmount(hand, clientState.player_index),
    max_bet: safeChipsRemaining(hand, clientState.player_index),
    bet_step: hand.get_small_blind(),
    community_cards: cardsToCompact(communityCards),
    player_cards: playerCards,
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

function gameStateName(pokerState) {
  if (!pokerState) return 'Waiting';
  if (pokerState.type === 'Shuffle') return 'Shuffling';
  if (pokerState.type === 'Bet') return streetName(pokerState.round);
  if (pokerState.type === 'UnmaskCommunityCards') return `Unmask${streetName(pokerState.round)}`;
  return pokerState.type;
}

function currentGameStateFrom(game) {
  const hand = game?.clientState.current_hand();
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
    const activePlayers = hand.betting_state?.active_players ?? [];
    const payoutAmount = Number(hand.betting_state?.pot?.toString?.() ?? 0);
    const foldedWinner = activePlayers.filter(Boolean).length === 1
      ? activePlayers.findIndex(Boolean)
      : null;
    const showdown = foldedWinner == null
      ? holdemShowdown(playerCards, communityCards, activePlayers)
      : {
        hands: playerCards.map((cards) => ({
          cards,
          rank: cards.length === 2 && communityCards.length >= 5
            ? holdemRank([...cards, ...communityCards])
            : null,
        })),
        winner: foldedWinner,
      };
    const hands = showdown.hands.map((showdownHand, index) => ({
      ...showdownHand,
      isWinner: showdown.winner === index,
    }));
    const playerWon = showdown.winner != null && showdown.winner === game.clientState.player_index;
    const stacks = chipStacks(hand, showdown.winner, showdown.winner == null ? 0 : payoutAmount);

    return {
      state: 'Showdown',
      seat,
      pot: showdown.winner == null ? payoutAmount : 0,
      minBet: safeCallAmount(hand, game.clientState.player_index),
      maxBet: safeChipsRemaining(hand, game.clientState.player_index),
      step: hand.get_small_blind(),
      chipStacks: stacks,
      chipStackSizes: chipStackSizes(stacks),
      hands,
      winner: showdown.winner,
      resultText: showdown.winner == null ? null : playerWon ? 'You Win' : 'You Lose',
      resultRank: showdown.winner == null ? null : hands[showdown.winner]?.rank ?? null,
      payout: showdown.winner == null
        ? null
        : {
          amount: payoutAmount,
          winner: showdown.winner,
          icon: 'coins',
        },
    };
  }

  return {
    state: gameStateName(pokerState),
    seat,
    pot: Number(hand.betting_state?.pot?.toString?.() ?? 0),
    minBet: safeCallAmount(hand, game.clientState.player_index),
    maxBet: safeChipsRemaining(hand, game.clientState.player_index),
    step: hand.get_small_blind(),
    chipStacks: chipStacks(hand),
    chipStackSizes: chipStackSizes(chipStacks(hand)),
    payout: null,
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
    currentGameState: {
      state: 'Waiting',
      seat: null,
      pot: 0,
      minBet: 0,
      maxBet: 0,
      step: 0,
    },
    protocolActionState: null,
    viewPatch: {},
  });
  const [gameMessages, setGameMessages] = useState([]);
  const gameRef = useRef(null);
  const lastPatchRef = useRef(null);
  const lastSnapshotRef = useRef(snapshot);

  const appendGameLog = useCallback((line) => {
    setGameMessages((prev) => [...prev, { text: line, sender: 'Game' }].slice(-160));
  }, []);

  const tableId = table?.tableData?.id;
  const tableMaxSeats = table?.tableData?.maxSeats;
  const currentSeatNo = table?.currentSeat?.seatNo;

  const resetGame = useCallback(() => {
    const numPlayers = Number(tableMaxSeats || 0);
    if (!numPlayers || currentSeatNo == null) return null;

    const pokerTable = makePokerTable(numPlayers);
    const clientState = PokerClientState.new(
      currentSeatNo,
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
  }, [resetGame]);

  const updateView = useCallback(() => {
    const game = gameRef.current;
    const hand = game?.clientState.current_hand();
    if (!game || !hand) return;

    const patch = tableViewPatch(game.clientState, game.signingKey);
    const handState = hand.get_current_state();
    const currentState = handState.current_state;
    const isMyTurn = handState.get_current_player() === game.clientState.player_index;
    const waitingForBet = currentState === POKER_HAND_STATE_BET && isMyTurn;
    const waitingForSmallBlind = currentState === POKER_HAND_STATE_SMALL_BLIND && isMyTurn;
    const waitingForBigBlind = currentState === POKER_HAND_STATE_BIG_BLIND && isMyTurn;
    const waitingForBlind = waitingForSmallBlind || waitingForBigBlind;
    const blindAmount = waitingForBigBlind ? hand.get_big_blind() : hand.get_small_blind();
    const currentGameState = currentGameStateFrom(game);
    const protocolActionState = protocolActionStateFrom(game);
    const stableCurrentGameState = shallowEqual(
      lastSnapshotRef.current.currentGameState,
      currentGameState,
    )
      ? lastSnapshotRef.current.currentGameState
      : currentGameState;

    const stablePatch = shallowEqual(lastPatchRef.current, patch) ? lastPatchRef.current : patch;
    lastPatchRef.current = stablePatch;

    const nextSnapshot = {
      started: true,
      showActionBar: waitingForBet || waitingForBlind,
      waitingForBet,
      waitingForBlind,
      canAct: isMyTurn,
      stateLabel: stablePatch.state_label,
      minBet: Number(stablePatch.min_bet ?? SMALL_BLIND),
      maxBet: Number(stablePatch.max_bet ?? INITIAL_CHIPS),
      step: Number(stablePatch.bet_step ?? SMALL_BLIND),
      actionAmount: waitingForBlind ? blindAmount : Number(stablePatch.min_bet ?? SMALL_BLIND),
      primaryLabel: waitingForSmallBlind
        ? 'Small Blind'
        : waitingForBigBlind
          ? 'Big Blind'
          : 'Raise',
      sliderDisabled: waitingForBlind,
      hideCall: waitingForBlind,
      hideFold: waitingForBlind,
      currentGameState: stableCurrentGameState,
      protocolActionState,
      viewPatch: stablePatch,
    };

    if (!shallowEqual(lastSnapshotRef.current, nextSnapshot)) {
      lastSnapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
    }
  }, []);

  const ensureKeys = useCallback(async () => {
    const game = gameRef.current ?? resetGame();
    if (!game) return null;
    if (game.signingKey && game.publicKey) return game;

    const keys = await prepareNetworkSession();
    const signingKey = make_signing_key_from_seed(hexToBytes(keys.privateKey));
    const nextGame = {
      ...game,
      signingKey,
      publicKey: make_public_key_from_signing_key(signingKey),
    };
    gameRef.current = nextGame;
    return nextGame;
  }, [prepareNetworkSession, resetGame]);

  const publishWire = useCallback((wire) => {
    publishMessage({
      type: POKER_ACTION_MESSAGE,
      wire: encodeWire(wire),
    });
  }, [publishMessage]);

  const submitAction = useCallback((action, logLines) => {
    const game = gameRef.current;
    if (!game) return null;

    const envelope = game.clientState.submit_local_action(action);
    const wire = envelope.to_wire(logLines);
    publishWire(wire);
    logLines.forEach(appendGameLog);
    updateView();
    return wire;
  }, [appendGameLog, publishWire, updateView]);

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
        if (!game.shuffleTrace) throw new Error('No shuffle trace');
        const traces = game.shuffleTrace;
        game.shuffleTrace = null;
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
        final_lines(game.clientState.table).forEach(appendGameLog);
      }
      updateView();
      return null;
    }

    if (
      handState.current_state === POKER_HAND_STATE_BET
      || handState.current_state === POKER_HAND_STATE_SMALL_BLIND
      || handState.current_state === POKER_HAND_STATE_BIG_BLIND
      || handState.get_current_player() !== game.clientState.player_index
    ) {
      return null;
    }

    const built = buildAutomaticAction(game);
    if (!built) return null;
    return submitAction(built.action, built.logLines);
  }, [appendGameLog, buildAutomaticAction, ensureKeys, submitAction, updateView]);

  const handleNetworkMessage = useCallback(async (message) => {
    if (message?.type !== POKER_ACTION_MESSAGE) return false;
    const game = await ensureKeys();
    if (!game) return true;

    const wire = decodeWire(message.wire);
    const envelope = wire.to_envelope();
    const applied = game.clientState.apply_envelope(envelope);
    if (applied) {
      wire.log_lines.forEach(appendGameLog);
      publishMessage(message);
      updateView();
    }
    return true;
  }, [appendGameLog, ensureKeys, publishMessage, updateView]);

  const submitBet = useCallback(async (amount) => {
    const game = await ensureKeys();
    if (!game) return;
    const hand = game.clientState.current_hand();
    const state = hand?.get_current_state();
    if (!state || state.current_state !== POKER_HAND_STATE_BET) return;
    if (state.get_current_player() !== game.clientState.player_index) return;

    const player = game.clientState.player_index;
    submitAction(
      PokerAction.SubmitBet({ player, amount }),
      [`Player ${player + 1} Bet: $${amount}`],
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

  const actionBarProps = useMemo(() => ({
    minBet: Math.max(snapshot.minBet, 0),
    maxBet: Math.max(snapshot.maxBet, snapshot.minBet, SMALL_BLIND),
    step: snapshot.step || SMALL_BLIND,
    visible: snapshot.showActionBar,
    disabled: !snapshot.showActionBar,
    sliderDisabled: snapshot.sliderDisabled,
    hideCall: snapshot.hideCall,
    hideFold: snapshot.hideFold,
    callAmount: snapshot.minBet,
    primaryLabel: snapshot.primaryLabel,
    primaryAmount: snapshot.waitingForBlind ? snapshot.actionAmount : null,
    onFold: () => submitBet(0),
    onCall: () => submitBet(snapshot.minBet),
    onRaise: (amount) => (snapshot.waitingForBlind ? submitBlind() : submitBet(amount)),
  }), [
    snapshot.actionAmount,
    snapshot.hideCall,
    snapshot.hideFold,
    snapshot.maxBet,
    snapshot.minBet,
    snapshot.primaryLabel,
    snapshot.showActionBar,
    snapshot.sliderDisabled,
    snapshot.step,
    snapshot.waitingForBlind,
    submitBet,
    submitBlind,
  ]);

  const pokerTableState = useMemo(() => ({
    ...snapshot,
    gameMessages,
    actionBarProps,
  }), [actionBarProps, gameMessages, snapshot]);

  const pokerTableActions = useMemo(() => ({
    handleNetworkMessage,
    submitProtocolAction,
    submitBet,
  }), [handleNetworkMessage, submitBet, submitProtocolAction]);

  return [pokerTableState, pokerTableActions];
}
