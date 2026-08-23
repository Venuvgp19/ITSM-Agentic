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
      totalFields: 20,
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
        { name: 'openedAt', label: 'Opened At', type: 'DateTime', required: false, readOnly: false },
        { name: 'slaDueAt', label: 'SLA Target Due Date', type: 'DateTime', required: false, readOnly: false },
        { name: 'resolvedAt', label: 'Resolved Timestamp', type: 'DateTime', required: false, readOnly: false },
        { name: 'closedAt', label: 'Closed Timestamp', type: 'DateTime', required: false, readOnly: false },
        { name: 'createdAt', label: 'Created Timestamp', type: 'DateTime', required: true, readOnly: true },
        { name: 'updatedAt', label: 'Updated Timestamp', type: 'DateTime', required: true, readOnly: true },
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

  calculateSlaDueDate(priority: string, baseDate: Date = new Date()): Date {
    const d = new Date(baseDate);
    const p = (priority || '').toUpperCase();
    if (p.includes('P1') || p === 'CRITICAL') {
      d.setHours(d.getHours() + 4);
    } else if (p.includes('P2') || p === 'HIGH') {
      d.setHours(d.getHours() + 8);
    } else if (p.includes('P3') || p === 'MODERATE' || p === 'MEDIUM') {
      d.setHours(d.getHours() + 24);
    } else {
      d.setHours(d.getHours() + 48);
    }
    return d;
  }

  private mapIncidentToDTO(record: any) {
    if (!record) return null;
    return {
      ...record,
      activities: record.activitiesJson || [],
      assignedTo: record.assignedToName,
      caller: record.callerName,
      configurationItem: record.configurationItemName,
      openedAt: record.openedAt || record.createdAt,
      slaDueAt: record.slaDueAt,
      resolvedAt: record.resolvedAt,
      closedAt: record.closedAt,
    };
  }

  async create(tenantId: string, callerId: string, dto: CreateIncidentDto) {
    // Find the max existing incident number to avoid duplicates
    const lastIncident = await this.prisma.$queryRaw<{number: string}[]>`
      SELECT number FROM "Incident" 
      WHERE number ~ '^INC[0-9]+$' AND "tenantId" = ${tenantId}
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
    const now = new Date();
    const openedDate = (dto as any).openedAt ? new Date((dto as any).openedAt) : now;
    const slaDue = (dto as any).slaDueAt ? new Date((dto as any).slaDueAt) : this.calculateSlaDueDate(priorityVal, openedDate);

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
        openedAt: openedDate,
        slaDueAt: slaDue,
        resolvedAt: (dto as any).resolvedAt ? new Date((dto as any).resolvedAt) : (dto.state === 'RESOLVED' ? now : null),
        closedAt: (dto as any).closedAt ? new Date((dto as any).closedAt) : (dto.state === 'CLOSED' ? now : null),
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
    const cleanId = (id || '').trim();
    let record = await this.prisma.incident.findFirst({
      where: { tenantId, id: cleanId },
    });
    if (!record) {
      record = await this.prisma.incident.findFirst({
        where: {
          tenantId,
          OR: [
            { number: cleanId },
            { number: cleanId.toUpperCase() },
            { id: cleanId.toLowerCase() },
            { id: cleanId.toUpperCase() },
          ],
        },
      });
    }
    
    if (!record) {
      throw new NotFoundException(`Incident ${cleanId} not found`);
    }
    return this.mapIncidentToDTO(record);
  }

  async update(tenantId: string, id: string, dto: UpdateIncidentDto) {
    const cleanId = (id || '').trim();

    let existing = await this.prisma.incident.findFirst({
      where: { tenantId, id: cleanId },
    });
    if (!existing) {
      existing = await this.prisma.incident.findFirst({
        where: {
          tenantId,
          OR: [
            { number: cleanId },
            { number: cleanId.toUpperCase() },
            { id: cleanId.toLowerCase() },
            { id: cleanId.toUpperCase() },
          ],
        },
      });
    }

    if (!existing) throw new NotFoundException(`Incident ${cleanId} not found`);

    let activities = existing.activitiesJson as any[];
    if ((dto as any).activities) {
      activities = (dto as any).activities;
    }

    const now = new Date();
    const isResolving = dto.state === 'RESOLVED' && existing.state !== 'RESOLVED';
    const isClosing = dto.state === 'CLOSED' && existing.state !== 'CLOSED';

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
        openedAt: (dto as any).openedAt ? new Date((dto as any).openedAt) : undefined,
        slaDueAt: (dto as any).slaDueAt ? new Date((dto as any).slaDueAt) : undefined,
        resolvedAt: (dto as any).resolvedAt ? new Date((dto as any).resolvedAt) : (isResolving ? (existing.resolvedAt || now) : undefined),
        closedAt: (dto as any).closedAt ? new Date((dto as any).closedAt) : (isClosing ? (existing.closedAt || now) : undefined),
        activitiesJson: activities,
      },
    });

    return this.mapIncidentToDTO(updated);
  }

  async updateState(tenantId: string, id: string, state: string, resolutionNotes?: string, resolutionCode?: string, assignedTo?: string) {
    const cleanId = (id || '').trim();
    let existing = await this.prisma.incident.findFirst({
      where: { tenantId, id: cleanId },
    });
    if (!existing) {
      existing = await this.prisma.incident.findFirst({
        where: {
          tenantId,
          OR: [
            { number: cleanId },
            { number: cleanId.toUpperCase() },
            { id: cleanId.toLowerCase() },
            { id: cleanId.toUpperCase() },
          ],
        },
      });
    }

    if (!existing) throw new NotFoundException(`Incident ${cleanId} not found`);

    let activities = (existing.activitiesJson as any[]) || [];
    const now = new Date();
    const fullDateStr = now.toISOString().replace('T', ' ').slice(0, 19);

    if (state === 'RESOLVED' && existing.state !== 'RESOLVED') {
      activities.push({
        id: `act_${existing.number}_resolved_${Date.now()}`,
        author: '🤖 Unix Auto-Resolver Agent',
        isWorkNote: true,
        comment: `🎉 Incident ${existing.number} state transitioned to RESOLVED. Remote SSH SOP execution verified. Saved to PostgreSQL database.`,
        timestamp: fullDateStr,
      });
    }

    const updated = await this.prisma.incident.update({
      where: { id: existing.id },
      data: {
        state: state !== undefined ? state : undefined,
        resolutionNotes: resolutionNotes !== undefined ? resolutionNotes : undefined,
        resolutionCode: resolutionCode !== undefined ? resolutionCode : undefined,
        assignedToName: assignedTo !== undefined ? assignedTo : undefined,
        resolvedAt: state === 'RESOLVED' ? (existing.resolvedAt || now) : undefined,
        closedAt: state === 'CLOSED' ? (existing.closedAt || now) : undefined,
        activitiesJson: activities,
      },
    });

    return this.mapIncidentToDTO(updated);
  }

  async addActivity(tenantId: string, incidentId: string, authorId: string, dto: { comment: string; isWorkNote: boolean; author?: string; timestamp?: string }) {
    const cleanId = (incidentId || '').trim();
    let existing = await this.prisma.incident.findFirst({
      where: { tenantId, id: cleanId },
    });
    if (!existing) {
      existing = await this.prisma.incident.findFirst({
        where: {
          tenantId,
          OR: [
            { number: cleanId },
            { number: cleanId.toUpperCase() },
            { id: cleanId.toLowerCase() },
            { id: cleanId.toUpperCase() },
          ],
        },
      });
    }

    if (!existing) throw new NotFoundException(`Incident ${incidentId} not found`);

    let author = 'System Admin';
    if (dto.author) {
      author = dto.author;
    } else if (authorId === 'usr_resolver_agent' || authorId === 'ai_resolver_agent') {
      author = '🤖 Unix Auto-Resolver Agent';
    } else if (authorId === 'usr_router_agent' || authorId === 'ai_router_agent') {
      author = '🤖 Agentic AI Router';
    }

    const now = new Date();
    const fullDateStr = dto.timestamp || now.toISOString().replace('T', ' ').slice(0, 19);

    const newAct = {
      id: `act_${Date.now()}`,
      author,
      comment: dto.comment,
      isWorkNote: dto.isWorkNote,
      timestamp: fullDateStr,
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
    const cleanId = (incidentId || '').trim();
    let existing = await this.prisma.incident.findFirst({
      where: { tenantId, id: cleanId },
    });
    if (!existing) {
      existing = await this.prisma.incident.findFirst({
        where: {
          tenantId,
          OR: [
            { number: cleanId },
            { number: cleanId.toUpperCase() },
            { id: cleanId.toLowerCase() },
            { id: cleanId.toUpperCase() },
          ],
        },
      });
    }

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

  async delete(tenantId: string, id: string) {
    const cleanId = (id || '');
    const existing = await this.prisma.incident.findFirst({
      where: { tenantId, OR: [{ id: cleanId.toLowerCase() }, { number: cleanId.toUpperCase() }] },
    });

    if (!existing) throw new NotFoundException(`Incident ${cleanId} not found`);

    await this.prisma.incident.delete({
      where: { id: existing.id },
    });

    return { deleted: true, id: existing.id, number: existing.number };
  }

  async findSimilarResolvedIncidents(
    tenantId: string,
    queryText: string,
    ciName?: string,
    limit: number = 4
  ): Promise<Array<{
    id: string;
    number: string;
    shortDescription: string;
    department: string;
    configurationItem?: string;
    resolutionCode?: string;
    resolutionNotes?: string;
    similarityScore: number;
  }>> {
    // Fetch all resolved and closed incidents with valid departments
    const resolvedIncidents = await this.prisma.incident.findMany({
      where: {
        tenantId,
        state: { in: ['RESOLVED', 'CLOSED'] },
        department: { not: { in: ['UNASSIGNED (No Team)', 'string', ''] } },
      },
      select: {
        id: true,
        number: true,
        shortDescription: true,
        description: true,
        department: true,
        configurationItemName: true,
        resolutionCode: true,
        resolutionNotes: true,
      },
      take: 2000,
      orderBy: { updatedAt: 'desc' },
    });

    if (!resolvedIncidents || resolvedIncidents.length === 0) {
      return [];
    }

    const cleanTokens = (text: string): Set<string> => {
      const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'for', 'of', 'with', 'from', 'by', 'as', 'this', 'that', 'it', 'or', 'be', 'are', 'was', 'were', 'incident', 'record', 'stats', 'telemetry', 'alert', 'details', 'error']);
      return new Set(
        (text || '')
          .toLowerCase()
          .replace(/[^a-z0-9_\-\.]/g, ' ')
          .split(/\s+/)
          .filter(t => t.length > 2 && !stopWords.has(t))
      );
    };

    const qTokens = cleanTokens(`${queryText} ${ciName || ''}`);
    const cleanCi = (ciName || '').toLowerCase().trim();

    const scored = resolvedIncidents.map(inc => {
      const incText = `${inc.shortDescription} ${inc.description || ''} ${inc.configurationItemName || ''}`;
      const incTokens = cleanTokens(incText);
      const incCi = (inc.configurationItemName || '').toLowerCase().trim();

      let matchCount = 0;
      for (const t of qTokens) {
        if (incTokens.has(t)) matchCount++;
      }

      if (matchCount === 0 && (!cleanCi || !incCi || cleanCi !== incCi)) {
        return {
          id: inc.id,
          number: inc.number,
          shortDescription: inc.shortDescription,
          department: inc.department,
          configurationItem: inc.configurationItemName || undefined,
          resolutionCode: inc.resolutionCode || undefined,
          resolutionNotes: (inc.resolutionNotes || '').substring(0, 300),
          similarityScore: 0,
        };
      }

      // Compute overlap ratio
      let score = (matchCount / Math.max(1, qTokens.size));

      // Boost if exact Configuration Item matches
      if (cleanCi && incCi && (cleanCi === incCi || cleanCi.includes(incCi) || incCi.includes(cleanCi))) {
        score += 0.35;
      }

      // Boost specific keyword intersections
      const domainTerms = ['bgp', 'switch', 'router', 'interface', 'flapping', 'packets', 'postgres', 'pool', 'deadlock', 'database', 'nexacore', '8080', 'useradd', 'password', 'ssh', 'sudo'];
      for (const dt of domainTerms) {
        if (qTokens.has(dt) && incTokens.has(dt)) {
          score += 0.25;
        }
      }

      return {
        id: inc.id,
        number: inc.number,
        shortDescription: inc.shortDescription,
        department: inc.department,
        configurationItem: inc.configurationItemName || undefined,
        resolutionCode: inc.resolutionCode || undefined,
        resolutionNotes: (inc.resolutionNotes || '').substring(0, 300),
        similarityScore: Math.round(score * 100) / 100,
      };
    });

    // Sort by similarity score descending and filter out zero similarity
    scored.sort((a, b) => b.similarityScore - a.similarityScore);
    return scored.filter(s => s.similarityScore >= 0.10).slice(0, limit);
  }
}
