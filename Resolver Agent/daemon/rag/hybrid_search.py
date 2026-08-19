import re
import requests
from ..config import logger
from ..llm import get_embedding
from .bm25 import BM25Okapi, tokenize_text

def distill_incident_query(short_desc: str, desc: str) -> tuple[str, list[str]]:
    """
    Distills raw incident short_desc + desc into:
    1. A high-signal dense query string (free of terminal dumps/volume specs).
    2. A list of key lexical tokens for BM25.
    """
    short_desc = short_desc or ""
    desc = desc or ""

    # Strip ephemeral hostnames, worker names, IP addresses from short description
    clean_short = re.sub(
        r'workernode\d+hl|worker\d+ol|worker\d+|control\s*plane|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b',
        '',
        short_desc,
        flags=re.IGNORECASE
    )
    clean_short = re.sub(r'\s+', ' ', clean_short).strip()

    extracted_signals = []

    # 1. K8s events & states
    k8s_events = re.findall(
        r'(?:Warning\s+)?(FailedScheduling|CrashLoopBackOff|OOMKilled|ImagePullBackOff|ErrImagePull|Evicted|NodeNotReady|NodeAffinity|NodeSelector|0/\d+\s+nodes\s+are\s+available[^\.\n\r]+)',
        desc,
        flags=re.IGNORECASE
    )
    for ev in k8s_events[:2]:
        c_ev = re.sub(r'\[root@[^\]]+\]#?', '', ev).strip()
        if c_ev and len(c_ev) < 150:
            extracted_signals.append(c_ev)

    # 2. Linux / Web services / OS signals
    service_sigs = re.findall(
        r'(?:Active:\s*failed|502\s*Bad\s*Gateway|Connection\s*refused|Unit\s+[\w\.\-]+\s+failed|ModuleNotFoundError:[^\n\r]+|high\s+memory|high\s+cpu|disk\s+full)',
        desc,
        flags=re.IGNORECASE
    )
    for ss in service_sigs[:2]:
        extracted_signals.append(ss.strip())

    # 3. DB2 / Database signals
    db_sigs = re.findall(
        r'(?:SQL\d+[A-Z]|DB21034E|SQLSTATE=\d+|db2start|db2stop|cloudbeaver)',
        desc,
        flags=re.IGNORECASE
    )
    for ds in db_sigs[:2]:
        extracted_signals.append(ds.strip())

    # 4. User management tokens
    user_tokens = re.findall(
        r'(?:Pamsudo\d+|user\d+|userdel|useradd|sudoers|passwordless\s+sudo|python\s+virtual\s+environment|virtualenv)',
        f"{short_desc} {desc}",
        flags=re.IGNORECASE
    )
    if user_tokens:
        extracted_signals.extend(list(set(user_tokens))[:3])

    combined_parts = [clean_short]
    if extracted_signals:
        combined_parts.append(" | Signal: " + " ".join(extracted_signals))

    dense_query = " ".join(combined_parts).strip()
    lexical_tokens = tokenize_text(f"{short_desc} {' '.join(extracted_signals)}")
    return dense_query, lexical_tokens

def search_hybrid_kb(dense_query_text: str, lexical_tokens: list[str], kb_articles: list[dict], vector_db, limit: int = 12) -> list[dict]:
    """
    Executes true Hybrid Search combining Dense Vector Retrieval (nv-embed-v1)
    and BM25Okapi Lexical Matching via Reciprocal Rank Fusion (RRF).
    """
    if not kb_articles:
        return []

    # 1. Dense Semantic Search from ChromaDB
    dense_hits_map = {}  # number -> (score, rank)
    try:
        dense_emb = get_embedding(dense_query_text, input_type="query")
        if dense_emb and vector_db:
            raw_dense = vector_db.search_kb(dense_emb, limit=max(limit * 2, 20))
            for rank, hit in enumerate(raw_dense):
                num = hit.get("number")
                if num:
                    dense_hits_map[num] = (hit.get("score", 0.0), rank)
    except Exception as e:
        logger.warning(f"Dense vector retrieval error in hybrid search: {e}")

    # 2. BM25 Lexical Search
    doc_tokens_list = []
    kb_num_list = []
    for art in kb_articles:
        num = art.get("number")
        title = art.get("title", "")
        summary = art.get("summary", "")
        symptoms = art.get("symptoms", [])
        sym_str = " ".join(symptoms) if isinstance(symptoms, list) else str(symptoms or "")
        root_cause = art.get("rootCause", "")
        category = art.get("category", "")

        art_text = f"{title} {summary} {sym_str} {root_cause} {category}"
        doc_tokens = tokenize_text(art_text)
        doc_tokens_list.append(doc_tokens)
        kb_num_list.append(num)

    bm25 = BM25Okapi(doc_tokens_list)
    bm25_scores = bm25.get_scores(lexical_tokens)

    # Rank by BM25 score
    bm25_ranked_indices = sorted(range(len(bm25_scores)), key=lambda i: bm25_scores[i], reverse=True)
    bm25_hits_map = {}  # number -> (norm_score, rank)
    max_bm25 = max(bm25_scores) if bm25_scores and max(bm25_scores) > 0 else 1.0

    for rank, idx in enumerate(bm25_ranked_indices):
        num = kb_num_list[idx]
        norm_bm25 = bm25_scores[idx] / max_bm25 if max_bm25 > 0 else 0.0
        bm25_hits_map[num] = (norm_bm25, rank)

    # 3. Reciprocal Rank Fusion (RRF)
    MAX_RRF = (0.6 / 60.0) + (0.4 / 60.0)

    hybrid_results = []
    all_kb_dict = {art.get("number"): art for art in kb_articles}
    all_numbers = set(list(dense_hits_map.keys()) + list(all_kb_dict.keys()))

    for num in all_numbers:
        art = all_kb_dict.get(num)
        if not art:
            continue

        dense_score, dense_rank = dense_hits_map.get(num, (0.0, 999))
        norm_bm25, bm25_rank = bm25_hits_map.get(num, (0.0, 999))

        rrf = (0.6 / (60.0 + dense_rank)) + (0.4 / (60.0 + bm25_rank))
        norm_rrf = min(1.0, rrf / MAX_RRF)

        # Weighted hybrid score: 55% dense semantic similarity + 45% normalized RRF
        if dense_score > 0:
            blended_score = round(0.55 * dense_score + 0.45 * norm_rrf, 4)
        else:
            blended_score = round(0.50 * norm_bm25 + 0.50 * norm_rrf, 4)

        hybrid_results.append({
            "number": num,
            "title": art.get("title", ""),
            "score": blended_score,
            "dense_score": dense_score,
            "bm25_score": norm_bm25,
            "rrf_score": norm_rrf,
            "article": art
        })

    hybrid_results.sort(key=lambda x: x["score"], reverse=True)
    return hybrid_results[:limit]

def sanitize_kb_title(title: str) -> str:
    """Sanitizes synthesized SOP titles to remove ephemeral pod names and host identifiers."""
    if not title:
        return "Master SOP: Standard Operational Procedure"
    clean = re.sub(r'[\r\n\t]+', ' ', title).strip()
    clean = re.sub(r'\s+', ' ', clean)
    clean = re.sub(r'\b(pod\s+)?simple-web-app-\w+\b', 'Kubernetes Pod', clean, flags=re.IGNORECASE)
    clean = re.sub(r'\b(node1HL|workernode\d+hl|worker\d+ol)\b', 'Cluster Node', clean, flags=re.IGNORECASE)
    if len(clean) > 130:
        first_clause = re.split(r'[\.\(\;]', clean)[0].strip()
        clean = first_clause if len(first_clause) >= 20 else clean[:120].rsplit(' ', 1)[0]
    if not clean.lower().startswith("master sop:") and not clean.lower().startswith("sop:"):
        clean = f"Master SOP: {clean}"
    return clean

def search_kb_without_embeddings(short_desc, desc, kb_articles):
    """
    Direct RAG matching algorithm without external embedding APIs.
    """
    full_text = f"{short_desc} {desc}".lower()
    
    # 1. Intent Detection for User Account Creation / Sudo
    user_creation_patterns = [
        "create user", "user account", "provision user", "user creation", 
        "add user", "grant sudo", "sudo access", "account creation", "create account"
    ]
    
    is_user_creation = any(p in full_text for p in user_creation_patterns) or bool(re.search(r"create\s+user\s+account", full_text))
    
    if is_user_creation:
        user_kb = next((a for a in kb_articles if a.get("number", "") == "KB0000001"), None)
        if not user_kb:
            user_kb = next((a for a in kb_articles if "user" in a.get("title", "").lower() and "creation" in a.get("title", "").lower()), None)
        if not user_kb:
            user_kb = next((a for a in kb_articles if "user" in a.get("summary", "").lower() or "user" in a.get("title", "").lower()), None)
        if not user_kb and kb_articles:
            user_kb = kb_articles[0]
            
        if user_kb:
            logger.info(f"🎯 Embedding-Free Intent Match: User Account Creation detected -> Matched Master User Creation SOP [{user_kb.get('number')}] '{user_kb.get('title')}' (Score: 0.9800)")
            return [{
                "number": user_kb.get("number"),
                "title": user_kb.get("title"),
                "score": 0.9800,
                "article": user_kb
            }]

    # 1b. Intent Detection for User Deletion / Offboarding
    user_delete_patterns = [
        "delete user", "remove user", "offboard", "deprovision", "disable account",
        "user leaving", "employee leaving", "terminate account", "account deletion",
        "remove account", "delete account", "user offboard"
    ]
    is_user_delete = any(p in full_text for p in user_delete_patterns)
    if is_user_delete:
        delete_kb = next((a for a in kb_articles if a.get("number", "") == "KB0000014"), None)
        if not delete_kb:
            delete_kb = next((a for a in kb_articles if "deletion" in a.get("title", "").lower() or "offboard" in a.get("title", "").lower()), None)
        if delete_kb:
            logger.info(f"🎯 Embedding-Free Intent Match: User Deletion detected -> Matched SOP [{delete_kb.get('number')}] '{delete_kb.get('title')}' (Score: 0.9750)")
            return [{"number": delete_kb.get("number"), "title": delete_kb.get("title"), "score": 0.9750, "article": delete_kb}]

    # 1c. Intent Detection for Password Reset
    password_reset_patterns = [
        "reset password", "password reset", "forgot password", "change password",
        "password expired", "unlock password", "password locked", "set password"
    ]
    is_password_reset = any(p in full_text for p in password_reset_patterns)
    if is_password_reset:
        pwd_kb = next((a for a in kb_articles if a.get("number", "") == "KB0000017"), None)
        if not pwd_kb:
            pwd_kb = next((a for a in kb_articles if "password" in a.get("title", "").lower() and "reset" in a.get("title", "").lower()), None)
        if pwd_kb:
            logger.info(f"🎯 Embedding-Free Intent Match: Password Reset detected -> Matched SOP [{pwd_kb.get('number')}] '{pwd_kb.get('title')}' (Score: 0.9750)")
            return [{"number": pwd_kb.get("number"), "title": pwd_kb.get("title"), "score": 0.9750, "article": pwd_kb}]

    # 1d. Intent Detection for Account Lock/Unlock
    lock_patterns = [
        "lock account", "unlock account", "lock user", "unlock user",
        "disable login", "enable login", "brute force", "account lock",
        "lockout", "unlock access", "lock access"
    ]
    is_lock = any(p in full_text for p in lock_patterns)
    if is_lock:
        lock_kb = next((a for a in kb_articles if a.get("number", "") == "KB0000015"), None)
        if not lock_kb:
            lock_kb = next((a for a in kb_articles if "lock" in a.get("title", "").lower() and "unlock" in a.get("title", "").lower()), None)
        if lock_kb:
            logger.info(f"🎯 Embedding-Free Intent Match: Account Lock/Unlock detected -> Matched SOP [{lock_kb.get('number')}] '{lock_kb.get('title')}' (Score: 0.9750)")
            return [{"number": lock_kb.get("number"), "title": lock_kb.get("title"), "score": 0.9750, "article": lock_kb}]

    # 1e. Intent Detection for User Modification (shell, groups, etc.)
    modify_patterns = [
        "change shell", "modify user", "add to group", "remove from group",
        "update user", "user shell", "change group", "grant group",
        "chsh", "usermod", "change home", "move home"
    ]
    is_modify = any(p in full_text for p in modify_patterns)
    if is_modify:
        modify_kb = next((a for a in kb_articles if a.get("number", "") == "KB0000018"), None)
        if not modify_kb:
            modify_kb = next((a for a in kb_articles if "modification" in a.get("title", "").lower() or "modify" in a.get("title", "").lower()), None)
        if modify_kb:
            logger.info(f"🎯 Embedding-Free Intent Match: User Modification detected -> Matched SOP [{modify_kb.get('number')}] '{modify_kb.get('title')}' (Score: 0.9750)")
            return [{"number": modify_kb.get("number"), "title": modify_kb.get("title"), "score": 0.9750, "article": modify_kb}]

    # 1f. Intent Detection for User Creation + Specific Directory Access
    dir_access_patterns = [
        "write access to", "read access to", "access to /etc", "access to /var",
        "write to /etc", "read to /etc", "modify /etc", "access to directory",
        "write permission", "read permission", "directory access"
    ]
    is_dir_access = any(p in full_text for p in dir_access_patterns)
    if is_dir_access and is_user_creation:
        user_kb = next((a for a in kb_articles if a.get("number", "") == "KB0000001"), None)
        if user_kb:
            logger.info(f"🎯 Embedding-Free Intent Match: User Creation + Directory Access detected -> Matched SOP [{user_kb.get('number')}] '{user_kb.get('title')}' (Score: 0.9850) [ACL MODE]")
            return [{"number": user_kb.get("number"), "title": user_kb.get("title"), "score": 0.9850, "article": user_kb, "acl_mode": True}]

    # 2. Intent Detection for NexaCore Application / Port 8080 Issues
    nexacore_patterns = [
        "nexacore", "port 8080", "8080", "nexacore portal", "nexacore app",
        "application down", "app down", "app crash", "app not responding",
        "web app", "web server down", "python app", "nexacore down",
        "http 8080", "workernode1hl app", "application recovery",
        "web service down", "application unreachable", "app unreachable"
    ]
    is_nexacore = any(p in full_text for p in nexacore_patterns)

    if is_nexacore:
        nexacore_kb = next(
            (a for a in kb_articles if "KB0000003" in a.get("number", "")),
            None
        )
        if not nexacore_kb:
            try:
                all_articles = requests.get("http://localhost:4000/api/v1/knowledge/articles", timeout=5).json()
                nexacore_kb = next((a for a in all_articles if "KB0000003" in a.get("number", "")), None)
            except Exception:
                pass
        if nexacore_kb:
            logger.info(f"🎯 Embedding-Free Intent Match: NexaCore/App-Down detected → Matched Master Recovery SOP [{nexacore_kb.get('number')}] '{nexacore_kb.get('title')}' (Score: 0.9900)")
            return [{
                "number": nexacore_kb.get("number"),
                "title": nexacore_kb.get("title"),
                "score": 0.9900,
                "article": nexacore_kb
            }]

    # 3. General Technical Keyword Overlap Matching
    stop_words = {"a", "an", "the", "in", "on", "of", "for", "to", "and", "or", "is", "are", "with", "server", "cluster", "node", "issue", "alert", "error"}
    query_tokens = set(re.findall(r'[a-z0-9]+', full_text)) - stop_words
    
    best_match = None
    best_score = 0.0
    
    # EXPLICIT MEMORY & CPU INTENT MATCH
    is_cpu_alert = any(k in full_text for k in ["cpu", "load average", "cpu spikes", "cpu 100", "cpu pressure", "cpu saturation", "cpu utilization", "high load"])
    is_mem_alert = any(k in full_text for k in ["memory", "ram", "oom", "heap", "swap", "memory pressure", "memory 100", "out of memory", "memory utilization", "kernel heap"])

    if is_cpu_alert or is_mem_alert:
        def _pick_triage_sop(arts, is_cpu, is_mem):
            combined = next((a for a in arts if "combined" in a.get("title","").lower() and "pressure" in a.get("title","").lower()), None)
            cpu_sop  = next((a for a in arts if "cpu pressure triage" in a.get("title","").lower()), None)
            mem_sop  = next((a for a in arts if "memory pressure triage" in a.get("title","").lower()), None)
            if is_cpu and is_mem and combined:   return combined
            if is_cpu and not is_mem and cpu_sop: return cpu_sop
            if is_mem and not is_cpu and mem_sop: return mem_sop
            return combined or cpu_sop or mem_sop

        triage_sop = _pick_triage_sop(kb_articles, is_cpu_alert, is_mem_alert)
        if not triage_sop:
            try:
                all_articles = requests.get("http://localhost:4000/api/v1/knowledge/articles", timeout=5).json()
                triage_sop = _pick_triage_sop(all_articles, is_cpu_alert, is_mem_alert)
            except Exception:
                pass

        if triage_sop:
            logger.info(f"🎯 Embedding-Free Intent Match: CPU/Memory Pressure Alert detected → Matched Triage SOP [{triage_sop.get('number')}] '{triage_sop.get('title')}' (Score: 0.9900)")
            return [{
                "number": triage_sop.get("number"),
                "title":  triage_sop.get("title"),
                "score":  0.9900,
                "article": triage_sop
            }]

    for art in kb_articles:
        art_title = art.get("title", "").lower()
        art_desc = (art.get("summary", "") + " " + art.get("category", "")).lower()
        art_tokens = set(re.findall(r'[a-z0-9]+', f"{art_title} {art_desc}")) - stop_words
        
        if not query_tokens or not art_tokens:
            continue
            
        overlap = query_tokens.intersection(art_tokens)
        if not overlap:
            continue
            
        jaccard = len(overlap) / float(len(query_tokens.union(art_tokens)))
        
        tech_boost = 0.0
        for token in overlap:
            if token in ["etcd", "postgresql", "disk", "sshd", "ssh", "space", "cpu", "memory", "ingress", "kubelet"]:
                tech_boost += 0.3
                
        total_score = min(0.99, jaccard * 2.0 + tech_boost)
        
        if total_score > best_score:
            best_score = total_score
            best_match = art
            
    if best_match and best_score >= 0.35:
        mapped_score = max(0.78, min(0.98, best_score))
        logger.info(f"🔎 Embedding-Free Keyword Match: [{best_match.get('number')}] - '{best_match.get('title')}' (Score: {mapped_score:.4f})")
        return [{
            "number": best_match.get("number"),
            "title": best_match.get("title"),
            "score": mapped_score,
            "article": best_match
        }]
        
    return []
