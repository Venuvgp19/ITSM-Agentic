import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProblemDto, UpdateProblemDto } from './dto/problem.dto';
import * as fs from 'fs';
import * as path from 'path';

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

const sampleProblemTitles = [
  'Recurring Core BGP Latency & Packet Loss in NYC Edge Router',
  'PostgreSQL Connection Pool Saturation on Production Cluster',
  'Active Directory Kerberos Ticket Expiration Sync Failure',
  'Kubernetes Ingress NGINX Memory Leak under High Traffic Load',
  'Okta Webhook Session Token Timeout on SSO Portal',
  'SAP Financials ERP Database Deadlock during End-of-Month Run',
  'Unix Mainframe Kernel Memory Buffer Overflow on Node 01',
  'AWS DynamoDB Throttling Spike on Customer Session Table',
  'Palo Alto Firewall Ingress Rule Processing Bottleneck',
  'Kafka Outbound Event Queue Consumer Liveness Timeout',
];

const problemWorkarounds = [
  'Execute `sysctl -w net.ipv4.tcp_tw_reuse=1` and flush BGP neighbor tables.',
  'Restart connection pool proxy service and scale max connections from 200 to 500.',
  'Purge expired KBT cache on primary domain controller host dc-east-01.',
  'Trigger pod rolling restart and increase pod memory limits from 2Gi to 8Gi.',
  'Force OAuth 2.0 token re-issuance and clear Redis session key cache.',
];

const problemRootCauses = [
  'BGP route flapping caused by faulty fiber SFP transceiver on interface eth0.',
  'Unindexed database query performing full table scan during nightly backup batch.',
  'Clock skew drift between Active Directory DC 01 and NTP server exceeds 300 seconds.',
  'Memory buffer leak in NGINX v1.21 ingress worker process during HTTP/2 multiplexing.',
  'OAuth callback handler missing retry backoff header handling under rate-limiting.',
];

import { SingleDatabaseService } from '../../database/single-db.service';

@Injectable()
export class ProblemService {
  private readonly logger = new Logger(ProblemService.name);
  private problems: ProblemRecord[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly singleDb: SingleDatabaseService
  ) {
    if (!this.singleDb.problems || this.singleDb.problems.length === 0) {
      this.singleDb.problems = this.generateInitial50Problems();
    }
    this.problems = this.singleDb.problems;
  }

  private saveDatabaseToFile(data: ProblemRecord[]) {
    this.singleDb.problems = data;
  }

  private generateInitial50Problems(): ProblemRecord[] {
    const list: ProblemRecord[] = [];
    const cis = ['router-border-nyc-01', 'db-postgres-primary', 'k8s-prod-cluster-east-1', 'ad-dc-master-01', 'okta-auth-gw-01', 'control plane'];
    const techs = ['Richard Stallman (Unix)', 'Sarah Connor (Network Ops)', 'DBA Team', 'SecOps', 'App Support'];

    for (let i = 1; i <= 50; i++) {
      const id = `PRB${String(i).padStart(7, '0')}`;
      const title = sampleProblemTitles[i % sampleProblemTitles.length];
      const isKnownError = i % 3 === 0;

      list.push({
        id,
        number: id,
        shortDescription: `${title} (#${i})`,
        description: `Problem Investigation #${i}: Investigating systemic underlying root cause for repeated incident alerts on ${cis[i % cis.length]}.`,
        rootCause: problemRootCauses[i % problemRootCauses.length],
        workaround: problemWorkarounds[i % problemWorkarounds.length],
        knownError: isKnownError,
        state: isKnownError ? 'KNOWN_ERROR' : i % 4 === 0 ? 'RESOLVED' : i % 2 === 0 ? 'UNDER_INVESTIGATION' : 'NEW',
        priority: i % 5 === 0 ? 'P1' : i % 3 === 0 ? 'P2' : i % 2 === 0 ? 'P3' : 'P4',
        configurationItem: cis[i % cis.length],
        assignedTo: techs[i % techs.length],
        relatedIncidentsCount: (i * 3) % 17 + 2,
        createdAt: new Date(Date.now() - (50 - i) * 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    return list;
  }

  async findAll(query?: string, priority?: string, state?: string, knownErrorOnly?: boolean): Promise<ProblemRecord[]> {
    let result = [...this.problems];

    if (query) {
      const q = query.toLowerCase();
      result = result.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.shortDescription.toLowerCase().includes(q) ||
          p.configurationItem.toLowerCase().includes(q) ||
          p.rootCause.toLowerCase().includes(q) ||
          p.workaround.toLowerCase().includes(q)
      );
    }

    if (priority && priority.toLowerCase() !== 'all') {
      result = result.filter((p) => p.priority.toLowerCase().includes(priority.toLowerCase()));
    }

    if (state && state.toLowerCase() !== 'all') {
      result = result.filter((p) => p.state.toLowerCase() === state.toLowerCase());
    }

    if (knownErrorOnly) {
      result = result.filter((p) => p.knownError === true);
    }

    return result.sort((a, b) => {
      const numA = parseInt((a.id || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt((b.id || '').replace(/\D/g, ''), 10) || 0;
      return numB - numA;
    });
  }

  async findOne(id: string): Promise<ProblemRecord> {
    const cleanId = id.toUpperCase();
    const problem = this.problems.find(
      (p) => p.id.toUpperCase() === cleanId || p.number.toUpperCase() === cleanId
    );
    if (!problem) {
      throw new NotFoundException(`Problem Record ${id} not found.`);
    }
    return problem;
  }

  async create(dto: CreateProblemDto): Promise<ProblemRecord> {
    const newIdNum = this.problems.length + 1;
    const id = `PRB${String(newIdNum).padStart(7, '0')}`;

    const newRecord: ProblemRecord = {
      id,
      number: id,
      shortDescription: dto.shortDescription,
      description: dto.description || `Problem Investigation Record ${id}.`,
      rootCause: dto.rootCause || 'Under investigation by problem engineering team.',
      workaround: dto.workaround || 'Pending workaround formulation.',
      knownError: dto.knownError || false,
      state: dto.knownError ? 'KNOWN_ERROR' : dto.state || 'NEW',
      priority: dto.priority || 'P2',
      configurationItem: dto.configurationItem || 'router-border-nyc-01',
      assignedTo: 'Problem Management Team',
      relatedIncidentsCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.problems.unshift(newRecord);
    this.saveDatabaseToFile(this.problems);
    return newRecord;
  }

  async update(id: string, dto: UpdateProblemDto): Promise<ProblemRecord> {
    const problem = await this.findOne(id);

    if (dto.shortDescription !== undefined) problem.shortDescription = dto.shortDescription;
    if (dto.description !== undefined) problem.description = dto.description;
    if (dto.state !== undefined) problem.state = dto.state;
    if (dto.priority !== undefined) problem.priority = dto.priority;
    if (dto.rootCause !== undefined) problem.rootCause = dto.rootCause;
    if (dto.workaround !== undefined) problem.workaround = dto.workaround;
    if (dto.knownError !== undefined) {
      problem.knownError = dto.knownError;
      if (dto.knownError && problem.state !== 'RESOLVED' && problem.state !== 'CLOSED') {
        problem.state = 'KNOWN_ERROR';
      }
    }
    if (dto.configurationItem !== undefined) problem.configurationItem = dto.configurationItem;
    if (dto.assignedTo !== undefined) problem.assignedTo = dto.assignedTo;

    problem.updatedAt = new Date().toISOString();
    this.saveDatabaseToFile(this.problems);
    return problem;
  }
}
