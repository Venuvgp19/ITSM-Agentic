import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from './prisma.service';

export interface SingleDatabaseSchema {
  incidents: any[];
  knowledgeArticles: any[];
  problems: any[];
  changes: any[];
  analyzedIncidents: string[];
  agentApprovals: any[];
  agentHistory: any[];
  configurationItems: any[];
  workflows: any[];
  agentModelConfig?: any;
  agentTimeline?: any[];
}

@Injectable()
export class SingleDatabaseService implements OnModuleInit {
  private readonly logger = new Logger(SingleDatabaseService.name);
  private data: SingleDatabaseSchema = {
    incidents: [],
    knowledgeArticles: [],
    problems: [],
    changes: [],
    analyzedIncidents: [],
    agentApprovals: [],
    agentHistory: [],
    configurationItems: [],
    workflows: [],
    agentModelConfig: undefined,
    agentTimeline: [],
  };

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.syncFromPostgres();
  }

  private async syncFromPostgres() {
    try {
      const record = await this.prisma.masterDb.findUnique({
        where: { key: 'master_itsm_db' },
      });
      if (record && record.data) {
        this.data = record.data as any;
        this.logger.log(`[SingleDatabaseService] Loaded Master Database directly from PostgreSQL with ${this.data.incidents?.length || 0} incidents.`);
        return;
      }
    } catch (err: any) {
      this.logger.error(`[SingleDatabaseService] Error loading master database from PostgreSQL: ${err.message}`);
    }
  }

  public saveDatabaseToFile(customData?: SingleDatabaseSchema) {
    this.persistToPostgres(customData);
  }

  public persistToPostgres(customData?: SingleDatabaseSchema) {
    if (customData) {
      this.data = customData;
    }
    // Direct synchronous-like write to PostgreSQL MasterDb table without writing to disk JSON files
    this.prisma.masterDb.upsert({
      where: { key: 'master_itsm_db' },
      create: {
        key: 'master_itsm_db',
        data: this.data as any,
      },
      update: {
        data: this.data as any,
      },
    }).then(() => {
      this.logger.log(`[SingleDatabaseService] Successfully persisted Master Database updates directly to PostgreSQL.`);
    }).catch((err: any) => {
      this.logger.error(`[SingleDatabaseService] Failed to persist updates to PostgreSQL: ${err.message}`);
    });
  }

  private deduplicateIncidentActivities(incidents: any[]): any[] {
    if (!Array.isArray(incidents)) return [];
    for (const inc of incidents) {
      if (inc && Array.isArray(inc.activities) && inc.activities.length > 1) {
        const seenTypes = new Set<string>();
        const cleanActs: any[] = [];
        for (const act of inc.activities) {
          const comment = act.comment || '';
          let cType = '';
          if (comment.includes('Logged new incident')) cType = 'CREATED';
          else if (comment.includes('Agentic AI Router')) cType = 'ROUTED';
          else if (comment.includes('NEW SOP SUBMITTED FOR APPROVAL')) cType = 'APPROVAL_REQUESTED';
          else if (comment.includes('SOP Approved by Human Operator')) cType = 'HUMAN_APPROVED';
          else if (comment.includes('LIVE EXECUTION PROOF')) cType = 'EXECUTION_PROOF';
          else if (comment.includes('AUTOMATED REMEDIATION UNABLE TO COMPLETE')) cType = 'ESCALATED';
          else cType = `OTHER_${comment.slice(0, 40)}`;

          if (!seenTypes.has(cType)) {
            seenTypes.add(cType);
            cleanActs.push(act);
          }
        }
        inc.activities = cleanActs;
      }
    }
    return incidents;
  }

  // Getters & Setters
  get incidents(): any[] {
    return this.deduplicateIncidentActivities(this.data.incidents || []);
  }
  set incidents(val: any[]) {
    this.data.incidents = this.deduplicateIncidentActivities(val || []);
    this.saveDatabaseToFile();
  }

  get knowledgeArticles(): any[] {
    return this.data.knowledgeArticles;
  }
  set knowledgeArticles(val: any[]) {
    this.data.knowledgeArticles = val;
    this.saveDatabaseToFile();
  }

  get problems(): any[] {
    return this.data.problems;
  }
  set problems(val: any[]) {
    this.data.problems = val;
    this.saveDatabaseToFile();
  }

  get changes(): any[] {
    return this.data.changes;
  }
  set changes(val: any[]) {
    this.data.changes = val;
    this.saveDatabaseToFile();
  }

  get analyzedIncidents(): string[] {
    return this.data.analyzedIncidents;
  }
  set analyzedIncidents(val: string[]) {
    this.data.analyzedIncidents = val;
    this.saveDatabaseToFile();
  }

  get agentApprovals(): any[] {
    return this.data.agentApprovals;
  }
  set agentApprovals(val: any[]) {
    this.data.agentApprovals = val;
    this.saveDatabaseToFile();
  }

  get agentHistory(): any[] {
    return this.data.agentHistory;
  }
  set agentHistory(val: any[]) {
    this.data.agentHistory = val;
    this.saveDatabaseToFile();
  }

  get agentModelConfig(): any {
    return this.data.agentModelConfig;
  }
  set agentModelConfig(val: any) {
    this.data.agentModelConfig = val;
    this.saveDatabaseToFile();
  }

  get agentTimeline(): any[] {
    return this.data.agentTimeline || [];
  }
  set agentTimeline(val: any[]) {
    this.data.agentTimeline = val;
    this.saveDatabaseToFile();
  }

  get rawData(): SingleDatabaseSchema {
    return this.data;
  }
}
