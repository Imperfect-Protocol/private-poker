import { PokerHand } from "./poker_hand.js";

export class PokerTable {
  constructor(max_players, max_rounds) {
    this.max_players = max_players;
    this.max_rounds = max_rounds;
    this.current_players = [];
    this.dealer_button = 0;
    this.current_hand = null;
  }

  static new(max_players, max_rounds) {
    return new PokerTable(max_players, max_rounds);
  }

  clone() {
    const table = new PokerTable(this.max_players, this.max_rounds);
    table.current_players = [...this.current_players];
    table.dealer_button = this.dealer_button;
    table.current_hand = this.current_hand?.clone() ?? null;
    return table;
  }

  join(player) {
    this.current_players.push(player);
  }

  start_hand(initial_chips, small_blind) {
    if (
      !(
        this.current_hand == null ||
        this.current_hand.get_current_state().is_finished()
      )
    ) {
      throw new Error("Hand in progress");
    }

    this.current_hand = PokerHand.new(
      this.current_players.length,
      this.max_rounds,
      this.dealer_button,
      initial_chips,
      small_blind,
    );
  }

  get_current_hand() {
    return this.current_hand;
  }

  get_current_hand_mut() {
    return this.current_hand;
  }

  get_max_players() {
    return this.max_players;
  }

  get_max_rounds() {
    return this.max_rounds;
  }

  get_current_player_count() {
    return this.current_players.length;
  }

  get_player(player) {
    return this.current_players[player] ?? null;
  }
}
