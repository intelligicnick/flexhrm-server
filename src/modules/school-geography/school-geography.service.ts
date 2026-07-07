import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { MongoServerError } from 'mongodb';
import { Model } from 'mongoose';
import {
  SchoolBlock,
  SchoolBlockDocument,
} from '../../database/schemas/school-block.schema';
import {
  SchoolDistrict,
  SchoolDistrictDocument,
} from '../../database/schemas/school-district.schema';

@Injectable()
export class SchoolGeographyService {
  constructor(
    @InjectModel(SchoolDistrict.name)
    private readonly districtModel: Model<SchoolDistrictDocument>,
    @InjectModel(SchoolBlock.name)
    private readonly blockModel: Model<SchoolBlockDocument>,
  ) {}

  private toDistrictPlain(doc: SchoolDistrictDocument | Record<string, unknown>) {
    const obj =
      typeof (doc as SchoolDistrictDocument).toObject === 'function'
        ? (doc as SchoolDistrictDocument).toObject()
        : { ...doc };
    const { _id, __v, createdAt, updatedAt, ...rest } = obj as Record<string, unknown>;
    return rest;
  }

  private toBlockPlain(doc: SchoolBlockDocument | Record<string, unknown>) {
    const obj =
      typeof (doc as SchoolBlockDocument).toObject === 'function'
        ? (doc as SchoolBlockDocument).toObject()
        : { ...doc };
    const { _id, __v, createdAt, updatedAt, ...rest } = obj as Record<string, unknown>;
    return rest;
  }

  private caseInsensitiveNameRegex(name: string) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`, 'i');
  }

  /** Soft-deleted rows still occupy the legacy unique index; remove tombstones before save. */
  private async removeSoftDeletedBlockConflicts(
    districtId: string,
    name: string,
    excludeId: string,
  ): Promise<void> {
    const conflicts = await this.blockModel
      .find({
        id: { $ne: excludeId },
        districtId,
        name: this.caseInsensitiveNameRegex(name),
        deleted: true,
      })
      .exec();
    for (const tombstone of conflicts) {
      await this.blockModel.deleteOne({ id: tombstone.id });
    }
  }

  async findAllDistricts(includeDeleted = false) {
    const filter = includeDeleted ? {} : { deleted: false };
    const docs = await this.districtModel.find(filter).sort({ name: 1 }).exec();
    return docs.map((d) => this.toDistrictPlain(d));
  }

  async createDistrict(name: string) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new BadRequestException('District name is required.');
    const existing = await this.districtModel
      .findOne({
        name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      })
      .exec();
    if (existing && !existing.deleted) {
      throw new BadRequestException(`District "${trimmed}" already exists.`);
    }
    if (existing?.deleted) {
      existing.deleted = false;
      existing.name = trimmed;
      await existing.save();
      return this.toDistrictPlain(existing);
    }
    const doc = await this.districtModel.create({
      id: randomUUID(),
      name: trimmed,
      deleted: false,
    });
    return this.toDistrictPlain(doc);
  }

  async updateDistrict(id: string, name: string) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new BadRequestException('District name is required.');
    const district = await this.districtModel.findOne({ id, deleted: false }).exec();
    if (!district) throw new NotFoundException('District not found.');
    const duplicate = await this.districtModel
      .findOne({
        id: { $ne: id },
        name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        deleted: false,
      })
      .exec();
    if (duplicate) {
      throw new BadRequestException(`District "${trimmed}" already exists.`);
    }
    district.name = trimmed;
    await district.save();
    await this.blockModel.updateMany(
      { districtId: id },
      { $set: { districtName: trimmed } },
    );
    return this.toDistrictPlain(district);
  }

  async deleteDistricts(ids: string[]) {
    let count = 0;
    for (const id of ids) {
      const district = await this.districtModel.findOne({ id, deleted: false }).exec();
      if (!district) continue;
      district.deleted = true;
      await district.save();
      await this.blockModel.updateMany({ districtId: id }, { $set: { deleted: true } });
      count++;
    }
    return count;
  }

  async findAllBlocks(districtId?: string, includeDeleted = false) {
    const filter: Record<string, unknown> = includeDeleted ? {} : { deleted: false };
    if (districtId) filter.districtId = districtId;
    const docs = await this.blockModel.find(filter).sort({ districtName: 1, name: 1 }).exec();
    return docs.map((d) => this.toBlockPlain(d));
  }

  async createBlock(name: string, districtId: string) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new BadRequestException('Block name is required.');
    const district = await this.districtModel.findOne({ id: districtId, deleted: false }).exec();
    if (!district) throw new NotFoundException('District not found.');
    const existing = await this.blockModel
      .findOne({
        districtId,
        name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      })
      .exec();
    if (existing && !existing.deleted) {
      throw new BadRequestException(`Block "${trimmed}" already exists in this district.`);
    }
    if (existing?.deleted) {
      existing.deleted = false;
      existing.name = trimmed;
      existing.districtName = district.name;
      await existing.save();
      return this.toBlockPlain(existing);
    }
    const doc = await this.blockModel.create({
      id: randomUUID(),
      name: trimmed,
      districtId,
      districtName: district.name,
      deleted: false,
    });
    return this.toBlockPlain(doc);
  }

  async updateBlock(id: string, patch: { name?: string; districtId?: string }) {
    const block = await this.blockModel.findOne({ id, deleted: false }).exec();
    if (!block) throw new NotFoundException('Block not found.');
    const districtId = patch.districtId || block.districtId;
    const district = await this.districtModel.findOne({ id: districtId, deleted: false }).exec();
    if (!district) throw new NotFoundException('District not found.');
    const trimmed = String(patch.name ?? block.name).trim();
    if (!trimmed) throw new BadRequestException('Block name is required.');
    const duplicate = await this.blockModel
      .findOne({
        id: { $ne: id },
        districtId,
        name: this.caseInsensitiveNameRegex(trimmed),
        deleted: false,
      })
      .exec();
    if (duplicate) {
      throw new BadRequestException(`Block "${trimmed}" already exists in this district.`);
    }
    await this.removeSoftDeletedBlockConflicts(districtId, trimmed, id);
    block.name = trimmed;
    block.districtId = districtId;
    block.districtName = district.name;
    try {
      await block.save();
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) {
        throw new BadRequestException(`Block "${trimmed}" already exists in this district.`);
      }
      throw err;
    }
    return this.toBlockPlain(block);
  }

  async deleteBlocks(ids: string[]) {
    let count = 0;
    for (const id of ids) {
      const result = await this.blockModel.updateOne(
        { id, deleted: false },
        { $set: { deleted: true } },
      );
      count += result.modifiedCount ?? 0;
    }
    return count;
  }
}
