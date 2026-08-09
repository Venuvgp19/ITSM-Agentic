import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IncidentService } from '../incidents/incident.service';
import { PrismaService } from '../../database/prisma.service';
import { AgentGovernanceService } from '../agent-governance/agent-governance.service';

export interface KnowledgeArticle {
  id: string;
  number: string;
  title: string;
  category: string;
  configurationItem: string;
  summary: string;
  symptoms: string[];
  rootCause: string;
  resolutionSteps: string[];
  workNotesAnalyzedCount: number;
  sourceIncidentIds: string[];
  author: string;
  modelUsed: string;
  viewCount: number;
  helpfulCount: number;
  createdAt: string;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
  private analyzedIncidentIds: Set<string> = new Set();
  private isWorkerRunning = false;
  private totalIncidentsCount = 1000;
  private readonly liteLlmBaseUrl: string;
  private liteLlmApiKey: string;
  private llamaModel: string;

  constructor(
    private readonly incidentService: IncidentService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly governanceService: AgentGovernanceService
  ) {
    this.liteLlmBaseUrl = this.configService?.get<string>('LITELLM_BASE_URL') || 'https://genailab.tcs.in/v1';
    this.liteLlmApiKey = 'sk-taPdt4_aNdzmFCX3nP0GiA';
    this.llamaModel = this.configService?.get<string>('LITELLM_LLAMA_MODEL') || 'azure/genailab-maas-gpt-4.1-mini';

    // Load from DB on startup
    this.governanceService.getModelConfig().then(cfg => {
      if (cfg) {
        this.liteLlmApiKey = cfg.apiKey || this.liteLlmApiKey;
        this.llamaModel = cfg.synthesizerModel || cfg.routerModel || this.llamaModel;
        this.logger.log(`KnowledgeService loaded config from DB: model=${this.llamaModel}`);
      }
    });

    // Start continuous background processing after 5 seconds
    setTimeout(() => {
      this.runContinuousBackgroundSynthesis('tenant_acme_01');
    }, 5000);
  }

  private mapKBToDTO(record: any): KnowledgeArticle {
    return {
      id: record.id,
      number: record.number,
      title: record.title || '',
      category: record.category || '',
      configurationItem: record.configurationItem || '',
      summary: record.summary || '',
      symptoms: (record.symptoms as string[]) || [],
      rootCause: record.rootCause || '',
      resolutionSteps: (record.resolutionSteps as string[]) || [],
      workNotesAnalyzedCount: record.workNotesAnalyzedCount || 0,
      sourceIncidentIds: (record.sourceIncidentIds as string[]) || [],
      author: record.author || '',
      modelUsed: record.modelUsed || '',
      viewCount: record.viewsCount || 0,
      helpfulCount: record.helpfulCount || 0,
      createdAt: record.createdAt ? record.createdAt.toISOString() : new Date().toISOString(),
    };
  }

  private extractProblemKey(title: string): string {
    return title
      .toLowerCase()
      .replace(/troubleshooting\s*&\s*sop:\s*/i, '')
      .replace(/\(#\d+\)/g, '')
      .replace(/\(.*\)/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async isProblemAlreadySolved(tenantId: string, problemTitle: string): Promise<boolean> {
    const targetKey = this.extractProblemKey(problemTitle);
    const targetTokens = new Set(targetKey.split(' ').filter((t) => t.length > 3));

    const allKb = await this.prisma.knowledgeArticle.findMany({ where: { tenantId } });

    for (const article of allKb) {
      const existingKey = this.extractProblemKey(article.title || '');
      if (existingKey === targetKey) return true;

      const existingTokens = existingKey.split(' ').filter((t) => t.length > 3);
      if (targetTokens.size > 0 && existingTokens.length > 0) {
        let overlap = 0;
        for (const token of targetTokens) {
          if (existingTokens.includes(token)) overlap++;
        }
        const overlapRatio = overlap / Math.min(targetTokens.size, existingTokens.length);
        if (overlapRatio > 0.5) {
          return true;
        }
      }
    }
    return false;
  }

  async getStatus(tenantId: string) {
    const allIncidents = await this.incidentService.findAll(tenantId);
    this.totalIncidentsCount = allIncidents.length || 1000;
    const analyzed = this.analyzedIncidentIds.size;
    const percentage = Math.min(100, Math.round((analyzed / this.totalIncidentsCount) * 100));
    
    const kbCount = await this.prisma.knowledgeArticle.count({ where: { tenantId } });

    return {
      totalIncidentsCount: this.totalIncidentsCount,
      analyzedIncidentCount: analyzed,
      percentageAnalyzed: percentage,
      publishedArticlesCount: kbCount,
      isWorkerRunning: this.isWorkerRunning,
      modelUsed: this.llamaModel,
    };
  }

  async findAll(category?: string, query?: string): Promise<KnowledgeArticle[]> {
    let whereClause: any = {};
    if (category && category.toLowerCase() !== 'all') {
      whereClause.category = { contains: category, mode: 'insensitive' };
    }
    
    if (query) {
      whereClause.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { summary: { contains: query, mode: 'insensitive' } },
        { configurationItem: { contains: query, mode: 'insensitive' } },
        { rootCause: { contains: query, mode: 'insensitive' } },
      ];
    }

    const records = await this.prisma.knowledgeArticle.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    
    return records.map(r => this.mapKBToDTO(r));
  }

  async findOne(id: string): Promise<KnowledgeArticle> {
    const cleanId = id.toUpperCase();
    let record = await this.prisma.knowledgeArticle.findFirst({
      where: { OR: [{ id: cleanId }, { number: cleanId }] },
    });
    
    if (!record) {
      throw new NotFoundException(`Knowledge Article ${id} not found.`);
    }
    
    record = await this.prisma.knowledgeArticle.update({
      where: { id: record.id },
      data: { viewsCount: { increment: 1 } }
    });

    return this.mapKBToDTO(record);
  }

  async updateArticle(id: string, dto: any): Promise<KnowledgeArticle> {
    const cleanId = id.toUpperCase();
    const existing = await this.prisma.knowledgeArticle.findFirst({
      where: { OR: [{ id: cleanId }, { number: cleanId }] },
    });
    
    if (!existing) {
      throw new NotFoundException(`Knowledge Article ${id} not found.`);
    }

    const updated = await this.prisma.knowledgeArticle.update({
      where: { id: existing.id },
      data: {
        title: dto.title !== undefined ? dto.title : undefined,
        category: dto.category !== undefined ? dto.category : undefined,
        summary: dto.summary !== undefined ? dto.summary : undefined,
        rootCause: dto.rootCause !== undefined ? dto.rootCause : undefined,
        configurationItem: dto.configurationItem !== undefined ? dto.configurationItem : undefined,
        author: dto.author !== undefined ? dto.author : undefined,
        resolutionSteps: Array.isArray(dto.resolutionSteps) ? dto.resolutionSteps : undefined,
        symptoms: Array.isArray(dto.symptoms) ? dto.symptoms : undefined,
      }
    });

    return this.mapKBToDTO(updated);
  }

  private getDynamicConfig() {
    let baseUrl = this.liteLlmBaseUrl;
    let apiKey = this.liteLlmApiKey;
    let model = this.llamaModel;
    return { baseUrl, apiKey, model };
  }

  private categorizeKB(article: any): string {
    const title = (article.title || '').toLowerCase();
    const summary = (article.summary || '').toLowerCase();
    const ci = (article.configurationItem || '').toLowerCase();
    const text = `${title} ${summary}`;
    
    // Very specific patterns - must match title/summary keywords exactly
    const categories: [RegExp, string][] = [
      // User management - exact patterns
      [/(create|provision|add)\s+(user|account|id)\s+(on|for|called)/i, 'User Account Creation & Provisioning'],
      [/user\s+(delet|offboard|remov)\s+(on|from|account)/i, 'User Account Deletion & Offboarding'],
      [/(lock|unlock)\s+(account|user)\s+(on|linux)/i, 'User Account Lock & Unlock'],
      [/(password|passwd)\s+(reset|change)\s+(on|linux)/i, 'User Password Reset'],
      
      // Dashboard - exact match
      [/dashboard.*(worker1ol|192\.168\.56\.10)/i, 'ITSM Dashboard Recovery (Worker1OL)'],
      
      // Kubernetes - exact patterns
      [/kubernetes.*(ingress|controller|high\s*cpu)/i, 'Kubernetes Ingress Recovery'],
      [/kube.*(node|kubelet|notready)/i, 'Kubernetes Node Recovery'],
      
      // SSH - exact
      [/(sshd|ssh\s+service).*(not\s+working|fail|down)/i, 'SSH Service Failure'],
      
      // Database - exact patterns
      [/postgres.*(replication|lag|primary)/i, 'PostgreSQL Replication Recovery'],
      [/(database|db).*(connection|timeout)/i, 'Database Connection Recovery'],
      
      // Network - exact patterns
      [/router.*(latency|high|slow)/i, 'Network Latency Recovery'],
      [/(vpn|ipsec|certificate).*(expir|renew)/i, 'VPN Certificate Recovery'],
      
      // Application - exact patterns
      [/(erp|sap).*(sso|auth|failure)/i, 'SAP ERP SSO Recovery'],
      [/(okta|mfa).*(webhook|timeout|fail)/i, 'Okta MFA Recovery'],
      [/(active\s*directory|ldap).*(sync|fail)/i, 'Active Directory LDAP Recovery'],
      [/(email|mail).*(gateway|queue|backlog)/i, 'Email Gateway Recovery'],
      
      // Printer - exact
      [/(printer|spooler).*(offline|fail)/i, 'Printer Spooler Recovery'],
      
      // Server - exact patterns
      [/(kernel|os).*(patch|panic)/i, 'Unix Kernel Panic Recovery'],
      [/(sssd|ldap).*(connection|refuse)/i, 'SSSD LDAP Connection Recovery'],
      
      // Generic fallback - very broad
      [/(cpu|memory).*(high|utilization)/i, 'System Performance Issue'],
      [/(disk|storage).*(space|full)/i, 'Disk Space Issue'],
    ];
    
    for (const [pattern, category] of categories) {
      if (pattern.test(title) || pattern.test(text)) return category;
    }
    
    // Use existing category if no pattern matches
    return article.category || 'General IT Operations';
  }

  private detectIntent(article: any): string {
    const text = `${article.title || ''} ${article.summary || ''} ${(article.resolutionSteps || []).join(' ')}`.toLowerCase();
    
    // Intent patterns - these are MUTUALLY EXCLUSIVE
    const intents: [RegExp, string][] = [
      // Creation/Provisioning
      [/(create|provision|add|setup|new)\s+(user|account|id)/i, 'CREATE'],
      [/useradd|adduser|useradd\s+-m/i, 'CREATE'],
      
      // Deletion/Offboarding
      [/(delete|remove|offboard|deprovision)\s+(user|account)/i, 'DELETE'],
      [/userdel|deluser|userdel\s+-r/i, 'DELETE'],
      
      // Lock/Disable
      [/(lock|disable|freeze)\s+(account|user)/i, 'LOCK'],
      [/passwd\s+-l|usermod\s+-L/i, 'LOCK'],
      
      // Unlock/Enable
      [/(unlock|enable|restore|unfreeze)\s+(account|user)/i, 'UNLOCK'],
      [/passwd\s+-u|usermod\s+-U/i, 'UNLOCK'],
      
      // Password Reset
      [/(reset|change)\s+password/i, 'PASSWORD_RESET'],
      [/passwd\s+(?!-)[a-z]/i, 'PASSWORD_RESET'],
      
      // Modification
      [/(modify|change|update)\s+(user|shell|group|sudo)/i, 'MODIFY'],
      [/chsh|usermod\s+-s/i, 'MODIFY'],
      
      // Recovery/Repair
      [/(recover|repair|restore|fix)\s+(service|system|server)/i, 'RECOVERY'],
      
      // Diagnostics
      [/(diagnose|check|inspect|verify|status)/i, 'DIAGNOSTICS'],
    ];
    
    for (const [pattern, intent] of intents) {
      if (pattern.test(text)) return intent;
    }
    
    return 'GENERAL';
  }

  private ensureSshFirstStep(steps: string[], ci: string = '192.168.100.101'): string[] {
    if (!Array.isArray(steps) || steps.length === 0) {
      return [`ssh root@${ci}`];
    }
    const targetHost = ci.match(/\d+\.\d+\.\d+\.\d+/)?.[0] || '192.168.100.101';
    return steps.map((step) => {
      const cleanStep = step.replace(/^\d+\.\s*/, '').trim();
      if (cleanStep.toLowerCase().startsWith('ssh ')) {
        return cleanStep;
      }
      return `ssh root@${targetHost} "${cleanStep.replace(/"/g, '\\"')}"`;
    });
  }

  private async callLlama3370b(prompt: string, problemDomain: string): Promise<any> {
    const config = this.getDynamicConfig();
    this.logger.log(`Invoking LLM (${config.model}) via ${config.baseUrl} for problem: "${problemDomain}"...`);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      };
      if (!config.baseUrl.includes('nvidia.com')) {
        headers['x-litellm-api-key'] = config.apiKey;
      }

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content: `You are an expert Senior Systems & DevOps Engineer and ITIL Knowledge Management Specialist.
Synthesize a highly technical, specific, and actionable Standard Operating Procedure (SOP) Knowledge Base Article to solve the technical issue: "${problemDomain}".

CRITICAL INSTRUCTIONS:
- DO NOT use generic boilerplate phrases.
- MANDATORY SSH STEP: Step 1 of resolutionSteps MUST ALWAYS start with the explicit SSH connection command: 'ssh root@<target host>' (e.g. '1. ssh root@192.168.100.101' or '1. Establish SSH connection: ssh root@<target host>'). All subsequent steps are executed over this SSH session.
- Write a highly descriptive, technical Title.
- Provide a concrete, 2-3 sentence Executive Summary.
- List 3-4 highly specific symptoms.
- Explain the precise technical root cause.
- Provide 4-5 precise, sequential, concrete resolution steps starting with 'ssh root@<target host>' on step 1.

Respond in strict JSON format:
{
  "title": "string",
  "summary": "string",
  "symptoms": ["string", "string", ...],
  "rootCause": "string",
  "resolutionSteps": ["ssh root@<target host>", "command1", "command2", ...]
}`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
          top_p: 0.7,
          max_tokens: 1024,
          stream: false,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: any = await response.json();
      const rawText = data.choices?.[0]?.message?.content || '';
      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.resolutionSteps)) {
        parsed.resolutionSteps = this.ensureSshFirstStep(parsed.resolutionSteps, problemDomain);
      }
      return parsed;
    } catch {
      const cleanDomain = problemDomain.replace(/\(#\d+\)/, '').trim();
      return {
        title: `Troubleshooting & SOP: ${cleanDomain}`,
        summary: `Standard Operating Procedure to diagnose and resolve ${cleanDomain} service issues.`,
        symptoms: [`Service ${cleanDomain} reported degraded state`, `Connection timeouts or refused connections in logs.`],
        rootCause: `Improper configuration settings, corrupted state files, or service crash due to memory pressure.`,
        resolutionSteps: [
          `ssh root@192.168.100.101 "ps aux | grep ${cleanDomain.split(' ')[0]}"`,
          `ssh root@192.168.100.101 "journalctl -n 50"`,
        ]
      };
    }
  }

  async runContinuousBackgroundSynthesis(tenantId: string) {
    if (this.isWorkerRunning) return;
    this.isWorkerRunning = true;

    try {
      // 1. Get all existing KB articles
      const existingKb = await this.prisma.knowledgeArticle.findMany({ where: { tenantId } });
      this.logger.log(`📚 Knowledge Consolidator: Analyzing ${existingKb.length} existing KB articles...`);

      // 2. Group KB articles by problem category AND intent
      const categoryMap = new Map<string, any[]>();
      
      for (const article of existingKb) {
        const category = this.categorizeKB(article);
        const intent = this.detectIntent(article);
        const key = `${category}::${intent}`;
        if (!categoryMap.has(key)) {
          categoryMap.set(key, []);
        }
        categoryMap.get(key)!.push(article);
      }

      this.logger.log(`📋 Found ${categoryMap.size} distinct problem categories with intents`);

      // 3. For each category with multiple articles, consolidate into Master SOP
      for (const [key, articles] of categoryMap) {
        if (articles.length < 2) continue; // Skip single-article categories
        
        const [category, intent] = key.split('::');
        
        // SAFETY CHECK: Never consolidate articles with conflicting intents
        const intents = articles.map(a => this.detectIntent(a));
        const uniqueIntents = [...new Set(intents)];
        
        if (uniqueIntents.length > 1) {
          this.logger.warn(`⚠️ Skipping consolidation for "${category}" - conflicting intents detected: ${uniqueIntents.join(', ')}`);
          continue;
        }

        // Check if Master SOP already exists
        const masterSop = articles.find(a => 
          a.title?.toLowerCase().includes('master sop') ||
          a.title?.toLowerCase().includes('generic sop')
        );

        if (masterSop) {
          // Update existing Master SOP with new resolution steps from other articles
          const newSteps = articles
            .filter(a => a.id !== masterSop.id)
            .flatMap(a => (a.resolutionSteps as string[]) || [])
            .filter((step, idx, arr) => arr.indexOf(step) === idx); // deduplicate

          if (newSteps.length > 0) {
            const mergedSteps = [
              ...(masterSop.resolutionSteps as string[] || []),
              ...newSteps
            ].filter((step, idx, arr) => arr.indexOf(step) === idx);

            await this.prisma.knowledgeArticle.update({
              where: { id: masterSop.id },
              data: {
                resolutionSteps: mergedSteps,
                sourceIncidentIds: articles.map(a => a.number),
                workNotesAnalyzedCount: articles.reduce((sum, a) => sum + (a.workNotesAnalyzedCount || 0), 0),
              }
            });
            this.logger.log(`🔄 Updated Master SOP ${masterSop.number} with ${newSteps.length} new steps from ${articles.length} articles`);
          }
        } else {
          // Create new Master SOP by consolidating articles
          // Find max existing KB number to avoid duplicates
          const lastKb = await this.prisma.$queryRaw<{number: string}[]>`
            SELECT number FROM "KnowledgeArticle" 
            WHERE number LIKE 'KB%'
            ORDER BY CAST(SUBSTRING(number FROM 3) AS INTEGER) DESC
            LIMIT 1
          `;
          
          let nextNum = 1;
          if (lastKb && lastKb.length > 0) {
            const match = lastKb[0].number.match(/KB(\d+)/);
            if (match) {
              nextNum = parseInt(match[1], 10) + 1;
            }
          }
          const kbNumber = `KB${String(nextNum).padStart(7, '0')}`;
          
          // Collect actual data from source articles
          const allSteps = articles.flatMap(a => (a.resolutionSteps as string[]) || []);
          const allSymptoms = articles.flatMap(a => (a.symptoms as string[]) || []);
          const allRootCauses = articles.map(a => a.rootCause).filter(Boolean);
          const allSummaries = articles.map(a => a.summary).filter(Boolean);

          // Build detailed context for LLM
          const articleDetails = articles.map((a, i) => `
ARTICLE ${i+1}: ${a.number} - ${a.title}
Category: ${a.category}
CI: ${a.configurationItem}
Summary: ${(a.summary || '').substring(0, 300)}
Symptoms: ${(a.symptoms as string[] || []).join('; ').substring(0, 300)}
Root Cause: ${(a.rootCause || '').substring(0, 300)}
Resolution Steps: ${(a.resolutionSteps as string[] || []).join('\n  ')}
          `).join('\n');

          const prompt = `You are an expert ITSM Knowledge Base Manager. Consolidate these ${articles.length} related SOP articles into ONE comprehensive Master SOP.

CATEGORY: ${category}

SOURCE ARTICLES:
${articleDetails}

IMPORTANT RULES:
1. USE THE ACTUAL RESOLUTION STEPS from the source articles - do NOT create generic placeholders
2. MERGE similar steps, remove duplicates, but KEEP the real commands
3. The resolution steps must be REAL, executable SSH commands
4. Keep the best symptoms from each article
5. Identify the REAL root cause patterns from the articles
6. Make the summary comprehensive but specific to this category

Return JSON with:
- title: "Master SOP: ${category}"
- summary: (comprehensive summary of what this SOP covers)
- symptoms: (array of unique symptoms from all articles)
- rootCause: (real root causes identified from the articles)
- resolutionSteps: (merged, deduplicated REAL steps from source articles - SSH commands with actual parameters)`;

          try {
            const parsed = await this.callLlama3370b(prompt, category);
            
            // Use actual steps from source articles as primary, LLM steps as enhancement
            const mergedSteps = parsed.resolutionSteps && parsed.resolutionSteps.length > 3
              ? parsed.resolutionSteps
              : [...new Set(allSteps)].filter(s => s && s.length > 5);
            
            // Use actual symptoms, not generic ones
            const mergedSymptoms = parsed.symptoms && parsed.symptoms.length > 2
              ? parsed.symptoms
              : [...new Set(allSymptoms)].filter(s => s && s.length > 10).slice(0, 10);
            
            // Use actual root causes from articles
            const mergedRootCause = parsed.rootCause && !parsed.rootCause.includes('Improper configuration settings')
              ? parsed.rootCause
              : allRootCauses[0] || `Multiple failure modes across ${articles.length} incidents`;

            const masterArticle = {
              tenantId,
              number: kbNumber,
              title: `Master SOP: ${category}`,
              category,
              configurationItem: articles[0]?.configurationItem || 'General',
              summary: parsed.summary || `Consolidated Master SOP for ${category} covering ${articles.length} related issues.`,
              symptoms: mergedSymptoms,
              rootCause: mergedRootCause,
              resolutionSteps: this.ensureSshFirstStep(
                mergedSteps.slice(0, 20),
                articles[0]?.configurationItem || '192.168.100.101'
              ),
              workNotesAnalyzedCount: articles.reduce((sum, a) => sum + (a.workNotesAnalyzedCount || 0), 0),
              sourceIncidentIds: articles.map(a => a.number),
              viewsCount: 0,
              helpfulCount: 0,
              author: '🤖 Knowledge Consolidator Agent',
              modelUsed: this.llamaModel,
            };

            const existingMaster = await this.prisma.knowledgeArticle.findFirst({
              where: { tenantId, title: { equals: masterArticle.title, mode: 'insensitive' } }
            });

            if (existingMaster) {
              await this.prisma.knowledgeArticle.update({
                where: { id: existingMaster.id },
                data: {
                  symptoms: masterArticle.symptoms,
                  rootCause: masterArticle.rootCause,
                  resolutionSteps: masterArticle.resolutionSteps,
                  workNotesAnalyzedCount: masterArticle.workNotesAnalyzedCount,
                  sourceIncidentIds: masterArticle.sourceIncidentIds,
                  summary: masterArticle.summary,
                }
              });
              this.logger.log(`🔄 Updated existing Master SOP ${existingMaster.number} for "${category}" consolidating ${articles.length} articles`);
            } else {
              await this.prisma.knowledgeArticle.create({ data: masterArticle });
              this.logger.log(`✅ Created Master SOP ${kbNumber} for "${category}" consolidating ${articles.length} articles`);
            }
          } catch (err: any) {
            this.logger.error(`Error creating Master SOP for ${category}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in knowledge consolidation: ${err.message}`);
    } finally {
      this.isWorkerRunning = false;
    }
  }

  async synthesizeAllIncidentsInBatches(tenantId: string) {
    this.runContinuousBackgroundSynthesis(tenantId);
    return this.getStatus(tenantId);
  }

  async generateArticlesFromWorkNotes(tenantId: string) {
    return this.synthesizeAllIncidentsInBatches(tenantId);
  }

  async createArticle(dto: any) {
    const tenantId = dto.tenantId || 'tenant_acme_01';

    // Strict Deduplication Guard: Prevent duplicate creation if an article with identical title already exists
    if (dto.title) {
      const existing = await this.prisma.knowledgeArticle.findFirst({
        where: { tenantId, title: { equals: dto.title.trim(), mode: 'insensitive' } }
      });
      if (existing) {
        this.logger.log(`ℹ️ KB Article '${existing.number}' already exists with title '${existing.title}'. Merging resolution steps and symptoms...`);
        const existingSteps = (existing.resolutionSteps as string[]) || [];
        const newSteps = (dto.resolutionSteps as string[]) || [];
        const mergedSteps = Array.from(new Set([...existingSteps, ...newSteps]));

        const existingSymptoms = (existing.symptoms as string[]) || [];
        const newSymptoms = (dto.symptoms as string[]) || [];
        const mergedSymptoms = Array.from(new Set([...existingSymptoms, ...newSymptoms]));

        const updated = await this.prisma.knowledgeArticle.update({
          where: { id: existing.id },
          data: { resolutionSteps: mergedSteps, symptoms: mergedSymptoms }
        });
        return this.mapKBToDTO(updated);
      }
    }

    const totalKb = await this.prisma.knowledgeArticle.count({ where: { tenantId } });
    const newId = dto.number || `KB${String(totalKb + 1).padStart(7, '0')}`;
    const record = await this.prisma.knowledgeArticle.upsert({
      where: { number: newId },
      create: {
        tenantId,
        number: newId,
        title: dto.title || 'Troubleshooting & SOP: New Issue',
        category: dto.category || 'Unix - OS & Services',
        configurationItem: dto.configurationItem || 'Unspecified CI',
        summary: dto.summary || 'Dynamically synthesized SOP article.',
        symptoms: dto.symptoms || ['Telemetry alert reported for new issue.'],
        rootCause: dto.rootCause || 'Root cause identified in new use case diagnostic.',
        resolutionSteps: dto.resolutionSteps || [],
        workNotesAnalyzedCount: 1,
        sourceIncidentIds: dto.sourceIncidentIds || [],
        author: dto.author || '🤖 Gemini 3.1 Pro Knowledge Synthesis Agent',
        modelUsed: dto.modelUsed || 'Gemini 3.5 Flash',
        viewsCount: 1,
        helpfulCount: 0,
      },
      update: {
        title: dto.title || 'Troubleshooting & SOP: New Issue',
        category: dto.category || 'Unix - OS & Services',
        configurationItem: dto.configurationItem || 'Unspecified CI',
        summary: dto.summary || 'Dynamically synthesized SOP article.',
        symptoms: dto.symptoms || ['Telemetry alert reported for new issue.'],
        rootCause: dto.rootCause || 'Root cause identified in new use case diagnostic.',
        resolutionSteps: dto.resolutionSteps || [],
        workNotesAnalyzedCount: 1,
        sourceIncidentIds: dto.sourceIncidentIds || [],
        author: dto.author || '🤖 Gemini 3.1 Pro Knowledge Synthesis Agent',
        modelUsed: dto.modelUsed || 'Gemini 3.5 Flash',
      }
    });
    return this.mapKBToDTO(record);
  }
}
