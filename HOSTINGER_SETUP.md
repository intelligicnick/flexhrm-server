# Hostinger — Backend API Setup (Flex HRM)

Deploy the NestJS API (`flexhrm-server`) on **Hostinger Node.js Web Apps** and verify it with the public health endpoint.

## Live URLs

| Service | URL |
|---------|-----|
| **API (this guide)** | https://mediumseagreen-chimpanzee-998149.hostingersite.com/api |
| **Health check** | https://mediumseagreen-chimpanzee-998149.hostingersite.com/api/health |
| **Frontend (CORS)** | https://greenyellow-woodpecker-750354.hostingersite.com |

Repository: https://github.com/intelligicnick/flexhrm-server

---

## 403 Forbidden — fix this first

**Pushing to GitHub does not start the API on Hostinger.** A 403 means the site is a static/empty website instead of a running **Node.js Web App**, or the last deploy never published files.

If `https://mediumseagreen-chimpanzee-998149.hostingersite.com` (or `/api/health`) shows **403 Forbidden**, the app is **not deployed as a Node.js Web App** or the deployment never published files.

| Symptom | Likely cause |
|---------|----------------|
| **403** on `/` and `/api/health` | Site created as a **Website** (static/PHP) instead of **Node.js Web App**; or Git deploy output directory is wrong |
| **503** | Node.js app exists but process is **not running** (crash, missing env, failed build) |
| **502** | App crashed after start — check Logs |

### Fix 403 on the API app (mediumseagreen-chimpanzee)

1. **hPanel → Websites** — open the **mediumseagreen-chimpanzee-998149** site.
2. Confirm the site type is **Node.js Web App** (not “Website” / static hosting). If it is static-only, create a new **Node.js Web App** and connect the `flexhrm-server` GitHub repo.
3. **Build command:** `npm install && npm run build`  
   **Start command:** `node dist/server.js`  
   **Entry / output file:** `dist/server.js`
4. Add required env vars (see section 2), **Save**, then **Redeploy**.
5. Verify:

   ```bash
   curl -s https://mediumseagreen-chimpanzee-998149.hostingersite.com/api/health
   ```

If the **frontend** (greenyellow) also shows 403, that is a separate static site — see [flexhrm-client HOSTINGER_SETUP.md](https://github.com/intelligicnick/flexhrm-client/blob/main/HOSTINGER_SETUP.md).

---

## 408 Request Time-out — fix this first (API not responding)

If `https://mediumseagreen-chimpanzee-998149.hostingersite.com` (or `/api/health`) shows **408 Request Time-out**, Hostinger’s proxy **cannot reach your Node.js process**. The app is not listening on the port the proxy expects (or it crashed on startup).

| Symptom | Likely cause |
|---------|----------------|
| **408** on `/` and `/api/health` | Node process not running, wrong **PORT** in hPanel, or startup crash |
| **408** only on slow routes | Rare — usually still means the app never started |

### Fix 408 on the API app (mediumseagreen-chimpanzee)

1. **Do not set `PORT` manually in hPanel** — Hostinger injects `PORT` at runtime. The app uses `process.env.PORT || 3000`.  
   **Start command:** `node dist/server.js`  
   **Build command:** `npm install && npm run build`  
   **Output folder:** `dist`

2. **hPanel → Node.js Web Apps → mediumseagreen-chimpanzee → Logs / Deployments**  
   Look for:
   - `Missing required environment variable: MONGODB_URI` or `CORS_ORIGINS` → add them (see section 2)
   - `Flex HRM API running on http://0.0.0.0:...` → success (port should match injected `PORT` when set)

3. **Confirm build settings** (must match exactly):

   | Setting | Value |
   |---------|-------|
   | **Build command** | `npm install && npm run build` |
   | **Start command** | `node dist/server.js` |
   | **Entry file** | `server.js` |
   | **Output directory** | `dist` |

4. **Redeploy**, then verify:

   ```bash
   curl -s https://mediumseagreen-chimpanzee-998149.hostingersite.com/api/health/live
   curl -s https://mediumseagreen-chimpanzee-998149.hostingersite.com/api/health | python3 -m json.tool
   ```

   `/api/health/live` returns `{"status":"ok"}` as soon as the process is up (no MongoDB check). `/api/health` confirms DB connectivity.

---

## 503 Service Unavailable

If `https://mediumseagreen-chimpanzee-998149.hostingersite.com` shows **503**, the Node.js process is **not running**. Pushing code to GitHub does not restart the app — you must fix the Hostinger deployment.

### Quick checks (in order)

1. **Open hPanel → Node.js Web Apps → mediumseagreen-chimpanzee app → Deployments / Logs**  
   Look for red errors. Common messages:
   - `Missing required environment variable: MONGODB_URI` → add `MONGODB_URI` in Environment variables
   - `Missing required environment variable: CORS_ORIGINS` → add `CORS_ORIGINS=https://greenyellow-woodpecker-750354.hostingersite.com`
   - `Failed to build` / `JavaScript heap out of memory` → add `NODE_OPTIONS=--max-old-space-size=4096` and redeploy
   - `Cannot find module` / `dist/server.js` not found → build failed; check build command below

2. **Confirm build settings** (must match exactly):

   | Setting | Value |
   |---------|-------|
   | **Build command** | `npm install && npm run build` |
   | **Start command** | `node dist/server.js` |
   | **Output directory** | `dist` |
   | **Entry file** | `server.js` |

3. **Confirm required env vars** are saved, then click **Redeploy** (not just Restart if build failed).

4. **Verify** after deploy finishes:

   ```bash
   curl -s https://mediumseagreen-chimpanzee-998149.hostingersite.com/api/health
   ```

   Until this returns JSON with `"ready": true`, the frontend login will fail.

---

## 1. Hostinger app settings

In **hPanel → Websites → Node.js Web Apps** (or **Deployments**), connect the `flexhrm-server` GitHub repo and use:

| Setting | Value |
|---------|-------|
| **Branch** | `main` |
| **Root directory** | `/` (repo root — this is the backend project) |
| **Build command** | `npm install && npm run build` |
| **Start command** | `node dist/server.js` |
| **Output / root file** | `dist/server.js` |
| **Node.js version** | 20 or 22 |

`npm run build` compiles TypeScript and writes `dist/server.js` (the Hostinger entry file).

> Do **not** upload a `.env` file to Hostinger. Secrets go in **hPanel → Environment variables** only.  
> Use [`.env.hostinger.example`](./.env.hostinger.example) as a copy-paste checklist (fill in your real values in hPanel).

---

## 2. Required environment variables

In **hPanel → your API app → Environment variables**, add:

| Variable | Example value | Notes |
|----------|---------------|-------|
| `NODE_ENV` | `production` | Required |
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/flexhrm?...` | MongoDB Atlas or other hosted MongoDB |
| `CORS_ORIGINS` | `https://greenyellow-woodpecker-750354.hostingersite.com` | Frontend origin (no trailing slash) |
| `SEED_ON_STARTUP` | `false` | Set `true` only on first deploy to an empty database |
| `DEFAULT_ADMIN_PASSWORD` | `change-me-before-deploy` | Only used when seeding an empty DB |

Optional but recommended:

| Variable | Example |
|----------|---------|
| `IMAGEKIT_PUBLIC_KEY` | From [ImageKit dashboard](https://imagekit.io/dashboard/developer/api-keys) |
| `IMAGEKIT_PRIVATE_KEY` | Private key |
| `IMAGEKIT_URL_ENDPOINT` | `https://ik.imagekit.io/your_id` |

**Rules for hPanel values**

- Do **not** wrap values in quotes (`"..."`) — paste the raw value only.
- No spaces before or after `=`.
- After changing env vars, click **Save** and **Redeploy / Restart** the app.

---

## 3. Verify deployment with curl

From your Mac terminal (or any machine with internet):

```bash
curl https://mediumseagreen-chimpanzee-998149.hostingersite.com/api/health
```

Pretty-printed:

```bash
curl -s https://mediumseagreen-chimpanzee-998149.hostingersite.com/api/health | python3 -m json.tool
```

### Expected response (healthy)

```json
{
  "status": "healthy",
  "storage": "mongodb",
  "ready": true,
  "database": "157 employees",
  "smtpConfigured": true
}
```

| Field | Meaning |
|-------|---------|
| `status` | `healthy` = API is up; `degraded` = MongoDB not connected |
| `ready` | `true` = MongoDB connection is active |
| `database` | Employee count (confirms DB is reachable) |
| `smtpConfigured` | `true` = SMTP env vars are set (password-reset emails can be sent) |

### What a bad response means

| Response | Likely cause |
|----------|--------------|
| `ready: false` or connection error | Wrong `MONGODB_URI`, Atlas IP allowlist, or DB user/password |
| `smtpConfigured: false` | SMTP variables missing in hPanel (see section 4) |
| `502` / `503` / timeout | App not started, build failed, or wrong start command |
| **408** | **Remove `PORT` from hPanel** — let Hostinger inject it; check deploy logs for crash |
| `404` on `/api/health` | Wrong deploy root or app not running NestJS build |

---

## 4. SMTP (password-reset emails)

Password reset emails are sent only when SMTP is configured **on the API server** (this Hostinger app).

### Option A — Gmail (App Password)

1. Enable **2-Step Verification** on the Google account: https://myaccount.google.com/security  
2. Create an **App Password**: https://myaccount.google.com/apppasswords  
   - App: **Mail** → Device: **Other** → name it `Flex HRM`  
3. Add these in **hPanel → Environment variables**:

| Variable | Value |
|----------|-------|
| `SMTP_SERVICE` | `gmail` |
| `SMTP_USER` | `your-gmail@gmail.com` |
| `SMTP_PASS` | `abcd efgh ijkl mnop` (16-char App Password, spaces optional) |
| `SMTP_FROM` | `Flex HRM <your-gmail@gmail.com>` |

`SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE` are optional for Gmail — nodemailer uses the `gmail` service preset.

4. **Redeploy** the API app.
5. Confirm SMTP is enabled:

```bash
curl -s https://mediumseagreen-chimpanzee-998149.hostingersite.com/api/health | python3 -m json.tool
```

Look for `"smtpConfigured": true`.

6. Test forgot-password on the live frontend:  
   https://greenyellow-woodpecker-750354.hostingersite.com → **Forgot password?**

The admin account must have a **recovery email** saved in **Admin → My Info**.

### Option B — Hostinger mailbox

If Gmail is blocked from Hostinger’s network, use your Hostinger email:

| Variable | Value |
|----------|-------|
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | `info@yourdomain.com` |
| `SMTP_PASS` | your mailbox password |
| `SMTP_FROM` | `Flex HRM <info@yourdomain.com>` |

### Option C — Brevo (Sendinblue)

| Variable | Value |
|----------|-------|
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` |
| `SMTP_USER` | your Brevo SMTP login |
| `SMTP_PASS` | your Brevo SMTP key |
| `SMTP_FROM` | verified sender in Brevo |

### Test SMTP locally before deploying

On your Mac (with the same values in `backend/.env`):

```bash
cd backend
npm run test:smtp your-recovery-email@gmail.com
```

You should see `SMTP connection OK` and `Test email sent to ...`.

---

## 5. Deploy / update workflow

1. Push changes to `main` on https://github.com/intelligicnick/flexhrm-server  
2. Hostinger auto-deploys (or trigger **Redeploy** in hPanel)  
3. Wait for build to finish (usually 1–3 minutes)  
4. Run the health curl:

```bash
curl -s https://mediumseagreen-chimpanzee-998149.hostingersite.com/api/health | python3 -m json.tool
```

5. If you changed environment variables, restart/redeploy even when code did not change.

---

## 6. Troubleshooting

| Problem | What to check |
|---------|----------------|
| Health returns `ready: false` | `MONGODB_URI` in hPanel; MongoDB Atlas → Network Access → allow `0.0.0.0/0` (or Hostinger egress IPs) |
| `smtpConfigured: false` | All of `SMTP_USER`, `SMTP_PASS`, and (`SMTP_SERVICE` or `SMTP_HOST`) set in hPanel; redeploy after saving |
| Forgot-password shows code on screen, no email | `smtpConfigured` is false, or Gmail blocked — try Hostinger/Brevo SMTP; check spam folder |
| CORS errors in browser | `CORS_ORIGINS` must exactly match frontend URL (https, no trailing slash) |
| Build fails on Hostinger | Check deploy logs in hPanel; run `npm run build` locally to reproduce |
| **408 Request Time-out** | Delete `PORT` from hPanel env; redeploy; check logs for missing `MONGODB_URI` / `CORS_ORIGINS` |
| Data missing after redeploy | MongoDB data lives in Atlas — not on Hostinger disk. Disk under `backend/data/` is ephemeral. |
| `E11000 duplicate key ... roles ... HR Assistant` | DB has legacy data or indexes from pre–multi-tenant schema. Redeploy latest backend (auto-fixes on startup). Or run `npm run migrate:tenant-indexes` against production MongoDB. Set `SEED_ON_STARTUP=false` after first successful deploy. |
| `Duplicate schema index on expiresAt` | Harmless warning on older builds; fixed in latest backend. |

### Logs

In hPanel, open your Node.js app → **Logs** / **Deployments** and look for:

- `Flex HRM API running on http://0.0.0.0:...`
- `SMTP ready (...)` — SMTP verified at startup
- `SMTP verification failed: ...` — wrong credentials or blocked port
- `SMTP not configured` — env vars missing

---

## 7. Quick checklist

- [ ] GitHub repo `flexhrm-server` connected in Hostinger  
- [ ] Build: `npm install && npm run build`  
- [ ] Start: `node dist/server.js`  
- [ ] `MONGODB_URI` set in hPanel  
- [ ] `CORS_ORIGINS` = frontend Hostinger URL  
- [ ] `curl .../api/health` → `"status": "healthy"`, `"ready": true`  
- [ ] SMTP vars set → `"smtpConfigured": true`  
- [ ] Forgot-password email received (check spam)  
- [ ] `DEFAULT_ADMIN_PASSWORD` changed from default on production DB  

---

## Related docs

- [README.md](./README.md) — local development  
- [flexhrm-client README](https://github.com/intelligicnick/flexhrm-client/blob/main/README.md) — frontend Hostinger app (separate deployment)  
- [.env.example](./.env.example) — all supported environment variables  
