import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Location, LocationDocument } from '../../database/schemas/location.schema';

@Injectable()
export class LocationsService {
  constructor(
    @InjectModel(Location.name) private readonly locationModel: Model<LocationDocument>,
  ) {}

  async findAll(includeDeleted = false): Promise<Location[]> {
    const filter = includeDeleted ? {} : { deleted: false };
    return this.locationModel.find(filter).sort({ name: 1 }).lean().exec();
  }

  async upsert(data: {
    name: string;
    complianceEnabled?: boolean;
    ptAmount?: number;
  }): Promise<Location> {
    const name = data.name.trim();
    const result = await this.locationModel
      .findOneAndUpdate(
        { name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        {
          name,
          complianceEnabled: data.complianceEnabled ?? false,
          ptAmount: data.ptAmount ?? 0,
          deleted: false,
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return result as Location;
  }

  async update(name: string, patch: Partial<Location>): Promise<Location> {
    const doc = await this.locationModel
      .findOneAndUpdate(
        {
          name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          deleted: false,
        },
        { $set: patch },
        { new: true },
      )
      .lean()
      .exec();
    if (!doc) throw new NotFoundException(`Location "${name}" not found.`);
    return doc as Location;
  }

  async softDelete(names: string[]): Promise<number> {
    let count = 0;
    for (const name of names) {
      const result = await this.locationModel.updateOne(
        {
          name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        },
        { $set: { deleted: true } },
      );
      count += result.modifiedCount ?? 0;
    }
    return count;
  }

  async syncFromEmployees(locations: string[]): Promise<void> {
    for (const loc of locations) {
      const name = loc.trim();
      if (!name) continue;
      await this.upsert({ name });
    }
  }
}
