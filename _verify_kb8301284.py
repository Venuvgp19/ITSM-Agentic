import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Resolver Agent'))

import psycopg2
import chromadb
from chromadb.config import Settings

print('=== 1) LIVE POSTGRESQL: KnowledgeArticle rows matching KB8301284 / KB8* ===')
conn = psycopg2.connect('postgresql://itsm_user:itsm_password@127.0.0.1:5432/itsm_db')
cur = conn.cursor()
cur.execute('SELECT number, title FROM "KnowledgeArticle" WHERE number ILIKE %(p)s', {'p': '%8301284%'})
exact = cur.fetchall()
cur.execute('SELECT number, title FROM "KnowledgeArticle" WHERE number LIKE %(p)s', {'p': 'KB8%'})
kb8 = cur.fetchall()
cur.execute('SELECT count(*) FROM "KnowledgeArticle"')
total = cur.fetchone()[0]
cur.close(); conn.close()
print('Total KnowledgeArticle rows      :', total)
print('Rows containing "8301284"        :', len(exact))
for r in exact:
    print('  EXACT:', r)
print('Rows starting with "KB8"         :', len(kb8))
for r in kb8:
    print('  KB8 :', r)

print()
print('=== 2) LIVE CHROMADB (itsm_knowledge_articles) metadata ===')
client = chromadb.PersistentClient(
    path=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Resolver Agent', 'chroma_db'),
    settings=Settings(anonymized_telemetry=False),
)
coll = client.get_collection('itsm_knowledge_articles')
allm = coll.get(include=['metadatas'])
nums = [m.get('number') for m in allm['metadatas']]
print('ChromaDB total docs              :', len(nums))
print('ChromaKB containing 8301284      :', [n for n in nums if n and '8301284' in n])
print('ChromaKB starting with KB8       :', [n for n in nums if n and n.startswith('KB8')])