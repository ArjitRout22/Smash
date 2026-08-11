# Architecture

## Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| UI | `src/app/(app)`, `src/components` | Pages + reusable component kit. No business logic. |
| API client | `src/lib/client` | Typed fetch wrapper, SWR fetchers, error type. |
| Route handlers | `src/app/api/**` | Thin: authenticate, authorize, Zod-validate, call a service, format the response envelope. |
| Services | `src/lib/services` | Business logic, transactions, audit logging. |
| Engines | `src/lib/engines` | **Pure** rules: scoring, points, leaderboard ranking, bracket. No DB → unit-tested & reusable on the client. |
| Data | `src/lib/db` + Prisma | PostgreSQL access. |
| Cross-cutting | `src/lib/auth`, `config`, `errors`, `ratelimit`, `audit` | Auth/session/RBAC, env, standardized errors, rate limiting, audit. |

## Authentication & sessions

1. `POST /auth/register` → validate name/email/password, reject duplicate email,
   `scrypt`-hash the password, **auto-provision** a `PLAYER` user + linked
   `Player` profile, then issue a session (auto-login).
2. `POST /auth/login` → rate-limit per email+IP, look up by email, verify the
   password in constant time (generic error on failure), then issue a session.
   On success a JWT is signed and a revocable `Session` row is persisted
   (`tokenHash = sha256(jti)`).
3. Requests carry an HttpOnly cookie. `getAuthUser()` verifies the JWT **and**
   checks the session row is neither revoked nor expired.
4. `POST /auth/logout` revokes the session row and clears the cookie.

Passwords are hashed with Node's built-in `scrypt` (`src/lib/auth/password.ts`,
`salt:hash` hex, constant-time compare) — no external crypto dependency.

Edge `middleware.ts` is a cheap cookie-presence gate; real verification is
server-side in layouts and API routes.

> The app originally shipped phone + OTP passwordless auth; it was switched to
> email + password on request. The `OtpProvider` abstraction pattern (swap the
> delivery/verification mechanism without touching call sites) still applies if
> OTP or magic-link is reintroduced.

## Authorization (RBAC)

`Role` ↔ `Permission` (many-to-many) with a static default map
(`src/lib/auth/permissions.ts`) used for seeding and runtime checks. Route
handlers call `requirePermission(PERMISSIONS.X)` before mutating. The frontend
also hides controls via `can()`, but that is **only** UX — the server is the
authority.

## State machines

**Tournament:** `draft → upcoming → ongoing → completed | cancelled`
(`completed`/`cancelled` terminal). Enforced in `updateTournament`.

**Match:** `scheduled → in_progress → completed | cancelled`, with
`completed → in_progress` allowed to **re-open for score correction**.

**Stage:** `pending → active → completed`, advanced automatically when all of a
stage's matches finish.

## The score-submission transaction (consistency core)

`submitScore()` runs entirely inside one `prisma.$transaction`:

1. Load match; reject if cancelled or sides unassigned.
2. **Optimistic concurrency:** fail fast if `expectedVersion` is stale, then an
   atomic `updateMany(where: {id, version})` guard — if another writer bumped
   the version, `count === 0` → `CONCURRENCY_CONFLICT`.
3. Validate the games with the **scoring engine** (`resolveMatch`).
4. Rewrite `Game` rows; set participant `isWinner`/`gamesWon`; set match
   `status`/`winnerSide`.
5. Rewrite the match-scoped **point ledger** (delete + reinsert), crediting both
   players of a doubles side.
6. **Bracket progression:** advance the winner into the next match's slot; if a
   correction changed the occupant, invalidate the downstream match's result and
   cascade forward.
7. Auto-advance stages when complete.
8. **Recompute** the tournament leaderboard, affected player aggregates, and
   global ranks — all derived from results + ledger.
9. Write an `AuditLog` entry (before/after + reason).

Because it is one transaction, statistics can never partially update.

## Points & leaderboards

- `PointTransaction` is an **append-only ledger** and the source of truth for
  totals; corrections replace only that match's rows within the transaction, and
  the audit log preserves history.
- `PlayerRanking` (global) and `LeaderboardEntry` (per-tournament) are
  **materialized caches**, rebuilt by `recompute.ts` from results + ledger.
- Ranking is deterministic (`leaderboard` engine): points → wins → win% → fewer
  matches → titles → id, with shared ranks for exact ties.

## Extensibility

- New **roles**: add to the role/permission tables (map is additive).
- New **stage types / formats**: string columns + Zod unions → no migration.
- New **scoring rules**: pass a different `ScoringRules` to the engine.
- New **points systems**: per-tournament `pointsConfig` overrides the default.
- New **auth method** (OTP, OAuth, magic-link): add an endpoint that issues a
  session via `createSession()` — the session/RBAC layer is auth-method agnostic.
- **Multi-tenant**: `organizationId` FKs already present on club-owned entities.
