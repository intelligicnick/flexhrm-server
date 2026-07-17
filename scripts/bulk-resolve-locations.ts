/**
 * Bulk-resolve school locations (village-first + Google Places on server).
 *
 * Direct mode (uses local .env MongoDB + GOOGLE_PLACES_API_KEY):
 *   npx tsx scripts/bulk-resolve-locations.ts --district Purnia --block Amour
 *
 * API mode (calls deployed backend — Google key stays on Hostinger):
 *   RESOLVE_ADMIN_USER=admin RESOLVE_ADMIN_PASS=... \
 *   npx tsx scripts/bulk-resolve-locations.ts --mode api --all
 *
 * Logs append to scripts/logs/bulk-resolve-<timestamp>.log when --log-file is set (default).
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

type BlockJob = { district: string; block: string };

const DEFAULT_BLOCKS: BlockJob[] = [
  { district: 'Purnia', block: 'Amour' },
  { district: 'Purnia', block: 'Banmankhi' },
  { district: 'Madhepura', block: 'ALAMNAGAR' },
];

const API_BASE =
  process.env.RESOLVE_API_BASE?.trim() ||
  'https://mediumseagreen-chimpanzee-998149.hostingersite.com';

function parseArgs(argv: string[]) {
  const mode = argv.includes('--mode')
    ? String(argv[argv.indexOf('--mode') + 1] || 'direct')
    : argv.includes('--api')
      ? 'api'
      : 'direct';
  const all = argv.includes('--all');
  const skipExisting = !argv.includes('--replace');
  const district = argv.includes('--district')
    ? String(argv[argv.indexOf('--district') + 1] || '').trim()
    : '';
  const block = argv.includes('--block')
    ? String(argv[argv.indexOf('--block') + 1] || '').trim()
    : '';
  const schoolLimit = argv.includes('--limit')
    ? Math.min(5, Math.max(1, Number(argv[argv.indexOf('--limit') + 1]) || 2))
    : 2;
  const logFile =
    argv.includes('--log-file')
      ? String(argv[argv.indexOf('--log-file') + 1] || '')
      : path.join(
          __dirname,
          'logs',
          `bulk-resolve-${new Date().toISOString().replace(/[:.]/g, '-')}.log`,
        );
  return { mode, all, skipExisting, district, block, schoolLimit, logFile };
}

function jobsFromArgs(args: ReturnType<typeof parseArgs>): BlockJob[] {
  if (args.all) return DEFAULT_BLOCKS;
  if (args.district && args.block) {
    return [{ district: args.district, block: args.block }];
  }
  return DEFAULT_BLOCKS;
}

function createLogger(logFile: string) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const stream = fs.createWriteStream(logFile, { flags: 'a' });
  const log = (line: string) => {
    const msg = `[${new Date().toISOString()}] ${line}`;
    console.log(msg);
    stream.write(`${msg}\n`);
  };
  const close = () =>
    new Promise<void>((resolve) => {
      stream.end(resolve);
    });
  return { log, close };
}

async function loginApiSession(log: (s: string) => void): Promise<{
  cookieHeader: string;
  csrfToken: string;
}> {
  const user = String(process.env.RESOLVE_ADMIN_USER || 'admin').trim();
  const pass = String(
    process.env.RESOLVE_ADMIN_PASS || process.env.DEFAULT_ADMIN_PASSWORD || '',
  ).trim();
  if (!pass) {
    throw new Error(
      'Set RESOLVE_ADMIN_PASS (or DEFAULT_ADMIN_PASSWORD) for API mode login.',
    );
  }

  const captchaRes = await fetch(`${API_BASE}/api/auth/captcha`);
  if (!captchaRes.ok) {
    throw new Error(`Captcha fetch failed: ${captchaRes.status}`);
  }
  const captcha = (await captchaRes.json()) as { id?: string; question?: string };
  const id = String(captcha.id || '');
  const math = /^math:(\d+)\+(\d+)$/.exec(id);
  if (!math) throw new Error(`Unexpected captcha id: ${id}`);
  const answer = String(Number(math[1]) + Number(math[2]));

  log(`Logging in as ${user} on ${API_BASE}…`);
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: user,
      password: pass,
      captchaId: id,
      captchaAnswer: answer,
    }),
  });
  const loginBody = (await loginRes.json()) as { message?: string; csrfToken?: string };
  if (!loginRes.ok) {
    throw new Error(loginBody.message || `Login failed (${loginRes.status})`);
  }

  const setCookie = loginRes.headers.getSetCookie?.() ?? [];
  const cookieHeader = setCookie.map((c) => c.split(';')[0]).join('; ');
  const csrfToken = String(loginBody.csrfToken || '');
  if (!cookieHeader) {
    throw new Error('Login succeeded but no session cookie returned.');
  }
  log('Login OK — starting bulk resolve.');
  return { cookieHeader, csrfToken };
}

async function resolveBlockViaApi(
  job: BlockJob,
  opts: { skipExisting: boolean; schoolLimit: number },
  session: { cookieHeader: string; csrfToken: string },
  log: (s: string) => void,
) {
  let offset = 0;
  let total = 0;
  let resolved = 0;
  let skipped = 0;
  let failed = 0;

  while (true) {
    const res = await fetch(`${API_BASE}/api/school-works/bulk-assign-village-locations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session.cookieHeader,
        'x-csrf-token': session.csrfToken,
      },
      body: JSON.stringify({
        district: job.district,
        block: job.block,
        saveDraft: true,
        skipExisting: opts.skipExisting,
        schoolLimit: opts.schoolLimit,
        schoolOffset: offset,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(String(data.message || `HTTP ${res.status}`));
    }

    total = Number(data.total) || total;
    resolved += Number(data.resolved) || 0;
    skipped += Number(data.skipped) || 0;
    failed += Number(data.failed) || 0;
    const batch = Number(data.batchProcessed) || opts.schoolLimit;
    offset = Number(data.nextSchoolOffset ?? data.nextVillageOffset ?? data.nextOffset) || offset + batch;

    log(
      `${job.district}/${job.block}: ${Math.min(offset, total)}/${total} — resolved ${resolved}, skipped ${skipped}, failed ${failed}`,
    );

    if (!data.hasMore) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  log(
    `DONE ${job.district}/${job.block}: total ${total}, resolved ${resolved}, skipped ${skipped}, failed ${failed}`,
  );
}

async function resolveBlockDirect(
  job: BlockJob,
  opts: { skipExisting: boolean; schoolLimit: number },
  log: (s: string) => void,
) {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { SchoolWorksService } = await import('../src/modules/school-works/school-works.service');
  const { isGooglePlacesConfigured } = await import(
    '../src/common/utils/google-school-place.util'
  );

  if (!isGooglePlacesConfigured()) {
    throw new Error(
      'GOOGLE_PLACES_API_KEY is not set. Use --mode api to run on Hostinger (Google key on server), or add the key to backend/.env.',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(SchoolWorksService);
    let offset = 0;
    let total = 0;
    let resolved = 0;
    let skipped = 0;
    let failed = 0;

    while (true) {
      const data = await service.bulkAssignVillageLocations({
        district: job.district,
        block: job.block,
        saveDraft: true,
        skipExisting: opts.skipExisting,
        schoolLimit: opts.schoolLimit,
        schoolOffset: offset,
      });

      total = data.total || total;
      resolved += data.resolved;
      skipped += data.skipped;
      failed += data.failed;
      offset =
        Number(data.nextSchoolOffset ?? data.nextVillageOffset ?? data.nextOffset) ||
        offset + data.batchProcessed;

      log(
        `${job.district}/${job.block}: ${Math.min(offset, total)}/${total} — resolved ${resolved}, skipped ${skipped}, failed ${failed}`,
      );

      if (!data.hasMore) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    log(
      `DONE ${job.district}/${job.block}: total ${total}, resolved ${resolved}, skipped ${skipped}, failed ${failed}`,
    );
  } finally {
    await app.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobs = jobsFromArgs(args);
  const { log, close } = createLogger(args.logFile);

  log(
    `Bulk resolve started — mode=${args.mode}, jobs=${jobs.length}, skipExisting=${args.skipExisting}, limit=${args.schoolLimit}`,
  );
  log(`Log file: ${args.logFile}`);

  try {
    if (args.mode === 'api') {
      const session = await loginApiSession(log);
      for (const job of jobs) {
        log(`--- ${job.district} / ${job.block} ---`);
        await resolveBlockViaApi(job, args, session, log);
      }
    } else {
      for (const job of jobs) {
        log(`--- ${job.district} / ${job.block} ---`);
        await resolveBlockDirect(job, args, log);
      }
    }
    log('All blocks finished.');
  } catch (err) {
    log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await close();
  }
}

void main();
