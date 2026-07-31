# 🚀 Enterprise ITSM Platform & Autonomous Multi-Agent Resolver System

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://mit-license.org)
[![Node.js Version](https://img.shields.io/badge/Node.js-v22.x-green.svg)](https://nodejs.org)
[![Python Version](https://img.shields.io/badge/Python-v3.10+-blue.svg)](https://python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v15.0+-blue.svg)](https://postgresql.org)
[![Architecture](https://img.shields.io/badge/Architecture-Autonomous--Multi--Agent-purple.svg)](#-autonomous-4-agent-pipeline)

An end-to-end, enterprise-grade **IT Service Management (ITSM) Platform** equipped with an **Autonomous Multi-Agent AI Engine** capable of automated ticket routing, non-interactive SSH remote remediation, live host health verification, master SOP synthesis, state machine loop protection, and strict Human-in-the-Loop (HITL) governance.

---

## 📐 Autonomous Agent Pipeline & Governance Architecture

```mermaid
flowchart TD
    A[🎫 Incoming Incident / Alert] --> B[🚦 Router Agent]
    B -->|Predict Dept, Urgency & CI| C[📥 Set State: IN_PROGRESS]
    C --> D[🛠️ Resolver Agent Queue Scan]
    
    D --> E{Existing SOP in KB? similarity >= 0.75}
    E -->|RAG Hit| F[🔑 Connect Host 192.168.100.101 via SSH]
    E -->|RAG Miss| G[🧠 Knowledge Base Creator LLM Synthesizes SOP]
    
    G --> H[🛡️ HITL Approval Request: PENDING_APPROVAL]
    H -->|Human Approves in Control Tower| I[Mark APPROVED]
    H -->|Human Rejects| J[Mark ON_HOLD & Assign Specialist]
    
    I --> F
    F --> K[Execute Commands Sequentially on Target Host]
    K --> L[🏥 LLM Proof Verification Engine]
    
    L -->|Verified Healthy| M[🎉 Update Ticket: RESOLVED & Save SOP to KB]
    L -->|Verification Failed / SSH Timeout| N[⚠️ Update Ticket: ON_HOLD & Lock Session ID]
```

### 🤖 Core Agent Roles & Capabilities

| Agent Role | Engine / Framework | Primary Responsibilities |
| :--- | :--- | :--- |
| **1. 🚦 Router Agent** | NVIDIA Nemotron 3 550B / Llama 3.3 | Parses symptoms, predicts departments/CIs, sets SLA priority, and transitions status to `IN_PROGRESS`. |
| **2. 🛠️ Resolver Agent** | Paramiko SSH Engine + Python Daemon | Remote OS fingerprinting (`uname -s`), executing 100% non-interactive shell commands on target hosts (`192.168.100.101`), and live health verification. |
| **3. 🧠 Knowledge Synthesizer** | NVIDIA Nemotron 3 550B / DeepSeek | Deep root-cause analysis, synthesizing custom SOPs on RAG misses, and auto-persisting verified runbooks into the Knowledge Base. |
| **4. 🛡️ HITL Control Tower** | Vite + React + NestJS Governance API | Evaluates command risk levels (`HIGH` vs `LOW/MEDIUM`), presents interactive sign-off cards for human operators, and enforces session locks. |

---

## 🛠️ Technology Stack & Requirements

### System Requirements
* **Operating System**: Windows 10/11, Linux (Ubuntu/RHEL), or macOS.
* **Node.js**: `v22.x` or later.
* **Python**: `v3.10` or later (with `requests`, `paramiko`, `pydantic`).
* **Database**: PostgreSQL `v15.0+` (Portable or system install) + SQLite fallback (`dev.db`).

---

## 💻 Seamless Environment Setup & Quickstart Guide

Follow this guide to set up and run the full stack seamlessly in any fresh environment.

### Step 1: Clone Repository & Install Dependencies

```bash
# Clone the repository
git clone https://github.com/Venuvgp19/ITSM-Agentic.git
cd ITSM-Agentic

# Install Node.js dependencies across workspace
npm install

# Install Python requirements for Auto-Resolver Agent
cd "Resolver Agent"
pip install -r requirements.txt
cd ..
```

---

### Step 2: PostgreSQL Database Setup

The platform uses PostgreSQL as the primary database with an automated fallback to master JSON snapshots (`apps/backend/data/database.json`).

#### Option A: Portable PostgreSQL (Windows - Recommended)
If using the portable PostgreSQL package:
```powershell
# Extract portable PostgreSQL to your user profile (e.g. C:\Users\<Username>\pgsql)
# Start PostgreSQL Database on port 5432
& "$env:USERPROFILE\pgsql\pgsql\bin\postgres.exe" -D "$env:USERPROFILE\pgsql\pgsql\data"
```

#### Option B: Standard System PostgreSQL / Docker
If using a system installation or Docker:
```bash
# Launch PostgreSQL via Docker
docker run --name postgres-itsm -p 5432:5432 -e POSTGRES_PASSWORD=postgres -d postgres:15

# Set DATABASE_URL in packages/db/.env
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/itsm_db?schema=public"
```

---

### Step 3: Complete Seamless Startup Sequence

To bring all 8 platform services online cleanly, execute the following commands in sequence:

#### 1. Rebuild NestJS Backend & Database Service
```bash
npm run build:backend
```

#### 2. Build ITSM MCP Server
```bash
npm run build:mcp
```

#### 3. Start NestJS Backend API Server (Port 4000)
```bash
node apps/backend/dist/main.js
```
> **Backend API URL**: `http://localhost:4000/api/v1`  
> **OpenAPI Docs**: `http://localhost:4000/api/docs`

#### 4. Start Next.js Frontend Portal (Port 3000)
```bash
npm run dev:frontend
```
> **Frontend Portal URL**: `http://localhost:3000`

#### 5. Start Agent Control Tower Governance Dashboard (Port 5173)
```bash
cd "Resolver Agent/agent-approval-dashboard"
node server.js
```
> **Control Tower URL**: `http://localhost:5173`

#### 6. Start Autonomous Auto-Resolver Daemon
```bash
cd "Resolver Agent"
$env:PYTHONUTF8=1; $env:PYTHONIOENCODING="utf-8"; python -u continuous_itsm_agent_daemon.py
```

#### 7. Start ITSM MCP Server
```bash
npm run start:mcp
```

---

## 🌐 Port Mapping & Service Directory

| Service Name | Port | Access URL | Description |
| :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | `5432` | `localhost:5432` | Primary database storing 1,000 incidents, KB articles, and governance logs. |
| **ITSM Frontend Portal** | `3000` | `http://localhost:3000` | User portal for Incident, Problem, Change, and CMDB management. |
| **NestJS Backend API** | `4000` | `http://localhost:4000/api/v1` | Core REST API, SingleDatabase master service & Swagger documentation. |
| **Control Tower Dashboard** | `5173` | `http://localhost:5173` | Human-in-the-Loop (HITL) approval queue, history audit stream & vector map. |
| **ITSM MCP Server** | StdIO | Model Context Protocol | Model Context Protocol server exposing ITSM tools to AI assistants. |

---

## 🔒 Infinite Loop Protection & Safety Directives

* **State Machine Scoping**:
  * `NEW` → `IN_PROGRESS` → `PENDING_APPROVAL` → `APPROVED` → `RESOLVED` / `ON_HOLD`
* **Session Locking**:
  * Escalated or `ON_HOLD` incidents are automatically tagged with an in-memory session lock (`escalated_incident_ids`), preventing daemon re-polling loops when target SSH hosts are down.
* **Database Integrity Directive**:
  * Whenever the backend is built or restarted, existing database tables, schemas, and incident records are strictly preserved without running destructive table resets or seed wipes.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
