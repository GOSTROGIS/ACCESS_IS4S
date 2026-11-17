param([switch]$RunNow)

$ErrorActionPreference = 'Stop'
$installation = (Get-Item -LiteralPath $PSScriptRoot).FullName
$tools = Join-Path $installation 'tools'
$node = Join-Path $tools 'node.exe'
$updater = Join-Path $tools 'runtime-update/local-intranet/update-runtimes.mjs'
$name = 'ACCESS IS4S Intranet Runtime Updates'
if (!(Test-Path -LiteralPath $node -PathType Leaf) -or !(Test-Path -LiteralPath $updater -PathType Leaf)) {
    throw 'The folder updater and its runtime dependencies must be installed before scheduling.'
}
$arguments = '"{0}" update --root "{1}"' -f $updater, $installation
$action = New-ScheduledTaskAction -Execute $node -Argument $arguments -WorkingDirectory $installation
$trigger = New-ScheduledTaskTrigger -Daily -At '03:00'
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$prior = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($prior -and ($prior.Actions.Count -ne 1 -or $prior.Actions[0].Execute -ne $node -or $prior.Actions[0].Arguments -ne $arguments)) {
    throw 'A scheduled task already uses this name for another installation.'
}
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Update the installed intranet runtimes after signed release and functional regression checks.' -Force | Out-Null
if ($RunNow) { Start-ScheduledTask -TaskName $name }
Get-ScheduledTask -TaskName $name | Select-Object TaskName, State
