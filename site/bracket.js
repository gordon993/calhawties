// Single-elimination bracket engine with a play-in round for non-power-of-two fields.
// Pure logic, no DOM — usable from the browser (site/app.js) and from unit tests.

/** Fisher-Yates shuffle. Returns a new array; does not mutate input. */
export function shuffle(arr, rng = Math.random) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function highestPowerOfTwoAtMost(n) {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

export function nameForRoundSize(size) {
  if (size === 2) return "Final";
  if (size === 4) return "Semifinals";
  if (size === 8) return "Quarterfinals";
  return `Round of ${size}`;
}

/**
 * Computes the static shape of a bracket for N players: the play-in round
 * (if any) and every subsequent round, with sizes and names.
 * Exported mainly so tests can assert on the shape without playing matches.
 */
export function planBracket(n) {
  if (n < 1) throw new Error("Need at least 1 player");
  if (n === 1) {
    return { playIn: null, rounds: [], byes: 1, fieldAfterPlayIn: 1 };
  }
  const p = highestPowerOfTwoAtMost(n);
  const playInMatchCount = n - p;
  const playInPlayerCount = playInMatchCount * 2;
  const byes = n - playInPlayerCount;

  const rounds = [];
  let size = p;
  while (size >= 2) {
    rounds.push({ name: nameForRoundSize(size), size });
    size /= 2;
  }

  return {
    playIn: playInMatchCount > 0 ? { name: "Play-in Round", matchCount: playInMatchCount, playerCount: playInPlayerCount } : null,
    rounds,
    byes,
    fieldAfterPlayIn: p,
  };
}

function chunkPairs(players) {
  const matches = [];
  for (let i = 0; i < players.length; i += 2) {
    matches.push({ a: players[i], b: players[i + 1] });
  }
  return matches;
}

/**
 * Stateful single-elimination tournament. Construct with a list of player
 * objects (anything with a stable `id`); each entry advances one pick at a
 * time via pick(winnerId). Undo restores the exact prior state via snapshot.
 */
export class Tournament {
  constructor(players, { rng = Math.random } = {}) {
    if (!Array.isArray(players) || players.length === 0) {
      throw new Error("Tournament needs at least one player");
    }
    const shuffled = shuffle(players, rng);
    const plan = planBracket(shuffled.length);

    this.plan = plan;
    this.history = [];
    this.eliminated = []; // { id, roundName } in elimination order
    this.champion = null;
    this.runnerUp = null;

    if (shuffled.length === 1) {
      this.champion = shuffled[0];
      this.roundDefs = [];
      this.roundCursor = 0;
      this.currentPlayers = [];
      this.waitingByes = [];
      this.currentMatches = [];
      this.currentMatchIndex = 0;
      this.nextRoundPlayers = [];
      return;
    }

    const playInPlayers = plan.playIn ? shuffled.slice(0, plan.playIn.playerCount) : [];
    const byePlayers = plan.playIn ? shuffled.slice(plan.playIn.playerCount) : shuffled;

    // roundDefs is the full sequence of rounds actually played, play-in first.
    this.roundDefs = [];
    if (plan.playIn) this.roundDefs.push({ name: plan.playIn.name, size: plan.playIn.playerCount });
    for (const r of plan.rounds) this.roundDefs.push(r);

    this.roundCursor = 0;
    this.currentPlayers = plan.playIn ? playInPlayers : byePlayers;
    this.waitingByes = plan.playIn ? byePlayers : [];
    this.currentMatches = chunkPairs(this.currentPlayers);
    this.currentMatchIndex = 0;
    this.nextRoundPlayers = [];
  }

  get isFinished() {
    return this.champion !== null;
  }

  get currentRoundName() {
    if (this.isFinished) return null;
    return this.roundDefs[this.roundCursor].name;
  }

  get progress() {
    if (this.isFinished) return null;
    return {
      roundName: this.currentRoundName,
      matchNumber: this.currentMatchIndex + 1,
      totalMatches: this.currentMatches.length,
    };
  }

  currentMatch() {
    if (this.isFinished) return null;
    return this.currentMatches[this.currentMatchIndex];
  }

  /** Deep-ish snapshot for undo. Player objects are treated as immutable. */
  _snapshot() {
    return {
      roundCursor: this.roundCursor,
      currentPlayers: this.currentPlayers.slice(),
      waitingByes: this.waitingByes.slice(),
      currentMatches: this.currentMatches.map((m) => ({ ...m })),
      currentMatchIndex: this.currentMatchIndex,
      nextRoundPlayers: this.nextRoundPlayers.slice(),
      eliminated: this.eliminated.map((e) => ({ ...e })),
      champion: this.champion,
      runnerUp: this.runnerUp,
    };
  }

  _restore(s) {
    this.roundCursor = s.roundCursor;
    this.currentPlayers = s.currentPlayers;
    this.waitingByes = s.waitingByes;
    this.currentMatches = s.currentMatches;
    this.currentMatchIndex = s.currentMatchIndex;
    this.nextRoundPlayers = s.nextRoundPlayers;
    this.eliminated = s.eliminated;
    this.champion = s.champion;
    this.runnerUp = s.runnerUp;
  }

  pick(winnerId) {
    if (this.isFinished) throw new Error("Tournament already finished");
    const match = this.currentMatch();
    if (!match) throw new Error("No current match");
    if (winnerId !== match.a.id && winnerId !== match.b.id) {
      throw new Error("winnerId must be one of the current match's players");
    }

    this.history.push(this._snapshot());

    const winner = winnerId === match.a.id ? match.a : match.b;
    const loser = winnerId === match.a.id ? match.b : match.a;

    this.eliminated.push({ id: loser.id, roundName: this.currentRoundName });
    this.nextRoundPlayers.push(winner);
    this.currentMatchIndex += 1;

    if (this.currentMatchIndex >= this.currentMatches.length) {
      const isFinalRound = this.roundCursor === this.roundDefs.length - 1;
      if (isFinalRound) {
        this.champion = this.nextRoundPlayers[0];
        this.runnerUp = loser;
        return;
      }
      const combined = this.waitingByes.concat(this.nextRoundPlayers);
      this.waitingByes = [];
      this.roundCursor += 1;
      this.currentPlayers = combined;
      this.currentMatches = chunkPairs(combined);
      this.currentMatchIndex = 0;
      this.nextRoundPlayers = [];
    }
  }

  canUndo() {
    return this.history.length > 0;
  }

  undo() {
    if (!this.canUndo()) return false;
    this._restore(this.history.pop());
    return true;
  }

  /**
   * Full finishing order, best to worst: champion, runner-up, then losers
   * grouped by the round they were eliminated in (later rounds rank higher).
   */
  getFinishingOrder() {
    if (!this.isFinished) return null;
    const order = [{ place: 1, id: this.champion.id, roundName: null }];
    if (this.runnerUp) {
      order.push({ place: 2, id: this.runnerUp.id, roundName: "Final" });
    }
    // Walk rounds from most recent (excluding final, already placed) to earliest.
    for (let i = this.roundDefs.length - 2; i >= 0; i--) {
      const roundName = this.roundDefs[i].name;
      const group = this.eliminated.filter((e) => e.roundName === roundName);
      for (const g of group) order.push({ place: order.length + 1, id: g.id, roundName });
    }
    return order;
  }
}
