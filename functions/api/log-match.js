import { getManifest, jsonResponse, getClientIp } from "../_shared.js";

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 40; // generous: a full 40-image tournament is ~39 matches
const VALID_ROUNDS = new Set([
  "Play-in Round",
  "Round of 64",
  "Round of 32",
  "Round of 16",
  "Quarterfinals",
  "Semifinals",
  "Final",
]);

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonResponse({ error: "stats logging is not configured" }, { status: 501 });

  const ip = getClientIp(request);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - RATE_LIMIT_WINDOW_SECONDS;

  const { results: recent } = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM rate_limit_events WHERE ip = ? AND ts > ?")
    .bind(ip, windowStart)
    .all();
  if ((recent?.[0]?.n ?? 0) >= RATE_LIMIT_MAX_REQUESTS) {
    return jsonResponse({ error: "rate limit exceeded" }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, { status: 400 });
  }

  const { winnerId, loserId, round } = body || {};
  if (typeof winnerId !== "string" || typeof loserId !== "string" || typeof round !== "string") {
    return jsonResponse({ error: "winnerId, loserId, and round are required strings" }, { status: 400 });
  }
  if (winnerId === loserId) {
    return jsonResponse({ error: "winnerId and loserId must differ" }, { status: 400 });
  }
  if (!VALID_ROUNDS.has(round)) {
    return jsonResponse({ error: "unknown round" }, { status: 400 });
  }

  let manifest;
  try {
    manifest = await getManifest(context);
  } catch {
    return jsonResponse({ error: "could not validate image ids" }, { status: 500 });
  }
  const validIds = new Set(manifest.map((m) => m.id));
  if (!validIds.has(winnerId) || !validIds.has(loserId)) {
    return jsonResponse({ error: "unknown image id" }, { status: 400 });
  }

  await env.DB.batch([
    env.DB.prepare("INSERT INTO rate_limit_events (ip, ts) VALUES (?, ?)").bind(ip, now),
    env.DB.prepare("INSERT INTO matches (winner_id, loser_id, round, created_at) VALUES (?, ?, ?, ?)").bind(
      winnerId,
      loserId,
      round,
      now
    ),
    // Opportunistic cleanup so rate_limit_events doesn't grow unbounded.
    env.DB.prepare("DELETE FROM rate_limit_events WHERE ts < ?").bind(now - 3600),
  ]);

  return jsonResponse({ ok: true }, { status: 201 });
}
