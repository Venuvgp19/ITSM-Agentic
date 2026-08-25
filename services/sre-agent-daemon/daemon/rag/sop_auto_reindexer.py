"""
Autonomous SOP Vector Auto-Reindexer Daemon
===========================================
Monitors all Knowledge Articles / SOPs in the database for creations and updates.
Whenever ANY SOP is created or updated (regardless of timestamp), ONLY that specific
edited or newly created SOP is re-embedded and upserted into ChromaDB vector database.
Unmodified SOPs remain completely untouched.
"""

import os
import sys
import time
import json
import hashlib
import psycopg2
from datetime import datetime, timezone

# Ensure python path resolution
current_dir = os.path.dirname(os.path.abspath(__file__))
daemon_dir = os.path.dirname(current_dir)
resolver_dir = os.path.dirname(daemon_dir)
if resolver_dir not in sys.path:
    sys.path.insert(0, resolver_dir)

try:
    from daemon.config import logger
    from daemon.llm import get_embedding, build_kb_embed_text
    from daemon.rag.vector_db import vector_db, infer_kb_department
except ImportError:
    import logging
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger = logging.getLogger("sop_auto_reindexer")
    
    def build_kb_embed_text(title: str, summary: str, symptoms, root_cause: str = "") -> str:
        symptoms_str = " ".join(symptoms) if isinstance(symptoms, list) else (symptoms or "")
        parts = [f"Title: {title}"]
        if summary:
            parts.append(f"Summary: {summary}")
        if symptoms_str:
            parts.append(f"Symptoms: {symptoms_str}")
        if root_cause:
            parts.append(f"Root Cause: {root_cause}")
        return "\n".join(parts)

    def infer_kb_department(kb):
        cat = str(kb.get("category", "")).lower()
        title = str(kb.get("title", "")).lower()
        if "unix" in cat or "linux" in cat or "pamsudo" in title or "user" in title:
            return "Unix"
        if "network" in cat or "cni" in title or "flannel" in title:
            return "Network Ops"
        if "dba" in cat or "db2" in title or "postgres" in title:
            return "DBA Team"
        if "devops" in cat or "k8s" in title or "kubernetes" in title:
            return "DevOps Ops"
        return "App Support"

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/itsm_db")
CHROMA_DIR = os.path.join(resolver_dir, "chroma_db")

# In-memory fast cache to track recently processed content hashes
_processed_edits_cache = {}

def get_db_connection():
    return psycopg2.connect(DB_URL)

def sync_edited_or_created_sops(force: bool = False, vdb_instance=None):
    """
    Scans all Knowledge Articles / SOPs in the database.
    Whenever ANY article is created or updated, ONLY that specific article
    is re-embedded and upserted into ChromaDB vector database.
    """
    global _processed_edits_cache
    
    # 1. Connect to PostgreSQL and fetch all Knowledge Articles
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, number, title, summary, symptoms, "rootCause", "resolutionSteps", category, "updatedAt", "createdAt"
            FROM "KnowledgeArticle"
            ORDER BY "updatedAt" DESC;
        """)
        rows = cur.fetchall()
        conn.close()
    except Exception as e:
        logger.error(f"[SOP AUTO-REINDEXER] ❌ Database connection error: {e}")
        return 0

    # 2. Get existing metadata from ChromaDB
    try:
        import chromadb
        if vdb_instance and hasattr(vdb_instance, "collection") and vdb_instance.collection:
            col = vdb_instance.collection
        else:
            client = chromadb.PersistentClient(
                path=CHROMA_DIR,
                settings=chromadb.config.Settings(anonymized_telemetry=False)
            )
            col = client.get_or_create_collection("sre_runbooks_collection", metadata={"hnsw:space": "cosine"})
        
        chroma_res = col.get()
        chroma_meta_map = {}
        for doc_id, meta in zip(chroma_res["ids"], chroma_res["metadatas"]):
            if meta and "number" in meta:
                chroma_meta_map[meta["number"]] = (doc_id, meta)
    except Exception as e:
        logger.error(f"[SOP AUTO-REINDEXER] ❌ ChromaDB connection error: {e}")
        return 0

    reindexed_count = 0

    # 3. Evaluate each article
    for row in rows:
        kb_id, number, title, summary, symptoms, root_cause, resolution_steps, category, updated_at, created_at = row
        
        if not number:
            continue

        # Format timestamps
        if updated_at and updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)

        # Build document text representation and compute MD5 content hash
        symptoms_list = json.loads(symptoms) if isinstance(symptoms, str) else (symptoms or [])
        res_steps_list = json.loads(resolution_steps) if isinstance(resolution_steps, str) else (resolution_steps or [])
        
        content_to_embed = build_kb_embed_text(
            title=title or "",
            summary=summary or "",
            symptoms=symptoms_list,
            root_cause=root_cause or ""
        )
        
        content_hash = hashlib.md5(f"{title}:{summary}:{content_to_embed}".encode("utf-8")).hexdigest()
        
        # Check if re-indexing is required
        needs_reindex = False
        reason = ""

        if number not in chroma_meta_map:
            needs_reindex = True
            reason = "New SOP created (not yet in ChromaDB vector database)"
        else:
            doc_id, meta = chroma_meta_map[number]
            stored_updated = meta.get("updatedAt")
            stored_hash = meta.get("contentHash")
            cached_hash = _processed_edits_cache.get(number)

            if force:
                needs_reindex = True
                reason = "Forced re-indexing requested"
            elif stored_hash is not None:
                if stored_hash != content_hash:
                    needs_reindex = True
                    reason = f"SOP content modified (hash change: {stored_hash[:8]} -> {content_hash[:8]})"
            elif stored_updated is not None:
                if str(stored_updated) != str(updated_at):
                    needs_reindex = True
                    reason = f"SOP updated timestamp changed ({stored_updated} -> {updated_at})"
            elif cached_hash is not None:
                if cached_hash != content_hash:
                    needs_reindex = True
                    reason = "SOP edited since last in-memory scan"
            else:
                # Legacy metadata without stored_hash: compare summary/title directly
                stored_summary = meta.get("summary", "")
                if stored_summary != (summary or ""):
                    needs_reindex = True
                    reason = "SOP content modified (summary changed)"
                else:
                    # Upgrade metadata with contentHash and updatedAt
                    needs_reindex = True
                    reason = "Upgrading legacy ChromaDB entry with contentHash tracking"

        # 4. Re-index ONLY this specific edited/created article
        if needs_reindex:
            dept = infer_kb_department({
                "number": number,
                "category": category,
                "title": title,
                "summary": summary,
                "resolutionSteps": res_steps_list
            })
            
            logger.info(f"[SOP AUTO-REINDEXER] ⚡ Detected SOP [{number}] '{title}' — Trigger: {reason}")
            logger.info(f"[SOP AUTO-REINDEXER] 🔄 Generating dense 4096-D vector embedding for [{number}] only...")
            
            try:
                emb = get_embedding(content_to_embed, input_type="passage")
                
                target_doc_id = kb_id or number
                if number in chroma_meta_map:
                    target_doc_id = chroma_meta_map[number][0]
                
                meta_dict = {
                    "number": str(number),
                    "title": str(title),
                    "department": str(dept),
                    "updatedAt": str(updated_at),
                    "contentHash": str(content_hash),
                    "lastReindexedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                }
                
                col.upsert(
                    ids=[str(target_doc_id)],
                    embeddings=[emb],
                    metadatas=[meta_dict],
                    documents=[str(content_to_embed)]
                )
                
                _processed_edits_cache[number] = content_hash
                reindexed_count += 1
                logger.info(f"[SOP AUTO-REINDEXER] ✅ Successfully indexed/updated [{number}] [Dept: {dept}] in ChromaDB vector database!")
            except Exception as e:
                logger.error(f"[SOP AUTO-REINDEXER] ❌ Failed to index/update {number}: {e}")

    return reindexed_count

def run_continuous_sop_reindex_watcher(interval_seconds: int = 10):
    """
    Continuous background watcher loop that checks for created/updated SOPs every interval_seconds.
    """
    logger.info(f"🚀 [SOP VECTOR AUTO-REINDEXER] Continuous Event-Driven Daemon Active (Polling every {interval_seconds}s for any created or updated SOPs)...")
    
    while True:
        try:
            reindexed = sync_edited_or_created_sops()
            if reindexed > 0:
                logger.info(f"✨ [SOP AUTO-REINDEXER] Batch complete: Re-indexed {reindexed} created/updated SOP(s) into ChromaDB.")
        except KeyboardInterrupt:
            logger.info("🛑 [SOP AUTO-REINDEXER] Stopping watcher daemon.")
            break
        except Exception as e:
            logger.error(f"[SOP AUTO-REINDEXER] Unexpected watcher error: {e}")
        
        time.sleep(interval_seconds)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Autonomous Event-Driven SOP Vector Re-Indexer")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    parser.add_argument("--force", action="store_true", help="Force re-indexing of all articles")
    parser.add_argument("--interval", type=int, default=10, help="Watcher loop interval in seconds (default: 10)")
    args = parser.parse_args()

    if args.once:
        count = sync_edited_or_created_sops(force=args.force)
        print(f"\n[DONE] Re-indexed {count} created/updated SOP(s) into ChromaDB.")
    else:
        run_continuous_sop_reindex_watcher(interval_seconds=args.interval)
