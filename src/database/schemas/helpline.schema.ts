import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HelplineDocument = HydratedDocument<Helpline>;

@Schema({ timestamps: true, collection: 'helplines' })
export class Helpline {
  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  phone!: string;

  @Prop({ default: '' })
  location!: string;

  @Prop({ default: '' })
  category!: string;
}

export const HelplineSchema = SchemaFactory.createForClass(Helpline);
