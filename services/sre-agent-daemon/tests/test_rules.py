"""
Tests for daemon/safety/rules.py's registry-driven interpreter.

Uses synthetic fixtures (fabricated capability tags / articles) rather than
real KB datasets on purpose -- test_command_validator.py's KB-number
parametrization silently rotted when KB numbers got reassigned across
dataset reseeds (see rule_registry.json's legacy_kb_number_fallback._readme).
Keying tests off capability tags instead of numbers means they can't rot the
same way: a tag's meaning doesn't change out from under the test.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_DAEMON_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, _DAEMON_ROOT)

from daemon.safety.rules import _enforce_sop_safety_rules  # noqa: E402
from daemon.safety.sudoers_sanitizer import sanitize_sudoers_command, clean_sudo_command_spec  # noqa: E402


# ── linux.user.create: sudo-vs-acl / strip-unrequested-sudo ────────────────

def test_create_strips_sudoers_when_not_requested():
    commands = [
        'useradd -m -s /bin/bash newhire',
        'echo "newhire ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/99-newhire',
        'visudo -c',
    ]
    out = _enforce_sop_safety_rules(
        commands, "Create user newhire", "Please create a standard account for newhire.",
        capability_tags=["linux.user.create"],
    )
    assert not any("sudoers" in c or "visudo" in c for c in out)
    assert any("useradd" in c for c in out)


def test_create_keeps_sudoers_when_sudo_requested():
    commands = [
        'useradd -m -s /bin/bash admin1',
        'echo "admin1 ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/99-admin1',
    ]
    out = _enforce_sop_safety_rules(
        commands, "Create user admin1 with sudo access", "Grant full sudo/root access.",
        capability_tags=["linux.user.create"],
    )
    assert any("sudoers" in c for c in out)


def test_create_replaces_sudoers_with_acl_for_directory_access_request():
    commands = [
        'useradd -m -s /bin/bash svcacct',
        'echo "svcacct ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/99-svcacct',
    ]
    out = _enforce_sop_safety_rules(
        commands, "Create user svcacct with write access to /var/app/data",
        "User svcacct needs write access to /var/app/data only.",
        capability_tags=["linux.user.create"],
    )
    assert not any("sudoers" in c for c in out)
    assert any("setfacl" in c and "/var/app/data" in c for c in out)


def test_create_gates_on_unresolved_username_placeholder():
    out = _enforce_sop_safety_rules(
        ["useradd -m {username}"], "Create a user", "No username specified in ticket.",
        capability_tags=["linux.user.create"],
    )
    assert len(out) == 1
    assert "GATE_ERROR" in out[0]


# ── linux.user.password_reset: force-change gate ───────────────────────────

def test_password_reset_strips_chage_when_no_force_change_requested():
    commands = ['passwd venu', 'chage -d 0 venu']
    out = _enforce_sop_safety_rules(
        commands, "Reset password for venu", "User forgot their password.",
        capability_tags=["linux.user.password_reset"],
    )
    assert not any("chage" in c for c in out)
    assert any("passwd" in c for c in out)


def test_password_reset_keeps_chage_when_force_change_requested():
    commands = ['passwd venu', 'chage -d 0 venu']
    out = _enforce_sop_safety_rules(
        commands, "Reset password for venu", "Force password change on first login.",
        capability_tags=["linux.user.password_reset"],
    )
    assert any("chage" in c for c in out)


# ── linux.user.lock_unlock: direction filter ────────────────────────────────

def test_lock_unlock_drops_unresolved_placeholder_mismatching_direction():
    # Filter only fires on commands that literally still contain the
    # "{lock_unlock_command}" placeholder text -- ported unchanged from the
    # original rules.py behavior (not a scope target of this migration).
    # Commands that never had the placeholder (e.g. an SOP step already
    # fully resolved) pass through regardless of direction.
    commands = ['{lock_unlock_command}', 'passwd -u venu']
    out = _enforce_sop_safety_rules(
        commands, "Unlock account for venu", "Account was locked out, please unlock.",
        capability_tags=["linux.user.lock_unlock"],
    )
    assert "{lock_unlock_command}" not in out
    assert "passwd -u venu" in out


# ── Cross-cutting behavior ──────────────────────────────────────────────────

def test_unknown_capability_tag_is_a_no_op():
    commands = ["systemctl restart nexacore"]
    out = _enforce_sop_safety_rules(
        commands, "Restart nexacore", "App is down.",
        capability_tags=["some.future.capability.not.yet.registered"],
    )
    assert out == commands


def test_no_capability_tags_and_no_kb_number_is_a_no_op():
    commands = ["systemctl restart nexacore"]
    out = _enforce_sop_safety_rules(commands, "Restart nexacore", "App is down.")
    assert out == commands


def test_legacy_kb_number_path_still_dispatches_without_explicit_tags():
    # No `article`/`capability_tags` passed -- old call-site shape (kb_number only)
    # must still resolve via legacy_kb_number_fallback in rule_registry.json.
    commands = ['passwd venu', 'chage -d 0 venu']
    out = _enforce_sop_safety_rules(
        commands, "Reset password for venu", "User forgot their password.",
        kb_number="KB0000017",
    )
    assert not any("chage" in c for c in out)


def test_article_with_explicit_capability_tags_is_used_over_inference():
    commands = ['passwd venu', 'chage -d 0 venu']
    article = {"title": "Some Unrelated Title", "capabilityTags": ["linux.user.password_reset"]}
    out = _enforce_sop_safety_rules(
        commands, "Reset password for venu", "User forgot their password.",
        kb_number="KB9999999", article=article,
    )
    assert not any("chage" in c for c in out)


# ── Sudoers sanitizer (deduped from rules.py + synthesizer.py) ─────────────

def test_sanitize_sudoers_strips_narrative_text():
    cmd = 'echo "svc1 ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nexacore with permission to worker1ol server" > /etc/sudoers.d/99-svc1'
    out = sanitize_sudoers_command(cmd)
    assert "/usr/bin/systemctl restart nexacore" in out
    assert "worker1ol" not in out
    assert "with permission to" not in out


def test_sanitize_sudoers_leaves_non_sudoers_commands_untouched():
    cmd = "systemctl restart nexacore"
    assert sanitize_sudoers_command(cmd) == cmd


def test_clean_sudo_command_spec_falls_back_to_all_when_empty():
    # Handled by the caller (sanitize_sudoers_command), not clean_sudo_command_spec
    # itself, which just truncates -- confirm the truncation behavior directly.
    assert clean_sudo_command_spec("create users on the server") == ""
