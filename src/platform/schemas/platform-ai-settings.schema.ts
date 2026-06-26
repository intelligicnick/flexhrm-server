import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformAiSettingsDocument = HydratedDocument<PlatformAiSettings>;

@Schema({ timestamps: true, collection: 'platform_ai_settings' })
export class PlatformAiSettings {
  @Prop({ required: true, unique: true, default: 'default' })
  id!: string;

  @Prop({ default: true })
  chatAssistantEnabled!: boolean;

  @Prop({ default: true })
  reportGeneratorEnabled!: boolean;

  @Prop({ default: false })
  payrollVerificationEnabled!: boolean;

  @Prop({ default: false })
  resumeScreeningEnabled!: boolean;

  @Prop({ default: false })
  attendanceAnomalyEnabled!: boolean;

  @Prop({ default: true })
  hrCopilotEnabled!: boolean;

  @Prop({ default: 'gpt-4o-mini' })
  defaultModel!: string;

  @Prop({ default: 1000 })
  monthlyTokenQuota!: number;

  @Prop({ default: 0 })
  tokensUsedThisMonth!: number;
}

export const PlatformAiSettingsSchema = SchemaFactory.createForClass(PlatformAiSettings);
