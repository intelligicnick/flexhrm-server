import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OfficeGeofenceDocument = HydratedDocument<OfficeGeofence>;

@Schema({ timestamps: true, collection: 'office_geofences' })
export class OfficeGeofence {
  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true, index: true, default: 'default' })
  tenantId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  location!: string;

  @Prop({ required: true })
  latitude!: number;

  @Prop({ required: true })
  longitude!: number;

  @Prop({ default: 200 })
  radiusMeters!: number;

  @Prop({ default: true })
  active!: boolean;
}

export const OfficeGeofenceSchema = SchemaFactory.createForClass(OfficeGeofence);
OfficeGeofenceSchema.index({ tenantId: 1, location: 1 });
