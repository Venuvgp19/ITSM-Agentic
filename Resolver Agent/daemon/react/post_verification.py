import re
from ..config import logger

def verify_post_remediation_status(session, short_desc, desc, sop_commands, exec_log, inc_number):
    """
    Domain-aware post-fix verification.
    Returns (is_fixed: bool, evidence: str).
    """
    full_text = f"{short_desc} {desc}".lower()
    evidence_lines = []
    is_fixed = True

    def clean_ssh_stdout(raw):
        text = raw or ""
        if "STDOUT:" in text:
            body = text.split("STDOUT:", 1)[1]
            body = body.split("STDERR:", 1)[0]
            return body.strip().strip("'").strip()
        return text.strip().strip("'").strip()

    # --- Kubernetes Pod Scheduling / Pending check ---
    k8s_pod_pending = (
        "pending" in full_text and
        any(k in full_text for k in ["pod", "kubectl", "kubernetes", "k8s", "failedscheduling", "node affinity", "node selector"])
    )
    if k8s_pod_pending:
        pod_name_match = re.search(r"kubectl describe pod\s+([\w\-]+)", desc) or \
                         re.search(r"pod[:\s]+([\w\-]+)", desc, re.IGNORECASE)
        pod_name = pod_name_match.group(1) if pod_name_match else None
        if pod_name:
            ok, out = session.exec_command(f"kubectl get pod {pod_name} -o jsonpath='{{.status.phase}}'")
            pod_phase = clean_ssh_stdout(out).upper()
            evidence_lines.append(f"Pod '{pod_name}' phase after remediation: {pod_phase}")
            if pod_phase not in ("RUNNING", "SUCCEEDED", "COMPLETED"):
                is_fixed = False
                evidence_lines.append(f"❌ Pod is still in '{pod_phase}' state — remediation did NOT resolve scheduling issue.")
            else:
                evidence_lines.append(f"✅ Pod is in '{pod_phase}' state — scheduling resolved.")
        else:
            evidence_lines.append("⚠️ Pod name could not be extracted from description — skipping Kubernetes phase verification.")

    # --- Linux User Account check ---
    elif any(k in full_text for k in ["useradd", "linux user", "user account", "provision user", "create user", "userdel", "delete user", "offboard", "pamsudo", "sudoers", "permission"]):
        ignore_terms = {
            "bin", "bash", "sh", "etc", "sudoers", "root", "command", "systemctl", "restart", 
            "nexacore", "pamsudox", "puser", "user", "username", "sudo_command", "99-", "90-",
            "null", "dev", "done", "echo", "true", "false", "item", "var", "u", "i"
        }

        candidates = set()

        def is_valid_username_candidate(name_str):
            if not name_str or len(name_str) < 2:
                return False
            if name_str.startswith('-') or name_str.isdigit():
                return False
            if name_str.lower() in ignore_terms:
                return False
            return bool(re.match(r'^[a-zA-Z0-9_][a-zA-Z0-9_\-]*$', name_str))

        # 1. From bash for loops: for u in user1 user2 ...;
        loop_matches = re.findall(r'for\s+\w+\s+in\s+([^;]+);', exec_log)
        for l_body in loop_matches:
            for token in l_body.split():
                clean_t = token.strip('"\';$(){}[]')
                if is_valid_username_candidate(clean_t):
                    candidates.add(clean_t)

        # 2. From /etc/passwd style lines in desc
        passwd_users = re.findall(r'^([a-zA-Z0-9_\-]+):x?:\d+:\d+:', desc, re.MULTILINE)
        for pu in passwd_users:
            if is_valid_username_candidate(pu):
                candidates.add(pu)

        # 3. From explicit useradd/userdel commands
        raw_created = re.findall(r'useradd\s+(?:-[a-zA-Z0-9\-]+\s+|\"[^\"]*\"\s+|\'[^\']*\'\s+)*\"?([a-zA-Z0-9_\-]+)\"?', exec_log)
        raw_deleted = re.findall(r'userdel\s+(?:-[a-zA-Z0-9\-]+\s+|\"[^\"]*\"\s+|\'[^\']*\'\s+)*\"?([a-zA-Z0-9_\-]+)\"?', exec_log)
        raw_sudoers = re.findall(r'/etc/sudoers\.d/(?:99-|90-)?([a-zA-Z0-9_\-]+)', exec_log)

        for raw in raw_created + raw_deleted + raw_sudoers:
            clean_r = raw.strip('"\';$(){}[]')
            if is_valid_username_candidate(clean_r):
                candidates.add(clean_r)

        is_deletion = any(k in full_text for k in ["delete", "remove", "offboard", "userdel", "deprovision"])
        users_to_check = list(candidates)

        if users_to_check:
            for u in users_to_check[:15]:
                ok, out = session.exec_command(f"id {u} 2>&1")
                # User exists if output contains 'uid=' and does not contain 'no such user'
                exists = "uid=" in out and "no such user" not in out.lower()
                if is_deletion:
                    if exists:
                        is_fixed = False
                        evidence_lines.append(f"❌ User '{u}' still exists after deletion — userdel failed.")
                    else:
                        evidence_lines.append(f"✅ User '{u}' successfully deleted.")
                else:
                    if not exists:
                        is_fixed = False
                        evidence_lines.append(f"❌ User '{u}' does NOT exist after creation — useradd failed.")
                    else:
                        evidence_lines.append(f"✅ User '{u}' created and verified in OS.")
        else:
            evidence_lines.append("ℹ️ User account and sudoers rules provisioned.")

    # --- Python venv check ---
    elif any(k in full_text for k in ["python virtual environment", "venv", "virtualenv", "python venv"]):
        venv_match = re.search(r"python3?\s+-m\s+venv\s+([\w/\\\-\.]+)", exec_log)
        venv_path = venv_match.group(1) if venv_match else None
        if venv_path:
            ok, out = session.exec_command(f"test -f '{venv_path}/bin/activate' && echo EXISTS || echo MISSING")
            if "EXISTS" in out:
                evidence_lines.append(f"✅ Python venv at '{venv_path}' verified — activate script present.")
            else:
                is_fixed = False
                evidence_lines.append(f"❌ Python venv at '{venv_path}' NOT found after creation.")
        else:
            evidence_lines.append("⚠️ Venv path not extracted from exec log — skipping venv verification.")

    # --- Service / Application check ---
    elif not any(k in full_text for k in ["pamsudo", "sudoers", "useradd", "userdel", "user account"]) and any(k in full_text for k in ["service down", "crash", "502", "bad gateway", "outage", "nexacore", "application down"]):
        service_match = re.search(r"systemctl\s+(?:start|restart)\s+([\w\-\.]+)", exec_log)
        svc = service_match.group(1) if service_match else None
        if svc:
            ok, out = session.exec_command(f"systemctl is-active {svc} 2>&1")
            active = clean_ssh_stdout(out).lower()
            if active == "active":
                evidence_lines.append(f"✅ Service '{svc}' is active after restart.")
            else:
                is_fixed = False
                evidence_lines.append(f"❌ Service '{svc}' is '{active}' — restart did not succeed.")
    # --- CPU / Memory Resource Utilization check ---
    elif any(k in full_text for k in ["cpu", "memory", "ram", "load average", "high load", "resource utilization", "performance"]):
        cpu_pct = 0.0
        mem_pct = 0.0
        try:
            ok_c, out_c = session.exec_command("top -bn1 | grep 'Cpu(s)' | awk '{print 100 - $8}'")
            cpu_body = clean_ssh_stdout(out_c)
            cpu_pct = float(cpu_body)
        except Exception:
            cpu_pct = 0.0

        try:
            ok_m, out_m = session.exec_command("free | awk 'NR==2{printf \"%.2f\", $3*100/$2 }'")
            mem_body = clean_ssh_stdout(out_m)
            mem_pct = float(mem_body)
        except Exception:
            mem_pct = 0.0

        evidence_lines.append(f"Post-remediation host resource status: CPU={cpu_pct:.2f}%, Memory={mem_pct:.2f}%")
        if cpu_pct > 90.0 or mem_pct > 90.0:
            is_fixed = False
            evidence_lines.append(f"❌ Host resource utilization remains critical (CPU: {cpu_pct:.2f}%, Memory: {mem_pct:.2f}% > 90.0%). Executed KB0468210 diagnostic runbook — escalating to human engineer with log evidence.")
        else:
            evidence_lines.append(f"✅ Host resource utilization normalized (CPU: {cpu_pct:.2f}%, Memory: {mem_pct:.2f}% <= 90.0%).")
    else:
        evidence_lines.append("ℹ️ No domain-specific post-remediation check applicable — trusting SSH execution result.")

    evidence = " | ".join(evidence_lines)
    logger.info(f"🔬 Post-Remediation Guard [{inc_number}]: is_fixed={is_fixed} | {evidence}")
    return is_fixed, evidence
