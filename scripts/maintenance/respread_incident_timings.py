"""
Re-times every Incident row so its lifecycle (opened -> work notes -> resolved
-> closed -> updated) is spread realistically across the past 4 months instead
of being clustered at "now" (openedAt was frozen to a single seed timestamp
for all 1,193 rows; resolvedAt was clustered into a 2-day window).

Incidents are ordered by ticket number and mapped onto the 4-month window with
jitter, so INC0000001 lands near the start and the highest-numbered ticket
lands near today -- preserving the existing numbering as a rough timeline.
Each incident's activitiesJson (work notes / comments) is re-spread between
its own openedAt and resolution/closure time, preserving order and count.

Usage:
    python respread_incident_timings.py --dry-run [--limit N]   # preview only
    python respread_incident_timings.py                          # commit
"""
import argparse
import json
import random
from datetime import datetime, timedelta

import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = 'postgresql://postgres:postgres@localhost:5432/itsm_db'
WINDOW_DAYS = 122  # ~4 months


def resolution_duration(priority: str) -> timedelta:
    p = (priority or '').upper()
    if 'P1' in p or 'CRITICAL' in p:
        minutes = random.uniform(15, 240)
    elif 'P2' in p or 'HIGH' in p:
        minutes = random.uniform(60, 720)
    elif 'P4' in p or 'LOW' in p:
        minutes = random.uniform(1440, 7200)
    else:  # P3 / MODERATE / unrecognized default
        minutes = random.uniform(240, 4320)
    return timedelta(minutes=minutes)


def fmt(dt: datetime) -> str:
    return dt.strftime('%Y-%m-%d %H:%M:%S')


def retime_activities(activities, opened_at: datetime, end_of_life: datetime):
    if not activities:
        return activities
    acts = list(activities)
    m = len(acts)
    positions = [0.5] if m == 1 else [k / (m - 1) for k in range(m)]
    span = max((end_of_life - opened_at).total_seconds(), 60.0)
    new_activities = []
    prev_dt = opened_at
    for k, act in enumerate(acts):
        base = opened_at + timedelta(seconds=positions[k] * span)
        dt = base + timedelta(seconds=random.uniform(-120, 120))
        if dt < prev_dt:
            dt = prev_dt + timedelta(seconds=random.uniform(30, 300))
        if dt > end_of_life:
            dt = end_of_life
        prev_dt = dt
        new_act = dict(act)
        new_act['timestamp'] = fmt(dt)
        new_activities.append(new_act)
    return new_activities


def compute_new_timings(number: str, index: int, total: int, state: str, priority: str,
                         window_start: datetime, now: datetime):
    span = (now - window_start).total_seconds()
    frac = index / max(total - 1, 1)
    jitter = random.uniform(-3600 * 20, 3600 * 20)  # +/- ~20h shuffle so ordering isn't perfectly linear
    opened_at = window_start + timedelta(seconds=frac * span + jitter)

    if opened_at < window_start:
        opened_at = window_start + timedelta(minutes=random.uniform(0, 60))
    if opened_at > now - timedelta(minutes=5):
        opened_at = now - timedelta(minutes=random.uniform(5, 120))

    resolved_at = None
    closed_at = None
    end_of_life = opened_at

    if state in ('RESOLVED', 'CLOSED'):
        # bound resolution to land strictly between opened_at and now, regardless of
        # how close opened_at itself already is to now
        remaining = max((now - opened_at).total_seconds(), 60.0)
        wanted = resolution_duration(priority).total_seconds()
        resolved_at = opened_at + timedelta(seconds=min(wanted, remaining * 0.9))
        end_of_life = resolved_at

        if state == 'CLOSED':
            remaining2 = max((now - resolved_at).total_seconds(), 60.0)
            wanted2 = timedelta(hours=random.uniform(1, 72)).total_seconds()
            closed_at = resolved_at + timedelta(seconds=min(wanted2, remaining2 * 0.9))
            end_of_life = closed_at
    else:
        # still active (ON_HOLD, NEW, IN_PROGRESS, ...): last touched sometime before now
        remaining = max((now - opened_at).total_seconds(), 60.0)
        end_of_life = opened_at + timedelta(seconds=random.uniform(60, remaining))

    # final safety net: everything must land within [opened_at, now]
    if end_of_life > now:
        end_of_life = now
    if resolved_at and resolved_at > now:
        resolved_at = now
    if closed_at and closed_at > now:
        closed_at = now

    return opened_at, resolved_at, closed_at, end_of_life


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without writing to the DB')
    parser.add_argument('--limit', type=int, default=None, help='Only process the first N incidents (by number)')
    args = parser.parse_args()

    random.seed(42)
    now = datetime.now()
    window_start = now - timedelta(days=WINDOW_DAYS)

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute('SELECT id, number, state, priority, "activitiesJson" FROM "Incident" ORDER BY number ASC')
    rows = cur.fetchall()
    total = len(rows)
    if args.limit:
        rows = rows[:args.limit]

    print(f'Re-timing {len(rows)} of {total} incidents across {window_start.date()} .. {now.date()} '
          f'({"DRY RUN" if args.dry_run else "WRITE"})')

    write_cur = conn.cursor()
    preview = []
    for i, row in enumerate(rows):
        opened_at, resolved_at, closed_at, end_of_life = compute_new_timings(
            row['number'], i, total, row['state'], row['priority'], window_start, now
        )
        new_activities = retime_activities(row['activitiesJson'], opened_at, end_of_life)

        if not args.dry_run:
            write_cur.execute(
                '''UPDATE "Incident"
                   SET "openedAt" = %s, "createdAt" = %s, "resolvedAt" = %s,
                       "closedAt" = %s, "updatedAt" = %s, "activitiesJson" = %s
                   WHERE id = %s''',
                (opened_at, opened_at, resolved_at, closed_at, end_of_life,
                 json.dumps(new_activities) if new_activities is not None else None,
                 row['id'])
            )
        else:
            preview.append({
                'number': row['number'],
                'state': row['state'],
                'priority': row['priority'],
                'openedAt': fmt(opened_at),
                'resolvedAt': fmt(resolved_at) if resolved_at else None,
                'closedAt': fmt(closed_at) if closed_at else None,
                'updatedAt': fmt(end_of_life),
                'activityTimestamps': [a['timestamp'] for a in (new_activities or [])],
            })

    if args.dry_run:
        with open('respread_preview.json', 'w', encoding='utf-8') as f:
            json.dump(preview, f, indent=2, ensure_ascii=False)
        print(f'Wrote preview of {len(preview)} incidents to respread_preview.json (no DB changes made).')
    else:
        conn.commit()
        print(f'Committed new timings for {len(rows)} incidents.')

    write_cur.close()
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
