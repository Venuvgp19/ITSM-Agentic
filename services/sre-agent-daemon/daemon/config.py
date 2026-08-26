import os
import sys
import logging
import threading
from collections import defaultdict
import urllib3
import httpx
from openai import OpenAI
from .session_state import SessionStateManager, default_session_state

# Configure UTF-8 encoding for stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Disable Insecure Request Warnings
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
# Singleton Guard: Prevent Multiple Daemon Instances
# ----------------------------------------------------
LOCK_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "daemon.lock")

def acquire_lock():
    """
    Guarantees strict singleton execution.
    If another daemon process or duplicate python session is running:
    1. Terminates/kills the older running daemon process.
    2. Scans for any duplicate daemon processes and shuts them down.
    3. Secures the lock file with the new current PID.
    """
    current_pid = os.getpid()
    
    # 1. Check PID recorded in daemon.lock
    if os.path.exists(LOCK_FILE):
        try:
            with open(LOCK_FILE, "r") as f:
                content = f.read().strip()
                if content.isdigit():
                    old_pid = int(content)
                    if old_pid != current_pid:
                        try:
                            import psutil
                            if psutil.pid_exists(old_pid):
                                p = psutil.Process(old_pid)
                                logger.warning(f"🛑 Terminating previous daemon process (PID {old_pid}) to prevent duplicate sessions...")
                                p.terminate()
                                try:
                                    p.wait(timeout=2)
                                except Exception:
                                    p.kill()
                                logger.info(f"✅ Previous daemon process (PID {old_pid}) stopped successfully.")
                        except Exception as kill_err:
                            logger.warning(f"Note on stopping previous PID {old_pid}: {kill_err}")
        except Exception as lock_err:
            logger.warning(f"Note checking existing lock file: {lock_err}")

    # 2. Fast scan: terminate any other continuous_itsm_agent_daemon.py instance
    try:
        import psutil
        parent_pid = os.getppid() if hasattr(os, 'getppid') else None
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                p_pid = proc.info['pid']
                p_name = (proc.info.get('name') or '').lower()
                if p_pid == current_pid or p_pid == parent_pid:
                    continue
                if 'python' in p_name:
                    try:
                        cmdline = proc.cmdline()
                        cmd_str = " ".join(cmdline).lower()
                        if "continuous_itsm_agent_daemon.py" in cmd_str:
                            logger.warning(f"🛑 Found duplicate agent session (PID {p_pid}). Terminating duplicate...")
                            proc.terminate()
                            try:
                                proc.wait(timeout=2)
                            except Exception:
                                proc.kill()
                            logger.info(f"✅ Duplicate agent session (PID {p_pid}) stopped.")
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception as scan_err:
        logger.debug(f"Process scan note: {scan_err}")

    # 3. Secure lock file with current PID
    try:
        with open(LOCK_FILE, "w") as f:
            f.write(str(current_pid))
        logger.info(f"🔐 Singleton daemon lock acquired (PID {current_pid}).")
    except Exception as write_err:
        logger.error(f"Failed to write singleton lock file: {write_err}")

def release_lock():
    """Remove lock file on clean exit."""
    try:
        if os.path.exists(LOCK_FILE):
            with open(LOCK_FILE, "r") as f:
                content = f.read().strip()
            if content.isdigit() and int(content) == os.getpid():
                os.remove(LOCK_FILE)
                logger.info("🔓 Daemon lock released cleanly.")
    except Exception:
        pass

# ----------------------------------------------------
# Backward-Compatible State Aliases
# ----------------------------------------------------
host_execution_locks = default_session_state.host_execution_locks
incident_execution_lock = threading.Lock()
active_processing_incidents = default_session_state.active_processing_incidents
processed_new_incidents = default_session_state.processed_new_incidents
processed_in_progress_incidents = default_session_state.processed_in_progress_incidents
submitted_approval_incidents = default_session_state.submitted_approval_incidents
locked_incident_sessions = default_session_state.locked_incident_sessions
resolved_incident_sessions = default_session_state.resolved_incident_sessions
TOKEN_USAGE_SESSION = default_session_state.token_usage_dict

# ----------------------------------------------------
# Configuration
# ----------------------------------------------------
ITSM_PROVIDER = os.getenv("ITSM_PROVIDER", "LOCAL_NESTJS").upper()  # LOCAL_NESTJS or SERVICENOW
ITSM_BASE_URL = os.getenv("ITSM_BASE_URL", "http://localhost:4000/api/v1")
GOVERNANCE_BASE_URL = os.getenv("GOVERNANCE_BASE_URL", "http://localhost:5173/api/v1/agent")
# Empty-string defaults (not a fake placeholder instance/credentials) so
# ServiceNowClient._is_configured() fails closed when ITSM_PROVIDER=SERVICENOW is
# selected without real SN_* values set, instead of silently attempting real HTTP
# calls against a nonexistent host. These three are required env vars for
# SERVICENOW mode -- verified as the only consumer of these three constants.
SN_INSTANCE_URL = os.getenv("SN_INSTANCE_URL", "")
SN_USERNAME = os.getenv("SN_USERNAME", "")
SN_PASSWORD = os.getenv("SN_PASSWORD", "")
GENAI_LAB_URL = os.getenv("GENAI_LAB_URL", "https://genailab.tcs.in/v1")
GENAI_API_KEY = os.getenv("GENAI_API_KEY", "sk-0mLmGnF9P0tbG_jlZVYDoA")
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "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")
NVIDIA_BASE_URL = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
DEMO_MODE = os.getenv("ITSM_DEMO_MODE", "false").lower() in ("true", "1", "yes")
DEMO_FALLBACK_ON_ERROR = os.getenv("ITSM_DEMO_FALLBACK", "true").lower() in ("true", "1", "yes")

# Specialized Agent Model Mapping
ROUTER_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"
RESOLVER_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"
SYNTHESIZER_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"
GOVERNANCE_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"

RAG_SIMILARITY_THRESHOLD = 0.42

# --- RAG Scoring Configuration ---
HYBRID_DENSE_WEIGHT    = 0.75   # weight of cosine similarity in hybrid blend
HYBRID_KW_WEIGHT       = 0.25   # weight of keyword-frequency score in hybrid blend

# Intent Booster — score override for high-confidence domain+intent matches.
INTENT_BOOST_SCORE     = 0.8800  # score assigned when intent booster fires (must be >= threshold)
INTENT_BOOST_MIN_SCORE = 0.25    # minimum pre-boost cosine score for booster to activate

# --- K8s Domain Detection (single source of truth) ---
K8S_DOMAIN_KEYWORDS = [
    "kubernetes", "k8s", "kubectl", "argocd",
    "pod", "kubelet", "deployment", "namespace",
    "container", "crictl", "containerd", "kube-apiserver",
    "kube-controller", "kube-scheduler", "etcd", "nodeport",
]

# DEPRECATED: superseded by daemon/safety/rule_registry.json's
# cross_domain_guards.k8s.blocked_capabilities + capability_inference, consumed
# via daemon/safety/kb_capabilities.py::is_blocked_for_domain(). Kept only as
# the legacy_kb_number_fallback source of truth for that registry entry -- do
# not read this list directly in new code, and do not add numbers to it.
LINUX_USER_SOP_NUMBERS = [
    "KB0000038", "KB0000022", "KB0000023",  # Linux user deletion/deprovisioning
    "KB0000028", "KB0000027", "KB0000021",  # Linux user creation
    "KB0000036", "KB0000037",               # restricted-sudo / standard creation
    "KB0000015", "KB0000017", "KB0000018",  # lock/unlock, password reset, modify user
]

# Whether newly-synthesized SOPs (RAG miss, brand-new SOP drafted from a live
# diagnostic probe) also pass through daemon/safety/rules.py's business-rule
# enforcement, same as RAG-matched SOPs already do. Defaults on; set
# ENFORCE_SOP_RULES_ON_NEW_SOP=false to disable if this surfaces unexpected
# step removal on synthesized SOPs during rollout.
ENFORCE_SOP_RULES_ON_NEW_SOP = os.getenv("ENFORCE_SOP_RULES_ON_NEW_SOP", "true").lower() in ("true", "1", "yes")

MODEL_NAME = ROUTER_MODEL
POLL_INTERVAL_SECONDS = 15
FALLBACK_MODELS = [
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "meta/llama-3.3-70b-instruct",
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "mistralai/mistral-7b-instruct-v0.3",
    "deepseek-ai/deepseek-r1"
]

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
    "worker2OL": {
        "ip": "192.168.56.11",
        "user": "root",
        "password": "root123",
        "os": "Unix / Linux"
    },
    "Worker 2": {
        "ip": "192.168.56.11",
        "user": "root",
        "password": "root123",
        "os": "Unix / Linux"
    },
    "192.168.56.11": {
        "ip": "192.168.56.11",
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
    },
    "WorkerNode1HL": {
        "ip": "192.168.100.102",
        "user": "root",
        "password": "root123",
        "os": "Unix / Linux"
    },
    "Worker Node 1 HL": {
        "ip": "192.168.100.102",
        "user": "root",
        "password": "root123",
        "os": "Unix / Linux"
    },
    "workernode1hl": {
        "ip": "192.168.100.102",
        "user": "root",
        "password": "root123",
        "os": "Unix / Linux"
    },
    "192.168.100.102": {
        "ip": "192.168.100.102",
        "user": "root",
        "password": "root123",
        "os": "Unix / Linux"
    },
    "Venuvgp19": {
        "ip": "192.168.100.99",
        "user": "Administrator",
        "password": "admin123",
        "os": "Windows 11"
    },
    "192.168.100.99": {
        "ip": "192.168.100.99",
        "user": "Administrator",
        "password": "admin123",
        "os": "Windows 11"
    },
    "192.168.100.42": {
        "ip": "192.168.100.42",
        "user": "Administrator",
        "password": "admin123",
        "os": "Windows 11"
    }
}

# Custom HTTP Client with SSL disabled for enterprise proxy
custom_httpx_client = httpx.Client(verify=False, timeout=httpx.Timeout(120.0, connect=15.0))

# Initialize OpenAI Client pointing to Gen AI Lab
llm_client = OpenAI(
    api_key=GENAI_API_KEY,
    base_url=GENAI_LAB_URL,
    http_client=custom_httpx_client
)
