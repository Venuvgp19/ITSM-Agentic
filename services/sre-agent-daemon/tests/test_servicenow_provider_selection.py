"""
Regression tests for daemon/itsm/client.py's ITSM_PROVIDER branching.

Before this pass, only fetch_incident_queue/add_work_note/update_incident_status
were ITSM_PROVIDER-aware -- every other ITSM client function (fetch_kb_articles,
save_new_kb_article_to_storage, resolve_ci_credentials) silently kept talking to
the local NestJS backend even when ITSM_PROVIDER=SERVICENOW was selected. These
tests lock in that each function now dispatches to the right backend for its
provider, and that the deliberately-NOT-branching functions (HITL approvals,
timeline/dashboard telemetry -- see client.py's fetch_agent_approvals docstring
for why) stay routed to GOVERNANCE_BASE_URL regardless of provider.
"""
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

import pytest  # noqa: E402
import daemon.itsm.client as client  # noqa: E402


class _FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)

    def json(self):
        return self._payload


def _assert_local_backend_not_called(monkeypatch):
    """Any local ITSM_BASE_URL/GOVERNANCE_BASE_URL call in SERVICENOW-mode tests
    is a regression -- raise loudly instead of letting it silently succeed/fail."""
    def _forbidden(*a, **kw):
        raise AssertionError(f"local backend called in SERVICENOW mode: args={a}")
    monkeypatch.setattr(client.requests, "get", _forbidden)
    monkeypatch.setattr(client.requests, "post", _forbidden)
    monkeypatch.setattr(client.requests, "patch", _forbidden)


# ── fetch_kb_articles ────────────────────────────────────────────────────────

def test_fetch_kb_articles_routes_to_servicenow_when_selected(monkeypatch):
    monkeypatch.setattr(client, "ITSM_PROVIDER", "SERVICENOW")
    _assert_local_backend_not_called(monkeypatch)
    monkeypatch.setattr(client.servicenow_client, "fetch_kb_articles", lambda: [{"number": "KB1"}])

    result = client.fetch_kb_articles("token")
    assert result == [{"number": "KB1"}]


def test_fetch_kb_articles_routes_to_local_backend_by_default(monkeypatch):
    monkeypatch.setattr(client, "ITSM_PROVIDER", "LOCAL_NESTJS")
    called = {"n": 0}

    def fake_get(url, headers=None, timeout=None):
        called["n"] += 1
        assert "knowledge/articles" in url
        return _FakeResponse(200, [{"number": "KB-local"}])

    monkeypatch.setattr(client.requests, "get", fake_get)
    result = client.fetch_kb_articles("token")

    assert result == [{"number": "KB-local"}]
    assert called["n"] == 1


# ── save_new_kb_article_to_storage ──────────────────────────────────────────

def test_save_new_kb_article_is_deferred_noop_in_servicenow_mode(monkeypatch):
    monkeypatch.setattr(client, "ITSM_PROVIDER", "SERVICENOW")
    _assert_local_backend_not_called(monkeypatch)

    result = client.save_new_kb_article_to_storage({"title": "Synthesized SOP"})
    assert result is None


# ── resolve_ci_credentials ──────────────────────────────────────────────────

def test_resolve_ci_credentials_uses_servicenow_cmdb_when_selected(monkeypatch):
    monkeypatch.setattr(client, "ITSM_PROVIDER", "SERVICENOW")
    _assert_local_backend_not_called(monkeypatch)
    monkeypatch.setattr(client, "CI_CREDENTIALS", {
        "Worker1": {"ip": "1.1.1.1", "user": "root", "password": "pw", "os": "stale-os"},
    })
    monkeypatch.setattr(client.servicenow_client, "fetch_ci_details",
                         lambda name: {"name": name, "ip": "10.0.0.9", "os": "Linux"} if name == "Worker1" else None)

    ci_info, ci_name = client.resolve_ci_credentials({"configurationItem": "Worker1"})

    assert ci_info == {"ip": "10.0.0.9", "user": "root", "password": "pw", "os": "Linux"}
    assert ci_name == "Worker1"


def test_resolve_ci_credentials_uses_local_cmdb_by_default(monkeypatch):
    monkeypatch.setattr(client, "ITSM_PROVIDER", "LOCAL_NESTJS")
    monkeypatch.setattr(client, "CI_CREDENTIALS", {
        "Worker 1": {"ip": "192.168.56.10", "user": "root", "password": "root123", "os": "Unix / Linux"},
    })
    monkeypatch.setattr(client, "fetch_ci_inventory", lambda: {})

    ci_info, ci_name = client.resolve_ci_credentials({"configurationItem": "Worker 1"})

    assert ci_info == {"ip": "192.168.56.10", "user": "root", "password": "root123", "os": "Unix / Linux"}


# ── already-provider-aware functions (regression lock) ──────────────────────

def test_fetch_incident_queue_routes_to_servicenow(monkeypatch):
    monkeypatch.setattr(client, "ITSM_PROVIDER", "SERVICENOW")
    _assert_local_backend_not_called(monkeypatch)
    monkeypatch.setattr(client.servicenow_client, "fetch_unassigned_incidents", lambda: [{"number": "INC-SN"}])

    assert client.fetch_incident_queue("token") == [{"number": "INC-SN"}]


def test_add_work_note_routes_to_servicenow(monkeypatch):
    monkeypatch.setattr(client, "ITSM_PROVIDER", "SERVICENOW")
    _assert_local_backend_not_called(monkeypatch)
    called = {}

    def fake_add(sys_id, note, author=None, session_state=None):
        called["sys_id"] = sys_id
        called["note"] = note
        return True

    monkeypatch.setattr(client.servicenow_client, "add_work_note", fake_add)
    assert client.add_work_note("token", "sys123", "hello") is True
    assert called == {"sys_id": "sys123", "note": "hello"}


def test_update_incident_status_routes_to_servicenow(monkeypatch):
    monkeypatch.setattr(client, "ITSM_PROVIDER", "SERVICENOW")
    _assert_local_backend_not_called(monkeypatch)
    monkeypatch.setattr(client.servicenow_client, "update_incident_status", lambda *a, **k: True)

    assert client.update_incident_status("token", "sys123", "RESOLVED") is True


# ── deliberately-NOT-provider-aware functions (regression lock) ─────────────

def test_fetch_agent_approvals_ignores_provider(monkeypatch):
    """HITL approvals stay on the Control Tower regardless of ITSM_PROVIDER --
    see client.py's fetch_agent_approvals docstring for why."""
    monkeypatch.setattr(client, "ITSM_PROVIDER", "SERVICENOW")
    called = {"n": 0}

    def fake_get(url, params=None, timeout=None):
        called["n"] += 1
        assert client.GOVERNANCE_BASE_URL in url
        return _FakeResponse(200, [{"id": "appr1"}])

    monkeypatch.setattr(client.requests, "get", fake_get)
    result = client.fetch_agent_approvals("token")

    assert result == [{"id": "appr1"}]
    assert called["n"] == 1


def test_submit_agent_approval_ignores_provider(monkeypatch):
    monkeypatch.setattr(client, "ITSM_PROVIDER", "SERVICENOW")
    called = {"n": 0}

    def fake_post(url, json=None, timeout=None):
        called["n"] += 1
        assert client.GOVERNANCE_BASE_URL in url
        return _FakeResponse(201, {})

    monkeypatch.setattr(client.requests, "post", fake_post)
    assert client.submit_agent_approval("token", {"incidentId": "x"}) is True
    assert called["n"] == 1
