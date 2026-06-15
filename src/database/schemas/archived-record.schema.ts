import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ARCHIVABLE_SOURCES,
  ArchivableSource,
} from '../../common/constants/archive.constants';

export type ArchivedRecordDocument = HydratedDocument<ArchivedRecord>;

@Schema({ timestamps: true, collection: 'archived_records' })
export class ArchivedRecord {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, enum: ARCHIVABLE_SOURCES, index: true })
  sourceCollection!: ArchivableSource;

  @Prop({ required: true, index: true })
  recordId!: string;

  @Prop({ required: true, type: Date, index: true })
  recordDate!: Date;

  @Prop({ required: true, type: Date, index: true })
  archivedAt!: Date;

  @Prop({ type: Object, required: true })
  payload!: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  photoAssetPaths!: string[];
}

export const ArchivedRecordSchema = SchemaFactory.createForClass(ArchivedRecord);

ArchivedRecordSchema.index({ sourceCollection: 1, recordDate: -1 });
ArchivedRecordSchema.index({ sourceCollection: 1, recordId: 1 }, { unique: true });
ArchivedRecordSchema.index({ archivedAt: -1 });
