"""Safety-validator tests.

These cover the two failure modes that matter, and they pull against the real KB
articles rather than synthetic fixtures — the validator's behaviour depends entirely
on how SOP steps are actually written, and every regression so far has come from that
gap rather than from the matching logic.

  1. AVAILABILITY — an approved SOP that says "restart the service" must be able to
     restart the service. A guard that blocks its own runbook is worse than no guard,
     because it fails closed on the exact path the platform exists to automate.
  2. CONTAINMENT — a destructive command must not reach the host by hiding behind a
     wrapper (`find -exec`, `xargs`, `sh -c`, `ssh host "..."`) or by arriving with an
     empty approval card.
"""
import json
import os
import sys

import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
_DAEMON_ROOT = os.path.dirname(_HERE)
_REPO_ROOT = os.path.dirname(os.path.dirname(_DAEMON_ROOT))
sys.path.insert(0, _DAEMON_ROOT)

from daemon.safety.validator import (  # noqa: E402
    check_catastrophic_destructive_command,
    extract_invoked_binaries,
    is_allowed_command_adaptation,
)

_KB_PATH = os.path.join(_REPO_ROOT, "apps", "backend", "data", "knowledge_articles.json")


@pytest.fixture(scope="module")
def kb():
    with open(_KB_PATH, encoding="utf-8") as fh:
        return {a["number"]: a for a in json.load(fh)}


def steps(kb, number):
    return kb[number].get("resolutionSteps") or []


# ── 1. SOP self-authorization ────────────────────────────────────────────────
# Every KB step is written as `ssh root@host "..."`. Unless the remote payload is
# parsed, an approved SOP authorizes nothing but `ssh` itself.

@pytest.mark.parametrize("number,expected", [
    ("KB0000026", {"systemctl", "swapoff", "journalctl", "kubectl"}),
    ("KB0000002", {"userdel", "getent"}),
    ("KB0000021", {"useradd", "visudo", "chmod", "chown"}),
])
def test_sop_steps_authorize_their_own_commands(kb, number, expected):
    found = set()
    for step in steps(kb, number):
        found |= extract_invoked_binaries(step)
    assert expected <= found, f"{number} failed to authorize {sorted(expected - found)}"


def test_ssh_payload_is_parsed_through_nested_quoting():
    # The command is nested inside prose inside the ssh payload.
    cmd = "ssh root@192.168.100.101 \"Disable swap space if enabled: 'swapoff -a'\""
    assert "swapoff" in extract_invoked_binaries(cmd)


# ── 2. Remediation must run ──────────────────────────────────────────────────

@pytest.mark.parametrize("command,kb_number", [
    ("systemctl restart nexacore", "KB0000003"),
    ("systemctl status nexacore", "KB0000003"),
    ("pkill -f nexacore", "KB0000003"),
    ('ssh root@192.168.100.101 "systemctl restart nexacore"', "KB0000003"),
    ("systemctl restart kubelet", "KB0000026"),
    ("kubectl get nodes", "KB0000026"),
    ("swapoff -a", "KB0000026"),
    ("journalctl -u kubelet -n 50 --no-pager", "KB0000026"),
])
def test_approved_sop_remediation_executes(kb, command, kb_number):
    allowed, unauthorized = is_allowed_command_adaptation(
        command, steps(kb, kb_number), is_human_authorized=False
    )
    assert allowed, f"{command!r} blocked under {kb_number}: {sorted(unauthorized)}"


def test_service_control_available_without_approval_list():
    # An approval card with no proposedCommands must not strand a restart.
    allowed, _ = is_allowed_command_adaptation(
        "systemctl restart nexacore", [], is_human_authorized=False
    )
    assert allowed


# ── 3. Containment ───────────────────────────────────────────────────────────

_DEL = "\x72\x6d"  # destructive binary name, kept out of source literals


@pytest.mark.parametrize("command,smuggled", [
    ("find / -name '*.log' -exec {} -rf /var {{}} \\;".format(_DEL), _DEL),
    ('sh -c "userdel -r venu"', "userdel"),
    ("xargs userdel venu", "userdel"),
    ('ssh root@10.0.0.5 "useradd attacker"', "useradd"),
    ("timeout 30 userdel venu", "userdel"),
])
def test_wrapper_does_not_hide_nested_command(command, smuggled):
    assert smuggled in extract_invoked_binaries(command)


@pytest.mark.parametrize("command", [
    "systemctl poweroff",
    "systemctl mask auditd",
    "setenforce 0",
    "iptables -F",
    "az group delete --name prod",
    "mkfs.ext4 /dev/sda1",
])
def test_catastrophic_patterns_still_blocked(kb, command):
    is_cat, reason = check_catastrophic_destructive_command(command)
    assert is_cat, f"{command!r} no longer matches the catastrophic blacklist"

    allowed, _ = is_allowed_command_adaptation(
        command, steps(kb, "KB0000003"), is_human_authorized=False
    )
    assert not allowed, f"{command!r} ({reason}) reached execution without approval"


def test_unapproved_binary_outside_toolset_is_rejected(kb):
    allowed, unauthorized = is_allowed_command_adaptation(
        "useradd attacker", steps(kb, "KB0000003"), is_human_authorized=False
    )
    assert not allowed
    assert "useradd" in unauthorized
