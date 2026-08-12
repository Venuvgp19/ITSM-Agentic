# 🚀 Enterprise Autonomous ITSM Platform & Multi-Agent AI Resolver System

An enterprise-grade, autonomous **IT Service Management (ITSM) Platform** powered by a **Multi-Agent Artificial Intelligence Engine** and **NVIDIA NIM LLMs**. 

The system automates helpdesk operations by autonomously triaging incoming IT tickets, executing Dense Vector RAG (ChromaDB 4096-D NV-Embed-v1 embeddings with **Dual-Vector Query Normalization Fusion**, **Action Direction Safety Guards**, and **Generic Intent Pattern Boosters**), running remote SSH remediation scripts on target infrastructure using **Async Parallel Worker Pools**, parameterizing generic Master SOP runbooks, synthesizing new Master SOPs on RAG misses, and enforcing Human-in-the-Loop (HITL) governance through a redesigned **Agent Control Tower Dashboard** with live execution abort controls.

---

## 📋 Table of Contents
1. [Project Overview & Key Capabilities](#-project-overview--key-capabilities)
2. [Generic Master SOP & Parameterization Architecture](#-generic-master-sop--parameterization-architecture)
3. [NVIDIA NIM & AI Model Suite](#-nvidia-nim--ai-model-suite)
4. [System Requirements & Prerequisites](#-system-requirements--prerequisites)
5. [Architecture & Data Flow Diagram](#-architecture--data-flow-diagram)
6. [Database & Vector Store Dump Restoration](#-database--vector-store-dump-restoration)
7. [Step-by-Step Installation & Application Startup Sequence](#-step-by-step-installation--application-startup-sequence)
8. [Active Service URLs & Port Reference](#-active-service-urls--port-reference)
9. [Verification & System Testing](#-verification--system-testing)
10. [Repository Structure](#-repository-structure)
11. [License](#-license)

---

## 🌟 Project Overview & Key Capabilities

- **Automated Incident Triage & AI Routing**: AI Router Service continuously scans new helpdesk tickets, evaluates priority (P1 Critical to P4 Low), predicts operational assignment groups with high confidence (≥ 85%), and assigns tickets for automated resolution.
- **Dense Vector RAG Engine**: Persistent ChromaDB vector store powered by 4096-dimensional `nvidia/nv-embed-v1` passage embeddings with Dual-Vector Query Normalization (HyDE - Hypothetical Document Embeddings) to map noisy ticket descriptions to standardized Master SOPs.
- **Action Direction & Quantity Safety Filter Guards**: Intelligently prevents Action Mismatches (e.g. Credential Retrieval tickets matching User Creation SOPs, or User Deletion tickets matching User Creation SOPs) and Quantity Mismatches (single-user requests matching bulk 20-user SOPs).
- **System-Wide Generic Intent Pattern Booster**: Boosts core IT domain intents (User Provisioning, User Deprovisioning, Cloud CLI/Azure CLI Installation, Python Virtual Environments, Kubernetes/ArgoCD, Jenkins Credentials, IBM DB2, System Performance) to direct RAG hits (Score `0.8800`), eliminating duplicate SOP generation across the platform.
- **Dynamic SOP Parameterization Engine**: Parameterizes generic Master SOP placeholders (`{venv_name}`, `{packages}`, `{username}`, `{password}`, `{target_ns}`) on the fly based on incoming ticket requirements.
- **Intent-Driven Read-Only Diagnosis Probe & Self-Learning SOP Generator**: On RAG misses, the daemon probes target infrastructure (`cat /etc/os-release`, package managers `apt`/`yum`, binary presence `which az`), captures diagnostic telemetry, and synthesizes generic, parameterizable Master SOPs.
- **Redesigned Agent Control Tower Dashboard**: Real-time React/Vite HITL dashboard featuring 4 Categorized Command Suites (**Operations & Governance**, **Analysis Agents**, **Intelligence & Vector**, **Engine Config**) and live **Stop Execution Cycle** abort controls for active SSH cycles.
- **Dynamic SSH ReAct Execution Pool**: Executes shell payloads concurrently across target nodes (`ControlPlane`, `WorkerNode1HL`), captures execution proofs, and verifies service health via physical HTTP & TCP port probes.

---

## 🌐 Generic Master SOP & Parameterization Architecture

Instead of synthesizing duplicate KB articles for every slight variation in user input (e.g. creating venv `snappy` vs `codex`), the platform utilizes **Generic Master SOPs** paired with an **LLM Parameterization Engine**:

| IT Domain | Generic Master SOP | Parameter Placeholders | Intent Keywords |
| :--- | :--- | :--- | :--- |
| **DevOps Tooling & Cloud CLI** | **`KB0000045`**: *Master SOP: Azure CLI Installation and Verification on Linux Control Plane Node* | `{ci_name}`, `{os_type}` | `"install az cli"`, `"az command not found"`, `"azure cli"`, `"which az"` |
| **Python Virtual Environments** | **`KB0000019`**: *Master SOP: Create Python Virtual Environment and Install Required Packages* | `{venv_name}`, `{packages}` | `"python virtual environment"`, `"python venv"`, `"virtualenv"`, `"pip install"` |
| **User Account Creation** | **`KB0000028`**: *Master SOP: Linux User Account Provisioning & Sudo Access Runbook* | `{username}`, `{password}`, `{group}` | `"create user"`, `"useradd"`, `"provision user"`, `"pamsudo"` |
| **User Account Deprovisioning** | **`KB0000038`**: *Master SOP: Bulk & Single Linux User Account Deprovisioning & Deletion* | `{username_list}`, `{username}` | `"delete user"`, `"userdel"`, `"remove user"`, `"offboard user"` |
| **IBM DB2 Management** | **`KB0000033`**: *Master SOP: IBM DB2 User Provisioning, Access Levels & CloudBeaver UI Access* | `{db2_user}`, `{access_level}` | `"db2 user"`, `"ibm db2"`, `"cloudbeaver"`, `"beaver ui"` |
| **Kubernetes & ArgoCD** | **`KB0000039`**: *Master SOP: Kubernetes & ArgoCD Service Health Restoration* | `{target_ns}`, `{deployment_name}` | `"argocd"`, `"kubernetes cluster"`, `"kubectl get pods"`, `"rollout restart"` |
| **Jenkins & Secrets** | **`KB0000041`**: *Master SOP: Jenkins Credential Retrieval & Service Verification* | `{service_name}`, `{secret_path}` | `"jenkins credentials"`, `"initialadminpassword"`, `"retrieve credentials"` |
| **System Performance** | **`KB0468210`**: *Master SOP: System Performance & Resource Utilization Runbook* | `{ci_name}`, `{threshold_type}` | `"cpu 100"`, `"memory 100"`, `"high cpu utilization"`, `"high memory"` |

---

## 🤖 NVIDIA NIM & AI Model Suite

The platform defaults to high-speed, zero-timeout NVIDIA NIM models via `https://integrate.api.nvidia.com/v1`:

| Agent Role | Active Model | Provider Endpoint | Latency / Throughput |
| :--- | :--- | :--- | :--- |
| **AI Ticket Router** | `meta/llama-3.3-70b-instruct` | NVIDIA NIM (`integrate.api.nvidia.com`) | Subsecond (<1.2s) |
| **SOP Resolver Agent** | `meta/llama-3.3-70b-instruct` | NVIDIA NIM (`integrate.api.nvidia.com`) | Subsecond (<1.5s) |
| **SOP Synthesizer Agent** | `meta/llama-3.3-70b-instruct` | NVIDIA NIM (`integrate.api.nvidia.com`) | Fast (<2.0s) |
| **Dense Vector RAG Embeddings** | `nvidia/nv-embed-v1` | NVIDIA NIM (`integrate.api.nvidia.com`) | 4096-Dimensional Embeddings |

*Fallback Models*: `nvidia/llama-3.1-nemotron-70b-instruct`, `nvidia/nemotron-3-ultra-550b-a55b`, `azure_ai/genailab-maas-Llama-3.3-70B-Instruct`, `genailab-maas-gpt-4o`.


---

## ⚙️ System Requirements & Prerequisites

### Hardware Specs
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
| **Docker & Docker Compose** | `>= 24.0.0` | Container runtime for infrastructure services |
| **Git** | `>= 2.30.0` | Version Control System |

---

## 🏛️ Architecture & Data Flow Diagram

```mermaid
flowchart TD
    START(["1. New Incident Ticket Created<br/>State = NEW, Dept = UNASSIGNED"])

    subgraph FE["Frontend & API Layer"]
        UI["Helpdesk Portal (Next.js :3000)"]
        API["NestJS REST API Server (:4000)"]
        DB[(PostgreSQL 15 Database :5432<br/>934 Pre-Seeded Incidents)]
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

    subgraph DAEMON["Phase 2: Auto-Resolver Daemon & Intent Booster"]
        P1["Poll IN_PROGRESS Tickets every 15s"]
        P2["Async Parallel Worker Pool (ThreadPoolExecutor)"]
        P3["SSH OS Fingerprint Probe (uname -s)"]
        P4["System-wide Generic Intent Booster & Vector RAG"]
        P5{"Similarity Score ≥ 0.65?"}

        R4 --> P1 --> P2 --> P3 --> P4 --> P5
    end

    subgraph RAGHIT["Phase 3A: Master SOP Match & Parameterization"]
        H1["Retrieve Generic Master SOP (e.g. KB0000019 / KB0000028)"]
        H2["LLM Parameterizer<br/>Inject {venv_name}, {packages}, {username}"]
        H3["Direct Remote SSH Execution Path"]

        P5 -->|"RAG Hit (≥ 0.65)"| H1 --> H2 --> H3
    end

    subgraph RAGMISS["Phase 3B: RAG Miss & Live Read-Only Diagnosis Probe"]
        M1["Execute Read-Only SSH Diagnostic Probe<br/>uname, os-release, ss -tulpn, ps aux"]
        M2["Invoke Nemotron LLM Knowledge Synthesizer"]
        M3["Submit PENDING Approval Card to Control Tower"]
        M4["Set Ticket State = ON_HOLD"]

        P5 -->|"RAG Miss (< 0.65)"| M1 --> M2 --> M3 --> M4
    end

    subgraph HITL["Phase 4: Agent Control Tower HITL Governance (:5173)"]
        G1["Human Operator Inspects Approval Card"]
        G2{"Operator Decision?"}
        G3["Click APPROVE<br/>Consume Approval & Reindex Vector Store"]
        G4["Click REJECT<br/>Set Approval = REJECTED & Lock Ticket"]

        M3 --> G1 --> G2
        G2 -->|"Approved"| G3
        G2 -->|"Rejected"| G4
    end

    subgraph EXEC["Phase 5: Dynamic SSH ReAct Execution & Verification"]
        S1["Paramiko SSH Client connects to Host (ControlPlane / WorkerNode1HL)"]
        S2["Execute Parameterized Shell Payloads Line-by-Line"]
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

## 💾 Database & Vector Store Dump Restoration

The repository contains a pre-seeded native PostgreSQL database dump (`database_dump.sql`) and complete ChromaDB vector database files so anyone cloning the repository can immediately run from the exact same state:

- **[`database_dump.sql`](file:///C:/Users/praka/OneDrive/Desktop/ITSM-Agentic/database_dump.sql)**: Native PostgreSQL SQL Dump (~4 MB) containing **947 Incidents**, **42 Master SOP Knowledge Articles**, **90 Agent Approvals**, **306 Execution Audit Logs**, and **50 Problems**.
- **[`Resolver Agent/chroma_db`](file:///C:/Users/praka/OneDrive/Desktop/ITSM-Agentic/Resolver%20Agent/chroma_db)**: Persistent ChromaDB HNSW vector index files (`chroma.sqlite3`, `data_level0.bin`, `header.bin`, `length.bin`, `link_lists.bin`) for all 42 Master SOPs.

### To Restore on a New Machine:

1. **Ensure PostgreSQL Database `itsm_db` Exists**:
   ```sql
   CREATE DATABASE itsm_db;
   ```

2. **Restore Database from `database_dump.sql`**:
   ```bash
   psql -U postgres -d itsm_db -f database_dump.sql
   ```

---

## 🚀 Step-by-Step Installation & Application Startup Sequence

Whenever launching or restarting the application stack, execute the following strict sequence:

1. **Start PostgreSQL Database** (`port 5432`):
   ```powershell
   & "$env:USERPROFILE\pgsql\pgsql\bin\postgres.exe" -D "$env:USERPROFILE\pgsql\pgsql\data"
   ```
2. **Rebuild NestJS Backend**:
   ```bash
   npm run build:backend
   ```
3. **Build MCP Server**:
   ```bash
   npm run build:mcp
   ```
4. **Start NestJS Backend REST API Server** (`port 4000`):
   ```bash
   node apps/backend/dist/main.js
   ```
5. **Start Next.js Frontend Dev Server** (`port 3000`):
   ```bash
   npm run dev:frontend
   ```
6. **Start Agent Control Tower HITL Dashboard** (`port 5173`):
   ```bash
   cd "Resolver Agent/agent-approval-dashboard" && node server.js
   ```
7. **Start Python Auto-Resolver Agent Daemon**:
   ```bash
   cd "Resolver Agent" && python -u continuous_itsm_agent_daemon.py
   ```
8. **Start ITSM MCP Server**:
   ```bash
   npm run start:mcp
   ```

---

## 🌐 Active Service URLs & Port Reference

| Service | Protocol | Host / Port | URL | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Next.js Helpdesk Portal** | HTTP | `localhost:3000` | [http://localhost:3000](http://localhost:3000) | Helpdesk console & ticket stream (947 incidents) |
| **Agent Control Tower Dashboard** | HTTP | `localhost:5173` | [http://localhost:5173](http://localhost:5173) | Real-time HITL approvals & 4 Categorized Command Suites |
| **NestJS REST API Server** | HTTP | `localhost:4000` | [http://localhost:4000/api/v1](http://localhost:4000/api/v1) | Backend REST API & continuous AI Router Service |
| **Swagger API Docs** | HTTP | `localhost:4000` | [http://localhost:4000/api/docs](http://localhost:4000/api/docs) | Interactive OpenAPI documentation |
| **PostgreSQL Database** | TCP | `localhost:5432` | `postgresql://localhost:5432/itsm_db` | Core relational data store |
| **ChromaDB Vector Database** | Local / SQLite | Persistent Directory | `Resolver Agent/chroma_db` | Dense 4096-D NV-Embed-v1 Vector Store |

---

## 🧪 Verification & System Testing

### 1. Health Check Endpoint
```bash
curl http://localhost:4000/api/v1/health
```

### 2. Test Azure CLI SOP Match & Parameterization (`KB0000045`)
```powershell
$inc = @{
    title = "install az cli on WorkerNode1HL node"
    shortDescription = "install az cli on WorkerNode1HL node"
    description = "Azure CLI tool is missing on WorkerNode1HL host. Please install and verify az command."
    category = "DevOps Tooling & Cloud CLI"
    configurationItem = "WorkerNode1HL"
    priority = "P3"
    state = "IN_PROGRESS"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4000/api/v1/incidents" -Method POST -Body $inc -ContentType "application/json"
```

---

## 📁 Repository Structure

```
ITSM-Agentic/
├── apps/
│   ├── backend/                      # NestJS REST API Server (Port 4000)
│   └── frontend/                     # Next.js Helpdesk Portal & UI (Port 3000)
├── packages/
│   └── mcp-server/                   # ITSM Model Context Protocol (MCP) Server
├── Resolver Agent/
│   ├── agent-approval-dashboard/     # Redesigned HITL Control Tower Dashboard (Port 5173)
│   ├── continuous_itsm_agent_daemon.py # Python Async Parallel Worker Daemon
│   ├── chroma_db/                    # Persistent Vector Database (4096-D NV-Embed-v1)
│   └── requirements.txt              # Python Agent Dependencies
├── database_dump.sql                 # Complete PostgreSQL Clean SQL Dump (947 Incidents, 42 KBs)
├── .env.example                      # Environment Variable Template
├── package.json                      # Workspace Root Config
└── README.md                         # Architecture & Technical Documentation
```

---

## 📄 License

Distributed under the **MIT License**. Standard enterprise ITSM automation system.

