# Pick the Winner

A single-elimination "pick your favorite photo" bracket. Static site, no login,
no framework. Optional anonymous stats logging via Cloudflare D1.

## How it works

1. Drop photos into `/images` (`.jpg`, `.jpeg`, `.png`, `.webp`).
2. `npm run build` resizes each to a 1000px long edge, converts to WebP,
   strips EXIF/location metadata, and writes `public/manifest.json` with a
   caption auto-generated from the filename (e.g. `golden-retriever-01.jpg`
   -> "Golden Retriever 01"). Override any caption in `captions.json`
   (key = exact original filename, value = caption text).
3. The site (`public/`) is a static bracket game: `site/bracket.js` computes
   the bracket (with a play-in round for non-power-of-two counts) and
   `site/app.js` runs the UI. Every "Play again" reshuffles seeding.
4. Optional: each completed match can be logged anonymously to D1
   (winner id, loser id, round) for a private `/results.html` stats page.

## Local development

```
npm install
npm test          # bracket-generator unit tests
npm run build      # produces public/
npx serve public   # or `python3 -m http.server` from public/, then open the URL
```

The stats endpoints (`/api/log-match`, `/api/results`) only work once deployed
to Cloudflare Pages with a D1 binding (or via `wrangler pages dev` locally —
see below). The game itself works fully without them; a failed log call is
swallowed silently.

## Deploy to Cloudflare Pages

1. Push this repo to GitHub (already on this branch).
2. In the Cloudflare dashboard: **Workers & Pages > Create > Pages > Connect
   to Git**, pick this repo.
3. Build settings:
   - Build command: `npm run build`
   - Build output directory: `public`
   - Node version: 22 (set `NODE_VERSION=22` as an environment variable if
     Cloudflare doesn't pick it up automatically)
4. Deploy. Cloudflare will run the build on every push to the branch you
   connect (typically `main`).

### Adding photos later

Drop new files into `/images`, commit, push. The next Pages build reruns
`npm run build` and regenerates the whole bracket's image set — no local
build step required once this is wired up, since Cloudflare builds it
remotely from the repo.

### Optional: stats logging (D1)

Skip this section if you don't want the private results page — the game
works fine without it, and `/api/log-match` and `/api/results` return `501`
until a `DB` binding exists.

1. Create the database:
   ```
   npx wrangler d1 create calhawties-bracket
   ```
2. Apply the schema:
   ```
   npx wrangler d1 execute calhawties-bracket --remote --file=schema.sql
   ```
3. In the Cloudflare Pages project settings: **Settings > Functions > D1
   database bindings**, add a binding named `DB` pointing at the database
   you just created. (This is separate from `wrangler.toml`, because
   Git-integration Pages deploys read bindings from the dashboard, not the
   toml file — the toml is only for local `wrangler pages dev`.)
4. In **Settings > Environment variables**, add `RESULTS_PASSWORD` (a plain
   string) for the production environment. This gates `/results.html`.
5. Redeploy (push any commit, or hit "Retry deployment") so the new bindings
   take effect.
6. Visit `/results.html`, enter the password, view stats, export CSV.

The logging endpoint rate-limits each IP to 40 requests/minute and rejects
any `winnerId`/`loserId` not present in the current `manifest.json`.

## Bracket logic

For N photos:
- If N is already a power of two, it's a plain single-elimination bracket.
- Otherwise, let P be the largest power of two ≤ N. `N - P` play-in matches
  are played among `2*(N-P)` photos; the remaining `2P - N` photos get a bye
  straight into the round of P. Example, N=40: P=32, 8 play-in matches using
  16 photos, 24 byes, giving a clean field of 32.
- Round names: Round of 32/16, Quarterfinals, Semifinals, Final (plus
  "Play-in Round" when applicable).
- Seeding is reshuffled every run (including every "Play again").

See `site/bracket.js` (the engine) and `tests/bracket.test.mjs` (unit tests
covering N = 1, 2, 5, 13, 40, 64, undo, and round-boundary edge cases).
Run with `npm test`.

## Accessibility & UX notes

- Mobile-first layout: photos stack vertically under ~720px, side-by-side
  above it.
- Keyboard: Left/Right arrow picks the left/right photo, Ctrl/Cmd+Z undoes.
- Visible focus rings on every interactive element (`:focus-visible`).
- Alt text comes from the caption (filename-derived or overridden).
- `prefers-reduced-motion` disables hover/transition animation.
- Dark mode follows `prefers-color-scheme`, no toggle needed.
- Next match's two images are preloaded in the background.

## Phone test checklist

- [ ] Load the site on a phone over cellular/wifi; images load and are fully
      visible (not cropped) in the stacked layout.
- [ ] Tapping a photo advances to the next match; the progress text and bar
      update correctly.
- [ ] Undo button restores the previous match exactly (including right after
      a round boundary, e.g. play-in -> round of 32).
- [ ] Play a full bracket with an odd photo count (e.g. 13 or 40 photos) and
      confirm: correct play-in count, no photo appears twice in one round,
      and the finish screen's "full finishing order" lists everyone exactly
      once, grouped under the round they were eliminated in.
- [ ] Finish screen shows champion (large), runner-up, and the finishing
      order; "Play again" reshuffles and starts a fresh bracket.
- [ ] Rotate the phone / resize to desktop width mid-bracket; layout switches
      from stacked to side-by-side without breaking state.
- [ ] Turn on "Reduce Motion" (iOS: Settings > Accessibility > Motion) and
      confirm hover/transition effects are gone but the game still works.
- [ ] Turn on VoiceOver/TalkBack briefly and confirm each photo button reads
      its caption as alt text.
- [ ] If stats logging is enabled: play a few matches, then load
      `/results.html` on desktop, log in with the password, confirm rows
      update and CSV export downloads a real file. Try a wrong password and
      confirm it's rejected.
- [ ] Try tapping the same photo very rapidly (double-tap) and confirm it
      doesn't skip two matches at once.
