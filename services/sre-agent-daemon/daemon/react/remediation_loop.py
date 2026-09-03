import json
from ..config import logger
from ..session_state import default_session_state
from ..llm import invoke_llm_with_fallback as default_invoke_llm, clean_thinking_text
from ..ssh.session import PersistentSSHSession
from ..safety.validator import is_allowed_command_adaptation
from ..itsm.dashboard import post_timeline_update

def run_dynamic_react_loop(
    ip, user, password, guide_commands, short_desc, number, inc_id, ci_name,
    desc="",
    session_state=None,
    ssh_session_factory=None,
    llm_invoker=None,
    is_human_authorized: bool = False
):
    logger.info(f"🚀 Starting Dynamic ReAct Loop for {number} (is_human_authorized={is_human_authorized})")
    state = session_state or default_session_state
    invoker = llm_invoker or default_invoke_llm
    session_factory = ssh_session_factory or (lambda _ip, _u, _p: PersistentSSHSession(_ip, _u, _p))

    tools = [
        {
            "type": "function",
            "function": {
                "name": "execute_ssh_command",
                "description": "Executes a single SSH command on the target host and returns the stdout/stderr.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "The exact shell command to execute."
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
                "You are an elite, hyper-efficient IT DevOps Agent. You must resolve the incident in the MINIMUM required steps using the SOP guide and Incident payload.\n"
                "RULES FOR MAXIMUM EFFICIENCY & SAFETY:\n"
                "1. NO DUPLICATE COMMANDS: Never run duplicate checks (e.g. repeating `ps aux`, `ss -tlnp`, `tail`, or `cat` if already performed in a previous turn).\n"
                "2. COMPLETE APPLICATION STARTUP: If an application or service is down, you MUST execute the startup command AFTER clearing ports/processes.\n"
                "3. BULK CREATION & DELETION RULE: If the incident requests creating or deleting multiple users, you MUST process EVERY SINGLE USER requested in the Incident payload (e.g. all 5 users, user01..user20). Combine user creation, password assignment, and sudo permissions into chained one-liners (e.g. `id -u $u &>/dev/null || (useradd -m -s /bin/bash $u && echo '$u:$pass' | chpasswd && echo '$u ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/99-$u && chmod 440 /etc/sudoers.d/99-$u)`) or bash loops (`for u in ...; do ...; done`) to complete the entire batch in 1-2 turns rather than executing separate individual sub-commands across many turns.\n"
                "4. PERMISSION VS SERVICE RESTART RULE: If the incident requests granting user access/sudoers rules for a target command (e.g. 'permission to execute systemctl restart sshd'), DO NOT execute that target command (e.g. DO NOT run `systemctl restart sshd`) on the live host unless the approved SOP explicitly instructs to restart it!\n"
                "5. OUTPUT FORMAT DIRECTIVE: Perform internal reasoning silently. Do NOT output internal `<thought>` or `<thinking>` tags or chain-of-thought blocks in your responses. Output ONLY direct tool calls and concise execution summaries.\n"
                "6. ONE-PASS VERIFICATION: Once all operations are executed and verified, IMMEDIATELY STOP calling tools and output your final summary.\n"
                "7. NATIVE SHELL ONLY: DO NOT prepend 'ssh root@ip' to commands.\n"
                "8. NON-INTERACTIVE EXECUTION ONLY: Automated SSH sessions cannot accept interactive human inputs. NEVER execute interactive auth prompts like `az login --use-device-code`, `nano`, or `read -p`.\n"
                "9. CONSTRAINED SOP COMMAND ADAPTATION: Use the approved 'SOP Guide Commands' as a strict foundational blueprint. You are authorized to adapt and parameterize ONLY the specific commands/binaries present in the SOP Guide (substituting target usernames, IPs, service names, or file paths). You are STRICTLY PROHIBITED from introducing completely new command binaries that are absent from the approved SOP blueprint.\n"
                "10. NO REDUNDANT AUTHENTICATION: Do NOT run `az login` or re-authentication commands. All target nodes (WorkerNode1HL, control plane) have active pre-authenticated sessions and valid subscriptions. Proceed directly to executing the required resource operations (`az group create`, `az resource`, etc.).\n"
                "11. ULTIMATE VERIFICATION: Focus on fulfilling the incident requirement (e.g. creating the requested resource groups, users, or services). Output a clear summary once all requested items are created.\n"
                "12. SERVICE STABILIZATION PAUSE: Whenever starting, enabling, or restarting a system service (e.g. systemctl restart/start/enable, docker/podman start), always wait 10 seconds before verifying listening ports or checking service status.\n"
                "13. USER ACCESS LEVEL RULE: When the SOP Guide offers multiple labeled access-level blocks (e.g. '[ACCESS: FULL ADMIN]', '[ACCESS: RESTRICTED SINGLE-COMMAND]', '[ACCESS: STANDARD USER]'), use ONLY the block matching what the incident actually requests. 'admin access'/'root access'/'full sudo' -> FULL ADMIN block. Access limited to running one named command -> RESTRICTED SINGLE-COMMAND block (substitute the exact command path the ticket names). No mention of admin/root/sudo access at all -> STANDARD USER block (skip creating any sudoers entry). Never grant broader access than the incident requests."
            )
        },
        {"role": "user", "content": f"Target Host: {ip}\nIncident Short Desc: {short_desc}\nIncident Full Description:\n{desc}\n\nSOP Guide Commands:\n" + json.dumps(guide_commands)}
    ]

    full_exec_log = ""
    is_success = True

    max_turns = max(35, len(guide_commands) * 5)
    turn = 0

    def _validate_or_block(cmd):
        """Shared with the primary tool-calling path's inline check at ~line 101 --
        both deterministic fallback loops below used to execute guide_commands
        directly with NO safety validation at all, unlike the LLM tool-calling path.
        Every command that reaches session.exec_command, on any path, must go
        through this first."""
        is_allowed, unauth_bins = is_allowed_command_adaptation(cmd, guide_commands, is_human_authorized=is_human_authorized)
        if not is_allowed:
            logger.critical(f"🛡️ SOP / ENTERPRISE SAFETY BLOCK (fallback path): Blocked command '{cmd}' as forbidden/unauthorized: {unauth_bins}")
            post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Enterprise Security Guard", "FAILED", f"Security Block (fallback): {cmd}")
        return is_allowed, unauth_bins

    session = session_factory(ip, user, password)
    try:
        while turn < max_turns:
            turn += 1
            logger.info(f"🔄 ReAct Loop Turn {turn} for {number}...")
            
            try:
                msg, used_model = invoker(
                    messages=messages,
                    tools=tools,
                    return_message=True,
                    call_label=f"ReAct Loop Turn {turn}",
                    session_state=state,
                    enable_thinking=False,
                    max_tokens=1024,
                    temperature=0.1,
                    role="resolver"
                )
                if not msg:
                    raise Exception("All fallback models failed to return a valid response.")
                messages.append(msg)
                
                if msg.tool_calls:
                    for tc in msg.tool_calls:
                        if tc.function.name == "execute_ssh_command":
                            args = json.loads(tc.function.arguments)
                            cmd = args.get("command")
                            logger.info(f"🛠️ LLM decided to execute tool: {cmd}")
                            
                            is_allowed, unauth_bins = is_allowed_command_adaptation(cmd, guide_commands, is_human_authorized=is_human_authorized)
                            if not is_allowed:
                                logger.critical(f"🛡️ SOP / ENTERPRISE SAFETY BLOCK: Blocked command '{cmd}' as forbidden/unauthorized: {unauth_bins}")
                                post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Enterprise Security Guard", "FAILED", f"Security Block: {cmd}")
                                if not is_human_authorized and not any("DESTRUCTIVE_COMMAND" in b for b in unauth_bins):
                                    # Not a catastrophic-pattern block (those stay hard-blocked
                                    # regardless) -- just a binary the auto-approved SOP text
                                    # didn't resolve to. Rather than tell the LLM "forbidden" and
                                    # let it burn the remaining ~30 turns re-phrasing the same
                                    # blocked binary (observed live: 25 turns, ~$1.30, zero
                                    # progress), stop immediately and hand off to the orchestrator
                                    # to request one HITL approval for this incident/binary.
                                    full_exec_log += (
                                        f"\n=== UNAUTHORIZED_BINARY_NEEDS_APPROVAL ===\n"
                                        f"Command: {cmd}\nBinaries: {sorted(unauth_bins)}\n"
                                    )
                                    return False, full_exec_log
                                error_msg = (
                                    f"SECURITY ERROR: Command '{cmd}' is prohibited by enterprise safety guard ({unauth_bins}). "
                                    f"Destructive/unauthorized operations are strictly forbidden."
                                )
                                messages.append({
                                    "role": "tool",
                                    "tool_call_id": tc.id,
                                    "name": tc.function.name,
                                    "content": error_msg
                                })
                                continue
                            
                            post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Dynamic SSH Execution", "RUNNING", f"LLM executing: {cmd}")
                            
                            ok, out_log = session.exec_command(cmd)
                            full_exec_log += out_log
                            
                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc.id,
                                "name": tc.function.name,
                                "content": out_log
                            })
                            if not ok:
                                if "SERVER_UNREACHABLE" in out_log:
                                    logger.warning(f"🚨 Server {ip} unreachable during ReAct loop turn {turn}. Breaking out of ReAct loop immediately!")
                                    full_exec_log += f"\n=== SERVER UNREACHABLE ALERT ===\nServer {ip} failed SSH reachability check. Exited ReAct loop.\n"
                                    post_timeline_update(inc_id, number, short_desc, ci_name, "FAILED", "Dynamic SSH Execution", "FAILED", f"Server {ip} unreachable via SSH.")
                                    return False, full_exec_log
                                elif "EXECUTION BLOCKED" in out_log and "Kill Switch" in out_log:
                                    # Any other ok=False mid-run was previously absorbed silently, letting the
                                    # loop continue and potentially still end in is_success=True later even
                                    # though the kill switch stopped a command from actually running.
                                    logger.warning(f"🛑 Kill switch blocked mid-execution for {number}. Aborting ReAct loop.")
                                    post_timeline_update(inc_id, number, short_desc, ci_name, "FAILED", "Dynamic SSH Execution", "FAILED", f"Kill switch blocked execution: {cmd}")
                                    return False, full_exec_log
                else:
                    raw_summary = msg.content or ""
                    clean_summary = clean_thinking_text(raw_summary)

                    # Hallucination Guard: Check if the model outputted conversational prose or a story without executing commands
                    has_executed_commands = len(full_exec_log.strip()) > 0
                    is_hallucination_text = any(w in raw_summary.lower() for w in [
                        "story about", "once upon a time", "a dream", "developer who loves", "fictional", "thinking process"
                    ])

                    if not has_executed_commands and guide_commands and len(guide_commands) > 0:
                        if turn <= 2 and not is_hallucination_text:
                            logger.warning(f"⚠️ ReAct Loop Turn {turn}: LLM returned prose without calling execute_ssh_command tool. Re-prompting...")
                            messages.append({
                                "role": "user",
                                "content": f"CRITICAL DIRECTIVE: You have not executed any commands yet. You MUST call the `execute_ssh_command` tool to run the required SOP commands: {json.dumps(guide_commands)}"
                            })
                            continue
                        else:
                            # Deterministic fallback: Execute the approved guide commands directly on the host!
                            logger.info(f"⚡ Model returned prose without tool calls — deterministically executing {len(guide_commands)} approved SOP commands directly via SSH...")
                            any_cmd_failed = False
                            for cmd in guide_commands:
                                is_allowed, unauth_bins = _validate_or_block(cmd)
                                if not is_allowed:
                                    full_exec_log += f"\n=== [CMD: {cmd}] ===\nSTDOUT:\nSTDERR:\nSECURITY ERROR: blocked by enterprise safety guard ({unauth_bins}).\n"
                                    any_cmd_failed = True
                                    continue
                                post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Dynamic SSH Execution", "RUNNING", f"Executing approved SOP: {cmd}")
                                ok, out_log = session.exec_command(cmd)
                                full_exec_log += out_log
                                if not ok:
                                    any_cmd_failed = True
                                    if "SERVER_UNREACHABLE" in out_log:
                                        logger.warning(f"🚨 Server {ip} unreachable during fallback execution for {number}.")
                                        post_timeline_update(inc_id, number, short_desc, ci_name, "FAILED", "Dynamic SSH Execution", "FAILED", f"Server {ip} unreachable via SSH.")
                                        return False, full_exec_log

                            clean_summary = f"Directly executed approved SOP commands:\n" + "\n".join([f"- `{c}`" for c in guide_commands])
                            full_exec_log += f"\n=== FINAL AGENT SUMMARY ===\n{clean_summary}\n"
                            post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Dynamic SSH Execution",
                                                  "FAILED" if any_cmd_failed else "SUCCESS", clean_summary)
                            is_success = not any_cmd_failed
                            break

                    if turn <= 3 and (not clean_summary or is_hallucination_text or len(clean_summary) < 15):
                        logger.info(f"ℹ️ ReAct Loop turn {turn}: LLM outputted thinking prose/hallucination without tool calls. Re-prompting for direct tool execution...")
                        messages.append({
                            "role": "user",
                            "content": "CRITICAL DIRECTIVE: Do NOT output thinking prose, stories, or analysis blocks. Execute the required SSH tool calls immediately using execute_ssh_command."
                        })
                        continue

                    logger.info(f"✅ ReAct Loop finished for {number}: {clean_summary}")
                    full_exec_log += f"\n=== FINAL AGENT SUMMARY ===\n{clean_summary}\n"
                    post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "Dynamic SSH Execution", "SUCCESS", f"Dynamic SSH Execution completed: {clean_summary}")
                    is_success = True
                    break
            except Exception as e:
                logger.error(f"ReAct Loop Error: {e}")
                
                # If error occurred but we have approved commands and haven't executed them, execute directly
                if guide_commands and len(guide_commands) > 0 and len(full_exec_log.strip()) == 0:
                    logger.info(f"⚡ Exception in ReAct loop — executing approved SOP commands directly as safety fallback: {guide_commands}")
                    any_cmd_failed = False
                    for cmd in guide_commands:
                        is_allowed, unauth_bins = _validate_or_block(cmd)
                        if not is_allowed:
                            full_exec_log += f"\n=== [CMD: {cmd}] ===\nSTDOUT:\nSTDERR:\nSECURITY ERROR: blocked by enterprise safety guard ({unauth_bins}).\n"
                            any_cmd_failed = True
                            continue
                        try:
                            ok, out_log = session.exec_command(cmd)
                            full_exec_log += out_log
                            if not ok:
                                any_cmd_failed = True
                        except Exception as exec_err:
                            full_exec_log += f"\nCommand execution error for {cmd}: {exec_err}\n"
                            any_cmd_failed = True
                    is_success = not any_cmd_failed
                    break

                full_exec_log += f"\n=== ERROR ===\n{str(e)}\n"
                is_success = False
                break
    finally:
        session.close()
            
    return is_success, full_exec_log
