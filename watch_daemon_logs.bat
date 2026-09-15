@echo off
title SRE Agent Daemon - Live Logs
powershell -NoExit -Command "Get-Content '%~dp0services\sre-agent-daemon\daemon.log' -Wait -Tail 50"
