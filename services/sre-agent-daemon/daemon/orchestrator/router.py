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
from ..itsm.client import add_work_note, update_incident_status, fetch_incident_queue, get_team_member_for_department
from ..notifications.slack_notifier import notify_router_failure, reset_router_failure_notice

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
1. First, judge whether the Short Description / Description above actually describe a real IT operational
   problem (a symptom, error, request, or observable technical condition). Ignore the Configuration Item name
   when making this judgment -- it identifies *where* the ticket was filed, not *what* is wrong, so shared
   words between the CI name and a historical precedent's title are NOT evidence the precedent applies here.
2. If the ticket text is empty, nonsensical, unrelated to IT operations, or too vague to diagnose (e.g. it
   does not name any symptom, error, component behavior, or request), you MUST return confidenceScore <= 40
   regardless of what the historical precedents below say -- do not borrow a precedent's department, priority,
   or reasoning onto a ticket whose own text does not support it.
3. Otherwise, examine the historical precedents to see which team resolved genuinely similar issues in the
   past, and align your classification with historical precedent only when the ticket's own described symptom
   matches the precedent's, not merely its Configuration Item.
4. Return ONLY a valid JSON object matching this exact schema:
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

    # NOTE: keyword source is short_desc/desc ONLY -- ci_name is deliberately
    # excluded. ci_name is often multi-word generic infra vocabulary ("control
    # plane", "worker node") that overlaps unrelated historical tickets on the
    # same CI, contaminating retrieval with precedents that match the *host*
    # rather than the *reported problem* (e.g. a nonsense ticket on "control
    # plane" pulling in real memory/OOM precedents for that CI).
    combined_text = f"{short_desc} {desc}"
    words = [w.lower() for w in re.findall(r'[a-zA-Z0-9_-]{3,}', combined_text)]
    stopwords = {'the', 'and', 'for', 'with', 'from', 'this', 'that', 'server', 'node', 'incident', 'issue', 'alert', 'error', 'system'}
    keywords = [w for w in words if w not in stopwords][:6]
    
    if not keywords:
        keywords = ['cpu', 'user', 'memory', 'down', 'k8s']
        
    like_clauses = " OR ".join(['"shortDescription" ILIKE %s OR description ILIKE %s' for _ in keywords])
    # Per-keyword match-count expression, e.g. for keywords [a, b]:
    #   (CASE WHEN "shortDescription" ILIKE %s OR description ILIKE %s THEN 1 ELSE 0 END) +
    #   (CASE WHEN "shortDescription" ILIKE %s OR description ILIKE %s THEN 1 ELSE 0 END)
    # A single generic word (e.g. "create") is still enough to appear as a candidate at
    # all (kept permissive on recall), but tickets sharing several distinctive keywords
    # with the incident now rank above ones sharing only one -- previously this was
    # ORDER BY "createdAt" DESC, so a ticket matching just one generic word (e.g. "create
    # an ID called oswaldo" matching "create"/"called") could bury a near-identical older
    # precedent (e.g. "create resource groups... azure... az cli" matching 4+ keywords)
    # purely because it was more recent, feeding the LLM classifier misleading grounding.
    match_count_expr = " + ".join(
        ['(CASE WHEN "shortDescription" ILIKE %s OR description ILIKE %s THEN 1 ELSE 0 END)' for _ in keywords]
    )
    params = []
    for kw in keywords:
        params.extend([f"%{kw}%", f"%{kw}%"])

    # 1. Query itsm_db for resolved/closed incidents
    try:
        conn_itsm = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/itsm_db")
        cur_itsm = conn_itsm.cursor(cursor_factory=RealDictCursor)
        sql = f"""
            SELECT number, "shortDescription", department, "assignedToName", priority, state,
                   ({match_count_expr}) AS match_count
            FROM "Incident"
            WHERE state IN ('RESOLVED', 'CLOSED')
              AND department IS NOT NULL
              AND department NOT IN ('UNASSIGNED', 'NONE', 'UNSPECIFIED')
              AND ({like_clauses})
            ORDER BY match_count DESC, "createdAt" DESC
            LIMIT {limit};
        """
        cur_itsm.execute(sql, params + params)
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
        sre_match_count_expr = " + ".join(
            ['(CASE WHEN incident_title ILIKE %s OR action_type ILIKE %s THEN 1 ELSE 0 END)' for _ in keywords]
        )
        sre_params = []
        for kw in keywords:
            sre_params.extend([f"%{kw}%", f"%{kw}%"])

        sql_sre = f"""
            SELECT incident_id, incident_title, department, human_approver, risk_level, action_type,
                   ({sre_match_count_expr}) AS match_count
            FROM sre_history
            WHERE status IN ('APPROVED', 'AUTO_EXECUTED')
              AND department IS NOT NULL
              AND ({sre_like})
            ORDER BY match_count DESC, executed_at DESC
            LIMIT {limit};
        """
        cur_sre.execute(sql_sre, sre_params + sre_params)
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
    def __init__(self, confidence_threshold=95):
        self.confidence_threshold = confidence_threshold
        self.routing_history = []

    def sync_confidence_threshold(self):
        """Pulls the live threshold set via the Control Tower's AI Routing
        Overview slider (persisted in-memory on the backend, same pattern as
        the containment/kill-switch settings). Falls back silently to
        whatever threshold is already in effect if the backend is unreachable."""
        from ..config import ITSM_BASE_URL
        import requests
        try:
            r = requests.get(f"{ITSM_BASE_URL}/agent/router-config", timeout=2)
            if r.status_code == 200:
                new_threshold = r.json().get("confidenceThreshold")
                if isinstance(new_threshold, (int, float)) and new_threshold != self.confidence_threshold:
                    logger.info(f"🎚️ [Agentic AI Router] Confidence threshold updated: {self.confidence_threshold}% -> {new_threshold}% (synced from Control Tower)")
                    self.confidence_threshold = new_threshold
        except Exception:
            pass

    def classify_ticket(self, incident):
        """Uses Historical Data & LLM reasoning to classify ticket priority and assignment group."""
        number = incident.get("number", "INC-UNKNOWN")
        short_desc = incident.get("shortDescription") or incident.get("title", "")
        desc = incident.get("description", "")
        ci_name = incident.get("configurationItem") or incident.get("configurationItemName") or "WorkerNode1HL"

        # 1. Retrieve real historical precedents
        precedents = get_historical_routing_precedents(short_desc, desc, ci_name, limit=4)
        
        # ── 0. DETERMINISTIC DOMAIN POLICIES ──
        combined_text = f"{short_desc} {desc}".strip().lower()

        # Policy Rule A: Linux OS User Administration, Provisioning & Sudoers Permissions -> Unix
        is_user_mgmt = bool(re.search(
            r'\b(user\s*id|user\s*ids|create\s+user|delete\s+user|remove\s+user|add\s+user|useradd|userdel|usermod|sudoers?|passwd|password\s+reset|offboard(?:ing)?|onboard(?:ing)?)\b',
            combined_text
        ))
        if is_user_mgmt:
            audit_entry = {
                "incidentId": incident.get("id"),
                "number": number,
                "shortDescription": short_desc,
                "recommendedDepartment": "Unix",
                "priority": "P2",
                "confidenceScore": 99,
                "reasoningText": "Deterministic Policy Rule: Linux OS user provisioning, deprovisioning, and sudoers permissions are strictly routed to Unix Administration.",
                "thinkingTrace": f"Enforced deterministic platform routing policy: User administration / sudoers request routed to Unix (P2) with 99% confidence.",
                "historicalPrecedentsCount": len(precedents),
                "autoAssigned": True
            }
            self.routing_history.append(audit_entry)
            logger.info(f"🤖 [Agentic AI Router] Classified [{number}] -> Unix (P2) with 99% confidence (OS User Mgmt Policy Rule).")
            return audit_entry

        # Policy Rule B: Nexacore application downtime, service crashes, and portal alerts -> App Support
        is_app_incident = bool(re.search(
            r'\b(down|error|crash|http|404|500|502|503|unresponsive|unavailable|portal|timeout|latency|gateway)\b',
            combined_text
        ))
        if "nexacore" in combined_text and is_app_incident:
            is_critical = bool(re.search(r'\b(p1|critical|sev-?1|disaster|total outage)\b', combined_text))
            prio = "P1" if is_critical else "P2"
            audit_entry = {
                "incidentId": incident.get("id"),
                "number": number,
                "shortDescription": short_desc,
                "recommendedDepartment": "App Support",
                "priority": prio,
                "confidenceScore": 99,
                "reasoningText": "Deterministic Policy Rule: Nexacore application downtime, service failures, and portal alerts are strictly routed to App Support.",
                "thinkingTrace": f"Enforced deterministic platform routing policy: 'nexacore' application alert routed to App Support ({prio}) with 99% confidence.",
                "historicalPrecedentsCount": len(precedents),
                "autoAssigned": True
            }
            self.routing_history.append(audit_entry)
            logger.info(f"🤖 [Agentic AI Router] Classified [{number}] -> App Support ({prio}) with 99% confidence (Nexacore Policy Rule).")
            return audit_entry
        
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
                # Was 512 -- the schema asks for both reasoningText AND a separate,
                # open-ended thinkingTrace field, and 512 tokens routinely wasn't
                # enough to finish emitting both before hitting the cap. That leaves
                # the JSON object unclosed (no trailing '}'), which safe_json_parse
                # correctly rejects and returns {} for -- silently defaulting EVERY
                # field below (dept="Unix", conf=85, generic reasoning) with no
                # error logged. Verified live: 3/3 reproductions of a real router
                # call truncated mid-thinkingTrace at 512 tokens. 1024 gives enough
                # headroom for both fields to complete on a typical response.
                max_tokens=1024,
                temperature=0.1,
                role="router"
            )

            res = safe_json_parse(raw_response)
            if not res:
                # Every field below is about to silently fall back to its default
                # (dept="Unix", conf=85) -- that's indistinguishable from a genuine
                # low-confidence classification unless this is logged loudly. This
                # is the exact failure mode that produced repeated "Unix, 85%
                # confidence, grounded on N historical records" misroutes this
                # session even when strong, correctly-retrieved precedents existed.
                logger.error(
                    f"AI Router: classification JSON failed to parse for [{number}] -- "
                    f"falling back to defaults (Unix/85%). Raw response ({len(raw_response or '')} chars): "
                    f"{(raw_response or '')[:300]!r}"
                )
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
            fallback_dept = "App Support" if "nexacore" in combined_text else "Unix"
            return {
                "incidentId": incident.get("id"),
                "number": number,
                "recommendedDepartment": fallback_dept,
                "priority": "P2" if fallback_dept == "App Support" else "P3",
                "confidenceScore": 95 if fallback_dept == "App Support" else 75,
                "reasoningText": f"Fallback triage assigned to {fallback_dept} team based on domain taxonomy.",
                "thinkingTrace": "LLM triage exception caught; applied domain-aware fallback assignment.",
                "historicalPrecedentsCount": 0,
                "autoAssigned": fallback_dept == "App Support"
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
            notify_router_failure(
                num,
                f"Low-confidence classification ({conf}% < {self.confidence_threshold}% threshold) -- "
                f"guessed department '{dept}' without reliable grounding. Reasoning: {reasoning}"
            )

        from ..config import ITSM_BASE_URL
        import requests

        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        assigned_to = get_team_member_for_department(dept)

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
                reset_router_failure_notice()
                return True
            else:
                logger.warning(f"Failed to update incident [{num}]: HTTP {r.status_code} - {r.text}")
                notify_router_failure(num, f"ITSM update rejected: HTTP {r.status_code} - {r.text}")
        except Exception as err:
            logger.error(f"Error executing AI routing on [{num}]: {err}")
            notify_router_failure(num, str(err))
        return False

    def poll_and_route_unassigned_queue(self, token):
        """Scans queue for unassigned tickets and routes them automatically using historical data."""
        from ..config import fetch_containment_status
        c_data = fetch_containment_status()
        if c_data.get("masterKillSwitch"):
            return 0
        contained_cis = set(c_data.get("containedCis", []))
        if "CI_AI_AGENT_02" in contained_cis or "CI_AI_ROUTER_01" in contained_cis:
            return 0

        self.sync_confidence_threshold()
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
