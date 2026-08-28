# AI English Pet

A Chrome extension with a small companion that helps you learn English while you browse.

> **Status: all eight phases are in** — foundation, the pet, the AI tutor,
> progress analytics, Notion export, the mission engine, reminders and the
> onboarding/settings surfaces. It runs end to end on a fresh clone with no API
> keys at all.

## Layout

```
apps/backend      Express 5 · TypeScript · MongoDB. Owns every secret and every
                  outbound call to OpenAI, Notion and the database.
apps/extension    MV3 · React 19 · WXT. Presentation only — no secrets, and no
                  business rule that a client could lie about.
packages/shared   zod schemas that generate the types for both sides, plus the
                  CEFR voice rules, grammar taxonomy, XP table and pet FSM.
```

The single architectural rule: **the extension holds no secret and talks to exactly
one origin — our backend.**

## Running it

You need Node 20+, pnpm, and MongoDB on `127.0.0.1:27017`
(`pnpm db:up` starts one in Docker if you don't have it locally).

```bash
pnpm install

cp .env.example .env
# fill in the two secrets:
#   JWT_SECRET=$(openssl rand -hex 32)
#   ENCRYPTION_KEY=$(openssl rand -hex 32)
cp .env apps/backend/.env

pnpm dev            # backend on :4100 + extension dev build, in parallel
```

Then in Chrome: **chrome://extensions → Developer mode → Load unpacked →
`apps/extension/.output/chrome-mv3`**.

Open the popup, enter any email, and press **Start learning**. Visit
`https://www.google.com` and Mochi appears in the corner.

> Port 4100, not 4000 — 4000 is already taken on this machine by another project.

### Signing in during development

`POST /auth/dev` creates an account from an email with no password and no Google
project. It is gated behind `DEV_AUTH_ENABLED` **and** `NODE_ENV !== production`,
so it cannot exist in a deployed build. Real Google sign-in
(`chrome.identity.launchWebAuthFlow` → `POST /auth/google`) is implemented and
switches on as soon as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Backend and extension together |
| `pnpm dev:backend` | Backend only, watch mode |
| `pnpm dev:extension` | Extension only, with content-script HMR |
| `pnpm test` | All tests (126 today) |
| `pnpm typecheck` | Strict TypeScript across all three packages |
| `pnpm build` | Production build of everything |
| `pnpm db:up` / `db:down` | Local MongoDB in Docker |

## What works today

**Backend** — Google and dev sign-in, rotating refresh tokens with family-based
reuse detection, `GET /me`, `PATCH /me/profile`, zod validation on every route,
a uniform `{ error: { code, message } }` envelope, helmet, CORS, rate limiting,
and redacting structured logs.

**The tutor** — `POST /chat/message` streams a reply over SSE, corrects the
learner, stores each mistake against a closed grammar taxonomy, and awards XP.
The system prompt is built per CEFR level from `LEVEL_VOICE`, so an A1 learner
is told "keep sentences under 12 words, no idioms" while a B2 learner is not.
Memory is assembled fresh each turn under a 1800-token ceiling from four tiers:
the learner profile, the last 8 turns, a rolling summary, and the ranked
weakness ledger.

**Missions** — one mission per learner per local day, generated the first time
that day is opened rather than by a nightly job that would have to guess
everybody's timezone. The planner — the model, or a deterministic template when
there is no key — chooses only *what* to practise; ids, targets and XP are
assigned by the server afterwards, so a bad generation can suggest a dull task
but can never mint a reward. Tasks the server can see (chat with Mochi, collect
words, stop making one specific mistake) advance from its own event stream and
cannot be ticked off by asking; only the ones nobody else can witness — writing
something, reading for ten minutes, saying a sentence out loud — have a Done
button. Finishing all of them pays a completion bonus once.

**Notion** — an optional export of the learner's vocabulary, their corrections
and their finished days into their own workspace. The extension never sees a
Notion token: the backend runs the whole OAuth exchange, seals the token with
AES-256-GCM, and makes every write itself. Every exported row stores the id of
the Notion page it became, so a sync that fails half way leaves the rest
pending instead of duplicating what already landed.

**Reminders** — at most two notifications a day, inside a three-hour window
after the hour the learner picked, never after ten at night, never twice for
the same local date, and none at all in quiet mode. A study app that pings
whenever it has an excuse gets muted within a week and then cannot reach the
learner at all, which is the failure this restraint is designed around.

**Progress** — an append-only event log rolled up into daily stats, XP and
levels, a streak with one silent grace day per week, six skill scores, and a
ranked weakness ledger that returns the learner's own sentences as evidence.
`GET /progress/summary`, `/weaknesses`, `/history`, and `POST /progress/events`
for the few things the client is genuinely the authority on.

**Extension** — onboarding that asks three questions and nothing else, because
each answer changes what happens on the very next turn; a settings screen for
reminders, the pet and muted sites; a service worker that owns all tokens and all network calls; a
content script that mounts the pet into an open shadow root so neither side's CSS
can reach the other; the pet with eight animated states driven by the shared
state machine; a chat panel that streams Mochi's reply token by token over a
long-lived port; synthesised sound (no audio files — it is all Web Audio);
drag with per-site position memory; a popup and a side-panel dashboard, both
with real loading, error, empty and signed-out states. Today's mission appears
in all three places — popup, dashboard, and the conversation itself, where a
finished task is a chip in the chat rather than a checklist somewhere else.

### Running without an OpenAI key

With no `OPENAI_API_KEY` the backend uses a deterministic, rule-based tutor in
`src/ai/offline.ts`. It catches about ten common learner mistakes and streams
its reply the same way the real one does. That is why the whole project runs end
to end on a fresh clone, and why the test suite never makes a network call or
costs anything. Set the key and `getProvider()` switches to OpenAI with
structured outputs — nothing else changes.

## Connecting Notion

Optional, and off unless the server has credentials.

1. Create an integration at <https://www.notion.so/my-integrations>, set it to
   **Public**, and add `http://localhost:4100/api/v1/notion/callback` as a
   redirect URI (or the deployed one — it must match exactly).
2. Put `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` and `NOTION_REDIRECT_URI`
   in `.env`. `ENCRYPTION_KEY` must also be set — without it the backend
   refuses to store a third-party token at all.
3. In the extension's dashboard, press **Connect Notion**, then share one page
   with the integration from Notion's own share menu. That page is where the
   three databases are created.

With no credentials the dashboard says Notion is unavailable on this server
rather than showing a button that cannot work.

## Permissions, and why they are so few

Install-time: `storage`, `alarms`, `scripting`, `sidePanel`, `notifications`,
plus one host permission for our own API. The content script is declared only
on `google.com`.

"Let the pet follow me everywhere" is an **optional** host permission requested
during onboarding and registered at runtime with
`chrome.scripting.registerContentScripts`. Asking for `<all_urls>` at install is
the biggest Chrome Web Store review risk in a product like this, and it asks the
user to trust us with every page they visit before they have seen the pet do
anything at all.

## Security

- No secret ever reaches the extension bundle. Unzip the `.crx` and there is nothing.
- Access token: 15 minutes, `chrome.storage.session` — memory-backed, gone when the browser closes.
- Refresh token: 30 days, rotating; only its SHA-256 hash is stored server-side.
  Replaying a rotated token revokes the entire token family.
- Third-party tokens (Notion) are sealed with AES-256-GCM at rest, and the
  OAuth `state` is a ten-minute signed JWT rather than a table of pending flows.
- `config/env.ts` validates the environment at boot, so a missing secret is a
  startup crash with a readable message rather than a 500 three weeks later.
# MyPet
