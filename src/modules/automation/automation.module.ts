import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AutomationWorkflow,
  AutomationWorkflowSchema,
} from '../../database/schemas/automation-workflow.schema';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AutomationWorkflow.name, schema: AutomationWorkflowSchema },
    ]),
  ],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
