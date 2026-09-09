@echo off
REM Easy Drive — starts the receipt print agent.
REM
REM Double-click to run it, or point Task Scheduler at this file to have it
REM start with Windows. Closing this window stops printing.

cd /d "%~dp0"

:loop
REM The agent handles a dropped connection itself; this loop only covers what it
REM cannot — a crash, or Windows killing the process.
node print-agent.mjs
echo.
echo Print agent stopped. Restarting in 10 seconds. Close this window to stop.
timeout /t 10 /nobreak >nul
goto loop
