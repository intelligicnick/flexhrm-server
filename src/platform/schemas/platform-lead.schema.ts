import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformLeadDocument = HydratedDocument<PlatformLead>;

@Schema({ timestamps: true, collection: 'platform_leads' })
export class PlatformLead {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true })
  companyName!: string;

  @Prop({ default: '' })
  contactPerson!: string;

  @Prop({ default: '' })
  email!: string;

  @Prop({ default: '' })
  phone!: string;

  @Prop({ default: 'new', index: true })
  status!: string;

  @Prop({ default: '' })
  source!: string;

  @Prop({ default: 0 })
  estimatedValue!: number;

  @Prop({ default: '' })
  industry!: string;

  @Prop({ default: '' })
  notes!: string;

  @Prop({ type: Date })
  followUpAt?: Date;

  @Prop({ type: Date })
  demoAt?: Date;

  @Prop({ default: '' })
  assignedTo!: string;
}

export const PlatformLeadSchema = SchemaFactory.createForClass(PlatformLead);
