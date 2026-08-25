import re
import shlex

# Commands that take a nested command as an argument. A naive "first token of the
# clause is the only invoked binary" scan lets a destructive command smuggled behind
# one of these wrappers (e.g. `find / -exec rm -rf {} \;`) slip past the allowlist
# check entirely, since only the wrapper ("find") would ever be inspected.
_FIND_EXEC_FLAGS = {"-exec", "-execdir", "-ok", "-okdir"}
_SIMPLE_NESTED_WRAPPERS = {"xargs", "nice", "ionice", "timeout", "nohup", "watch", "setsid", "stdbuf"}
_DASH_C_WRAPPERS = {"sh", "bash", "dash", "zsh", "ksh", "su", "doas", "env"}
# `ssh host "<remote cmd>"` is the dominant shape of every SOP step in the KB, so the
# remote payload — not "ssh" — is the command that actually runs on the target host.
# Case-sensitive: ssh distinguishes -o/-O, -l/-L, -w/-W, -i/-I, so these must not be
# folded to lowercase before lookup. Flags absent here (-f, -q, -N, -t, ...) take no
# argument, so the token after them is the host and must not be skipped.
_SSH_FLAGS_WITH_ARG = {"-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L",
                       "-l", "-m", "-O", "-o", "-p", "-Q", "-R", "-S", "-W", "-w"}
_MAX_NEST_DEPTH = 6
# Quote characters, used to break an ssh payload into candidate command fragments.
_QUOTE_CHARS = re.compile("[\"']")

def extract_invoked_binaries(cmd_str: str, _depth: int = 0) -> set[str]:
    """
    Extracts all executable binary names and commands invoked within a shell command string,
    including pipelines, boolean operators (&&, ||), subshells, loop bodies (for, while, until, if),
    and commands nested inside wrappers such as `find ... -exec CMD ;`, `xargs CMD`, and `sh -c "CMD"`.
    """
    if not cmd_str or _depth > _MAX_NEST_DEPTH:
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
    
    # Split by &&, ||, ;, \n, and pipe | while respecting quotes using shlex
    try:
        lexer = shlex.shlex(cleaned, posix=True, punctuation_chars="|&;\n()")
        lexer.wordchars += ":._-+=/"
        lex_tokens = list(lexer)
    except Exception:
        lex_tokens = cleaned.split()

    clauses = []
    current_clause = []
    for tok in lex_tokens:
        if tok in ["&&", "||", ";", "\n", "|", "&", "(", ")"]:
            if current_clause:
                clauses.append(current_clause)
                current_clause = []
        else:
            current_clause.append(tok)
    if current_clause:
        clauses.append(current_clause)

    invoked_bins = set()
    for tokens in clauses:
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
        for pos, tok in enumerate(tokens):
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
                if base_name in ("eval", "exec"):
                    invoked_bins |= extract_invoked_binaries(" ".join(tokens[pos + 1:]), _depth + 1)
                break
            if base_name:
                invoked_bins.add(base_name)
                remainder = tokens[pos + 1:]
                if base_name == "find":
                    rem_lows = [r.lower() for r in remainder]
                    for i, rl in enumerate(rem_lows):
                        if rl in _FIND_EXEC_FLAGS:
                            invoked_bins |= extract_invoked_binaries(" ".join(remainder[i + 1:]), _depth + 1)
                elif base_name in _SIMPLE_NESTED_WRAPPERS:
                    j = 0
                    while j < len(remainder) and (remainder[j].startswith("-") or remainder[j].replace(".", "", 1).isdigit()):
                        j += 1
                    if j < len(remainder):
                        invoked_bins |= extract_invoked_binaries(" ".join(remainder[j:]), _depth + 1)
                elif base_name == "ssh":
                    invoked_bins |= _extract_ssh_payload_binaries(remainder, _depth)
                elif base_name in _DASH_C_WRAPPERS:
                    rem_lows = [r.lower() for r in remainder]
                    if "-c" in rem_lows:
                        c_idx = rem_lows.index("-c")
                        invoked_bins |= extract_invoked_binaries(" ".join(remainder[c_idx + 1:]), _depth + 1)
                break
    return invoked_bins


def _extract_ssh_payload_binaries(remainder: list[str], _depth: int = 0) -> set[str]:
    """
    Given the tokens following `ssh`, returns the binaries invoked in the *remote*
    command. Skips ssh's own options and the [user@]host target, then scans the
    payload — including commands nested inside quotes, since SOP steps are routinely
    written as `ssh host "Restart the service: 'systemctl restart nexacore'"`.
    Without this, an approved SOP contributes only "ssh" to the authorized set and
    the very command it exists to run is rejected as unauthorized.
    """
    if _depth > _MAX_NEST_DEPTH:
        return set()
    j = 0
    while j < len(remainder):
        tok = remainder[j]
        if tok.startswith("-"):
            j += 2 if tok in _SSH_FLAGS_WITH_ARG else 1
            continue
        break
    if j >= len(remainder):
        return set()
    payload = " ".join(remainder[j + 1:])  # drop the [user@]host target
    if not payload.strip():
        return set()

    # KB steps nest the real command inside a prose sentence inside the ssh payload:
    #   ssh host "Disable swap space if enabled: 'swapoff -a'"
    # Scanning only the payload stops at the prose and never reaches `swapoff`, so
    # split on quote characters and scan each fragment as its own command.
    #
    # Deliberately a split rather than a balanced-pair match: the caller strips
    # leading/trailing quotes off each clause before tokenizing, so by the time the
    # payload reaches here its closing quote is routinely gone and any regex looking
    # for a matched pair silently finds nothing.
    bins = extract_invoked_binaries(payload, _depth + 1)
    for fragment in _QUOTE_CHARS.split(payload):
        if fragment.strip() and fragment.strip() != payload.strip():
            bins |= extract_invoked_binaries(fragment, _depth + 1)
    return bins


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
    (r">\s*/etc/(?:passwd|shadow|gshadow|sudoers(?!\.d/|/))\b", "Direct Critical Credential/Sudoers File Overwrite"),
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

    # NOTE: an empty/missing `approved` list must NOT short-circuit to "allow
    # anything" — that let any non-catastrophic command run unrestricted whenever an
    # approval card arrived with no proposedCommands. Fall through to the standard
    # check below, where the full operational toolset is still available.
    approved_bins = set()
    for ac in approved:
        ac_clean = ac.strip().strip("'\"").strip(";")
        for b in extract_invoked_binaries(ac_clean):
            approved_bins.add(b)
    # Standard operational toolset the agent may always reach for.
    #
    # This list stays deliberately broad — service control (systemctl/kill/kubectl)
    # and routine file operations are exactly what a remediation SOP exists to
    # perform, and many KB articles describe those steps in prose rather than as
    # literal commands, so they contribute nothing to `approved_bins`. Narrowing
    # this set does not make the agent safer; it makes it unable to remediate.
    #
    # The real guardrail is CATASTROPHIC_DESTRUCTIVE_PATTERNS, which is evaluated
    # first, against the raw command string, and blocks the dangerous *forms* of
    # these same binaries (`rm -rf /`, `systemctl poweroff`, `systemctl mask auditd`,
    # `chmod -R 777 /`, `az group delete`, ...) regardless of what is listed here.
    # Anything it flags requires explicit human authorization AND a match against the
    # approval card. Binary-level allowlisting is the coarse outer ring, not the thing
    # standing between the agent and a destroyed host.
    #
    # The nested-command wrappers (bash/sh/xargs/find/timeout/ssh/...) are safe to
    # include because extract_invoked_binaries() now recurses into what they invoke,
    # so a wrapper is never a way to smuggle an unlisted binary past this check.
    # `su`/`doas` are excluded: they signal privilege escalation and must be named
    # explicitly in the SOP, even though their payload is also inspected.
    diagnostic_bins = {
        "id", "ss", "ps", "top", "free", "journalctl", "curl", "test",
        "grep", "awk", "sed", "tail", "head", "cat", "echo", "printf", "true",
        "false", "which", "command", "sleep", "cut", "tr", "wc", "sort",
        "uniq", "uptime", "hostname", "pkill", "pgrep", "kill", "killall", "kubectl",
        "systemctl", "service", "rm", "cp", "mv", "ln", "touch", "chmod", "chown", "mkdir", "seq", "az",
        "find", "getent", "df", "du", "uname", "netstat", "ip", "tar", "gzip", "gunzip", "rsync",
        "useradd", "userdel", "usermod", "chpasswd", "chage", "visudo", "passwd", "gpasswd", "crontab",
        "loginctl", "who", "w", "nc", "ping", "nslookup", "dig",
        "ssh", "bash", "sh", "dash", "zsh", "ksh", "env", "xargs",
        "nice", "ionice", "timeout", "nohup", "watch", "setsid", "stdbuf"
    }
    allowed_bins = approved_bins.union(diagnostic_bins)
    invoked_bins = extract_invoked_binaries(c_str)
    unauthorized = invoked_bins - allowed_bins
    return (len(unauthorized) == 0), unauthorized
