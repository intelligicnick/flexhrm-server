import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShiftTemplate, ShiftTemplateSchema, ShiftRoster, ShiftRosterSchema } from '../../database/schemas/shift.schema';
import { ShiftService } from './shift.service';
import { ShiftController } from './shift.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShiftTemplate.name, schema: ShiftTemplateSchema },
      { name: ShiftRoster.name, schema: ShiftRosterSchema },
    ]),
  ],
  controllers: [ShiftController],
  providers: [ShiftService],
  exports: [ShiftService],
})
export class ShiftModule {}
