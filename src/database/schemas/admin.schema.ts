import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AdminDocument = HydratedDocument<Admin>;

@Schema({ timestamps: true, collection: 'admins' })
export class Admin {
  @Prop({ required: true, unique: true, index: true, lowercase: true, trim: true })
  username!: string;

  @Prop({ required: true, select: false })
  password!: string;

  @Prop({ lowercase: true, trim: true, sparse: true, unique: true })
  email?: string;

  @Prop({ default: 'System' })
  invitedBy!: string;

  @Prop({ default: 'admin', index: true })
  role!: string;

  @Prop({ type: [String], default: [] })
  locations!: string[];

  @Prop({ default: false, index: true })
  disabled!: boolean;

  @Prop({ default: () => new Date().toISOString() })
  createdAt!: string;

  @Prop({ select: false })
  passwordResetToken?: string;

  @Prop()
  passwordResetExpires?: Date;
}

export const AdminSchema = SchemaFactory.createForClass(Admin);

AdminSchema.index({ username: 1 }, { collation: { locale: 'en', strength: 2 } });
