import os
import sys
import psycopg2
import chromadb
from chromadb.utils import embedding_functions
from chromadb.config import Settings

sys.stdout.reconfigure(encoding='utf-8')

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
CHROMA_DB_PATH = os.path.join(REPO_ROOT, "Resolver Agent", "chroma_db")

print("--- INITIALIZING CHROMADB FOR AGENTIC ITSM ---")
print(f"Vector Database Path: {CHROMA_DB_PATH}")

os.makedirs(CHROMA_DB_PATH, exist_ok=True)

try:
    chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH, settings=Settings(anonymized_telemetry=False))
except Exception as e:
    print(f"FAILED to initialize ChromaDB Client: {e}")
    sys.exit(1)

# Canonical collection name — must match continuous_itsm_agent_daemon.py ChromaVectorDB class
collection_name = "itsm_knowledge_articles"

NVIDIA_API_KEY = os.environ.get("CHROMA_OPENAI_API_KEY", "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")

emb_fn = embedding_functions.OpenAIEmbeddingFunction(
    api_key=NVIDIA_API_KEY,
    api_base="https://integrate.api.nvidia.com/v1",
    model_name="nvidia/nv-embed-v1",
)

# Drop stale collection (old deprecated model) and recreate fresh
try:
    chroma_client.delete_collection(name=collection_name)
    print(f"Dropped stale collection '{collection_name}'.")
except Exception:
    pass  # Collection may not exist yet

try:
    collection = chroma_client.create_collection(
        name=collection_name,
        embedding_function=emb_fn,
        metadata={"hnsw:space": "cosine"}   # must match daemon's distance metric
    )
except Exception as e:
    print(f"FAILED to create collection: {e}")
    sys.exit(1)

print("OK: ChromaDB collection ready with nvidia/nv-embed-v1 embeddings.")

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
    print("WARNING: No Knowledge Articles found in database! Make sure to import itsm_db_dump.sql first.")
    sys.exit(0)

print(f"Found {len(rows)} KB articles. Synchronizing with Vector Store...")

# Prep for batch insert
ids = []
documents = []
metadatas = []

for row in rows:
    kb_id, number, title, category, summary, symptoms, root_cause, resolution_steps = row

    # Build rich text for embedding
    symptoms_str = ""
    if isinstance(symptoms, list):
        symptoms_str = " ".join(symptoms)
    elif isinstance(symptoms, str):
        symptoms_str = symptoms

    # Build canonical document text for embedding.
    # IMPORTANT: nv-embed-v1 is instruction-tuned; prepend passage prefix for asymmetric retrieval.
    # This prefix must match the 'passage' input_type prefix in get_embedding() inside the daemon.
    PASSAGE_PREFIX = "Represent the IT knowledge article for retrieval: "
    doc_text = PASSAGE_PREFIX + f"Title: {title}\nCategory: {category}\nSummary: {summary or ''}\nSymptoms: {symptoms_str}\nRoot Cause: {root_cause or ''}"

    ids.append(str(kb_id))
    documents.append(doc_text)

    meta = {
        "number": number or "",
        "title": title or "",
        "category": category or "",
    }
    metadatas.append(meta)

# Re-index in batches
BATCH_SIZE = 10
try:
    for i in range(0, len(ids), BATCH_SIZE):
        batch_ids = ids[i:i+BATCH_SIZE]
        batch_docs = documents[i:i+BATCH_SIZE]
        batch_metas = metadatas[i:i+BATCH_SIZE]
        collection.upsert(ids=batch_ids, documents=batch_docs, metadatas=batch_metas)
        print(f"  Indexed batch {i//BATCH_SIZE + 1}: {len(batch_ids)} articles")
    print(f"SUCCESS: Indexed {len(documents)} KB articles into ChromaDB Vector Store!")
except Exception as e:
    print(f"FAILED to upsert documents: {e}")
    sys.exit(1)

# ── POST-REINDEX CONSISTENCY VALIDATION ─────────────────────────────────────
print("\n--- POST-REINDEX CONSISTENCY CHECK ---")

# Count PostgreSQL rows
try:
    conn_v = psycopg2.connect(DB_URL)
    cur_v = conn_v.cursor()
    cur_v.execute('SELECT COUNT(*) FROM "KnowledgeArticle"')
    pg_count = cur_v.fetchone()[0]
    cur_v.close()
    conn_v.close()
except Exception as e:
    print(f"WARNING: Could not re-query PostgreSQL for validation: {e}")
    pg_count = len(rows)  # fallback to the count already fetched

# Count ChromaDB documents
try:
    chroma_count = collection.count()
except Exception as e:
    print(f"WARNING: Could not count ChromaDB documents: {e}")
    chroma_count = -1

print(f"  PostgreSQL KnowledgeArticle rows  : {pg_count}")
print(f"  ChromaDB '{collection_name}' docs : {chroma_count}")

if chroma_count == pg_count:
    print(f"✅ VALIDATION PASSED: ChromaDB is fully synchronized ({chroma_count} documents).")
elif chroma_count == -1:
    print("⚠️  VALIDATION SKIPPED: Could not query ChromaDB count.")
else:
    diff = pg_count - chroma_count
    print(f"❌ VALIDATION FAILED: {diff} article(s) missing from ChromaDB "
          f"(PostgreSQL={pg_count}, ChromaDB={chroma_count}). Re-run this script.")
    sys.exit(1)
