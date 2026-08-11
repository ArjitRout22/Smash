# Smash — Setup & Operations Runbook

The **complete, first-to-last** guide: how the app was built, deployed, put on a
custom domain, and wired for email — plus how to operate it going forward. If
you're reading this in the future to remember "how did we do X?", start here.

Companion docs: [README](../README.md) · [ARCHITECTURE](ARCHITECTURE.md) ·
[DATABASE](DATABASE.md) (ERD) · [API](API.md) · [DEPLOYMENT](DEPLOYMENT.md) ·
[PROJECT_HISTORY](PROJECT_HISTORY.md).

**Live:** https://smashhero.app · **Repo:** https://github.com/ArjitRout22/Smash
· **Host:** Vercel · **DB:** Neon Postgres · **Email:** Resend.

---

## 0. What the stack is

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, TypeScript) — frontend + API routes in one repo |
| ORM / DB | Prisma + PostgreSQL |
| Auth | Email + password (scrypt hashing), JWT session cookies, RBAC, multi-tenant |
| Email | Resend (password reset + email verification) via an `EmailProvider` abstraction |
| Hosting | Vercel (auto-deploys `main`, auto-runs migrations on build) |
| Database host | Neon (serverless Postgres, free tier) |
| Domain | GoDaddy-registered `smashhero.app`, DNS pointed at Vercel |
| CI | GitHub Actions (typecheck, lint, tests, build on every push) |

---

## 1. Prerequisites (local machine)

- **Node 20+** and **npm**
- **PostgreSQL** for local dev. This project was built on a Mac without Docker,
  using Homebrew Postgres:
  ```bash
  brew install postgresql@16
  export PATH=/opt/homebrew/opt/postgresql@16/bin:$PATH
  initdb -D /tmp/pgdata -U badminton --auth=trust
  LC_ALL=C pg_ctl -D /tmp/pgdata -o "-p 5432" start    # ⚠️ LC_ALL=C avoids a macOS start error
  createdb -h localhost -p 5432 -U badminton badminton
  ```
  Alternatives: `docker compose up -d db` (a `docker-compose.yml` is included), or
  any managed Postgres (Neon/Supabase).

---

## 2. Local development from scratch

```bash
# 1. get the code
git clone https://github.com/ArjitRout22/Smash.git && cd Smash
npm install

# 2. configure env
cp .env.example .env
#   then edit .env — at minimum set DATABASE_URL + SESSION_SECRET (see §3)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # → SESSION_SECRET

# 3. create the schema + demo data
npm run db:migrate      # applies prisma/migrations
npm run db:seed         # demo users/players/a played public tournament

# 4. run it
npm run dev             # http://localhost:3000
```

**Demo logins (dev only, password `password123`):** `admin@smash.test` (ADMIN),
`organizer@smash.test`, `player@smash.test`. Never run `db:seed` against prod.

Useful scripts: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
`npm run db:reset` (drops + re-migrates + re-seeds), `npm run create:admin`.

---

## 3. Environment variables (complete list)

Set these in `.env` locally and in **Vercel → Settings → Environment Variables**
for production. `.env.example` is the committed template. **Never commit secrets.**

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string (Neon in prod) |
| `SESSION_SECRET` | ✅ | ≥32-char random secret signing session JWTs |
| `APP_URL` | ✅ (prod) | Public base URL, e.g. `https://smashhero.app`. **Used in password-reset + verification email links — must be the real domain or the links break.** |
| `NODE_ENV` | auto on Vercel | `development` / `production` |
| `SESSION_TTL_SECONDS` | default 7d | Session lifetime |
| `DEFAULT_PHONE_REGION` | default `IN` | Region for parsing optional player phone numbers |
| `EMAIL_PROVIDER` | default `auto` | `auto` (Resend if a key is present, else console) / `console` / `resend` |
| `RESEND_API_KEY` | for real email | Resend API key (`re_…`) |
| `EMAIL_FROM` | for real email | Sender, e.g. `Smash <no-reply@smashhero.app>` |
| `PASSWORD_RESET_TTL_SECONDS` | default 1h | Reset link validity |

Generate secrets: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

---

## 4. GitHub (source + auto-deploy trigger)

1. Create an **empty** repo (no README/gitignore/license) — this project's is
   `ArjitRout22/Smash`.
2. Push:
   ```bash
   git remote add origin https://github.com/ArjitRout22/Smash.git
   git branch -M main
   git push -u origin main
   ```
3. **Auth gotcha we hit:** this Mac's SSH key authenticates as a *different*
   GitHub user, so SSH pushes to `ArjitRout22/*` fail. We push over **HTTPS**
   with a Personal Access Token stored in the macOS keychain (Contents: read/write
   on the repo). If a push says *"Password authentication is not supported"*, the
   stored token is stale — create a fresh fine-grained PAT and re-authenticate.

Every push to `main` triggers a Vercel deploy and the CI workflow.

---

## 5. Database — Neon (production Postgres)

1. Sign up at **neon.tech** (free, GitHub login).
2. Create a project (we used region **ap-southeast-1 / Singapore**).
3. Copy the **connection string** (`postgresql://…?sslmode=require`). Prefer the
   **direct** (non-`-pooler`) endpoint — it runs migrations cleanly.
4. This becomes `DATABASE_URL` in Vercel.

> **Shell gotcha:** the URL ends in `?sslmode=require`; in zsh the `?` triggers
> globbing. Always **quote** it: `DATABASE_URL="postgresql://…?sslmode=require"`.

---

## 6. Deploy — Vercel

1. Sign up at **vercel.com** with GitHub → **Add New → Project** → import
   `ArjitRout22/Smash`. Framework autodetects **Next.js**.
2. Add **Environment Variables** (Production) — at least `DATABASE_URL`,
   `SESSION_SECRET`, `APP_URL`, `DEFAULT_PHONE_REGION` (and later the Resend vars).
3. **Deploy.** The build pipeline is:
   ```
   postinstall → prisma generate
   build       → prisma migrate deploy && next build
   ```
   So **migrations run automatically on every deploy** — no manual DB steps.
4. HTTPS is automatic. Create your admin (see §9).

To change env vars later: edit them in Vercel → **Redeploy** for them to take effect.

---

## 7. Custom domain — GoDaddy → Vercel

The domain `smashhero.app` was registered at GoDaddy; DNS points at Vercel.

1. **Vercel → project → Settings → Domains → Add** → `smashhero.app`. Vercel shows
   the DNS records it needs.
2. **GoDaddy → Manage DNS** → set:
   - **A record**, name `@` → **`76.76.21.21`** (Vercel's apex IP)
   - **CNAME**, name `www` → **`cname.vercel-dns.com`** (or leave `www → @`)
   - Turn **off** any GoDaddy Parking/Forwarding for the domain.
   - Leave NS / SOA / `_domainconnect` / `_dmarc` records alone.
3. Vercel verifies (minutes) and **auto-issues the SSL cert**. `.app` is
   HTTPS-only (HSTS) — Vercel handles it; no action needed.
4. Vercel made **`www.smashhero.app`** the primary; the apex `smashhero.app`
   **308-redirects** to it (browsers follow this fine, incl. POSTs).
5. Set `APP_URL` in Vercel to the domain and **redeploy**.

---

## 8. Email — Resend (password reset + email verification)

The app sends two emails: **password reset** and **email confirmation on signup**.
Both go through `src/lib/email/provider.ts` — `console` (logs, dev) or `resend`.

**One-time Resend setup so emails deliver from your domain:**
1. Sign up at **resend.com** → **API Keys → Create** → copy `re_…`.
2. **Domains → Add Domain** → `smashhero.app`. Resend shows DNS records:
   - **TXT** `resend._domainkey` (DKIM)
   - **MX** `send` → `feedback-smtp.…amazonses.com` and **TXT** `send` (SPF)
3. Add those in **GoDaddy → Manage DNS** (they don't conflict with your `@`
   record or your mailbox's MX). Wait until Resend shows **Verified** ✅.
4. In **Vercel → Env Vars** set:
   - `RESEND_API_KEY = re_…`
   - `EMAIL_FROM = Smash <no-reply@smashhero.app>` (or `arjit@smashhero.app`)
   - (`EMAIL_PROVIDER=auto` picks Resend automatically once the key is present.)
   → **Redeploy**.

**Behaviour & gotchas:**
- Before Resend is configured, the app uses the **console provider** — no email is
  sent (links are logged to the Vercel function logs), and password reset still
  returns `200` (delivery failures are swallowed + logged, never a 500, so account
  existence isn't leaked).
- With the default `onboarding@resend.dev` sender, Resend only delivers to **your
  own** Resend-account email. To email arbitrary public users you **must verify a
  domain** (the steps above) and set `EMAIL_FROM` to that domain.
- Verify delivery: trigger `POST /api/auth/forgot-password {email}` and check the
  recipient inbox, or Resend → **Logs**.

---

## 9. Auth & signup configuration

- **Model:** email + password. Passwords hashed with Node `scrypt`
  (`src/lib/auth/password.ts`). Sessions are JWT cookies + a revocable `Session`
  row. RBAC roles: `ADMIN` (platform), `ORGANIZER`, `PLAYER`
  (`src/lib/auth/permissions.ts`).
- **Signup (`POST /api/auth/register`)** creates the user, their **own workspace
  (Organization)** as **ORGANIZER**, and a linked Player profile — then sends an
  **email-verification** link. **Duplicate emails are rejected** (409 + DB unique
  constraint); the signup form switches to login on that error.
- **Email verification:** unverified users can still use the app but see a banner
  with a **Resend** button; `/verify-email?token=…` confirms.
- **Password reset:** `/forgot-password` → email link → `/reset-password?token=…`
  (single-use, revokes sessions).
- **Create a platform admin** (no demo seed in prod):
  ```bash
  DATABASE_URL="<neon-url>" npm run create:admin -- you@example.com "a-strong-password" "Your Name"
  ```

### Multi-tenant model (important)
Every signup gets an **isolated workspace**. Enforcement lives in
`src/lib/auth/tenancy.ts` (`orgFilter` on lists, `assertOrgAccess` on
get/mutate-by-id → blocks cross-tenant IDOR). Player **profiles are a global
directory** (viewable by anyone; editing stays workspace-scoped). Tournaments can
be **public** — discoverable + joinable via a request→accept flow — while private
ones stay isolated.

---

## 10. Common operations

| Task | How |
| --- | --- |
| Ship a change | `git push origin main` → Vercel auto-deploys + migrates |
| Add a DB migration | edit `prisma/schema.prisma` → `npm run db:migrate` (dev) → commit → push (prod migrates on deploy) |
| Change an env var | edit in Vercel → **Redeploy** |
| Create/reset an admin | `DATABASE_URL=<neon> npm run create:admin -- email pw "Name"` |
| Run migrations manually vs a DB | `DATABASE_URL=<url> npx prisma migrate deploy` |
| Inspect prod data | Neon dashboard → **SQL Editor** |
| Run tests | `npm test`; integration: `RUN_DB_TESTS=1 DATABASE_URL=<test-db> npx vitest run tests/integration` |

**Rotate a secret** (e.g. a leaked DB password): reset it at the provider
(Neon → Roles) → update `DATABASE_URL` in Vercel → **Redeploy**.

---

## 11. Verification smoke tests (curl)

```bash
D=https://www.smashhero.app
# login
curl -s -c ck.txt -X POST $D/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"..."}'
# protected read
curl -s -b ck.txt $D/api/auth/me
# register (creates own workspace as ORGANIZER)
curl -s -X POST $D/api/auth/register -H 'content-type: application/json' \
  -d '{"name":"Test","email":"t@example.com","password":"password123"}'
# password reset (always 200)
curl -s -X POST $D/api/auth/forgot-password -H 'content-type: application/json' \
  -d '{"email":"you@example.com"}'
```

---

## 12. Troubleshooting (gotchas we actually hit)

| Symptom | Cause / fix |
| --- | --- |
| `zsh: no matches found` running a `DATABASE_URL=…?sslmode=require` command | quote the URL |
| Local Postgres won't start on macOS (`postmaster became multithreaded`) | start with `LC_ALL=C` |
| `git push` → *"Password authentication is not supported"* | stale/absent PAT — create a fine-grained PAT, store in keychain, retry (SSH key here is a different GitHub user) |
| `prisma migrate dev` refuses non-interactively | generate SQL with `prisma migrate diff --from-url … --to-schema-datamodel … --script` into a new `prisma/migrations/<ts>_name/migration.sql`, then `prisma migrate deploy` |
| `prisma migrate reset` blocked ("invoked by AI") | it's a safety guard; only reset **dev** DBs, with explicit consent |
| `smashhero.app` returns 308 | expected — apex redirects to primary `www.smashhero.app`; browsers/`curl -L` follow |
| Reset emails not delivered but API returns 200 | Resend not verified / `EMAIL_FROM` not on a verified domain — see §8 (failures are logged, not 500) |
| `/api/tournaments/discover` unexpectedly `NOT_FOUND` | you used `discover&search=` — needs `discover?search=` |

---

## 13. Security checklist

- [ ] Strong, unique `SESSION_SECRET` in prod (never the dev value).
- [ ] Rotate any secret ever pasted into chat/logs (GitHub PAT, Neon password).
- [ ] Served over HTTPS (Vercel does this).
- [ ] Real admin via `create:admin`; demo seed **not** run in prod.
- [ ] Delete throwaway test rows:
      `delete from "User" where email like 'probe-%' or email like '%@t.test' or email like 'deploy-check-%';`
- [ ] For scale: swap the in-memory rate limiter for Redis; use Neon pooled
      connections; verify a Resend domain for public email.
