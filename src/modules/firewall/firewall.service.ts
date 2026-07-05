import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import { generateToken } from '../../common/utils/password.util';
import {
  extractClientIp,
  isPrivateOrLocalIp,
} from '../../common/utils/client-ip.util';
import {
  FirewallLog,
  FirewallLogDocument,
  FirewallIntent,
} from '../../database/schemas/firewall-log.schema';
import {
  FirewallBlock,
  FirewallBlockDocument,
} from '../../database/schemas/firewall-block.schema';
import {
  FirewallSettings,
  FirewallSettingsDocument,
} from '../../database/schemas/firewall-settings.schema';
import {
  FirewallWhitelist,
  FirewallWhitelistDocument,
} from '../../database/schemas/firewall-whitelist.schema';
import {
  FirewallLoginAttempt,
  FirewallLoginAttemptDocument,
} from '../../database/schemas/firewall-login-attempt.schema';

const MAX_FIREWALL_LOGS = 2000;

const SCAN_PATTERNS = [
  /\.env/i,
  /wp-admin/i,
  /wp-login/i,
  /phpmyadmin/i,
  /\.php$/i,
  /xmlrpc/i,
  /\/admin\.php/i,
  /\/shell/i,
  /\/cgi-bin/i,
  /\/\.git/i,
  /\/actuator/i,
  /\/solr/i,
  /\/vendor\/phpunit/i,
  /\/\.aws/i,
  /\/config\.json/i,
  /\/backup/i,
  /\/sql/i,
  /\/database/i,
  /\/telescope/i,
  /\/debug/i,
  /\/\.well-known\/security/i,
];

/** Fake paths — any hit is an instant permanent block (honeypot). */
const HONEYPOT_PATHS = [
  '/api/admin.php',
  '/api/wp-login.php',
  '/api/.env',
  '/api/phpmyadmin',
  '/api/shell',
  '/api/config.php',
  '/api/database.sql',
];

const SKIP_LOG_PATHS = [
  '/api/firewall/logs',
  '/api/firewall/stats',
  '/api/firewall/blocks',
  '/api/firewall/settings',
  '/api/firewall/whitelist',
];

export interface GeoInfo {
  country: string;
  countryCode: string;
  city: string;
  region: string;
  isp: string;
}

export interface FirewallCheckResult {
  allowed: boolean;
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  reason: string;
}

@Injectable()
export class FirewallService {
  private readonly logger = new Logger(FirewallService.name);
  private readonly geoCache = new Map<string, GeoInfo & { cachedAt: number }>();
  private readonly GEO_CACHE_TTL_MS = 60 * 60 * 1000;

  constructor(
    @InjectModel(FirewallLog.name)
    private readonly logModel: Model<FirewallLogDocument>,
    @InjectModel(FirewallBlock.name)
    private readonly blockModel: Model<FirewallBlockDocument>,
    @InjectModel(FirewallSettings.name)
    private readonly settingsModel: Model<FirewallSettingsDocument>,
    @InjectModel(FirewallWhitelist.name)
    private readonly whitelistModel: Model<FirewallWhitelistDocument>,
    @InjectModel(FirewallLoginAttempt.name)
    private readonly loginAttemptModel: Model<FirewallLoginAttemptDocument>,
  ) {}

  async getSettings(): Promise<FirewallSettings> {
    const existing = await this.settingsModel.findOne({ id: 'global' }).lean().exec();
    if (existing) return existing as FirewallSettings;

    const created = await this.settingsModel.create({
      id: 'global',
      indiaOnlyEnabled: true,
      autoBlockScans: true,
      logAllRequests: true,
      failClosedGeo: true,
      loginMaxAttempts: 5,
      loginLockoutMinutes: 30,
    });
    return created.toObject() as FirewallSettings;
  }

  async updateSettings(
    patch: Partial<
      Pick<
        FirewallSettings,
        | 'indiaOnlyEnabled'
        | 'autoBlockScans'
        | 'logAllRequests'
        | 'failClosedGeo'
        | 'loginMaxAttempts'
        | 'loginLockoutMinutes'
      >
    >,
  ): Promise<FirewallSettings> {
    const settings = await this.settingsModel
      .findOneAndUpdate(
        { id: 'global' },
        { $set: patch },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return settings as FirewallSettings;
  }

  classifyIntent(path: string, method: string, userAgent: string): FirewallIntent {
    const lower = path.toLowerCase();
    const ua = (userAgent || '').toLowerCase();

    if (HONEYPOT_PATHS.some((p) => lower.startsWith(p) || lower.includes(p))) {
      return 'malicious_scan';
    }

    if (SCAN_PATTERNS.some((re) => re.test(lower))) {
      return 'malicious_scan';
    }

    if (lower.includes('/auth/login') || lower.includes('/auth/supervisor/login')) {
      return 'login_attempt';
    }
    if (lower.includes('/registration') || lower.includes('/register')) {
      return 'registration_probe';
    }
    if (lower.includes('/platform/auth')) {
      return 'platform_probe';
    }
    if (
      lower === '/api/health' ||
      lower.startsWith('/api/health/') ||
      lower === '/healthcheck' ||
      lower === '/'
    ) {
      return 'health_probe';
    }

    if (
      ua.includes('curl') ||
      ua.includes('wget') ||
      ua.includes('python-requests') ||
      ua.includes('go-http-client') ||
      ua.includes('scanner') ||
      ua.includes('nikto') ||
      ua.includes('nmap')
    ) {
      return 'malicious_scan';
    }

    return 'api_access';
  }

  isHoneypotHit(path: string): boolean {
    const lower = path.toLowerCase();
    return HONEYPOT_PATHS.some((p) => lower.startsWith(p) || lower.includes(p));
  }

  async lookupGeo(ip: string): Promise<GeoInfo> {
    if (isPrivateOrLocalIp(ip)) {
      return {
        country: 'India',
        countryCode: 'IN',
        city: 'Local',
        region: 'Development',
        isp: 'Local Network',
      };
    }

    const cached = this.geoCache.get(ip);
    if (cached && Date.now() - cached.cachedAt < this.GEO_CACHE_TTL_MS) {
      const { country, countryCode, city, region, isp } = cached;
      return { country, countryCode, city, region, isp };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(
        `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,city,regionName,isp`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`Geo lookup HTTP ${res.status}`);
      const data = (await res.json()) as {
        status?: string;
        country?: string;
        countryCode?: string;
        city?: string;
        regionName?: string;
        isp?: string;
      };

      const geo: GeoInfo = {
        country: data.status === 'success' ? (data.country ?? 'Unknown') : 'Unknown',
        countryCode: data.status === 'success' ? (data.countryCode ?? '') : '',
        city: data.city ?? '',
        region: data.regionName ?? '',
        isp: data.isp ?? '',
      };

      this.geoCache.set(ip, { ...geo, cachedAt: Date.now() });
      return geo;
    } catch (err) {
      this.logger.warn(
        `Geo lookup failed for ${ip}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        country: 'Unknown',
        countryCode: '',
        city: '',
        region: '',
        isp: '',
      };
    }
  }

  async isIpWhitelisted(ip: string): Promise<boolean> {
    const entry = await this.whitelistModel.findOne({ ip }).lean().exec();
    return !!entry;
  }

  async listWhitelist(): Promise<FirewallWhitelist[]> {
    return this.whitelistModel.find().sort({ createdAt: -1 }).lean().exec();
  }

  async addWhitelist(ip: string, label: string, addedBy: string): Promise<void> {
    await this.whitelistModel.findOneAndUpdate(
      { ip: ip.trim() },
      { $set: { ip: ip.trim(), label: label.trim(), addedBy } },
      { upsert: true },
    );
    await this.unblockIp(ip.trim());
  }

  async removeWhitelist(ip: string): Promise<void> {
    await this.whitelistModel.deleteOne({ ip });
  }

  async isIpBlocked(ip: string): Promise<FirewallBlock | null> {
    return this.blockModel.findOne({ ip, active: true }).lean().exec();
  }

  async blockIp(
    ip: string,
    reason: string,
    source: FirewallBlock['source'] = 'manual',
    blockedBy = 'admin',
  ): Promise<void> {
    await this.blockModel.findOneAndUpdate(
      { ip },
      { $set: { ip, reason, source, blockedBy, active: true } },
      { upsert: true },
    );
  }

  async unblockIp(ip: string): Promise<void> {
    await this.blockModel.updateOne({ ip }, { $set: { active: false } });
    await this.loginAttemptModel.deleteOne({ ip });
  }

  async listBlocks(): Promise<FirewallBlock[]> {
    return this.blockModel.find({ active: true }).sort({ updatedAt: -1 }).lean().exec();
  }

  async getRecentLogs(limit = 100): Promise<FirewallLog[]> {
    return this.logModel.find().sort({ timestamp: -1 }).limit(limit).lean().exec();
  }

  async getStats(): Promise<{
    totalVisits24h: number;
    blocked24h: number;
    suspicious24h: number;
    foreign24h: number;
    activeBlocks: number;
    whitelistedIps: number;
    indiaOnlyEnabled: boolean;
    failClosedGeo: boolean;
  }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [
      totalVisits24h,
      blocked24h,
      suspicious24h,
      foreign24h,
      activeBlocks,
      whitelistedIps,
      settings,
    ] = await Promise.all([
      this.logModel.countDocuments({ timestamp: { $gte: since } }),
      this.logModel.countDocuments({ timestamp: { $gte: since }, blocked: true }),
      this.logModel.countDocuments({
        timestamp: { $gte: since },
        intent: 'malicious_scan',
      }),
      this.logModel.countDocuments({
        timestamp: { $gte: since },
        countryCode: { $nin: ['IN', ''] },
      }),
      this.blockModel.countDocuments({ active: true }),
      this.whitelistModel.countDocuments(),
      this.getSettings(),
    ]);

    return {
      totalVisits24h,
      blocked24h,
      suspicious24h,
      foreign24h,
      activeBlocks,
      whitelistedIps,
      indiaOnlyEnabled: settings.indiaOnlyEnabled,
      failClosedGeo: settings.failClosedGeo,
    };
  }

  shouldSkipLog(path: string): boolean {
    return SKIP_LOG_PATHS.some((p) => path.startsWith(p));
  }

  async isLoginLocked(ip: string): Promise<{ locked: boolean; reason?: string }> {
    const attempt = await this.loginAttemptModel.findOne({ ip }).lean().exec();
    if (!attempt?.lockedUntil) return { locked: false };
    if (attempt.lockedUntil > new Date()) {
      const mins = Math.ceil((attempt.lockedUntil.getTime() - Date.now()) / 60000);
      return {
        locked: true,
        reason: `Too many failed login attempts. Try again in ${mins} minute(s).`,
      };
    }
    await this.loginAttemptModel.updateOne({ ip }, { $set: { failures: 0, lockedUntil: null } });
    return { locked: false };
  }

  async recordLoginFailure(ip: string): Promise<void> {
    const settings = await this.getSettings();
    const maxAttempts = settings.loginMaxAttempts ?? 5;
    const lockoutMinutes = settings.loginLockoutMinutes ?? 30;

    const attempt = await this.loginAttemptModel.findOneAndUpdate(
      { ip },
      {
        $inc: { failures: 1 },
        $set: { lastAttempt: new Date() },
      },
      { upsert: true, new: true },
    );

    if (attempt.failures >= maxAttempts) {
      const lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
      await this.loginAttemptModel.updateOne({ ip }, { $set: { lockedUntil } });
      await this.blockIp(
        ip,
        `Locked after ${maxAttempts} failed login attempts`,
        'auto_login',
        'system',
      );
      this.logger.warn(`Login lockout triggered for IP ${ip} (${attempt.failures} failures)`);
    }
  }

  async clearLoginFailures(ip: string): Promise<void> {
    await this.loginAttemptModel.deleteOne({ ip });
  }

  async evaluateRequest(req: Request): Promise<{
    ip: string;
    geo: GeoInfo;
    intent: FirewallIntent;
    blocked: boolean;
    blockReason: string;
  }> {
    const settings = await this.getSettings();
    const ip = extractClientIp(req);
    const path = req.originalUrl || req.url || '';
    const method = req.method || 'GET';
    const userAgent = String(req.headers['user-agent'] || '');
    const intent = this.classifyIntent(path, method, userAgent);
    const geo = await this.lookupGeo(ip);

    let blocked = false;
    let blockReason = '';

    const whitelisted = await this.isIpWhitelisted(ip);

    if (whitelisted) {
      return { ip, geo, intent, blocked: false, blockReason: '' };
    }

    const existingBlock = await this.isIpBlocked(ip);
    if (existingBlock) {
      blocked = true;
      blockReason = existingBlock.reason || 'IP is on block list';
    } else if (this.isHoneypotHit(path)) {
      blocked = true;
      blockReason = 'Honeypot trap triggered — permanent block';
      await this.blockIp(ip, blockReason, 'honeypot', 'system');
    } else if (intent === 'login_attempt') {
      const loginLock = await this.isLoginLocked(ip);
      if (loginLock.locked) {
        blocked = true;
        blockReason = loginLock.reason || 'Login temporarily locked for this IP';
      }
    } else if (
      settings.failClosedGeo &&
      !isPrivateOrLocalIp(ip) &&
      !geo.countryCode
    ) {
      blocked = true;
      blockReason = 'Country could not be verified — access denied (fail-closed)';
    } else if (
      settings.indiaOnlyEnabled &&
      !isPrivateOrLocalIp(ip) &&
      geo.countryCode &&
      geo.countryCode !== 'IN'
    ) {
      blocked = true;
      blockReason = `Access restricted to India only. Detected: ${geo.country || 'Unknown'}`;
    } else if (settings.autoBlockScans && intent === 'malicious_scan') {
      blocked = true;
      blockReason = 'Suspicious scan or probe detected';
      await this.blockIp(ip, blockReason, 'auto_scan', 'system');
    }

    return { ip, geo, intent, blocked, blockReason };
  }

  async logVisit(params: {
    ip: string;
    geo: GeoInfo;
    method: string;
    path: string;
    userAgent: string;
    intent: FirewallIntent;
    blocked: boolean;
    blockReason: string;
    username?: string;
  }): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.logAllRequests) return;
    if (this.shouldSkipLog(params.path)) return;

    await this.logModel.create({
      id: `fw_${generateToken().slice(0, 12)}`,
      timestamp: new Date().toISOString(),
      ip: params.ip,
      country: params.geo.country,
      countryCode: params.geo.countryCode,
      city: params.geo.city,
      region: params.geo.region,
      isp: params.geo.isp,
      method: params.method,
      path: params.path,
      userAgent: params.userAgent.slice(0, 500),
      intent: params.intent,
      blocked: params.blocked,
      blockReason: params.blockReason,
      username: params.username || '',
    });

    const count = await this.logModel.countDocuments();
    if (count > MAX_FIREWALL_LOGS) {
      const excess = count - MAX_FIREWALL_LOGS;
      const oldest = await this.logModel
        .find()
        .sort({ timestamp: 1 })
        .limit(excess)
        .select('id')
        .lean()
        .exec();
      if (oldest.length) {
        await this.logModel.deleteMany({ id: { $in: oldest.map((o) => o.id) } });
      }
    }
  }

  async checkAccess(req: Request): Promise<FirewallCheckResult> {
    const { ip, geo, blocked, blockReason } = await this.evaluateRequest(req);
    return {
      allowed: !blocked,
      ip,
      country: geo.country,
      countryCode: geo.countryCode,
      city: geo.city,
      reason: blocked ? blockReason : '',
    };
  }

  getClientIp(req: Request): string {
    return extractClientIp(req);
  }
}
