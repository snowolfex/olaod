import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

type BrowserPage = Parameters<Parameters<typeof test>[1]>[0]["page"];

type WorkspaceBackupSnapshot = {
  version: 1;
  exportedAt: string;
  users: Array<{
    id: string;
    username: string;
    displayName: string;
    role: "viewer" | "operator" | "admin";
    passwordHash: string;
    passwordSalt: string;
    createdAt: string;
  }>;
  conversations: Array<{ id: string; title: string }>;
  activityEvents: Array<{ id: string; type: string }>;
  jobHistory: Array<{ id: string; target: string }>;
};

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

test("exports and restores workspace backups, including invalidating stale user sessions", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);

  const createUserSubmitButton = page.getByRole("button", { name: "Create user" }).nth(1);

  await resetPlaywrightData();

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Create user" }).first().click();
    await page.getByPlaceholder("Username").fill("playwright-backup-admin");
    await page.getByPlaceholder("Display name").fill("Playwright Backup Admin");
    await page.getByPlaceholder("Password").fill("playwright-pass");
    await createUserSubmitButton.click();

    await expect(page.getByText("Workspace backup")).toBeVisible();

    const adminCookieHeader = await getCookieHeader(page);

    const seedConversationResponse = await request.post("/api/conversations", {
      headers: {
        cookie: adminCookieHeader,
        "Content-Type": "application/json",
      },
      data: {
        title: "Backup Seed Conversation",
        messages: [
          { role: "user", content: "Seed message" },
          { role: "assistant", content: "Seed reply" },
        ],
        settings: {
          model: "playwright:reply",
          systemPrompt: "",
          temperature: 0.2,
        },
      },
    });
    expect(seedConversationResponse.ok()).toBeTruthy();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export backup" }).click(),
    ]);

    await expect(page.getByText("Workspace backup exported.")).toBeVisible();
    expect(download.suggestedFilename()).toContain("oload-backup-");

    const downloadPath = await download.path();

    if (!downloadPath) {
      throw new Error("Expected the exported workspace backup to be written to a temporary download path.");
    }

    const originalSnapshot = JSON.parse(await readFile(downloadPath, "utf8")) as WorkspaceBackupSnapshot;
    expect(originalSnapshot.version).toBe(1);
    expect(originalSnapshot.users).toHaveLength(1);
    expect(originalSnapshot.conversations).toHaveLength(1);
    expect(originalSnapshot.users[0]?.username).toBe("playwright-backup-admin");
    expect(originalSnapshot.conversations[0]?.title).toBe("Backup Seed Conversation");

    const extraUserResponse = await request.post("/api/users/register", {
      headers: {
        cookie: adminCookieHeader,
        "Content-Type": "application/json",
      },
      data: {
        username: "playwright-backup-operator",
        displayName: "Playwright Backup Operator",
        password: "playwright-pass",
      },
    });
    expect(extraUserResponse.ok()).toBeTruthy();

    const extraConversationResponse = await request.post("/api/conversations", {
      headers: {
        cookie: adminCookieHeader,
        "Content-Type": "application/json",
      },
      data: {
        title: "Mutated Conversation",
        messages: [{ role: "user", content: "Mutation" }],
        settings: {
          model: "playwright:reply",
          systemPrompt: "",
          temperature: 0.2,
        },
      },
    });
    expect(extraConversationResponse.ok()).toBeTruthy();

    const mutatedUsersResponse = await request.get("/api/users", {
      headers: {
        cookie: adminCookieHeader,
      },
    });
    expect(mutatedUsersResponse.ok()).toBeTruthy();
    await expect.soft(mutatedUsersResponse.json()).resolves.toMatchObject({
      users: expect.arrayContaining([
        expect.objectContaining({ username: "playwright-backup-admin" }),
        expect.objectContaining({ username: "playwright-backup-operator" }),
      ]),
    });

    const mutatedConversationsResponse = await request.get("/api/conversations", {
      headers: {
        cookie: adminCookieHeader,
      },
    });
    expect(mutatedConversationsResponse.ok()).toBeTruthy();
    await expect.soft(mutatedConversationsResponse.json()).resolves.toMatchObject({
      conversations: expect.arrayContaining([
        expect.objectContaining({ title: "Backup Seed Conversation" }),
        expect.objectContaining({ title: "Mutated Conversation" }),
      ]),
    });

    await page.locator('input[type="file"]').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(originalSnapshot, null, 2)),
    });
    await expect(page.getByText(/Loaded backup .* with 1 users, 1 conversations,/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm restore workspace backup" }).click();
    await expect(page.getByText("Workspace backup restored.")).toBeVisible();

    const restoredUsersResponse = await request.get("/api/users", {
      headers: {
        cookie: adminCookieHeader,
      },
    });
    expect(restoredUsersResponse.ok()).toBeTruthy();
    await expect.soft(restoredUsersResponse.json()).resolves.toMatchObject({
      users: [expect.objectContaining({ username: "playwright-backup-admin" })],
    });

    const restoredConversationsResponse = await request.get("/api/conversations", {
      headers: {
        cookie: adminCookieHeader,
      },
    });
    expect(restoredConversationsResponse.ok()).toBeTruthy();
    await expect.soft(restoredConversationsResponse.json()).resolves.toMatchObject({
      conversations: [expect.objectContaining({ title: "Backup Seed Conversation" })],
    });

    const signedOutSnapshot: WorkspaceBackupSnapshot = {
      ...originalSnapshot,
      users: [],
      conversations: [],
      activityEvents: [],
      jobHistory: [],
    };

    await page.locator('input[type="file"]').setInputFiles({
      name: "oload-backup-empty.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(signedOutSnapshot, null, 2)),
    });
    await expect(page.getByText(/Loaded backup oload-backup-empty\.json with 0 users, 0 conversations,/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm restore workspace backup" }).click();
    await expect(page.getByText("Workspace backup restored. Your previous session was cleared because the restored workspace no longer includes any local users.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create user" }).first()).toBeVisible();

    const sessionResponse = await request.get("/api/users/session", {
      headers: {
        cookie: adminCookieHeader,
      },
    });
    expect(sessionResponse.ok()).toBeTruthy();
    await expect.soft(sessionResponse.json()).resolves.toMatchObject({ user: null, userCount: 0 });
  } finally {
    await resetPlaywrightData();
  }
});

test("recovers cleanly when a restore downgrades the current user's access", async ({ page, request }) => {
  test.setTimeout(60_000);

  const createUserSubmitButton = page.getByRole("button", { name: "Create user" }).nth(1);

  await resetPlaywrightData();

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Create user" }).first().click();
    await page.getByPlaceholder("Username").fill("playwright-restore-role-admin");
    await page.getByPlaceholder("Display name").fill("Playwright Restore Role Admin");
    await page.getByPlaceholder("Password").fill("playwright-pass");
    await createUserSubmitButton.click();
    await expect(page.getByRole("button", { name: "Sign out user" })).toBeVisible();

    const adminCookieHeader = await getCookieHeader(page);

    const seedConversationResponse = await request.post("/api/conversations", {
      headers: {
        cookie: adminCookieHeader,
        "Content-Type": "application/json",
      },
      data: {
        title: "Role Restore Seed Conversation",
        messages: [{ role: "user", content: "Seed message" }],
        settings: {
          model: "playwright:reply",
          systemPrompt: "",
          temperature: 0.2,
        },
      },
    });
    expect(seedConversationResponse.ok()).toBeTruthy();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export backup" }).click(),
    ]);

    const downloadPath = await download.path();

    if (!downloadPath) {
      throw new Error("Expected the exported workspace backup to be written to a temporary download path.");
    }

    const originalSnapshot = JSON.parse(await readFile(downloadPath, "utf8")) as WorkspaceBackupSnapshot;
    const downgradedSnapshot: WorkspaceBackupSnapshot = {
      ...originalSnapshot,
      users: originalSnapshot.users.map((user, index) =>
        index === 0
          ? {
              ...user,
              role: "viewer",
            }
          : user,
      ),
    };

    await page.locator('input[type="file"]').setInputFiles({
      name: "oload-backup-downgraded.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(downgradedSnapshot, null, 2)),
    });
    await expect(page.getByText(/Loaded backup oload-backup-downgraded\.json with 1 users, 1 conversations,/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm restore workspace backup" }).click();

    await expect(page.getByText("Workspace backup restored. Your access changed from admin to viewer.")).toBeVisible();
    await expect(page.getByText("viewer").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh users" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Export backup" })).toHaveCount(0);

    const sessionResponse = await request.get("/api/users/session", {
      headers: {
        cookie: adminCookieHeader,
      },
    });
    expect(sessionResponse.ok()).toBeTruthy();
    await expect.soft(sessionResponse.json()).resolves.toMatchObject({
      user: expect.objectContaining({ role: "viewer" }),
      userCount: 1,
    });
  } finally {
    await resetPlaywrightData();
  }
});