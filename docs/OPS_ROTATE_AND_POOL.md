# Ops: rotate secrets & enable pooled Postgres

Short runbook for two related ops tasks. All steps are done in your own
accounts (GitHub / Neon / Vercel) — nothing here runs automatically.

## A. Rotate the GitHub PAT (local push token)

The token is only used for local HTTPS pushes (Vercel uses a GitHub App; CI uses
its own `GITHUB_TOKEN`).

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained** → new token, repo access **ArjitRout22/Smash**, permissions
   **Contents: R/W** + **Pull requests: R/W**. Copy it.
2. Clear the stored credential, then push (git will prompt for user `ArjitRout22`
   + the new token as the password):
   ```bash
   printf "protocol=https\nhost=github.com\n\n" | git credential-osxkeychain erase
   git push
   ```
3. Revoke the old token in GitHub once the push works.

## B. Rotate the Neon password

1. [Neon console](https://console.neon.tech) → **smash** → **Roles** → **Reset
   password**. Copy the new password.
2. **Connection Details** → copy both strings (the "Pooled connection" toggle):
   - **Pooled** — host contains `-pooler`.
   - **Direct** — same host **without** `-pooler`.
3. Update Vercel `DATABASE_URL` (see C) and **redeploy**. The old password dies
   as soon as the reset is saved.

## C. Enable pooled Postgres (latency fix)

Runtime queries use the **pooled** endpoint; migrations (`prisma migrate deploy`,
run during the build) use the **direct** endpoint — PgBouncer can't run
migrations. The schema wires this via `directUrl` (already in `prisma/schema.prisma`).

**Order matters** — set the Vercel vars *before* this code is on `main`, or the
next deploy's migration step fails.

1. Vercel → project **Smash** → **Settings → Environment Variables**
   (scope: Production **and** Preview):
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | pooled string + `&pgbouncer=true&connection_limit=1` |
   | `DIRECT_DATABASE_URL` | direct string |
2. Merge the `directUrl` PR.
3. **Redeploy** (Vercel → Deployments → Redeploy, or push to `main`).
4. Verify: log in, load the dashboard, submit a score.

Local dev & CI use the same URL for both vars (no pooler); see `.env.example`.

## Optional: move the function region closer to Neon

Neon is `ap-southeast-1` (Singapore). If the Vercel functions run in the US, each
query still crosses the Pacific. Setting the Vercel project's function region to
Singapore removes the biggest remaining latency. (Serverless region setting;
does not require code changes.)
