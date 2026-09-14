"""
Remaps every Incident-linked timestamp onto exactly the last 4 months,
ending at the moment this script runs.

Why this exists: full_platform_data_dump.json freezes absolute dates at
export time. Every time it's restored, "the last 4 months" drifts further
into the past unless something re-anchors it to "now". This script is that
re-anchor -- it's called automatically at the end of restore_all_data.py, so
a fresh restore always looks like a live platform with 4 months of history
up to today, never like stale data from whenever the snapshot was captured.

Approach: per-incident linear time-remap, not per-record randomization.
Each incident's fractional position within the CURRENT createdAt range
(whatever that is post-restore) is computed, then mapped onto the new
[now - 4 months, now] range. That gives one delta per incident, applied
uniformly to every timestamp tied to that incident across both databases --
so all real internal chronology (resolution duration, work-note ordering,
governance record spacing) is preserved exactly; only the absolute
placement in time moves.

Fields touched:
  itsm_db.Incident: createdAt, updatedAt, openedAt, slaDueAt, resolvedAt, closedAt
  itsm_db.Incident.activitiesJson[].timestamp  (work notes -- embedded JSON)
  itsm_db.AgentApproval.timestamp   (entityId = Incident.id, entityType='Incident')
  itsm_db.AgentHistory.timestamp    (incidentId = Incident.number)
  agentic_sre_db.sre_history.executed_at          (incident_id = number OR id -- inconsistently keyed in this table)
  agentic_sre_db.sre_timeline.start_time/end_time (incident_number = Incident.number)
  agentic_sre_db.sre_approvals.requested_at/approved_at (incident_id = number OR id)

SlaExecution and Task are Prisma models keyed to Incident but not part of
the snapshot/restore pipeline (unused in this build) -- nothing to shift there.

Run standalone: python scripts/database/redistribute_timestamps.py
(also invoked automatically by restore_all_data.py after data load)
"""
import calendar
import json
import re
import sys
from datetime import datetime, timedelta

import psycopg2
import psycopg2.extras

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ITSM_DSN = "postgresql://postgres:postgres@localhost:5432/itsm_db"
SRE_DSN = "postgresql://postgres:postgres@localhost:5432/agentic_sre_db"

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")
PLAIN_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")


def months_ago(dt, months):
    """Stdlib-only calendar-month subtraction (no dateutil dependency)."""
    total = dt.month - 1 - months
    y = dt.year + total // 12
    m = total % 12 + 1
    day = min(dt.day, calendar.monthrange(y, m)[1])
    return dt.replace(year=y, month=m, day=day)


def shift_activity_timestamp(ts_str, delta):
    """Parses either ISO-Z or 'YYYY-MM-DD HH:MM:SS' style, shifts by delta,
    re-serializes in the SAME style it was originally in."""
    if not ts_str:
        return ts_str
    if ISO_RE.match(ts_str):
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        new_dt = dt + delta
        return new_dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{new_dt.microsecond // 1000:03d}Z"
    if PLAIN_RE.match(ts_str):
        dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
        new_dt = dt + delta
        return new_dt.strftime("%Y-%m-%d %H:%M:%S")
    # Unknown format -- leave untouched rather than corrupt it.
    return ts_str


def main():
    itsm = psycopg2.connect(ITSM_DSN)
    sre = psycopg2.connect(SRE_DSN)

    with itsm.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            'SELECT id, number, "createdAt", "updatedAt", "openedAt", "slaDueAt", '
            '"resolvedAt", "closedAt", "activitiesJson" FROM "Incident"'
        )
        incidents = cur.fetchall()

    if not incidents:
        print("No incidents found -- nothing to redistribute.")
        return

    old_created = [i["createdAt"] for i in incidents]
    old_min, old_max = min(old_created), max(old_created)
    old_span = (old_max - old_min).total_seconds()

    now = datetime.now()
    new_start = months_ago(now, 4)
    new_span = (now - new_start).total_seconds()

    print(f"Old createdAt range: {old_min} .. {old_max}")
    print(f"New createdAt range: {new_start} .. {now}")
    print(f"Redistributing {len(incidents)} incidents across the last 4 months...")

    deltas_by_number = {}
    deltas_by_id = {}

    itsm_cur = itsm.cursor()
    for inc in incidents:
        old_c = inc["createdAt"]
        frac = (old_c - old_min).total_seconds() / old_span if old_span > 0 else 0.0
        new_c = new_start + timedelta(seconds=new_span * frac)
        delta = new_c - old_c
        deltas_by_number[inc["number"]] = delta
        deltas_by_id[inc["id"]] = delta

        def shift(field):
            v = inc[field]
            return (v + delta) if v is not None else None

        new_updated = shift("updatedAt")
        new_opened = shift("openedAt")
        new_sla_due = shift("slaDueAt")
        new_resolved = shift("resolvedAt")
        new_closed = shift("closedAt")

        activities = inc["activitiesJson"]
        new_activities = activities if isinstance(activities, str) else json.dumps(activities) if activities is not None else None
        if activities:
            try:
                parsed = activities if isinstance(activities, list) else json.loads(activities)
                for act in parsed:
                    if isinstance(act, dict) and "timestamp" in act:
                        act["timestamp"] = shift_activity_timestamp(act["timestamp"], delta)
                new_activities = json.dumps(parsed)
            except Exception as e:
                print(f"  WARN: could not parse activitiesJson for {inc['number']}: {e}")

        itsm_cur.execute(
            '''UPDATE "Incident" SET "createdAt"=%s, "updatedAt"=%s, "openedAt"=%s, "slaDueAt"=%s,
               "resolvedAt"=%s, "closedAt"=%s, "activitiesJson"=%s::jsonb WHERE id=%s''',
            (new_c, new_updated, new_opened, new_sla_due, new_resolved, new_closed,
             new_activities, inc["id"]),
        )

    itsm_cur.execute('SELECT id, "entityId", "timestamp" FROM "AgentApproval" WHERE "entityType"=\'Incident\'')
    n = 0
    for aid, entity_id, ts in itsm_cur.fetchall():
        delta = deltas_by_id.get(entity_id)
        if delta:
            itsm_cur.execute('UPDATE "AgentApproval" SET "timestamp"=%s WHERE id=%s', (ts + delta, aid))
            n += 1
    print(f"AgentApproval: {n} rows shifted")

    itsm_cur.execute('SELECT id, "incidentId", "timestamp" FROM "AgentHistory" WHERE "incidentId" IS NOT NULL')
    n = 0
    for hid, inc_number, ts in itsm_cur.fetchall():
        delta = deltas_by_number.get(inc_number)
        if delta:
            itsm_cur.execute('UPDATE "AgentHistory" SET "timestamp"=%s WHERE id=%s', (ts + delta, hid))
            n += 1
    print(f"AgentHistory: {n} rows shifted")

    itsm.commit()
    itsm_cur.close()
    itsm.close()

    # sre_history / sre_approvals mix Incident.number and Incident.id as their
    # incident_id key depending on which code path wrote the row -- try both.
    sre_cur = sre.cursor()

    sre_cur.execute("SELECT id, incident_id, executed_at FROM sre_history WHERE incident_id IS NOT NULL")
    n = 0
    for rid, inc_key, ts in sre_cur.fetchall():
        delta = deltas_by_number.get(inc_key) or deltas_by_id.get(inc_key)
        if delta:
            sre_cur.execute("UPDATE sre_history SET executed_at=%s WHERE id=%s", (ts + delta, rid))
            n += 1
    print(f"sre_history: {n} rows shifted")

    sre_cur.execute("SELECT id, incident_number, start_time, end_time FROM sre_timeline WHERE incident_number IS NOT NULL")
    n = 0
    for tid, inc_number, st, et in sre_cur.fetchall():
        delta = deltas_by_number.get(inc_number)
        if delta:
            new_st = (st + delta) if st is not None else None
            new_et = (et + delta) if et is not None else None
            sre_cur.execute("UPDATE sre_timeline SET start_time=%s, end_time=%s WHERE id=%s", (new_st, new_et, tid))
            n += 1
    print(f"sre_timeline: {n} rows shifted")

    sre_cur.execute("SELECT id, incident_id, requested_at, approved_at FROM sre_approvals WHERE incident_id IS NOT NULL AND incident_id != ''")
    n = 0
    for aid, inc_key, req_at, appr_at in sre_cur.fetchall():
        delta = deltas_by_number.get(inc_key) or deltas_by_id.get(inc_key)
        if delta:
            new_req = (req_at + delta) if req_at is not None else None
            new_appr = (appr_at + delta) if appr_at is not None else None
            sre_cur.execute("UPDATE sre_approvals SET requested_at=%s, approved_at=%s WHERE id=%s", (new_req, new_appr, aid))
            n += 1
    print(f"sre_approvals: {n} rows shifted")

    sre.commit()
    sre_cur.close()
    sre.close()

    print("Timestamp redistribution complete.")


if __name__ == "__main__":
    main()
