import json
import re
from ..config import logger
from ..llm import invoke_llm_with_fallback as default_invoke_llm
from ..ssh.session import PersistentSSHSession

def run_read_only_diagnostic_react_loop(
    ip, user, password, short_desc, desc, number, ci_name,
    target_os="Linux/Unix",
    ssh_session_factory=None,
    llm_invoker=None
):
    logger.info(f"🔎 Starting Read-Only Diagnostic ReAct Loop for {number} on host {ip} ({ci_name})")
    invoker = llm_invoker or default_invoke_llm
    session_factory = ssh_session_factory or (lambda _ip, _u, _p: PersistentSSHSession(_ip, _u, _p))

    tools = [
        {
            "type": "function",
            "function": {
                "name": "execute_ssh_command",
                "description": "Executes a single READ-ONLY SSH diagnostic command on the target host (kubectl, systemctl status, journalctl, ss, ps, grep, cat, ls, id, getent) and returns stdout/stderr.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "The exact read-only shell command to execute."
                        }
                    },
                    "required": ["command"]
                }
            }
        }
    ]

    messages = [
        {
            "role": "system", 
            "content": (
                "You are an expert IT Systems & Infrastructure Diagnostic Investigator.\n"
                "Your SOLE OBJECTIVE is to inspect the SPECIFIC resources, processes, configurations, and errors directly mentioned in this incident ticket to gather context for automated SOP synthesis.\n\n"
                "CRITICAL DIRECTIVE — PROBLEM-FIRST DIAGNOSTICS ONLY:\n"
                "- GO STRAIGHT TO THE PROBLEM NAMED IN THE TICKET! DO NOT waste turns on generic system discovery like `uname -m`, `cat /etc/os-release`, `uptime`, or general package manager checks (`which apt-get`, `which yum`). The target OS and host environment are already known and provided below.\n"
                "- KUBERNETES / POD / DEPLOYMENT TICKETS: Immediately inspect the specific pod, deployment, replica set, or namespace named in the ticket (`kubectl get pods -A`, `kubectl describe pod <name>`, `kubectl get deployments`, `kubectl get rs`, `kubectl logs <name> --tail=50`, `kubectl get events --sort-by='.metadata.creationTimestamp'`).\n"
                "- SYSTEMD SERVICES / WEB APPS / PORTS: Immediately check the service and port named in the ticket (`systemctl status <service>`, `journalctl -u <service> -n 30 --no-pager`, `ss -tulpn | grep <port>`, `curl -Is http://localhost:<port>`).\n"
                "- USER CREATION / PERMISSIONS / SUDO: Immediately check existing user accounts and sudo configurations (`id <user>`, `getent passwd <user>`, `ls -la /etc/sudoers.d/`, `cat /etc/sudoers.d/<user> 2>/dev/null`).\n"
                "- DATABASES (DB2, PostgreSQL, MySQL): Immediately inspect database listeners and active instances.\n"
                "- PERFORMANCE / RESOURCE ISSUES: Immediately inspect `free -m`, `df -h`, `ps aux --sort=-%mem | head -10`, `ps aux --sort=-%cpu | head -10`.\n\n"
                "STRICT SAFETY & ACCESS RULES:\n"
                "1. PERMISSION VS SERVICE RESTART RULE: If an incident ticket requests granting permission/access for a target command (e.g. 'permission to execute systemctl restart sshd'), DO NOT execute that target command (e.g. DO NOT run `systemctl restart sshd` or `systemctl stop sshd`) on the live host! The target command is a privilege specification for sudoers drop-in configuration, NOT a request to restart production services.\n"
                "2. READ-ONLY COMMANDS ONLY: You may ONLY execute non-destructive diagnostic commands (e.g. `kubectl get/describe/logs`, `cat`, `grep`, `find`, `journalctl`, `ss`, `ps`, `ls`, `id`, `getent`, `systemctl status`, `which`, `curl`).\n"
                "3. NO MUTATING COMMANDS: ABSOLUTELY NO `kubectl delete`, `rm`, `userdel`, `useradd`, `systemctl restart`, `systemctl stop`, `kill`, `chmod`, `sed -i`, `echo >`.\n"
                "4. OUTPUT FORMAT DIRECTIVE: Perform internal reasoning silently. Do NOT output internal `<thought>` or `<thinking>` tags or chain-of-thought blocks in your responses. Output ONLY direct tool calls and concise execution summaries.\n"
                "5. EFFICIENT 1-3 TURNS: Execute 1-3 highly targeted diagnostic commands directly relevant to the incident problem, then summarize exact findings."
            )
        },
        {
            "role": "user", 
            "content": (
                f"Target Host: {ci_name} (IP: {ip}, OS: {target_os})\n"
                f"Incident Ticket: {number}\n"
                f"Short Description: {short_desc}\n"
                f"Full Problem Details:\n{desc}\n\n"
                "Please execute focused read-only diagnostic commands targeting the EXACT issue, pod, service, port, or user described above."
            )
        }
    ]

    full_diag_log = ""
    max_turns = 3
    turn = 0

    forbidden_patterns = [
        r"\brm\b", r"\buserdel\b", r"\buseradd\b", r"\busermod\b", r"\bgroupdel\b",
        r"\bsystemctl\s+(restart|stop|disable|mask)", r"\bservice\s+\w+\s+(restart|stop)",
        r"\bkill\b", r"\bpkill\b", r"\bkillall\b", r"\breboot\b", r"\bshutdown\b",
        r"\bchmod\b", r"\bchown\b", r"\bchgrp\b", r"\btruncate\b", r"\bdd\b",
        r"\biptables\s+-F", r"\bufw\s+disable", r"\bsed\s+-i",
        r">\s*/(?!dev/null)", r">\s*[a-zA-Z0-9_\.]"
    ]

    session = session_factory(ip, user, password)
    try:
        while turn < max_turns:
            turn += 1
            logger.info(f"🔍 Read-Only Diagnostic ReAct Loop Turn {turn} for {number}...")
            try:
                msg, used_model = invoker(
                    messages=messages,
                    tools=tools,
                    return_message=True,
                    call_label=f"Diagnostic ReAct Turn {turn}"
                )
                
                if not msg:
                    break
                    
                messages.append(msg)

                if msg.tool_calls:
                    for tc in msg.tool_calls:
                        if tc.function.name == "execute_ssh_command":
                            try:
                                args_dict = json.loads(tc.function.arguments)
                                cmd_to_run = args_dict.get("command", "").strip()
                            except:
                                cmd_to_run = ""
                            
                            is_forbidden = any(re.search(pat, cmd_to_run, re.IGNORECASE) for pat in forbidden_patterns)
                            if is_forbidden:
                                logger.warning(f"🛡️ READ-ONLY SAFETY BLOCK: Blocked mutating command '{cmd_to_run}' during Diagnostic Loop.")
                                output_text = f"SECURITY ERROR: Command '{cmd_to_run}' blocked by Read-Only Diagnostic Guard. Only non-destructive diagnostic commands are allowed."
                            else:
                                logger.info(f"🛠️ Executing Read-Only Diagnostic Command: '{cmd_to_run}'")
                                ok, output_text = session.exec_command(cmd_to_run)

                            full_diag_log += f"\nCommand: {cmd_to_run}\nOutput:\n{output_text}\n"

                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc.id,
                                "content": output_text
                            })
                else:
                    summary = msg.content or ""
                    logger.info(f"✅ Read-Only Diagnostic Loop completed for {number}: {summary[:200]}...")
                    full_diag_log += f"\n=== DIAGNOSTIC SUMMARY ===\n{summary}\n"
                    break
            except Exception as e:
                logger.error(f"Read-Only Diagnostic ReAct Loop Error: {e}")
                break
    finally:
        session.close()

    return full_diag_log
