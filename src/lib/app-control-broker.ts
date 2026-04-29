import "server-only";

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

type AppServerControlAction = "start" | "stop" | "restart";

export type AppServerControlStatus = {
  actionInFlight: boolean;
  appPort: number;
  baseUrl: string;
  canRestart: boolean;
  canStart: boolean;
  canStop: boolean;
  controlUrl: string;
  lastAction: AppServerControlAction | null;
  lastActionAt: string | null;
  lastError: string | null;
  pid: number | null;
  running: boolean;
  startMode: string | null;
};

function getAppControlBrokerBaseUrl() {
  const value = process.env.OLOAD_CONTROL_BROKER_BASE_URL?.trim();
  return (value || "http://127.0.0.1:4010").replace(/\/$/, "");
}

let pendingBrokerStartPromise: Promise<void> | null = null;

function getManualBrokerStartHint() {
  return process.platform === "win32"
    ? "Start it manually with cmd /c npm run broker:start from the repo root."
    : "Start it manually with npm run broker:start from the repo root.";
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function probeBrokerHealth() {
  const baseUrl = getAppControlBrokerBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function resolveBrokerLaunch() {
  const baseUrl = getAppControlBrokerBaseUrl();
  const currentWorkingDirectory = process.cwd();
  const installRoot = process.env.OLOAD_INSTALL_ROOT?.trim() || (path.basename(currentWorkingDirectory).toLowerCase() === "app"
    ? path.dirname(currentWorkingDirectory)
    : null);
  const installedBrokerScript = installRoot ? path.join(installRoot, "broker", "src", "server.mjs") : null;
  const repoPackageJson = path.join(currentWorkingDirectory, "package.json");
  const installedNodePath = installRoot && process.platform === "win32"
    ? path.join(installRoot, "runtime", "node", "node.exe")
    : installRoot && process.platform !== "win32"
      ? path.join(installRoot, "runtime", "node", "bin", "node")
      : null;

  if (installedBrokerScript && await pathExists(installedBrokerScript)) {
    return {
      args: [installedBrokerScript],
      command: installedNodePath && await pathExists(installedNodePath) ? installedNodePath : process.execPath,
      cwd: path.dirname(path.dirname(installedBrokerScript)),
      url: baseUrl,
    };
  }

  if (await pathExists(repoPackageJson)) {
    if (process.platform === "win32") {
      return {
        args: ["/c", "npm run broker:start"],
        command: "cmd.exe",
        cwd: currentWorkingDirectory,
        url: baseUrl,
      };
    }

    return {
      args: ["run", "broker:start"],
      command: "npm",
      cwd: currentWorkingDirectory,
      url: baseUrl,
    };
  }

  return null;
}

async function ensureAppControlBrokerRunning() {
  if (await probeBrokerHealth()) {
    return;
  }

  if (pendingBrokerStartPromise) {
    return pendingBrokerStartPromise;
  }

  pendingBrokerStartPromise = (async () => {
    const launch = await resolveBrokerLaunch();

    if (!launch) {
      throw new Error(`The local app control broker is not running and no broker payload is available to start it. ${getManualBrokerStartHint()}`);
    }

    const child = spawn(launch.command, launch.args ?? [], {
      cwd: launch.cwd,
      detached: true,
      env: {
        ...process.env,
        BROKER_BASE_URL: launch.url,
        OLOAD_CONTROL_BROKER_BASE_URL: launch.url,
      },
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    const startedAt = Date.now();

    while (Date.now() - startedAt < 15000) {
      if (await probeBrokerHealth()) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    throw new Error(`The local app control broker did not become reachable in time. ${getManualBrokerStartHint()}`);
  })().finally(() => {
    pendingBrokerStartPromise = null;
  });

  return pendingBrokerStartPromise;
}

async function brokerFetch(path: string, init?: RequestInit) {
  const baseUrl = getAppControlBrokerBaseUrl();

  await ensureAppControlBrokerRunning();

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let errorMessage = `App control broker request failed with ${response.status}.`;

    try {
      const payload = (await response.json()) as { error?: string };
      errorMessage = payload.error ?? errorMessage;
    } catch {
      // Ignore non-JSON broker failures and keep the generic message.
    }

    throw new Error(errorMessage);
  }

  return response;
}

export async function readAppServerControlStatus() {
  const response = await brokerFetch("/api/app-control/status");
  return (await response.json()) as AppServerControlStatus;
}

export async function requestAppServerControl(action: AppServerControlAction) {
  const response = await brokerFetch("/api/app-control/action", {
    method: "POST",
    body: JSON.stringify({ action }),
  });

  return (await response.json()) as {
    ok: boolean;
    status: AppServerControlStatus;
  };
}