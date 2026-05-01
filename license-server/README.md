# SF30 V2.0 License Server

Minimal license server for the SF30 Chrome extension. Binds license keys to device fingerprints.

## Quick Start

```bash
cd license-server
cp .env.example .env
# Edit .env and set a strong API_TOKEN
npm install
npm start
```

Server runs on `http://localhost:3000`.

## Generate a License Key

### Option A: CLI (Zero dependencies — run anywhere)

```bash
node license-server/scripts/generate-key.js --fingerprint <HASH> --tier basic --days 30
```

Example:
```bash
node license-server/scripts/generate-key.js -f a1b2c3d4e5f6 -t pro -d 90
```

Output:
```
✅ License key generated

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Key:                sf30-ABCD-EFGH-IJKL-MNOP
Fingerprint:        a1b2c3d4e5f6
Tier:               pro
Expires:            2026-07-24
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Send this KEY to your customer:
    sf30-ABCD-EFGH-IJKL-MNOP

🗄️  Run this SQL on your license server database:

INSERT INTO licenses (key, fingerprint_hash, tier, created_at, expires_at, revoked)
VALUES ('sf30-ABCD-EFGH-IJKL-MNOP', 'a1b2c3d4e5f6', 'pro', 1715000000, 1717592000, 0);
```

**No `npm install` needed.** The generator is completely standalone.

### Option B: Web Admin

Start the server first:
```bash
cd license-server
npm install
npm start
```

Then open `http://localhost:3000/admin.html` in your browser.

1. Paste your admin API token
2. Paste the customer's fingerprint hash
3. Select tier (basic/pro)
4. Set expiry days
5. Click **Generate**
6. Copy the key and send it to your customer

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v2/activate` | First-time key activation | Key + fingerprint |
| POST | `/api/v2/validate` | Periodic re-verification | Key + fingerprint |
| GET | `/api/v2/revocations` | Revoked keys list | None (public, cacheable) |
| POST | `/api/admin/generate` | Generate new key (admin) | Bearer `API_TOKEN` |
| GET | `/admin.html` | Web admin panel | None (API protected by token) |
| GET | `/health` | Health check | None |

## Customer Workflow

```
Customer installs SF30 extension
        ↓
Customer opens popup → copies Device Fingerprint
        ↓
Customer sends fingerprint to you (Telegram/DM)
        ↓
You generate key bound to their fingerprint (CLI or web admin)
        ↓
You send the key back to customer
        ↓
Customer pastes key → clicks Verify → extension calls /activate
        ↓
Server verifies key ↔ fingerprint binding → unlocks extension
```

## Deployment

### Vercel (Recommended — Serverless)

#### Option A: Auto-Deploy via GitHub Actions (Recommended)

Every push to `main` that changes `license-server/**` files will automatically deploy to Vercel.

**One-time setup:**

1. **Link the project locally:**
   ```bash
   cd license-server
   npm install
   npm run vercel:link
   ```
   This creates `.vercel/project.json` with your `orgId` and `projectId`.

2. **Check readiness** (run anytime to see what's left):
   ```bash
   npm run deploy:check
   ```

3. **Add a database** in the Vercel dashboard: add a **Vercel Postgres** database (Neon). This automatically sets `POSTGRES_URL`.

4. **Set environment variables** in the Vercel dashboard (Project Settings → Environment Variables):
   - `API_TOKEN` — strong random secret for admin endpoints (generate with `openssl rand -base64 32`)
   - `DEFAULT_DAYS` — default license expiry (optional)

5. **Add GitHub secrets** (Repo Settings → Secrets and variables → Actions):
   - `VERCEL_TOKEN` — create at https://vercel.com/account/tokens
   - `VERCEL_ORG_ID` — copy from `license-server/.vercel/project.json`
   - `VERCEL_PROJECT_ID` — copy from the same file

6. **Push to main.** The workflow `.github/workflows/deploy-license-server.yml` handles the rest.

#### Option B: Manual CLI Deploy

Skip GitHub Actions and deploy manually whenever you want:

```bash
cd license-server
npm i -g vercel
vercel link          # one time
vercel --prod        # whenever you want to deploy
```

Make sure to add a Postgres database and set `API_TOKEN` in the Vercel dashboard.

**Database note:** Vercel uses Postgres automatically. Local development still uses SQLite.

### Railway (Free Tier)

1. Push this `license-server/` folder to a GitHub repo
2. Connect Railway to the repo
3. Set environment variables (`API_TOKEN`, `PORT`)
4. Deploy

### Render (Free Tier)

1. Create a new Web Service
2. Connect your GitHub repo
3. Set root directory to `license-server`
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add environment variables

### VPS (Full Control)

```bash
# On your server
git clone <your-repo>
cd license-server
npm install
cp .env.example .env
# Edit .env
npm start
```

Use `pm2` or `systemd` to keep it running.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_TOKEN` | **Yes** (production) | — | Bearer token for admin endpoints |
| `POSTGRES_URL` | Auto (Vercel) | — | Postgres connection (Vercel / serverless) |
| `DATABASE_URL` | No | — | Fallback Postgres connection string |
| `PORT` | No | 3000 | Server port (local only) |
| `DEFAULT_DAYS` | No | 30 | Default license expiry in days |
| `DB_PATH` | No | `./licenses.db` | SQLite database file (local only) |

## Security Notes

- Keep `API_TOKEN` secret. It protects the admin key generation endpoint.
- The web admin page stores your token in `localStorage` for convenience — use it on trusted devices only.
- On Vercel production, admin endpoints are blocked if `API_TOKEN` is not configured.

## Revoking a Key

### SQLite (local / Railway / Render / VPS)
```bash
sqlite3 licenses.db "UPDATE licenses SET revoked = 1 WHERE key = 'sf30-XXX';"
```

### Postgres (Vercel)
Use the Vercel Postgres dashboard or any Postgres client:
```sql
UPDATE licenses SET revoked = 1 WHERE key = 'sf30-XXX';
```

The extension checks the revocation list every few hours and disables revoked keys automatically.
