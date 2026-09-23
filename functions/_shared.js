// Shared helpers for Pages Functions.

let manifestCache = null;
let manifestCacheAt = 0;
const MANIFEST_TTL_MS = 60_000;

/** Fetches the built manifest.json via the Pages static-assets binding, with a short in-memory cache. */
export async function getManifest(context) {
  const now = Date.now();
  if (manifestCache && now - manifestCacheAt < MANIFEST_TTL_MS) return manifestCache;
  const url = new URL("/manifest.json", context.request.url);
  const res = await context.env.ASSETS.fetch(url.toString());
  if (!res.ok) throw new Error("Could not load manifest.json");
  const manifest = await res.json();
  manifestCache = manifest;
  manifestCacheAt = now;
  return manifest;
}

export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
}

/** Constant-time-ish string compare to avoid trivial timing side channels on the password check. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}
