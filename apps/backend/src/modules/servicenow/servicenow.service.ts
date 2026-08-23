import { Injectable, Logger } from '@nestjs/common';

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

@Injectable()
export class ServiceNowService {
  private readonly logger = new Logger(ServiceNowService.name);

  processOutboundWebhook(payload: ServiceNowWebhookPayload) {
    this.logger.log(`Received ServiceNow Outbound Webhook for Ticket [${payload.number}] (sys_id: ${payload.sys_id})`);
    
    const ciName = typeof payload.cmdb_ci === 'object' ? payload.cmdb_ci?.display_value : payload.cmdb_ci;

    const normalizedIncident = {
      sys_id: payload.sys_id,
      number: payload.number,
      title: payload.short_description,
      shortDescription: payload.short_description,
      description: payload.description || '',
      category: payload.category || 'Infrastructure',
      priority: `P${payload.priority || '3'}`,
      state: 'NEW',
      configurationItem: ciName || 'Worker 1',
      source: 'ServiceNow Webhook'
    };

    this.logger.log(`Normalized ServiceNow payload for Agent ingestion: ${JSON.stringify(normalizedIncident)}`);
    return {
      success: true,
      message: `ServiceNow webhook for incident ${payload.number} queued for AI Agent processing.`,
      incident: normalizedIncident
    };
  }
}
