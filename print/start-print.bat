@echo off
REM Easy Drive — starts the receipt print agent.
REM
REM Double-click to run it and watch it work. To have it start with Windows and
REM stay out of the way, run install-autostart.ps1 once instead; that launches
REM this same file through start-hidden.vbs, with no window.
REM
REM Closing this window stops printing.

cd /d "%~dp0"

:loop
REM The agent handles a dropped connection itself; this loop only covers what it
REM cannot — a crash, or Windows killing the process.
node print-agent.mjs

REM Exit code 3 means another agent already holds the job. Restarting would only
REM spin, so this window bows out and leaves the running one alone.
if errorlevel 3 if not errorlevel 4 goto already

echo.
echo Print agent stopped. Restarting in 10 seconds. Close this window to stop.
timeout /t 10 /nobreak >nul
goto loop

:already
echo.
echo Another print agent is already running. Nothing to do.
timeout /t 5 /nobreak >nul
