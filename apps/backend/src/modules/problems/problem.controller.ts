import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProblemService } from './problem.service';
import { CreateProblemDto, UpdateProblemDto } from './dto/problem.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Problem Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/problems')
export class ProblemController {
  constructor(private readonly problemService: ProblemService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List & Search Problem Records' })
  @ApiQuery({ name: 'query', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'knownErrorOnly', required: false, type: Boolean })
  async findAll(
    @Query('query') query?: string,
    @Query('priority') priority?: string,
    @Query('state') state?: string,
    @Query('knownErrorOnly') knownErrorOnly?: boolean
  ) {
    return this.problemService.findAll('tenant_acme_01', query, state);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Problem Record by ID' })
  async findOne(@Param('id') id: string) {
    return this.problemService.findOne('tenant_acme_01', id);
  }

  @Public()
  @Post()
  @ApiOperation({ summary: 'Create New Problem Record' })
  async create(@Body() dto: CreateProblemDto) {
    return this.problemService.create('tenant_acme_01', dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Problem Record' })
  async update(@Param('id') id: string, @Body() dto: UpdateProblemDto) {
    return this.problemService.update('tenant_acme_01', id, dto);
  }
}
