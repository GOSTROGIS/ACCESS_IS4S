$ErrorActionPreference = 'Stop'
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('github-sync-schedule-' + [Guid]::NewGuid().ToString('N'))
$temporary = [IO.Path]::GetFullPath($temporary)
if (![IO.Path]::GetFullPath($temporary).StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid test directory.' }
New-Item -ItemType Directory -Path (Join-Path $temporary '.sync-tools') -Force | Out-Null
try {
    foreach ($name in @('node.exe','git.exe','python.exe','.sync-tools/github-sync.mjs','.sync-tools/github-sync-command.py','.sync-tools/project-command.py')) { [IO.File]::WriteAllText((Join-Path $temporary $name), 'synthetic schedule fixture') }
    $nodePath = (Get-Item -LiteralPath (Join-Path $temporary 'node.exe')).FullName
    $gitPath = (Get-Item -LiteralPath (Join-Path $temporary 'git.exe')).FullName
    $pythonPath = (Get-Item -LiteralPath (Join-Path $temporary 'python.exe')).FullName
    $updater = Join-Path $temporary '.sync-tools\github-sync.mjs'
    $legacy = '"{0}" --root "{1}" --git "{2}" --owner "GOSTROGIS"' -f $updater, $temporary, $gitPath
    $global:SyncScheduleFixture = [pscustomobject]@{ TaskName='ACCESS Intranet GitHub Repositories'; State='Ready'; Actions=@([pscustomobject]@{Execute=$nodePath;Arguments=$legacy}); Triggers=@([pscustomobject]@{StartBoundary='2026-01-02T03:26:26';Enabled=$true;Repetition=[pscustomobject]@{Interval='PT2H';StopAtDurationEnd=$false}}); Principal=[pscustomobject]@{UserId=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;RunLevel='Limited';LogonType='Interactive'};Settings=[pscustomobject]@{MultipleInstances='IgnoreNew';ExecutionTimeLimit='PT1H'} }
    function Get-ScheduledTask { param($TaskName,$ErrorAction) $global:SyncScheduleFixture }
    function New-ScheduledTaskAction { param($Execute,$Argument,$WorkingDirectory) [pscustomobject]@{Execute=$Execute;Arguments=$Argument;WorkingDirectory=$WorkingDirectory} }
    function New-ScheduledTaskTrigger { throw 'Existing trigger must never be replaced.' }
    function New-ScheduledTaskPrincipal { throw 'Existing owner must never be replaced.' }
    function New-ScheduledTaskSettingsSet { throw 'Existing settings must never be replaced.' }
    function Register-ScheduledTask { param($TaskName,$Action,$Trigger,$Principal,$Settings,$Description,[switch]$Force) $global:SyncScheduleRegistration=[pscustomobject]@{Action=$Action;Trigger=$Trigger;Principal=$Principal;Settings=$Settings} }
    $global:SyncScheduleRegistration=$null
    $before = $global:SyncScheduleFixture.Triggers | ConvertTo-Json -Depth 10 -Compress
    & (Join-Path $PSScriptRoot 'Schedule GitHub Sync.ps1') -Root $temporary -Node $nodePath -Git $gitPath -Python $pythonPath | Out-Null
    if (!$global:SyncScheduleRegistration -or ($global:SyncScheduleRegistration.Trigger | ConvertTo-Json -Depth 10 -Compress) -ne $before) { throw 'The existing trigger anchor changed.' }
    if (![Object]::ReferenceEquals($global:SyncScheduleRegistration.Principal,$global:SyncScheduleFixture.Principal) -or ![Object]::ReferenceEquals($global:SyncScheduleRegistration.Settings,$global:SyncScheduleFixture.Settings)) { throw 'Existing owner or settings changed.' }
    if (!$global:SyncScheduleRegistration.Action.Arguments.Contains((' --python "{0}"' -f $pythonPath)) -or !$global:SyncScheduleRegistration.Action.Arguments.StartsWith($legacy)) { throw 'The migration changed source/root arguments.' }
    $global:SyncScheduleFixture.Triggers[0].Repetition.Interval='PT1H';$global:SyncScheduleRegistration=$null;$refused=$false
    try { & (Join-Path $PSScriptRoot 'Schedule GitHub Sync.ps1') -Root $temporary -Node $nodePath -Git $gitPath -Python $pythonPath | Out-Null } catch { $refused=$true }
    if (!$refused -or $global:SyncScheduleRegistration) { throw 'An unrelated schedule was mutated.' }
    $global:SyncScheduleFixture.Triggers[0].Repetition.Interval='PT2H'
    $global:SyncScheduleFixture.Actions[0].Arguments=$legacy+' --root "unrelated"';$global:SyncScheduleRegistration=$null;$refused=$false
    try { & (Join-Path $PSScriptRoot 'Schedule GitHub Sync.ps1') -Root $temporary -Node $nodePath -Git $gitPath -Python $pythonPath | Out-Null } catch { $refused=$true }
    if (!$refused -or $global:SyncScheduleRegistration) { throw 'An unrelated action was mutated.' }
    [pscustomobject]@{Tests=3;Passed=3;RealTaskOperations=0;PreservedTriggerAnchor=$true;PreservedOwnerAndPolicy=$true} | ConvertTo-Json -Compress
} finally {
    $resolved = (Get-Item -LiteralPath $temporary).FullName
    if ($resolved -ne $temporary -or (Get-Item -LiteralPath $temporary).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw 'Test cleanup path changed.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
