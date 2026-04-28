import { createHash, createPrivateKey, sign as signPayload } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const installerOutputDir = path.join(rootDir, "dist", "installers");
const updateOutputDir = path.join(rootDir, "dist", "updates");
const channel = process.env.OLOAD_UPDATE_CHANNEL?.trim() || "stable";
const notes = process.env.OLOAD_UPDATE_NOTES?.trim() || "";
const baseUrl = process.env.OLOAD_UPDATE_BASE_URL?.trim().replace(/\/$/, "") || "";
const manifestPrivateKey = process.env.OLOAD_UPDATE_MANIFEST_PRIVATE_KEY?.trim() || "";
const manifestKeyId = process.env.OLOAD_UPDATE_MANIFEST_KEY_ID?.trim() || "";

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}.`));
    });
    child.on("error", reject);
  });
}

async function sha256(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeJson(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function buildManifestSignature(manifest) {
  if (!manifestPrivateKey) {
    return undefined;
  }

  const privateKey = createPrivateKey(manifestPrivateKey);
  const payload = Buffer.from(canonicalizeJson(manifest), "utf8");
  const signature = signPayload(null, payload, privateKey).toString("base64");

  return {
    algorithm: "ed25519",
    keyId: manifestKeyId || undefined,
    signature,
    signedAt: new Date().toISOString(),
  };
}

async function readAppVersion() {
  const packageJsonPath = path.join(rootDir, "package.json");
  const raw = await readFile(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed.version) {
    throw new Error("package.json is missing a version field.");
  }

  return parsed.version;
}

async function stagePayload(targetOs) {
  const sourceDir = path.join(installerOutputDir, targetOs);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `oload-update-${targetOs}-`));
  const stageDir = path.join(tempRoot, "payload");

  await mkdir(stageDir, { recursive: true });
  await cp(path.join(sourceDir, "app"), path.join(stageDir, "app"), {
    recursive: true,
    force: true,
  });

  const startScriptName = targetOs === "windows" ? "start-oload.ps1" : "start-oload.sh";
  await cp(path.join(sourceDir, startScriptName), path.join(stageDir, startScriptName), {
    force: true,
  });

  return {
    cleanup: () => rm(tempRoot, { recursive: true, force: true }),
    stageDir,
  };
}

async function buildWindowsPackage() {
  const version = await readAppVersion();
  const { cleanup, stageDir } = await stagePayload("windows");
  const windowsDir = path.join(updateOutputDir, "windows");
  const archiveName = `oload-update-${version}.zip`;
  const archivePath = path.join(windowsDir, archiveName);

  try {
    await mkdir(windowsDir, { recursive: true });
    await rm(archivePath, { force: true });
    await runCommand("powershell.exe", [
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Compress-Archive -Path '${stageDir.replace(/'/g, "''")}\\*' -DestinationPath '${archivePath.replace(/'/g, "''")}' -Force`,
    ]);

    return {
      format: "zip",
      sha256: await sha256(archivePath),
      targetPath: archivePath,
      url: baseUrl ? `${baseUrl}/windows/${archiveName}` : archiveName,
    };
  } finally {
    await cleanup();
  }
}

async function buildLinuxPackage() {
  const version = await readAppVersion();
  const { cleanup, stageDir } = await stagePayload("linux");
  const linuxDir = path.join(updateOutputDir, "linux");
  const archiveName = `oload-update-${version}.tar.gz`;
  const archivePath = path.join(linuxDir, archiveName);

  try {
    await mkdir(linuxDir, { recursive: true });
    await rm(archivePath, { force: true });
    await runCommand("tar", ["-czf", archivePath, "-C", stageDir, "."]);

    return {
      format: "tar.gz",
      sha256: await sha256(archivePath),
      targetPath: archivePath,
      url: baseUrl ? `${baseUrl}/linux/${archiveName}` : archiveName,
    };
  } finally {
    await cleanup();
  }
}

async function main() {
  const version = await readAppVersion();
  await mkdir(updateOutputDir, { recursive: true });
  const [windowsPackage, linuxPackage] = await Promise.all([
    buildWindowsPackage(),
    buildLinuxPackage(),
  ]);

  const manifest = {
    channel,
    latestVersion: version,
    notes: notes || undefined,
    packages: {
      linux: {
        format: linuxPackage.format,
        sha256: linuxPackage.sha256,
        url: linuxPackage.url,
      },
      windows: {
        format: windowsPackage.format,
        sha256: windowsPackage.sha256,
        url: windowsPackage.url,
      },
    },
    product: "oload",
    publishedAt: new Date().toISOString(),
  };

  const signedManifest = {
    ...manifest,
    signature: buildManifestSignature(manifest),
  };

  await writeFile(
    path.join(updateOutputDir, "manifest.json"),
    `${JSON.stringify(signedManifest, null, 2)}\n`,
    "utf8",
  );

  console.log(`Update packages written to ${path.relative(rootDir, updateOutputDir)}`);
  console.log(`Windows: ${path.relative(rootDir, windowsPackage.targetPath)}`);
  console.log(`Linux: ${path.relative(rootDir, linuxPackage.targetPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});