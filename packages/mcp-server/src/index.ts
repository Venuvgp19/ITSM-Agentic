import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const BACKEND_BASE_URL = process.env.ITSM_BACKEND_URL || 'http://localhost:4000';
const DEFAULT_EMAIL = process.env.ITSM_AUTH_EMAIL || 'admin@acme.com';
const DEFAULT_PASSWORD = process.env.ITSM_AUTH_PASSWORD || 'Admin123!';

let cachedAuthToken: string | null = process.env.ITSM_AUTH_TOKEN || null;

// Automatically obtain valid JWT auth token from backend /auth/login
async function getOrFetchAuthToken(): Promise<string> {
  if (cachedAuthToken) {
    return cachedAuthToken;
  }

  try {
    const loginRes = await fetch(`${BACKEND_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: DEFAULT_EMAIL,
        password: DEFAULT_PASSWORD,
      }),
    });

    if (loginRes.ok) {
      const data: any = await loginRes.json();
      const token = data.accessToken || data.access_token || data.token;
      if (token) {
        cachedAuthToken = token;
        return token;
      }
    }
  } catch (err) {
    console.error('Auto-login attempt failed:', err);
  }

  return 'demo-jwt-access-token-itsm';
}

// Helper function for API calls to ITSM backend with automatic Auth Flow & token retry
async function callApi(
  endpoint: string,
  method: string = 'GET',
  body?: any,
  authToken?: string,
  isRetry: boolean = false
): Promise<any> {
  const token = authToken || (await getOrFetchAuthToken());

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BACKEND_BASE_URL}${endpoint}`, options);

  // If 401 Unauthorized and using cached token, re-login and retry request once
  if (response.status === 401 && !isRetry && !authToken) {
    cachedAuthToken = null;
    return callApi(endpoint, method, body, undefined, true);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HTTP status ${response.status} (${response.statusText}): ${errorText}`
    );
  }

  return response.json();
}

const server = new Server(
  {
    name: 'itsm-agentic-router-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register MCP Tools for all endpoints in http://localhost:4000/api/docs
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ----------------------------------------------------
      // 1. Authentication Tools
      // ----------------------------------------------------
      {
        name: 'auth_register_tenant',
        description: 'Register a new enterprise tenant and admin user account (POST /api/v1/auth/register-tenant)',
        inputSchema: {
          type: 'object',
          properties: {
            organizationName: { type: 'string', description: 'Name of the organization/tenant' },
            domain: { type: 'string', description: 'Enterprise domain name (e.g. acme.com)' },
            adminEmail: { type: 'string', description: 'Admin user email address' },
            adminPassword: { type: 'string', description: 'Admin user password (min 8 characters)' },
            adminFirstName: { type: 'string', description: 'Admin user first name' },
            adminLastName: { type: 'string', description: 'Admin user last name' },
          },
          required: ['organizationName', 'domain', 'adminEmail', 'adminPassword', 'adminFirstName', 'adminLastName'],
        },
      },
      {
        name: 'auth_login',
        description: 'Authenticate user credentials and return JWT access token (POST /api/v1/auth/login)',
        inputSchema: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'User email address' },
            password: { type: 'string', description: 'User password' },
          },
          required: ['email', 'password'],
        },
      },
      {
        name: 'auth_get_profile',
        description: 'Get current authenticated user profile details (GET /api/v1/auth/me)',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'Optional JWT auth bearer token' },
          },
        },
      },

      // ----------------------------------------------------
      // 2. Users & Departments Tools
      // ----------------------------------------------------
      {
        name: 'users_list',
        description: 'List all user accounts in the enterprise tenant (GET /api/v1/users)',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'Optional JWT auth bearer token' },
          },
        },
      },
      {
        name: 'users_list_departments',
        description: 'List all organizational departments (Unix, Network Ops, SecOps, DBA, App Support, etc.) (GET /api/v1/users/departments)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'users_create',
        description: 'Provision a new enterprise user account (POST /api/v1/users)',
        inputSchema: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'User email' },
            firstName: { type: 'string', description: 'First name' },
            lastName: { type: 'string', description: 'Last name' },
            role: { type: 'string', description: 'Role (ADMIN, TECHNICIAN, END_USER)' },
            departmentId: { type: 'string', description: 'Optional department ID' },
            password: { type: 'string', description: 'User password' },
          },
          required: ['email', 'firstName', 'lastName'],
        },
      },

      // ----------------------------------------------------
      // 3. Incident Management Tools
      // ----------------------------------------------------
      {
        name: 'incidents_get_fields_schema',
        description: 'Retrieve complete Incident entity field dictionary and schema definitions (GET /api/v1/incidents/fields/schema)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'incidents_list',
        description: 'List all incident tickets for current tenant (GET /api/v1/incidents)',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'Optional JWT auth bearer token' },
          },
        },
      },
      {
        name: 'list_unassigned_incidents',
        description: 'Fetch all unassigned incidents from the main ITSM backend database',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Optional max number of unassigned incidents to retrieve' },
          },
        },
      },
      {
        name: 'incidents_get_by_id',
        description: 'Get detailed incident record by ID or Number (INC0001001) with all fields (GET /api/v1/incidents/:id)',
        inputSchema: {
          type: 'object',
          properties: {
            incidentId: { type: 'string', description: 'Incident ID or Number (e.g. INC0001001)' },
            authToken: { type: 'string', description: 'Optional JWT auth bearer token' },
          },
          required: ['incidentId'],
        },
      },
      {
        name: 'incidents_create',
        description: 'Create a new incident ticket (POST /api/v1/incidents)',
        inputSchema: {
          type: 'object',
          properties: {
            shortDescription: { type: 'string', description: 'Brief incident summary' },
            description: { type: 'string', description: 'Detailed incident description' },
            impact: { type: 'string', description: 'Impact level (HIGH, MEDIUM, LOW)' },
            urgency: { type: 'string', description: 'Urgency level (HIGH, MEDIUM, LOW)' },
            department: { type: 'string', description: 'Target department/group' },
            assignedTo: { type: 'string', description: 'Assigned technician' },
            caller: { type: 'string', description: 'Caller name' },
            configurationItem: { type: 'string', description: 'Associated CI name' },
            priority: { type: 'string', description: 'Priority level (P1, P2, P3, P4)' },
          },
          required: ['shortDescription'],
        },
      },
      {
        name: 'incidents_update',
        description: 'Update incident state, priority, assignment, department, or resolution code (PATCH /api/v1/incidents/:id)',
        inputSchema: {
          type: 'object',
          properties: {
            incidentId: { type: 'string', description: 'Incident ID or Number (e.g. INC0001001)' },
            department: { type: 'string', description: 'Department/group name' },
            assignedTo: { type: 'string', description: 'Assigned technician name' },
            state: { type: 'string', description: 'Incident state (NEW, IN_PROGRESS, RESOLVED, CLOSED)' },
            priority: { type: 'string', description: 'Priority (P1, P2, P3, P4)' },
            impact: { type: 'string', description: 'Impact level' },
            urgency: { type: 'string', description: 'Urgency level' },
            resolutionNotes: { type: 'string', description: 'Resolution or work notes' },
            resolutionCode: { type: 'string', description: 'Resolution code' },
            shortDescription: { type: 'string', description: 'Updated short description' },
            description: { type: 'string', description: 'Updated detailed description' },
          },
          required: ['incidentId'],
        },
      },
      {
        name: 'update_incident_group',
        description: 'Update and assign an incident to a specific operational group (department) and technician in the database',
        inputSchema: {
          type: 'object',
          properties: {
            incidentId: { type: 'string', description: 'Incident ID or Number' },
            department: { type: 'string', description: 'Target operational group/department' },
            assignedTo: { type: 'string', description: 'Assigned technician or group lead' },
            state: { type: 'string', description: 'Incident state' },
            resolutionNotes: { type: 'string', description: 'Diagnostic resolution or work note' },
          },
          required: ['incidentId', 'department'],
        },
      },
      {
        name: 'incidents_add_activity',
        description: 'Add a work note or customer comment to incident activity timeline (POST /api/v1/incidents/:id/activities)',
        inputSchema: {
          type: 'object',
          properties: {
            incidentId: { type: 'string', description: 'Incident ID or Number' },
            comment: { type: 'string', description: 'Comment or work note text' },
            isWorkNote: { type: 'boolean', description: 'Whether this is an internal work note (default: true)' },
          },
          required: ['incidentId', 'comment'],
        },
      },

      // ----------------------------------------------------
      // 4. Workflow Engine Tools
      // ----------------------------------------------------
      {
        name: 'workflows_list',
        description: 'List all visual workflow definitions (GET /api/v1/workflows)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'workflows_get_by_id',
        description: 'Get visual workflow definition DAG graph by ID (GET /api/v1/workflows/:id)',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: { type: 'string', description: 'Workflow ID' },
          },
          required: ['workflowId'],
        },
      },
      {
        name: 'workflows_create',
        description: 'Save a visual workflow definition DAG with nodes and edges (POST /api/v1/workflows)',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Workflow name' },
            description: { type: 'string', description: 'Workflow description' },
            triggerType: { type: 'string', description: 'Trigger type (INCIDENT_CREATED, MANUAL, SCHEDULED)' },
            definitionJson: { type: 'object', description: 'Workflow DAG JSON structure containing nodes and edges' },
          },
          required: ['name'],
        },
      },
      {
        name: 'workflows_execute',
        description: 'Trigger visual workflow execution instance with input context (POST /api/v1/workflows/:id/execute)',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: { type: 'string', description: 'Workflow ID to execute' },
            contextJson: { type: 'object', description: 'Input variables/context object for workflow execution' },
          },
          required: ['workflowId'],
        },
      },

      // ----------------------------------------------------
      // 5. CMDB & Infrastructure Tools
      // ----------------------------------------------------
      {
        name: 'cmdb_list_cis',
        description: 'List all Configuration Items (CIs) in CMDB (GET /api/v1/cmdb/ci)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'cmdb_get_ci_by_id',
        description: 'Get Configuration Item topology and details by ID (GET /api/v1/cmdb/ci/:id)',
        inputSchema: {
          type: 'object',
          properties: {
            ciId: { type: 'string', description: 'CI ID' },
          },
          required: ['ciId'],
        },
      },
      {
        name: 'cmdb_create_ci',
        description: 'Register a new Configuration Item (CI) in CMDB (POST /api/v1/cmdb/ci)',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'CI Name (e.g. k8s-prod-cluster-01)' },
            type: { type: 'string', description: 'CI Type (SERVER, DATABASE, APPLICATION, NETWORK, KUBERNETES)' },
            environment: { type: 'string', description: 'Environment (PRODUCTION, STAGING, DEV)' },
            ipAddress: { type: 'string', description: 'Optional IP address' },
            ownerGroup: { type: 'string', description: 'Operational owner group' },
            attributes: { type: 'object', description: 'Optional key-value JSON attributes' },
          },
          required: ['name', 'type'],
        },
      },
      {
        name: 'cmdb_create_relationship',
        description: 'Link two CIs with a dependency relationship like "Runs On" or "Depends On" (POST /api/v1/cmdb/relationships)',
        inputSchema: {
          type: 'object',
          properties: {
            sourceCiId: { type: 'string', description: 'Source CI ID' },
            targetCiId: { type: 'string', description: 'Target CI ID' },
            relationshipType: { type: 'string', description: 'Relationship type (RUNS_ON, DEPENDS_ON, CONNECTS_TO, HOSTED_ON)' },
          },
          required: ['sourceCiId', 'targetCiId', 'relationshipType'],
        },
      },

      // ----------------------------------------------------
      // 6. ServiceNow Passive Inbound MCP Tools
      // ----------------------------------------------------
      {
        name: 'servicenow_fetch_queue',
        description: 'Fetch active unassigned incidents from ServiceNow Table API (/api/now/table/incident)',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Limit number of incidents to fetch' },
          },
        },
      },
      {
        name: 'servicenow_update_incident',
        description: 'Update ServiceNow incident state, assignment group, priority, or resolution notes via Table API',
        inputSchema: {
          type: 'object',
          properties: {
            sysId: { type: 'string', description: 'ServiceNow incident sys_id' },
            state: { type: 'string', description: 'State (NEW, IN_PROGRESS, ON_HOLD, RESOLVED, CLOSED)' },
            assignmentGroup: { type: 'string', description: 'Operational assignment group' },
            priority: { type: 'string', description: 'Priority level (P1, P2, P3, P4)' },
            resolutionNotes: { type: 'string', description: 'Resolution notes' },
          },
          required: ['sysId'],
        },
      },
      {
        name: 'servicenow_add_work_note',
        description: 'Post formatted SRE execution work note to ServiceNow incident work_notes field',
        inputSchema: {
          type: 'object',
          properties: {
            sysId: { type: 'string', description: 'ServiceNow incident sys_id' },
            workNote: { type: 'string', description: 'Formatted work note text' },
            author: { type: 'string', description: 'Author label' },
          },
          required: ['sysId', 'workNote'],
        },
      },
      {
        name: 'servicenow_get_ci_details',
        description: 'Query ServiceNow CMDB table for Configuration Item details and IP address (/api/now/table/cmdb_ci)',
        inputSchema: {
          type: 'object',
          properties: {
            ciName: { type: 'string', description: 'Configuration Item name' },
          },
          required: ['ciName'],
        },
      },

      // ----------------------------------------------------
      // 7. Knowledge Base & Nemotron Agent Tools
      // ----------------------------------------------------
      {
        name: 'knowledge_get_status',
        description: 'Get status and metrics of Nemotron Knowledge Base background synthesis worker (GET /api/v1/knowledge/status)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'nemotron_synthesize_knowledge_base',
        description: 'Trigger NVIDIA Nemotron 3 550B Knowledge Agent to synthesize SOP articles across all incidents in batches (POST /api/v1/knowledge/synthesize-all)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'knowledge_list_articles',
        description: 'List & search synthesized Knowledge Base articles (GET /api/v1/knowledge/articles)',
        inputSchema: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Optional category filter' },
            query: { type: 'string', description: 'Optional search query term' },
          },
        },
      },
      {
        name: 'knowledge_get_article_by_id',
        description: 'Get Knowledge Base article by ID (e.g. KB0000012) (GET /api/v1/knowledge/articles/:id)',
        inputSchema: {
          type: 'object',
          properties: {
            articleId: { type: 'string', description: 'Article ID or Number (e.g. KB0000012)' },
          },
          required: ['articleId'],
        },
      },
    ],
  };
});

// Execute MCP Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let resultData: any;

    switch (name) {
      // Auth
      case 'auth_register_tenant':
        resultData = await callApi('/api/v1/auth/register-tenant', 'POST', args);
        break;
      case 'auth_login': {
        resultData = await callApi('/api/v1/auth/login', 'POST', args);
        if (resultData && (resultData.accessToken || resultData.access_token || resultData.token)) {
          cachedAuthToken = resultData.accessToken || resultData.access_token || resultData.token;
        }
        break;
      }
      case 'auth_get_profile':
        resultData = await callApi('/api/v1/auth/me', 'GET', undefined, args?.authToken as string);
        break;

      // Users
      case 'users_list':
        resultData = await callApi('/api/v1/users', 'GET', undefined, args?.authToken as string);
        break;
      case 'users_list_departments':
        resultData = await callApi('/api/v1/users/departments', 'GET');
        break;
      case 'users_create':
        resultData = await callApi('/api/v1/users', 'POST', args);
        break;

      // Incidents
      case 'incidents_get_fields_schema':
        resultData = await callApi('/api/v1/incidents/fields/schema', 'GET');
        break;
      case 'incidents_list':
        resultData = await callApi('/api/v1/incidents', 'GET', undefined, args?.authToken as string);
        break;
      case 'list_unassigned_incidents': {
        const data: any = await callApi('/api/v1/incidents', 'GET');
        const unassigned = (Array.isArray(data) ? data : []).filter((inc: any) => {
          const d = (inc.department || '').toUpperCase();
          const a = (inc.assignedTo || '').toUpperCase();
          return !d || d.includes('UNASSIGNED') || d === 'IT OPS' || a.includes('UNASSIGNED');
        });
        resultData = {
          totalUnassignedFound: unassigned.length,
          incidents: unassigned.slice(0, (args?.limit as number) || 234),
        };
        break;
      }
      case 'incidents_get_by_id':
        resultData = await callApi(`/api/v1/incidents/${args?.incidentId}`, 'GET', undefined, args?.authToken as string);
        break;
      case 'incidents_create':
        resultData = await callApi('/api/v1/incidents', 'POST', args);
        break;
      case 'incidents_update': {
        const { incidentId, ...patchBody } = args as any;
        resultData = await callApi(`/api/v1/incidents/${incidentId}`, 'PATCH', patchBody);
        break;
      }
      case 'update_incident_group': {
        const incidentId = args?.incidentId as string;
        const department = args?.department as string;
        const assignedTo = (args?.assignedTo as string) || `${department} Lead`;
        const state = (args?.state as string) || 'IN_PROGRESS';
        const resolutionNotes = (args?.resolutionNotes as string) || `Assigned to ${department} by MCP Agentic AI Router.`;
        resultData = await callApi(`/api/v1/incidents/${incidentId}`, 'PATCH', {
          department,
          assignedTo,
          state,
          resolutionNotes,
        });
        break;
      }
      case 'incidents_add_activity': {
        const { incidentId, comment, isWorkNote } = args as any;
        resultData = await callApi(`/api/v1/incidents/${incidentId}/activities`, 'POST', {
          comment,
          isWorkNote: isWorkNote ?? true,
        });
        break;
      }

      // Workflows
      case 'workflows_list':
        resultData = await callApi('/api/v1/workflows', 'GET');
        break;
      case 'workflows_get_by_id':
        resultData = await callApi(`/api/v1/workflows/${args?.workflowId}`, 'GET');
        break;
      case 'workflows_create':
        resultData = await callApi('/api/v1/workflows', 'POST', args);
        break;
      case 'workflows_execute':
        resultData = await callApi(`/api/v1/workflows/${args?.workflowId}/execute`, 'POST', args?.contextJson || {});
        break;

      // CMDB
      case 'cmdb_list_cis':
        resultData = await callApi('/api/v1/cmdb/ci', 'GET');
        break;
      case 'cmdb_get_ci_by_id':
        resultData = await callApi(`/api/v1/cmdb/ci/${args?.ciId}`, 'GET');
        break;
      case 'cmdb_create_ci':
        resultData = await callApi('/api/v1/cmdb/ci', 'POST', args);
        break;
      case 'cmdb_create_relationship':
        resultData = await callApi('/api/v1/cmdb/relationships', 'POST', args);
        break;

      // Knowledge Base & Nemotron Agent
      case 'knowledge_get_status':
        resultData = await callApi('/api/v1/knowledge/status', 'GET');
        break;
      case 'nemotron_synthesize_knowledge_base':
        resultData = await callApi('/api/v1/knowledge/synthesize-all', 'POST');
        break;
      case 'knowledge_list_articles': {
        const cat = args?.category ? `?category=${encodeURIComponent(args.category as string)}` : '';
        const q = args?.query ? `${cat ? '&' : '?'}query=${encodeURIComponent(args.query as string)}` : '';
        resultData = await callApi(`/api/v1/knowledge/articles${cat}${q}`, 'GET');
        break;
      }
      case 'knowledge_get_article_by_id':
        resultData = await callApi(`/api/v1/knowledge/articles/${args?.articleId}`, 'GET');
        break;

      default:
        throw new Error(`Unknown MCP Tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(resultData, null, 2),
        },
      ],
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error executing MCP Tool "${name}": ${err.message}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ITSM Agentic Router MCP Server running on stdio (Automatic Auth Flow enabled)');
}

main().catch((err) => {
  console.error('Fatal error starting MCP Server:', err);
  process.exit(1);
});
