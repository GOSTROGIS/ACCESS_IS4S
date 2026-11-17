param([Parameter(Mandatory)][string]$Installation)
$ErrorActionPreference = 'Stop'
$root = (Get-Item -LiteralPath $Installation).FullName
$node = Join-Path $root 'tools/node.exe'
$entry = Join-Path $root 'native-open.mjs'
if (!(Test-Path -LiteralPath $node -PathType Leaf) -or !(Test-Path -LiteralPath $entry -PathType Leaf)) { throw 'Installed native application launcher missing' }
$key = 'HKCU:\Software\Classes\slipcurve-app'
New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-Item -LiteralPath $key -Value 'URL:Slipcurve installed application'
Set-ItemProperty -LiteralPath $key -Name 'URL Protocol' -Value ''
Set-Item -LiteralPath "$key\shell\open\command" -Value ('"{0}" "{1}" "%1"' -f $node, $entry)
Write-Output 'Registered installed Storytold application links for the current Windows account.'
