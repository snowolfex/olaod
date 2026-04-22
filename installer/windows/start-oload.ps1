[CmdletBinding()]
param(
  [switch]$Detached
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.PSCommandPath
$envFile = Join-Path $scriptRoot ".env.runtime"
$appDir = Join-Path $scriptRoot "app"
$embeddedNode = Join-Path $scriptRoot "runtime\node\node.exe"

[Environment]::SetEnvironmentVariable("OLOAD_INSTALL_ROOT", $scriptRoot)

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ([string]::IsNullOrWhiteSpace($_) -or $_.StartsWith("#")) {
      return
    }

    $pair = $_ -split "=", 2
    if ($pair.Length -eq 2) {
      [Environment]::SetEnvironmentVariable($pair[0], $pair[1])
    }
  }
}

$nodePath = if (Test-Path $embeddedNode) {
  $embeddedNode
} else {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Node.js runtime not found. Re-run install-oload.ps1."
  }

  $command.Source
}

if ($Detached) {
  Start-Process -FilePath $nodePath -ArgumentList "server.js" -WorkingDirectory $appDir -WindowStyle Hidden | Out-Null
  $displayHost = if ($env:HOSTNAME -eq "0.0.0.0") { "localhost" } else { $env:HOSTNAME }
  Write-Host "Oload started at http://$displayHost:$($env:PORT)"
  return
}

Push-Location $appDir
try {
  & $nodePath "server.js"
} finally {
  Pop-Location
}