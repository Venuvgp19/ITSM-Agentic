import psycopg2
from psycopg2.extras import execute_values
import json
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

repo_root = r"c:\Users\praka\OneDrive\Desktop\ITSM-Agentic"
dump_file = os.path.join(repo_root, "scripts", "database", "full_platform_data_dump.json")

if not os.path.exists(dump_file):
    print(f"❌ Dump file not found at: {dump_file}")
    sys.exit(1)

print("=========================================================")
print("📥 RESTORING FULL DATABASE DATA FROM SNAPSHOT")
print("=========================================================")

with open(dump_file, "r", encoding="utf-8") as f:
    dump_data = json.load(f)

# 1. Restore itsm_db
itsm_data = dump_data.get("itsm_db", {})
conn_itsm = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/itsm_db")
cur_itsm = conn_itsm.cursor()

# Restore Tenant first
for t in itsm_data.get("Tenant", []):
    cur_itsm.execute("""
        INSERT INTO "Tenant" (id, name, slug, domain, "createdAt", "updatedAt")
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING;
    """, (t.get("id"), t.get("name"), t.get("slug"), t.get("domain"), t.get("createdAt"), t.get("updatedAt")))

# Restore Knowledge Articles
for kb in itsm_data.get("KnowledgeArticle", []):
    cur_itsm.execute("""
        INSERT INTO "KnowledgeArticle" (
            id, "tenantId", number, title, content, category, "configurationItem",
            summary, symptoms, "rootCause", "resolutionSteps", "isPublished", "createdAt", "updatedAt"
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            category = EXCLUDED.category,
            "configurationItem" = EXCLUDED."configurationItem",
            summary = EXCLUDED.summary,
            symptoms = EXCLUDED.symptoms,
            "rootCause" = EXCLUDED."rootCause",
            "resolutionSteps" = EXCLUDED."resolutionSteps",
            "isPublished" = EXCLUDED."isPublished";
    """, (
        kb.get("id"), kb.get("tenantId", "tenant_acme_01"), kb.get("number"), kb.get("title"),
        kb.get("content"), kb.get("category"), kb.get("configurationItem"), kb.get("summary"),
        kb.get("symptoms"), kb.get("rootCause"), kb.get("resolutionSteps"),
        kb.get("isPublished", True), kb.get("createdAt"), kb.get("updatedAt")
    ))

print(f"  ✅ Restored {len(itsm_data.get('KnowledgeArticle', []))} Knowledge Articles in itsm_db")

# Restore Incidents
incidents = itsm_data.get("Incident", [])
for inc in incidents:
    cur_itsm.execute("""
        INSERT INTO "Incident" (
            id, "tenantId", number, "shortDescription", description, state, impact, urgency, priority,
            "callerName", "assignedToName", "configurationItemName", department, "resolutionNotes",
            "resolutionCode", "resolvedAt", "closedAt", "createdAt", "updatedAt", "activitiesJson"
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        ON CONFLICT (id) DO UPDATE SET
            number = EXCLUDED.number,
            "shortDescription" = EXCLUDED."shortDescription",
            description = EXCLUDED.description,
            state = EXCLUDED.state,
            priority = EXCLUDED.priority,
            department = EXCLUDED.department,
            "assignedToName" = EXCLUDED."assignedToName",
            "resolutionNotes" = EXCLUDED."resolutionNotes",
            "resolvedAt" = EXCLUDED."resolvedAt",
            "activitiesJson" = EXCLUDED."activitiesJson";
    """, (
        inc.get("id"), inc.get("tenantId", "tenant_acme_01"), inc.get("number"), inc.get("shortDescription"),
        inc.get("description"), inc.get("state"), inc.get("impact"), inc.get("urgency"), inc.get("priority"),
        inc.get("callerName"), inc.get("assignedToName"), inc.get("configurationItemName"), inc.get("department"),
        inc.get("resolutionNotes"), inc.get("resolutionCode"), inc.get("resolvedAt"), inc.get("closedAt"),
        inc.get("createdAt"), inc.get("updatedAt"),
        json.dumps(inc.get("activitiesJson", [])) if isinstance(inc.get("activitiesJson"), (list, dict)) else inc.get("activitiesJson")
    ))

conn_itsm.commit()
cur_itsm.close()
conn_itsm.close()
print(f"  ✅ Restored {len(incidents)} Incidents in itsm_db")

# 2. Restore agentic_sre_db
sre_data = dump_data.get("agentic_sre_db", {})
conn_sre = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/agentic_sre_db")
cur_sre = conn_sre.cursor()

# Ensure tables exist
cur_sre.execute("""
    CREATE TABLE IF NOT EXISTS sre_approvals (
        id VARCHAR(64) PRIMARY KEY,
        incident_id VARCHAR(64),
        incident_title TEXT,
        agent_id VARCHAR(64),
        agent_name VARCHAR(128),
        model VARCHAR(128),
        target_ci VARCHAR(128),
        department VARCHAR(64),
        risk_level VARCHAR(32),
        confidence_score NUMERIC(5,2),
        status VARCHAR(32),
        requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        summary TEXT,
        proposed_commands JSONB,
        kb_article_reference VARCHAR(64),
        kb_title TEXT,
        safety_checks JSONB,
        ai_reasoning TEXT,
        rejection_reason TEXT,
        approved_by VARCHAR(128),
        approved_at TIMESTAMP WITH TIME ZONE,
        details JSONB
    );

    CREATE TABLE IF NOT EXISTS sre_history (
        id VARCHAR(64) PRIMARY KEY,
        approval_id VARCHAR(64),
        incident_id VARCHAR(64),
        incident_title TEXT,
        agent_id VARCHAR(64),
        agent_name VARCHAR(128),
        model VARCHAR(128),
        target_ci VARCHAR(128),
        department VARCHAR(64),
        risk_level VARCHAR(32),
        status VARCHAR(32),
        action_type VARCHAR(128),
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        duration_ms INTEGER,
        human_approver VARCHAR(128),
        command_executed TEXT,
        execution_output TEXT,
        resolution_outcome TEXT,
        kb_generated VARCHAR(64),
        details JSONB
    );

    CREATE TABLE IF NOT EXISTS sre_timeline (
        id VARCHAR(64) PRIMARY KEY,
        incident_number VARCHAR(64),
        incident_title TEXT,
        target_ci VARCHAR(128),
        status VARCHAR(32),
        start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP WITH TIME ZONE,
        steps JSONB
    );

    CREATE TABLE IF NOT EXISTS sre_containment (
        id VARCHAR(64) PRIMARY KEY,
        master_kill_switch BOOLEAN DEFAULT FALSE,
        contained_cis JSONB DEFAULT '[]'::jsonb
    );

    CREATE TABLE IF NOT EXISTS sre_configs (
        id VARCHAR(64) PRIMARY KEY,
        config_data JSONB
    );
""")

for h in sre_data.get("sre_history", []):
    cur_sre.execute("""
        INSERT INTO sre_history (
            id, approval_id, incident_id, incident_title, agent_id, agent_name, model, target_ci, department,
            risk_level, status, action_type, executed_at, duration_ms, human_approver, command_executed,
            execution_output, resolution_outcome, kb_generated, details
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING;
    """, (
        h.get("id"), h.get("approval_id"), h.get("incident_id"), h.get("incident_title"),
        h.get("agent_id"), h.get("agent_name"), h.get("model"), h.get("target_ci"), h.get("department"),
        h.get("risk_level"), h.get("status"), h.get("action_type"), h.get("executed_at"),
        h.get("duration_ms"), h.get("human_approver"), h.get("command_executed"),
        h.get("execution_output"), h.get("resolution_outcome"), h.get("kb_generated"),
        json.dumps(h.get("details")) if isinstance(h.get("details"), (list, dict)) else h.get("details")
    ))

print(f"  ✅ Restored {len(sre_data.get('sre_history', []))} SRE History Records in agentic_sre_db")

for a in sre_data.get("sre_approvals", []):
    cur_sre.execute("""
        INSERT INTO sre_approvals (
            id, incident_id, incident_title, agent_id, agent_name, model, target_ci, department,
            risk_level, confidence_score, status, requested_at, summary, proposed_commands,
            kb_article_reference, kb_title, safety_checks, ai_reasoning, rejection_reason,
            approved_by, approved_at, details
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING;
    """, (
        a.get("id"), a.get("incident_id"), a.get("incident_title"), a.get("agent_id"),
        a.get("agent_name"), a.get("model"), a.get("target_ci"), a.get("department"),
        a.get("risk_level"), a.get("confidence_score"), a.get("status"), a.get("requested_at"),
        a.get("summary"), json.dumps(a.get("proposed_commands")) if isinstance(a.get("proposed_commands"), (list, dict)) else a.get("proposed_commands"),
        a.get("kb_article_reference"), a.get("kb_title"),
        json.dumps(a.get("safety_checks")) if isinstance(a.get("safety_checks"), (list, dict)) else a.get("safety_checks"),
        a.get("ai_reasoning"), a.get("rejection_reason"), a.get("approved_by"), a.get("approved_at"),
        json.dumps(a.get("details")) if isinstance(a.get("details"), (list, dict)) else a.get("details")
    ))

print(f"  ✅ Restored {len(sre_data.get('sre_approvals', []))} Approvals in agentic_sre_db")

conn_sre.commit()
cur_sre.close()
conn_sre.close()

print("\n=========================================================")
print("🎉 RESTORATION COMPLETE: All Incidents, KBs, and SRE Logs Active!")
print("=========================================================")
