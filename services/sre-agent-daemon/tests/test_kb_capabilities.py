"""
Guardrail + coverage tests for the capability-tag registry
(daemon/safety/rule_registry.json, daemon/safety/kb_capabilities.py) that
replaced hardcoded per-KB-number branches in daemon/safety/rules.py.

test_no_new_hardcoded_kb_numbers is the actual mechanism that stops the
anti-pattern from creeping back in: it snapshots exactly how many bare
"KB0000\\d+" literals exist in each safety-adjacent file today (all of them
already understood/justified -- see ALLOWLIST below) and fails if that count
goes up anywhere, or if a literal shows up in a file with no allowlist entry
at all. Adding a *new* SOP or capability should never require touching these
files' KB-number literals; it should only require editing rule_registry.json
(or tagging the KB article's capabilityTags). If this test fails because you
legitimately need to add a hardcoded number, that's the moment to ask "should
this be a registry entry instead?" before bumping the allowlist count.
"""
import os
import re

import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
_DAEMON_ROOT = os.path.dirname(_HERE)
import sys  # noqa: E402
sys.path.insert(0, _DAEMON_ROOT)

from daemon.safety.kb_capabilities import (  # noqa: E402
    load_registry,
    get_capability_tags,
    article_has_capability,
    find_kb_by_capability,
    is_blocked_for_domain,
    is_allowed_for_domain,
)

_KB_NUMBER_RE = re.compile(r"KB0000\d+")

# Files known to still reference literal KB numbers, and why. Each entry caps
# the number of literal occurrences that file may contain; the test fails if
# a file's count exceeds its cap, or if a file outside this map has any.
ALLOWLIST = {
    # Deprecated constant, retained only as the documented source for
    # rule_registry.json's legacy_kb_number_fallback block; not read by any
    # active dispatch path (see the DEPRECATED comment directly above it).
    "daemon/config.py": 11,
    # `is_db2_provisioning_sop` / `is_db2_deletion_sop` (2 refs to KB0000042):
    # intra-DB2-domain provisioning-vs-deletion classification, a distinct
    # concern from the cross-domain guard (which now reads
    # is_allowed_for_domain(..., "db2") off the registry). Plus 4 refs inside
    # LLM prompt text (KB0000019, KB0000038/22/23) -- example/hint text shown
    # to the model, not dispatch logic. Out of scope for this migration.
    "daemon/sop/synthesizer.py": 6,
    # NexaCore/port-8080 app-recovery lookup: a single-ticket-type shortcut,
    # not a business-rule branch keyed on ambiguous KB semantics like the
    # user-management numbers were. Out of scope for this migration.
    "daemon/rag/hybrid_search.py": 2,
    # Department-inference one-off override, not a safety rule.
    "daemon/rag/vector_db.py": 1,
}


def _iter_target_files():
    for rel in ("daemon/safety", "daemon/sop", "daemon/rag", "daemon/config.py"):
        abs_path = os.path.join(_DAEMON_ROOT, rel)
        if os.path.isfile(abs_path):
            yield rel, abs_path
            continue
        for root, _dirs, files in os.walk(abs_path):
            for fn in files:
                if fn.endswith(".py"):
                    full = os.path.join(root, fn)
                    yield os.path.relpath(full, _DAEMON_ROOT).replace(os.sep, "/"), full


def test_no_new_hardcoded_kb_numbers():
    violations = []
    for rel_path, full_path in _iter_target_files():
        with open(full_path, encoding="utf-8") as fh:
            text = fh.read()
        count = len(_KB_NUMBER_RE.findall(text))
        if count == 0:
            continue
        cap = ALLOWLIST.get(rel_path)
        if cap is None:
            violations.append(f"{rel_path}: {count} literal KB-number reference(s) in a file with no allowlist entry")
        elif count > cap:
            violations.append(f"{rel_path}: {count} literal KB-number reference(s), exceeds allowlisted cap of {cap}")
    assert not violations, (
        "Hardcoded KB-number literal(s) found outside the capability registry. "
        "Add a capability tag / rule_registry.json entry instead of a new branch. "
        "If this reference is genuinely unrelated to SOP dispatch logic, add/raise its "
        "ALLOWLIST entry in test_kb_capabilities.py with a one-line justification.\n"
        + "\n".join(violations)
    )


# ── Registry / inference sanity checks ──────────────────────────────────────

def test_registry_loads():
    registry = load_registry()
    assert "capabilities" in registry
    assert "capability_inference" in registry
    assert "legacy_kb_number_fallback" in registry


@pytest.mark.parametrize("title,expected_tag", [
    ("Master SOP: Linux User Account Provisioning & Sudo Access Runbook", "linux.user.create"),
    ("SOP: User Account Deprovisioning - Offboarding Procedure", "linux.user.delete"),
    ("SOP: User Password Reset (Linux/Unix)", "linux.user.password_reset"),
    ("Master SOP: IBM DB2 User Provisioning, Access Levels", "db2.any"),
])
def test_inference_matches_expected_capability(title, expected_tag):
    article = {"title": title, "category": ""}
    tags = get_capability_tags(article)
    assert expected_tag in tags


def test_explicit_capability_tags_take_priority_over_inference():
    # Title alone would infer linux.user.create; explicit tags must win.
    article = {"title": "Master SOP: Linux User Account Provisioning", "capabilityTags": ["linux.user.delete"]}
    assert get_capability_tags(article) == ["linux.user.delete"]


def test_legacy_number_fallback_still_matches_when_untagged():
    # No title match, no explicit tags -- only the legacy number list saves it.
    article = {"number": "KB0000017", "title": "Untitled Runbook"}
    assert article_has_capability(article, "linux.user.password_reset")


def test_find_kb_by_capability_returns_none_when_absent():
    assert find_kb_by_capability([{"title": "Restart nginx"}], "linux.user.create") is None


def test_k8s_domain_guard_blocks_linux_user_sops():
    article = {"capabilityTags": ["linux.user.create"]}
    assert is_blocked_for_domain(article, "k8s")
    assert not is_blocked_for_domain({"capabilityTags": ["db2.any"]}, "k8s")


def test_db2_domain_guard_requires_db2_capability():
    assert is_allowed_for_domain({"capabilityTags": ["db2.any"]}, "db2")
    assert not is_allowed_for_domain({"capabilityTags": ["linux.user.create"]}, "db2")
