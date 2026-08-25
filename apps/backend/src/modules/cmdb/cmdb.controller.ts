import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CmdbService, CreateCIDto, CreateCIRelationshipDto } from './cmdb.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('CMDB & Infrastructure')
@Controller('api/v1/cmdb')
export class CmdbController {
  constructor(private readonly cmdbService: CmdbService) {}

  @Public()
  @Post('ci')
  @ApiOperation({ summary: 'Register a Configuration Item (CI)' })
  async createCI(@Body() dto: CreateCIDto) {
    return this.cmdbService.createCI('tenant_acme_01', dto);
  }

  @Public()
  @Get('ci')
  @ApiOperation({ summary: 'List all Configuration Items (CIs)' })
  async findAllCIs() {
    return this.cmdbService.findAllCIs('tenant_acme_01');
  }

  @Public()
  @Get('ci/:id')
  @ApiOperation({ summary: 'Get Configuration Item topology and details by ID' })
  async findOneCI(@Param('id') id: string) {
    return this.cmdbService.findOneCI('tenant_acme_01', id);
  }

  @Public()
  @Patch('ci/:id')
  @ApiOperation({ summary: 'Update a Configuration Item (e.g. persist SSH credentials/os in attributesJson so the SRE agent can resolve it across environments)' })
  async updateCI(@Param('id') id: string, @Body() dto: Partial<CreateCIDto>) {
    return this.cmdbService.updateCI('tenant_acme_01', id, dto);
  }

  @Public()
  @Post('relationships')
  @ApiOperation({ summary: 'Link two CIs with a dependency relationship (e.g. Runs On, Depends On)' })
  async createRelationship(@Body() dto: CreateCIRelationshipDto) {
    return this.cmdbService.createRelationship(dto);
  }
}
