# 🚀 Enterprise Autonomous ITSM Platform & Agentic SRE Control Tower

An enterprise-grade, autonomous **IT Service Management (ITSM) Platform** powered by a **Multi-Agent Artificial Intelligence Engine** and **NVIDIA NIM LLMs** (`nvidia/nemotron-3-super-120b-a12b` primary, with `deepseek-ai/deepseek-v4-flash-0731` as fallback — the active model per role is configurable per-tenant via the Control Tower's Model Config page).

The platform automates enterprise helpdesk and Site Reliability Engineering operations end-to-end: autonomous ticket routing and classification grounded on historical precedents, Hybrid Dense & Lexical Vector RAG (ChromaDB 4096-D NV-Embed-v1 + BM25Okapi), loop-aware command validation, remote persistent SSH remediation, autonomous in-guest terminal verification, self-learning SOP synthesis, and Human-in-the-Loop (HITL) governance through the **Agent Control Tower Dashboard**.

---

## 📋 Table of Contents
1. [Key Features & Platform Capabilities](#-key-features--platform-capabilities)
2. [Default Operator Credentials](#-default-operator-credentials)
3. [System Architecture](#-system-architecture)
4. [Active Service URLs & Port Reference](#-active-service-urls--port-reference)
5. [Quick Start & New Machine Setup](#-quick-start--new-machine-setup)
6. [Step-by-Step Installation & Application Startup Directives](#-step-by-step-installation--application-startup-directives)
7. [Slack Integration (Optional)](#-slack-integration-optional)
8. [ServiceNow Integration (Optional)](#-servicenow-integration-optional)
9. [Production Hosting & Daemon Management](#-production-hosting--daemon-management)
10. [Presentations & Product Pitch Decks](#-presentations--product-pitch-decks)
11. [Database Architecture & Snapshot Management](#-database-architecture--snapshot-management)
12. [Safety, Validation & Guardrails](#-safety-validation--guardrails)
13. [License](#-license)

---

## 🌟 Key Features & Platform Capabilities

- **Autonomous Incident Triage & Historical Precedent Grounding**: Sub-second search against 1,187+ past incidents and 218 SRE execution logs to inject few-shot precedent context into LLM triage prompts with >95% confidence.
- **Strict Architectural Decoupling**:
  - *Core ITSM Backend* (`:4000`): Pure enterprise system of record with PostgreSQL database (`itsm_db`).
  - *SRE Control Tower & Governance* (`:5173`): Dedicated autonomous AI control plane and database (`agentic_sre_db`) managing approvals, timelines, and execution audit history.
- **Draggable SRE Assistant with SSE Streaming**: Real-time token delivery, sub-second latency, and **12-Iteration Reasoning Checkpoints** that synthesize intermediate database findings and ask clarifying questions to avoid infinite loops.
- **Hybrid RAG Retrieval Engine**: Combines dense vector semantic search (4096-D `nvidia/nv-embed-v1` embeddings in ChromaDB) and BM25Okapi lexical retrieval using Reciprocal Rank Fusion (RRF) and an LLM RAG Judge.
- **Generic Master SOP & Dynamic Parameterization**: 44 reusable parameterized SOP blueprints for Linux, Kubernetes, ArgoCD, IBM DB2, Jenkins secrets, Cloud CLIs, and Python environments.
- **Dynamic ReAct Execution Loops**:
  - *Read-Only Diagnostic Loop*: Live non-destructive telemetry gathering on target hosts before formulating a solution.
  - *Remediation Loop*: Dynamic SSH command execution guided by approved runbooks with per-turn tool calling and automated 10-second service stabilization pauses.
- **In-Guest Terminal Proof Verification**: Remediation is evaluated 100% directly from live SSH execution proof and stdout/stderr output (`ss -tulpn`, `systemctl status`), eliminating dependency on external host network probes.
- **Self-Learning Knowledge Base Synthesizer**: Automatically writes and persists newly discovered and verified SOPs to the knowledge base and indexes them in ChromaDB, with title/steps-similarity deduplication to merge near-duplicate SOPs instead of accumulating redundant articles.
- **Tiered Command Authorization**: Read-only diagnostic binaries (`ps`, `ss`, `journalctl`, etc.) are always available; state-changing binaries must appear in the matched SOP's own approved commands; catastrophic patterns (`rm -rf /`, `az group delete`, `kubectl delete`, mass deletions) are hard-blocked even with human authorization unless the exact command text was explicitly approved. When a live command needs a binary the SOP's own text didn't resolve to, the daemon stops and requests one HITL approval per incident rather than blocking outright or silently widening the allowlist.
- **AI Ops Cost Dashboard**: Per-LLM-call token usage and cost persisted to Postgres (not an in-memory estimate) — spend by day/model/incident, surfaced in its own Control Tower tab.
- **Decision Replay**: Every RAG candidate a matched/rejected SOP went through — score, margin, and judge reasoning — is posted to the incident timeline as an auditable trace, not just the final outcome.
- **RAG Regression Eval Harness** (`services/sre-agent-daemon/tests/eval_rag.py`): Tiered evaluation of the SOP-matching pipeline — Tier 1 (retrieval-only Recall@K/MRR against real historical incidents) and Tier 2 (full pipeline accuracy + *selection precision*, the fraction of autonomous commits that are actually correct — the metric that matters most for safety, since a wrong RAG-miss just costs a slower human-approval path while a wrong commit is a wrong autonomous action). Not a startup gate — run manually or in CI after touching retrieval/judge/synthesis code.
- **Emergency Containment & Kill Switch**: Immediate fleet-wide or per-CI shutdown toggle to instantly terminate active SSH sessions across target hosts.
- **Conversational Service Desk Intake Portal** (`apps/service-desk`, `:5050`): A standalone, single-purpose chat surface for end users to report a problem in plain language instead of filling out a ticket form. The assistant asks one clarifying question at a time, then files the ticket itself via the same `POST /api/v1/incidents` the synthetic generator and ServiceNow webhook use — so it inherits identical validation, numbering, and automatic AI-Router pickup. Deliberately its own process/port rather than a page inside the staff app: it's the one place in the platform where untrusted end-user text becomes a write instead of just a read.
- **Dual ITSM Backend Support (ServiceNow or Local)**: The daemon's `ITSM_PROVIDER` env var (`LOCAL_NESTJS` default or `SERVICENOW`) switches its entire data plane — incident queue, KB fetch, work notes, CI/CMDB lookups — between the built-in NestJS backend and a real ServiceNow instance's Table API, without touching orchestration logic. See [ServiceNow Integration](#-servicenow-integration-optional) below.
- **Live SRE Assistant RAG Tool**: The Control Tower chat assistant can now actually query the same Hybrid RAG pipeline the resolver uses (`daemon/rag/search_api.py`, an internal-only FastAPI-style service on `:8008`) instead of only answering from structured SQL lookups — so "what SOPs exist for X" gets a real retrieval-grounded answer.
- **Synthetic Incident Generator** (`workflows/n8n/itsm_periodic_incident_generator_workflow.json`): An n8n workflow that files realistic CPU/Memory/Nexacore-down incidents against `WorkerNode1HL` on a schedule, for demoing and load-testing the autonomous pipeline without needing real monitoring alerts wired up yet.

---

## 🔑 Default Operator Credentials

| Portal | URL | Username / User ID | Password | Role |
| :--- | :--- | :--- | :--- | :--- |
| **SRE Control Tower** | `http://localhost:5173` | **`Venu`** | **`admin007`** | Global SRE Lead |
| **Core Helpdesk Console** | `http://localhost:3000` | **`venu`** *(or `venu@example.com`)* | **`admin007`** | Platform Administrator |

---

## 🤖 System Architecture

```mermaid
flowchart TD
    subgraph SOURCES["Incident Entry Points"]
        SRC1["Service Desk Chat Portal (:5050)<br/>Conversational intake"]
        SRC2["Synthetic Generator (n8n, :5678)<br/>Demo/load-test alerts"]
        SRC3["ServiceNow Webhook / Table API"]
        SRC4["Manual Entry (Helpdesk Console :3000)"]
    end

    START(["1. Incident Ticket Created<br/>State = NEW, Group = UNASSIGNED"])
    SRC1 --> START
    SRC2 --> START
    SRC3 --> START
    SRC4 --> START

    subgraph FE["Core ITSM Platform (System of Record)"]
        UI["Helpdesk Console (Next.js :3000)"]
        API["NestJS REST API Server (:4000)"]
        DB[(PostgreSQL Database :5432<br/>Database: itsm_db)]
        UI -->|HTTP / REST| API
        API -->|Prisma ORM| DB
    end

    subgraph ROUTER["Phase 1: Agentic AI Router (Historical Precedent Grounding)"]
        R1["scanAndRouteUnassignedQueue()"]
        R2["Precedent Lookup (itsm_db + sre_history)"]
        R3["Priority & Department Classifier<br/>(NVIDIA Nemotron 3 Super 120B)"]
        R4{"Confidence ≥ 85%?"}
        R5["Assign Group & Set State = IN_PROGRESS"]
        R6["Leave UNASSIGNED for Manual Triage"]

        R1 --> R2 --> R3 --> R4
        R4 -->|"Yes"| R5 -->|Update DB| DB
        R4 -->|"No"| R6
    end

    subgraph DAEMON["Phase 2: SRE Resolver Agent Daemon (services/sre-agent-daemon)"]
        P1["Poll Queue (Every 15s)"]
        P2["Async Parallel Worker Pool (ThreadPoolExecutor)"]
        P3["SessionStateManager & Host Lock"]
        P4["Hybrid RAG Search (ChromaDB 4096-D + BM25Okapi)"]
        P5{"Similarity Score ≥ Threshold?"}

        R5 --> P1 --> P2 --> P3 --> P4 --> P5
    end

    subgraph RAGHIT["Phase 3A: Master SOP Match, LLM Judge & Parameterization"]
        H0["LLM RAG Judge<br/>Verifies candidate actually resolves this ticket's root cause"]
        H1["Retrieve Matched SOP Runbook"]
        H2["LLM Parameterizer<br/>Substitute {username}, {venv}, {target_ci}"]
        H3["Direct Remote SSH Execution Path"]

        P5 -->|"RAG Hit"| H0
        H0 -->|"Approved"| H1 --> H2 --> H3
        H0 -->|"Rejected"| P4
    end

    subgraph RAGMISS["Phase 3B: RAG Miss & Knowledge Synthesis"]
        M1["Read-Only Diagnostic ReAct Loop<br/>(systemctl, ps, ss, journalctl)"]
        M2["Invoke Nemotron SOP Synthesizer"]
        M3["Submit PENDING Approval Card to Control Tower"]
        M4["Set Ticket State = ON_HOLD"]

        P5 -->|"RAG Miss"| M1 --> M2 --> M3 --> M4
    end

    subgraph HITL["Phase 4: SRE Control Tower HITL Governance (:5173)"]
        SRE_DB[(PostgreSQL :5432<br/>Database: agentic_sre_db)]
        G1["Human Operator Inspects Approval Card"]
        G2{"Operator Action?"}
        G3["Click APPROVE<br/>Consume Approval & Authorize Execution"]
        G4["Click REJECT<br/>Set Approval = REJECTED & Lock Ticket"]

        M3 --> SRE_DB
        SRE_DB --> G1 --> G2
        G2 -->|"Approved"| G3
        G2 -->|"Rejected"| G4
    end

    subgraph EXEC["Phase 5: Dynamic SSH ReAct Execution & Terminal Verification"]
        S1["Persistent SSH Session (WorkerNode1HL / ControlPlane)"]
        S2["Dynamic ReAct Loop with 10s Service Stabilization Wait"]
        S3["Capture In-Guest Terminal stdout/stderr & Socket Proof"]
        S4{"In-Guest Terminal Proof Verified?"}
        S5["State = RESOLVED<br/>Persist Trace in Audit Log & Post Work Notes"]
        S6["State = ON_HOLD<br/>Escalate to Team Lead"]

        H3 --> S1
        G3 --> S1
        S1 --> S2 --> S3 --> S4
        S4 -->|"Yes"| S5 -->|Update Core DB| DB
        S4 -->|"Yes"| S5 -->|Log Trace| SRE_DB
        S4 -->|"No"| S6 -->|Update Core DB| DB
        G4 --> S6
    end
```

---

## ⚡ Active Service URLs & Port Reference

| Service | Port | Technology | URL | Description |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | `5432` | PostgreSQL 15+ | `localhost:5432` | Dual databases: `itsm_db` & `agentic_sre_db` |
| **ServiceNow Core UI** | `3000` | Next.js 14 | `http://localhost:3000` | Core Helpdesk & Ticket Lifecycle Portal |
| **ITSM Backend API** | `4000` | NestJS | `http://localhost:4000/api/docs` | System of Record REST API & Swagger Docs |
| **SRE Control Tower** | `5173` | React + Vite + Node | `http://localhost:5173` | HITL Governance, SSE Streaming & Assistant |
| **Service Desk Portal** | `5050` | Node + Express | `http://localhost:5050` | End-user conversational ticket intake |
| **RAG Search API** | `8008` | Python (internal-only) | `http://127.0.0.1:8008/rag/search` | Backs the Control Tower assistant's RAG tool; not internet/LAN-facing |
| **Python SRE Daemon** | Background | Python 3.10 | Daemon Process | Autonomous Auto-Resolver & Hybrid Vector RAG |
| **ITSM MCP Server** | Background | Node.js | STDIO / SSE | Model Context Protocol Tool Interface |
| **n8n (optional)** | `5678` | n8n | `http://localhost:5678` | Hosts the synthetic incident generator workflow |

---

## 🚀 Quick Start & New Machine Setup

To run this platform on a fresh machine right where you left off:

### Step 1: Clone Repository & Install Dependencies
```bash
git clone https://github.com/Venuvgp19/ITSM-Agentic.git
cd ITSM-Agentic

# Install Node dependencies
npm install
cd apps/sre-control-tower && npm install && cd ../..

# Install Python dependencies
pip install -r services/sre-agent-daemon/requirements.txt
```

### Step 2: Configure Environment Variables
Create or verify `.env` at the project root:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/itsm_db?schema=public"
SRE_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agentic_sre_db"
NVIDIA_API_KEY="your-nvapi-key-here"
GENAI_API_KEY="your-genai-lab-key-here"
JWT_SECRET="itsm_super_secret_jwt_key_2026"
PORT=4000
```

### Step 3: Build the Schema
Schema is owned by Prisma migrations (`packages/db/prisma/migrations/`), not by the restore script. Auto-creates `itsm_db`/`agentic_sre_db` if `npm run db:generate` hasn't already, then applies every migration in order:
```bash
cd packages/db && npx prisma migrate deploy && cd ../..
```

### Step 4: Restore Data
Populates both databases from `scripts/database/full_platform_data_dump.json` (1,193 incidents, 32 KBs, CMDB, agent config, SRE audit logs), then re-derives KB capability tags and rebuilds the ChromaDB vector index from the restored KB content — so nothing can drift out of sync with what just got loaded:
```bash
python scripts/database/restore_all_data.py
```

To refresh that snapshot from a live environment (e.g. after editing data directly), run `python scripts/database/export_full_database_snapshot.py` first — see [Database Architecture & Snapshot Management](#-database-architecture--snapshot-management).

### Step 5: Build Everything
```bash
npm run build:backend
npm run build:mcp
cd apps/sre-control-tower && npm run build && cd ../..
```
`apps/sre-control-tower`'s build produces its `dist/` folder — `server.js` serves the dashboard UI from there and returns 404s on `/` without it.

### Step 6: Start All Services
```bash
node apps/backend/dist/main.js &                  # :4000
npm run dev:frontend &                             # :3000
cd apps/sre-control-tower && node server.js &       # :5173
cd apps/service-desk && node server.js &            # :5050
cd services/sre-agent-daemon && rm -f daemon.lock && python -u continuous_itsm_agent_daemon.py &
npm run start:mcp                                   # stdio MCP tool server (foreground; spawned by an MCP client, not a standalone daemon)
```
See [Full Application Startup](#-full-application-startup-all-services) below for the platform-specific (PowerShell/Bash) version of this sequence, [Slack Integration](#-slack-integration-optional) to also wire up approval cards and the SRE chatbot in Slack, and [ServiceNow Integration](#-servicenow-integration-optional) to point the daemon at a real ServiceNow instance instead of the built-in backend.

### Restoring Later / Starting Fresh Again
Once already set up, wiping back to a known-good state (e.g. after test data pollution) only needs Steps 3–4 re-run — `prisma migrate deploy` is a no-op if the schema is already current, and `restore_all_data.py` truncates and reloads both databases plus derived state (capability tags, vector index) from the snapshot every time it runs. No need to redo install/build/`.env`.

---

## 🛠️ Step-by-Step Installation & Application Startup Directives

### 🟢 Full Application Startup (All Services)
Follow this exact sequence to start all 8 service layers:

#### Windows (PowerShell):
```powershell
# 1. Start Local PostgreSQL Database
& "$env:USERPROFILE\pgsql\pgsql\bin\postgres.exe" -D "$env:USERPROFILE\pgsql\pgsql\data"

# 2. Build Backend, MCP Server & Control Tower Dashboard
npm run build:backend
npm run build:mcp
cd apps/sre-control-tower; npm run build; cd ../..

# 3. Start NestJS Backend API Server (Port 4000)
node apps/backend/dist/main.js

# 4. Start Next.js Frontend Dev Server (Port 3000)
npm run dev:frontend

# 5. Start Agent Control Tower Dashboard (Port 5173)
cd apps/sre-control-tower
node server.js

# 6. Start the Service Desk Portal (Port 5050)
cd ../service-desk
node server.js

# 7. Start Python Auto-Resolver Agent Daemon (also starts the internal RAG Search API on :8008)
cd ../../services/sre-agent-daemon
Remove-Item "daemon.lock" -Force -ErrorAction SilentlyContinue
python -u continuous_itsm_agent_daemon.py

# 8. Start ITSM MCP Server
npm run start:mcp
```

#### Linux / macOS (Bash):
```bash
# 1. Start PostgreSQL
pg_ctl -D /usr/local/var/postgres start

# 2. Build Backend, MCP Server & Control Tower Dashboard
npm run build:backend
npm run build:mcp
cd apps/sre-control-tower && npm run build && cd ../..

# 3. Start Backend Server (Port 4000)
node apps/backend/dist/main.js &

# 4. Start Frontend (Port 3000)
npm run dev:frontend &

# 5. Start SRE Control Tower (Port 5173)
cd apps/sre-control-tower && node server.js &

# 6. Start the Service Desk Portal (Port 5050)
cd ../service-desk && node server.js &

# 7. Start Python SRE Daemon (also starts the internal RAG Search API on :8008)
cd ../../services/sre-agent-daemon
rm -f daemon.lock
python -u continuous_itsm_agent_daemon.py &

# 8. Start MCP Server
npm run start:mcp
```

---

### 🟡 ServiceNow Core ITSM Only (Helpdesk Mode)
Starts **ONLY** the core ITSM platform without autonomous SRE services:
```powershell
node apps/backend/dist/main.js
npm run dev:frontend
```

---

### 🔵 Agentic SRE Services Only (Control Tower Mode)
Starts the AI Governance Dashboard, Python Daemon, and MCP Server:
```powershell
node apps/sre-control-tower/server.js
python -u services/sre-agent-daemon/continuous_itsm_agent_daemon.py
npm run start:mcp
```

---

### 🛑 Full Platform Teardown Sequence
To cleanly stop all background services without corrupting state:
```powershell
# 1. Stop Python Auto-Resolver Daemon
# 2. Stop ITSM MCP Server
# 3. Stop Agent Control Tower (Port 5173)
# 4. Stop Next.js Frontend (Port 3000)
# 5. Stop NestJS Backend (Port 4000)
# 6. Stop PostgreSQL Database LAST (Port 5432)
```

---

## 💬 Slack Integration (Optional)

`services/slack-bridge` bridges the Agent Control Tower into Slack: it posts HITL approval cards with Approve/Reject buttons to a channel, and answers ITSM/SRE questions via the same read-only SRE Assistant the dashboard chat uses — via Socket Mode, so no public URL/tunnel is needed.

### Setup
1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps) → enable **Socket Mode** (generates an App-Level Token, scope `connections:write`) → add Bot Token Scopes `chat:write`, `app_mentions:read`, `im:history`, `im:read`, `im:write`, `users:read` → enable **Event Subscriptions** (`app_mention`, `message.im`) and **Interactivity & Shortcuts** → install to your workspace.
2. `cp services/slack-bridge/.env.example services/slack-bridge/.env` and fill in `SLACK_BOT_TOKEN` (`xoxb-...`), `SLACK_APP_TOKEN` (`xapp-...`), and `SLACK_APPROVALS_CHANNEL` (invite the bot to that channel first).
3. Install and start:
```bash
cd services/slack-bridge && npm install && node index.js
```
New pending approvals appear in the channel within `POLL_INTERVAL_MS` (default 15s); `@mention` the bot or DM it to ask questions and it streams its reply back token-by-token instead of a single blocking wait.

---

## 🔗 ServiceNow Integration (Optional)

The daemon can run against a real ServiceNow instance instead of (or alongside) the built-in NestJS backend. This is a full provider abstraction, not a one-off webhook — incident queue polling, KB article fetch, work-note posting, and CI/CMDB lookups all switch backends together via one env var.

### Daemon-side (Python)
Set in `services/sre-agent-daemon/.env`:
```env
ITSM_PROVIDER="SERVICENOW"          # or "LOCAL_NESTJS" (default)
SN_INSTANCE_URL="https://<your-instance>.service-now.com"
SN_USERNAME="your-sn-username"
SN_PASSWORD="your-sn-password"
```
All three `SN_*` values default to empty strings — the client fails closed (never silently talks to a placeholder instance) if `ITSM_PROVIDER=SERVICENOW` is set without real credentials. Under the hood (`daemon/itsm/servicenow_client.py`): paginated incident queue fetch via the Table API, automatic retry with backoff on 5xx/connection errors (not on 4xx), work-note de-duplication (ServiceNow's `sys_journal_field` is append-only, so a naive re-post would spam the same note every poll), and CMDB CI enrichment that only *augments* existing local `CI_CREDENTIALS` entries with live ServiceNow ip/os data rather than creating credential-less ones (ServiceNow's CMDB never has SSH credentials). New-SOP write-back to ServiceNow's `kb_knowledge` table is intentionally deferred — synthesized SOPs in `SERVICENOW` mode are logged, not persisted upstream, until that's explicitly wanted.

### Backend-side (NestJS) — inbound + Table API proxy
- `POST /servicenow/webhook`: real inbound integration — a ServiceNow business rule/outbound REST message posts here and it's persisted as a genuine incident via `IncidentService.create()` (not a stub), with the triggering comment logged as a correlated work note.
- `GET/PATCH/POST /api/v1/servicenow/{queue,incidents/:sysId,incidents/:sysId/work-notes,cmdb/:ciName}`: JWT-protected internal routes that proxy to ServiceNow's own Table API (`SN_INSTANCE_URL`/`SN_USERNAME`/`SN_PASSWORD` from the backend's own env), exposed to the MCP server as `servicenow_fetch_queue`, `servicenow_update_incident`, `servicenow_add_work_note`, and `servicenow_get_ci_details` tools.

---

## 🌐 Production Hosting & Daemon Management

For 24/7 production hosting, manage node servers and background daemons using **PM2**:

### Start with PM2 Ecosystem:
```bash
npm install -g pm2

# Start Backend API
pm2 start apps/backend/dist/main.js --name "itsm-backend"

# Start Frontend
pm2 start "npm run dev:frontend" --name "itsm-frontend"

# Start SRE Control Tower
pm2 start apps/sre-control-tower/server.js --name "sre-control-tower"

# Start Python SRE Auto-Resolver Daemon
pm2 start "python -u services/sre-agent-daemon/continuous_itsm_agent_daemon.py" --name "sre-agent-daemon"

# View status & logs
pm2 status
pm2 logs
```

---

## 🎬 Presentations & Product Pitch Decks

Two executive-grade presentations are included in the repository:

1. **Interactive 3D HTML Slide Presentation**:
   - **Path**: `docs/presentations/autonomous_itsm_presentation_3d.html`
   - **Features**: 14-slide narrative deck, Three.js 3D dynamic particle grid, glassmorphic obsidian styling, all 10 live authenticated screenshots with hover zoom, and interactive Chart.js MTTR comparison metrics.
   - **Open**: Double-click or open `docs/presentations/autonomous_itsm_presentation_3d.html` in any modern web browser. Use `←` / `→` / `Space` to navigate and `F` for fullscreen.

2. **Executive 16:9 Widescreen PowerPoint Pitch Deck**:
   - **Path**: `Autonomous_ITSM_Executive_Product_Pitch_Deck.pptx`
   - **Features**: Complete product pitch deck with high-resolution screenshot cards, architecture callouts, safety matrices, and ROI breakdown.

---

## 💾 Database Architecture & Snapshot Management

### 1. Dual-Database Design:
- **`itsm_db`** (Port 5432):
  - `Incident`, `Problem`, `KnowledgeArticle` (with `capabilityTags` for safety-rule dispatch), `ConfigurationItem` & `Tenant` (CMDB + multi-tenant schema), `AgentConfig` (active LLM provider/model settings), `AgentApproval` / `AgentHistory` (NestJS-side governance records).
  - Schema is owned by Prisma migrations (`packages/db/prisma/migrations/`) — apply with `npx prisma migrate deploy`, not `db push`.
- **`agentic_sre_db`** (Port 5432):
  - `sre_history`, `sre_approvals`, `sre_timeline`: execution audit log / HITL approvals / observability traces backing the live Control Tower dashboard.
  - `sre_containment`: Fleet containment states and Emergency Master Kill Switch toggle.
  - `sre_configs`: Autonomous agent governance settings (the dashboard chat assistant's LLM config).

Only tables with real data are covered by the snapshot pipeline below — see `scripts/database/export_full_database_snapshot.py` for the exact list. Add a table there (and to `restore_all_data.py`) once it's actually in use.

### 2. Exporting / Creating a New Fresh Snapshot:
To create a fresh export of both databases at any time (e.g. after editing data directly):
```bash
python scripts/database/export_full_database_snapshot.py
```
`AgentConfig.apiKey` and `sre_configs.config_data.apiKey` are stripped from the exported JSON before it's written — that file is committed to git. `restore_all_data.py` re-injects both from the `GENAI_API_KEY` env var at restore time.

### 3. Restoring & Derived State:
```bash
python scripts/database/restore_all_data.py
```
Truncates and reloads both databases from the snapshot, then automatically re-derives two things that must never be trusted from a stale snapshot: `KnowledgeArticle.capabilityTags` (regenerated via `scripts/database/tag_kb_capabilities.py`'s keyword inference) and the ChromaDB vector index (rebuilt from the just-restored `KnowledgeArticle` rows via `sync_vector_db_with_kb()` — the index is derived state, not tracked in git, so it can never drift out of sync with what's actually in the database).

### 4. Database Integrity Policy:
Whenever the backend is built (`npm run build:backend`), restarted, or compiled, **DO NOT ALTER OR RESET THE DATABASE**. Preserve all existing DB state, table schemas, and incident records without destructive seeds, resets, or table wipes. Schema *changes* go through a new Prisma migration (`npx prisma migrate dev --name <change>`), never a manual `ALTER TABLE` against the live database.

---

## 🛡️ Safety, Validation & Guardrails

1. **Pre-Execution Catastrophic Blacklist**: Deterministic AST parser blocking destructive commands (`rm -rf /`, `mkfs`, `dd if=`, `:(){ :|:& };:`, `fdisk`, `reboot`, `shutdown`, `az group delete`, `kubectl delete`, and more) before they reach any live host, recursing into pipelines, subshells, `find -exec`, `xargs`, and `ssh host "..."` payloads so a wrapper can't smuggle a blocked command past the scan. These stay hard-blocked even with human authorization unless the exact command text was what a human explicitly approved — binary-level trust alone is never sufficient for this class.
2. **Tiered Command Authorization**: Read-only diagnostic binaries (`ps`, `ss`, `journalctl`, `grep`, etc.) are always available; every state-changing binary (`systemctl`, `useradd`, `az`, `kubectl`, `rm`, ...) must appear in the matched SOP's own approved commands. If a live command legitimately needs a binary the SOP text didn't literally resolve to, the ReAct loop stops immediately (instead of letting the model spin through its remaining turns re-phrasing the same blocked binary) and the orchestrator requests one HITL approval for that incident/binary — RAG-matched-SOP relevance plus explicit human sign-off, not either alone.
3. **LLM RAG Judge**: Runs on every RAG candidate above the similarity threshold (not just low-confidence ones — a high hybrid score reflects corpus-relative ranking, not proof the SOP addresses this incident's actual root cause) and does a real semantic check before a match is ever trusted enough to parameterize and execute.
4. **Mandatory Domain-Aware Proof-of-Fix Guard**: Prevents false resolutions by requiring in-context terminal proof:
   - *User Deletion*: Confirms `id {username}` returns `no such user`.
   - *User Creation*: Confirms `id {username}` returns valid UID/GID and sudo permissions exist.
   - *Service Restarts*: Confirms target port/process is actively listening via `ss -tulpn`.
   - *Cloud Resource Provisioning/Teardown* (Azure resource groups, storage accounts, web apps): Re-derives the actual target resource name from the commands that ran (not from ticket text, which can be typo'd) and confirms its live existence/absence directly via CLI, independent of what the LLM's own narrative claimed happened.
5. **Autonomous Emergency Abort (Kill Switch)**:
   - Operators can instantly abort running executions via the Control Tower UI.
   - Daemon actively checks containment state and terminates execution in `< 1.5s`.
6. **Live Pre-Action Health Checks (Act-Before-Verify Guard)**: Keyword-matched SOPs don't get to assume the incident text is still true by the time the daemon executes. Before running any Nexacore "app down" SOP's restart/start commands, the daemon SSHes in and runs a real HTTP probe (`curl` against the reported port) first — if the app already responds, the ticket resolves directly from that live evidence and the service is never touched, instead of restarting something that's already healthy on every alert.
7. **Multi-Model Fallback Diversity**: The LLM model config's (Control Tower → Model Config page, backed by `AgentConfig`) shipped default assigns every agent role a genuinely different fallback chain instead of pinning router/resolver/synthesizer/governance *and* the entire fallback list to one single model — a real fallback chain to degrade to if the primary model times out, not the same model retried three times under a different name.

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
