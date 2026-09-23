import { getManifest, jsonResponse, safeEqual } from "../_shared.js";

function toCsv(rows) {
  const header = ["id", "caption", "appearances", "wins", "losses", "win_rate", "championships"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = header.map((k) => {
      const v = r[k] ?? "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    });
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return jsonResponse({ error: "stats logging is not configured" }, { status: 501 });
  if (!env.RESULTS_PASSWORD) return jsonResponse({ error: "results page is not configured" }, { status: 501 });

  const url = new URL(request.url);
  const password = request.headers.get("x-results-password") || url.searchParams.get("password") || "";
  if (!safeEqual(password, env.RESULTS_PASSWORD)) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const manifest = await getManifest(context);

  const [{ results: winRows }, { results: lossRows }, { results: champRows }] = await Promise.all([
    env.DB.prepare("SELECT winner_id AS id, COUNT(*) AS n FROM matches GROUP BY winner_id").all(),
    env.DB.prepare("SELECT loser_id AS id, COUNT(*) AS n FROM matches GROUP BY loser_id").all(),
    env.DB.prepare("SELECT winner_id AS id, COUNT(*) AS n FROM matches WHERE round = 'Final' GROUP BY winner_id").all(),
  ]);

  const wins = new Map(winRows.map((r) => [r.id, r.n]));
  const losses = new Map(lossRows.map((r) => [r.id, r.n]));
  const champs = new Map(champRows.map((r) => [r.id, r.n]));

  const rows = manifest
    .map((m) => {
      const w = wins.get(m.id) || 0;
      const l = losses.get(m.id) || 0;
      const appearances = w + l;
      return {
        id: m.id,
        caption: m.alt,
        appearances,
        wins: w,
        losses: l,
        win_rate: appearances > 0 ? Number((w / appearances).toFixed(3)) : null,
        championships: champs.get(m.id) || 0,
      };
    })
    .sort((a, b) => b.win_rate - a.win_rate || b.championships - a.championships);

  const format = url.searchParams.get("format");
  if (format === "csv") {
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="results.csv"',
      },
    });
  }

  return jsonResponse({ rows });
}
