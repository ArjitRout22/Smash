# 🏸 Smash — Badminton Tournament & Match Management

A production-oriented platform for badminton clubs to run tournaments end-to-end:
email + password auth, role-based access, players & teams, configurable
stages & brackets, fast mobile score entry, and auditable, always-consistent
leaderboards and player statistics.

Built as a single typed codebase: **Next.js 16 (App Router) · TypeScript ·
Prisma · PostgreSQL · Zod · Tailwind CSS**.

> Designed to grow into a multi-club (multi-tenant) platform — every club-owned
> entity already carries an `organizationId`.

---

## Table of contents

1. [Feature overview](#feature-overview)
2. [Architecture](#architecture)
3. [Project structure](#project-structure)
4. [Local setup](#local-setup)
5. [Environment variables](#environment-variables)
6. [Database & migrations](#database--migrations)
7. [Seed data & demo logins](#seed-data--demo-logins)
8. [Running the app](#running-the-app)
9. [Testing](#testing)
10. [API reference](#api-reference)
11. [Security](#security)
12. [Deployment](#deployment)
13. [Assumptions](#assumptions)
14. [Scalability notes](#scalability-notes)

Deeper docs:
[**`docs/SETUP_AND_OPERATIONS.md`**](docs/SETUP_AND_OPERATIONS.md) — **full
first-to-last runbook** (local setup → GitHub → Neon → Vercel → custom domain →
Resend email → operations & troubleshooting) ·
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
[`docs/DATABASE.md`](docs/DATABASE.md) (ERD) · [`docs/API.md`](docs/API.md) ·
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) (going live) ·
[`docs/PROJECT_HISTORY.md`](docs/PROJECT_HISTORY.md) (how it was built + current state).

---

## Feature overview

- **Email + password auth** — signup & login with `scrypt`-hashed passwords
  (Node built-in, no external dep), constant-time verification, login
  rate-limiting/brute-force throttle, and revocable HttpOnly session cookies
  (JWT + server-side session table). New signups default to the `PLAYER` role.
- **RBAC** — `ADMIN`, `ORGANIZER`, `PLAYER` backed by a `Permission` table so
  new roles are additive. **Every mutating API enforces permissions server-side.**
- **Tournaments** — draft→upcoming→ongoing→completed/cancelled state machine;
  singles / doubles / mixed formats; players, teams, stages, matches, leaderboard.
- **Players & profiles** — reusable player records, detailed profile with stats,
  match history, and tournament history — all derived from real match data.
- **Teams** — doubles/mixed with validation (no duplicate player in a team, no
  shared player across a match, eligibility checks).
- **Stages & brackets** — configurable stages; one-click single-elimination
  bracket generation with standard seeding, byes, and auto-advancing winners.
- **Matches & scoring** — best-of-1 / best-of-3, live mobile-first score entry
  validated by a pure badminton **scoring engine** (21 pts, win-by-2, cap 30).
- **Points & leaderboards** — configurable points system stored as an
  **append-only ledger**; tournament + global leaderboards recomputed
  transactionally on every result change; deterministic tie-breaks.
- **Consistency** — a single DB transaction updates result → ledger → bracket →
  standings → rankings; optimistic-concurrency guard prevents racing writes.
- **Auditability** — an `AuditLog` records who changed what, with before/after.
- **Responsive UI** — reusable component kit, loading/skeleton/empty/error
  states, toasts, confirmation dialogs, search, filtering, sorting, pagination.

---

## Architecture

Clean layering — **business logic never lives in UI components or route handlers**:

```
UI (App Router pages + component kit)
      │  typed fetch client (/src/lib/client)
      ▼
API route handlers (/src/app/api/**)         ← thin: auth guard + Zod + call service
      │
Services (/src/lib/services)                 ← business logic, transactions, audit
      │
Engines (/src/lib/engines)   Repositories (Prisma)
  scoring · points ·               │
  leaderboard · bracket            ▼
  (pure, unit-tested)         PostgreSQL
```

- **Engines are pure** (no DB) → exhaustively unit-tested and reusable on the
  client for live validation (the score-entry modal uses the same `resolveMatch`).
- **Point ledger is the source of truth**; `PlayerRanking` and `LeaderboardEntry`
  are materialized caches, always rebuildable from the ledger + match results.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for state machines, the
score-submission transaction, and consistency guarantees.

---

## Project structure

```
prisma/
  schema.prisma            # normalized schema (UUIDs, FKs, indexes, soft-delete)
  migrations/              # SQL migrations
  seed.ts                  # demo data via the REAL services
src/
  app/
    (app)/                 # authenticated pages (dashboard, tournaments, …)
    login/                 # email + password login / signup
    api/                   # REST route handlers
  components/              # UI kit + AppShell + AuthProvider + tournament tabs
  lib/
    auth/                  # password (scrypt), session, authorize, permissions
    engines/               # scoring, points, leaderboard, bracket (pure)
    services/              # tournament, player, team, stage, match, score, …
    api/                   # response envelope, handler wrapper, pagination
    db/ config/ domain/ validation/ client/
  middleware.ts            # edge gate for authenticated routes
tests/                     # vitest unit + integration tests
e2e/                       # Playwright end-to-end tests
docs/                      # ARCHITECTURE, DATABASE (ERD), API
```

---

## Local setup

**Prerequisites:** Node 20+, npm, and PostgreSQL 14+.

```bash
git clone <your-repo-url> && cd BAD
npm install
cp .env.example .env        # then edit secrets (see below)
```

### Get a PostgreSQL running

**Option A — Docker (recommended):**

```bash
npm run db:up               # starts postgres:16 on localhost:5432
```

**Option B — Homebrew (macOS, no Docker):**

```bash
brew install postgresql@16
initdb -D /tmp/pgdata -U badminton --auth=trust
LC_ALL=C pg_ctl -D /tmp/pgdata -o "-p 5432" start
createdb -h localhost -p 5432 -U badminton badminton
```

**Option C — any managed Postgres** (Neon/Supabase/RDS): put its URL in
`DATABASE_URL`.

Then create the schema and seed:

```bash
npm run db:migrate          # apply migrations (creates the schema)
npm run db:seed             # demo users, players, a played tournament
npm run dev                 # http://localhost:3000
```

---

## Environment variables

All config is via env (`.env`). See [`.env.example`](.env.example) for the full,
commented list. Key ones:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `APP_URL` | Public base URL |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | ≥32-char secret signing session JWTs |
| `SESSION_TTL_SECONDS` | Session lifetime (default 7 days) |
| `DEFAULT_PHONE_REGION` | Region for parsing optional player phone numbers (e.g. `IN`) |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Never commit `.env`. `.env.example` is the committed template.

---

## Database & migrations

| Command | Description |
| --- | --- |
| `npm run db:migrate` | Create/apply a dev migration (`prisma migrate dev`) |
| `npm run db:deploy` | Apply migrations in production (`prisma migrate deploy`) |
| `npm run db:push` | Push schema without a migration (prototyping) |
| `npm run db:reset` | Drop, re-migrate, re-seed (destructive) |
| `npm run prisma:generate` | Regenerate the Prisma client |

ERD and table-by-table notes: [`docs/DATABASE.md`](docs/DATABASE.md).

---

## Seed data & demo logins

`npm run db:seed` creates roles/permissions, three demo users, eight players, and
a fully-played singles tournament (group stage + a 4-player knockout) — produced
by driving the **real** services, so its leaderboard, rankings, and point ledger
are genuine.

| Role | Email | Password |
| --- | --- | --- |
| ADMIN | `admin@smash.test` | `password123` |
| ORGANIZER | `organizer@smash.test` | `password123` |
| PLAYER | `player@smash.test` | `password123` |

Log in with any of these, or create a new account (defaults to `PLAYER`).

---

## Running the app

```bash
npm run dev        # dev server (hot reload)
npm run build      # production build
npm run start      # run the production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

---

## Testing

```bash
npm test                    # unit tests (engines, auth crypto, RBAC, phone)
npm run test:watch          # watch mode
npm run test:e2e            # Playwright (needs a running, seeded app)
```

**Integration tests** (real services + DB) are gated to protect your data — run
them against a **dedicated test database**:

```bash
createdb badminton_test
DATABASE_URL="postgresql://badminton:badminton@localhost:5432/badminton_test?schema=public" npm run db:deploy
RUN_DB_TESTS=1 DATABASE_URL="postgresql://badminton:badminton@localhost:5432/badminton_test?schema=public" npx vitest run tests/integration
```

Coverage highlights: best-of-1/3 scoring incl. deuce & cap; invalid-score
rejection; points stacking; leaderboard tie-breaks; bracket seeding/byes;
password hashing/verification; RBAC mapping; state machines; and (integration)
match completion, **score correction with full recompute**, and
**optimistic-concurrency** rejection.

For Playwright the first time: `npx playwright install chromium`.

---

## API reference

Full endpoint list with request/response shapes: [`docs/API.md`](docs/API.md).
All responses use a consistent envelope:

```jsonc
// success
{ "success": true, "data": { /* ... */ }, "meta": { /* pagination */ } }
// error
{ "success": false, "error": { "code": "MATCH_NOT_FOUND", "message": "..." } }
```

Highlights: `POST /api/auth/register`, `POST /api/auth/login`,
`GET /api/auth/me`, `POST /api/auth/logout`; CRUD for
`/api/tournaments`, `/api/players`, `/api/teams`, `/api/matches`;
`POST /api/matches/:id/scores`; `GET /api/leaderboard/players`;
`GET /api/players/:id/statistics|matches|tournaments`;
`POST /api/tournaments/:id/bracket`.

---

## Security

- HttpOnly, SameSite=Lax, `Secure`-in-prod session cookies; JWT signed with
  `SESSION_SECRET`; sessions revocable server-side (logout invalidates the row).
- Passwords hashed with `scrypt` (per-password random salt); constant-time
  verification; plaintext never stored.
- Login rate-limiting per email + IP (brute-force throttle).
- All input validated with Zod at the API boundary; server-side authorization on
  every mutation (never trusts the client/hidden UI).
- SQL-injection safe via Prisma parameterized queries; no stack traces or DB
  internals leak to clients.
- Audit log for tournaments, matches, scores, stages, players, teams.
- Multi-entity updates run in transactions; optimistic-concurrency version guard.

> The default in-memory rate limiter is per-process. For multi-instance
> production, implement the `RateLimiter` interface with Redis (drop-in).

---

## Deployment

1. Provision PostgreSQL; set `DATABASE_URL`.
2. Set `NODE_ENV=production`, `APP_URL`, and a strong `SESSION_SECRET`.
3. `npm ci && npm run db:deploy && npm run build && npm run start`
   (or containerize; `docker-compose.yml` includes Postgres for local use).
4. Behind HTTPS (required for `Secure` cookies). Front with a Redis-backed rate
   limiter for horizontal scale.

---

## Assumptions

- **Enum-like columns are stored as strings** and validated in the app (Zod + TS
  unions) rather than DB enums — so organizers can add stage types / formats
  without a destructive migration (a stated product goal).
- **Score corrections** append a fresh, consistent ledger for the match and
  record the change in `AuditLog` (which preserves before/after). Historical
  intent is auditable; current standings stay derivable from the ledger.
- **Doubles points** are credited to **both** players on a side (individual
  stats), while a team's per-tournament standing is derived from its match
  results — avoiding double counting.
- **Global rank recompute** touches all ranked players on each result change —
  fine at club scale; see scalability notes for larger deployments.
- **Multi-tenant:** each signup gets its own workspace (Organization) and
  becomes its `ORGANIZER`, so they can run their own tournaments in isolation.
  A platform `ADMIN` (created via `create:admin`, no org) sees across all
  workspaces. Isolation is enforced server-side: list queries are org-filtered
  and every get/mutate-by-id checks ownership (see `src/lib/auth/tenancy.ts`;
  covered by `tests/integration/tenancy.integration.test.ts`).
- A single default organization is seeded; multi-org is schema-ready but the UI
  is single-tenant for now.
- Bracket generation is single-elimination; group→knockout progression is
  supported via ordered stages, with a documented one-level+cascade winner
  propagation on correction.

---

## Scalability notes

- UUID PKs; indexes on all common filters/foreign keys; pagination + server-side
  filtering/sorting throughout; no N+1 (Prisma `include`/`_count`).
- Ledger-as-source-of-truth keeps writes append-only and reads cache-backed.
- Next steps for scale: Redis rate limiter + cache; incremental (per-player)
  global-rank updates instead of full recompute; move heavy recompute to a queue;
  read replicas for leaderboard reads; per-organization sharding keys already present.
```
