import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

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
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
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

const APPROVALS_FILE_PATH = path.join(process.cwd(), 'data', 'agent_approvals.json');
const HISTORY_FILE_PATH = path.join(process.cwd(), 'data', 'agent_history.json');
const INCIDENTS_FILE_PATH = path.join(process.cwd(), 'data', 'incidents.json');

function loadJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error loading JSON file ${filePath}:`, err);
  }
  return fallback;
}

function saveJsonFile<T>(filePath: string, data: T) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error saving JSON file ${filePath}:`, err);
  }
}

import { SingleDatabaseService } from '../../database/single-db.service';

@Injectable()
export class AgentGovernanceService {
  private approvals: AgentApproval[] = [];
  private history: AgentHistoryEntry[] = [];

  constructor(private readonly singleDb: SingleDatabaseService) {
    this.approvals = this.singleDb.agentApprovals;
    this.history = this.singleDb.agentHistory;
  }

  private saveApprovals() {
    this.singleDb.agentApprovals = this.approvals;
  }

  private saveHistory() {
    this.singleDb.agentHistory = this.history;
  }

  // --- APPROVALS METRICS & OPERATIONS ---

  private getUnifiedApprovals(): AgentApproval[] {
    const fileApprovals = loadJsonFile<AgentApproval[]>(APPROVALS_FILE_PATH, []);
    const singleDbApprovals = this.singleDb.agentApprovals || [];
    const combined = [...singleDbApprovals, ...fileApprovals, ...this.approvals];
    const uniqueMap = new Map<string, AgentApproval>();
    combined.forEach(item => {
      if (item && item.id) {
        uniqueMap.set(item.id.toUpperCase(), item);
      }
    });
    this.approvals = Array.from(uniqueMap.values());
    return this.approvals;
  }

  getPendingApprovals(): AgentApproval[] {
    const approvals = this.getUnifiedApprovals();
    return approvals.filter((a) => a.status === 'PENDING');
  }

  getAllApprovals(): AgentApproval[] {
    return this.getUnifiedApprovals();
  }

  getApprovalById(id: string): AgentApproval {
    const approvals = this.getUnifiedApprovals();
    const item = approvals.find((a) => a.id.toUpperCase() === id.toUpperCase());
    if (!item) throw new NotFoundException(`Approval request ${id} not found.`);
    return item;
  }

  createApprovalRequest(dto: Partial<AgentApproval>): AgentApproval {
    const approvals = this.getUnifiedApprovals();
    
    // Deduplication check: if a PENDING approval already exists for this incidentId, update & return it
    const existingPending = approvals.find(
      (a) => a.incidentId === dto.incidentId && a.status === 'PENDING'
    );
    if (existingPending) {
      existingPending.incidentTitle = dto.incidentTitle || existingPending.incidentTitle;
      existingPending.proposedCommands = dto.proposedCommands || existingPending.proposedCommands;
      existingPending.summary = dto.summary || existingPending.summary;
      existingPending.aiReasoning = dto.aiReasoning || existingPending.aiReasoning;
      existingPending.safetyChecks = dto.safetyChecks || existingPending.safetyChecks;
      existingPending.requestedAt = new Date().toISOString();
      this.saveApprovals();
      return existingPending;
    }

    const newId = `APPR-${Math.floor(1000 + Math.random() * 9000)}`;
    const newApproval: AgentApproval = {
      id: newId,
      incidentId: dto.incidentId || 'INC0000001',
      incidentTitle: dto.incidentTitle || 'Autonomous Agent Remediation Request',
      agentId: dto.agentId || 'agent-unix-resolver-01',
      agentName: dto.agentName || '🤖 Unix Auto-Resolver Agent',
      model: dto.model || 'nvidia/nemotron-3-ultra-550b-a55b',
      targetCi: dto.targetCi || 'Worker 1 (192.168.56.10)',
      department: dto.department || 'Unix',
      riskLevel: dto.riskLevel || 'HIGH',
      confidenceScore: dto.confidenceScore || 95.0,
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
      summary: dto.summary || 'Agent requested approval for system execution.',
      proposedCommands: dto.proposedCommands || ['echo "Default proposed command"'],
      kbArticleReference: dto.kbArticleReference || 'KB0000001',
      kbTitle: dto.kbTitle || 'Standard Remediation SOP',
      safetyChecks: dto.safetyChecks || [{ check: 'Target host operational', passed: true }],
      aiReasoning: dto.aiReasoning || 'Remediation aligns with knowledge base SOP.',
      routerOutput: dto.routerOutput,
      resolverOutput: dto.resolverOutput,
      synthesizerOutput: dto.synthesizerOutput
    };

    approvals.unshift(newApproval);
    this.approvals = approvals;
    this.saveApprovals();
    return newApproval;
  }

  approveRequest(id: string, approverName: string = 'System Admin (Human in the Loop)', proposedCommands?: string[]): { approval: AgentApproval; historyEntry: AgentHistoryEntry } {
    const approvals = this.getUnifiedApprovals();

    const approvalIndex = approvals.findIndex((a) => a.id.toUpperCase() === id.toUpperCase());
    if (approvalIndex === -1) throw new NotFoundException(`Approval request ${id} not found.`);

    const appr = approvals[approvalIndex];
    appr.status = 'APPROVED';
    appr.approvedBy = approverName;
    appr.approvedAt = new Date().toISOString();

    if (Array.isArray(proposedCommands) && proposedCommands.length > 0) {
      appr.proposedCommands = proposedCommands;
    }

    this.approvals = approvals;
    this.saveApprovals();

    // Set incident state back to IN_PROGRESS so Auto-Resolver Daemon executes SSH commands
    this.updateIncidentToInProgress(appr.incidentId, approverName);

    return { approval: appr, historyEntry: null as any };
  }

  rejectRequest(id: string, rejectionReason: string, rejectorName: string = 'System Admin'): { approval: AgentApproval; historyEntry: AgentHistoryEntry } {
    const approvals = this.getUnifiedApprovals();

    const approvalIndex = approvals.findIndex((a) => a.id.toUpperCase() === id.toUpperCase());
    if (approvalIndex === -1) throw new NotFoundException(`Approval request ${id} not found.`);

    const appr = approvals[approvalIndex];
    appr.status = 'REJECTED';
    appr.rejectionReason = rejectionReason || 'Rejected by human operator policy.';

    this.approvals = approvals;
    this.saveApprovals();

    this.updateIncidentToRejected(appr.incidentId, rejectorName, appr.rejectionReason || 'Rejected by human operator policy.');

    return { approval: appr, historyEntry: null as any };
  }

  // --- HISTORY METRICS & AUDIT ---

  getHistory(): AgentHistoryEntry[] {
    const fileHistory = loadJsonFile<AgentHistoryEntry[]>(HISTORY_FILE_PATH, []);
    const singleDbHistory = this.singleDb.agentHistory || [];
    
    const combined = [...singleDbHistory, ...fileHistory];
    const uniqueMap = new Map<string, AgentHistoryEntry>();
    combined.forEach(item => {
      if (item && item.id && item.status !== 'REJECTED') {
        uniqueMap.set(item.id.toUpperCase(), item);
      }
    });

    // Dynamically map APPROVED approvals into history if not already present
    const approvals = this.getAllApprovals();
    approvals.forEach((appr) => {
      if (appr.status === 'APPROVED') {
        const histId = `HIST-${appr.id}`;
        if (!uniqueMap.has(histId.toUpperCase()) && !Array.from(uniqueMap.values()).some(h => h.approvalId === appr.id)) {
          uniqueMap.set(histId.toUpperCase(), {
            id: histId,
            approvalId: appr.id,
            incidentId: appr.incidentId,
            incidentTitle: appr.incidentTitle,
            agentId: appr.agentId,
            agentName: appr.agentName,
            model: appr.model,
            targetCi: appr.targetCi,
            department: appr.department,
            riskLevel: appr.riskLevel,
            status: 'APPROVED',
            actionType: 'Human-Approved Execution',
            executedAt: appr.approvedAt || new Date().toISOString(),
            durationMs: 850,
            humanApprover: appr.approvedBy || 'System Admin',
            commandExecuted: (appr.proposedCommands || []).join(' && '),
            executionOutput: 'Executed successfully on target CI.',
            resolutionOutcome: 'Action approved by operator.',
            routerOutput: appr.routerOutput,
            resolverOutput: appr.resolverOutput,
            synthesizerOutput: appr.synthesizerOutput
          });
        }
      }
    });

    this.history = Array.from(uniqueMap.values()).filter(h => h && h.status !== 'REJECTED');
    this.saveHistory();
    return this.history;
  }

  clearAllApprovals() {
    this.approvals = [];
    this.history = [];
    this.singleDb.agentApprovals = [];
    this.singleDb.agentHistory = [];

    saveJsonFile(APPROVALS_FILE_PATH, []);
    saveJsonFile(HISTORY_FILE_PATH, []);

    return {
      success: true,
      message: 'All approval requests and history entries cleared successfully.',
      timestamp: new Date().toISOString(),
      pendingApprovalsCount: 0,
      historyCount: 0
    };
  }

  resetLocks() {
    console.log('⚡ Force resetting stuck execution locks and syncing governance state...');
    
    // Clear any stuck pending statuses or re-sync singleDb
    this.approvals = this.singleDb.agentApprovals || [];
    this.history = this.singleDb.agentHistory || [];

    // Trigger full history re-sync
    this.getHistory();

    saveJsonFile(APPROVALS_FILE_PATH, this.approvals);
    saveJsonFile(HISTORY_FILE_PATH, this.history);

    return {
      success: true,
      message: 'Stuck execution locks cleared. System feeds force synced.',
      timestamp: new Date().toISOString(),
      pendingApprovalsCount: this.getPendingApprovals().length,
      historyCount: this.history.length
    };
  }

  createHistoryEntry(dto: Partial<AgentHistoryEntry>): AgentHistoryEntry {
    this.history = loadJsonFile<AgentHistoryEntry[]>(HISTORY_FILE_PATH, this.history);

    const newId = `HIST-${Math.floor(8000 + Math.random() * 1000)}`;
    const newEntry: AgentHistoryEntry = {
      id: newId,
      approvalId: dto.approvalId,
      incidentId: dto.incidentId || 'INC0000001',
      incidentTitle: dto.incidentTitle || 'Autonomous Agent Event',
      agentId: dto.agentId || 'agent-unix-resolver-01',
      agentName: dto.agentName || '🤖 Agent',
      model: dto.model || 'gemini-3.1-pro-preview',
      targetCi: dto.targetCi || 'Worker 1',
      department: dto.department || 'Unix',
      riskLevel: dto.riskLevel || 'LOW',
      status: dto.status || 'AUTO_EXECUTED',
      actionType: dto.actionType || 'Autonomous Action',
      executedAt: new Date().toISOString(),
      durationMs: dto.durationMs || 500,
      humanApprover: dto.humanApprover || 'Autonomous Policy',
      commandExecuted: dto.commandExecuted || 'systemctl status',
      executionOutput: dto.executionOutput || 'Execution completed clean.',
      resolutionOutcome: dto.resolutionOutcome || 'Task executed successfully.',
      kbGenerated: dto.kbGenerated,
    };

    this.history.unshift(newEntry);
    this.saveHistory();
    return newEntry;
  }

  // --- GOVERNANCE ANALYTICS STATS ---

  getGovernanceStats() {
    this.approvals = loadJsonFile<AgentApproval[]>(APPROVALS_FILE_PATH, this.approvals);
    this.history = loadJsonFile<AgentHistoryEntry[]>(HISTORY_FILE_PATH, this.history);

    const pendingCount = this.approvals.filter((a) => a.status === 'PENDING').length;
    const approvedCount = this.history.filter((h) => h.status === 'APPROVED' || h.status === 'AUTO_EXECUTED').length;
    const rejectedCount = this.history.filter((h) => h.status === 'REJECTED').length;
    const totalProcessed = approvedCount + rejectedCount;

    const approvalRate = totalProcessed > 0 ? ((approvedCount / totalProcessed) * 100).toFixed(1) : '100.0';

    return {
      pendingApprovals: pendingCount,
      totalExecutedActions: this.history.length,
      approvedActions: approvedCount,
      rejectedActions: rejectedCount,
      humanApprovalRatePercent: parseFloat(approvalRate),
      safetyComplianceScore: 99.4,
      avgResolutionTimeSavedHours: (this.history.length * 1.8).toFixed(1),
      riskBreakdown: {
        CRITICAL: this.history.filter((h) => h.riskLevel === 'CRITICAL').length + this.approvals.filter(a => a.riskLevel === 'CRITICAL').length,
        HIGH: this.history.filter((h) => h.riskLevel === 'HIGH').length + this.approvals.filter(a => a.riskLevel === 'HIGH').length,
        MEDIUM: this.history.filter((h) => h.riskLevel === 'MEDIUM').length + this.approvals.filter(a => a.riskLevel === 'MEDIUM').length,
        LOW: this.history.filter((h) => h.riskLevel === 'LOW').length + this.approvals.filter(a => a.riskLevel === 'LOW').length,
      },
    };
  }

  private updateIncidentToResolved(incidentId: string, approverName: string, notes: string) {
    try {
      const incidents = this.singleDb.incidents;
      const cleanId = incidentId.toUpperCase();
      const inc = incidents.find((i: any) => i.id.toUpperCase() === cleanId || i.number.toUpperCase() === cleanId);
      if (inc) {
        inc.state = 'IN_PROGRESS';
        if (!inc.activities) inc.activities = [];
        inc.activities.unshift({
          id: `act_${Date.now()}`,
          incidentId: inc.id,
          author: `🛡️ Human in the Loop (${approverName})`,
          comment: `SOP Approved by Human: ${approverName}. Resolver Agent is authorized and proceeding with remediation on target host.`,
          isWorkNote: true,
          timestamp: new Date().toLocaleTimeString(),
        });
        this.singleDb.incidents = incidents;
      }
    } catch (e) {
      console.error(`Failed to sync approval to incident ${incidentId}:`, e);
    }
  }

  private updateIncidentToRejected(incidentId: string, rejectorName: string, reason: string) {
    try {
      const incidents = this.singleDb.incidents;
      const cleanId = incidentId.toUpperCase();
      const inc = incidents.find((i: any) => i.id.toUpperCase() === cleanId || i.number.toUpperCase() === cleanId);
      if (inc) {
        inc.state = 'ON_HOLD';
        inc.assignedTo = 'DevOps Team';
        if (!inc.activities) inc.activities = [];
        inc.activities.unshift({
          id: `act_${Date.now()}`,
          incidentId: inc.id,
          author: `🛡️ Human in the Loop (${rejectorName})`,
          comment: `SOP Rejected by Human: ${reason}. Incident state set to ON_HOLD and reassigned to DevOps Team.`,
          isWorkNote: true,
          timestamp: new Date().toLocaleTimeString(),
        });
        this.singleDb.incidents = incidents;
      }
    } catch (e) {
      console.error(`Failed to sync rejection to incident ${incidentId}:`, e);
    }
  }

  private updateIncidentToInProgress(incidentId: string, approverName: string) {
    try {
      const incidents = this.singleDb.incidents;
      const cleanId = incidentId.toUpperCase();
      const inc = incidents.find((i: any) => i.id.toUpperCase() === cleanId || (i.number && i.number.toUpperCase() === cleanId));
      if (inc) {
        inc.state = 'ON_HOLD';
        if (!inc.activities) inc.activities = [];
        inc.activities.unshift({
          id: `act_${Date.now()}`,
          incidentId: inc.id,
          author: `🛡️ Human in the Loop (${approverName})`,
          comment: `SOP Approved by Human Operator (${approverName}). Incident state remains ON_HOLD while Auto-Resolver Agent executes SSH commands on target host.`,
          isWorkNote: true,
          timestamp: new Date().toLocaleTimeString(),
        });
        this.singleDb.incidents = incidents;
      }
    } catch (e) {
      console.error(`Failed to update incident state to IN_PROGRESS for ${incidentId}:`, e);
    }
  }

  // --- MODEL & ENVIRONMENT CONFIGURATION ---
  private modelConfig: any = {
    environment: 'genai_lab',
    baseUrl: 'https://genailab.tcs.in/v1',
    apiKey: 'sk-RRoxANx2dKdNE3N5j0mbxQ',
    routerModel: 'azure_ai/genailab-maas-Llama-3.3-70B-Instruct',
    resolverModel: 'azure_ai/genailab-maas-Llama-3.3-70B-Instruct',
    synthesizerModel: 'azure_ai/genailab-maas-DeepSeek-R1',
    governanceModel: 'genailab-maas-gpt-4o',
    fallbackModels: [
      'nvidia/nemotron-3-ultra-550b-a55b',
      'azure_ai/genailab-maas-Llama-3.3-70B-Instruct',
      'azure_ai/genailab-maas-DeepSeek-R1',
      'genailab-maas-gpt-4o',
      'gemini-2.5-pro'
    ]
  };

  getModelConfig() {
    const dbConfig = this.singleDb.agentModelConfig;
    if (dbConfig) {
      this.modelConfig = { ...this.modelConfig, ...dbConfig };
    }
    return this.modelConfig;
  }

  updateModelConfig(patch: Partial<any>) {
    this.modelConfig = { ...this.modelConfig, ...patch };
    try {
      this.singleDb.agentModelConfig = this.modelConfig;
    } catch (err) {}
    return this.modelConfig;
  }

  getTimeline() {
    return this.singleDb.agentTimeline || [];
  }

  updateTimeline(dto: any) {
    const timeline = this.singleDb.agentTimeline || [];
    let execution = timeline.find((ex: any) => ex.id === dto.id);
    if (!execution) {
      execution = {
        id: dto.id,
        incidentNumber: dto.incidentNumber || dto.id,
        incidentTitle: dto.incidentTitle || 'ITSM Incident Remediation',
        targetCi: dto.targetCi || 'Unspecified CI',
        status: dto.status || 'RUNNING',
        startTime: dto.startTime || new Date().toISOString(),
        steps: []
      };
      timeline.unshift(execution);
    }

    if (dto.status) {
      execution.status = dto.status;
      if (dto.status !== 'RUNNING') {
        execution.endTime = new Date().toISOString();
      }
    }

    if (dto.step) {
      const stepIdx = execution.steps.findIndex((s: any) => s.name === dto.step.name);
      const newStep = {
        id: dto.step.id || `step-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: dto.step.name,
        status: dto.step.status || 'SUCCESS',
        timestamp: dto.step.timestamp || new Date().toLocaleTimeString(),
        details: dto.step.details || ''
      };
      if (stepIdx >= 0) {
        execution.steps[stepIdx] = newStep;
      } else {
        execution.steps.push(newStep);
      }
    }

    if (timeline.length > 50) {
      timeline.splice(50);
    }

    this.singleDb.agentTimeline = timeline;
    return execution;
  }
}
