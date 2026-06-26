/**
 * Rebuild compound indexes for multi-tenant isolation.
 * Run: npm run migrate:tenant-indexes
 */
import mongoose from 'mongoose';

const COMPOUND_INDEXES: Array<{
  collection: string;
  keys: Record<string, 1 | -1>;
  dropGlobal?: string[];
}> = [
  { collection: 'employees', keys: { tenantId: 1, employeeCode: 1 }, dropGlobal: ['employeeCode_1'] },
  { collection: 'admins', keys: { tenantId: 1, username: 1 }, dropGlobal: ['username_1'] },
  { collection: 'locations', keys: { tenantId: 1, name: 1 }, dropGlobal: ['name_1'] },
  { collection: 'roles', keys: { tenantId: 1, name: 1 }, dropGlobal: ['name_1'] },
  { collection: 'payroll_ledger', keys: { tenantId: 1, employeeId: 1, monthKey: 1 }, dropGlobal: ['employeeId_1_monthKey_1'] },
  { collection: 'job_roles', keys: { tenantId: 1, name: 1 }, dropGlobal: ['name_1'] },
  { collection: 'audit_logs', keys: { tenantId: 1, createdAt: -1 } },
  { collection: 'notifications', keys: { tenantId: 1, createdAt: -1 } },
  { collection: 'school_works', keys: { tenantId: 1, id: 1 }, dropGlobal: ['id_1'] },
];

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/flexhrm';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection failed');

  console.log('Rebuilding tenant compound indexes...');

  for (const spec of COMPOUND_INDEXES) {
    const coll = db.collection(spec.collection);
    for (const idx of spec.dropGlobal ?? []) {
      try {
        await coll.dropIndex(idx);
        console.log(`  Dropped ${spec.collection}.${idx}`);
      } catch {
        // index may not exist
      }
    }
    try {
      await coll.createIndex(spec.keys, { unique: spec.keys.name !== undefined || !!spec.dropGlobal?.length });
      console.log(`  Created ${spec.collection} index:`, spec.keys);
    } catch (err) {
      console.warn(`  Warning ${spec.collection}:`, (err as Error).message);
    }
  }

  console.log('Index rebuild complete.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
