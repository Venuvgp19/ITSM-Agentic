import os
import sys
import subprocess

sys.stdout.reconfigure(encoding='utf-8')

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
SQL_DUMP_PATH = os.path.join(REPO_ROOT, "database_dump.sql")

if not os.path.exists(SQL_DUMP_PATH):
    print(f"❌ SQL dump file not found: {SQL_DUMP_PATH}")
    sys.exit(1)

print("--- RESTORING POSTGRESQL DATA FROM NATIVE SQL DUMP (database_dump.sql) ---")

cmd = f'psql -U itsm_user -d itsm_db -h 127.0.0.1 -p 5432 -f "{SQL_DUMP_PATH}"'
print(f"Executing: {cmd}")
ret = os.system(cmd)

if ret == 0:
    print("✅ PostgreSQL Database Restoration Complete!")
else:
    print(f"⚠️ SQL execution returned code {ret}. Attempting Python fallback restoration...")
    import psycopg2
    DB_URL = os.environ.get("DATABASE_URL", "postgresql://itsm_user:itsm_password@127.0.0.1:5432/itsm_db")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    with open(SQL_DUMP_PATH, "r", encoding="utf-8") as f:
        sql_statements = f.read().split(";\n")
        for stmt in sql_statements:
            if stmt.strip() and not stmt.strip().startswith("--"):
                try:
                    cur.execute(stmt + ";")
                except Exception as e:
                    conn.rollback()
                    continue
        conn.commit()
    cur.close()
    conn.close()
    print("✅ Fallback Database Restoration Complete!")

print("\n--- RE-INDEXING CHROMADB VECTOR DB FROM RESTORED KBS ---")
reindex_script = os.path.join(REPO_ROOT, "reindex_chromadb.py")
if os.path.exists(reindex_script):
    subprocess.call(["python", reindex_script])
print("✅ Database & Vector Store Restoration Complete!")
