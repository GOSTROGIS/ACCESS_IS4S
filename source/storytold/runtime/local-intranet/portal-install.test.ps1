param([string]$Node = (Get-Command node.exe -ErrorAction Stop).Source)

$ErrorActionPreference = 'Stop'
$parent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
$root = Join-Path $parent ('is4s-portal-install-' + [guid]::NewGuid().ToString('N'))
$installer = Join-Path $PSScriptRoot 'Install Runtime Updater.ps1'
try {
    [void][IO.Directory]::CreateDirectory((Join-Path $root 'tools/access-workspace'))
    Copy-Item -LiteralPath $Node -Destination (Join-Path $root 'tools/node.exe')
    [IO.File]::WriteAllText((Join-Path $root 'index.html'), 'prior landing')
    $private = Join-Path $root 'tools/access-workspace/private.txt'
    [IO.File]::WriteAllText($private, 'saved workspace')
    $unexpected = Join-Path $root 'tools/access-workspace/model.mjs'
    [void][IO.Directory]::CreateDirectory($unexpected)
    $refused = $false
    try { & $installer -PortalOnly -Installation $root } catch { $refused = $true }
    if (!$refused -or [IO.File]::ReadAllText((Join-Path $root 'index.html')) -ne 'prior landing') {
        throw 'A conflicting target changed the prior live files.'
    }
    [IO.Directory]::Delete($unexpected)
    & $installer -PortalOnly -Installation $root
    foreach ($group in @('.', 'access-workspace', 'storytold-workspace')) {
        $target = if ($group -eq '.') { $root } else { Join-Path $root "tools/$group" }
        $source = Join-Path $PSScriptRoot $group
        $names = switch ($group) {
            '.' { 'index.html','portal.css','portal.mjs','intranet.mjs','product-runtimes.mjs','runtime-state.mjs','native-profile.mjs','consulting-edition.mjs' }
            'access-workspace' { 'index.html','workspace.css','workspace.mjs','store.mjs','model.mjs' }
            'storytold-workspace' { 'index.html','pdfcraft.html','pdfcraft-page.mjs','workspace.mjs' }
        }
        foreach ($name in $names) {
            $actual = (Get-FileHash -LiteralPath (Join-Path $target $name)).Hash
            if ($actual -ne (Get-FileHash -LiteralPath (Join-Path $source $name)).Hash) { throw "Installed file differs: $group/$name" }
        }
    }
    if ((& $installer -PortalOnly -Installation $root) -notmatch 'Updated 0 files') { throw 'Second installation changed identical files.' }
    if ([IO.File]::ReadAllText($private) -ne 'saved workspace') { throw 'Unmanaged file changed.' }
    if (Get-ChildItem -LiteralPath $root -File -Recurse | Where-Object { $_.Name -match '\.(bak|new)$|\.test\.' }) {
        throw 'Unexpected installation artifacts'
    }
    Write-Output 'PASS: all 17 portal assets, preflight refusal, idempotence and unrelated files'
} finally {
    $verified = [IO.Path]::GetFullPath($root)
    if ([IO.Path]::GetDirectoryName($verified) -ne $parent -or [IO.Path]::GetFileName($verified) -notmatch '^is4s-portal-install-[a-f0-9]{32}$') {
        throw 'Unexpected temporary test root'
    }
    if (Test-Path -LiteralPath $verified) { Remove-Item -LiteralPath $verified -Force -Recurse }
}
