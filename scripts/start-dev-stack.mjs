import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const useLan = process.argv.includes("--lan");
const appPort = 3000;
const brokerPort = 4010;
const startedChildren = [];
let shuttingDown = false;

function log(message) {
  console.log(`[dev-stack] ${message}`);
}

function isPortOpen(port, host = "127.0.0.1", timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

function getCommandForScript(scriptName) {
  if (process.platform === "win32") {
    return {
      args: ["/c", `npm run ${scriptName}`],
      command: "cmd.exe",
    };
  }

  return {
    args: ["run", scriptName],
    command: "npm",
  };
}

function terminateChild(child) {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  try {
    if (process.platform === "win32") {
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.unref();
      return;
    }

    child.kill("SIGTERM");
  } catch {
    // Ignore termination cleanup failures.
  }
}

function shutdownAndExit(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of startedChildren) {
    terminateChild(child);
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 50).unref();
}

function startNamedProcess(label, scriptName) {
  const command = getCommandForScript(scriptName);
  log(`Starting ${label} with ${command.command} ${command.args.join(" ")}`);

  const child = spawn(command.command, command.args, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });

  startedChildren.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (code === 0 || signal === "SIGTERM") {
      shutdownAndExit(0);
      return;
    }

    log(`${label} exited with ${code ?? signal ?? "unknown"}.`);
    shutdownAndExit(typeof code === "number" ? code : 1);
  });

  child.on("error", (error) => {
    if (shuttingDown) {
      return;
    }

    log(`${label} failed to start: ${error.message}`);
    shutdownAndExit(1);
  });
}

process.on("SIGINT", () => shutdownAndExit(0));
process.on("SIGTERM", () => shutdownAndExit(0));

async function main() {
  const brokerRunning = await isPortOpen(brokerPort);
  const appRunning = await isPortOpen(appPort);

  if (brokerRunning) {
    log(`Broker already reachable on port ${brokerPort}.`);
  } else {
    startNamedProcess("broker", "broker:start");
  }

  if (appRunning) {
    log(`App already reachable on port ${appPort}.`);
  } else {
    startNamedProcess("app", useLan ? "dev:lan" : "dev");
  }

  if (startedChildren.length === 0) {
    log("App and broker are already running.");
    return;
  }

  log(`Dev stack is supervising ${startedChildren.length} process(es) from ${path.basename(rootDir)}.`);
}

await main();