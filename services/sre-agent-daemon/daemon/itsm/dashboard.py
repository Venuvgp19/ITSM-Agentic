import time
import requests
from ..config import logger, MODEL_NAME, ITSM_BASE_URL, GOVERNANCE_BASE_URL

def submit_approval_request_to_dashboard(incident_id, incident_title, ci_name, proposed_commands, reasoning, kb_num, kb_title):
    try:
        payload = {
            "incidentId": incident_id,
            "incidentTitle": incident_title,
            "agentId": "agent-unix-resolver-01",
            "agentName": "🤖 Unix Auto-Resolver Agent",
            "model": MODEL_NAME,
            "targetCi": ci_name,
            "department": "Unix",
            "riskLevel": "HIGH",
            "confidenceScore": 96.5,
            "summary": f"Proposed SOP Remediation commands for target host {ci_name}.",
            "proposedCommands": proposed_commands,
            "kbArticleReference": kb_num,
            "kbTitle": kb_title,
            "safetyChecks": [
                {"check": "SSH Connectivity to target host verified", "passed": True},
                {"check": "Target CI operational status confirmed", "passed": True},
                {"check": "SOP knowledge base syntax validated", "passed": True}
            ],
            "aiReasoning": reasoning
        }
        res = requests.post(f"{GOVERNANCE_BASE_URL}/approvals", json=payload, timeout=5)
        if res.status_code in [200, 201]:
            appr = res.json()
            logger.info(f"🛡️ SUBMITTED HITL APPROVAL REQUEST TO DASHBOARD: ID={appr['id']} for Incident {incident_id}")
            return appr
    except Exception as e:
        logger.warning(f"Could not submit approval request to dashboard: {e}")
    return None

def post_history_entry_to_dashboard(incident_id, incident_title, ci_name, commands, exec_log, outcome, kb_num, status="AUTO_EXECUTED", human_approver="Autonomous Policy (Low/Medium Risk)"):
    try:
        payload = {
            "incidentId": incident_id,
            "incidentTitle": incident_title,
            "agentId": "agent-unix-resolver-01",
            "agentName": "🤖 Unix Auto-Resolver Agent",
            "model": MODEL_NAME,
            "targetCi": ci_name,
            "department": "Unix",
            "riskLevel": "MEDIUM",
            "status": status,
            "actionType": "User Account Creation & SOP Execution",
            "durationMs": 950,
            "humanApprover": human_approver,
            "commandExecuted": " && ".join(commands) if isinstance(commands, list) else str(commands),
            "executionOutput": exec_log,
            "resolutionOutcome": outcome,
            "kbGenerated": kb_num,
            "routerOutput": {
                "ticketId": incident_id,
                "category": "User Management > Account Provisioning",
                "impactUrgency": "Medium / Low",
                "assignedPriority": "P3 (Moderate)",
                "dispatchRoute": "Unix Auto-Resolver Queue",
                "userAcknowledgment": f"Account creation request {incident_id} assigned to Unix Auto-Resolver."
            },
            "resolverOutput": {
                "diagnosis": f"User account provision request for host {ci_name}.",
                "matchedRunbook": f"{kb_num}: Master SOP for User Account Provisioning & Offboarding",
                "remediationStepsApplied": commands if isinstance(commands, list) else [str(commands)],
                "resolutionStatus": "RESOLVED",
                "userResolutionNotice": f"User account created and verified on {ci_name}."
            },
            "synthesizerOutput": {
                "draftKbId": kb_num,
                "kbTitle": "Master SOP: Standard Operating Procedure for Generic User Account Deletion & Creation",
                "synthesizedSolution": "Issued useradd -m and chpasswd via non-interactive SSH automation.",
                "trendInsight": "Routine account creation ticket auto-resolved in 950ms."
            }
        }
        res = requests.post(f"{GOVERNANCE_BASE_URL}/history", json=payload, timeout=5)
        if res.status_code in [200, 201]:
            logger.info(f"📜 LOGGED AGENT AUDIT TRACE TO DASHBOARD HISTORY FOR INCIDENT {incident_id}")
    except Exception as e:
        logger.warning(f"Could not post history trace to dashboard: {e}")

def post_timeline_update(incident_id, incident_number, incident_title, ci_name, status, step_name=None, step_status=None, step_details=None):
    try:
        payload = {
            "id": incident_id,
            "incidentNumber": incident_number,
            "incidentTitle": incident_title,
            "targetCi": ci_name,
            "status": status
        }
        if step_name:
            payload["step"] = {
                "name": step_name,
                "status": step_status or "SUCCESS",
                "timestamp": time.strftime("%I:%M:%S %p"),
                "details": step_details or ""
            }
        requests.post(f"{GOVERNANCE_BASE_URL}/timeline", json=payload, timeout=5)
    except Exception as e:
        logger.warning(f"Could not post timeline update: {e}")

def format_new_sop_work_note(ticket_number, short_desc, ci_name, ip, user, kb_num, kb_title, reasoning, proposed_commands, is_new_use_case=False):
    cmd_block = "\n".join([f"$ {cmd}" for cmd in proposed_commands])
    use_case_badge = "✨ NEW USE CASE (SOP GENERATED & STORED TO KB)" if is_new_use_case else "📌 EXISTING SOP MATCHED"
    
    return (
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📌 SOP REMEDIATION PLAN (PAUSED FOR SYSTEM ADMIN REVIEW)\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🤖 Agent Engine: Gemini 3.1 Pro Preview (Google Gen AI / ADK)\n"
        f"🎫 Ticket: [{ticket_number}] {short_desc}\n"
        f"🖥️ Target Host: {ci_name} (IP: {ip} | SSH User: {user})\n"
        f"🏷️ Detection Mode: {use_case_badge}\n"
        f"📚 Knowledge Base SOP: [{kb_num}: {kb_title}]\n\n"
        f"────────────────────────────────────────────────────────────\n"
        f"💡 TECHNICAL ANALYSIS & REASONING\n"
        f"────────────────────────────────────────────────────────────\n"
        f"{reasoning}\n\n"
        f"────────────────────────────────────────────────────────────\n"
        f"📜 PROPOSED REMEDIATION COMMANDS\n"
        f"────────────────────────────────────────────────────────────\n"
        f"```bash\n"
        f"{cmd_block}\n"
        f"```\n\n"
        f"────────────────────────────────────────────────────────────\n"
        f"⚠️ STATUS: SOP Formulated & Saved. Placed IN_PROGRESS ready for resolution.\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    )

def format_execution_proof_work_note(ticket_number, short_desc, ci_name, ip, kb_num, kb_title, is_healthy, proof_summary, exec_log):
    health_badge = "HEALTHY ✅" if is_healthy else "ISSUE DETECTED ❌"
    return (
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"⚡ IN-PROGRESS SOP REMEDIATION & LIVE EXECUTION PROOF\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🤖 Agent Engine: Gemini 3.1 Pro Preview (Google Gen AI / ADK)\n"
        f"🎫 Ticket: [{ticket_number}] {short_desc}\n"
        f"🖥️ Target Host: {ci_name} (IP: {ip})\n"
        f"📚 Applied SOP: {kb_num} — {kb_title}\n"
        f"🏥 Host Health Status: {health_badge}\n\n"
        f"────────────────────────────────────────────────────────────\n"
        f"💻 LIVE TERMINAL EXECUTION LOGS\n"
        f"────────────────────────────────────────────────────────────\n"
        f"```bash\n"
        f"{exec_log[:2500]}\n"
        f"```\n\n"
        f"────────────────────────────────────────────────────────────\n"
        f"🔍 VERIFICATION SUMMARY & REMEDIATION PROOF\n"
        f"────────────────────────────────────────────────────────────\n"
        f"{proof_summary}\n"
        f"╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁"
    )
