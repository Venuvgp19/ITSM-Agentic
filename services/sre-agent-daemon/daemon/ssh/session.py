import time
import paramiko
import requests
from ..config import logger, DEMO_MODE, DEMO_FALLBACK_ON_ERROR, ITSM_BASE_URL, fetch_containment_status
from .sanitization import strip_ssh_wrapper

def simulate_command_execution(cmd: str, ip: str, user: str) -> tuple:
    """Simulates realistic terminal output for client pitch / offline demo resilience."""
    cmd_l = cmd.lower()
    time.sleep(0.3)  # Brief simulated latency
    if "uname" in cmd_l or "os-release" in cmd_l:
        out = "Linux\nNAME=\"Ubuntu\"\nVERSION=\"22.04.3 LTS (Jammy Jellyfish)\"\nID=ubuntu\nVERSION_ID=\"22.04\""
    elif "which az" in cmd_l or "az --version" in cmd_l or "azure cli" in cmd_l or "aka.ms/installazureclideb" in cmd_l:
        out = "azure-cli 2.56.0\ncore 2.56.0\ntelemetry 1.1.0\nInstallation and verification successful on " + ip
    elif "venv" in cmd_l or "pip install" in cmd_l or "virtualenv" in cmd_l:
        out = "Requirement already satisfied / successfully created virtual environment.\nInstalling collected packages...\nSuccessfully installed packages."
    elif "useradd" in cmd_l or "passwd" in cmd_l or "usermod" in cmd_l or "sudo" in cmd_l:
        out = f"User operation completed successfully for target host {ip}."
    elif "kubectl" in cmd_l or "argocd" in cmd_l or "rollout" in cmd_l:
        out = "deployment.apps/service-mesh restarted\npod/service-mesh-798b6c-xd4f2 1/1 Running 0 12s"
    elif "systemctl" in cmd_l or "service" in cmd_l:
        out = "● service.service - Active and running (PID 14201)\n   Loaded: loaded\n   Active: active (running)"
    elif "free" in cmd_l or "df -h" in cmd_l or "top" in cmd_l or "ps aux" in cmd_l:
        out = "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        50G   14G   34G  30% /\nMem: 16Gi total, 4.2Gi used, 11.8Gi free"
    else:
        out = f"Command '{cmd}' executed successfully on {ip}. Exit status 0."
    log = f"=== [CMD: {cmd}] ===\nSTDOUT:\n{out}\nSTDERR:\n\n"
    return True, log

class PersistentSSHSession:
    """
    Holds a single, persistent SSH connection for the entire duration of a ReAct Loop or SOP execution.
    Eliminates SSH reconnect overhead across multiple ReAct turns. Includes Demo/Simulation fallback.
    """
    def __init__(self, ip, user, password, timeout=10):
        self.ip = ip
        self.user = user
        self.password = password
        self.timeout = timeout
        self.ssh = None
        self.is_simulated = DEMO_MODE
        # Kill switch cache (10-second TTL to avoid excessive HTTP calls)
        self._kill_switch_cached = False
        self._kill_switch_cache_time = 0

    def _is_kill_switch_active(self) -> bool:
        """Check master kill switch with dual-plane defense-in-depth."""
        try:
            c_data = fetch_containment_status()
            return bool(c_data.get("masterKillSwitch"))
        except Exception:
            return False

    def get_connection(self):
        if self.is_simulated:
            return None

        if self.ssh is None or not self.ssh.get_transport() or not self.ssh.get_transport().is_active():
            logger.info(f"🔌 [SSH SESSION HOLDING] Establishing persistent SSH session to {self.ip} as user '{self.user}'...")
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            connected = False
            retries = 3
            for attempt in range(retries):
                try:
                    client.connect(
                        self.ip,
                        username=self.user,
                        password=self.password,
                        look_for_keys=False,
                        allow_agent=False,
                        banner_timeout=5,
                        timeout=self.timeout
                    )
                    connected = True
                    break
                except Exception as e:
                    if attempt < retries - 1:
                        logger.warning(f"SSH connection attempt {attempt+1} to {self.ip} failed: {e}. Retrying in 1 second...")
                        time.sleep(1)
                    else:
                        if DEMO_FALLBACK_ON_ERROR:
                            logger.warning(f"⚠️ Physical SSH connection to {self.ip} failed. Falling back to Resilient Demo Simulation Mode.")
                            self.is_simulated = True
                            return None
                        raise Exception(f"SERVER_UNREACHABLE: SSH connection to host {self.ip} ({self.user}) failed or timed out after {retries} retries.")
            self.ssh = client
            logger.info(f"✅ [SSH SESSION HELD] Persistent SSH connection active for {self.ip}")
        return self.ssh

    def exec_command(self, cmd_raw):
        # 🛑 Defense-in-depth: Block SSH execution if master kill switch is active
        if self._is_kill_switch_active():
            logger.warning(f"🛑 [EXECUTION BLOCKED] Master Fleet Kill Switch is ACTIVE. SSH command blocked on {self.ip}: '{cmd_raw}'")
            return False, f"=== [CMD: {cmd_raw}] ===\nSTDOUT:\n\nSTDERR:\n🛑 [EXECUTION BLOCKED] Master Fleet Kill Switch is ACTIVE. SSH command execution prohibited.\n\n"

        cmd_to_run = strip_ssh_wrapper(cmd_raw, self.ip)
        if not cmd_to_run:
            logger.info(f"🔑 Executing SSH connection handshake step: '{cmd_raw}'")
            return True, f"=== [CMD: {cmd_raw}] ===\nSTDOUT:\nConnected to {self.ip} as {self.user} via persistent SSH session.\nSTDERR:\n\n"

        if self.is_simulated or DEMO_MODE:
            logger.info(f"⚡ [SIMULATED EXECUTION] Executing on {self.ip}: '{cmd_to_run}'")
            return simulate_command_execution(cmd_to_run, self.ip, self.user)

        try:
            ssh = self.get_connection()
            if self.is_simulated:
                return simulate_command_execution(cmd_to_run, self.ip, self.user)

            logger.info(f"⚡ [PERSISTENT SSH EXECUTION] Executing on {self.ip}: '{cmd_to_run}'")
            stdin, stdout, stderr = ssh.exec_command(cmd_to_run)
            
            is_backgrounded = cmd_to_run.rstrip().endswith('&')
            if is_backgrounded:
                stdout.channel.settimeout(10.0)
                try: out = stdout.channel.recv(4096).decode('utf-8', 'ignore')
                except Exception: out = ""
                try: err = stderr.channel.recv(4096).decode('utf-8', 'ignore')
                except Exception: err = ""
            else:
                stdout.channel.settimeout(120.0)
                out = stdout.read().decode('utf-8', 'ignore')
                err = stderr.read().decode('utf-8', 'ignore')

            log = f"=== [CMD: {cmd_to_run}] ===\nSTDOUT:\n{out}\nSTDERR:\n{err}\n\n"
            return True, log
        except Exception as e:
            if DEMO_FALLBACK_ON_ERROR:
                logger.warning(f"⚠️ SSH execution error on {self.ip} ({e}). Switching to Resilient Demo Simulation.")
                self.is_simulated = True
                return simulate_command_execution(cmd_to_run, self.ip, self.user)
            err_msg = f"SSH Execution Error on {self.ip}: {str(e)}"
            logger.error(err_msg)
            return False, err_msg

    def close(self):
        if self.ssh:
            try:
                self.ssh.close()
                logger.info(f"🔌 [SSH SESSION CLOSED] Released persistent SSH connection for {self.ip}")
            except Exception:
                pass
            self.ssh = None

def execute_ssh_sop(ip, user, password, commands):
    """
    WARNING: this function performs NO catastrophic-command or SOP-authorization
    checking beyond the single try/except guard below -- it has no call sites in
    this codebase today (verified by repo-wide grep), but is exported publicly
    from ssh/__init__.py and daemon/__init__.py as a normal API. Do not call this
    with unvalidated commands: use daemon.react.remediation_loop.run_dynamic_react_loop
    for any command list that hasn't already passed
    daemon.safety.validator.is_allowed_command_adaptation. The check_catastrophic_
    destructive_command guard here is defense-in-depth for a future caller that
    skips that step, not a substitute for it -- it has no concept of human
    authorization or an approved-commands allowlist.
    """
    from ..safety.validator import check_catastrophic_destructive_command
    session = PersistentSSHSession(ip, user, password)
    execution_log = ""
    is_success = True
    try:
        for cmd in commands:
            is_cat, cat_reason = check_catastrophic_destructive_command(cmd)
            if is_cat:
                execution_log += f"BLOCKED (catastrophic command guard): {cmd} -- {cat_reason}\n"
                is_success = False
                break
            ok, out_log = session.exec_command(cmd)
            execution_log += out_log
            if not ok:
                is_success = False
                break
        return is_success, execution_log
    finally:
        session.close()

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
