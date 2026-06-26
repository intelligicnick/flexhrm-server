/**
 * One-time migration: add tenantId to all tenant-scoped collections.
 * Run: npm run migrate:multi-tenant
 */
import mongoose from 'mongoose';
import { TENANT_SCOPED_COLLECTIONS, DEFAULT_TENANT_ID } from '../src/platform/common/platform.constants';

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/flexhrm';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection failed');

  console.log(`Migrating collections to tenantId="${DEFAULT_TENANT_ID}"...`);

  for (const collection of TENANT_SCOPED_COLLECTIONS) {
    const result = await db.collection(collection).updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId: DEFAULT_TENANT_ID } },
    );
    console.log(`  ${collection}: ${result.modifiedCount} documents updated`);

    try {
      await db.collection(collection).createIndex({ tenantId: 1 });
    } catch {
      // index may already exist
    }
  }

  await db.collection('app_meta').updateOne(
    { key: 'schema_version' },
    { $set: { key: 'schema_version', value: '2.0.0-multi-tenant' } },
    { upsert: true },
  );

  console.log('Migration complete.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
