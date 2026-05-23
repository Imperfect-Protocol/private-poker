import { make_public_key_from_compressed_slice, PUBLIC_KEY_COMPRESSED_LEN } from "../crum_bls/util.js";
import { PokerTable } from "../crum_pkr/index.js";
import {
  deserialize_masked_cards,
  deserialize_unmasked_card_sets,
  deserialize_unmasked_cards,
  serialize_masked_cards,
  serialize_unmasked_card_sets,
  serialize_unmasked_cards,
} from "./poker_deck_serialization.js";

export class PeerAnnouncement {
  constructor({ peer_id, player_index, table_id, annonce_public_key }) {
    this.peer_id = peer_id;
    this.player_index = player_index;
    this.table_id = table_id;
    this.annonce_public_key = annonce_public_key;
  }
}

export class EndpointDescriptor {
  constructor({ public_ip, public_port, transport_hint }) {
    this.public_ip = public_ip;
    this.public_port = public_port;
    this.transport_hint = transport_hint;
  }
}

export class HandshakeSignal {
  constructor({ table_id, hand_id, from, to, topology, encrypted_endpoint, nonce }) {
    this.table_id = table_id;
    this.hand_id = hand_id;
    this.from = from;
    this.to = to;
    this.topology = topology;
    this.encrypted_endpoint = encrypted_endpoint;
    this.nonce = nonce;
  }
}

export class PokerActionEnvelope {
  constructor({ table_id, hand_id, from, sequence, expected_state, action }) {
    this.table_id = table_id;
    this.hand_id = hand_id;
    this.from = from;
    this.sequence = sequence;
    this.expected_state = expected_state;
    this.action = action;
  }

  to_wire(log_lines) {
    return new PokerActionEnvelopeWire({
      table_id: this.table_id,
      hand_id: this.hand_id,
      from: this.from,
      sequence: this.sequence,
      expected_state: this.expected_state,
      action: poker_action_to_wire(this.action),
      log_lines,
    });
  }
}

export class PokerActionEnvelopeWire {
  constructor({ table_id, hand_id, from, sequence, expected_state, action, log_lines }) {
    this.table_id = table_id;
    this.hand_id = hand_id;
    this.from = from;
    this.sequence = sequence;
    this.expected_state = expected_state;
    this.action = action;
    this.log_lines = log_lines;
  }

  to_envelope() {
    return new PokerActionEnvelope({
      table_id: this.table_id,
      hand_id: this.hand_id,
      from: this.from,
      sequence: this.sequence,
      expected_state: this.expected_state,
      action: poker_action_wire_to_action(this.action),
    });
  }
}

export const P2pMessage = Object.freeze({
  Handshake: (signal) => ({ type: "Handshake", signal }),
  PokerAction: (envelope) => ({ type: "PokerAction", envelope }),
  Ack: ({ from, sequence }) => ({ type: "Ack", from, sequence }),
  StateDigest: ({ from, hand_id, digest }) => ({ type: "StateDigest", from, hand_id, digest }),
});

export const PokerAction = Object.freeze({
  SubmitShuffledDeck: ({ player, deck }) => ({ type: "SubmitShuffledDeck", player, deck }),
  SubmitSmallBlind: ({ player }) => ({ type: "SubmitSmallBlind", player }),
  SubmitBigBlind: ({ player }) => ({ type: "SubmitBigBlind", player }),
  SubmitPlayerCards: ({ player, cards }) => ({ type: "SubmitPlayerCards", player, cards }),
  SubmitCommunityCards: ({ player, round, cards }) => ({
    type: "SubmitCommunityCards",
    player,
    round,
    cards,
  }),
  SubmitShowdownCards: ({ player, cards }) => ({ type: "SubmitShowdownCards", player, cards }),
  SubmitBet: ({ player, amount }) => ({ type: "SubmitBet", player, amount }),
  SubmitPublicKey: ({ player, public_key, traces }) => ({
    type: "SubmitPublicKey",
    player,
    public_key,
    traces,
  }),
});

export function poker_action_to_wire(action) {
  switch (action.type) {
    case "SubmitShuffledDeck":
      return {
        type: "SubmitShuffledDeck",
        player: action.player,
        deck_g1_compressed: serialize_masked_cards(action.deck),
      };
    case "SubmitSmallBlind":
      return { type: "SubmitSmallBlind", player: action.player };
    case "SubmitBigBlind":
      return { type: "SubmitBigBlind", player: action.player };
    case "SubmitPlayerCards":
      return {
        type: "SubmitPlayerCards",
        player: action.player,
        player_cards_g1_compressed: serialize_unmasked_card_sets(action.cards),
      };
    case "SubmitCommunityCards":
      return {
        type: "SubmitCommunityCards",
        player: action.player,
        round: action.round,
        cards_g1_compressed: serialize_unmasked_cards(action.cards),
      };
    case "SubmitShowdownCards":
      return {
        type: "SubmitShowdownCards",
        player: action.player,
        player_cards_g1_compressed: serialize_unmasked_card_sets(action.cards),
      };
    case "SubmitBet":
      return { type: "SubmitBet", player: action.player, amount: action.amount };
    case "SubmitPublicKey":
      return {
        type: "SubmitPublicKey",
        player: action.player,
        public_key_g2_compressed: action.public_key.toRawBytes(true),
        traces: action.traces.map((trace) => [trace.after_index, trace.claimed_before_index]),
      };
    default:
      throw new Error(`unknown PokerAction: ${action.type}`);
  }
}

export function poker_action_wire_to_action(action) {
  switch (action.type) {
    case "SubmitShuffledDeck":
      return PokerAction.SubmitShuffledDeck({
        player: action.player,
        deck: deserialize_masked_cards(action.deck_g1_compressed),
      });
    case "SubmitSmallBlind":
      return PokerAction.SubmitSmallBlind({ player: action.player });
    case "SubmitBigBlind":
      return PokerAction.SubmitBigBlind({ player: action.player });
    case "SubmitPlayerCards":
      return PokerAction.SubmitPlayerCards({
        player: action.player,
        cards: deserialize_unmasked_card_sets(action.player_cards_g1_compressed),
      });
    case "SubmitCommunityCards":
      return PokerAction.SubmitCommunityCards({
        player: action.player,
        round: action.round,
        cards: deserialize_unmasked_cards(action.cards_g1_compressed),
      });
    case "SubmitShowdownCards":
      return PokerAction.SubmitShowdownCards({
        player: action.player,
        cards: deserialize_unmasked_card_sets(action.player_cards_g1_compressed),
      });
    case "SubmitBet":
      return PokerAction.SubmitBet({ player: action.player, amount: action.amount });
    case "SubmitPublicKey": {
      if (action.public_key_g2_compressed.length !== PUBLIC_KEY_COMPRESSED_LEN) {
        throw new Error(
          `invalid compressed G2 public-key length: expected ${PUBLIC_KEY_COMPRESSED_LEN}, received ${action.public_key_g2_compressed.length}`
        );
      }
      return PokerAction.SubmitPublicKey({
        player: action.player,
        public_key: make_public_key_from_compressed_slice(action.public_key_g2_compressed),
        traces: action.traces.map(([after_index, claimed_before_index]) => ({
          after_index,
          claimed_before_index,
        })),
      });
    }
    default:
      throw new Error(`unknown PokerActionWire: ${action.type}`);
  }
}

export class PokerClientState {
  constructor(player_index, table_id, hand_id, table) {
    this.player_index = player_index;
    this.table_id = table_id;
    this.hand_id = hand_id;
    this.sequence = 0;
    this.seen = new Set();
    this.table = table;
  }

  static new(player_index, table_id, hand_id, table) {
    return new PokerClientState(player_index, table_id, hand_id, table);
  }

  submit_local_action(action) {
    const expected_state = this.current_state_tuple();
    this.apply_action(clone_action(action));

    this.sequence += 1;
    this.seen.add(seenKey(this.player_index, this.sequence));
    return new PokerActionEnvelope({
      table_id: this.table_id,
      hand_id: this.hand_id,
      from: this.player_index,
      sequence: this.sequence,
      expected_state,
      action,
    });
  }

  apply_envelope(envelope) {
    if (envelope.table_id !== this.table_id || envelope.hand_id !== this.hand_id) {
      return false;
    }

    const key = seenKey(envelope.from, envelope.sequence);
    if (this.seen.has(key)) {
      return false;
    }
    this.seen.add(key);

    const current_state = this.current_state_tuple();
    if (!tupleEquals(current_state, envelope.expected_state)) {
      throw new Error(
        `state mismatch before action: local=${tupleDebug(current_state)}, remote_expected=${tupleDebug(envelope.expected_state)}`
      );
    }

    this.apply_action(envelope.action);
    return true;
  }

  current_hand() {
    return this.table.get_current_hand();
  }

  current_hand_mut() {
    const hand = this.table.get_current_hand_mut();
    if (hand == null) {
      throw new Error("hand not started");
    }
    return hand;
  }

  current_state_tuple() {
    const hand = this.table.get_current_hand();
    if (hand == null) {
      throw new Error("hand not started");
    }
    return hand.get_current_state().to_tuple();
  }

  apply_action(action) {
    const hand = this.current_hand_mut();
    switch (action.type) {
      case "SubmitShuffledDeck":
        hand.submit_shuffled_deck(action.player, action.deck);
        return;
      case "SubmitSmallBlind":
        hand.submit_small_blind(action.player);
        return;
      case "SubmitBigBlind":
        hand.submit_big_blind(action.player);
        return;
      case "SubmitPlayerCards":
        hand.submit_player_cards(action.player, action.cards);
        return;
      case "SubmitCommunityCards":
        hand.submit_community_cards(action.player, action.round, action.cards);
        return;
      case "SubmitShowdownCards":
        hand.submit_player_cards_showdown(action.player, action.cards);
        return;
      case "SubmitBet":
        hand.submit_bet(action.player, action.amount);
        return;
      case "SubmitPublicKey":
        hand.submit_public_key(action.player, action.public_key, action.traces);
        return;
      default:
        throw new Error(`unknown PokerAction: ${action.type}`);
    }
  }
}

export const PokerGameClientState = PokerClientState;

function clone_action(action) {
  return {
    ...action,
    deck: action.deck?.clone?.() ?? action.deck,
    cards: Array.isArray(action.cards)
      ? action.cards.map((cards) => cards?.clone?.() ?? cards)
      : action.cards?.clone?.() ?? action.cards,
    traces: action.traces?.map((trace) => ({ ...trace })) ?? action.traces,
  };
}

function seenKey(player, sequence) {
  return `${player}:${sequence}`;
}

function tupleEquals(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function tupleDebug(tuple) {
  return `(${tuple.join(", ")})`;
}

export { PokerTable };
