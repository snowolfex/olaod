import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getInstallBindingStatus } from "@/lib/install-binding";

type KeyValueMap = Record<string, string>;

async function pathExists(targetPath: string) {
  try {
    await readFile(targetPath, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function readKeyValueFile(filePath: string) {
  const content = await readFile(filePath, "utf8");
  const values: KeyValueMap = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    values[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
  }

  return values;
}

function toKeyValueText(values: KeyValueMap) {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function setBindingEnvironment(values: {
  checkedAt: string;
  currentInstallRoot: string;
  installId: string;
  bindingPath: string;
  machineId: string;
  machineIdPath: string;
  installedAt: string;
}) {
  process.env.OLOAD_INSTALL_ROOT = values.currentInstallRoot;
  process.env.OLOAD_INSTALL_BINDING_STATUS = "valid";
  process.env.OLOAD_INSTALL_BINDING_MESSAGE = "Install binding matches this computer and location.";
  process.env.OLOAD_INSTALL_BINDING_CAN_REBIND = "true";
  process.env.OLOAD_INSTALL_BINDING_CAN_ROTATE_ID = "true";
  process.env.OLOAD_INSTALL_BINDING_CHECKED_AT = values.checkedAt;
  process.env.OLOAD_INSTALL_ID = values.installId;
  process.env.OLOAD_INSTALL_BINDING_PATH = values.bindingPath;
  process.env.OLOAD_MACHINE_ID = values.machineId;
  process.env.OLOAD_MACHINE_ID_PATH = values.machineIdPath;
  process.env.OLOAD_INSTALL_BINDING_RECORDED_ROOT = values.currentInstallRoot;
  process.env.OLOAD_INSTALL_BINDING_INSTALLED_AT = values.installedAt;
}

async function writeCurrentInstallBinding(forceNewInstallId: boolean) {
  const installRoot = process.env.OLOAD_INSTALL_ROOT?.trim();
  const bindingPath = process.env.OLOAD_INSTALL_BINDING_PATH?.trim();
  const machineIdPath = process.env.OLOAD_MACHINE_ID_PATH?.trim();

  if (!installRoot || !bindingPath || !machineIdPath) {
    throw new Error("Install binding repair is only available from an installed launcher.");
  }

  const machineId = (await readFile(machineIdPath, "utf8")).trim();
  if (!machineId) {
    throw new Error("Machine ID is unavailable, so the install cannot be rebound safely.");
  }

  const existingBinding = await pathExists(bindingPath)
    ? await readKeyValueFile(bindingPath)
    : {};

  const existingMachineId = existingBinding.MachineId?.trim();
  if (existingMachineId && existingMachineId !== machineId) {
    throw new Error("This install binding belongs to a different computer and cannot be rebound here.");
  }

  const installId = forceNewInstallId
    ? randomUUID()
    : existingBinding.InstallId?.trim() || process.env.OLOAD_INSTALL_ID?.trim() || randomUUID();
  const installedAt = existingBinding.InstalledAt?.trim()
    || process.env.OLOAD_INSTALL_BINDING_INSTALLED_AT?.trim()
    || new Date().toISOString();
  const checkedAt = new Date().toISOString();

  await mkdir(path.dirname(bindingPath), { recursive: true });
  await writeFile(bindingPath, toKeyValueText({
    InstallId: installId,
    MachineId: machineId,
    InstallRoot: installRoot,
    InstalledAt: installedAt,
    Hostname: process.env.HOSTNAME?.trim() || process.env.COMPUTERNAME?.trim() || "unknown",
    Platform: process.platform,
  }), "ascii");

  setBindingEnvironment({
    checkedAt,
    currentInstallRoot: installRoot,
    installId,
    bindingPath,
    machineId,
    machineIdPath,
    installedAt,
  });

  return getInstallBindingStatus();
}

export async function rebindCurrentInstall() {
  return writeCurrentInstallBinding(false);
}

export async function rotateCurrentInstallId() {
  return writeCurrentInstallBinding(true);
}