"""
Agent Control Tower AI Ticket Router Module
Handles LLM-powered classification, priority prediction, and automated assignment group routing
grounded in live historical incident and SRE execution data.
"""

import json
import re
import psycopg2
from psycopg2.extras import RealDictCursor

from ..config import logger, MODEL_NAME
from ..llm import invoke_llm_with_fallback, safe_json_parse
from ..itsm.client import add_work_note, update_incident_status, fetch_incident_queue

CLASSIFICATION_PROMPT_TEMPLATE = """
You are the Agentic AI Ticket Router for Enterprise IT Infrastructure.
Analyze the following IT Incident Ticket and classify it accurately into the correct Operational Assignment Group and Priority.
Ground your decision primarily on the retrieved Historical Precedents and the platform's SRE domain taxonomy.

### Operational Assignment Groups:
- "Unix": ALL CPU alerts (100% CPU utilization, high load average), ALL Memory alerts (RAM usage, OOM killer, swap, memory buffer overflow), Linux OS, bash scripts, user creation/deletion, systemd services, SSH, sudoers, permissions.
- "DevOps Ops": Kubernetes, kubectl, ArgoCD, containers, containerd, ingress, Docker, CI/CD pipelines, Az CLI, Azure resource groups.
- "DBA Team": PostgreSQL, IBM DB2, CloudBeaver, database connections, high pool usage, SQL queries, table locks.
- "Network Ops": Firewalls, port blocks, DNS resolution, IP routing, proxy issues, gateway unreachable.
- "App Support": Nexacore application errors, 500 status codes, application down alerts, business portals.

### Priority Levels:
- P1 (Critical): Complete service outage or critical production control plane failure.
- P2 (High): Major application degraded or high CPU/Memory saturation on active nodes.
- P3 (Moderate): Standard operational requests (user accounts, software installation, package upgrades, resource provisioning).
- P4 (Low): Informational queries, logs inspection, non-urgent maintenance.

### Input Incident:
Ticket Number: {number}
Short Description: {short_description}
Description: {description}
Configuration Item: {ci_name}

### Historical Resolved Tickets & SRE Audit Precedents:
{historical_precedents}

### Instructions:
1. Examine the historical precedents above to see which team resolved similar issues in the past.
2. If historical precedents match the pattern (e.g. CPU/Memory on WorkerNode -> Unix, Kubernetes -> DevOps Ops), align your classification with historical precedent.
3. Return ONLY a valid JSON object matching this exact schema:
{{
  "recommendedDepartment": "Unix" | "DevOps Ops" | "DBA Team" | "Network Ops" | "App Support",
  "priority": "P1" | "P2" | "P3" | "P4",
  "confidenceScore": <integer between 0 and 100>,
  "reasoningText": "<Concise 2-sentence explanation citing historical precedent and operational context>",
  "thinkingTrace": "<Step-by-step diagnostic reasoning chain citing past resolved tickets or domain taxonomy>"
}}
"""

def get_historical_routing_precedents(short_desc, desc, ci_name, limit=5):
    """
    Finds top historical resolved incidents in itsm_db and successful executions in agentic_sre_db
    to provide few-shot grounding evidence for the AI Router.
    """
    precedents = []
    
    combined_text = f"{short_desc} {desc} {ci_name}"
    words = [w.lower() for w in re.findall(r'[a-zA-Z0-9_-]{3,}', combined_text)]
    stopwords = {'the', 'and', 'for', 'with', 'from', 'this', 'that', 'server', 'node', 'incident', 'issue', 'alert', 'error', 'system'}
    keywords = [w for w in words if w not in stopwords][:6]
    
    if not keywords:
        keywords = ['cpu', 'user', 'memory', 'down', 'k8s']
        
    like_clauses = " OR ".join(['"shortDescription" ILIKE %s OR description ILIKE %s' for _ in keywords])
    params = []
    for kw in keywords:
        params.extend([f"%{kw}%", f"%{kw}%"])
        
    # 1. Query itsm_db for resolved/closed incidents
    try:
        conn_itsm = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/itsm_db")
        cur_itsm = conn_itsm.cursor(cursor_factory=RealDictCursor)
        sql = f"""
            SELECT number, "shortDescription", department, "assignedToName", priority, state
            FROM "Incident"
            WHERE state IN ('RESOLVED', 'CLOSED')
              AND department IS NOT NULL
              AND department NOT IN ('UNASSIGNED', 'NONE', 'UNSPECIFIED')
              AND ({like_clauses})
            ORDER BY "createdAt" DESC
            LIMIT {limit};
        """
        cur_itsm.execute(sql, params)
        rows = cur_itsm.fetchall()
        for r in rows:
            precedents.append({
                "source": "itsm_db (Resolved Ticket)",
                "number": r["number"],
                "title": r["shortDescription"],
                "department": r["department"],
                "assignedTo": r["assignedToName"] or f"{r['department']} Lead",
                "priority": r["priority"]
            })
        cur_itsm.close()
        conn_itsm.close()
    except Exception as e:
        logger.warning(f"AI Router: Could not fetch precedents from itsm_db: {e}")

    # 2. Query agentic_sre_db for past successful executions
    try:
        conn_sre = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/agentic_sre_db")
        cur_sre = conn_sre.cursor(cursor_factory=RealDictCursor)
        sre_like = " OR ".join(['incident_title ILIKE %s OR action_type ILIKE %s' for _ in keywords])
        sre_params = []
        for kw in keywords:
            sre_params.extend([f"%{kw}%", f"%{kw}%"])
            
        sql_sre = f"""
            SELECT incident_id, incident_title, department, human_approver, risk_level, action_type
            FROM sre_history
            WHERE status IN ('APPROVED', 'AUTO_EXECUTED')
              AND department IS NOT NULL
              AND ({sre_like})
            ORDER BY executed_at DESC
            LIMIT {limit};
        """
        cur_sre.execute(sql_sre, sre_params)
        sre_rows = cur_sre.fetchall()
        for r in sre_rows:
            precedents.append({
                "source": "agentic_sre_db (SRE Audit History)",
                "number": r["incident_id"],
                "title": r["incident_title"],
                "department": r["department"],
                "assignedTo": f"{r['department']} Lead",
                "priority": "P2" if r["risk_level"] == "HIGH" else "P3"
            })
        cur_sre.close()
        conn_sre.close()
    except Exception as e:
        logger.warning(f"AI Router: Could not fetch precedents from agentic_sre_db: {e}")

    return precedents[:limit]

class ControlTowerAIRouter:
    def __init__(self, confidence_threshold=85):
        self.confidence_threshold = confidence_threshold
        self.routing_history = []

    def classify_ticket(self, incident):
        """Uses Historical Data & LLM reasoning to classify ticket priority and assignment group."""
        number = incident.get("number", "INC-UNKNOWN")
        short_desc = incident.get("shortDescription") or incident.get("title", "")
        desc = incident.get("description", "")
        ci_name = incident.get("configurationItem") or incident.get("configurationItemName") or "WorkerNode1HL"

        # 1. Retrieve real historical precedents
        precedents = get_historical_routing_precedents(short_desc, desc, ci_name, limit=4)
        
        if precedents:
            precedent_lines = []
            for idx, p in enumerate(precedents, 1):
                precedent_lines.append(
                    f"{idx}. [{p['source']}] Ticket {p['number']}: '{p['title']}' -> Assigned Department: '{p['department']}' (Priority: {p['priority']}, Assignee: {p['assignedTo']})"
                )
            precedent_text = "\n".join(precedent_lines)
        else:
            precedent_text = "No direct historical keyword matches found. Use platform SRE domain taxonomy."

        prompt = CLASSIFICATION_PROMPT_TEMPLATE.format(
            number=number,
            short_description=short_desc,
            description=desc,
            ci_name=ci_name,
            historical_precedents=precedent_text
        )

        messages = [
            {"role": "system", "content": "You are an expert IT SRE Triage Assistant. Output valid JSON only."},
            {"role": "user", "content": prompt}
        ]

        try:
            raw_response, _ = invoke_llm_with_fallback(
                messages=messages,
                call_label=f"AI-Router-Triage-{number}",
                enable_thinking=False,
                max_tokens=512,
                temperature=0.1,
                role="router"
            )
            
            res = safe_json_parse(raw_response)
            conf = int(res.get("confidenceScore", 85))
            dept = res.get("recommendedDepartment", "Unix")
            prio = res.get("priority", "P3")
            reasoning = res.get("reasoningText", "Classified based on historical data and infrastructure taxonomy.")
            trace = res.get("thinkingTrace", f"Evaluated against historical precedents: {len(precedents)} past cases analyzed.")

            audit_entry = {
                "incidentId": incident.get("id"),
                "number": number,
                "shortDescription": short_desc,
                "recommendedDepartment": dept,
                "priority": prio,
                "confidenceScore": conf,
                "reasoningText": reasoning,
                "thinkingTrace": trace,
                "historicalPrecedentsCount": len(precedents),
                "autoAssigned": conf >= self.confidence_threshold
            }
            
            self.routing_history.append(audit_entry)
            logger.info(f"🤖 [Agentic AI Router] Classified [{number}] -> {dept} ({prio}) with {conf}% confidence (grounded on {len(precedents)} historical records).")
            return audit_entry

        except Exception as e:
            logger.error(f"AI Router classification failed for [{number}]: {e}")
            return {
                "incidentId": incident.get("id"),
                "number": number,
                "recommendedDepartment": "Unix",
                "priority": "P3",
                "confidenceScore": 75,
                "reasoningText": "Fallback triage assigned to Unix Operations team based on default infrastructure baseline.",
                "thinkingTrace": "LLM triage exception caught; applied fallback assignment.",
                "historicalPrecedentsCount": 0,
                "autoAssigned": False
            }

    def route_and_assign_ticket(self, token, incident):
        """Classifies and applies assignment group, lead, and work note to ticket via standard ITSM interface."""
        classification = self.classify_ticket(incident)
        inc_id = incident.get("id")
        num = incident.get("number", inc_id)
        dept = classification.get("recommendedDepartment", "Unix")
        prio = classification.get("priority", "P3")
        conf = classification.get("confidenceScore", 85)
        reasoning = classification.get("reasoningText", "")
        trace = classification.get("thinkingTrace", "")
        prec_count = classification.get("historicalPrecedentsCount", 0)

        # `confidence_threshold` was computed into the audit record's `autoAssigned`
        # field but never actually gated anything below -- department/priority/state
        # were PATCHed unconditionally regardless of confidence, so a 10%-confidence
        # classification was applied identically to a 99%-confidence one. `department`
        # feeds directly into evaluate_and_get_sop()'s department-scoped RAG search
        # (hybrid_search.py), so a low-confidence misroute can search the wrong
        # department's KB subset. Actually re-scoping the search on low confidence
        # would need a schema change on the ITSM backend to carry a confidence flag
        # through to the incident record (out of scope here); at minimum, make a
        # low-confidence classification loudly visible in ops instead of silently
        # indistinguishable from a confident one.
        if conf < self.confidence_threshold:
            logger.warning(
                f"⚠️ [Agentic AI Router] LOW-CONFIDENCE classification for [{num}]: "
                f"{conf}% < {self.confidence_threshold}% threshold -- routed to '{dept}' "
                f"on a low-confidence guess. Reasoning: {reasoning}"
            )

        from ..config import ITSM_BASE_URL
        import requests

        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        assigned_to = f"{dept} Lead"

        # Update assignment group, priority, and transition state to IN_PROGRESS
        patch_payload = {
            "department": dept,
            "assignedTo": assigned_to,
            "priority": prio,
            "state": "IN_PROGRESS",
        }
        try:
            r = requests.patch(f"{ITSM_BASE_URL}/incidents/{inc_id}", headers=headers, json=patch_payload, timeout=5)
            if r.status_code in (200, 201):
                logger.info(f"✅ [Agentic AI Router (Historical Grounding)] Successfully assigned [{num}] to '{dept}' (State: IN_PROGRESS, Priority: {prio}, AssignedTo: '{assigned_to}')")
                
                # Append transparent diagnostic work note citing historical data
                work_note = (
                    f"🤖 **Autonomous Agentic AI Router (Historical Precedent Grounding)**\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"• **Assignment Group:** {dept}\n"
                    f"• **Assigned Technician:** {assigned_to}\n"
                    f"• **Ticket State:** IN_PROGRESS (Dispatched for Operational Remediation)\n"
                    f"• **Predicted Priority:** {prio}\n"
                    f"• **Confidence Score:** {conf}%\n"
                    f"• **Historical Precedents Referenced:** {prec_count} resolved cases\n\n"
                    f"**Reasoning:**\n{reasoning}\n\n"
                    f"**Diagnostic Trace:**\n{trace}"
                )
                add_work_note(token, inc_id, work_note, author="🤖 Agentic AI Router (15s Loop)")
                return True
            else:
                logger.warning(f"Failed to update incident [{num}]: HTTP {r.status_code} - {r.text}")
        except Exception as err:
            logger.error(f"Error executing AI routing on [{num}]: {err}")
        return False

    def poll_and_route_unassigned_queue(self, token):
        """Scans queue for unassigned tickets and routes them automatically using historical data."""
        incidents = fetch_incident_queue(token)
        unassigned = []
        for inc in incidents:
            dept = str(inc.get("department") or "").strip().upper()
            assigned = str(inc.get("assignedTo") or inc.get("assignedToName") or "").strip().upper()
            state = str(inc.get("state") or "").strip().upper()
            
            if state in ("RESOLVED", "CLOSED"):
                continue
                
            if not dept or dept in ("UNASSIGNED", "NONE", "UNSPECIFIED", "IT OPS") or not assigned or "UNASSIGNED" in assigned:
                unassigned.append(inc)

        if unassigned:
            logger.info(f"⚡ [Agentic AI Router (Historical Grounding)] Discovered {len(unassigned)} unassigned ticket(s). Auto-routing via historical precedent...")
            routed_count = 0
            for inc in unassigned[:5]:
                if self.route_and_assign_ticket(token, inc):
                    routed_count += 1
            return routed_count
        return 0

    def start_15s_background_router(self, token_getter):
        """Launches continuous 15-second background daemon worker thread."""
        import threading
        import time

        def _router_worker():
            logger.info("🤖 [Agentic AI Router] Started 15-second autonomous unassigned ticket polling worker (Historical Data Grounding Enabled).")
            while True:
                try:
                    tok = token_getter()
                    if tok:
                        self.poll_and_route_unassigned_queue(tok)
                except Exception as ex:
                    logger.error(f"Error in 15s AI Router worker: {ex}")
                time.sleep(15)

        t = threading.Thread(target=_router_worker, daemon=True, name="AgenticAIRouter15s")
        t.start()
        return t

control_tower_router = ControlTowerAIRouter()
