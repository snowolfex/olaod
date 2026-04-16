import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { GoogleAuthMode } from "@/lib/user-types";

const GOOGLE_STATE_COOKIE_NAME = "oload_google_oauth";
const GOOGLE_STATE_TTL_MS = 1000 * 60 * 10;

type GoogleStatePayload = {
  state: string;
  exp: number;
  rememberSession?: boolean;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function getSessionSecret() {
  return process.env.OLOAD_SESSION_SECRET ||
    (process.env.NODE_ENV !== "production" ? "oload-local-dev-secret" : undefined);
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getRequiredEnv(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET") {
  const value = process.env[name]?.trim();
  return value || null;
}

export function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID?.trim()
    || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()
    || null;
}

export function getAuthBrokerBaseUrl() {
  return process.env.AUTH_BROKER_BASE_URL?.trim() || null;
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

export function isGoogleAuthConfigured() {
  return getGoogleAuthMode() !== "none";
}

export function getGoogleAuthMode(): GoogleAuthMode {
  if (getAuthBrokerBaseUrl()) {
    return "broker";
  }

  if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()) {
    return "direct";
  }

  if (isGoogleRedirectOAuthConfigured()) {
    return "redirect";
  }

  return "none";
}

export function isGoogleRedirectOAuthConfigured() {
  return Boolean(getRequiredEnv("GOOGLE_CLIENT_ID") && getRequiredEnv("GOOGLE_CLIENT_SECRET"));
}

export function getGoogleRedirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI?.trim() || `${origin}/api/users/google/callback`;
}

export function createGoogleOAuthStateCookie(rememberSession = false) {
  const secret = getSessionSecret();

  if (!secret) {
    throw new Error("User session secret is not configured.");
  }

  const payload: GoogleStatePayload = {
    state: randomBytes(24).toString("hex"),
    exp: Date.now() + GOOGLE_STATE_TTL_MS,
    rememberSession,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(encodedPayload, secret);

  return {
    cookie: {
      name: GOOGLE_STATE_COOKIE_NAME,
      value: `${encodedPayload}.${signature}`,
      maxAge: GOOGLE_STATE_TTL_MS / 1000,
    },
    state: payload.state,
  };
}

export function verifyGoogleOAuthState(cookieHeader: string | null, expectedState: string) {
  return Boolean(readGoogleOAuthState(cookieHeader, expectedState));
}

export function readGoogleOAuthState(cookieHeader: string | null, expectedState: string) {
  const secret = getSessionSecret();

  if (!secret) {
    return null;
  }

  const rawValue = parseCookieValue(cookieHeader, GOOGLE_STATE_COOKIE_NAME);

  if (!rawValue) {
    return null;
  }

  const [encodedPayload, signature] = rawValue.split(".");

  if (!encodedPayload || !signature || !safeEqual(signature, signPayload(encodedPayload, secret))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as GoogleStatePayload;
    if (!(payload.exp > Date.now() && safeEqual(payload.state, expectedState))) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function clearGoogleOAuthStateCookie() {
  return {
    name: GOOGLE_STATE_COOKIE_NAME,
    value: "",
    maxAge: 0,
  };
}

export function buildGoogleAuthorizationUrl(origin: string, state: string) {
  const clientId = getGoogleClientId();

  if (!clientId) {
    throw new Error("Google sign-in is not configured.");
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getGoogleRedirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url;
}

export async function exchangeGoogleCode(input: { code: string; origin: string }) {
  const clientId = getGoogleClientId();
  const clientSecret = getRequiredEnv("GOOGLE_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Google sign-in is not configured.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: getGoogleRedirectUri(input.origin),
    }),
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    throw new Error("Google sign-in could not exchange the authorization code.");
  }

  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };

  if (!tokenPayload.access_token) {
    throw new Error("Google sign-in did not return an access token.");
  }

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
    cache: "no-store",
  });

  if (!userResponse.ok) {
    throw new Error("Google sign-in could not load the account profile.");
  }

  const user = (await userResponse.json()) as GoogleUserInfo;

  if (!user.sub || !user.email || !user.email_verified) {
    throw new Error("Google sign-in requires a verified email address.");
  }

  return {
    subject: user.sub,
    email: user.email,
    displayName: user.name?.trim() || user.email,
    avatarUrl: user.picture,
  };
}