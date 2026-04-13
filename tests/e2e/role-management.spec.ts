import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

type BrowserPage = Parameters<Parameters<typeof test>[1]>[0]["page"];

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

test("covers role management refresh, role updates, deletion, and session guardrails", async ({ page, request }) => {
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
      username: string;
      displayName: string;
      role: string;
    };
  };
  expect(operatorPayload.user.role).toBe("operator");

  const operatorCookieHeader = createSignedUserCookie({
    id: operatorPayload.user.id,
    username: operatorPayload.user.username,
    displayName: operatorPayload.user.displayName,
    role: "operator",
  });
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
  await viewerRoleButton.click();
  await expect(viewerRoleButton).toBeDisabled();

  await operatorCard.getByRole("button", { name: "Delete user" }).click();
  await expect(operatorCard.getByText("This removes the local account and permanently deletes 1 saved conversation for this user on this machine.")).toBeVisible();
  await operatorCard.getByRole("button", { name: "Confirm delete" }).click();
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
        id: operatorPayload.user.id,
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