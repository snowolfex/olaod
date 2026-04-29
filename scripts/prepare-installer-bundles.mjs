import { access, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const buildStandaloneDir = path.join(rootDir, ".next", "standalone");
const buildStaticDir = path.join(rootDir, ".next", "static");
const publicDir = path.join(rootDir, "public");
const installerDir = path.join(rootDir, "installer");
const brokerDir = path.join(rootDir, "broker");
const outputDir = path.join(rootDir, "dist", "installers");

const cleanDataFiles = {
  "activity-log.json": [],
  "ai-knowledge.json": [],
  "ai-profiles.json": [],
  "ai-provider-secrets.json": {},
  "conversations.json": [],
  "email-outbox.json": [],
  "job-history.json": [],
  "users.json": [],
};

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureBuildArtifacts() {
  if (!await pathExists(buildStandaloneDir)) {
    throw new Error("Missing .next/standalone. Run npm run build before bundling installers.");
  }

  if (!await pathExists(buildStaticDir)) {
    throw new Error("Missing .next/static. Run npm run build before bundling installers.");
  }
}

async function writeCleanDataDirectory(targetAppDir) {
  const dataDir = path.join(targetAppDir, "data");
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });

  await Promise.all(
    Object.entries(cleanDataFiles).map(([fileName, value]) =>
      writeFile(path.join(dataDir, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8"),
    ),
  );
}

async function copyAppPayload(bundleDir) {
  const appDir = path.join(bundleDir, "app");
  await cp(buildStandaloneDir, appDir, {
    recursive: true,
    force: true,
    dereference: true,
  });

  await mkdir(path.join(appDir, ".next"), { recursive: true });
  await cp(buildStaticDir, path.join(appDir, ".next", "static"), {
    recursive: true,
    force: true,
  });

  if (await pathExists(publicDir)) {
    await cp(publicDir, path.join(appDir, "public"), { recursive: true, force: true });
  }

  await writeCleanDataDirectory(appDir);
}

async function copyInstallerFiles(targetOs) {
  const sourceDir = path.join(installerDir, targetOs);
  const bundleDir = path.join(outputDir, targetOs);

  await mkdir(bundleDir, { recursive: true });
  await cp(sourceDir, bundleDir, { recursive: true, force: true });
  await cp(path.join(installerDir, "README.md"), path.join(bundleDir, "README.md"), {
    force: true,
  });
  if (await pathExists(brokerDir)) {
    await cp(brokerDir, path.join(bundleDir, "broker"), { recursive: true, force: true });
  }
  await copyAppPayload(bundleDir);
}

async function main() {
  await ensureBuildArtifacts();
  await rm(outputDir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
  await mkdir(outputDir, { recursive: true });

  const targets = await readdir(installerDir, { withFileTypes: true });
  const osDirectories = targets.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  await Promise.all(osDirectories.map((targetOs) => copyInstallerFiles(targetOs)));

  console.log(`Installer bundles written to ${path.relative(rootDir, outputDir)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});