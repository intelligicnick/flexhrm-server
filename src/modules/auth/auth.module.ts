import { Module } from '@nestjs/common';
import { AdminsModule } from '../admins/admins.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { RolesModule } from '../roles/roles.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AuthController } from './auth.controller';

@Module({
  imports: [AdminsModule, SessionsModule, AuditLogsModule, RolesModule],
  controllers: [AuthController],
})
export class AuthModule {}
