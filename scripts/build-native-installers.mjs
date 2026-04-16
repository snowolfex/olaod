import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGzip } from "node:zlib";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const bundleRoot = path.join(rootDir, "dist", "installers");
const nativeOutputDir = path.join(rootDir, "dist", "native");
const linuxBundleDir = path.join(bundleRoot, "linux");
const windowsBundleDir = path.join(bundleRoot, "windows");
const linuxOutputPath = path.join(nativeOutputDir, "OloadInstaller-linux-x64.run");
const windowsScriptPath = path.join(rootDir, "installer", "windows", "oload.iss");

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function assertExists(targetPath, label) {
  if (!await pathExists(targetPath)) {
    throw new Error(`Missing ${label}. Run npm run bundle:installers first.`);
  }
}

function tarHeader(name, size, mode, type = "0") {
  const buffer = Buffer.alloc(512, 0);

  function writeString(value, offset, length) {
    Buffer.from(value).copy(buffer, offset, 0, Math.min(Buffer.byteLength(value), length));
  }

  function writeOctal(value, offset, length) {
    const octal = value.toString(8).padStart(length - 1, "0");
    writeString(`${octal}\0`, offset, length);
  }

  writeString(name, 0, 100);
  writeOctal(mode, 100, 8);
  writeOctal(0, 108, 8);
  writeOctal(0, 116, 8);
  writeOctal(size, 124, 12);
  writeOctal(Math.floor(Date.now() / 1000), 136, 12);
  buffer.fill(0x20, 148, 156);
  writeString(type, 156, 1);
  writeString("ustar", 257, 6);
  writeString("00", 263, 2);

  let checksum = 0;
  for (const byte of buffer) {
    checksum += byte;
  }

  writeString(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return buffer;
}

async function listEntries(dirPath, prefix = "") {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const result = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    const relativePath = path.posix.join(prefix, entry.name);

    if (entry.isDirectory()) {
      result.push({ absolutePath, relativePath, isDirectory: true });
      result.push(...await listEntries(absolutePath, relativePath));
    } else if (entry.isFile()) {
      result.push({ absolutePath, relativePath, isDirectory: false });
    }
  }

  return result;
}

async function createTarGzBuffer(sourceDir) {
  const gzip = createGzip({ level: 9 });
  const chunks = [];

  gzip.on("data", (chunk) => chunks.push(chunk));

  const entries = await listEntries(sourceDir);

  for (const entry of entries) {
    const name = entry.isDirectory ? `${entry.relativePath}/` : entry.relativePath;
    if (entry.isDirectory) {
      gzip.write(tarHeader(name, 0, 0o755, "5"));
      continue;
    }

    const fileBuffer = await readFile(entry.absolutePath);
    gzip.write(tarHeader(name, fileBuffer.length, 0o644));
    gzip.write(fileBuffer);

    const remainder = fileBuffer.length % 512;
    if (remainder !== 0) {
      gzip.write(Buffer.alloc(512 - remainder, 0));
    }
  }

  gzip.write(Buffer.alloc(1024, 0));
  gzip.end();

  await new Promise((resolve, reject) => {
    gzip.on("end", resolve);
    gzip.on("error", reject);
  });

  return Buffer.concat(chunks);
}

async function buildLinuxRunInstaller() {
  await assertExists(linuxBundleDir, "Linux installer bundle");
  const archiveBuffer = await createTarGzBuffer(linuxBundleDir);
  const header = `#!/usr/bin/env bash
set -euo pipefail

script_path="$(cd -- \"$(dirname -- \"$0\")\" && pwd)/$(basename -- \"$0\")"
temp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$temp_dir"
}

trap cleanup EXIT

archive_line=$(awk '/^__OLOAD_ARCHIVE_BELOW__$/ { print NR + 1; exit 0; }' "$script_path")
if [[ -z "$archive_line" ]]; then
  printf '%s\\n' 'Unable to locate embedded installer payload.' >&2
  exit 1
fi

tail -n +"$archive_line" "$script_path" | tar -xzf - -C "$temp_dir"
chmod +x "$temp_dir/install-oload.sh" "$temp_dir/start-oload.sh"
exec "$temp_dir/install-oload.sh" "$@"
__OLOAD_ARCHIVE_BELOW__
`;

  await writeFile(linuxOutputPath, Buffer.concat([Buffer.from(header, "utf8"), archiveBuffer]));
}

function candidateCompilerPaths() {
  const candidates = [];
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);

  for (const entry of pathEntries) {
    candidates.push(path.join(entry, "ISCC.exe"));
  }

  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const programFiles = process.env.ProgramFiles;
  const localAppData = process.env.LOCALAPPDATA;

  if (programFilesX86) {
    candidates.push(path.join(programFilesX86, "Inno Setup 6", "ISCC.exe"));
  }

  if (programFiles) {
    candidates.push(path.join(programFiles, "Inno Setup 6", "ISCC.exe"));
  }

  if (localAppData) {
    candidates.push(path.join(localAppData, "Programs", "Inno Setup 6", "ISCC.exe"));
  }

  return [...new Set(candidates)];
}

async function findCompiler() {
  for (const candidate of candidateCompilerPaths()) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${path.basename(command)} exited with code ${code ?? -1}.`));
    });
    child.on("error", reject);
  });
}

async function buildWindowsInstaller() {
  await assertExists(windowsBundleDir, "Windows installer bundle");
  const compiler = await findCompiler();

  if (!compiler) {
    console.log("Inno Setup compiler not found. Prepared oload.iss but skipped Setup.exe generation.");
    await copyFile(windowsScriptPath, path.join(nativeOutputDir, "oload.iss"));
    return;
  }

  await runCommand(compiler, [windowsScriptPath]);
}

async function main() {
  await rm(nativeOutputDir, { recursive: true, force: true });
  await mkdir(nativeOutputDir, { recursive: true });

  await buildLinuxRunInstaller();
  await buildWindowsInstaller();

  console.log(`Native installers written to ${path.relative(rootDir, nativeOutputDir)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});