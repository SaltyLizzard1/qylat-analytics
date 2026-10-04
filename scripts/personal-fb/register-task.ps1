# Registers the poller behind the "Collect Facebook profile" button in Windows
# Task Scheduler. Run it yourself, once. Nothing else creates this task.
#
#   .\register-task.ps1 -Preview    shows what would be registered, creates nothing
#   .\register-task.ps1             registers the task
#   Unregister-ScheduledTask -TaskName 'QYLAT personal Facebook'    removes it
#
# There is no daily run. The task runs poll.py every 5 minutes; poll.py asks
# the dashboard whether the button was pressed and runs scrape.py only then.
# A check with nothing waiting does not touch Facebook.
#
# What it sets, and why each is explicit:
#   Working directory   this folder, so relative paths and the logs land here
#   Program             pythonw.exe, so no window flashes every 5 minutes. A
#                       real run opens its own console window.
#   Logon type          Interactive: the task runs only while you are logged on,
#                       in your desktop session. The browser is visible and
#                       cannot run in a background session. No password is stored.
#   Repeat              every 5 minutes, indefinitely, starting a minute from now
#   Overlap             a check while a run is still going is skipped
#   Time limit          25 minutes. poll.py stops scrape.py itself at 20.

[CmdletBinding()]
param(
    [switch]$Preview,
    [int]$EveryMinutes = 5
)

$ErrorActionPreference = 'Stop'

$TaskName = 'QYLAT personal Facebook'
$Dir = $PSScriptRoot
$Pythonw = Join-Path $Dir '.venv\Scripts\pythonw.exe'
$Script = Join-Path $Dir 'poll.py'
$User = "$env:USERDOMAIN\$env:USERNAME"

foreach ($path in @($Pythonw, $Script, (Join-Path $Dir 'scrape.py'), (Join-Path $Dir 'chrome-profile'), (Join-Path $Dir '.env'))) {
    if (-not (Test-Path $path)) {
        throw "Missing: $path. Install, run --setup and fill in .env before registering. See README.md."
    }
}

$start = (Get-Date).AddMinutes(1)
$action = New-ScheduledTaskAction -Execute $Pythonw -Argument "`"$Script`"" -WorkingDirectory $Dir
# No RepetitionDuration: the repetition then never ends.
$trigger = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 25) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Write-Host "Task               $TaskName"
Write-Host "Runs               $Pythonw `"$Script`""
Write-Host "Working directory  $Dir"
Write-Host "User               $User, interactive logon only, standard rights"
Write-Host "Repeat             every $EveryMinutes minutes from $(Get-Date $start -Format 'yyyy-MM-dd HH:mm'), while you are logged on"

if ($Preview) {
    Write-Host "Preview only. Nothing was registered."
    return
}

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    throw "A task named '$TaskName' already exists. Remove it first if you mean to replace it."
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
    -Description 'Checks every few minutes whether the QYLAT analytics Sync page asked for a Facebook profile collection, and runs scrape.py if so. See scripts/personal-fb/README.md.' | Out-Null

$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host "Registered. First check: $($info.NextRunTime)"
