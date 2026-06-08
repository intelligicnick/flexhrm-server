/**
 * One-time migration: import JSON database files into MongoDB.
 *
 * Usage (from backend/):
 *   npm run migrate:json
 *   MIGRATE_SOURCE_DIR=../ npm run migrate:json
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/flexhrm';
const SOURCE_DIR = path.resolve(
  process.env.MIGRATE_SOURCE_DIR ?? path.join(process.cwd(), '..'),
);

function readJson<T>(filename: string, fallback: T): T {
  const filePath = path.join(SOURCE_DIR, filename);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

async function main(): Promise<void> {
  console.info(`Connecting to MongoDB: ${MONGODB_URI}`);
  console.info(`Reading JSON from: ${SOURCE_DIR}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection failed');

  const employees = readJson<Record<string, unknown>[]>('employees-db.json', []);
  const admins = readJson<Record<string, unknown>[]>('admins-db.json', []);
  const roles = readJson<Record<string, unknown>[]>('roles-db.json', []);
  const auditLogs = readJson<
    Array<{
      id: string;
      timestamp: string;
      username: string;
      action: string;
      target: string;
      details?: Record<string, unknown>;
    }>
  >('audit-logs-db.json', []);

  if (employees.length) {
    await db.collection('employees').deleteMany({});
    await db.collection('employees').insertMany(
      employees.map((e, i) => ({
        ...e,
        id: String(e.id || e.employeeCode),
        employeeCode: String(e.employeeCode || e.id),
        srNo: Number(e.srNo) || i + 1,
        grossSalary: Number(e.grossSalary) || 0,
        basicSalary: Number(e.basicSalary) || 0,
        monthlyLedger: e.monthlyLedger || {},
        status: 'active',
      })),
    );
    console.info(`Imported ${employees.length} employees`);
  }

  if (admins.length) {
    await db.collection('admins').deleteMany({});
    await db.collection('admins').insertMany(
      admins.map((a) => ({
        ...a,
        username: String(a.username).trim(),
        locations: Array.isArray(a.locations) ? a.locations : [],
        disabled: !!a.disabled,
        createdAt: a.createdAt || new Date().toISOString(),
      })),
    );
    console.info(`Imported ${admins.length} admins`);
  }

  if (roles.length) {
    await db.collection('roles').deleteMany({});
    await db.collection('roles').insertMany(roles);
    console.info(`Imported ${roles.length} roles`);
  }

  if (auditLogs.length) {
    await db.collection('audit_logs').deleteMany({});
    await db.collection('audit_logs').insertMany(auditLogs);
    console.info(`Imported ${auditLogs.length} audit logs`);
  }

  const locationNames = [
    ...new Set(employees.map((e) => String(e.location || '').trim()).filter(Boolean)),
  ];
  if (locationNames.length) {
    for (const name of locationNames) {
      await db.collection('locations').updateOne(
        { name },
        { $set: { name, complianceEnabled: false, ptAmount: 0, deleted: false } },
        { upsert: true },
      );
    }
    console.info(`Synced ${locationNames.length} locations`);
  }

  const jobRoleNames = [
    ...new Set(employees.map((e) => String(e.role || '').trim()).filter(Boolean)),
  ];
  if (jobRoleNames.length) {
    for (const name of jobRoleNames) {
      await db.collection('job_roles').updateOne(
        { name },
        { $set: { name, deleted: false } },
        { upsert: true },
      );
    }
    console.info(`Synced ${jobRoleNames.length} job roles`);
  }

  await db.collection('app_meta').updateOne(
    { metaKey: 'schema_version' },
    { $set: { metaKey: 'schema_version', metaValue: '1.0.0' } },
    { upsert: true },
  );

  console.info('Migration complete.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
