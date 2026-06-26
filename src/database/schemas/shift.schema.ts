import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShiftTemplateDocument = HydratedDocument<ShiftTemplate>;

@Schema({ timestamps: true, collection: 'shift_templates' })
export class ShiftTemplate {
  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true, index: true, default: 'default' })
  tenantId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  code!: string;

  @Prop({ default: '09:00' })
  startTime!: string;

  @Prop({ default: '18:00' })
  endTime!: string;

  @Prop({ default: 0 })
  breakMinutes!: number;

  @Prop({ default: false })
  isNightShift!: boolean;

  @Prop({ default: true })
  active!: boolean;

  @Prop({ default: '' })
  description!: string;
}

export const ShiftTemplateSchema = SchemaFactory.createForClass(ShiftTemplate);
ShiftTemplateSchema.index({ tenantId: 1, code: 1 }, { unique: true });

@Schema({ _id: false })
export class ShiftAssignment {
  @Prop({ required: true }) employeeId!: string;
  @Prop({ required: true }) shiftTemplateId!: string;
}

@Schema({ timestamps: true, collection: 'shift_rosters' })
export class ShiftRoster {
  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true, index: true, default: 'default' })
  tenantId!: string;

  @Prop({ required: true, index: true })
  monthKey!: string;

  @Prop({ default: '' })
  location!: string;

  @Prop({ type: [ShiftAssignment], default: [] })
  assignments!: ShiftAssignment[];

  @Prop({ default: '' })
  notes!: string;
}

export type ShiftRosterDocument = HydratedDocument<ShiftRoster>;
export const ShiftRosterSchema = SchemaFactory.createForClass(ShiftRoster);
ShiftRosterSchema.index({ tenantId: 1, monthKey: 1, location: 1 });
