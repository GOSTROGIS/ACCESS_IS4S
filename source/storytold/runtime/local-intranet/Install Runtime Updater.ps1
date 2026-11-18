[CmdletBinding(DefaultParameterSetName='Full')]
param(
    [Parameter(Mandatory)][string]$Installation,
    [Parameter(Mandatory,ParameterSetName='Full')][string]$OpenPgpPackage,
    [Parameter(Mandatory,ParameterSetName='Full')][string]$PythonDependencies,
    [Parameter(Mandatory,ParameterSetName='Full')][string]$Chrome,
    [Parameter(Mandatory,ParameterSetName='Portal')][switch]$PortalOnly,
    [string]$SlipcurveChrome,
    [string]$SlipcurveSourceCache,
    [string]$Git = (Get-Command git.exe -ErrorAction SilentlyContinue).Source
)

$ErrorActionPreference = 'Stop'
$installationPath = (Get-Item -LiteralPath $Installation).FullName
$node = Join-Path $installationPath 'tools/node.exe'

function Install-PortalFiles {
    $groups = [ordered]@{
        '.' = @('index.html','portal.css','portal.mjs','intranet.mjs','runtime-state.mjs',
                 'product-runtimes.mjs','native-profile.mjs','consulting-edition.mjs')
        'access-workspace' = @('index.html','model.mjs','store.mjs','workspace.css','workspace.mjs')
        'storytold-workspace' = @('index.html','pdfcraft.html','pdfcraft-page.mjs','workspace.mjs')
    }
    if (!(Test-Path -LiteralPath $node -PathType Leaf)) { throw 'The portal requires its installed Node.js runtime.' }
    & $node --check (Join-Path $PSScriptRoot 'intranet.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'The portal failed its Node.js syntax check.' }
    $planned = @()
    $applied = @()
    $suffix = [guid]::NewGuid().ToString('N')
    try {
        foreach ($group in $groups.Keys) {
            $targetRoot = $installationPath
            if ($group -ne '.') { $targetRoot = Join-Path $installationPath "tools/$group" }
            foreach ($directory in @($installationPath, (Join-Path $installationPath 'tools'), $targetRoot)) {
                if (Test-Path -LiteralPath $directory) {
                    $item = Get-Item -Force -LiteralPath $directory
                    if (!$item.PSIsContainer -or $item.LinkType) { throw 'The portal destination contains a redirected directory.' }
                }
            }
            [void][IO.Directory]::CreateDirectory($targetRoot)
            foreach ($name in $groups[$group]) {
                $from = Join-Path (Join-Path $PSScriptRoot $group) $name
                $to = Join-Path $targetRoot $name
                $hash = (Get-FileHash -LiteralPath $from -Algorithm SHA256).Hash
                $old = $null
                if (Test-Path -LiteralPath $to) {
                    $item = Get-Item -Force -LiteralPath $to
                    if ($item.PSIsContainer -or $item.LinkType) { throw "Unexpected portal target: $name" }
                    $old = (Get-FileHash -LiteralPath $to -Algorithm SHA256).Hash
                    if ($old -eq $hash) { continue }
                }
                $row = @{ To=$to; Old=$old; Hash=$hash; New="$to.$suffix.new"; Backup="$to.$suffix.bak" }
                $planned += $row
                [IO.File]::Copy($from, $row.New)
                if ((Get-FileHash -LiteralPath $row.New -Algorithm SHA256).Hash -ne $hash) { throw "Portal staging failed: $name" }
            }
        }
        foreach ($row in $planned) {
            if ($row.Old) {
                if ((Get-FileHash -LiteralPath $row.To -Algorithm SHA256).Hash -ne $row.Old) { throw 'A portal file changed during installation.' }
                [IO.File]::Replace($row.New, $row.To, $row.Backup)
            } else {
                [IO.File]::Move($row.New, $row.To)
            }
            $applied += $row
            if ((Get-FileHash -LiteralPath $row.To -Algorithm SHA256).Hash -ne $row.Hash) { throw 'Portal installation verification failed.' }
        }
    } catch {
        [array]::Reverse($applied)
        foreach ($row in $applied) {
            if ($row.Old) { [IO.File]::Replace($row.Backup, $row.To, $row.New) }
            else { [IO.File]::Delete($row.To) }
        }
        throw
    } finally {
        foreach ($row in $planned) { [IO.File]::Delete($row.New) }
    }
    foreach ($row in $applied) { [IO.File]::Delete($row.Backup) }
    Write-Output "Verified portal entry files and workspace assets. Updated $($applied.Length) files."
}

if ($PortalOnly) { Install-PortalFiles; return }
$openPgpPath = (Get-Item -LiteralPath $OpenPgpPackage).FullName
$pythonDependenciesPath = (Get-Item -LiteralPath $PythonDependencies).FullName
$chromePath = (Get-Item -LiteralPath $Chrome).FullName
$python = Join-Path $installationPath 'SLIPCURVE/runtime/python.exe'
if (!(Test-Path -LiteralPath $node -PathType Leaf) -or !(Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'Install the bundled Node.js and SLIPCURVE Python runtimes first.'
}
$dependency = Get-Content -LiteralPath (Join-Path $openPgpPath 'package.json') -Raw | ConvertFrom-Json
$expected = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).dependencies.openpgp
if ($dependency.name -ne 'openpgp' -or $dependency.version -ne $expected) {
    throw "Install OpenPGP.js $expected from the repository lockfile first."
}

$runner = Join-Path $installationPath 'tools/runtime-update'
$local = Join-Path $runner 'local-intranet'
$modules = Join-Path $runner 'node_modules/openpgp'
$pythonModules = Join-Path $runner 'python-deps'
foreach ($directory in @($local, $modules, $pythonModules)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
if ($openPgpPath -ne $modules) {
    Get-ChildItem -LiteralPath $openPgpPath -Force | Copy-Item -Destination $modules -Recurse -Force
}
if ($pythonDependenciesPath -ne $pythonModules) {
    Get-ChildItem -LiteralPath $pythonDependenciesPath -Force | Copy-Item -Destination $pythonModules -Recurse -Force
}
$runtimeSource = Split-Path -Parent $PSScriptRoot
$updaterFiles = @(
    'acquire-web-releases.mjs', 'app-targets.json', 'import_releases.py',
    'verify-cadcraft-native.py', 'verify-creative-native.mjs', 'verify-deckcraft-native.py',
    'verify-consulting-browser.py', 'verify-consulting-mcp.mjs',
    'verify-office-browser.py', 'verify-pdfcraft-native.py', 'verify-photocraft-browser.py',
    'verify-runtime-native.py', 'verify-soundcraft-native.py', 'verify-vectorcraft-native.py'
)
foreach ($name in $updaterFiles) {
    Copy-Item -LiteralPath (Join-Path $runtimeSource $name) -Destination $runner
}
$localFiles = @(
    'intranet.mjs', 'runtime-state.mjs', 'product-runtimes.mjs', 'native-profile.mjs', 'consulting-edition.mjs', 'consulting-release.mjs',
    'consulting-serve.mjs', 'consulting-mcp.mjs', 'prepare.py', 'stage-runtime.py', 'update-runtimes.mjs', 'project-command.py'
)
foreach ($name in $localFiles) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $local
}
$automationTools = Join-Path $installationPath 'tools\autocraft-linux'
New-Item -ItemType Directory -Path $automationTools -Force | Out-Null
foreach ($name in @('controller.mjs', 'native-login.mjs', 'update.mjs')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('autocraft-linux\' + $name)) -Destination $automationTools
}
Copy-Item -LiteralPath (Join-Path $runtimeSource 'native-host\publish-autocraft-source.py') -Destination $automationTools
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'workspace') -Destination $local -Recurse -Force
$gitPath = if ($Git) { (Get-Item -LiteralPath $Git).FullName }
$settingsFile = Join-Path $runner 'settings.json'
$previous = if (Test-Path -LiteralPath $settingsFile) {
    Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json
}
$slipcurveBrowser = if ($SlipcurveChrome) { (Get-Item -LiteralPath $SlipcurveChrome).FullName } else { $previous.slipcurveChrome }
$sourceCache = if ($SlipcurveSourceCache) { $SlipcurveSourceCache } else { $previous.slipcurveSourceCache }
$settings = @{ chrome = $chromePath; slipcurveChrome = $slipcurveBrowser; git = $gitPath }
if ($sourceCache) {
    $cacheItem = Get-Item -LiteralPath $sourceCache
    if (!$cacheItem.PSIsContainer -or ($cacheItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'The source cache must be a direct repository directory.' }
    $settings.slipcurveSourceCache = $cacheItem.FullName
}
[IO.File]::WriteAllText($settingsFile, ($settings | ConvertTo-Json))
& $node (Join-Path $local 'update-runtimes.mjs') verify --root $installationPath
if ($LASTEXITCODE -ne 0) { throw 'An installed application failed its updater regression. The launchers were not switched.' }

Install-PortalFiles
$portalFiles = @('native-open.mjs', 'consulting-serve.mjs', 'consulting-mcp.mjs', 'Schedule Runtime Updates.ps1', 'Update Runtimes.cmd')
foreach ($name in $portalFiles) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $installationPath
}
$consulting = Join-Path $installationPath 'CONSULTING'
if (Test-Path -LiteralPath (Join-Path $consulting 'find-node.cmd') -PathType Leaf) {
    foreach ($name in @('Start CONSULTING.cmd', 'Start Atlas MCP.cmd')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $consulting
    }
}
$template = Join-Path $PSScriptRoot 'Launch Managed Application.cmd'
foreach ($name in @('cadcraft', 'effectcraft', 'lightcraft', 'vectorcraft', 'pdfcraft', 'deckcraft', 'soundcraft',
    'anicraft', 'filmcraft', 'figcraft', 'wordcraft', 'photocraft', 'designcraft', 'texturecraft',
    'materialcraft', 'gridcraft', 'craft-anything')) {
    Copy-Item -LiteralPath $template -Destination (Join-Path $installationPath "Storytold/native/launchers/$name.cmd")
}
