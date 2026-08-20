# 🤖 Gemini / Antigravity Master Startup Prompt

Copy and paste the prompt below into **Google Antigravity / Gemini CLI** to restore and bring the entire ITSM Agentic system online:

```text
Please initialize, restore data, and start the entire Enterprise Agentic ITSM platform on this machine following the strict architecture directives:

### 1. Environment & Database Restoration
- Ensure PostgreSQL is running on port 5432 with database `itsm_db`, user `itsm_user`, and password `itsm_password`.
- If this is a fresh environment or database is empty, restore data by executing:
  `python import_repo_data_dump.py` (or `psql -U itsm_user -d itsm_db -h 127.0.0.1 -p 5432 -f database_dump.sql`).
- CRITICAL DATABASE INTEGRITY RULE: DO NOT reset, drop, or wipe existing database tables during builds or restarts. Preserve all 1,000+ incident records and schema definitions intact.

### 2. Dependency Check & Builds
- Ensure Node.js (v18+) and Python (3.10+) dependencies are installed (`npm install`, `pip install -r "Resolver Agent/requirements.txt"`).
- Rebuild the NestJS backend: `npm run build:backend`
- Rebuild the ITSM MCP server: `npm run build:mcp`

### 3. Strict 8-Step Service Startup Sequence (Single-Instance Guarantee)
Bring each service online as a background daemon process, ensuring only ONE instance of each service runs:
1. Confirm PostgreSQL Database is active on port 5432.
2. Build NestJS Backend: `npm run build:backend`
3. Build MCP Server: `npm run build:mcp`
4. Start NestJS Backend API Server: `node apps/backend/dist/main.js` (Port 4000)
5. Start Next.js Frontend Dev Server: `npm run dev:frontend` (Port 3000)
6. Start Agent Control Tower Dashboard: `node server.js` in `Resolver Agent/agent-approval-dashboard` (Port 5173)
7. Start Python Auto-Resolver Agent Daemon: `python -u continuous_itsm_agent_daemon.py` in `Resolver Agent`
8. Start ITSM MCP Server: `npm run start:mcp` (stdio)

### 4. Health & Port Verification
Audit active TCP listeners and confirm all ports are healthy:
- Port 5432: PostgreSQL Database
- Port 4000: NestJS API & AI Router (http://localhost:4000/api/docs)
- Port 3000: Next.js ITSM Web App (http://localhost:3000)
- Port 5173: Agent Control Tower HITL Dashboard (http://localhost:5173)
- Python Daemon: Active polling with Domain-Partitioned ChromaDB RAG and sub-second non-thinking judge enabled.
```
