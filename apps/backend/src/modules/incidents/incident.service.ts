import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateIncidentDto, UpdateIncidentDto, AddActivityDto } from './dto/incident.dto';
import { Impact, Urgency, Priority } from '@itsm/db';

const resolutionCodes = [
  'Pending Triage',
  'Server - Kernel & OS Patch',
  'DB - Connection Pool & Vacuum',
  'Application - Code & SSO Fix',
  'Hardware - Component Replacement',
  'Network - BGP & Interface Reset',
  'Security - TLS & Firewall Rule',
  'User Error - Training Provided',
];

@Injectable()
export class IncidentService {
  constructor(private prisma: PrismaService) {}

  getFieldsDictionary() {
    return {
      entity: 'Incident',
      table: 'incidents',
      totalFields: 16,
      fields: [
        { name: 'id', label: 'Sys ID', type: 'UUID', required: true, readOnly: true },
        { name: 'number', label: 'Incident Number', type: 'String', required: true, readOnly: true },
        { name: 'shortDescription', label: 'Short Description', type: 'String', required: true, readOnly: false },
        { name: 'description', label: 'Detailed Description', type: 'Text', required: false, readOnly: false },
        { name: 'state', label: 'Incident State', type: 'Enum', required: true, readOnly: false, options: ['NEW', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED'], defaultValue: 'NEW' },
        { name: 'impact', label: 'Impact', type: 'Enum', required: true, readOnly: false, options: ['ENTERPRISE', 'DEPARTMENT', 'TEAM', 'INDIVIDUAL'], defaultValue: 'TEAM' },
        { name: 'urgency', label: 'Urgency', type: 'Enum', required: true, readOnly: false, options: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], defaultValue: 'MEDIUM' },
        { name: 'priority', label: 'Priority', type: 'Enum', required: true, readOnly: true, options: ['P1 - CRITICAL', 'P2 - HIGH', 'P3 - MODERATE', 'P4 - LOW'] },
        { name: 'department', label: 'Department', type: 'Enum', required: true, readOnly: false, options: ['UNASSIGNED (No Team)', 'Unix', 'Network Ops', 'App Support', 'Desktop Support', 'DevOps Ops', 'SecOps', 'DBA Team'] },
        { name: 'assignedTo', label: 'Assigned Technician', type: 'Reference (User)', required: false, readOnly: false },
        { name: 'caller', label: 'Caller / Reporter', type: 'Reference (User)', required: true, readOnly: false },
        { name: 'configurationItem', label: 'Configuration Item (CI)', type: 'Reference (CI)', required: false, readOnly: false },
        { name: 'resolutionCode', label: 'Resolution Code (Close Code)', type: 'Enum', required: false, readOnly: false, options: resolutionCodes },
        { name: 'resolutionNotes', label: 'Resolution Notes', type: 'Text', required: false, readOnly: false },
        { name: 'createdAt', label: 'Created Timestamp', type: 'DateTime', required: true, readOnly: true },
        { name: 'activities', label: 'Activity Log Stream', type: 'Array<Activity>', required: false, readOnly: false },
      ],
    };
  }

  calculatePriority(impact: Impact, urgency: Urgency): Priority {
    if (impact === Impact.ENTERPRISE && urgency === Urgency.CRITICAL) return Priority.CRITICAL;
    if (impact === Impact.ENTERPRISE || urgency === Urgency.CRITICAL) return Priority.HIGH;
    if (impact === Impact.DEPARTMENT || urgency === Urgency.HIGH) return Priority.MODERATE;
    return Priority.LOW;
  }

  private mapIncidentToDTO(record: any) {
    if (!record) return null;
    return {
      ...record,
      activities: record.activitiesJson || [],
      assignedTo: record.assignedToName,
      caller: record.callerName,
      configurationItem: record.configurationItemName,
    };
  }

  async create(tenantId: string, callerId: string, dto: CreateIncidentDto) {
    // Find the max existing incident number to avoid duplicates
    const lastIncident = await this.prisma.$queryRaw<{number: string}[]>`
      SELECT number FROM "Incident" 
      WHERE number LIKE 'INC%' AND "tenantId" = ${tenantId}
      ORDER BY CAST(SUBSTRING(number FROM 4) AS INTEGER) DESC
      LIMIT 1
    `;
    
    let nextNum = 1;
    if (lastIncident && lastIncident.length > 0) {
      const match = lastIncident[0].number.match(/INC(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const nextNumber = `INC${String(nextNum).padStart(7, '0')}`;
    const priorityVal = dto.priority || (this.calculatePriority(dto.impact as Impact || Impact.DEPARTMENT, dto.urgency as Urgency || Urgency.HIGH));

    const record = await this.prisma.incident.create({
      data: {
        tenantId,
        number: nextNumber,
        shortDescription: dto.shortDescription,
        description: dto.description || dto.shortDescription,
        state: dto.state || 'NEW',
        impact: dto.impact || 'DEPARTMENT',
        urgency: dto.urgency || 'HIGH',
        priority: priorityVal,
        callerName: dto.caller || 'System Admin',
        assignedToName: dto.assignedTo || 'UNASSIGNED (Unassigned)',
        department: dto.department || 'UNASSIGNED (No Team)',
        resolutionCode: dto.resolutionCode || 'Pending Triage',
        resolutionNotes: dto.resolutionNotes || 'Unassigned ticket pending triage.',
        configurationItemName: dto.configurationItem || 'Unspecified CI',
        activitiesJson: [
          { id: `act_${nextNumber}_1`, author: dto.caller || 'System Admin', isWorkNote: true, comment: `Logged new incident ticket ${nextNumber}.`, timestamp: new Date().toLocaleTimeString() }
        ]
      },
    });

    return this.mapIncidentToDTO(record);
  }

  async findAll(tenantId: string) {
    const records = await this.prisma.incident.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    return records.map(r => this.mapIncidentToDTO(r));
  }

  async findUnassigned(tenantId: string) {
    const records = await this.prisma.incident.findMany({
      where: {
        tenantId,
        OR: [
          { department: { contains: 'UNASSIGNED', mode: 'insensitive' } },
          { department: { equals: null } },
          { department: 'IT OPS' },
          { assignedToName: { contains: 'UNASSIGNED', mode: 'insensitive' } },
          { assignedToName: { equals: null } }
        ]
      },
      orderBy: { priority: 'asc' },
      take: 50,
    });
    return records.map(r => this.mapIncidentToDTO(r));
  }

  async findOne(tenantId: string, id: string) {
    const cleanId = (id || '');
    const record = await this.prisma.incident.findFirst({
      where: {
        tenantId,
        OR: [{ id: cleanId.toLowerCase() }, { number: cleanId.toUpperCase() }]
      },
    });
    
    if (!record) {
      throw new NotFoundException(`Incident ${cleanId} not found`);
    }
    return this.mapIncidentToDTO(record);
  }

  async update(tenantId: string, id: string, dto: UpdateIncidentDto) {
    const cleanId = (id || '');

    const existing = await this.prisma.incident.findFirst({
      where: { tenantId, OR: [{ id: cleanId.toLowerCase() }, { number: cleanId.toUpperCase() }] },
    });

    if (!existing) throw new NotFoundException(`Incident ${cleanId} not found`);

    let activities = existing.activitiesJson as any[];
    if ((dto as any).activities) {
      activities = (dto as any).activities;
    }

    const updated = await this.prisma.incident.update({
      where: { id: existing.id },
      data: {
        state: dto.state !== undefined ? dto.state : undefined,
        department: dto.department !== undefined ? dto.department : undefined,
        assignedToName: dto.assignedTo !== undefined ? dto.assignedTo : undefined,
        resolutionCode: dto.resolutionCode !== undefined ? dto.resolutionCode : undefined,
        resolutionNotes: dto.resolutionNotes !== undefined ? dto.resolutionNotes : undefined,
        shortDescription: dto.shortDescription !== undefined ? dto.shortDescription : undefined,
        description: dto.description !== undefined ? dto.description : undefined,
        impact: dto.impact !== undefined ? dto.impact : undefined,
        urgency: dto.urgency !== undefined ? dto.urgency : undefined,
        priority: dto.priority !== undefined ? dto.priority : undefined,
        configurationItemName: dto.configurationItem || dto.ci !== undefined ? (dto.configurationItem || dto.ci) : undefined,
        callerName: dto.caller !== undefined ? dto.caller : undefined,
        activitiesJson: activities,
      },
    });

    return this.mapIncidentToDTO(updated);
  }

  async addActivity(tenantId: string, incidentId: string, authorId: string, dto: AddActivityDto) {
    const cleanId = (incidentId || '');
    const existing = await this.prisma.incident.findFirst({
      where: { tenantId, OR: [{ id: cleanId.toLowerCase() }, { number: cleanId.toUpperCase() }] },
    });

    if (!existing) throw new NotFoundException(`Incident ${incidentId} not found`);

    let author = 'System Admin';
    if (dto.author) {
      author = dto.author;
    } else if (authorId === 'usr_resolver_agent' || authorId === 'ai_resolver_agent') {
      author = '🤖 Unix Auto-Resolver Agent';
    } else if (authorId === 'usr_router_agent' || authorId === 'ai_router_agent') {
      author = '🤖 Agentic AI Router';
    }

    const newAct = {
      id: `act_${Date.now()}`,
      author,
      comment: dto.comment,
      isWorkNote: dto.isWorkNote,
      timestamp: new Date().toLocaleTimeString(),
    };

    let activities = Array.isArray(existing.activitiesJson) ? existing.activitiesJson as any[] : [];
    activities.unshift(newAct);

    await this.prisma.incident.update({
      where: { id: existing.id },
      data: { activitiesJson: activities },
    });

    return newAct;
  }

  async deleteActivity(tenantId: string, incidentId: string, activityId: string) {
    const cleanId = (incidentId || '');
    const existing = await this.prisma.incident.findFirst({
      where: { tenantId, OR: [{ id: cleanId.toLowerCase() }, { number: cleanId.toUpperCase() }] },
    });

    if (!existing) throw new NotFoundException(`Incident ${incidentId} not found`);

    let activities = Array.isArray(existing.activitiesJson) ? existing.activitiesJson as any[] : [];
    const idx = activities.findIndex((a: any) => a.id === activityId);
    if (idx === -1) throw new NotFoundException(`Activity ${activityId} not found in incident ${incidentId}`);

    activities.splice(idx, 1);

    await this.prisma.incident.update({
      where: { id: existing.id },
      data: { activitiesJson: activities },
    });

    return { deleted: true, activityId };
  }
}
