import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AppMetaDocument = HydratedDocument<AppMeta>;

@Schema({ collection: 'app_meta', timestamps: false })
export class AppMeta {
  @Prop({ required: true, unique: true })
  metaKey!: string;

  @Prop({ required: true })
  metaValue!: string;
}

export const AppMetaSchema = SchemaFactory.createForClass(AppMeta);
