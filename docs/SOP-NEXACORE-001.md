# MASTER SOP — NexaCore Application Remediation

| Field | Value |
|-------|-------|
| **SOP ID** | SOP-NEXACORE-001 |
| **Version** | 1.0 |
| **Classification** | Master — Authoritative |
| **Target Host** | WorkerNode1HL (`192.168.100.102`) |
| **Application** | NexaCore Portal |
| **Port** | `8080` |
| **Owner** | Agentic ITSM Resolver Agent |

---

## 1. Application Profile

| Property | Value |
|----------|-------|
| **Install Path** | `/opt/nexacore-app/` |
| **Entry Point** | `nexacore_app.py` |
| **Frontend** | `index.html` (single-page static UI) |
| **Runtime** | Python 3.12 `http.server` (stdlib, no dependencies) |
| **Bind Address** | `0.0.0.0:8080` |
| **Process** | `python3 /opt/nexacore-app/nexacore_app.py` |
| **PID File** | None (no systemd, no crontab) |
| **Log File** | `/opt/nexacore-app/nexacore.log` |
| **OS** | CentOS Stream 10 (RHEL 9 compatible) |
| **SSH Credentials** | `root` / `root123` |
| **Firewall** | Open (iptables ACCEPT policy) |

---

## 2. Prerequisites

- SSH access to `192.168.100.102` as `root`
- Python 3.12+ installed (stdlib only, no pip packages required)
- Port `8080` available and not blocked by firewall

---

## 3. Diagnostic Flowchart

```
NexaCore Down?
    │
    ├─ Process running? (ps aux | grep nexacore)
    │     ├─ YES → Port bound? (ss -tlnp | grep 8080)
    │     │         ├─ YES → HTTP responding? (curl http://192.168.100.102:8080)
    │     │         │         ├─ YES → False alarm, check logs
    │     │         │         └─ NO  → App frozen → KILL & RESTART (Step 5.3)
    │     │         └─ NO  → Port conflict → RESOLVE CONFLICT (Step 5.4)
    │     └─ NO → App crashed → Check logs → RESTART (Step 5.1)
    │
    ├─ Host reachable? (ping 192.168.100.102)
    │     ├─ NO  → Network/host issue → Escalate to infra team
    │     └─ YES → SSH accessible? → Continue diagnostics
    │
    └─ Disk full? (df -h /opt)
          ├─ YES (>90%) → Clean logs/temp → RESTART
          └─ NO  → Continue diagnostics
```

---

## 4. Pre-Fix Verification (Run First)

Execute these commands on `192.168.100.102` via SSH:

```bash
# 4.1 Check if process exists
ps aux | grep nexacore_app.py | grep -v grep

# 4.2 Check if port 8080 is listening
ss -tlnp | grep 8080

# 4.3 HTTP health check
curl -s -o /dev/null -w "%{http_code}" http://192.168.100.102:8080

# 4.4 Check disk space
df -h /opt

# 4.5 Check app logs
tail -50 /opt/nexacore-app/nexacore.log

# 4.6 Verify files exist
ls -la /opt/nexacore-app/
```

**Expected healthy output:**
- `ps aux` shows `python3 /opt/nexacore-app/nexacore_app.py`
- `ss -tlnp` shows `LISTEN` on `0.0.0.0:8080`
- `curl` returns `200`
- `df -h` shows <90% usage
- `ls -la` shows `nexacore_app.py`, `index.html`, `nexacore.log`

---

## 5. Remediation Procedures

### 5.1 — Cold Start (Process Not Running)

```bash
# Kill any stale process
pkill -f nexacore_app.py 2>/dev/null

# Navigate to app directory
cd /opt/nexacore-app/

# Start in background with nohup
nohup python3 nexacore_app.py > nexacore.log 2>&1 &

# Verify startup
sleep 2
ps aux | grep nexacore_app.py | grep -v grep
ss -tlnp | grep 8080
curl -s -o /dev/null -w "%{http_code}" http://192.168.100.102:8080
```

**Success criteria:** HTTP 200 on port 8080.

---

### 5.2 — File Corruption (index.html or nexacore_app.py damaged)

```bash
# Backup current files
cp /opt/nexacore-app/index.html /opt/nexacore-app/index.html.bak.$(date +%s)
cp /opt/nexacore-app/nexacore_app.py /opt/nexacore-app/nexacore_app.py.bak.$(date +%s)

# Restore from backup (if available)
# ls /opt/nexacore-app/*.bak.*

# If no backup, recreate nexacore_app.py:
cat > /opt/nexacore-app/nexacore_app.py << 'PYEOF'
#!/usr/bin/env python3
"""NexaCore Portal — Simple HTTP server serving the app UI on port 8080."""
import http.server, socketserver, os, sys

PORT = 8080
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.path = "/index.html"
        return super().do_GET()
    def log_message(self, fmt, *args):
        print(f"[NexaCore] {self.address_string()} {fmt % args}", flush=True)

print(f"[NexaCore] Starting portal on 0.0.0.0:{PORT}...", flush=True)
with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    httpd.allow_reuse_address = True
    print(f"[NexaCore] Serving at http://192.168.100.102:{PORT}", flush=True)
    httpd.serve_forever()
PYEOF

chmod +x /opt/nexacore-app/nexacore_app.py

# Restart (follow Step 5.1)
```

---

### 5.3 — App Frozen (Process Running but Not Responding)

```bash
# Force kill
kill -9 $(pgrep -f nexacore_app.py)

# Wait for port release
sleep 3

# Restart (follow Step 5.1)
```

---

### 5.4 — Port Conflict (Another Process on 8080)

```bash
# Find what's using port 8080
ss -tlnp | grep 8080

# If another process, kill it (confirm first)
# kill -9 <PID_OF_CONFLICTING_PROCESS>

# Then start NexaCore (follow Step 5.1)
```

---

### 5.5 — Disk Full (Logs Consuming Space)

```bash
# Check disk usage
df -h /opt

# Truncate log file
> /opt/nexacore-app/nexacore.log

# Remove old backups
rm -f /opt/nexacore-app/*.bak.*

# Verify space freed
df -h /opt

# Restart (follow Step 5.1)
```

---

### 5.6 — Python Interpreter Missing

```bash
# Check Python version
python3 --version

# If missing, install (CentOS/RHEL)
dnf install -y python3

# Restart (follow Step 5.1)
```

---

## 6. Post-Fix Verification

After any remediation, run:

```bash
# Full health check
echo "=== Process ===" && ps aux | grep nexacore_app.py | grep -v grep
echo "=== Port ===" && ss -tlnp | grep 8080
echo "=== HTTP ===" && curl -s -o /dev/null -w "HTTP %{http_code}\n" http://192.168.100.102:8080
echo "=== Content ===" && curl -s http://192.168.100.102:8080 | head -5
echo "=== Logs ===" && tail -5 /opt/nexacore-app/nexacore.log
```

**All checks must pass before closing the incident.**

---

## 7. Known Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| No systemd service | No auto-restart on crash/reboot | Step 5.1 manual restart required |
| No crontab health check | Silent failures go undetected | Add monitoring or cron heartbeat |
| Single-threaded HTTP server | Low concurrency under load | Acceptable for portal use |
| No HTTPS | Traffic unencrypted | Use reverse proxy (nginx) for TLS |
| Hardcoded credentials in repo | Security risk | Move to environment variables |

---

## 8. Escalation Matrix

| Condition | Action |
|-----------|--------|
| Host unreachable (`ping` fails) | Escalate to Infrastructure / Network team |
| SSH fails (auth denied) | Escalate to Security / SysAdmin |
| Disk full after cleanup | Escalate to Infrastructure for storage expansion |
| App files missing entirely | Restore from backup or redeploy from repo |
| Port 8080 blocked by firewall | Run `firewall-cmd --add-port=8080/tcp --permanent && firewall-cmd --reload` |

---

## 9. Incident Closure Checklist

- [ ] Process running (`ps aux | grep nexacore`)
- [ ] Port 8080 listening (`ss -tlnp | grep 8080`)
- [ ] HTTP 200 returned (`curl http://192.168.100.102:8080`)
- [ ] `index.html` renders correctly in browser
- [ ] Logs show no errors (`tail -20 nexacore.log`)
- [ ] No duplicate processes (`ps aux | grep nexacore | wc -l` = 2)
- [ ] Work note added to incident with remediation steps taken

---

*SOP maintained by Agentic ITSM Resolver Agent — Auto-generated from live host audit.*
