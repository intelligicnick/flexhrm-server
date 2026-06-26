import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { TenantSettingsController } from './tenant-settings.controller';

@Module({
  imports: [TenantsModule],
  controllers: [TenantSettingsController],
})
export class TenantSettingsModule {}
