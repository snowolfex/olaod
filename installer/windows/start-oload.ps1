[CmdletBinding()]
param(
  [switch]$Detached
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.PSCommandPath
$envFile = Join-Path $scriptRoot ".env.runtime"
$appDir = Join-Path $scriptRoot "app"
$embeddedNode = Join-Path $scriptRoot "runtime\node\node.exe"
$embeddedOllama = Join-Path $scriptRoot "runtime\ollama\ollama.exe"
$embeddedOllamaModels = Join-Path $scriptRoot "runtime\ollama-models"

[Environment]::SetEnvironmentVariable("OLOAD_INSTALL_ROOT", $scriptRoot)

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