import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IncidentService } from '../incidents/incident.service';
import { PrismaService } from '../../database/prisma.service';
import { SingleDatabaseService } from '../../database/single-db.service';
import * as fs from 'fs';
import * as path from 'path';

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
  private articles: KnowledgeArticle[] = [];
  private analyzedIncidentIds: Set<string> = new Set();
  private isProcessing = false;
  private isWorkerRunning = false;
  private totalIncidentsCount = 1000;
  private readonly liteLlmBaseUrl: string;
  private readonly liteLlmApiKey: string;
  private readonly llamaModel: string;

  constructor(
    private readonly incidentService: IncidentService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly singleDb: SingleDatabaseService
  ) {
    this.liteLlmBaseUrl = this.configService?.get<string>('LITELLM_BASE_URL') || 'https://genailab.tcs.in/v1';
    this.liteLlmApiKey = 'sk-RRoxANx2dKdNE3N5j0mbxQ';
    this.llamaModel = this.configService?.get<string>('LITELLM_LLAMA_MODEL') || 'azure_ai/genailab-maas-Llama-3.3-70B-Instruct';

    this.articles = this.singleDb.knowledgeArticles;
    this.analyzedIncidentIds = new Set(this.singleDb.analyzedIncidents);
    this.deduplicateArticles();

    // Start continuous background processing after 5 seconds
    setTimeout(() => {
      this.runContinuousBackgroundSynthesis('tenant_acme_01');
    }, 5000);
  }

  private saveArticlesToFile() {
    this.singleDb.knowledgeArticles = this.articles;
  }

  private saveAnalyzedIncidentIdsToFile() {
    this.singleDb.analyzedIncidents = Array.from(this.analyzedIncidentIds);
  }

  private deduplicateArticles() {
    const uniqueArticles: KnowledgeArticle[] = [];
    const seenProblems = new Set<string>();

    for (const article of this.articles) {
      const problemKey = this.extractProblemKey(article.title);
      if (!seenProblems.has(problemKey)) {
        seenProblems.add(problemKey);
        uniqueArticles.push(article);
      }
    }

    if (uniqueArticles.length !== this.articles.length) {
      this.logger.log(`Deduplicated Knowledge Base: Kept ${uniqueArticles.length} unique problem articles.`);
      this.articles = uniqueArticles;
      this.saveArticlesToFile();
    }
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

  private isProblemAlreadySolved(problemTitle: string): boolean {
    const targetKey = this.extractProblemKey(problemTitle);
    const targetTokens = new Set(targetKey.split(' ').filter((t) => t.length > 3));

    for (const article of this.articles) {
      const existingKey = this.extractProblemKey(article.title);
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

    return {
      totalIncidentsCount: this.totalIncidentsCount,
      analyzedIncidentCount: analyzed,
      percentageAnalyzed: percentage,
      publishedArticlesCount: this.articles.length,
      isWorkerRunning: this.isWorkerRunning,
      modelUsed: this.llamaModel,
    };
  }

  async findAll(category?: string, query?: string): Promise<KnowledgeArticle[]> {
    let result = [...this.articles];
    if (category && category.toLowerCase() !== 'all') {
      const catLower = category.toLowerCase();
      result = result.filter((a) => a.category.toLowerCase().includes(catLower));
    }
    if (query) {
      const qLower = query.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(qLower) ||
          a.summary.toLowerCase().includes(qLower) ||
          a.configurationItem.toLowerCase().includes(qLower) ||
          a.rootCause.toLowerCase().includes(qLower)
      );
    }
    return result;
  }

  async findOne(id: string): Promise<KnowledgeArticle> {
    const cleanId = id.toUpperCase();
    const article = this.articles.find(
      (a) => a.id.toUpperCase() === cleanId || a.number.toUpperCase() === cleanId
    );
    if (!article) {
      throw new NotFoundException(`Knowledge Article ${id} not found.`);
    }
    article.viewCount++;
    this.saveArticlesToFile();
    return article;
  }

  async updateArticle(id: string, dto: any): Promise<KnowledgeArticle> {
    const cleanId = id.toUpperCase();
    const article = this.articles.find(
      (a) => a.id.toUpperCase() === cleanId || a.number.toUpperCase() === cleanId
    );
    if (!article) {
      throw new NotFoundException(`Knowledge Article ${id} not found.`);
    }

    if (dto.title !== undefined) article.title = dto.title;
    if (dto.category !== undefined) article.category = dto.category;
    if (dto.summary !== undefined) article.summary = dto.summary;
    if (dto.rootCause !== undefined) article.rootCause = dto.rootCause;
    if (dto.configurationItem !== undefined) article.configurationItem = dto.configurationItem;
    if (dto.author !== undefined) article.author = dto.author;
    if (Array.isArray(dto.resolutionSteps)) article.resolutionSteps = dto.resolutionSteps;
    if (Array.isArray(dto.symptoms)) article.symptoms = dto.symptoms;
    if (Array.isArray(dto.keywords)) (article as any).keywords = dto.keywords;

    this.saveArticlesToFile();
    return article;
  }

  private getDynamicConfig() {
    let baseUrl = this.liteLlmBaseUrl;
    let apiKey = this.liteLlmApiKey;
    let model = this.llamaModel;

    const dbConfig = this.singleDb.agentModelConfig;
    if (dbConfig) {
      baseUrl = dbConfig.baseUrl || baseUrl;
      apiKey = dbConfig.apiKey || apiKey;
      model = dbConfig.synthesizerModel || dbConfig.routerModel || model;
    }

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
- DO NOT use generic boilerplate phrases like "diagnosing and resolving", "system resource contention", "configuration drift", "inspect configuration item status", "apply remediation protocol", or "validate baseline".
- The SOP must be specifically tailored to the technology mentioned (e.g., if Docker, focus on docker commands/sockets; if SSH, focus on sshd daemon/keys/config; if Kubernetes, focus on pods/kubelet/kubectl).
- MANDATORY SSH STEP: Step 1 of resolutionSteps MUST ALWAYS start with the explicit SSH connection command: 'ssh root@<target host>' (e.g. '1. ssh root@192.168.100.101' or '1. Establish SSH connection: ssh root@<target host>'). All subsequent steps are executed over this SSH session.
- Write a highly descriptive, technical Title.
- Provide a concrete, 2-3 sentence Executive Summary explaining the exact technical failure mode and how to correct it.
- List 3-4 highly specific symptoms that an engineer would observe in logs, system state, or command outputs.
- Explain the precise technical root cause (e.g., port exhaustion, configuration error, certificate expiration, socket permission).
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

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

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
      let title = `Troubleshooting & SOP: ${cleanDomain}`;
      let summary = `Standard Operating Procedure to diagnose and resolve ${cleanDomain} service issues.`;
      let symptoms = [`Service ${cleanDomain} reported degraded state`, `Connection timeouts or refused connections in logs.`];
      let rootCause = `Improper configuration settings, corrupted state files, or service crash due to memory pressure.`;
      let resolutionSteps = [
        `1. Log in to the target system and verify service process status: 'ps aux | grep ${cleanDomain.split(' ')[0]}' or systemctl status.`,
        `2. Inspect logs using journalctl or logs in /var/log/ to identify specific errors.`,
        `3. Restart the affected service process and verify it binds successfully to its network port.`,
        `4. Confirm the service state remains healthy and operational metrics return to baseline.`
      ];

      const lowerDomain = problemDomain.toLowerCase();
      if (lowerDomain.includes('ssh') || lowerDomain.includes('sshd')) {
        title = `sshd Service Restore and Configuration SOP`;
        summary = `Procedure to restore sshd daemon functionality, repair configuration issues, and resolve connection refused errors.`;
        symptoms = [
          `Connection refused on port 22.`,
          `sshd.service: Failed with result 'exit-code' in journalctl.`,
          `Authentication failures for authorized ssh keys.`
        ];
        rootCause = `Misconfigured /etc/ssh/sshd_config file, incorrect directory permissions on ~/.ssh, or port binding conflicts.`;
        resolutionSteps = [
          `1. Check sshd service status: 'systemctl status sshd'`,
          `2. Validate sshd configuration syntax: 'sshd -t'`,
          `3. Ensure correct permissions: 'chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys'`,
          `4. Restart sshd daemon to apply fixes: 'systemctl restart sshd'`,
          `5. Verify ssh socket is listening on port 22: 'ss -tulpn | grep 22'`
        ];
      } else if (lowerDomain.includes('kubelet') || lowerDomain.includes('kubernetes') || lowerDomain.includes('k8s')) {
        title = `Kubernetes Node & Kubelet Recovery SOP`;
        summary = `Guidance for resolving Kubelet daemon failures, node NotReady states, and container runtime communication issues.`;
        symptoms = [
          `Kubernetes worker node status transitions to 'NotReady'.`,
          `Kubelet service fails to start or reports connection refused to API server.`,
          `Container runtime endpoints timed out in logs.`
        ];
        rootCause = `Kubelet certificate expiration, swap space enabled blocking kubelet startup, or containerd service crash.`;
        resolutionSteps = [
          `1. Inspect kubelet status: 'systemctl status kubelet'`,
          `2. Check containerd state and restart if dead: 'systemctl restart containerd'`,
          `3. Disable swap space if enabled: 'swapoff -a'`,
          `4. View kubelet logs for exact API server handshake failures: 'journalctl -u kubelet -n 50 --no-pager'`,
          `5. Restart kubelet daemon: 'systemctl restart kubelet' and verify node status with 'kubectl get nodes'`
        ];
      } else if (lowerDomain.includes('docker') || lowerDomain.includes('containerd')) {
        title = `Docker Daemon & Container Engine Recovery SOP`;
        summary = `Resolution steps for restoring the Docker container service, cleaning stale sockets, and repairing disk space exhaustion.`;
        symptoms = [
          `docker: Cannot connect to the Docker daemon at unix:///var/run/docker.sock.`,
          `docker.service failed to restart or hang indefinitely.`,
          `Disk space exhausted on Docker thin pool storage.`
        ];
        rootCause = `Stale /var/run/docker.pid file blocking start, socket permission denied, or system partition 100% full.`;
        resolutionSteps = [
          `1. Check disk utilization: 'df -h' and clean up stale volumes/images: 'docker system prune -af'`,
          `2. Verify docker service logs: 'journalctl -u docker -n 100'`,
          `3. Remove stale pid lock file if present: 'rm -f /var/run/docker.pid'`,
          `4. Restart docker daemon: 'systemctl restart docker'`,
          `5. Verify socket accessibility: 'ls -l /var/run/docker.sock'`
        ];
      }

      return { title, summary, symptoms, rootCause, resolutionSteps };
    }
  }

  /**
   * Continuous background synthesis worker that runs asynchronously on backend startup.
   */
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

        // Mark batch as analyzed
        for (const inc of batch) {
          this.analyzedIncidentIds.add(inc.id || inc.number);
        }
        this.saveAnalyzedIncidentIdsToFile();

        // Synthesize article if problem is not yet solved
        if (!this.isProblemAlreadySolved(batchSampleTitle)) {
          const kbNumber = `KB${String(this.articles.length + 1).padStart(7, '0')}`;
          const workNotesText = batch
            .flatMap((inc) => (inc.activities || []).map((a: any) => `[${inc.id} - ${inc.shortDescription}] WorkNote: ${a.comment}`))
            .slice(0, 5)
            .join('\n');

          const prompt = `Synthesize UNIQUE SOP Knowledge Article for Problem: "${batchSampleTitle}" (CI: ${ci}, Category: ${resolutionCode}).
Analyzed Batch Work Notes (${batch.length} tickets):
${workNotesText}`;

          try {
            // Find if there is an approved AgentApproval request for any incident in the batch
            let matchedApproval: any = null;
            const approvals = this.singleDb.agentApprovals || [];
            for (const inc of batch) {
              const found = approvals.find(
                (a: any) =>
                  (a.incidentId === inc.id || a.incidentId === inc.number) &&
                  a.status === 'APPROVED'
              );
              if (found) {
                matchedApproval = found;
                break;
              }
            }

            let article: KnowledgeArticle;
            if (matchedApproval) {
              const steps = Array.isArray(matchedApproval.proposedCommands)
                ? matchedApproval.proposedCommands.map((cmd: string, idx: number) => `${idx + 1}. ${cmd}`)
                : [
                    `1. Inspect configuration item status on ${ci}.`,
                    `2. Apply remediation patch or service restart.`,
                    `3. Validate metric health baseline.`,
                  ];

              article = {
                id: kbNumber,
                number: kbNumber,
                title: matchedApproval.kbTitle || `Troubleshooting & SOP: ${batchSampleTitle.replace(/\(#\d+\)/, '').trim()}`,
                category: resolutionCode,
                configurationItem: ci,
                summary: matchedApproval.summary || `Executive Standard Operating Procedure (SOP) for ${batchSampleTitle}.`,
                symptoms: [`Alerts triggered for ${batchSampleTitle}`, 'System degradation reported.'],
                rootCause: matchedApproval.aiReasoning || `Diagnostic root cause identified across ${batch.length} analyzed incidents.`,
                resolutionSteps: this.ensureSshFirstStep(steps, ci),
                workNotesAnalyzedCount: batch.flatMap((b) => b.activities || []).length,
                sourceIncidentIds: batch.map((b) => b.id || b.number),
                author: matchedApproval.agentName || '🤖 Unix Auto-Resolver Agent',
                modelUsed: matchedApproval.model || 'nvidia/nemotron-3-ultra-550b-a55b',
                viewCount: 1,
                helpfulCount: 0,
                createdAt: new Date().toISOString(),
              };
            } else {
              const parsed = await this.callLlama3370b(prompt, batchSampleTitle);
              article = {
                id: kbNumber,
                number: kbNumber,
                title: parsed.title || `Troubleshooting & SOP: ${batchSampleTitle.replace(/\(#\d+\)/, '').trim()}`,
                category: resolutionCode,
                configurationItem: ci,
                summary: parsed.summary || `Executive Standard Operating Procedure (SOP) for ${batchSampleTitle}.`,
                symptoms: parsed.symptoms || [`Alerts triggered for ${batchSampleTitle}`, 'System degradation reported.'],
                rootCause: parsed.rootCause || `Diagnostic root cause identified across ${batch.length} analyzed incidents.`,
                resolutionSteps: this.ensureSshFirstStep(
                  parsed.resolutionSteps || [
                    `1. Inspect configuration item status on ${ci}.`,
                    `2. Apply remediation patch or service restart.`,
                    `3. Validate metric health baseline.`,
                  ],
                  ci
                ),
                workNotesAnalyzedCount: batch.flatMap((b) => b.activities || []).length,
                sourceIncidentIds: batch.map((b) => b.id || b.number),
                author: '🤖 NVIDIA Nemotron 3 550B Knowledge Agent',
                modelUsed: 'NVIDIA Nemotron 3 550B / Meta Llama 3.3 70B (NIM)',
                viewCount: 1,
                helpfulCount: 0,
                createdAt: new Date().toISOString(),
              };
            }

            this.articles.unshift(article);
            this.saveArticlesToFile();
          } catch (err: any) {
            this.logger.error(`Error in continuous background synthesis: ${err.message}`);
          }
        }

        // 1.5 second pacing between chunks
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (err: any) {
      this.logger.error(`Error in continuous worker execution: ${err.message}`);
    } finally {
      this.isWorkerRunning = false;
    }
  }

  async synthesizeAllIncidentsInBatches(tenantId: string) {
    // Trigger background synthesis if not already running
    this.runContinuousBackgroundSynthesis(tenantId);
    return this.getStatus(tenantId);
  }

  async generateArticlesFromWorkNotes(tenantId: string) {
    return this.synthesizeAllIncidentsInBatches(tenantId);
  }

  createArticle(dto: any) {
    this.articles = this.singleDb.knowledgeArticles || [];
    const newId = `KB${String(this.articles.length + 1).padStart(7, '0')}`;
    const newArticle = {
      id: newId,
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
      viewCount: 1,
      helpfulCount: 0,
      createdAt: new Date().toISOString()
    };
    this.articles.unshift(newArticle);
    this.singleDb.knowledgeArticles = this.articles;
    return newArticle;
  }
}
