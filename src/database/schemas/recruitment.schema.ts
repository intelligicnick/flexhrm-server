import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RecruitmentJobDocument = HydratedDocument<RecruitmentJob>;

@Schema({ timestamps: true, collection: 'recruitment_jobs' })
export class RecruitmentJob {
  @Prop({ default: 'default', index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  department!: string;

  @Prop({ default: '' })
  location!: string;

  @Prop({ default: 'open', index: true })
  status!: string;

  @Prop({ default: 0 })
  openings!: number;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: 0 })
  applicantCount!: number;
}

export const RecruitmentJobSchema = SchemaFactory.createForClass(RecruitmentJob);
RecruitmentJobSchema.index({ tenantId: 1, id: 1 }, { unique: true });

@Schema({ timestamps: true, collection: 'recruitment_applicants' })
export class RecruitmentApplicant {
  @Prop({ default: 'default', index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  jobId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  email!: string;

  @Prop({ default: '' })
  phone!: string;

  @Prop({ default: 'applied', index: true })
  stage!: string;

  @Prop()
  interviewAt?: Date;

  @Prop({ default: '' })
  resumeUrl!: string;
}

export type RecruitmentApplicantDocument = HydratedDocument<RecruitmentApplicant>;
export const RecruitmentApplicantSchema = SchemaFactory.createForClass(RecruitmentApplicant);
RecruitmentApplicantSchema.index({ tenantId: 1, id: 1 }, { unique: true });
