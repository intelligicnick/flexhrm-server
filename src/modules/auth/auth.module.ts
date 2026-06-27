import { Module } from '@nestjs/common';
import { AdminsModule } from '../admins/admins.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { EmailModule } from '../email/email.module';
import { RolesModule } from '../roles/roles.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SchoolSupervisorsModule } from '../school-supervisors/school-supervisors.module';
import { AuthController } from './auth.controller';
import { CaptchaService } from './captcha.service';

@Module({
  imports: [AdminsModule, SessionsModule, AuditLogsModule, RolesModule, EmailModule, SchoolSupervisorsModule],
  controllers: [AuthController],
  providers: [CaptchaService],
})
export class AuthModule {}
