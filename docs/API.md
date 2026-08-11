# API reference

Base path: `/api`. JSON in/out. Auth via the `bad_session` HttpOnly cookie set by
`register`/`login`. All mutating endpoints enforce permissions server-side.

## Response envelope

```jsonc
{ "success": true,  "data": <T>, "meta": { "total": 42, "page": 1, "pageSize": 20, "totalPages": 3, "hasNext": true, "hasPrev": false } }
{ "success": false, "error": { "code": "MATCH_NOT_FOUND", "message": "Match not found", "details": [ ... ] } }
```

### Error codes → HTTP

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Bad/invalid input (Zod) |
| `UNAUTHORIZED` | 401 | Not signed in / bad session |
| `FORBIDDEN` | 403 | Missing permission |
| `NOT_FOUND` | 404 | Missing record |
| `CONFLICT` | 409 | Duplicate / in-use |
| `INVALID_STATE` | 409 | Illegal state transition |
| `CONCURRENCY_CONFLICT` | 409 | Stale optimistic version |
| `RATE_LIMITED` | 429 | Throttled (e.g. too many login attempts) |
| `INVALID_SCORE` / `INVALID_MATCH_CONFIG` | 422 | Rule violation |
| `INTERNAL_ERROR` | 500 | Unexpected (no details leaked) |

Common query params for list endpoints: `page`, `pageSize` (≤100), `search`,
`sortBy`, `sortDir`.

## Auth

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{ name, email, password, phone? }` | Creates a PLAYER + linked Player, sets session cookie. `password` ≥ 8 chars. |
| POST | `/auth/login` | `{ email, password }` | Verifies credentials, sets session cookie. Rate-limited per email+IP. |
| POST | `/auth/logout` | — | Revokes session. |
| GET | `/auth/me` | — | Current user (id, email, role, permissions…). |
| POST | `/auth/forgot-password` | `{ email }` | Emails a reset link. Always 200 (never reveals if the account exists). Rate-limited. |
| POST | `/auth/reset-password` | `{ token, password }` | Consumes a single-use token, sets the new password, revokes all sessions. |

## Tournaments

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/tournaments` (`?status=`) | `tournament.view` |
| POST | `/tournaments` | `tournament.create` |
| GET | `/tournaments/:id` | `tournament.view` |
| PUT | `/tournaments/:id` | `tournament.edit` |
| DELETE | `/tournaments/:id` | `tournament.delete` |
| GET/POST | `/tournaments/:id/players` | view / edit |
| GET/POST | `/tournaments/:id/stages` | stage.view / stage.manage |
| GET | `/tournaments/:id/leaderboard` | `leaderboard.view` |
| GET | `/tournaments/:id/bracket` | `match.view` |
| POST | `/tournaments/:id/bracket` | `stage.manage` — `{ name, participantIds[] }` (seed order) |

Create body: `{ name, description?, location?, startDate?, endDate?, format: "singles"|"doubles"|"mixed", pointsConfig? }`.

## Players

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/players` | `player.view` |
| POST | `/players` | `player.manage` |
| GET | `/players/:id` | `player.view` |
| PUT | `/players/:id` | `player.manage` |
| GET | `/players/:id/statistics` | `player.view` |
| GET | `/players/:id/matches` | `player.view` |
| GET | `/players/:id/tournaments` | `player.view` |

## Teams

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/teams` (`?tournamentId=`) | `team.view` |
| POST | `/teams` — `{ name, teamType, tournamentId?, playerIds:[a,b] }` | `team.manage` |
| PUT | `/teams/:id` | `team.manage` |
| DELETE | `/teams/:id` | `team.manage` |

## Matches & scores

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/matches` (`?tournamentId=&stageId=&status=`) | `match.view` |
| POST | `/matches` | `match.manage` |
| GET | `/matches/:id` | `match.view` |
| PUT | `/matches/:id` | `match.manage` |
| DELETE | `/matches/:id` | `match.manage` |
| POST/PUT | `/matches/:id/scores` | `score.edit` |

Create match body: `{ tournamentId, matchType, bestOf: 1|3, stageId?, courtNumber?, scheduledAt?, sideA:{playerId|teamId}, sideB:{playerId|teamId} }`.

Submit score body: `{ games: [{ scoreA, scoreB }, ...], expectedVersion?, reason? }`.
Returns `{ matchId, status, winnerSide, version }`. Supply `expectedVersion`
(from the match you loaded) to be protected against concurrent edits.

## Stages, leaderboard, dashboard

| Method | Path | Permission |
| --- | --- | --- |
| PUT | `/stages/:id` | `stage.manage` |
| GET | `/leaderboard/players` (`?sortBy=points\|wins\|winPercentage\|tournaments\|recent`) | `leaderboard.view` |
| GET | `/dashboard` | authenticated |

## Example

```bash
# 1. log in (stores the session cookie) — demo password: password123
curl -s -c cookies.txt -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@smash.test","password":"password123"}'

# 2. call a protected endpoint
curl -s -b cookies.txt localhost:3000/api/leaderboard/players
```
