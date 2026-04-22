import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export type BrowserPage = Page;
export type ApiRequest = APIRequestContext;

type AuthInput = {
  displayName: string;
  email: string;
  password: string;
  rememberSession?: boolean;
};

function getPlaywrightDataDir() {
  return path.join(process.cwd(), ".playwright-data");
}

function getPlaywrightDataDirCandidates() {
  return [
    getPlaywrightDataDir(),
    path.join(process.cwd(), ".next", "standalone", ".playwright-data"),
  ];
}

export async function resetPlaywrightData() {
  await Promise.all(getPlaywrightDataDirCandidates().map(async (dataDir) => {
    await mkdir(dataDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(dataDir, "users.json"), "[]\n", "utf8"),
      writeFile(path.join(dataDir, "conversations.json"), "[]\n", "utf8"),
      writeFile(path.join(dataDir, "activity-log.json"), "[]\n", "utf8"),
      writeFile(path.join(dataDir, "job-history.json"), "[]\n", "utf8"),
      writeFile(path.join(dataDir, "email-outbox.json"), "[]\n", "utf8"),
    ]);
  }));
}

async function getLatestVerificationCode(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  for (const dataDir of getPlaywrightDataDirCandidates()) {
    try {
      const raw = await readFile(path.join(dataDir, "email-outbox.json"), "utf8");
      const outbox = JSON.parse(raw) as Array<{ code: string; email: string }>;
      const match = outbox.find((entry) => entry.email === normalizedEmail);

      if (match) {
        return match.code;
      }
    } catch {
      // Try the next runtime data directory.
    }
  }

  expect(undefined).toBeTruthy();
  return "";
}

export async function addUserSessionCookieToPage(page: BrowserPage, response: Awaited<ReturnType<ApiRequest["post"]>>) {
  const setCookieHeader = response.headers()["set-cookie"];

  expect(setCookieHeader).toBeTruthy();

  const firstCookie = setCookieHeader.split(";")[0];
  const separatorIndex = firstCookie.indexOf("=");

  expect(separatorIndex).toBeGreaterThan(0);

  await page.context().addCookies([
    {
      name: firstCookie.slice(0, separatorIndex),
      value: firstCookie.slice(separatorIndex + 1),
      url: "http://127.0.0.1:3101",
    },
  ]);
}

export async function registerAndAuthenticateLocalUser(input: AuthInput & { page: BrowserPage; request: ApiRequest }) {
  const registerResponse = await input.request.post("/api/users/register", {
    data: {
      displayName: input.displayName,
      email: input.email,
      password: input.password,
      rememberSession: input.rememberSession === true,
    },
  });

  expect(registerResponse.ok()).toBeTruthy();

  const registerPayload = (await registerResponse.json()) as {
    verificationRequired?: boolean;
  };

  expect(registerPayload.verificationRequired).toBeTruthy();

  const code = await getLatestVerificationCode(input.email);
  const verifyResponse = await input.request.post("/api/users/verify", {
    data: {
      code,
      email: input.email,
    },
  });

  expect(verifyResponse.ok()).toBeTruthy();
  await addUserSessionCookieToPage(input.page, verifyResponse);
  return verifyResponse;
}

export async function loginAndAuthenticateLocalUser(input: AuthInput & { page: BrowserPage; request: ApiRequest }) {
  const loginResponse = await input.request.post("/api/users/login", {
    data: {
      email: input.email,
      password: input.password,
      rememberSession: input.rememberSession === true,
    },
  });

  expect(loginResponse.ok()).toBeTruthy();

  const loginPayload = (await loginResponse.json()) as {
    verificationRequired?: boolean;
  };

  if (loginPayload.verificationRequired) {
    const code = await getLatestVerificationCode(input.email);
    const verifyResponse = await input.request.post("/api/users/verify", {
      data: {
        code,
        email: input.email,
      },
    });

    expect(verifyResponse.ok()).toBeTruthy();
    await addUserSessionCookieToPage(input.page, verifyResponse);
    return verifyResponse;
  }

  await addUserSessionCookieToPage(input.page, loginResponse);
  return loginResponse;
}

export async function getCookieHeader(page: BrowserPage) {
  const cookies = await page.context().cookies();
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
