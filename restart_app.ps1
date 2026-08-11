$Env:USERPROFILE = $Env:USERPROFILE
# Stop any existing Python daemon processes
Get-Process -Name "python*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
# Stop any existing Node/npm processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "npm" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Start PostgreSQL safely using PowerShell execution block instead of command strings
Write-Host "Starting PostgreSQL..."
Start-Process -FilePath "$Env:USERPROFILE\pgsql\pgsql\bin\postgres.exe" -ArgumentList "-D", "$Env:USERPROFILE\pgsql\pgsql\data" -NoNewWindow
Start-Sleep -Seconds 5

# Start NestJS backend (nodeapps/backend/dist/main.js as per Agent rule)
Write-Host "Starting NestJS backend..."
Start-Process -FilePath "node" -ArgumentList "apps/backend/dist/main.js" -WorkingDirectory "C:\Users\praka\OneDrive\Desktop\ITSM-Agentic" -NoNewWindow
Start-Sleep -Seconds 5

# Start Next.js frontend dev server using cmd wrapper since it runs local package scripts
Write-Host "Starting Next.js frontend dev server..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev:frontend" -WorkingDirectory "C:\Users\praka\OneDrive\Desktop\ITSM-Agentic" -NoNewWindow
Start-Sleep -Seconds 5

# Start Agent Control Tower Dashboard
Write-Host "Starting Agent Control Tower Dashboard..."
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory "C:\Users\praka\OneDrive\Desktop\ITSM-Agentic\Resolver Agent\agent-approval-dashboard" -NoNewWindow
Start-Sleep -Seconds 3

# Start Python Auto-Resolver Agent Daemon
Write-Host "Starting Python Auto-Resolver Agent Daemon..."
Start-Process -FilePath "python" -ArgumentList "-u", "continuous_itsm_agent_daemon.py" -WorkingDirectory "C:\Users\praka\OneDrive\Desktop\ITSM-Agentic\Resolver Agent" -NoNewWindow
Start-Sleep -Seconds 3

# Start ITSM MCP Server
Write-Host "Starting ITSM MCP Server..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run start:mcp" -WorkingDirectory "C:\Users\praka\OneDrive\Desktop\ITSM-Agentic" -NoNewWindow

Write-Host "All processes launched successfully."
