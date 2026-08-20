# Ops runbook — secret rotation + pooled DB connection

Two pending production hardening tasks. The **pooled-DB code** ships in this PR;
the **rotation** steps are manual (no code). Do the Vercel env changes in §2
**before merging this PR**, or the deploy's `prisma migrate deploy` will fail.

---

## 1. Rotate leaked secrets (manual — do this)

Two secrets were pasted into chat during development and should be rotated.

### GitHub Personal Access Token
1. GitHub → **Settings → Developer settings → Personal access tokens** → revoke the
   old token used for pushing to `ArjitRout22/Smash`.
2. Create a fresh **fine-grained PAT** (Contents: read/write on that repo).
3. Re-authenticate the local remote (HTTPS) so pushes keep working:
   ```bash
   printf "protocol=https\nhost=github.com\n\n" | git credential reject   # drop the old one
   git push        # prompts for username + the NEW PAT; macOS keychain stores it
   ```

### Neon database password
1. Neon dashboard → **Roles** → reset the password for the app role.
2. Copy the new **pooled** and **direct** connection strings (see §2).
3. Update `DATABASE_URL` + `DIRECT_DATABASE_URL` in **Vercel → Env Vars**, then
   **redeploy**. (Also update your local `.env`.)

---

## 2. Pooled DB connection (perf + resilience)

Neon gives every project two endpoints:

| Purpose | Host | Vercel var |
| --- | --- | --- |
| Runtime queries (pooled, pgbouncer) | `…-pooler.…` | `DATABASE_URL` |
| Migrations (direct) | same host **without** `-pooler` | `DIRECT_DATABASE_URL` |

`prisma/schema.prisma` now uses `url` (pooled) for queries and `directUrl`
(direct) for migrations — pgbouncer can't run migrations.

### Do this BEFORE merging this PR
In **Vercel → Settings → Environment Variables** (Production):
1. Set **`DATABASE_URL`** to the **pooled** string, e.g.:
   ```
   postgresql://USER:PW@ep-xxxx-pooler.REGION.aws.neon.tech/DB?sslmode=require&pgbouncer=true&connection_limit=1
   ```
2. Add **`DIRECT_DATABASE_URL`** = the **direct** string (host without `-pooler`):
   ```
   postgresql://USER:PW@ep-xxxx.REGION.aws.neon.tech/DB?sslmode=require
   ```
3. **Then merge this PR.** The build runs `prisma migrate deploy` (uses
   `DIRECT_DATABASE_URL`) and the app serves queries over the pooled `DATABASE_URL`.

> If `DIRECT_DATABASE_URL` is missing when the PR merges, the build fails safely
> (no partial deploy) with `Environment variable not found: DIRECT_DATABASE_URL`.
> Set the var and redeploy.

### Local dev
Set `DIRECT_DATABASE_URL` in `.env` to the **same** value as `DATABASE_URL`
(local Postgres has no pooler). See `.env.example`.

### Rollback
Revert this PR's `schema.prisma` change (drop the `directUrl` line) and redeploy;
`DATABASE_URL` alone (direct endpoint) keeps working.
