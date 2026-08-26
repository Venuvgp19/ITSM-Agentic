import re
import requests
from ..config import (
    logger,
    ITSM_BASE_URL,
    GOVERNANCE_BASE_URL,
    ITSM_PROVIDER,
    MODEL_NAME,
    CI_CREDENTIALS,
)
from .servicenow_client import servicenow_client
from ..session_state import default_session_state
from ..llm import get_embedding, build_kb_embed_text
from ..rag.vector_db import ChromaVectorDB, vector_db as default_vector_db
from ..rag.hybrid_search import sanitize_kb_title

_BOILERPLATE_TITLE_RE = re.compile(
    r'^(master sop:|reusable investigative standard operating procedure:|sop:)\s*',
    re.IGNORECASE
)


def _strip_title_boilerplate(title: str) -> str:
    """Repeatedly strips leading boilerplate phrases -- synthesized titles are
    routinely stacked, e.g. "Master SOP: Reusable Investigative Standard Operating
    Procedure: Standard Operating Procedure: <topic>", and `^...$`-anchored
    re.sub() only matches at position 0 once per call, so a single non-looping sub()
    would leave the second/third prefix in place."""
    prev = None
    current = title
    while current != prev:
        prev = current
        current = _BOILERPLATE_TITLE_RE.sub('', current).strip()
    return current


def _steps_tokens(steps) -> set:
    """Tokenizes a resolutionSteps list (or string) into a word set for dedup
    comparison in save_new_kb_article_to_storage()."""
    text = " ".join(steps) if isinstance(steps, list) else str(steps or "")
    return set(t for t in re.findall(r'[a-z0-9]+', text.lower()) if len(t) > 3)


DEPARTMENT_TEAM_MEMBERS = {
    "Unix": "Sarah Chen (Unix Team Lead)",
    "Network Ops": "Alex Rivera (Network Lead)",
    "App Support": "Alex Mercer (App Support Lead)",
    "Desktop Support": "David Miller (Desktop Support Lead)",
    "DBA Team": "Michael Scott (DBA Team Lead)",
    "SecOps": "SecOps Lead",
    "DevOps Ops": "DevOps Team Lead"
}

def get_team_member_for_department(department):
    return DEPARTMENT_TEAM_MEMBERS.get(department, "Sarah Chen (Unix Team Lead)")

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
    if ITSM_PROVIDER == "SERVICENOW":
        return servicenow_client.fetch_unassigned_incidents()

    headers = {"Authorization": f"Bearer {token}"}
    try:
        res = requests.get(f"{ITSM_BASE_URL}/incidents", headers=headers, timeout=5)
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        logger.error(f"Error fetching incident queue: {e}")
    return []

def fetch_kb_articles(token):
    if ITSM_PROVIDER == "SERVICENOW":
        return servicenow_client.fetch_kb_articles()

    headers = {"Authorization": f"Bearer {token}"}
    try:
        res = requests.get(f"{ITSM_BASE_URL}/knowledge/articles", headers=headers, timeout=5)
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        logger.error(f"Error fetching KB articles: {e}")
    return []

def add_work_note(token, incident_id, note_text, author="🤖 Unix Auto-Resolver Agent", session_state=None):
    if ITSM_PROVIDER == "SERVICENOW":
        return servicenow_client.add_work_note(incident_id, note_text, author=author, session_state=session_state)

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

def fetch_agent_approvals(token=None):
    """Fetches pending and active approval requests directly from the dedicated SRE Control Tower Governance service.

    Must request status=ALL: the endpoint defaults to PENDING-only when no status
    query param is given, which would hide APPROVED/REJECTED records the poller
    needs to detect a human decision and resume/abort execution.

    INTENTIONALLY not ITSM_PROVIDER-aware: this and submit_agent_approval() always
    route to GOVERNANCE_BASE_URL (the Control Tower) regardless of provider. The
    HITL approval gate is this platform's own autonomy-governance concept, not an
    ITSM record type ServiceNow natively models -- ServiceNow's nearest analogs
    (sysapproval_approver / Flow Designer approvals) are tied to Change Request
    records and would require the daemon to also create/manage SN Change Requests,
    a scope increase with no functional benefit since the Control Tower UI is the
    operator's actual approval surface in both modes. Same reasoning applies to
    every function in itsm/dashboard.py (timeline/execution telemetry).
    """
    try:
        res = requests.get(f"{GOVERNANCE_BASE_URL}/approvals", params={"status": "ALL"}, timeout=5)
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        logger.error(f"Error fetching agent approvals from SRE Control Tower ({GOVERNANCE_BASE_URL}): {e}")
    return []

def submit_agent_approval(token, approval_data):
    """Submits a mandatory HITL approval request directly to the dedicated SRE Control Tower Governance service."""
    try:
        res = requests.post(f"{GOVERNANCE_BASE_URL}/approvals", json=approval_data, timeout=5)
        if res.status_code in [200, 201]:
            logger.info(f"✅ Successfully submitted HITL Approval Request to SRE Control Tower ({GOVERNANCE_BASE_URL}) for [{approval_data.get('incidentId')}].")
            return True
        else:
            logger.warning(f"SRE Control Tower returned HTTP {res.status_code} for approval submission: {res.text}")
    except Exception as e:
        logger.error(f"Error submitting agent approval request to SRE Control Tower ({GOVERNANCE_BASE_URL}): {e}")
    return False

def update_incident_status(token, incident_id, state, resolution_code=None, resolution_notes=None, assigned_to=None, session_state=None):
    if ITSM_PROVIDER == "SERVICENOW":
        return servicenow_client.update_incident_status(incident_id, state, resolution_code or "Automated Remediation", resolution_notes)

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

        success = res.status_code in [200, 201]
        # Only lock the incident as resolved once the PATCH actually succeeded --
        # previously this fired unconditionally, so a failed PATCH (network blip,
        # 4xx/5xx from the backend) still permanently marked the ticket resolved
        # locally even though the real incident was left untouched (e.g. still
        # IN_PROGRESS), locking it out of all future processing for no reason.
        if state == "RESOLVED" and success:
            state_mgr.mark_resolved(incident_id)
            logger.info(f"🔒 Incident [{incident_id}] state saved as RESOLVED in PostgreSQL DB — locked from re-processing.")

        return success
    except Exception as e:
        logger.error(f"Failed to update status for {incident_id}: {e}")
        return False

def save_new_kb_article_to_storage(new_article_data, vdb=None):
    """
    Persists a dynamically generated SOP Knowledge Base Article directly into the Single Master Database via NestJS API.
    Only called AFTER the Resolver Agent successfully resolves the incident!

    ServiceNow-mode write-back is deliberately deferred (not implemented): SN
    requires a valid kb_knowledge_base reference to create a KB record, and its
    kb_knowledge.text field is free-form HTML rather than this platform's
    structured {symptoms, rootCause, resolutionSteps} shape -- see
    servicenow_client.fetch_kb_articles()'s docstring for the read-side of this
    same tradeoff. Synthesized SOPs in SERVICENOW mode still get generated and
    used to resolve the current incident; they just don't persist back into
    ServiceNow's KB table for future RAG matching yet.
    """
    if ITSM_PROVIDER == "SERVICENOW":
        logger.info(
            f"ℹ️ ServiceNow-mode KB write-back is deferred (not implemented) -- synthesized SOP "
            f"'{new_article_data.get('title', '')}' resolved this incident but was not persisted to a KB."
        )
        return None

    active_vdb = vdb or default_vector_db
    try:
        target_title = str(new_article_data.get("title", "")).strip().lower()
        # Strip shared boilerplate ("Master SOP: Reusable Investigative Standard
        # Operating Procedure: ...") before tokenizing -- every synthesized title
        # carries this prefix, which pads the overlap denominator and let two
        # incidents about the SAME underlying task, phrased differently by the LLM
        # (e.g. "Restart Nexacore Service" vs "Recover Nexacore Application After
        # Crash"), fall under the 0.85 threshold and each get persisted as their own
        # KB row instead of merging -- this is the direct cause of the near-duplicate
        # "Master SOP" bloat observed in the KB (KB0000045, KB0000035, etc.).
        target_title_core = _strip_title_boilerplate(target_title)
        target_tokens = set(t for t in target_title_core.split() if len(t) > 3)
        target_steps_tokens = _steps_tokens(new_article_data.get("resolutionSteps", []))

        if target_title:
            try:
                existing_kbs = requests.get(f"{ITSM_BASE_URL}/knowledge/articles", timeout=5).json()
                for kb in existing_kbs:
                    existing_title = str(kb.get("title", "")).strip().lower()

                    # 1. Exact Title Match
                    if existing_title == target_title:
                        logger.info(f"ℹ️ KB Article '{kb.get('number')}' already exists with identical title '{kb.get('title')}'. Skipping duplicate creation.")
                        return kb

                    # 2. Fuzzy Token Overlap Check: title-core similarity alone (>=0.85,
                    # same bar as before but on the boilerplate-stripped title), OR a
                    # weaker title match (>=0.60) corroborated by resolution-steps overlap
                    # (>=0.60) -- catches "same task, different phrasing" since the actual
                    # commands (systemctl restart nexacore, curl check on 8080, ...) overlap
                    # heavily even when the LLM-generated titles don't.
                    existing_title_core = _strip_title_boilerplate(existing_title)
                    existing_tokens = set(t for t in existing_title_core.split() if len(t) > 3)
                    title_similarity = 0.0
                    if target_tokens and existing_tokens:
                        overlap = len(target_tokens.intersection(existing_tokens))
                        title_similarity = overlap / max(len(target_tokens), len(existing_tokens))

                    steps_similarity = 0.0
                    existing_steps_tokens = _steps_tokens(kb.get("resolutionSteps", []))
                    if target_steps_tokens and existing_steps_tokens:
                        steps_overlap = len(target_steps_tokens.intersection(existing_steps_tokens))
                        steps_similarity = steps_overlap / max(len(target_steps_tokens), len(existing_steps_tokens))

                    # Title wording is free-form LLM prose and an unreliable signal on
                    # its own ("Restart Nexacore Service" vs "Recover Nexacore
                    # Application After Crash" -- title_similarity ~0.2 despite being
                    # the same underlying task); resolutionSteps are concrete commands
                    # and a far stronger duplicate signal, so a strong steps match alone
                    # is sufficient, with a softer combined threshold for the case where
                    # neither signal alone clears the bar but both partially agree.
                    is_duplicate = (
                        title_similarity >= 0.85
                        or steps_similarity >= 0.70
                        or (title_similarity >= 0.40 and steps_similarity >= 0.50)
                    )
                    if is_duplicate:
                        logger.info(
                            f"ℹ️ KB Article '{kb.get('number')}' ('{kb.get('title')}') is a near-duplicate "
                            f"(title_sim={title_similarity:.2f}, steps_sim={steps_similarity:.2f}). Merging steps into existing KB..."
                        )
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

def fetch_ci_inventory():
    """
    Fetches live Configuration Items from the CMDB (`ConfigurationItem.attributesJson`)
    and shapes them like CI_CREDENTIALS: {name-or-ip: {ip, user, password, os}}.
    This is what makes CI credentials persist "in the database" instead of only
    in this checked-out copy's config.py -- a CI's credentials set via
    PATCH /api/v1/cmdb/ci/:id (or scripts/database/seed_ci_credentials.py) are
    picked up here on the next call, from any environment pointed at the same
    database, without a code change or daemon restart.
    A CMDB asset with no sshUser/sshPassword recorded yet is skipped, not an
    error -- CMDB tracks assets the agent has no reason to ever resolve too
    (routers, k8s clusters, ...).
    """
    try:
        res = requests.get(f"{ITSM_BASE_URL}/cmdb/ci", timeout=3)
        if res.status_code != 200:
            return {}
        cis = res.json()
    except Exception as e:
        logger.warning(f"CMDB CI inventory fetch failed, using local CI_CREDENTIALS fallback only: {e}")
        return {}

    inventory = {}
    for ci in cis if isinstance(cis, list) else []:
        attrs = ci.get("attributesJson") or {}
        ssh_user = attrs.get("sshUser")
        ssh_password = attrs.get("sshPassword")
        if not ssh_user or not ssh_password:
            continue
        primary_ip = ci.get("ipAddress")
        info = {
            "ip": primary_ip,
            "user": ssh_user,
            "password": ssh_password,
            "os": attrs.get("os", "Unix / Linux"),
        }
        name = ci.get("name")
        if name:
            inventory[name] = info
        if primary_ip:
            inventory[primary_ip] = info
        secondary_ip = attrs.get("secondaryIp")
        if secondary_ip:
            inventory[secondary_ip] = {**info, "ip": secondary_ip}
    return inventory


def _fetch_ci_inventory_from_servicenow():
    """
    ServiceNow-provider counterpart to fetch_ci_inventory(): enriches (not
    replaces) CI_CREDENTIALS entries with live ip/os metadata from ServiceNow's
    CMDB, keyed by the same CI names already present locally. Unlike
    fetch_ci_inventory()'s NestJS CMDB (which can itself carry sshUser/sshPassword
    in attributesJson and so contribute wholly new entries), ServiceNow's CMDB
    never carries SSH credentials -- there's no complete-entry case here, so this
    only ever overrides ip/os on names CI_CREDENTIALS already knows the
    user/password for, rather than adding new incomplete (creds-less) entries.
    """
    enriched = {}
    for name, local_info in CI_CREDENTIALS.items():
        sn_info = servicenow_client.fetch_ci_details(name)
        if sn_info and sn_info.get("ip"):
            enriched[name] = {**local_info, "ip": sn_info["ip"], "os": sn_info.get("os") or local_info.get("os")}
    return enriched


def resolve_ci_credentials(incident):
    if not incident or not isinstance(incident, dict):
        return None, None

    # Live CMDB inventory takes priority over (and extends) the hardcoded
    # fallback -- see fetch_ci_inventory(). Falls back to CI_CREDENTIALS alone
    # if the backend/CMDB is unreachable, so a fresh checkout with no DB
    # access yet still resolves the well-known dev hosts.
    if ITSM_PROVIDER == "SERVICENOW":
        ci_inventory = {**CI_CREDENTIALS, **_fetch_ci_inventory_from_servicenow()}
    else:
        ci_inventory = {**CI_CREDENTIALS, **fetch_ci_inventory()}

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

    # 2. Check direct and normalized matching against the CI inventory
    for candidate in ci_candidates:
        if candidate in ci_inventory:
            return ci_inventory[candidate], candidate

        cand_low = candidate.lower()
        cand_clean = re.sub(r'[^a-z0-9]', '', cand_low)

        for key, info in ci_inventory.items():
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

    for key, info in ci_inventory.items():
        if info.get("ip") and info["ip"] in full_text:
            return info, key
        k_low = key.lower()
        if k_low in full_text:
            return info, key
        k_clean = re.sub(r'[^a-z0-9]', '', k_low)
        if len(k_clean) >= 5 and k_clean in clean_text:
            return info, key

    return None, None
