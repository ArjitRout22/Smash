# Deployment — going live

This app is a standard **Next.js 16 + Prisma + PostgreSQL** project. The
recommended free path is **Neon** (Postgres) + **Vercel** (app). Alternatives
(Railway, Docker/VPS) are at the bottom.

The build pipeline is already wired for hosting:
- `postinstall` → `prisma generate` (client is built on every install)
- `build` → `prisma migrate deploy && next build` (migrations run on deploy)

So once `DATABASE_URL` is set on the host, deploys migrate + build automatically.

---

## Recommended: Neon + Vercel (free, ~15 min)

### 1. Create the database (Neon)
1. Sign up at **neon.tech** (free, no card).
2. Create a project → copy the **connection string** (looks like
   `postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require`).
3. Prefer Neon's **Pooled** connection string for a serverless host like Vercel
   (it says "Pooled connection"). Keep it handy — it's your `DATABASE_URL`.

### 2. Put the code on GitHub
```bash
cd ~/Documents/BAD
git add -A && git commit -m "Ready for deploy"      # (already committed for you)
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

### 3. Deploy on Vercel
1. Sign up at **vercel.com** with your GitHub account.
2. **Add New → Project →** import your repo. Framework autodetects **Next.js**.
3. Add **Environment Variables** (Production):

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | your Neon connection string |
   | `SESSION_SECRET` | a 48-byte hex secret (generate below) |
   | `APP_URL` | `https://<your-vercel-domain>.vercel.app` |
   | `DEFAULT_PHONE_REGION` | `IN` (or your country) |

   `NODE_ENV=production` is set by Vercel automatically.

   Generate a secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
4. Click **Deploy**. The build runs `prisma migrate deploy` (creating all
   tables) then `next build`. HTTPS is automatic — your secure session cookies
   work out of the box.

### 4. Create your admin login
The demo seed (`password123`) is for local dev only — **don't run it in prod**.
Create a real admin against the production DB from your machine:
```bash
DATABASE_URL="<your-neon-url>" npm run create:admin -- you@example.com "a-strong-password" "Your Name"
```
Log in at `https://<your-domain>/login`. Done — you're live. 🎉

### 5. (Optional) custom domain
Vercel → Project → **Settings → Domains** → add your domain and follow the DNS
steps. Update `APP_URL` to match.

---

## Alternative A: Railway (app + DB in one place)
1. Sign up at **railway.app**, **New Project → Deploy from GitHub repo**.
2. **+ New → Database → PostgreSQL**. Railway injects `DATABASE_URL`.
3. Add `SESSION_SECRET`, `APP_URL`, `DEFAULT_PHONE_REGION` in the service's
   Variables. Railway runs the same build (migrations included).
4. Create your admin with the `create:admin` command (step 4 above), using the
   Railway `DATABASE_URL`.

## Alternative B: Docker / VPS
A `docker-compose.yml` (Postgres) is included for local use. For a VPS:
```bash
# on the server, with Node 20+ and a reachable Postgres
export DATABASE_URL=... SESSION_SECRET=... APP_URL=https://your.domain NODE_ENV=production
npm ci
npm run build           # runs prisma migrate deploy + next build
npm run create:admin -- you@example.com "a-strong-password" "Your Name"
npm run start           # serves on :3000 — put Nginx/Caddy in front for HTTPS
```
Use a process manager (pm2/systemd) and a reverse proxy that terminates TLS
(required for `Secure` cookies).

---

## Production checklist
- [ ] Strong, unique `SESSION_SECRET` (never the dev value).
- [ ] `DATABASE_URL` points to the production DB; migrations applied.
- [ ] `APP_URL` = your real HTTPS URL.
- [ ] Served over **HTTPS** (secure cookies).
- [ ] Real admin created via `create:admin`; demo seed **not** run.
- [ ] (Scale) Swap the in-memory rate limiter for a Redis-backed one; use Neon
      pooled connections. See README → Scalability notes.
```
