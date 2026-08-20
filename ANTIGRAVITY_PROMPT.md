# 🚀 Antigravity & Gemini Project Startup Guide

This document contains the **exact, zero-friction prompt** to copy and paste into **Google Antigravity / Gemini CLI / Agent** on any new or freshly cloned machine to initialize, restore, and run the entire Enterprise Agentic ITSM platform cleanly.

---

## 📋 Copy-Paste Prompt for Gemini in Antigravity

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

---

## 🛠️ Architecture & Port Reference

| Service / Subsystem | Port / Transport | Working Directory | Launch Command | Purpose |
| :--- | :---: | :---: | :---: | :--- |
| **PostgreSQL Database** | `5432` | `$HOME/pgsql` | `postgres.exe -D data` | Core relational data store (`itsm_db`) |
| **NestJS Backend API** | `4000` | `apps/backend` | `node dist/main.js` | REST APIs, Prisma ORM, AI Ticket Router |
| **Next.js Frontend Web App** | `3000` | `apps/frontend` | `npm run dev:frontend` | Enterprise ITSM User & Admin Interface |
| **Agent Control Tower Dashboard** | `5173` | `Resolver Agent/agent-approval-dashboard` | `node server.js` | HITL Governance, SOP Approval UI & Telemetry |
| **Python Auto-Resolver Daemon** | Background Task | `Resolver Agent` | `python -u continuous_itsm_agent_daemon.py` | Continuous Autonomous Incident Remediation |
| **ITSM Agentic MCP Server** | `stdio` | `packages/mcp-server` | `npm run start:mcp` | Model Context Protocol tool interface |

---

## ⚙️ Environment Variables Reference

Ensure the following `.env` files exist before startup:

### 1. `apps/backend/.env`
```env
PORT=4000
DATABASE_URL="postgresql://itsm_user:itsm_password@localhost:5432/itsm_db?schema=public"
JWT_SECRET="super-secret-jwt-token-key"
NVIDIA_API_KEY="nvapi-your-nvidia-api-key-here"
NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
```

### 2. `apps/frontend/.env` / `apps/frontend/.env.local`
```env
NEXT_PUBLIC_API_URL="http://localhost:4000/api/v1"
```

### 3. `Resolver Agent/.env`
```env
NVIDIA_API_KEY="nvapi-your-nvidia-api-key-here"
ITSM_BASE_URL="http://localhost:4000/api/v1"
ITSM_ADMIN_USER="admin@itsm.local"
ITSM_ADMIN_PASS="Admin123!"
```

---

## 🛑 Stop Application Directive (Clean Teardown Sequence)

When stopping all services, follow this strict teardown sequence:
1. Stop Python Auto-Resolver Agent Daemon (Kill process & clear `Resolver Agent/daemon.lock`).
2. Stop ITSM MCP Server.
3. Stop Agent Control Tower Dashboard (Port 5173).
4. Stop Next.js Frontend Dev Server (Port 3000).
5. Stop NestJS Backend API Server (Port 4000).
6. Stop PostgreSQL Database LAST (`pg_ctl stop` or kill `postgres` process).
