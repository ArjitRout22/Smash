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
- 🔜 In progress: **custom domain** (buy + connect to Vercel, then update `APP_URL`).
- 🔜 To revisit: multi-tenant **scenarios** / product refinements.

## Pending follow-ups

- 🔐 **Rotate secrets that were shared in chat:** the GitHub PAT (revoke) and the
  Neon DB password (reset → update Vercel `DATABASE_URL` → redeploy).
- 📬 **Resend:** currently uses `onboarding@resend.dev` (delivers only to the
  account owner). Verify a domain in Resend + set `EMAIL_FROM` to email arbitrary
  public signups.
- 🧹 Delete throwaway prod test rows: `delete from "User" where email like
  'probe-%' or email like 'deploy-check-%' or email like '%@t.test';`
- 💡 Later: signup email verification; Redis-backed rate limiter for scale (the
  current limiter is in-memory per serverless instance).

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
