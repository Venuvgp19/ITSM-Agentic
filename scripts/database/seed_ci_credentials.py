"""
Persists SSH/RDP credentials and OS info into the existing CMDB
ConfigurationItem rows (Worker1OL, Worker2OL, WorkerNode1HL, control plane,
Venuvgp19), so the SRE agent daemon can resolve target-host credentials from
the database instead of the hardcoded CI_CREDENTIALS dict in
services/sre-agent-daemon/daemon/config.py. That dict lives only in a
checked-out copy of the repo; a fresh checkout on another machine has it too
(it's source-controlled), but any credential the operator changes there is
lost on redeploy/reset since it's not part of the DB restore/export snapshot.
Moving it into ConfigurationItem.attributesJson means `restore_all_data.py`
/ `export_full_database_snapshot.py` carry it like any other CMDB data.

Matches CI rows by ipAddress (already populated in the live data for all
five hosts) rather than by name, since name casing/spacing has drifted
between the CMDB seed data ("Worker1OL", "control plane") and the daemon's
CI_CREDENTIALS dict keys ("Worker 1", "Control Plane") -- ipAddress is exact.

Idempotent: only writes rows whose attributesJson is missing/differs from
the target sshUser/sshPassword/os values; safe to re-run after a reseed.

Usage:
    python scripts/database/seed_ci_credentials.py [--dry-run]
"""
import argparse
import json

import psycopg2
import psycopg2.extras

DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/itsm_db"

# ipAddress -> credentials to merge into that CI's attributesJson.
# Source of truth until this script runs: services/sre-agent-daemon/daemon/config.py::CI_CREDENTIALS.
CI_CREDENTIAL_SEED = {
    "192.168.56.10":  {"sshUser": "root", "sshPassword": "root123", "os": "Unix / Linux"},
    "192.168.56.11":  {"sshUser": "root", "sshPassword": "root123", "os": "Unix / Linux"},
    "192.168.100.101": {"sshUser": "root", "sshPassword": "root123", "os": "Unix / Linux"},
    "192.168.100.102": {"sshUser": "root", "sshPassword": "root123", "os": "Unix / Linux"},
    "192.168.100.99": {"sshUser": "Administrator", "sshPassword": "admin123", "os": "Windows 11"},
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Report what would change without writing.")
    args = parser.parse_args()

    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute('SELECT id, name, "ipAddress", "attributesJson" FROM "ConfigurationItem" WHERE "ipAddress" = ANY(%s)',
                        (list(CI_CREDENTIAL_SEED.keys()),))
            rows = {r["ipAddress"]: r for r in cur.fetchall()}

        updated = 0
        for ip, creds in CI_CREDENTIAL_SEED.items():
            row = rows.get(ip)
            if not row:
                print(f"  skip {ip}: no ConfigurationItem row with this ipAddress (create it via POST /api/v1/cmdb/ci first).")
                continue
            existing_attrs = row["attributesJson"] or {}
            if all(existing_attrs.get(k) == v for k, v in creds.items()):
                print(f"  {row['name']} ({ip}): already up to date.")
                continue
            merged = {**existing_attrs, **creds}
            print(f"  {row['name']} ({ip}): {'would set' if args.dry_run else 'setting'} attributesJson -> {json.dumps(merged)}")
            if not args.dry_run:
                with conn.cursor() as upd:
                    upd.execute(
                        'UPDATE "ConfigurationItem" SET "attributesJson" = %s, "updatedAt" = now() WHERE id = %s',
                        (psycopg2.extras.Json(merged), row["id"]),
                    )
                updated += 1
        if not args.dry_run:
            conn.commit()
        print(f"Done. {updated} Configuration Item(s) updated.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
