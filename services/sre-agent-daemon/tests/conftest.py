"""
Test-collection-time only: registers a stub `daemon` package in sys.modules
before any test imports `daemon.<submodule>`, so Python's import machinery
doesn't run the real daemon/__init__.py (which eagerly connects to ChromaDB
as an import-time side effect -- unrelated to anything under test here, and
prone to a native crash in this environment against the committed
chroma_db/ binary). `daemon.<submodule>` imports still resolve to the real
files on disk via the stub's __path__; only the top-level package body is
skipped. Production code paths (running the actual daemon) are unaffected --
this file only runs under pytest.
"""
import os
import sys
import types

_TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
_DAEMON_SERVICE_ROOT = os.path.dirname(_TESTS_DIR)
sys.path.insert(0, _DAEMON_SERVICE_ROOT)

if "daemon" not in sys.modules:
    _stub = types.ModuleType("daemon")
    _stub.__path__ = [os.path.join(_DAEMON_SERVICE_ROOT, "daemon")]
    sys.modules["daemon"] = _stub
