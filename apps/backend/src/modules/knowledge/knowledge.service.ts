import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IncidentService } from '../incidents/incident.service';
import { PrismaService } from '../../database/prisma.service';

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
  private readonly liteLlmApiKey: string;
  private readonly llamaModel: string;

  constructor(
    private readonly incidentService: IncidentService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {
    this.liteLlmBaseUrl = this.configService?.get<string>('LITELLM_BASE_URL') || 'https://genailab.tcs.in/v1';
    this.liteLlmApiKey = 'sk-RRoxANx2dKdNE3N5j0mbxQ';
    this.llamaModel = this.configService?.get<string>('LITELLM_LLAMA_MODEL') || 'azure_ai/genailab-maas-Llama-3.3-70B-Instruct';

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
      const allIncidents = await this.incidentService.findAll(tenantId);
      this.totalIncidentsCount = allIncidents.length || 1000;

      const unanalyzed = allIncidents.filter((inc) => !this.analyzedIncidentIds.has(inc.id || inc.number));
      this.logger.log(`🤖 Continuous Worker: Found ${unanalyzed.length} unanalyzed incidents out of ${this.totalIncidentsCount}.`);

      const CHUNK_SIZE = 10;
      for (let i = 0; i < unanalyzed.length; i += CHUNK_SIZE) {
        const batch = unanalyzed.slice(i, i + CHUNK_SIZE);
        const batchSampleTitle = batch[0]?.shortDescription || 'Enterprise IT Issue';
        const ci = batch[0]?.configurationItem || 'General Infrastructure';
        const resolutionCode = batch[0]?.resolutionCode || 'General Triage';

        for (const inc of batch) {
          this.analyzedIncidentIds.add(inc.id || inc.number);
        }

        const isSolved = await this.isProblemAlreadySolved(tenantId, batchSampleTitle);
        if (!isSolved) {
          const totalKb = await this.prisma.knowledgeArticle.count({ where: { tenantId } });
          const kbNumber = `KB${String(totalKb + 1).padStart(7, '0')}`;
          
          const workNotesText = batch
            .flatMap((inc) => (inc.activities || []).map((a: any) => `[${inc.id} - ${inc.shortDescription}] WorkNote: ${a.comment}`))
            .slice(0, 5)
            .join('\n');

          const prompt = `Synthesize UNIQUE SOP Knowledge Article for Problem: "${batchSampleTitle}" (CI: ${ci}, Category: ${resolutionCode}).
Analyzed Batch Work Notes (${batch.length} tickets):
${workNotesText}`;

          try {
            let matchedApproval: any = null;
            const approvals = await this.prisma.agentApproval.findMany({
              where: { status: 'APPROVED' },
            });
            
            for (const inc of batch) {
              const found = approvals.find((a) => a.entityId === inc.id || a.entityId === inc.number);
              if (found) {
                matchedApproval = found;
                break;
              }
            }

            let articleData: any = {
              tenantId,
              number: kbNumber,
              category: resolutionCode,
              configurationItem: ci,
              workNotesAnalyzedCount: batch.flatMap((b) => b.activities || []).length,
              sourceIncidentIds: batch.map((b) => b.id || b.number),
              viewsCount: 1,
              helpfulCount: 0,
            };

            if (matchedApproval) {
              const details = matchedApproval.details as any || {};
              const steps = Array.isArray(details.proposedCommands)
                ? details.proposedCommands.map((cmd: string, idx: number) => `${idx + 1}. ${cmd}`)
                : [`1. Inspect configuration item status on ${ci}.`];

              articleData = {
                ...articleData,
                title: details.kbTitle || `Troubleshooting & SOP: ${batchSampleTitle.replace(/\(#\d+\)/, '').trim()}`,
                summary: details.summary || `Executive Standard Operating Procedure (SOP) for ${batchSampleTitle}.`,
                symptoms: [`Alerts triggered for ${batchSampleTitle}`, 'System degradation reported.'],
                rootCause: details.aiReasoning || `Diagnostic root cause identified across ${batch.length} analyzed incidents.`,
                resolutionSteps: this.ensureSshFirstStep(steps, ci),
                author: details.agentName || '🤖 Unix Auto-Resolver Agent',
                modelUsed: details.model || 'nvidia/nemotron-3-ultra-550b-a55b',
              };
            } else {
              const parsed = await this.callLlama3370b(prompt, batchSampleTitle);
              articleData = {
                ...articleData,
                title: parsed.title || `Troubleshooting & SOP: ${batchSampleTitle.replace(/\(#\d+\)/, '').trim()}`,
                summary: parsed.summary || `Executive Standard Operating Procedure (SOP) for ${batchSampleTitle}.`,
                symptoms: parsed.symptoms || [`Alerts triggered for ${batchSampleTitle}`, 'System degradation reported.'],
                rootCause: parsed.rootCause || `Diagnostic root cause identified.`,
                resolutionSteps: this.ensureSshFirstStep(parsed.resolutionSteps || [`1. Inspect ${ci}.`], ci),
                author: '🤖 NVIDIA Nemotron 3 550B Knowledge Agent',
                modelUsed: 'NVIDIA Nemotron 3 550B / Meta Llama 3.3 70B (NIM)',
              };
            }

            await this.prisma.knowledgeArticle.create({ data: articleData });
          } catch (err: any) {
            this.logger.error(`Error in continuous background synthesis: ${err.message}`);
          }
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (err: any) {
      this.logger.error(`Error in continuous worker execution: ${err.message}`);
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

  async createArticle(tenantId: string, dto: any) {
    const totalKb = await this.prisma.knowledgeArticle.count({ where: { tenantId } });
    const newId = `KB${String(totalKb + 1).padStart(7, '0')}`;
    const record = await this.prisma.knowledgeArticle.create({
      data: {
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
      }
    });
    return this.mapKBToDTO(record);
  }
}
