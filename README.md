# Flex HRM — Backend

NestJS 11 REST API with MongoDB. Runs on port `3001` under `/api`.

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

## Production

Set `MONGODB_URI` to a managed instance. Change `DEFAULT_ADMIN_PASSWORD` before first deploy.
