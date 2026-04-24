[CmdletBinding()]
param(
  [string]$InstallRoot,
  [string]$Port,
  [switch]$BindLan,
  [string]$OllamaBaseUrl,
  [string]$NodeMode,
  [string]$OllamaMode,
  [string]$DefaultLanguage,
  [string]$UpdateManifestUrl,
  [string]$UpdateChannel,
  [System.Security.SecureString]$AdminPassword,
  [string]$SessionSecret,
  [switch]$StartNow,
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$MinimumNodeVersion = [version]"20.9.0"
$script:CachedNodeRelease = $null
$script:CachedOllamaRelease = $null
$VoiceLanguageOptions = @(
  [pscustomobject]@{ Code = "auto"; Value = "auto"; Label = "Auto" },
  [pscustomobject]@{ Code = "us"; Value = "united-states"; Label = "United States" },
  [pscustomobject]@{ Code = "ar"; Value = "arabic"; Label = "Arabic" },
  [pscustomobject]@{ Code = "bn"; Value = "bengali"; Label = "Bengali" },
  [pscustomobject]@{ Code = "cn"; Value = "chinese"; Label = "Chinese" },
  [pscustomobject]@{ Code = "gb"; Value = "english"; Label = "English" },
  [pscustomobject]@{ Code = "fa"; Value = "farsi"; Label = "Persian" },
  [pscustomobject]@{ Code = "fr"; Value = "french"; Label = "French" },
  [pscustomobject]@{ Code = "hi"; Value = "hindi"; Label = "Hindi" },
  [pscustomobject]@{ Code = "ja"; Value = "japanese"; Label = "Japanese" },
  [pscustomobject]@{ Code = "ko"; Value = "korean"; Label = "Korean" },
  [pscustomobject]@{ Code = "pt"; Value = "portuguese"; Label = "Portuguese" },
  [pscustomobject]@{ Code = "ru"; Value = "russian"; Label = "Russian" },
  [pscustomobject]@{ Code = "es"; Value = "spanish"; Label = "Spanish" }
)

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function ConvertTo-PlainText([System.Security.SecureString]$Value) {
  if (-not $Value) {
    return ""
  }

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)

  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Read-ValuePrompt([string]$Prompt, [string]$Default = "") {
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

function Read-YesNoPrompt([string]$Prompt, [bool]$Default) {
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

function Read-ChoicePrompt([string]$Prompt, [string]$Default, [string[]]$Options) {
  if ($NonInteractive) {
    return $Default
  }

  $optionSummary = $Options -join "/"
  $value = Read-Host "$Prompt [$Default] ($optionSummary)"

  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }

  return $value.Trim()
}

function ConvertTo-Version([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $null
  }

  $match = [regex]::Match($Value, '(?i)\bv?(\d+(?:\.\d+){1,3})\b')
  if (-not $match.Success) {
    return $null
  }

  return [version]$match.Groups[1].Value
}

function Ensure-WindowsForms() {
  if (-not ("System.Windows.Forms.MessageBox" -as [type])) {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
  }
}

function Show-InstallerWarningDialog([string]$Title, [string]$Message) {
  try {
    Ensure-WindowsForms
    [System.Windows.Forms.MessageBox]::Show(
      $Message,
      $Title,
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    ) | Out-Null
    return
  } catch {
  }

  Write-Warning $Message
}

function Confirm-InstallerWarningDialog([string]$Title, [string]$Message) {
  try {
    Ensure-WindowsForms
    $result = [System.Windows.Forms.MessageBox]::Show(
      $Message,
      $Title,
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Warning,
      [System.Windows.Forms.MessageBoxDefaultButton]::Button2
    )

    return $result -eq [System.Windows.Forms.DialogResult]::Yes
  } catch {
    return Read-YesNoPrompt $Message $false
  }
}

function Get-DependencyVersionWarning([string]$DependencyName, [version]$CurrentVersion, [version]$RecommendedVersion, [version]$MinimumVersion, [string]$IsolatedLabel) {
  if (-not $CurrentVersion) {
    return $null
  }

  if ($MinimumVersion -and $CurrentVersion -lt $MinimumVersion) {
    return "$DependencyName $CurrentVersion is below the minimum supported version $MinimumVersion for Oload. Oload can install and use an isolated $IsolatedLabel instance inside its own install folder, and that is the default."
  }

  if ($RecommendedVersion -and $CurrentVersion -lt $RecommendedVersion) {
    return "$DependencyName $CurrentVersion is older than the isolated Oload-managed $IsolatedLabel version $RecommendedVersion. Oload can install and use an isolated $IsolatedLabel instance inside its own install folder, and that is the default."
  }

  return $null
}

function Confirm-ExistingDependencyChoice([string]$DependencyName, [string]$ExistingPath, [version]$CurrentVersion, [version]$RecommendedVersion, [version]$MinimumVersion, [string]$IsolatedLabel) {
  $warning = Get-DependencyVersionWarning $DependencyName $CurrentVersion $RecommendedVersion $MinimumVersion $IsolatedLabel
  if (-not $warning) {
    return $true
  }

  $pathLabel = if ($ExistingPath) { $ExistingPath } else { "the detected shared installation" }
  Show-InstallerWarningDialog "Oload Installer" "$warning`n`nDetected path: $pathLabel"

  $minimumLine = if ($MinimumVersion -and $CurrentVersion -lt $MinimumVersion) {
    "This is below the supported minimum and may cause Oload not to work."
  } else {
    "This older shared version may cause Oload not to work correctly."
  }

  return (Confirm-InstallerWarningDialog "Use Older Shared $DependencyName?" "$DependencyName $CurrentVersion was detected at:`n$pathLabel`n`n$minimumLine`n`nSelect Yes to keep using the shared installation anyway.`nSelect No to switch back to the default isolated $IsolatedLabel install.")
}

function Resolve-VoiceLanguage([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return "united-states"
  }

  $normalized = $Value.Trim().ToLowerInvariant()
  $matchedOption = $VoiceLanguageOptions | Where-Object { $_.Code -eq $normalized -or $_.Value -eq $normalized } | Select-Object -First 1

  if ($matchedOption) {
    return $matchedOption.Value
  }

  switch ($normalized) {
    "unitedstates" { return "united-states" }
    default {
      throw "Unsupported default language '$Value'. Use one of: $((($VoiceLanguageOptions | ForEach-Object Code) -join ", "))."
    }
  }
}

function Get-VoiceLanguageCode([string]$Value) {
  $resolved = Resolve-VoiceLanguage $Value
  $matchedOption = $VoiceLanguageOptions | Where-Object { $_.Value -eq $resolved } | Select-Object -First 1

  if ($matchedOption) {
    return $matchedOption.Code
  }

  return "us"
}

function Read-VoiceLanguagePrompt([string]$Default) {
  $resolvedDefault = Resolve-VoiceLanguage $Default

  if ($NonInteractive) {
    return $resolvedDefault
  }

  Write-Host "Available default language codes:" -ForegroundColor DarkGray
  foreach ($option in $VoiceLanguageOptions) {
    Write-Host ("  {0} = {1}" -f $option.Code, $option.Label) -ForegroundColor DarkGray
  }

  $selection = Read-ValuePrompt "Default language code" (Get-VoiceLanguageCode $resolvedDefault)
  return Resolve-VoiceLanguage $selection
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

function Get-SystemNodeInfo() {
  $systemNode = Get-SystemNodePath

  if (-not $systemNode) {
    return $null
  }

  try {
    $version = Get-NodeVersion $systemNode

    return [pscustomobject]@{
      Path = $systemNode
      Version = $version
      IsCompatible = ($version -ge $MinimumNodeVersion)
    }
  } catch {
    Write-Host "Found node.exe at $systemNode, but the version could not be verified." -ForegroundColor Yellow
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
    Version = (ConvertTo-Version $release.version)
    DisplayVersion = $release.version
    Url = "https://nodejs.org/dist/$($release.version)/node-$($release.version)-$assetName.zip"
  }
}

function Get-LatestNodeRelease() {
  if (-not $script:CachedNodeRelease) {
    try {
      $script:CachedNodeRelease = Resolve-NodeDownload
    } catch {
      $script:CachedNodeRelease = $null
    }
  }

  return $script:CachedNodeRelease
}

function Resolve-NodeMode([string]$Value) {
  $normalizedValue = if ($null -ne $Value) { $Value.Trim().ToLowerInvariant() } else { "" }

  switch ($normalizedValue) {
    "" { return "bundled" }
    "auto" { return "bundled" }
    "existing" { return "existing-if-found" }
    "existing-if-found" { return "existing-if-found" }
    "bundled" { return "bundled" }
    "install" { return "bundled" }
    default { throw "Unsupported Node.js mode '$Value'. Use existing-if-found or bundled." }
  }
}

function Read-NodeModePrompt([string]$Default, $SystemNodeInfo) {
  $resolvedDefault = Resolve-NodeMode $Default
  $recommendedNode = if ($SystemNodeInfo) { Get-LatestNodeRelease } else { $null }

  if ($SystemNodeInfo) {
    Write-Host "Verified existing Node.js $($SystemNodeInfo.Version) at $($SystemNodeInfo.Path)" -ForegroundColor DarkGray
    $nodeWarning = Get-DependencyVersionWarning "Node.js" $SystemNodeInfo.Version ($recommendedNode.Version) $MinimumNodeVersion "Node.js / npm"
    if ($nodeWarning) {
      Write-Host $nodeWarning -ForegroundColor Yellow
    }
  } else {
    Write-Host "No compatible existing Node.js runtime was found. Oload can install a bundled runtime for itself." -ForegroundColor DarkGray
  }

  $selection = Read-ChoicePrompt "Node.js/npm choice" $(if ($resolvedDefault -eq "bundled") { "bundled" } else { "existing" }) @("bundled", "existing")
  $resolvedSelection = Resolve-NodeMode $selection

  if ($resolvedSelection -eq "existing-if-found" -and $SystemNodeInfo) {
    if (-not (Confirm-ExistingDependencyChoice "Node.js" $SystemNodeInfo.Path $SystemNodeInfo.Version ($recommendedNode.Version) $MinimumNodeVersion "Node.js / npm")) {
      return "bundled"
    }
  }

  return $resolvedSelection
}

function Install-NodeRuntime([string]$RuntimeRoot, [string]$Mode, $SystemNodeInfo) {
  $embeddedNode = Join-Path $RuntimeRoot "node\node.exe"

  if ($Mode -eq "existing-if-found" -and $SystemNodeInfo) {
    Write-Host "Using existing Node.js $($SystemNodeInfo.Version) at $($SystemNodeInfo.Path)"
    return [pscustomobject]@{
      Action = "used-existing"
      Choice = $Mode
      DetectedPath = $SystemNodeInfo.Path
      ExistedBeforeInstall = $true
      InstalledByOload = $false
      Path = $SystemNodeInfo.Path
      Version = $SystemNodeInfo.Version
    }
  }

  if (Test-Path $embeddedNode) {
    try {
      $embeddedVersion = Get-NodeVersion $embeddedNode
      if ($embeddedVersion -ge $MinimumNodeVersion) {
        Write-Host "Using Oload-managed Node.js $embeddedVersion at $embeddedNode"
        return [pscustomobject]@{
          Action = "used-bundled"
          Choice = $Mode
          DetectedPath = if ($SystemNodeInfo) { $SystemNodeInfo.Path } else { "" }
          ExistedBeforeInstall = $true
          InstalledByOload = $true
          Path = $embeddedNode
          Version = $embeddedVersion
        }
      }
    } catch {
    }
  }

  Write-Step "Downloading Node.js LTS"
  $download = Get-LatestNodeRelease
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
  return [pscustomobject]@{
    Action = "installed-bundled"
    Choice = $Mode
    DetectedPath = if ($SystemNodeInfo) { $SystemNodeInfo.Path } else { "" }
    ExistedBeforeInstall = $false
    InstalledByOload = $true
    Path = $nodePath
    Version = $version
  }
}

function Get-OllamaPath() {
  $command = Get-Command ollama.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $knownPaths = @(
    "${env:LOCALAPPDATA}\Programs\Ollama\ollama.exe",
    "${env:ProgramFiles}\Ollama\ollama.exe"
  )

  foreach ($candidate in $knownPaths) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

function Get-OllamaVersion([string]$OllamaPath) {
  $rawVersion = (& $OllamaPath --version 2>$null | Select-Object -First 1)
  $version = ConvertTo-Version $rawVersion

  if (-not $version) {
    $rawVersion = (& $OllamaPath -v 2>$null | Select-Object -First 1)
    $version = ConvertTo-Version $rawVersion
  }

  return $version
}

function Get-OllamaInfo() {
  $ollamaPath = Get-OllamaPath
  if (-not $ollamaPath) {
    return $null
  }

  $version = $null
  try {
    $version = Get-OllamaVersion $ollamaPath
  } catch {
  }

  return [pscustomobject]@{
    Path = $ollamaPath
    Version = $version
  }
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

function Get-OllamaWindowsAssetName() {
  $architectures = @($env:PROCESSOR_ARCHITEW6432, $env:PROCESSOR_ARCHITECTURE) | Where-Object { $_ }

  if ($architectures -contains "ARM64") {
    return "ollama-windows-arm64.zip"
  }

  return "ollama-windows-amd64.zip"
}

function Resolve-OllamaDownload() {
  $assetName = Get-OllamaWindowsAssetName
  $release = Invoke-RestMethod -Headers @{ "User-Agent" = "oload-installer" } -Uri "https://api.github.com/repos/ollama/ollama/releases/latest"
  $asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1

  if (-not $asset) {
    throw "Unable to resolve a latest Ollama download for $assetName."
  }

  return [pscustomobject]@{
    Version = (ConvertTo-Version $release.tag_name)
    DisplayVersion = $release.tag_name
    Url = $asset.browser_download_url
    AssetName = $asset.name
  }
}

function Get-LatestOllamaRelease() {
  if (-not $script:CachedOllamaRelease) {
    try {
      $script:CachedOllamaRelease = Resolve-OllamaDownload
    } catch {
      $script:CachedOllamaRelease = $null
    }
  }

  return $script:CachedOllamaRelease
}

function Resolve-OllamaMode([string]$Value) {
  $normalizedValue = if ($null -ne $Value) { $Value.Trim().ToLowerInvariant() } else { "" }

  switch ($normalizedValue) {
    "" { return "install-or-repair" }
    "auto" { return "install-or-repair" }
    "existing" { return "existing-if-found" }
    "existing-if-found" { return "existing-if-found" }
    "install" { return "install-or-repair" }
    "install-or-repair" { return "install-or-repair" }
    "repair" { return "install-or-repair" }
    default { throw "Unsupported Ollama mode '$Value'. Use existing-if-found or install-or-repair." }
  }
}

function Read-OllamaModePrompt([string]$Default, [string]$DetectedPath) {
  $resolvedDefault = Resolve-OllamaMode $Default
  $detectedInfo = if ($DetectedPath) { Get-OllamaInfo } else { $null }
  $recommendedOllama = if ($detectedInfo) { Get-LatestOllamaRelease } else { $null }

  if ($DetectedPath) {
    $versionText = if ($detectedInfo -and $detectedInfo.Version) { " $($detectedInfo.Version)" } else { "" }
    Write-Host "Verified existing Ollama$versionText at $DetectedPath" -ForegroundColor DarkGray
    $ollamaWarning = Get-DependencyVersionWarning "Ollama" ($detectedInfo.Version) ($recommendedOllama.Version) $null "Ollama"
    if ($ollamaWarning) {
      Write-Host $ollamaWarning -ForegroundColor Yellow
    }
  } else {
    Write-Host "No existing Ollama installation was found in the common locations or PATH." -ForegroundColor DarkGray
  }

  $selection = Read-ChoicePrompt "Ollama choice" $(if ($resolvedDefault -eq "install-or-repair") { "install" } else { "existing" }) @("install", "existing")
  $resolvedSelection = Resolve-OllamaMode $selection

  if ($resolvedSelection -eq "existing-if-found" -and $detectedInfo) {
    if (-not (Confirm-ExistingDependencyChoice "Ollama" $detectedInfo.Path $detectedInfo.Version ($recommendedOllama.Version) $null "Ollama")) {
      return "install-or-repair"
    }
  }

  return $resolvedSelection
}

function Install-OllamaIfNeeded([string]$RuntimeRoot, [string]$Mode, $DetectedInfo) {
  if ($Mode -eq "existing-if-found" -and $DetectedInfo) {
    Write-Host "Using existing Ollama at $($DetectedInfo.Path)"
    return [pscustomobject]@{
      Action = "used-existing"
      Choice = $Mode
      DetectedPath = $DetectedInfo.Path
      ExistedBeforeInstall = $true
      InstalledByOload = $false
      Path = $DetectedInfo.Path
      Version = $DetectedInfo.Version
    }
  }

  $targetRoot = Join-Path $RuntimeRoot "ollama"
  $embeddedOllama = Join-Path $targetRoot "ollama.exe"

  if (Test-Path $embeddedOllama) {
    $embeddedVersion = Get-OllamaVersion $embeddedOllama
    if ($embeddedVersion) {
      Write-Host "Using Oload-managed Ollama $embeddedVersion at $embeddedOllama"
      return [pscustomobject]@{
        Action = "used-bundled"
        Choice = $Mode
        DetectedPath = if ($DetectedInfo) { $DetectedInfo.Path } else { "" }
        ExistedBeforeInstall = $true
        InstalledByOload = $true
        Path = $embeddedOllama
        Version = $embeddedVersion
      }
    }
  }

  Write-Step "Downloading isolated Ollama runtime"
  $download = Get-LatestOllamaRelease
  $tempZip = Join-Path ([System.IO.Path]::GetTempPath()) "oload-ollama.zip"
  $extractRoot = Join-Path $RuntimeRoot "ollama-extract"

  New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
  Invoke-WebRequest -Uri $download.Url -OutFile $tempZip
  Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive -Path $tempZip -DestinationPath $extractRoot -Force
  Remove-Item $targetRoot -Recurse -Force -ErrorAction SilentlyContinue
  Move-Item -Path $extractRoot -Destination $targetRoot
  Remove-Item $tempZip -Force -ErrorAction SilentlyContinue

  $ollamaPath = Join-Path $targetRoot "ollama.exe"
  if (-not (Test-Path $ollamaPath)) {
    throw "The isolated Ollama runtime was downloaded, but ollama.exe was not found afterwards."
  }

  $version = Get-OllamaVersion $ollamaPath

  return [pscustomobject]@{
    Action = if ($DetectedInfo) { "installed-bundled" } else { "installed-bundled" }
    Choice = $Mode
    DetectedPath = if ($DetectedInfo) { $DetectedInfo.Path } else { "" }
    ExistedBeforeInstall = $false
    InstalledByOload = $true
    Path = $ollamaPath
    Version = $version
  }
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

function Start-OllamaIfNeeded([string]$OllamaPath, [string]$BaseUrl) {
  if (-not (Test-LocalOllamaBaseUrl $BaseUrl)) {
    return
  }

  if (Test-OllamaApi $BaseUrl) {
    Write-Host "Ollama API is already reachable at $BaseUrl"
    return
  }

  Write-Step "Starting Ollama"
  $uri = [uri]$BaseUrl
  $previousHost = $env:OLLAMA_HOST
  $previousModels = $env:OLLAMA_MODELS
  $embeddedOllamaRoot = Split-Path -Parent $OllamaPath
  $embeddedModelsPath = Join-Path (Split-Path -Parent $embeddedOllamaRoot) "ollama-models"

  try {
    $env:OLLAMA_HOST = "$($uri.Host):$($uri.Port)"
    if ($OllamaPath.StartsWith((Join-Path (Split-Path -Parent $embeddedOllamaRoot) "ollama"), [System.StringComparison]::OrdinalIgnoreCase)) {
      New-Item -ItemType Directory -Path $embeddedModelsPath -Force | Out-Null
      $env:OLLAMA_MODELS = $embeddedModelsPath
    }

    Start-Process -FilePath $OllamaPath -ArgumentList "serve" -WindowStyle Hidden | Out-Null
  } finally {
    if ($null -ne $previousHost) {
      $env:OLLAMA_HOST = $previousHost
    } else {
      Remove-Item Env:OLLAMA_HOST -ErrorAction SilentlyContinue
    }

    if ($null -ne $previousModels) {
      $env:OLLAMA_MODELS = $previousModels
    } else {
      Remove-Item Env:OLLAMA_MODELS -ErrorAction SilentlyContinue
    }
  }

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
  Copy-Item -Path (Join-Path $BundleRoot "uninstall-oload.ps1") -Destination (Join-Path $TargetRoot "uninstall-oload.ps1") -Force
  Copy-Item -Path (Join-Path $BundleRoot "README.md") -Destination (Join-Path $TargetRoot "README.md") -Force

  @"
@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0start-oload.ps1"
"@ | Set-Content -Path (Join-Path $TargetRoot "start-oload.cmd") -Encoding ASCII

  @"
@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0uninstall-oload.ps1"
"@ | Set-Content -Path (Join-Path $TargetRoot "uninstall-oload.cmd") -Encoding ASCII
}

function Write-RuntimeEnv([string]$TargetRoot, [hashtable]$Values) {
  $lines = foreach ($key in $Values.Keys) {
    "$key=$($Values[$key])"
  }

  Set-Content -Path (Join-Path $TargetRoot ".env.runtime") -Value ($lines -join "`r`n") -Encoding ASCII
}

function Write-InstallState([string]$TargetRoot, [hashtable]$Values) {
  $lines = foreach ($key in $Values.Keys) {
    "$key=$($Values[$key])"
  }

  Set-Content -Path (Join-Path $TargetRoot ".oload-install-state") -Value ($lines -join "`r`n") -Encoding ASCII
}

function Write-UninstallNotes([string]$TargetRoot, [hashtable]$Values) {
  $lines = @(
    "Oload uninstall notes",
    "",
    "Install root: $($Values.InstallRoot)",
    "Installed at: $($Values.InstalledAt)",
    "",
    "Node.js/npm runtime:",
    "- Verified existing path before install: $($Values.NodeDetectedPath)",
    "- Selected mode: $($Values.NodeChoice)",
    "- Effective runtime path: $($Values.NodePath)",
    "- Existed before this install: $($Values.NodeExistedBeforeInstall)",
    "- Installed by Oload: $($Values.NodeInstalledByOload)",
    "",
    "Ollama:",
    "- Verified existing path before install: $($Values.OllamaDetectedPath)",
    "- Selected mode: $($Values.OllamaChoice)",
    "- Effective Ollama path: $($Values.OllamaPath)",
    "- Existed before this install: $($Values.OllamaExistedBeforeInstall)",
    "- Installed by Oload: $($Values.OllamaInstalledByOload)",
    "",
    "Default language: $($Values.DefaultLanguage)",
    "",
    "Use uninstall-oload.ps1 or uninstall-oload.cmd for script-based uninstall, or the native Oload uninstaller if this install came from OloadSetup.exe.",
    "The uninstall flow will ask again before removing shared Node.js/npm or Ollama dependencies.",
    "Ollama removal always requires an extra confirmation because it can remove all local models.",
    ""
  )

  Set-Content -Path (Join-Path $TargetRoot "UNINSTALL-NOTES.txt") -Value ($lines -join "`r`n") -Encoding ASCII
}

$bundleRoot = Get-ScriptRoot
$defaultInstallRoot = if ($InstallRoot) { $InstallRoot } else { Join-Path $env:LOCALAPPDATA "Oload" }
$adminPasswordDefault = if ($PSBoundParameters.ContainsKey("AdminPassword")) { ConvertTo-PlainText $AdminPassword } else { "" }
$verifiedSystemNode = Get-SystemNodeInfo
$verifiedOllama = Get-OllamaInfo

Write-Step "Collecting install settings"
$resolvedInstallRoot = Read-ValuePrompt "Install location" $defaultInstallRoot
$portDefault = if ($Port) { $Port } else { "3000" }
$port = Read-ValuePrompt "Port" $portDefault
$bindLan = Read-YesNoPrompt "Expose Oload on your local network" $BindLan.IsPresent
$hostname = if ($bindLan) { "0.0.0.0" } else { "127.0.0.1" }
$ollamaBaseUrlDefault = if ($OllamaBaseUrl) { $OllamaBaseUrl } else { "http://127.0.0.1:11434" }
$ollamaBaseUrl = Read-ValuePrompt "Ollama base URL" $ollamaBaseUrlDefault
$nodeMode = Read-NodeModePrompt $(if ($NodeMode) { $NodeMode } else { "bundled" }) $verifiedSystemNode
$ollamaMode = Read-OllamaModePrompt $(if ($OllamaMode) { $OllamaMode } else { "install-or-repair" }) $(if ($verifiedOllama) { $verifiedOllama.Path } else { "" })
$updateManifestUrlDefault = if ($UpdateManifestUrl) { $UpdateManifestUrl } else { "" }
$updateManifestUrl = Read-ValuePrompt "Optional update manifest URL (leave blank to disable live updates)" $updateManifestUrlDefault
$updateChannelDefault = if ($UpdateChannel) { $UpdateChannel } else { "stable" }
$updateChannel = Read-ValuePrompt "Update channel" $updateChannelDefault
$defaultLanguage = Read-VoiceLanguagePrompt $(if ($DefaultLanguage) { $DefaultLanguage } else { "united-states" })
$adminPassword = Read-ValuePrompt "Optional bootstrap admin password (leave blank to skip)" $adminPasswordDefault
$sessionSecret = Read-ValuePrompt "Session secret (leave blank to auto-generate)" $SessionSecret
$startNowChoice = Read-YesNoPrompt "Start Oload after install" $StartNow.IsPresent

if ($ollamaMode -eq "install-or-repair" -and $verifiedOllama -and (Test-LocalOllamaBaseUrl $ollamaBaseUrl)) {
  try {
    $ollamaUri = [uri]$ollamaBaseUrl
    if ($ollamaUri.Port -eq 11434) {
      $ollamaBaseUrl = "http://127.0.0.1:11435"
      Show-InstallerWarningDialog "Oload Installer" "A shared Ollama installation was detected on the default local port 11434. Oload is switching its isolated Ollama runtime to $ollamaBaseUrl so the private runtime can run separately by default."
    }
  } catch {
  }
}

if (-not $sessionSecret) {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $sessionSecret = [Convert]::ToBase64String($bytes)
}

$runtimeRoot = Join-Path $resolvedInstallRoot "runtime"

$nodeSelection = Install-NodeRuntime $runtimeRoot $nodeMode $verifiedSystemNode
$ollamaSelection = Install-OllamaIfNeeded $runtimeRoot $ollamaMode $verifiedOllama
Start-OllamaIfNeeded $ollamaSelection.Path $ollamaBaseUrl
Copy-AppPayload $bundleRoot $resolvedInstallRoot
Write-InstallState $resolvedInstallRoot @{
  InstallRoot = $resolvedInstallRoot
  InstalledAt = (Get-Date).ToString("o")
  DefaultLanguage = $defaultLanguage
  NodeChoice = $nodeSelection.Choice
  NodeAction = $nodeSelection.Action
  NodeDetectedPath = $nodeSelection.DetectedPath
  NodeExistedBeforeInstall = $nodeSelection.ExistedBeforeInstall
  NodeInstalledByOload = $nodeSelection.InstalledByOload
  NodePath = $nodeSelection.Path
  NodeVersion = $nodeSelection.Version
  OllamaChoice = $ollamaSelection.Choice
  OllamaAction = $ollamaSelection.Action
  OllamaDetectedPath = $ollamaSelection.DetectedPath
  OllamaExistedBeforeInstall = $ollamaSelection.ExistedBeforeInstall
  OllamaInstalledByOload = $ollamaSelection.InstalledByOload
  OllamaPath = $ollamaSelection.Path
  OllamaVersion = $ollamaSelection.Version
}
Write-UninstallNotes $resolvedInstallRoot @{
  InstallRoot = $resolvedInstallRoot
  InstalledAt = (Get-Date).ToString("o")
  DefaultLanguage = $defaultLanguage
  NodeChoice = $nodeSelection.Choice
  NodeDetectedPath = if ($nodeSelection.DetectedPath) { $nodeSelection.DetectedPath } else { "not found" }
  NodeExistedBeforeInstall = $nodeSelection.ExistedBeforeInstall
  NodeInstalledByOload = $nodeSelection.InstalledByOload
  NodePath = $nodeSelection.Path
  OllamaChoice = $ollamaSelection.Choice
  OllamaDetectedPath = if ($ollamaSelection.DetectedPath) { $ollamaSelection.DetectedPath } else { "not found" }
  OllamaExistedBeforeInstall = $ollamaSelection.ExistedBeforeInstall
  OllamaInstalledByOload = $ollamaSelection.InstalledByOload
  OllamaPath = $ollamaSelection.Path
}
Write-RuntimeEnv $resolvedInstallRoot @{
  HOSTNAME = $hostname
  PORT = $port
  NODE_ENV = "production"
  OLLAMA_BASE_URL = $ollamaBaseUrl
  OLOAD_DEFAULT_LANGUAGE = $defaultLanguage
  OLOAD_UPDATE_MANIFEST_URL = $updateManifestUrl
  OLOAD_UPDATE_CHANNEL = $updateChannel
  OLOAD_ADMIN_PASSWORD = $adminPassword
  OLOAD_SESSION_SECRET = $sessionSecret
}

if ($startNowChoice) {
  Write-Step "Starting Oload"
  & (Join-Path $resolvedInstallRoot "start-oload.ps1") -Detached | Out-Null
Write-Host "Uninstall notes written to $resolvedInstallRoot\UNINSTALL-NOTES.txt"
}

$launchUrl = if ($hostname -eq "0.0.0.0") { "http://localhost:$($port)" } else { "http://$($hostname):$($port)" }

Write-Host "`nInstalled Oload to $resolvedInstallRoot"
Write-Host "Launch later with $resolvedInstallRoot\start-oload.cmd"
Write-Host "Open $launchUrl after the server finishes booting."