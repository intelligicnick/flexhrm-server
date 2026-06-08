import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type JobRoleDocument = HydratedDocument<JobRole>;

@Schema({ timestamps: true, collection: 'job_roles' })
export class JobRole {
  @Prop({ required: true, unique: true, index: true })
  name!: string;

  @Prop({ default: false, index: true })
  deleted!: boolean;
}

export const JobRoleSchema = SchemaFactory.createForClass(JobRole);
