import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProblemDto, UpdateProblemDto } from './dto/problem.dto';

export interface ProblemRecord {
  id: string;
  number: string;
  shortDescription: string;
  description: string;
  rootCause: string;
  workaround: string;
  knownError: boolean;
  state: string;
  priority: string;
  configurationItem: string;
  assignedTo: string;
  relatedIncidentsCount: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ProblemService {
  private readonly logger = new Logger(ProblemService.name);

  constructor(private readonly prisma: PrismaService) {}

  private mapProblemToDTO(record: any): ProblemRecord {
    return {
      id: record.id,
      number: record.number,
      shortDescription: record.shortDescription || '',
      description: record.description || '',
      rootCause: record.rootCause || '',
      workaround: record.workaround || '',
      knownError: record.knownError || false,
      state: record.state || 'NEW',
      priority: record.priority || 'MODERATE',
      configurationItem: record.configurationItemName || '',
      assignedTo: record.assignedToName || '',
      relatedIncidentsCount: record.relatedIncidentsCount || 0,
      createdAt: record.createdAt ? record.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: record.updatedAt ? record.updatedAt.toISOString() : new Date().toISOString(),
    };
  }

  async findAll(tenantId: string, query?: string, state?: string): Promise<ProblemRecord[]> {
    const whereClause: any = { tenantId };

    if (query) {
      whereClause.OR = [
        { id: { contains: query, mode: 'insensitive' } },
        { shortDescription: { contains: query, mode: 'insensitive' } },
        { configurationItemName: { contains: query, mode: 'insensitive' } },
        { assignedToName: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (state && state.toLowerCase() !== 'all') {
      whereClause.state = { equals: state, mode: 'insensitive' };
    }

    const records = await this.prisma.problem.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return records.map(r => this.mapProblemToDTO(r));
  }

  async findOne(tenantId: string, id: string): Promise<ProblemRecord> {
    const cleanId = id.toUpperCase();
    const record = await this.prisma.problem.findFirst({
      where: { tenantId, OR: [{ id: cleanId }, { number: cleanId }] },
    });
    
    if (!record) {
      throw new NotFoundException(`Problem Record ${id} not found.`);
    }
    return this.mapProblemToDTO(record);
  }

  async create(tenantId: string, dto: CreateProblemDto): Promise<ProblemRecord> {
    const totalCount = await this.prisma.problem.count({ where: { tenantId } });
    const id = `PRB${String(totalCount + 1).padStart(7, '0')}`;

    const record = await this.prisma.problem.create({
      data: {
        id,
        tenantId,
        number: id,
        shortDescription: dto.shortDescription,
        description: dto.description || `Problem Record #${id}.`,
        state: 'NEW',
        priority: dto.priority || 'MODERATE',
        knownError: dto.knownError || false,
        configurationItemName: dto.configurationItem || 'router-border-nyc-01',
        assignedToName: 'Problem Management Team',
        rootCause: dto.rootCause || 'Under investigation',
        workaround: dto.workaround || 'Pending workaround',
        relatedIncidentsCount: 0,
      }
    });

    return this.mapProblemToDTO(record);
  }

  async update(tenantId: string, id: string, dto: UpdateProblemDto): Promise<ProblemRecord> {
    const cleanId = id.toUpperCase();
    const existing = await this.prisma.problem.findFirst({
      where: { tenantId, OR: [{ id: cleanId }, { number: cleanId }] },
    });

    if (!existing) {
      throw new NotFoundException(`Problem Record ${id} not found.`);
    }

    const updated = await this.prisma.problem.update({
      where: { id: existing.id },
      data: {
        shortDescription: dto.shortDescription !== undefined ? dto.shortDescription : undefined,
        description: dto.description !== undefined ? dto.description : undefined,
        state: dto.state !== undefined ? dto.state : undefined,
        priority: dto.priority !== undefined ? dto.priority : undefined,
        knownError: dto.knownError !== undefined ? dto.knownError : undefined,
        rootCause: dto.rootCause !== undefined ? dto.rootCause : undefined,
        workaround: dto.workaround !== undefined ? dto.workaround : undefined,
        configurationItemName: dto.configurationItem !== undefined ? dto.configurationItem : undefined,
        assignedToName: dto.assignedTo !== undefined ? dto.assignedTo : undefined,
      }
    });

    return this.mapProblemToDTO(updated);
  }
}
