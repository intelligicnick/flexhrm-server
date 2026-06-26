import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CrmLead, CrmLeadSchema } from '../../database/schemas/crm-lead.schema';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: CrmLead.name, schema: CrmLeadSchema }])],
  controllers: [CrmController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
