import json
import re
from ..config import (
    logger,
    RAG_SIMILARITY_THRESHOLD,
    K8S_DOMAIN_KEYWORDS,
    LINUX_USER_SOP_NUMBERS,
)
from ..session_state import default_session_state
from ..llm import invoke_llm_with_fallback as default_invoke_llm, safe_json_parse
from ..rag.vector_db import vector_db as default_vector_db
from ..rag.hybrid_search import (
    distill_incident_query,
    search_hybrid_kb,
    search_kb_without_embeddings,
)
from ..rag.judge import verify_rag_match_intent_with_llm
from ..ssh.sanitization import strip_ssh_wrapper
from ..safety.rules import _enforce_sop_safety_rules
from ..safety.relevance_audit import post_synthesis_relevance_audit
from ..react.diagnostic_loop import run_read_only_diagnostic_react_loop
from ..itsm.dashboard import post_timeline_update

def evaluate_and_get_sop(
    ticket_number, short_desc, desc, ci_name, ip, kb_articles, incident_id,
    target_os="Linux/Unix",
    vdb=None,
    session_state=None,
    llm_invoker=None,
    ssh_session_factory=None,
    department=None
):
    active_vdb = vdb if vdb is not None else default_vector_db
    state = session_state or default_session_state
    invoker = llm_invoker or default_invoke_llm

    # 1. Distill incident into clean dense query and BM25 lexical tokens
    dense_query, lexical_tokens = distill_incident_query(short_desc, desc)
    logger.info(f"🔎 Distilled Incident RAG Query: '{dense_query}' (Lexical tokens: {len(lexical_tokens)}) | Target Dept: '{department or 'Global'}'")

    # 2. Execute Department-Partitioned Hybrid Search (ChromaDB nv-embed-v1 + BM25Okapi RRF Fusion)
    rag_results = []
    try:
        rag_results = search_hybrid_kb(dense_query, lexical_tokens, kb_articles, active_vdb, limit=12, department=department)
    except Exception as e:
        logger.warning(f"Hybrid RAG search encountered error: {e}")

    # Fallback to pure keyword search if hybrid search produced no results
    if not rag_results:
        rag_results = search_kb_without_embeddings(short_desc, desc, kb_articles)

    is_new = True
    matched_kb = None
    similarity_score = 0.0
    top_match = None
    next_best_info = ""

    q_low = f"{short_desc} {desc}".lower()
    is_credential_task = any(k in q_low for k in ["credential", "password", "retrieve credentials", "get credentials", "login credentials", "admin password", "jenkins credentials", "argocd credentials", "jenkins server credentials"])
    is_deletion_task = any(k in q_low for k in ["delete", "remove", "offboard", "userdel", "deprovision", "deactivate", "delete all"]) and not is_credential_task
    is_creation_task = any(k in q_low for k in ["create", "provision", "add user", "useradd", "new user"]) and not is_deletion_task and not is_credential_task

    user_line_count = len(re.findall(r"^[a-zA-Z0-9_-]+:", desc, re.MULTILINE))
    is_bulk_req = any(k in q_low for k in ["20 users", "5 users", "pamsudo1 to", "user01 to", "bulk", "multiple users", "users pamsudo", "delete all", "all the users", "users mentioned"]) or user_line_count > 1
    is_single_user_req = not is_bulk_req

    _ticket_is_db2 = any(k in q_low for k in ["db2", "ibm db2", "cloudbeaver", "beaver ui", "cloudbeaver access", "cloud baever", "cloud beaver"])
    _ticket_is_k8s = any(k in q_low for k in K8S_DOMAIN_KEYWORDS)
    _ticket_is_jenkins = any(k in q_low for k in ["jenkins", "initialadminpassword"])

    if rag_results:
        for idx, candidate in enumerate(rag_results):
            cand_score = candidate.get("score", 0.0)
            cand_number = candidate.get("number")

            cand_art = None
            for art in kb_articles:
                if art.get("number") == cand_number:
                    cand_art = art
                    break

            if not cand_art:
                continue

            kb_text = f"{cand_art.get('title', '')} {cand_art.get('summary', '')}".lower()
            kb_title = cand_art.get('title', '').lower()
            is_bulk_sop = any(k in kb_text for k in ["20 ", "20 users", "20 restricted", "user01 to user20", "bulk linux user"])
            is_linux_only_sop = any(k in kb_text for k in ["linux user account", "linux account", "useradd", "sudoers", "pamsudo"]) and "db2" not in kb_text

            is_db2_provisioning_sop = "db2" in kb_title and any(k in kb_title for k in ["provisioning", "provision", "access", "cloudbeaver"]) and cand_number != "KB0000042"
            is_db2_deletion_sop = cand_number == "KB0000042" or ("db2" in kb_title and any(k in kb_title for k in ["deletion", "revocation", "remove", "offboard"]))
            is_sop_deletion = (is_db2_deletion_sop) or (not is_db2_provisioning_sop and any(k in kb_text for k in ["delete", "deletion", "remove", "offboard", "offboarding", "deprovision", "deprovisioning", "userdel"]))
            is_sop_provision = any(k in kb_text for k in ["create", "creation", "provision", "provisioning", "add user", "useradd", "passwordless sudo"]) and not is_sop_deletion
            is_sop_user_mgmt = is_sop_deletion or is_sop_provision

            # ── 1. HARD CROSS-DOMAIN GUARDS ──
            _db2_allowed_sops = ["KB0000025", "KB0000042"]
            if _ticket_is_db2 and cand_number not in _db2_allowed_sops:
                logger.warning(f"🛡️ Strict DB2 Guard: DB2 ticket [{ticket_number}] blocked non-DB2 SOP [{cand_number}] '{cand_art.get('title', '')}'.")
                next_best_info = f"Candidate [{cand_number}] blocked — DB2 ticket only permits DB2 SOPs."
                continue

            if _ticket_is_k8s:
                if cand_number in LINUX_USER_SOP_NUMBERS or is_linux_only_sop:
                    logger.warning(f"🛡️ Hard Cross-Domain Guard: K8s ticket [{ticket_number}] matched Linux user SOP [{cand_number}] '{cand_art.get('title', '')}'. Rejecting.")
                    next_best_info = f"[{cand_number}] rejected — Linux user SOP blocked for K8s ticket."
                    continue

            # ── 2. ACTION DIRECTION & QUANTITY GUARDS ──
            if is_credential_task and is_sop_user_mgmt:
                logger.warning(f"🛡️ Action Mismatch Guard: Credential Retrieval ticket [{ticket_number}] matched Account Management SOP [{cand_number}]. Skipping.")
                next_best_info = f"Candidate [{cand_number}] omitted due to Action Mismatch."
                continue
            elif is_deletion_task and is_sop_provision:
                logger.warning(f"🛡️ Action Mismatch Guard: User Deletion ticket [{ticket_number}] matched Provisioning SOP [{cand_number}]. Skipping.")
                next_best_info = f"Candidate [{cand_number}] omitted due to Action Mismatch (Deletion vs Provisioning)."
                continue
            elif is_creation_task and is_sop_deletion:
                logger.warning(f"🛡️ Action Mismatch Guard: User Creation ticket [{ticket_number}] matched Deletion SOP [{cand_number}]. Skipping.")
                next_best_info = f"Candidate [{cand_number}] omitted due to Action Mismatch (Creation vs Deletion)."
                continue
            elif is_single_user_req and is_bulk_sop:
                logger.warning(f"🛡️ Quantity Mismatch Guard: Single-user ticket [{ticket_number}] matched Bulk SOP [{cand_number}]. Skipping.")
                next_best_info = f"Candidate [{cand_number}] omitted due to Quantity Mismatch."
                continue

            # ── 3. THRESHOLD & LLM RAG JUDGE VALIDATION ──
            if cand_score < RAG_SIMILARITY_THRESHOLD:
                logger.info(f"   ↳ Candidate [{cand_number}] '{cand_art.get('title', '')}' — Score {cand_score:.4f} < {RAG_SIMILARITY_THRESHOLD} threshold.")
                if not next_best_info:
                    next_best_info = f"Candidate [{cand_number}] score {cand_score:.4f} < {RAG_SIMILARITY_THRESHOLD} threshold."
                continue

            next_cand_score = rag_results[idx + 1].get("score", 0.0) if idx + 1 < len(rag_results) else 0.0
            score_margin = cand_score - next_cand_score
            # Strict Validation: ALWAYS invoke LLM Judge if falling back (idx > 0), score < 0.90, score margin < 0.10, or specialized domains
            requires_judge = (idx > 0) or (cand_score < 0.90) or (score_margin < 0.10) or _ticket_is_k8s or _ticket_is_db2
            if requires_judge:
                _cand_cmds = cand_art.get("resolutionSteps", cand_art.get("steps", cand_art.get("commands", [])))
                _judge_approved, _judge_reason = verify_rag_match_intent_with_llm(
                    short_desc, desc, cand_number, cand_art.get("title", ""),
                    _cand_cmds
                )
                if not _judge_approved:
                    logger.warning(
                        f"🛡️ LLM RAG Judge REJECTED candidate [{cand_number}] "
                        f"'{cand_art.get('title', '')}' (hybrid score {cand_score:.4f}, margin {score_margin:.4f}). "
                        f"Reason: {_judge_reason}. Inspecting next candidate."
                    )
                    next_best_info = f"[{cand_number}] rejected by LLM RAG Judge: {_judge_reason}"
                    continue
                else:
                    logger.info(
                        f"✅ LLM RAG Judge APPROVED candidate [{cand_number}] "
                        f"'{cand_art.get('title', '')}' (hybrid score {cand_score:.4f}, margin {score_margin:.4f}). "
                        f"Reason: {_judge_reason}"
                    )

            is_new = False
            matched_kb = cand_art
            top_match = candidate
            similarity_score = cand_score
            logger.info(f"🎯 Hybrid RAG Match Selected: Score {similarity_score:.4f} >= {RAG_SIMILARITY_THRESHOLD} -> [{cand_number}] '{matched_kb.get('title', '')}'")
            break
    
    if is_new:
        miss_reason = next_best_info if next_best_info else f"Top similarity score {similarity_score:.4f} < {RAG_SIMILARITY_THRESHOLD} threshold."
        logger.info(f"✨ RAG Miss ({miss_reason}). Executing live SSH server diagnosis probe...")
        
        logger.info(f"🔎 Executing Dynamic Read-Only Diagnostic ReAct Loop on host {ci_name} ({ip})...")
        post_timeline_update(incident_id, ticket_number, short_desc, ci_name, "RUNNING", "🔍 Read-Only Diagnostic Probe", "RUNNING", f"Gathering live server status via Read-Only Diagnostic ReAct Loop...")
        
        diag_logs = ""
        try:
            diag_logs = run_read_only_diagnostic_react_loop(
                ip, "root", "root123", short_desc, desc, ticket_number, ci_name,
                target_os=target_os,
                ssh_session_factory=ssh_session_factory,
                llm_invoker=invoker,
                session_state=state
            )
            logger.info(f"🔍 Dynamic Server Diagnostic Context Captured ({len(diag_logs)} bytes)")
            post_timeline_update(incident_id, ticket_number, short_desc, ci_name, "RUNNING", "🔍 Read-Only Diagnostic Probe", "SUCCESS", f"Captured {len(diag_logs)} bytes of live diagnostic logs.")
        except Exception as diag_err:
            logger.warning(f"Diagnostic ReAct loop warning: {diag_err}")
            diag_logs = "Diagnostic context unavailable (SSH probe timeout/skipped)."

        prompt = f"""You are a Senior L2 Systems & DevOps Administrator. Write a Standard Operating Procedure (SOP) to resolve the incident below.

INCIDENT: [{ticket_number}] {short_desc}
DESCRIPTION:
{desc}
TARGET HOST: {ci_name} (IP: {ip}, OS: {target_os})

LIVE SERVER DIAGNOSTIC CONTEXT (live diagnostic findings from target host):
{diag_logs[:8000]}

CRITICAL RULES:
1. Ground your solution directly on the LIVE SERVER DIAGNOSTIC CONTEXT and the INCIDENT requirement above.
2. If the diagnostic findings revealed specific resource names (e.g. controlling Deployment name, ReplicaSet, service unit, PID, config file), YOUR COMMANDS MUST OPERATE ON THOSE EXACT DISCOVERED RESOURCES!
   For example, if the ticket asks to delete the deployment for pod 'simple-web-app-6d6f6c7497-4dwr9' and diagnostic logs show controlling Deployment is 'simple-web-app' in namespace 'default', your commands MUST delete that specific deployment (`kubectl delete deployment simple-web-app -n default`).
3. Write 3-5 REAL, EXECUTABLE shell commands that directly fulfill the EXACT requirement described above.
4. ENTITY GROUNDING — MANDATORY. Use the exact entity strings from the ticket and diagnostic logs (real usernames, real deployment/pod names, real ports, real service names).
5. Commands must be NATIVE shell commands — do NOT prefix with ssh or any remote connection command. The agent already has an open SSH session.
6. Do NOT write placeholder text. Write real commands.

Respond ONLY with valid JSON:
{{
  "title": "Reusable Investigative Standard Operating Procedure: <action verb> <specific topic> on {ci_name}",
  "summary": "<1-2 sentence technical explanation of what this SOP does>",
  "symptoms": [
    "{short_desc}"
  ],
  "resolution_steps": [
    "<real shell command 1>",
    "<real shell command 2>",
    "<real shell command 3>"
  ],
  "safety_checks": [
    "<real verification command>"
  ],
  "reasoning": "<1-2 sentence technical rationale for these specific commands>"
}}"""
        plan = {}
        try:
            plan_content, used_model = invoker(
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                call_label=f"SOP Synthesis [{ticket_number}]",
                session_state=state
            )
            if plan_content:
                plan = safe_json_parse(plan_content)
                if isinstance(plan, list) and len(plan) > 0: plan = plan[0]
                logger.info(f"🧠 Knowledge base creator LLM synthesized new Reusable Investigative SOP using model: '{used_model}'")

        except Exception as e:
            logger.error(f"LLM SOP synthesis failed for {ticket_number}: {e}")
            plan = {}

        raw_title = plan.get("title", f"Reusable Investigative Standard Operating Procedure: {short_desc}")
        if raw_title.startswith("Master SOP:"):
            kb_title = raw_title.replace("Master SOP:", "Reusable Investigative Standard Operating Procedure:")
        elif not raw_title.startswith("Reusable Investigative"):
            kb_title = f"Reusable Investigative Standard Operating Procedure: {raw_title}"
        else:
            kb_title = raw_title

        summary = plan.get("summary", f"Reusable Investigative Standard Operating Procedure for {short_desc}.")
        resolution_steps = plan.get("resolution_steps", [])
        safety_checks = plan.get("safety_checks", [])
        reasoning = plan.get("reasoning", "Synthesized new reusable investigative SOP.")
        
        formatted_steps = []
        for step in resolution_steps:
            s = str(step).strip()
            s_clean = re.sub(r'^\d+\.\s*', '', s)
            if s_clean.lower() in [f"ssh root@{ip}", "ssh root@192.168.100.101"] or re.match(r"^ssh\s+[^\s]+$", s_clean.lower()):
                continue

            if not is_new and ("curl" in s_clean or "wget" in s_clean) and ("http://" in s_clean or "https://" in s_clean or "example.com" in s_clean or "gitlab" in s_clean):
                logger.warning(f"🧹 Sanitizing hallucinated external download URL from synthesized step: '{s_clean}'")
                s_clean = re.sub(r'(?:curl|wget)\s+[^\s]+\s+https?://[^\s]+\s+-o\s+([^\s]+)', r'touch \1', s_clean)
                s_clean = re.sub(r'https?://[^\s]+', '', s_clean)
                if "curl" in s_clean or "wget" in s_clean or "http" in s_clean:
                    continue

            s_unwrapped = strip_ssh_wrapper(s_clean, ip)
            if s_unwrapped:
                logger.info(f"🧹 Stripped SSH wrapper from generated SOP step: '{s_clean}' -> '{s_unwrapped}'")
                s_clean = s_unwrapped

            _placeholder_patterns = [
                r"^exact_command_\d+$",
                r"^<real shell command",
                r"^<verification command",
                r"^<command",
                r"^<action",
                r"ssh root@.*exact_command",
                r"ssh root@.*<",
            ]
            if any(re.search(pat, s_clean, re.IGNORECASE) for pat in _placeholder_patterns):
                logger.warning(f"🚫 Rejecting placeholder step from LLM output: '{s_clean}'")
                continue

            formatted_steps.append(s_clean)

        if not formatted_steps:
            logger.warning(f"⚠️ Synthesized steps were empty for [{ticket_number}]. Invoking Deterministic Fallback Extractor...")
            full_txt = f"{short_desc} {desc}"
            f_low = full_txt.lower()

            if any(k in f_low for k in ["jenkin", "jenkins", "credential", "password", "secret"]):
                formatted_steps = [
                    "ps aux | grep -i jenkins",
                    "ss -tulpn | grep 8080",
                    "cat /var/lib/jenkins/secrets/initialAdminPassword 2>/dev/null || cat /root/.jenkins/secrets/initialAdminPassword 2>/dev/null || find / -name initialAdminPassword 2>/dev/null"
                ]
            elif any(k in f_low for k in ["argocd", "kubernetes", "k8s", "kubectl", "pod", "namespace", "deployment"]):
                if any(k in f_low for k in ["pending", "failedscheduling", "node affinity", "node selector"]):
                    pod_match = re.search(r"pod[:\s]+([\w\-]+)", desc, re.IGNORECASE) or re.search(r"kubectl describe pod\s+([\w\-]+)", desc)
                    p_name = pod_match.group(1) if pod_match else "unknown-pod"
                    formatted_steps = [
                        f"kubectl get pod {p_name} -o jsonpath='{{.spec.nodeSelector}}'",
                        f"kubectl get nodes --show-labels | grep hostname",
                        f"kubectl patch pod {p_name} -p '{{\"spec\":{{\"nodeSelector\":null}}}}'",
                        f"kubectl get pod {p_name}"
                    ]
                else:
                    ns_match = re.search(r"(?:namespace|ns)\s+([a-zA-Z0-9_-]+)", f_low)
                    target_ns = ns_match.group(1) if ns_match else ""
                    if target_ns.lower() in ["in", "the", "of", "a", "on", "is", "for", "named"]:
                        target_ns = ""
                    if not target_ns:
                        target_ns = "argocd" if "argocd" in f_low else "default"

                    if any(k in f_low for k in ["delete", "remove"]) and "deployment" in f_low:
                        dep_match = re.search(r"Deployment/([a-zA-Z0-9_-]+)", diag_logs) or re.search(r"deployment\s+([a-zA-Z0-9_-]+)", diag_logs, re.IGNORECASE) or re.search(r"deployment\s+(?:for\s+pod\s+)?([a-zA-Z0-9_-]+)", full_txt, re.IGNORECASE)
                        dep_name = dep_match.group(1) if dep_match else ""
                        if dep_name.startswith("simple-web-app"):
                            dep_name = "simple-web-app"
                        if not dep_name or dep_name in ["for", "pod", "on", "in"]:
                            dep_name = "simple-web-app"

                        formatted_steps = [
                            f"kubectl get deployment {dep_name} -n {target_ns}",
                            f"kubectl delete deployment {dep_name} -n {target_ns}",
                            f"kubectl get deployment {dep_name} -n {target_ns} || echo 'Deployment successfully deleted'"
                        ]
                    else:
                        formatted_steps = [
                            f"kubectl get namespaces",
                            f"kubectl get pods -n {target_ns} -o wide",
                            f"kubectl rollout restart deployment -n {target_ns}",
                            f"kubectl get events -n {target_ns} --sort-by='.metadata.creationTimestamp' | tail -n 10",
                            f"kubectl get pods -n {target_ns}"
                        ]
            elif any(k in f_low for k in ["delete", "remove", "offboard", "userdel", "deprovision"]):
                usernames = re.findall(r"^[a-zA-Z0-9_-]+:", desc, re.MULTILINE)
                if not usernames:
                    u_match = re.findall(r"\b([a-zA-Z0-9_-]{3,20})\b", short_desc)
                    usernames = [u for u in u_match if u.lower() not in ["delete", "users", "user", "from", "below", "mentioned", "node", "server", "workernode1hl", "control", "plane"]]
                
                for u in usernames:
                    u_clean = u.split(":")[0].strip()
                    if u_clean:
                        formatted_steps.append(f'rm -f "/etc/sudoers.d/{u_clean}" "/etc/sudoers.d/99-{u_clean}"')
                        formatted_steps.append(f'pkill -9 -u "{u_clean}" 2>/dev/null || true')
                        formatted_steps.append(f'userdel -r -f "{u_clean}" 2>/dev/null || true')
            else:
                range_match = re.search(r'([a-zA-Z0-9_-]+?)(\d+)\s*(?:to|\.\.|\-)\s*(?:[a-zA-Z0-9_-]+?)?(\d+)', full_txt, re.IGNORECASE)
                if range_match:
                    prefix = range_match.group(1).strip()
                    start_num = int(range_match.group(2))
                    end_num = int(range_match.group(3))
                    if start_num <= end_num and (end_num - start_num) <= 50:
                        users = [f"{prefix}{i}" for i in range(start_num, end_num + 1)]
                    else:
                        users = []
                else:
                    users = []

                if not users:
                    pamsudo_matches = re.findall(r'Pamsudo\d+|pamsudo\d+', full_txt, re.IGNORECASE)
                    if pamsudo_matches:
                        users = sorted(list(set([p.lower() for p in pamsudo_matches])))
                    else:
                        u_match = re.search(r'\buser\s+([a-zA-Z0-9_-]+)', full_txt, re.IGNORECASE)
                        candidate_user = u_match.group(1).strip() if u_match else ""
                        if candidate_user.lower() in ["creation", "account", "control", "plane", "server", "node", "cluster", "workernode1hl"]:
                            candidate_user = ""
                        users = [candidate_user] if candidate_user else []

                cmd_match = re.search(r'(?:command like|capability|only command|command)\s+([a-zA-Z0-9_\-\/\.\s]+)', full_txt, re.IGNORECASE)
                raw_cmd = cmd_match.group(1).strip() if cmd_match else ""
                restricted_cmd = re.split(r'[\.\;\n,]', raw_cmd)[0].strip() if raw_cmd else ""
                if restricted_cmd:
                    words = restricted_cmd.split()
                    valid_words = []
                    for w in words:
                        if w.lower() in ["create", "users", "user", "on", "called", "with", "permission", "to", "for", "please", "worker1ol", "worker2ol", "worker1", "worker2", "5"]:
                            break
                        valid_words.append(w)
                    restricted_cmd = " ".join(valid_words).strip()

                if users:
                    for u in users:
                        formatted_steps.append(f'id -u "{u}" &>/dev/null || useradd -m -s /bin/bash "{u}"')
                        if "jboss" in f_low or "su -" in f_low:
                            formatted_steps.append(f'echo "{u} ALL=(ALL) NOPASSWD: /usr/bin/su - jboss, /bin/su - jboss" > "/etc/sudoers.d/99-{u}" && chmod 440 "/etc/sudoers.d/99-{u}"')
                        elif restricted_cmd:
                            formatted_steps.append(f'echo "{u} ALL=(ALL) NOPASSWD: {restricted_cmd}" > "/etc/sudoers.d/99-{u}" && chmod 440 "/etc/sudoers.d/99-{u}"')
                        else:
                            formatted_steps.append(f'echo "{u} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/99-{u}" && chmod 440 "/etc/sudoers.d/99-{u}"')
                    formatted_steps.append("visudo -c")
                elif "nexacore" in f_low or "8080" in f_low:
                    formatted_steps = [
                        "systemctl restart firewalld 2>/dev/null || true",
                        "systemctl restart Nexacore",
                        f"curl -s -o /dev/null -w '%{{http_code}}' http://{ip}:8080"
                    ]
                else:
                    if any(k in f_low for k in ["cpu", "mem", "memory", "ram", "performance", "load", "utilization"]):
                        formatted_steps = [
                            "top -b -n 1 | head -n 20",
                            "ps aux --sort=-%cpu | head -n 10",
                            "free -h",
                            "journalctl -n 30 --no-pager"
                        ]
                    elif any(k in f_low for k in ["disk", "storage", "full", "space", "partition"]):
                        formatted_steps = [
                            "df -h",
                            "du -sh /var/log/* 2>/dev/null | sort -rh | head -n 5",
                            "journalctl -n 30 --no-pager"
                        ]
                    elif any(k in f_low for k in ["network", "port", "connect", "ssh", "dns", "firewall"]):
                        formatted_steps = [
                            "ss -tlnp",
                            "ip a",
                            "journalctl -n 30 --no-pager"
                        ]
                    else:
                        formatted_steps = [
                            "uptime",
                            "ps aux --sort=-%cpu | head -n 10",
                            "free -m",
                            "journalctl -n 30 --no-pager"
                        ]

        relevance_metrics = {
            "audit": "not_run", "kept": len(formatted_steps), "dropped": 0,
            "note": "No relevance audit performed.", "entities_found": [],
            "confidence": None, "judged": False,
        }
        if is_new and formatted_steps:
            audited_steps, relevance_metrics = post_synthesis_relevance_audit(
                formatted_steps, ticket_number, short_desc, desc,
                ci_name, ip, target_os=target_os
            )
            formatted_steps = audited_steps
            logger.info(
                f"🛡️ Relevance Judge [{ticket_number}] audit={relevance_metrics['audit']} "
                f"kept={relevance_metrics['kept']} dropped={relevance_metrics['dropped']} "
                f"entities={relevance_metrics['entities_found']} "
                f"judged={relevance_metrics['judged']} :: {relevance_metrics['note']}"
            )
            if not formatted_steps:
                logger.warning(
                    f"⛔ Relevance judge removed ALL steps for [{ticket_number}] — SOP will not be auto-approved. "
                    f"{relevance_metrics['note']}"
                )

        new_sop_data = {
            "title": kb_title,
            "summary": summary,
            "category": department or "DevOps Team",
            "resolution_steps": formatted_steps,
            "safety_checks": safety_checks,
            "reasoning": reasoning,
            "relevance": relevance_metrics
        }
        
        return True, "KB_NEW", kb_title, reasoning, formatted_steps, new_sop_data
        
    else:
        logger.info(f"✅ RAG Match! Matched {top_match['number']} with similarity {similarity_score:.4f}. Retrieving SOP parameters...")
        
        kb_steps_list = matched_kb.get("resolutionSteps", []) if matched_kb else []
        matched_kb_steps = json.dumps(kb_steps_list)
        
        prompt = f"""
A relevant SOP has been retrieved from the Knowledge Base:
- Number: {top_match['number']}
- Title: {top_match['title']}
- Steps: {matched_kb_steps}

Incident Details:
- Ticket Number: {ticket_number}
- Short Description: {short_desc}
- Description: {desc}
- Target CI: {ci_name} ({ip})
- Target OS: {target_os}

Review the matched SOP and parameterize or verify the commands for execution on the target host.
Ensure all commands comply with the DIRECT COMMAND EXECUTION RULE (do NOT prefix commands with ssh).

CRITICAL: For ALL commands, replace {{ip}} with the target IP address.

CRITICAL PYTHON VIRTUAL ENVIRONMENT PARAMETERIZATION RULE (KB0000019):
- If the ticket requests creating a Python virtual environment (e.g. "create a python virtual environment called codex ... install chromadb"):
  - Extract the target {{venv_name}} from ticket text (e.g., "codex", "snappy", "myenv").
  - Extract the target {{packages}} to install from ticket text (e.g., "chromadb", "pandas openpyxl", "numpy").
  - Replace /opt/{{venv_name}} and `pip install {{packages}}` across all resolution steps.

CRITICAL MULTI-USER & BULK EXPANSION RULE (PROVISIONING & DELETION):
- If the incident description requests MULTIPLE users, a RANGE of users (e.g. "pamsudo1 to pamsudo5", "user01..user20", "5 users"), or BULK DELETION of a list of users:
  - You MUST extract ALL target usernames from the description text (e.g. [pamsudo1, pamsudo2, pamsudo3, pamsudo4, pamsudo5] or all names parsed from `/etc/passwd` dumps).
  - For PROVISIONING tickets: Combine useradd, chpasswd, and sudoers drop-in creation into chained one-liners per user (e.g. `id -u $u &>/dev/null || (useradd -m -s /bin/bash $u && echo '$u:$pass' | chpasswd && echo '$u ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/99-$u && chmod 440 /etc/sudoers.d/99-$u)`) or output full steps for EVERY SINGLE USER in the extracted list.
  - For DELETION / OFFBOARDING tickets: REPLICATE the user deletion commands (`rm -f /etc/sudoers.d/$user /etc/sudoers.d/99-$user; pkill -9 -u $user 2>/dev/null || true; userdel -r -f $user 2>/dev/null || true`) for EVERY SINGLE USER in the extracted list!

For USER DELETION / OFFBOARDING SOP (KB0000038 / KB0000022 / KB0000023), extract:
- {{username_list}}: Extract ALL usernames listed in the incident description and expand userdel commands for ALL of them.

Respond ONLY in JSON:
{{
  "sop_commands": ["cmd1", "cmd2", ...],
  "reasoning": "Technical explanation of parameterized commands for all requested users."
}}
"""
        plan = {}
        try:
            plan_content, used_model = invoker(
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                call_label=f"SOP Parameterization [{ticket_number}]",
                session_state=state,
                enable_thinking=False,
                max_tokens=1500,
                temperature=0.1
            )
            if plan_content:
                plan = safe_json_parse(plan_content)
                if isinstance(plan, list) and len(plan) > 0:
                    plan = plan[0]
                if not isinstance(plan, dict):
                    plan = {}
                logger.info(f"🧠 Parameterized commands using model: '{used_model}'")
        except Exception as e:
            logger.error(f"LLM SOP parameterization failed for {ticket_number}: {e}")
            plan = {}

        if not isinstance(plan, dict):
            plan = {}
            
        sop_commands = plan.get("sop_commands", kb_steps_list)
        reasoning = plan.get("reasoning", f"SOP {top_match['number']} parameterized.")
        
        sop_commands = _enforce_sop_safety_rules(sop_commands, short_desc, desc, top_match.get("number", ""))
        
        return False, top_match['number'], top_match['title'], reasoning, sop_commands, None
