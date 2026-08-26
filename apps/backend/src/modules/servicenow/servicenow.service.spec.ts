import { Test, TestingModule } from '@nestjs/testing';
import { ServiceNowService } from './servicenow.service';
import { IncidentService } from '../incidents/incident.service';

describe('ServiceNowService', () => {
  let service: ServiceNowService;
  let incidentService: { create: jest.Mock; addActivity: jest.Mock };

  beforeEach(async () => {
    incidentService = {
      create: jest.fn(),
      addActivity: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceNowService,
        { provide: IncidentService, useValue: incidentService },
      ],
    }).compile();

    service = module.get(ServiceNowService);
  });

  it('normalizes an inbound webhook payload into a CreateIncidentDto shape and creates a real incident', async () => {
    incidentService.create.mockResolvedValue({ id: 'inc-uuid-1', number: 'INC0000123' });

    const result = await service.processOutboundWebhook({
      sys_id: 'abc123',
      number: 'INC0010001',
      short_description: 'Disk full on prod-db-01',
      description: 'root partition at 98%',
      priority: '2',
      cmdb_ci: { display_value: 'prod-db-01' },
    });

    expect(incidentService.create).toHaveBeenCalledWith(
      'tenant_acme_01',
      'monitoring-bot-id',
      expect.objectContaining({
        shortDescription: 'Disk full on prod-db-01',
        description: 'root partition at 98%',
        priority: 'P2',
        state: 'NEW',
        configurationItem: 'prod-db-01',
        caller: 'ServiceNow Webhook',
      }),
    );
    expect(result.success).toBe(true);
    expect(result.incident).toEqual({ id: 'inc-uuid-1', number: 'INC0000123' });
  });

  it('actually persists the incident, unlike the previous echo-only stub', async () => {
    incidentService.create.mockResolvedValue({ id: 'inc-uuid-2', number: 'INC0000124' });

    await service.processOutboundWebhook({
      sys_id: 'xyz789',
      number: 'INC0010002',
      short_description: 'Network outage',
    });

    expect(incidentService.create).toHaveBeenCalledTimes(1);
  });

  it('records the source ServiceNow ticket reference as an activity', async () => {
    incidentService.create.mockResolvedValue({ id: 'inc-uuid-3', number: 'INC0000125' });

    await service.processOutboundWebhook({
      sys_id: 'ref-sys-id',
      number: 'INC0010003',
      short_description: 'VPN down',
    });

    expect(incidentService.addActivity).toHaveBeenCalledWith(
      'tenant_acme_01',
      'inc-uuid-3',
      'monitoring-bot-id',
      expect.objectContaining({
        comment: expect.stringContaining('INC0010003'),
        author: 'ServiceNow Webhook',
      }),
    );
  });

  it('defaults configurationItem to "Unspecified CI" when cmdb_ci is absent', async () => {
    incidentService.create.mockResolvedValue({ id: 'inc-uuid-4', number: 'INC0000126' });

    await service.processOutboundWebhook({
      sys_id: 's4',
      number: 'INC0010004',
      short_description: 'No CI given',
    });

    expect(incidentService.create).toHaveBeenCalledWith(
      'tenant_acme_01',
      'monitoring-bot-id',
      expect.objectContaining({ configurationItem: 'Unspecified CI' }),
    );
  });

  it('defaults priority to P3 when not provided', async () => {
    incidentService.create.mockResolvedValue({ id: 'inc-uuid-5', number: 'INC0000127' });

    await service.processOutboundWebhook({
      sys_id: 's5',
      number: 'INC0010005',
      short_description: 'No priority given',
    });

    expect(incidentService.create).toHaveBeenCalledWith(
      'tenant_acme_01',
      'monitoring-bot-id',
      expect.objectContaining({ priority: 'P3' }),
    );
  });

  describe('Table API client (used by the MCP server servicenow_* tools)', () => {
    const realFetch = global.fetch;
    const realEnv = { ...process.env };

    beforeEach(() => {
      process.env.SN_INSTANCE_URL = 'https://dev12345.service-now.com';
      process.env.SN_USERNAME = 'admin';
      process.env.SN_PASSWORD = 'secret';
    });

    afterEach(() => {
      global.fetch = realFetch;
      process.env = { ...realEnv };
    });

    it('throws (fails closed) when SN_* env vars are not configured', async () => {
      process.env.SN_INSTANCE_URL = '';
      await expect(service.fetchQueue()).rejects.toThrow(/not configured/i);
    });

    it('fetchQueue maps ServiceNow records into the internal incident shape', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: [
            {
              sys_id: 'abc', number: 'INC001', short_description: 'Disk full',
              priority: '2', state: '2', cmdb_ci: { display_value: 'db01' },
              assigned_to: { display_value: 'Jane' },
            },
          ],
        }),
      }) as any;

      const result = await service.fetchQueue();

      expect(result).toEqual([
        {
          sys_id: 'abc', number: 'INC001', shortDescription: 'Disk full', description: '',
          priority: 'P2', state: 'IN_PROGRESS', configurationItem: 'db01', assignedTo: 'Jane',
        },
      ]);
      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('/api/now/table/incident');
    });

    it('updateIncident maps internal state names to ServiceNow numeric codes', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;

      await service.updateIncident('sys1', { state: 'RESOLVED', resolutionNotes: 'fixed it' });

      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/api/now/table/incident/sys1');
      const body = JSON.parse((options as any).body);
      expect(body.state).toBe('6'); // RESOLVED -> 6
      expect(body.close_notes).toBe('fixed it');
    });

    it('addWorkNote posts to the work_notes field', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;

      await service.addWorkNote('sys1', 'hello', 'Test Author');

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse((options as any).body);
      expect(body.work_notes).toContain('hello');
      expect(body.work_notes).toContain('Test Author');
    });

    it('getCiDetails returns metadata only, never credentials', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: [{ name: 'Worker1', ip_address: '10.0.0.5', os: 'Linux' }] }),
      }) as any;

      const result = await service.getCiDetails('Worker1');

      expect(result).toEqual({ name: 'Worker1', ip: '10.0.0.5', os: 'Linux' });
      expect(result).not.toHaveProperty('user');
      expect(result).not.toHaveProperty('password');
    });

    it('getCiDetails returns null when not found', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ result: [] }) }) as any;
      expect(await service.getCiDetails('Unknown')).toBeNull();
    });

    it('throws with the ServiceNow error body when a Table API call fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'internal error' }) as any;
      await expect(service.fetchQueue()).rejects.toThrow(/500/);
    });
  });
});
