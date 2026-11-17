param(
    [Parameter(Mandatory)][string]$Installation,
    [Parameter(Mandatory)][string]$OpenPgpPackage,
    [Parameter(Mandatory)][string]$PythonDependencies,
    [Parameter(Mandatory)][string]$Chrome
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
foreach ($name in @('acquire-web-releases.mjs', 'app-targets.json', 'import_releases.py', 'verify-cadcraft-native.py', 'verify-photocraft-browser.py', 'verify-office-browser.py', 'verify-creative-native.mjs', 'verify-vectorcraft-native.py')) {
    Copy-Item -LiteralPath (Join-Path $runtimeSource $name) -Destination $runner
}
foreach ($name in @('intranet.mjs', 'runtime-state.mjs', 'prepare.py', 'stage-runtime.py', 'update-runtimes.mjs')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $local
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'workspace') -Destination $local -Recurse -Force
[IO.File]::WriteAllText((Join-Path $runner 'settings.json'), (@{ chrome = $chromePath } | ConvertTo-Json))
& $node (Join-Path $local 'update-runtimes.mjs') verify --root $installationPath
if ($LASTEXITCODE -ne 0) { throw 'An installed application failed its updater regression. The launchers were not switched.' }

foreach ($name in @('intranet.mjs', 'runtime-state.mjs', 'Schedule Runtime Updates.ps1', 'Update Runtimes.cmd')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $installationPath
}
$template = Join-Path $PSScriptRoot 'Launch Managed Application.cmd'
foreach ($name in @('cadcraft', 'effectcraft', 'lightcraft', 'vectorcraft')) {
    Copy-Item -LiteralPath $template -Destination (Join-Path $installationPath "Storytold/native/launchers/$name.cmd")
}
