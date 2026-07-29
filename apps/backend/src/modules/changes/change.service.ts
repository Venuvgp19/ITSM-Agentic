import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateChangeDto, UpdateChangeDto } from './dto/change.dto';
import * as fs from 'fs';
import * as path from 'path';

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

const sampleChangeTitles = [
  'Upgrade NYC Border Router Firmware to v15.4 Build 90',
  'Production PostgreSQL Cluster Major Release v15.2 Vacuum Tuning',
  'Kubernetes Ingress NGINX Controller Capacity Scaling (3 to 12 replicas)',
  'Active Directory Kerberos & LDAP TLS Certificate Renewal 2026',
  'AWS DynamoDB Session Table Provisioned Throughput Auto-Scale',
  'Palo Alto Perimeter Firewall Policy Ingress Rule Update',
  'SAP ERP Financials SSO SAML 2.0 Identity Provider Certificate Rotation',
  'Unix Host 01 Kernel Parameter Sysctl Tuning & Reboot Maintenance',
  'Kafka Event Bus Cluster Storage Expansion (5TB to 20TB)',
  'Okta MFA Webhook Callback Handler Failover Endpoint Migration',
];

import { SingleDatabaseService } from '../../database/single-db.service';

@Injectable()
export class ChangeService {
  private readonly logger = new Logger(ChangeService.name);
  private changes: ChangeRecord[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly singleDb: SingleDatabaseService
  ) {
    if (!this.singleDb.changes || this.singleDb.changes.length === 0) {
      this.singleDb.changes = this.generateInitial50Changes();
    }
    this.changes = this.singleDb.changes;
  }

  private saveDatabaseToFile(data: ChangeRecord[]) {
    this.singleDb.changes = data;
  }

  private generateInitial50Changes(): ChangeRecord[] {
    const list: ChangeRecord[] = [];
    const cis = ['router-border-nyc-01', 'db-postgres-primary', 'k8s-prod-cluster-east-1', 'ad-dc-master-01', 'vpn-gateway-01'];
    const techs = ['Sarah Connor (Network Ops)', 'DBA Team', 'DevOps Ops', 'SecOps', 'Richard Stallman (Unix)'];

    for (let i = 1; i <= 50; i++) {
      const id = `CHG${String(i).padStart(7, '0')}`;
      const title = sampleChangeTitles[i % sampleChangeTitles.length];
      const changeType = i % 5 === 0 ? 'EMERGENCY' : i % 3 === 0 ? 'STANDARD' : 'NORMAL';
      const approvalState = i % 4 === 0 ? 'APPROVED' : i % 2 === 0 ? 'REQUESTED' : 'NOT_REQUESTED';
      const state = approvalState === 'APPROVED' ? 'SCHEDULED' : i % 3 === 0 ? 'ASSESS' : 'AUTHORIZE';

      list.push({
        id,
        number: id,
        title: `${title} (#${i})`,
        description: `Request for Change (RFC) #${i}: Implement controlled system update for ${cis[i % cis.length]}.`,
        changeType,
        state,
        approvalState,
        riskScore: (i % 4) + 1,
        configurationItem: cis[i % cis.length],
        assignedTo: techs[i % techs.length],
        requestedBy: 'System Admin',
        plannedStartDate: new Date(Date.now() + (i * 86400000)).toISOString(),
        plannedEndDate: new Date(Date.now() + (i * 86400000) + 14400000).toISOString(),
        implementationPlan: `1. Notify Operations Team.\n2. Apply patch image to ${cis[i % cis.length]}.\n3. Verify post-implementation health checks.`,
        backoutPlan: `1. Trigger snapshot restore.\n2. Revert BGP/DNS routing records.\n3. Validate baseline telemetry.`,
        cabNotes: `CAB Review Meeting on ${new Date(Date.now() + (i * 86400000)).toLocaleDateString()}: Approved based on risk score assessment.`,
        createdAt: new Date(Date.now() - (50 - i) * 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    return list;
  }

  async findAll(query?: string, changeType?: string, state?: string, approvalState?: string): Promise<ChangeRecord[]> {
    let result = [...this.changes];

    if (query) {
      const q = query.toLowerCase();
      result = result.filter(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.configurationItem.toLowerCase().includes(q) ||
          c.assignedTo.toLowerCase().includes(q)
      );
    }

    if (changeType && changeType.toLowerCase() !== 'all') {
      result = result.filter((c) => c.changeType.toLowerCase() === changeType.toLowerCase());
    }

    if (state && state.toLowerCase() !== 'all') {
      result = result.filter((c) => c.state.toLowerCase() === state.toLowerCase());
    }

    if (approvalState && approvalState.toLowerCase() !== 'all') {
      result = result.filter((c) => c.approvalState.toLowerCase() === approvalState.toLowerCase());
    }

    return result.sort((a, b) => {
      const numA = parseInt((a.id || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt((b.id || '').replace(/\D/g, ''), 10) || 0;
      return numB - numA;
    });
  }

  async findOne(id: string): Promise<ChangeRecord> {
    const cleanId = id.toUpperCase();
    const change = this.changes.find(
      (c) => c.id.toUpperCase() === cleanId || c.number.toUpperCase() === cleanId
    );
    if (!change) {
      throw new NotFoundException(`Change Order ${id} not found.`);
    }
    return change;
  }

  async create(dto: CreateChangeDto): Promise<ChangeRecord> {
    const newIdNum = this.changes.length + 1;
    const id = `CHG${String(newIdNum).padStart(7, '0')}`;

    const newRecord: ChangeRecord = {
      id,
      number: id,
      title: dto.title,
      description: dto.description || `Change Request #${id}.`,
      changeType: dto.changeType || 'NORMAL',
      state: 'DRAFT',
      approvalState: 'NOT_REQUESTED',
      riskScore: dto.riskScore || 2,
      configurationItem: dto.configurationItem || 'router-border-nyc-01',
      assignedTo: 'Change Advisory Board (CAB)',
      requestedBy: 'System Admin',
      plannedStartDate: dto.plannedStartDate || new Date(Date.now() + 86400000).toISOString(),
      plannedEndDate: dto.plannedEndDate || new Date(Date.now() + 97200000).toISOString(),
      implementationPlan: dto.implementationPlan || '1. Pre-flight backup.\n2. Package installation.\n3. Service restart.',
      backoutPlan: dto.backoutPlan || '1. Rollback configuration.\n2. Restore DB snapshot.',
      cabNotes: 'Pending CAB Review.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.changes.unshift(newRecord);
    this.saveDatabaseToFile(this.changes);
    return newRecord;
  }

  async update(id: string, dto: UpdateChangeDto): Promise<ChangeRecord> {
    const change = await this.findOne(id);

    if (dto.title !== undefined) change.title = dto.title;
    if (dto.description !== undefined) change.description = dto.description;
    if (dto.state !== undefined) change.state = dto.state;
    if (dto.approvalState !== undefined) change.approvalState = dto.approvalState;
    if (dto.changeType !== undefined) change.changeType = dto.changeType;
    if (dto.riskScore !== undefined) change.riskScore = dto.riskScore;
    if (dto.configurationItem !== undefined) change.configurationItem = dto.configurationItem;
    if (dto.assignedTo !== undefined) change.assignedTo = dto.assignedTo;
    if (dto.implementationPlan !== undefined) change.implementationPlan = dto.implementationPlan;
    if (dto.backoutPlan !== undefined) change.backoutPlan = dto.backoutPlan;
    if (dto.cabNotes !== undefined) change.cabNotes = dto.cabNotes;

    change.updatedAt = new Date().toISOString();
    this.saveDatabaseToFile(this.changes);
    return change;
  }
}
