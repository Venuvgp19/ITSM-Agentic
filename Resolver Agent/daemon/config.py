import os
import sys
import logging
import threading
from collections import defaultdict
import urllib3
import httpx
from openai import OpenAI

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
    """Write current PID to lock file. Exit if another instance is running."""
    if os.path.exists(LOCK_FILE):
        try:
            with open(LOCK_FILE, "r") as f:
                old_pid = int(f.read().strip())
            # Check if that PID is still alive
            import psutil
            if psutil.pid_exists(old_pid):
                logger.error(f"❌ Another daemon instance is already running (PID {old_pid}). Exiting to prevent duplicate execution.")
                sys.exit(1)
            else:
                logger.warning(f"⚠️ Stale lock file found (PID {old_pid} no longer running). Overwriting lock.")
        except Exception:
            logger.warning("⚠️ Could not read lock file. Overwriting.")
    with open(LOCK_FILE, "w") as f:
        f.write(str(os.getpid()))
    logger.info(f"🔐 Daemon lock acquired (PID {os.getpid()}).")

def release_lock():
    """Remove lock file on clean exit."""
    try:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)
            logger.info("🔓 Daemon lock released.")
    except Exception:
        pass

# ----------------------------------------------------
# Thread Safety & Strict Concurrency Locks
# ----------------------------------------------------
host_execution_locks = defaultdict(threading.Lock)
incident_execution_lock = threading.Lock()
active_processing_incidents = set()

# ----------------------------------------------------
# Configuration
# ----------------------------------------------------
ITSM_BASE_URL = "http://localhost:4000/api/v1"
GENAI_LAB_URL = "https://genailab.tcs.in/v1"
GENAI_API_KEY = "sk-0mLmGnF9P0tbG_jlZVYDoA"
NVIDIA_API_KEY = "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"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

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

# Linux user-management SOPs. These must NEVER be served to a K8s-domain ticket.
LINUX_USER_SOP_NUMBERS = [
    "KB0000038", "KB0000022", "KB0000023",  # Linux user deletion/deprovisioning
    "KB0000028", "KB0000027", "KB0000021",  # Linux user creation
    "KB0000036", "KB0000037",               # restricted-sudo / standard creation
    "KB0000015", "KB0000017", "KB0000018",  # lock/unlock, password reset, modify user
]

MODEL_NAME = ROUTER_MODEL
POLL_INTERVAL_SECONDS = 15
FALLBACK_MODELS = [
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "meta/llama-3.3-70b-instruct",
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "mistralai/mistral-7b-instruct-v0.3",
    "deepseek-ai/deepseek-r1"
]

# Session-wide token usage accumulator
TOKEN_USAGE_SESSION = {
    "calls": [],           # list of per-call dicts
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0,
}

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

# Sets to prevent duplicate processing loop and guarantee SINGLE action per incident
processed_new_incidents = set()
processed_in_progress_incidents = set()
submitted_approval_incidents = set()
locked_incident_sessions = set()
resolved_incident_sessions = set()
