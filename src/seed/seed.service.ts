import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_ROLES } from '../common/constants/permissions.constants';
import { AdminsService } from '../modules/admins/admins.service';
import { RolesService } from '../modules/roles/roles.service';
import { EmployeesService } from '../modules/employees/employees.service';
import { LocationsService } from '../modules/locations/locations.service';
import { JobRolesService } from '../modules/job-roles/job-roles.service';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly adminsService: AdminsService,
    private readonly rolesService: RolesService,
    private readonly employeesService: EmployeesService,
    private readonly locationsService: LocationsService,
    private readonly jobRolesService: JobRolesService,
  ) {}

  async onModuleInit(): Promise<void> {
    const seedOnStartup = this.configService.get<boolean>('seedOnStartup') !== false;
    const password = this.configService.get<string>('defaultAdminPassword') ?? 'admin123';
    const bootstrapped = await this.adminsService.ensureBootstrapAdmin(password);
    if (bootstrapped) {
      this.logger.warn(
        'Bootstrapped default admin (username: admin). Change password after first login.',
      );
    }

    if (!seedOnStartup) return;

    const seeded = await this.rolesService.ensureDefaults([...DEFAULT_ROLES]);
    if (seeded > 0) {
      this.logger.log(`Seeded ${seeded} default role(s)`);
    }

    await this.syncMasterDataFromEmployees();
  }

  private async syncMasterDataFromEmployees(): Promise<void> {
    const employees = await this.employeesService.findAll();
    const locations = [
      ...new Set(
        employees
          .map((e: Record<string, unknown>) => String(e.location || '').trim())
          .filter(Boolean),
      ),
    ];
    const roles = [
      ...new Set(
        employees
          .map((e: Record<string, unknown>) => String(e.role || '').trim())
          .filter(Boolean),
      ),
    ];

    if (locations.length) await this.locationsService.syncFromEmployees(locations);
    for (const role of roles) await this.jobRolesService.upsert(role);
  }
}
