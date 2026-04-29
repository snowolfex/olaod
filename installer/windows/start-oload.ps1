[CmdletBinding()]
param(
  [switch]$Detached
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.PSCommandPath
$brokerDir = Join-Path $scriptRoot "broker"
$brokerScript = Join-Path $brokerDir "src\server.mjs"
$envFile = Join-Path $scriptRoot ".env.runtime"
$appDir = Join-Path $scriptRoot "app"
$embeddedNode = Join-Path $scriptRoot "runtime\node\node.exe"
$embeddedOllama = Join-Path $scriptRoot "runtime\ollama\ollama.exe"
$embeddedOllamaModels = Join-Path $scriptRoot "runtime\ollama-models"
$installBindingPath = Join-Path $scriptRoot ".oload-install-binding"

[Environment]::SetEnvironmentVariable("OLOAD_INSTALL_ROOT", $scriptRoot)

function Get-NormalizedInstallPath([string]$Path) {
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if ($fullPath.Length -gt 3) {
    $fullPath = $fullPath.TrimEnd("\\", "/")
  }

  return $fullPath
}

function Read-KeyValueFile([string]$Path) {
  $result = @{}

  if (-not (Test-Path $Path)) {
    return $result
  }

  Get-Content $Path | ForEach-Object {
    if ([string]::IsNullOrWhiteSpace($_) -or $_.StartsWith("#")) {
      return
    }

    $pair = $_ -split "=", 2
    if ($pair.Length -eq 2) {
      $result[$pair[0]] = $pair[1]
    }
  }

  return $result
}

function Get-DefaultMachineIdPath() {
  if ($env:LOCALAPPDATA) {
    return Join-Path $env:LOCALAPPDATA "OloadData\machine-id"
  }

  if ($env:USERPROFILE) {
    return Join-Path $env:USERPROFILE "AppData\Local\OloadData\machine-id"
  }

  return $null
}

function Set-InstallBindingEnvironment([string]$Status, [string]$Message, $Binding) {
  [Environment]::SetEnvironmentVariable("OLOAD_INSTALL_BINDING_STATUS", $Status)
  [Environment]::SetEnvironmentVariable("OLOAD_INSTALL_BINDING_MESSAGE", $Message)
  [Environment]::SetEnvironmentVariable("OLOAD_INSTALL_BINDING_CAN_REBIND", $(if ($Status -eq "valid" -or $Status -eq "moved" -or $Status -eq "missing") { "true" } else { "false" }))

  if ($Binding) {
    if ($Binding.ContainsKey("InstallId")) {
      [Environment]::SetEnvironmentVariable("OLOAD_INSTALL_ID", $Binding["InstallId"])
    }
    if ($Binding.ContainsKey("InstallRoot")) {
      [Environment]::SetEnvironmentVariable("OLOAD_INSTALL_BINDING_RECORDED_ROOT", $Binding["InstallRoot"])
    }
    if ($Binding.ContainsKey("InstalledAt")) {
      [Environment]::SetEnvironmentVariable("OLOAD_INSTALL_BINDING_INSTALLED_AT", $Binding["InstalledAt"])
    }
  }

  [Environment]::SetEnvironmentVariable("OLOAD_INSTALL_BINDING_CHECKED_AT", (Get-Date).ToString("o"))
}

function Test-InstallBinding() {
  $machineIdPath = if ($env:OLOAD_MACHINE_ID_PATH) { $env:OLOAD_MACHINE_ID_PATH } else { Get-DefaultMachineIdPath }
  $binding = Read-KeyValueFile $installBindingPath

  [Environment]::SetEnvironmentVariable("OLOAD_INSTALL_BINDING_PATH", $installBindingPath)
  if ($machineIdPath) {
    [Environment]::SetEnvironmentVariable("OLOAD_MACHINE_ID_PATH", $machineIdPath)
  }

  if ($binding.Count -eq 0) {
    $message = "Install binding file was not found at $installBindingPath."
    Set-InstallBindingEnvironment "missing" $message $null
    Write-Warning $message
    return "missing"
  }

  if (-not $machineIdPath -or -not (Test-Path $machineIdPath)) {
    $message = "Machine ID file was not found. Install binding status is incomplete."
    Set-InstallBindingEnvironment "missing" $message $binding
    Write-Warning $message
    return "missing"
  }

  $currentMachineId = (Get-Content -Path $machineIdPath -Raw -ErrorAction SilentlyContinue).Trim()
  $storedMachineId = if ($binding.ContainsKey("MachineId")) { $binding["MachineId"] } else { "" }
  $storedInstallRoot = if ($binding.ContainsKey("InstallRoot")) { $binding["InstallRoot"] } else { "" }
  $normalizedCurrentRoot = Get-NormalizedInstallPath $scriptRoot
  $normalizedStoredRoot = if ($storedInstallRoot) { Get-NormalizedInstallPath $storedInstallRoot } else { "" }

  if (-not $currentMachineId -or -not $storedMachineId) {
    $message = "Install binding is missing a machine ID."
    Set-InstallBindingEnvironment "missing" $message $binding
    Write-Warning $message
    return "missing"
  }

  [Environment]::SetEnvironmentVariable("OLOAD_MACHINE_ID", $currentMachineId)

  if ($currentMachineId -ne $storedMachineId) {
    $message = "Install binding mismatch: this copy was created for a different computer."
    Set-InstallBindingEnvironment "copied" $message $binding
    Write-Warning $message
    return "copied"
  }

  if (-not $normalizedStoredRoot -or $normalizedStoredRoot -ne $normalizedCurrentRoot) {
    $message = "Install binding mismatch: this install appears to have moved from $storedInstallRoot to $scriptRoot."
    Set-InstallBindingEnvironment "moved" $message $binding
    Write-Warning $message
    return "moved"
  }

  Set-InstallBindingEnvironment "valid" "Install binding matches this computer and location." $binding
  return "valid"
}

function Test-LocalOllamaBaseUrl([string]$BaseUrl) {
  try {
    $uri = [uri]$BaseUrl
    return $uri.Host -in @("127.0.0.1", "localhost", "0.0.0.0")
  } catch {
    return $false
  }
}

function Test-OllamaApi([string]$BaseUrl) {
  try {
    Invoke-WebRequest -Uri "$BaseUrl/api/tags" -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Test-BrokerApi([string]$BaseUrl) {
  try {
    Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Start-EmbeddedOllamaIfNeeded() {
  if (-not (Test-Path $embeddedOllama)) {
    return
  }

  if (-not $env:OLLAMA_BASE_URL -or -not (Test-LocalOllamaBaseUrl $env:OLLAMA_BASE_URL)) {
    return
  }

  if (Test-OllamaApi $env:OLLAMA_BASE_URL) {
    return
  }

  $uri = [uri]$env:OLLAMA_BASE_URL
  $previousHost = [Environment]::GetEnvironmentVariable("OLLAMA_HOST")
  $previousModels = [Environment]::GetEnvironmentVariable("OLLAMA_MODELS")

  try {
    [Environment]::SetEnvironmentVariable("OLLAMA_HOST", "$($uri.Host):$($uri.Port)")
    New-Item -ItemType Directory -Path $embeddedOllamaModels -Force | Out-Null
    [Environment]::SetEnvironmentVariable("OLLAMA_MODELS", $embeddedOllamaModels)
    Start-Process -FilePath $embeddedOllama -ArgumentList "serve" -WindowStyle Hidden | Out-Null
  } finally {
    [Environment]::SetEnvironmentVariable("OLLAMA_HOST", $previousHost)
    [Environment]::SetEnvironmentVariable("OLLAMA_MODELS", $previousModels)
  }
}

function Start-LocalBrokerIfNeeded([string]$NodePath) {
  if (-not (Test-Path $brokerScript)) {
    return
  }

  $brokerBaseUrl = if ($env:OLOAD_CONTROL_BROKER_BASE_URL) { $env:OLOAD_CONTROL_BROKER_BASE_URL } else { "http://127.0.0.1:4010" }
  if (Test-BrokerApi $brokerBaseUrl) {
    return
  }

  $previousBrokerBaseUrl = [Environment]::GetEnvironmentVariable("BROKER_BASE_URL")
  $previousControlBaseUrl = [Environment]::GetEnvironmentVariable("OLOAD_CONTROL_BROKER_BASE_URL")

  try {
    [Environment]::SetEnvironmentVariable("BROKER_BASE_URL", $brokerBaseUrl)
    [Environment]::SetEnvironmentVariable("OLOAD_CONTROL_BROKER_BASE_URL", $brokerBaseUrl)
    Start-Process -FilePath $NodePath -ArgumentList $brokerScript -WorkingDirectory $brokerDir -WindowStyle Hidden | Out-Null
  } finally {
    [Environment]::SetEnvironmentVariable("BROKER_BASE_URL", $previousBrokerBaseUrl)
    [Environment]::SetEnvironmentVariable("OLOAD_CONTROL_BROKER_BASE_URL", $previousControlBaseUrl)
  }
}

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

$installBindingStatus = Test-InstallBinding
if ($installBindingStatus -eq "copied") {
  throw "This installed copy belongs to a different computer and cannot be started here. Move back to the original machine or reinstall Oload on this computer."
}

Start-EmbeddedOllamaIfNeeded

$nodePath = if (Test-Path $embeddedNode) {
  $embeddedNode
} else {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Node.js runtime not found. Re-run install-oload.ps1."
  }

  $command.Source
}

Start-LocalBrokerIfNeeded $nodePath

if ($Detached) {
  Start-Process -FilePath $nodePath -ArgumentList "server.js" -WorkingDirectory $appDir -WindowStyle Hidden | Out-Null
  $displayHost = if ($env:HOSTNAME -eq "0.0.0.0") { "localhost" } else { $env:HOSTNAME }
  Write-Host "Oload started at http://${displayHost}:$($env:PORT)"
  return
}

Push-Location $appDir
try {
  & $nodePath "server.js"
} finally {
  Pop-Location
}