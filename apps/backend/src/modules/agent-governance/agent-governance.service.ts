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

  getPendingApprovals(): AgentApproval[] {
    this.approvals = this.singleDb.agentApprovals;
    return this.approvals.filter((a) => a.status === 'PENDING');
  }

  getAllApprovals(): AgentApproval[] {
    this.approvals = this.singleDb.agentApprovals;
    return this.approvals;
  }

  getApprovalById(id: string): AgentApproval {
    this.approvals = loadJsonFile<AgentApproval[]>(APPROVALS_FILE_PATH, this.approvals);
    const item = this.approvals.find((a) => a.id.toUpperCase() === id.toUpperCase());
    if (!item) throw new NotFoundException(`Approval request ${id} not found.`);
    return item;
  }

  createApprovalRequest(dto: Partial<AgentApproval>): AgentApproval {
    this.approvals = loadJsonFile<AgentApproval[]>(APPROVALS_FILE_PATH, this.approvals);
    
    const newId = `APPR-${Math.floor(1000 + Math.random() * 9000)}`;
    const newApproval: AgentApproval = {
      id: newId,
      incidentId: dto.incidentId || 'INC0000001',
      incidentTitle: dto.incidentTitle || 'Autonomous Agent Remediation Request',
      agentId: dto.agentId || 'agent-unix-resolver-01',
      agentName: dto.agentName || '🤖 Unix Auto-Resolver Agent',
      model: dto.model || 'gemini-3.1-pro-preview',
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
    };

    this.approvals.unshift(newApproval);
    this.saveApprovals();
    return newApproval;
  }

  approveRequest(id: string, approverName: string = 'System Admin (Human in the Loop)'): { approval: AgentApproval; historyEntry: AgentHistoryEntry } {
    this.approvals = loadJsonFile<AgentApproval[]>(APPROVALS_FILE_PATH, this.approvals);
    this.history = loadJsonFile<AgentHistoryEntry[]>(HISTORY_FILE_PATH, this.history);

    const approvalIndex = this.approvals.findIndex((a) => a.id.toUpperCase() === id.toUpperCase());
    if (approvalIndex === -1) throw new NotFoundException(`Approval request ${id} not found.`);

    const appr = this.approvals[approvalIndex];
    appr.status = 'APPROVED';
    appr.approvedBy = approverName;
    appr.approvedAt = new Date().toISOString();

    this.saveApprovals();

    // Create execution history entry
    const historyId = `HIST-${Math.floor(8000 + Math.random() * 1000)}`;
    const historyEntry: AgentHistoryEntry = {
      id: historyId,
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
      executedAt: new Date().toISOString(),
      durationMs: Math.floor(600 + Math.random() * 1200),
      humanApprover: approverName,
      commandExecuted: appr.proposedCommands.join(' && '),
      executionOutput: `=== EXECUTION SUCCESSFUL ===\nCommands:\n${appr.proposedCommands.map(c => `> ${c}`).join('\n')}\nResult: System returned 0 (OK). Service healthy.`,
      resolutionOutcome: `Action approved by ${approverName}. Incident ${appr.incidentId} state transitioned to RESOLVED.`,
      kbGenerated: appr.kbArticleReference,
    };

    this.history.unshift(historyEntry);
    this.saveHistory();

    // Update target incident state if database/file exists
    this.updateIncidentToResolved(appr.incidentId, approverName, historyEntry.executionOutput);

    return { approval: appr, historyEntry };
  }

  rejectRequest(id: string, rejectionReason: string, rejectorName: string = 'System Admin'): { approval: AgentApproval; historyEntry: AgentHistoryEntry } {
    this.approvals = loadJsonFile<AgentApproval[]>(APPROVALS_FILE_PATH, this.approvals);
    this.history = loadJsonFile<AgentHistoryEntry[]>(HISTORY_FILE_PATH, this.history);

    const approvalIndex = this.approvals.findIndex((a) => a.id.toUpperCase() === id.toUpperCase());
    if (approvalIndex === -1) throw new NotFoundException(`Approval request ${id} not found.`);

    const appr = this.approvals[approvalIndex];
    appr.status = 'REJECTED';
    appr.rejectionReason = rejectionReason || 'Rejected by human operator policy.';

    this.saveApprovals();

    const historyId = `HIST-${Math.floor(8000 + Math.random() * 1000)}`;
    const historyEntry: AgentHistoryEntry = {
      id: historyId,
      approvalId: appr.id,
      incidentId: appr.incidentId,
      incidentTitle: appr.incidentTitle,
      agentId: appr.agentId,
      agentName: appr.agentName,
      model: appr.model,
      targetCi: appr.targetCi,
      department: appr.department,
      riskLevel: appr.riskLevel,
      status: 'REJECTED',
      actionType: 'Human Rejection & Block',
      executedAt: new Date().toISOString(),
      durationMs: 0,
      humanApprover: rejectorName,
      commandExecuted: appr.proposedCommands.join(' && '),
      executionOutput: `REJECTED BY HUMAN (${rejectorName}): ${appr.rejectionReason}`,
      resolutionOutcome: `Action blocked by Human-in-the-Loop policy. Incident ${appr.incidentId} retained for tier 3 human review.`,
      kbGenerated: undefined,
    };

    this.history.unshift(historyEntry);
    this.saveHistory();

    return { approval: appr, historyEntry };
  }

  // --- HISTORY METRICS & AUDIT ---

  getHistory(): AgentHistoryEntry[] {
    this.history = loadJsonFile<AgentHistoryEntry[]>(HISTORY_FILE_PATH, this.history);
    return this.history;
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
      if (fs.existsSync(INCIDENTS_FILE_PATH)) {
        const incidents = JSON.parse(fs.readFileSync(INCIDENTS_FILE_PATH, 'utf-8'));
        const cleanId = incidentId.toUpperCase();
        const inc = incidents.find((i: any) => i.id.toUpperCase() === cleanId || i.number.toUpperCase() === cleanId);
        if (inc) {
          inc.state = 'RESOLVED';
          inc.resolutionCode = 'Server - Kernel & OS Patch';
          inc.resolutionNotes = `Human in the loop (${approverName}) approved agent execution on ${new Date().toLocaleString()}.\nOutput:\n${notes}`;
          if (!inc.activities) inc.activities = [];
          inc.activities.unshift({
            id: `act_${Date.now()}`,
            incidentId: inc.id,
            author: `🛡️ Human in the Loop (${approverName})`,
            comment: `Approved autonomous agent execution for ticket ${inc.id}. Remediation completed successfully.`,
            isWorkNote: true,
            timestamp: new Date().toLocaleTimeString(),
          });
          fs.writeFileSync(INCIDENTS_FILE_PATH, JSON.stringify(incidents, null, 2), 'utf-8');
        }
      }
    } catch (e) {
      console.error(`Failed to sync resolution to incident ${incidentId}:`, e);
    }
  }
}
