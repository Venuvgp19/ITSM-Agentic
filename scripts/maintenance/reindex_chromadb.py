import os
import sys
import psycopg2
import chromadb
from chromadb.config import Settings

sys.stdout.reconfigure(encoding='utf-8')

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
RESOLVER_AGENT_DIR = os.path.join(REPO_ROOT, "Resolver Agent")
sys.path.insert(0, RESOLVER_AGENT_DIR)

# Import daemon (which initializes vector_db with consistent settings)
import continuous_itsm_agent_daemon as daemon

CHROMA_DB_PATH = os.path.join(RESOLVER_AGENT_DIR, "chroma_db")

print("--- INITIALIZING CHROMADB FOR AGENTIC ITSM ---")
print(f"Vector Database Path: {CHROMA_DB_PATH}")

chroma_client = daemon.vector_db.client
collection_name = "itsm_knowledge_articles"

# Re-use or get collection
try:
    collection = daemon.vector_db.collection
    if not collection:
        collection = chroma_client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )
except Exception as e:
    print(f"FAILED to get collection: {e}")
    sys.exit(1)

print("OK: ChromaDB collection ready.")

# Connect to Postgres to get KBs
print("--- FETCHING MASTER SOPS FROM POSTGRESQL ---")
DB_URL = os.environ.get("DATABASE_URL", "postgresql://itsm_user:itsm_password@127.0.0.1:5432/itsm_db")

try:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT id, number, title, category, summary, symptoms, "rootCause", "resolutionSteps"
        FROM "KnowledgeArticle"
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
except Exception as e:
    print(f"FAILED to connect to PostgreSQL or fetch KBs: {e}")
    sys.exit(1)

if not rows:
    print("WARNING: No Knowledge Articles found in database!")
    sys.exit(0)

print(f"Found {len(rows)} KB articles. Synchronizing with Vector Store...")

ids = []
embeddings = []
metadatas = []
documents = []

for idx, row in enumerate(rows):
    kb_id, number, title, category, summary, symptoms, root_cause, resolution_steps = row

    # Build canonical embed text for passage retrieval
    doc_text = daemon.build_kb_embed_text(
        title=title or "",
        summary=summary or "",
        symptoms=symptoms,
        root_cause=root_cause or ""
    )

    # Use asymmetric 'passage' instruction for nv-embed-v1
    emb = daemon.get_embedding(doc_text, input_type="passage")

    ids.append(str(kb_id or number))
    embeddings.append(emb)
    documents.append(doc_text)
    metadatas.append({
        "number": str(number or ""),
        "title": str(title or ""),
        "category": str(category or ""),
        "summary": str(summary or "")[:500],
    })
    print(f"  Processed [{idx+1}/{len(rows)}]: {number} - {title}")

BATCH_SIZE = 10
try:
    for i in range(0, len(ids), BATCH_SIZE):
        batch_ids = ids[i:i+BATCH_SIZE]
        batch_embs = embeddings[i:i+BATCH_SIZE]
        batch_metas = metadatas[i:i+BATCH_SIZE]
        batch_docs = documents[i:i+BATCH_SIZE]
        collection.upsert(
            ids=batch_ids,
            embeddings=batch_embs,
            metadatas=batch_metas,
            documents=batch_docs
        )
        print(f"  Indexed batch {i//BATCH_SIZE + 1}: {len(batch_ids)} articles")
    print(f"SUCCESS: Indexed {len(ids)} KB articles into ChromaDB Vector Store!")
except Exception as e:
    print(f"FAILED to upsert documents: {e}")
    sys.exit(1)

# Post validation
chroma_count = collection.count()
print(f"\n--- POST-REINDEX CONSISTENCY CHECK ---")
print(f"  PostgreSQL KnowledgeArticle rows  : {len(rows)}")
print(f"  ChromaDB '{collection_name}' docs : {chroma_count}")

if chroma_count == len(rows):
    print(f"✅ VALIDATION PASSED: ChromaDB is fully synchronized ({chroma_count} documents).")
else:
    print(f"⚠️ Validation Warning: Count mismatch (PG={len(rows)}, Chroma={chroma_count})")

