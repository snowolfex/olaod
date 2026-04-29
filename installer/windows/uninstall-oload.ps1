[CmdletBinding()]
param(
  [string]$InstallRoot
)

$ErrorActionPreference = "Stop"

function Read-YesNoPrompt([string]$Prompt, [bool]$Default) {
  $defaultLabel = if ($Default) { "Y/n" } else { "y/N" }
  $value = Read-Host "$Prompt [$defaultLabel]"

  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }

  return $value.Trim().ToLowerInvariant().StartsWith("y")
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

function Read-BoolState($State, [string]$Key) {
  $value = $State[$Key]

  if ($null -eq $value) {
    return $false
  }

  return $value.ToString().Trim().ToLowerInvariant() -eq "true"
}

function Get-RegistryUninstallEntries() {
  $paths = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )

  foreach ($path in $paths) {
    Get-ItemProperty -Path $path -ErrorAction SilentlyContinue
  }
}

function Find-UninstallEntry([string[]]$Names) {
  foreach ($entry in Get-RegistryUninstallEntries) {
    $displayName = if ($null -eq $entry.DisplayName) { "" } else { $entry.DisplayName.ToString() }

    foreach ($name in $Names) {
      if ($displayName -like "*$name*") {
        return $entry
      }
    }
  }

  return $null
}

function Normalize-UninstallCommand([string]$Command) {
  if ([string]::IsNullOrWhiteSpace($Command)) {
    return $null
  }

  $normalized = $Command.Trim()
  $normalized = $normalized -replace "(?i)MsiExec(\.exe)?\s+/I", "msiexec.exe /X"
  return $normalized
}

function Run-UninstallCommand([string]$Label, $Entry) {
  $rawCommand = if ($null -ne $Entry.QuietUninstallString -and -not [string]::IsNullOrWhiteSpace($Entry.QuietUninstallString.ToString())) {
    $Entry.QuietUninstallString.ToString()
  } elseif ($null -ne $Entry.UninstallString) {
    $Entry.UninstallString.ToString()
  } else {
    ""
  }
  $command = Normalize-UninstallCommand($rawCommand)

  if (-not $command) {
    Write-Warning "No uninstall command was found for $Label."
    return $false
  }

  Write-Host "Running $Label uninstall command..."
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $command -Wait
  return $true
}

function Remove-PathIfPresent([string]$Path) {
  if ($Path -and (Test-Path $Path)) {
    Remove-Item $Path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Remove-OllamaModelPaths() {
  $paths = @(
    (Join-Path $env:USERPROFILE ".ollama"),
    (Join-Path $env:LOCALAPPDATA "Ollama"),
    (Join-Path $env:ProgramData "Ollama")
  ) | Where-Object { $_ }

  foreach ($path in $paths) {
    Remove-PathIfPresent $path
  }
}

$resolvedInstallRoot = if ($InstallRoot) { $InstallRoot } else { Split-Path -Parent $MyInvocation.PSCommandPath }
$state = Read-KeyValueFile (Join-Path $resolvedInstallRoot ".oload-install-state")
$runtimeRoot = Join-Path $resolvedInstallRoot "runtime"
$embeddedOllamaRoot = Join-Path $runtimeRoot "ollama"
$embeddedOllamaModels = Join-Path $runtimeRoot "ollama-models"
$nodeExistedBefore = Read-BoolState $state "NodeExistedBeforeInstall"
$nodeInstalledByOload = Read-BoolState $state "NodeInstalledByOload"
$nodePath = $state["NodePath"]
$managedNodeRoot = $state["ManagedNodeRoot"]
$ollamaExistedBefore = Read-BoolState $state "OllamaExistedBeforeInstall"
$ollamaInstalledByOload = Read-BoolState $state "OllamaInstalledByOload"
$ollamaPath = $state["OllamaPath"]
$managedOllamaRoot = $state["ManagedOllamaRoot"]
$managedOllamaModelsRoot = $state["ManagedOllamaModelsRoot"]
$managedRuntimeRoot = $state["RuntimeRoot"]
$runtimeEnvPath = $state["RuntimeEnvPath"]
$installStatePath = $state["InstallStatePath"]
$installBindingPath = $state["InstallBindingPath"]
$installManifestPath = $state["InstallManifestPath"]
$uninstallNotesPath = $state["UninstallNotesPath"]

if ($nodeInstalledByOload -and (Test-Path $(if ($managedNodeRoot) { $managedNodeRoot } else { Join-Path $runtimeRoot "node" }))) {
  $nodeRuntimeRoot = if ($managedNodeRoot) { $managedNodeRoot } else { Join-Path $runtimeRoot "node" }
  if (Read-YesNoPrompt "Remove the Oload-managed Node.js/npm runtime at $nodeRuntimeRoot?" $true) {
    Remove-PathIfPresent $nodeRuntimeRoot
  }
} elseif ($nodeExistedBefore -or $nodePath) {
  $existingNodePath = if ($nodePath) { $nodePath } else { "the previously verified system Node.js location" }
  if (Read-YesNoPrompt "Node.js/npm was already present before Oload at $existingNodePath. Remove that shared installation too? This may affect other apps." $false) {
    $nodeEntry = Find-UninstallEntry @("Node.js")
    if (-not (Run-UninstallCommand "Node.js" $nodeEntry)) {
      Write-Warning "Node.js appears to be shared. If you still want it removed, use the original Node.js uninstaller or Windows Apps settings after Oload finishes uninstalling."
    }
  }
}

$removeOllama = $false
if ($ollamaExistedBefore) {
  $removeOllama = Read-YesNoPrompt "Ollama was already installed before Oload at $ollamaPath. Remove Ollama anyway?" $false
} elseif ($ollamaInstalledByOload) {
  $removeOllama = Read-YesNoPrompt "Oload installed an isolated Ollama runtime at $ollamaPath. Remove that isolated Ollama runtime too?" $false
} else {
  $removeOllama = Read-YesNoPrompt "Remove any Ollama installation that is still present on this machine?" $false
}

if ($removeOllama -and (Read-YesNoPrompt "Removing Ollama can also remove all local models. Continue?" $false)) {
  Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  if ($ollamaInstalledByOload -and $ollamaPath -and $ollamaPath.StartsWith($resolvedInstallRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    $ollamaRuntimeRoot = if ($managedOllamaRoot) { $managedOllamaRoot } else { $embeddedOllamaRoot }
    $ollamaModelsRoot = if ($managedOllamaModelsRoot) { $managedOllamaModelsRoot } else { $embeddedOllamaModels }
    Remove-PathIfPresent $ollamaRuntimeRoot
    if (Read-YesNoPrompt "Also remove the isolated Ollama models stored at $ollamaModelsRoot?" $true) {
      Remove-PathIfPresent $ollamaModelsRoot
    }
  } else {
    $ollamaEntry = Find-UninstallEntry @("Ollama")
    if (-not (Run-UninstallCommand "Ollama" $ollamaEntry)) {
      Write-Warning "Ollama did not expose an uninstall command. Remove it manually if it remains installed."
    }

    if (Read-YesNoPrompt "Also remove Ollama model and data directories from common locations?" $true) {
      Remove-OllamaModelPaths
    }
  }
}

Remove-PathIfPresent $(if ($managedRuntimeRoot) { $managedRuntimeRoot } else { $runtimeRoot })
Remove-PathIfPresent $(if ($runtimeEnvPath) { $runtimeEnvPath } else { Join-Path $resolvedInstallRoot ".env.runtime" })
Remove-PathIfPresent $(if ($installStatePath) { $installStatePath } else { Join-Path $resolvedInstallRoot ".oload-install-state" })
Remove-PathIfPresent $(if ($installBindingPath) { $installBindingPath } else { Join-Path $resolvedInstallRoot ".oload-install-binding" })
Remove-PathIfPresent $(if ($installManifestPath) { $installManifestPath } else { Join-Path $resolvedInstallRoot "INSTALL-MANIFEST.txt" })
Remove-PathIfPresent $(if ($uninstallNotesPath) { $uninstallNotesPath } else { Join-Path $resolvedInstallRoot "UNINSTALL-NOTES.txt" })
Remove-PathIfPresent (Join-Path $resolvedInstallRoot "oload.log")

Write-Host "Oload uninstall dependency checks completed."