import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChangeService } from './change.service';
import { CreateChangeDto, UpdateChangeDto } from './dto/change.dto';

@ApiTags('Change Management (CAB)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/changes')
export class ChangeController {
  constructor(private readonly changeService: ChangeService) {}

  @Get()
  @ApiOperation({ summary: 'List & Search Change Requests / RFC Orders' })
  @ApiQuery({ name: 'query', required: false })
  @ApiQuery({ name: 'changeType', required: false })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'approvalState', required: false })
  async findAll(
    @Query('query') query?: string,
    @Query('changeType') changeType?: string,
    @Query('state') state?: string,
    @Query('approvalState') approvalState?: string
  ) {
    return this.changeService.findAll(query, changeType, state, approvalState);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Change Request Order by ID' })
  async findOne(@Param('id') id: string) {
    return this.changeService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create New Change Request Order' })
  async create(@Body() dto: CreateChangeDto) {
    return this.changeService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Change Request Order & CAB Status' })
  async update(@Param('id') id: string, @Body() dto: UpdateChangeDto) {
    return this.changeService.update(id, dto);
  }
}
