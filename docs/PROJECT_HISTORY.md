# Project History — Smash

A durable record of how this app was built, the decisions made, and its current
live state. Companion to the [README](../README.md) and the other docs
([ARCHITECTURE](ARCHITECTURE.md) · [DATABASE](DATABASE.md) · [API](API.md) ·
[DEPLOYMENT](DEPLOYMENT.md)).

> **Smash** is a full-stack badminton tournament & match management SaaS, built
> from an empty folder in August 2026.

---

## Links & environments

| | |
| --- | --- |
| **Code** | `~/Documents/BAD` (npm package `badminton-app`) |
| **Repo** | https://github.com/ArjitRout22/Smash (`main` auto-deploys) |
| **Live** | https://smash-nine-sigma.vercel.app |
| **Host** | Vercel (project "Smash") |
| **Database** | Neon PostgreSQL (free tier, ap-southeast-1 / Singapore) |
| **CI** | GitHub Actions (`.github/workflows/ci.yml`) |

**Stack:** Next.js 16 (App Router, TypeScript) · Prisma · PostgreSQL · Zod ·
Tailwind CSS v4 · Vitest · Playwright.

---

## Build timeline

### Phase 1 — Core application (single codebase)
- Scaffolded Next.js 16 + TypeScript + Tailwind; Prisma schema with UUID keys,
  FKs, indexes, soft-delete, and audit log.
- **Layered architecture:** thin API routes → services (`src/lib/services`) →
  pure engines (`src/lib/engines`) → Prisma. Business logic never lives in UI
  or route handlers.
- **Pure, unit-tested engines:** badminton scoring (21 / win-by-2 / cap-30,
  best-of-1/3), configurable points, deterministic-tiebreak leaderboards,
  single-elimination brackets (seeding + byes + winner propagation).
- **Consistency model:** an append-only `PointTransaction` ledger is the source
  of truth; `PlayerRanking` + `LeaderboardEntry` are materialized caches
  recomputed **transactionally** on every score change. Optimistic concurrency
  via `Match.version`.
- Full REST API for tournaments, players, teams, stages, matches, scores,
  leaderboards, and stats — each with Zod validation and RBAC.
- Responsive UI: reusable component kit, dashboard, tournament detail with tabs
  (overview/players/teams/matches/stages/leaderboard/bracket/settings), player
  profiles, fast mobile score entry, global leaderboard.
- Tests (Vitest unit + integration, Playwright e2e), seed data, and docs.
- Verified end-to-end against a real local Postgres (Homebrew `postgresql@16`).

### Phase 2 — Auth switch: OTP → email + password
- Originally shipped **passwordless phone + OTP** (with an `OtpProvider`
  abstraction: console/twilio/mock). Switched to **email + password** on request.
- Passwords hashed with Node's built-in **`scrypt`** (per-password salt,
  constant-time compare) — no external crypto dependency.
- Removed OTP endpoints/provider/table; added `/auth/register` + `/auth/login`,
  login rate-limiting, and a rebuilt login/signup UI.
- Fixed a real bug found along the way: global stats were counting matches from
  **soft-deleted tournaments** — now excluded.

### Phase 3 — Ship it live
- Pushed to **GitHub** (ArjitRout22/Smash) over HTTPS.
- Deployed on **Vercel** with a **Neon** Postgres; build pipeline auto-runs
  `prisma migrate deploy`. Verified register/login/logout + DB reads/writes
  against the live Neon DB.
- Added a production **`create:admin`** script (no demo seed needed in prod).

### Phase 4 — CI, password reset, multi-tenancy
- **GitHub Actions CI:** typecheck → lint → unit + integration tests (Postgres
  service) → build, on every push/PR.
- **Password reset via email:** `EmailProvider` abstraction (console fallback +
  Resend), hashed single-use tokens with expiry, `/forgot-password` +
  `/reset-password` pages, session revocation on reset. Verified live.
- **Multi-tenant + self-serve organizer:** each signup now creates its own
  **Organization** and becomes its **ORGANIZER** — running their own tournaments
  in isolation. A platform **ADMIN** (no org) sees everything. Isolation is
  enforced server-side (`src/lib/auth/tenancy.ts`): list queries are org-filtered
  and every get/mutate-by-id checks ownership (blocks cross-tenant IDOR).
  Verified live on production that one workspace cannot see or reach another's
  data (empty lists + 403 on ID access).

### Phase 5 — Live-feedback fixes + individual (casual) matches
- **Fixed two production 500s** reported from live use:
  - *View full profile* crashed — the player page fetched paginated matches with
    the envelope-unwrapping `swrFetcher` but read `.data` on the result, throwing
    a `TypeError` into the error boundary. All its APIs were actually returning
    200. Fixed by pairing paginated reads with `swrFetcherWithMeta` (same class
    of bug also silently emptied the add-player-to-team picker).
  - *Save score* 500'd on Neon — the score transaction (rewrite games/ledger +
    recompute tournament & global standings) ran enough sequential round-trips to
    exceed Prisma's **5s default interactive-transaction timeout** (`P2028`).
    Raised the limits (`maxWait 15s / timeout 30s`), batched games/ledger/
    leaderboard writes into `createMany`, and made the Prisma client a true
    per-process singleton in production too (serverless connection reuse).
- **Individual "casual" matches** (player-vs-player, outside any tournament):
  a dedicated `CasualMatch` table kept **separate from tournament `Match`**, so
  casual results never touch the point ledger / rankings / leaderboards — they're
  excluded from ranked stats *by construction*. Flow: challenge → opponent
  **accepts** → a result is **reported** by one player and **confirmed** by the
  other (both must agree) → completed + locked, with **reopen** for corrections.
  Only players with login accounts can be challenged. New **Challenges** page +
  dashboard action card, reusing the badminton scoring engine + score modal.

---

## Key decisions

- **Enum-like columns as strings** (validated by Zod + TS unions) instead of DB
  enums — so new stage types / formats / roles need no destructive migration.
- **Ledger as source of truth**; standings/rankings are rebuildable caches.
- **Object-level authorization** for multi-tenancy — permission checks alone
  aren't enough; every record access is org-ownership checked.
- **Provider abstractions** (`OtpProvider`, `EmailProvider`) so delivery backends
  swap without touching call sites — the same pattern would reintroduce OTP or
  add SMS/other email providers.
- **Auto-migrating deploys:** `build` = `prisma generate && prisma migrate deploy
  && next build`, so pushing to `main` ships schema changes safely.

---

## Roles

| Role | Scope | Can |
| --- | --- | --- |
| **ADMIN** | Platform (no org) | Everything, across all workspaces |
| **ORGANIZER** | Own workspace | Create/run tournaments, players, teams, matches, scores in their org |
| **PLAYER** | Own workspace | View-only (legacy signups; new signups are ORGANIZER) |

---

## Current state (as of 2026-08-11)

- ✅ Live and working: auth, RBAC, tournaments/players/teams/stages/matches,
  scoring, leaderboards, brackets, password reset, multi-tenant isolation.
- ✅ CI green on every push; 48 unit + 7 integration tests.
- ✅ **Custom domain live:** https://smashhero.app (HTTPS; Vercel primary = `www`,
  apex 308-redirects to it).
- ✅ **Email delivery live:** `smashhero.app` verified in Resend (DKIM/SPF/MX),
  `EMAIL_FROM` = `@smashhero.app`, `APP_URL` set — real password-reset emails
  deliver with links to `smashhero.app` (verified end-to-end).
- 🔜 To revisit: multi-tenant **scenarios** / product refinements.

## Pending follow-ups

- 🔐 **Rotate secrets that were shared in chat:** the GitHub PAT (revoke) and the
  Neon DB password (reset → update Vercel `DATABASE_URL` → redeploy).
- 🧹 Delete throwaway prod test rows: `delete from "User" where email like
  'hero-%' or email like 'probe-%' or email like 'deploy-check-%' or email like '%@t.test';`
- 🚀 **Pooled DB connection (perf + resilience):** point Vercel's `DATABASE_URL`
  at Neon's **pooled** endpoint (`-pooler` host, `?...&pgbouncer=true&connection_limit=1`)
  and add a separate `DIRECT_DATABASE_URL` (direct endpoint) with `directUrl` in
  `schema.prisma` for migrations. Biggest remaining lever for page-load speed and
  the safety net if score-save 500s persist (connection-pool exhaustion). Kept
  out of the Phase-5 fix so it can't break auto-deploy — set the two Vercel vars
  first, then wire `directUrl`.
- 💡 Later: Redis-backed rate limiter for scale (the current limiter is in-memory
  per serverless instance); casual head-to-head record on profiles; "Challenge"
  button on player-directory profiles.

---

## Key commands

```bash
npm run dev                 # local dev server
npm run db:migrate          # apply migrations (dev)
npm run db:seed             # demo data (DEV ONLY — logins *@smash.test / password123)
npm run create:admin -- you@example.com "password" "Your Name"   # platform admin
npm test                    # unit tests
RUN_DB_TESTS=1 DATABASE_URL=<test-db> npx vitest run tests/integration
npm run build               # prisma generate + migrate deploy + next build
```
