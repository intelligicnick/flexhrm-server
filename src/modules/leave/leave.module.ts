import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LeaveType, LeaveTypeSchema } from '../../database/schemas/leave-type.schema';
import { LeaveBalance, LeaveBalanceSchema } from '../../database/schemas/leave-balance.schema';
import { LeaveRequest, LeaveRequestSchema } from '../../database/schemas/leave-request.schema';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeaveType.name, schema: LeaveTypeSchema },
      { name: LeaveBalance.name, schema: LeaveBalanceSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
    ]),
    forwardRef(() => WorkflowModule),
  ],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
