import { Tournament } from "./bracket.js";

const contentEl = document.getElementById("content");

const FLAVOR_LINES = [
  "Two enter. One leaves. No refunds.",
  "This is the most important decision you'll make today. Probably.",
  "Choose wisely. Or don't, it's just a picture.",
  "Somewhere, a photo you didn't pick is taking this personally.",
  "The stakes have never been lower and yet here we are.",
];

function flavorLine() {
  return FLAVOR_LINES[Math.floor(Math.random() * FLAVOR_LINES.length)];
}

let images = [];
let tournament = null;
let preloaded = new Set();

function preloadImage(src) {
  if (preloaded.has(src)) return;
  preloaded.add(src);
  const img = new Image();
  img.src = src;
}

function preloadUpcoming() {
  if (!tournament || tournament.isFinished) return;
  const next = tournament.currentMatches[tournament.currentMatchIndex + 1];
  if (next) {
    preloadImage(next.a.src);
    preloadImage(next.b.src);
  }
}

async function logMatch(winnerId, loserId, round) {
  try {
    await fetch("/api/log-match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ winnerId, loserId, round }),
    });
  } catch {
    // Stats logging is best-effort; the game must keep working offline from it.
  }
}

function renderEmptyState(message) {
  contentEl.innerHTML = `<div class="empty-state"><p>${message}</p></div>`;
}

function renderMatch() {
  const match = tournament.currentMatch();
  const progress = tournament.progress;
  const pct = Math.round(((progress.matchNumber - 1) / progress.totalMatches) * 100);

  contentEl.innerHTML = `
    <div class="progress">
      <div class="round-name">${progress.roundName}</div>
      <div class="match-count">Match ${progress.matchNumber} of ${progress.totalMatches} &middot; ${flavorLine()}</div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="matchup">
      <button class="card-btn" data-pick="a" aria-label="Pick ${match.a.alt}">
        <span class="frame"><img src="${match.a.src}" alt="${match.a.alt}" /></span>
        <span class="caption">${match.a.alt}</span>
        <span class="key-hint">Press &larr;</span>
      </button>
      <div class="vs-divider">vs</div>
      <button class="card-btn" data-pick="b" aria-label="Pick ${match.b.alt}">
        <span class="frame"><img src="${match.b.src}" alt="${match.b.alt}" /></span>
        <span class="caption">${match.b.alt}</span>
        <span class="key-hint">Press &rarr;</span>
      </button>
    </div>
    <div class="controls">
      <button class="btn" id="undo-btn" ${tournament.canUndo() ? "" : "disabled"}>Undo</button>
    </div>
    <p class="hint-line">Use the left/right arrow keys, or tap a photo.</p>
  `;

  document.querySelector('[data-pick="a"]').addEventListener("click", () => choose(match.a.id, match.b.id));
  document.querySelector('[data-pick="b"]').addEventListener("click", () => choose(match.b.id, match.a.id));
  document.getElementById("undo-btn").addEventListener("click", undo);

  preloadUpcoming();
}

function renderFinish() {
  const order = tournament.getFinishingOrder();
  const champion = images.find((i) => i.id === tournament.champion.id);
  const runnerUp = tournament.runnerUp ? images.find((i) => i.id === tournament.runnerUp.id) : null;

  const tiers = new Map();
  for (const entry of order.slice(runnerUp ? 2 : 1)) {
    if (!tiers.has(entry.roundName)) tiers.set(entry.roundName, []);
    tiers.get(entry.roundName).push(entry.id);
  }

  const tiersHtml = Array.from(tiers.entries())
    .map(([roundName, ids]) => {
      const items = ids
        .map((id) => {
          const img = images.find((i) => i.id === id);
          return `<li>${img ? img.alt : id}</li>`;
        })
        .join("");
      return `<div class="tier"><div class="tier-name">Out in ${roundName}</div><ul>${items}</ul></div>`;
    })
    .join("");

  contentEl.innerHTML = `
    <div class="finish">
      <div class="eyebrow">We have a winner</div>
      <div class="champion-frame">
        <img src="${champion.src}" alt="${champion.alt}" />
      </div>
      <h2>${champion.alt}</h2>
      <p>Peaked. Nowhere to go but down from here.</p>
      ${
        runnerUp
          ? `<div class="runner-up">
               <img src="${runnerUp.src}" alt="${runnerUp.alt}" />
               <div>Runner-up: ${runnerUp.alt}</div>
             </div>`
          : ""
      }
      ${tiersHtml ? `<div class="finish-order"><h3>Full finishing order</h3>${tiersHtml}</div>` : ""}
      <div class="play-again">
        <button class="btn btn-primary" id="play-again-btn">Play again</button>
      </div>
    </div>
  `;

  document.getElementById("play-again-btn").addEventListener("click", startTournament);
}

function render() {
  if (tournament.isFinished) {
    renderFinish();
  } else {
    renderMatch();
  }
}

function choose(winnerId, loserId) {
  if (!tournament || tournament.isFinished) return;
  const round = tournament.currentRoundName;
  tournament.pick(winnerId);
  logMatch(winnerId, loserId, round);
  render();
}

function undo() {
  if (!tournament) return;
  tournament.undo();
  render();
}

function handleKeydown(e) {
  if (!tournament || tournament.isFinished) return;
  const match = tournament.currentMatch();
  if (!match) return;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    choose(match.a.id, match.b.id);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    choose(match.b.id, match.a.id);
  } else if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    undo();
  }
}

function startTournament() {
  preloaded = new Set();
  tournament = new Tournament(images);
  render();
}

async function init() {
  try {
    const res = await fetch("manifest.json");
    if (!res.ok) throw new Error("manifest.json missing");
    images = await res.json();
  } catch {
    renderEmptyState(
      "No images found yet. Drop some photos in /images, run the build script, and reload."
    );
    return;
  }

  if (!Array.isArray(images) || images.length === 0) {
    renderEmptyState("No images found yet. Drop some photos in /images, run the build script, and reload.");
    return;
  }
  if (images.length === 1) {
    renderEmptyState("Only one image in the bracket, so it's already the champion. Add more photos for an actual tournament.");
    return;
  }

  document.addEventListener("keydown", handleKeydown);
  startTournament();
}

init();
