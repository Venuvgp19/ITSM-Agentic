"""
Shared last-resort cleanup for LLM-hallucinated sudoers.d NOPASSWD command specs.

`clean_sudo_command_spec` is the one actually wired in today, at
daemon/safety/rules.py and daemon/sop/synthesizer.py's deterministic fallback
extractor. `sanitize_sudoers_command` below is NOT currently called from either
(or anywhere else in the daemon) -- it's kept for callers that want the full
"parse a sudoers.d write command, sanitize its NOPASSWD spec, reassemble" flow
in one call rather than doing the parsing/reassembly themselves. If you wire it
in, keep using shlex.quote() on both captured groups as this file already
does -- the raw regex-captured username/spec are ticket/LLM-derived text, not
trusted, and get spliced into a command that runs verbatim over SSH.

This is a NET, not the fix. The actual fix is instructing the SOP
parameterization LLM prompt to emit only a literal command path for the
NOPASSWD spec in the first place (see the CRITICAL SUDOERS SPEC rule in
daemon/sop/synthesizer.py). If a new hallucinated phrase keeps slipping past
this stopword list, strengthen that prompt instruction rather than extending
the list -- see rule_registry.json's `sudoers_sanitizer._readme`.
"""
import re
import shlex
from .kb_capabilities import load_registry


def _stopwords(registry: dict = None) -> list[str]:
    registry = registry or load_registry()
    return registry.get("sudoers_sanitizer", {}).get("narrative_stopwords", [])


def clean_sudo_command_spec(raw_spec: str, registry: dict = None) -> str:
    """Truncates a raw extracted sudo command spec at the first narrative stopword."""
    stopwords = set(w.lower() for w in _stopwords(registry))
    words = raw_spec.split()
    valid_words = []
    for w in words:
        if w.lower() in stopwords:
            break
        valid_words.append(w)
    return " ".join(valid_words).strip()


def sanitize_sudoers_command(cmd: str, registry: dict = None) -> str:
    """
    Given a full shell command line that writes a sudoers.d NOPASSWD entry
    (possibly containing hallucinated narrative text in the command spec),
    returns the command with the spec truncated to its leading literal tokens.
    Returns `cmd` unchanged if it doesn't look like a sudoers.d write.
    """
    if "sudoers.d" not in cmd:
        return cmd
    match = re.search(r'echo\s+["\']?([^"\'\s]+)\s+ALL=\(ALL\)\s+NOPASSWD:\s*([^"\'\n]+?)["\']?\s*>', cmd, re.IGNORECASE)
    if not match:
        return cmd
    u_name = match.group(1)
    if not re.match(r'^[a-zA-Z0-9_-]+$', u_name):
        # Captured username contains something outside a safe sudoers-file-name
        # charset (the source regex's `[^"'\s]+` is permissive) -- refuse rather
        # than splice an unvalidated value into a command that runs over SSH.
        return 'echo "GATE_ERROR: sudoers username failed safety validation." && exit 1'
    raw_spec = match.group(2).strip()
    clean_spec = re.split(r'[\.\;\n,]', raw_spec)[0].strip()
    final_spec = clean_sudo_command_spec(clean_spec, registry)
    if not final_spec:
        final_spec = "ALL"
    sudoers_file = shlex.quote(f"/etc/sudoers.d/99-{u_name}")
    entry = shlex.quote(f"{u_name} ALL=(ALL) NOPASSWD: {final_spec}")
    return f'echo {entry} > {sudoers_file} && chmod 440 {sudoers_file}'
