import { Injectable, Logger } from '@nestjs/common';
import { IncidentService } from '../incidents/incident.service';
import { CreateIncidentDto } from '../incidents/dto/incident.dto';

export interface ServiceNowWebhookPayload {
  sys_id: string;
  number: string;
  short_description: string;
  description?: string;
  category?: string;
  priority?: string | number;
  state?: string | number;
  cmdb_ci?: string | { display_value?: string };
}

// Canonical mapping: services/sre-agent-daemon/daemon/itsm/servicenow_client.py's
// SN_STATE_MAP/REVERSE_SN_STATE_MAP is the source-of-truth copy (documented there
// as canonical) -- this is an independent second Table API client, in TypeScript,
// used by the MCP server's on-demand servicenow_* tools (a different
// caller/process than the Python daemon's autonomous polling loop). Keep the two
// mappings in sync if either changes.
const SN_STATE_MAP: Record<number, string> = {
  1: 'NEW',
  2: 'IN_PROGRESS',
  3: 'ON_HOLD',
  6: 'RESOLVED',
  7: 'CLOSED',
};

const REVERSE_SN_STATE_MAP: Record<string, number> = {
  NEW: 1,
  IN_PROGRESS: 2,
  ON_HOLD: 3,
  RESOLVED: 6,
  CLOSED: 7,
};

@Injectable()
export class ServiceNowService {
  private readonly logger = new Logger(ServiceNowService.name);

  constructor(private readonly incidentService: IncidentService) {}

  // ── ServiceNow Table API client (for the MCP server's on-demand tools) ────

  private get snInstanceUrl(): string {
    return (process.env.SN_INSTANCE_URL || '').replace(/\/$/, '');
  }
  private get snUsername(): string {
    return process.env.SN_USERNAME || '';
  }
  private get snPassword(): string {
    return process.env.SN_PASSWORD || '';
  }

  private isSnConfigured(): boolean {
    return Boolean(this.snInstanceUrl && this.snUsername && this.snPassword);
  }

  private snAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${this.snUsername}:${this.snPassword}`).toString('base64');
  }

  async fetchQueue(limit = 50) {
    if (!this.isSnConfigured()) {
      throw new Error('ServiceNow is not configured (missing SN_INSTANCE_URL/SN_USERNAME/SN_PASSWORD).');
    }
    const query = 'stateIN1,2,3^ORDERBYDESCsys_created_on';
    const url = `${this.snInstanceUrl}/api/now/table/incident?sysparm_query=${query}&sysparm_limit=${limit}`;
    const res = await fetch(url, { headers: { Authorization: this.snAuthHeader(), Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`ServiceNow queue fetch failed [${res.status}]: ${await res.text()}`);
    }
    const body = await res.json();
    return (body.result || []).map((rec: any) => this.mapSnIncident(rec));
  }

  async updateIncident(sysId: string, params: { state?: string; priority?: string; resolutionNotes?: string; assignmentGroup?: string }) {
    if (!this.isSnConfigured()) {
      throw new Error('ServiceNow is not configured (missing SN_INSTANCE_URL/SN_USERNAME/SN_PASSWORD).');
    }
    const payload: Record<string, any> = {};
    if (params.state) payload.state = String(REVERSE_SN_STATE_MAP[params.state] || 2);
    if (params.priority) payload.priority = params.priority.replace(/^P/i, '');
    if (params.assignmentGroup) payload.assignment_group = params.assignmentGroup;
    if (params.state === 'RESOLVED') {
      payload.close_code = 'Automated Remediation';
      payload.close_notes = params.resolutionNotes || 'Resolved automatically by ITSM-Agentic Engine.';
    }
    const url = `${this.snInstanceUrl}/api/now/table/incident/${sysId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: this.snAuthHeader(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`ServiceNow incident update failed [${res.status}]: ${await res.text()}`);
    }
    return { success: true };
  }

  async addWorkNote(sysId: string, workNote: string, author = 'Agentic AI SRE') {
    if (!this.isSnConfigured()) {
      throw new Error('ServiceNow is not configured (missing SN_INSTANCE_URL/SN_USERNAME/SN_PASSWORD).');
    }
    const url = `${this.snInstanceUrl}/api/now/table/incident/${sysId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: this.snAuthHeader(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ work_notes: `[code]<b>${author}</b>[/code]\n${workNote}` }),
    });
    if (!res.ok) {
      throw new Error(`ServiceNow work note post failed [${res.status}]: ${await res.text()}`);
    }
    return { success: true };
  }

  async getCiDetails(ciName: string) {
    if (!this.isSnConfigured()) {
      throw new Error('ServiceNow is not configured (missing SN_INSTANCE_URL/SN_USERNAME/SN_PASSWORD).');
    }
    const url = `${this.snInstanceUrl}/api/now/table/cmdb_ci?sysparm_query=name=${encodeURIComponent(ciName)}&sysparm_limit=1`;
    const res = await fetch(url, { headers: { Authorization: this.snAuthHeader(), Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`ServiceNow CMDB fetch failed [${res.status}]: ${await res.text()}`);
    }
    const body = await res.json();
    const rec = (body.result || [])[0];
    // Metadata only -- ServiceNow's CMDB does not store SSH credentials, matching
    // the Python daemon's servicenow_client.py::fetch_ci_details() design.
    return rec ? { name: rec.name || ciName, ip: rec.ip_address || '', os: rec.os || '' } : null;
  }

  private mapSnIncident(rec: any) {
    const rawState = parseInt(rec.state, 10);
    const ciField = rec.cmdb_ci;
    const ciName = typeof ciField === 'object' ? ciField?.display_value : ciField;
    return {
      sys_id: rec.sys_id,
      number: rec.number,
      shortDescription: rec.short_description || '',
      description: rec.description || '',
      priority: `P${rec.priority || '3'}`,
      state: SN_STATE_MAP[rawState] || 'NEW',
      configurationItem: ciName && String(ciName).toLowerCase() !== 'none' ? ciName : 'Unspecified CI',
      assignedTo: rec.assigned_to?.display_value || 'Unassigned',
    };
  }

  /**
   * Handles an inbound ServiceNow outbound-webhook call by actually creating an
   * incident in this platform's database. Previously this only logged and echoed
   * the normalized payload back in the HTTP response -- a real ServiceNow
   * instance pushing a ticket in via its "Outbound REST Message" business rule
   * would get a 200 OK and believe the ticket was ingested, but nothing was ever
   * persisted, so the daemon's incident queue never saw it.
   *
   * tenantId/callerId default to the exact same literals ('tenant_acme_01' /
   * 'monitoring-bot-id') already used by IncidentController.create() for its own
   * @Public() unauthenticated incident-creation path -- this reuses that existing
   * convention for system/webhook-originated incidents rather than inventing a
   * new one.
   */
  async processOutboundWebhook(payload: ServiceNowWebhookPayload) {
    this.logger.log(`Received ServiceNow Outbound Webhook for Ticket [${payload.number}] (sys_id: ${payload.sys_id})`);

    const ciName = typeof payload.cmdb_ci === 'object' ? payload.cmdb_ci?.display_value : payload.cmdb_ci;

    const dto: CreateIncidentDto = {
      shortDescription: payload.short_description,
      description: payload.description || payload.short_description,
      priority: `P${payload.priority || '3'}`,
      state: 'NEW',
      configurationItem: ciName || 'Unspecified CI',
      caller: 'ServiceNow Webhook',
    };

    // Incident has no dedicated externalRef/sourceSystem column today -- record
    // the originating ServiceNow ticket in the initial activity log entry rather
    // than adding a schema change for this pass. Sufficient for manual
    // correlation; a real integration wanting programmatic correlation would want
    // a proper column later.
    const created = await this.incidentService.create('tenant_acme_01', 'monitoring-bot-id', dto);

    if (payload.sys_id || payload.number) {
      await this.incidentService
        .addActivity('tenant_acme_01', created.id, 'monitoring-bot-id', {
          comment: `Sourced from ServiceNow ticket ${payload.number || '?'} (sys_id: ${payload.sys_id || '?'})`,
          isWorkNote: true,
          author: 'ServiceNow Webhook',
        })
        .catch((e) => this.logger.warn(`Failed to record ServiceNow source activity: ${e?.message || e}`));
    }

    this.logger.log(`Persisted ServiceNow webhook ticket [${payload.number}] as [${created.number}] (id: ${created.id})`);

    return {
      success: true,
      message: `ServiceNow webhook for incident ${payload.number} created as ${created.number} and queued for AI Agent processing.`,
      incident: created,
    };
  }
}
