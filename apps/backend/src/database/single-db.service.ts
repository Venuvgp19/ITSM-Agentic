import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

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
}

@Injectable()
export class SingleDatabaseService {
  private readonly logger = new Logger(SingleDatabaseService.name);
  private data: SingleDatabaseSchema;

  constructor() {
    this.data = this.loadOrConsolidateDatabase();
  }

  public getDbFilePath(): string {
    const possiblePaths = [
      path.resolve(process.cwd(), 'apps/backend/data/database.json'),
      path.resolve(process.cwd(), 'data/database.json'),
      path.resolve(__dirname, '../../../data/database.json'),
      path.resolve(__dirname, '../../data/database.json'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
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
          return {
            incidents: parsed.incidents || [],
            knowledgeArticles: parsed.knowledgeArticles || [],
            problems: parsed.problems || [],
            changes: parsed.changes || [],
            analyzedIncidents: parsed.analyzedIncidents || [],
            agentApprovals: parsed.agentApprovals || [],
            agentHistory: parsed.agentHistory || [],
            configurationItems: parsed.configurationItems || [],
            workflows: parsed.workflows || [],
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
  }

  // Getters & Setters
  get incidents(): any[] {
    return this.data.incidents;
  }
  set incidents(val: any[]) {
    this.data.incidents = val;
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

  get rawData(): SingleDatabaseSchema {
    return this.data;
  }
}
