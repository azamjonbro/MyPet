# AI English Pet

A Chrome extension with a small companion that helps you learn English while you browse.

> **Status: Phase 1 (Foundation) and Phase 2 (Pet) are in.** Phases 3–8 — the AI tutor,
> progress, Notion, the mission engine, notifications and polish — are not built yet.
> See `ARCHITECTURE.md` for the plan each phase follows.

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
| `pnpm test` | All tests (25 today) |
| `pnpm typecheck` | Strict TypeScript across all three packages |
| `pnpm build` | Production build of everything |
| `pnpm db:up` / `db:down` | Local MongoDB in Docker |

## What works today

**Backend** — Google and dev sign-in, rotating refresh tokens with family-based
reuse detection, `GET /me`, `PATCH /me/profile`, zod validation on every route,
a uniform `{ error: { code, message } }` envelope, helmet, CORS, rate limiting,
and redacting structured logs.

**Extension** — a service worker that owns all tokens and all network calls; a
content script that mounts the pet into an open shadow root so neither side's CSS
can reach the other; the pet with eight animated states driven by the shared state
machine; drag with per-site position memory; and a popup with real loading, error,
empty and signed-out states.

## Permissions, and why they are so few

Install-time: `storage`, `alarms`, `scripting`, plus one host permission for our
own API. The content script is declared only on `google.com`.

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
- Third-party tokens (Notion, from Phase 5) are sealed with AES-256-GCM at rest.
- `config/env.ts` validates the environment at boot, so a missing secret is a
  startup crash with a readable message rather than a 500 three weeks later.
# MyPet
