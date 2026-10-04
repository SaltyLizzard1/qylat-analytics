# Registers the daily collection of the personal Facebook profile in Windows
# Task Scheduler. Run it yourself, once, after a controlled run has been
# checked on the dashboard. Nothing else creates this task.
#
#   .\register-task.ps1 -Preview    shows what would be registered, creates nothing
#   .\register-task.ps1             registers the task
#   Unregister-ScheduledTask -TaskName 'QYLAT personal Facebook'    removes it
#
# What it sets, and why each is explicit:
#   Working directory   this folder, so relative paths and the log land here
#   Logon type          Interactive: the task runs only while you are logged on,
#                       in your desktop session. The browser is visible and
#                       cannot run in a background session. No password is stored.
#   Time                10:30 local time, daily. Task Scheduler triggers follow
#                       the system clock, so this refuses to register unless
#                       the system zone is UTC+7, which is Asia/Bangkok's offset.
#   Missed runs         run as soon as you next log on, once
#   Overlap             a second start while one is running is ignored
#   Time limit          20 minutes, then the run is stopped

[CmdletBinding()]
param(
    [switch]$Preview,
    [string]$At = '10:30'
)

$ErrorActionPreference = 'Stop'

$TaskName = 'QYLAT personal Facebook'
$Dir = $PSScriptRoot
$Python = Join-Path $Dir '.venv\Scripts\python.exe'
$Script = Join-Path $Dir 'scrape.py'
$User = "$env:USERDOMAIN\$env:USERNAME"

foreach ($path in @($Python, $Script, (Join-Path $Dir 'chrome-profile'), (Join-Path $Dir '.env'))) {
    if (-not (Test-Path $path)) {
        throw "Missing: $path. Install, run --setup and fill in .env before scheduling. See README.md."
    }
}

$zone = Get-TimeZone
if ($zone.BaseUtcOffset -ne [TimeSpan]::FromHours(7) -or $zone.SupportsDaylightSavingTime) {
    throw "System time zone is '$($zone.Id)' ($($zone.BaseUtcOffset)). The task time is local, so it is only $At in Asia/Bangkok when the system zone is UTC+7 with no daylight saving. Not registered."
}

$action = New-ScheduledTaskAction -Execute $Python -Argument "`"$Script`"" -WorkingDirectory $Dir
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Write-Host "Task               $TaskName"
Write-Host "Runs               $Python `"$Script`""
Write-Host "Working directory  $Dir"
Write-Host "User               $User, interactive logon only, standard rights"
Write-Host "Time               daily at $At, system zone $($zone.Id) (UTC+7)"
Write-Host "Now                $(Get-Date -Format 'yyyy-MM-dd HH:mm zzz')"

if ($Preview) {
    Write-Host "Preview only. Nothing was registered."
    return
}

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    throw "A task named '$TaskName' already exists. Remove it first if you mean to replace it."
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
    -Description 'Reads the personal Facebook profile once a day and sends one collection to the QYLAT analytics dashboard. See scripts/personal-fb/README.md.' | Out-Null

$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host "Registered. Next run: $($info.NextRunTime)"
