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
  @ApiOperation({ summary: 'Retrieve agent governance, safety compliance, and approval metrics' })
  getStats() {
    return this.governanceService.getGovernanceStats();
  }
}
