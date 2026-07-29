import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProblemService } from './problem.service';
import { CreateProblemDto, UpdateProblemDto } from './dto/problem.dto';

@ApiTags('Problem Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/problems')
export class ProblemController {
  constructor(private readonly problemService: ProblemService) {}

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
    return this.problemService.findAll(query, priority, state, knownErrorOnly);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Problem Record by ID' })
  async findOne(@Param('id') id: string) {
    return this.problemService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create New Problem Record' })
  async create(@Body() dto: CreateProblemDto) {
    return this.problemService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Problem Record' })
  async update(@Param('id') id: string, @Body() dto: UpdateProblemDto) {
    return this.problemService.update(id, dto);
  }
}
