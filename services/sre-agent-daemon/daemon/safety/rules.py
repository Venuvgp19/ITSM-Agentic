import re
from ..config import logger
from .kb_capabilities import load_registry, get_capability_tags

# ---------------------------------------------------------------------------
# Action verbs. Each rule in rule_registry.json names one of these by id.
# Adding a rule that composes existing verbs against a new capability tag is
# a registry edit. A genuinely new transform needs a new verb here -- that
# should be rare, since these three cover "trim a command list down" in every
# shape the current SOPs need.
# ---------------------------------------------------------------------------

def _action_replace_sudoers_with_acl(commands: list, full_text: str, params: dict) -> list:
    new_commands = []
    for c in commands:
        if "sudoers" in c.lower() or "visudo" in c.lower():
            dir_match = re.search(r'(?:to|on|for)\s+(/\S+)', full_text)
            target_dir = dir_match.group(1) if dir_match else "/etc"
            u_match = re.search(r'\buser\s+([a-zA-Z0-9_-]+)', full_text)
            u_extracted = u_match.group(1) if u_match else "user"
            acl_cmd = f'setfacl -R -m u:{u_extracted}:rwx {target_dir} 2>&1 && echo ACL_SET_OK || echo ACL_SET_FAILED'
            new_commands.append(acl_cmd)
            logger.info(f"🔒 Safety Rule: Directory access requested, not full sudo. Replacing sudoers with ACL command for {target_dir}.")
        else:
            new_commands.append(c)
    return new_commands


def _action_strip_commands_containing(commands: list, full_text: str, params: dict) -> list:
    substrings = [s.lower() for s in params.get("substrings", [])]
    before = len(commands)
    kept = [c for c in commands if not any(s in c.lower() for s in substrings)]
    removed = before - len(kept)
    if removed > 0:
        logger.info(f"🔒 Safety Rule: removed {removed} command(s) matching {params.get('substrings')}.")
    return kept


def _action_filter_commands_keep_matching(commands: list, full_text: str, params: dict) -> list:
    placeholder = params.get("placeholder", "")
    keep_if_any = [s.lower() for s in params.get("keep_if_contains_any", [])]
    return [
        c for c in commands
        if placeholder not in c or any(s in c.lower() for s in keep_if_any)
    ]


_ACTIONS = {
    "replace_sudoers_with_acl": _action_replace_sudoers_with_acl,
    "strip_commands_containing": _action_strip_commands_containing,
    "filter_commands_keep_matching": _action_filter_commands_keep_matching,
}


def _rule_applies(rule: dict, full_text: str) -> bool:
    any_kw = rule.get("when_keywords_any")
    none_kw = rule.get("when_keywords_none")
    if any_kw and not any(k in full_text for k in any_kw):
        return False
    if none_kw and any(k in full_text for k in none_kw):
        return False
    return True


def _enforce_sop_safety_rules(sop_commands, short_desc, desc, kb_number="", capability_tags=None, article=None):
    """
    Code-level safety enforcement on SOP commands after LLM parameterization.
    Prevents LLM hallucinations and enforces mandatory business rules.

    Dispatches on `capability_tags` (or `article`'s tags, or a keyword-inferred
    guess) rather than `kb_number` -- `number` is an auto-increment id that
    gets reassigned across dataset reseeds, so branching on its literal value
    is both unscalable and, in practice, silently wrong after any reseed. See
    daemon/safety/kb_capabilities.py and rule_registry.json for the mapping.
    `kb_number` is retained only for logging/back-compat and as a last-resort
    legacy match inside get-capability-tags when an article has no tags yet.
    """
    full_text = f"{short_desc} {desc}".lower()
    commands = list(sop_commands) if isinstance(sop_commands, list) else []
    if not commands:
        return commands

    registry = load_registry()
    if capability_tags is None:
        if article is not None:
            capability_tags = get_capability_tags(article, registry)
        else:
            # No article handed in (legacy call site) -- fall back to the
            # number-keyed legacy map only, so old call sites keep working
            # unmodified until they're updated to pass an article/tags.
            capability_tags = []
            for tag, numbers in registry.get("legacy_kb_number_fallback", {}).items():
                if tag.startswith("_") or not isinstance(numbers, list):
                    continue
                if kb_number in numbers:
                    capability_tags.append(tag)

    capabilities_cfg = registry.get("capabilities", {})
    applicable_tags = [t for t in capability_tags if t in capabilities_cfg]
    if not applicable_tags:
        return commands

    for tag in applicable_tags:
        cap = capabilities_cfg[tag]

        # --- Shared placeholder gate: unresolved {username} etc. aborts the SOP. ---
        for placeholder in cap.get("placeholder_gate", []):
            first_cmd = commands[0] if commands else ""
            if placeholder in first_cmd:
                logger.warning(f"⚠️ Safety Rule: {placeholder} placeholder still present in [{tag}] (kb={kb_number}) after LLM parameterization. Aborting.")
                return [f"echo 'GATE_ERROR: No username provided in incident ticket. Cannot proceed.' && exit 1"]

        # --- Declarative rules for this capability. ---
        for rule in cap.get("rules", []):
            if not _rule_applies(rule, full_text):
                continue
            action_fn = _ACTIONS.get(rule.get("action"))
            if not action_fn:
                logger.error(f"Safety rule [{tag}/{rule.get('id')}] references unknown action '{rule.get('action')}'. Skipping.")
                continue
            commands = action_fn(commands, full_text, rule.get("params", {}))

    return commands
