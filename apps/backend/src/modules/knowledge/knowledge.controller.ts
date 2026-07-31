import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { KnowledgeService } from './knowledge.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get Knowledge Base background synthesis status and progress' })
  async getStatus(@Request() req: any) {
    const tenantId = req.user?.tenantId || 'tenant_acme_01';
    return this.knowledgeService.getStatus(tenantId);
  }

  @Public()
  @Get('articles')
  @ApiOperation({ summary: 'List & Search Knowledge Base Articles' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'query', required: false })
  async findAll(@Query('category') category?: string, @Query('query') query?: string) {
    return this.knowledgeService.findAll(category, query);
  }

  @Get('articles/:id')
  @ApiOperation({ summary: 'Get Knowledge Base Article by ID' })
  async findOne(@Param('id') id: string) {
    return this.knowledgeService.findOne(id);
  }

  @Patch('articles/:id')
  @ApiOperation({ summary: 'Update & Save Knowledge Base Article' })
  async updateArticle(@Param('id') id: string, @Body() dto: any) {
    return this.knowledgeService.updateArticle(id, dto);
  }

  @Post('generate-from-incidents')
  @ApiOperation({ summary: 'Run Agentic AI Worker to synthesize KB Articles from Incident Work Notes' })
  async generateFromIncidents(@Request() req: any) {
    const tenantId = req.user?.tenantId || 'tenant_acme_01';
    return this.knowledgeService.synthesizeAllIncidentsInBatches(tenantId);
  }

  @Post('synthesize-all')
  @ApiOperation({ summary: 'Analyze ALL 1,000 Incidents in 10-incident chunks with persistent analyzed tracking' })
  async synthesizeAll(@Request() req: any) {
    const tenantId = req.user?.tenantId || 'tenant_acme_01';
    return this.knowledgeService.synthesizeAllIncidentsInBatches(tenantId);
  }

  @Public()
  @Post('articles')
  @ApiOperation({ summary: 'Create a new Knowledge Base Article' })
  async createArticle(@Body() dto: any) {
    return this.knowledgeService.createArticle(dto);
  }
}
