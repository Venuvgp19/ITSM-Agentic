import time
import atexit
from concurrent.futures import ThreadPoolExecutor, as_completed

from ..config import (
    logger,
    ITSM_BASE_URL,
    POLL_INTERVAL_SECONDS,
    acquire_lock,
    release_lock,
)
from ..session_state import default_session_state
from ..rag.vector_db import vector_db as default_vector_db, sync_vector_db_with_kb
from ..itsm.client import (
    get_auth_token,
    fetch_incident_queue,
    fetch_kb_articles,
    fetch_agent_approvals,
    resolve_ci_credentials,
)
from .incident_lifecycle import solve_in_progress_incident

def poll_and_dispatch_incidents(
    token,
    session_state=None,
    vdb=None,
    llm_invoker=None,
    ssh_session_factory=None,
    escalated_incident_ids=None
):
    """
    Executes a single polling iteration:
    1. Fetches incidents and KB articles.
    2. Synchronizes vector DB embeddings periodically.
    3. Dispatches eligible in-progress tickets to worker pool.
    """
    state = session_state or default_session_state
    active_vdb = vdb if vdb is not None else default_vector_db
    if escalated_incident_ids is None:
        escalated_incident_ids = set()

    incidents = fetch_incident_queue(token)
    kb_articles = fetch_kb_articles(token)

    in_progress_tickets = []
    approvals_list = fetch_agent_approvals(token)
    approved_inc_ids = {
        a.get("incidentId") for a in approvals_list if a.get("status") == "APPROVED"
    }

    for inc in incidents:
        inc_id = inc.get("id")
        ticket_state = str(inc.get("state", "")).upper().strip()

        if ticket_state == "IN_PROGRESS":
            if inc_id in escalated_incident_ids:
                escalated_incident_ids.remove(inc_id)
            state.reset_incident_locks(inc_id)

        if inc_id in approved_inc_ids and ticket_state in ["NEW", "IN_PROGRESS", "ON_HOLD"] and not state.is_resolved(inc_id):
            if inc_id in escalated_incident_ids or state.is_locked(inc_id):
                if inc_id in escalated_incident_ids:
                    escalated_incident_ids.remove(inc_id)
                state.unlock_session(inc_id)
                logger.info(f"🔓 Un-locking Incident [{inc.get('number', inc_id)}] — Human approval granted! Proceeding with execution.")

        ci_info, ci_name = resolve_ci_credentials(inc)
        is_unpaused_ci_on_hold = False
        if ticket_state == "ON_HOLD" and state.is_unspecified_ci(inc_id) and ci_info is not None and not state.is_resolved(inc_id):
            is_rejected = any(a.get("incidentId") == inc_id and a.get("status") == "REJECTED" for a in approvals_list)
            if not is_rejected:
                is_unpaused_ci_on_hold = True
                state.clear_unspecified_ci(inc_id)
                if inc_id in escalated_incident_ids:
                    escalated_incident_ids.remove(inc_id)
                state.unlock_session(inc_id)
                logger.info(f"🔓 Un-locking Incident [{inc.get('number', inc_id)}] — Valid Configuration Item '{ci_name}' detected on ticket properties! Resuming remediation.")

        is_approved_on_hold = (ticket_state == "ON_HOLD" and inc_id in approved_inc_ids)
        if (ticket_state == "IN_PROGRESS" or is_approved_on_hold or is_unpaused_ci_on_hold) and inc_id not in escalated_incident_ids and not state.is_resolved(inc_id) and not state.is_locked(inc_id):
            in_progress_tickets.append(inc)

    if in_progress_tickets:
        max_parallel = min(len(in_progress_tickets), 10)
        logger.info(f"⚡ Resolver Agent: Discovered {len(in_progress_tickets)} incident(s). Launching ASYNC PARALLEL Worker Pool (Max Workers = {max_parallel})...")
        
        def process_ticket_worker(inc_item):
            inc_id_item = inc_item.get("id")
            num_item = inc_item.get("number", inc_id_item)
            try:
                logger.info(f"🚀 [Parallel Worker Thread] Starting remediation on Incident [{num_item}]")
                solve_in_progress_incident(
                    token, inc_item, kb_articles,
                    session_state=state, vdb=active_vdb, llm_invoker=llm_invoker, ssh_session_factory=ssh_session_factory
                )
                
                updated = fetch_incident_queue(token)
                for u in updated:
                    if u.get("id") == inc_id_item:
                        u_state = str(u.get("state", "")).upper()
                        u_apprs = fetch_agent_approvals(token)
                        has_pending_or_approved = any(
                            a.get("incidentId") == inc_id_item and a.get("status") in ("PENDING", "APPROVED")
                            for a in u_apprs
                        )
                        if u_state in ("RESOLVED", "CLOSED"):
                            escalated_incident_ids.add(inc_id_item)
                            state.mark_resolved(inc_id_item)
                            logger.info(f"🔒 Incident [{num_item}] is now {u_state} — locked from re-processing.")
                        elif u_state == "ON_HOLD" and not has_pending_or_approved:
                            escalated_incident_ids.add(inc_id_item)
                            state.lock_session(inc_id_item)
                            logger.info(f"🔒 Incident [{num_item}] is now ON_HOLD (escalated/failed) — locked from re-processing.")
                        break
            except Exception as worker_err:
                logger.error(f"Error in parallel worker for ticket [{num_item}]: {worker_err}")

        with ThreadPoolExecutor(max_workers=max_parallel) as executor:
            futures = [executor.submit(process_ticket_worker, inc) for inc in in_progress_tickets[:10]]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as f_err:
                    logger.error(f"Parallel worker thread execution error: {f_err}")
    else:
        logger.info("💤 Queue Scan: No IN_PROGRESS tickets assigned for Resolver Agent remediation. Waiting...")

def start_continuous_monitoring(session_state=None, vdb=None, llm_invoker=None, ssh_session_factory=None):
    acquire_lock()
    atexit.register(release_lock)

    state = session_state or default_session_state
    active_vdb = vdb if vdb is not None else default_vector_db

    logger.info("=" * 75)
    logger.info("🚀 Starting Continuous ITSM Agent Daemon (Gemini 3.1 Pro Preview)")
    logger.info("   Mode: SELF-LEARNING SOP GENERATION & DUAL-STAGE REMEDIATION")
    logger.info(f"   Polling Interval: Every {POLL_INTERVAL_SECONDS} seconds")
    logger.info(f"   Target System: ITSM Platform ({ITSM_BASE_URL})")
    logger.info("=" * 75)

    escalated_incident_ids: set = set()
    sync_counter = 4

    while True:
        try:
            token = get_auth_token()
            if not token:
                logger.warning("Auth token unavailable, retrying in next cycle...")
                time.sleep(POLL_INTERVAL_SECONDS)
                continue

            # Governance Master Kill Switch & CI Containment Enforcement
            try:
                c_res = requests.get(f"{ITSM_BASE_URL}/agent/containment", timeout=1.5)
                if c_res.status_code == 200:
                    c_data = c_res.json()
                    if c_data.get("masterKillSwitch"):
                        logger.warning("🛑 [GOVERNANCE MASTER KILL SWITCH ACTIVE] Autonomous fleet execution halted by operator.")
                        time.sleep(POLL_INTERVAL_SECONDS)
                        continue
                    contained_cis = set(c_data.get("containedCis", []))
                    if "CI_AI_REACT_01" in contained_cis or "CI_AI_AGENT_01" in contained_cis:
                        logger.warning("🛑 [CI CONTAINMENT] Autonomous SRE ReAct Loop Agent (CI_AI_REACT_01) is CONTAINED. Execution blocked.")
                        time.sleep(POLL_INTERVAL_SECONDS)
                        continue
            except Exception:
                pass

            poll_and_dispatch_incidents(
                token,
                session_state=state,
                vdb=active_vdb,
                llm_invoker=llm_invoker,
                ssh_session_factory=ssh_session_factory,
                escalated_incident_ids=escalated_incident_ids
            )

        except KeyboardInterrupt:
            logger.info("🛑 Stopping Continuous ITSM Agent Daemon.")
            release_lock()
            break
        except Exception as e:
            logger.error(f"Unexpected error in daemon loop: {e}")

        time.sleep(POLL_INTERVAL_SECONDS)
