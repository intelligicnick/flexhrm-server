import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommitmentDiaryDocument = HydratedDocument<CommitmentDiary>;

@Schema({ timestamps: true, collection: 'commitment_diary' })
export class CommitmentDiary {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  supervisorId!: string;

  @Prop({ default: '' })
  supervisorName!: string;

  @Prop({ required: true, index: true })
  fromDate!: string;

  @Prop({ required: true, index: true })
  toDate!: string;

  @Prop({ required: true, index: true })
  schoolWorkId!: string;

  @Prop({ default: '' })
  schoolName!: string;

  @Prop({ default: '' })
  block!: string;

  @Prop({ default: '' })
  notes!: string;

  @Prop({ default: '' })
  adminNotes!: string;

  @Prop({
    enum: ['committed', 'in_progress', 'completed', 'cancelled'],
    default: 'committed',
    index: true,
  })
  status!: string;

  @Prop({ default: '' })
  lastUpdatedBy!: string;

  @Prop({ enum: ['supervisor', 'admin'], default: 'supervisor' })
  lastUpdatedByRole!: string;
}

export const CommitmentDiarySchema =
  SchemaFactory.createForClass(CommitmentDiary);

CommitmentDiarySchema.index({ supervisorId: 1, fromDate: -1 });
CommitmentDiarySchema.index({ status: 1, fromDate: -1 });
