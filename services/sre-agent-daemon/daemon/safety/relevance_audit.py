import re
from ..config import logger
from ..llm import invoke_llm_with_fallback, safe_json_parse

def _str(v):
    return str(v) if v is not None else ""

def _build_relevance_verdict(kept, dropped, entities, confidence, judged, ticket_num, fixed_any=False):
    total = len(kept) + len(dropped)
    kept_ratio = (len(kept) / total) if total else 0.0
    if not entities:
        note = "No concrete entities found in ticket text; relying on generic-safe command analysis."
        audit = "needs_human_review" if len(kept) == 0 else "passed"
    else:
        n_entity_hits = sum(1 for s in kept for e in entities if e.lower() in str(s).lower())
        if len(kept) == 0:
            note = "All synthesized steps dropped — no step maps to any ticket entity or safe generic verb."
            audit = "failed"
        elif kept_ratio >= 0.8 and n_entity_hits > 0:
            note = f"Steps reference ticket entities: {sorted(entities)}."
            if fixed_any:
                note += " (1+ steps corrected to named entities by auditor)"
            audit = "passed"
        elif kept_ratio >= 0.6:
            note = "Partial entity coverage — some steps are generic/safe; recommend human review."
            audit = "needs_human_review"
        else:
            note = "Low entity coverage — several steps dropped/flagged; strong human review advised."
            audit = "needs_human_review"
    return {
        "audit": audit,
        "kept": len(kept),
        "dropped": len(dropped),
        "note": note,
        "entities_found": sorted(entities),
        "confidence": round(float(confidence), 3),
        "judged": bool(judged),
    }

def post_synthesis_relevance_audit(steps, ticket_number, short_desc, desc, ci_name, ip, target_os="Linux/Unix"):
    """
    Post-synthesis relevance judge. Guards the human-approval card so the SOP that gets
    submitted actually references the concrete entities/actions from the ticket, instead of
    silently approving a generic or entity-mismatched SOP.
    Returns: (kept_steps, verdict) where verdict = {"audit","kept","dropped","note",
    "entities_found","confidence","judged"}.
    """
    full_txt = f"{short_desc}\n{desc}\n{ci_name} {ip}".lower()

    # ---- Phase 0: entity extraction (deterministic, conservative) ----
    entities = set()
    _wordish = re.findall(r"[a-zA-Z][a-zA-Z0-9_\-\.]{4,}", full_txt)
    _stop = {
        "error", "errors", "issue", "server", "servers", "service", "services",
        "system", "systems", "status", "failed", "failure", "ticket", "ticket_number",
        "repository", "deployment", "environment", "production", "application", "app",
        "default", "admin", "administrator", "linux", "unix", "root", "user", "users",
        "password", "description", "short_desc", "command", "commands", "access",
        "network", "internet", "connection", "connect", "degraded", "restart", "start",
        "stop", "creating", "created", "installation", "install", "configure", "config",
        "port", "host", "hostname", "credentials", "secret", "secrets"
    }
    for w in _wordish:
        if w in _stop:
            continue
        if re.search(r"[a-zA-Z]{3,}", w):
            entities.add(w)

    for m in re.finditer(
        r"\b(?:useradd|adduser|passwd|deluser|userdel|chown|chmod|su\s+)\s+([a-zA-Z][a-zA-Z0-9_\-\\.]+)",
        full_txt
    ):
        entities.add(m.group(1))

    for m in re.finditer(r"((?:[a-zA-Z0-9_\-\\.]+)\.[a-z]{2,}(?::[0-9]+)?)", full_txt):
        entities.add(m.group(1))
    for m in re.finditer(r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b", full_txt):
        entities.add(m.group(0))
    for m in re.finditer(r"(?:[a-zA-Z0-9][a-zA-Z0-9\-_]*)(?::[0-9]{1,5})\b", full_txt):
        entities.add(m.group(0))

    _app_kw = re.findall(r"\b(jenkins|nginx|apache|httpd|mysql|mariadb|postgres|postgresql|redis|rabbitmq|mongodb|docker|kubernetes|kubectl|java|node|tomcat|grafana|prometheus|elasticsearch|kafka|zookeeper|php|python|azure-cli|aws-cli)\b", full_txt)
    for k in _app_kw:
        entities.add(k)

    entities = {e for e in entities if not re.match(r"^\d+$", e)}
    ent_lower = {e.lower(): e for e in entities}

    kept = []
    dropped = []
    for step in steps:
        sl = str(step or "").lower()
        if not sl.strip():
            dropped.append(step)
            continue
        # Phase A: entity reference
        if any(e in sl for e in ent_lower):
            kept.append(step)
            continue
        # Phase B: safe generic diagnostics / package-manager verbs
        if re.search(
            r"\b(?:uptime|ps\s+|free\s+|journalctl|ss\s+|netstat|whoami|hostname|uname|cat\s+|tail\s+|grep\s+|echo\s+|touch\s+|mkdir\s+|chmod\s+|chown\s+|systemctl\s+(?:status|is-active|list-units|enable|daemon-reload)|yum\s+(?:install|update|check-update)|apt(?:-get)?\s+(?:install|update))(?=\s|-|:|$)",
            sl
        ):
            kept.append(step)
            continue
        # Phase C: recognized standalone verbs on a presumably-targeted subject
        if re.search(r"\b(docker|podman|kubectl|node|npm|pip|java)\b", sl):
            kept.append(step)
            continue
        dropped.append(step)

    entity_hit_ratio = (len(kept) / len(steps)) if steps else 0.0
    total = len(steps or [])
    too_many_dropped = bool(dropped) and (len(dropped) / total) > 0.4
    
    # ---- Phase D: optional LLM relevance judge on marginal cases ----
    judged = False
    if too_many_dropped and entities:
        judged = True
        try:
            judge_prompt = (
                "You are a strict SOP relevance auditor. The incident asks to resolve "
                f"\"{short_desc}\" | \"{desc[:1200]}\". Host {ci_name} ({ip}), OS {target_os}. "
                f"Confirmed entities from the ticket: {sorted(entities)}. "
                "Review each proposed remediation command. Respond with strictly valid JSON "
                '(no fences): {"verdicts":[{"command":"...","action":"KEEP|FIX|DROP","note":"..."}],"confidence":0.0-1.0}. '
                "Use FIX only when the command is right but targets the wrong/undefined entity "
                "and you can name the correct entity from the ticket. Do NOT invent entities "
                "not in the ticket.\n"
                f"Candidate commands: {steps}"
            )
            jcontent, _jmodel = invoke_llm_with_fallback(
                messages=[{"role": "user", "content": judge_prompt}],
                response_format={"type": "json_object"},
                call_label=f"SOP Relevance Audit [{ticket_number}]",
                enable_thinking=False,
                max_tokens=500,
                temperature=0.0
            )
            jplan = safe_json_parse(jcontent) if jcontent else {}
            verdicts = jplan.get("verdicts", []) if isinstance(jplan, dict) else []
            if verdicts:
                _by_cmd = {_str(v.get("command")).strip().lower(): v for v in verdicts}
                nkept, ndrop, fixed_any = [], [], False
                for st in steps:
                    v = _by_cmd.get(_str(st).strip().lower())
                    action = _str(v.get("action")).upper() if v else ""
                    if action == "KEEP":
                        nkept.append(st)
                    elif action == "FIX" and v.get("note"):
                        cand = _str(v.get("note")).strip()
                        if cand.lower() in ent_lower:
                            nkept.append(cand)
                            fixed_any = True
                        else:
                            ndrop.append(st)
                    else:
                        ndrop.append(st)
                kept, dropped = nkept, ndrop
                try:
                    _conf = float(jplan.get("confidence"))
                except (TypeError, ValueError):
                    _conf = entity_hit_ratio
                verdict = _build_relevance_verdict(kept, dropped, entities, _conf,
                                                   judged=True, ticket_num=ticket_number,
                                                   fixed_any=fixed_any)
                return kept, verdict
        except Exception as e:
            logger.warning(f"Relevance judge LLM pass failed ({e}); falling back to deterministic verdict.")

    confidence = 0.5 + 0.5 * entity_hit_ratio if entities else 0.8
    verdict = _build_relevance_verdict(kept, dropped, entities, confidence,
                                       judged=judged, ticket_num=ticket_number,
                                       fixed_any=False)
    return kept, verdict
