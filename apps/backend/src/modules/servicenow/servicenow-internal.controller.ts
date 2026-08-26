import { Controller, Get, Patch, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ServiceNowService } from './servicenow.service';

/**
 * Internal, JWT-protected ServiceNow Table API proxy routes -- these power the
 * MCP server's on-demand servicenow_* tools (servicenow_fetch_queue,
 * servicenow_update_incident, servicenow_add_work_note,
 * servicenow_get_ci_details), which previously had schemas declared in
 * packages/mcp-server/src/index.ts's ListTools handler but no corresponding
 * case in the CallToolRequestSchema switch -- calling any of them threw
 * "Unknown MCP Tool". Distinct from ServiceNowController's public
 * /servicenow/webhook route, which exists specifically for an external
 * ServiceNow instance to call in.
 */
@ApiTags('ServiceNow (Internal)')
@ApiBearerAuth()
@Controller('api/v1/servicenow')
export class ServiceNowInternalController {
  constructor(private readonly serviceNowService: ServiceNowService) {}

  @Get('queue')
  @ApiOperation({ summary: 'Fetch active unassigned incidents from ServiceNow (Table API)' })
  async getQueue(@Query('limit') limit?: string) {
    return this.serviceNowService.fetchQueue(limit ? parseInt(limit, 10) : undefined);
  }

  @Patch('incidents/:sysId')
  @ApiOperation({ summary: 'Update a ServiceNow incident (state, priority, resolution notes, assignment group)' })
  async updateIncident(
    @Param('sysId') sysId: string,
    @Body() body: { state?: string; priority?: string; resolutionNotes?: string; assignmentGroup?: string },
  ) {
    return this.serviceNowService.updateIncident(sysId, body);
  }

  @Post('incidents/:sysId/work-notes')
  @ApiOperation({ summary: 'Post a work note to a ServiceNow incident' })
  async addWorkNote(@Param('sysId') sysId: string, @Body() body: { workNote: string; author?: string }) {
    return this.serviceNowService.addWorkNote(sysId, body.workNote, body.author);
  }

  @Get('cmdb/:ciName')
  @ApiOperation({ summary: 'Query ServiceNow CMDB for Configuration Item details' })
  async getCiDetails(@Param('ciName') ciName: string) {
    return this.serviceNowService.getCiDetails(ciName);
  }
}
