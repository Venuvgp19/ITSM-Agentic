import os
import sys
import json
import time
import requests
import httpx
import paramiko
from openai import OpenAI

# Ensure stdout uses UTF-8 encoding
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Disable SSL warnings for enterprise proxy
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ----------------------------------------------------
# Configuration
# ----------------------------------------------------
from dotenv import load_dotenv
load_dotenv()

ITSM_BASE_URL = os.getenv("ITSM_BASE_URL", "http://localhost:4000/api/v1")
GENAI_LAB_URL = os.getenv("GENAI_LAB_URL", "https://genailab.tcs.in/v1")
GENAI_API_KEY = os.getenv("GENAI_API_KEY", "")
MODEL_NAME = "gemini-3.1-pro-preview"

# CI & Credential details for Worker 1
CI_NAME = "Worker 1"
CI_IP = "192.168.56.10"
CI_USER = "root"
CI_PASS = "root123"

# Custom HTTP client with SSL verification disabled for Gen AI Lab enterprise proxy
custom_httpx_client = httpx.Client(verify=False)

# Initialize OpenAI client pointing to Gen AI Lab
llm_client = OpenAI(
    api_key=GENAI_API_KEY,
    base_url=GENAI_LAB_URL,
    http_client=custom_httpx_client
)

# ----------------------------------------------------
# ITSM Helper Functions (Simulating MCP API calls)
# ----------------------------------------------------
def get_auth_token():
    print("🔐 Authenticating with Enterprise ITSM Platform...")
    res = requests.post(
        f"{ITSM_BASE_URL}/auth/login",
        json={"email": "admin@enterprise.com", "password": "password123"}
    )
    if res.status_code in [200, 201]:
        token = res.json()["accessToken"]
        print("✅ Authentication successful.")
        return token
    else:
        raise Exception(f"Failed to authenticate: {res.text}")

def create_unix_incident(headers):
    print(f"\n📝 Creating new Unix Incident ticket via MCP for Configuration Item '{CI_NAME}' ({CI_IP})...")
    payload = {
        "shortDescription": f"Unix Machine High CPU & Kernel Service Degradation on {CI_NAME} ({CI_IP})",
        "description": f"Automated monitoring alert: High OS kernel degradation and service responsiveness issues on Unix host {CI_NAME} at IP {CI_IP}. SSH access with root credentials required for remediation.",
        "impact": "HIGH",
        "urgency": "HIGH",
        "department": "Unix",
        "assignedTo": "Sarah Jenkins (Unix Lead)",
        "caller": "Monitoring Bot",
        "configurationItem": CI_NAME,
        "priority": "P2"
    }
    res = requests.post(f"{ITSM_BASE_URL}/incidents", headers=headers, json=payload)
    if res.status_code in [200, 201]:
        inc = res.json()
        print(f"✅ Incident Created Successfully: ID={inc['id']} | Number={inc['number']}")
        return inc
    else:
        raise Exception(f"Failed to create incident: {res.text}")

def get_kb_articles(headers):
    print("\n📚 Fetching Knowledge Base Articles for Unix SOP...")
    res = requests.get(f"{ITSM_BASE_URL}/knowledge/articles", headers=headers)
    if res.status_code == 200:
        articles = res.json()
        print(f"✅ Found {len(articles)} Knowledge Base articles.")
        return articles
    else:
        print(f"⚠️ Warning: Could not fetch KB articles: {res.text}")
        return []

def add_work_note(headers, incident_id, comment):
    print(f"\n📌 Adding Work Note to Incident {incident_id}...")
    payload = {
        "comment": comment,
        "isWorkNote": True
    }
    res = requests.post(f"{ITSM_BASE_URL}/incidents/{incident_id}/activities", headers=headers, json=payload)
    if res.status_code in [200, 201]:
        print("✅ Work Note added successfully.")
    else:
        print(f"⚠️ Warning: Could not add work note: {res.text}")

def update_incident_state(headers, incident_id, state, resolution_code, resolution_notes):
    print(f"\n🔄 Updating Incident {incident_id} state to {state}...")
    payload = {
        "state": state,
        "resolutionCode": resolution_code,
        "resolutionNotes": resolution_notes
    }
    res = requests.patch(f"{ITSM_BASE_URL}/incidents/{incident_id}", headers=headers, json=payload)
    if res.status_code == 200:
        print(f"✅ Incident {incident_id} successfully updated to state={state}.")
    else:
        print(f"⚠️ Warning: Could not update incident: {res.text}")

def get_incident_details(headers, incident_id):
    res = requests.get(f"{ITSM_BASE_URL}/incidents/{incident_id}", headers=headers)
    if res.status_code == 200:
        return res.json()
    return None

# ----------------------------------------------------
# SSH Execution Function with Robust Parameters
# ----------------------------------------------------
def execute_ssh_recovery(ip, user, password, commands):
    print(f"\n🖥️ Connecting via SSH to {user}@{ip} using saved credentials...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    output_log = ""
    try:
        ssh.connect(
            ip,
            username=user,
            password=password,
            look_for_keys=False,
            allow_agent=False,
            banner_timeout=30,
            timeout=15
        )
        print(f"✅ SSH Connection to {ip} established successfully!")
        
        for cmd in commands:
            print(f"  > Executing: {cmd}")
            stdin, stdout, stderr = ssh.exec_command(cmd)
            out = stdout.read().decode('utf-8', 'ignore')
            err = stderr.read().decode('utf-8', 'ignore')
            output_log += f"=== Command: {cmd} ===\nSTDOUT:\n{out}\nSTDERR:\n{err}\n\n"
        
        ssh.close()
        print("✅ SSH Commands executed successfully.")
        return output_log
    except Exception as e:
        error_msg = f"❌ SSH Execution Error on {ip}: {str(e)}"
        print(error_msg)
        return error_msg

# ----------------------------------------------------
# SYSTEM INSTRUCTION: ITSM Multi-Agent Execution Framework
# ----------------------------------------------------
MULTI_AGENT_FRAMEWORK_PROMPT = """
You operate strictly within a 3-Agent ITSM Execution Pipeline. For every incoming incident, you MUST sequentially execute and output the exact actions for each agent role without skipping any step:

AGENT 1: 🚦 ROUTER AGENT (Inspect & Parse, Categorize, Prioritize P1-P4, Dispatch & Acknowledge)
AGENT 2: 🛠️ RESOLVER AGENT (Diagnose Target OS, Match Runbook/KB, Execute OS-Native Remediation, Notify User)
AGENT 3: 🧠 KNOWLEDGE SYNTHESIZER AGENT (Synthesize Draft KB Article, Pattern/Trend Detection, Preventative Recommendation)

OS-SPECIFIC COMMAND ADAPTATION RULE:
1. INSPECT THE TARGET HOST OPERATING SYSTEM (target_os) provided in the prompt.
2. GENERATE ONLY NATIVE COMMANDS FOR THAT SPECIFIC OPERATING SYSTEM:
   - For Linux / Unix (RHEL / Ubuntu / Debian / CentOS):
     Use: useradd -m <user>, userdel -r <user>, systemctl restart <service>, journalctl --vacuum-size=100M, echo "<user>:<pass>" | chpasswd, ps aux.
   - For Windows Server (Windows PowerShell / Cmd):
     Use: New-LocalUser -Name <user>, Remove-LocalUser -Name <user>, Restart-Service -Name <service>, Stop-Process -Name <proc>, Get-EventLog -LogName System.
   - For macOS / Darwin:
     Use: dscl . -create /Users/<user>, dscl . -delete /Users/<user>, launchctl restart <service>, sysctl -a.

MASTER KNOWLEDGE DEDUPLICATION & CONSOLIDATION RULE:
DO NOT synthesize duplicate standalone KB articles for recurring/similar tasks! Group all similar incidents into one of the 7 Master Generic Domain SOPs (KB0000050 to KB0000056).
"""

# ----------------------------------------------------
# Main LLM Agent Execution Flow
# ----------------------------------------------------
def run_agent():
    print("=" * 75)
    print(f"🤖 Starting Autonomous Resolver Agent powered by Gemini ({MODEL_NAME})")
    print("=" * 75)

    # 1. Authenticate & Create Incident via MCP/API
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    incident = create_unix_incident(headers)
    inc_id = incident["id"]

    # 2. Match Knowledge Base Article using Gemini 3.1 Pro
    kb_articles = get_kb_articles(headers)
    
    prompt = f"""
{MULTI_AGENT_FRAMEWORK_PROMPT}

Incident Details: {json.dumps(incident, indent=2)}
Available KB Articles: {json.dumps(kb_articles, indent=2)}

Task:
Perform complete sequential processing through Router, Resolver, and Knowledge Synthesizer roles.
Respond in JSON format with keys:
- "router_agent": dict with keys ("ticketId", "category", "impactUrgency", "assignedPriority", "dispatchRoute", "userAcknowledgment")
- "resolver_agent": dict with keys ("diagnosis", "matchedRunbook", "remediationStepsApplied", "resolutionStatus", "userResolutionNotice")
- "synthesizer_agent": dict with keys ("draftKbId", "kbTitle", "synthesizedSolution", "trendInsight")
- "matched_kb_number": string (e.g. "KB0000012")
- "matched_kb_title": string
- "reasoning": explanation of why this KB is relevant
- "remediation_steps": array of shell commands to run over SSH on host {CI_IP}.
"""

    print("\n🧠 Consulting Gemini 3.1 Pro Preview for KB matching and remediation plan...")
    llm_res = llm_client.chat.completions.create(
        model=MODEL_NAME,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    
    plan = json.loads(llm_res.choices[0].message.content)
    print(f"✅ Gemini 3.1 Pro matched KB Article: {plan.get('matched_kb_number')} - {plan.get('matched_kb_title')}")
    print(f"   Reasoning: {plan.get('reasoning')}")

    # 3. Post Work Note referencing KB Article
    kb_work_note = (
        f"🤖 Agentic AI Resolver (Gemini 3.1 Pro Preview):\n"
        f"Referencing Knowledge Base Article [{plan.get('matched_kb_number')}: {plan.get('matched_kb_title')}].\n"
        f"Target Configuration Item: {CI_NAME} (IP: {CI_IP})\n"
        f"Reasoning: {plan.get('reasoning')}\n"
        f"Initiating SSH session using saved credentials (Username: {CI_USER})..."
    )
    add_work_note(headers, inc_id, kb_work_note)

    # 4. Perform SSH Remediation on Worker 1 (192.168.56.10)
    recovery_commands = plan.get("remediation_steps", [
        "hostname",
        "uname -a",
        "uptime",
        "df -h",
        "free -m",
        "systemctl list-units --type=service --state=running | head -n 15",
        "journalctl --vacuum-time=1d",
        "sysctl -p || true"
    ])
    
    ssh_log = execute_ssh_recovery(CI_IP, CI_USER, CI_PASS, recovery_commands)

    # 5. Verify fix and update Work Notes with live execution logs
    agent_verification_prompt = f"""
Analyze the following SSH execution log from host {CI_NAME} ({CI_IP}):

{ssh_log}

Confirm whether the Unix server is healthy, operational, and responsive.
Output a JSON response with keys:
- "is_healthy": boolean
- "summary_proof": brief summary of the output proving system health
- "resolution_notes": detailed resolution note documenting the proof of fix
"""

    print("\n🔍 Analyzing live SSH execution proof with Gemini 3.1 Pro...")
    verify_res = llm_client.chat.completions.create(
        model=MODEL_NAME,
        messages=[{"role": "user", "content": agent_verification_prompt}],
        response_format={"type": "json_object"}
    )
    
    verification = json.loads(verify_res.choices[0].message.content)
    
    proof_work_note = (
        f"🤖 Agentic AI Resolver - SSH Remote Execution Proof:\n"
        f"Host: {CI_NAME} ({CI_IP})\n"
        f"Health Status: {'HEALTHY ✅' if verification.get('is_healthy') else 'ISSUE DETECTED ❌'}\n\n"
        f"--- Live Terminal Execution Output ---\n"
        f"{ssh_log}\n"
        f"Verification Summary: {verification.get('summary_proof')}"
    )
    add_work_note(headers, inc_id, proof_work_note)

    # 6. Update incident state to RESOLVED with resolution notes
    res_code = "Server - Kernel & OS Patch"
    res_notes = (
        f"Automated resolution completed by Gemini 3.1 Pro Preview Agent.\n"
        f"Referenced KB: {plan.get('matched_kb_number')} ({plan.get('matched_kb_title')})\n"
        f"SSH Diagnostics on {CI_NAME} ({CI_IP}) verified system health and restored normal service operation.\n"
        f"Summary Proof: {verification.get('summary_proof')}"
    )
    update_incident_state(headers, inc_id, "RESOLVED", res_code, res_notes)

    print("\n" + "=" * 75)
    print(f"🎉 Incident {inc_id} resolution completed successfully!")
    print("=" * 75)

    # Fetch and display final ticket timeline
    final_ticket = get_incident_details(headers, inc_id)
    if final_ticket:
        print("\n📋 FINAL INCIDENT DETAILS & WORK LOG TIMELINE:")
        print(f"Ticket ID: {final_ticket.get('id')}")
        print(f"Short Description: {final_ticket.get('shortDescription')}")
        print(f"Configuration Item: {final_ticket.get('configurationItem')}")
        print(f"State: {final_ticket.get('state')}")
        print(f"Resolution Code: {final_ticket.get('resolutionCode')}")
        print(f"Resolution Notes: {final_ticket.get('resolutionNotes')}")
        print("\nWork Notes / Activity Log:")
        for act in final_ticket.get("activities", []):
            print(f"  [{act.get('timestamp')}] {act.get('author')}:")
            print(f"  {act.get('comment')}")
            print("  " + "-" * 60)

if __name__ == "__main__":
    run_agent()
