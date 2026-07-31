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
        this.logger.log(`[SingleDatabaseService] Loaded Master Database from PostgreSQL with ${this.data.incidents?.length || 0} incidents.`);
        return;
      }
    } catch (err: any) {
      this.logger.warn(`[SingleDatabaseService] PostgreSQL masterDb record not found or table not migrated yet: ${err.message}. Initializing consolidated JSON backup.`);
    }

    const consolidated = this.loadOrConsolidateDatabase();
    this.data = consolidated;

    try {
      await this.prisma.masterDb.upsert({
        where: { key: 'master_itsm_db' },
        create: {
          key: 'master_itsm_db',
          data: consolidated as any,
        },
        update: {
          data: consolidated as any,
        },
      });
      this.logger.log(`[SingleDatabaseService] Successfully seeded master database to PostgreSQL.`);
    } catch (err: any) {
      this.logger.error(`[SingleDatabaseService] Failed to seed master database to PostgreSQL: ${err.message}`);
    }
  }

  public getDbFilePath(): string {
    const candidates = [
      path.resolve(__dirname, '../../../data/database.json'),
      path.resolve(__dirname, '../../data/database.json'),
      path.resolve(process.cwd(), 'apps/backend/data/database.json'),
      path.resolve(process.cwd(), 'data/database.json'),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand) && !cand.includes('apps\\backend\\apps\\backend') && !cand.includes('apps/backend/apps/backend')) {
        return cand;
      }
    }
    return path.resolve(process.cwd(), 'apps/backend/data/database.json');
  }

  private loadFileJson<T>(filename: string, fallback: T): T {
    try {
      const possiblePaths = [
        path.resolve(process.cwd(), `apps/backend/data/${filename}`),
        path.resolve(process.cwd(), `data/${filename}`),
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf-8');
          const parsed = JSON.parse(content);
          if (parsed !== undefined && parsed !== null) return parsed;
        }
      }
    } catch (err: any) {
      this.logger.error(`Error loading legacy file ${filename}: ${err.message}`);
    }
    return fallback;
  }

  private loadOrConsolidateDatabase(): SingleDatabaseSchema {
    const mainDbPath = this.getDbFilePath();

    try {
      if (fs.existsSync(mainDbPath)) {
        const content = fs.readFileSync(mainDbPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.incidents)) {
          this.logger.log(`[Single Database] Successfully loaded master database with ${parsed.incidents.length} incidents from ${mainDbPath}`);
          
          let updated = false;
          parsed.incidents.forEach((inc: any, idx: number) => {
            if (!inc.createdAt || inc.createdAt === '2026-07-21 10:14:00' || !inc.createdAt.includes('-')) {
              const daysAgo = Math.floor((idx / parsed.incidents.length) * 90);
              const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
              const yyyy = date.getFullYear();
              const mm = String(date.getMonth() + 1).padStart(2, '0');
              const dd = String(date.getDate()).padStart(2, '0');
              inc.createdAt = `${yyyy}-${mm}-${dd} 10:14:00`;
              updated = true;
            }
          });

          if (updated) {
            fs.writeFileSync(mainDbPath, JSON.stringify(parsed, null, 2), 'utf-8');
            this.logger.log(`[Single Database] Distributed ${parsed.incidents.length} incident timestamps over the last 3 months and saved.`);
          }

          const incidents = (parsed.incidents && parsed.incidents.length >= 1000) ? parsed.incidents : this.loadFileJson<any[]>('incidents.json', []);
          const knowledgeArticles = (parsed.knowledgeArticles && parsed.knowledgeArticles.length > 0) ? parsed.knowledgeArticles : this.loadFileJson<any[]>('knowledge_articles.json', []);
          const agentHistory = (parsed.agentHistory && parsed.agentHistory.length > 0) ? parsed.agentHistory : this.loadFileJson<any[]>('agent_history.json', []);

          return {
            incidents,
            knowledgeArticles,
            problems: (parsed.problems && parsed.problems.length > 0) ? parsed.problems : this.loadFileJson<any[]>('problems.json', []),
            changes: (parsed.changes && parsed.changes.length > 0) ? parsed.changes : this.loadFileJson<any[]>('changes.json', []),
            analyzedIncidents: parsed.analyzedIncidents || [],
            agentApprovals: parsed.agentApprovals || [],
            agentHistory,
            configurationItems: parsed.configurationItems || [],
            workflows: parsed.workflows || [],
            agentModelConfig: parsed.agentModelConfig,
          };
        }
      }
    } catch (err: any) {
      this.logger.error(`Error loading master database ${mainDbPath}: ${err.message}`);
    }

    this.logger.log(`[Single Database] Initializing & consolidating all app data into 1 single master database...`);

    const incidents = this.loadFileJson<any[]>('incidents.json', []);
    const knowledgeArticles = this.loadFileJson<any[]>('knowledge_articles.json', []);
    const problems = this.loadFileJson<any[]>('problems.json', []);
    const changes = this.loadFileJson<any[]>('changes.json', []);
    const analyzedIncidents = this.loadFileJson<string[]>('analyzed_incidents.json', []);
    const agentApprovals = this.loadFileJson<any[]>('agent_approvals.json', []);
    const agentHistory = this.loadFileJson<any[]>('agent_history.json', []);

    const consolidated: SingleDatabaseSchema = {
      incidents,
      knowledgeArticles,
      problems,
      changes,
      analyzedIncidents,
      agentApprovals,
      agentHistory,
      configurationItems: [],
      workflows: [],
      agentModelConfig: undefined,
    };

    this.saveDatabaseToFile(consolidated);
    return consolidated;
  }

  public saveDatabaseToFile(customData?: SingleDatabaseSchema) {
    if (customData) {
      this.data = customData;
    }
    const filePath = this.getDbFilePath();
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err: any) {
      this.logger.error(`[Single Database] Failed to write master database to ${filePath}: ${err.message}`);
    }

    // Sync to PostgreSQL asynchronously
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
      this.logger.log(`[SingleDatabaseService] Successfully synced Master Database updates to PostgreSQL.`);
    }).catch((err: any) => {
      this.logger.error(`[SingleDatabaseService] Failed to sync database updates to PostgreSQL: ${err.message}`);
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
