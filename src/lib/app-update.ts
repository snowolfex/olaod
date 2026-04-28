import { spawn } from "node:child_process";
import { createPublicKey, verify as verifySignature } from "node:crypto";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import packageJson from "../../package.json";

export type AppUpdatePackage = {
  format: "zip" | "tar.gz";
  sha256?: string;
  url: string;
};

export type AppUpdateManifestSignature = {
  algorithm: "ed25519";
  keyId?: string;
  signature: string;
  signedAt?: string;
};

export type AppUpdateManifest = {
  channel?: string;
  notes?: string;
  packages?: {
    linux?: AppUpdatePackage;
    windows?: AppUpdatePackage;
  };
  product?: string;
  publishedAt?: string;
  signature?: AppUpdateManifestSignature;
  latestVersion: string;
};

export type AppUpdateStatus = {
  autoCheckEnabled: boolean;
  canApplyUpdate: boolean;
  channel: string | null;
  checkedAt: string | null;
  currentVersion: string;
  installRoot: string | null;
  latestVersion: string | null;
  manifestSignatureKeyId: string | null;
  notes: string | null;
  packageFormat: AppUpdatePackage["format"] | null;
  packageUrl: string | null;
  publishedAt: string | null;
  signatureVerified: boolean;
  statusMessage: string | null;
  updateAvailable: boolean;
  updateConfigured: boolean;
};

type RuntimePlatform = "windows" | "linux";

type CachedUpdateStatus = {
  checkedAtMs: number;
  status: AppUpdateStatus;
};

const CURRENT_VERSION = packageJson.version;
const UPDATE_STATUS_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedUpdateStatus: CachedUpdateStatus | null = null;
let pendingStatusPromise: Promise<AppUpdateStatus> | null = null;
let activeApplyPromise: Promise<{ targetVersion: string }> | null = null;

function normalizeVersion(value: string) {
  return value.trim().replace(/^v/i, "");
}

function parseVersionSegments(value: string) {
  const [numericPart, prereleasePart = ""] = normalizeVersion(value).split("-", 2);
  const numericSegments = numericPart
    .split(".")
    .map((segment) => Number.parseInt(segment, 10))
    .map((segment) => (Number.isFinite(segment) ? segment : 0));

  return {
    numericSegments,
    prereleasePart,
  };
}

function compareVersions(left: string, right: string) {
  const leftParsed = parseVersionSegments(left);
  const rightParsed = parseVersionSegments(right);
  const segmentCount = Math.max(leftParsed.numericSegments.length, rightParsed.numericSegments.length);

  for (let index = 0; index < segmentCount; index += 1) {
    const leftValue = leftParsed.numericSegments[index] ?? 0;
    const rightValue = rightParsed.numericSegments[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  if (!leftParsed.prereleasePart && rightParsed.prereleasePart) {
    return 1;
  }

  if (leftParsed.prereleasePart && !rightParsed.prereleasePart) {
    return -1;
  }

  return leftParsed.prereleasePart.localeCompare(rightParsed.prereleasePart);
}

function getRuntimePlatform(): RuntimePlatform | null {
  if (process.platform === "win32") {
    return "windows";
  }

  if (process.platform === "linux") {
    return "linux";
  }

  return null;
}

function getConfiguredChannel() {
  return process.env.OLOAD_UPDATE_CHANNEL?.trim() || "stable";
}

function getManifestUrl() {
  return process.env.OLOAD_UPDATE_MANIFEST_URL?.trim() || null;
}

function getUpdateManifestPublicKey() {
  return process.env.OLOAD_UPDATE_MANIFEST_PUBLIC_KEY?.trim() || null;
}

function getAutoCheckEnabled() {
  return process.env.OLOAD_AUTO_CHECK_UPDATES_ON_LAUNCH?.trim() !== "false";
}

function getInstallRoot() {
  const configuredInstallRoot = process.env.OLOAD_INSTALL_ROOT?.trim();

  if (configuredInstallRoot) {
    return configuredInstallRoot;
  }

  const currentWorkingDirectory = process.cwd();

  if (path.basename(currentWorkingDirectory).toLowerCase() === "app") {
    return path.dirname(currentWorkingDirectory);
  }

  return null;
}

function validatePackage(value: unknown): value is AppUpdatePackage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AppUpdatePackage>;
  return (candidate.format === "zip" || candidate.format === "tar.gz")
    && typeof candidate.url === "string"
    && candidate.url.trim().length > 0
    && (candidate.sha256 === undefined || typeof candidate.sha256 === "string");
}

function validateManifestSignature(value: unknown): value is AppUpdateManifestSignature {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AppUpdateManifestSignature>;
  return candidate.algorithm === "ed25519"
    && typeof candidate.signature === "string"
    && candidate.signature.trim().length > 0
    && (candidate.keyId === undefined || typeof candidate.keyId === "string")
    && (candidate.signedAt === undefined || typeof candidate.signedAt === "string");
}

function validateManifest(value: unknown): value is AppUpdateManifest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AppUpdateManifest>;
  const packages = candidate.packages;
  const packagesValid = packages === undefined || (
    typeof packages === "object"
    && packages !== null
    && (packages.windows === undefined || validatePackage(packages.windows))
    && (packages.linux === undefined || validatePackage(packages.linux))
  );

  return typeof candidate.latestVersion === "string"
    && candidate.latestVersion.trim().length > 0
    && (candidate.product === undefined || candidate.product === "oload")
    && (candidate.channel === undefined || typeof candidate.channel === "string")
    && (candidate.notes === undefined || typeof candidate.notes === "string")
    && (candidate.publishedAt === undefined || typeof candidate.publishedAt === "string")
    && (candidate.signature === undefined || validateManifestSignature(candidate.signature))
    && packagesValid;
}

function canonicalizeJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeJson(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function verifyManifestSignatureState(manifest: AppUpdateManifest) {
  const publicKeyPem = getUpdateManifestPublicKey();

  if (!publicKeyPem) {
    throw new Error("Update manifest public key is not configured.");
  }

  if (!manifest.signature) {
    throw new Error("Update manifest signature is missing.");
  }

  const unsignedManifest = {
    ...manifest,
    signature: undefined,
  };
  const payload = Buffer.from(canonicalizeJson(unsignedManifest), "utf8");
  const signature = Buffer.from(manifest.signature.signature, "base64");
  const verified = verifySignature(null, payload, createPublicKey(publicKeyPem), signature);

  if (!verified) {
    throw new Error("Update manifest signature verification failed.");
  }

  return {
    keyId: manifest.signature.keyId?.trim() || null,
    verified: true,
  };
}

async function fetchManifest() {
  const manifestUrl = getManifestUrl();

  if (!manifestUrl) {
    return null;
  }

  const response = await fetch(manifestUrl, {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Update manifest request failed with ${response.status}.`);
  }

  const payload = await response.json();

  if (!validateManifest(payload)) {
    throw new Error("Update manifest is missing required fields.");
  }

  const signatureState = verifyManifestSignatureState(payload);

  return {
    manifest: payload,
    signatureState,
  };
}

function buildStatusMessage(input: {
  installRoot: string | null;
  packageInfo: AppUpdatePackage | null;
  signatureVerified: boolean;
  updateAvailable: boolean;
  updateConfigured: boolean;
}) {
  if (!input.updateConfigured) {
    return "Live updates are not configured for this deployment yet.";
  }

  if (!input.signatureVerified) {
    return "Update manifest verification failed for this deployment.";
  }

  if (!input.updateAvailable) {
    return "This deployment is already on the latest configured version.";
  }

  if (!input.packageInfo) {
    return "An update is available, but no patch package is published for this operating system.";
  }

  if (!input.installRoot) {
    return "An update is available, but this runtime does not expose an install root for in-place patching.";
  }

  return "A live patch is available for this deployment.";
}

async function computeAppUpdateStatus(): Promise<AppUpdateStatus> {
  const platform = getRuntimePlatform();
  const manifestUrl = getManifestUrl();
  const installRoot = getInstallRoot();
  const checkedAt = new Date().toISOString();

  if (!manifestUrl) {
    return {
      autoCheckEnabled: getAutoCheckEnabled(),
      canApplyUpdate: false,
      channel: getConfiguredChannel(),
      checkedAt,
      currentVersion: CURRENT_VERSION,
      installRoot,
      latestVersion: null,
      manifestSignatureKeyId: null,
      notes: null,
      packageFormat: null,
      packageUrl: null,
      publishedAt: null,
      signatureVerified: false,
      statusMessage: buildStatusMessage({
        installRoot,
        packageInfo: null,
        signatureVerified: false,
        updateAvailable: false,
        updateConfigured: false,
      }),
      updateAvailable: false,
      updateConfigured: false,
    };
  }

  try {
    const fetchedManifest = await fetchManifest();

    if (!fetchedManifest) {
      throw new Error("Live updates are not configured for this deployment yet.");
    }

    const { manifest, signatureState } = fetchedManifest;
    const packageInfo = platform ? manifest.packages?.[platform] ?? null : null;
    const latestVersion = manifest.latestVersion ?? null;
    const updateAvailable = latestVersion ? compareVersions(latestVersion, CURRENT_VERSION) > 0 : false;

    return {
      autoCheckEnabled: getAutoCheckEnabled(),
      canApplyUpdate: Boolean(updateAvailable && installRoot && packageInfo),
      channel: manifest.channel?.trim() || getConfiguredChannel(),
      checkedAt,
      currentVersion: CURRENT_VERSION,
      installRoot,
      latestVersion,
      manifestSignatureKeyId: signatureState.keyId,
      notes: manifest.notes?.trim() || null,
      packageFormat: packageInfo?.format ?? null,
      packageUrl: packageInfo?.url ?? null,
      publishedAt: manifest.publishedAt ?? null,
      signatureVerified: signatureState.verified,
      statusMessage: buildStatusMessage({
        installRoot,
        packageInfo,
        signatureVerified: signatureState.verified,
        updateAvailable,
        updateConfigured: true,
      }),
      updateAvailable,
      updateConfigured: true,
    };
  } catch (error) {
    return {
      autoCheckEnabled: getAutoCheckEnabled(),
      canApplyUpdate: false,
      channel: getConfiguredChannel(),
      checkedAt,
      currentVersion: CURRENT_VERSION,
      installRoot,
      latestVersion: null,
      manifestSignatureKeyId: null,
      notes: null,
      packageFormat: null,
      packageUrl: null,
      publishedAt: null,
      signatureVerified: false,
      statusMessage: error instanceof Error ? error.message : "Unable to check for updates.",
      updateAvailable: false,
      updateConfigured: true,
    };
  }
}

export async function readAppUpdateStatus(options?: { forceRefresh?: boolean }): Promise<AppUpdateStatus> {
  const forceRefresh = options?.forceRefresh ?? false;
  const now = Date.now();

  if (!forceRefresh && cachedUpdateStatus && (now - cachedUpdateStatus.checkedAtMs) < UPDATE_STATUS_CACHE_TTL_MS) {
    return cachedUpdateStatus.status;
  }

  if (!forceRefresh && pendingStatusPromise) {
    return pendingStatusPromise;
  }

  pendingStatusPromise = computeAppUpdateStatus();

  try {
    const status = await pendingStatusPromise;
    cachedUpdateStatus = {
      checkedAtMs: now,
      status,
    };
    return status;
  } finally {
    pendingStatusPromise = null;
  }
}

export async function getAppUpdateStatus(): Promise<AppUpdateStatus> {
  return readAppUpdateStatus();
}

function buildWindowsHelperScript(input: {
  archiveSha256: string | null;
  archiveUrl: string;
  installRoot: string;
  parentPid: number;
}) {
  const shaGuard = input.archiveSha256
    ? `
$actualHash = (Get-FileHash -Path $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne "${input.archiveSha256.toLowerCase()}") {
  throw "Downloaded patch hash did not match the published SHA-256."
}`
    : "";

  return `
$ErrorActionPreference = "Stop"
$installRoot = "${input.installRoot.replaceAll("\\", "\\\\")}"
$archiveUrl = "${input.archiveUrl.replaceAll('"', '`"')}"
$parentPid = ${input.parentPid}
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("oload-update-" + [guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $tempRoot "oload-update.zip"
$payloadRoot = Join-Path $tempRoot "payload"

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath
${shaGuard}
Expand-Archive -Path $archivePath -DestinationPath $payloadRoot -Force

if (-not (Test-Path (Join-Path $payloadRoot "app\\server.js"))) {
  throw "Patch payload is missing app\\server.js."
}

Start-Sleep -Seconds 2
Stop-Process -Id $parentPid -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 900

Remove-Item (Join-Path $installRoot "app") -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $payloadRoot "app") -Destination (Join-Path $installRoot "app") -Recurse -Force

if (Test-Path (Join-Path $payloadRoot "start-oload.ps1")) {
  Copy-Item -Path (Join-Path $payloadRoot "start-oload.ps1") -Destination (Join-Path $installRoot "start-oload.ps1") -Force
}

Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy", "Bypass", "-File", (Join-Path $installRoot "start-oload.ps1"), "-Detached" -WorkingDirectory $installRoot -WindowStyle Hidden | Out-Null
Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $PSCommandPath -Force -ErrorAction SilentlyContinue
`;
}

function buildLinuxHelperScript(input: {
  archiveSha256: string | null;
  archiveUrl: string;
  installRoot: string;
  parentPid: number;
}) {
  const shaGuard = input.archiveSha256
    ? `
actual_hash="$(sha256sum "$archive_path" | awk '{print $1}')"
if [[ "$actual_hash" != "${input.archiveSha256.toLowerCase()}" ]]; then
  printf '%s\n' 'Downloaded patch hash did not match the published SHA-256.' >&2
  exit 1
fi`
    : "";

  return `#!/usr/bin/env bash
set -euo pipefail

install_root=${JSON.stringify(input.installRoot)}
archive_url=${JSON.stringify(input.archiveUrl)}
parent_pid=${input.parentPid}
temp_root="$(mktemp -d \"${path.join(os.tmpdir(), "oload-update-").replaceAll("\\", "/")}XXXXXX\")"
archive_path="$temp_root/oload-update.tar.gz"
payload_root="$temp_root/payload"

curl -fsSL "$archive_url" -o "$archive_path"
${shaGuard}
mkdir -p "$payload_root"
tar -xzf "$archive_path" -C "$payload_root"

if [[ ! -f "$payload_root/app/server.js" ]]; then
  printf '%s\n' 'Patch payload is missing app/server.js.' >&2
  exit 1
fi

sleep 2
kill "$parent_pid" >/dev/null 2>&1 || true
sleep 1

rm -rf "$install_root/app"
mkdir -p "$install_root/app"
cp -R "$payload_root/app/." "$install_root/app/"

if [[ -f "$payload_root/start-oload.sh" ]]; then
  cp "$payload_root/start-oload.sh" "$install_root/start-oload.sh"
  chmod +x "$install_root/start-oload.sh"
fi

nohup "$install_root/start-oload.sh" --detach >/dev/null 2>&1 &
rm -rf "$temp_root"
rm -f "$0"
`;
}

export async function applyAppUpdate() {
  if (activeApplyPromise) {
    throw new Error("A live patch is already being applied.");
  }

  activeApplyPromise = (async () => {
    const platform = getRuntimePlatform();
    const installRoot = getInstallRoot();
    const fetchedManifest = await fetchManifest();

    if (!platform) {
      throw new Error("Live patching is not supported on this operating system.");
    }

    if (!installRoot) {
      throw new Error("This runtime does not expose an install root for in-place patching.");
    }

    if (!fetchedManifest) {
      throw new Error("Live updates are not configured for this deployment yet.");
    }

    const { manifest } = fetchedManifest;

    if (compareVersions(manifest.latestVersion, CURRENT_VERSION) <= 0) {
      throw new Error("This deployment is already on the latest configured version.");
    }

    const packageInfo = manifest.packages?.[platform];

    if (!packageInfo) {
      throw new Error("No patch package is published for this operating system.");
    }

    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "oload-update-runner-"));
    const helperPath = path.join(tempDirectory, platform === "windows" ? "apply-oload-update.ps1" : "apply-oload-update.sh");
    const helperScript = platform === "windows"
      ? buildWindowsHelperScript({
        archiveSha256: packageInfo.sha256 ?? null,
        archiveUrl: packageInfo.url,
        installRoot,
        parentPid: process.pid,
      })
      : buildLinuxHelperScript({
        archiveSha256: packageInfo.sha256 ?? null,
        archiveUrl: packageInfo.url,
        installRoot,
        parentPid: process.pid,
      });

    await writeFile(helperPath, helperScript, "utf8");

    if (platform === "linux") {
      await chmod(helperPath, 0o700);
    }

    const child = spawn(
      platform === "windows" ? "powershell.exe" : "bash",
      platform === "windows"
        ? ["-ExecutionPolicy", "Bypass", "-File", helperPath]
        : [helperPath],
      {
        detached: true,
        stdio: "ignore",
      },
    );

    child.unref();

    return {
      targetVersion: manifest.latestVersion,
    };
  })();

  try {
    return await activeApplyPromise;
  } finally {
    activeApplyPromise = null;
  }
}

if (getManifestUrl() && getAutoCheckEnabled()) {
  void readAppUpdateStatus({ forceRefresh: true }).catch(() => undefined);
}