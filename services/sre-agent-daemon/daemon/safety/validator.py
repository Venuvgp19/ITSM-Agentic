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
    # Strip a leading step-type annotation tag (e.g. "[VERIFY] az group show ...",
    # "[CREATE - RESOURCE GROUP, only if ...] az group create ...") that some KB
    # articles prefix onto resolutionSteps. Without this, the bracket tag's own
    # text becomes the clause's first token, gets treated as the invoked binary
    # (e.g. "verify", "create"), and the scan loop below breaks immediately after
    # it -- so the real command later in the same string (e.g. `az group show
    # ...`) is never reached, and every legitimate use of that binary from an
    # otherwise-approved SOP step gets rejected as unauthorized.
    cmd_str = re.sub(r'^\s*\[[^\]]*\]\s*', '', cmd_str)
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
    
    # Split by &&, ||, ;, \n, and pipe | while respecting quotes using shlex
    try:
        lexer = shlex.shlex(cleaned, posix=True, punctuation_chars="|&;\n()")
        # '@' must stay a wordchar so `user@host` tokenizes as one token, not
        # `user`, `@`, `host` -- _extract_ssh_payload_binaries() below assumes the
        # ssh target is a single token and drops exactly one token to reach the
        # remote payload. Splitting it into three left '@' misidentified as the
        # payload's leading command and the real nested command (e.g. `useradd`)
        # never inspected, both hiding a smuggled destructive command from the
        # catastrophic/allowlist checks and wrongly rejecting legitimate approved
        # `ssh user@host "..."` SOP steps as unauthorized.
        lexer.wordchars += ":._-+=/@"
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
    # NOTE: shutdown/poweroff/reboot/halt/mkfs are deliberately NOT matched here via
    # plain re.search — that made `journalctl -u systemd-halt.service` or `grep -i
    # shutdown /var/log/syslog` false-positive as catastrophic. They're checked by
    # _first_token_catastrophic_check() below instead, which only flags them when
    # actually invoked as a clause's leading command.
    (r"\binit\s+[06]\b", "System Halt / Reboot init transition"),
    (r"\btelinit\s+[06]\b", "System Halt / Reboot telinit transition"),
    (r"\bsystemctl\s+(poweroff|reboot|halt|rescue|emergency)\b", "Systemd System-Level Power/Rescue state change"),

    # Destructive Filesystem Deletion / Wiping
    # NOTE: `rm -rf`/`chmod -R 777` catastrophic scope (flag-splitting like `-r -f` or
    # `--recursive --force`, and descendant paths like `/etc/nginx`) is handled by
    # _first_token_catastrophic_check() below — these regexes only catch the
    # contiguous-flag, exact-top-level-dir case as a cheap first pass.
    (r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(?:/|/\*|/bin|/sbin|/boot|/etc|/lib|/lib64|/usr|/var|/root|/home)(?:\s|$)", "Root/System Directory Recursive Erasure (rm -rf)"),
    (r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+--no-preserve-root\b", "Unconstrained Root Filesystem Erasure"),
    (r"\b(wipefs|fdisk|parted|gdisk|sfdisk)\b", "Disk Partition Table Manipulation / Wiping"),
    (r"\bdd\s+.*(?:of=/dev/(?:sd[a-zA-Z0-9]+|nvme[a-zA-Z0-9]+|vd[a-zA-Z0-9]+|hd[a-zA-Z0-9]+|mmcblk[a-zA-Z0-9]+|null|zero|mem|kmem|port))\b", "Raw Block Device Bit-Level Overwrite (dd)"),

    # Download-and-Execute Remote Code Execution
    (r"\b(curl|wget)\b[^|;&\n]*\|\s*(sudo\s+)?(bash|sh|zsh|dash|ksh)\b", "Download-and-Execute Remote Code Execution Pattern (curl/wget | shell)"),

    # Kubernetes / Container Workload Destruction
    (r"\bkubectl\s+delete\b(?!.*--dry-run)", "Kubernetes Resource Deletion (kubectl delete)"),
    (r"\bkubectl\s+drain\b", "Kubernetes Node Drain (workload eviction)"),
    (r"\bkubectl\s+scale\b[^\n]*--replicas[=\s]+0\b", "Kubernetes Deployment Scale-to-Zero"),
    (r"\bdocker\s+rm\s+(?:-[a-zA-Z]*f[a-zA-Z]*|--force)\b", "Docker Forced Container Removal"),
    (r"\bdocker\s+system\s+prune\b", "Docker System-Wide Prune (mass resource deletion)"),
    (r"\bdocker\s+volume\s+prune\b", "Docker Volume Prune (data loss)"),

    # Fork bombs & System Freezes
    (r":\(\)\s*\{\s*:\|:&\s*\};:", "Bash Fork Bomb DoS exploit"),
    (r"\b(\w+)\s*\(\)\s*\{\s*\1(?:\s*\|\s*\1)+\s*&\s*\};\s*\1\b", "Bash Fork Bomb DoS exploit (renamed function)"),
    
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
    # NOTE: `chmod -R 777/000` flag-splitting (`--recursive`) and descendant-path
    # scope is handled by _first_token_catastrophic_check() below, same as rm -rf.
    (r"\bchmod\s+-[a-zA-Z]*R\s+(?:777|000)(?:\s+(?:/|\S+))", "Broad Recursive Root/System Permission Alteration (chmod -R 777/000)"),
    (r"\bchmod\s+[uag]*\+s\s+/(?:bin|sbin|usr/bin)/(?:bash|sh|zsh|dash|python\d*|perl|ruby|find|vim|nano|curl|wget|env|awk|less|more|tar|gdb)\b", "Arbitrary SUID Shell/Interpreter Binary Privilege Escalation"),
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

_PROTECTED_TOP_DIRS = {"bin", "sbin", "boot", "etc", "lib", "lib64", "usr", "var", "root", "home"}
_POWER_STATE_BINS = {"shutdown", "poweroff", "reboot", "halt"}


def _split_clauses(cleaned: str) -> list[list[str]]:
    """Same clause-splitting strategy as extract_invoked_binaries: break on &&/||/;/\\n/|
    while respecting quotes, so each clause can be inspected as its own command."""
    try:
        lexer = shlex.shlex(cleaned, posix=True, punctuation_chars="|&;\n()")
        lexer.wordchars += ":._-+=/*"
        tokens = list(lexer)
    except Exception:
        tokens = cleaned.split()
    clauses, current = [], []
    for tok in tokens:
        if tok in ["&&", "||", ";", "\n", "|", "&", "(", ")"]:
            if current:
                clauses.append(current)
                current = []
        else:
            current.append(tok)
    if current:
        clauses.append(current)
    return clauses


def _first_token_catastrophic_check(cleaned: str) -> tuple[bool, str]:
    """
    Token-aware checks that a single contiguous-flag regex can't express correctly:

    - `rm`/`chmod` catastrophic scope: the regexes above only match a single
      contiguous flag cluster (`-rf`) and an exact top-level directory (`/etc`),
      so `rm -r -f /`, `rm --recursive --force /`, and `rm -rf /etc/nginx` (a
      protected dir's descendant) all silently pass. This checks flags in any
      form/order and any path under a protected top-level directory.
    - `shutdown`/`poweroff`/`reboot`/`halt`: matched via `\\b(...)\\b` above, these
      false-positive on `journalctl -u systemd-halt.service` or `grep -i shutdown
      /var/log/syslog`. Only flag them when actually invoked as a clause's leading
      command.
    """
    for clause in _split_clauses(cleaned):
        if not clause:
            continue
        base = clause[0].strip("'\"").split("/")[-1].lower()
        args = clause[1:]

        if base in _POWER_STATE_BINS:
            return True, "Host Power State Termination / Reboot command"
        if base == "mkfs" or base.startswith("mkfs."):
            return True, "Filesystem Formatting (mkfs)"

        if base not in ("rm", "chmod"):
            continue

        def _flag_present(names_short, char):
            for a in args:
                if a in names_short:
                    return True
                if a.startswith("-") and not a.startswith("--") and char in a[1:].lower():
                    return True
            return False

        if base == "rm":
            has_recursive = _flag_present({"-r", "-R", "--recursive"}, "r")
            has_force = _flag_present({"-f", "--force"}, "f")
            if not (has_recursive and has_force):
                continue
        else:  # chmod
            has_recursive = _flag_present({"-R", "--recursive"}, "r")
            is_broad = any(a in ("777", "000") for a in args)
            if not (has_recursive and is_broad):
                continue

        for a in args:
            path = a.strip("'\"")
            if path.startswith("-"):
                continue
            if path in ("/", "--no-preserve-root"):
                action = "Recursive Erasure" if base == "rm" else "Permission Alteration"
                return True, f"Root/System Directory {action} ({base} on '/')"
            if path.startswith("/"):
                segs = [s for s in path.split("/") if s]
                if segs and segs[0].lower() in _PROTECTED_TOP_DIRS:
                    action = "Recursive Erasure" if base == "rm" else "Permission Alteration"
                    return True, f"Protected Directory {action} ({base} on '{path}')"
    return False, ""


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
    is_cat, reason = _first_token_catastrophic_check(cleaned)
    if is_cat:
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
        
        # If human authorized, require the executed command to match an approved
        # command's literal text (whitespace-normalized) exactly. A binary-subset
        # check was used here previously, but that authorized ANY command sharing
        # invoked binaries with an approved one regardless of arguments -- e.g. an
        # approved `rm -rf /var/log/app/*.log` would also authorize `rm -rf /`
        # (both reduce to invoked-binary-set {rm}). Destructive commands are exactly
        # the class where "adapt loosely" must not apply: if the agent needs a
        # different destructive command than what a human actually approved, it must
        # be re-submitted for approval, not silently authorized by binary overlap.
        c_clean = " ".join(c_str.strip().strip("'\"").split())
        matched_in_approved = any(
            c_clean == " ".join(ac.strip().strip("'\"").split())
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
    # Split in two: binaries here are pure read-only investigation (they cannot
    # change host state), so they're always available regardless of which SOP
    # matched — an agent that can't run `ps`/`free`/`journalctl` can't diagnose
    # anything. State-changing / remediation binaries (systemctl, kubectl, rm,
    # useradd, az, ...) are deliberately NOT here: per the system prompt's Rule 9
    # ("STRICTLY PROHIBITED from introducing completely new command binaries
    # absent from the approved SOP blueprint"), a remediation action must come
    # from the matched SOP's own guide commands (-> approved_bins) — an agent
    # investigating a diagnostic-only SOP (e.g. KB0468210) can find that kubelet
    # is the culprit, but must escalate rather than silently restart it, since
    # that SOP never authorized a service restart.
    #
    # CATASTROPHIC_DESTRUCTIVE_PATTERNS is still evaluated first, against the raw
    # command string, and separately blocks dangerous *forms* even of an
    # SOP-approved binary (`rm -rf /`, `systemctl poweroff`, `az group delete`,
    # ...) regardless of approval — that check is unaffected by this split.
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
        "uniq", "uptime", "hostname", "pgrep",
        "getent", "df", "du", "uname", "netstat",
        "who", "w", "ping", "nslookup", "dig",
        "ssh", "bash", "sh", "dash", "zsh", "ksh", "env", "xargs",
        "nice", "ionice", "timeout", "nohup", "watch", "setsid", "stdbuf", "seq", "find"
    }
    # Everything below changes host/cluster/cloud state and is therefore only
    # allowed when the matched SOP's own commands invoke it (contributing to
    # approved_bins above) — it is intentionally absent from diagnostic_bins:
    # kubectl, systemctl, service, rm, cp, mv, ln, touch, chmod, chown, mkdir, az,
    # useradd, userdel, usermod, chpasswd, chage, visudo, passwd, gpasswd, crontab,
    # loginctl, pkill, kill, killall, nc, ip, tar, gzip, gunzip, rsync.
    allowed_bins = approved_bins.union(diagnostic_bins)
    invoked_bins = extract_invoked_binaries(c_str)
    unauthorized = invoked_bins - allowed_bins
    if unauthorized and is_human_authorized:
        # A human operator has already reviewed and signed off on this incident's
        # remediation via the HITL approval card (see incident_lifecycle.py's
        # UNAUTHORIZED_BINARY_NEEDS_APPROVAL handling) -- that sign-off extends to
        # binaries the auto-approved SOP text didn't literally resolve to, the same
        # way it already does for catastrophic commands above. Only reachable here
        # for the non-catastrophic case; catastrophic patterns still require an
        # exact text match against `approved` even when human-authorized.
        return True, set()
    return (len(unauthorized) == 0), unauthorized
