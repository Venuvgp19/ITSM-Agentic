"""
Tests for daemon/itsm/client.py::fetch_ci_inventory / resolve_ci_credentials.

Previously CI credentials (worker1OL, worker2OL, control plane, WorkerNode1HL,
Venuvgp19) lived only in the hardcoded CI_CREDENTIALS dict in config.py --
not in the database, so a fresh environment (or an operator editing
credentials via the Control Tower) had no durable place for them. CI
credentials are now persisted in ConfigurationItem.attributesJson (see
scripts/database/seed_ci_credentials.py and PATCH /api/v1/cmdb/ci/:id) and
fetch_ci_inventory() reads them from there, live, taking priority over the
hardcoded dict, which now serves only as an offline/first-boot fallback.
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

    def json(self):
        return self._payload


def test_fetch_ci_inventory_shapes_cmdb_rows(monkeypatch):
    cmdb_rows = [
        {
            "name": "Worker1OL",
            "ipAddress": "192.168.56.10",
            "attributesJson": {"sshUser": "root", "sshPassword": "root123", "os": "Unix / Linux"},
        },
        {
            "name": "Venuvgp19",
            "ipAddress": "192.168.100.99",
            "attributesJson": {
                "sshUser": "Administrator", "sshPassword": "admin123", "os": "Windows 11",
                "secondaryIp": "192.168.100.42",
            },
        },
        # No credentials recorded -- must be skipped, not raise.
        {"name": "router-border-nyc-01", "ipAddress": "192.168.1.1", "attributesJson": None},
    ]
    monkeypatch.setattr(client.requests, "get", lambda *a, **kw: _FakeResponse(200, cmdb_rows))

    inventory = client.fetch_ci_inventory()

    assert inventory["Worker1OL"] == {"ip": "192.168.56.10", "user": "root", "password": "root123", "os": "Unix / Linux"}
    assert inventory["192.168.56.10"] == inventory["Worker1OL"]
    assert inventory["Venuvgp19"]["user"] == "Administrator"
    assert inventory["192.168.100.42"]["ip"] == "192.168.100.42"
    assert "router-border-nyc-01" not in inventory


def test_fetch_ci_inventory_returns_empty_on_unreachable_backend(monkeypatch):
    def _raise(*a, **kw):
        raise ConnectionError("backend down")
    monkeypatch.setattr(client.requests, "get", _raise)

    assert client.fetch_ci_inventory() == {}


def test_resolve_ci_credentials_prefers_live_cmdb_over_hardcoded_fallback(monkeypatch):
    # Live CMDB has different credentials for the same host than the
    # hardcoded CI_CREDENTIALS fallback -- live must win.
    monkeypatch.setattr(client, "CI_CREDENTIALS", {
        "Worker 1": {"ip": "192.168.56.10", "user": "root", "password": "stale-fallback-password", "os": "Unix / Linux"},
    })
    monkeypatch.setattr(client, "fetch_ci_inventory", lambda: {
        "Worker1OL": {"ip": "192.168.56.10", "user": "root", "password": "rotated-live-password", "os": "Unix / Linux"},
    })

    info, matched_key = client.resolve_ci_credentials({"configurationItem": "Worker1OL"})

    assert info["password"] == "rotated-live-password"
    assert matched_key == "Worker1OL"


def test_resolve_ci_credentials_falls_back_to_hardcoded_when_cmdb_unreachable(monkeypatch):
    monkeypatch.setattr(client, "CI_CREDENTIALS", {
        "Worker 1": {"ip": "192.168.56.10", "user": "root", "password": "root123", "os": "Unix / Linux"},
    })
    monkeypatch.setattr(client, "fetch_ci_inventory", lambda: {})

    info, matched_key = client.resolve_ci_credentials({"configurationItem": "Worker 1"})

    assert info == {"ip": "192.168.56.10", "user": "root", "password": "root123", "os": "Unix / Linux"}


def test_resolve_ci_credentials_fuzzy_matches_live_cmdb_entries(monkeypatch):
    monkeypatch.setattr(client, "CI_CREDENTIALS", {})
    monkeypatch.setattr(client, "fetch_ci_inventory", lambda: {
        "Worker2OL": {"ip": "192.168.56.11", "user": "root", "password": "root123", "os": "Unix / Linux"},
    })

    # "Worker 2" (space, no OL suffix) must still fuzzy-match "Worker2OL".
    info, matched_key = client.resolve_ci_credentials({"ci_name": "Worker 2"})

    assert matched_key == "Worker2OL"
    assert info["ip"] == "192.168.56.11"


def test_resolve_ci_credentials_returns_none_when_nothing_matches(monkeypatch):
    monkeypatch.setattr(client, "CI_CREDENTIALS", {})
    monkeypatch.setattr(client, "fetch_ci_inventory", lambda: {})

    info, matched_key = client.resolve_ci_credentials({"shortDescription": "totally unrelated ticket"})

    assert info is None
    assert matched_key is None
