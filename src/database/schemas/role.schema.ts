import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoleDocument = HydratedDocument<Role>;

@Schema({ _id: false })
export class RolePermissionSchema {
  @Prop({ default: false }) view!: boolean;
  @Prop({ default: false }) edit!: boolean;
}

@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  @Prop({ required: true, unique: true, index: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ type: Object, default: {} })
  permissions!: Record<string, RolePermissionSchema>;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

RoleSchema.index({ name: 1 }, { collation: { locale: 'en', strength: 2 } });
