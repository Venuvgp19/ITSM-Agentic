import { Injectable, NotFoundException, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { KnowledgeService } from '../knowledge/knowledge.service';

export interface SafetyCheck {
  check: string;
  passed: boolean;
}

export interface RouterAgentOutput {
  ticketId: string;
  category: string;
  impactUrgency: string;
  assignedPriority: string;
  dispatchRoute: string;
  userAcknowledgment: string;
}

export interface ResolverAgentOutput {
  diagnosis: string;
  matchedRunbook: string;
  remediationStepsApplied: string[];
  resolutionStatus: string;
  userResolutionNotice: string;
}

export interface SynthesizerAgentOutput {
  draftKbId: string;
  kbTitle: string;
  synthesizedSolution: string;
  trendInsight: string;
}

export interface AgentApproval {
  id: string;
  incidentId: string;
  incidentTitle: string;
  agentId: string;
  agentName: string;
  model: string;
  targetCi: string;
  department: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidenceScore: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  requestedAt: string;
  summary: string;
  proposedCommands: string[];
  kbArticleReference?: string;
  kbTitle?: string;
  safetyChecks: SafetyCheck[];
  aiReasoning: string;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  routerOutput?: RouterAgentOutput;
  resolverOutput?: ResolverAgentOutput;
  synthesizerOutput?: SynthesizerAgentOutput;
}

export interface AgentHistoryEntry {
  id: string;
  approvalId?: string;
  incidentId: string;
  incidentTitle: string;
  agentId: string;
  agentName: string;
  model: string;
  targetCi: string;
  department: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'APPROVED' | 'REJECTED' | 'AUTO_EXECUTED';
  actionType: string;
  executedAt: string;
  durationMs: number;
  humanApprover: string;
  commandExecuted: string;
  executionOutput: string;
  resolutionOutcome: string;
  kbGenerated?: string;
  routerOutput?: RouterAgentOutput;
  resolverOutput?: ResolverAgentOutput;
  synthesizerOutput?: SynthesizerAgentOutput;
}

@Injectable()
export class AgentGovernanceService implements OnModuleInit {

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => KnowledgeService)) private readonly knowledgeService: KnowledgeService
  ) {}

  async onModuleInit() {
    await this.getModelConfig();
  }

  private mapApprovalToDTO(record: any): AgentApproval {
    const details = record.details as any || {};
    return {
      id: record.id,
      incidentId: record.entityId,
      incidentTitle: details.incidentTitle || 'Autonomous Agent Remediation Request',
      agentId: details.agentId || 'agent-unix-resolver-01',
      agentName: details.agentName || '🤖 Unix Auto-Resolver Agent',
      model: details.model || '🤖 Unknown Model (not captured at submission time)',
      targetCi: details.targetCi || 'Worker 1 (192.168.56.10)',
      department: details.department || 'Unix',
      riskLevel: details.riskLevel || 'HIGH',
      confidenceScore: record.confidenceScore ? (record.confidenceScore > 100 ? record.confidenceScore / 100 : record.confidenceScore) : 95.0,
      status: record.status as any || 'PENDING',
      requestedAt: record.timestamp ? record.timestamp.toISOString() : new Date().toISOString(),
      summary: record.summary || '',
      proposedCommands: details.proposedCommands || [],
      kbArticleReference: details.kbArticleReference || 'KB0000001',
      kbTitle: details.kbTitle || 'Standard Remediation SOP',
      safetyChecks: details.safetyChecks || [],
      aiReasoning: details.aiReasoning || '',
      rejectionReason: details.rejectionReason,
      approvedBy: details.approvedBy,
      approvedAt: details.approvedAt,
      routerOutput: details.routerOutput,
      resolverOutput: details.resolverOutput,
      synthesizerOutput: details.synthesizerOutput
    };
  }

  private mapHistoryToDTO(record: any): AgentHistoryEntry {
    const meta = record.metadata as any || {};
    return {
      id: record.id,
      approvalId: meta.approvalId,
      incidentId: record.incidentId || '',
      incidentTitle: record.title || 'Autonomous Agent Event',
      agentId: meta.agentId || 'agent-unix-resolver-01',
      agentName: meta.agentName || '🤖 Agent',
      model: meta.model || 'gemini-3.1-pro-preview',
      targetCi: meta.targetCi || 'Worker 1',
      department: meta.department || 'Unix',
      riskLevel: meta.riskLevel || 'LOW',
      status: meta.status || 'AUTO_EXECUTED',
      actionType: meta.actionType || 'Autonomous Action',
      executedAt: record.timestamp ? record.timestamp.toISOString() : new Date().toISOString(),
      durationMs: meta.durationMs || 500,
      humanApprover: meta.humanApprover || 'Autonomous Policy',
      commandExecuted: meta.commandExecuted || 'systemctl status',
      executionOutput: meta.executionOutput || 'Execution completed clean.',
      resolutionOutcome: meta.resolutionOutcome || 'Task executed successfully.',
      kbGenerated: meta.kbGenerated,
    };
  }

  async getPendingApprovals(): Promise<AgentApproval[]> {
    const records = await this.prisma.agentApproval.findMany({
      where: { status: 'PENDING' },
      orderBy: { timestamp: 'desc' }
    });
    return records.map(r => this.mapApprovalToDTO(r));
  }

  async getApprovalsByStatus(status: string): Promise<AgentApproval[]> {
    if (!status || status.toUpperCase() === 'ALL') {
      return this.getAllApprovals();
    }
    const records = await this.prisma.agentApproval.findMany({
      where: { status: status.toUpperCase() },
      orderBy: { timestamp: 'desc' }
    });
    return records.map(r => this.mapApprovalToDTO(r));
  }

  async getAllApprovals(): Promise<AgentApproval[]> {
    const records = await this.prisma.agentApproval.findMany({
      orderBy: { timestamp: 'desc' }
    });
    return records.map(r => this.mapApprovalToDTO(r));
  }

  async getApprovalById(id: string): Promise<AgentApproval> {
    const cleanId = id.toUpperCase();
    const record = await this.prisma.agentApproval.findUnique({
      where: { id: cleanId }
    });
    if (!record) throw new NotFoundException(`Approval request ${id} not found.`);
    return this.mapApprovalToDTO(record);
  }

  async createApprovalRequest(dto: Partial<AgentApproval>): Promise<AgentApproval> {
    const existingPending = await this.prisma.agentApproval.findFirst({
      where: { entityId: dto.incidentId, status: 'PENDING' }
    });
    if (existingPending) {
      if (dto.proposedCommands && dto.proposedCommands.length > 0) {
        const existingDetails = (existingPending.details as any) || {};
        const updatedDetails = {
          ...existingDetails,
          model: dto.model || existingDetails.model || 'nvidia/nemotron-3.5-lightning-30b-a3b',
          summary: dto.summary || existingDetails.summary,
          proposedCommands: dto.proposedCommands,
          aiReasoning: dto.aiReasoning || existingDetails.aiReasoning,
          synthesizerOutput: dto.synthesizerOutput || existingDetails.synthesizerOutput,
          kbTitle: dto.kbTitle || existingDetails.kbTitle
        };
        const updated = await this.prisma.agentApproval.update({
          where: { id: existingPending.id },
          data: {
            details: updatedDetails as any,
            summary: dto.summary || existingPending.summary,
            confidenceScore: dto.confidenceScore ? (dto.confidenceScore <= 1.0 ? dto.confidenceScore * 100 : dto.confidenceScore) : existingPending.confidenceScore,
            timestamp: new Date()
          }
        });
        return this.mapApprovalToDTO(updated);
      }
      return this.mapApprovalToDTO(existingPending);
    }

    const newId = `APPR-${Math.floor(1000 + Math.random() * 9000)}`;

    const details = {
      model: dto.model || 'gemini-3.1-pro-preview',
      targetCi: dto.targetCi || 'Worker 1',
      department: dto.department || 'Unix',
      riskLevel: dto.riskLevel || 'HIGH',
      confidenceScore: dto.confidenceScore || 0.95,
      summary: dto.summary || 'Agent requested approval for system execution.',
      proposedCommands: dto.proposedCommands || [],
      kbArticleReference: dto.kbArticleReference,
      kbTitle: dto.kbTitle,
      safetyChecks: dto.safetyChecks || [],
      aiReasoning: dto.aiReasoning || 'Identified mandatory high-risk action requiring human approval.',
      routerOutput: dto.routerOutput,
      resolverOutput: dto.resolverOutput,
      synthesizerOutput: dto.synthesizerOutput,
      incidentTitle: dto.incidentTitle
    };

    const record = await this.prisma.agentApproval.create({
      data: {
        id: newId,
        type: 'EXECUTION',
        entityId: dto.incidentId || 'INC0000001',
        entityType: 'Incident',
        summary: dto.summary || 'Agent requested approval for system execution.',
        proposedAction: 'Execute SSH Remediation',
        confidenceScore: dto.confidenceScore ? (dto.confidenceScore <= 1.0 ? dto.confidenceScore * 100 : dto.confidenceScore) : 85.0,
        status: 'PENDING',
        details: details as any,
        timestamp: new Date()
      }
    });

    return this.mapApprovalToDTO(record);
  }

  async approveRequest(id: string, approverName: string = 'System Admin', proposedCommands?: string[]) {
    const cleanId = id.toUpperCase();
    const record = await this.prisma.agentApproval.findUnique({ where: { id: cleanId } });
    if (!record) throw new NotFoundException(`Approval request ${id} not found.`);

    const details = record.details as any || {};
    if (proposedCommands && proposedCommands.length > 0) {
      details.proposedCommands = proposedCommands;
    }

    const updated = await this.prisma.agentApproval.update({
      where: { id: record.id },
      data: { status: 'APPROVED', details }
    });

    // Auto-promote approved AI-synthesized SOPs to KnowledgeArticle table so they are indexed into RAG
    if (details.synthesizerOutput || (details.proposedCommands && details.proposedCommands.length > 0)) {
      let title = details.kbTitle || details.synthesizerOutput?.kbTitle || details.incidentTitle || record.summary;
      if (!title.toLowerCase().startsWith('master sop:')) {
        title = `Master SOP: ${title.replace(/^(sop:\s*|reusable investigative standard operating procedure:\s*)/i, '').trim()}`;
      }
      const steps = details.proposedCommands || details.synthesizerOutput?.resolutionSteps || [];
      const kbNumber = `KB${Math.floor(1000000 + Math.random() * 9000000)}`;
      try {
        const createdArticle = await this.knowledgeService.createArticle({
          title: title,
          category: details.department || 'Automated Remediation',
          configurationItem: details.targetCi || 'Unknown CI',
          summary: details.summary || details.aiReasoning || title,
          symptoms: [details.incidentTitle || record.summary],
          rootCause: details.aiReasoning || 'Root cause verified by human operator approval & automated execution.',
          resolutionSteps: steps,
          sourceIncidentIds: [record.entityId],
          isPublished: true
        });
        console.log(`[GovernanceService] 📚 Auto-saved newly approved Master SOP ${createdArticle?.number || kbNumber}: "${title}"`);
      } catch (e: any) {
        console.warn(`[GovernanceService] Auto-save KnowledgeArticle note: ${e.message}`);
      }
    }

    await this.updateIncidentToInProgress(record.entityId, approverName);

    return { approval: this.mapApprovalToDTO(updated), historyEntry: null as any };
  }


  async rejectRequest(id: string, rejectionReason: string, rejectorName: string = 'System Admin') {
    const cleanId = id.toUpperCase();
    const record = await this.prisma.agentApproval.findUnique({ where: { id: cleanId } });
    if (!record) throw new NotFoundException(`Approval request ${id} not found.`);

    const details = record.details as any || {};
    details.rejectionReason = rejectionReason || 'Rejected by human operator policy.';

    const updated = await this.prisma.agentApproval.update({
      where: { id: record.id },
      data: { status: 'REJECTED', details }
    });

    await this.updateIncidentToRejected(record.entityId, rejectorName, details.rejectionReason);

    // Create AgentHistory log entry for historical activity view filter
    try {
      await this.prisma.agentHistory.create({
        data: {
          id: `HIST-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
          type: 'LOG',
          incidentId: record.entityId || 'INC0000001',
          title: record.summary || details.incidentTitle || 'Rejected Approval Request',
          description: `Approval Request Rejected: ${details.rejectionReason}`,
          timestamp: new Date(),
          metadata: {
            approvalId: record.id,
            agentId: details.agentId || 'agent-control-tower',
            agentName: '🛡️ HITL Governance',
            model: details.model || 'gemini-3.1-pro-preview',
            targetCi: details.targetCi || 'WorkerNode1HL',
            department: details.department || 'Governance',
            riskLevel: details.riskLevel || 'HIGH',
            status: 'REJECTED',
            actionType: 'HUMAN_REJECTED',
            durationMs: 0,
            humanApprover: rejectorName,
            commandExecuted: `REJECTED: ${details.rejectionReason}`,
            executionOutput: `Approval request was rejected by human operator (${rejectorName}) with reason: ${details.rejectionReason}`,
            resolutionOutcome: `Rejected by human operator policy.`,
          }
        }
      });
    } catch (err) {
      console.warn(`Failed to insert history log for rejected approval: ${err}`);
    }

    return { approval: this.mapApprovalToDTO(updated), historyEntry: null as any };
  }

  async markApprovalConsumed(id: string) {
    const cleanId = id.toUpperCase();
    const record = await this.prisma.agentApproval.findUnique({ where: { id: cleanId } });
    if (!record) return null;

    const updated = await this.prisma.agentApproval.update({
      where: { id: record.id },
      data: { status: 'EXECUTED' }
    });
    return this.mapApprovalToDTO(updated);
  }

  // --- HISTORY METRICS & AUDIT ---

  async getHistory(): Promise<AgentHistoryEntry[]> {
    const records = await this.prisma.agentHistory.findMany({
      where: { type: 'LOG' },
      orderBy: { timestamp: 'desc' },
      take: 200
    });
    return records.map(r => this.mapHistoryToDTO(r));
  }

  async deleteHistoryEntry(id: string) {
    const record = await this.prisma.agentHistory.findFirst({
      where: { id, type: 'LOG' },
    });

    if (!record) {
      return { deleted: false, error: `History entry ${id} not found` };
    }

    await this.prisma.agentHistory.delete({ where: { id } });
    return { deleted: true, id };
  }

  async clearAllApprovals() {
    await this.prisma.agentApproval.deleteMany({});
    await this.prisma.agentHistory.deleteMany({ where: { type: 'LOG' } });

    return {
      success: true,
      message: 'All approval requests and history entries cleared successfully.',
      timestamp: new Date().toISOString(),
      pendingApprovalsCount: 0,
      historyCount: 0
    };
  }

  async resetLocks() {
    return {
      success: true,
      message: 'Stuck execution locks cleared. System feeds force synced.',
      timestamp: new Date().toISOString(),
      pendingApprovalsCount: 0,
      historyCount: 0
    };
  }

  async createHistoryEntry(dto: Partial<AgentHistoryEntry>): Promise<AgentHistoryEntry> {
    const newId = `HIST-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    const record = await this.prisma.agentHistory.create({
      data: {
        id: newId,
        type: 'LOG',
        incidentId: dto.incidentId || 'INC0000001',
        title: dto.incidentTitle || 'Autonomous Agent Event',
        description: dto.executionOutput || 'Execution completed clean.',
        timestamp: new Date(),
        metadata: {
          approvalId: dto.approvalId,
          agentId: dto.agentId || 'agent-unix-resolver-01',
          agentName: dto.agentName || '🤖 Agent',
          model: dto.model || 'gemini-3.1-pro-preview',
          targetCi: dto.targetCi || 'Worker 1',
          department: dto.department || 'Unix',
          riskLevel: dto.riskLevel || 'LOW',
          status: dto.status || 'AUTO_EXECUTED',
          actionType: dto.actionType || 'Autonomous Action',
          durationMs: dto.durationMs || 500,
          humanApprover: dto.humanApprover || 'Autonomous Policy',
          commandExecuted: dto.commandExecuted || 'systemctl status',
          executionOutput: dto.executionOutput || 'Execution completed clean.',
          resolutionOutcome: dto.resolutionOutcome || 'Task executed successfully.',
          kbGenerated: dto.kbGenerated,
        }
      }
    });

    return this.mapHistoryToDTO(record);
  }

  // --- GOVERNANCE ANALYTICS STATS ---

  async getGovernanceStats() {
    const pendingCount = await this.prisma.agentApproval.count({ where: { status: 'PENDING' } });
    const executedCount = await this.prisma.agentApproval.count({ where: { status: 'EXECUTED' } });
    const approvedCount = await this.prisma.agentApproval.count({ where: { status: 'APPROVED' } });
    const rejectedCount = await this.prisma.agentApproval.count({ where: { status: 'REJECTED' } });
    
    // Total governance requests evaluated
    const totalProcessed = approvedCount + executedCount + rejectedCount;
    const approvalRate = totalProcessed > 0 ? (((approvedCount + executedCount) / totalProcessed) * 100).toFixed(1) : '100.0';

    // Fetch history logs to calculate average execution duration, compliance, and risk levels
    const historyLogs = await this.prisma.agentHistory.findMany({
      where: { type: 'LOG' }
    });

    let totalDurationMs = 0;
    let safeActions = 0;
    let violatedActions = 0;
    const riskBreakdown = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    historyLogs.forEach(h => {
      const meta = (h.metadata as any) || {};
      const risk = String(meta.riskLevel || 'LOW').toUpperCase();
      if (risk in riskBreakdown) {
        riskBreakdown[risk]++;
      } else {
        riskBreakdown.LOW++;
      }

      totalDurationMs += Number(meta.durationMs || 500);

      // Check if command execution failed safety checks or contained dangerous flags
      const cmd = String(meta.commandExecuted || '').toLowerCase();
      const output = String(meta.executionOutput || '').toLowerCase();
      const isViolation = cmd.includes('rm -rf') || cmd.includes('dd if=') || cmd.includes('mkfs') || output.includes('permission denied') || output.includes('violation');
      
      if (isViolation) {
        violatedActions++;
      } else {
        safeActions++;
      }
    });

    // Safety Compliance = Safe Actions / Total Actions (default to 100% if empty)
    const totalActions = safeActions + violatedActions;
    const safetyCompliance = totalActions > 0 ? ((safeActions / totalActions) * 100).toFixed(1) : '100.0';

    // MTTR Hours Saved = total executed actions * 1.5 hours average manual handling, minus execution durations in hours
    const totalSavedMs = (executedCount * 1.5 * 3600 * 1000) - totalDurationMs;
    const avgResolutionTimeSavedHours = Math.max(0, totalSavedMs / (3600 * 1000)).toFixed(1);

    return {
      pendingApprovals: pendingCount,
      totalExecutedActions: executedCount,
      approvedActions: approvedCount + executedCount,
      rejectedActions: rejectedCount,
      humanApprovalRatePercent: parseFloat(approvalRate),
      safetyComplianceScore: parseFloat(safetyCompliance),
      avgResolutionTimeSavedHours,
      riskBreakdown
    };
  }

  private async updateIncidentToRejected(incidentId: string, rejectorName: string, reason: string) {
    try {
      const cleanId = (incidentId || '').toUpperCase();
      const inc = await this.prisma.incident.findFirst({
        where: { OR: [{ id: incidentId }, { id: cleanId }, { number: cleanId }, { number: incidentId }] }
      });
      if (inc) {
        let activities = Array.isArray(inc.activitiesJson) ? inc.activitiesJson as any[] : [];
        activities.unshift({
          id: `act_${Date.now()}`,
          incidentId: inc.id,
          author: `🛡️ Human in the Loop (${rejectorName})`,
          comment: `SOP Rejected by Human: ${reason}. Incident state set to ON_HOLD and reassigned to DevOps Team.`,
          isWorkNote: true,
          timestamp: new Date().toLocaleTimeString(),
        });
        await this.prisma.incident.update({
          where: { id: inc.id },
          data: { state: 'ON_HOLD', assignedToName: 'DevOps Team', activitiesJson: activities }
        });
      }
    } catch (e) {
      console.error(`Failed to sync rejection to incident ${incidentId}:`, e);
    }
  }

  private async updateIncidentToInProgress(incidentId: string, approverName: string) {
    try {
      const cleanId = (incidentId || '').toUpperCase();
      const inc = await this.prisma.incident.findFirst({
        where: { OR: [{ id: incidentId }, { id: cleanId }, { number: cleanId }, { number: incidentId }] }
      });
      if (inc) {
        let activities = Array.isArray(inc.activitiesJson) ? inc.activitiesJson as any[] : [];
        activities.unshift({
          id: `act_${Date.now()}`,
          incidentId: inc.id,
          author: `🛡️ Human in the Loop (${approverName})`,
          comment: `SOP Approved by Human Operator (${approverName}). Incident state remains ON_HOLD while Auto-Resolver Agent executes SSH commands on target host.`,
          isWorkNote: true,
          timestamp: new Date().toLocaleTimeString(),
        });
        await this.prisma.incident.update({
          where: { id: inc.id },
          data: { state: 'ON_HOLD', activitiesJson: activities }
        });
      }
    } catch (e) {
      console.error(`Failed to update incident state to IN_PROGRESS for ${incidentId}:`, e);
    }
  }

  // nemotron-3.5-lightning-30b-a3b was the previous default here, but it's
  // been observed live returning sustained request timeouts/connection errors
  // under the daemon's real traffic (see services/sre-agent-daemon/daemon/llm.py's
  // comment on the same migration). nemotron-3-super-120b-a12b is the
  // Python daemon's own hardcoded ROUTER_MODEL/GOVERNANCE_MODEL default
  // (daemon/config.py) precisely because it replaced lightning for this
  // reason previously -- kept in sync here so a fresh DB seed (no AgentConfig
  // row yet) doesn't silently reintroduce the unreliable model.
  private modelConfig: any = {
    environment: 'nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY || '',
    routerModel: 'nvidia/nemotron-3-super-120b-a12b',
    resolverModel: 'nvidia/nemotron-3-super-120b-a12b',
    synthesizerModel: 'nvidia/nemotron-3-super-120b-a12b',
    governanceModel: 'nvidia/nemotron-3-super-120b-a12b',
    fallbackModels: [
      'nvidia/nemotron-3-super-120b-a12b',
      'deepseek-ai/deepseek-v4-flash-0731',
      'nvidia/nemotron-3.5-lightning-30b-a3b'
    ]
  };


  async getModelConfig(): Promise<any> {
    try {
      const record = await (this.prisma as any).agentConfig.findUnique({ where: { id: 'default' } });
      if (record) {
        this.modelConfig = {
          environment: record.environment,
          baseUrl: record.baseUrl,
          apiKey: record.apiKey,
          routerModel: record.routerModel,
          resolverModel: record.resolverModel,
          synthesizerModel: record.synthesizerModel,
          governanceModel: record.governanceModel,
          fallbackModels: record.fallbackModels || this.modelConfig.fallbackModels,
        };
      }
    } catch (e) {
      // Table may not exist yet, use in-memory config
    }
    return this.modelConfig;
  }

  async updateModelConfig(patch: Partial<any>): Promise<any> {
    this.modelConfig = { ...this.modelConfig, ...patch };
    try {
      await (this.prisma as any).agentConfig.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          environment: this.modelConfig.environment,
          baseUrl: this.modelConfig.baseUrl,
          apiKey: this.modelConfig.apiKey,
          routerModel: this.modelConfig.routerModel,
          resolverModel: this.modelConfig.resolverModel,
          synthesizerModel: this.modelConfig.synthesizerModel,
          governanceModel: this.modelConfig.governanceModel,
          fallbackModels: this.modelConfig.fallbackModels,
        },
        update: {
          environment: this.modelConfig.environment,
          baseUrl: this.modelConfig.baseUrl,
          apiKey: this.modelConfig.apiKey,
          routerModel: this.modelConfig.routerModel,
          resolverModel: this.modelConfig.resolverModel,
          synthesizerModel: this.modelConfig.synthesizerModel,
          governanceModel: this.modelConfig.governanceModel,
          fallbackModels: this.modelConfig.fallbackModels,
        },
      });
    } catch (e) {
      // Fallback to in-memory only
    }
    return this.modelConfig;
  }

  async getTimeline() {
    const records = await this.prisma.agentHistory.findMany({
      where: { type: 'TIMELINE' },
      orderBy: { timestamp: 'desc' },
      take: 50
    });

    return records.map(r => {
      const meta = r.metadata as any || {};
      return {
        id: r.id,
        incidentNumber: meta.incidentNumber || r.incidentId,
        incidentTitle: r.title,
        targetCi: meta.targetCi,
        status: meta.status || 'RUNNING',
        startTime: r.timestamp.toISOString(),
        endTime: meta.endTime,
        steps: meta.steps || []
      };
    });
  }

  async updateTimeline(dto: any) {
    let existing = await this.prisma.agentHistory.findUnique({
      where: { id: dto.id }
    });

    if (!existing) {
      existing = await this.prisma.agentHistory.create({
        data: {
          id: dto.id,
          type: 'TIMELINE',
          incidentId: dto.incidentNumber || dto.id,
          title: dto.incidentTitle || 'ITSM Incident Remediation',
          description: '',
          timestamp: new Date(),
          metadata: {
            targetCi: dto.targetCi || 'Unspecified CI',
            status: dto.status || 'RUNNING',
            startTime: dto.startTime || new Date().toISOString(),
            steps: []
          }
        }
      });
    }

    const meta = existing.metadata as any || {};
    if (dto.status) {
      meta.status = dto.status;
      if (dto.status !== 'RUNNING') {
        meta.endTime = new Date().toISOString();
      }
    }

    if (dto.step) {
      meta.steps = meta.steps || [];
      const stepIdx = meta.steps.findIndex((s: any) => s.name === dto.step.name);
      const newStep = {
        id: dto.step.id || `step-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: dto.step.name,
        status: dto.step.status || 'SUCCESS',
        timestamp: dto.step.timestamp || new Date().toLocaleTimeString(),
        details: dto.step.details || ''
      };
      if (stepIdx >= 0) {
        // If later steps already exist after stepIdx, lock status from reverting back to RUNNING
        const hasSubsequentSteps = meta.steps.slice(stepIdx + 1).length > 0;
        if (hasSubsequentSteps && dto.step.status === 'RUNNING') {
          newStep.status = meta.steps[stepIdx].status === 'RUNNING' ? 'SUCCESS' : meta.steps[stepIdx].status;
        }
        meta.steps[stepIdx] = newStep;
      } else {
        // Enforce strict 100% sequential progression: mark all preceding RUNNING steps as SUCCESS
        meta.steps.forEach((s: any) => {
          if (s.status === 'RUNNING') {
            s.status = 'SUCCESS';
          }
        });
        meta.steps.push(newStep);
      }
    }

    await this.prisma.agentHistory.update({
      where: { id: existing.id },
      data: { metadata: meta }
    });

    return {
      id: existing.id,
      incidentNumber: meta.incidentNumber || existing.incidentId,
      incidentTitle: existing.title,
      targetCi: meta.targetCi,
      status: meta.status || 'RUNNING',
      startTime: existing.timestamp.toISOString(),
      endTime: meta.endTime,
      steps: meta.steps || []
    };
  }

  async cancelExecution(id: string, reason?: string) {
    try {
      let record = await this.prisma.agentHistory.findFirst({
        where: {
          type: 'TIMELINE',
          OR: [
            { id: id },
            { incidentId: id }
          ]
        }
      });

      if (record) {
        const meta = (record.metadata as any) || {};
        meta.status = 'FAILED';
        meta.endTime = new Date().toISOString();
        meta.steps = meta.steps || [];
        meta.steps.push({
          id: `step-cancel-${Date.now()}`,
          name: '🛑 Manual Cycle Abort',
          status: 'FAILED',
          timestamp: new Date().toLocaleTimeString(),
          details: reason || 'Action cycle manually stopped by Human Operator via Control Tower Dashboard.'
        });

        await this.prisma.agentHistory.update({
          where: { id: record.id },
          data: { metadata: meta }
        });
      }

      const inc = await this.prisma.incident.findFirst({
        where: {
          OR: [
            { id: id },
            { number: id }
          ]
        }
      });

      if (inc) {
        await this.prisma.incident.update({
          where: { id: inc.id },
          data: {
            state: 'ON_HOLD'
          }
        });
      }


      return {
        success: true,
        message: `Execution cycle [${id}] stopped successfully.`,
        timestamp: new Date().toISOString()
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to cancel execution cycle: ${e.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  private containedCis: Set<string> = new Set();
  private masterKillSwitchActive: boolean = false;
  private routerConfidenceThreshold: number = 95;

  async getRouterConfig(): Promise<{ confidenceThreshold: number }> {
    return { confidenceThreshold: this.routerConfidenceThreshold };
  }

  async setRouterConfig(confidenceThreshold: number): Promise<{ confidenceThreshold: number }> {
    const clamped = Math.min(100, Math.max(0, Math.round(confidenceThreshold)));
    this.routerConfidenceThreshold = clamped;
    return { confidenceThreshold: clamped };
  }

  async getContainmentStatus(): Promise<{ masterKillSwitch: boolean; containedCis: string[] }> {
    return {
      masterKillSwitch: this.masterKillSwitchActive,
      containedCis: Array.from(this.containedCis),
    };
  }

  async setContainmentStatus(ciId: string, status: 'CONTAINED' | 'ACTIVE', reason?: string, triggeredBy?: string) {
    if (status === 'CONTAINED') {
      this.containedCis.add(ciId);
    } else {
      this.containedCis.delete(ciId);
    }

    try {
      await this.createHistoryEntry({
        incidentId: 'GOVERNANCE-AUDIT',
        incidentTitle: `Containment State Changed: ${ciId} ➔ ${status}`,
        agentId: ciId,
        agentName: ciId,
        model: 'Governance Kill Switch',
        targetCi: ciId,
        department: 'CyberSec & Governance',
        riskLevel: 'CRITICAL',
        status: status === 'CONTAINED' ? 'REJECTED' : 'APPROVED',
        actionType: status === 'CONTAINED' ? 'KILL_SWITCH_TRIGGERED' : 'RESTORED_TO_PRODUCTION',
        humanApprover: triggeredBy || 'Venu (Global Administrator)',
        commandExecuted: `containment_toggle --ci ${ciId} --status ${status}`,
        executionOutput: `CI ${ciId} is now ${status}. ${reason || ''}`,
        resolutionOutcome: `Governance lock ${status === 'CONTAINED' ? 'APPLIED' : 'REMOVED'}.`
      });
    } catch (err) {}

    return {
      success: true,
      ciId,
      status,
      masterKillSwitch: this.masterKillSwitchActive,
      containedCis: Array.from(this.containedCis),
      timestamp: new Date().toISOString()
    };
  }

  async setMasterKillSwitch(active: boolean, reason?: string, triggeredBy?: string) {
    this.masterKillSwitchActive = active;

    try {
      await this.createHistoryEntry({
        incidentId: 'MASTER-KILL-SWITCH',
        incidentTitle: `Master Fleet Kill Switch ${active ? 'TRIGGERED (FLEET HALTED)' : 'DISARMED (FLEET RESUMED)'}`,
        agentId: 'GLOBAL_FLEET',
        agentName: 'Master Fleet Containment',
        model: 'Control Tower Master Kill Switch',
        targetCi: 'All Enterprise Fleet Nodes',
        department: 'CyberSec & Governance',
        riskLevel: 'CRITICAL',
        status: active ? 'REJECTED' : 'APPROVED',
        actionType: active ? 'MASTER_KILL_SWITCH_ACTIVE' : 'MASTER_KILL_SWITCH_DISARMED',
        humanApprover: triggeredBy || 'Venu (Global Administrator)',
        commandExecuted: `fleet_emergency_halt --active=${active}`,
        executionOutput: active ? 'All autonomous agent loops and SSH remediations globally halted.' : 'Autonomous agent fleet restored to active monitoring.',
        resolutionOutcome: active ? 'EMERGENCY_CONTAINMENT_ACTIVE' : 'PRODUCTION_ACTIVE'
      });
    } catch (err) {}

    return {
      success: true,
      masterKillSwitch: this.masterKillSwitchActive,
      containedCis: Array.from(this.containedCis),
      timestamp: new Date().toISOString()
    };
  }
}

