function rustError(message) {
  throw new Error(message);
}

function assertU64(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    rustError(`${name} must be a non-negative safe integer`);
  }
}

export class PokerBettingState {
  constructor(num_players, initial_chips) {
    if (!Array.isArray(initial_chips) || initial_chips.length !== num_players) {
      rustError("initial_chips must contain one chip count per player");
    }
    initial_chips.forEach((chips, player) => {
      assertU64(chips, `initial_chips[${player}]`);
    });
    this.player_chips = [...initial_chips];
    this.current_round_bets = Array(num_players).fill(null);
    this.pot = 0;
    this.active_players = Array(num_players).fill(true);
    this.current_highest_bet = 0;
  }

  static new(num_players, initial_chips) {
    return new PokerBettingState(num_players, initial_chips);
  }

  clone() {
    const state = new PokerBettingState(0, []);
    state.player_chips = [...this.player_chips];
    state.current_round_bets = [...this.current_round_bets];
    state.pot = this.pot;
    state.active_players = [...this.active_players];
    state.current_highest_bet = this.current_highest_bet;
    return state;
  }

  call_amount_required(player) {
    if (!this.active_players[player]) {
      return rustError("Player has already folded");
    }

    const amount_needed_to_call =
      this.current_highest_bet - (this.current_round_bets[player] ?? 0);

    return amount_needed_to_call;
  }

  chips_remaining(player) {
    return this.player_chips[player];
  }

  get_active_players() {
    return this.active_players;
  }

  process_action(player, amount) {
    assertU64(amount, "amount");
    if (!this.active_players[player]) {
      return rustError("Player has already folded");
    }

    const amount_needed_to_call =
      this.current_highest_bet - (this.current_round_bets[player] ?? 0);

    if (amount === 0) {
      if (amount_needed_to_call > 0) {
        this.active_players[player] = false;
      } else {
        this.current_round_bets[player] = 0;
      }
    } else {
      if (amount < amount_needed_to_call) {
        return rustError("Amount is less than the required call amount");
      }

      if (this.player_chips[player] < amount) {
        return rustError("Not enough chips in stack");
      }

      this.player_chips[player] -= amount;
      this.current_round_bets[player] = amount + (this.current_round_bets[player] ?? 0);
      this.pot += amount;

      if (amount > amount_needed_to_call) {
        this.current_highest_bet = this.current_round_bets[player] ?? 0;
      }
    }
  }

  is_betting_round_complete() {
    const active_count = this.active_players.filter((active) => active).length;

    if (active_count <= 1) {
      return true;
    }

    for (let player = 0; player < this.active_players.length; player += 1) {
      const is_active = this.active_players[player];
      if (!is_active) {
        continue;
      }
      const player_bet = this.current_round_bets[player];
      if (player_bet == null) {
        return false;
      }
      if (player_bet < this.current_highest_bet) {
        return false;
      }
    }

    return true;
  }

  next_street() {
    this.current_round_bets.fill(null);
    this.current_highest_bet = 0;
  }
}
