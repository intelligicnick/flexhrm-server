#!/usr/bin/env node
/**
 * Exports a JSON snapshot of all MongoDB collections for disaster recovery.
 * Requires MONGODB_URI in the environment.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const payload = {
    createdAt: new Date().toISOString(),
    collections: {},
  };

  for (const { name } of collections) {
    payload.collections[name] = await db.collection(name).find({}).toArray();
  }

  const outDir = path.join(process.cwd(), 'backups');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `flexhrm-backup-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload));
  console.log(`Backup written to ${outPath}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
