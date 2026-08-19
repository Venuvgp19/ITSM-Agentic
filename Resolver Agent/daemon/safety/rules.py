import re
from ..config import logger

def _enforce_sop_safety_rules(sop_commands, short_desc, desc, kb_number):
    """
    Code-level safety enforcement on SOP commands after LLM parameterization.
    Prevents LLM hallucinations and enforces mandatory business rules.
    """
    full_text = f"{short_desc} {desc}".lower()
    commands = list(sop_commands) if isinstance(sop_commands, list) else []

    if not commands:
        return commands

    # --- SANITIZE SUDOERS COMMANDS FROM LLM HALLUCINATED NARRATIVE TEXT ---
    sanitized_commands = []
    for c in commands:
        if "sudoers.d" in c:
            match = re.search(r'echo\s+["\']?([^"\'\s]+)\s+ALL=\(ALL\)\s+NOPASSWD:\s*([^"\'\n]+?)["\']?\s*>', c, re.IGNORECASE)
            if match:
                u_name = match.group(1)
                raw_spec = match.group(2).strip()
                clean_spec = re.split(r'[\.\;\n,]', raw_spec)[0].strip()
                words = clean_spec.split()
                valid_words = []
                for w in words:
                    if w.lower() in ["create", "users", "user", "on", "called", "with", "permission", "to", "for", "please", "worker1ol", "worker2ol", "worker1", "worker2", "5"]:
                        break
                    valid_words.append(w)
                final_spec = " ".join(valid_words).strip()
                if not final_spec:
                    final_spec = "ALL"
                c = f'echo "{u_name} ALL=(ALL) NOPASSWD: {final_spec}" > "/etc/sudoers.d/99-{u_name}" && chmod 440 "/etc/sudoers.d/99-{u_name}"'
        sanitized_commands.append(c)
    commands = sanitized_commands

    # --- ALL USER MANAGEMENT SOPs: Validate username is not a placeholder ---
    user_mgmt_kbs = ["KB0000001", "KB0000014", "KB0000015", "KB0000017", "KB0000018"]
    if kb_number in user_mgmt_kbs:
        first_cmd = commands[0] if commands else ""
        if "{username}" in first_cmd:
            logger.warning(f"⚠️ Safety Rule: {{username}} placeholder still present in {kb_number} after LLM parameterization. Aborting.")
            commands.insert(0, "echo 'GATE_ERROR: No username provided in incident ticket. Cannot proceed.' && exit 1")
            return commands

    # --- USER CREATION SOP (KB0000001) RULES ---
    if kb_number == "KB0000001":
        sudo_keywords = ["sudo", "sudoers", "root access", "admin access", "privilege", "wheel", "nopasswd"]
        wants_sudo = any(k in full_text for k in sudo_keywords)

        dir_access_patterns = ["write access to", "read access to", "access to /etc", "access to /var",
                               "write to /etc", "write permission", "read permission", "directory access",
                               "access to directory", "modify /etc"]
        wants_dir_access = any(p in full_text for p in dir_access_patterns)

        if wants_dir_access and not wants_sudo:
            new_commands = []
            for c in commands:
                if "sudoers" in c.lower() or "visudo" in c.lower():
                    dir_match = re.search(r'(?:to|on|for)\s+(/\S+)', full_text)
                    target_dir = dir_match.group(1) if dir_match else "/etc"
                    # Try to extract username
                    u_match = re.search(r'\buser\s+([a-zA-Z0-9_-]+)', full_text)
                    u_extracted = u_match.group(1) if u_match else "user"
                    acl_cmd = f'setfacl -R -m u:{u_extracted}:rwx {target_dir} 2>&1 && echo ACL_SET_OK || echo ACL_SET_FAILED'
                    new_commands.append(acl_cmd)
                    logger.info(f"🔒 Safety Rule: Directory access requested, not full sudo. Replacing sudoers with ACL command for {target_dir}.")
                else:
                    new_commands.append(c)
            commands = new_commands
        elif not wants_sudo and not wants_dir_access:
            before = len(commands)
            commands = [c for c in commands if "sudoers" not in c.lower() and "visudo" not in c.lower()]
            removed = before - len(commands)
            if removed > 0:
                logger.info(f"🔒 Safety Rule: No sudo requested — removed {removed} sudoers command(s) from KB0000001.")

    # --- USER DELETION SOP (KB0000014) RULES ---
    if kb_number == "KB0000014":
        logger.info("ℹ️ Safety Rule: User deletion SOP — preserving archive step.")

    # --- PASSWORD RESET SOP (KB0000017) RULES ---
    if kb_number == "KB0000017":
        force_change_keywords = ["force", "expire", "first login", "must change"]
        wants_force = any(k in full_text for k in force_change_keywords)
        if not wants_force:
            before = len(commands)
            commands = [c for c in commands if "chage" not in c.lower()]
            removed = before - len(commands)
            if removed > 0:
                logger.info(f"🔒 Safety Rule: No force-change requested — removed {removed} chage command(s) from KB0000017.")

    # --- LOCK/UNLOCK SOP (KB0000015) RULES ---
    if kb_number == "KB0000015":
        lock_keywords = ["lock", "disable", "freeze", "brute", "lockout"]
        unlock_keywords = ["unlock", "enable", "restore", "re-enable"]
        wants_lock = any(k in full_text for k in lock_keywords)
        wants_unlock = any(k in full_text for k in unlock_keywords)
        if wants_unlock:
            commands = [c for c in commands if "{lock_unlock_command}" not in c or "passwd -u" in c or "usermod -U" in c]
        elif wants_lock:
            commands = [c for c in commands if "{lock_unlock_command}" not in c or "passwd -l" in c or "usermod -L" in c]

    # --- MODIFY USER SOP (KB0000018) RULES ---
    if kb_number == "KB0000018":
        shell_keywords = ["shell", "chsh", "bash", "zsh", "sh"]
        group_keywords = ["group", "add to", "remove from", "wheel", "sudo"]
        wants_shell = any(k in full_text for k in shell_keywords)
        wants_group = any(k in full_text for k in group_keywords)
        if not wants_shell and not wants_group:
            logger.info("ℹ️ Safety Rule: No specific modification type detected in ticket. LLM should infer from context.")

    return commands
