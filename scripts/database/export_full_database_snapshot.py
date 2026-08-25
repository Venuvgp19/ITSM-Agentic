"""
Exports the current live state of both databases into
scripts/database/full_platform_data_dump.json, the single snapshot
scripts/database/restore_all_data.py reads on a fresh machine.

Only exports tables that carry real data today (see README's "Database
Architecture" section) -- not every table in the Prisma schema. Add a table
here (and to restore_all_data.py) once it's actually in day-to-day use.

Secrets are never written to this file: AgentConfig.apiKey and
sre_configs.config_data.apiKey are stripped before serialization, since this
JSON file is committed to git. Restore re-injects the key from the
GENAI_API_KEY env var.

Run: python scripts/database/export_full_database_snapshot.py
"""
import json
import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
dump_file = os.path.join(repo_root, "scripts", "database", "full_platform_data_dump.json")


def default(o):
    return o.isoformat() if hasattr(o, "isoformat") else str(o)


def dump_table(cur, table, columns, order_by="id"):
    col_list = ", ".join(f'"{c}"' for c in columns)
    cur.execute(f'SELECT {col_list} FROM "{table}" ORDER BY "{order_by}"')
    return cur.fetchall()


def main():
    print("=========================================================")
    print("MULTI-DATABASE EXPORT (itsm_db & agentic_sre_db)")
    print("=========================================================")

    itsm_conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/itsm_db")
    itsm_cur = itsm_conn.cursor(cursor_factory=RealDictCursor)

    itsm_data = {
        "Tenant": dump_table(itsm_cur, "Tenant", [
            "id", "name", "domain", "isActive", "createdAt", "updatedAt",
        ]),
        "ConfigurationItem": dump_table(itsm_cur, "ConfigurationItem", [
            "id", "tenantId", "name", "ciClass", "status", "serialNumber",
            "ipAddress", "macAddress", "location", "environment",
            "attributesJson", "createdAt", "updatedAt",
        ]),
        "Incident": dump_table(itsm_cur, "Incident", [
            "id", "tenantId", "number", "shortDescription", "description", "state",
            "impact", "urgency", "priority", "callerName", "assignedToName",
            "configurationItemName", "department", "resolutionNotes", "resolutionCode",
            "resolvedAt", "closedAt", "createdAt", "updatedAt", "activitiesJson",
        ]),
        "Problem": dump_table(itsm_cur, "Problem", [
            "id", "tenantId", "number", "shortDescription", "description", "rootCause",
            "workaround", "knownError", "state", "priority", "configurationItemName",
            "assignedToName", "relatedIncidentsCount", "createdAt", "updatedAt",
        ]),
        "KnowledgeArticle": dump_table(itsm_cur, "KnowledgeArticle", [
            "id", "tenantId", "number", "title", "content", "category", "authorId",
            "configurationItem", "summary", "symptoms", "rootCause", "resolutionSteps",
            "capabilityTags", "workNotesAnalyzedCount", "sourceIncidentIds", "author",
            "modelUsed", "helpfulCount", "viewsCount", "rating", "isPublished",
            "version", "createdAt", "updatedAt",
        ]),
        "AgentConfig": dump_table(itsm_cur, "AgentConfig", [
            "id", "environment", "baseUrl", "apiKey", "routerModel", "resolverModel",
            "synthesizerModel", "governanceModel", "fallbackModels", "updatedAt",
        ]),
        "AgentApproval": dump_table(itsm_cur, "AgentApproval", [
            "id", "type", "entityId", "entityType", "summary", "proposedAction",
            "confidenceScore", "status", "timestamp", "details",
        ]),
        "AgentHistory": dump_table(itsm_cur, "AgentHistory", [
            "id", "type", "timestamp", "incidentId", "title", "description", "metadata",
        ]),
    }

    # Strip secrets before this hits a file committed to git.
    for row in itsm_data["AgentConfig"]:
        row["apiKey"] = None

    itsm_cur.close()
    itsm_conn.close()
    print(f"  itsm_db: {', '.join(f'{k}={len(v)}' for k, v in itsm_data.items())}")

    sre_conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/agentic_sre_db")
    sre_cur = sre_conn.cursor(cursor_factory=RealDictCursor)

    sre_data = {
        "sre_approvals": dump_table(sre_cur, "sre_approvals", [
            "id", "incident_id", "incident_title", "agent_id", "agent_name", "model",
            "target_ci", "department", "risk_level", "confidence_score", "status",
            "requested_at", "summary", "proposed_commands", "kb_article_reference",
            "kb_title", "safety_checks", "ai_reasoning", "rejection_reason",
            "approved_by", "approved_at", "details",
        ]),
        "sre_history": dump_table(sre_cur, "sre_history", [
            "id", "approval_id", "incident_id", "incident_title", "agent_id",
            "agent_name", "model", "target_ci", "department", "risk_level", "status",
            "action_type", "executed_at", "duration_ms", "human_approver",
            "command_executed", "execution_output", "resolution_outcome",
            "kb_generated", "details",
        ]),
        "sre_timeline": dump_table(sre_cur, "sre_timeline", [
            "id", "incident_number", "incident_title", "target_ci", "status",
            "start_time", "end_time", "steps",
        ]),
        "sre_containment": dump_table(sre_cur, "sre_containment", [
            "id", "master_kill_switch", "contained_cis",
        ]),
        "sre_configs": dump_table(sre_cur, "sre_configs", [
            "id", "config_data",
        ]),
    }

    # sre_configs.config_data is a free-form settings blob and has accumulated
    # more than one secret field over time (apiKey, Slack/Teams webhook URLs,
    # bot tokens) -- strip every key that looks like a credential rather than
    # hand-maintaining an exact list, since this file is committed to git.
    _SECRET_KEY_SUBSTRINGS = ("apikey", "token", "webhookurl", "secret", "password")
    for row in sre_data["sre_configs"]:
        if isinstance(row.get("config_data"), dict):
            cfg = dict(row["config_data"])
            for key in list(cfg.keys()):
                if cfg[key] and any(s in key.lower() for s in _SECRET_KEY_SUBSTRINGS):
                    cfg[key] = None
            row["config_data"] = cfg

    sre_cur.close()
    sre_conn.close()
    print(f"  agentic_sre_db: {', '.join(f'{k}={len(v)}' for k, v in sre_data.items())}")

    with open(dump_file, "w", encoding="utf-8") as f:
        json.dump({"itsm_db": itsm_data, "agentic_sre_db": sre_data}, f, default=default, indent=2)

    print(f"\nWrote snapshot to {dump_file}")
    print("NOTE: apiKey fields were stripped -- restore re-injects them from the GENAI_API_KEY env var.")


if __name__ == "__main__":
    main()
