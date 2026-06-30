import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { runWithoutTenantScope } from '../../platform/common/tenant-context.store';
import {
  Contract,
  ContractDocument,
} from '../../database/schemas/contract.schema';
import {
  BgDdRecord,
  BgDdDocument as BgDdRecordDocument,
} from '../../database/schemas/bg-dd.schema';

@Injectable()
export class ContractBgSyncService {
  constructor(
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(BgDdRecord.name)
    private readonly bgDdModel: Model<BgDdRecordDocument>,
  ) {}

  private generateBgDdId(): string {
    return `bgdd_${crypto.randomBytes(8).toString('hex')}`;
  }

  private hasBgPayload(values: {
    number?: string;
    amount?: string;
    issuingBank?: string;
    expiryDate?: string;
    notes?: string;
  }): boolean {
    return [
      values.number,
      values.amount,
      values.issuingBank,
      values.expiryDate,
      values.notes,
    ].some((value) => String(value || '').trim().length > 0);
  }

  async syncFromBgRecord(record: {
    instrumentType?: string;
    contractId?: string;
    number?: string;
    amount?: string;
    issuingBank?: string;
    expiryDate?: string;
    notes?: string;
    dateOfIssue?: string;
  }): Promise<void> {
    if (record.instrumentType !== 'bg') return;

    const contractId = String(record.contractId || '').trim();
    if (!contractId) return;

    const contract = await this.contractModel.findOne({ id: contractId }).exec();
    if (!contract) return;

    contract.bgApplicable = true;
    contract.bgNumber = String(record.number || '').trim();
    contract.bgAmount = String(record.amount || '').trim();
    contract.bgIssuingBank = String(record.issuingBank || '').trim();
    contract.bgExpiryDate = String(record.expiryDate || '').trim();
    contract.bgDetails = String(record.notes || '').trim();
    const plain = contract.toObject() as unknown as Record<string, unknown>;
    delete plain._id;
    delete plain.__v;
    delete plain.createdAt;
    delete plain.updatedAt;
    await runWithoutTenantScope(() =>
      this.contractModel
        .findOneAndUpdate({ id: contract.id }, { $set: plain })
        .exec(),
    );
  }

  async syncFromContract(contract: ContractDocument): Promise<void> {
    if (!contract.bgApplicable) return;

    const payload = {
      number: String(contract.bgNumber || '').trim(),
      amount: String(contract.bgAmount || '').trim(),
      issuingBank: String(contract.bgIssuingBank || '').trim(),
      expiryDate: String(contract.bgExpiryDate || '').trim(),
      notes: String(contract.bgDetails || '').trim(),
    };

    if (!this.hasBgPayload(payload)) return;

    let bgRecord = await this.bgDdModel
      .findOne({
        contractId: contract.id,
        instrumentType: 'bg',
        ...(payload.number ? { number: payload.number } : {}),
      })
      .sort({ updatedAt: -1 })
      .exec();

    if (!bgRecord) {
      bgRecord = await this.bgDdModel
        .findOne({ contractId: contract.id, instrumentType: 'bg' })
        .sort({ updatedAt: -1 })
        .exec();
    }

    if (bgRecord) {
      bgRecord.number = payload.number || bgRecord.number;
      bgRecord.amount = payload.amount;
      bgRecord.issuingBank = payload.issuingBank;
      bgRecord.expiryDate = payload.expiryDate;
      bgRecord.notes = payload.notes;
      bgRecord.contractId = contract.id;
      await bgRecord.save();
      return;
    }

    if (!payload.number) return;

    await this.bgDdModel.create({
      id: this.generateBgDdId(),
      instrumentType: 'bg',
      number: payload.number,
      beneficiary: '',
      dateOfIssue: '',
      expiryDate: payload.expiryDate,
      issuingBank: payload.issuingBank,
      contractId: contract.id,
      status: 'submitted_to_dept',
      amount: payload.amount,
      notes: payload.notes,
      entryDate: new Date().toISOString().slice(0, 10),
    });
  }
}
