param(
    [Parameter(Mandatory)][ValidateSet('CheckFile', 'CheckDirectory', 'ProtectDirectory')][string]$Action,
    [Parameter(Mandatory)][string]$LiteralPath
)

$ErrorActionPreference = 'Stop'
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$trusted = @($owner.Value, 'S-1-5-18', 'S-1-5-32-544')

function Get-OwnedItem([string]$Path, [bool]$Directory) {
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -ne $Directory -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'A reparse point or unexpected file type cannot hold AutoCraft secrets.'
    }
    $acl = Get-Acl -LiteralPath $item.FullName
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $owner) {
        throw 'The running Windows account must own AutoCraft private data.'
    }
    return $acl
}

function Assert-PrivateAcl([string]$Path, [bool]$Directory) {
    $acl = Get-OwnedItem $Path $Directory
    $descriptor = [Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
    if (($Directory -and -not $acl.AreAccessRulesProtected) -or $null -eq $descriptor.DiscretionaryAcl) {
        throw 'AutoCraft private data must have an explicit Windows access policy.'
    }
    $ownerMode = [int][Security.AccessControl.FileSystemRights]::FullControl
    $ownerInheritance = [int][Security.AccessControl.AceFlags]::ContainerInherit -bor [int][Security.AccessControl.AceFlags]::ObjectInherit
    $propagation = $ownerInheritance -bor [int][Security.AccessControl.AceFlags]::InheritOnly -bor [int][Security.AccessControl.AceFlags]::NoPropagateInherit
    $inheritsOwner = $false
    foreach ($ace in $descriptor.DiscretionaryAcl) {
        if ($ace.AceType -ne [Security.AccessControl.AceType]::AccessAllowed -or $ace.SecurityIdentifier.Value -notin $trusted) {
            throw 'AutoCraft private data grants access outside the running Windows account, SYSTEM and Administrators.'
        }
        if ($ace.SecurityIdentifier -eq $owner -and ([int]$ace.AceFlags -band $propagation) -eq $ownerInheritance -and ($ace.AccessMask -band $ownerMode) -eq $ownerMode) {
            $inheritsOwner = $true
        }
    }
    if ($Directory -and -not $inheritsOwner) {
        throw 'New private files must inherit access for the running Windows account.'
    }
}

if ($Action -eq 'ProtectDirectory') {
    $null = Get-OwnedItem $LiteralPath $true
    $icacls = Join-Path $env:SystemRoot 'System32\icacls.exe'
    $permissions = $trusted | Select-Object -Unique | ForEach-Object { '*' + $_ + ':(OI)(CI)F' }
    & $icacls $LiteralPath '/inheritance:r' '/grant:r' $permissions | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Windows did not accept the AutoCraft directory access policy.' }
}
if ($Action -eq 'CheckFile') {
    Assert-PrivateAcl (Split-Path -LiteralPath $LiteralPath) $true
    Assert-PrivateAcl $LiteralPath $false
} else {
    Assert-PrivateAcl $LiteralPath $true
}
