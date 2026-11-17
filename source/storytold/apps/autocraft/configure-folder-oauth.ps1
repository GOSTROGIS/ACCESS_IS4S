$ErrorActionPreference = 'Stop'
if ($env:AUTOCRAFT_SECRETS_FILE) { throw 'Configure the custom secrets path separately or clear AUTOCRAFT_SECRETS_FILE for this setup.' }
$node = Join-Path $PSScriptRoot '..\..\tools\node.exe'
$launcher = Join-Path $PSScriptRoot 'windows-folder.mjs'
$private = & $node $launcher private-dir
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$file = Join-Path $private 'secrets.json'
if (Test-Path -LiteralPath $file) { throw 'AutoCraft already has a secrets file. Setup leaves the existing file in place.' }
Write-Host 'Use the GitHub OAuth application registered for http://127.0.0.1:8993/auth/callback.'
$id = (Read-Host 'GitHub OAuth client ID').Trim()
$secret = Read-Host 'GitHub OAuth client secret' -AsSecureString
if (-not $id -or -not $secret.Length) { throw 'Both OAuth values are required.' }
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$bytes = [byte[]]::new(32)
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
$temp = $file + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
try {
    $random.GetBytes($bytes)
    $json = @{github_client_id=$id; github_client_secret=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer); session_key=[Convert]::ToBase64String($bytes)} | ConvertTo-Json -Compress
    $stream = [IO.File]::Open($temp, 'CreateNew', 'Write', 'None')
    try {
        $encoded = [Text.UTF8Encoding]::new($false).GetBytes($json)
        $stream.Write($encoded, 0, $encoded.Length)
    } finally {
        $stream.Dispose()
        if ($encoded) { [Array]::Clear($encoded, 0, $encoded.Length) }
    }
    [IO.File]::Move($temp, $file)
} finally {
    [IO.File]::Delete($temp)
    $random.Dispose()
    [Array]::Clear($bytes, 0, $bytes.Length)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    $secret.Dispose()
}
Write-Host 'OAuth settings saved in the protected AutoCraft data folder.'
