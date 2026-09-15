"""
Restores both databases from scripts/database/full_platform_data_dump.json
(produced by scripts/database/export_full_database_snapshot.py) on a fresh
machine.

Schema is owned by Prisma migrations now (packages/db/prisma/migrations/),
NOT by this script -- run `npx prisma migrate deploy` (from packages/db,
with DATABASE_URL set) before this. This script only truncates + reinserts
data into tables that migrations have already created.

At the end it also:
  - redistributes every Incident-linked timestamp onto the last 4 months
    ending right now (see redistribute_timestamps.py) -- the snapshot freezes
    absolute dates at export time, so without this every restore would look
    progressively staler the longer it's been since the snapshot was taken
  - re-derives KnowledgeArticle.capabilityTags via tag_kb_capabilities.py's
    inference (idempotent, always regenerated rather than trusted from the
    snapshot)
  - rebuilds the ChromaDB vector index from the just-restored KnowledgeArticle
    rows, so the vector index can never drift from what's actually in
    itsm_db (see services/sre-agent-daemon/daemon/rag/vector_db.py)

AgentConfig.apiKey and sre_configs.config_data.apiKey are stripped from the
snapshot (it's committed to git) and re-injected here from the GENAI_API_KEY
env var.

Run: python scripts/database/restore_all_data.py
"""
import json
import os
import subprocess
import sys
import psycopg2

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
dump_file = os.path.join(repo_root, "scripts", "database", "full_platform_data_dump.json")
GENAI_API_KEY = os.getenv("GENAI_API_KEY", "")

if not os.path.exists(dump_file):
    print(f"Dump file not found at: {dump_file}")
    sys.exit(1)

print("=========================================================")
print("MULTI-DATABASE RESTORATION (itsm_db & agentic_sre_db)")
print("=========================================================")
print("NOTE: this only restores data. Run `npx prisma migrate deploy` from")
print("packages/db (with DATABASE_URL set) first to build the schema.")

with open(dump_file, "r", encoding="utf-8") as f:
    dump_data = json.load(f)

# --- itsm_db -------------------------------------------------------------
itsm_data = dump_data.get("itsm_db", {})
conn_itsm = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/itsm_db")
cur_itsm = conn_itsm.cursor()

print("\n--- Restoring itsm_db ---")
cur_itsm.execute(
    'TRUNCATE TABLE "AgentApproval", "AgentHistory", "AgentConfig", "KnowledgeArticle", '
    '"Problem", "Incident", "ConfigurationItem", "Tenant" CASCADE;'
)

for t in itsm_data.get("Tenant", []):
    cur_itsm.execute(
        """
        INSERT INTO "Tenant" (id, name, domain, "isActive", "createdAt", "updatedAt")
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (t.get("id"), t.get("name"), t.get("domain"), t.get("isActive", True), t.get("createdAt"), t.get("updatedAt")),
    )
print(f"  Tenant: {len(itsm_data.get('Tenant', []))}")

for c in itsm_data.get("ConfigurationItem", []):
    cur_itsm.execute(
        """
        INSERT INTO "ConfigurationItem" (
            id, "tenantId", name, "ciClass", status, "serialNumber", "ipAddress",
            "macAddress", location, environment, "attributesJson", "createdAt", "updatedAt"
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            c.get("id"), c.get("tenantId", "tenant_acme_01"), c.get("name"), c.get("ciClass"),
            c.get("status", "OPERATIONAL"), c.get("serialNumber"), c.get("ipAddress"), c.get("macAddress"),
            c.get("location"), c.get("environment"),
            json.dumps(c.get("attributesJson")) if isinstance(c.get("attributesJson"), (list, dict)) else c.get("attributesJson"),
            c.get("createdAt"), c.get("updatedAt"),
        ),
    )
print(f"  ConfigurationItem: {len(itsm_data.get('ConfigurationItem', []))}")

for kb in itsm_data.get("KnowledgeArticle", []):
    cur_itsm.execute(
        """
        INSERT INTO "KnowledgeArticle" (
            id, "tenantId", number, title, content, category, "authorId", "configurationItem",
            summary, symptoms, "rootCause", "resolutionSteps", "capabilityTags", "workNotesAnalyzedCount",
            "sourceIncidentIds", author, "modelUsed", "helpfulCount", "viewsCount", rating,
            "isPublished", version, "createdAt", "updatedAt"
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            kb.get("id"), kb.get("tenantId", "tenant_acme_01"), kb.get("number"), kb.get("title"),
            kb.get("content"), kb.get("category"), kb.get("authorId"), kb.get("configurationItem"), kb.get("summary"),
            json.dumps(kb.get("symptoms")) if isinstance(kb.get("symptoms"), (list, dict)) else kb.get("symptoms"),
            kb.get("rootCause"),
            json.dumps(kb.get("resolutionSteps")) if isinstance(kb.get("resolutionSteps"), (list, dict)) else kb.get("resolutionSteps"),
            json.dumps(kb.get("capabilityTags")) if isinstance(kb.get("capabilityTags"), (list, dict)) else kb.get("capabilityTags"),
            kb.get("workNotesAnalyzedCount"),
            json.dumps(kb.get("sourceIncidentIds")) if isinstance(kb.get("sourceIncidentIds"), (list, dict)) else kb.get("sourceIncidentIds"),
            kb.get("author"), kb.get("modelUsed"), kb.get("helpfulCount", 0), kb.get("viewsCount", 0), kb.get("rating", 5.0),
            kb.get("isPublished", True), kb.get("version", 1), kb.get("createdAt"), kb.get("updatedAt"),
        ),
    )
print(f"  KnowledgeArticle: {len(itsm_data.get('KnowledgeArticle', []))}")

for p in itsm_data.get("Problem", []):
    cur_itsm.execute(
        """
        INSERT INTO "Problem" (
            id, "tenantId", number, "shortDescription", description, "rootCause", workaround,
            "knownError", state, priority, "configurationItemName", "assignedToName",
            "relatedIncidentsCount", "createdAt", "updatedAt"
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            p.get("id"), p.get("tenantId", "tenant_acme_01"), p.get("number"), p.get("shortDescription"),
            p.get("description"), p.get("rootCause"), p.get("workaround"), p.get("knownError", False),
            p.get("state"), p.get("priority"), p.get("configurationItemName"), p.get("assignedToName"),
            p.get("relatedIncidentsCount", 0), p.get("createdAt"), p.get("updatedAt"),
        ),
    )
print(f"  Problem: {len(itsm_data.get('Problem', []))}")

for inc in itsm_data.get("Incident", []):
    cur_itsm.execute(
        """
        INSERT INTO "Incident" (
            id, "tenantId", number, "shortDescription", description, state, impact, urgency, priority,
            "callerName", "assignedToName", "configurationItemName", department, "resolutionNotes",
            "resolutionCode", "resolvedAt", "closedAt", "createdAt", "updatedAt", "activitiesJson"
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        """,
        (
            inc.get("id"), inc.get("tenantId", "tenant_acme_01"), inc.get("number"), inc.get("shortDescription"),
            inc.get("description"), inc.get("state"), inc.get("impact"), inc.get("urgency"), inc.get("priority"),
            inc.get("callerName"), inc.get("assignedToName"), inc.get("configurationItemName"), inc.get("department"),
            inc.get("resolutionNotes"), inc.get("resolutionCode"), inc.get("resolvedAt"), inc.get("closedAt"),
            inc.get("createdAt"), inc.get("updatedAt"),
            json.dumps(inc.get("activitiesJson", [])) if isinstance(inc.get("activitiesJson"), (list, dict)) else inc.get("activitiesJson"),
        ),
    )
print(f"  Incident: {len(itsm_data.get('Incident', []))}")

for a in itsm_data.get("AgentConfig", []):
    cur_itsm.execute(
        """
        INSERT INTO "AgentConfig" (
            id, environment, "baseUrl", "apiKey", "routerModel", "resolverModel",
            "synthesizerModel", "governanceModel", "fallbackModels", "updatedAt"
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            a.get("id", "default"), a.get("environment"), a.get("baseUrl"), GENAI_API_KEY,
            a.get("routerModel"), a.get("resolverModel"), a.get("synthesizerModel"), a.get("governanceModel"),
            json.dumps(a.get("fallbackModels")) if isinstance(a.get("fallbackModels"), (list, dict)) else a.get("fallbackModels"),
            a.get("updatedAt"),
        ),
    )
print(f"  AgentConfig: {len(itsm_data.get('AgentConfig', []))} (apiKey injected from GENAI_API_KEY env var)")

for ap in itsm_data.get("AgentApproval", []):
    cur_itsm.execute(
        """
        INSERT INTO "AgentApproval" (
            id, type, "entityId", "entityType", summary, "proposedAction",
            "confidenceScore", status, timestamp, details
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            ap.get("id"), ap.get("type"), ap.get("entityId"), ap.get("entityType"), ap.get("summary"),
            ap.get("proposedAction"), ap.get("confidenceScore"), ap.get("status"), ap.get("timestamp"),
            json.dumps(ap.get("details")) if isinstance(ap.get("details"), (list, dict)) else ap.get("details"),
        ),
    )
print(f"  AgentApproval: {len(itsm_data.get('AgentApproval', []))}")

for ah in itsm_data.get("AgentHistory", []):
    cur_itsm.execute(
        """
        INSERT INTO "AgentHistory" (id, type, timestamp, "incidentId", title, description, metadata)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            ah.get("id"), ah.get("type"), ah.get("timestamp"), ah.get("incidentId"), ah.get("title"),
            ah.get("description"),
            json.dumps(ah.get("metadata")) if isinstance(ah.get("metadata"), (list, dict)) else ah.get("metadata"),
        ),
    )
print(f"  AgentHistory: {len(itsm_data.get('AgentHistory', []))}")

conn_itsm.commit()
cur_itsm.close()
conn_itsm.close()

# --- agentic_sre_db --------------------------------------------------------
sre_data = dump_data.get("agentic_sre_db", {})
conn_sre = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/agentic_sre_db")
cur_sre = conn_sre.cursor()

print("\n--- Restoring agentic_sre_db ---")
cur_sre.execute('TRUNCATE TABLE sre_approvals, sre_history, sre_timeline, sre_containment CASCADE;')

for h in sre_data.get("sre_history", []):
    cur_sre.execute(
        """
        INSERT INTO sre_history (
            id, approval_id, incident_id, incident_title, agent_id, agent_name, model, target_ci, department,
            risk_level, status, action_type, executed_at, duration_ms, human_approver, command_executed,
            execution_output, resolution_outcome, kb_generated, details
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            h.get("id"), h.get("approval_id"), h.get("incident_id"), h.get("incident_title"),
            h.get("agent_id"), h.get("agent_name"), h.get("model"), h.get("target_ci"), h.get("department"),
            h.get("risk_level"), h.get("status"), h.get("action_type"), h.get("executed_at"),
            h.get("duration_ms"), h.get("human_approver"), h.get("command_executed"),
            h.get("execution_output"), h.get("resolution_outcome"), h.get("kb_generated"),
            json.dumps(h.get("details")) if isinstance(h.get("details"), (list, dict)) else h.get("details"),
        ),
    )
print(f"  sre_history: {len(sre_data.get('sre_history', []))}")

for a in sre_data.get("sre_approvals", []):
    cur_sre.execute(
        """
        INSERT INTO sre_approvals (
            id, incident_id, incident_title, agent_id, agent_name, model, target_ci, department,
            risk_level, confidence_score, status, requested_at, summary, proposed_commands,
            kb_article_reference, kb_title, safety_checks, ai_reasoning, rejection_reason,
            approved_by, approved_at, details
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            a.get("id"), a.get("incident_id"), a.get("incident_title"), a.get("agent_id"),
            a.get("agent_name"), a.get("model"), a.get("target_ci"), a.get("department"),
            a.get("risk_level"), a.get("confidence_score"), a.get("status"), a.get("requested_at"),
            a.get("summary"), json.dumps(a.get("proposed_commands")) if isinstance(a.get("proposed_commands"), (list, dict)) else a.get("proposed_commands"),
            a.get("kb_article_reference"), a.get("kb_title"),
            json.dumps(a.get("safety_checks")) if isinstance(a.get("safety_checks"), (list, dict)) else a.get("safety_checks"),
            a.get("ai_reasoning"), a.get("rejection_reason"), a.get("approved_by"), a.get("approved_at"),
            json.dumps(a.get("details")) if isinstance(a.get("details"), (list, dict)) else a.get("details"),
        ),
    )
print(f"  sre_approvals: {len(sre_data.get('sre_approvals', []))}")

for t in sre_data.get("sre_timeline", []):
    cur_sre.execute(
        """
        INSERT INTO sre_timeline (id, incident_number, incident_title, target_ci, status, start_time, end_time, steps)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            t.get("id"), t.get("incident_number"), t.get("incident_title"), t.get("target_ci"),
            t.get("status"), t.get("start_time"), t.get("end_time"),
            json.dumps(t.get("steps")) if isinstance(t.get("steps"), (list, dict)) else t.get("steps"),
        ),
    )
print(f"  sre_timeline: {len(sre_data.get('sre_timeline', []))}")

for c in sre_data.get("sre_containment", []):
    cur_sre.execute(
        """
        INSERT INTO sre_containment (id, master_kill_switch, contained_cis)
        VALUES (%s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            master_kill_switch = EXCLUDED.master_kill_switch,
            contained_cis = EXCLUDED.contained_cis
        """,
        (c.get("id"), c.get("master_kill_switch", False), json.dumps(c.get("contained_cis", [])) if isinstance(c.get("contained_cis"), list) else c.get("contained_cis")),
    )
print(f"  sre_containment: {len(sre_data.get('sre_containment', []))}")

for cfg in sre_data.get("sre_configs", []):
    config_data = cfg.get("config_data") or {}
    if isinstance(config_data, dict):
        config_data = dict(config_data)
        config_data["apiKey"] = GENAI_API_KEY
    cur_sre.execute(
        """
        INSERT INTO sre_configs (id, config_data)
        VALUES (%s, %s)
        ON CONFLICT (id) DO UPDATE SET config_data = EXCLUDED.config_data
        """,
        (cfg.get("id"), json.dumps(config_data)),
    )
print(f"  sre_configs: {len(sre_data.get('sre_configs', []))} (apiKey injected from GENAI_API_KEY env var)")

conn_sre.commit()
cur_sre.close()
conn_sre.close()

# --- Redistribute timestamps to end at "now" --------------------------------
# The snapshot freezes absolute dates at export time; every restore re-anchors
# them onto the last 4 months ending right now, so the data never looks stale
# no matter how long ago the snapshot was captured. See redistribute_timestamps.py.
print("\n--- Redistributing incident timestamps to end at 'now' ---")
redistribute_script = os.path.join(repo_root, "scripts", "database", "redistribute_timestamps.py")
redistribute_result = subprocess.run([sys.executable, redistribute_script], cwd=repo_root, check=False)
if redistribute_result.returncode != 0:
    print(
        f"  WARNING: timestamp redistribution exited with code {redistribute_result.returncode} -- "
        f"incident dates are still the frozen snapshot-export dates, not the last 4 months."
    )

# --- Derived state: capability tags + vector index --------------------------
print("\n--- Re-deriving capability tags & vector index ---")
tag_script = os.path.join(repo_root, "scripts", "database", "tag_kb_capabilities.py")
subprocess.run(
    [sys.executable, tag_script],
    cwd=repo_root,
    env={**os.environ, "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/itsm_db"},
    check=False,
)

daemon_dir = os.path.join(repo_root, "services", "sre-agent-daemon")
resync_code = (
    "from daemon.rag.vector_db import sync_vector_db_with_kb\n"
    "n = sync_vector_db_with_kb()\n"
    "print(f'Reindexed {n} KB article(s) into ChromaDB')\n"
)
subprocess.run([sys.executable, "-c", resync_code], cwd=daemon_dir, check=False)

print("\n=========================================================")
print("BOTH DATABASES RESTORED, TAGGED, AND VECTOR-INDEXED")
print("=========================================================")
