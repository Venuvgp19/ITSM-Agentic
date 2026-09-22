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
from ..session_state import default_session_state


def _regex_recover_classification_fields(raw_text):
    """Best-effort recovery of individual classification fields when the LLM's
    JSON response is syntactically broken (e.g. a stray/orphaned token from the
    model) but the field values themselves are still intact substrings -- seen
    live on INC0001731, where the model correctly reasoned "DevOps Ops" citing
    real precedents, but a rogue `",` fragment mid-object broke json.loads and
    that entire correct answer was discarded for a wrong hardcoded default.

    Deliberately narrow (exact known field names for this one schema) rather
    than a general JSON repair, so it can't silently misparse something it
    shouldn't. Only called after safe_json_parse has already failed outright.
    """
    if not raw_text:
        return {}

    # A chained sequence of naive .replace() calls doesn't match real JSON escape
    # semantics: each one re-scans the WHOLE string, including characters a prior
    # step already substituted, so e.g. a literal backslash immediately followed by
    # a literal "t" (JSON-encoded as the 2-char raw sequence \\t, decoding to the
    # 2-char string "\t" -- backslash then letter t, as in a Windows path like
    # "C:\temp") gets misread: the earlier `.replace("\\\\", ...)` step hasn't run
    # yet, so the LATER `.replace("\\t", "\t")` step matches the backslash+t pair
    # and turns it into a real tab character, corrupting the recovered text. A
    # single left-to-right regex substitution consumes each backslash-escape
    # exactly once, matching how JSON actually decodes escapes.
    _ESCAPE_MAP = {'"': '"', '\\': '\\', '/': '/', 'n': '\n', 't': '\t', 'r': '\r', 'b': '\b', 'f': '\f'}

    def _unescape(s):
        return re.sub(r'\\(.)', lambda m: _ESCAPE_MAP.get(m.group(1), '\\' + m.group(1)), s)

    out = {}
    for field in ("recommendedDepartment", "priority", "reasoningText", "thinkingTrace"):
        m = re.search(rf'"{field}"\s*:\s*"((?:[^"\\]|\\.)*)"', raw_text)
        if m:
            out[field] = _unescape(m.group(1))
    m = re.search(r'"confidenceScore"\s*:\s*(\d+)', raw_text)
    if m:
        out["confidenceScore"] = int(m.group(1))
    return out

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
- P3 (Moderate): Standard operational requests (Linux user account creation/deletion, password resets, software installation, package upgrades, resource provisioning).
- P4 (Low): Informational queries, logs inspection, non-urgent maintenance.

Linux user account creation and password reset requests are routine operational work and must NEVER be classified P1 or P2, regardless of urgent-sounding language in the ticket text -- use P3 (or P4 if clearly low-urgency/informational).

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
        # The second alternative (create/delete/... + "account(s)") exists because
        # requesters often phrase Linux user-account tickets as "accounts" rather
        # than literally "user" (e.g. "Delete New Relic accounts Newrelic01-10 from
        # workernode1HL") -- the first alternative alone doesn't match that phrasing
        # at all, so the ticket fell through to the LLM+historical-precedent path,
        # which is not reliable enough on its own: observed live on INC0002503, it
        # misclassified to "DevOps Ops" reasoning about "az CLI-based resource
        # deletions" that have nothing to do with this ticket, because the one
        # genuinely relevant precedent (INC0002502, the sibling ticket that created
        # these exact same accounts) was sitting ON_HOLD/unresolved at classification
        # time and so invisible to the precedent lookup (which only considers
        # RESOLVED/CLOSED tickets) -- even INC0002502 itself only reached Unix via a
        # 90%-confidence LLM guess, not this deterministic rule, for the same reason.
        # Excludes cloud/DB "account" language so this doesn't also swallow Azure
        # storage-account or DB2/CloudBeaver account tickets, which belong elsewhere.
        is_user_mgmt = bool(re.search(
            r'\b(user\s*id|user\s*ids|create\s+user|delete\s+user|remove\s+user|add\s+user|useradd|userdel|usermod|sudoers?|passwd|password\s+reset|offboard(?:ing)?|onboard(?:ing)?)\b',
            combined_text
        )) or (
            bool(re.search(r'\b(create|delete|remove|add|provision|deprovision|offboard(?:ing)?|onboard(?:ing)?)\b.*\baccounts?\b', combined_text))
            and not bool(re.search(r'\b(azure|storage\s+account|resource\s+group|az\s+cli|service\s+principal|db2|cloudbeaver|billing)\b', combined_text))
        )
        if is_user_mgmt:
            audit_entry = {
                "incidentId": incident.get("id"),
                "number": number,
                "shortDescription": short_desc,
                "recommendedDepartment": "Unix",
                "priority": "P3",
                "confidenceScore": 99,
                "reasoningText": "Deterministic Policy Rule: Linux OS user provisioning, deprovisioning, and sudoers permissions are routine operational requests, strictly routed to Unix Administration at P3 or lower (never P1/P2).",
                "thinkingTrace": f"Enforced deterministic platform routing policy: User administration / sudoers request routed to Unix (P3) with 99% confidence.",
                "historicalPrecedentsCount": len(precedents),
                "autoAssigned": True
            }
            self.routing_history.append(audit_entry)
            logger.info(f"🤖 [Agentic AI Router] Classified [{number}] -> Unix (P3) with 99% confidence (OS User Mgmt Policy Rule).")
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
                logger.error(
                    f"AI Router: classification JSON failed to parse for [{number}] -- "
                    f"attempting regex field recovery before falling back. Raw response "
                    f"({len(raw_response or '')} chars): {(raw_response or '')[:300]!r}"
                )
                res = _regex_recover_classification_fields(raw_response)
                if res.get("recommendedDepartment"):
                    # The model's own answer was still recoverable despite the broken
                    # JSON wrapper -- trust it (including its own stated confidence,
                    # if we got one) rather than a generic default.
                    logger.warning(
                        f"AI Router: recovered classification for [{number}] via regex "
                        f"repair -- dept={res['recommendedDepartment']!r}, "
                        f"conf={res.get('confidenceScore', 'unrecovered')}."
                    )
                else:
                    logger.error(
                        f"AI Router: regex recovery also found nothing usable for [{number}] "
                        f"-- falling back to a LOW-confidence default so this is flagged "
                        f"(below threshold, triggers the low-confidence alert path) instead "
                        f"of silently masquerading as an 85%-confidence real classification."
                    )
            conf = int(res.get("confidenceScore", 40))
            dept = res.get("recommendedDepartment", "Unix")
            prio = res.get("priority", "P3")
            reasoning = res.get(
                "reasoningText",
                "⚠️ AI classification response was unparseable and no fields could be "
                "recovered -- this is a low-confidence fallback guess, not a grounded "
                "decision. Verify department/priority manually.",
            )
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

        # Previously logged a loud warning on low confidence but PATCHed
        # department/priority/state unconditionally anyway -- a 10%-confidence
        # guess was dispatched to IN_PROGRESS identically to a 99%-confidence
        # one, just with a warning nobody but ops-log-watchers would ever see.
        # `department` feeds directly into evaluate_and_get_sop()'s
        # department-scoped RAG search (hybrid_search.py), so a low-confidence
        # misroute doesn't just mislabel a ticket, it searches the wrong
        # department's KB subset. Now genuinely left unassigned instead: no
        # PATCH at all, so it stays out of IN_PROGRESS/resolver dispatch and
        # sits in poll_and_route_unassigned_queue()'s own "unassigned" scan
        # for a human to triage. Guarded by session_state so this only warns/
        # notifies/work-notes ONCE per ticket -- otherwise, since the ticket
        # deliberately never leaves the unassigned pool, every 15s poll cycle
        # would reclassify and re-fire the same low-confidence alert forever.
        if conf < self.confidence_threshold:
            if not default_session_state.has_flagged_low_confidence(inc_id):
                default_session_state.mark_flagged_low_confidence(inc_id)
                logger.warning(
                    f"⚠️ [Agentic AI Router] LOW-CONFIDENCE classification for [{num}]: "
                    f"{conf}% < {self.confidence_threshold}% threshold -- leaving UNASSIGNED "
                    f"for manual triage instead of guessing '{dept}'. Reasoning: {reasoning}"
                )
                notify_router_failure(
                    num,
                    f"Low-confidence classification ({conf}% < {self.confidence_threshold}% threshold) -- "
                    f"left unassigned for manual triage instead of guessing department '{dept}'. Reasoning: {reasoning}"
                )
                hold_note = (
                    f"🤖 **Autonomous Agentic AI Router (Historical Precedent Grounding)**\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"• **Status:** Held unassigned -- confidence below threshold\n"
                    f"• **Confidence Score:** {conf}% (threshold: {self.confidence_threshold}%)\n"
                    f"• **Best Guess (not applied):** {dept} / {prio}\n"
                    f"• **Historical Precedents Referenced:** {prec_count} resolved cases\n\n"
                    f"**Reasoning:**\n{reasoning}\n\n"
                    f"**Diagnostic Trace:**\n{trace}\n\n"
                    f"This ticket needs a human to assign it manually -- the router's own confidence in this "
                    f"guess is too low to auto-dispatch."
                )
                add_work_note(token, inc_id, hold_note, author="🤖 Agentic AI Router (15s Loop)")
            return False

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
