import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Asset, AssetDocument } from '../../database/schemas/asset.schema';
import { generateToken } from '../../common/utils/password.util';
import { withTenantId, resolveTenantId } from '../../common/utils/tenant.util';

@Injectable()
export class AssetsService {
  constructor(@InjectModel(Asset.name) private readonly assetModel: Model<AssetDocument>) {}

  async findAll(tenantId?: string): Promise<Asset[]> {
    return this.assetModel.find(withTenantId(tenantId)).sort({ createdAt: -1 }).lean().exec();
  }

  async create(tenantId: string | undefined, data: Partial<Asset>): Promise<Asset> {
    const doc = await this.assetModel.create({
      ...data,
      tenantId: resolveTenantId(tenantId),
      id: data.id ?? `asset_${generateToken().slice(0, 10)}`,
    });
    return doc.toObject();
  }

  async issue(
    tenantId: string | undefined,
    assetId: string,
    employeeId: string,
  ): Promise<Asset> {
    const doc = await this.assetModel
      .findOneAndUpdate(
        withTenantId(tenantId, { id: assetId }),
        { $set: { status: 'issued', employeeId, issuedAt: new Date() } },
        { new: true },
      )
      .lean();
    if (!doc) throw new NotFoundException('Asset not found');
    return doc as Asset;
  }

  async returnAsset(tenantId: string | undefined, assetId: string): Promise<Asset> {
    const doc = await this.assetModel
      .findOneAndUpdate(
        withTenantId(tenantId, { id: assetId }),
        { $set: { status: 'returned', returnedAt: new Date(), employeeId: '' } },
        { new: true },
      )
      .lean();
    if (!doc) throw new NotFoundException('Asset not found');
    return doc as Asset;
  }
}
