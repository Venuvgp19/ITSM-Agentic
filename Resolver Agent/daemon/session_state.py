import threading
from collections import defaultdict

class SessionStateManager:
    """
    Thread-safe Centralized Session State Manager.
    Encapsulates all runtime session tracking, per-host serialization locks,
    incident lifecycle locks, and token usage metrics.
    """
    def __init__(self):
        self._lock = threading.RLock()
        self._active_processing_incidents = set()
        self._locked_incident_sessions = set()
        self._resolved_incident_sessions = set()
        self._submitted_approval_incidents = set()
        self._processed_new_incidents = set()
        self._processed_in_progress_incidents = set()
        self._unspecified_ci_incidents = set()
        self._host_execution_locks = defaultdict(threading.Lock)
        self._token_usage = {
            "calls": [],
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }

    def is_unspecified_ci(self, inc_id: str) -> bool:
        with self._lock:
            return inc_id in self._unspecified_ci_incidents

    def mark_unspecified_ci(self, inc_id: str):
        with self._lock:
            self._unspecified_ci_incidents.add(inc_id)

    def clear_unspecified_ci(self, inc_id: str):
        with self._lock:
            self._unspecified_ci_incidents.discard(inc_id)

    # --- Incident Lifecycle & Execution Session Locking ---
    def is_locked(self, inc_id: str) -> bool:
        with self._lock:
            return inc_id in self._locked_incident_sessions

    def lock_session(self, inc_id: str):
        with self._lock:
            self._locked_incident_sessions.add(inc_id)

    def unlock_session(self, inc_id: str):
        with self._lock:
            self._locked_incident_sessions.discard(inc_id)

    def is_resolved(self, inc_id: str) -> bool:
        with self._lock:
            return inc_id in self._resolved_incident_sessions

    def mark_resolved(self, inc_id: str):
        with self._lock:
            self._resolved_incident_sessions.add(inc_id)
            self._locked_incident_sessions.add(inc_id)

    def unmark_resolved(self, inc_id: str):
        with self._lock:
            self._resolved_incident_sessions.discard(inc_id)

    # --- Active Concurrent Processing Guard ---
    def is_active(self, inc_id: str) -> bool:
        with self._lock:
            return inc_id in self._active_processing_incidents

    def try_acquire_incident_processing(self, inc_id: str) -> bool:
        """
        Atomically checks if incident is currently being processed by another worker thread.
        If not active, marks it active and returns True; otherwise returns False.
        """
        with self._lock:
            if inc_id in self._active_processing_incidents:
                return False
            self._active_processing_incidents.add(inc_id)
            return True

    def release_incident_processing(self, inc_id: str):
        with self._lock:
            self._active_processing_incidents.discard(inc_id)

    # --- Host-Level Execution Serializer ---
    def get_host_lock(self, host_ip: str) -> threading.Lock:
        with self._lock:
            return self._host_execution_locks[host_ip or "default_host"]

    # --- Approval & Queue Stage Tracking ---
    def has_submitted_approval(self, inc_id: str) -> bool:
        with self._lock:
            return inc_id in self._submitted_approval_incidents

    def mark_submitted_approval(self, inc_id: str):
        with self._lock:
            self._submitted_approval_incidents.add(inc_id)

    def has_processed_new(self, inc_id: str) -> bool:
        with self._lock:
            return inc_id in self._processed_new_incidents

    def mark_processed_new(self, inc_id: str):
        with self._lock:
            self._processed_new_incidents.add(inc_id)

    def has_processed_in_progress(self, inc_id: str) -> bool:
        with self._lock:
            return inc_id in self._processed_in_progress_incidents

    def mark_processed_in_progress(self, inc_id: str):
        with self._lock:
            self._processed_in_progress_incidents.add(inc_id)

    def unmark_processed_in_progress(self, inc_id: str):
        with self._lock:
            self._processed_in_progress_incidents.discard(inc_id)

    def reset_incident_locks(self, inc_id: str):
        """Removes all session locks for an incident (e.g. when manually reopened or approved)."""
        with self._lock:
            self._locked_incident_sessions.discard(inc_id)
            self._resolved_incident_sessions.discard(inc_id)
            self._processed_in_progress_incidents.discard(inc_id)

    # --- Token Usage Tracking ---
    def record_token_call(self, call_record: dict):
        with self._lock:
            pt = call_record.get("prompt_tokens", 0) or 0
            ct = call_record.get("completion_tokens", 0) or 0
            tt = call_record.get("total_tokens", 0) or (pt + ct)
            self._token_usage["calls"].append(call_record)
            self._token_usage["prompt_tokens"] += pt
            self._token_usage["completion_tokens"] += ct
            self._token_usage["total_tokens"] += tt

    def get_total_tokens(self) -> int:
        with self._lock:
            return self._token_usage["total_tokens"]

    def get_incident_token_summary(self, inc_number: str) -> dict:
        with self._lock:
            inc_calls = [c for c in self._token_usage["calls"] if inc_number in c.get("label", "")]
            pt = sum(c.get("prompt_tokens", 0) for c in inc_calls)
            ct = sum(c.get("completion_tokens", 0) for c in inc_calls)
            tt = sum(c.get("total_tokens", 0) for c in inc_calls)
            return {
                "count": len(inc_calls),
                "prompt_tokens": pt,
                "completion_tokens": ct,
                "total_tokens": tt,
                "estimated_usd": (tt / 1_000_000.0) * 8.00
            }

    @property
    def token_usage_dict(self) -> dict:
        with self._lock:
            return self._token_usage

    # Backward-compatibility property facades for legacy set/dict access
    @property
    def active_processing_incidents(self):
        return self._active_processing_incidents

    @property
    def locked_incident_sessions(self):
        return self._locked_incident_sessions

    @property
    def resolved_incident_sessions(self):
        return self._resolved_incident_sessions

    @property
    def submitted_approval_incidents(self):
        return self._submitted_approval_incidents

    @property
    def processed_new_incidents(self):
        return self._processed_new_incidents

    @property
    def processed_in_progress_incidents(self):
        return self._processed_in_progress_incidents

    @property
    def host_execution_locks(self):
        return self._host_execution_locks

# Default global instance for seamless backward compatibility
default_session_state = SessionStateManager()
