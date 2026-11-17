param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$Node,
    [Parameter(Mandatory)][string]$Git,
    [string]$Owner = 'GOSTROGIS',
    [string]$Placements,
    [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$rootPath = (Get-Item -LiteralPath $Root -ErrorAction Stop).FullName
$nodePath = (Get-Item -LiteralPath $Node -ErrorAction Stop).FullName
$gitPath = (Get-Item -LiteralPath $Git -ErrorAction Stop).FullName
$updater = Join-Path $rootPath '.sync-tools\github-sync.mjs'
if ($Owner -notmatch '^[A-Za-z0-9][A-Za-z0-9-]{0,99}$' -or !(Test-Path -LiteralPath $updater -PathType Leaf)) {
    throw 'The installed synchronization helper and GitHub owner are required.'
}
$arguments = '"{0}" --root "{1}" --git "{2}" --owner "{3}"' -f $updater, $rootPath, $gitPath, $Owner
$plainArguments = $arguments
if ($Placements) {
    $placementPath = (Get-Item -LiteralPath $Placements -ErrorAction Stop).FullName
    $arguments += ' --placements "{0}"' -f $placementPath
}
$name = 'ACCESS Intranet GitHub Repositories'
$existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($existing -and ($existing.Actions.Count -ne 1 -or $existing.Actions[0].Arguments -notin @($arguments,$plainArguments))) {
    throw 'The task name is already registered for another repository mirror.'
}
$action = New-ScheduledTaskAction -Execute $nodePath -Argument $arguments -WorkingDirectory $rootPath
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(15) -RepetitionInterval (New-TimeSpan -Minutes 15)
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Fetch owned GitHub repositories and fast-forward clean local default branches. Preserve local edits and divergent work.' -Force | Out-Null
if ($RunNow) { Start-ScheduledTask -TaskName $name }
Get-ScheduledTask -TaskName $name | Select-Object TaskName, State
