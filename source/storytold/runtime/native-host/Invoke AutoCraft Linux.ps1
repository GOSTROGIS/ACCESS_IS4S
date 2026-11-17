param(
    [Parameter(Mandatory)][string]$ConfigurationFile,
    [ValidateSet('status', 'rank', 'verify')][string]$Mode = 'status'
)

$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
if ($config.user -notmatch '^[a-z_][a-z0-9_-]*$' -or $config.port -lt 1024 -or $config.port -gt 65535) {
    throw 'Invalid private Linux runner connection settings.'
}
$ssh = (Get-Command ssh.exe -CommandType Application -ErrorAction Stop).Source
$key = (Get-Item -LiteralPath $config.key -ErrorAction Stop).FullName
$knownHosts = (Get-Item -LiteralPath $config.knownHosts -ErrorAction Stop).FullName
if ($config.root -notmatch '^/[a-zA-Z0-9._/-]+$' -or $config.root -match '/\.\.?(/|$)') {
    throw 'The guest runtime must be an absolute Linux directory.'
}

function Quote-Posix([string]$Value) {
    return "'" + $Value.Replace("'", "'\''") + "'"
}

$root = Quote-Posix $config.root
$setup = "set -eu; export PATH=/opt/node/bin:`$PATH; cd $root; mkdir -p .private/logs .private/locks; chmod 700 .private; " +
    'export AUTOCRAFT_DB="$PWD/.private/mirror.db" AUTOCRAFT_RUNNER_LOGS="$PWD/.private/logs" AUTOCRAFT_LOCK_DIR="$PWD/.private/locks"; '
$action = switch ($Mode) {
    'status' { 'node src/cli.ts pipeline status; node src/cli.ts runner jobs --limit 10' }
    'rank' { 'node src/cli.ts rank' }
    'verify' { 'bwrap --version; node --version; node src/cli.ts repos list' }
}
& $ssh -p ([string]$config.port) -i $key -o BatchMode=yes -o StrictHostKeyChecking=yes -o ("UserKnownHostsFile=" + $knownHosts) -o ConnectTimeout=10 ($config.user + '@127.0.0.1') ($setup + $action)
if ($LASTEXITCODE -ne 0) { throw "AutoCraft Linux $Mode exited $LASTEXITCODE." }
