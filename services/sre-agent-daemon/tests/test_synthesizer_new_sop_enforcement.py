"""
Regression test for a crash in daemon/sop/synthesizer.py::evaluate_and_get_sop:

    ERROR Error in parallel worker for ticket [INC0001189]: cannot access
    free variable 'f_low' where it is not associated with a value in
    enclosing scope

Introduced when new-SOP safety-rule enforcement (business rules previously
only applied on the RAG-match path) was added to the RAG-miss branch: it
referenced `f_low`, a variable only assigned inside the `if not
formatted_steps:` deterministic-fallback block. Whenever the primary LLM
synthesis call already produced steps (the common case -- the fallback only
runs when it doesn't), `f_low` was never assigned, and referencing it raised
UnboundLocalError ("free variable... not associated with a value") the
moment the ticket text matched a password-reset/lock-unlock keyword.

This test drives evaluate_and_get_sop's RAG-miss path with a primary LLM
response that already returns non-empty steps (so the fallback extractor
that used to define f_low never runs), with ticket text that hits the
password-reset keyword branch, and asserts it completes without raising and
that the safety rule actually fired (chage stripped, no force-change requested).
"""
import json
import os
import sys
import types

_HERE = os.path.dirname(os.path.abspath(__file__))
_DAEMON_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, _DAEMON_ROOT)

if "daemon" not in sys.modules:
    _stub = types.ModuleType("daemon")
    _stub.__path__ = [os.path.join(_DAEMON_ROOT, "daemon")]
    sys.modules["daemon"] = _stub

from daemon.sop.synthesizer import evaluate_and_get_sop  # noqa: E402


class _FakeSessionState:
    def record_token_call(self, *_a, **_kw):
        pass

    def get_total_tokens(self):
        return 0


def _fake_llm_invoker(messages, response_format=None, call_label="", session_state=None, **kwargs):
    plan = {
        "title": "Reset password for revanth",
        "summary": "Resets the Linux password for user revanth.",
        "resolution_steps": [
            "passwd revanth",
            "chage -d 0 revanth",
        ],
        "safety_checks": ["passwd -S revanth"],
        "reasoning": "Direct password reset per ticket request.",
    }
    return json.dumps(plan), "fake-model"


def _raising_ssh_session_factory(ip, user, password):
    raise ConnectionError("no real SSH available in this test")


def test_new_sop_password_reset_ticket_does_not_crash_and_strips_chage():
    is_new, kb_number, title, reasoning, steps, sop_data = evaluate_and_get_sop(
        ticket_number="INC-TEST-0001",
        short_desc="Reset password for revanth",
        desc="User revanth forgot their password on the control plane.",
        ci_name="control plane",
        ip="192.168.100.101",
        kb_articles=[],  # forces a RAG miss (is_new branch)
        incident_id="inc-test-0001",
        vdb=None,
        session_state=_FakeSessionState(),
        llm_invoker=_fake_llm_invoker,
        ssh_session_factory=_raising_ssh_session_factory,
    )

    assert is_new is True
    assert kb_number == "KB_NEW"
    # The password-reset safety rule must have fired: no force-change
    # requested in the ticket text, so `chage` should be stripped.
    assert not any("chage" in s for s in steps)
    assert any("passwd" in s for s in steps)
