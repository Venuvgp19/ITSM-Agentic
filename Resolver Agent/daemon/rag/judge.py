import json
from ..config import logger, K8S_DOMAIN_KEYWORDS, LINUX_USER_SOP_NUMBERS
from ..llm import invoke_llm_with_fallback, safe_json_parse

def verify_rag_match_intent_with_llm(short_desc, desc, sop_number, sop_title, sop_commands):
    """
    LLM RAG Judge — double-checks Intent Booster candidates before score override.
    Called when raw semantic similarity is in the ambiguous zone [0.25, 0.75) or on K8s domain.
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
            "- APPROVE if the SOP procedure/commands directly resolve the root cause shown in the incident (e.g. user creation + sudo for user creation tickets).\n"
            "- Note: SOPs are parameterized templates. Example usernames (e.g. 'venu', 'pablo', '{username}') and host IPs are dynamically substituted during execution. Do NOT reject an SOP solely because of placeholder user/host names if the operational commands match.\n"
            "- REJECT if the SOP addresses a fundamentally different failure mode (e.g. Kubelet crash vs pod NodeSelector mismatch, DB2 vs Linux OS user, or password reset vs user creation).\n"
            "- REJECT if the SOP is too generic and its commands would not help the specific issue described.\n\n"
            "Respond in STRICT JSON only (no markdown, no explanation outside JSON):\n"
            '{"approved": true|false, "reason": "<one sentence explanation>"}'
        )
        result_text, used_model = invoke_llm_with_fallback(
            messages=[{"role": "user", "content": prompt}],
            call_label=f"LLM RAG Judge [{sop_number}]"
        )
        parsed = safe_json_parse(result_text)
        if parsed and isinstance(parsed, dict) and "approved" in parsed:
            return bool(parsed["approved"]), parsed.get("reason", "")
    except Exception as e:
        logger.warning(f"LLM RAG Judge invocation error for [{sop_number}]: {e}")

    _ticket_text_low = f"{short_desc} {desc}".lower()
    _judge_ticket_is_k8s = any(k in _ticket_text_low for k in K8S_DOMAIN_KEYWORDS)
    _judge_sop_is_linux_user = sop_number in LINUX_USER_SOP_NUMBERS or "linux user" in sop_title.lower()
    if _judge_ticket_is_k8s and _judge_sop_is_linux_user:
        logger.warning(
            f"🛡️ LLM RAG Judge fail-closed for [{sop_number}] "
            f"(LLM unavailable + K8s ticket -> Linux user SOP). "
            f"Rejecting cross-domain entity-type mismatch."
        )
        return False, "LLM Judge unavailable — rejected cross-domain mismatch (K8s ticket vs Linux user SOP) fail-closed"

    return True, "LLM Judge unavailable — defaulting to permissive"
