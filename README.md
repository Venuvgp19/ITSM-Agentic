# Autonomous ITSM Platform & Multi-Agent Resolver System

An enterprise-grade **IT Service Management (ITSM) Platform** featuring an **Autonomous Multi-Agent AI Engine**. 
The system autonomously triages incoming helpdesk tickets, retrieves verified SOPs via dense vector RAG (4096-D embeddings), executes SSH remediation routines on target servers, synthesizes new knowledge on RAG misses, and enforces strict Human-in-the-Loop (HITL) governance.

---

## 🚀 Key Features

* **🤖 Autonomous AI Ticket Router:** Routes tickets with 85%+ confidence using Meta Llama 3.3 70B / Nemotron.
* **🎯 High-Precision Vector RAG:** Matches incident telemetry against Master SOPs using 4096-dimensional embeddings (`nvidia/nv-embed-v1`) calibrated at `0.50` Cosine Similarity.
* **⚡ Self-Healing Remote Remediation:** Executes non-interactive SSH recovery scripts on target servers with live health verification.
* **🛡️ Agent Control Tower (HITL):** Real-time approval dashboard ensuring high-privilege commands receive human operator authorization before touching production.
* **🧠 Smart SOP Deduplication & Consolidation:** Automatically merges semantically similar SOP drafts (≥60% Jaccard token overlap) into unified Master SOPs.

---

## 🏗️ Architecture & Component Ports

| Service | Port / Protocol | Technology Stack | Description |
| :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | `5432` | PostgreSQL 14+ | Primary transactional DB storing incidents, KBs, and audit logs. |
| **NestJS API Backend** | `4000` | Node.js / NestJS / Prisma | Core API Gateway, AI Router, and Knowledge Consolidator. |
| **Next.js ITSM Frontend** | `3000` | Next.js 14 / React | Primary Helpdesk Portal for users and engineers. |
| **Agent Control Tower** | `5173` | Vite / React | Real-time Human-in-the-Loop (HITL) approval dashboard. |
| **Auto-Resolver Daemon** | Background Service | Python 3.10+ | SSH execution engine, vector DB RAG search, & SOP synthesizer. |
| **ITSM MCP Server** | stdio | Node.js | Model Context Protocol server for AI agent integrations. |

---

## 📋 Prerequisites & Prerequisites Check

Ensure the following tools are installed on your environment:
- **Node.js**: v18.0.0 or higher (`node -v`)
- **Python**: v3.10 or higher (`python --version`)
- **PostgreSQL**: v14.0 or higher (`psql --version`)
- **Git**: (`git --version`)

---

## 🛠️ Step-by-Step Environment Setup Guide

### Step 1: Clone the Repository
```bash
git clone https://github.com/Venuvgp19/ITSM-Agentic.git
cd ITSM-Agentic
```

---

### Step 2: Database Initialization & Data Restore

1. **Start PostgreSQL** and ensure it is listening on port `5432`.
2. **Create the Database and User** (in PostgreSQL `psql` shell or command line):
   ```sql
   CREATE USER postgres WITH PASSWORD 'postgres';
   CREATE DATABASE itsm_db OWNER postgres;
   ```
3. **Restore the Schema and Seed Data**:
   A complete PostgreSQL database dump is included at `packages/db/itsm_db_dump.sql`.
   
   **Linux / macOS:**
   ```bash
   psql -U postgres -d itsm_db -f packages/db/itsm_db_dump.sql
   ```
   
   **Windows (PowerShell):**
   ```powershell
   & "$env:USERPROFILE\pgsql\pgsql\bin\psql.exe" -U postgres -d itsm_db -f packages/db/itsm_db_dump.sql
   ```

---

### Step 3: Install Dependencies

1. **Root & Node.js Workspace Dependencies:**
   ```bash
   npm install
   ```
2. **Control Tower Dashboard Dependencies:**
   ```bash
   cd "Resolver Agent/agent-approval-dashboard"
   npm install
   cd ../..
   ```
3. **Python Daemon Dependencies:**
   ```bash
   cd "Resolver Agent"
   pip install -r requirements.txt
   cd ..
   ```

---

### Step 4: Environment Variables Setup

Ensure environment variables are configured. 

Create an `.env` file in `apps/backend/.env`:
```env
PORT=4000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/itsm_db?schema=public"
LITELLM_BASE_URL="https://genailab.tcs.in/v1"
```

---

### Step 5: Build Core Applications

Rebuild the backend NestJS application and the MCP server:
```bash
npm run build:backend
npm run build:mcp
```

---

### Step 6: Launch All Services

Run each component in a separate terminal tab or window:

#### Terminal 1: NestJS Backend API (Port 4000)
```bash
node apps/backend/dist/main.js
```

#### Terminal 2: Next.js ITSM Frontend (Port 3000)
```bash
npm run dev:frontend
```

#### Terminal 3: Agent Control Tower Dashboard (Port 5173)
```bash
cd "Resolver Agent/agent-approval-dashboard"
node server.js
```

#### Terminal 4: Python Auto-Resolver Daemon
```bash
cd "Resolver Agent"
python -u continuous_itsm_agent_daemon.py
```

#### Terminal 5 (Optional): ITSM MCP Server
```bash
npm run start:mcp
```

---

## ⚡ Quick Verification Checklist

You can verify that all 4 main endpoints are healthy by opening these URLs:
- 🟢 **Next.js User Portal:** `http://localhost:3000`
- 🟢 **NestJS API Swagger Docs:** `http://localhost:4000/api/docs`
- 🟢 **Agent Control Tower Dashboard:** `http://localhost:5173`
- 🟢 **PostgreSQL Connection:** `localhost:5432` (`itsm_db`)

---

## 🧠 Understanding RAG & Vector DB Synchronization

1. **Vector DB Location:** `Resolver Agent/vector_db.db` (SQLite Database storing 4096-D dense embeddings generated via `nvidia/nv-embed-v1`).
2. **RAG Cosine Threshold:** Set to `0.50`.
   - Score `≥ 0.50`: Matches verified Master SOP (e.g., `KB0000020` for NexaCore recovery).
   - Score `< 0.50`: Triggers RAG Miss, calling the LLM SOP Synthesizer to draft a new SOP.
3. **Automatic Vector Re-indexing:** The Python daemon automatically embeds new Knowledge Base articles into `vector_db.db` every 5 polling cycles (~75 seconds).

---

## 🔧 Troubleshooting & Pitfalls

* **Database Connection Refused:** Ensure PostgreSQL is running on port `5432` and `itsm_db` was restored correctly.
* **Daemon Fails with "Daemon instance already running":** 
  Delete the lock file and restart:
  ```powershell
  Remove-Item "Resolver Agent\daemon.lock" -Force
  ```
* **RAG Cosine Similarity Misses Valid SOPs:** 
  Ensure raw shell code artifacts are not included in the embedding payload. Only embed clean `Title` + `Summary` metadata.

---

## 📄 License
MIT License - Autonomous ITSM Agentic Platform
