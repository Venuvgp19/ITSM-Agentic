import re
import requests
from ..config import (
    logger,
    ITSM_BASE_URL,
    MODEL_NAME,
    CI_CREDENTIALS,
)
from ..session_state import default_session_state
from ..llm import get_embedding, build_kb_embed_text
from ..rag.vector_db import ChromaVectorDB, vector_db as default_vector_db
from ..rag.hybrid_search import sanitize_kb_title

DEPARTMENT_TEAM_MEMBERS = {
    "Unix": "Richard Stallman (Unix)",
    "Network Ops": "Sarah Connor (Network Ops)",
    "App Support": "Alex Mercer (App Support)",
    "Desktop Support": "David Miller (Desktop Support)",
    "DBA Team": "DBA Team",
    "SecOps": "Security Team",
    "DevOps Ops": "DevOps Team"
}

def get_team_member_for_department(department):
    return DEPARTMENT_TEAM_MEMBERS.get(department, "Richard Stallman (Unix)")

def get_auth_token():
    try:
        res = requests.post(
            f"{ITSM_BASE_URL}/auth/login",
            json={"email": "resolver.agent@enterprise.com", "password": "password123"},
            timeout=5
        )
        if res.status_code in [200, 201]:
            return res.json()["accessToken"]
    except Exception as e:
        logger.error(f"Authentication failed: {e}")
    return None

def fetch_incident_queue(token):
    headers = {"Authorization": f"Bearer {token}"}
    try:
        res = requests.get(f"{ITSM_BASE_URL}/incidents", headers=headers, timeout=5)
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        logger.error(f"Error fetching incident queue: {e}")
    return []

def fetch_kb_articles(token):
    headers = {"Authorization": f"Bearer {token}"}
    try:
        res = requests.get(f"{ITSM_BASE_URL}/knowledge/articles", headers=headers, timeout=5)
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        logger.error(f"Error fetching KB articles: {e}")
    return []

def add_work_note(token, incident_id, note_text, author="🤖 Unix Auto-Resolver Agent"):
    headers = {"Authorization": f"Bearer {token}"}
    try:
        inc_res = requests.get(f"{ITSM_BASE_URL}/incidents/{incident_id}", headers=headers, timeout=5)
        if inc_res.status_code == 200:
            existing_activities = inc_res.json().get("activities", [])
            meaningful_lines = [l.strip() for l in note_text.split('\n') if l.strip() and '━━' not in l]
            header_line = meaningful_lines[0] if meaningful_lines else note_text[:50]
            for act in existing_activities:
                if header_line and header_line in act.get("comment", ""):
                    logger.info(f"⏭️ Skipping duplicate work note for {incident_id}: '{header_line[:40]}...'")
                    return True
    except Exception:
        pass

    payload = {"comment": note_text, "isWorkNote": True, "author": author}
    try:
        res = requests.post(f"{ITSM_BASE_URL}/incidents/{incident_id}/activities", headers=headers, json=payload, timeout=5)
        return res.status_code in [200, 201]
    except Exception as e:
        logger.error(f"Failed to post work note to {incident_id}: {e}")
        return False

def fetch_agent_approvals(token):
    headers = {"Authorization": f"Bearer {token}"}
    try:
        res = requests.get(f"{ITSM_BASE_URL}/agent/approvals", headers=headers, timeout=5)
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        logger.error(f"Error fetching agent approvals: {e}")
    return []

def submit_agent_approval(token, approval_data):
    headers = {"Authorization": f"Bearer {token}"}
    try:
        res = requests.post(f"{ITSM_BASE_URL}/agent/approvals", headers=headers, json=approval_data, timeout=5)
        return res.status_code in [200, 201]
    except Exception as e:
        logger.error(f"Error submitting agent approval request: {e}")
        return False

def update_incident_status(token, incident_id, state, resolution_code=None, resolution_notes=None, assigned_to=None, session_state=None):
    state_mgr = session_state or default_session_state
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"state": state}
    if resolution_code:
        payload["resolutionCode"] = resolution_code
    if resolution_notes:
        payload["resolutionNotes"] = resolution_notes
    if assigned_to:
        payload["assignedTo"] = assigned_to
    try:
        res = requests.patch(f"{ITSM_BASE_URL}/incidents/{incident_id}/state", headers=headers, json=payload, timeout=5)
        if res.status_code not in [200, 201]:
            res = requests.patch(f"{ITSM_BASE_URL}/incidents/{incident_id}", headers=headers, json=payload, timeout=5)
        
        if state == "RESOLVED":
            state_mgr.mark_resolved(incident_id)
            logger.info(f"🔒 Incident [{incident_id}] state saved as RESOLVED in PostgreSQL DB — locked from re-processing.")
            
        return res.status_code in [200, 201]
    except Exception as e:
        logger.error(f"Failed to update status for {incident_id}: {e}")
        return False

def save_new_kb_article_to_storage(new_article_data, vdb=None):
    """
    Persists a dynamically generated SOP Knowledge Base Article directly into the Single Master Database via NestJS API.
    Only called AFTER the Resolver Agent successfully resolves the incident!
    """
    active_vdb = vdb or default_vector_db
    try:
        target_title = str(new_article_data.get("title", "")).strip().lower()
        target_tokens = set(t for t in target_title.split() if len(t) > 3)
        
        if target_title:
            try:
                existing_kbs = requests.get(f"{ITSM_BASE_URL}/knowledge/articles", timeout=5).json()
                for kb in existing_kbs:
                    existing_title = str(kb.get("title", "")).strip().lower()
                    
                    # 1. Exact Title Match
                    if existing_title == target_title:
                        logger.info(f"ℹ️ KB Article '{kb.get('number')}' already exists with identical title '{kb.get('title')}'. Skipping duplicate creation.")
                        return kb
                    
                    # 2. Fuzzy Token Overlap Check (>85% similarity)
                    existing_tokens = set(t for t in existing_title.split() if len(t) > 3)
                    if target_tokens and existing_tokens:
                        overlap = len(target_tokens.intersection(existing_tokens))
                        similarity = overlap / max(len(target_tokens), len(existing_tokens))
                        if similarity >= 0.85:
                            logger.info(f"ℹ️ KB Article '{kb.get('number')}' ('{kb.get('title')}') is a near-duplicate (similarity: {similarity:.2f}). Merging steps into existing KB...")
                            existing_steps = kb.get("resolutionSteps", [])
                            new_steps = new_article_data.get("resolutionSteps", [])
                            merged_steps = list(dict.fromkeys(existing_steps + new_steps))

                            existing_symptoms = kb.get("symptoms", [])
                            new_symptoms = new_article_data.get("symptoms", [])
                            merged_symptoms = list(dict.fromkeys(existing_symptoms + new_symptoms))
                            
                            try:
                                patch_res = requests.patch(
                                    f"{ITSM_BASE_URL}/knowledge/articles/{kb.get('number')}",
                                    json={"resolutionSteps": merged_steps, "symptoms": merged_symptoms},
                                    timeout=5
                                )
                                if patch_res.status_code == 200:
                                    logger.info(f"✅ Successfully merged new resolution steps and enriched symptoms into {kb.get('number')}")
                                    updated_kb = patch_res.json()
                                    try:
                                        content_to_embed = build_kb_embed_text(
                                            title=kb.get('title', ''),
                                            summary=kb.get('summary', ''),
                                            symptoms=merged_symptoms,
                                            root_cause=kb.get('rootCause', '')
                                        )
                                        emb = get_embedding(content_to_embed, input_type="passage")
                                        if emb and active_vdb:
                                            active_vdb.add_kb_embedding(kb.get('number'), kb.get('number'), kb.get('title'), emb)
                                            logger.info(f"⚡ Re-indexed vector embeddings for {kb.get('number')} in ChromaDB with enriched RAG coverage.")
                                    except Exception as vec_err:
                                        logger.warning(f"Failed to re-index vector embedding: {vec_err}")
                                    return updated_kb
                            except Exception as patch_err:
                                logger.warning(f"Could not patch existing KB {kb.get('number')}: {patch_err}")
                            return kb
            except Exception as check_err:
                logger.warning(f"Error checking existing KBs for deduplication: {check_err}")

        clean_title = sanitize_kb_title(new_article_data.get("title", "Troubleshooting & SOP: New Issue"))
        payload = {
            "title": clean_title,
            "category": new_article_data.get("category", "Unix - OS & Services"),
            "configurationItem": new_article_data.get("configurationItem", "Worker 1"),
            "summary": new_article_data.get("summary", "Dynamically synthesized SOP article."),
            "symptoms": new_article_data.get("symptoms", ["Telemetry alert reported for new issue."]),
            "rootCause": new_article_data.get("rootCause", "Root cause identified in new use case diagnostic."),
            "resolutionSteps": new_article_data.get("resolutionSteps", []),
            "sourceIncidentIds": new_article_data.get("sourceIncidentIds", []),
            "author": "🤖 Gemini 3.1 Pro Knowledge Synthesis Agent",
            "modelUsed": MODEL_NAME
        }
        res = requests.post(f"{ITSM_BASE_URL}/knowledge/articles", json=payload, timeout=5)
        if res.status_code in [200, 201]:
            new_article = res.json()
            logger.info(f"✨ PERSISTED NEW SOP ARTICLE TO DATABASE VIA API: {new_article.get('number')} - {new_article.get('title')}")
            _indexed_ok = False
            try:
                symptom_list = new_article.get('symptoms', [])
                content_to_embed = build_kb_embed_text(
                    title=new_article.get('title', ''),
                    summary=new_article.get('summary', ''),
                    symptoms=symptom_list,
                    root_cause=new_article.get('rootCause', '')
                )
                emb = get_embedding(content_to_embed, input_type="passage")
                if emb and active_vdb:
                    active_vdb.add_kb_embedding(new_article.get('number'), new_article.get('number'), new_article.get('title'), emb)
                    _indexed_numbers = active_vdb.get_indexed_numbers()
                    if new_article.get('number') in _indexed_numbers:
                        _indexed_ok = True
                        logger.info(f"⚡ Indexed new vector embedding for {new_article.get('number')} in ChromaDB (verified present).")
                    else:
                        logger.error(f"❌ ChromaDB upsert reported success but {new_article.get('number')} is NOT present after write — reindex required.")
            except Exception as vec_err:
                logger.error(f"❌ Failed to index new vector embedding for {new_article.get('number')}: {vec_err}")
            try:
                new_article["_chromadb_indexed"] = _indexed_ok
            except Exception:
                pass
            return new_article
        else:
            logger.error(f"Failed to post KB article. Status: {res.status_code}, Body: {res.text}")
            return None
    except Exception as e:
        logger.error(f"Failed to persist new KB article via API: {e}")
        return None

def resolve_ci_credentials(incident):
    if not incident or not isinstance(incident, dict):
        return None, None

    # 1. Collect all possible CI candidate values from incident fields
    raw_candidates = [
        incident.get("configurationItem"),
        incident.get("configurationItemName"),
        incident.get("ci"),
        incident.get("ci_name"),
        incident.get("cmdb_ci"),
        incident.get("targetCi"),
        incident.get("target_ci"),
        incident.get("hostname"),
        incident.get("configurationItemId")
    ]
    
    ci_candidates = []
    for c in raw_candidates:
        if c is not None and not isinstance(c, (dict, list)):
            s = str(c).strip()
            if s and s.lower() not in ["null", "none", "undefined", "unspecified ci", "unspecified", ""]:
                ci_candidates.append(s)

    # 2. Check direct and normalized matching against CI_CREDENTIALS inventory
    for candidate in ci_candidates:
        if candidate in CI_CREDENTIALS:
            return CI_CREDENTIALS[candidate], candidate

        cand_low = candidate.lower()
        cand_clean = re.sub(r'[^a-z0-9]', '', cand_low)

        for key, info in CI_CREDENTIALS.items():
            k_low = key.lower()
            k_clean = re.sub(r'[^a-z0-9]', '', k_low)

            if cand_low == k_low or cand_clean == k_clean:
                return info, key
            if len(cand_clean) >= 4 and (cand_clean in k_clean or k_clean in cand_clean):
                return info, key
            if info.get("ip") and (info["ip"] == candidate or info["ip"] in candidate):
                return info, key

    # 3. Fallback: Parse description and shortDescription text
    short_desc = (incident.get("shortDescription") or "").lower()
    desc = (incident.get("description") or "").lower()
    full_text = f"{short_desc} {desc}"
    clean_text = re.sub(r'[^a-z0-9]', '', full_text)

    for key, info in CI_CREDENTIALS.items():
        if info.get("ip") and info["ip"] in full_text:
            return info, key
        k_low = key.lower()
        if k_low in full_text:
            return info, key
        k_clean = re.sub(r'[^a-z0-9]', '', k_low)
        if len(k_clean) >= 5 and k_clean in clean_text:
            return info, key

    return None, None
