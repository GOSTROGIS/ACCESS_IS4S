param(
    [Parameter(Mandatory)][string]$Installation,
    [Parameter(Mandatory)][string]$OpenPgpPackage,
    [Parameter(Mandatory)][string]$PythonDependencies,
    [Parameter(Mandatory)][string]$Chrome,
    [string]$SlipcurveChrome,
    [string]$Git = (Get-Command git.exe -ErrorAction SilentlyContinue).Source
)

$ErrorActionPreference = 'Stop'
$installationPath = (Get-Item -LiteralPath $Installation).FullName
$openPgpPath = (Get-Item -LiteralPath $OpenPgpPackage).FullName
$pythonDependenciesPath = (Get-Item -LiteralPath $PythonDependencies).FullName
$chromePath = (Get-Item -LiteralPath $Chrome).FullName
$node = Join-Path $installationPath 'tools/node.exe'
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
    'consulting-serve.mjs', 'consulting-mcp.mjs', 'prepare.py', 'stage-runtime.py', 'update-runtimes.mjs'
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
[IO.File]::WriteAllText($settingsFile, (@{ chrome = $chromePath; slipcurveChrome = $slipcurveBrowser; git = $gitPath } | ConvertTo-Json))
& $node (Join-Path $local 'update-runtimes.mjs') verify --root $installationPath
if ($LASTEXITCODE -ne 0) { throw 'An installed application failed its updater regression. The launchers were not switched.' }

$portalFiles = @(
    'intranet.mjs', 'runtime-state.mjs', 'product-runtimes.mjs', 'native-profile.mjs', 'native-open.mjs', 'consulting-edition.mjs', 'consulting-serve.mjs',
    'consulting-mcp.mjs', 'Schedule Runtime Updates.ps1', 'Update Runtimes.cmd'
)
foreach ($name in $portalFiles) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $installationPath
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'storytold-workspace') -Destination (Join-Path $installationPath 'tools') -Recurse -Force
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
