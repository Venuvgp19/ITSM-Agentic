import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Resolver Agent'))

import psycopg2
import chromadb
from chromadb.config import Settings

DB = 'postgresql://itsm_user:itsm_password@127.0.0.1:5432/itsm_db'
KB = 'KB8335845'

print('=== PHASE 0: SCOPE CHECK — references to', KB, '===')
conn = psycopg2.connect(DB)
cur = conn.cursor()
cur.execute('SELECT id, number, title FROM "KnowledgeArticle" WHERE number = %s', (KB,))
article = cur.fetchone()
print('Article to delete:', article)
cur.execute("""SELECT id, status FROM "AgentApproval"
               WHERE details::text ILIKE %s OR summary ILIKE %s OR "proposedAction"::text ILIKE %s""",
            ('%' + KB + '%', '%' + KB + '%', '%' + KB + '%'))
print('AgentApproval rows referencing', KB, ':', len(cur.fetchall()))
cur.close(); conn.close()

print()
print('=== PHASE 1: DELETE from PostgreSQL ===')
conn = psycopg2.connect(DB)
cur = conn.cursor()
cur.execute('SELECT id FROM "KnowledgeArticle" WHERE number = %s', (KB,))
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
res = coll.get(include=['metadatas'])
# chroma ids fetched separately (this library version rejects 'ids' inside include)
ids_res = coll.get()['ids']
nums = [m.get('number') for m in res['metadatas']]
target_ids = [docid for docid, num in zip(ids_res, nums) if num == KB]
print('Chroma doc ids matching', KB, ':', target_ids)
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
cur.execute('SELECT count(*) FROM "KnowledgeArticle" WHERE number = %s', (KB,))
pg_left = cur.fetchone()[0]
cur.close(); conn.close()
chars = coll.get(include=['metadatas'])
left_nums = [m.get('number') for m in chars['metadatas'] if m and m.get('number') == KB]
print(f'PostgreSQL KnowledgeArticle total : {pg_count} | {KB} remaining: {pg_left}')
print(f'ChromaDB total docs              : {len(chars["metadatas"])} | {KB} remaining: {len(left_nums)}')
if pg_left == 0 and len(left_nums) == 0:
    print('SUCCESS:', KB, 'fully removed from BOTH PostgreSQL and ChromaDB.')
else:
    print('DANGER:', KB, 'still present somewhere. Investigate.')