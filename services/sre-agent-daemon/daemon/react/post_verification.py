import re
from ..config import logger

_LAST_CMD_BLOCK_RE = re.compile(
    r'=== \[CMD:\s*(.*?)\]\s*===\s*STDOUT:\s*(.*?)STDERR:\s*(.*?)(?=(?:=== \[CMD:)|\Z)',
    re.DOTALL,
)
# Isolates just the command text of every "=== [CMD: <cmd>] ===" block (see
# ssh/session.py's exec_command) -- used when a check needs to scan ONLY what
# was actually typed, not the STDOUT/STDERR that follows on the same block.
# Scanning the raw, un-isolated exec_log for a command verb is unsafe: an error
# message can echo the verb back too (e.g. STDERR "useradd: invalid user name
# ..."), and a naive "grab everything after the verb up to the next command"
# approach would then capture fragments of THAT error text as if they were
# part of the command.
_CMD_TEXT_RE = re.compile(r'=== \[CMD:\s*(.*?)\]\s*===', re.DOTALL)


def _extract_trailing_arg_candidates(cmd_verb, exec_log):
    """For every isolated command invoking cmd_verb (useradd/userdel), returns
    its final argument -- the target username -- preferring a quoted value
    (which preserves internal spaces, e.g. "Venkata redddy") over a bare
    whitespace-delimited token. The username is always the last positional
    argument to useradd/userdel regardless of how many flags precede it, so
    anchoring on the END of the command's own isolated text sidesteps having
    to enumerate every possible flag/flag-with-value combination that could
    precede it.
    """
    results = []
    for cmd_text in _CMD_TEXT_RE.findall(exec_log or ""):
        seg_match = re.search(rf'\b{cmd_verb}\b[^;&]*', cmd_text)
        if not seg_match:
            continue
        m = re.search(r'(?:"([^"]+)"|\'([^\']+)\'|(\S+))\s*$', seg_match.group(0).strip())
        if m:
            val = next((g for g in m.groups() if g), None)
            if val:
                results.append(val)
    return results


def _dedupe_username_fragments(candidates):
    """Drops any single-word candidate that is really just a word-fragment of
    a longer, multi-word candidate also present in the set. Fragile shell-text
    parsing (across several LLM retry attempts with inconsistent quoting) can
    produce both the correct full candidate (e.g. "Venkata redddy", a username
    containing a space) AND a truncated word-fragment of it (e.g. "Venkata" or
    "redddy") from a differently-quoted or malformed attempt at the same
    command. Checking the fragment separately via `id <fragment>` always fails
    -- it was never a real, independent account -- which used to report a
    false post-remediation failure for a remediation that actually succeeded.
    """
    result = set(candidates)
    for c in list(result):
        if len(c.split()) > 1:
            continue
        for other in list(result):
            if other != c and len(other.split()) > 1 and c in other.split():
                result.discard(c)
                break
    return result
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

    # Ground truth for "was this a user-account action" -- the executed exec_log
    # always contains the real useradd/userdel invocation regardless of how the
    # human phrased the ticket (e.g. "create 10 user IDs" doesn't contain the
    # literal "create user" trigger phrase below, but the command that actually
    # ran is unambiguous). Same principle as checking exec_log for the Storage
    # Account branch further down: real executed CLI syntax over ticket-text
    # phrase matching, which is what let this ticket fall through into the
    # Service/Application branch below just because a requested username
    # ("Nexacore01") happened to contain that branch's trigger keyword.
    exec_log_has_user_cmd = bool(re.search(r'\b(useradd|userdel)\b', exec_log or ""))

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

    # --- Kubernetes Deployment / Workload Creation check ---
    # Triggered on exec_log ground truth (an actual `kubectl create deployment`
    # or `kubectl run` was executed), not ticket text -- unlike the Azure Web App
    # branch further below, which matched on the bare phrase "web app" in the
    # ticket and so misfired on tickets like "create a simple web app on
    # Kubernetes worker1OL" whose SOP correctly ran kubectl, not `az webapp
    # create`. Observed live: that ticket got escalated with "Could not identify
    # a specific Azure Web App name" despite the k8s deployment/service/pod
    # having been created successfully and confirmed by the earlier LLM
    # evaluation step. Checked before the generic Service/Application branch and
    # the Azure Web App branch so a real k8s creation is verified on its own
    # terms instead of falling through to either.
    elif re.search(r'kubectl\s+create\s+deployment\s+(\S+)', exec_log) or re.search(r'kubectl\s+run\s+(\S+)', exec_log):
        # [^\s\]]+ (not \S+) throughout this block -- ssh/session.py wraps every
        # executed command as "=== [CMD: <cmd>] ===" with the closing "]" sitting
        # directly against the command text with no separating space, so a plain
        # \S+ token capture can swallow that "]" into the match (e.g. a command
        # ending "...-n prod" becomes "prod]").
        dep_match = re.search(r'kubectl\s+create\s+deployment\s+([^\s\]]+)', exec_log)
        run_match = re.search(r'kubectl\s+run\s+([^\s\]]+)', exec_log)
        _wl_match = dep_match or run_match
        workload = _wl_match.group(1) if _wl_match else None
        # Scope the namespace lookup to the matched kubectl command's own line,
        # not the whole multi-turn exec_log -- a bare "-n <token>" anywhere else
        # in the log (e.g. an unrelated `... | head -n 10` diagnostic command
        # from an earlier turn) would otherwise be picked up as a bogus
        # namespace, and the later `kubectl rollout status -n <bogus>` /
        # `kubectl get pod -n <bogus>` verification would fail against a
        # namespace the workload was never created in.
        namespace = "default"
        if _wl_match:
            line_start = exec_log.rfind("\n", 0, _wl_match.start()) + 1
            line_end = exec_log.find("\n", _wl_match.end())
            if line_end == -1:
                line_end = len(exec_log)
            cmd_line = exec_log[line_start:line_end]
            ns_match = re.search(r'-n\s+([^\s\]]+)|--namespace[=\s]([^\s\]]+)', cmd_line)
            if ns_match:
                namespace = next((g for g in ns_match.groups() if g), "default")
        if not workload:
            is_fixed = False
            evidence_lines.append(
                "❌ Could not identify a specific Kubernetes deployment/workload name from the executed commands to verify — "
                "refusing to assume success without live confirmation."
            )
        elif dep_match:
            ok, out = session.exec_command(f"kubectl rollout status deployment/{workload} -n {namespace} --timeout=20s 2>&1")
            body = clean_ssh_stdout(out).lower()
            if "successfully rolled out" in body:
                evidence_lines.append(f"✅ Deployment '{workload}' rolled out and confirmed live via 'kubectl rollout status'.")
            else:
                is_fixed = False
                evidence_lines.append(f"❌ Deployment '{workload}' did not report a successful rollout live: {clean_ssh_stdout(out)[:300]}")
        else:
            # `kubectl run` creates a bare Pod, not a Deployment -- rollout status
            # doesn't apply. Pod phase is the equivalent live signal; ContainerCreating
            # is expected immediately after creation and is not itself a failure (the
            # daemon's own diagnostic evaluation step already accounts for this), so
            # only a clearly-broken phase counts as unverified here.
            ok, out = session.exec_command(f"kubectl get pod {workload} -n {namespace} -o jsonpath='{{.status.phase}}' 2>&1")
            phase = clean_ssh_stdout(out).upper()
            if phase in ("RUNNING", "SUCCEEDED", "PENDING", "CONTAINERCREATING", ""):
                evidence_lines.append(f"✅ Pod '{workload}' phase after creation: '{phase or 'starting'}' — confirmed live via kubectl.")
            else:
                is_fixed = False
                evidence_lines.append(f"❌ Pod '{workload}' is in unexpected phase '{phase}' after creation.")

    # --- Linux User Account check ---
    # NOTE: "permission" was previously in this trigger list on its own, broad enough
    # to misroute unrelated tickets (e.g. a file-share "permission denied" issue) into
    # this branch ahead of a more appropriate one, since this is a first-match elif
    # chain -- removed. The remaining anchors are specific enough on their own.
    elif exec_log_has_user_cmd or any(k in full_text for k in ["useradd", "linux user", "user account", "provision user", "create user", "userdel", "delete user", "offboard", "pamsudo", "sudoers"]):
        ignore_terms = {
            "bin", "bash", "sh", "etc", "sudoers", "root", "command", "systemctl", "restart", 
            "nexacore", "pamsudox", "puser", "user", "username", "sudo_command", "99-", "90-",
            "null", "dev", "done", "echo", "true", "false", "item", "var", "u", "i"
        }

        candidates = set()

        # Isolated *command text only* -- never STDOUT/STDERR -- for every
        # regex-based extraction check below that isn't already scoped this way.
        # This SSH target is a long-lived shared demo host that has accumulated
        # leftover users/sudoers files from many past, unrelated incidents. A
        # read-only diagnostic/listing step run during THIS incident's own
        # verification (e.g. enumerating /etc/sudoers.d or /home) can legitimately
        # print dozens of those old names in its STDOUT -- and scanning the raw,
        # un-isolated exec_log for username-shaped patterns can't tell that STDOUT
        # apart from a command the agent actually typed. Restricting to the
        # isolated `=== [CMD: ...] ===` command text (what was actually TYPED, not
        # what the remote host printed back) means a read-only listing command
        # contributes zero candidates, since its own command text never names the
        # users it happens to enumerate at runtime. Observed live on INC0002502
        # (bulk-creating Newrelic01-10): this guard pulled in "suorathy3/7/8",
        # "Asha", "Nexacore09", and six "UserNN-nexacore-restart" placeholder
        # names left over from earlier, unrelated demo incidents -- none of which
        # this ticket ever touched -- then failed all of them as "does NOT exist"
        # and escalated a remediation that had actually fully succeeded for every
        # account it was actually asked to create.
        isolated_cmd_text = "\n".join(_CMD_TEXT_RE.findall(exec_log or ""))

        def is_valid_username_candidate(name_str):
            if not name_str or len(name_str) < 2:
                return False
            if name_str.startswith('-') or name_str.isdigit():
                return False
            if name_str.lower() in ignore_terms:
                return False
            # Allows internal single spaces (e.g. "Venkata redddy") -- some tickets
            # ask for a person's full name to be used directly as the username, and
            # this platform's SOPs do create such accounts (via useradd --badname).
            # Still rejects leading/trailing spaces and runs of multiple spaces.
            return bool(re.match(r'^[a-zA-Z0-9_][a-zA-Z0-9_\-]*(?: [a-zA-Z0-9_\-]+)*$', name_str))

        # 0. From the ticket's own text: "user <NAME> on/with/...". The single most
        # direct, human-authored statement of intent, immune to the shell-quoting
        # noise across multiple LLM retry attempts that checks 1/3/4/4b below parse.
        # Needed specifically for a multi-word username (e.g. a ticket asking to
        # create account "Venkata redddy"): every exec_log-based check below can
        # only ever recover word-FRAGMENTS of such a name, because a shell command
        # echoes it with inconsistent quoting across retries (unquoted, quoted,
        # quoted+escaped) -- observed live on INC0002501, where this guard extracted
        # "Venkata" as its own bogus candidate and reported the real, successfully
        # created "Venkata redddy" account as a useradd failure. Uses the ORIGINAL
        # short_desc/desc (not the lowercased full_text) so the extracted name keeps
        # its real casing -- `id`/`useradd` are case-sensitive.
        # "account" alone (without "named"/"called" after it) must ALSO be
        # skippable -- "Create Linux user account Shreya on Worker1OL" is at
        # least as common a phrasing as "user account named Shreya", but the
        # previous pattern only skipped "account" when "named"/"called"
        # immediately followed it. Since the skip-group as a whole is
        # optional, requiring the literal word "named"/"called" meant it
        # simply failed to match at all on the bare "account <NAME>" form,
        # and the capture group greedily absorbed "account" into the
        # username itself -- observed live: "account Shreya" reported as a
        # failed useradd for a user that had actually been created correctly.
        ticket_name_match = re.search(
            r'\buser\s+(?:account\s+(?:named\s+|called\s+)?)?([A-Za-z][A-Za-z0-9_\-]*(?:\s[A-Za-z0-9_\-]+)*?)(?=\s+(?:on|with|in|for|to|from)\b|[.,]|$)',
            f"{short_desc} {desc}"
        )
        if ticket_name_match:
            ticket_candidate = ticket_name_match.group(1).strip()
            if is_valid_username_candidate(ticket_candidate):
                candidates.add(ticket_candidate)

        # 1. From bash for loops: for u in user1 user2 ...;
        loop_matches = re.findall(r'for\s+\w+\s+in\s+([^;]+);', isolated_cmd_text)
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

        # 3. From explicit useradd/userdel commands -- the username is always the
        # LAST positional argument, so _extract_trailing_arg_candidates anchors on
        # the end of each isolated command rather than trying to skip over every
        # possible flag/flag-with-value combination that could precede it (the old
        # skip-then-capture regex here silently truncated a quoted, space-containing
        # username at its first word, e.g. "Venkata redddy" -> "Venkata").
        raw_created = _extract_trailing_arg_candidates("useradd", exec_log)
        raw_deleted = _extract_trailing_arg_candidates("userdel", exec_log)
        # Allows internal spaces in the captured path segment too, same reasoning as
        # is_valid_username_candidate above -- a sudoers.d filename derived from a
        # multi-word username (e.g. /etc/sudoers.d/99-Venkata redddy) previously got
        # truncated the same way.
        raw_sudoers = re.findall(r'/etc/sudoers\.d/(?:99-|90-)?([a-zA-Z0-9_\-]+(?:\s[a-zA-Z0-9_\-]+)*)', isolated_cmd_text)

        for raw in raw_created + raw_deleted + raw_sudoers:
            clean_r = raw.strip('"\';$(){}[]')
            if is_valid_username_candidate(clean_r):
                candidates.add(clean_r)

        # 4. From bash brace-expansion loops with variable interpolation:
        # for i in {01..10}; do userdel -r Nexacore$i; done. Neither check 1
        # (which only splits literal tokens between "in" and ";", so "{01..10}"
        # stays an unparsed brace-range token) nor check 3 (whose capture group
        # excludes "$", so `Nexacore$i` only ever yields the bare stem
        # "Nexacore" -- which is coincidentally also a required ignore_terms
        # entry, since "nexacore" alone appears as an unrelated trigger keyword
        # elsewhere in this file) can resolve this into actual usernames. This
        # generalizes to any PREFIX$var loop over a brace range, not just this
        # one ticket's naming scheme -- observed live on INC0001479, where the
        # HITL-approved bulk userdel used exactly this pattern and left
        # users_to_check empty despite the deletion having actually run.
        brace_loop_re = re.compile(r'for\s+(\w+)\s+in\s+\{(\d+)\.\.(\d+)\}\s*;?\s*do\s+(.*?)done', re.DOTALL)
        for loop_var, range_start, range_end, loop_body in brace_loop_re.findall(isolated_cmd_text):
            width = len(range_start)
            prefixes = re.findall(rf'([a-zA-Z][a-zA-Z0-9_\-]*)\$\{{?{re.escape(loop_var)}\}}?', loop_body)
            for prefix in set(prefixes):
                for n in range(int(range_start), int(range_end) + 1):
                    candidates.add(f"{prefix}{str(n).zfill(width)}")

        # 4b. The other bash idiom for the same thing: the prefix is fused
        # directly onto the brace range in the iterable itself --
        # `for u in Nexacore{01..10}; do ...; done` -- which bash expands into
        # the literal list Nexacore01 Nexacore02 ... before the loop body ever
        # runs, so unlike 4 above the prefix doesn't need to be found in the
        # body at all; it's already sitting right next to the range. Observed
        # live back-to-back with the 4-shaped variant on the same incident
        # (INC0001479) across two separate LLM-generated command attempts for
        # the identical request -- both are common, interchangeable ways to
        # write "loop over N numbered names" and neither is specific to any
        # one naming scheme.
        for prefix, range_start, range_end in re.findall(r'in\s+([a-zA-Z][a-zA-Z0-9_\-]*)\{(\d+)\.\.(\d+)\}', isolated_cmd_text):
            width = len(range_start)
            for n in range(int(range_start), int(range_end) + 1):
                candidates.add(f"{prefix}{str(n).zfill(width)}")

        candidates = _dedupe_username_fragments(candidates)

        is_deletion = any(k in full_text for k in ["delete", "remove", "offboard", "userdel", "deprovision"])
        users_to_check = list(candidates)

        if users_to_check:
            for u in users_to_check[:15]:
                # Quoted: u can now contain a space (see is_valid_username_candidate
                # above) -- an unquoted `id {u}` would pass "Venkata" and "redddy" as
                # two separate positional args to `id`, the exact same shell mistake
                # the ReAct loop itself made and had to retry past.
                ok, out = session.exec_command(f'id "{u}" 2>&1')
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
    elif not exec_log_has_user_cmd and not any(k in full_text for k in ["pamsudo", "sudoers", "useradd", "userdel", "user account"]) and any(k in full_text for k in ["service down", "crash", "502", "bad gateway", "outage", "nexacore", "application down"]):
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
            # No restart/start command in the log isn't automatically a failure --
            # the ReAct loop may have investigated (systemctl status, ss -tulpn),
            # found the service already healthy, and correctly executed nothing.
            # Observed live on INC0001726: the loop concluded "the Nexacore
            # application is actually running correctly on port 8080" and the
            # earlier LLM verification step agreed, yet this branch escalated it
            # anyway because it only knew how to check "restart ran, is it up",
            # never "nothing ran, is it up anyway". Fall back to a live port probe
            # on this guard's own SSH session before failing closed -- same
            # "verify what's actually true right now" principle every other check
            # in this function already applies, just reachable from the
            # no-restart-needed path too instead of only the restart-happened one.
            # The bare ":(\d{2,5})" fallback previously matched ANY colon-digit run in
            # the ticket text, including a plain timestamp like "escalated at 09:45" --
            # producing a bogus "port" and probing the wrong endpoint entirely. Requiring
            # a host-like token (an IP, or something starting with a letter) before the
            # colon excludes "HH:MM" (which is pure digits on both sides) while still
            # matching "workernode1hl:8080", "192.168.56.10:8080", "http://x:8080/", etc.
            port_match = re.search(r"port\s+(\d{2,5})\b", full_text) or re.search(
                r"\b(?:(?:\d{1,3}\.){1,3}\d{1,3}|[a-z][a-z0-9.\-]*):(\d{2,5})\b", full_text
            )
            port = port_match.group(1) if port_match else None
            if port:
                ok, out = session.exec_command(f"curl -s -o /dev/null -w '%{{http_code}}' --max-time 5 http://localhost:{port}")
                http_code = clean_ssh_stdout(out)
                if http_code.isdigit() and 200 <= int(http_code) < 500:
                    evidence_lines.append(
                        f"✅ No restart command was executed, but a live probe confirms the application is already "
                        f"responding on port {port} (HTTP {http_code}) — no action was needed."
                    )
                else:
                    is_fixed = False
                    evidence_lines.append(
                        f"❌ No restart command was executed, and a live probe on port {port} got '{http_code or 'no response'}' "
                        f"-- refusing to assume success without live confirmation."
                    )
            else:
                is_fixed = False
                evidence_lines.append(
                    "❌ Could not identify a specific service/workload name from the executed restart command, nor a port "
                    "to live-probe, to verify — refusing to assume success without live confirmation."
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
    elif "kubectl" not in exec_log.lower() and any(k in full_text for k in ["web app", "webapp", "app service", "appservice"]):
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

    # --- Azure Storage Account check ---
    # Must be checked before the generic Resource Group branch below, same reason
    # as the Web App branch above: "create a storage account in AI-Playground
    # resource group" contains the words "resource group" as incidental context
    # (which RG to put it in), not as the actual deliverable, but the generic
    # branch below matches on that substring regardless and then fails to find
    # any `az group create` command (there isn't one -- the RG already existed),
    # so it reports "could not verify" on a ticket it was never actually
    # equipped to check. Observed live on INC0001467: the storage account was
    # genuinely created (confirmed live via `az storage account list`) but this
    # gap made the guard reject it, triggering a full unnecessary re-run.
    elif "storage account" in full_text or "az storage account" in exec_log.lower():
        # Checking exec_log too (not just full_text/ticket description) matters:
        # this ticket's own text has a typo ("stroage account"), so a check
        # against full_text alone never matched and this branch was silently
        # skipped in favor of the generic Resource Group branch below -- exactly
        # the same class of bug as the earlier RAG keyword-guard that a typo also
        # defeated. exec_log contains the actual executed `az storage account
        # create ...` command, which is real CLI syntax and therefore always
        # spelled correctly regardless of how the human-written ticket text reads.
        _is_sa_deletion = any(k in full_text for k in ["delete", "remove", "deprovision", "teardown"])
        if _is_sa_deletion:
            # Delete-intent ticket -- verifying via a "provisioningState:
            # Succeeded" text match (used for the create case below) is actively
            # wrong here: that text is a completely normal field on any *existing*
            # storage account's own metadata (e.g. from an `az storage account
            # list` probe enumerating what to delete), unrelated to whether this
            # ticket's delete action happened. Observed live on INC0001468: the
            # actual `az storage account delete` was correctly blocked by the
            # enterprise safety guard (destructive commands require an exact
            # text match to the approved SOP, and the model's piped
            # list-then-delete-loop didn't match) -- nothing was deleted -- but
            # the create-path's loose fallback matched stale "Succeeded" text
            # from an earlier list/show step and falsely marked this RESOLVED.
            # Delete evidence must come from a delete command that actually ran.
            delete_blocks = re.findall(r'az\s+storage\s+account\s+delete\b[^\n]*', exec_log, re.IGNORECASE)
            has_delete_error = bool(re.search(r'az\s+storage\s+account\s+delete\b.*?(?:error|forbidden|denied|blocked)', exec_log, re.IGNORECASE | re.DOTALL))
            if not delete_blocks or has_delete_error:
                is_fixed = False
                evidence_lines.append(
                    "❌ No `az storage account delete` command was found to have actually executed "
                    "(it may have been blocked by the enterprise safety guard, which requires an exact "
                    "command-text match to the approved SOP for destructive operations) — refusing to "
                    "assume deletion succeeded without live confirmation."
                )
            else:
                ok, out = session.exec_command("az storage account list --query '[].name' -o tsv 2>&1")
                still_present = clean_ssh_stdout(out).splitlines()
                if still_present:
                    is_fixed = False
                    evidence_lines.append(f"❌ Azure Storage Account(s) still present after delete attempt: {', '.join(still_present)}.")
                else:
                    is_fixed = True
                    evidence_lines.append("✅ Verified all Azure Storage Accounts removed from the resource group via live 'az storage account list'.")
        else:
            # Only the LAST `create` command's name counts as the target to verify.
            # Two false rejections observed live, both from over-broad name
            # collection: (1) collecting names from show/list probes too -- a
            # multi-turn run routinely checks "does X already exist?" with a guessed
            # name before creating under a different one; (2) collecting names from
            # EVERY create attempt -- Azure storage account names are globally
            # unique across all Azure customers, so a first attempt with a plausible
            # but already-taken name (e.g. "mystorageaccount") fails, the model
            # correctly notices and retries with a collision-safe generated name,
            # and that retry succeeds. Requiring the first (abandoned) name to also
            # exist live fails a genuinely successful run. Only the last attempted
            # name reflects what the run actually settled on and (per the "did this
            # actually happen" question this guard exists to answer) is the only
            # one that matters -- same "last command represents the outcome"
            # principle _last_command_unrecovered_error() above already uses.
            created_names = re.findall(r'az\s+storage\s+account\s+create\s+.*?(?:-n|--name)\s+([^\s]+)', exec_log)
            sa_names = {created_names[-1]} if created_names else set()
            # The create command's --name is routinely a shell variable
            # ($STORAGE_ACCOUNT_NAME, generated with a timestamp/random suffix to
            # avoid global-namespace collisions -- Azure storage account names are
            # globally unique) rather than a literal string, so it can't be checked
            # against a live listing by name. Those get dropped from sa_names below;
            # if that empties the set entirely, fall back to reading the executed
            # `az storage account show ... --query provisioningState` step's own
            # STDOUT (the SOP's own verification step) for "Succeeded" -- still live
            # evidence from this run, just keyed on outcome text instead of a name.
            # Scoped to CMD blocks that actually invoke `storage account create/show`
            # (not the whole exec_log) so a pre-existing, unrelated account's own
            # "Succeeded" metadata from an earlier list/show probe can't satisfy this.
            literal_sa_names = {n for n in sa_names if not n.startswith("$")}
            _sa_cmd_blocks = _LAST_CMD_BLOCK_RE.findall(exec_log or "")
            _sa_relevant_output = "\n".join(
                f"{stdout}\n{stderr}" for cmd, stdout, stderr in _sa_cmd_blocks
                if re.search(r'storage\s+account\s+(?:create|show)\b', cmd, re.IGNORECASE)
            )
            if not literal_sa_names and re.search(r'provisioningstate.*?succeeded|"succeeded"', _sa_relevant_output, re.IGNORECASE | re.DOTALL):
                is_fixed = True
                evidence_lines.append("✅ Verified Azure Storage Account creation via the executed `provisioningState` check reporting 'Succeeded' (name was a shell variable, not a literal, so live name-lookup wasn't possible).")
            elif not literal_sa_names and not sa_names:
                is_fixed = False
                evidence_lines.append(
                    "❌ Could not identify a specific Azure Storage Account name from the executed commands to verify — "
                    "refusing to assume success without live confirmation."
                )
            elif not literal_sa_names:
                is_fixed = False
                evidence_lines.append(
                    "❌ Storage account name was a shell variable and no 'provisioningState: Succeeded' evidence was found in the executed output — "
                    "refusing to assume success without live confirmation."
                )
            else:
                sa_names = literal_sa_names
                ok, out = session.exec_command("az storage account list --query '[].name' -o tsv 2>&1")
                existing_sas = clean_ssh_stdout(out).splitlines()
                missing = [sa for sa in sa_names if sa not in existing_sas]
                if missing:
                    is_fixed = False
                    evidence_lines.append(f"❌ Azure Storage Account(s) {', '.join(missing)} NOT found live via 'az storage account list'.")
                else:
                    is_fixed = True
                    evidence_lines.append(f"✅ Verified Azure Storage Account(s) {', '.join(sa_names)} live via 'az storage account list'.")

    # --- Azure Resource Group / Cloud Resources check ---
    elif any(k in full_text for k in ["resource group", "az group", "azure resource", "azure group"]):
        is_deletion = any(k in full_text for k in ["delete", "destroy", "remove", "teardown", "drop", "purge", "clean"])
        is_all_groups = any(k in full_text for k in ["delete all", "all resource group", "all group", "all rg", "all azure"])

        if is_deletion:
            deleted_rgs = set(re.findall(r'az\s+group\s+delete\s+(?:--name|-n)\s+["\']?([^\s"\']+)["\']?', exec_log))
            ok, out = session.exec_command("az group list --query \"[?properties.provisioningState!='Deleting'].name\" -o tsv 2>&1")
            existing_rgs = [rg.strip() for rg in clean_ssh_stdout(out).splitlines() if rg.strip()]

            if is_all_groups or "delete all" in exec_log.lower():
                if not existing_rgs:
                    is_fixed = True
                    evidence_lines.append("✅ Verified all Azure Resource Groups were deleted live (az group list is empty or remaining groups are in Deleting state).")
                else:
                    is_fixed = False
                    evidence_lines.append(f"❌ Azure Resource Groups still exist live: {', '.join(existing_rgs)}.")
            elif deleted_rgs:
                still_existing = [rg for rg in deleted_rgs if rg in existing_rgs]
                if still_existing:
                    is_fixed = False
                    evidence_lines.append(f"❌ Azure Resource Group(s) {', '.join(still_existing)} still exist in subscription.")
                else:
                    is_fixed = True
                    evidence_lines.append(f"✅ Verified {len(deleted_rgs)} Azure Resource Group(s) were deleted live: {', '.join(deleted_rgs)}.")
            else:
                if not existing_rgs:
                    is_fixed = True
                    evidence_lines.append("✅ Verified Azure subscription contains 0 Resource Groups live via 'az group list'.")
                else:
                    is_fixed = False
                    evidence_lines.append(
                        "❌ Could not identify a specific Azure Resource Group name from the executed commands to verify — "
                        "refusing to assume success without live confirmation."
                    )
        else:
            rg_matches = set(re.findall(r'az\s+group\s+create\s+(?:--name|-n)\s+["\']?([^\s"\']+)["\']?', exec_log))
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
