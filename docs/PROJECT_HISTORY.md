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

### Phase 7 — Unified tournament player onboarding
- **Invite list is now status-aware (bug fix).** The old invite/add modals hid any
  player already in the tournament via a client-side, status-blind filter, so
  invited/declined players vanished and couldn't be re-invited. The single invite
  modal now annotates every candidate with its tournament status — **Available /
  Invited / Joined / Requested / Declined** — and only offers an action to players
  who can actually be (re-)invited. The roster shows `invited` rows too and derives
  the badge from `status` (was hard-coded "registered").
- **One flow — dropped the separate "Add players".** "Invite players" is the single
  entry point and is **account-aware** (`inviteToTournament`): a player WITH an
  account is `invited` (they accept from their dashboard); a managed player WITHOUT
  an account is `registered` directly (nobody to accept otherwise, so club players
  stay rosterable); an existing join `requested` row is accepted rather than
  re-invited.
- **Create Player is keyed by a mandatory email and rejects duplicates.**
  `createPlayer` requires an email and never creates a second player for the same
  person: an email that already belongs to an **account** is **rejected** with a
  409 + "log in or reset the password — or add them from Invite players" (shown
  inline on the field); a duplicate **managed** player email is likewise rejected.
  Only a genuinely new email creates a managed player (`Player.invitedEmail`,
  unique). (Earlier this silently linked; changed to an explicit reject.)
- **Deferred (documented):** sending invite/signup emails and linking a later signup
  to the pre-created managed player — until wired, a brand-new invited email that
  self-registers still mints a second player. See Pending follow-ups.
- Migration `20260813090000_player_invited_email`. Verified: typecheck, lint,
  48 unit + 7 integration tests, prod build, and live API + UI checks. Shipped to
  prod via PR #2.

---

### Phase 8 — Notifications, reminders, status cleanup, nav loader
- **Email notifications (Phase 1).** `src/lib/email/notifications.ts` layered on the
  existing `EmailProvider` (Resend): an **invite email** goes out when an
  account-holder is invited to a tournament (in `inviteToTournament`, best-effort).
  Reminders are an **on-demand admin action** (PR #5) — a "Send reminders" button
  on `/admin` → `POST /api/admin/reminders` → `triggerRemindersAsAdmin`
  (admin-guarded) → emails registered players about tournaments starting within 24h
  (`reminders.service.ts`). Chosen over a Vercel cron to avoid a scheduled job.
  Sends never throw — a delivery failure is logged. Follow-ups: in-app notification
  center + Web Push (iOS needs an installed PWA).
- **Dropped tournament `draft`.** New tournaments default to **`upcoming`**; the
  state machine starts there; migration `20260813120000_drop_tournament_draft`
  flips existing `draft`→`upcoming` and resets the column default. The list is
  grouped **Upcoming → Ongoing → Completed → Cancelled** then by date
  (`TOURNAMENT_STATUS_ORDER`; client-side sort, so grouping is within a page).
- **Cancel-invite polish.** The roster action for an `invited` player reads
  "Cancel invite" and toasts "Invitation cancelled" (backend already supported it).
- **Global nav loader.** `NavProgress` (in `AppShell`) — a slim top progress bar on
  client navigations, complementing the full-screen `loading.tsx` for slow server
  loads. Dependency-free: starts on internal link/back-forward, finishes on
  pathname change.
- Shipped via PR #4. Verified: typecheck, lint, 48 unit + 7 integration, prod
  build, and a live smoke (status default, invite email, reminder cron, migration).
- **Architecture reference artifact** built for the three defining mechanisms
  (layered path · point ledger · tenancy) + stack/delivery.

---

### Phase 9 — Public roster + matches, targeted reminders
- **"Who joined" is visible to everyone.** `listTournamentPlayers` was owner-only
  (`loadOwnedTournament`); now it gates on `loadViewableTournament` (owner /
  participant / anyone for a public tournament) and returns **registered-only** to
  non-managers (pending invites/declines stay private; managers still see all).
  A read-only **Players** tab (`RosterTab`) was added to the public tournament page
  (`/discover/[id]`). This also closed a latent over-exposure — the roster endpoint
  used a coarse role check with no per-tournament gate.
- **Matches visible on the public page.** Added a **Matches** tab to
  `/discover/[id]` (reuses `MatchesTab`, read-only for non-managers). Previously the
  public view only had Overview/Leaderboard/Bracket.
- **Admin picks reminder recipients.** The admin reminder CTA is now a picker
  modal: `GET /api/admin/reminders` lists upcoming tournaments + their emailable
  players; `POST { tournamentId, playerIds? }` sends to the chosen players.
  Recipients include **invited (not-yet-responded)** players as well as registered
  ones — registered get a "coming up" reminder, invited get a nudge to accept
  (`remindersSent` + `nudgesSent`). Reworked into a branded, email-client-safe
  template (header band, date + location rows, table CTA) shared by the invite /
  invite-reminder / reminder emails.
- Shipped via PR #6. Verified: typecheck, lint, 48 unit + 7 integration, build,
  and live (owner vs stranger roster, private 403, matches 200, targeted send).

---

### Phase 10 — Growth cluster: WhatsApp share, QR, PWA (1 of 3 batches)
Kicking off a 7-feature growth push. Batch 1 (PR #8):
- **WhatsApp share** — `ShareButton` leads with a prefilled `wa.me` link (our
  audience lives on WhatsApp), alongside native share + copy, everywhere it appears.
- **Tournament QR** — `QrButton` (qrcode.react) renders a scannable QR for a
  tournament's public link; in the tournament header. Print / show at the court →
  scan → open → join.
- **PWA / installable** — `app/manifest.ts` + generated 192/512/apple PNG icons
  (from the shuttlecock SVG via sharp) + a conservative service worker
  (`public/sw.js`: network-first navigations, cache-first hashed static, never
  `/api`) with `offline.html`, registered in prod via `<ServiceWorker/>`, plus
  `appleWebApp` metadata. Middleware matcher updated so `sw.js` /
  `manifest.webmanifest` / `offline.html` load without auth. Unlocks iOS Web Push
  once installed.
- Verified live on prod (PWA files serve 200 unauthenticated; QR + WhatsApp render).

Batch 2 (PRs #9, #10):
- **Invite-by-email → claim** (#6): creating a player by email sends a claim-your-
  profile signup link; signing up with that email claims the pre-created managed
  player (links account, clears `invitedEmail`, moves to their workspace) instead
  of duplicating. Finishes the onboarding loop.
- **Player identity & rivalry** (#5): `/api/players/[id]/insights` — last-5 form,
  current streak, top head-to-head rivalries (singles), and derived achievement
  badges, shown on the public player profile.

Batch 3 (PRs #11, #12):
- **Public no-login tournament pages** (#2): server-rendered `/t/[id]` (public
  tournaments only) with standings, results, players, share + "sign in to join";
  `getPublicTournamentView` returns 404 for private/missing and selects only non-
  sensitive data; middleware excludes `/t/`. Share/QR now point at `/t/[id]` — the
  big signup unlock (shared links land on an indexable page, not a login wall).
- **Live scoring / spectator** (#4): cosmetic `Match.liveA/liveB` (migration),
  scorer-gated `POST /api/matches/[id]/live` with a +/- live scoreboard; the
  matches list polls every 4s while in progress; a public **Live now** strip on
  `/t/[id]` polls `/api/public/tournaments/[id]/live` so friends watch via the
  shared link (no login). Polling, not WebSockets (Vercel serverless). Saving the
  real result clears the live score.

### Phase 11 — Unified Matches tab + League (Sunday) scoring (PR #15)
Two changes from field feedback.

- **One Matches tab (was Matches + Stages + Bracket).** The three tabs confused
  everyone ("no one understands properly"). They're now a single **Matches** tab:
  a **List ↔ Bracket** view switch, one toolbar with **Generate fixtures /
  Generate bracket / Add stage / Create match**, and **stage-filter chips** over
  the list (derived from the matches, no extra fetch). Manage-page tabs 8 → 6;
  the public/discover page drops its standalone Bracket tab too. The three
  draw-building modals moved from `StagesTab.tsx` into `FixtureModals.tsx`;
  `StagesTab.tsx` is deleted. `MatchesTab` is still permission-gated, so it
  doubles as the read-only public view.
- **League (Sunday) scoring — now the default for new tournaments.** Win = 3;
  lose but reach 15 points = 1; lose under 15 = 0. Selectable per tournament in
  **Settings → Scoring system** (Standard 10/2 + knockout bonuses still there).
  The points engine gained a score-based consolation floor: `pointsForMatch`
  takes the side's best single-game score, threaded through both the score-save
  path (`score.service`) and the leaderboard recompute (`recompute` now includes
  `games`). Switching the system **rescores the standings from stored results**
  in the same transaction (`updateTournament`). The Leaderboard shows the active
  rule as a caption. Existing tournaments (null `pointsConfig`) stay **Standard**
  — the code-level default fallback is unchanged; new tournaments are stamped
  with the League preset at create time, so nothing switches underneath anyone.
  (League presets carry explicit zero stage-bonuses so the partial-override merge
  in `resolvePointsConfig` can't re-add knockout bonuses.)
- **Help** rewritten: unified-tab guidance, an **all match scenarios** section
  (single match, round-robin, groups, knockout, group→knockout, doubles, live
  scoring, walkover/cancel, correction, casual), and the two scoring systems.
- Verified: `tsc` · `lint` · 54 unit · 11 integration (added League default /
  15-floor inclusive / switch-rescore) · `build` · live smoke on local pg
  (merged tab, bracket view, leaderboard caption, Settings scoring card) and a
  prod smoke after deploy.

### Phase 12 — Challenges: no accept step, reject-to-cancel (PR #16)
Field feedback: casual **Challenges** shouldn't gate play behind the opponent
accepting. Now a challenge is created directly in the playable **accepted**
state; the challenged side instead gets a **Reject** that **cancels** the match
if they can't play. The score flow is unchanged (one side reports, the other
confirms/rejects). `casual-match.service`: create → `accepted`; the `decline`
action now means "challenged side rejects a ready-to-play match → cancelled"
(the `accept` action + pending gate are gone); DTO exposes `canReject` (was
`canRespond`). Action enum drops `accept`. Challenges page + dashboard card show
**Enter result / Cancel** (challenger) and **Enter result / Reject** (opponent).
Added a casual-match integration test for the new state machine. `tsc`/lint/54
unit/17 integration/build green; prod smoke after deploy.

### Phase 13 — Nav trim + cancel-only-before-start (PR #17)
- **Teams removed from the nav.** Teams are built inside a tournament (its Teams
  tab), so the standalone hamburger entry was redundant. The `/teams` page and
  the per-tournament tab are unchanged; standalone cross-workspace invite logic
  is left intact (nav-only removal).
- **Tournament match Cancel only while Scheduled.** Once a match is In progress
  or Completed the Cancel CTA drops away (a started match runs to a result).
- Confirmed no change needed for tournament match SCORES — they already have no
  accept/reject/confirm step (that's casual-Challenges only). Note: tournament
  teams were already accept-free (members must be registered → added `active`);
  the accept/"Pending" flow only ever applied to standalone teams.

### Phase 14 — Scoring rename + global ranking on International (PR #18)
- **Labels:** dropped "Sunday" from **League**; renamed **Standard → International**
  (the 10-win / 2-loss + knockout-bonus preset). Internal config key stays
  `standard`; only the display changes.
- **Global leaderboard now ranks by International scoring** (win 10 / loss 2)
  instead of the old flat 10-per-win / 0-per-loss. New `globalRankingPoints(wins,
  losses)` in the points engine is the single source, used by the leaderboard
  page, dashboard top-players, and a player's headline points/rank. Knockout-stage
  bonuses stay tournament-only (excluded globally), so the board is still
  derivable from win/loss totals with no per-match recompute. Removed the unused
  `GLOBAL_POINTS_PER_WIN` constant.

### Phase 15 — Polished iOS install education flow (PR #19)
iOS Safari has no programmatic install prompt, so the plain instruction banner
became a native-feeling onboarding experience:
- `InstallPrompt` is now a **floating bottom card** (was inline, pushing
  dashboard content down): value prop + X + "Install later" (dismissal
  remembered) + a primary **Install Smash** button; safe-area padding.
- On iOS the button opens **`InstallGuide`** — a bottom-sheet modal with three
  visual steps using the real iOS glyphs (Share = square+up-arrow, Add to Home
  Screen = square+plus, "Add" pill). Android still fires the native prompt;
  hidden when standalone. Profile `InstallCard` iOS branch opens the same guide.
- Detection unchanged (`useInstall`): iOS Safari only, never when installed.

### Phase 16 — Create Random Teams (PR #20)
A tournament's **Teams** tab gained **Create random teams**: a confirmation
("Create random teams?" — available players, Format: Doubles, teams to create,
odd-player heads-up) → generates by shuffling all **unassigned registered**
players and pairing them 2-per-team (**doubles only** for now). Teams render with
Delete; leftover odd player(s) show in an **Unassigned players** section.
Matches are **not** auto-generated — **Generate matches** appears only with ≥2
teams (opens the existing fixtures flow), so the organizer reviews first. Delete
frees a team's players back to unassigned. Backend `POST /api/teams/random` →
`team.service.createRandomTeams`: server-side shuffle + atomic multi-team create,
excludes already-assigned players, leaves existing teams/matches untouched,
refuses when <2 available, auto-names "Team N". Integration-tested.

### Phase 17 — Read-only matches for non-owners + team pair change (PRs #21, #22)
- **PR #21:** the Matches tab's draw/lifecycle actions were gated only on the
  viewer's global role, so an organizer-role user on someone else's public
  tournament saw them. `MatchesTab` now takes a per-tournament `canManage` — read
  -only for non-owners; scoring stays permission-based (nominated scorers).
- **PR #22 — team pair change with immutable snapshots.** Swap a doubles player
  last-minute without corrupting fixtures/history/stats. New
  `MatchParticipantPlayer` = immutable per-match snapshot of who represented each
  side (captured at create/fixtures/bracket/progression; migration backfills
  existing matches). `serializeMatch` and player-stats read the snapshot, so a
  completed result is never re-attributed. `changeTeamPair` swaps one player,
  keeps team_id/fixtures, refreshes only still-**scheduled** matches (Case A),
  leaves completed frozen (Case B), blocks while a match is **live** (Case C);
  validates the replacement and records every change in `TeamPairingChange`
  (+ reason). `Team.lockedAt` needs an extra `force` confirm to re-pair. Teams
  tab: Change pair / Lock / History per card. Routes: `POST /api/teams/[id]/pair|
  lock`, `GET .../pairing-history`.

### Phase 18 — OG share images for public tournament pages (PR #23)
Shared `/t/[id]` links now render a branded card (name, status, format · players ·
location, current leader, smashhero.app) instead of a text-only preview. New
`src/app/t/[id]/opengraph-image.tsx` = a self-contained 1200×630 `ImageResponse`
(`next/og`, Node runtime for Prisma), data from `getPublicTournamentView`, generic
fallback if not found. `twitter-image.tsx` reuses it; page metadata opts into
`summary_large_image`. No schema change.

### Phase 19 — Dashboard tweaks + viral player profile (PRs #24, #25)
- **PR #24 (quick fixes):** dashboard greeting uses the player's display name (or
  first name) — `displayName` now on the auth user / `/api/auth/me`; the "Players"
  stat shows the **global** community total ("on Smash"); WhatsApp share navigates
  the current context when running as an installed PWA (a `target=_blank` link
  opens a sandboxed in-app browser that can't hand off to WhatsApp).
- **PR #25 — public "viral" player profile.** Every player has a no-login page at
  **/player/[id]**: a **SmashHero Rating** hero (`smashHeroRating(wins,losses)` =
  1000 + wins*20 − losses*10, floor 100), stat tiles, global rank, win streak,
  recent results, tournament history, and Share/WhatsApp. Middleware excludes
  `/player/`. A branded **share card** (`opengraph-image.tsx` + `twitter-image`,
  `summary_large_image`). `getPublicPlayerProfile` limits recent-results/history to
  PUBLIC tournaments (private never exposed), counts doubles via the match
  snapshot. "Share profile" also on the in-app player page. No schema change.

### Phase 20 — Nearby players + request-to-play + chat (PR #26)
Replaces the nearby-venues carousel with people discovery. Opt-in
`Player.discoverable` (Profile toggle); only opted-in players with an account
appear, exact coords never returned. **Players near you** (dashboard): Haversine
over saved home locations (25 km, bbox prefilter), approximate distance only.
New `PlayRequest` table + `play.service`: send → accept/decline (recipient) /
cancel (sender); self/duplicate/non-discoverable blocked. **Play requests** card
for incoming + connected. **Chat** once connected reuses the polymorphic
`MatchComment` store (new `play_request` entity type, gated to the two users) —
no new message table. Migration `20260814080811`. Integration-tested.

### Phase 21 — Teams tab readable to non-owners + pair-change swap (PR #27)
- **Teams tab on `/discover/[id]`** (doubles tournaments): `TeamsTab` gains a
  per-tournament `canManage`; all team-building actions gate on it, so non-owners
  get a read-only view (same pattern as the Matches read-only fix).
- **Change pair with an already-assigned player → SWAP.** Picking a replacement
  who's on another team now swaps the two players (both teams stay complete pairs)
  instead of being rejected. Blocks on a live match on either team; a locked team
  either side needs `force`; both teams' scheduled snapshots refresh + both get a
  pairing-history row. Unassigned replacements still do a plain replace. No schema
  change.

### Phase 22 — Reject incomplete doubles teams in group-fixture generation (PR #28)
- **Bug context.** A group-stage config (2 groups × 3 doubles teams, `rounds:2`,
  cross-group only) was reported as returning a 500. Reproduced against a real DB
  by calling `generateFixtures` directly: the cross-group double-round-robin path
  was **already correct** — it produces exactly **18** matches (9 unique A-vs-B
  pairings, each played twice; the 2nd occurrence is *not* rejected, since `Match`
  has no unique constraint). No 500 in the happy path.
- **Real defect (fixed).** `generateFixtures` (doubles branch) never checked that
  each selected team had a full pair. A team missing a partner (removed, or an
  invite never accepted) would **silently create a broken, unscorable doubles
  fixture** — the realistic trigger for downstream failures on the fixtures /
  scoring / live pages. Now every selected doubles team must have exactly **2
  active players** (and still no pending invites) or generation returns a clean
  **422 `INVALID_MATCH_CONFIG`** naming the offending team — before any insert, so
  no partial/malformed fixtures are written. No schema change; happy path
  unchanged.
- **Tests.** New `tests/integration/generate-fixtures.integration.test.ts` (19
  DB-gated cases): generation variants (2×3 rounds:2→18, rounds:1→9, 3×2→12,
  round_robin→6, regenerate-not-deduped), validation→clean-4xx (1/0-active-player
  teams, dup team across groups, nonexistent team, cross-tournament team), display
  serialization (labels + 2-player snapshots), scoring + live scoring (best-of-1
  21–15 → completed/closed/winner/points; live → in_progress; cancelled → 409;
  invalid score → 422), and generation across all four tournament statuses.

### Phase 23 — Batch group-fixture writes (fix real prod 500 timeout) (PR #29)
- **Real prod 500.** Generating fixtures for a live tournament (2 groups × 3
  clean doubles teams, `rounds:2`) returned a 500 on `www.smashhero.app` even
  after Phase 22. The six teams were verified clean (read-only) — so this was
  **not** validation. Root cause: `generateFixtures` created fixtures in an
  interactive transaction issuing **~8 sequential round-trips per match**
  (`match.create` + `attachMatchSnapshots`). Neon is in **ap-southeast-1
  (Singapore)** and the function ran in **iad1 (US-East)** (~200ms RTT), so a
  double round-robin (18 matches → ~150 sequential round-trips ≈ 34s) exceeded
  Prisma's 30s transaction timeout → a non-`P2002/P2025` error → caught → generic
  **500**. `rounds:1` (half the round-trips) stayed under and appeared to work,
  which is why only the larger config failed.
- **Fix.** Build all rows (matches, participants, doubles snapshots) in memory
  with pre-generated UUIDs, then write with a few batched `createMany` calls —
  **~6 round-trips total, independent of draw size** (~1–2s even cross-region).
  No behaviour change: identical match/participant shape, immutable per-match
  doubles snapshots, group labels, and the return-leg side-swap.
  `attachMatchSnapshots` is untouched (still used by createMatch / generateBracket
  / propagateWinner).
- **Tests.** Fixtures/scoring/live suite now 20 cases (adds singles round_robin →
  player participants, zero snapshot rows). Full suite 106/106.
- **Follow-up (infra, not code):** set the Vercel function region near Singapore
  and/or adopt the pooled Neon URL (pending PR #1) to cut cross-region latency.

### Phase 24 — Match reset, deterministic round schedule, team-name snapshot, UI (PRs #30–#32)
- **Undo a mis-scored match (PR #30).** `resetMatchResult` + `DELETE /api/matches/[id]/scores`:
  wipes a match's games + point ledger, clears the winner, vacates any downstream
  bracket slot, returns it to `scheduled`, and recomputes tournament + global
  standings. Fixes scores entered by mistake polluting the leaderboard/stats.
  Scorer-gated. (Used it to clean a live tournament: 2 mis-scored matches → all
  18 back to scheduled, leaderboard rolled back to 0.)
- **Deterministic cross-group round schedule (PR #31).** Two equal-size groups now
  get a circle-method schedule: `2×3, rounds:2` → 6 rounds × 3 matches, every
  A-team meets every B-team twice, every team once per round (6 each), courts
  rotate; round offsets `[0,1,2,1,2,0]`. Persists `round` + `courtNumber`. Other
  shapes keep the flat behaviour. Group fixtures now carry a `round`, so
  `getBracket` excludes group/round_robin stages (don't render as a knockout).
  Batched-write perf fix intact.
- **UI (PR #31).** Removed the broken WhatsApp share button everywhere (native
  share + copy only); made player-profile header CTAs responsive.
- **Team-name snapshot (PR #32).** New `MatchParticipant.teamName` point-in-time
  snapshot (migration backfills it). Renaming a team only refreshes STILL-scheduled
  fixtures; in-progress/completed matches keep the name they were played under.
  Captured at generateFixtures/createMatch/generateBracket; `serializeMatch` labels
  prefer the snapshot.

### Phase 25 — Team-rename CTA, clickable player count, per-tournament score gating (PR #33)
- **Delete generated fixtures (prod op).** Removed the tournament's 18 generated
  matches via the match-delete API (soft-delete → cleared from all lists incl.
  dashboard "upcoming"). No code change.
- **Rename team (admin-only) (task 2).** Pencil CTA on every team card; platform
  admins get a rename modal, everyone else a toast to contact support@smashhero.app.
  `updateTeam` rejects a non-admin name change with FORBIDDEN. Rename still only
  touches the team + its scheduled fixtures (teamName snapshot from Phase 24).
- **Clickable player count (task 3).** Dashboard "Players" stat links to `/players`.
- **Per-tournament score gating (task 4).** `getTournament()` returns `canScore`
  (organizer/creator, platform admin, or nominated scorer — mirrors
  `assertCanScoreTournament`); `MatchesTab` uses it for the Score button + live
  +/- controls instead of the role-only `can(SCORE_EDIT)`. Fixes a nominated
  PLAYER-role scorer being unable to score, and a non-owning organizer seeing a
  Score button that 403s. Backend gate was already correct.

### Phase 26 — Team visibility for participants + accurate At-a-glance counts (PR #34)
- **At a glance counted soft-deleted rows.** After deleting the 18 fixtures the
  card still showed "18 Matches". `getTournament` `_count` now filters
  `matches`/`teams` to `deletedAt = null`, so counts reflect reality (0).
- **Participants couldn't see teams.** `listTeams` was org-scoped, so a joined
  player from another org saw "No teams yet". It now returns a tournament's teams
  to anyone who may VIEW it (owner/public/joined/invited) — read-only — mirroring
  `listMatches`. The general (no-tournament) list stays workspace-scoped.
- **Fully read-only Teams tab** for joined non-managers: the team-name edit pencil
  now shows only to managers/admins (admins rename; a non-admin manager gets the
  contact-support toast).

### Phase 27 — Join gating, profile results/rating, titles, community dashboard (PR #35)
- **Join CTA** hidden once a tournament isn't `upcoming` ("Registration closed");
  `requestToJoin` rejects any non-upcoming status.
- **Public profile recent results** now shows the full completed-match history for
  public tournaments (was capped at 10).
- **SmashHero Rating** = the player's global leaderboard points (International
  win 10 / loss 2); added a **"Your profile"** dashboard CTA → detailed profile.
- **Titles** are won by the #1 team/player in a **completed** tournament's
  standings (covers round-robin/group), credited to every player on the winning
  team. `recomputePlayerAggregates` adds standings titles; marking a tournament
  completed recomputes tournament + players so titles land immediately
  (`recomputeTournamentAndPlayers`).
- **Dashboard** is now a global community overview (whole-app counts + global top
  players); match feeds limited to public tournaments (no private cross-tenant
  leakage) — fixes wrong-looking stats for joined players.
- **Stale stats fix:** `softDeleteMatch` now recomputes standings + player stats
  when a scored match is deleted.

### Phase 28 — Doubles profile stats, group-winner titles, joined tournaments (PRs #36, #37)
- **Doubles recent form + tournament history** were empty (queried `playerId` only);
  now `getPlayerInsights` also matches the per-match snapshot and
  `getPlayerTournaments` also matches team-keyed standings.
- **Titles = which group won:** for a completed group-stage tournament, EVERY team
  in the group with the most total points wins (all their players get a title) —
  not just the single top team; non-group tournaments still use the #1 standing.
  (`tournamentWinners()` helper.) Verified on prod: all Maple/Group-B players got
  titles=1, all Amigo/Group-A players 0.
- **Tournaments list** now includes tournaments the user JOINED (not just their org).
- **Leaderboard** tables gain a "Total points" footer row per group.
- **Maintenance:** `POST /api/tournaments/[id]/recompute` (owner/admin) refreshes a
  finished tournament's standings + stats.
- **PR #37:** `recomputeTournamentAndPlayers` now runs as several SHORT transactions
  (leaderboard, then one per player) instead of one interactive transaction — the
  full-field recompute was ~5 round-trips/player and blew past Prisma's 30s tx
  timeout against Neon (33s → 500). Callers invoke it after their own write.

### Phase 29 — Dashboard P0 polish + tile match-count fix (PR #38)
- **Recent Results** cards redesigned (no taller): winner shown by **weight + a
  check icon** (not color alone), prominent score, and a context line built from
  existing fields (`Best of · Stage · Round · Court`) that **wraps instead of
  truncating** — so duplicate-looking round-robin matches are distinguishable. The
  whole card is now a keyboard-accessible link (with an aria-label describing the
  result) to the tournament's public page `/t/[id]` (no new match-detail route).
- **Top Players** now uses **competition ranking** (ties share a rank → 1,1,1,1,5)
  computed in the service from global points — fixes the confusing 1,2,3,4 on
  equal 60-pt players. Names already link to public profiles; still top-5 +
  "View leaderboard →". No new algorithm (mirrors the leaderboard engine).
- **Bug: tile showed 36 matches instead of 18** — `listTournaments` `_count`
  counted soft-deleted rows (18 deleted + 18 regenerated). Now filters
  `matches`/`teams` to `deletedAt: null` (same fix already in getTournament).
- Zero DB changes; no new queries (uses the existing `/api/dashboard` payload).
  Better empty-state copy. Business logic stays in service/engine.

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
- ✅ **Phase 7 live** (PR #2): unified player onboarding — status-aware invite
  list, single invite flow (account-aware), mandatory-email dedupe on Create
  Player. Migration applied on deploy.
- ✅ **Phase 8 live** (PR #4 + #5): invite emails + an on-demand admin "Send
  reminders" button (cron dropped), dropped tournament `draft`, cancel-invite
  polish, global nav loader. No new env vars needed.
- ✅ **Phase 9 live** (PR #6): public read-only Players + Matches tabs on the
  tournament page (roster visible to all, registered-only for non-managers), and
  the admin reminder CTA now picks a tournament + specific recipients.
- ✅ **Phase 10 live** (growth cluster, PRs #8–#14): WhatsApp share, tournament QR,
  installable PWA (manifest + service worker + Install banner **and** a permanent
  Install card on Profile), invite-by-email→claim, player identity/rivalry
  (form/streak/H2H/badges on `/players/[id]`), public no-login `/t/[id]` pages, and
  live scoring + spectator ("Live now"). PR #13 fixed WhatsApp prefill (anchor, not
  window.open) + surfaced all of it (Public-page link, live scoreboard on scheduled
  matches, always-visible Form card).
- ✅ **Phase 11 live** (PR #15): Matches/Stages/Bracket unified into one **Matches**
  tab (List↔Bracket switch, one build toolbar, stage-filter chips); **League
  (Sunday) scoring** (win 3 / close-loss 1 / heavy-loss 0) is the new default and
  is selectable per tournament in Settings. Existing tournaments stay Standard.
- ✅ **Phase 12 live** (PR #16): Challenges dropped the accept step — ready to play
  immediately; the opponent can **Reject** (→ cancels the match). Score
  report→confirm unchanged.
- ✅ **Phase 13 live** (PR #17): Teams removed from the nav (built inside a
  tournament instead); tournament match **Cancel** shows only while Scheduled.
- ✅ **Phase 14 live** (PR #18): scoring systems renamed to **League** /
  **International**; the global leaderboard now ranks by International scoring
  (win 10 / loss 2) instead of flat 10-per-win.
- ✅ **Phase 15 live** (PR #19): polished iOS install flow — a floating bottom
  card + a step-by-step Add-to-Home-Screen guide with real iOS glyphs.
- ✅ **Phase 16 live** (PR #20): **Create Random Teams** in the Teams tab —
  auto-pair unassigned players into doubles teams, review/delete before matches.
- ✅ **Phase 17 live** (PRs #21, #22): Matches tab read-only for non-owners; and
  **team pair change** — swap a doubles player with immutable per-match snapshots
  so fixtures/history/stats stay intact (+ team lock + pairing history).
- ✅ **Phase 18 live** (PR #23): **OG/Twitter share images** for `/t/[id]` — a
  branded per-tournament card so shared links preview richly (summary_large_image).
- ✅ **Phase 19 live** (PRs #24, #25): dashboard display-name greeting + global
  player count + PWA WhatsApp fix; and a **public "viral" player profile**
  (`/player/[id]`) with a **SmashHero Rating** share card.
- ✅ **Phase 20 live** (PR #26): **nearby players + request-to-play + chat** —
  opt-in discovery around your home location, accept/decline, connected chat
  (reuses the comment store).
- ✅ **Phase 21 live** (PR #27): Teams tab readable to non-owners on the public
  page; and changing a pair with an already-assigned player now **swaps** (both
  teams stay complete).
- ✅ **Phase 22 live** (PR #28): group-fixture generation now rejects an
  incomplete doubles team (≠ 2 active players) with a clean 422 instead of
  silently creating a broken fixture; the cross-group double-round-robin path was
  already correct (2 groups × 3 teams, rounds:2 → 18 matches).
- ✅ **Phase 23 live** (PR #29): fixed a real prod **500** on group-fixture
  generation (Neon/Singapore ↔ Vercel/US-East transaction-timeout for the 18-match
  double round-robin) by batching the writes into a few `createMany` calls
  (~150 round-trips → ~6).
- ✅ **Phase 24 live** (PRs #30–#32): undo a mis-scored match
  (`DELETE /api/matches/[id]/scores` → back to scheduled + recompute);
  deterministic cross-group **round schedule** (6 rounds × 3, court rotation) with
  group fixtures kept out of the bracket view; removed the broken WhatsApp share +
  responsive profile CTAs; **team-name snapshot** so a rename only affects
  scheduled matches.
- ✅ **Phase 25 live** (PR #33): admin-only team-rename CTA (others → contact
  support@smashhero.app); dashboard player count links to /players; per-tournament
  `canScore` gating so only organizer/admin/nominated-scorer see score controls.
- ✅ **Phase 26 live** (PR #34): At-a-glance counts exclude soft-deleted
  matches/teams; a tournament's teams are visible read-only to any viewer
  (participant/public), not just its org.
- ✅ **Phase 27 live** (PR #35): join CTA hidden after a tournament starts;
  public-profile full recent results; SmashHero Rating = global points +
  dashboard "Your profile" CTA; titles for round-robin/group winners (all
  winning-team players); global community dashboard; deleting a scored match now
  recomputes stats.
- ✅ **Phase 28 live** (PRs #36, #37): doubles recent-form/tournament-history fixed;
  titles credit the winning GROUP's players; tournaments list includes joined
  events; leaderboard "Total points" row; recompute split into short transactions
  (fixed a 30s Neon tx-timeout 500).
- ✅ CI green on every push; 54 unit + 17 integration tests.
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

### Where each feature lives (UX map)
- **Public tournament page:** `smashhero.app/t/<id>` — only for tournaments with
  visibility **Public** (Settings tab). Share / QR / "Public page" link appear in
  the tournament header for public ones; private ones show a hint.
- **WhatsApp / Share / QR:** tournament header (public), profile "Share", public page.
- **Install app:** dismissible banner at top of the app + permanent card on
  **Profile**. iOS = manual Share→Add to Home Screen; Android = Install button.
- **Live scoring:** tournament **Matches** tab — a match with both players shows a
  +/- live scoreboard ("Tap to start" when scheduled, "Live" when in progress).
  Spectators watch on the public page's **"Live now"** strip (auto-refresh).
- **Player identity (form/streak/H2H/badges):** public player profile
  `/players/<id>` — needs completed matches to populate (Form card always shows).
- **Admin reminders:** `/admin` → "Send reminders" (pick tournament + recipients,
  incl. invited-not-responded players).
- **The draw (fixtures/stages/bracket):** all in the tournament **Matches** tab —
  the toolbar's Generate fixtures / Generate bracket / Add stage / Create match,
  the List↔Bracket switch, and stage-filter chips. (No more separate Stages/Bracket tabs.)
- **Scoring system:** tournament **Settings → Scoring system** — League (Sunday,
  default) or Standard. The active rule shows as a caption on the **Leaderboard**.

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
- 🔔 **Notifications, next phases:** an in-app notification center (a `Notification`
  table + bell/unread badge) and **Web Push** (add VAPID keys + push handlers to
  the existing `public/sw.js`; works on Chrome/Firefox/Edge desktop + Android, and
  on iOS now that the app is installable as a PWA). Also more email triggers
  (result-to-confirm, match scheduled) + a per-send dedupe so reminders can't
  repeat. (Reminders are a manual admin button today, not a cron.)
- 🖼️ **Shareable result/leaderboard images** (OG images) to pair with WhatsApp
  sharing — a suggested growth follow-up, not built.
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
