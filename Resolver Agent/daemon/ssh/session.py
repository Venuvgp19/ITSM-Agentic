import time
import paramiko
from ..config import logger
from .sanitization import strip_ssh_wrapper

class PersistentSSHSession:
    """
    Holds a single, persistent SSH connection for the entire duration of a ReAct Loop or SOP execution.
    Eliminates SSH reconnect overhead across multiple ReAct turns.
    """
    def __init__(self, ip, user, password, timeout=10):
        self.ip = ip
        self.user = user
        self.password = password
        self.timeout = timeout
        self.ssh = None

    def get_connection(self):
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
                        raise Exception(f"SERVER_UNREACHABLE: SSH connection to host {self.ip} ({self.user}) failed or timed out after {retries} retries.")
            self.ssh = client
            logger.info(f"✅ [SSH SESSION HELD] Persistent SSH connection active for {self.ip}")
        return self.ssh

    def exec_command(self, cmd_raw):
        cmd_to_run = strip_ssh_wrapper(cmd_raw, self.ip)
        if not cmd_to_run:
            logger.info(f"🔑 Executing SSH connection handshake step: '{cmd_raw}'")
            return True, f"=== [CMD: {cmd_raw}] ===\nSTDOUT:\nConnected to {self.ip} as {self.user} via persistent SSH session.\nSTDERR:\n\n"

        try:
            ssh = self.get_connection()
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
    session = PersistentSSHSession(ip, user, password)
    execution_log = ""
    is_success = True
    try:
        for cmd in commands:
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
