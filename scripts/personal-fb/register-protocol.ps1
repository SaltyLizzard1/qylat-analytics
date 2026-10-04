# Teaches Windows what a qylat-collect: link means, so the "Collect Facebook
# profile" button on the dashboard's Sync page can open the collector on this
# laptop. Run it yourself, once. Nothing runs in the background afterwards:
# the collector starts only when that link is opened.
#
#   .\register-protocol.ps1 -Preview    shows what would be written, changes nothing
#   .\register-protocol.ps1             registers the link
#   .\register-protocol.ps1 -Remove     removes it again
#
# What it writes: one key under HKEY_CURRENT_USER\Software\Classes\qylat-collect.
# That is your own user's settings. It needs no administrator rights and
# affects no other user of this laptop.
#
# What the link runs: this folder's python.exe with collect.py, and nothing
# else. The text of the link is passed along but collect.py does not use it.
# It runs the scraper only when the dashboard holds a request to claim, which
# only a press on the logged in Sync page writes. A qylat-collect: link opened
# from any other page finds nothing to claim and does nothing.

[CmdletBinding()]
param(
    [switch]$Preview,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$Scheme = 'qylat-collect'
$Key = "HKCU:\Software\Classes\$Scheme"
$Dir = $PSScriptRoot
$Python = Join-Path $Dir '.venv\Scripts\python.exe'
$Script = Join-Path $Dir 'collect.py'
$Command = "`"$Python`" `"$Script`" `"%1`""

if ($Remove) {
    if (Test-Path $Key) {
        Remove-Item -Path $Key -Recurse
        Write-Host "Removed. $Scheme`: links no longer open anything."
    } else {
        Write-Host "Nothing to remove. $Scheme`: was not registered."
    }
    return
}

foreach ($path in @($Python, $Script, (Join-Path $Dir 'scrape.py'), (Join-Path $Dir 'chrome-profile'), (Join-Path $Dir '.env'))) {
    if (-not (Test-Path $path)) {
        throw "Missing: $path. Install, run --setup and fill in .env before registering. See README.md."
    }
}

Write-Host "Link               $Scheme`:run"
Write-Host "Registry key       $Key (your user only)"
Write-Host "Runs               $Command"
Write-Host "Background         nothing. The collector starts only when the link is opened."

if ($Preview) {
    Write-Host "Preview only. Nothing was written."
    return
}

New-Item -Path "$Key\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $Key -Name '(Default)' -Value 'URL:QYLAT profile collection'
Set-ItemProperty -Path $Key -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path "$Key\shell\open\command" -Name '(Default)' -Value $Command

$written = (Get-ItemProperty -Path "$Key\shell\open\command").'(default)'
if ($written -ne $Command) {
    throw "The registry does not hold the command that was written. Found: $written"
}
Write-Host "Registered. The button on the Sync page can now open the collector on this laptop."
