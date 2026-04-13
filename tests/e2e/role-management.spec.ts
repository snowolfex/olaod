import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

type BrowserPage = Parameters<Parameters<typeof test>[1]>[0]["page"];

function createForgedAdminCookie() {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + 60_000,
    user: {
      id: "playwright-forged-admin",
      username: "playwright-forged-admin",
      displayName: "Playwright Forged Admin",
      role: "admin",
    },
  }), "utf8").toString("base64url");
  const signature = createHmac("sha256", "playwright-session-secret")
    .update(payload)
    .digest("base64url");

  return `oload_user_session=${payload}.${signature}`;
}

async function getCookieHeader(page: BrowserPage) {
  const cookies = await page.context().cookies();
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function resetPlaywrightData() {
  const dataDir = path.join(process.cwd(), ".playwright-data");

  await mkdir(dataDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(dataDir, "users.json"), "[]\n", "utf8"),
    writeFile(path.join(dataDir, "conversations.json"), "[]\n", "utf8"),
    writeFile(path.join(dataDir, "activity-log.json"), "[]\n", "utf8"),
    writeFile(path.join(dataDir, "job-history.json"), "[]\n", "utf8"),
  ]);
}

test("covers role management refresh, role updates, and session guardrails", async ({ page, request }) => {
  test.setTimeout(60_000);

  const createUserSubmitButton = page.getByRole("button", { name: "Create user" }).nth(1);

  await resetPlaywrightData();
  await page.goto("/");
  await page.getByRole("button", { name: "Create user" }).first().click();
  await page.getByPlaceholder("Username").fill("playwright-role-admin");
  await page.getByPlaceholder("Display name").fill("Playwright Role Admin");
  await page.getByPlaceholder("Password").fill("playwright-pass");
  await createUserSubmitButton.click();

  await expect(page.getByRole("button", { name: "Refresh users" })).toBeVisible();
  await expect(page.getByText("Your own role is locked in this panel.")).toBeVisible();

  const adminCookieHeader = await getCookieHeader(page);
  const sessionResponse = await request.get("/api/users/session", {
    headers: {
      cookie: adminCookieHeader,
    },
  });
  expect(sessionResponse.ok()).toBeTruthy();

  const sessionPayload = (await sessionResponse.json()) as {
    user: {
      id: string;
    } | null;
  };

  if (!sessionPayload.user?.id) {
    throw new Error("Expected an authenticated admin session for role management coverage.");
  }

  const operatorResponse = await request.post("/api/users/register", {
    headers: {
      cookie: adminCookieHeader,
      "Content-Type": "application/json",
    },
    data: {
      username: "playwright-role-operator",
      displayName: "Playwright Role Operator",
      password: "playwright-pass",
    },
  });
  expect(operatorResponse.ok()).toBeTruthy();

  const operatorPayload = (await operatorResponse.json()) as {
    user: {
      id: string;
      role: string;
    };
  };
  expect(operatorPayload.user.role).toBe("operator");

  await page.getByRole("button", { name: "Refresh users" }).click();

  const operatorCard = page.getByText("Playwright Role Operator").locator("xpath=ancestor::div[contains(@class, 'rounded-[24px]')]").first();
  await expect(operatorCard).toBeVisible();
  const viewerRoleButton = operatorCard.getByRole("button", { name: "viewer", exact: true });
  await viewerRoleButton.click();
  await expect(viewerRoleButton).toBeDisabled();

  const updatedUsersResponse = await request.get("/api/users", {
    headers: {
      cookie: adminCookieHeader,
    },
  });
  expect(updatedUsersResponse.ok()).toBeTruthy();
  const updatedUsersPayload = (await updatedUsersResponse.json()) as {
    users: Array<{
      id: string;
      role: string;
    }>;
  };
  expect(updatedUsersPayload.users).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: operatorPayload.user.id,
        role: "viewer",
      }),
    ]),
  );

  const selfRoleResponse = await request.patch(`/api/users/${sessionPayload.user.id}/role`, {
    headers: {
      cookie: adminCookieHeader,
      "Content-Type": "application/json",
    },
    data: {
      role: "viewer",
    },
  });
  expect(selfRoleResponse.status()).toBe(400);
  await expect.soft(selfRoleResponse.json()).resolves.toMatchObject({
    error: "You cannot change your own role in this panel.",
  });

  const forgedAdminCookieHeader = createForgedAdminCookie();
  const forgedSessionResponse = await request.patch(`/api/users/${sessionPayload.user.id}/role`, {
    headers: {
      cookie: forgedAdminCookieHeader,
      "Content-Type": "application/json",
    },
    data: {
      role: "viewer",
    },
  });
  expect(forgedSessionResponse.status()).toBe(401);
  await expect.soft(forgedSessionResponse.json()).resolves.toMatchObject({
    error: "Admin access is required.",
  });
});