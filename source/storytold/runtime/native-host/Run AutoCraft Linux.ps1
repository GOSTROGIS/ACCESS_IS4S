param(
    [Parameter(Mandatory)][string]$ConfigurationFile,
    [Parameter(Mandatory)][string]$Node,
    [Parameter(Mandatory)][string]$Controller
)
$ErrorActionPreference = 'Stop'
foreach ($path in @($ConfigurationFile, $Node, $Controller)) {
    if ($path -match '["\r\n]' -or -not [IO.File]::Exists($path)) { throw 'Invalid local runtime reference.' }
}
$log = Join-Path (Split-Path -Parent $ConfigurationFile) 'supervisor.log'
if ([IO.File]::Exists($log) -and (Get-Item -LiteralPath $log).Length -gt 1048576) { [IO.File]::WriteAllText($log, '') }
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = $Node
$start.Arguments = '"' + $Controller + '" supervise --configuration "' + $ConfigurationFile + '"'
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.EnvironmentVariables.Clear()
foreach ($key in @('SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'COMSPEC', 'USERNAME', 'USERDOMAIN')) {
    $value = [Environment]::GetEnvironmentVariable($key)
    if ($null -ne $value) { $start.EnvironmentVariables[$key] = $value }
}
$process = [Diagnostics.Process]::Start($start)
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
$process.WaitForExit()
$text = $stdout.Result + $stderr.Result
if ($text.Length -gt 65536) { $text = $text.Substring($text.Length - 65536) }
[IO.File]::AppendAllText($log, ('{0:o} supervisor exit {1}{2}{3}' -f [DateTime]::UtcNow, $process.ExitCode, [Environment]::NewLine, $text))
exit $process.ExitCode
