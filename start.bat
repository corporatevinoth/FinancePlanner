@echo off
title Finance Planner
cd /d "%~dp0"
echo ==========================================================
echo Starting Finance Planner...
echo ==========================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
