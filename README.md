# Kategoria 🎪

**Play it:** https://kategoria.pages.dev · **Source:** https://github.com/idozahavy/Kategoria

A kid-friendly Scattergories-style word game. Play alone, together on one shared screen, or with everyone joining from their own phone via a room code (WebRTC — a static web app, plus one tiny optional Pages Function for TURN credentials).

## Features

- **Modes**: classic (one letter, all categories) or one category per round
- **Scoring**: unique-words-win-big (10 unique / 5 shared) or every-good-word-counts
- **Word checking**: hybrid — bundled word lists → learned words → Wikidata category check → public dictionary (Wiktionary) → group vote; selectable or off in advanced settings
- **Languages**: English, Hebrew (RTL), Spanish, Arabic (RTL), French and Russian, extensible via language packs
- **Saves**: multiple games saved and resumed via IndexedDB
- **Timer**: optional, per turn (off / 3 min / 2 min / 1 min)

## Develop

```bash
npm install
npm run dev
```

- `npm run check` — type-check (svelte-check)
- `npm run check:i18n` — every language pack must define every UI key and category name
- `npm run verify:design` — design-scheme linter (tokens-only styling, contrast, RTL-safe CSS)
- `npm run build:styleguide` — regenerate `design/style-guide.html` + `design/exports/tokens.css` from `design/tokens.json`

## Adding a language

1. Copy `src/lib/i18n/en.ts` to `<code>.ts` and translate every `ui` string and `categoryNames` entry; set `code`, native `name`, `dir` (`ltr`/`rtl`), and the `letters` the round wheel may draw.
2. Add a word list at `src/lib/words/<code>.json` (categoryId → lowercase words) — it is picked up by filename and lazy-loaded when the language is first played.
3. Register the pack in the `packs` map in `src/lib/i18n/index.ts`.
4. Run `npm run check:i18n` — it fails if any key is missing. The language then appears automatically in the Home switcher and the game-language setting; RTL layouts come free via logical CSS.

## Remote rooms (WebRTC + TURN)

Phones-join rooms use PeerJS: the free public broker for signaling, then a direct peer-to-peer connection. Direct connections fail on restrictive networks (cellular ↔ WiFi, office firewalls), so on Cloudflare deploys a Pages Function ([functions/turn-credentials.ts](functions/turn-credentials.ts)) mints 2-hour TURN relay credentials from Cloudflare Realtime (the client fetches fresh ones for rooms opened later). One-time setup per Pages project:

1. Cloudflare dashboard → **Realtime → TURN** → create a TURN key (note its **Key ID** and **API token**).
2. ```bash
   npx wrangler pages secret put TURN_KEY_ID --project-name=kategoria
   ```
3. ```bash
   npx wrangler pages secret put TURN_API_TOKEN --project-name=kategoria
   ```
4. Redeploy (`npm run deploy`) so the function ships.

Each credential is a pass to relay arbitrary traffic through the account's TURN quota (billed per GB past the free tier), so the endpoint is guarded in layers. The function itself rejects cross-origin callers (403), but a script can forge those headers. The next two layers both need a **custom domain**: Turnstile refuses hostnames directly under a shared suffix such as `pages.dev`, and WAF rules only exist on a zone you own. Register or transfer a domain (dashboard → Domain Registration, sold at cost), then **Pages → your project → Custom domains** to attach it; the `pages.dev` address keeps working alongside.

5. **Turnstile** (bot check, free): dashboard → **Turnstile → Add widget**, hostname = the custom domain (add `localhost` too for local testing), widget mode **Invisible**. Put the **site key** in `.env` as `VITE_TURNSTILE_SITE_KEY=…` (see `.env.example`; it is public and safe to commit) and the **secret key** as a Pages secret:
   ```bash
   npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name=kategoria
   ```
   Then redeploy. With the secret set, every mint must carry a fresh single-use Turnstile token, which a `curl` script cannot produce; the client solves the challenge invisibly before asking for credentials. Without the secret the token is ignored, so an unfinished setup never breaks rooms. Do not use Cloudflare's testing keys in production — the test secret accepts every token.
6. **Rate-limiting rule** on the custom domain's zone (Security → WAF → Rate limiting rules; e.g. 10 requests per minute per IP on the path `/turn-credentials`) — caps how many credentials anyone could mint even if a layer above fails.
7. **Watch usage**: Realtime → TURN → Analytics shows relay traffic within seconds; the account's Notifications only offer usage alerts for some products on paid plans, so check analytics after busy evenings. Deleting the TURN key in the dashboard revokes every outstanding credential at once.

Without the secrets — and in local dev, where the endpoint doesn't exist — the app silently falls back to STUN-only, and same-network play works exactly as before. Security headers for the deployed site live in [public/_headers](public/_headers).

## Analytics (Umami Cloud)

Anonymous, cookie-free counts of visitors, screens and games played — no consent banner needed. Every screen is reported as a page view (`/`, `/round`, `/review`, …) and the app sends six events: `game_start` (players, bots, language, mode, remote, rounds, endless, timer — `0` means endless / no timer), `round_end` (round), `game_finish` (roundsPlayed, players, remote), `game_resume` (remote), `room_create` and `room_join`. Never names, words or ids. The tracker only loads in production builds that carry a website id, so `npm run dev` and CI never count. One-time setup:

1. Sign up at https://cloud.umami.is (free Hobby plan: 100k events/month, 3 websites, 6 months of history).
2. **Settings → Websites → Add website**: name `Kategoria`, domain `kategoria.pages.dev`. Copy the **Website ID**.
3. Put it in `.env.local` (gitignored) on the machine that deploys: `VITE_UMAMI_WEBSITE_ID=<uuid>` (see `.env.example`).
4. `npm run deploy`. To check before deploying, `npm run build && npm run preview` — the preview build is a production build, so it reports to the dashboard.

The Umami dashboard → **Visitors** is the unique-users number; **Events** shows how many games start and finish.

## Design system

The full design scheme (tokens, components, rules, style guide) lives in [design/](design/) — see [design/scheme.md](design/scheme.md). UI work must follow the `design-system` skill in `.claude/skills/design-system/`.

## Stack

Svelte 5 + Vite + TypeScript · idb · peerjs (WebRTC rooms) · qrcode · vite-plugin-pwa · self-hosted Nunito (via Fontsource)
