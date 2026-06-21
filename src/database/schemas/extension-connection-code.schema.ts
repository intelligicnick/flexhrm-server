import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ExtensionConnectionCodeDocument = HydratedDocument<ExtensionConnectionCode>;

@Schema({ timestamps: true, collection: 'extension_connection_codes' })
export class ExtensionConnectionCode {
  @Prop({ required: true, unique: true, index: true })
  code!: string;

  @Prop({ required: true })
  username!: string;

  @Prop({ default: 'admin' })
  role!: string;

  @Prop({ type: [String], default: [] })
  locations!: string[];

  @Prop({ default: 'default' })
  organizationId!: string;

  @Prop({ required: true })
  flexhrmUrl!: string;

  @Prop({ required: true, index: true })
  expiresAt!: Date;

  @Prop({ default: false })
  used!: boolean;

  @Prop({ default: '' })
  createdBy!: string;
}

export const ExtensionConnectionCodeSchema =
  SchemaFactory.createForClass(ExtensionConnectionCode);

ExtensionConnectionCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
