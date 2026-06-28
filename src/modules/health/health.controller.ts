import { Controller, Get, Post, Body } from '@nestjs/common';
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
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get()
  async check() {
    const ready = this.connection.readyState === 1;
    const databaseName = ready ? this.connection.db?.databaseName ?? 'unknown' : 'disconnected';
    let employeesDefaultTenant = 0;
    let employeesTotal = 0;
    if (ready) {
      employeesDefaultTenant = await this.employeesService.count();
      const employeesCollection = this.connection.db?.collection('employees');
      employeesTotal = employeesCollection
        ? await employeesCollection.countDocuments({})
        : 0;
    }
    return {
      status: ready ? 'healthy' : 'degraded',
      storage: 'mongodb',
      ready,
      databaseName,
      database: ready ? `${employeesDefaultTenant} employees (default tenant)` : 'disconnected',
      employeesDefaultTenant,
      employeesTotal,
      smtpConfigured: this.emailService.isConfigured(),
    };
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
