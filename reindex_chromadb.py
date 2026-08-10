import os
import sys
import psycopg2
import chromadb
from chromadb.utils import embedding_functions
from chromadb.config import Settings

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
CHROMA_DB_PATH = os.path.join(REPO_ROOT, "Resolver Agent", "chroma_db")

print("--- INITIALIZING CHROMADB FOR AGENTIC ITSM ---")
print(f"Vector Database Path: {CHROMA_DB_PATH}")

os.makedirs(CHROMA_DB_PATH, exist_ok=True)

try:
    chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH, settings=Settings(anonymized_telemetry=False))
except Exception as e:
    print(f"❌ Failed to initialize ChromaDB Client: {e}")
    sys.exit(1)

collection_name = "itsm_knowledge_base"
emb_fn = embedding_functions.DefaultEmbeddingFunction()

try:
    collection = chroma_client.get_or_create_collection(name=collection_name, embedding_function=emb_fn)
except Exception as e:
    print(f"❌ Failed to create/get collection: {e}")
    sys.exit(1)

print("✅ Connected to ChromaDB.")

# Connect to Postgres to get KBs
print("--- FETCHING MASTER SOPS FROM POSTGRESQL ---")
DB_URL = os.environ.get("DATABASE_URL", "postgresql://itsm_user:itsm_password@127.0.0.1:5432/itsm_db")

try:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("SELECT id, number, title, category, summary, symptoms, root_cause, resolution_steps FROM knowledge_articles WHERE status = 'PUBLISHED' OR status = 'published'")
    rows = cur.fetchall()
    cur.close()
    conn.close()
except Exception as e:
    print(f"❌ Failed to connect to PostgreSQL or fetch KBs: {e}")
    sys.exit(1)

if not rows:
    print("⚠️ No Knowledge Articles found in database! Make sure to import itsm_db_dump.sql first.")
    sys.exit(0)

print(f"Found {len(rows)} KB articles. Synchronizing with Vector Store...")

# Prep for batch insert
ids = []
documents = []
metadatas = []

for row in rows:
    kb_id, number, title, category, summary, symptoms, root_cause, resolution_steps = row
    
    # Text to embed
    doc_text = f"Title: {title}\nCategory: {category}\nSummary: {summary}\nSymptoms: {symptoms}\nRoot Cause: {root_cause}"
    
    ids.append(str(kb_id))
    documents.append(doc_text)
    
    # Store essential metadata for retrieval
    meta = {
        "number": number or "",
        "title": title or "",
        "category": category or "",
    }
    metadatas.append(meta)

# Re-index
try:
    print(f"Indexing {len(documents)} articles...")
    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas
    )
    print(f"✅ Successfully indexed {len(documents)} KB articles into ChromaDB Vector Store!")
except Exception as e:
    print(f"❌ Failed to upsert documents: {e}")
    sys.exit(1)
