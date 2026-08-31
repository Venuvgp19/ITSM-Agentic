import re
from ..config import logger

_LAST_CMD_BLOCK_RE = re.compile(
    r'=== \[CMD:\s*(.*?)\]\s*===\s*STDOUT:\s*(.*?)STDERR:\s*(.*?)(?=(?:=== \[CMD:)|\Z)',
    re.DOTALL,
)
_HARD_ERROR_MARKERS = (
    "error", "traceback", "command not found", "permission denied",
    "not found", "resourcenotfound", "cannot be completed", "denied",
)


def _last_command_unrecovered_error(exec_log):
    """
    Domain-agnostic safety net used only when no keyword-matched check above
    already produced a live-verified answer (i.e. a genuinely novel request type).
    Parses the '=== [CMD: ...] === STDOUT: ... STDERR: ...' blocks the ReAct
    executor logs and checks whether the LAST command run ended in a hard
    CLI/tool error. A multi-step run can have earlier steps succeed (e.g. creating
    unrelated side resources) while the actual final/target step fails -- so only
    the last executed command is treated as representative of the outcome.
    Returns (unrecovered: bool, evidence: str).
    """
    blocks = _LAST_CMD_BLOCK_RE.findall(exec_log or "")
    if not blocks:
        return False, ""
    last_cmd, last_stdout, last_stderr = blocks[-1]
    stderr_lower = last_stderr.lower()
    if any(marker in stderr_lower for marker in _HARD_ERROR_MARKERS):
        return True, f"Last command `{last_cmd.strip()}` STDERR: {last_stderr.strip()[:300]}"
    # Deliberately conservative: this does NOT require positive semantic evidence
    # of success (that needs per-domain knowledge this catch-all doesn't have) --
    # it only closes the "nothing happened at all" gap. A last command with empty
    # STDOUT *and* empty STDERR isn't silent success, it's usually a command the
    # remote host never actually ran (e.g. shell syntax it rejected before
    # producing any output).
    if not last_stdout.strip() and not last_stderr.strip():
        return True, f"Last command `{last_cmd.strip()}` produced no output at all (STDOUT and STDERR both empty) — cannot confirm outcome."
    return False, ""


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
            is_fixed = False
            evidence_lines.append(
                "❌ Could not identify a specific Kubernetes pod name from the incident description to verify — "
                "refusing to assume success without live confirmation."
            )

    # --- Linux User Account check ---
    # NOTE: "permission" was previously in this trigger list on its own, broad enough
    # to misroute unrelated tickets (e.g. a file-share "permission denied" issue) into
    # this branch ahead of a more appropriate one, since this is a first-match elif
    # chain -- removed. The remaining anchors are specific enough on their own.
    elif any(k in full_text for k in ["useradd", "linux user", "user account", "provision user", "create user", "userdel", "delete user", "offboard", "pamsudo", "sudoers"]):
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
            is_fixed = False
            evidence_lines.append(
                "❌ Could not identify any target username(s) from the exec log/description to verify — "
                "refusing to assume success without live confirmation."
            )

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
            is_fixed = False
            evidence_lines.append(
                "❌ Could not extract the venv path from the executed commands to verify — "
                "refusing to assume success without live confirmation."
            )

    # --- Service / Application check ---
    elif not any(k in full_text for k in ["pamsudo", "sudoers", "useradd", "userdel", "user account"]) and any(k in full_text for k in ["service down", "crash", "502", "bad gateway", "outage", "nexacore", "application down"]):
        # Previously only matched literal `systemctl start|restart <svc>`. If the
        # agent restarted the service any other common way, `svc` was None, NO
        # evidence line was ever added, and is_fixed silently stayed at its default
        # True -- for the exact incident class ("service down"/"crash"/"outage")
        # this gate exists to protect.
        #
        # `systemctl enable --now <svc>` (and the reversed `enable <svc> --now`)
        # is a standard systemd idiom -- it starts the service immediately AND
        # enables it on boot in one command (see KB0000039) -- and was missing
        # here entirely, so this whole gate silently fell through to "could not
        # identify a service name" for any SOP using it, even on a fully correct
        # remediation. A bare `systemctl enable <svc>` (no --now) is deliberately
        # NOT matched: it only affects boot-time behavior and does not start the
        # service now, so it shouldn't be treated as evidence of a live restart.
        service_match = (
            re.search(r"systemctl\s+(?:start|restart)\s+([\w\-\.]+)", exec_log)
            or re.search(r"systemctl\s+enable\s+--now\s+([\w\-\.]+)", exec_log)
            or re.search(r"systemctl\s+enable\s+([\w\-\.]+)\s+--now\b", exec_log)
            or re.search(r"\bservice\s+([\w\-\.]+)\s+(?:start|restart)\b", exec_log)
            or re.search(r"\bdocker\s+restart\s+([\w\-\.]+)", exec_log)
            or re.search(r"\bpm2\s+restart\s+([\w\-\.]+)", exec_log)
            or re.search(r"\bkubectl\s+rollout\s+restart\s+(?:deployment/|deploy/)?([\w\-\.]+)", exec_log)
        )
        svc = service_match.group(1) if service_match else None
        if not svc:
            is_fixed = False
            evidence_lines.append(
                "❌ Could not identify a specific service/workload name from the executed restart command to verify — "
                "refusing to assume success without live confirmation."
            )
        else:
            matched_form = service_match.group(0)
            if "docker" in matched_form:
                ok, out = session.exec_command(f"docker inspect -f '{{{{.State.Running}}}}' {svc} 2>&1")
                healthy = "true" in clean_ssh_stdout(out).lower()
            elif "pm2" in matched_form:
                ok, out = session.exec_command("pm2 jlist 2>&1")
                body = clean_ssh_stdout(out)
                healthy = f'"name":"{svc}"' in body and '"status":"online"' in body
            elif "kubectl" in matched_form:
                ok, out = session.exec_command(f"kubectl rollout status deployment/{svc} --timeout=5s 2>&1")
                healthy = "successfully rolled out" in clean_ssh_stdout(out).lower()
            else:
                ok, out = session.exec_command(f"systemctl is-active {svc} 2>&1")
                healthy = clean_ssh_stdout(out).lower() == "active"
            if healthy:
                evidence_lines.append(f"✅ Service/workload '{svc}' is active/running after restart.")
            else:
                is_fixed = False
                evidence_lines.append(f"❌ Service/workload '{svc}' verification failed after restart attempt.")
    # --- Azure Web App / App Service check ---
    # Must be checked before the generic Resource Group branch below: a ticket asking
    # to provision a Web App "in an existing resource group" contains the words
    # "resource group" too, and an unrelated side-resource (VNet, subnet, plan) can
    # report its own "provisioningState": "Succeeded" in the log while the actual
    # requested Web App never got created (e.g. blocked by quota) -- so the specific
    # target resource must be confirmed live, not inferred from a log substring.
    elif any(k in full_text for k in ["web app", "webapp", "app service", "appservice"]):
        webapp_names = set(re.findall(r'az\s+webapp\s+create\s+.*?(?:-n|--name)\s+([^\s]+)', exec_log))
        webapp_names |= set(re.findall(r'az\s+webapp\s+(?:show|config|deploy)\s+.*?(?:-n|--name)\s+([^\s]+)', exec_log))
        if not webapp_names:
            is_fixed = False
            evidence_lines.append(
                "❌ Could not identify a specific Azure Web App name from the executed commands to verify — "
                "refusing to assume success without live confirmation."
            )
        else:
            ok, out = session.exec_command("az webapp list --query '[].name' -o tsv 2>&1")
            existing_webapps = clean_ssh_stdout(out).splitlines()
            missing = [wa for wa in webapp_names if wa not in existing_webapps]
            if missing:
                is_fixed = False
                evidence_lines.append(
                    f"❌ Azure Web App(s) {', '.join(missing)} NOT found via live 'az webapp list' — "
                    f"provisioning did not complete (commands may have failed on quota/plan errors)."
                )
            else:
                is_fixed = True
                evidence_lines.append(f"✅ Verified Azure Web App(s) {', '.join(webapp_names)} live via 'az webapp list'.")

    # --- Azure Resource Group / Cloud Resources check ---
    elif any(k in full_text for k in ["resource group", "az group", "azure resource", "azure group"]):
        rg_matches = set(re.findall(r'az\s+group\s+create\s+--name\s+([^\s]+)', exec_log))
        if not rg_matches:
            is_fixed = False
            evidence_lines.append(
                "❌ Could not identify a specific Azure Resource Group name from the executed commands to verify — "
                "refusing to assume success without live confirmation."
            )
        else:
            ok, out = session.exec_command("az group list --query '[].name' -o tsv 2>&1")
            existing_rgs = clean_ssh_stdout(out).splitlines()
            missing = [rg for rg in rg_matches if rg not in existing_rgs]
            if missing:
                is_fixed = False
                evidence_lines.append(f"❌ Azure Resource Group(s) {', '.join(missing)} NOT found live in subscription.")
            else:
                is_fixed = True
                evidence_lines.append(f"✅ Verified {len(rg_matches)} Azure Resource Group(s) live via 'az group list': {', '.join(rg_matches)}.")

    # --- CPU / Memory Resource Utilization check ---
    elif any(k in full_text for k in ["cpu", "memory", "ram", "load average", "high load", "resource utilization", "performance"]):
        cpu_pct = 0.0
        mem_pct = 0.0
        verification_failed = False
        # ok_c/ok_m (whether the SSH command itself succeeded) were previously
        # captured but never checked. A verification-command failure (kill-switch
        # block, transient SSH error) made clean_ssh_stdout() return the error text,
        # float() raised, was caught, and cpu_pct/mem_pct defaulted to 0.0 -- which
        # then read as "healthy". A verification-infrastructure failure must not be
        # silently converted into proof of health.
        try:
            ok_c, out_c = session.exec_command("top -bn1 | grep 'Cpu(s)' | awk '{print 100 - $8}'")
            if not ok_c:
                verification_failed = True
            cpu_body = clean_ssh_stdout(out_c)
            cpu_pct = float(cpu_body)
        except Exception:
            verification_failed = True
            cpu_pct = 0.0

        try:
            ok_m, out_m = session.exec_command("free | awk 'NR==2{printf \"%.2f\", $3*100/$2 }'")
            if not ok_m:
                verification_failed = True
            mem_body = clean_ssh_stdout(out_m)
            mem_pct = float(mem_body)
        except Exception:
            verification_failed = True
            mem_pct = 0.0

        evidence_lines.append(f"Post-remediation host resource status: CPU={cpu_pct:.2f}%, Memory={mem_pct:.2f}%")
        if verification_failed:
            is_fixed = False
            evidence_lines.append("❌ Post-remediation resource verification command(s) failed to execute cleanly — refusing to assume success without a real reading.")
        elif cpu_pct > 90.0 or mem_pct > 90.0:
            is_fixed = False
            evidence_lines.append(f"❌ Host resource utilization remains critical (CPU: {cpu_pct:.2f}%, Memory: {mem_pct:.2f}% > 90.0%). Executed KB0468210 diagnostic runbook — escalating to human engineer with log evidence.")
        else:
            evidence_lines.append(f"✅ Host resource utilization normalized (CPU: {cpu_pct:.2f}%, Memory: {mem_pct:.2f}% <= 90.0%).")
    else:
        unrecovered, err_evidence = _last_command_unrecovered_error(exec_log)
        if unrecovered:
            is_fixed = False
            evidence_lines.append(
                "❌ No domain-specific post-remediation check applicable, and the terminal execution log shows "
                f"the most recently executed command ended in an unresolved error — refusing to assume success. {err_evidence}"
            )
        else:
            evidence_lines.append("ℹ️ No domain-specific post-remediation check applicable — no unresolved errors detected in execution log; trusting SSH execution result.")

    evidence = " | ".join(evidence_lines)
    logger.info(f"🔬 Post-Remediation Guard [{inc_number}]: is_fixed={is_fixed} | {evidence}")
    return is_fixed, evidence
