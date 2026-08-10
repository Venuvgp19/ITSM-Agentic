import psycopg2
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

DB_URL = os.environ.get("DATABASE_URL", "postgresql://itsm_user:itsm_password@127.0.0.1:5432/itsm_db")
REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
DUMP_PATH = os.path.join(REPO_ROOT, "db_data_dump.json")

if not os.path.exists(DUMP_PATH):
    print(f"❌ Dump file not found: {DUMP_PATH}")
    sys.exit(1)

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

with open(DUMP_PATH, "r", encoding="utf-8") as f:
    db_dump = json.load(f)

print("--- RESTORING POSTGRESQL DATA FROM REPO DUMP ---")

for tbl, records in db_dump.items():
    if not records:
        continue
    
    cols = list(records[0].keys())
    col_names = ", ".join([f'"{c}"' for c in cols])
    placeholders = ", ".join(["%s"] * len(cols))
    update_clause = ", ".join([f'"{c}" = EXCLUDED."{c}"' for c in cols if c != "id"])
    
    sql = f'INSERT INTO "{tbl}" ({col_names}) VALUES ({placeholders}) ON CONFLICT ("id") DO UPDATE SET {update_clause};'
    
    count = 0
    for rec in records:
        vals = []
        for c in cols:
            v = rec[c]
            if isinstance(v, (dict, list)):
                vals.append(json.dumps(v))
            else:
                vals.append(v)
        try:
            cur.execute(sql, vals)
            count += 1
        except Exception as e:
            conn.rollback()
            try:
                cur.execute(f'INSERT INTO "{tbl}" ({col_names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING;', vals)
                conn.commit()
                count += 1
            except Exception as inner_e:
                conn.rollback()

    conn.commit()
    print(f"  - Restored {count}/{len(records)} records for table '{tbl}'.")

cur.close()
conn.close()

print("\n--- RE-INDEXING CHROMADB VECTOR DB FROM RESTORED KBS ---")
import subprocess
reindex_script = os.path.join(REPO_ROOT, "scratch", "sync_and_reindex_all_kbs.py")
if os.path.exists(reindex_script):
    subprocess.call(["python", reindex_script])
print("✅ Database & Vector Store Restoration Complete!")
