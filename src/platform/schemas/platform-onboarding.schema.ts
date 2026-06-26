import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformOnboardingDocument = HydratedDocument<PlatformOnboarding>;

@Schema({ timestamps: true, collection: 'platform_onboarding' })
export class PlatformOnboarding {
  @Prop({ required: true, unique: true, index: true })
  tenantId!: string;

  @Prop({ default: 0 })
  currentStep!: number;

  @Prop({ default: false })
  completed!: boolean;

  @Prop({ type: Object, default: {} })
  steps!: Record<string, boolean>;

  @Prop({ type: Date })
  completedAt?: Date;
}

export const PlatformOnboardingSchema = SchemaFactory.createForClass(PlatformOnboarding);
