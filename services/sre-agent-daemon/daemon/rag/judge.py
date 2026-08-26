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
            "- Note: SOPs are parameterized templates. Example usernames, group names, and host IPs are dynamically substituted during execution. Do NOT reject an SOP solely because of placeholder values if the operational commands match.\n"
            "- REJECT if the SOP addresses a fundamentally different failure mode (e.g. Kubelet crash vs pod NodeSelector mismatch, DB2 vs Linux OS user, or password reset vs user creation).\n"
            "- REJECT if the SOP is too generic and its commands would not help the specific issue described.\n\n"
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

