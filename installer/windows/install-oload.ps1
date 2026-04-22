[CmdletBinding()]
param(
  [string]$InstallRoot,
  [string]$Port,
  [switch]$BindLan,
  [string]$OllamaBaseUrl,
  [string]$UpdateManifestUrl,
  [string]$UpdateChannel,
  [string]$AdminPassword,
  [string]$SessionSecret,
  [switch]$StartNow,
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$MinimumNodeVersion = [version]"20.9.0"

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Prompt-Value([string]$Prompt, [string]$Default = "") {
  if ($NonInteractive) {
    return $Default
  }

  if ($Default) {
    $value = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($value)) {
      return $Default
    }

    return $value.Trim()
  }

  return (Read-Host $Prompt).Trim()
}

function Prompt-YesNo([string]$Prompt, [bool]$Default) {
  if ($NonInteractive) {
    return $Default
  }

  $defaultLabel = if ($Default) { "Y/n" } else { "y/N" }
  $value = Read-Host "$Prompt [$defaultLabel]"

  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }

  return $value.Trim().ToLowerInvariant().StartsWith("y")
}

function Get-ScriptRoot() {
  $PSScriptRoot
}

function Get-SystemNodePath() {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue

  if ($command) {
    return $command.Source
  }

  return $null
}

function Get-NodeVersion([string]$NodePath) {
  [version]((& $NodePath -p "process.versions.node").Trim())
}

function Get-NodeAssetName() {
  $architectures = @($env:PROCESSOR_ARCHITEW6432, $env:PROCESSOR_ARCHITECTURE) | Where-Object { $_ }

  if ($architectures -contains "ARM64") {
    return "win-arm64-zip"
  }

  return "win-x64-zip"
}

function Resolve-NodeDownload() {
  $assetName = Get-NodeAssetName
  $releases = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
  $release = $releases | Where-Object { $_.lts -and $_.files -contains $assetName } | Select-Object -First 1

  if (-not $release) {
    throw "Unable to resolve a latest Node.js LTS download for $assetName."
  }

  return [pscustomobject]@{
    Version = $release.version
    Url = "https://nodejs.org/dist/$($release.version)/node-$($release.version)-$assetName.zip"
  }
}

function Ensure-NodeRuntime([string]$RuntimeRoot) {
  $systemNode = Get-SystemNodePath

  if ($systemNode) {
    try {
      $version = Get-NodeVersion $systemNode
      if ($version -ge $MinimumNodeVersion) {
        Write-Host "Using system Node.js $version at $systemNode"
        return $systemNode
      }
    } catch {
    }
  }

  $embeddedNode = Join-Path $RuntimeRoot "node\node.exe"
  if (Test-Path $embeddedNode) {
    try {
      $embeddedVersion = Get-NodeVersion $embeddedNode
      if ($embeddedVersion -ge $MinimumNodeVersion) {
        Write-Host "Using bundled Node.js $embeddedVersion at $embeddedNode"
        return $embeddedNode
      }
    } catch {
    }
  }

  Write-Step "Downloading Node.js LTS"
  $download = Resolve-NodeDownload
  $tempZip = Join-Path ([System.IO.Path]::GetTempPath()) "oload-node.zip"
  $extractRoot = Join-Path $RuntimeRoot "node-extract"
  $targetRoot = Join-Path $RuntimeRoot "node"

  New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
  Invoke-WebRequest -Uri $download.Url -OutFile $tempZip
  Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive -Path $tempZip -DestinationPath $extractRoot -Force

  $extractedFolder = Get-ChildItem -Path $extractRoot -Directory | Select-Object -First 1
  if (-not $extractedFolder) {
    throw "Node.js download extracted without a runtime directory."
  }

  Remove-Item $targetRoot -Recurse -Force -ErrorAction SilentlyContinue
  Move-Item -Path $extractedFolder.FullName -Destination $targetRoot
  Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $tempZip -Force -ErrorAction SilentlyContinue

  $nodePath = Join-Path $targetRoot "node.exe"
  $version = Get-NodeVersion $nodePath
  Write-Host "Installed bundled Node.js $version at $nodePath"
  return $nodePath
}

function Get-OllamaPath() {
  $command = Get-Command ollama.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $knownPaths = @(
    "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
    "$env:ProgramFiles\Ollama\ollama.exe"
  )

  foreach ($candidate in $knownPaths) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

function Resolve-OllamaDownloadUrl() {
  try {
    $page = Invoke-WebRequest -Uri "https://ollama.com/download" -UseBasicParsing
    $match = [regex]::Match($page.Content, 'https://ollama\.com/download/OllamaSetup\.exe')
    if ($match.Success) {
      return $match.Value
    }
  } catch {
  }

  return "https://ollama.com/download/OllamaSetup.exe"
}

function Ensure-OllamaInstalled() {
  $ollamaPath = Get-OllamaPath
  if ($ollamaPath) {
    Write-Host "Using Ollama at $ollamaPath"
    return $ollamaPath
  }

  Write-Step "Installing Ollama"
  $installerUrl = Resolve-OllamaDownloadUrl
  $tempInstaller = Join-Path ([System.IO.Path]::GetTempPath()) "OllamaSetup.exe"
  Invoke-WebRequest -Uri $installerUrl -OutFile $tempInstaller
  Start-Process -FilePath $tempInstaller -Wait
  Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue

  $ollamaPath = Get-OllamaPath
  if (-not $ollamaPath) {
    throw "Ollama installer completed, but ollama.exe was not found afterwards."
  }

  return $ollamaPath
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

function Ensure-OllamaRunning([string]$OllamaPath, [string]$BaseUrl) {
  if (-not (Test-LocalOllamaBaseUrl $BaseUrl)) {
    return
  }

  if (Test-OllamaApi $BaseUrl) {
    Write-Host "Ollama API is already reachable at $BaseUrl"
    return
  }

  Write-Step "Starting Ollama"
  Start-Process -FilePath $OllamaPath -ArgumentList "serve" -WindowStyle Hidden | Out-Null

  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 1500
    if (Test-OllamaApi $BaseUrl) {
      Write-Host "Ollama API is ready at $BaseUrl"
      return
    }
  }

  throw "Timed out waiting for Ollama to become reachable at $BaseUrl."
}

function Copy-AppPayload([string]$BundleRoot, [string]$TargetRoot) {
  $sourceAppDir = Join-Path $BundleRoot "app"
  $targetAppDir = Join-Path $TargetRoot "app"

  if (-not (Test-Path (Join-Path $sourceAppDir "server.js"))) {
    throw "This installer bundle does not contain a standalone app payload. Run npm run bundle:installers first."
  }

  New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
  Remove-Item $targetAppDir -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item -Path $sourceAppDir -Destination $targetAppDir -Recurse -Force
  Copy-Item -Path (Join-Path $BundleRoot "start-oload.ps1") -Destination (Join-Path $TargetRoot "start-oload.ps1") -Force

  @"
@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0start-oload.ps1"
"@ | Set-Content -Path (Join-Path $TargetRoot "start-oload.cmd") -Encoding ASCII
}

function Write-RuntimeEnv([string]$TargetRoot, [hashtable]$Values) {
  $lines = foreach ($key in $Values.Keys) {
    "$key=$($Values[$key])"
  }

  Set-Content -Path (Join-Path $TargetRoot ".env.runtime") -Value ($lines -join "`r`n") -Encoding ASCII
}

$bundleRoot = Get-ScriptRoot
$defaultInstallRoot = if ($InstallRoot) { $InstallRoot } else { Join-Path $env:LOCALAPPDATA "Oload" }

Write-Step "Collecting install settings"
$resolvedInstallRoot = Prompt-Value "Install location" $defaultInstallRoot
$portDefault = if ($Port) { $Port } else { "3000" }
$port = Prompt-Value "Port" $portDefault
$bindLan = Prompt-YesNo "Expose Oload on your local network" $BindLan.IsPresent
$hostname = if ($bindLan) { "0.0.0.0" } else { "127.0.0.1" }
$ollamaBaseUrlDefault = if ($OllamaBaseUrl) { $OllamaBaseUrl } else { "http://127.0.0.1:11434" }
$ollamaBaseUrl = Prompt-Value "Ollama base URL" $ollamaBaseUrlDefault
$updateManifestUrlDefault = if ($UpdateManifestUrl) { $UpdateManifestUrl } else { "" }
$updateManifestUrl = Prompt-Value "Optional update manifest URL (leave blank to disable live updates)" $updateManifestUrlDefault
$updateChannelDefault = if ($UpdateChannel) { $UpdateChannel } else { "stable" }
$updateChannel = Prompt-Value "Update channel" $updateChannelDefault
$adminPassword = Prompt-Value "Optional bootstrap admin password (leave blank to skip)" $AdminPassword
$sessionSecret = Prompt-Value "Session secret (leave blank to auto-generate)" $SessionSecret
$startNowChoice = Prompt-YesNo "Start Oload after install" $StartNow.IsPresent

if (-not $sessionSecret) {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $sessionSecret = [Convert]::ToBase64String($bytes)
}

$runtimeRoot = Join-Path $resolvedInstallRoot "runtime"

$nodePath = Ensure-NodeRuntime $runtimeRoot
$ollamaPath = Ensure-OllamaInstalled
Ensure-OllamaRunning $ollamaPath $ollamaBaseUrl
Copy-AppPayload $bundleRoot $resolvedInstallRoot
Write-RuntimeEnv $resolvedInstallRoot @{
  HOSTNAME = $hostname
  PORT = $port
  NODE_ENV = "production"
  OLLAMA_BASE_URL = $ollamaBaseUrl
  OLOAD_UPDATE_MANIFEST_URL = $updateManifestUrl
  OLOAD_UPDATE_CHANNEL = $updateChannel
  OLOAD_ADMIN_PASSWORD = $adminPassword
  OLOAD_SESSION_SECRET = $sessionSecret
}

if ($startNowChoice) {
  Write-Step "Starting Oload"
  & (Join-Path $resolvedInstallRoot "start-oload.ps1") -Detached | Out-Null
}

$launchUrl = if ($hostname -eq "0.0.0.0") { "http://localhost:$port" } else { "http://${hostname}:$port" }

Write-Host "`nInstalled Oload to $resolvedInstallRoot"
Write-Host "Launch later with $resolvedInstallRoot\start-oload.cmd"
Write-Host "Open $launchUrl after the server finishes booting."