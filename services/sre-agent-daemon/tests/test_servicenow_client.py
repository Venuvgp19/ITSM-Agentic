"""
Tests for daemon/itsm/servicenow_client.py.

Covers the fail-closed config gate, the state-code mapping round-trip, incident
field-mapping edge cases, queue pagination, connection retry, and work-note
dedup -- none of which had any test coverage before this file existed.
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
import daemon.itsm.servicenow_client as sn  # noqa: E402
from daemon.session_state import SessionStateManager  # noqa: E402


class _FakeResponse:
    def __init__(self, status_code, payload, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text or str(payload)

    def json(self):
        return self._payload


# ── _is_configured() fail-closed behavior ───────────────────────────────────

@pytest.mark.parametrize("url,user,pw", [
    ("", "", ""),
    ("https://real.service-now.com", "", ""),
    ("https://real.service-now.com", "admin", ""),
    ("", "admin", "password"),
])
def test_is_configured_false_for_incomplete_config(url, user, pw):
    client = sn.ServiceNowClient(instance_url=url, username=user, password=pw)
    assert client._is_configured() is False


def test_is_configured_true_for_complete_config():
    client = sn.ServiceNowClient(instance_url="https://real.service-now.com", username="admin", password="s3cr3t")
    assert client._is_configured() is True


# ── State-code mapping round-trip ───────────────────────────────────────────

def test_state_map_round_trips_for_every_entry():
    for sn_code, internal_state in sn.SN_STATE_MAP.items():
        assert sn.REVERSE_SN_STATE_MAP[internal_state] == sn_code


# ── parse_servicenow_incident() edge cases ──────────────────────────────────

def test_parse_incident_normal_record():
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")
    record = {
        "sys_id": "abc123", "number": "INC0010001", "short_description": "Disk full",
        "description": "root partition at 98%", "category": "Infrastructure",
        "priority": "2", "state": "2",
        "cmdb_ci": {"display_value": "Worker1OL"},
        "assigned_to": {"display_value": "Jane Doe"},
    }
    parsed = client.parse_servicenow_incident(record)
    assert parsed["state"] == "IN_PROGRESS"
    assert parsed["configurationItem"] == "Worker1OL"
    assert parsed["assignedTo"] == "Jane Doe"
    assert parsed["priority"] == "P2"


def test_parse_incident_missing_cmdb_ci_falls_back():
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")
    record = {"sys_id": "x", "number": "INC1", "state": "1"}
    parsed = client.parse_servicenow_incident(record)
    assert parsed["configurationItem"] == "Worker 1"


def test_parse_incident_missing_assigned_to_falls_back():
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")
    record = {"sys_id": "x", "number": "INC1", "state": "1"}
    parsed = client.parse_servicenow_incident(record)
    assert parsed["assignedTo"] == "Unassigned"


def test_parse_incident_non_integer_state_falls_back_to_new():
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")
    record = {"sys_id": "x", "number": "INC1", "state": "not-a-number"}
    parsed = client.parse_servicenow_incident(record)
    assert parsed["state"] == "NEW"


# ── fetch_unassigned_incidents() pagination ─────────────────────────────────

def test_fetch_unassigned_incidents_paginates_until_short_page(monkeypatch):
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")
    monkeypatch.setattr(sn, "time", types.SimpleNamespace(sleep=lambda s: None))
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append(url)
        if "sysparm_offset=0" in url:
            return _FakeResponse(200, {"result": [{"sys_id": str(i), "number": f"INC{i}"} for i in range(sn._QUEUE_PAGE_SIZE)]})
        if "sysparm_offset=" + str(sn._QUEUE_PAGE_SIZE) in url:
            return _FakeResponse(200, {"result": [{"sys_id": "last", "number": "INC-last"}]})
        return _FakeResponse(200, {"result": []})

    monkeypatch.setattr(sn.requests, "request", fake_request)
    results = client.fetch_unassigned_incidents()

    assert len(results) == sn._QUEUE_PAGE_SIZE + 1
    assert len(calls) == 2


def test_fetch_unassigned_incidents_stops_at_safety_cap(monkeypatch):
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")
    monkeypatch.setattr(sn, "time", types.SimpleNamespace(sleep=lambda s: None))
    calls = []

    def always_full_page(method, url, **kwargs):
        calls.append(url)
        return _FakeResponse(200, {"result": [{"sys_id": str(i)} for i in range(sn._QUEUE_PAGE_SIZE)]})

    monkeypatch.setattr(sn.requests, "request", always_full_page)
    results = client.fetch_unassigned_incidents()

    assert len(calls) == sn._QUEUE_MAX_PAGES
    assert len(results) == sn._QUEUE_MAX_PAGES * sn._QUEUE_PAGE_SIZE


# ── Retry on connection error ───────────────────────────────────────────────

def test_request_with_retry_recovers_from_one_connection_error(monkeypatch):
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")
    monkeypatch.setattr(sn, "time", types.SimpleNamespace(sleep=lambda s: None))
    attempts = {"n": 0}

    def flaky(method, url, **kwargs):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise sn.requests.ConnectionError("simulated transient failure")
        return _FakeResponse(200, {"result": []})

    monkeypatch.setattr(sn.requests, "request", flaky)
    res = client._request_with_retry("GET", "https://x/api/now/table/incident")

    assert attempts["n"] == 2
    assert res.status_code == 200


def test_request_with_retry_raises_after_exhausting_retries(monkeypatch):
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")
    monkeypatch.setattr(sn, "time", types.SimpleNamespace(sleep=lambda s: None))

    def always_fails(method, url, **kwargs):
        raise sn.requests.ConnectionError("permanently down")

    monkeypatch.setattr(sn.requests, "request", always_fails)
    with pytest.raises(sn.requests.ConnectionError):
        client._request_with_retry("GET", "https://x/api/now/table/incident")


# ── add_work_note() dedup ───────────────────────────────────────────────────

def test_add_work_note_dedups_identical_text_same_session(monkeypatch):
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")
    state = SessionStateManager()
    post_count = {"n": 0}

    def fake_request(method, url, **kwargs):
        post_count["n"] += 1
        return _FakeResponse(200, {})

    monkeypatch.setattr(sn.requests, "request", fake_request)

    assert client.add_work_note("sys1", "same note", session_state=state) is True
    assert client.add_work_note("sys1", "same note", session_state=state) is True
    assert post_count["n"] == 1, "second identical note should have been deduped, not re-posted"


def test_add_work_note_does_not_dedup_different_text(monkeypatch):
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")
    state = SessionStateManager()
    post_count = {"n": 0}

    def fake_request(method, url, **kwargs):
        post_count["n"] += 1
        return _FakeResponse(200, {})

    monkeypatch.setattr(sn.requests, "request", fake_request)

    client.add_work_note("sys1", "note A", session_state=state)
    client.add_work_note("sys1", "note B", session_state=state)
    assert post_count["n"] == 2


# ── fetch_kb_articles() / fetch_ci_details() mapping ────────────────────────

def test_fetch_kb_articles_maps_fields(monkeypatch):
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")

    def fake_request(method, url, **kwargs):
        return _FakeResponse(200, {"result": [{
            "number": "KB0001", "sys_id": "s1", "short_description": "Fix disk full",
            "text": "<p>Run cleanup script</p>", "kb_knowledge_base": {"display_value": "IT Ops"},
        }]})

    monkeypatch.setattr(sn.requests, "request", fake_request)
    articles = client.fetch_kb_articles()

    assert len(articles) == 1
    assert articles[0]["title"] == "Fix disk full"
    assert articles[0]["summary"] == "<p>Run cleanup script</p>"
    assert articles[0]["resolutionSteps"] == []  # deliberately not parsed from HTML


def test_fetch_ci_details_returns_metadata_only_no_credentials(monkeypatch):
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")

    def fake_request(method, url, **kwargs):
        return _FakeResponse(200, {"result": [{"name": "Worker1", "ip_address": "10.0.0.5", "os": "Linux"}]})

    monkeypatch.setattr(sn.requests, "request", fake_request)
    ci = client.fetch_ci_details("Worker1")

    assert ci == {"name": "Worker1", "ip": "10.0.0.5", "os": "Linux"}
    assert "user" not in ci and "password" not in ci


def test_fetch_ci_details_returns_none_when_not_found(monkeypatch):
    client = sn.ServiceNowClient(instance_url="https://x", username="a", password="b")
    monkeypatch.setattr(sn.requests, "request", lambda *a, **k: _FakeResponse(200, {"result": []}))
    assert client.fetch_ci_details("Unknown") is None
