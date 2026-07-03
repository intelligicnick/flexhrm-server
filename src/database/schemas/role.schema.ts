import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoleDocument = HydratedDocument<Role>;

@Schema({ _id: false })
export class RolePermissionSchema {
  @Prop({ default: false }) view!: boolean;
  @Prop({ default: false }) edit!: boolean;
  @Prop({ default: false }) delete!: boolean;
}

@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  @Prop({ required: true, index: true, default: 'default' })
  tenantId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ type: Object, default: {} })
  permissions!: Record<string, RolePermissionSchema>;

  /** Optional per-module UI limits (visible filters/columns, locked values). */
  @Prop({ type: Object, default: {} })
  uiRestrictions!: Record<string, Record<string, unknown>>;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

RoleSchema.index(
  { tenantId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
