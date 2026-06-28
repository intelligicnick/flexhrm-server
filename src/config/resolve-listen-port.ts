import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

function loadHostingerEnvFiles(): void {
  const roots = new Set<string>([
    process.cwd(),
    path.join(process.cwd(), '..'),
    path.join(__dirname, '..', '..'),
  ]);
  for (const root of roots) {
    const envPath = path.join(root, '.env');
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  }
}

/** Hostinger may pass `--port=$PORT` in the Start command when Entry file bypasses npm. */
function portFromArgv(): number | undefined {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--port=')) {
      const n = Number(arg.slice('--port='.length));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

/**
 * Hostinger injects PORT at runtime. Do not hardcode 3000/3001 in production —
 * falling back to a fixed port when PORT is unset causes 408 from the reverse proxy.
 */
export function resolveListenPort(isProduction: boolean): number {
  if (isProduction) {
    loadHostingerEnvFiles();
  }

  const fromArgv = portFromArgv();
  if (fromArgv) {
    process.env.PORT = String(fromArgv);
    return fromArgv;
  }

  const port = Number(process.env.PORT);
  if (Number.isFinite(port) && port > 0) {
    return port;
  }

  if (isProduction) {
    const portKeys = Object.keys(process.env).filter((k) => /port/i.test(k));
    console.error(
      '[Flex HRM] PORT is not set (cwd=%s). Hostinger reverse proxy cannot route traffic → 408.\n' +
        '  Fix in hPanel → Settings:\n' +
        '    Start command: npm start -- --port=$PORT\n' +
        '    (or: node dist/server.js --port=$PORT)\n' +
        '  Clear manual PORT=3000 from env vars. Do not use Entry-only launch without $PORT.\n' +
        `  Env keys containing "port": ${portKeys.join(', ') || '(none)'}`,
    );
    process.exit(1);
  }

  return 3001;
}
