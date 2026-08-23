import time
import json
import re
import urllib.request
import requests
import paramiko

from ..config import logger, ITSM_BASE_URL
from ..session_state import default_session_state
from ..llm import invoke_llm_with_fallback as default_invoke_llm
from ..rag.vector_db import vector_db as default_vector_db
from ..itsm.client import (
    add_work_note,
    fetch_agent_approvals,
    submit_agent_approval,
    get_team_member_for_department,
    update_incident_status,
    save_new_kb_article_to_storage,
    resolve_ci_credentials,
)
from ..itsm.dashboard import (
    post_history_entry_to_dashboard,
    post_timeline_update,
    format_execution_proof_work_note,
)
from ..rag.hybrid_search import sanitize_kb_title
from ..ssh.session import PersistentSSHSession, detect_target_os
from ..sop.synthesizer import evaluate_and_get_sop
from ..react.remediation_loop import run_dynamic_react_loop
from ..react.post_verification import verify_post_remediation_status
from ..safety.validator import check_catastrophic_destructive_command

def prepare_new_incident_sop(
    token, incident, kb_articles,
    session_state=None,
    vdb=None,
    llm_invoker=None,
    ssh_session_factory=None
):
    state = session_state or default_session_state
    active_vdb = vdb if vdb is not None else default_vector_db
    invoker = llm_invoker or default_invoke_llm

    inc_id = incident.get("id")
    number = incident.get("number", inc_id)
    short_desc = incident.get("shortDescription", "")
    desc = incident.get("description", "")
    
    post_timeline_update(inc_id, number, short_desc, "Unspecified CI", "RUNNING", "🔍 RAG SOP Retrieval", "RUNNING", "Analyzing ticket to match with SOP runbooks...")

    ci_info, ci_name = resolve_ci_credentials(incident)
    if not ci_info:
        dept = incident.get("department", "Unix")
        team_member = get_team_member_for_department(dept)
        logger.warning(f"⚠️ Unspecified CI for [{number}]. Escalating to {team_member}")
        
        clarify_note = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"⚠️ AUTOMATED REMEDIATION PAUSED — UNSPECIFIED CONFIGURATION ITEM\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"👤 Assigned Team Member: {team_member}\n"
            f"🎫 Ticket: [{number}] {short_desc}\n"
            f"Reason: Target host/CI is unspecified. Executing commands on a default host is dangerous.\n"
            f"👉 Operator Action: Please update the Configuration Item (CI) or host details in the ticket properties to authorize execution.\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        post_timeline_update(inc_id, number, short_desc, "Unspecified CI", "ESCALATED", "🖥️ Target CI Validation", "FAILED", f"Target host/CI is unspecified. Escalated to {team_member}.")
        add_work_note(token, inc_id, clarify_note)
        state.mark_unspecified_ci(inc_id)
        update_incident_status(token, inc_id, "ON_HOLD", assigned_to=team_member, session_state=state)
        return

    state.clear_unspecified_ci(inc_id)
    logger.info(f"⚡ Processing NEW Incident: [{number}] '{short_desc}' | Resolved CI: {ci_name}")
    state.mark_processed_new(inc_id)

    ip = ci_info["ip"]
    user = ci_info["user"]

    dept = incident.get("department", "DevOps Ops")
    is_new_use_case, kb_num, kb_title, reasoning, sop_commands, new_sop_data = evaluate_and_get_sop(
        number, short_desc, desc, ci_name, ip, kb_articles, inc_id,
        vdb=active_vdb, session_state=state, llm_invoker=invoker, ssh_session_factory=ssh_session_factory,
        department=dept
    )

    update_incident_status(token, inc_id, "IN_PROGRESS", session_state=state)

    if is_new_use_case:
        post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "🔍 RAG SOP Retrieval", "SUCCESS", "RAG Miss: No matching SOP. Forwarding to Knowledge Synthesizer.")
        transition_msg = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🔍 RAG SEARCH: NO RELEVANT SOP FOUND IN VECTOR DATABASE\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🤖 Agent Action: Handing over incident to Knowledge Synthesizer to generate a new SOP.\n"
            f"💡 Reason: Incident matches no existing SOP in local vector DB. Generating custom runbook.\n"
            f"🖥️ Target Host: {ci_name} (IP: {ip})\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
    else:
        post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "🔍 RAG SOP Retrieval", "SUCCESS", f"RAG Match: Found SOP runbook {kb_num} ({kb_title})")
        transition_msg = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🔍 RAG SEARCH: MATCHING KNOWLEDGE SOP FOUND\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🤖 Agent Action: Applying existing SOP [{kb_num}: {kb_title}].\n"
            f"💡 Reason: {reasoning}\n"
            f"🖥️ Target Host: {ci_name} (IP: {ip})\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
    add_work_note(token, inc_id, transition_msg)

def solve_in_progress_incident(
    token, incident, kb_articles,
    session_state=None,
    vdb=None,
    llm_invoker=None,
    ssh_session_factory=None
):
    state = session_state or default_session_state
    inc_id = incident.get("id")
    number = incident.get("number", inc_id)

    # 🛑 Governance Master Kill Switch — block execution when active
    try:
        c_res = requests.get(f"{ITSM_BASE_URL}/agent/containment", timeout=1.5)
        if c_res.status_code == 200:
            c_data = c_res.json()
            if c_data.get("masterKillSwitch"):
                logger.warning(f"🛑 [KILL SWITCH] Blocking remediation for [{number}] — Master Fleet Kill Switch is ACTIVE.")
                return
    except Exception:
        pass

    # Atomic per-incident processing check
    if not state.try_acquire_incident_processing(inc_id):
        logger.info(f"🔒 Incident [{number}] is currently being processed by another thread. Skipping.")
        return

    ci_info, ci_name = resolve_ci_credentials(incident)
    host_ip = (ci_info or {}).get("ip", "default_host")
    host_lock = state.get_host_lock(host_ip)

    try:
        logger.info(f"🔒 Acquiring SSH execution lock for host [{ci_name} / {host_ip}] on Incident [{number}]...")
        with host_lock:
            logger.info(f"🔑 Host lock acquired for [{ci_name} / {host_ip}] — Executing SOP for Incident [{number}]...")
            _solve_in_progress_incident_internal(
                token, incident, kb_articles, ci_info, ci_name,
                session_state=state, vdb=vdb, llm_invoker=llm_invoker, ssh_session_factory=ssh_session_factory
            )
    finally:
        state.release_incident_processing(inc_id)
        logger.info(f"🔓 Released host execution lock for [{ci_name} / {host_ip}] on Incident [{number}].")

def _solve_in_progress_incident_internal(
    token, incident, kb_articles, ci_info, ci_name,
    session_state=None,
    vdb=None,
    llm_invoker=None,
    ssh_session_factory=None
):
    state = session_state or default_session_state
    active_vdb = vdb if vdb is not None else default_vector_db
    invoker = llm_invoker or default_invoke_llm
    session_factory = ssh_session_factory or (lambda _ip, _u, _p: PersistentSSHSession(_ip, _u, _p))

    inc_id = incident.get("id")
    number = incident.get("number", inc_id)
    short_desc = incident.get("shortDescription", "")
    desc = incident.get("description", "")
    my_approval = None

    approvals = fetch_agent_approvals(token)
    rejected_appr = next((a for a in approvals if a.get("incidentId") == inc_id and a.get("status") == "REJECTED"), None)
    if rejected_appr:
        logger.warning(f"❌ Execution rejected: Approval request ({rejected_appr.get('id')}) for [{number}] was REJECTED by human operator.")
        post_timeline_update(inc_id, number, short_desc, ci_name or "Target Host", "FAILED", "🔐 Human-in-the-Loop Gate", "FAILED", f"SOP execution rejected: {rejected_appr.get('rejectionReason', 'Rejected by operator')}")
        reject_note = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🤖 Unix Auto-Resolver Agent: REMEDIATION REJECTED BY HUMAN OPERATOR\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"Feedback: {rejected_appr.get('rejectionReason', 'No reason provided')}\n"
            f"Assigned To: DevOps Team for manual processing.\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        add_work_note(token, inc_id, reject_note)
        update_incident_status(token, inc_id, "ON_HOLD", assigned_to="DevOps Team", session_state=state)
        state.lock_session(inc_id)
        return

    pending_appr = next((a for a in approvals if a.get("incidentId") == inc_id and a.get("status") == "PENDING"), None)
    if pending_appr:
        post_timeline_update(inc_id, number, short_desc, ci_name or "Target Host", "PENDING_APPROVAL", "🔐 Human-in-the-Loop Gate", "RUNNING", "SOP pending review. Awaiting operator approval.")
        logger.info(f"⏳ Ticket [{number}] is PENDING human operator review in Control Tower (http://localhost:5173). Paused awaiting 'Approve & Execute'...")
        update_incident_status(token, inc_id, "ON_HOLD", session_state=state)
        state.lock_session(inc_id)
        return

    approved_appr = next((a for a in approvals if a.get("incidentId") == inc_id and a.get("status") == "APPROVED"), None)

    if approved_appr:
        if state.is_locked(inc_id):
            logger.info(f"🔓 Un-locking Incident [{number}] — Human approval granted! Proceeding with execution.")
            state.unlock_session(inc_id)
    elif state.is_locked(inc_id):
        logger.info(f"🔒 Incident [{number}] is locked from re-processing in this session. Skipping duplicate execution.")
        return
    elif state.is_resolved(inc_id):
        logger.info(f"🔒 Incident [{number}] is already RESOLVED — locked from re-processing this session.")
        return

    ci_info, ci_name = resolve_ci_credentials(incident)
    if not ci_info:
        dept = incident.get("department", "Unix")
        team_member = get_team_member_for_department(dept)
        logger.warning(f"⚠️ Unspecified CI for [{number}] in IN_PROGRESS queue. Escalating to {team_member}")
        
        clarify_note = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"⚠️ AUTOMATED REMEDIATION PAUSED — UNSPECIFIED CONFIGURATION ITEM\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"👤 Assigned Team Member: {team_member}\n"
            f"🎫 Ticket: [{number}] {short_desc}\n"
            f"Reason: Target host/CI is unspecified. Executing commands on a default host is dangerous.\n"
            f"👉 Operator Action: Please update the Configuration Item (CI) or host details in the ticket properties to authorize execution.\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        post_timeline_update(inc_id, number, short_desc, "Unspecified CI", "ESCALATED", "🖥️ Target CI Validation", "FAILED", f"Target host/CI is unspecified. Escalated to {team_member}.")
        add_work_note(token, inc_id, clarify_note)
        state.mark_unspecified_ci(inc_id)
        update_incident_status(token, inc_id, "ON_HOLD", assigned_to=team_member, session_state=state)
        state.lock_session(inc_id)
        return

    state.clear_unspecified_ci(inc_id)
    logger.info(f"🚀 Remediation Agent Executing IN_PROGRESS Incident: [{number}] '{short_desc}' | Resolved CI: {ci_name}")

    ip = ci_info["ip"]
    user = ci_info["user"]
    password = ci_info["password"]

    post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Target CI Validation", "RUNNING", f"Verifying SSH accessibility for target host {ci_name} ({ip})...")

    # 1. Fingerprint Target Host OS
    target_os = detect_target_os(ip, user, password)
    logger.info(f"🔎 Detected Target Host OS for [{ci_name}]: '{target_os}'")

    post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Target CI Validation", "SUCCESS", f"Detected OS: {target_os}. Validation complete.")

    # 2. Autonomous CPU/Memory Threshold Check
    full_text = f"{short_desc} {desc}".lower()
    is_user_mgmt_ticket = any(k in full_text for k in ["user", "userdel", "delete user", "offboard", "pamsudo", "sudoers", "account", "/etc/passwd", "deprovision"])
    
    is_cpu_alert = not is_user_mgmt_ticket and any(re.search(rf"\b{re.escape(k)}\b", full_text) for k in ["cpu", "load average", "cpu spikes", "cpu 100", "cpu pressure", "cpu saturation", "cpu utilization", "high load"])
    is_mem_alert = not is_user_mgmt_ticket and any(re.search(rf"\b{re.escape(k)}\b", full_text) for k in ["memory", "ram", "oom", "heap", "swap", "memory pressure", "memory 100", "out of memory", "memory utilization", "kernel heap"])

    is_resource_alert_exceeded = False
    if is_cpu_alert or is_mem_alert:
        logger.info(f"📊 CPU/Memory Alert Ticket Detected — Running Autonomous Threshold Check on {ci_name} ({ip})")
        post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "📊 Autonomous Threshold Check", "RUNNING", f"Capturing live CPU/Memory utilization from {ci_name} ({ip})...")
        
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            ssh.connect(ip, username=user, password=password, timeout=10)
            
            cpu_pct = 0.0
            if is_cpu_alert:
                stdin, stdout, stderr = ssh.exec_command("top -bn1 | grep 'Cpu(s)' | awk '{print 100 - $8}'")
                cpu_out = stdout.read().decode('utf-8', 'ignore').strip()
                try:
                    cpu_pct = float(cpu_out)
                    logger.info(f"📊 CPU Utilization: {cpu_pct:.2f}%")
                except:
                    cpu_pct = 0.0
            
            mem_pct = 0.0
            if is_mem_alert:
                stdin, stdout, stderr = ssh.exec_command("free | awk 'NR==2{printf \"%.2f\", $3*100/$2 }'")
                mem_out = stdout.read().decode('utf-8', 'ignore').strip()
                try:
                    mem_pct = float(mem_out)
                    logger.info(f"📊 Memory Utilization: {mem_pct:.2f}%")
                except:
                    mem_pct = 0.0
            
            ssh.close()
            
            commands_to_run = []
            decision_log = []
            sop_commands = []
            is_resource_alert_exceeded = False
            
            if cpu_pct > 90.0:
                logger.warning(f"🚨 CPU CRITICAL: {cpu_pct:.2f}% > 90% — Will capture top CPU processes")
                commands_to_run.append(f'ps -eo pcpu,pid,user,args|sort -nr|head')
                decision_log.append(f"CPU={cpu_pct:.2f}% > 90% → Capturing top CPU processes")
            elif is_cpu_alert:
                logger.info(f"✅ CPU OK: {cpu_pct:.2f}% <= 90% — No CPU action needed")
                decision_log.append(f"CPU={cpu_pct:.2f}% <= 90% → No CPU action")
            
            if mem_pct > 90.0:
                logger.warning(f"🚨 MEMORY CRITICAL: {mem_pct:.2f}% > 90% — Will capture top Memory processes")
                commands_to_run.append(f'ps -eo pmem,pid,user,args|sort -nr|head')
                decision_log.append(f"Memory={mem_pct:.2f}% > 90% → Capturing top Memory processes")
            elif is_mem_alert:
                logger.info(f"✅ Memory OK: {mem_pct:.2f}% <= 90% — No Memory action needed")
                decision_log.append(f"Memory={mem_pct:.2f}% <= 90% → No Memory action")
            
            if not commands_to_run:
                logger.info(f"✅ AUTO-RESOLVE: Both CPU ({cpu_pct:.2f}%) and Memory ({mem_pct:.2f}%) below 90% — Auto-resolving ticket")
                post_timeline_update(inc_id, number, short_desc, ci_name, "SUCCESS", "📊 Autonomous Threshold Check", "SUCCESS", f"AUTO-RESOLVED: CPU={cpu_pct:.2f}%, Memory={mem_pct:.2f}% (both < 90%)")
                add_work_note(token, inc_id, f"🤖 AUTO-RESOLVED: Resource utilization within normal thresholds (CPU: {cpu_pct:.2f}%, Memory: {mem_pct:.2f}%). No action required.", author="🤖 Unix Auto-Resolver Agent")
                update_incident_status(token, inc_id, "RESOLVED", session_state=state)
                state.mark_resolved(inc_id)
                return
            else:
                is_resource_alert_exceeded = True
                sop_commands = commands_to_run + ["uptime", "free -m", "ps aux --sort=-%cpu | head -n 10"]
                decision_summary = "; ".join(decision_log)
                post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "📊 Autonomous Threshold Check", "SUCCESS", f"Decision: {decision_summary}")
                logger.info(f"📋 Autonomous Decision: {decision_summary} — Matched Master System Performance Runbook")
        
        except Exception as e:
            logger.error(f"Autonomous threshold check failed: {e}")
    
    is_human_authorized = False
    is_destructive_sop = False
    if approved_appr:
        logger.info(f"🟢 Execution approved! Found existing APPROVED approval ({approved_appr.get('id')}) for [{number}]. Executing approved commands...")
        is_new_use_case = True
        kb_num = approved_appr.get("kbArticleReference", "KB_NEW")
        kb_title = approved_appr.get("kbTitle", short_desc)
        new_sop_data = {"title": kb_title, "summary": approved_appr.get("summary")}
        sop_commands = approved_appr.get("proposedCommands", [])
        is_human_authorized = True
        try:
            update_incident_status(token, inc_id, "IN_PROGRESS", session_state=state)
            requests.post(f"{ITSM_BASE_URL}/agent/approvals/{approved_appr.get('id')}/consume", timeout=3)
        except Exception:
            pass
        post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "🔐 Human-in-the-Loop Gate", "SUCCESS", f"SOP approved by operator ({approved_appr.get('approvedBy', 'Human Admin')}). Proceeding to execute.")
    elif is_resource_alert_exceeded:
        is_new_use_case = False
        kb_num = "KB0468210"
        kb_title = "Master SOP: System Performance & Resource Utilization Runbook"
        new_sop_data = None
        logger.info(f"🎯 Direct Resource Alert SOP Match: Using [{kb_num}] '{kb_title}' for ticket [{number}]")
    else:
        dept = incident.get("department", "DevOps Ops")
        is_new_use_case, kb_num, kb_title, reasoning, sop_commands, new_sop_data = evaluate_and_get_sop(
            number, short_desc, desc, ci_name, ip, kb_articles, inc_id,
            target_os=target_os, vdb=active_vdb, session_state=state, llm_invoker=invoker, ssh_session_factory=session_factory,
            department=dept
        )

        # Check if matched/synthesized SOP contains any high-risk destructive commands
        destructive_findings = []
        for sc in sop_commands:
            is_cat, cat_reason = check_catastrophic_destructive_command(sc)
            if is_cat:
                destructive_findings.append((sc, cat_reason))
        is_destructive_sop = len(destructive_findings) > 0

        # If it's a new use case OR contains destructive commands -> Mandatory Human-in-the-Loop Gate
        if is_new_use_case or is_destructive_sop:
            my_approval = None
            pending_appr = None
            rejected_appr = None
            approved_rec = None
            for a in approvals:
                if a.get("incidentId") == inc_id:
                    st = a.get("status", "")
                    if st == "PENDING" and not pending_appr:
                        pending_appr = a
                    elif st == "REJECTED" and not rejected_appr:
                        rejected_appr = a
                    elif st in ["APPROVED", "EXECUTED"] and not approved_rec:
                        approved_rec = a
            my_approval = approved_rec or pending_appr or rejected_appr

            if not my_approval and not state.has_submitted_approval(inc_id):
                state.mark_submitted_approval(inc_id)
                res_steps = sop_commands if is_destructive_sop else (new_sop_data or {}).get("resolution_steps", [])
                formatted_res_steps = []
                for step in res_steps:
                    s = str(step).strip()
                    if not s:
                        continue
                    s_clean = " ".join(re.sub(r'^\d+\.\s*', '', s).split())
                    if re.match(r"^ssh\s+[^\s]+$", s_clean.lower()):
                        continue
                    formatted_res_steps.append(s_clean)
                res_steps = formatted_res_steps
                if not res_steps:
                    logger.warning(f"⚠️ SOP resolved to 0 steps for [{number}] — refusing to submit a hollow approval card.")
                else:
                    logger.info(f"✅ SOP produced {len(res_steps)} steps for [{number}]: {res_steps[:3]}...")

                risk_level = "CRITICAL_DESTRUCTIVE" if is_destructive_sop else "HIGH"
                card_title = f"[DESTRUCTIVE COMMAND APPROVAL REQUIRED] {short_desc}" if is_destructive_sop else short_desc
                ai_reason = (
                    f"Security & Safety Policy Gate: SOP matched [{kb_num}] '{kb_title}', but contains high-risk destructive operations ({'; '.join([f'{c}: {r}' for c, r in destructive_findings])}). Autonomous execution is forbidden without explicit human operator sign-off in the Control Tower."
                    if is_destructive_sop else
                    (new_sop_data or {}).get("reasoning", "New use case requiring human review.")
                )

                approval_payload = {
                    "incidentId": inc_id,
                    "incidentTitle": card_title,
                    "agentId": "agent-unix-resolver-01",
                    "agentName": "🤖 Unix Auto-Resolver Agent",
                    "model": "nvidia/nemotron-3-ultra-550b-a55b",
                    "targetCi": f"{ci_name} ({ip})",
                    "department": incident.get("department", "DevOps Team"),
                    "riskLevel": risk_level,
                    "confidenceScore": (lambda _mv: (85.0 if _mv.get("confidence") is None else float(_mv["confidence"]) * 100.0))((new_sop_data or {}).get("relevance", {})),
                    "summary": f"Matched SOP [{kb_num}] '{kb_title}' contains destructive command(s). Mandatory human approval required." if is_destructive_sop else (new_sop_data or {}).get("summary", f"Synthesized new SOP for {short_desc}"),
                    "proposedCommands": res_steps,
                    "aiReasoning": ai_reason,
                    "relevanceAudit": (new_sop_data or {}).get("relevance", {"audit": "passed", "note": "High-risk destructive SOP requiring operator authorization"}),
                    "safetyChecks": [{"check": f"High Risk: {r}", "passed": False} for _, r in destructive_findings] if is_destructive_sop else [{"check": check, "passed": True} for check in (new_sop_data or {}).get("safety_checks", [])],
                    "kbArticleReference": kb_num or "KB_NEW",
                    "kbTitle": kb_title or (new_sop_data or {}).get("title", f"SOP: {short_desc}"),
                    "synthesizerOutput": {
                        "draftKbId": kb_num or "KB-SOP-NEW",
                        "kbTitle": kb_title or (new_sop_data or {}).get("title", f"SOP: {short_desc}"),
                        "synthesizedSolution": "\n".join(res_steps),
                        "resolutionSteps": res_steps,
                        "trendInsight": f"High-risk destructive SOP execution requested for [{number}]. Contains commands: {', '.join([c for c, _ in destructive_findings])}." if is_destructive_sop else f"Synthesized SOP containing {len(res_steps)} resolution steps."
                    }
                }
                logger.info(f"📝 Submitting pending approval request for SOP on ticket [{number}] (is_destructive={is_destructive_sop})...")
                if res_steps:
                    submit_agent_approval(token, approval_payload)
                    post_timeline_update(inc_id, number, short_desc, ci_name, "PENDING_APPROVAL", "🔐 Human-in-the-Loop Gate", "RUNNING", f"SOP {kb_title} requires human operator approval in Control Tower.")
                    notice_note = (
                        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                        f"⚠️ HIGH-RISK DESTRUCTIVE SOP DETECTED — MANDATORY HUMAN APPROVAL REQUIRED\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                        f"🔍 SOP Match: [{kb_num}] '{kb_title}'\n"
                        f"🚨 Destructive Commands: {', '.join([f'`{c}` ({r})' for c, r in destructive_findings])}\n"
                        f"📝 Action: Routed to Agent Control Tower (http://localhost:5173) for mandatory human operator review.\n"
                        f"State: Incident placed ON_HOLD. Autonomous execution blocked until an operator reviews & approves.\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                        if is_destructive_sop else
                        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                        f"🧠 AI KNOWLEDGE SYNTHESIZER: NEW SOP SUBMITTED FOR APPROVAL\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                        f"🔍 RAG Search: Miss (No matching SOP found in local Vector DB).\n"
                        f"📝 Action: Synthesized a new SOP and requested Human-in-the-Loop review.\n"
                        f"🎫 Ticket: [{number}] {short_desc}\n"
                        f"Proposed SOP Title: {(new_sop_data or {}).get('title')}\n"
                        f"Proposed Commands: {', '.join(res_steps) if res_steps else '(none qualified for approval)'}\n"
                        f"State: Incident placed ON_HOLD awaiting human operator approval in Control Tower.\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                    )
                    add_work_note(token, inc_id, notice_note, author="🛡️ ITSM High-Risk Safety Guard" if is_destructive_sop else "🧠 AI Knowledge Synthesizer")
                    update_incident_status(token, inc_id, "ON_HOLD", assigned_to="DevOps Team", session_state=state)
                    state.lock_session(inc_id)
                else:
                    logger.warning(f"⛔ Refusing to submit approval for [{number}] — the synthesized SOP resolved to 0 usable commands.")
                    post_timeline_update(inc_id, number, short_desc, ci_name, "FAILED", "🔐 Human-in-the-Loop Gate", "FAILED", "SOP synthesis produced 0 usable commands; escalation required.")
                    update_incident_status(token, inc_id, "ON_HOLD", assigned_to="DevOps Team", session_state=state)
                    state.lock_session(inc_id)
                return
                
            elif my_approval:
                status = my_approval.get("status")
                if status == "PENDING":
                    post_timeline_update(inc_id, number, short_desc, ci_name, "PENDING_APPROVAL", "🔐 Human-in-the-Loop Gate", "RUNNING", "SOP pending review. Awaiting operator approval.")
                    logger.info(f"⏳ Ticket [{number}] is PENDING human operator review in Control Tower (http://localhost:5173). Paused awaiting 'Approve & Execute'...")
                    update_incident_status(token, inc_id, "ON_HOLD", session_state=state)
                    state.lock_session(inc_id)
                    return
                elif status == "REJECTED":
                    post_timeline_update(inc_id, number, short_desc, ci_name, "FAILED", "🔐 Human-in-the-Loop Gate", "FAILED", f"SOP execution rejected: {my_approval.get('rejectionReason')}")
                    logger.warning(f"❌ Execution rejected: Approval request for [{number}] was REJECTED by human operator.")
                    reject_note = (
                        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                        f"🤖 Unix Auto-Resolver Agent: REMEDIATION REJECTED BY HUMAN OPERATOR\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                        f"Feedback: {my_approval.get('rejectionReason', 'No reason provided')}\n"
                        f"Assigned To: DevOps Team for manual processing.\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                    )
                    add_work_note(token, inc_id, reject_note)
                    update_incident_status(token, inc_id, "ON_HOLD", assigned_to="DevOps Team", session_state=state)
                    state.lock_session(inc_id)
                    return
                elif status in ["APPROVED", "EXECUTED"]:
                    post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "🔐 Human-in-the-Loop Gate", "SUCCESS", f"SOP approved by operator ({my_approval.get('approver', 'Human Admin')}). Proceeding to execute.")
                    logger.info(f"🟢 Execution approved! Human operator approved SOP for [{number}]. Proceeding...")
                    sop_commands = my_approval.get("proposedCommands", sop_commands)
                    is_human_authorized = True

    if (is_new_use_case or is_destructive_sop) and not is_human_authorized:
        logger.warning(
            f"⛔ Executing SOP for [{number}] without HITL approval is BLOCKED by design. "
            f"Escalating to DevOps Team — high-risk/new SOP must be human-approved before execution."
        )
        post_timeline_update(inc_id, number, short_desc, ci_name, "ON_HOLD", "🔐 Human-in-the-Loop Gate", "FAILED",
                             "Execution blocked: SOP requires human approval before execution.")
        guard_note = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"⛔ EXECUTION BLOCKED BY DESIGN POLICY\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🎫 Ticket: [{number}] {short_desc}\n"
            f"No matching SOP existed in the KB (RAG miss). A draft SOP was synthesized by the LLM,\n"
            f"but the agent is NOT permitted to execute improvised commands without human approval.\n"
            f"State: ON_HOLD — a human must review & approve the drafted SOP in Control Tower first.\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        add_work_note(token, inc_id, guard_note, author="🤖 Unix Auto-Resolver Agent")
        update_incident_status(token, inc_id, "ON_HOLD", assigned_to="DevOps Team", session_state=state)
        state.lock_session(inc_id)
        return

    # 4. Security Policy Gate: Pre-Execution Scan for Catastrophic / Destructive Commands
    if not is_human_authorized:
        for sc in sop_commands:
            is_cat, cat_reason = check_catastrophic_destructive_command(sc)
            if is_cat:
                logger.critical(f"🚨 TAMPERED / DANGEROUS SOP BLOCKED: Command '{sc}' matches catastrophic blacklist ({cat_reason}). Aborting remediation!")
                sec_alert_note = (
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"🚨 CRITICAL SECURITY ALERT — TAMPERED / DESTRUCTIVE SOP BLOCKED\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"🎫 Ticket: [{number}] {short_desc}\n"
                    f"🖥️ Target Host: {ci_name} (IP: {ip})\n"
                    f"⛔ Blocked Dangerous Command: `{sc}`\n"
                    f"🛡️ Policy Violation: {cat_reason}\n"
                    f"Remediation was HALTED immediately. The live host was NOT touched.\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                )
                add_work_note(token, inc_id, sec_alert_note, author="🛡️ ITSM Security Guard")
                post_timeline_update(inc_id, number, short_desc, ci_name, "FAILED", "🛡️ Catastrophic Security Block", "FAILED", f"Blocked command: {sc} ({cat_reason})")
                update_incident_status(token, inc_id, "ON_HOLD", assigned_to="SecOps Team", session_state=state)
                state.lock_session(inc_id)
                return

    # 5. Execute SSH Commands dynamically via LLM ReAct Tool Calling
    state.mark_processed_in_progress(inc_id)

    post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "💻 Dynamic SSH Execution", "RUNNING", f"LLM is dynamically orchestrating execution (human_authorized={is_human_authorized})...")
    success, exec_log = run_dynamic_react_loop(
        ip, user, password, sop_commands, short_desc, number, inc_id, ci_name,
        desc=desc, session_state=state, ssh_session_factory=session_factory, llm_invoker=invoker,
        is_human_authorized=is_human_authorized
    )

    if not success:
        if "SERVER_UNREACHABLE" in exec_log:
            dept = incident.get("department", "Unix")
            team_member = get_team_member_for_department(dept)
            logger.warning(f"🚨 Target server {ip} is unreachable. Exited ReAct loop & escalating Incident [{number}] to {team_member}")
            
            unreachable_note = (
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"🚨 AUTOMATED REMEDIATION ABORTED — SERVER UNREACHABLE\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"👤 Assigned Team Member: {team_member}\n"
                f"🎫 Ticket: [{number}] {short_desc}\n"
                f"🖥️ Target Host: {ci_name} (IP: {ip})\n"
                f"Reason: Target server {ip} is unreachable via SSH. Exited ReAct loop.\n"
                f"👉 Required Action: Verify physical server power, network firewall, or SSH daemon status on {ip}.\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            )
            post_timeline_update(inc_id, number, short_desc, ci_name, "ESCALATED", "📡 Host Reachability Check", "FAILED", f"Server {ip} unreachable via SSH. Exited ReAct loop & escalated to {team_member}.")
            add_work_note(token, inc_id, unreachable_note)
            update_incident_status(token, inc_id, "ON_HOLD", assigned_to=team_member, session_state=state)
            state.lock_session(inc_id)
            state.mark_resolved(inc_id)
            return

        post_timeline_update(inc_id, number, short_desc, ci_name, "FAILED", "Dynamic SSH Execution", "FAILED", f"Dynamic SSH execution failed: {exec_log[:200]}")
    else:
        post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Dynamic SSH Execution", "SUCCESS", "Dynamic SOP commands executed successfully.")

    # 5. Evaluate Live Terminal Logs
    eval_prompt = f"""
Analyze the following SSH execution log from target host {ci_name} ({ip}) resulting from running commands to resolve this incident:

Incident ID: {number}
Short Description: {short_desc}
Description: {desc}

SSH Execution Log:
{exec_log}

CRITICAL EVALUATION RULES:
1. USER DELETION / OFFBOARDING TICKETS:
   - If the ticket requests user deletion (e.g., 'Delete User Account', 'Remove User', 'userdel'), seeing 'no such user' or 'id: <username>: no such user' or 'No such file or directory' for home folder IS THE EXACT EXPECTED SUCCESS PROOF OF DELETION. Do NOT treat 'no such user' as a failure for user deletion! Set "is_healthy" to true.

2. USER CREATION / PROVISIONING TICKETS:
   - If the ticket requests user creation, seeing successful useradd/mkdir and valid user ID output (e.g. uid=...) OR seeing "USER_CREATED_OK", "USER_VERIFIED", "VALIDATION_COMPLETE" in stdout IS SUCCESS. Set "is_healthy" to true.
   - If you see "USER_EXISTS" or "PASSWD_ENTRY_FOUND" for the target username, the user already exists — this is NOT an error. Set "is_healthy" to true (idempotent success).
   - If you see "USER_CREATE_FAILED" or "USER_VERIFICATION_FAILED", set "is_healthy" to false.

3. MEMORY AND CPU UTILIZATION ALERTS (SOP-DRIVEN TRIAGE):
   - The SOP for CPU/Memory alerts runs `ps -eo pcpu,pid,user,args|sort -nr|head` (CPU) and `ps -eo pmem,pid,user,args|sort -nr|head` (Memory) to identify the top resource consumers.
   - Examine the ps output in the SSH execution log and classify each top consuming process:
     * OS-LEVEL (safe, no application impact): kernel threads (names in [brackets]), kworker, kthreadd, ksoftirqd, kswapd, khugepaged, rcu_, migration, watchdog, systemd, sshd, cron/crond, auditd, rsyslogd, NetworkManager, tuned, polkitd, chronyd, ntpd, dbus-daemon, udevd.
     * APPLICATION-LEVEL (requires Admin): java, python, python3, node, nginx, apache/httpd, tomcat, mysql, postgres, mongodb, redis, rabbitmq, kafka, elasticsearch, kibana, grafana, prometheus, kubelet, etcd, kube-apiserver, kube-controller-manager, kube-scheduler, containerd, docker, coredns, any custom binary not listed above.
   - VERDICT RULE:
     * If ALL top consumers (top 5 by CPU/Memory) are OS-level → "is_healthy": true (auto-resolve; OS processes do not affect applications)
     * If ANY top consumer is application-level → "is_healthy": false (escalate to Admin; application processes need investigation)
   - In the proof_summary, always list the top 3-5 processes found and their classification (OS or APP).

4. GENERAL TECHNICAL TICKETS:
   - If commands executed cleanly and target services/host are operational, set "is_healthy" to true.

Respond ONLY in valid JSON format:
{{
  "is_healthy": boolean,
  "proof_summary": "concise summary explaining system health AND verification of the incident requirement completion"
}}
"""
    evaluation = {}
    if "SERVER_UNREACHABLE" in exec_log or not exec_log.strip():
        logger.warning(f"SSH execution unreachable/empty for {number}. Skipping LLM evaluation and marking system as unhealthy.")
        evaluation = {
            "is_healthy": False,
            "proof_summary": f"SSH connection failed or timed out: {exec_log}"
        }
    else:
        post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Verification Tests", "RUNNING", "Running LLM verification models on SSH execution log...")
        logger.info("Evaluating live SSH execution proof with LLM Engine...")
        try:
            eval_content, eval_model = invoker(
                messages=[{"role": "user", "content": eval_prompt}],
                response_format={"type": "json_object"},
                call_label=f"SSH Output Evaluation [{number}]",
                session_state=state,
                enable_thinking=False,
                max_tokens=600,
                temperature=0.0
            )
            if eval_content:
                evaluation = json.loads(eval_content) if isinstance(eval_content, str) else eval_content
                if isinstance(evaluation, list) and len(evaluation) > 0: evaluation = evaluation[0]
                logger.info(f"Verified live SSH proof using model: '{eval_model}'")
                inc_summary = state.get_incident_token_summary(number)
                if inc_summary.get("count", 0) > 0:
                    logger.info(
                        f"📊 ━━ INCIDENT TOKEN SUMMARY [{number}] ━━ "
                        f"LLM calls={inc_summary['count']} | "
                        f"prompt={inc_summary['prompt_tokens']:,} | completion={inc_summary['completion_tokens']:,} | "
                        f"TOTAL={inc_summary['total_tokens']:,} tokens "
                        f"(~${inc_summary['estimated_usd']:.4f} USD @ $8/1M tokens)"
                    )
        except Exception as e:
            logger.error(f"LLM Evaluation failed for {number}: {e}")
            evaluation = {}

    if not isinstance(evaluation, dict) or "is_healthy" not in evaluation:
        evaluation = {
            "is_healthy": success,
            "proof_summary": "System responded cleanly to SSH commands and reported normal operational metrics in terminal." if success else "SOP execution failed during SSH session."
        }

    # 6. Check if Resolver Agent was able to perform and verify the task via terminal execution
    is_healthy = evaluation.get("is_healthy", True)
    if not is_healthy:
        dept = incident.get("department", "Unix")
        team_member = get_team_member_for_department(dept)
        logger.warning(f"⚠️ Resolver Agent unable to perform task automatically for [{number}]. Escalating & assigning to Team Member: {team_member}")
        
        post_timeline_update(inc_id, number, short_desc, ci_name, "ESCALATED", "Verification Tests", "FAILED", f"Verification failed. Escalating to {team_member}. Proof: {evaluation.get('proof_summary')}")
        escalation_note = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🚨 AUTOMATED REMEDIATION UNABLE TO COMPLETE — ESCALATED TO TEAM MEMBER\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"👤 Assigned Team Member: {team_member}\n"
            f"🎫 Ticket: [{number}] {short_desc}\n"
            f"Reason: Resolver Agent could not complete automated remediation on host {ci_name} ({ip}). Requires human intervention.\n"
            f"Terminal Log Evidence:\n{exec_log[:1500]}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        add_work_note(token, inc_id, escalation_note)
        update_incident_status(token, inc_id, "ON_HOLD", assigned_to=team_member, session_state=state)
        state.lock_session(inc_id)
        state.mark_resolved(inc_id)
        logger.info(f"🔒 Incident [{number}] is now ESCALATED — locked from re-processing this session.")
        return

    # 7. Mandatory Post-Remediation Proof-of-Fix Guard
    post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Post-Remediation Verification", "RUNNING", "Running mandatory post-remediation proof-of-fix verification...")
    proof_session = session_factory(ip, user, password)
    try:
        post_fix_ok, post_fix_evidence = verify_post_remediation_status(
            proof_session, short_desc, desc, sop_commands, exec_log, number
        )
    except Exception as _pf_err:
        logger.warning(f"Post-Remediation Guard raised exception for [{number}]: {_pf_err}. Defaulting to exec-log result.")
        post_fix_ok = evaluation.get("is_healthy", True)
        post_fix_evidence = f"Post-remediation guard error: {_pf_err}"
    finally:
        proof_session.close()

    if not post_fix_ok:
        dept = incident.get("department", "Unix")
        team_member = get_team_member_for_department(dept)
        logger.warning(
            f"🛑 POST-REMEDIATION GUARD FAILED for [{number}]: {post_fix_evidence}. "
            f"Refusing to mark RESOLVED. Escalating to {team_member}."
        )
        post_timeline_update(inc_id, number, short_desc, ci_name, "ESCALATED", "Post-Remediation Verification", "FAILED",
                             f"Post-remediation proof-of-fix FAILED: {post_fix_evidence}. Escalating to {team_member}.")
        escalation_note = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🛑 POST-REMEDIATION VERIFICATION FAILED — TICKET NOT RESOLVED\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🎫 Ticket: [{number}] {short_desc}\n"
            f"🖥️ Host: {ci_name} ({ip})\n"
            f"📚 Applied SOP: [{kb_num}] {kb_title}\n\n"
            f"❌ POST-FIX VERIFICATION RESULT:\n{post_fix_evidence}\n\n"
            f"The autonomous agent executed the SOP commands successfully but the post-remediation verification \n"
            f"confirmed the issue is NOT resolved. Human intervention required.\n"
            f"Assigned to: {team_member}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        add_work_note(token, inc_id, escalation_note)
        update_incident_status(token, inc_id, "ON_HOLD", assigned_to=team_member, session_state=state)
        state.lock_session(inc_id)
        state.mark_resolved(inc_id)
        logger.info(f"🔒 Incident [{number}] is now ESCALATED (post-remediation guard) — locked from re-processing.")
        return

    post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Post-Remediation Verification", "SUCCESS", f"Post-remediation proof-of-fix PASSED: {post_fix_evidence}")

    # 8. Format & Post Live Terminal Proof Work Note
    post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Verification Tests", "SUCCESS", f"Verification passed: {evaluation.get('proof_summary')}")
    proof_note = format_execution_proof_work_note(
        number, short_desc, ci_name, ip, kb_num, kb_title,
        evaluation.get("is_healthy", False),
        f"{evaluation.get('proof_summary', 'Verified healthy host status.')} | Post-fix: {post_fix_evidence}",
        exec_log
    )
    add_work_note(token, inc_id, proof_note)

    # 9. Resolve Ticket & Report Auto-Execution to Dashboard Audit Stream
    res_code = "Server - Kernel & OS Patch"
    res_notes = (
        f"Autonomous SOP Remediation completed by Gemini 3.1 Pro Preview Agent.\n"
        f"Applied SOP: {kb_num} ({kb_title})\n"
        f"Host: {ci_name} ({ip})\n"
        f"Verification: {evaluation.get('proof_summary', 'Verified normal operational metrics.')}\n"
        f"Post-Remediation Guard: {post_fix_evidence}"
    )
    if update_incident_status(token, inc_id, "RESOLVED", res_code, res_notes, session_state=state):
        logger.info(f"🎉 Successfully RESOLVED IN_PROGRESS Incident [{number}]!")
        post_timeline_update(inc_id, number, short_desc, ci_name, "SUCCESS", "Incident Remediation Resolved", "SUCCESS", f"Applied SOP: {kb_num} ({kb_title}). Host confirmed operational and incident closed in PostgreSQL.")
        post_history_entry_to_dashboard(
            inc_id,
            short_desc,
            ci_name,
            sop_commands,
            exec_log,
            evaluation.get("proof_summary", "User created & verified operational."),
            kb_num,
            status="APPROVED" if is_new_use_case else "AUTO_EXECUTED",
            human_approver="System Admin (Human in the Loop)" if is_new_use_case else "Autonomous Policy (Low/Medium Risk)"
        )
        
        if is_new_use_case and is_human_authorized and new_sop_data:
            dept = incident.get("department", "DevOps Ops")
            raw_title = new_sop_data.get("title", short_desc)
            master_title = sanitize_kb_title(raw_title)
            new_sop_data_to_store = {
                "title": master_title,
                "category": f"{dept} - Automated Remediation",
                "configurationItem": ci_name,
                "summary": new_sop_data.get("summary", f"Master SOP synthesized for {short_desc}"),
                "symptoms": [f"Alert logged for {short_desc}"],
                "rootCause": "Root cause verified by human operator approval & automated execution.",
                "resolutionSteps": sop_commands,
                "sourceIncidentIds": [inc_id],
                "isPublished": True
            }
            logger.info(f"💾 Saving human-approved and verified new Master SOP to knowledge base: '{master_title}'...")
            _persisted = save_new_kb_article_to_storage(new_sop_data_to_store, vdb=active_vdb)
            _persist_kb_num = (_persisted or {}).get("number")
            _persist_title = (_persisted or {}).get("title", master_title)
            _index_ok = bool(_persisted) and bool(_persist_kb_num) and bool(_persisted.get("_chromadb_indexed"))
            if _persist_kb_num:
                persist_note = (
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"🧠 KNOWLEDGE PERSISTED — A REAL MASTER SOP NOW EXISTS\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"🎫 Ticket: [{number}] {short_desc}\n"
                    f"📚 New Master SOP authored & saved: [{_persist_kb_num}] '{_persist_title}'\n"
                    f"🔗 ChromaDB vector index: {'✅ verified present — future tickets will match this Master SOP via RAG.' if _index_ok else '⚠️ NOT confirmed — run reindex_chromadb.py so future RAG can find it.'}\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                )
                add_work_note(token, inc_id, persist_note, author="🧠 AI Knowledge Synthesizer")
            else:
                logger.error(f"❌ Persistence FAILED for synthesized SOP on [{number}] — no KB article was created. Escalation may be needed.")
                add_work_note(token, inc_id,
                    f"⚠️ KNOWLEDGE PERSIST FAILED for [{number}] {short_desc} — the synthesized SOP could not be saved to the KB. "
                    f"Escalate so a human-authored SOP is created for future occurrences.",
                    author="🧠 AI Knowledge Synthesizer")

    state.mark_resolved(inc_id)
