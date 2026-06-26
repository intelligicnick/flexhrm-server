import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WorkflowRule,
  WorkflowRuleSchema,
  WorkflowExecution,
  WorkflowExecutionSchema,
} from '../../database/schemas/workflow-rule.schema';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { EmailModule } from '../email/email.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkflowRule.name, schema: WorkflowRuleSchema },
      { name: WorkflowExecution.name, schema: WorkflowExecutionSchema },
    ]),
    EmailModule,
    WhatsAppModule,
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
