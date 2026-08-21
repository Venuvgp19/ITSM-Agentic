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
                "9. CONSTRAINED SOP COMMAND ADAPTATION: Use the approved 'SOP Guide Commands' as a strict foundational blueprint. You are authorized to adapt and parameterize ONLY the specific commands/binaries present in the SOP Guide (substituting target usernames, IPs, service names, or file paths). You are STRICTLY PROHIBITED from introducing completely new command binaries that are absent from the approved SOP blueprint."
            )
        },
        {"role": "user", "content": f"Target Host: {ip}\nIncident Short Desc: {short_desc}\nIncident Full Description:\n{desc}\n\nSOP Guide Commands:\n" + json.dumps(guide_commands)}
    ]

    full_exec_log = ""
    is_success = True
    
    max_turns = max(35, len(guide_commands) * 5)
    turn = 0
    
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
                    temperature=0.1
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
                                error_msg = (
                                    f"SECURITY ERROR: Command '{cmd}' is prohibited by enterprise safety guard ({unauth_bins}). "
                                    f"Destructive/unauthorized operations are strictly forbidden."
                                )
                                post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "🛡️ Security Block", "FAILED", f"Security Block: {cmd}")
                                messages.append({
                                    "role": "tool",
                                    "tool_call_id": tc.id,
                                    "name": tc.function.name,
                                    "content": error_msg
                                })
                                is_success = False
                                continue
                            
                            post_timeline_update(inc_id, number, short_desc, ci_name, "RUNNING", "💻 Dynamic SSH Execution", "RUNNING", f"LLM executing: {cmd}")
                            
                            ok, out_log = session.exec_command(cmd)
                            full_exec_log += out_log
                            
                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc.id,
                                "name": tc.function.name,
                                "content": out_log
                            })
                            if not ok:
                                is_success = False
                                if "SERVER_UNREACHABLE" in out_log:
                                    logger.warning(f"🚨 Server {ip} unreachable during ReAct loop turn {turn}. Breaking out of ReAct loop immediately!")
                                    full_exec_log += f"\n=== SERVER UNREACHABLE ALERT ===\nServer {ip} failed SSH reachability check. Exited ReAct loop.\n"
                                    return False, full_exec_log
                else:
                    raw_summary = msg.content or ""
                    clean_summary = clean_thinking_text(raw_summary)
                    if turn <= 3 and (not clean_summary or "thinking process" in raw_summary.lower() or len(clean_summary) < 15):
                        logger.info(f"ℹ️ ReAct Loop turn {turn}: LLM outputted thinking prose without tool calls. Re-prompting for direct tool execution...")
                        messages.append({
                            "role": "user",
                            "content": "CRITICAL DIRECTIVE: Do NOT output thinking prose or analysis blocks. Execute the required SSH tool calls immediately using execute_ssh_command."
                        })
                        continue

                    logger.info(f"✅ ReAct Loop finished for {number}: {clean_summary}")
                    full_exec_log += f"\n=== FINAL AGENT SUMMARY ===\n{clean_summary}\n"
                    break
            except Exception as e:
                logger.error(f"ReAct Loop Error: {e}")
                full_exec_log += f"\n=== ERROR ===\n{str(e)}\n"
                is_success = False
                break
    finally:
        session.close()
            
    return is_success, full_exec_log
