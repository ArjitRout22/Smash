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
  Supports **singles and doubles** — for doubles the challenger picks both pairs,
  the opposing captain accepts on behalf of their pair, and all four players must
  have accounts (partners are watch-only participants; only the two captains
  accept/report/confirm).
- **Global leaderboard + simple scoring:** the player leaderboard is now **global**
  (every player across all workspaces, like the directory) instead of
  workspace-scoped, and headline **points are a flat 10 per win / 0 per loss**
  (`GLOBAL_POINTS_PER_WIN`, computed from each player's win count — no recompute
  needed; decoupled from per-tournament scoring). Profile + dashboard "points"
  match. Casual matches remain excluded.
- **Discover join state:** public-tournament listings now carry the viewer's own
  status, so the dashboard/Discover CTA shows **Pending / Joined / Invited**
  instead of a stale "Request to join". Casual matches: **removed Reopen** — a
  completed result both players confirmed is final.
- **Mobile + polish:** iOS input-focus auto-zoom fixed (≥16px form fields);
  shuttlecock favicon + OG metadata; a **Share** button (native share sheet /
  copy link) for the app and public tournaments; a branded rotating-message
  loader on slow navigations; self-service **name change** on the profile.
- **Casual matches → team-based:** any player on a side can report the score;
  the opposing team (whoever didn't report) accepts/rejects.
- **Tournament scoring (item 5):** a scored tournament match **auto-locks**
  (no edits until the organizer reopens). Only the organizer/creator, a platform
  admin, or a **nominated scorer** may enter scores (`TournamentScorer`; managed
  from tournament Settings) — everyone else is view-only.
- **Admin cleanup:** platform-admin-only `/admin` screen to review accounts and
  **soft-delete** test users (hides them from directory + leaderboard, revokes
  login; reversible), plus `admin.service`.
- **Team invites (cross-workspace):** replaced the confusing "all players must
  belong to your workspace" block on standalone teams with an **invite → accept**
  flow. Your own workspace's players join as `active`; a player from another
  workspace (who has an account) is `invited` and appears as **Pending** until
  they accept from a dashboard card. Tournament teams still use registration.
  `TeamPlayer.status`; a team with a pending member can't be used in a match.
- **Match lifecycle + close/lock** (tournament matches): explicit **Start** /
  **Cancel** controls (status was only changing implicitly via scoring), and a
  **Close** action that finalizes a completed result — a new `Match.closedAt`
  locks the score so nobody can change it, with **Reopen** to correct. Scoring
  and edits are rejected server-side while a match is closed.
- **Self-declared skill level** (`Player.skillLevel` = beginner/intermediate/pro):
  players set their own on the profile via a new `PUT /api/me/player`
  self-service endpoint (no PLAYER_MANAGE needed); shown as a badge on the public
  player profile.
- **Dashboard "join public tournaments" CTA:** a card surfacing open public
  tournaments with an inline *Request to join* (reusing the request→accept flow),
  so anyone can discover + join from the dashboard.

---

- **Round-robin / group fixtures generator:** a "Generate fixtures" tool on the
  Stages tab bulk-creates matches — all-play-all, or **groups (cross-play only)**,
  each **once or twice** (double round-robin), optionally wrapped in a new stage.
  Solves the "2 groups of 3, everyone plays the other group twice = 18 matches"
  format without hand-creating each match. No new schema.

---

- **Per-group standings + owner-only management:** Generate-fixtures (Groups mode)
  now records each participant's group (Team.group / TournamentPlayer.group), and
  the tournament Leaderboard shows a **separate ranked table per group** (A, B, …).
  Progression to a knockout is then "pick the group qualifiers → Generate bracket".
  Also hardened the UI: the tournament management page redirects non-owners to the
  read-only public page (management was already blocked server-side).
- **Nominated scorers:** only the organizer/creator, a platform admin, or a
  **nominated scorer** (`TournamentScorer`, managed in the tournament Settings tab)
  can enter scores; everyone else is view-only. `assertCanScoreTournament`
  replaced the plain org check in `score.service`.
- **Doubles casual matches:** `CasualMatch` gained partner columns + `matchType`;
  the challenger picks both pairs, the opposing captain accepts, all four need
  accounts; partners are watch-only, only captains act.
- **Faster score saves (perf):** the score transaction no longer rewrites *every*
  player's global rank (was an O(all-players) write). `recomputeAfterMatch` only
  touches the tournament's leaderboard + the players in the match; **ranks are
  computed on-read** (global leaderboard ranks live; `getPlayerStatistics` derives
  currentRank; dashboard top-players use position order). `recomputeGlobalRanks`
  is kept but no longer called on the write path. Remaining lever: pooled Neon URL.
- **Join status everywhere:** `getTournament` + `listPublicTournaments` return the
  viewer's own `viewerStatus`, so Discover cards / detail / dashboard show
  Pending / Joined / Invited instead of a stale "Request to join".
- **Team invites (cross-workspace):** `TeamPlayer.status` (active|invited) — own-
  workspace players join active; a player from another workspace (with an account)
  is invited and accepts from a dashboard card; a team with a pending member can't
  play. Standalone teams no longer hard-require your workspace.
- **Admin cleanup + Help:** platform-admin `/admin` screen soft-deletes test
  accounts (reversible); a `/help` "How it works" reference page (nav item)
  documents the flows. Prod test-row purge SQL is in this doc's checklist.
- **Location place search:** the tournament location field is an OpenStreetMap /
  Nominatim autocomplete (free, no key) storing name + `locationLat`/`locationLng`;
  a **"View on map"** link shows on the tournament Overview, Discover cards, and
  the dashboard discover card (`LocationPicker` + `mapUrl` in `components/`).
- **Removed profile photo-by-URL** (not useful without real uploads) but kept the
  `Avatar` component (initials fallback) across the app; `photoUrl` column retained
  for a future real-upload feature.
- **CI fix:** the tournament-match auto-lock broke two DB-gated integration tests
  and exposed a real bug — `propagateWinner` now clears `closedAt` when it
  invalidates a downstream bracket match (else it became "scheduled but locked").
  Run `RUN_DB_TESTS=1 DATABASE_URL=<badminton_test> npx vitest run tests/integration`
  locally before pushing scoring/match changes (they're skipped in plain `npm test`).

---

### Phase 6 — Profiles get contactable, matches get social, venue discovery
- **Profile location + phone (self-service):** `Player` gained `locationName` +
  `locationLat/Lng` (OSM place picker) and the profile now edits **phone** and
  **home location** via `PUT /api/me/player` (extended `UpdateOwnPlayerSchema` +
  `updateOwnPlayer`). Phone is treated as private contact info — `getPlayer` only
  returns it to the player themselves or a platform admin (nulled for the public
  directory); location is shown publicly with a **View on map** link.
- **"View on map" as a real CTA:** new `ViewOnMapButton` (button-styled `<a>`,
  renders nothing when there's no resolvable location) in `LocationPicker`.
  Profile shows a **"View my map"** CTA; the tournament Overview and public
  player profile use it too. Compact map *chips* on dashboard/discover cards kept.
- **Casual matches carry a real location (item 3):** the New Challenge modal uses
  the OSM `LocationPicker`; `CasualMatch` gained `locationLat/Lng`; challenge
  cards show a **View on map** CTA.
- **Match comments (all matches):** a polymorphic `MatchComment`
  (`entityType` = `match` | `casual_match`, keyed by `entityId`, no FK — either
  match type can be deleted freely) with `comment.service` + REST under
  `/api/(matches|casual-matches)/[id]/comments[/[commentId]]`. Access **mirrors
  match visibility**: tournament-match comments use `loadViewableTournament`
  (owner / public / participant may read+post; organizer/creator/admin moderate);
  casual-match comments are restricted to the (≤4) participants (non-participants
  get 404, no existence leak). Reusable `<MatchComments basePath>` collapsible
  thread on Challenge cards and tournament match rows.
- **Nearby badminton venues (item 5):** dashboard `NearbyVenues` carousel does a
  live OSM (Nominatim) search bounded to a ~15km box around the player's saved
  coordinates (browser-side, like the picker); prompts to set a location if none.
- **Item 6 (ops, not code):** `scripts/cleanup_reset_stats.sql` — a reviewed,
  single-transaction **clean-slate stats reset** (wipes all matches, casual
  matches, ledger, leaderboards, rankings, comments) **+ hard-delete of throwaway
  test accounts** (`%@t.test`, `hero-%`, `probe-%`, `deploy-check-%`) and their
  tournaments. Prints before/after NOTICE counts; left uncommitted for an
  explicit COMMIT/ROLLBACK. Validated locally (rolled back); **run on prod Neon**.
- Migration `20260812200000_profile_location_casual_coords_comments` (auto-applies
  on deploy). Typecheck + lint + 48 unit tests + production build all green;
  features verified live on a local Postgres (profile save round-trip, venue
  carousel with real OSM results, comment access-control + tenancy).

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

## Current state (as of 2026-08-13)

- ✅ Live and working: auth, RBAC, tournaments/players/teams/stages/matches,
  scoring, leaderboards, brackets, password reset, multi-tenant isolation.
- ✅ **Phase 6 live** (deployed from `main`): profile phone + home location,
  "View on map" CTAs, casual-match location, match comments (tournament + casual),
  nearby-venue carousel. Verified on prod after deploy.
- ✅ **Item-6 clean-slate reset executed on prod** (`scripts/cleanup_reset_stats.sql`):
  all matches / casual matches / ledger / leaderboards / rankings / comments wiped
  and throwaway test accounts hard-deleted. Stats start fresh.
- ✅ CI green on every push; 48 unit + 7 integration tests.
- ✅ **Custom domain live:** https://smashhero.app (HTTPS; Vercel primary = `www`,
  apex 308-redirects to it).
- ✅ **Email delivery live:** `smashhero.app` verified in Resend (DKIM/SPF/MX),
  `EMAIL_FROM` = `@smashhero.app`, `APP_URL` set — real password-reset emails
  deliver with links to `smashhero.app` (verified end-to-end).
- 💰 **Maps/venue search cost nothing:** OpenStreetMap **Nominatim** (free, no
  key) for place + venue search, and "View on map" opens **Google Maps links**
  (not the billable Maps/Places API); no embedded tiles. Queried browser-side
  (distributed IPs) with debounce + OSM attribution — stays within OSM fair-use.
- 🔜 To revisit: multi-tenant **scenarios** / product refinements.

## Pending follow-ups

- 🚀 **Pooled DB connection (perf) — PR open (#1, branch
  `chore/pooled-db-directurl-and-ops-checklist`).** Wires `directUrl =
  env("DIRECT_DATABASE_URL")` in `schema.prisma`, documents pooled/direct URLs,
  updates CI. **Before merging:** in Vercel set `DATABASE_URL` → Neon **pooled**
  endpoint (`-pooler`, `?...&pgbouncer=true&connection_limit=1`) and add
  `DIRECT_DATABASE_URL` → **direct** endpoint; else the build's `migrate deploy`
  fails safe. Runbook: `docs/OPS_ROTATE_AND_POOL.md`.
- 🔐 **Rotate secrets that were shared in chat:** the GitHub PAT (revoke) and the
  Neon DB password (reset → update Vercel URLs → redeploy). Steps in
  `docs/OPS_ROTATE_AND_POOL.md` (bundled with PR #1).
- 💡 Later: Redis-backed rate limiter for scale (the current limiter is in-memory
  per serverless instance); casual head-to-head record on profiles; "Challenge"
  button on player-directory profiles; client-side caching of OSM venue searches.

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
