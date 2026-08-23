"""
Agent Control Tower AI Ticket Router Module
Handles LLM-powered classification, priority prediction, and automated assignment group routing
"""

import json
from ..config import logger, MODEL_NAME
from ..llm import invoke_llm_with_fallback, safe_json_parse
from ..itsm.client import add_work_note, update_incident_status, fetch_incident_queue

CLASSIFICATION_PROMPT_TEMPLATE = """
You are the Agentic AI Ticket Router for Enterprise IT Infrastructure.
Analyze the following IT Incident Ticket and classify it accurately into the correct Operational Assignment Group and Priority.

### Operational Assignment Groups:
- "Unix": Linux OS, bash scripts, user creation/deletion, systemd services, SSH, sudoers, permissions.
- "DevOps Ops": Kubernetes, kubectl, ArgoCD, containers, containerd, ingress, Docker, CI/CD pipelines, Az CLI.
- "DBA Team": PostgreSQL, IBM DB2, CloudBeaver, database connections, high pool usage, SQL queries.
- "Network Ops": Firewalls, port blocks, DNS resolution, IP routing, proxy issues, gateway unreachable.
- "App Support": Nexacore application errors, 500 status codes, application down alerts, business portals.

### Priority Levels:
- P1 (Critical): Complete service outage or critical production control plane failure.
- P2 (High): Major application degraded or high CPU/Memory saturation on active nodes.
- P3 (Moderate): Standard operational requests (user accounts, software installation, package upgrades).
- P4 (Low): Informational queries, logs inspection, non-urgent maintenance.

### Input Incident:
Ticket Number: {number}
Short Description: {short_description}
Description: {description}
Configuration Item: {ci_name}

### Return ONLY a valid JSON object matching this exact schema:
{{
  "recommendedDepartment": "Unix" | "DevOps Ops" | "DBA Team" | "Network Ops" | "App Support",
  "priority": "P1" | "P2" | "P3" | "P4",
  "confidenceScore": <integer between 0 and 100>,
  "reasoningText": "<Concise 2-sentence explanation of why this group was selected>",
  "thinkingTrace": "<Step-by-step diagnostic reasoning chain>"
}}
"""

class ControlTowerAIRouter:
    def __init__(self, confidence_threshold=85):
        self.confidence_threshold = confidence_threshold
        self.routing_history = []

    def classify_ticket(self, incident):
        """Uses LLM to classify ticket priority and operational assignment group."""
        number = incident.get("number", "INC-UNKNOWN")
        short_desc = incident.get("shortDescription") or incident.get("title", "")
        desc = incident.get("description", "")
        ci_name = incident.get("configurationItem", "Worker 1")

        prompt = CLASSIFICATION_PROMPT_TEMPLATE.format(
            number=number,
            short_description=short_desc,
            description=desc,
            ci_name=ci_name
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
                temperature=0.1
            )
            
            res = safe_json_parse(raw_response)
            conf = int(res.get("confidenceScore", 80))
            dept = res.get("recommendedDepartment", "Unix")
            prio = res.get("priority", "P3")
            reasoning = res.get("reasoningText", "Auto-classified based on infrastructure context.")
            trace = res.get("thinkingTrace", "Evaluated ticket attributes against SRE taxonomy.")

            audit_entry = {
                "incidentId": incident.get("id"),
                "number": number,
                "shortDescription": short_desc,
                "recommendedDepartment": dept,
                "priority": prio,
                "confidenceScore": conf,
                "reasoningText": reasoning,
                "thinkingTrace": trace,
                "autoAssigned": conf >= self.confidence_threshold
            }
            
            self.routing_history.append(audit_entry)
            logger.info(f"🤖 [Agentic AI Router] Classified [{number}] -> {dept} ({prio}) with {conf}% confidence.")
            return audit_entry

        except Exception as e:
            logger.error(f"AI Router classification failed for [{number}]: {e}")
            return {
                "incidentId": incident.get("id"),
                "number": number,
                "recommendedDepartment": "Unix",
                "priority": "P3",
                "confidenceScore": 75,
                "reasoningText": "Fallback triage assigned to Unix Operations team.",
                "thinkingTrace": "LLM triage exception caught.",
                "autoAssigned": False
            }

    def route_and_assign_ticket(self, token, incident):
        """Classifies and applies assignment group, lead, and work note to ticket via standard ITSM interface."""
        classification = self.classify_ticket(incident)
        inc_id = incident.get("id")
        num = incident.get("number", inc_id)
        dept = classification.get("recommendedDepartment", "Unix")
        prio = classification.get("priority", "P3")
        conf = classification.get("confidenceScore", 80)
        reasoning = classification.get("reasoningText", "")
        trace = classification.get("thinkingTrace", "")

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
                logger.info(f"✅ [Agentic AI Router (15s Loop)] Successfully assigned [{num}] to '{dept}' (State: IN_PROGRESS, Priority: {prio}, AssignedTo: '{assigned_to}')")
                
                # Append transparent diagnostic work note
                work_note = (
                    f"🤖 **Autonomous Agentic AI Router (15s Loop)**\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"• **Assignment Group:** {dept}\n"
                    f"• **Assigned Technician:** {assigned_to}\n"
                    f"• **Ticket State:** IN_PROGRESS (Dispatched for Operational Remediation)\n"
                    f"• **Predicted Priority:** {prio}\n"
                    f"• **Confidence Score:** {conf}%\n\n"
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
        """Scans queue for unassigned tickets and routes them automatically."""
        incidents = fetch_incident_queue(token)
        unassigned = []
        for inc in incidents:
            dept = str(inc.get("department") or "").strip().upper()
            assigned = str(inc.get("assignedTo") or "").strip().upper()
            state = str(inc.get("state") or "").strip().upper()
            
            if state in ("RESOLVED", "CLOSED"):
                continue
                
            if not dept or dept in ("UNASSIGNED", "NONE", "UNSPECIFIED", "IT OPS") or not assigned or "UNASSIGNED" in assigned:
                unassigned.append(inc)

        if unassigned:
            logger.info(f"⚡ [Agentic AI Router (15s Loop)] Discovered {len(unassigned)} unassigned ticket(s). Auto-routing via LLM reasoning...")
            routed_count = 0
            for inc in unassigned[:5]:  # Process up to 5 unassigned per cycle
                if self.route_and_assign_ticket(token, inc):
                    routed_count += 1
            return routed_count
        return 0

    def start_15s_background_router(self, token_getter):
        """Launches continuous 15-second background daemon worker thread."""
        import threading
        import time

        def _router_worker():
            logger.info("🤖 [Agentic AI Router] Started 15-second autonomous unassigned ticket polling worker.")
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

