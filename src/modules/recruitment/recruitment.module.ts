import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RecruitmentJob,
  RecruitmentJobSchema,
  RecruitmentApplicant,
  RecruitmentApplicantSchema,
} from '../../database/schemas/recruitment.schema';
import { RecruitmentController } from './recruitment.controller';
import { RecruitmentService } from './recruitment.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RecruitmentJob.name, schema: RecruitmentJobSchema },
      { name: RecruitmentApplicant.name, schema: RecruitmentApplicantSchema },
    ]),
  ],
  controllers: [RecruitmentController],
  providers: [RecruitmentService],
  exports: [RecruitmentService],
})
export class RecruitmentModule {}
