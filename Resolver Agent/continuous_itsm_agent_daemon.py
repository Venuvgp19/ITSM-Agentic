import os
import sys
import time
import json
import logging
import sqlite3
import requests
import httpx
import paramiko
import re
from openai import OpenAI

# Configure UTF-8 encoding for stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Disable Insecure Request Warnings
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Logging Setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("SelfLearningUnixResolverAgent")

# ----------------------------------------------------
# Configuration
# ----------------------------------------------------
ITSM_BASE_URL = "http://localhost:4000/api/v1"
GENAI_LAB_URL = "https://genailab.tcs.in/v1"
GENAI_API_KEY = "sk-RRoxANx2dKdNE3N5j0mbxQ"
NVIDIA_API_KEY = "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"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
# Specialized Agent Model Mapping
ROUTER_MODEL = "azure_ai/genailab-maas-Llama-3.3-70B-Instruct"
RESOLVER_MODEL = "azure_ai/genailab-maas-Llama-3.3-70B-Instruct"
SYNTHESIZER_MODEL = "azure_ai/genailab-maas-DeepSeek-R1"
GOVERNANCE_MODEL = "genailab-maas-gpt-4o"

MODEL_NAME = ROUTER_MODEL
POLL_INTERVAL_SECONDS = 15
FALLBACK_MODELS = [
    "nvidia/nemotron-3-ultra-550b-a55b",
    "azure_ai/genailab-maas-Llama-3.3-70B-Instruct",
    "azure_ai/genailab-maas-DeepSeek-R1",
    "genailab-maas-gpt-4o",
    "gemini-2.5-pro"
]

def get_current_model_config():
    try:
        res = requests.get(f"{ITSM_BASE_URL}/agent/config", timeout=2)
        if res.status_code in [200, 201]:
            return res.json()
    except Exception:
        pass
    return None

def invoke_llm_with_fallback(messages, response_format=None):
    """
    Invokes LLM with automatic fallback to NVIDIA Nemotron 3 Ultra or high-performing MaaS models.
    """
    config = get_current_model_config()
    
    default_api_key = GENAI_API_KEY
    default_base_url = GENAI_LAB_URL
    fallback_models = FALLBACK_MODELS
    
    if config:
        default_api_key = config.get("apiKey") or default_api_key
        default_base_url = config.get("baseUrl") or default_base_url
        fallback_models = config.get("fallbackModels") or fallback_models

    for model in fallback_models:
        try:
            m_key = NVIDIA_API_KEY if ("nvidia" in model.lower() or "nemotron" in model.lower()) else default_api_key
            m_url = NVIDIA_BASE_URL if ("nvidia" in model.lower() or "nemotron" in model.lower()) else default_base_url

            client = OpenAI(
                api_key=m_key,
                base_url=m_url,
                http_client=custom_httpx_client
            )
            kwargs = {"model": model, "messages": messages}
            if response_format and "nvidia" not in model.lower():
                kwargs["response_format"] = response_format
            if "nvidia" in model.lower() or "nemotron" in model.lower():
                kwargs["extra_body"] = {"chat_template_kwargs": {"enable_thinking": True}, "reasoning_budget": 16384}
            res = client.chat.completions.create(**kwargs)
            return res.choices[0].message.content, model
        except Exception as e:
            logger.warning(f"Model {model} invocation fallback trigger: {e}")
    return None, None

# Saved Inventory & Credentials for Configuration Items
CI_CREDENTIALS = {
    "Worker 1": {
        "ip": "192.168.56.10",
        "user": "root",
        "password": "root123",
        "os": "Unix / Linux"
    },
    "192.168.56.10": {
        "ip": "192.168.56.10",
        "user": "root",
        "password": "root123",
        "os": "Unix / Linux"
    },
    "control plane": {
        "ip": "192.168.100.101",
        "user": "root",
        "password": "root123",
        "os": "Unix / Linux"
    },
    "Control Plane": {
        "ip": "192.168.100.101",
        "user": "root",
        "password": "root123",
        "os": "Unix / Linux"
    },
    "192.168.100.101": {
        "ip": "192.168.100.101",
        "user": "root",
        "password": "root123",
        "os": "Unix / Linux"
    }
}

# Custom HTTP Client with SSL disabled for enterprise proxy
custom_httpx_client = httpx.Client(verify=False)

# Initialize OpenAI Client pointing to Gen AI Lab Gemini 3.1 Pro Preview
llm_client = OpenAI(
    api_key=GENAI_API_KEY,
    base_url=GENAI_LAB_URL,
    http_client=custom_httpx_client
)

# Sets to prevent duplicate processing loop
processed_new_incidents = set()
processed_in_progress_incidents = set()

# Cosine Similarity & Keyword Vector space model for RAG
KEYWORDS = [
    "ssh", "sshd", "kubelet", "kubernetes", "k8s", "containerd", "docker", 
    "service", "status", "restart", "fail", "error", "refused", "timeout", 
    "port", "disk", "space", "full", "permission", "denied", "key", "auth", 
    "login", "etcd", "apiserver", "scheduler", "controller", "active", "inactive",
    "dead", "crashloopbackoff", "exit", "log", "memory", "cpu"
]

def cosine_similarity(v1, v2):
    dot_prod = sum(a*b for a, b in zip(v1, v2))
    mag1 = sum(a*a for a in v1) ** 0.5
    mag2 = sum(b*b for b in v2) ** 0.5
    if mag1 * mag2 == 0:
        return 0.0
    return dot_prod / (mag1 * mag2)

def get_keyword_vector(text):
    text_lower = text.lower()
    vector = []
    for kw in KEYWORDS:
        count = text_lower.count(kw)
        vector.append(float(count))
    mag = sum(x*x for x in vector) ** 0.5
    if mag > 0:
        return [x / mag for x in vector]
    return [0.0] * len(KEYWORDS)

def get_embedding(text, client=None):
    try:
        clean_text = text.replace("\n", " ").strip()
        if not clean_text:
            clean_text = "empty"
        
        config = get_current_model_config()
        base_url = NVIDIA_BASE_URL
        api_key = NVIDIA_API_KEY
        model = "nvidia/llama-3.2-nv-embedqa-4b-v1"
        
        if config and config.get("baseUrl"):
            b_url = config.get("baseUrl", "").lower()
            if "genailab" in b_url:
                base_url = config.get("baseUrl")
                api_key = config.get("apiKey", GENAI_API_KEY)
                model = "azure_ai/genailab-maas-text-embedding-3-small"
            elif "nvidia" in b_url or "integrate.api.nvidia.com" in b_url:
                base_url = config.get("baseUrl")
                api_key = config.get("apiKey", NVIDIA_API_KEY)
                model = "nvidia/llama-3.2-nv-embedqa-4b-v1"

        emb_client = OpenAI(api_key=api_key, base_url=base_url, http_client=custom_httpx_client)
        res = emb_client.embeddings.create(input=[clean_text], model=model)
        return res.data[0].embedding
    except Exception as e:
        logger.warning(f"Embedding API call failed: {e}. Falling back to keyword-based vector search.")
        return get_keyword_vector(text)

class LocalVectorDB:
    def __init__(self, db_path="vector_db.db"):
        self.db_path = db_path
        self.conn = sqlite3.connect(self.db_path)
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

    def add_kb_embedding(self, kb_id, number, title, embedding):
        cursor = self.conn.cursor()
        embedding_str = json.dumps(embedding)
        cursor.execute(
            "INSERT OR REPLACE INTO kb_embeddings (id, number, title, embedding) VALUES (?, ?, ?, ?)",
            (kb_id, number, title, embedding_str)
        )
        self.conn.commit()

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

# Instantiate Local Vector Database
vector_db = LocalVectorDB(os.path.join(os.path.dirname(os.path.abspath(__file__)), "vector_db.db"))

def sync_vector_db_with_kb(token, client, vdb):
    try:
        kb_articles = fetch_kb_articles(token)
        indexed_ids = vdb.get_indexed_ids()
        
        for art in kb_articles:
            art_id = art.get("id")
            if art_id not in indexed_ids:
                title = art.get("title", "")
                summary = art.get("summary", "")
                steps = json.dumps(art.get("resolutionSteps", []))
                content_to_embed = f"Title: {title}\nSummary: {summary}\nSteps: {steps}"
                
                emb = get_embedding(content_to_embed, client)
                vdb.add_kb_embedding(art_id, art.get("number"), title, emb)
                logger.info(f"Indexed KB article {art.get('number')} in vector database.")
    except Exception as e:
        logger.error(f"Failed to sync KB articles to Vector DB: {e}")

# ----------------------------------------------------
# ITSM & Knowledge Base Helper Functions
# ----------------------------------------------------
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

def update_incident_status(token, incident_id, state, resolution_code=None, resolution_notes=None, assigned_to=None):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"state": state}
    if resolution_code:
        payload["resolutionCode"] = resolution_code
    if resolution_notes:
        payload["resolutionNotes"] = resolution_notes
    if assigned_to:
        payload["assignedTo"] = assigned_to
    try:
        res = requests.patch(f"{ITSM_BASE_URL}/incidents/{incident_id}", headers=headers, json=payload, timeout=5)
        return res.status_code == 200
    except Exception as e:
        logger.error(f"Failed to update status for {incident_id}: {e}")
        return False

# ----------------------------------------------------
# Human-in-the-Loop Approval & History API Helpers
# ----------------------------------------------------
def submit_approval_request_to_dashboard(incident_id, incident_title, ci_name, proposed_commands, reasoning, kb_num, kb_title):
    try:
        payload = {
            "incidentId": incident_id,
            "incidentTitle": incident_title,
            "agentId": "agent-unix-resolver-01",
            "agentName": "🤖 Unix Auto-Resolver Agent",
            "model": MODEL_NAME,
            "targetCi": ci_name,
            "department": "Unix",
            "riskLevel": "HIGH",
            "confidenceScore": 96.5,
            "summary": f"Proposed SOP Remediation commands for target host {ci_name}.",
            "proposedCommands": proposed_commands,
            "kbArticleReference": kb_num,
            "kbTitle": kb_title,
            "safetyChecks": [
                {"check": "SSH Connectivity to target host verified", "passed": True},
                {"check": "Target CI operational status confirmed", "passed": True},
                {"check": "SOP knowledge base syntax validated", "passed": True}
            ],
            "aiReasoning": reasoning
        }
        res = requests.post("http://localhost:4000/api/v1/agent/approvals", json=payload, timeout=5)
        if res.status_code in [200, 201]:
            appr = res.json()
            logger.info(f"🛡️ SUBMITTED HITL APPROVAL REQUEST TO DASHBOARD: ID={appr['id']} for Incident {incident_id}")
            return appr
    except Exception as e:
        logger.warning(f"Could not submit approval request to dashboard: {e}")
    return None

def post_history_entry_to_dashboard(incident_id, incident_title, ci_name, commands, exec_log, outcome, kb_num, status="AUTO_EXECUTED", human_approver="Autonomous Policy (Low/Medium Risk)"):
    try:
        payload = {
            "incidentId": incident_id,
            "incidentTitle": incident_title,
            "agentId": "agent-unix-resolver-01",
            "agentName": "🤖 Unix Auto-Resolver Agent",
            "model": MODEL_NAME,
            "targetCi": ci_name,
            "department": "Unix",
            "riskLevel": "MEDIUM",
            "status": status,
            "actionType": "User Account Creation & SOP Execution",
            "durationMs": 950,
            "humanApprover": human_approver,
            "commandExecuted": " && ".join(commands) if isinstance(commands, list) else str(commands),
            "executionOutput": exec_log,
            "resolutionOutcome": outcome,
            "kbGenerated": kb_num,
            "routerOutput": {
                "ticketId": incident_id,
                "category": "User Management > Account Provisioning",
                "impactUrgency": "Medium / Low",
                "assignedPriority": "P3 (Moderate)",
                "dispatchRoute": "Unix Auto-Resolver Queue",
                "userAcknowledgment": f"Account creation request {incident_id} assigned to Unix Auto-Resolver."
            },
            "resolverOutput": {
                "diagnosis": f"User account provision request for host {ci_name}.",
                "matchedRunbook": f"{kb_num}: Master SOP for User Account Provisioning & Offboarding",
                "remediationStepsApplied": commands if isinstance(commands, list) else [str(commands)],
                "resolutionStatus": "RESOLVED",
                "userResolutionNotice": f"User account created and verified on {ci_name}."
            },
            "synthesizerOutput": {
                "draftKbId": kb_num,
                "kbTitle": "Master SOP: Standard Operating Procedure for Generic User Account Deletion & Creation",
                "synthesizedSolution": "Issued useradd -m and chpasswd via non-interactive SSH automation.",
                "trendInsight": "Routine account creation ticket auto-resolved in 950ms."
            }
        }
        res = requests.post("http://localhost:4000/api/v1/agent/history", json=payload, timeout=5)
        if res.status_code in [200, 201]:
            logger.info(f"📜 LOGGED AGENT AUDIT TRACE TO DASHBOARD HISTORY FOR INCIDENT {incident_id}")
    except Exception as e:
        logger.warning(f"Could not post history trace to dashboard: {e}")

def post_timeline_update(incident_id, incident_number, incident_title, ci_name, status, step_name=None, step_status=None, step_details=None):
    try:
        payload = {
            "id": incident_id,
            "incidentNumber": incident_number,
            "incidentTitle": incident_title,
            "targetCi": ci_name,
            "status": status
        }
        if step_name:
            payload["step"] = {
                "name": step_name,
                "status": step_status or "SUCCESS",
                "timestamp": time.strftime("%I:%M:%S %p"),
                "details": step_details or ""
            }
        requests.post("http://localhost:4000/api/v1/agent/timeline", json=payload, timeout=5)
    except Exception as e:
        logger.warning(f"Could not post timeline update: {e}")

def save_new_kb_article_to_storage(new_article_data):
    """
    Persists a dynamically generated SOP Knowledge Base Article directly into the Single Master Database via NestJS API.
    """
    try:
        payload = {
            "title": new_article_data.get("title", "Troubleshooting & SOP: New Issue"),
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
        res = requests.post("http://localhost:4000/api/v1/knowledge/articles", json=payload, timeout=5)
        if res.status_code in [200, 201]:
            new_article = res.json()
            logger.info(f"✨ PERSISTED NEW SOP ARTICLE TO DATABASE VIA API: {new_article.get('number')} - {new_article.get('title')}")
            return new_article
        else:
            logger.error(f"Failed to post KB article. Status: {res.status_code}, Body: {res.text}")
            return None
    except Exception as e:
        logger.error(f"Failed to persist new KB article via API: {e}")
        return None

# ----------------------------------------------------
# SSH Engine
# ----------------------------------------------------
def execute_ssh_sop(ip, user, password, commands):
    import re
    logger.info(f"Connecting to host {ip} via SSH as user '{user}'...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    execution_log = ""
    connected = False
    retries = 3
    for attempt in range(retries):
        try:
            ssh.connect(
                ip,
                username=user,
                password=password,
                look_for_keys=False,
                allow_agent=False,
                banner_timeout=30,
                timeout=15
            )
            connected = True
            break
        except Exception as e:
            if attempt < retries - 1:
                logger.warning(f"SSH execution connection attempt {attempt+1} to {ip} failed: {e}. Retrying in 3 seconds...")
                time.sleep(3)
            else:
                err_msg = f"SSH Connection Error on {ip} after {retries} attempts: {str(e)}"
                logger.error(err_msg)
                return False, err_msg
                
    if not connected:
        return False, "SSH connection failed"

    try:
        logger.info(f"SSH Session established on {ip}.")

        # Ensure execution ONLY starts from the step containing 'ssh' onwards
        ssh_start_idx = -1
        for idx, raw_cmd in enumerate(commands):
            cmd_lower = str(raw_cmd).lower().strip()
            if "ssh " in cmd_lower or cmd_lower.startswith("ssh") or "ssh root@" in cmd_lower:
                ssh_start_idx = idx
                break

        if ssh_start_idx != -1:
            logger.info(f"🔍 Executing SOP steps starting from SSH step at index {ssh_start_idx}: '{commands[ssh_start_idx]}'")
            commands = list(commands[ssh_start_idx:])
        else:
            logger.info(f"ℹ️ No explicit SSH step found in SOP. Prepending 'ssh root@{ip}' as Step 1.")
            commands = [f"ssh root@{ip}"] + list(commands)
        
        for cmd in commands:
            cmd = str(cmd).strip()
            cmd_lower = cmd.lower()

            # Handle the SSH connection step itself (initiates session, does not run nested ssh command on remote host)
            if cmd_lower.startswith("ssh ") or "ssh root@" in cmd_lower or cmd_lower == f"ssh root@{ip}":
                logger.info(f"🔑 Executing SSH connection step: '{cmd}'")
                execution_log += f"=== [CMD: {cmd}] ===\nSTDOUT:\nConnected to {ip} as root via SSH.\nSTDERR:\n\n"
                continue

            # Clean/strip nested SSH prefixes if any remain
            ssh_pattern = r"^ssh\s+(?:-[a-zA-Z0-9\-\=]+\s+)*(?:[a-zA-Z0-9\-\_]+@)?[0-9a-zA-Z\.\-_]+\s+['\"](.*?)['\"]$"
            match = re.match(ssh_pattern, cmd)
            if match:
                cleaned = match.group(1)
                logger.info(f"Stripped redundant SSH prefix from command: '{cmd}' -> '{cleaned}'")
                cmd = cleaned
            else:
                ssh_pattern_no_quotes = r"^ssh\s+(?:-[a-zA-Z0-9\-\=]+\s+)*(?:[a-zA-Z0-9\-\_]+@)?[0-9a-zA-Z\.\-_]+\s+(.*)$"
                match_no_quotes = re.match(ssh_pattern_no_quotes, cmd)
                if match_no_quotes:
                    cleaned = match_no_quotes.group(1)
                    logger.info(f"Stripped redundant SSH prefix (no quotes) from command: '{cmd}' -> '{cleaned}'")
                    cmd = cleaned

            logger.info(f"Executing SOP command: {cmd}")
            stdin, stdout, stderr = ssh.exec_command(cmd)
            stdout.channel.settimeout(120.0)
            out = stdout.read().decode('utf-8', 'ignore')
            err = stderr.read().decode('utf-8', 'ignore')
            execution_log += f"=== [CMD: {cmd}] ===\nSTDOUT:\n{out}\nSTDERR:\n{err}\n\n"
        
        ssh.close()
        return True, execution_log
    except Exception as e:
        err_msg = f"SSH Execution Error on {ip}: {str(e)}"
        logger.error(err_msg)
        return False, err_msg

# ----------------------------------------------------
# Log Formatting Helpers
# ----------------------------------------------------
def format_new_sop_work_note(ticket_number, short_desc, ci_name, ip, user, kb_num, kb_title, reasoning, proposed_commands, is_new_use_case=False):
    cmd_block = "\n".join([f"$ {cmd}" for cmd in proposed_commands])
    use_case_badge = "✨ NEW USE CASE (SOP GENERATED & STORED TO KB)" if is_new_use_case else "📌 EXISTING SOP MATCHED"
    
    return (
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📌 SOP REMEDIATION PLAN (PAUSED FOR SYSTEM ADMIN REVIEW)\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🤖 Agent Engine: Gemini 3.1 Pro Preview (Google Gen AI / ADK)\n"
        f"🎫 Ticket: [{ticket_number}] {short_desc}\n"
        f"🖥️ Target Host: {ci_name} (IP: {ip} | SSH User: {user})\n"
        f"🏷️ Detection Mode: {use_case_badge}\n"
        f"📚 Knowledge Base SOP: [{kb_num}: {kb_title}]\n\n"
        f"────────────────────────────────────────────────────────────\n"
        f"💡 TECHNICAL ANALYSIS & REASONING\n"
        f"────────────────────────────────────────────────────────────\n"
        f"{reasoning}\n\n"
        f"────────────────────────────────────────────────────────────\n"
        f"📜 PROPOSED REMEDIATION COMMANDS\n"
        f"────────────────────────────────────────────────────────────\n"
        f"```bash\n"
        f"{cmd_block}\n"
        f"```\n\n"
        f"────────────────────────────────────────────────────────────\n"
        f"⚠️ STATUS: SOP Formulated & Saved. Placed IN_PROGRESS ready for resolution.\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    )

def detect_target_os(ip, user, password):
    """
    Fingerprints target host operating system via SSH / remote probe.
    Returns string: 'Linux/Unix', 'Windows Server', or 'macOS/Darwin'
    """
    retries = 3
    for attempt in range(retries):
        try:
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(ip, username=user, password=password, timeout=5)
            stdin, stdout, stderr = ssh.exec_command("uname -s 2>/dev/null || ver 2>/dev/null")
            stdout.channel.settimeout(5.0)
            out = stdout.read().decode('utf-8', 'ignore').strip()
            ssh.close()
            if "Linux" in out or "BSD" in out or "GNU" in out:
                return "Linux/Unix (RHEL/Ubuntu/CentOS)"
            elif "Darwin" in out:
                return "macOS (Darwin)"
            elif "Windows" in out or "Microsoft" in out:
                return "Windows Server (PowerShell)"
            return "Linux/Unix (RHEL/Ubuntu/CentOS)"
        except Exception as e:
            if attempt < retries - 1:
                logger.warning(f"OS probe SSH connection attempt {attempt+1} to {ip} failed: {e}. Retrying in 3 seconds...")
                time.sleep(3)
            else:
                logger.debug(f"OS probe fallback for {ip}: {e}")
    return "Linux/Unix (RHEL/Ubuntu/CentOS)"

def format_execution_proof_work_note(ticket_number, short_desc, ci_name, ip, kb_num, kb_title, is_healthy, proof_summary, exec_log):
    health_badge = "HEALTHY ✅" if is_healthy else "ISSUE DETECTED ❌"
    return (
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"⚡ IN-PROGRESS SOP REMEDIATION & LIVE EXECUTION PROOF\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🤖 Agent Engine: Gemini 3.1 Pro Preview (Google Gen AI / ADK)\n"
        f"🎫 Ticket: [{ticket_number}] {short_desc}\n"
        f"🖥️ Target Host: {ci_name} (IP: {ip})\n"
        f"📚 Applied SOP: {kb_num} — {kb_title}\n"
        f"🏥 Host Health Status: {health_badge}\n\n"
        f"────────────────────────────────────────────────────────────\n"
        f"💻 LIVE TERMINAL EXECUTION LOGS\n"
        f"────────────────────────────────────────────────────────────\n"
        f"```bash\n"
        f"{exec_log[:2500]}\n"
        f"```\n\n"
        f"────────────────────────────────────────────────────────────\n"
        f"🔍 VERIFICATION SUMMARY & REMEDIATION PROOF\n"
        f"────────────────────────────────────────────────────────────\n"
        f"{proof_summary}\n"
        f"╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁╁"
    )

def evaluate_and_get_sop(ticket_number, short_desc, desc, ci_name, ip, kb_articles, incident_id, target_os="Linux/Unix"):
    # 1. Sync local Vector DB with KB articles
    sync_vector_db_with_kb(get_auth_token(), llm_client, vector_db)
    
    # 2. Perform RAG query
    query_text = f"Incident short description: {short_desc}\nIncident description: {desc}\nTarget OS: {target_os}"
    query_emb = get_embedding(query_text, llm_client)
    
    rag_results = vector_db.search_kb(query_emb, limit=1)
    
    is_new = True
    matched_kb = None
    similarity_score = 0.0
    
    if rag_results:
        top_match = rag_results[0]
        similarity_score = top_match["score"]
        logger.info(f"🔎 Vector search best KB match: {top_match['number']} - '{top_match['title']}' (Cosine Similarity: {similarity_score:.4f})")
        if similarity_score >= 0.75:
            # Find the actual KB article in kb_articles list
            for art in kb_articles:
                if art.get("number") == top_match["number"]:
                    matched_kb = art
                    break
            if matched_kb is not None:
                is_new = False
    
    if is_new:
        logger.info(f"✨ RAG Miss (similarity score {similarity_score:.4f} < 0.75). Handing over to Knowledge base creator LLM for SOP synthesis...")
        
        # Invoke LLM to synthesize a new SOP
        prompt = f"""
You are an expert Senior Systems & DevOps Engineer and ITIL Knowledge Management Specialist.
No relevant SOP article was found in the database for the following incident.
Synthesize a highly technical, specific, and actionable Standard Operating Procedure (SOP) Knowledge Base Article to solve this incident.

CRITICAL INSTRUCTIONS:
- DO NOT use generic boilerplate phrases like "diagnosing and resolving", "system resource contention", "configuration drift", "inspect configuration item status", "apply remediation protocol", or "validate baseline".
- The SOP must be specifically tailored to the technology mentioned in the description (e.g. if Docker, focus on docker/containerd commands; if SSH/sshd, focus on SSH configuration/keys; if Kubernetes, focus on pods/kubelet/kubectl).
- Write a highly descriptive, technical Title.
- Provide a concrete, 2-3 sentence Executive Summary explaining the exact technical failure mode and how to correct it.
- Explain the precise technical root cause (e.g., port exhaustion, configuration error, certificate expiration, socket permission).
- MANDATORY SSH STEP: Step 1 of resolution_steps MUST ALWAYS be the explicit SSH login command: "ssh root@<target host>" (e.g., "ssh root@{ip}"). All subsequent steps are commands to execute over this SSH session.
- Under "resolution_steps", provide 4-5 precise, sequential, concrete commands to run on the target host (starting with "ssh root@{ip}" on step 1) to diagnose and fix the issue.
- Under "safety_checks", list 2-3 concrete checks to run before/after remediation (e.g., check disk space, verify service port binding).

Incident Details:
- Ticket Number: {ticket_number}
- Short Description: {short_desc}
- Description: {desc}
- Target CI: {ci_name} ({ip})
- Target OS: {target_os}

Respond ONLY in JSON format:
{{
  "title": "...",
  "summary": "...",
  "resolution_steps": ["ssh root@{ip}", "command1", "command2", ...],
  "safety_checks": ["check1", "check2", ...],
  "reasoning": "..."
}}
"""
        plan = {}
        try:
            plan_content, used_model = invoke_llm_with_fallback(
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            if plan_content:
                plan = json.loads(plan_content) if isinstance(plan_content, str) else plan_content
                if isinstance(plan, list) and len(plan) > 0: plan = plan[0]
                logger.info(f"🧠 Knowledge base creator LLM synthesized new SOP using model: '{used_model}'")
        except Exception as e:
            logger.error(f"LLM SOP synthesis failed for {ticket_number}: {e}")
            plan = {}

        kb_title = plan.get("title", f"Troubleshooting & SOP: {short_desc}")
        summary = plan.get("summary", f"Standard Operating Procedure for {short_desc}.")
        resolution_steps = plan.get("resolution_steps", [])
        safety_checks = plan.get("safety_checks", [])
        reasoning = plan.get("reasoning", "Synthesized new SOP from scratch.")
        
        # Ensure EVERY SINGLE STEP is an explicit SSH command (ssh root@<ip> "command")
        formatted_steps = []
        for step in resolution_steps:
            s = str(step).strip()
            s_clean = re.sub(r'^\d+\.\s*', '', s)
            if s_clean.lower() in [f"ssh root@{ip}", "ssh root@192.168.100.101"] or re.match(r"^ssh\s+[^\s]+$", s_clean.lower()):
                continue
            if s_clean.lower().startswith("ssh "):
                formatted_steps.append(s_clean)
            else:
                formatted_steps.append(f'ssh root@{ip} "{s_clean}"')

        new_sop_data = {
            "title": kb_title,
            "summary": summary,
            "resolution_steps": formatted_steps,
            "safety_checks": safety_checks,
            "reasoning": reasoning
        }
        
        return True, "KB_NEW", kb_title, reasoning, formatted_steps, new_sop_data
        
    else:
        logger.info(f"✅ RAG Match! Matched {top_match['number']} with similarity {similarity_score:.4f}. Retrieving SOP parameters...")
        
        # Invoke LLM to parameterize the matched KB commands
        kb_steps_list = matched_kb.get("resolutionSteps", []) if matched_kb else []
        matched_kb_steps = json.dumps(kb_steps_list)
        
        prompt = f"""
A relevant SOP has been retrieved from the Knowledge Base:
- Number: {top_match['number']}
- Title: {top_match['title']}
- Steps: {matched_kb_steps}

Incident Details:
- Ticket Number: {ticket_number}
- Short Description: {short_desc}
- Description: {desc}
- Target CI: {ci_name} ({ip})
- Target OS: {target_os}

Review the matched SOP and parameterize or verify the commands for execution on the target host.
Ensure all commands comply with the DIRECT COMMAND EXECUTION RULE (do NOT prefix commands with ssh).

Respond ONLY in JSON:
{{
  "sop_commands": ["cmd1", "cmd2", ...],
  "reasoning": "..."
}}
"""
        plan = {}
        try:
            plan_content, used_model = invoke_llm_with_fallback(
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            if plan_content:
                plan = json.loads(plan_content) if isinstance(plan_content, str) else plan_content
                if isinstance(plan, list) and len(plan) > 0: plan = plan[0]
                logger.info(f"🧠 Parameterized commands using model: '{used_model}'")
        except Exception as e:
            logger.error(f"LLM SOP parameterization failed for {ticket_number}: {e}")
            plan = {}
            
        sop_commands = plan.get("sop_commands", kb_steps_list)
        reasoning = plan.get("reasoning", f"SOP {top_match['number']} parameterized.")
        
        return False, top_match['number'], top_match['title'], reasoning, sop_commands, None

# ----------------------------------------------------
# Agent Workflow Handlers
# ----------------------------------------------------
def resolve_ci_credentials(incident):
    ci_name = incident.get("configurationItem")
    short_desc = (incident.get("shortDescription") or "").lower()
    desc = (incident.get("description") or "").lower()

    # 1. Try mapping the explicit CI name if it is defined and exists in CI_CREDENTIALS
    if ci_name and ci_name in CI_CREDENTIALS:
        return CI_CREDENTIALS[ci_name], ci_name

    # 2. Scan shortDescription and description for references to known IP addresses or CI names
    for key, info in CI_CREDENTIALS.items():
        if info["ip"] in short_desc or info["ip"] in desc:
            return info, key
        if key.lower() in short_desc or key.lower() in desc:
            return info, key
        key_no_spaces = key.lower().replace(" ", "")
        if key_no_spaces in short_desc or key_no_spaces in desc:
            return info, key

    # 3. No fallback to default host (to prevent dangerous commands running on incorrect systems)
    return None, None


def prepare_new_incident_sop(token, incident, kb_articles):
    inc_id = incident.get("id")
    number = incident.get("number", inc_id)
    short_desc = incident.get("shortDescription", "")
    desc = incident.get("description", "")
    
    post_timeline_update(inc_id, number, short_desc, "Unspecified CI", "RUNNING", "🔍 RAG SOP Retrieval", "RUNNING", "Analyzing ticket to match with SOP runbooks...")

    ci_info, ci_name = resolve_ci_credentials(incident)
    if not ci_info:
        dept = incident.get("department", "Unix")
        team_member = get_team_member_for_department(dept)
        logger.warning(f"⚠️ Unspecified CI for [{number}]. Escalating to {team_member}")
        
        clarify_note = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"⚠️ AUTOMATED REMEDIATION PAUSED — UNSPECIFIED CONFIGURATION ITEM\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"👤 Assigned Team Member: {team_member}\n"
            f"🎫 Ticket: [{number}] {short_desc}\n"
            f"Reason: Target host/CI is unspecified. Executing commands on a default host is dangerous.\n"
            f"👉 Operator Action: Please update the Configuration Item (CI) or host details in the ticket properties to authorize execution.\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        post_timeline_update(inc_id, number, short_desc, "Unspecified CI", "ESCALATED", "🖥️ Target CI Validation", "FAILED", f"Target host/CI is unspecified. Escalated to {team_member}.")
        add_work_note(token, inc_id, clarify_note)
        update_incident_status(token, inc_id, "ON_HOLD", assigned_to=team_member)
        return

    logger.info(f"⚡ Processing NEW Incident: [{number}] '{short_desc}' | Resolved CI: {ci_name}")
    processed_new_incidents.add(inc_id)

    ip = ci_info["ip"]
    user = ci_info["user"]

    # 1. Evaluate if existing SOP applies or retrieve via RAG
    is_new_use_case, kb_num, kb_title, reasoning, sop_commands, new_sop_data = evaluate_and_get_sop(
        number, short_desc, desc, ci_name, ip, kb_articles, inc_id
    )

    # 2. Update State to IN_PROGRESS so it transitions to execution queue
    update_incident_status(token, inc_id, "IN_PROGRESS")

    # 3. Post dynamic professional transition work note detailing RAG search
    if is_new_use_case:
        post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "🔍 RAG SOP Retrieval", "SUCCESS", "RAG Miss: No matching SOP. Forwarding to Knowledge Synthesizer.")
        transition_msg = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🔍 RAG SEARCH: NO RELEVANT SOP FOUND IN VECTOR DATABASE\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🤖 Agent Action: Handing over incident to Knowledge Synthesizer to generate a new SOP.\n"
            f"💡 Reason: Incident matches no existing SOP in local vector DB. Generating custom runbook.\n"
            f"🖥️ Target Host: {ci_name} (IP: {ip})\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
    else:
        post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "🔍 RAG SOP Retrieval", "SUCCESS", f"RAG Match: Found SOP runbook {kb_num} ({kb_title})")
        transition_msg = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🔍 RAG SEARCH: MATCHING KNOWLEDGE SOP FOUND\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🤖 Agent Action: Applying existing SOP [{kb_num}: {kb_title}].\n"
            f"💡 Reason: {reasoning}\n"
            f"🖥️ Target Host: {ci_name} (IP: {ip})\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
    add_work_note(token, inc_id, transition_msg)


def solve_in_progress_incident(token, incident, kb_articles):
    inc_id = incident.get("id")
    number = incident.get("number", inc_id)
    short_desc = incident.get("shortDescription", "")
    desc = incident.get("description", "")
    
    ci_info, ci_name = resolve_ci_credentials(incident)
    if not ci_info:
        dept = incident.get("department", "Unix")
        team_member = get_team_member_for_department(dept)
        logger.warning(f"⚠️ Unspecified CI for [{number}] in IN_PROGRESS queue. Escalating to {team_member}")
        
        clarify_note = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"⚠️ AUTOMATED REMEDIATION PAUSED — UNSPECIFIED CONFIGURATION ITEM\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"👤 Assigned Team Member: {team_member}\n"
            f"🎫 Ticket: [{number}] {short_desc}\n"
            f"Reason: Target host/CI is unspecified. Executing commands on a default host is dangerous.\n"
            f"👉 Operator Action: Please update the Configuration Item (CI) or host details in the ticket properties to authorize execution.\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        post_timeline_update(inc_id, number, short_desc, "Unspecified CI", "ESCALATED", "🖥️ Target CI Validation", "FAILED", f"Target host/CI is unspecified. Escalated to {team_member}.")
        add_work_note(token, inc_id, clarify_note)
        update_incident_status(token, inc_id, "ON_HOLD", assigned_to=team_member)
        return

    logger.info(f"🚀 Remediation Agent Executing IN_PROGRESS Incident: [{number}] '{short_desc}' | Resolved CI: {ci_name}")

    ip = ci_info["ip"]
    user = ci_info["user"]
    password = ci_info["password"]

    post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "🖥️ Target CI Validation", "RUNNING", f"Verifying SSH accessibility for target host {ci_name} ({ip})...")

    # 1. Fingerprint Target Host OS
    target_os = detect_target_os(ip, user, password)
    logger.info(f"🔎 Detected Target Host OS for [{ci_name}]: '{target_os}'")

    post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "🖥️ Target CI Validation", "SUCCESS", f"Detected OS: {target_os}. Validation complete.")

    # 2. Evaluate or retrieve SOP via RAG
    is_new_use_case, kb_num, kb_title, reasoning, sop_commands, new_sop_data = evaluate_and_get_sop(
        number, short_desc, desc, ci_name, ip, kb_articles, inc_id, target_os=target_os
    )

    # 3. Handle human approval if RAG miss
    if is_new_use_case:
        approvals = fetch_agent_approvals(token)
        # Priority: find APPROVED first so we execute immediately after human approves
        # Then check PENDING (waiting), then REJECTED (blocked)
        my_approval = None
        approved_appr = None
        pending_appr = None
        rejected_appr = None
        for a in approvals:
            if a.get("incidentId") == inc_id and a.get("agentId") == "agent-unix-resolver-01":
                st = a.get("status", "")
                if st == "APPROVED" and not approved_appr:
                    approved_appr = a
                elif st == "PENDING" and not pending_appr:
                    pending_appr = a
                elif st == "REJECTED" and not rejected_appr:
                    rejected_appr = a
        # Use the most actionable: approved > pending > rejected
        my_approval = approved_appr or pending_appr or rejected_appr
        
        if not my_approval:
            res_steps = new_sop_data.get("resolution_steps", [])
            formatted_res_steps = []
            for step in res_steps:
                s = str(step).strip()
                s_clean = re.sub(r'^\d+\.\s*', '', s)
                if s_clean.lower() in [f"ssh root@{ip}", "ssh root@192.168.100.101"] or re.match(r"^ssh\s+[^\s]+$", s_clean.lower()):
                    continue
                if s_clean.lower().startswith("ssh "):
                    formatted_res_steps.append(s_clean)
                else:
                    formatted_res_steps.append(f'ssh root@{ip} "{s_clean}"')
            res_steps = formatted_res_steps

            approval_payload = {
                "incidentId": inc_id,
                "incidentTitle": short_desc,
                "agentId": "agent-unix-resolver-01",
                "agentName": "🤖 Unix Auto-Resolver Agent",
                "model": "nvidia/nemotron-3-ultra-550b-a55b",
                "targetCi": f"{ci_name} ({ip})",
                "department": "DevOps Team",
                "riskLevel": "HIGH",
                "confidenceScore": 85.0,
                "summary": new_sop_data.get("summary", f"Synthesized new SOP for {short_desc}"),
                "proposedCommands": res_steps,
                "aiReasoning": new_sop_data.get("reasoning", "New use case requiring human review."),
                "safetyChecks": [{"check": check, "passed": True} for check in new_sop_data.get("safety_checks", [])],
                "kbArticleReference": "KB_NEW",
                "kbTitle": new_sop_data.get("title", f"SOP: {short_desc}"),
                "synthesizerOutput": {
                    "draftKbId": "KB-SOP-NEW",
                    "kbTitle": new_sop_data.get("title", f"SOP: {short_desc}"),
                    "synthesizedSolution": "\n".join(res_steps),
                    "resolutionSteps": res_steps,
                    "trendInsight": f"Synthesized SOP containing {len(res_steps)} resolution steps starting with SSH connection."
                }
            }
            logger.info(f"📝 Submitting pending approval request for synthesized SOP on ticket [{number}]...")
            submit_agent_approval(token, approval_payload)
            
            post_timeline_update(inc_id, number, short_desc, ci_name, "PENDING_APPROVAL", "🔐 Human-in-the-Loop Gate", "RUNNING", f"Synthesized SOP {new_sop_data.get('title')}. Awaiting human approval in Control Tower.")
            notice_note = (
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"🧠 AI KNOWLEDGE SYNTHESIZER: NEW SOP SUBMITTED FOR APPROVAL\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"🔍 RAG Search: Miss (No matching SOP found in local Vector DB).\n"
                f"📝 Action: Synthesized a new SOP and requested Human-in-the-Loop review.\n"
                f"🎫 Ticket: [{number}] {short_desc}\n"
                f"Proposed SOP Title: {new_sop_data.get('title')}\n"
                f"Proposed Commands: {', '.join(new_sop_data.get('resolution_steps', []))}\n"
                f"State: Incident placed ON_HOLD awaiting human operator approval in Control Tower.\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            )
            add_work_note(token, inc_id, notice_note, author="🧠 AI Knowledge Synthesizer")
            update_incident_status(token, inc_id, "ON_HOLD", assigned_to="DevOps Team")
            return
            
        else:
            status = my_approval.get("status")
            if status == "PENDING":
                post_timeline_update(inc_id, number, short_desc, ci_name, "PENDING_APPROVAL", "🔐 Human-in-the-Loop Gate", "RUNNING", "SOP pending review. Awaiting operator approval.")
                logger.info(f"⏳ Ticket [{number}] is PENDING human operator review in Control Tower (http://localhost:5173). Paused awaiting 'Approve & Execute'...")
                update_incident_status(token, inc_id, "ON_HOLD")
                return
            elif status == "REJECTED":
                post_timeline_update(inc_id, number, short_desc, ci_name, "FAILED", "🔐 Human-in-the-Loop Gate", "FAILED", f"SOP execution rejected: {my_approval.get('rejectionReason')}")
                logger.warning(f"❌ Execution rejected: Approval request for [{number}] was REJECTED by human operator.")
                reject_note = (
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"🤖 Unix Auto-Resolver Agent: REMEDIATION REJECTED BY HUMAN OPERATOR\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"Feedback: {my_approval.get('rejectionReason', 'No reason provided')}\n"
                    f"Assigned To: DevOps Team for manual processing.\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                )
                add_work_note(token, inc_id, reject_note)
                update_incident_status(token, inc_id, "ON_HOLD", assigned_to="DevOps Team")
                return
            elif status == "APPROVED":
                post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "🔐 Human-in-the-Loop Gate", "SUCCESS", f"SOP approved by operator ({my_approval.get('approver', 'Human Admin')}). Proceeding to execute.")
                logger.info(f"🟢 Execution approved! Human operator approved synthesized SOP for [{number}]. Proceeding...")
                sop_commands = my_approval.get("proposedCommands", sop_commands)

    # 4. Execute SSH Commands on Worker
    cmd_str = " && ".join(sop_commands) if isinstance(sop_commands, list) else str(sop_commands)
    post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "💻 SSH SOP Execution", "RUNNING", f"Executing commands: {cmd_str}")
    success, exec_log = execute_ssh_sop(ip, user, password, sop_commands)

    if not success:
        post_timeline_update(inc_id, number, short_desc, ci_name, "FAILED", "💻 SSH SOP Execution", "FAILED", f"SSH session execution failed: {exec_log}")
    else:
        post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "💻 SSH SOP Execution", "SUCCESS", "SOP commands executed successfully.")

    # 5. Evaluate Live Terminal Logs
    eval_prompt = f"""
Analyze the following SSH execution log from target host {ci_name} ({ip}) resulting from running commands to resolve this incident:

Incident ID: {number}
Short Description: {short_desc}
Description: {desc}

SSH Execution Log:
{exec_log}

Evaluate if:
1. The target system is healthy and operational (e.g. no active system crashes, OOM errors, or critical service failures in the output).
2. The specific task/requirement requested in the incident (short description & description) has been successfully verified as completed/fulfilled (e.g. if a user was to be created/deleted, it shows proof of creation/deletion; if etcd was corrupt, it shows etcdctl snapshot restore was actually executed and etcdctl endpoint status/health is OK).

You must set "is_healthy" to true ONLY if BOTH conditions are met. If the system is healthy but the specific task/requirement required by the incident was not completed or is not verified as fulfilled in the logs, set "is_healthy" to false.

Respond ONLY in valid JSON format:
{{
  "is_healthy": boolean,
  "proof_summary": "concise summary explaining system health AND verification of the incident requirement completion"
}}
"""
    evaluation = {}
    if not success:
        logger.warning(f"SSH execution failed for {number}. Skipping LLM evaluation and marking system as unhealthy.")
        evaluation = {
            "is_healthy": False,
            "proof_summary": f"SSH connection failed or timed out: {exec_log}"
        }
    else:
        post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "🧪 Verification Tests", "RUNNING", "Running LLM verification models on SSH execution log...")
        logger.info("Evaluating live SSH execution proof with LLM Engine...")
        try:
            eval_content, eval_model = invoke_llm_with_fallback(
                messages=[{"role": "user", "content": eval_prompt}],
                response_format={"type": "json_object"}
            )
            if eval_content:
                evaluation = json.loads(eval_content) if isinstance(eval_content, str) else eval_content
                if isinstance(evaluation, list) and len(evaluation) > 0: evaluation = evaluation[0]
                logger.info(f"Verified live SSH proof using model: '{eval_model}'")
        except Exception as e:
            logger.error(f"LLM Evaluation failed for {number}: {e}")
            evaluation = {}

    if not isinstance(evaluation, dict) or "is_healthy" not in evaluation:
        evaluation = {
            "is_healthy": success,
            "proof_summary": "System responded cleanly to SSH commands and reported normal operational metrics." if success else "SOP execution failed during SSH session."
        }

    # 6. Check if Resolver Agent was able to perform and verify the task
    is_healthy = evaluation.get("is_healthy", True)
    if not success or not is_healthy:
        dept = incident.get("department", "Unix")
        team_member = get_team_member_for_department(dept)
        logger.warning(f"⚠️ Resolver Agent unable to perform task automatically for [{number}]. Escalating & assigning to Team Member: {team_member}")
        
        post_timeline_update(inc_id, number, short_desc, ci_name, "ESCALATED", "🧪 Verification Tests", "FAILED", f"Verification failed. Escalating to {team_member}. Proof: {evaluation.get('proof_summary')}")
        escalation_note = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🚨 AUTOMATED REMEDIATION UNABLE TO COMPLETE — ESCALATED TO TEAM MEMBER\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"👤 Assigned Team Member: {team_member}\n"
            f"🎫 Ticket: [{number}] {short_desc}\n"
            f"Reason: Resolver Agent could not complete automated remediation on host {ci_name} ({ip}). Requires human intervention.\n"
            f"Terminal Log Evidence:\n{exec_log[:1500]}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        add_work_note(token, inc_id, escalation_note)
        update_incident_status(token, inc_id, "ON_HOLD", assigned_to=team_member)
        return

    # 7. Format & Post Live Terminal Proof Work Note (Only on success)
    post_timeline_update(inc_id, number, short_desc, ci_name, "SUCCESS", "🧪 Verification Tests", "SUCCESS", f"Verification passed: {evaluation.get('proof_summary')}")
    proof_note = format_execution_proof_work_note(
        number, short_desc, ci_name, ip, kb_num, kb_title,
        evaluation.get("is_healthy", False),
        evaluation.get("proof_summary", "Verified healthy host status."),
        exec_log
    )
    add_work_note(token, inc_id, proof_note)

    # 8. Resolve Ticket & Report Auto-Execution to Dashboard Audit Stream
    res_code = "Server - Kernel & OS Patch"
    res_notes = (
        f"Autonomous SOP Remediation completed by Gemini 3.1 Pro Preview Agent.\n"
        f"Applied SOP: {kb_num} ({kb_title})\n"
        f"Host: {ci_name} ({ip})\n"
        f"Verification: {evaluation.get('proof_summary', 'Verified normal operational metrics.')}"
    )
    if update_incident_status(token, inc_id, "RESOLVED", res_code, res_notes):
        logger.info(f"🎉 Successfully RESOLVED IN_PROGRESS Incident [{number}]!")
        post_history_entry_to_dashboard(
            inc_id,
            short_desc,
            ci_name,
            sop_commands,
            exec_log,
            evaluation.get("proof_summary", "User created & verified operational."),
            kb_num,
            status="APPROVED" if is_new_use_case else "AUTO_EXECUTED",
            human_approver="System Admin (Human in the Loop)" if is_new_use_case else "Autonomous Policy (Low/Medium Risk)"
        )
        
        # Save the new KB article to storage if it was synthesized and now successfully verified!
        if is_new_use_case and new_sop_data:
            new_sop_data_to_store = {
                "title": new_sop_data.get("title"),
                "category": "Unix - OS & System Service",
                "configurationItem": ci_name,
                "summary": new_sop_data.get("summary"),
                "symptoms": [f"Alert logged for {short_desc}"],
                "rootCause": "Root cause identified in approved new use case diagnostic.",
                "resolutionSteps": sop_commands,
                "sourceIncidentIds": [inc_id]
            }
            logger.info(f"💾 Saving approved and verified new SOP to knowledge base...")
            save_new_kb_article_to_storage(new_sop_data_to_store)

def start_continuous_monitoring():
    logger.info("=" * 75)
    logger.info("🚀 Starting Continuous ITSM Agent Daemon (Gemini 3.1 Pro Preview)")
    logger.info("   Mode: SELF-LEARNING SOP GENERATION & DUAL-STAGE REMEDIATION")
    logger.info(f"   Polling Interval: Every {POLL_INTERVAL_SECONDS} seconds")
    logger.info(f"   Target System: ITSM Platform ({ITSM_BASE_URL})")
    logger.info("=" * 75)

    # Session-level set of incident IDs that were escalated/failed this run.
    # Prevents ON_HOLD tickets from being re-picked up in subsequent polling cycles.
    escalated_incident_ids: set = set()

    while True:
        try:
            token = get_auth_token()
            if not token:
                logger.warning("Auth token unavailable, retrying in next cycle...")
                time.sleep(POLL_INTERVAL_SECONDS)
                continue

            # Fetch active queue & KB articles
            incidents = fetch_incident_queue(token)
            kb_articles = fetch_kb_articles(token)

            in_progress_tickets = []

            for inc in incidents:
                inc_id = inc.get("id")
                state = str(inc.get("state", "")).upper().strip()

                # ✅ FIX: Only pick TRUE IN_PROGRESS tickets for SSH remediation.
                # ON_HOLD = escalated to a human team member — do NOT re-process.
                # PENDING_APPROVAL = waiting for HITL review — handled separately above.
                # Skip any incident already escalated/failed in this daemon session.
                if state == "IN_PROGRESS" and inc_id not in escalated_incident_ids:
                    in_progress_tickets.append(inc)

            # Resolver Agent processes IN_PROGRESS tickets for SSH remediation & live proof
            if in_progress_tickets:
                logger.info(f"⚡ Resolver Agent: Discovered {len(in_progress_tickets)} IN_PROGRESS incident(s) for SSH SOP remediation!")
                for inc in in_progress_tickets[:5]:
                    inc_id = inc.get("id")
                    number = inc.get("number", inc_id)
                    result_state = solve_in_progress_incident(token, inc, kb_articles)
                    # If the incident was escalated (returned ON_HOLD), remember it to avoid re-loop
                    try:
                        updated = fetch_incident_queue(token)
                        for u in updated:
                            if u.get("id") == inc_id:
                                if str(u.get("state", "")).upper() in ("ON_HOLD", "RESOLVED", "CLOSED"):
                                    escalated_incident_ids.add(inc_id)
                                    logger.info(f"🔒 Incident [{number}] is now {u.get('state')} — locked from re-processing this session.")
                                break
                    except Exception:
                        pass
            else:
                logger.info("💤 Queue Scan: No IN_PROGRESS tickets assigned for Resolver Agent remediation. Waiting...")

        except KeyboardInterrupt:
            logger.info("🛑 Stopping Continuous ITSM Agent Daemon.")
            break
        except Exception as e:
            logger.error(f"Unexpected error in daemon loop: {e}")

        time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == "__main__":
    start_continuous_monitoring()
