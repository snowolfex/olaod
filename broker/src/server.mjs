import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const BROKER_PORT = Number(process.env.BROKER_PORT || process.env.PORT || 4010);
const BROKER_BASE_URL = (process.env.BROKER_BASE_URL || `http://localhost:${BROKER_PORT}`).replace(/\/$/, "");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim();
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim();
const REQUEST_TTL_MS = 1000 * 60 * 10;
const POLL_INTERVAL_MS = 2000;

const loginRequests = new Map();

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

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
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