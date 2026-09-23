import { test } from "node:test";
import assert from "node:assert/strict";
import { planBracket, Tournament, shuffle, nameForRoundSize } from "../site/bracket.js";

function players(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `img-${i}` }));
}

// Deterministic "rng" for reproducible tests: identity shuffle (no swaps).
const noShuffle = () => 0;

test("shuffle returns same elements, does not mutate input", () => {
  const input = players(10);
  const out = shuffle(input, Math.random);
  assert.equal(out.length, 10);
  assert.deepEqual(
    [...out].map((p) => p.id).sort(),
    input.map((p) => p.id).sort()
  );
  assert.equal(input.length, 10); // untouched
});

test("nameForRoundSize covers named rounds", () => {
  assert.equal(nameForRoundSize(2), "Final");
  assert.equal(nameForRoundSize(4), "Semifinals");
  assert.equal(nameForRoundSize(8), "Quarterfinals");
  assert.equal(nameForRoundSize(16), "Round of 16");
  assert.equal(nameForRoundSize(32), "Round of 32");
});

test("planBracket: N=40 -> 8 play-in matches, 16 players, 24 byes, field of 32", () => {
  const plan = planBracket(40);
  assert.ok(plan.playIn);
  assert.equal(plan.playIn.matchCount, 8);
  assert.equal(plan.playIn.playerCount, 16);
  assert.equal(plan.byes, 24);
  assert.equal(plan.fieldAfterPlayIn, 32);
  assert.deepEqual(
    plan.rounds.map((r) => r.name),
    ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"]
  );
});

test("planBracket: N=64 (exact power of two) -> no play-in", () => {
  const plan = planBracket(64);
  assert.equal(plan.playIn, null);
  assert.equal(plan.byes, 64);
  assert.equal(plan.fieldAfterPlayIn, 64);
  assert.equal(plan.rounds[0].name, "Round of 64");
  assert.equal(plan.rounds.at(-1).name, "Final");
});

test("planBracket: N=2 -> single Final, no play-in", () => {
  const plan = planBracket(2);
  assert.equal(plan.playIn, null);
  assert.deepEqual(plan.rounds, [{ name: "Final", size: 2 }]);
});

test("planBracket: N=5 -> 1 play-in match, field of 4", () => {
  const plan = planBracket(5);
  assert.equal(plan.playIn.matchCount, 1);
  assert.equal(plan.playIn.playerCount, 2);
  assert.equal(plan.byes, 3);
  assert.equal(plan.fieldAfterPlayIn, 4);
  assert.deepEqual(plan.rounds.map((r) => r.name), ["Semifinals", "Final"]);
});

test("planBracket: N=13 -> 5 play-in matches, field of 8", () => {
  const plan = planBracket(13);
  assert.equal(plan.playIn.matchCount, 5);
  assert.equal(plan.playIn.playerCount, 10);
  assert.equal(plan.byes, 3);
  assert.equal(plan.fieldAfterPlayIn, 8);
  assert.deepEqual(plan.rounds.map((r) => r.name), ["Quarterfinals", "Semifinals", "Final"]);
});

test("planBracket rejects N=0", () => {
  assert.throws(() => planBracket(0));
});

/** Plays out a full tournament always picking `a`, returns the Tournament. */
function playAllPickingFirst(n) {
  const t = new Tournament(players(n), { rng: noShuffle });
  while (!t.isFinished) {
    const m = t.currentMatch();
    t.pick(m.a.id);
  }
  return t;
}

test("Tournament N=1: champion immediately, no matches", () => {
  const t = new Tournament(players(1), { rng: noShuffle });
  assert.equal(t.isFinished, true);
  assert.equal(t.champion.id, "img-0");
  assert.equal(t.runnerUp, null);
  const order = t.getFinishingOrder();
  assert.deepEqual(order, [{ place: 1, id: "img-0", roundName: null }]);
});

test("Tournament N=2: one match decides the champion", () => {
  const t = new Tournament(players(2), { rng: noShuffle });
  assert.equal(t.progress.roundName, "Final");
  assert.equal(t.progress.totalMatches, 1);
  const m = t.currentMatch();
  t.pick(m.a.id);
  assert.equal(t.isFinished, true);
  assert.equal(t.champion.id, m.a.id);
  assert.equal(t.runnerUp.id, m.b.id);
});

for (const n of [5, 13, 40, 64]) {
  test(`Tournament N=${n}: plays to completion, every player appears exactly once in finishing order`, () => {
    const t = playAllPickingFirst(n);
    assert.ok(t.isFinished);
    const order = t.getFinishingOrder();
    assert.equal(order.length, n);
    const ids = new Set(order.map((o) => o.id));
    assert.equal(ids.size, n);
    for (let i = 0; i < n; i++) assert.ok(ids.has(`img-${i}`));
    // Places are unique 1..n
    assert.deepEqual(
      order.map((o) => o.place),
      Array.from({ length: n }, (_, i) => i + 1)
    );
  });
}

test("Tournament N=40: total number of matches played equals N-1", () => {
  const t = playAllPickingFirst(40);
  // history length = number of picks made across the whole run
  assert.equal(t.history.length, 39);
});

test("Tournament: undo restores the exact previous match", () => {
  const t = new Tournament(players(8), { rng: noShuffle });
  const firstMatch = t.currentMatch();
  t.pick(firstMatch.a.id);
  const secondMatch = t.currentMatch();
  assert.ok(t.canUndo());
  t.undo();
  assert.equal(t.canUndo(), false);
  const replayedFirstMatch = t.currentMatch();
  assert.deepEqual(replayedFirstMatch, firstMatch);
  // Redo the same pick and confirm we land back on the same second match.
  t.pick(firstMatch.a.id);
  assert.deepEqual(t.currentMatch(), secondMatch);
});

test("Tournament: undo works across a round boundary (byes rejoin correctly)", () => {
  const t = new Tournament(players(5), { rng: noShuffle }); // 1 play-in match, 3 byes
  assert.equal(t.currentRoundName, "Play-in Round");
  const playInMatch = t.currentMatch();
  t.pick(playInMatch.a.id);
  assert.equal(t.currentRoundName, "Semifinals");
  const semiMatch = t.currentMatch();
  t.undo();
  assert.equal(t.currentRoundName, "Play-in Round");
  assert.deepEqual(t.currentMatch(), playInMatch);
  t.pick(playInMatch.a.id);
  assert.equal(t.currentRoundName, "Semifinals");
  assert.deepEqual(t.currentMatch(), semiMatch);
});

test("Tournament: rejects a winnerId not in the current match", () => {
  const t = new Tournament(players(4), { rng: noShuffle });
  assert.throws(() => t.pick("not-a-real-id"));
});

test("Tournament: picking after finish throws", () => {
  const t = playAllPickingFirst(2);
  assert.throws(() => t.pick(t.champion.id));
});

test("Tournament N=40: nobody plays twice in the same round and byes only skip play-in", () => {
  const t = new Tournament(players(40), { rng: noShuffle });
  assert.equal(t.currentRoundName, "Play-in Round");
  assert.equal(t.currentMatches.length, 8);
  const seen = new Set();
  for (const m of t.currentMatches) {
    assert.ok(!seen.has(m.a.id));
    assert.ok(!seen.has(m.b.id));
    seen.add(m.a.id);
    seen.add(m.b.id);
  }
  assert.equal(seen.size, 16);
});
