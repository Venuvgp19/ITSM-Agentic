"""
ServiceNow Integration Client for ITSM-Agentic Platform
Handles bi-directional REST communication with ServiceNow Table APIs (/api/now/table/*)

NOTE: apps/backend/src/modules/servicenow/servicenow.service.ts has its own,
independent ServiceNow Table API client in TypeScript, used by the MCP server's
on-demand servicenow_* tools (a different caller/process than this daemon's
autonomous polling loop). SN_STATE_MAP/REVERSE_SN_STATE_MAP below is the canonical
copy of the state-code mapping -- keep the TS side's copy in sync with it.
"""

import time
import requests
from ..config import (
    logger,
    SN_INSTANCE_URL,
    SN_USERNAME,
    SN_PASSWORD,
    CI_CREDENTIALS
)
from ..session_state import default_session_state

_MAX_RETRIES = 2
_RETRY_BACKOFF_SECONDS = 1
_QUEUE_PAGE_SIZE = 100
_QUEUE_MAX_PAGES = 10  # safety cap: 1000 records

SN_STATE_MAP = {
    1: "NEW",
    2: "IN_PROGRESS",
    3: "ON_HOLD",
    6: "RESOLVED",
    7: "CLOSED"
}

REVERSE_SN_STATE_MAP = {
    "NEW": 1,
    "IN_PROGRESS": 2,
    "ON_HOLD": 3,
    "RESOLVED": 6,
    "CLOSED": 7
}

class ServiceNowClient:
    def __init__(self, instance_url=None, username=None, password=None):
        self.base_url = (instance_url or SN_INSTANCE_URL or "").rstrip('/')
        self.auth = (username or SN_USERNAME, password or SN_PASSWORD)
        self.headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    def _is_configured(self):
        return bool(self.base_url and self.auth[0] and self.auth[1])

    def _request_with_retry(self, method, url, **kwargs):
        """
        Shared retry wrapper for all Table API calls: matches the inline
        for-attempt-range retry style already used elsewhere in the daemon
        (daemon/llm.py's fallback loop, ssh/session.py's connection retries)
        rather than introducing a new shared decorator/helper class. Retries on
        connection/timeout errors and 5xx responses; does NOT retry on 4xx (bad
        request/auth/not-found are not transient).
        """
        last_exc = None
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                res = requests.request(method, url, auth=self.auth, headers=self.headers, timeout=10, **kwargs)
                if res.status_code >= 500 and attempt < _MAX_RETRIES:
                    logger.warning(f"ServiceNow API {method} {url} returned {res.status_code} (attempt {attempt}/{_MAX_RETRIES}) -- retrying...")
                    time.sleep(_RETRY_BACKOFF_SECONDS)
                    continue
                return res
            except (requests.ConnectionError, requests.Timeout) as e:
                last_exc = e
                if attempt < _MAX_RETRIES:
                    logger.warning(f"ServiceNow API {method} {url} connection error (attempt {attempt}/{_MAX_RETRIES}): {e} -- retrying...")
                    time.sleep(_RETRY_BACKOFF_SECONDS)
                    continue
                raise
        if last_exc:
            raise last_exc

    def fetch_unassigned_incidents(self):
        """Fetches active incidents from ServiceNow Table API (/api/now/table/incident),
        paginating via sysparm_offset until a short page is returned or the safety cap
        (_QUEUE_MAX_PAGES * _QUEUE_PAGE_SIZE records) is hit -- previously hardcoded to a
        single sysparm_limit=50 request, silently truncating the queue on any larger
        ServiceNow instance."""
        if not self._is_configured():
            logger.warning("ServiceNow client not fully configured (missing URL/credentials).")
            return []

        # State 1=New, 2=In Progress, 3=On Hold
        query = "stateIN1,2,3^ORDERBYDESCsys_created_on"
        all_records = []
        try:
            for page in range(_QUEUE_MAX_PAGES):
                offset = page * _QUEUE_PAGE_SIZE
                url = (
                    f"{self.base_url}/api/now/table/incident"
                    f"?sysparm_query={query}&sysparm_limit={_QUEUE_PAGE_SIZE}&sysparm_offset={offset}"
                )
                res = self._request_with_retry("GET", url)
                if res.status_code != 200:
                    logger.error(f"ServiceNow API fetch failed [{res.status_code}]: {res.text}")
                    break
                page_records = res.json().get("result", [])
                all_records.extend(page_records)
                if len(page_records) < _QUEUE_PAGE_SIZE:
                    break
            else:
                logger.warning(f"ServiceNow queue fetch hit the {_QUEUE_MAX_PAGES}-page safety cap ({_QUEUE_MAX_PAGES * _QUEUE_PAGE_SIZE} records) -- there may be more unfetched incidents.")
        except Exception as e:
            logger.error(f"ServiceNow API fetch exception: {e}")
        return [self.parse_servicenow_incident(rec) for rec in all_records]

    def parse_servicenow_incident(self, sn_record):
        """Translates ServiceNow record dict into ITSM-Agentic standard incident dict"""
        raw_state = 1
        try:
            raw_state = int(sn_record.get("state", 1))
        except (ValueError, TypeError):
            pass

        internal_state = SN_STATE_MAP.get(raw_state, "NEW")
        
        ci_field = sn_record.get("cmdb_ci", {})
        ci_name = ci_field.get("display_value") if isinstance(ci_field, dict) else str(ci_field or "")

        return {
            "id": sn_record.get("sys_id"),
            "number": sn_record.get("number"),
            "sys_id": sn_record.get("sys_id"),
            "title": sn_record.get("short_description", "ServiceNow Incident"),
            "shortDescription": sn_record.get("short_description", ""),
            "description": sn_record.get("description", ""),
            "category": sn_record.get("category", "Infrastructure"),
            "priority": f"P{sn_record.get('priority', '3')}",
            "state": internal_state,
            "configurationItem": ci_name if ci_name and ci_name.lower() not in ["none", "null", ""] else "Worker 1",
            "assignedTo": sn_record.get("assigned_to", {}).get("display_value", "Unassigned")
        }

    def add_work_note(self, sys_id, note_text, author="Agentic AI SRE", session_state=None):
        """
        Posts formatted Work Note to ServiceNow incident sys_id.

        Dedup: ServiceNow work notes live in the append-only sys_journal_field
        table, not on the incident record itself -- querying it per-post to check
        for an existing identical note is an awkward extra round-trip against a
        journal API. Instead, dedup against an in-memory set on session_state
        (already imported as default_session_state, previously unused in this
        file). This mirrors the intent of itsm/client.py's LOCAL_NESTJS
        add_work_note (which checks existing DB activity history before posting)
        but is NOT restart-safe -- a daemon restart clears the in-memory set, so a
        note could be re-posted once after a restart. Accepted degradation given
        SN's journal API shape; flagged here rather than silently differing.
        """
        if not self._is_configured():
            return False

        state = session_state or default_session_state
        dedup_key = (sys_id, hash(note_text))
        if hasattr(state, "has_posted_sn_work_note") and state.has_posted_sn_work_note(dedup_key):
            logger.info(f"ℹ️ ServiceNow work note for {sys_id} already posted this session (identical text) -- skipping duplicate.")
            return True

        formatted_note = f"[code]<b>{author}</b>[/code]\n{note_text}"
        url = f"{self.base_url}/api/now/table/incident/{sys_id}"
        payload = {"work_notes": formatted_note}

        try:
            res = self._request_with_retry("PATCH", url, json=payload)
            ok = res.status_code == 200
            if ok and hasattr(state, "mark_posted_sn_work_note"):
                state.mark_posted_sn_work_note(dedup_key)
            return ok
        except Exception as e:
            logger.error(f"Failed to post ServiceNow work note for {sys_id}: {e}")
            return False

    def update_incident_status(self, sys_id, state, resolution_code="Automated Remediation", resolution_notes=None):
        """Updates incident state in ServiceNow"""
        if not self._is_configured():
            return False

        sn_state_code = REVERSE_SN_STATE_MAP.get(state, 2)
        url = f"{self.base_url}/api/now/table/incident/{sys_id}"

        payload = {"state": str(sn_state_code)}
        if state == "RESOLVED":
            payload["close_code"] = resolution_code
            payload["close_notes"] = resolution_notes or "Resolved automatically by ITSM-Agentic Engine."

        try:
            res = self._request_with_retry("PATCH", url, json=payload)
            return res.status_code == 200
        except Exception as e:
            logger.error(f"Failed to update ServiceNow incident {sys_id} state: {e}")
            return False

    def fetch_kb_articles(self):
        """
        Fetches published Knowledge articles from ServiceNow's kb_knowledge table,
        mapped into this platform's KnowledgeArticle shape. Read-only for now --
        write-back (save_kb_article) is deliberately deferred: ServiceNow requires
        a valid kb_knowledge_base reference to create a KB record (a new
        SN_KB_BASE_ID config value would be needed), and kb_knowledge.text is
        free-form HTML rather than this platform's structured
        {symptoms, rootCause, resolutionSteps} shape, making write-back a lossy
        round-trip not worth taking on until there's a real SN instance to
        validate the mapping against.
        """
        if not self._is_configured():
            logger.warning("ServiceNow client not fully configured (missing URL/credentials).")
            return []

        query = "workflow_state=published"
        url = f"{self.base_url}/api/now/table/kb_knowledge?sysparm_query={query}&sysparm_limit=100"
        try:
            res = self._request_with_retry("GET", url)
            if res.status_code == 200:
                raw_records = res.json().get("result", [])
                return [self.parse_servicenow_kb_article(rec) for rec in raw_records]
            else:
                logger.error(f"ServiceNow KB fetch failed [{res.status_code}]: {res.text}")
        except Exception as e:
            logger.error(f"ServiceNow KB fetch exception: {e}")
        return []

    def parse_servicenow_kb_article(self, sn_record):
        """Translates a ServiceNow kb_knowledge record into this platform's
        KnowledgeArticle shape. text (HTML body) is stored into `summary` rather
        than parsed into structured resolutionSteps/symptoms/rootCause -- SN's KB
        body has no reliable structure to extract those from."""
        return {
            "number": sn_record.get("number"),
            "id": sn_record.get("sys_id"),
            "title": sn_record.get("short_description", "ServiceNow KB Article"),
            "summary": sn_record.get("text", ""),
            "category": sn_record.get("kb_knowledge_base", {}).get("display_value", "General")
                if isinstance(sn_record.get("kb_knowledge_base"), dict) else sn_record.get("kb_knowledge_base", "General"),
            "symptoms": [],
            "rootCause": "",
            "resolutionSteps": [],
        }

    def fetch_ci_details(self, ci_name):
        """
        Queries ServiceNow's CMDB (cmdb_ci table) for Configuration Item metadata
        (IP/hostname/OS) by name. Returns metadata only -- ServiceNow's CMDB does
        not store SSH credentials; actual login secrets stay in the existing
        CI_CREDENTIALS fallback dict (config.py), matching how LOCAL_NESTJS mode
        already layers live CMDB metadata under the same local credential store.
        """
        if not self._is_configured() or not ci_name:
            return None

        query = f"name={ci_name}"
        url = f"{self.base_url}/api/now/table/cmdb_ci?sysparm_query={query}&sysparm_limit=1"
        try:
            res = self._request_with_retry("GET", url)
            if res.status_code == 200:
                records = res.json().get("result", [])
                if records:
                    rec = records[0]
                    return {
                        "name": rec.get("name", ci_name),
                        "ip": rec.get("ip_address", ""),
                        "os": rec.get("os", ""),
                    }
            else:
                logger.error(f"ServiceNow CMDB fetch failed [{res.status_code}]: {res.text}")
        except Exception as e:
            logger.error(f"ServiceNow CMDB fetch exception for '{ci_name}': {e}")
        return None

servicenow_client = ServiceNowClient()
