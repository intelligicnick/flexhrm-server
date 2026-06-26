import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RecruitmentService } from './recruitment.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';

@Controller('recruitment')
export class RecruitmentController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get('jobs')
  @RequirePermissions('employees', 'view')
  jobs(@Req() req: Request) {
    return this.recruitmentService.findJobs(req.tenantId);
  }

  @Post('jobs')
  @RequirePermissions('employees', 'edit')
  createJob(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.recruitmentService.createJob(req.tenantId, body as never);
  }

  @Get('applicants')
  @RequirePermissions('employees', 'view')
  applicants(@Req() req: Request, @Query('jobId') jobId?: string) {
    return this.recruitmentService.findApplicants(req.tenantId, jobId);
  }

  @Post('applicants')
  @RequirePermissions('employees', 'edit')
  createApplicant(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.recruitmentService.createApplicant(req.tenantId, body as never);
  }

  @Patch('applicants/:id/stage')
  @RequirePermissions('employees', 'edit')
  updateStage(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { stage: string; interviewAt?: string },
  ) {
    return this.recruitmentService.updateApplicantStage(
      req.tenantId,
      id,
      body.stage,
      body.interviewAt ? new Date(body.interviewAt) : undefined,
    );
  }
}
