import re

def extract_invoked_binaries(cmd_str: str) -> set[str]:
    """
    Extracts all executable binary names and commands invoked within a shell command string,
    including pipelines, boolean operators (&&, ||), subshells, and loop bodies (for, while, until, if).
    """
    if not cmd_str:
        return set()
    shell_control_keywords = {
        "for", "in", "do", "done", "while", "until", "if", "then", "else", "elif",
        "fi", "case", "esac", "select", "{", "}", "(", ")", "!", "&&", "||", ";", "|"
    }
    shell_builtin_commands = {
        "echo", "printf", "true", "false", "exit", "return", "set", "export",
        "read", "local", "shift", "let", "declare", "typeset", "eval", "exec",
        "source", "test", "sleep"
    }
    cleaned = cmd_str
    cleaned = re.sub(r'#.*$', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'\d*>&?\s*(?:/dev/null|/dev/zero|\d+|\S+)', ' ', cleaned)
    cleaned = re.sub(r'\d*<\s*(?:/dev/null|\S+)', ' ', cleaned)
    clauses = re.split(r'(?:&&|\|\||[\n;|\(\)])+', cleaned)
    invoked_bins = set()
    for clause in clauses:
        clause_str = clause.strip().strip("'\"")
        if not clause_str:
            continue
        tokens = clause_str.split()
        if not tokens:
            continue
        first_low = tokens[0].lower()
        if first_low in ["for", "while", "until", "if", "elif", "case", "select"]:
            token_lows = [t.lower() for t in tokens]
            if "do" in token_lows:
                do_idx = token_lows.index("do")
                tokens = tokens[do_idx + 1:]
            elif "then" in token_lows:
                then_idx = token_lows.index("then")
                tokens = tokens[then_idx + 1:]
            else:
                continue
        if not tokens:
            continue
        for tok in tokens:
            t_clean = tok.strip().strip("'\"").strip("()[]{}")
            if not t_clean or t_clean.lower() in shell_control_keywords:
                continue
            if re.match(r'^[A-Za-z_][A-Za-z0-9_]*=.*', t_clean):
                continue
            if t_clean.isdigit() or t_clean.startswith("-") or t_clean.startswith("$"):
                continue
            base_name = t_clean.split("/")[-1].lower()
            if base_name in ["sudo"] or base_name in shell_control_keywords:
                continue
            if base_name in shell_builtin_commands:
                invoked_bins.add(base_name)
                break
            if base_name:
                invoked_bins.add(base_name)
                break
    return invoked_bins

CATASTROPHIC_DESTRUCTIVE_PATTERNS = [
    # System Power State / Shutdown / Reboot / Halting
    (r"\binit\s+[06]\b", "System Halt / Reboot init transition"),
    (r"\btelinit\s+[06]\b", "System Halt / Reboot telinit transition"),
    (r"\b(shutdown|poweroff|reboot|halt)\b", "Host Power State Termination / Reboot command"),
    (r"\bsystemctl\s+(poweroff|reboot|halt|rescue|emergency)\b", "Systemd System-Level Power/Rescue state change"),
    
    # Destructive Filesystem Deletion / Wiping
    (r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(?:/|/\*|/bin|/sbin|/boot|/etc|/lib|/lib64|/usr|/var|/root|/home)(?:\s|$)", "Root/System Directory Recursive Erasure (rm -rf)"),
    (r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+--no-preserve-root\b", "Unconstrained Root Filesystem Erasure"),
    (r"\bmkfs(?:\.[a-zA-Z0-9_-]+)?\b", "Filesystem Formatting (mkfs)"),
    (r"\b(wipefs|fdisk|parted|gdisk|sfdisk)\b", "Disk Partition Table Manipulation / Wiping"),
    (r"\bdd\s+.*(?:of=/dev/(?:sd[a-zA-Z0-9]+|nvme[a-zA-Z0-9]+|vd[a-zA-Z0-9]+|hd[a-zA-Z0-9]+|mmcblk[a-zA-Z0-9]+|null|zero|mem|kmem|port))\b", "Raw Block Device Bit-Level Overwrite (dd)"),
    
    # Fork bombs & System Freezes
    (r":\(\)\s*\{\s*:\|:&\s*\};:", "Bash Fork Bomb DoS exploit"),
    
    # Raw Block Device & Kernel Stream redirection
    (r">\s*/dev/(?:sda|sdb|sdc|sdd|nvme[0-9]+|vda|vdb|kmem|mem|port)\b", "Raw Disk/Memory Device Stream Overwrite"),
    (r">\s*/proc/sysrq-trigger\b", "Magic SysRq Kernel Trigger Exploitation"),
    
    # Mass File Destruction & Truncation
    (r"\bshred\s+.*(?:/|/\*|/etc|/var|/boot)\b", "System-level Secure File Shredding"),
    (r"\btruncate\s+.*-s\s+0\s+/(?:etc|bin|sbin|usr|boot)\b", "Critical System Binary/Config Truncation"),

    # Security Controls & Defense Evasion Disabling
    (r"\bsetenforce\s+0\b", "SELinux Security Policy Disabling"),
    (r"\b(aa-teardown|aa-disable)\b", "AppArmor Security Profile Teardown"),
    (r"\bsystemctl\s+(?:stop|disable|mask)\s+(?:apparmor|auditd|selinux|firewalld|ufw|iptables)\b", "Host Security/Audit Daemon Termination"),
    (r"\biptables\s+-(?:F|X|Z|flush)\b", "Firewall Filtering Table Flush (iptables)"),
    (r"\biptables-save\s*>\s*/etc/iptables", "Firewall Ruleset Overwrite"),
    (r"\b(ufw\s+disable|nft\s+flush\s+ruleset|firewall-cmd\s+--stop)\b", "Host Firewall Subsystem Disabling"),

    # Privilege Escalation & Identity Store Tampering
    (r">\s*/etc/(?:passwd|shadow|gshadow|sudoers)\b", "Direct Critical Credential/Sudoers File Overwrite"),
    (r"\bchmod\s+-[a-zA-Z]*R\s+(?:777|000)(?:\s+(?:/|\S+))", "Broad Recursive Root/System Permission Alteration (chmod -R 777/000)"),
    (r"\bchmod\s+[uag]*\+s\s+/(?:bin|sbin|usr/bin)/(?:bash|sh|zsh|dash|python\d*|perl|ruby|find|vim|nano|curl|wget)\b", "Arbitrary SUID Shell/Interpreter Binary Privilege Escalation"),
    (r"\b(insmod|rmmod|modprobe\s+-r)\b", "Direct Kernel Module Insertion/Removal"),

    # Critical Log Erasure & Defense Cover-up
    (r">\s*/var/log/(?:messages|syslog|auth\.log|secure|audit/audit\.log)\b", "Critical System Audit/Security Log Truncation"),
    (r"\brm\s+-[a-zA-Z]*r?[a-zA-Z]*f[a-zA-Z]*\s+/var/log/(?:messages|syslog|auth\.log|secure|audit/audit\.log)\b", "Direct Audit Log Deletion"),

    # Azure Cloud Infrastructure Destructive Operations (az CLI)
    (r"\baz\s+group\s+delete\b", "Azure Resource Group Deletion (az group delete)"),
    (r"\baz\s+account\s+(?:clear|delete)\b", "Azure Account/Subscription Unbinding (az account delete/clear)"),
    (r"\baz\s+vm\s+(?:delete|deallocate|stop)\b", "Azure Virtual Machine Destruction/Deallocation (az vm delete/deallocate)"),
    (r"\baz\s+aks\s+delete\b", "Azure Kubernetes Service Cluster Deletion (az aks delete)"),
    (r"\baz\s+keyvault\s+(?:delete|purge)\b", "Azure Key Vault Destruction & Cryptographic Purge (az keyvault delete/purge)"),
    (r"\baz\s+storage\s+account\s+delete\b", "Azure Storage Account Destruction (az storage account delete)"),
    (r"\baz\s+storage\s+blob\s+delete-batch\b", "Azure Bulk Blob Storage Deletion (az storage blob delete-batch)"),
    (r"\baz\s+(?:sql\s+server|sql\s+db|postgres\s+server|cosmosdb)\s+delete\b", "Azure Managed Database Server Deletion (az db delete)"),
    (r"\baz\s+network\s+(?:vnet|nsg|public-ip|route-table|vpn-gateway)\s+delete\b", "Azure Core Network Topology Deletion (az network delete)"),
    (r"\baz\s+role\s+assignment\s+delete\b", "Azure IAM Role Assignment Stripping (az role assignment delete)"),
    (r"\baz\s+lock\s+delete\b", "Azure Resource Protection Lock Stripping (az lock delete)"),
]

def check_catastrophic_destructive_command(cmd_str: str) -> tuple[bool, str]:
    """
    Evaluates a shell command against hard-coded catastrophic safety patterns.
    Returns (is_catastrophic: bool, reason: str).
    Under NO circumstances will commands matching these rules be executed,
    even if present in an approved SOP or synthesized by an LLM.
    """
    if not cmd_str:
        return False, ""
    cleaned = re.sub(r'#.*$', '', cmd_str, flags=re.MULTILINE).strip()
    for pattern, reason in CATASTROPHIC_DESTRUCTIVE_PATTERNS:
        if re.search(pattern, cleaned, re.IGNORECASE):
            return True, reason
    return False, ""

def is_allowed_command_adaptation(c_str: str, approved: list[str], is_human_authorized: bool = False) -> tuple[bool, set[str]]:
    """
    Validates that every command/binary invoked inside `c_str` is safe and either present
    in the approved SOP commands or belongs to the standard safe diagnostic/built-in toolset.
    If `is_human_authorized` is True, destructive commands explicitly authorized by a human
    operator in an approval card are permitted to execute.
    Returns (is_allowed: bool, unauthorized_binaries: set).
    """
    if not c_str:
        return True, set()
    
    # Check catastrophic/destructive blacklist
    is_catastrophic, cat_reason = check_catastrophic_destructive_command(c_str)
    if is_catastrophic:
        if not is_human_authorized:
            return False, {f"FORBIDDEN_DESTRUCTIVE_COMMAND_REQUIRES_HUMAN_APPROVAL ({cat_reason})"}
        
        # If human authorized, verify that the invoked binary/command was explicitly present in approved commands
        c_clean = " ".join(c_str.strip().strip("'\"").split())
        matched_in_approved = any(
            c_clean == " ".join(ac.strip().strip("'\"").split()) or 
            extract_invoked_binaries(c_clean).issubset(extract_invoked_binaries(ac))
            for ac in approved
        )
        if not matched_in_approved:
            return False, {f"UNAUTHORIZED_DESTRUCTIVE_COMMAND_NOT_IN_APPROVAL ({cat_reason})"}

    if not approved:
        return True, set()

    approved_bins = set()
    for ac in approved:
        ac_clean = ac.strip().strip("'\"").strip(";")
        for b in extract_invoked_binaries(ac_clean):
            approved_bins.add(b)
    diagnostic_bins = {
        "id", "ss", "ps", "top", "free", "journalctl", "curl", "test",
        "grep", "awk", "sed", "tail", "head", "cat", "echo", "printf", "true",
        "false", "which", "command", "sleep", "cut", "tr", "wc", "sort",
        "uniq", "uptime", "hostname", "pkill", "pgrep", "kill", "kubectl",
        "systemctl", "rm", "touch", "chmod", "chown", "mkdir"
    }
    allowed_bins = approved_bins.union(diagnostic_bins)
    invoked_bins = extract_invoked_binaries(c_str)
    unauthorized = invoked_bins - allowed_bins
    return (len(unauthorized) == 0), unauthorized
