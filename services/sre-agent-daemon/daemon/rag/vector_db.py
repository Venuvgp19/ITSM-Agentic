import os
import json
import sqlite3
import math
from ..config import logger
from ..llm import get_embedding, build_kb_embed_text

try:
    import chromadb
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False

def cosine_similarity(v1, v2):
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a, b in zip(v1, v2)))
    norm2 = math.sqrt(sum(b * b for a, b in zip(v1, v2)))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)

def infer_kb_department(kb):
    num = str(kb.get("number", "")).upper()
    if num == "KB0000039":
        return "App Support"

    cat = str(kb.get("category", "")).lower()
    if any(k in cat for k in ["devops", "cloud", "ci/cd", "tooling", "pipeline", "k8s", "kubernetes", "infra"]):
        return "DevOps Ops"
    if any(k in cat for k in ["unix", "unix / linux", "linux", "os", "user provisioning", "user account", "account management", "system administration"]):
        return "Unix"
    if any(k in cat for k in ["dba", "dba team", "database", "sql", "db2", "postgres"]):
        return "DBA Team"
    if any(k in cat for k in ["app support", "application support", "web app", "portal", "sso", "sap"]):
        return "App Support"
    if any(k in cat for k in ["network", "network ops", "vpn", "routing", "firewall", "dns"]):
        return "Network Ops"
    if any(k in cat for k in ["secops", "security", "audit", "compliance", "cert", "tls"]):
        return "SecOps"

    title = str(kb.get("title", "")).lower()
    summary = str(kb.get("summary", "")).lower()
    steps_list = kb.get("resolutionSteps", [])
    steps_str = " ".join(steps_list if isinstance(steps_list, list) else [str(steps_list)]).lower()
    full_text = f"{cat} {title} {summary} {steps_str}"

    if any(k in full_text for k in ["db2", "database", "postgres", "postgresql", "mysql", "tablespace", "cloudbeaver", "beaver ui", "oracle", "db2inst1"]):
        return "DBA Team"
    if any(k in full_text for k in ["az ", "azure", "kubectl", "kubernetes", "k8s", "podman", "docker", "helm", "argocd", "jenkins", "budget", "distutils", "snappy", "setuptools", "python3 -m venv", "virtual environment", "virtualenv", "pip install", "pip3", "wheel", "python package", "packages", "python env", "python venv"]):
        return "DevOps Ops"
    if any(k in full_text for k in ["nexacore", "sap-sso", "sso recovery", "webapp", "web app", "application services portal", "service portal", "web service", "app service", "portal down"]):
        return "App Support"
    if any(k in full_text for k in ["vpn gateway", "bgp", "vlan", "switch", "router", "iptables", "dns", "gateway"]):
        return "Network Ops"
    if any(k in full_text for k in ["certificate", "tls", "security audit", "vulnerability", "cve", "firewall policy"]):
        return "SecOps"
    if any(k in full_text for k in ["useradd", "userdel", "usermod", "sudoers", "chpasswd", "sssd", "pam", "linux user", "unix", "drop_caches", "high cpu", "high memory", "disk space"]):
        return "Unix"
    
    return "Global"

def normalize_department_filters(department: str = None) -> list[str]:
    if not department:
        return []
    d = str(department).strip()
    d_low = d.lower()
    if any(k in d_low for k in ["devops", "cloud", "k8s", "azure", "kubernetes"]):
        return ["DevOps Ops", "DevOps Team", "Global", "Common"]
    if any(k in d_low for k in ["unix", "linux", "os"]):
        return ["Unix", "Unix / Linux", "Global", "Common"]
    if any(k in d_low for k in ["dba", "database", "db"]):
        return ["DBA Team", "DBA", "Global", "Common"]
    if any(k in d_low for k in ["app support", "app", "web"]):
        return ["App Support", "Global", "Common"]
    if any(k in d_low for k in ["network", "netops"]):
        return ["Network Ops", "Global", "Common"]
    if any(k in d_low for k in ["secops", "security"]):
        return ["SecOps", "Global", "Common"]
    return [d, "Global", "Common"]

class ChromaVectorDB:
    def __init__(self, db_dir=None):
        if db_dir is None:
            db_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "chroma_db")
        self.db_dir = db_dir
        self.collection = None
        if CHROMADB_AVAILABLE:
            try:
                self.client = chromadb.PersistentClient(
                    path=self.db_dir,
                    settings=chromadb.config.Settings(anonymized_telemetry=False)
                )
                self.collection = self.client.get_or_create_collection(
                    name="sre_runbooks_collection",
                    metadata={"hnsw:space": "cosine"}
                )
                logger.info(f"🟣 ChromaDB Vector Engine initialized successfully at '{self.db_dir}'!")
            except Exception as e:
                logger.warning(f"ChromaDB initialization warning: {e}")

    def get_indexed_ids(self):
        if self.collection:
            try:
                res = self.collection.get()
                return set(res["ids"])
            except Exception:
                return set()
        return set()

    def get_indexed_numbers(self):
        if self.collection:
            try:
                res = self.collection.get()
                numbers = set()
                for meta in res.get("metadatas", []):
                    if meta and "number" in meta:
                        numbers.add(meta["number"])
                return numbers
            except Exception:
                return set()
        return set()

    def add_kb_embedding(self, kb_id, number, title, embedding, updated_at=None, document=None, department=None):
        if self.collection:
            try:
                final_id = str(kb_id or number or title)
                final_num = str(number or kb_id or "")
                dept_val = str(department or "Global")
                meta = {
                    "number": final_num, 
                    "title": str(title),
                    "department": dept_val
                }
                if updated_at:
                    meta["updatedAt"] = str(updated_at)
                kwargs = {
                    "ids": [final_id],
                    "embeddings": [embedding],
                    "metadatas": [meta]
                }
                if document:
                    kwargs["documents"] = [str(document)]
                self.collection.upsert(**kwargs)
            except Exception as e:
                logger.warning(f"Failed to index KB in ChromaDB: {e}")

    def delete_kb(self, number):
        if self.collection:
            try:
                res = self.collection.get()
                matching_ids = []
                for doc_id, meta in zip(res.get("ids", []), res.get("metadatas", [])):
                    if meta and meta.get("number") == number:
                        matching_ids.append(doc_id)
                if matching_ids:
                    self.collection.delete(ids=matching_ids)
                    logger.info(f"Deleted KB {number} from ChromaDB collection.")
            except Exception as e:
                logger.warning(f"Failed to delete KB {number} from ChromaDB: {e}")

    def search_kb(self, query_embedding, limit=3, department=None):
        if not self.collection:
            return []
        try:
            allowed_depts = normalize_department_filters(department) if department else []
            where_filter = None
            if allowed_depts:
                if len(allowed_depts) == 1:
                    where_filter = {"department": allowed_depts[0]}
                else:
                    where_filter = {"department": {"$in": allowed_depts}}

            query_kwargs = {
                "query_embeddings": [query_embedding],
                "n_results": limit
            }
            if where_filter:
                query_kwargs["where"] = where_filter

            results = self.collection.query(**query_kwargs)
            
            # If filtered query returned 0 results, fallback to unconstrained query
            if (not results or not results.get("ids") or len(results["ids"][0]) == 0) and where_filter:
                logger.info(f"Department filter '{department}' yielded 0 hits. Performing fallback unpartitioned query...")
                results = self.collection.query(
                    query_embeddings=[query_embedding],
                    n_results=limit
                )

            hits = []
            if results and results["ids"] and len(results["ids"]) > 0:
                ids = results["ids"][0]
                distances = results["distances"][0] if "distances" in results and results["distances"] else [0]*len(ids)
                metadatas = results["metadatas"][0] if "metadatas" in results and results["metadatas"] else [{}]*len(ids)
                for i in range(len(ids)):
                    similarity = max(0.0, 1.0 - distances[i])
                    hits.append({
                        "id": ids[i],
                        "number": metadatas[i].get("number", ids[i]),
                        "title": metadatas[i].get("title", ""),
                        "department": metadatas[i].get("department", "Global"),
                        "score": similarity
                    })
            return hits
        except Exception as e:
            logger.warning(f"ChromaDB search failed: {e}")
            return []

class LocalVectorDB:
    def __init__(self, db_path="vector_db.db"):
        self.db_path = db_path
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._init_db()

    def _init_db(self):
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS kb_embeddings (
                id TEXT PRIMARY KEY,
                number TEXT,
                title TEXT,
                embedding TEXT
            )
        """)
        self.conn.commit()

    def get_indexed_ids(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT id FROM kb_embeddings")
        return {row[0] for row in cursor.fetchall()}

    def get_indexed_numbers(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT number FROM kb_embeddings")
        return {row[0] for row in cursor.fetchall()}

    def add_kb_embedding(self, kb_id, number, title, embedding, updated_at=None):
        cursor = self.conn.cursor()
        embedding_str = json.dumps(embedding)
        cursor.execute(
            "INSERT OR REPLACE INTO kb_embeddings (id, number, title, embedding) VALUES (?, ?, ?, ?)",
            (kb_id, number, title, embedding_str)
        )
        self.conn.commit()

    def delete_kb(self, number):
        try:
            cursor = self.conn.cursor()
            cursor.execute("DELETE FROM kb_embeddings WHERE number = ?", (number,))
            self.conn.commit()
            logger.info(f"Deleted KB {number} from LocalVectorDB.")
        except Exception as e:
            logger.warning(f"Failed to delete KB {number} from LocalVectorDB: {e}")

    def search_kb(self, query_embedding, limit=3):
        cursor = self.conn.cursor()
        cursor.execute("SELECT id, number, title, embedding FROM kb_embeddings")
        rows = cursor.fetchall()
        
        results = []
        for row in rows:
            kb_id, number, title, emb_str = row
            emb = json.loads(emb_str)
            score = cosine_similarity(query_embedding, emb)
            results.append({
                "id": kb_id,
                "number": number,
                "title": title,
                "score": score
            })
        
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

# Instantiate ChromaDB Vector Database Engine
vector_db = ChromaVectorDB()

def sync_vector_db_with_kb(token=None, client=None, vdb=None):
    """
    Synchronizes vector database with Knowledge Base articles.
    Uses MD5 content-hash and timestamp matching so only actually modified
    or created articles are re-indexed.
    """
    try:
        from .sop_auto_reindexer import sync_edited_or_created_sops
        active_vdb = vdb or vector_db
        return sync_edited_or_created_sops(vdb_instance=active_vdb)
    except Exception as e:
        logger.error(f"Failed to sync KB articles to Vector DB: {e}")
        return 0
