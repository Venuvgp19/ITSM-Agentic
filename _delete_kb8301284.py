import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Resolver Agent'))

import psycopg2
import chromadb
from chromadb.config import Settings

DB = 'postgresql://itsm_user:itsm_password@127.0.0.1:5432/itsm_db'

print('=== PHASE 0: SCOPE CHECK — references to KB8301284 ===')
conn = psycopg2.connect(DB)
cur = conn.cursor()

# The article row itself
cur.execute('SELECT id, number, title FROM "KnowledgeArticle" WHERE number = %s', ('KB8301284',))
article = cur.fetchone()
print('Article to delete:', article)

# Any approvals whose details reference this KB (title / draftKbId / kbArticleReference)
cur.execute("""SELECT id, status FROM "AgentApproval"
               WHERE details::text ILIKE %s OR summary ILIKE %s OR "proposedAction"::text ILIKE %s""",
            ('%KB8301284%', '%KB8301284%', '%KB8301284%'))
appr = cur.fetchall()
print('AgentApproval rows referencing KB8301284:', len(appr))
for a in appr:
    print('   ', a)

# Any incidents whose activities reference this KB
cur.execute("""SELECT number FROM "Incident"
               WHERE "activitiesJson"::text ILIKE %s""", ('%KB8301284%',))
inc = cur.fetchall()
print('Incidents referencing KB8301284:', len(inc))
for i in inc:
    print('   ', i)
cur.close()
conn.close()
print()

print('=== PHASE 1: DELETE from PostgreSQL ===')
conn = psycopg2.connect(DB)
cur = conn.cursor()
# Find the Prisma-generated UUID id, not just number
cur.execute('SELECT id FROM "KnowledgeArticle" WHERE number = %s', ('KB8301284',))
row = cur.fetchone()
if row:
    kb_uuid = row[0]
    cur.execute('DELETE FROM "KnowledgeArticle" WHERE id = %s RETURNING number', (kb_uuid,))
    deleted = cur.fetchall()
    conn.commit()
    print('DELETED from PostgreSQL:', deleted)
else:
    print('NOT FOUND in PostgreSQL (already deleted).')
cur.close(); conn.close()

print()
print('=== PHASE 2: DELETE from ChromaDB ===')
client = chromadb.PersistentClient(
    path=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Resolver Agent', 'chroma_db'),
    settings=Settings(anonymized_telemetry=False),
)
coll = client.get_collection('itsm_knowledge_articles')
# Find the Chroma id whose metadata number == 'KB8301284'
res = coll.get(include=['metadatas'])
target_ids = [docid for docid, meta in zip(res['ids'], res['metadatas']) if (meta or {}).get('number') == 'KB8301284']
print('Chroma doc ids matching KB8301284:', target_ids)
if target_ids:
    coll.delete(ids=target_ids)
    print('DELETED from ChromaDB:', target_ids)
else:
    print('NOT FOUND in ChromaDB (already removed).')

print()
print('=== PHASE 3: VERIFICATION ===')
conn = psycopg2.connect(DB)
cur = conn.cursor()
cur.execute('SELECT count(*) FROM "KnowledgeArticle"')
pg_count = cur.fetchone()[0]
cur.execute("SELECT count(*) FROM \"KnowledgeArticle\" WHERE number = %s", ('KB8301284',))
pg_left = cur.fetchone()[0]
cur.close(); conn.close()
chars = coll.get(include=['metadatas'])
left_nums = [m.get('number') for m in chars['metadatas'] if m and m.get('number') == 'KB8301284']
print(f'PostgreSQL KnowledgeArticle total : {pg_count} | KB8301284 remaining: {pg_left}')
print(f'ChromaDB total docs              : {len(chars["metadatas"])} | KB8301284 remaining: {len(left_nums)}')
if pg_left == 0 and len(left_nums) == 0:
    print('SUCCESS: KB8301284 fully removed from BOTH PostgreSQL and ChromaDB.')
else:
    print('DANGER: KB8301284 still present somewhere. Investigate.')