import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DeviceAgentDocument = HydratedDocument<DeviceAgent>;
export type EmployeeDeviceDocument = HydratedDocument<EmployeeDevice>;
export type DeviceHeartbeatDocument = HydratedDocument<DeviceHeartbeat>;

@Schema({ timestamps: true, collection: 'device_agents' })
export class DeviceAgent {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ default: '', index: true })
  tenantId!: string;

  @Prop({ default: '', index: true })
  employeeId!: string;

  @Prop({ default: '', index: true })
  employeeCode!: string;

  @Prop({ default: '', index: true })
  profileId!: string;

  @Prop({ default: '' })
  deviceName!: string;

  @Prop({ required: true, unique: true, index: true })
  deviceHash!: string;

  @Prop({ default: '' })
  machineFingerprint!: string;

  @Prop({ default: '' })
  machineUuid!: string;

  @Prop({ default: '' })
  osVersion!: string;

  @Prop({ default: '' })
  ipAddress!: string;

  @Prop({ default: '' })
  publicIp!: string;

  @Prop({ default: '' })
  ram!: string;

  @Prop({ default: '' })
  cpu!: string;

  @Prop({ default: '' })
  storage!: string;

  @Prop({ default: '' })
  macAddress!: string;

  @Prop({ default: '' })
  domainName!: string;

  @Prop({ default: '1.0.0' })
  agentVersion!: string;

  @Prop({ enum: ['pending', 'active', 'revoked', 'offline'], default: 'pending', index: true })
  status!: string;

  @Prop({ default: '', select: false })
  authTokenHash!: string;

  @Prop({ type: Date, default: null })
  lastHeartbeatAt!: Date | null;

  @Prop({ type: Date, default: null })
  lastActivityAt!: Date | null;

  @Prop({ default: '' })
  currentApp!: string;

  @Prop({ default: '' })
  currentWindow!: string;

  @Prop({ default: '' })
  currentWebsite!: string;

  @Prop({ default: 'active' })
  activityState!: string;

  @Prop({ default: 0 })
  todayActiveSeconds!: number;

  @Prop({ default: 0 })
  todayIdleSeconds!: number;
}

export const DeviceAgentSchema = SchemaFactory.createForClass(DeviceAgent);
DeviceAgentSchema.index({ employeeId: 1, status: 1 });

@Schema({ timestamps: true, collection: 'employee_devices' })
export class EmployeeDevice {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true, index: true })
  deviceAgentId!: string;

  @Prop({ type: Date, default: () => new Date() })
  assignedAt!: Date;

  @Prop({ default: false })
  isPrimary!: boolean;
}

export const EmployeeDeviceSchema = SchemaFactory.createForClass(EmployeeDevice);
EmployeeDeviceSchema.index({ employeeId: 1, deviceAgentId: 1 }, { unique: true });

@Schema({ timestamps: true, collection: 'device_heartbeats' })
export class DeviceHeartbeat {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  deviceAgentId!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true, type: Date, index: true })
  timestamp!: Date;

  @Prop({ default: '' })
  ipAddress!: string;

  @Prop({ default: 'online' })
  status!: string;
}

export const DeviceHeartbeatSchema = SchemaFactory.createForClass(DeviceHeartbeat);
DeviceHeartbeatSchema.index({ deviceAgentId: 1, timestamp: -1 });

export type MonitorCommandDocument = HydratedDocument<MonitorCommand>;

@Schema({ timestamps: true, collection: 'monitor_commands' })
export class MonitorCommand {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) deviceAgentId!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ enum: ['capture_screenshot', 'start_live_view', 'stop_live_view'], required: true })
  type!: string;
  @Prop({ enum: ['pending', 'completed', 'failed', 'expired'], default: 'pending', index: true })
  status!: string;
  @Prop({ default: '' }) requestedBy!: string;
  @Prop({ default: '' }) screenshotId!: string;
  @Prop({ default: '' }) liveViewSessionId!: string;
  @Prop({ type: Date, required: true, index: true }) expiresAt!: Date;
  @Prop({ type: Date, default: null }) completedAt!: Date | null;
}

export const MonitorCommandSchema = SchemaFactory.createForClass(MonitorCommand);
MonitorCommandSchema.index({ deviceAgentId: 1, status: 1, createdAt: -1 });
