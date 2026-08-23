"""
ServiceNow Integration Client for ITSM-Agentic Platform
Handles bi-directional REST communication with ServiceNow Table APIs (/api/now/table/*)
"""

import requests
from ..config import (
    logger,
    SN_INSTANCE_URL,
    SN_USERNAME,
    SN_PASSWORD,
    CI_CREDENTIALS
)
from ..session_state import default_session_state

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

    def fetch_unassigned_incidents(self):
        """Fetches active incidents from ServiceNow Table API (/api/now/table/incident)"""
        if not self._is_configured():
            logger.warning("ServiceNow client not fully configured (missing URL/credentials).")
            return []

        # State 1=New, 2=In Progress, 3=On Hold
        query = "stateIN1,2,3^ORDERBYDESCsys_created_on"
        url = f"{self.base_url}/api/now/table/incident?sysparm_query={query}&sysparm_limit=50"
        
        try:
            res = requests.get(url, auth=self.auth, headers=self.headers, timeout=10)
            if res.status_code == 200:
                raw_records = res.json().get("result", [])
                return [self.parse_servicenow_incident(rec) for rec in raw_records]
            else:
                logger.error(f"ServiceNow API fetch failed [{res.status_code}]: {res.text}")
        except Exception as e:
            logger.error(f"ServiceNow API fetch exception: {e}")
        return []

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

    def add_work_note(self, sys_id, note_text, author="Agentic AI SRE"):
        """Posts formatted Work Note to ServiceNow incident sys_id"""
        if not self._is_configured():
            return False

        formatted_note = f"[code]<b>{author}</b>[/code]\n{note_text}"
        url = f"{self.base_url}/api/now/table/incident/{sys_id}"
        payload = {"work_notes": formatted_note}

        try:
            res = requests.patch(url, auth=self.auth, headers=self.headers, json=payload, timeout=10)
            return res.status_code == 200
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
            res = requests.patch(url, auth=self.auth, headers=self.headers, json=payload, timeout=10)
            return res.status_code == 200
        except Exception as e:
            logger.error(f"Failed to update ServiceNow incident {sys_id} state: {e}")
            return False

servicenow_client = ServiceNowClient()
