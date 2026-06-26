import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RecruitmentJob,
  RecruitmentJobDocument,
  RecruitmentApplicant,
  RecruitmentApplicantDocument,
} from '../../database/schemas/recruitment.schema';
import { generateToken } from '../../common/utils/password.util';
import { withTenantId, resolveTenantId } from '../../common/utils/tenant.util';

@Injectable()
export class RecruitmentService {
  constructor(
    @InjectModel(RecruitmentJob.name) private readonly jobModel: Model<RecruitmentJobDocument>,
    @InjectModel(RecruitmentApplicant.name)
    private readonly applicantModel: Model<RecruitmentApplicantDocument>,
  ) {}

  async findJobs(tenantId?: string): Promise<RecruitmentJob[]> {
    return this.jobModel.find(withTenantId(tenantId)).sort({ createdAt: -1 }).lean().exec();
  }

  async createJob(tenantId: string | undefined, data: Partial<RecruitmentJob>): Promise<RecruitmentJob> {
    const doc = await this.jobModel.create({
      ...data,
      tenantId: resolveTenantId(tenantId),
      id: data.id ?? `job_${generateToken().slice(0, 10)}`,
    });
    return doc.toObject();
  }

  async findApplicants(tenantId: string | undefined, jobId?: string): Promise<RecruitmentApplicant[]> {
    const filter = withTenantId(tenantId, jobId ? { jobId } : {});
    return this.applicantModel.find(filter).sort({ createdAt: -1 }).lean().exec();
  }

  async createApplicant(
    tenantId: string | undefined,
    data: Partial<RecruitmentApplicant>,
  ): Promise<RecruitmentApplicant> {
    const doc = await this.applicantModel.create({
      ...data,
      tenantId: resolveTenantId(tenantId),
      id: data.id ?? `app_${generateToken().slice(0, 10)}`,
    });
    if (data.jobId) {
      await this.jobModel.updateOne(
        withTenantId(tenantId, { id: data.jobId }),
        { $inc: { applicantCount: 1 } },
      );
    }
    return doc.toObject();
  }

  async updateApplicantStage(
    tenantId: string | undefined,
    id: string,
    stage: string,
    interviewAt?: Date,
  ): Promise<RecruitmentApplicant> {
    const doc = await this.applicantModel
      .findOneAndUpdate(
        withTenantId(tenantId, { id }),
        { $set: { stage, ...(interviewAt ? { interviewAt } : {}) } },
        { new: true },
      )
      .lean();
    if (!doc) throw new NotFoundException('Applicant not found');
    return doc as RecruitmentApplicant;
  }
}
