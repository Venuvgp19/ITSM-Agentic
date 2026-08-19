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

def is_allowed_command_adaptation(c_str: str, approved: list[str]) -> tuple[bool, set[str]]:
    """
    Validates that every command/binary invoked inside `c_str` is either present in the approved
    SOP commands or belongs to the standard safe diagnostic/built-in toolset.
    Returns (is_allowed: bool, unauthorized_binaries: set).
    """
    if not approved or not c_str:
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
