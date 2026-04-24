import { createHmac, timingSafeEqual } from "node:crypto";

import type { AdminSessionStatus } from "@/lib/auth-types";
import { getGoogleAuthMode, isGoogleAuthConfigured } from "@/lib/google-auth";
import type { SessionUser, UserSessionStatus } from "@/lib/user-types";
import { getUserById, toSessionUser } from "@/lib/users";
import { countUsers } from "@/lib/users";

const AUTH_COOKIE_NAME = "oload_admin_session";
const USER_COOKIE_NAME = "oload_user_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

type SessionCookieOptions = {
  persistent?: boolean;
};

type SignedSessionPayload = {
  exp?: number;
  user?: SessionUser;
  persistent?: boolean;
};

export function getSessionSecret() {
  return process.env.OLOAD_SESSION_SECRET ||
    (process.env.NODE_ENV !== "production" ? "oload-local-dev-secret" : undefined);
}

function getAuthConfig() {
  const password = process.env.OLOAD_ADMIN_PASSWORD;
  const secret = getSessionSecret();

  return {
    authEnabled: Boolean(password && secret),
    password,
    secret,
  };
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function encodePayload(expiresAt: number) {
  return Buffer.from(JSON.stringify({ exp: expiresAt }), "utf8").toString(
    "base64url",
  );
}

function encodeSessionPayload(payload: object) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function parseSignedValue(rawValue: string | null, secret: string) {
  if (!rawValue) {
    return null;
  }

  const [payload, signature] = rawValue.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payload, secret);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SignedSessionPayload;
  } catch {
    return null;
  }
}

function parseCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));

  if (!match) {
    return null;
  }

  return decodeURIComponent(match.slice(name.length + 1));
}

export function createAdminSessionCookie() {
  const config = getAuthConfig();

  if (!config.authEnabled || !config.secret) {
    throw new Error("Admin authentication is not configured.");
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = encodePayload(expiresAt);
  const signature = signPayload(payload, config.secret);
  const value = `${payload}.${signature}`;

  return {
    name: AUTH_COOKIE_NAME,
    value,
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function getAdminSessionStatus(cookieHeader: string | null): AdminSessionStatus {
  const config = getAuthConfig();

  if (!config.authEnabled || !config.secret) {
    return {
      authEnabled: false,
      authenticated: false,
    };
  }

  const decoded = parseSignedValue(
    parseCookieValue(cookieHeader, AUTH_COOKIE_NAME),
    config.secret,
  );

  if (!decoded) {
    return {
      authEnabled: true,
      authenticated: false,
    };
  }

  if (!decoded.exp || decoded.exp <= Date.now()) {
    return {
      authEnabled: true,
      authenticated: false,
    };
  }

  return {
    authEnabled: true,
    authenticated: true,
  };
}

export function verifyAdminPassword(password: string) {
  const config = getAuthConfig();

  if (!config.authEnabled || !config.password) {
    return false;
  }

  return safeEqual(password, config.password);
}

export function createUserSessionCookie(user: SessionUser, options?: SessionCookieOptions) {
  const secret = getSessionSecret();

  if (!secret) {
    throw new Error("User session secret is not configured.");
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = encodeSessionPayload({ exp: expiresAt, persistent: Boolean(options?.persistent), user });
  const signature = signPayload(payload, secret);

  return {
    name: USER_COOKIE_NAME,
    value: `${payload}.${signature}`,
    maxAge: options?.persistent ? SESSION_TTL_MS / 1000 : undefined,
  };
}

export function getUserSessionStatus(cookieHeader: string | null): UserSessionStatus {
  const secret = getSessionSecret();
  const rawValue = parseCookieValue(cookieHeader, USER_COOKIE_NAME);
  const googleAuthEnabled = isGoogleAuthConfigured();
  const googleAuthMode = getGoogleAuthMode();

  if (!secret) {
    return {
      authAvailable: false,
      googleAuthEnabled,
      googleAuthMode,
      user: null,
      userCount: 0,
    };
  }

  const decoded = parseSignedValue(rawValue, secret);

  if (!decoded?.exp || decoded.exp <= Date.now() || !decoded.user) {
    return {
      authAvailable: true,
      googleAuthEnabled,
      googleAuthMode,
      user: null,
      userCount: 0,
    };
  }

  return {
    authAvailable: true,
    googleAuthEnabled,
    googleAuthMode,
    user: decoded.user,
    userCount: 0,
  };
}

export function getUserSessionPersistence(cookieHeader: string | null) {
  const secret = getSessionSecret();

  if (!secret) {
    return false;
  }

  const decoded = parseSignedValue(parseCookieValue(cookieHeader, USER_COOKIE_NAME), secret);
  return Boolean(decoded?.persistent);
}

export async function getCurrentUser(cookieHeader: string | null) {
  const status = getUserSessionStatus(cookieHeader);

  if (!status.user) {
    return null;
  }

  const storedUser = await getUserById(status.user.id);

  if (
    !storedUser
    || storedUser.username !== status.user.username
    || storedUser.email !== status.user.email
  ) {
    return null;
  }

  return toSessionUser(storedUser);
}

export async function requireAdminSession(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const currentUser = await getCurrentUser(cookieHeader);

  if (currentUser?.role === "admin") {
    return null;
  }

  const userCount = await countUsers();

  if (userCount > 0) {
    return Response.json(
      { error: "An admin account is required for this action." },
      { status: 401 },
    );
  }

  const status = getAdminSessionStatus(cookieHeader);

  if (!status.authEnabled) {
    return null;
  }

  if (status.authenticated) {
    return null;
  }

  return Response.json(
    { error: "Admin authentication is required for this action." },
    { status: 401 },
  );
}

export function getSessionCookieName() {
  return AUTH_COOKIE_NAME;
}

export function getUserSessionCookieName() {
  return USER_COOKIE_NAME;
}