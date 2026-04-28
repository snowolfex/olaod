import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import { getCookieHeader, registerAndAuthenticateLocalUser, resetPlaywrightData } from "./helpers/local-auth";

function createSignedUserCookie(user: {
  id: string;
  username: string;
  displayName: string;
  role: "viewer" | "operator" | "admin";
}) {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + 60_000,
    user,
  }), "utf8").toString("base64url");
  const signature = createHmac("sha256", "playwright-session-secret")
    .update(payload)
    .digest("base64url");

  return `oload_user_session=${payload}.${signature}`;
}

function getPlaywrightDataDirCandidates() {
  return [
    path.join(process.cwd(), ".playwright-data"),
    path.join(process.cwd(), ".next", "standalone", ".playwright-data"),
  ];
}

async function getLatestVerificationCode(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  for (const dataDir of getPlaywrightDataDirCandidates()) {
    try {
      const raw = await readFile(path.join(dataDir, "email-outbox.json"), "utf8");
      const outbox = JSON.parse(raw) as Array<{ code: string; email: string }>;
      const match = [...outbox].reverse().find((entry) => entry.email === normalizedEmail);

      if (match) {
        return match.code;
      }
    } catch {
      // Try the next runtime data directory.
    }
  }

  throw new Error(`No verification code found for ${normalizedEmail}.`);
}

test("covers role management refresh, role updates, deletion, and session guardrails", async ({ page, request }) => {
  test.setTimeout(60_000);

  await resetPlaywrightData();
  await registerAndAuthenticateLocalUser({
    displayName: "Playwright Role Admin",
    email: "playwright-role-admin@example.com",
    page,
    password: "playwright-pass",
    rememberSession: true,
    request,
  });

  await page.goto("/");
  await expect(page.getByLabel("Sign out")).toBeVisible();
  await page.getByRole("button", { name: "Admin Ops" }).click();
  await page.getByRole("button", { name: "Hide command deck" }).click();

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
      email: "playwright-role-operator@example.com",
      displayName: "Playwright Role Operator",
      password: "playwright-pass",
    },
  });
  expect(operatorResponse.ok()).toBeTruthy();

  const operatorCode = await getLatestVerificationCode("playwright-role-operator@example.com");
  const verifyOperatorResponse = await request.post("/api/users/verify", {
    headers: {
      "Content-Type": "application/json",
    },
    data: {
      code: operatorCode,
      email: "playwright-role-operator@example.com",
    },
  });
  expect(verifyOperatorResponse.ok()).toBeTruthy();

  const usersResponse = await request.get("/api/users", {
    headers: {
      cookie: adminCookieHeader,
    },
  });
  expect(usersResponse.ok()).toBeTruthy();
  const usersPayload = (await usersResponse.json()) as {
    users: Array<{
      id: string;
      username: string;
      email?: string;
      displayName: string;
      role: string;
    }>;
  };
  const operatorPayload = usersPayload.users.find((user) => user.email === "playwright-role-operator@example.com");

  if (!operatorPayload) {
    throw new Error("Expected the verified operator user to be available for role management coverage.");
  }

  expect(operatorPayload.role).toBe("operator");

  const operatorLoginResponse = await request.post("/api/users/login", {
    headers: {
      "Content-Type": "application/json",
    },
    data: {
      email: "playwright-role-operator@example.com",
      password: "playwright-pass",
      rememberSession: true,
    },
  });
  expect(operatorLoginResponse.ok()).toBeTruthy();

  const operatorCookieHeader = operatorLoginResponse.headers()["set-cookie"]?.split(";")[0] ?? "";
  expect(operatorCookieHeader).toContain("oload_user_session=");

  const operatorConversationResponse = await request.post("/api/conversations", {
    headers: {
      cookie: operatorCookieHeader,
      "Content-Type": "application/json",
    },
    data: {
      title: "Playwright delete-me conversation",
      messages: [
        {
          role: "user",
          content: "Delete this operator and cascade the saved chat.",
        },
      ],
    },
  });
  expect(operatorConversationResponse.ok()).toBeTruthy();

  await page.getByRole("button", { name: "Refresh users" }).click();

  const operatorCard = page.getByText("Playwright Role Operator").locator("xpath=ancestor::div[contains(@class, 'rounded-[24px]')]").first();
  await expect(operatorCard).toBeVisible();
  const viewerRoleButton = operatorCard.getByRole("button", { name: "viewer", exact: true });
  await viewerRoleButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(viewerRoleButton).toBeDisabled();

  await operatorCard.getByRole("button", { name: "Delete user" }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(operatorCard.getByText("This removes the local account and permanently deletes 1 saved conversation for this user on this machine.")).toBeVisible();
  await operatorCard.getByRole("button", { name: "Confirm delete" }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByText("Playwright Role Operator was deleted. Removed 1 saved conversation.")).toBeVisible();

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
  expect(updatedUsersPayload.users).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: operatorPayload.id,
      }),
    ]),
  );

  const deletedOperatorConversationsResponse = await request.get("/api/conversations", {
    headers: {
      cookie: operatorCookieHeader,
    },
  });
  expect(deletedOperatorConversationsResponse.ok()).toBeTruthy();
  await expect.soft(deletedOperatorConversationsResponse.json()).resolves.toMatchObject({
    conversations: [],
  });

  const activityResponse = await request.get("/api/admin/activity", {
    headers: {
      cookie: adminCookieHeader,
    },
  });
  expect(activityResponse.ok()).toBeTruthy();
  const activityPayload = (await activityResponse.json()) as {
    events: Array<{
      type: string;
      summary: string;
      details?: string;
    }>;
  };
  expect(activityPayload.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "user.role_updated",
        summary: "User role updated: Playwright Role Operator",
      }),
      expect.objectContaining({
        type: "user.deleted",
        summary: "User deleted: Playwright Role Operator",
        details: expect.stringContaining("removed 1 saved conversation"),
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

  const selfDeleteResponse = await request.delete(`/api/users/${sessionPayload.user.id}`, {
    headers: {
      cookie: adminCookieHeader,
    },
  });
  expect(selfDeleteResponse.status()).toBe(400);
  await expect.soft(selfDeleteResponse.json()).resolves.toMatchObject({
    error: "You cannot delete your own account in this panel.",
  });

  const forgedAdminCookieHeader = createSignedUserCookie({
    id: "playwright-forged-admin",
    username: "playwright-forged-admin",
    displayName: "Playwright Forged Admin",
    role: "admin",
  });
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