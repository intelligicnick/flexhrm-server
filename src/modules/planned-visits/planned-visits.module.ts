import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PlannedVisit,
  PlannedVisitSchema,
} from '../../database/schemas/planned-visit.schema';
import { SchoolWorksModule } from '../school-works/school-works.module';
import { PlannedVisitsController } from './planned-visits.controller';
import { PlannedVisitsService } from './planned-visits.service';
import { SupervisorAccessModule } from '../../common/guards/supervisor-access.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlannedVisit.name, schema: PlannedVisitSchema },
    ]),
    SchoolWorksModule,
    SupervisorAccessModule,
  ],
  controllers: [PlannedVisitsController],
  providers: [PlannedVisitsService],
  exports: [PlannedVisitsService],
})
export class PlannedVisitsModule {}
