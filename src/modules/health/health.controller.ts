import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Public } from '../../common/decorators/auth.decorators';
import { EmployeesService } from '../employees/employees.service';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly employeesService: EmployeesService,
  ) {}

  @Public()
  @Get()
  async check() {
    const ready = this.connection.readyState === 1;
    let employeeCount = 0;
    if (ready) {
      employeeCount = await this.employeesService.count();
    }
    return {
      status: ready ? 'healthy' : 'degraded',
      storage: 'mongodb',
      ready,
      database: ready ? `${employeeCount} employees` : 'disconnected',
    };
  }
}
