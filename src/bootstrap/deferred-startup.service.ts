import { Injectable, Logger } from '@nestjs/common';
import { TenantIndexMigrationService } from '../database/tenant-index-migration.service';
import { SeedService } from '../seed/seed.service';
import { PlatformSeedService } from '../platform/seed/platform-seed.service';
import { PlatformExtensionsService } from '../platform/modules/extensions/platform-extensions.service';

/** Non-critical startup work deferred until after HTTP listen (Hostinger deploy health). */
@Injectable()
export class DeferredStartupService {
  private readonly logger = new Logger(DeferredStartupService.name);

  constructor(
    private readonly tenantIndexMigration: TenantIndexMigrationService,
    private readonly seedService: SeedService,
    private readonly platformSeedService: PlatformSeedService,
    private readonly platformExtensionsService: PlatformExtensionsService,
  ) {}

  run(): void {
    void this.runAll().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Deferred startup failed: ${message}`);
    });
  }

  private async runAll(): Promise<void> {
    await this.tenantIndexMigration.run();
    await this.seedService.runDeferredSeed();
    await this.platformSeedService.run();
    await this.platformExtensionsService.seedDefaults();
    this.logger.log('Deferred startup complete');
  }
}
