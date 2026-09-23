import json
import re
from ..config import logger, K8S_DOMAIN_KEYWORDS, LINUX_USER_SOP_NUMBERS
from ..llm import invoke_llm_with_fallback, safe_json_parse

def verify_rag_match_intent_with_llm(short_desc, desc, sop_number, sop_title, sop_commands):
    """
    LLM RAG Judge — double-checks Intent Booster candidates before score override.
    Executes with thinking disabled (sub-second latency) and guarantees an active decision (Approved/Rejected)
    without ever falling back to permissive defaults.
    Returns (approved: bool, reason: str).
    """
    try:
        prompt = (
            "You are a strict IT Knowledge Base Relevance Judge.\n"
            "Your job is to decide whether the given SOP (Standard Operating Procedure) is the CORRECT and APPROPRIATE solution for the incident ticket described below.\n"
            "Do NOT be lenient. If the SOP addresses a different root cause or a different kind of problem, you MUST reject it.\n\n"
            f"INCIDENT SHORT DESCRIPTION: {short_desc}\n\n"
            f"INCIDENT DESCRIPTION (may include logs/output):\n{desc[:1500]}\n\n"
            f"CANDIDATE SOP: [{sop_number}] {sop_title}\n"
            f"SOP COMMANDS:\n{json.dumps(sop_commands, indent=2)}\n\n"
            "DECISION RULES:\n"
            "- APPROVE if the SOP procedure/commands directly resolve the root cause shown in the incident (e.g. user creation + sudo for user creation tickets, az group tagging for resource tagging, kubectl rollout for deployment issues).\n"
            "- APPROVE if the SOP first diagnoses the actual state of the named component (e.g. checks whether a service/process is running, its unit files, or its logs) before remediating, and the incident's symptom (e.g. 'application down', 'connection refused', 'service not responding') is consistent with what that diagnosis targets. Investigating before fixing is not evidence of irrelevance — reject on failure-mode grounds only when the underlying subsystem or domain itself doesn't match (e.g. a database SOP for an application-crash ticket), not merely because the SOP allows for more than one possible root cause within the right domain.\n"
            "- Symptom vs. Root Cause: Incident tickets frequently report high-level symptoms (e.g., 'Application is down [404]', 'HTTP 502 Bad Gateway', 'Cannot access endpoint'). SOPs provide standard diagnostic and remediation actions (e.g., checking web server document root, symlinks, permissions, proxy config). Do NOT reject an SOP as 'speculative' simply because the ticket only reports the HTTP error code or symptom while the SOP targets a common, concrete root cause for that symptom.\n"
            "- HTTP Status vs. Process Health: An HTTP 404 (Not Found) or 403 (Forbidden) error proves the underlying web server process is ALREADY RUNNING and answering requests. Therefore:\n"
            "  * APPROVE SOPs that inspect or fix application paths, configurations, document roots, or permissions.\n"
            "  * REJECT generic systemctl restart SOPs (e.g. 'restart service on port 8080') when the ticket specifically reports an HTTP 4xx application error, because restarting a running web service does not fix missing files or routing paths.\n"
            "- Note: SOPs are parameterized templates. Example usernames, group names, file/venv/package names, and target hosts are dynamically substituted during execution. Do NOT reject an SOP solely because of example values if the operational commands match.\n"
            "- TARGET HOST IS ALWAYS A PARAMETER, NEVER GROUNDS FOR REJECTION. This applies to hardcoded literal values just as much as to obvious {placeholders}: a SOP whose commands name a specific IP (e.g. 192.168.100.101), hostname, or `ssh user@host` prefix is still valid for a ticket targeting a DIFFERENT host. The target host is substituted from the incident during parameterization, and remediation runs natively on an already-connected session — the SOP's literal host value is never executed as written. A host/IP/hostname difference MUST NOT appear as a reason for rejection, neither alone nor as one of several reasons. Judge only the OPERATIONS the commands perform.\n"
            "- A quantity/count mentioned in the SOP's title or example (e.g. \"create 5 resource groups\", \"delete 3 users\") is an EXAMPLE of the pattern, not a hard ceiling or floor, whenever the underlying command is inherently per-item and trivially repeats or drops to any count (e.g. `az group create --name X` run once vs. five times, `useradd $u` in a loop). Do NOT reject a SOP solely because its title's count differs from the ticket's requested count — check whether the actual COMMAND TEMPLATE generalizes to the requested count, not whether the number in the title matches literally.\n"
            "- REJECT if the SOP addresses a fundamentally different failure mode (e.g. Kubelet crash vs pod NodeSelector mismatch, DB2 vs Linux OS user, or password reset vs user creation).\n"
            "- REJECT if the SOP is too generic and its commands would not help the specific issue described.\n\n"
            "WORKED EXAMPLE 1 (apply this same reasoning pattern, not this literal ticket):\n"
            "Incident: 'OrderService application is down on host-42, connection refused on port 9090.'\n"
            "Candidate SOP: 'Application Service Recovery - OrderService Down', commands: check the orderservice systemd unit status and unit files, daemon-reload, enable+start the service, wait, verify port 9090 is listening.\n"
            "Correct verdict: APPROVE. 'Application is down' / 'connection refused' is exactly the symptom a not-running service produces, and the SOP's first move is to check the real unit status rather than blindly restart — that is the standard, correct diagnostic-first response. Do NOT reject this pattern just because the ticket text itself doesn't already contain the words 'service', 'unit', or 'port status' — the ticket describes the symptom; the SOP is what supplies the service-level diagnosis. Rejecting a SOP like this because it \"only\" checks-then-restarts, or because the ticket doesn't pre-name the mechanism, is the exact over-caution this judge must avoid.\n\n"
            "WORKED EXAMPLE 2 (apply this same reasoning pattern, not this literal ticket):\n"
            "Incident: 'Create a resource group called Demo using Azure CLI.'\n"
            "Candidate SOP: 'Master SOP: create 5 resource groups on azure using az cli', commands: `az group create --name {resource_group} --location {location}` (repeated per target name), then verify each with `az group show`.\n"
            "Correct verdict: APPROVE. The command template creates ONE resource group per invocation; \"5\" in the title reflects the incident that originally produced this SOP, not a fixed batch size the procedure is locked to. Run once with {resource_group}=Demo, it does exactly what this ticket asks. Rejecting it because the ticket wants 1 and the title says 5 is exactly the over-literal, title-matching-over-mechanism-reasoning this judge must avoid.\n\n"
            "WORKED EXAMPLE 3 (apply this same reasoning pattern, not this literal ticket):\n"
            "Incident: 'Nexacore Application is down. Getting below error [404]'\n"
            "Candidate SOP: 'Fix Nexacore Application 404 Error on Cluster Node', commands: inspect web directory /var/www/html or app path, check symlinks, restore missing index or static assets, verify curl http://localhost:9000 returns 200 OK.\n"
            "Correct verdict: APPROVE. A 404 Not Found error proves the web daemon is already online and responding, but cannot locate the targeted resource. The SOP addresses Nexacore 404 pathing directly. Do NOT reject it as 'speculative' just because the ticket did not pre-diagnose the missing file path. Conversely, a candidate that only executes 'systemctl restart' should be REJECTED for a 404 ticket, as restarting does not fix missing application routes.\n\n"
            "Respond in STRICT JSON only (no markdown, no preamble):\n"
            '{"approved": true|false, "reason": "<one sentence explanation>"}'
        )
        result_text, used_model = invoke_llm_with_fallback(
            messages=[{"role": "user", "content": prompt}],
            call_label=f"LLM RAG Judge [{sop_number}]",
            enable_thinking=False,
            max_tokens=300,
            temperature=0.0,
            role="governance"
        )
        
        # 1. Primary JSON Parse
        parsed = safe_json_parse(result_text)
        if parsed and isinstance(parsed, dict) and "approved" in parsed:
            is_approved = bool(parsed["approved"])
            reason = str(parsed.get("reason", "")).strip() or ("Approved by LLM Judge" if is_approved else "Rejected by LLM Judge")
            return is_approved, reason
            
        # 2. Secondary Regex Parse on Raw Output
        if result_text:
            match_appr = re.search(r'"approved"\s*:\s*(true|false)', result_text, re.IGNORECASE)
            match_reason = re.search(r'"reason"\s*:\s*"([^"]+)"', result_text, re.IGNORECASE)
            if match_appr:
                is_approved = match_appr.group(1).lower() == "true"
                reason = match_reason.group(1) if match_reason else ("Approved by LLM Judge (regex parsed)" if is_approved else "Rejected by LLM Judge (regex parsed)")
                return is_approved, reason
            
            # Check for direct textual verdicts
            low_text = result_text.lower()
            if "approved" in low_text and "rejected" not in low_text:
                return True, f"LLM Judge textual approval: {result_text[:120].strip()}"
            elif "rejected" in low_text or "disapproved" in low_text:
                return False, f"LLM Judge textual rejection: {result_text[:120].strip()}"

    except Exception as e:
        logger.error(f"❌ LLM RAG Judge execution error for [{sop_number}]: {e}")

    # 3. Deterministic Domain Entity & Action Evaluation (Active Decision — Never Permissive Fallback)
    _ticket_text_low = f"{short_desc} {desc}".lower()
    _sop_text_low = f"{sop_title} {' '.join(sop_commands) if isinstance(sop_commands, list) else str(sop_commands)}".lower()

    # Rule A: Cross-Domain Mismatch Guard
    _judge_ticket_is_k8s = any(k in _ticket_text_low for k in K8S_DOMAIN_KEYWORDS)
    _judge_sop_is_linux_user = sop_number in LINUX_USER_SOP_NUMBERS or "linux user" in sop_title.lower() or "useradd" in _sop_text_low
    if _judge_ticket_is_k8s and _judge_sop_is_linux_user:
        logger.warning(f"🛡️ Active Judge Rejection for [{sop_number}]: Kubernetes ticket matched Linux user SOP.")
        return False, "Judge Decision: Cross-domain entity mismatch (K8s ticket vs Linux User SOP) — candidate rejected."

    # Rule B: Keyword & Action Token Overlap Evaluation
    ticket_tokens = set(re.findall(r'[a-zA-Z0-9_\-]+', _ticket_text_low))
    sop_tokens = set(re.findall(r'[a-zA-Z0-9_\-]+', _sop_text_low))
    meaningful_overlap = [t for t in ticket_tokens if t in sop_tokens and len(t) > 3 and t not in {"with", "that", "this", "from", "have", "using", "please", "into"}]

    # Domain specific essential keyword anchors. This is the sole active gate during
    # an LLM provider outage for most real candidates (idx>0 or score<0.90, i.e.
    # anything that reaches this fallback at all) -- "restart", "group", "node", and
    # "mount" were previously included but are generic ops vocabulary with near-zero
    # discriminative power (e.g. a "restart the wrong service" ticket sharing only
    # "restart" with an unrelated SOP would approve). Removed; the remaining anchors
    # are all domain-specific enough to actually mean something when shared.
    domain_anchors = ["tag", "tags", "useradd", "usermod", "passwd", "kubectl", "systemctl", "azure", "az", "pod", "db2", "pv", "pvc"]
    matched_anchors = [a for a in domain_anchors if a in ticket_tokens and a in sop_tokens]

    # Raised from >=3 to >=4: 3 shared 4+ character words between a ticket and any
    # moderately verbose SOP title/commands is easy to hit by chance and isn't
    # strong enough evidence to approve fail-open during an outage.
    if len(matched_anchors) >= 1 or len(meaningful_overlap) >= 4:
        logger.info(f"⚖️ Active Judge Decision for [{sop_number}]: Approved via deterministic domain anchor match: {matched_anchors or meaningful_overlap[:4]}")
        return True, f"Judge Decision: Verified domain entity alignment ({', '.join(matched_anchors or meaningful_overlap[:3])})."

    logger.warning(f"🛡️ Active Judge Rejection for [{sop_number}]: Insufficient entity/action overlap between ticket and candidate SOP.")
    return False, f"Judge Decision: Candidate [{sop_number}] failed domain keyword alignment — rejected fail-closed."

