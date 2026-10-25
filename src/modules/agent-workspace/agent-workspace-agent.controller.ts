import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/auth.decorators';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator';
import { DeviceAgentDocument } from '../../database/schemas/monitor-device.schema';
import { AgentAuthGuard } from '../employee-monitor/guards/agent-auth.guard';
import { AgentWorkspaceService } from './agent-workspace.service';
import {
  CompleteAgentTaskDto,
  RegisterLanSharedFolderDto,
  ReportSelfCompletedTaskDto,
  UploadAgentSharedFileDto,
} from './dto/agent-workspace.dto';

@SkipCsrf()
@Controller('monitor/agent/workspace')
export class AgentWorkspaceAgentController {
  constructor(private readonly workspaceService: AgentWorkspaceService) {}

  @Public()
  @UseGuards(AgentAuthGuard)
  @Get('tasks')
  listTasks(@Req() req: { deviceAgent: DeviceAgentDocument }) {
    return this.workspaceService.listTasksForAgent(req.deviceAgent);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Post('tasks/:id/complete')
  @HttpCode(200)
  completeTask(
    @Req() req: { deviceAgent: DeviceAgentDocument },
    @Param('id') id: string,
    @Body() dto: CompleteAgentTaskDto,
  ) {
    return this.workspaceService.completeTask(req.deviceAgent, id, dto.note);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Post('tasks/report-done')
  @HttpCode(200)
  reportSelfCompleted(
    @Req() req: { deviceAgent: DeviceAgentDocument },
    @Body() dto: ReportSelfCompletedTaskDto,
  ) {
    return this.workspaceService.reportSelfCompletedTask(req.deviceAgent, dto.title, dto.note);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Get('shared-folders')
  listFolders(@Req() req: { deviceAgent: DeviceAgentDocument }) {
    return this.workspaceService.listSharedFolders(req.deviceAgent);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Get('shared-folders/:employeeId/files')
  listFolderFiles(
    @Req() req: { deviceAgent: DeviceAgentDocument },
    @Param('employeeId') employeeId: string,
  ) {
    return this.workspaceService.listSharedFolderFiles(req.deviceAgent, employeeId);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Post('shared-files')
  @HttpCode(200)
  uploadFile(
    @Req() req: { deviceAgent: DeviceAgentDocument },
    @Body() dto: UploadAgentSharedFileDto,
  ) {
    return this.workspaceService.uploadSharedFile(req.deviceAgent, dto);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Get('shared-files/:id/file')
  async downloadFile(
    @Req() req: { deviceAgent: DeviceAgentDocument },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    await this.workspaceService.downloadSharedFile(req.deviceAgent, id, res);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Delete('shared-files/:id')
  deleteFile(@Req() req: { deviceAgent: DeviceAgentDocument }, @Param('id') id: string) {
    return this.workspaceService.deleteSharedFile(req.deviceAgent, id);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Get('lan-shared-folders')
  listLanSharedFolders(@Req() req: { deviceAgent: DeviceAgentDocument }) {
    return this.workspaceService.listLanSharedFolders(req.deviceAgent);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Post('lan-shared-folders')
  @HttpCode(200)
  registerLanSharedFolder(
    @Req() req: { deviceAgent: DeviceAgentDocument },
    @Body() dto: RegisterLanSharedFolderDto,
  ) {
    return this.workspaceService.registerLanSharedFolder(req.deviceAgent, dto);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Delete('lan-shared-folders/:folderId')
  deleteLanSharedFolder(
    @Req() req: { deviceAgent: DeviceAgentDocument },
    @Param('folderId') folderId: string,
  ) {
    return this.workspaceService.deleteLanSharedFolder(req.deviceAgent, folderId);
  }
}
