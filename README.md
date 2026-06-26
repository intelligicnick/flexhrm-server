# Flex HRM — Backend

NestJS 11 REST API with MongoDB. Runs on port `3001` under `/api`.

**Repository:** https://github.com/intelligicnick/flexhrm-server

## Live deployment

| Service | URL |
|---------|-----|
| **API** | https://midnightblue-partridge-476451.hostingersite.com/api |
| **Frontend (CORS)** | https://greenyellow-woodpecker-750354.hostingersite.com |

Production URLs are defined in `src/config/deploy-urls.ts` and overridden via environment variables.

## Quick start

```bash
cp .env.example .env
npm install
npm run migrate:json   # optional: import ../frontend/*-db.json
npm run start:dev
```

API: [http://localhost:3001/api](http://localhost:3001/api)

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/flexhrm` | MongoDB connection |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed frontend origins |
| `SEED_ON_STARTUP` | `true` | Seed admin/roles if DB is empty |
| `DEFAULT_ADMIN_PASSWORD` | `admin123` | Initial admin password |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Watch mode |
| `npm run build` | Compile TypeScript |
| `npm run start:prod` | Production server |
| `npm run migrate:json` | Import legacy JSON → MongoDB |

## Production (Hostinger)

| Check | Command |
|-------|---------|
| API health | `curl https://midnightblue-partridge-476451.hostingersite.com/api/health` |
| Pretty JSON | `curl -s https://midnightblue-partridge-476451.hostingersite.com/api/health \| python3 -m json.tool` |

Full step-by-step guide (env vars, SMTP, deploy, troubleshooting): **[HOSTINGER_SETUP.md](./HOSTINGER_SETUP.md)**

Set `MONGODB_URI` to a managed instance (e.g. MongoDB Atlas). Change `DEFAULT_ADMIN_PASSWORD` before first deploy. Never commit `.env` — use hPanel environment variables on Hostinger.
