# 🚀 Enterprise Autonomous ITSM Platform & Multi-Agent AI Resolver System

An enterprise-grade, autonomous **IT Service Management (ITSM) Platform** powered by a **Multi-Agent Artificial Intelligence Engine**. 

The system automates helpdesk operations by autonomously triaging incoming IT tickets, executing Dense Vector RAG (ChromaDB 4096-D embeddings with **Dual-Vector Query Normalization Fusion** & **Quantity Mismatch Protection**), running remote SSH remediation scripts on target servers using **Async Parallel Worker Pools**, synthesizing new Master SOP runbooks on RAG misses, and enforcing Human-in-the-Loop (HITL) governance through an Agent Control Tower Dashboard.

---

## 📋 Table of Contents
1. [Project Overview & Key Capabilities](#-project-overview--key-capabilities)
2. [System Requirements & Prerequisites](#-system-requirements--prerequisites)
3. [Architecture & Data Flow Diagram (Mermaid.js)](#-architecture--data-flow-diagram-mermaidjs)
4. [Step-by-Step Installation & Setup Guide](#-step-by-step-installation--setup-guide)
5. [Running the Application Stack](#-running-the-application-stack)
6. [Active Service URLs & Port Reference](#-active-service-urls--port-reference)
7. [Verification & System Testing](#-verification--system-testing)
8. [Troubleshooting & Frequently Asked Questions](#-troubleshooting--frequently-asked-questions)
9. [Repository Structure](#-repository-structure)
10. [License](#-license)

---

## 🌟 Project Overview & Key Capabilities

- **Automated Incident Triage & AI Routing**: AI Router Service continuously scans new helpdesk tickets, evaluates priority (P1 Critical to P4 Low), predicts operational assignment groups with high confidence (≥ 85%), and assigns tickets for automated resolution.
- **Dense Vector RAG Engine**: Persistent ChromaDB vector store powered by 4096-dimensional embeddings with Dual-Vector Query Normalization (HyDE - Hypothetical Document Embeddings) to map noisy ticket descriptions to standardized Master SOPs.
- **Quantity Mismatch Guard**: Intelligently prevents single-user requests from matching bulk 20-user SOPs, automatically inspecting next-best candidate SOPs to prevent over-provisioning.
- **Live SSH Server Diagnosis Probe & Self-Learning SOP Generator**: On RAG misses, the daemon probes target infrastructure (`uname -a`, `cat /etc/os-release`, `ss -tulpn`, `ps aux`), captures diagnostic telemetry, and invokes Nemotron LLMs to synthesize generic, parameterizable Master SOPs (`{username}`, `{password}`, `{sudo_command}`).
- **Agent Control Tower Dashboard**: Real-time React/Vite HITL dashboard for human operators to inspect, review, approve, or reject AI-synthesized SOP runbooks.
- **Dynamic SSH ReAct Execution Pool**: Executes shell payloads concurrently across target nodes (`ControlPlane`, `WorkerNode1HL`), captures execution proofs, and verifies service health via physical HTTP & TCP port probes.

---

## ⚙️ System Requirements & Prerequisites

### Minimum Hardware Specs
- **CPU**: 4 Cores (x86_64 or ARM64)
- **RAM**: 8 GB (16 GB Recommended)
- **Disk Space**: 10 GB free space

### Software Dependencies
| Software | Minimum Version | Description |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.16.0` (LTS) | Backend NestJS API & Frontend Next.js framework |
| **npm** | `>= 9.0.0` | Node Package Manager |
| **Python** | `>= 3.10.0` | Auto-Resolver Agent Daemon & Vector RAG Engine |
| **PostgreSQL** | `>= 15.0` | Primary Relational Database (`itsm_db`) |
| **Docker & Docker Compose** | `>= 24.0.0` | Container runtime for PostgreSQL, Redis, RabbitMQ, MinIO |
| **Git** | `>= 2.30.0` | Version Control System |

---

## 🏛️ Architecture & Data Flow Diagram (Mermaid.js)

```mermaid
flowchart TD
    START(["1. New Incident Ticket Created<br/>State = NEW, Dept = UNASSIGNED"])

    subgraph FE["Frontend & API Layer"]
        UI["Helpdesk Portal (Next.js :3000)"]
        API["NestJS REST API Server (:4000)"]
        DB[(PostgreSQL 15 Database :5432<br/>1,079 Pre-Seeded Incidents)]
        UI -->|HTTP / REST| API
        API -->|Prisma ORM| DB
    end

    subgraph ROUTER["Phase 1: AI Router Service"]
        R1["scanAndRouteUnassignedQueue()<br/>Polls unassigned queue every 2s"]
        R2["Priority Classifier & Prompt Evaluator"]
        R3{"Confidence ≥ 85%?"}
        R4["Assign Group & Set State = IN_PROGRESS"]
        R5["Leave UNASSIGNED for Manual Triage"]

        API --> R1 --> R2 --> R3
        R3 -->|"Yes"| R4 -->|Update DB| DB
        R3 -->|"No"| R5
    end

    subgraph DAEMON["Phase 2: Auto-Resolver Daemon"]
        P1["Poll IN_PROGRESS Tickets every 15s"]
        P2["Async Parallel Worker Pool (ThreadPoolExecutor)"]
        P3["SSH OS Fingerprint Probe (uname -s)"]
        P4["Dual-Vector RAG Search against ChromaDB"]
        P5{"Similarity Score ≥ 0.65?"}

        R4 --> P1 --> P2 --> P3 --> P4 --> P5
    end

    subgraph RAGHIT["Phase 3A: RAG Match (Verified Master SOP)"]
        H1["Retrieve Master SOP (e.g., KB0000036 / KB0000037)"]
        H2["LLM Parameterizer<br/>Inject {username}, {password}, {sudo_command}"]
        H3["Direct Remote SSH Execution Path"]

        P5 -->|"RAG Hit (≥ 0.65)"| H1 --> H2 --> H3
    end

    subgraph RAGMISS["Phase 3B: RAG Miss & Live Diagnosis Probe"]
        M1["Execute SSH Diagnostic Probe<br/>uname, os-release, ss -tulpn, ps aux"]
        M2["Invoke Nemotron LLM Knowledge Synthesizer"]
        M3["Submit PENDING Approval Card to Control Tower"]
        M4["Set Ticket State = ON_HOLD"]

        P5 -->|"RAG Miss (< 0.65)"| M1 --> M2 --> M3 --> M4
    end

    subgraph HITL["Phase 4: Agent Control Tower HITL Governance (:5173)"]
        G1["Human Operator Inspects Approval Card"]
        G2{"Operator Decision?"}
        G3["Click APPROVE<br/>Consume Approval & Enrich Vector Store"]
        G4["Click REJECT<br/>Set Approval = REJECTED & Lock Ticket"]

        M3 --> G1 --> G2
        G2 -->|"Approved"| G3
        G2 -->|"Rejected"| G4
    end

    subgraph EXEC["Phase 5: Dynamic SSH ReAct Execution & Verification"]
        S1["Paramiko SSH Client connects to Host (ControlPlane / WorkerNode1HL)"]
        S2["Execute Shell Payloads Line-by-Line"]
        S3["Capture stdout/stderr & Physical Probes (HTTP 8080 / TCP 5432)"]
        S4["LLM Health Verification Engine"]
        S5{"is_healthy == True?"}
        S6["State = RESOLVED<br/>Attach Execution Proof Work Notes"]
        S7["State = ON_HOLD<br/>Escalate to Human Specialist"]

        H3 --> S1
        G3 --> S1
        S1 --> S2 --> S3 --> S4 --> S5
        S5 -->|"Yes"| S6 -->|Update Ticket| DB
        S5 -->|"No"| S7 -->|Update Ticket| DB
        G4 --> S7
    end
```

---

## 🛠️ Step-by-Step Installation & Setup Guide

### Step 1: Clone the Repository
```bash
git clone https://github.com/Venuvgp19/ITSM-Agentic.git
cd ITSM-Agentic
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env` in the repository root:
```bash
cp .env.example .env
```
Ensure your `.env` contains valid credentials:
```env
DATABASE_URL="postgresql://itsm_user:itsm_password@localhost:5432/itsm_db?schema=public"
REDIS_HOST="localhost"
REDIS_PORT=6379
RABBITMQ_URL="amqp://guest:guest@localhost:5672"
NVIDIA_API_KEY="nvapi-your-nvidia-api-key-here"
OPENAI_API_KEY="sk-your-openai-api-key-here"
PORT=4000
FRONTEND_PORT=3000
DASHBOARD_PORT=5173
```

### Step 3: Database Setup & Restoration
The repository includes a pre-seeded database dump (`itsm_db_dump.sql`) with **1,079 tickets** and Master SOPs.

#### Option A: Local PostgreSQL Service
```bash
# 1. Create database user & database
psql -U postgres -c "CREATE USER itsm_user WITH PASSWORD 'itsm_password';"
psql -U postgres -c "CREATE DATABASE itsm_db OWNER itsm_user;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE itsm_db TO itsm_user;"

# 2. Restore 1,079 incidents & knowledge articles
psql -U itsm_user -d itsm_db -f "itsm_db_dump.sql"
```

#### Option B: Docker Compose PostgreSQL
```bash
docker-compose up -d postgres
docker exec -i itsm-postgres psql -U itsm_user -d itsm_db < itsm_db_dump.sql
```

### Step 4: Install Workspace Dependencies

```bash
# 1. Install root Node.js dependencies
npm install

# 2. Install Control Tower Dashboard dependencies
cd "Resolver Agent/agent-approval-dashboard" && npm install && cd ../..

# 3. Install Python dependencies for Resolver Agent Daemon
cd "Resolver Agent" && pip install -r requirements.txt && cd ..
```

### Step 5: Build Backend & MCP Server

```bash
# Build NestJS Backend API
npm run build:backend

# Build ITSM MCP Server
npm run build:mcp
```

---

## 🚀 Running the Application Stack

### Option A: Development Mode (Native Process Management)

Launch services in the following order:

1. **Start PostgreSQL Database** (`port 5432`):
   Ensure PostgreSQL server is active and port 5432 is open.

2. **Start NestJS Backend REST API Server** (`port 4000`):
   ```bash
   node apps/backend/dist/main.js
   ```

3. **Start Next.js Helpdesk Portal Frontend** (`port 3000`):
   ```bash
   npm run dev:frontend
   ```

4. **Start Agent Control Tower HITL Dashboard** (`port 5173`):
   ```bash
   cd "Resolver Agent/agent-approval-dashboard" && node server.js
   ```

5. **Start Python Auto-Resolver Agent Daemon**:
   ```bash
   cd "Resolver Agent" && python -u continuous_itsm_agent_daemon.py
   ```

6. **Start ITSM MCP Server** *(Optional)*:
   ```bash
   npm run start:mcp
   ```

---

### Option B: Production Docker Setup

To bring up infrastructure dependencies (PostgreSQL, Redis, RabbitMQ, MinIO) via Docker:

```bash
docker-compose up -d --build
```

---

## 🌐 Active Service URLs & Port Reference

| Service | Protocol | Host / Port | URL | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Next.js Helpdesk Portal** | HTTP | `localhost:3000` | [http://localhost:3000](http://localhost:3000) | Helpdesk console & ticket stream (1,079 incidents) |
| **Agent Control Tower Dashboard** | HTTP | `localhost:5173` | [http://localhost:5173](http://localhost:5173) | Real-time HITL approval cards & governance |
| **NestJS REST API Server** | HTTP | `localhost:4000` | [http://localhost:4000/api/v1](http://localhost:4000/api/v1) | Backend REST API & AI Router Service |
| **Swagger API Docs** | HTTP | `localhost:4000` | [http://localhost:4000/api/docs](http://localhost:4000/api/docs) | Interactive OpenAPI documentation |
| **PostgreSQL Database** | TCP | `localhost:5432` | `postgresql://localhost:5432/itsm_db` | Core relational data store |
| **Redis Cache / Queue** | TCP | `localhost:6379` | `redis://localhost:6379` | Fast caching & queue management |
| **RabbitMQ Dashboard** | HTTP | `localhost:15672` | [http://localhost:15672](http://localhost:15672) | AMQP Event Broker Management UI |

---

## 🧪 Verification & System Testing

### 1. Health Check Endpoint
Verify NestJS API server health:
```bash
curl http://localhost:4000/api/v1/health
```

### 2. Verify Pre-Seeded Incidents
```bash
curl http://localhost:4000/api/v1/incidents?limit=5
```

### 3. Test Proven Enterprise Use Cases

#### Test Case 1: Unprivileged User Creation Without Sudo (`KB0000037`)
```powershell
$inc = @{
    title = "Create standard user account testuser01 on WorkerNode1HL without sudo permissions"
    shortDescription = "Create user testuser01 without sudo"
    description = "Provision a standard Linux user testuser01 on WorkerNode1HL with default shell and home directory. No sudoers access required."
    category = "User Management"
    configurationItem = "WorkerNode1HL"
    priority = "P3"
    state = "IN_PROGRESS"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4000/api/v1/incidents" -Method POST -Body $inc -ContentType "application/json"
```

#### Test Case 2: IBM DB2 Database User Provisioning (`KB0000033`)
```powershell
$inc = @{
    title = "Create an IBM DB2 user dbuser01 on WorkerNode1HL container db2server"
    shortDescription = "Provision DB2 user dbuser01 with CloudBeaver UI access"
    description = "Create DB2 user dbuser01, configure password, grant DB2 CONNECT privileges, and verify CloudBeaver UI access."
    category = "Infrastructure > Database"
    configurationItem = "WorkerNode1HL"
    priority = "P2"
    state = "IN_PROGRESS"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4000/api/v1/incidents" -Method POST -Body $inc -ContentType "application/json"
```

---

## ❓ Troubleshooting & Frequently Asked Questions

### Q1: Database Connection Error (`ECONNREFUSED 127.0.0.1:5432`)
**Fix**: Ensure PostgreSQL is running and port 5432 is open. Verify credentials in `.env`:
```bash
psql -U itsm_user -d itsm_db -h 127.0.0.1 -p 5432
```

### Q2: Port Conflict (`Port 4000 or 5173 already in use`)
**Fix**: Terminate orphaned Node.js or Python processes holding port 4000 or 5173:
```powershell
# Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess | Stop-Process -Force
```
```bash
# Linux / macOS
lsof -ti:4000 | xargs kill -9
```

### Q3: Python Daemon Lock Error (`daemon.lock exists`)
**Fix**: If the Python daemon was terminated abruptly, remove the lock file manually:
```bash
rm "Resolver Agent/daemon.lock"
```

### Q4: Database Integrity Policy
> ⚠️ **IMPORTANT DIRECTIVE**: When building (`npm run build:backend`) or restarting services, **DO NOT RESET OR WIPE THE DATABASE**. Preserve all existing tables, schemas, and 1,079 incident records.

---

## 📁 Repository Structure

```
ITSM-Agentic/
├── apps/
│   ├── backend/                      # NestJS REST API Server (Port 4000)
│   │   ├── src/                      # Controllers, Services, Prisma Schemas
│   │   └── data/                     # Knowledge Articles Backup Data
│   └── frontend/                     # Next.js Helpdesk Portal & UI (Port 3000)
├── packages/
│   └── mcp-server/                   # ITSM Model Context Protocol (MCP) Server
├── Resolver Agent/
│   ├── agent-approval-dashboard/     # HITL Control Tower Dashboard (Port 5173)
│   ├── continuous_itsm_agent_daemon.py # Python Async Parallel Worker Daemon
│   ├── chroma_db/                    # Persistent Vector Database (4096-D Embeddings)
│   └── requirements.txt              # Python Agent Dependencies
├── docker-compose.yml                # Docker Infrastructure Services
├── itsm_db_dump.sql                  # Complete PostgreSQL Dump (1,079 Incidents)
├── data_dump.json                    # Structured JSON Data Dump
├── .env.example                      # Environment Variable Template
├── package.json                      # Workspace Root Config
└── README.md                         # Architecture & Technical Documentation
```

---

## 📄 License

Distributed under the **MIT License**. Standard enterprise ITSM automation system.
