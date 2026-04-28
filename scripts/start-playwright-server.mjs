import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

process.chdir(projectRoot);
process.env.HOSTNAME = process.env.HOSTNAME ?? "127.0.0.1";
process.env.PORT = process.env.PORT ?? "3101";
process.env.PLAYWRIGHT_TEST = process.env.PLAYWRIGHT_TEST ?? "1";
process.env.OLOAD_SESSION_SECRET = process.env.OLOAD_SESSION_SECRET ?? "playwright-session-secret";

async function runNextBuild() {
  const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, "build"], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`next build exited with code ${code ?? "null"} and signal ${signal ?? "null"}`));
    });

    child.on("error", reject);
  });
}

await runNextBuild();
await import(pathToFileURL(path.join(projectRoot, "scripts", "run-standalone-server.mjs")).href);