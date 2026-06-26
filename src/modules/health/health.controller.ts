import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../../common/decorators/auth.decorators';
import { EmployeesService } from '../employees/employees.service';
import { EmailService } from '../email/email.service';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly employeesService: EmployeesService,
    private readonly emailService: EmailService,
  ) {}

  @Public()
  @Get()
  async check(@Query('verifySmtp') verifySmtp?: string) {
    const ready = this.connection.readyState === 1;
    let employeeCount = 0;
    if (ready) {
      employeeCount = await this.employeesService.count();
    }
    const smtpConfigured = this.emailService.isConfigured();
    const payload: Record<string, unknown> = {
      status: ready ? 'healthy' : 'degraded',
      storage: 'mongodb',
      ready,
      database: ready ? `${employeeCount} employees` : 'disconnected',
      smtpConfigured,
    };
    if (verifySmtp === 'true' || verifySmtp === '1') {
      payload.smtp = smtpConfigured
        ? await this.emailService.verifyConnection()
        : { ok: false, error: 'SMTP not configured' };
    }
    return payload;
  }

  /** Dev-only debug ingest for extension runtime evidence. */
  @Public()
  @Post('debug-ingest')
  debugIngest(@Body() body: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false };
    }
    const logPath = path.resolve(process.cwd(), '../.cursor/debug-3941a9.log');
    const line = `${JSON.stringify({ ...body, timestamp: Date.now() })}\n`;
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, line, 'utf8');
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
}
