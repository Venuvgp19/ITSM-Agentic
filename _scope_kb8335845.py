import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Resolver Agent'))

import psycopg2
import chromadb
from chromadb.config import Settings

DB = 'postgresql://itsm_user:itsm_password@127.0.0.1:5432/itsm_db'
KB = 'KB8335845'

print(f'=== SCOPE CHECK for {KB} ===')
conn = psycopg2.connect(DB)
cur = conn.cursor()

cur.execute('SELECT id, number, title, category, summary FROM "KnowledgeArticle" WHERE number = %s', (KB,))
article = cur.fetchone()
print('1) KnowledgeArticle row:', article)

cur.execute("""SELECT id, type, status, details, summary, "proposedAction"
               FROM "AgentApproval"
               WHERE details::text ILIKE %s OR summary ILIKE %s OR "proposedAction"::text ILIKE %s""",
            ('%' + KB + '%', '%' + KB + '%', '%' + KB + '%'))
appr = cur.fetchall()
print('2) AgentApproval rows referencing', KB, ':', len(appr))
for a in appr:
    print('   ', a[0], '|', a[1], '|', a[2], '|', (a[4] or '')[:80], '|', (a[5] or '')[:80])

cur.execute("""SELECT number, state FROM "Incident"
               WHERE "activitiesJson"::text ILIKE %s OR "resolutionNotes"::text ILIKE %s OR description::text ILIKE %s OR "shortDescription"::text ILIKE %s""",
            ('%' + KB + '%', '%' + KB + '%', '%' + KB + '%', '%' + KB + '%'))
inc = cur.fetchall()
print('3) Incidents referencing', KB, ':', len(inc))
for i in inc:
    print('   ', i)

# Any KB number collisions / similar KB8 numbers
cur.execute('SELECT number, title FROM "KnowledgeArticle" WHERE number ILIKE %s', ('%8335%',))
similar = cur.fetchall()
print('4) Other KB numbers containing "8335":', len(similar))
for s in similar:
    print('   ', s)

cur.close(); conn.close()

print()
print('=== CHROMADB metadata check for', KB, '===')
client = chromadb.PersistentClient(
    path=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Resolver Agent', 'chroma_db'),
    settings=Settings(anonymized_telemetry=False),
)
coll = client.get_collection('itsm_knowledge_articles')
res = coll.get(include=['metadatas', 'ids'])
target = [(docid, m.get('number')) for docid, m in zip(res['ids'], res['metadatas']) if (m or {}).get('number') == KB]
print('Chroma docs matching', KB, ':', target)