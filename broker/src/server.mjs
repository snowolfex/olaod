import { access } from "node:fs/promises";
import { createServer } from "node:http";
import net from "node:net";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const BROKER_PORT = Number(process.env.BROKER_PORT || process.env.PORT || 4010);
const BROKER_BASE_URL = (process.env.BROKER_BASE_URL || `http://localhost:${BROKER_PORT}`).replace(/\/$/, "");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim();
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim();
const APP_CONTROL_PORT = Number(process.env.OLOAD_APP_CONTROL_PORT || 3000);
const REQUEST_TTL_MS = 1000 * 60 * 10;
const POLL_INTERVAL_MS = 2000;
const currentFilePath = fileURLToPath(import.meta.url);
const brokerRootDir = path.resolve(path.dirname(currentFilePath), "..");
const repoRootDir = path.resolve(brokerRootDir, "..");

const loginRequests = new Map();
let appControlActionInFlight = false;
let appControlLastAction = null;
let appControlLastActionAt = null;
let appControlLastError = null;
let appControlLastStartMode = null;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function sendHtml(response, statusCode, markup) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(markup);
}

function redirect(response, location) {
  response.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
  });
  response.end();
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isLoopbackAddress(value) {
  if (!value) {
    return false;
  }

  return value === "::1"
    || value === "127.0.0.1"
    || value === "::ffff:127.0.0.1";
}

function requireLoopbackRequest(request, response) {
  if (isLoopbackAddress(request.socket.remoteAddress)) {
    return false;
  }

  sendJson(response, 403, { error: "Local app control is limited to loopback requests." });
  return true;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function testPortOpen(port, host = "127.0.0.1", timeoutMs = 1200) {
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

async function waitForPortState(port, shouldBeOpen, timeoutMs = 20000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const isOpen = await testPortOpen(port);

    if (isOpen === shouldBeOpen) {
      return true;
    }

    await delay(500);
  }

  return false;
}

async function getListeningProcessId(port) {
  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const command = `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)`;
      execFile("powershell.exe", ["-NoProfile", "-Command", command], { windowsHide: true }, (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }

        const parsed = Number.parseInt(stdout.trim(), 10);
        resolve(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
      });
    });
  }

  return new Promise((resolve) => {
    execFile("sh", ["-lc", `lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null | head -n 1 || fuser ${port}/tcp 2>/dev/null | awk '{print $1}'`], (error, stdout) => {
      if (error && !stdout.trim()) {
        resolve(null);
        return;
      }

      const parsed = Number.parseInt(stdout.trim().split(/\s+/)[0] || "", 10);
      resolve(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    });
  });
}

async function resolveAppStartPlan() {
  const configuredCommand = process.env.OLOAD_APP_CONTROL_START_COMMAND?.trim();
  const configuredWorkingDir = process.env.OLOAD_APP_CONTROL_WORKING_DIR?.trim() || repoRootDir;
  const installRoot = process.env.OLOAD_INSTALL_ROOT?.trim() || null;
  const windowsInstalledStart = installRoot ? path.join(installRoot, "start-oload.ps1") : null;
  const linuxInstalledStart = installRoot ? path.join(installRoot, "start-oload.sh") : null;

  if (configuredCommand) {
    return {
      command: configuredCommand,
      cwd: configuredWorkingDir,
      mode: "configured-command",
      shell: true,
    };
  }

  if (process.platform === "win32" && windowsInstalledStart && await pathExists(windowsInstalledStart)) {
    return {
      args: ["-ExecutionPolicy", "Bypass", "-File", windowsInstalledStart, "-Detached"],
      command: "powershell.exe",
      cwd: installRoot,
      mode: "installed-script",
      shell: false,
    };
  }

  if (process.platform !== "win32" && linuxInstalledStart && await pathExists(linuxInstalledStart)) {
    return {
      args: ["--detach"],
      command: linuxInstalledStart,
      cwd: installRoot,
      mode: "installed-script",
      shell: false,
    };
  }

  if (await pathExists(path.join(repoRootDir, "package.json"))) {
    if (process.platform === "win32") {
      return {
        args: ["/c", "npm run dev"],
        command: "cmd.exe",
        cwd: repoRootDir,
        mode: "repo-dev",
        shell: false,
      };
    }

    return {
      args: ["run", "dev"],
      command: "npm",
      cwd: repoRootDir,
      mode: "repo-dev",
      shell: false,
    };
  }

  return null;
}

async function readAppControlStatus() {
  const pid = await getListeningProcessId(APP_CONTROL_PORT);
  const running = pid !== null || await testPortOpen(APP_CONTROL_PORT);
  const startPlan = await resolveAppStartPlan();

  return {
    actionInFlight: appControlActionInFlight,
    appPort: APP_CONTROL_PORT,
    baseUrl: `http://127.0.0.1:${APP_CONTROL_PORT}`,
    canStart: Boolean(startPlan) && !running && !appControlActionInFlight,
    canStop: running && !appControlActionInFlight,
    canRestart: Boolean(startPlan) && running && !appControlActionInFlight,
    controlUrl: `${BROKER_BASE_URL}/control/app`,
    lastAction: appControlLastAction,
    lastActionAt: appControlLastActionAt,
    lastError: appControlLastError,
    pid,
    running,
    startMode: startPlan?.mode ?? appControlLastStartMode,
  };
}

async function startAppServer() {
  const existingPid = await getListeningProcessId(APP_CONTROL_PORT);

  if (existingPid !== null) {
    return readAppControlStatus();
  }

  const startPlan = await resolveAppStartPlan();

  if (!startPlan) {
    throw new Error("No app start command is configured for this broker.");
  }

  const child = spawn(startPlan.command, startPlan.args ?? [], {
    cwd: startPlan.cwd,
    detached: true,
    env: {
      ...process.env,
      BROKER_BASE_URL,
      OLOAD_CONTROL_BROKER_BASE_URL: BROKER_BASE_URL,
    },
    shell: startPlan.shell,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  appControlLastStartMode = startPlan.mode;
  const started = await waitForPortState(APP_CONTROL_PORT, true, 30000);

  if (!started) {
    throw new Error(`The app did not become reachable on port ${APP_CONTROL_PORT} in time.`);
  }

  return readAppControlStatus();
}

async function stopAppServer() {
  const pid = await getListeningProcessId(APP_CONTROL_PORT);

  if (pid === null) {
    return readAppControlStatus();
  }

  process.kill(pid);
  const stopped = await waitForPortState(APP_CONTROL_PORT, false, 15000);

  if (!stopped) {
    throw new Error(`The app process on port ${APP_CONTROL_PORT} did not stop in time.`);
  }

  return readAppControlStatus();
}

function renderAppControlPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Oload Local App Control</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: "Segoe UI", sans-serif; background: linear-gradient(180deg, #fff7ed 0%, #fffbf5 100%); color: #3f2d22; margin: 0; padding: 32px; }
      .panel { max-width: 760px; margin: 0 auto; background: rgba(255,255,255,0.92); border: 1px solid rgba(217,119,6,0.18); border-radius: 24px; padding: 24px; box-shadow: 0 24px 60px rgba(71,44,20,0.12); }
      .eyebrow { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #9a6b44; font-weight: 700; }
      h1 { margin: 12px 0 0; font-size: 28px; }
      p { line-height: 1.6; }
      .status { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 20px; }
      .card { background: #fff; border-radius: 18px; padding: 14px 16px; border: 1px solid rgba(148,163,184,0.18); }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
      button, a { border: 0; border-radius: 999px; padding: 12px 18px; font-weight: 700; font-size: 14px; cursor: pointer; text-decoration: none; }
      button.primary { background: #c2410c; color: white; }
      button.secondary, a.secondary { background: #fff; color: #7c2d12; border: 1px solid rgba(194,65,12,0.2); }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      .message { margin-top: 16px; padding: 12px 14px; border-radius: 16px; background: #fffbeb; border: 1px solid rgba(217,119,6,0.2); }
      code { font-family: Consolas, monospace; }
    </style>
  </head>
  <body>
    <div class="panel">
      <div class="eyebrow">Local Control Broker</div>
      <h1>Oload app server control</h1>
      <p>This page stays available even when the app on port ${APP_CONTROL_PORT} is stopped, so you can start it again without reopening a terminal.</p>
      <div class="status" id="status"></div>
      <div class="actions">
        <button class="primary" id="start">Start app</button>
        <button class="secondary" id="restart">Restart app</button>
        <button class="secondary" id="stop">Stop app</button>
        <a class="secondary" href="http://127.0.0.1:${APP_CONTROL_PORT}" target="_blank" rel="noreferrer">Open app</a>
      </div>
      <div class="message" id="message">Loading current status…</div>
    </div>
    <script>
      const message = document.getElementById('message');
      const status = document.getElementById('status');
      const startButton = document.getElementById('start');
      const restartButton = document.getElementById('restart');
      const stopButton = document.getElementById('stop');

      function setMessage(text) { message.textContent = text; }

      function renderStatus(payload) {
        status.innerHTML = '';
        const fields = [
          ['Running', payload.running ? 'Yes' : 'No'],
          ['Port', String(payload.appPort)],
          ['PID', payload.pid ? String(payload.pid) : 'Unavailable'],
          ['Start mode', payload.startMode || 'Unavailable'],
        ];

        for (const [label, value] of fields) {
          const card = document.createElement('div');
          card.className = 'card';
          card.innerHTML = '<div class="eyebrow">' + label + '</div><p><strong>' + value + '</strong></p>';
          status.appendChild(card);
        }

        startButton.disabled = !payload.canStart;
        restartButton.disabled = !payload.canRestart;
        stopButton.disabled = !payload.canStop;
        setMessage(payload.lastError || (payload.running ? 'The app is currently reachable at ' + payload.baseUrl : 'The app is stopped. Use Start app to bring it back on port ' + payload.appPort + '.'));
      }

      async function refreshStatus() {
        const response = await fetch('/api/app-control/status', { cache: 'no-store' });
        const payload = await response.json();
        renderStatus(payload);
      }

      async function submitAction(action) {
        setMessage((action === 'start' ? 'Starting' : action === 'stop' ? 'Stopping' : 'Restarting') + ' the app…');
        const response = await fetch('/api/app-control/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Request failed.');
        }
        renderStatus(payload.status);
      }

      startButton.addEventListener('click', () => submitAction('start').catch((error) => setMessage(error.message)));
      restartButton.addEventListener('click', () => submitAction('restart').catch((error) => setMessage(error.message)));
      stopButton.addEventListener('click', () => submitAction('stop').catch((error) => setMessage(error.message)));
      refreshStatus().catch((error) => setMessage(error.message));
      setInterval(() => { refreshStatus().catch(() => {}); }, 2500);
    </script>
  </body>
</html>`;
}

function requestToUrl(request) {
  return new URL(request.url || "/", BROKER_BASE_URL);
}

function cleanupExpiredRequests() {
  const now = Date.now();

  for (const [requestId, request] of loginRequests.entries()) {
    if (request.expiresAt <= now) {
      loginRequests.set(requestId, {
        ...request,
        status: request.status === "approved" ? "approved" : "expired",
      });
    }

    if (request.expiresAt + REQUEST_TTL_MS <= now) {
      loginRequests.delete(requestId);
    }
  }
}

function createLoginRequest() {
  cleanupExpiredRequests();

  const requestId = randomUUID();
  const expiresAt = Date.now() + REQUEST_TTL_MS;

  loginRequests.set(requestId, {
    requestId,
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt,
    identity: null,
  });

  return {
    requestId,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

function getLoginRequest(requestId) {
  cleanupExpiredRequests();
  const request = loginRequests.get(requestId);

  if (!request) {
    return null;
  }

  if (request.expiresAt <= Date.now() && request.status === "pending") {
    request.status = "expired";
  }

  return request;
}

function requireGoogleConfig() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function getGoogleAuthorizeUrl(requestId) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${BROKER_BASE_URL}/api/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", requestId);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function exchangeGoogleCode(code) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${BROKER_BASE_URL}/api/google/callback`,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Google token exchange failed.");
  }

  const tokenPayload = await tokenResponse.json();

  if (!tokenPayload.access_token) {
    throw new Error("Google did not return an access token.");
  }

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });

  if (!userResponse.ok) {
    throw new Error("Google user profile lookup failed.");
  }

  const userPayload = await userResponse.json();

  if (!userPayload.sub || !userPayload.email || !userPayload.email_verified) {
    throw new Error("Google account must have a verified email address.");
  }

  return {
    sub: userPayload.sub,
    email: userPayload.email,
    name: userPayload.name || userPayload.email,
    picture: userPayload.picture,
  };
}

const server = createServer(async (request, response) => {
  try {
    const url = requestToUrl(request);

    if (url.pathname.startsWith("/api/app-control") || url.pathname === "/control/app") {
      if (requireLoopbackRequest(request, response)) {
        return;
      }
    }

    if (request.method === "POST" && url.pathname === "/api/login/start") {
      if (!requireGoogleConfig()) {
        sendJson(response, 503, { error: "Google auth broker is not configured." });
        return;
      }

      const loginRequest = createLoginRequest();
      sendJson(response, 200, {
        requestId: loginRequest.requestId,
        authorizeUrl: `${BROKER_BASE_URL}/login/${encodeURIComponent(loginRequest.requestId)}`,
        expiresAt: loginRequest.expiresAt,
        pollIntervalMs: POLL_INTERVAL_MS,
      });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/login/")) {
      if (!requireGoogleConfig()) {
        sendHtml(response, 503, "<h1>Broker not configured</h1><p>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</p>");
        return;
      }

      const requestId = decodeURIComponent(url.pathname.slice("/login/".length));
      const loginRequest = getLoginRequest(requestId);

      if (!loginRequest || loginRequest.status === "expired") {
        sendHtml(response, 410, "<h1>Request expired</h1><p>Return to the app and start sign-in again.</p>");
        return;
      }

      redirect(response, getGoogleAuthorizeUrl(requestId));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/google/callback") {
      const requestId = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const oauthError = url.searchParams.get("error");

      if (!requestId) {
        sendHtml(response, 400, "<h1>Missing state</h1><p>The broker request ID was not present.</p>");
        return;
      }

      const loginRequest = getLoginRequest(requestId);

      if (!loginRequest) {
        sendHtml(response, 410, "<h1>Unknown request</h1><p>Return to the app and try again.</p>");
        return;
      }

      if (oauthError || !code) {
        loginRequest.status = "expired";
        sendHtml(response, 400, "<h1>Google sign-in cancelled</h1><p>You can close this window and return to the app.</p>");
        return;
      }

      try {
        loginRequest.identity = await exchangeGoogleCode(code);
        loginRequest.status = "approved";
        sendHtml(response, 200, "<h1>Sign-in complete</h1><p>You can close this window and return to oload.</p>");
      } catch (error) {
        loginRequest.status = "expired";
        sendHtml(response, 401, `<h1>Google sign-in failed</h1><p>${error instanceof Error ? error.message : "Unexpected broker error."}</p>`);
      }

      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/login/status/")) {
      const requestId = decodeURIComponent(url.pathname.slice("/api/login/status/".length));
      const loginRequest = getLoginRequest(requestId);

      if (!loginRequest) {
        sendJson(response, 404, { error: "Login request was not found." });
        return;
      }

      sendJson(response, 200, {
        requestId,
        status: loginRequest.status,
        expiresAt: new Date(loginRequest.expiresAt).toISOString(),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/login/exchange") {
      const body = await readJsonBody(request);
      const requestId = typeof body.requestId === "string" ? body.requestId : "";
      const loginRequest = getLoginRequest(requestId);

      if (!loginRequest) {
        sendJson(response, 404, { error: "Login request was not found." });
        return;
      }

      if (loginRequest.status !== "approved" || !loginRequest.identity) {
        sendJson(response, 409, { error: "Login request is not ready for exchange." });
        return;
      }

      loginRequest.status = "consumed";
      sendJson(response, 200, {
        requestId,
        identity: loginRequest.identity,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/app-control/status") {
      sendJson(response, 200, await readAppControlStatus());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/app-control/action") {
      const body = await readJsonBody(request);
      const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

      if (!["start", "stop", "restart"].includes(action)) {
        sendJson(response, 400, { error: "A valid app control action is required." });
        return;
      }

      if (appControlActionInFlight) {
        sendJson(response, 409, { error: "Another app control action is already in progress." });
        return;
      }

      appControlLastAction = action;
      appControlLastActionAt = new Date().toISOString();
      appControlLastError = null;

      if (action === "start") {
        try {
          const status = await startAppServer();
          sendJson(response, 200, {
            ok: true,
            status,
          });
        } catch (error) {
          appControlLastError = error instanceof Error ? error.message : "Unable to start the app.";
          sendJson(response, 500, { error: appControlLastError });
        }
        return;
      }

      appControlActionInFlight = true;

      setTimeout(async () => {
        try {
          await stopAppServer();

          if (action === "restart") {
            await startAppServer();
          }
        } catch (error) {
          appControlLastError = error instanceof Error ? error.message : `Unable to ${action} the app.`;
        } finally {
          appControlActionInFlight = false;
          appControlLastActionAt = new Date().toISOString();
        }
      }, 250);

      sendJson(response, 202, {
        ok: true,
        status: await readAppControlStatus(),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/control/app") {
      sendHtml(response, 200, renderAppControlPage());
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        appControlPort: APP_CONTROL_PORT,
        brokerBaseUrl: BROKER_BASE_URL,
        googleConfigured: requireGoogleConfig(),
      });
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected broker server error.",
    });
  }
});

server.listen(BROKER_PORT, () => {
  console.log(`oload auth broker listening on ${BROKER_BASE_URL}`);
});