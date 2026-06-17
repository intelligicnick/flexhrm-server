import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CaptureCandidateDocument = HydratedDocument<CaptureCandidate>;

@Schema({ _id: false })
export class CaptureExperience {
  @Prop({ default: '' }) company!: string;
  @Prop({ default: '' }) designation!: string;
  @Prop({ default: '' }) duration!: string;
  @Prop({ default: '' }) description!: string;
}

@Schema({ _id: false })
export class CaptureEducation {
  @Prop({ default: '' }) degree!: string;
  @Prop({ default: '' }) college!: string;
  @Prop({ default: '' }) university!: string;
  @Prop({ default: '' }) passingYear!: string;
}

@Schema({ _id: false })
export class CaptureFieldConfidence {
  @Prop({ required: true }) field!: string;
  @Prop({ default: 0 }) confidence!: number;
  @Prop({ default: '' }) value!: string;
}

@Schema({ timestamps: true, collection: 'capture_candidates' })
export class CaptureCandidate {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ default: '', index: true })
  organizationId!: string;

  @Prop({ default: '', index: true })
  fullName!: string;

  @Prop({ default: '', index: true })
  email!: string;

  @Prop({ default: '', index: true })
  mobile!: string;

  @Prop({ default: '' }) address!: string;
  @Prop({ default: '' }) currentLocation!: string;
  @Prop({ default: '' }) dateOfBirth!: string;

  @Prop({ type: [String], default: [] }) skills!: string[];
  @Prop({ type: [CaptureExperience], default: [] }) experience!: CaptureExperience[];
  @Prop({ default: '' }) currentCompany!: string;
  @Prop({ type: [String], default: [] }) previousCompanies!: string[];
  @Prop({ default: '' }) designation!: string;
  @Prop({ default: '' }) industry!: string;
  @Prop({ default: '' }) salary!: string;
  @Prop({ default: '' }) expectedSalary!: string;
  @Prop({ default: '' }) noticePeriod!: string;

  @Prop({ type: [CaptureEducation], default: [] }) education!: CaptureEducation[];
  @Prop({ type: [String], default: [] }) certifications!: string[];
  @Prop({ type: [String], default: [] }) languages!: string[];
  @Prop({ default: '' }) linkedInUrl!: string;
  @Prop({ default: '' }) portfolioUrl!: string;

  @Prop({ default: '' }) sourceUrl!: string;
  @Prop({ default: '' }) sourceTitle!: string;
  @Prop({ default: '' }) sourceSite!: string;
  @Prop({ default: '' }) capturedBy!: string;
  @Prop({ default: '' }) rawContent!: string;

  @Prop({ type: [CaptureFieldConfidence], default: [] })
  fieldConfidences!: CaptureFieldConfidence[];

  @Prop({ default: 0 }) overallConfidence!: number;
  @Prop({ default: 'draft' }) status!: string;
  @Prop({ default: '' }) employeeId!: string;
  @Prop({ type: Object, default: {} }) metadata!: Record<string, unknown>;
}

export const CaptureCandidateSchema = SchemaFactory.createForClass(CaptureCandidate);
