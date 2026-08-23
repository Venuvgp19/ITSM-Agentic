import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import json
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
dump_file = os.path.join(repo_root, "scripts", "database", "full_platform_data_dump.json")

if not os.path.exists(dump_file):
    print(f"❌ Dump file not found at: {dump_file}")
    sys.exit(1)

print("=========================================================")
print("🌐 MULTI-DATABASE RESTORATION (itsm_db & agentic_sre_db)")
print("=========================================================")

# Step 0: Ensure both target databases exist on PostgreSQL
def ensure_database_exists(db_name):
    try:
        conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/postgres")
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute(f"SELECT 1 FROM pg_database WHERE datname = '{db_name}';")
        if not cur.fetchone():
            print(f"🛠️ Creating database '{db_name}'...")
            cur.execute(f'CREATE DATABASE "{db_name}";')
            print(f"  ✅ Database '{db_name}' created successfully.")
        else:
            print(f"  ✅ Database '{db_name}' already exists.")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"  ⚠️ Database check for '{db_name}': {e}")

print("\n--- Step 1: Checking / Auto-Provisioning Databases ---")
ensure_database_exists("itsm_db")
ensure_database_exists("agentic_sre_db")

with open(dump_file, "r", encoding="utf-8") as f:
    dump_data = json.load(f)

# Step 2: Clear & Restore itsm_db
itsm_data = dump_data.get("itsm_db", {})
conn_itsm = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/itsm_db")
cur_itsm = conn_itsm.cursor()

print("\n--- Step 2: Restoring itsm_db (Incidents, KBs, Problems) ---")
# Ensure tables exist
cur_itsm.execute("""
    CREATE TABLE IF NOT EXISTS "Tenant" (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE,
        domain VARCHAR(255),
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "KnowledgeArticle" (
        id VARCHAR(64) PRIMARY KEY,
        "tenantId" VARCHAR(64) DEFAULT 'tenant_acme_01',
        number VARCHAR(64) UNIQUE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(128),
        "configurationItem" VARCHAR(128),
        summary TEXT,
        symptoms TEXT,
        "rootCause" TEXT,
        "resolutionSteps" JSONB,
        "isPublished" BOOLEAN DEFAULT TRUE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "Problem" (
        id VARCHAR(64) PRIMARY KEY,
        "tenantId" VARCHAR(64) DEFAULT 'tenant_acme_01',
        number VARCHAR(64) UNIQUE,
        "shortDescription" TEXT NOT NULL,
        description TEXT,
        "rootCause" TEXT,
        workaround TEXT,
        "knownError" BOOLEAN DEFAULT FALSE,
        state VARCHAR(32) DEFAULT 'NEW',
        priority VARCHAR(32) DEFAULT 'P3',
        "configurationItemName" VARCHAR(128),
        "assignedToName" VARCHAR(128),
        "relatedIncidentsCount" INTEGER DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "Incident" (
        id VARCHAR(64) PRIMARY KEY,
        "tenantId" VARCHAR(64) DEFAULT 'tenant_acme_01',
        number VARCHAR(64) UNIQUE,
        "shortDescription" TEXT NOT NULL,
        description TEXT,
        state VARCHAR(32) DEFAULT 'NEW',
        impact VARCHAR(32) DEFAULT 'LOW',
        urgency VARCHAR(32) DEFAULT 'LOW',
        priority VARCHAR(32) DEFAULT 'P3',
        "callerId" VARCHAR(64),
        "callerName" VARCHAR(128),
        "assignedToId" VARCHAR(64),
        "assignedToName" VARCHAR(128),
        "assignmentGroupId" VARCHAR(64),
        "configurationItemId" VARCHAR(64),
        "configurationItemName" VARCHAR(128),
        department VARCHAR(128),
        "resolutionNotes" TEXT,
        "resolutionCode" VARCHAR(128),
        "resolvedAt" TIMESTAMP WITH TIME ZONE,
        "closedAt" TIMESTAMP WITH TIME ZONE,
        "openedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "slaDueAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "activitiesJson" JSONB
    );

    TRUNCATE TABLE "Incident", "KnowledgeArticle", "Problem" CASCADE;
""")

# Restore Tenant
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
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
    """, (
        kb.get("id"), kb.get("tenantId", "tenant_acme_01"), kb.get("number"), kb.get("title"),
        kb.get("content"), kb.get("category"), kb.get("configurationItem"), kb.get("summary"),
        kb.get("symptoms"), kb.get("rootCause"), kb.get("resolutionSteps"),
        kb.get("isPublished", True), kb.get("createdAt"), kb.get("updatedAt")
    ))

print(f"  ✅ Restored {len(itsm_data.get('KnowledgeArticle', []))} Knowledge Articles in itsm_db")

# Restore Problems
for p in itsm_data.get("Problem", []):
    cur_itsm.execute("""
        INSERT INTO "Problem" (
            id, "tenantId", number, "shortDescription", description, "rootCause", workaround,
            "knownError", state, priority, "configurationItemName", "assignedToName",
            "relatedIncidentsCount", "createdAt", "updatedAt"
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
    """, (
        p.get("id"), p.get("tenantId", "tenant_acme_01"), p.get("number"), p.get("shortDescription"),
        p.get("description"), p.get("rootCause"), p.get("workaround"), p.get("knownError", False),
        p.get("state"), p.get("priority"), p.get("configurationItemName"), p.get("assignedToName"),
        p.get("relatedIncidentsCount", 0), p.get("createdAt"), p.get("updatedAt")
    ))

print(f"  ✅ Restored {len(itsm_data.get('Problem', []))} Problems in itsm_db")

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
        );
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
print(f"  ✅ Restored exact fresh set of {len(incidents)} Incidents in itsm_db")

# Step 3: Clear & Restore agentic_sre_db
sre_data = dump_data.get("agentic_sre_db", {})
conn_sre = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/agentic_sre_db")
cur_sre = conn_sre.cursor()

print("\n--- Step 3: Restoring agentic_sre_db (SRE History, Approvals, Timeline) ---")
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

    TRUNCATE TABLE sre_approvals, sre_history, sre_timeline, sre_containment CASCADE;
""")

for h in sre_data.get("sre_history", []):
    cur_sre.execute("""
        INSERT INTO sre_history (
            id, approval_id, incident_id, incident_title, agent_id, agent_name, model, target_ci, department,
            risk_level, status, action_type, executed_at, duration_ms, human_approver, command_executed,
            execution_output, resolution_outcome, kb_generated, details
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
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
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
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

for t in sre_data.get("sre_timeline", []):
    cur_sre.execute("""
        INSERT INTO sre_timeline (id, incident_number, incident_title, target_ci, status, start_time, end_time, steps)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
    """, (
        t.get("id"), t.get("incident_number"), t.get("incident_title"), t.get("target_ci"),
        t.get("status"), t.get("start_time"), t.get("end_time"),
        json.dumps(t.get("steps")) if isinstance(t.get("steps"), (list, dict)) else t.get("steps")
    ))

print(f"  ✅ Restored {len(sre_data.get('sre_timeline', []))} Timeline Traces in agentic_sre_db")

# Restore Containment & Config
for c in sre_data.get("sre_containment", []):
    cur_sre.execute("""
        INSERT INTO sre_containment (id, master_kill_switch, contained_cis)
        VALUES (%s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            master_kill_switch = EXCLUDED.master_kill_switch,
            contained_cis = EXCLUDED.contained_cis;
    """, (c.get("id"), c.get("master_kill_switch", False), json.dumps(c.get("contained_cis", [])) if isinstance(c.get("contained_cis"), list) else c.get("contained_cis")))

for cfg in sre_data.get("sre_configs", []):
    cur_sre.execute("""
        INSERT INTO sre_configs (id, config_data)
        VALUES (%s, %s)
        ON CONFLICT (id) DO UPDATE SET config_data = EXCLUDED.config_data;
    """, (cfg.get("id"), json.dumps(cfg.get("config_data")) if isinstance(cfg.get("config_data"), dict) else cfg.get("config_data")))

conn_sre.commit()
cur_sre.close()
conn_sre.close()

print("\n=========================================================")
print("🎉 BOTH DATABASES RESTORED COMPLETELY & SYNCHRONIZED!")
print("=========================================================")
