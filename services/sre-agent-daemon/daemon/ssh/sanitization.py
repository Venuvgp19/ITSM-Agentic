import re

def strip_ssh_wrapper(cmd_raw, target_ip=""):
    cmd_raw = str(cmd_raw).strip()
    if not cmd_raw:
        return ""
    
    ssh_quoted = r"^ssh\s+(?:-[a-zA-Z0-9\=\-]+\s+)*(?:[a-zA-Z0-9\-\_]+@)?[0-9a-zA-Z\.\-_]+\s+['\"](.*?)['\"]$"
    match_quoted = re.match(ssh_quoted, cmd_raw, re.DOTALL)
    ssh_unquoted = r"^ssh\s+(?:-[a-zA-Z0-9\=\-]+\s+)*(?:[a-zA-Z0-9\-\_]+@)?[0-9a-zA-Z\.\-_]+\s+(.+)$"
    match_unquoted = re.match(ssh_unquoted, cmd_raw)

    if match_quoted:
        cmd_to_run = match_quoted.group(1).strip()
    elif match_unquoted and not re.match(r"^ssh\s+[a-zA-Z0-9\-\_]+@[0-9a-zA-Z\.\-_]+$", cmd_raw, re.IGNORECASE):
        cmd_to_run = match_unquoted.group(1).strip()
    elif re.match(r"^ssh\s+.*$", cmd_raw, re.IGNORECASE) and not any(c in cmd_raw for c in ['"', "'", " "]):
        return ""
    else:
        cmd_to_run = cmd_raw

    if not cmd_to_run or cmd_to_run.lower() in [f"ssh root@{target_ip}", "ssh root@192.168.100.101"]:
        return ""
        
    return cmd_to_run
