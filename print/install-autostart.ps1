<#
.SYNOPSIS
  Makes the print agent start with Windows, hidden. Run once.

.DESCRIPTION
  Registers a scheduled task that runs start-hidden.vbs when this user logs on,
  so receipts print after a reboot without anybody opening anything. The task
  runs as the logged-on user and needs no administrator rights: the printer is
  installed for that user, and a task running as SYSTEM cannot always see it.

  The agent refuses to run twice, so having the task and double-clicking
  start-print.bat as well is safe — the second one bows out.

  Windows will not run a logon task while nobody is logged in. A till that must
  print after an unattended reboot needs Task Scheduler's "Run whether user is
  logged on or not" instead, which stores a password; that is a decision for
  whoever owns the machine, so it is not done here.

.PARAMETER Remove
  Undo it: delete the task and stop it starting with Windows.

.PARAMETER Start
  Also start the agent now, rather than waiting for the next logon. On by
  default; -Start:$false only registers it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install-autostart.ps1
  powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -Remove
#>
param(
    [switch] $Remove,
    [bool] $Start = $true
)

$ErrorActionPreference = "Stop"

$TaskName = "Food Express print agent"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $here "start-hidden.vbs"

function Get-Task {
    Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

if ($Remove) {
    if (Get-Task) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Output "Removed the logon task. The agent will not start with Windows any more."
    }
    else {
        Write-Output "Nothing to remove — no logon task was registered."
    }
    Write-Output "Any agent already running keeps running; close its window or end node.exe to stop it."
    return
}

if (-not (Test-Path -LiteralPath $vbs)) { throw "start-hidden.vbs is not beside this script." }
if (-not (Test-Path -LiteralPath (Join-Path $here "config.json"))) {
    Write-Warning "There is no config.json here yet. Copy config.example.json to config.json and fill it in, or the agent will start and stop again."
}

# wscript runs the .vbs with no console of its own; the .vbs then starts the
# batch file hidden. Both halves are needed: without the .vbs a window flashes
# up at every logon, and without the batch file nothing restarts the agent if it
# crashes.
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`"" -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
# Priority 4 is "normal"; a task registered without it gets 7, which Windows
# turns into BelowNormal for the agent *and* everything it starts — including the
# PowerShell that rasterises the receipt. Drawing a page is real work, and doing
# it behind every other process on the machine cost about a second a slip.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -Priority 4

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null

Write-Output "Registered `"$TaskName`" — it starts hidden at logon."

if ($Start) {
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 3
    Write-Output "Started it now as well."
}

Write-Output ""
Write-Output "  watch it     : Get-Content `"$here\agent.log`" -Tail 20 -Wait"
Write-Output "  stop it      : Get-Process node | Where-Object { `$_.Path } | Stop-Process"
Write-Output "  undo all this: powershell -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`" -Remove"
