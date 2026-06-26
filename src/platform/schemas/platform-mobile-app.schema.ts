import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformMobileAppDocument = HydratedDocument<PlatformMobileApp>;

@Schema({ timestamps: true, collection: 'platform_mobile_apps' })
export class PlatformMobileApp {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  appType!: string;

  @Prop({ default: '1.0.0' })
  currentVersion!: string;

  @Prop({ default: '1.0.0' })
  minVersion!: string;

  @Prop({ default: false })
  forceUpdate!: boolean;

  @Prop({ default: true })
  pushEnabled!: boolean;

  @Prop({ default: true })
  active!: boolean;

  @Prop({ type: Object, default: {} })
  featureFlags!: Record<string, boolean>;
}

export const PlatformMobileAppSchema = SchemaFactory.createForClass(PlatformMobileApp);
