import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CommitmentDiaryService } from './commitment-diary.service';
import {
  CreateCommitmentDiaryDto,
  UpdateCommitmentDiaryDto,
} from './dto/commitment-diary.dto';
import { SupervisorGuard } from '../../common/guards/supervisor.guard';
import {
  RequireAnyPermissions,
} from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AdminSessionPayload } from '../../common/utils/permissions.util';

@Controller('commitment-diary')
export class CommitmentDiaryController {
  constructor(private readonly commitmentDiaryService: CommitmentDiaryService) {}

  @Get()
  @RequireAnyPermissions(['schoolWork'], 'view')
  findAllAdmin(
    @Query('supervisorId') supervisorId?: string,
    @Query('status') status?: string,
    @Query('block') block?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.commitmentDiaryService.findAll({
      supervisorId,
      status,
      block,
      fromDate,
      toDate,
    });
  }

  @Get('supervisor/mine')
  @UseGuards(SupervisorGuard)
  findMine(@Req() req: Request & { user: AdminSessionPayload }) {
    return this.commitmentDiaryService.findAll({
      supervisorId: req.user.employeeId || req.user.username,
    });
  }

  @Post('supervisor')
  @UseGuards(SupervisorGuard)
  create(
    @Req() req: Request & { user: AdminSessionPayload },
    @Body() dto: CreateCommitmentDiaryDto,
  ) {
    const assignedBlocks =
      (req.user as AdminSessionPayload & { assignedBlocks?: string[] })
        .assignedBlocks || [];
    return this.commitmentDiaryService.create(
      req.user.employeeId || req.user.username,
      req.user.username,
      assignedBlocks,
      dto,
    );
  }

  @Patch('supervisor/:id')
  @UseGuards(SupervisorGuard)
  updateAsSupervisor(
    @Req() req: Request & { user: AdminSessionPayload },
    @Param('id') id: string,
    @Body() dto: UpdateCommitmentDiaryDto,
  ) {
    return this.commitmentDiaryService.update(
      id,
      req.user.username,
      'supervisor',
      dto,
      req.user.employeeId || req.user.username,
    );
  }

  @Delete('supervisor/:id')
  @UseGuards(SupervisorGuard)
  async cancelAsSupervisor(
    @Req() req: Request & { user: AdminSessionPayload },
    @Param('id') id: string,
  ) {
    await this.commitmentDiaryService.cancel(
      id,
      req.user.username,
      'supervisor',
      req.user.employeeId || req.user.username,
    );
    return { success: true };
  }

  @Patch(':id')
  @RequireAnyPermissions(['schoolWork'], 'edit')
  updateAsAdmin(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() dto: UpdateCommitmentDiaryDto,
  ) {
    return this.commitmentDiaryService.update(id, username, 'admin', dto);
  }

  @Delete(':id')
  @RequireAnyPermissions(['schoolWork'], 'edit')
  async cancelAsAdmin(
    @CurrentUsername() username: string,
    @Param('id') id: string,
  ) {
    await this.commitmentDiaryService.cancel(id, username, 'admin');
    return { success: true };
  }
}
