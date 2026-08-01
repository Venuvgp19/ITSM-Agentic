import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateChangeDto, UpdateChangeDto } from './dto/change.dto';

export interface ChangeRecord {
  id: string;
  number: string;
  title: string;
  description: string;
  changeType: 'STANDARD' | 'NORMAL' | 'EMERGENCY' | string;
  state: 'DRAFT' | 'ASSESS' | 'AUTHORIZE' | 'SCHEDULED' | 'IMPLEMENTATION' | 'REVIEW' | 'CLOSED' | 'CANCELLED' | string;
  approvalState: 'NOT_REQUESTED' | 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | string;
  riskScore: number;
  configurationItem: string;
  assignedTo: string;
  requestedBy: string;
  plannedStartDate: string;
  plannedEndDate: string;
  implementationPlan: string;
  backoutPlan: string;
  cabNotes: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ChangeService {
  private readonly logger = new Logger(ChangeService.name);

  constructor(private readonly prisma: PrismaService) {}

  private mapChangeToDTO(record: any): ChangeRecord {
    return {
      id: record.id,
      number: record.number,
      title: record.title || '',
      description: record.description || '',
      changeType: record.changeType || 'NORMAL',
      state: record.state || 'DRAFT',
      approvalState: record.approvalState || 'NOT_REQUESTED',
      riskScore: record.riskScore || 1,
      configurationItem: record.configurationItemName || '',
      assignedTo: record.assignedToName || '',
      requestedBy: record.requestedByName || '',
      plannedStartDate: record.plannedStartDate ? record.plannedStartDate.toISOString() : '',
      plannedEndDate: record.plannedEndDate ? record.plannedEndDate.toISOString() : '',
      implementationPlan: record.implementationPlan || '',
      backoutPlan: record.backoutPlan || '',
      cabNotes: record.cabNotes || '',
      createdAt: record.createdAt ? record.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: record.updatedAt ? record.updatedAt.toISOString() : new Date().toISOString(),
    };
  }

  async findAll(tenantId: string, query?: string, changeType?: string, state?: string, approvalState?: string): Promise<ChangeRecord[]> {
    const whereClause: any = { tenantId };

    if (query) {
      whereClause.OR = [
        { id: { contains: query, mode: 'insensitive' } },
        { title: { contains: query, mode: 'insensitive' } },
        { configurationItemName: { contains: query, mode: 'insensitive' } },
        { assignedToName: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (changeType && changeType.toLowerCase() !== 'all') {
      whereClause.changeType = { equals: changeType, mode: 'insensitive' };
    }

    if (state && state.toLowerCase() !== 'all') {
      whereClause.state = { equals: state, mode: 'insensitive' };
    }

    if (approvalState && approvalState.toLowerCase() !== 'all') {
      whereClause.approvalState = { equals: approvalState, mode: 'insensitive' };
    }

    const records = await this.prisma.changeRequest.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return records.map(r => this.mapChangeToDTO(r));
  }

  async findOne(tenantId: string, id: string): Promise<ChangeRecord> {
    const cleanId = id.toUpperCase();
    const record = await this.prisma.changeRequest.findFirst({
      where: { tenantId, OR: [{ id: cleanId }, { number: cleanId }] },
    });
    
    if (!record) {
      throw new NotFoundException(`Change Order ${id} not found.`);
    }
    return this.mapChangeToDTO(record);
  }

  async create(tenantId: string, dto: CreateChangeDto): Promise<ChangeRecord> {
    const totalCount = await this.prisma.changeRequest.count({ where: { tenantId } });
    const id = `CHG${String(totalCount + 1).padStart(7, '0')}`;

    const record = await this.prisma.changeRequest.create({
      data: {
        id,
        tenantId,
        number: id,
        title: dto.title,
        description: dto.description || `Change Request #${id}.`,
        changeType: dto.changeType || 'NORMAL',
        state: 'DRAFT',
        approvalState: 'NOT_REQUESTED',
        riskScore: dto.riskScore || 2,
        configurationItemName: dto.configurationItem || 'router-border-nyc-01',
        assignedToName: 'Change Advisory Board (CAB)',
        requestedByName: 'System Admin',
        plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : new Date(Date.now() + 86400000),
        plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : new Date(Date.now() + 97200000),
        implementationPlan: dto.implementationPlan || '1. Pre-flight backup.\n2. Package installation.\n3. Service restart.',
        backoutPlan: dto.backoutPlan || '1. Rollback configuration.\n2. Restore DB snapshot.',
        cabNotes: 'Pending CAB Review.',
      }
    });

    return this.mapChangeToDTO(record);
  }

  async update(tenantId: string, id: string, dto: UpdateChangeDto): Promise<ChangeRecord> {
    const cleanId = id.toUpperCase();
    const existing = await this.prisma.changeRequest.findFirst({
      where: { tenantId, OR: [{ id: cleanId }, { number: cleanId }] },
    });

    if (!existing) {
      throw new NotFoundException(`Change Order ${id} not found.`);
    }

    const updated = await this.prisma.changeRequest.update({
      where: { id: existing.id },
      data: {
        title: dto.title !== undefined ? dto.title : undefined,
        description: dto.description !== undefined ? dto.description : undefined,
        state: dto.state !== undefined ? dto.state : undefined,
        approvalState: dto.approvalState !== undefined ? dto.approvalState : undefined,
        changeType: dto.changeType !== undefined ? dto.changeType : undefined,
        riskScore: dto.riskScore !== undefined ? dto.riskScore : undefined,
        configurationItemName: dto.configurationItem !== undefined ? dto.configurationItem : undefined,
        assignedToName: dto.assignedTo !== undefined ? dto.assignedTo : undefined,
        implementationPlan: dto.implementationPlan !== undefined ? dto.implementationPlan : undefined,
        backoutPlan: dto.backoutPlan !== undefined ? dto.backoutPlan : undefined,
        cabNotes: dto.cabNotes !== undefined ? dto.cabNotes : undefined,
      }
    });

    return this.mapChangeToDTO(updated);
  }
}
