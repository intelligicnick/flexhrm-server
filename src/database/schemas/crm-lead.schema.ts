import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CrmLeadDocument = HydratedDocument<CrmLead>;

export const CRM_LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const;

@Schema({ timestamps: true, collection: 'crm_leads' })
export class CrmLead {
  @Prop({ default: 'default', index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true })
  companyName!: string;

  @Prop({ default: '' })
  contactPerson!: string;

  @Prop({ default: '' })
  email!: string;

  @Prop({ default: '' })
  phone!: string;

  @Prop({ enum: CRM_LEAD_STATUSES, default: 'new', index: true })
  status!: string;

  @Prop({ default: 0 })
  estimatedValue!: number;

  @Prop({ default: '' })
  source!: string;

  @Prop({ default: '' })
  notes!: string;

  @Prop()
  followUpAt?: Date;
}

export const CrmLeadSchema = SchemaFactory.createForClass(CrmLead);
CrmLeadSchema.index({ tenantId: 1, id: 1 }, { unique: true });
