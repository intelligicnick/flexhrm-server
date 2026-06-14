/**
 * One-time seed: import Amour block schools from scripts/data/amour-schools.json
 * Generated from Elementary + Secondary billing PDFs and Bank Details PDF.
 *
 * Usage: npx tsx scripts/seed-amour-schools.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { hashPassword } from '../src/common/utils/password.util';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/flexhrm';

interface AmourSchoolRow {
  srNo: number;
  udise: string;
  schoolName: string;
  schoolCategory: string;
  noOfToilets: number;
  govtUnitRate: number;
  partnerMonthlyPay?: number;
  rates?: number;
  block: string;
  district: string;
  sweeperName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  paymentMethod?: string;
}

async function main() {
  const dataPath = path.join(__dirname, 'data', 'amour-schools.json');
  if (!fs.existsSync(dataPath)) {
    console.error('Missing amour-schools.json — run generate-amour-schools.py first.');
    process.exit(1);
  }

  const schools: AmourSchoolRow[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`Loading ${schools.length} Amour schools...`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db!;
  const collection = db.collection('school_works');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of schools) {
    const udise = String(row.udise || '').trim();
    if (!udise) {
      skipped++;
      continue;
    }

    const partnerMonthlyPay =
      Number(row.partnerMonthlyPay) ||
      (Number(row.govtUnitRate) >= 100 ? 4500 : 3750);

    const doc = {
      id: udise,
      udise,
      srNo: Number(row.srNo) || 0,
      schoolName: row.schoolName || '',
      schoolCategory: row.schoolCategory || '',
      headmasterName: '',
      headmasterNumber: '',
      sweeperName: row.sweeperName || row.accountHolderName || '',
      accountHolderName: row.accountHolderName || row.sweeperName || '',
      accountNumber: row.accountNumber || '',
      ifscCode: row.ifscCode || '',
      paymentMethod: row.paymentMethod || '',
      noOfToilets: Number(row.noOfToilets) || 0,
      govtUnitRate: Number(row.govtUnitRate) || 50,
      partnerMonthlyPay,
      rates: partnerMonthlyPay,
      rateExplanation: '',
      block: row.block || 'AMOUR',
      district: row.district || 'PURNIA',
      assignedSupervisorId: '',
      materialCost: 0,
      remarks: '',
      monthlyExpenseLedger: {},
    };

    const existing = await collection.findOne({ udise });
    if (existing) {
      await collection.updateOne({ udise }, { $set: doc });
      updated++;
    } else {
      await collection.insertOne(doc);
      created++;
    }
  }

  // Resequence srNo
  const all = await collection.find({ block: 'AMOUR' }).sort({ srNo: 1 }).toArray();
  for (let i = 0; i < all.length; i++) {
    await collection.updateOne({ _id: all[i]._id }, { $set: { srNo: i + 1 } });
  }

  // Seed default school supervisor if not exists
  const supervisors = db.collection('school_supervisors');
  const supervisorPhone = '9310276667';
  const existingSupervisor = await supervisors.findOne({ phone: supervisorPhone });
  if (!existingSupervisor) {
    const supId = 'SUP-AMOUR-001';
    await supervisors.insertOne({
      id: supId,
      name: 'MD Haseem',
      phone: supervisorPhone,
      assignedBlocks: ['AMOUR'],
      login: {
        phone: supervisorPhone,
        passwordHash: hashPassword('supervisor123'),
        enabled: true,
      },
      status: 'active',
    });
    console.log('Created default school supervisor MD Haseem (phone: 9310276667, pass: supervisor123)');
  }

  // Sync school partners from school registry
  const partners = db.collection('school_partners');
  const schoolRows = await collection.find().toArray();
  for (const school of schoolRows) {
    const schoolWorkId = String(school.id || school.udise || '');
    if (!schoolWorkId) continue;
    const monthlyPay = Number(school.partnerMonthlyPay) || Number(school.rates) || 0;
    await partners.updateOne(
      { schoolWorkId },
      {
        $set: {
          id: `partner-${schoolWorkId}`,
          schoolWorkId,
          schoolName: school.schoolName || '',
          partnerName: school.sweeperName || school.accountHolderName || '',
          accountHolderName: school.accountHolderName || school.sweeperName || '',
          accountNumber: school.accountNumber || '',
          ifscCode: school.ifscCode || '',
          paymentMethod: school.paymentMethod || '',
          monthlyPay,
          block: school.block || '',
          district: school.district || '',
          status: 'active',
        },
      },
      { upsert: true },
    );
  }
  console.log(`Synced ${schoolRows.length} school partner record(s).`);

  console.log(`Done. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
