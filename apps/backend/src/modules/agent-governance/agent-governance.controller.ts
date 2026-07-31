import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AgentGovernanceService, AgentApproval, AgentHistoryEntry } from './agent-governance.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Agent Governance & Approvals')
@Controller('api/v1/agent')
export class AgentGovernanceController {
  constructor(private readonly governanceService: AgentGovernanceService) {}

  @Public()
  @Get('approvals')
  @ApiOperation({ summary: 'Get pending or all agent approval requests' })
  getApprovals(@Query('status') status?: string) {
    if (status === 'pending') {
      return this.governanceService.getPendingApprovals();
    }
    return this.governanceService.getAllApprovals();
  }

  @Public()
  @Get('approvals/:id')
  @ApiOperation({ summary: 'Get specific agent approval request details' })
  getApprovalById(@Param('id') id: string) {
    return this.governanceService.getApprovalById(id);
  }

  @Public()
  @Post('approvals')
  @ApiOperation({ summary: 'Create a new pending approval request from an autonomous agent' })
  createApprovalRequest(@Body() dto: Partial<AgentApproval>) {
    return this.governanceService.createApprovalRequest(dto);
  }

  @Public()
  @Post('approvals/:id/approve')
  @ApiOperation({ summary: 'Human in the Loop: Approve and execute agent remediation action' })
  approveRequest(
    @Param('id') id: string,
    @Body('approverName') approverName?: string,
  ) {
    return this.governanceService.approveRequest(id, approverName || 'System Admin (Human in the Loop)');
  }

  @Public()
  @Post('approvals/:id/reject')
  @ApiOperation({ summary: 'Human in the Loop: Reject agent execution request with feedback' })
  rejectRequest(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Body('rejectorName') rejectorName?: string,
  ) {
    return this.governanceService.rejectRequest(id, reason, rejectorName || 'System Admin');
  }

  @Public()
  @Get('history')
  @ApiOperation({ summary: 'Get full historical log stream of agent operations over time' })
  getHistory() {
    return this.governanceService.getHistory();
  }

  @Public()
  @Post('history')
  @ApiOperation({ summary: 'Post historical trace log entry from agent execution' })
  createHistoryEntry(@Body() dto: Partial<AgentHistoryEntry>) {
    return this.governanceService.createHistoryEntry(dto);
  }

  @Public()
  @Get('stats')
  @ApiOperation({ summary: 'Get summary statistics for governance dashboard KPIs' })
  getStats() {
    return this.governanceService.getGovernanceStats();
  }

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Get active model and environment configuration' })
  getConfig() {
    return this.governanceService.getModelConfig();
  }

  @Public()
  @Post('config')
  @ApiOperation({ summary: 'Update model and environment configuration' })
  updateConfig(@Body() patch: any) {
    return this.governanceService.updateModelConfig(patch);
  }

  @Public()
  @Get('timeline')
  @ApiOperation({ summary: 'Get active agent execution progress timelines' })
  getTimeline() {
    return this.governanceService.getTimeline();
  }

  @Public()
  @Post('timeline')
  @ApiOperation({ summary: 'Update agent execution step or status' })
  updateTimeline(@Body() dto: any) {
    return this.governanceService.updateTimeline(dto);
  }

  @Public()
  @Post('reset-locks')
  @ApiOperation({ summary: 'Force reset stuck execution locks and refresh governance state' })
  resetLocks() {
    return this.governanceService.resetLocks();
  }
}
