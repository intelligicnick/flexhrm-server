import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SchoolVisitDocument = HydratedDocument<SchoolVisit>;

@Schema({ _id: false })
export class VisitMaterialGiven {
  @Prop({ default: '' }) item!: string;
  @Prop({ default: 0 }) qty!: number;
}

@Schema({ _id: false })
export class VisitPhoto {
  @Prop({ default: '' }) id!: string;
  @Prop({ default: '' }) caption!: string;
  @Prop({ default: '' }) mimeType!: string;
  @Prop({ default: '' }) filename!: string;
  @Prop({ default: '' }) photoDataBase64!: string;
  @Prop({ default: '' }) imagekitUrl!: string;
  @Prop({ default: '' }) imagekitFileId!: string;
  @Prop({ default: '' }) takenAt!: string;
  @Prop({ default: 0 }) lat!: number;
  @Prop({ default: 0 }) lng!: number;
  @Prop({ default: '' }) locationLabel!: string;
}

@Schema({ _id: false })
export class VisitGpsLocation {
  @Prop({ default: 0 }) lat!: number;
  @Prop({ default: 0 }) lng!: number;
  @Prop({ default: '' }) locationLabel!: string;
  @Prop({ default: 0 }) accuracyMeters!: number;
  @Prop({ default: false }) isMock!: boolean;
  @Prop({ default: '' }) capturedAt!: string;
}

@Schema({ timestamps: true, collection: 'school_visits' })
export class SchoolVisit {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  supervisorId!: string;

  @Prop({ default: '' })
  supervisorName!: string;

  @Prop({ required: true, index: true })
  schoolWorkId!: string;

  @Prop({ default: '' })
  schoolName!: string;

  @Prop({ default: '' })
  udise!: string;

  @Prop({ default: '' })
  block!: string;

  @Prop({ required: true, index: true })
  visitDate!: string;

  @Prop({ type: [VisitMaterialGiven], default: [] })
  materialsGiven!: VisitMaterialGiven[];

  @Prop({ default: '' })
  notes!: string;

  @Prop({ type: [VisitPhoto], default: [] })
  photos!: VisitPhoto[];

  @Prop({ type: VisitGpsLocation })
  gpsLocation?: VisitGpsLocation;

  @Prop({ enum: ['submitted', 'approved', 'rejected'], default: 'submitted' })
  status!: string;

  @Prop({ enum: ['commitment', 'adhoc'], default: 'adhoc', index: true })
  visitType!: string;

  @Prop({ default: '' })
  commitmentId!: string;

  @Prop({ default: 0 })
  distanceToSchoolM!: number;

  @Prop({ default: 0 })
  gpsAccuracyM!: number;

  @Prop({ default: '' })
  locationMatchStatus!: string;

  @Prop({ default: 0 })
  schoolLat!: number;

  @Prop({ default: 0 })
  schoolLng!: number;

  /** APK ping-trail cross-check: verified | no_ping_trail | ping_mock | ping_far_from_school | visit_ping_mismatch */
  @Prop({ default: '' })
  pingVerificationNotes!: string;

  @Prop({ default: 0 })
  pingTrailNearSchoolCount!: number;

  @Prop({ default: 0 })
  pingTrailNearestSchoolM!: number;

  @Prop({ default: 0 })
  pingTrailNearestVisitM!: number;

  @Prop({ default: 0 })
  pingTrailPointCount!: number;

  @Prop({ default: 0 })
  pingTrailWindowMinutes!: number;

  @Prop({ default: false })
  needsReview!: boolean;
}

export const SchoolVisitSchema = SchemaFactory.createForClass(SchoolVisit);

SchoolVisitSchema.index({ supervisorId: 1, visitDate: -1 });
SchoolVisitSchema.index({ schoolWorkId: 1, visitDate: -1 });
