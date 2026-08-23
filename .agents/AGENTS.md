# Workspace Rules

## Application Management Directives
- **Start App Directive (All Services)**: Whenever the user requests to "start the application" (or "start app", "restart app", "restart application", "start all processes", "bring online"), automatically follow this strict sequence:
  1. Start local PostgreSQL Database (`& "$env:USERPROFILE\pgsql\pgsql\bin\postgres.exe" -D "$env:USERPROFILE\pgsql\pgsql\data"`) and confirm port 5432 is open.
  2. Rebuild NestJS backend (`npm run build:backend`).
  3. Build MCP server (`npm run build:mcp`).
  4. Start NestJS backend API server (`node apps/backend/dist/main.js` on port 4000).
  5. Start Next.js frontend dev server (`npm run dev:frontend` on port 3000).
  6. Start Agent Control Tower Dashboard server (`node server.js` on port 5173 in `apps/sre-control-tower`).
  7. Start Python Auto-Resolver Agent Daemon (`python -u continuous_itsm_agent_daemon.py` in `services/sre-agent-daemon`).
  8. Start ITSM MCP Server (`npm run start:mcp`).

- **Start ServiceNow Directive (ITSM Tool Only)**: Whenever the user requests to "start service now" (or "start servicenow", "start servicenow tool", "start service now tool", "restart service now"), automatically follow this strict sequence to start **ONLY the Core ITSM Tool**:
  1. Start local PostgreSQL Database (`& "$env:USERPROFILE\pgsql\pgsql\bin\postgres.exe" -D "$env:USERPROFILE\pgsql\pgsql\data"`) and confirm port 5432 is open.
  2. Rebuild NestJS backend (`npm run build:backend`).
  3. Start NestJS backend API server (`node apps/backend/dist/main.js` on port 4000).
  4. Start Next.js frontend dev server (`npm run dev:frontend` on port 3000).
  *(DO NOT start Agent Control Tower Dashboard, Python Auto-Resolver Daemon, or MCP Server).*

- **Start Agentic SRE Service Directive (Control Tower & AI Services)**: Whenever the user requests to "start control tower" (or "start agentic sre service", "start sre service", "start sre agent", "restart control tower"), automatically follow this strict sequence:
  1. Start local PostgreSQL Database (`& "$env:USERPROFILE\pgsql\pgsql\bin\postgres.exe" -D "$env:USERPROFILE\pgsql\pgsql\data"`) and confirm port 5432 is open (`agentic_sre_db`).
  2. Build MCP server (`npm run build:mcp`).
  3. Start Agent Control Tower Dashboard server (`node server.js` on port 5173 in `apps/sre-control-tower`).
  4. Start Python Auto-Resolver Agent Daemon (`python -u continuous_itsm_agent_daemon.py` in `services/sre-agent-daemon`).
  5. Start ITSM MCP Server (`npm run start:mcp`).

- **Stop App Directive**: Whenever the user requests to "stop the application" (or "stop app", "stop all services", "power off"), automatically follow this strict teardown sequence:
  1. Stop Python Auto-Resolver Agent Daemon.
  2. Stop ITSM MCP Server.
  3. Stop Agent Control Tower Dashboard.
  4. Stop Next.js Frontend Dev Server.
  5. Stop NestJS Backend API Server.
  6. Stop local PostgreSQL Database LAST (`pg_ctl stop` or kill `postgres` process).

## Database Management Directives
- **Database Integrity Directive**: Whenever the backend is built (`npm run build:backend`), restarted, or compiled, **DO NOT ALTER OR RESET THE DATABASE**. Preserve all existing DB state, table schemas, and incident records without running destructive seeds, resets, or table wipes.
