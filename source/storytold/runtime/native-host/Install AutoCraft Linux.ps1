param(
    [Parameter(Mandatory)][string]$ConfigurationFile,
    [Parameter(Mandatory)][string]$Node,
    [Parameter(Mandatory)][string]$Controller
)
$ErrorActionPreference = 'Stop'
function Get-RegularFile([string]$Path) {
    $item = Get-Item -LiteralPath $Path -ErrorAction Stop
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'A regular local runtime file is required.' }
    if ($item.FullName -match '["\r\n]') { throw 'Unsupported runtime filename.' }
    return $item.FullName
}
$configuration = Get-RegularFile $ConfigurationFile
$nodeExecutable = Get-RegularFile $Node
$controllerScript = Get-RegularFile $Controller
$probe = [Diagnostics.ProcessStartInfo]::new()
$probe.FileName = $nodeExecutable
$probe.Arguments = '"' + $controllerScript + '" status --configuration "' + $configuration + '"'
$probe.UseShellExecute = $false
$probe.CreateNoWindow = $true
$probe.RedirectStandardOutput = $true
$probe.RedirectStandardError = $true
$process = [Diagnostics.Process]::Start($probe)
if (-not $process.WaitForExit(30000)) { $process.Kill(); throw 'Private runtime settings validation timed out.' }
if ($process.ExitCode -ne 0) { throw 'Private runtime settings failed validation.' }
Write-Output $process.StandardOutput.ReadToEnd().Trim()
$process.Dispose()
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$wrapper = Get-RegularFile (Join-Path (Split-Path -Parent $controllerScript) 'run-supervisor.ps1')
$powershellExecutable = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $wrapper + '" -Node "' + $nodeExecutable + '" -Controller "' + $controllerScript + '" -ConfigurationFile "' + $configuration + '"'
$action = New-ScheduledTaskAction -Execute $powershellExecutable -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Starts the approved bounded Linux AutoCraft guest and private loopback tunnels for the owning signed-in account.'
Register-ScheduledTask -TaskName 'ACCESS Intranet AutoCraft Linux' -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName 'ACCESS Intranet AutoCraft Linux'
Write-Output 'AutoCraft Linux logon startup registered for the owning account.'
