import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { getCookieHeader, loginAndAuthenticateLocalUser, registerAndAuthenticateLocalUser, resetPlaywrightData, writeSharedJsonFixture } from "./helpers/local-auth";

function getPlaywrightDataDir() {
  return path.join(process.cwd(), ".playwright-data");
}

function getPlaywrightDataDirCandidates() {
  return [
    getPlaywrightDataDir(),
    path.join(process.cwd(), ".next", "standalone", ".playwright-data"),
  ];
}

async function getLatestVerificationEntry(email: string, purpose: "register" | "login") {
  const normalizedEmail = email.trim().toLowerCase();

  for (const dataDir of getPlaywrightDataDirCandidates()) {
    try {
      const raw = await readFile(path.join(dataDir, "email-outbox.json"), "utf8");
      const outbox = JSON.parse(raw) as Array<{
        code: string;
        email: string;
        purpose: "register" | "login" | "email-change";
      }>;

      for (let index = outbox.length - 1; index >= 0; index -= 1) {
        const entry = outbox[index];

        if (entry.email === normalizedEmail && entry.purpose === purpose) {
          return entry;
        }
      }
    } catch {
      // Try the next runtime data directory.
    }
  }

  throw new Error(`No ${purpose} verification entry found for ${normalizedEmail}.`);
}

async function seedJobHistory(requestedBy: string) {
  const now = new Date().toISOString();

  await Promise.all(getPlaywrightDataDirCandidates().map(async (dataDir) => {
    await mkdir(dataDir, { recursive: true });
    await writeSharedJsonFixture(dataDir, "job-history.json", [
      {
        id: "seeded-job-1",
        type: "model.pull",
        target: "phi3:mini",
        status: "queued",
        queuePosition: 1,
        createdAt: now,
        updatedAt: now,
        requestedBy,
        progressMessage: "Queued. Next to run.",
        progressEntries: [
          {
            createdAt: now,
            message: "Queued. Next to run.",
            statusLabel: "queued",
          },
        ],
      },
    ]);
  }));
}

async function setDesktopWorkspacePageCookie(page: Parameters<Parameters<typeof test>[1]>[0]["page"], value: "chat" | "admin" | "help") {
  await page.context().addCookies([
    {
      name: "oload_desktop_workspace_page",
      value,
      url: "http://127.0.0.1:3101",
    },
  ]);
}

async function reopenHome(page: Parameters<Parameters<typeof test>[1]>[0]["page"]) {
  if (page.url().startsWith("http://127.0.0.1:3101") || page.url().startsWith("http://localhost:3101")) {
    await page.reload();
    return;
  }

  await page.goto("/");
}

test("supports admin registration, auth guardrails, and seeded jobs access", async ({ page, request }) => {
  await resetPlaywrightData();
  await seedJobHistory("Playwright Admin");
  await registerAndAuthenticateLocalUser({
    displayName: "Playwright Admin",
    email: "playwright-admin@example.com",
    page,
    password: "playwright-pass",
    rememberSession: true,
    request,
  });

  await page.goto("/");

  await expect(page.getByText("Playwright Admin", { exact: true })).toBeVisible();
  await expect(page.getByText("admin", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Sign out")).toBeVisible();

  const authenticatedCookieHeader = await getCookieHeader(page);
  const authenticatedJobsResponse = await request.get("/api/admin/jobs?limit=12", {
    headers: {
      cookie: authenticatedCookieHeader,
    },
  });

  expect(authenticatedJobsResponse.ok()).toBeTruthy();
  const authenticatedJobsPayload = await authenticatedJobsResponse.json();
  expect(authenticatedJobsPayload.jobs).toHaveLength(1);
  expect(authenticatedJobsPayload.jobs[0]).toMatchObject({
    id: "seeded-job-1",
    target: "phi3:mini",
    requestedBy: "Playwright Admin",
    status: "queued",
  });

  await setDesktopWorkspacePageCookie(page, "admin");
  await reopenHome(page);
  await expect(page.getByRole("heading", { name: "Operations and access control" })).toBeVisible();
  await page.context().clearCookies();
  await reopenHome(page);

  await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to enter oload" })).toBeVisible();

  const unauthenticatedJobsResponse = await request.get("/api/admin/jobs?limit=12");
  expect(unauthenticatedJobsResponse.status()).toBe(401);

  await loginAndAuthenticateLocalUser({
    displayName: "Playwright Admin",
    email: "playwright-admin@example.com",
    page,
    password: "playwright-pass",
    rememberSession: true,
    request,
  });
  await setDesktopWorkspacePageCookie(page, "admin");
  await reopenHome(page);

  await expect(page.getByLabel("Sign out")).toBeVisible();
  await expect(page.locator('[data-help-id="admin.models"]:visible')).toBeVisible();
});

test("lets admins require email verification on every login for local users", async ({ page, request }) => {
  await resetPlaywrightData();

  await registerAndAuthenticateLocalUser({
    displayName: "Playwright Admin",
    email: "playwright-admin@example.com",
    page,
    password: "playwright-pass",
    rememberSession: true,
    request,
  });

  const operatorEmail = "playwright-operator@example.com";
  const operatorPassword = "playwright-pass";
  const registerResponse = await request.post("/api/users/register", {
    data: {
      displayName: "Playwright Operator",
      email: operatorEmail,
      password: operatorPassword,
      rememberSession: false,
    },
  });

  expect(registerResponse.ok()).toBeTruthy();
  const registerCode = (await getLatestVerificationEntry(operatorEmail, "register")).code;
  const verifyRegistrationResponse = await request.post("/api/users/verify", {
    data: {
      code: registerCode,
      email: operatorEmail,
    },
  });

  expect(verifyRegistrationResponse.ok()).toBeTruthy();

  await setDesktopWorkspacePageCookie(page, "admin");
  await reopenHome(page);

  await expect(page.getByRole("heading", { name: "Operations and access control" })).toBeVisible();
  await page.getByRole("button", { name: "Hide command deck" }).click();
  const operatorCard = page.getByText(operatorEmail, { exact: true }).locator("xpath=ancestor::div[contains(@class, 'rounded-[24px]')]").first();
  await expect(operatorCard).toBeVisible();
  await operatorCard.getByRole("button", { name: "Verify each login" }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  const adminCookieHeader = await getCookieHeader(page);
  await expect.poll(async () => {
    const usersResponse = await request.get("/api/users", {
      headers: {
        cookie: adminCookieHeader,
      },
    });

    expect(usersResponse.ok()).toBeTruthy();
    const usersPayload = await usersResponse.json() as {
      users: Array<{
        email?: string;
        requireEmailVerificationOnLogin?: boolean;
      }>;
    };

    return usersPayload.users.find((user) => user.email === operatorEmail)?.requireEmailVerificationOnLogin ?? null;
  }).toBe(true);

  const loginResponse = await request.post("/api/users/login", {
    data: {
      email: operatorEmail,
      password: operatorPassword,
      rememberSession: false,
    },
  });

  expect(loginResponse.ok()).toBeTruthy();
  const loginPayload = await loginResponse.json() as {
    verificationRequired?: boolean;
    verificationTarget?: string;
  };

  expect(loginPayload.verificationRequired).toBeTruthy();
  expect(loginPayload.verificationTarget).toBe(operatorEmail);
  expect(loginResponse.headers()["set-cookie"]).toBeUndefined();

  const loginCode = (await getLatestVerificationEntry(operatorEmail, "login")).code;
  const verifyLoginResponse = await request.post("/api/users/verify", {
    data: {
      code: loginCode,
      email: operatorEmail,
    },
  });

  expect(verifyLoginResponse.ok()).toBeTruthy();
  expect(verifyLoginResponse.headers()["set-cookie"]).toContain("oload_user_session=");
});