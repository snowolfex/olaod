import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import { getCookieHeader, registerAndAuthenticateLocalUser, resetPlaywrightData } from "./helpers/local-auth";

type WorkspaceBackupSnapshot = {
  version: 1;
  exportedAt: string;
  users: Array<{
    id: string;
    username: string;
    email?: string;
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
      const match = outbox.find((entry) => entry.email === normalizedEmail);

      if (match) {
        return match.code;
      }
    } catch {
      // Try the next runtime data directory.
    }
  }

  throw new Error(`No verification code found for ${normalizedEmail}.`);
}

test("exports and restores workspace backups, including invalidating stale user sessions", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);

  await resetPlaywrightData();

  try {
    await registerAndAuthenticateLocalUser({
      displayName: "Playwright Backup Admin",
      email: "playwright-backup-admin@example.com",
      page,
      password: "playwright-pass",
      rememberSession: true,
      request,
    });

    await page.goto("/");
    await expect(page.getByLabel("Sign out")).toBeVisible();
    await page.getByRole("button", { name: "Admin Ops" }).click();
    await page.getByRole("button", { name: "Hide command deck" }).click();

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

    const activityAfterExportResponse = await request.get("/api/admin/activity", {
      headers: {
        cookie: adminCookieHeader,
      },
    });
    expect(activityAfterExportResponse.ok()).toBeTruthy();
    await expect.soft(activityAfterExportResponse.json()).resolves.toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({
          type: "workspace.backup_exported",
          summary: "Workspace backup exported",
          details: expect.stringContaining("Playwright Backup Admin exported a workspace backup snapshot."),
        }),
      ]),
    });

    const downloadPath = await download.path();

    if (!downloadPath) {
      throw new Error("Expected the exported workspace backup to be written to a temporary download path.");
    }

    const originalSnapshot = JSON.parse(await readFile(downloadPath, "utf8")) as WorkspaceBackupSnapshot;
    expect(originalSnapshot.version).toBe(1);
    expect(originalSnapshot.users).toHaveLength(1);
    expect(originalSnapshot.conversations).toHaveLength(1);
    expect(originalSnapshot.users[0]?.username).toBe("playwright-backup-admin@example.com");
    expect(originalSnapshot.conversations[0]?.title).toBe("Backup Seed Conversation");

    const extraUserResponse = await request.post("/api/users/register", {
      headers: {
        cookie: adminCookieHeader,
        "Content-Type": "application/json",
      },
      data: {
        email: "playwright-backup-operator@example.com",
        displayName: "Playwright Backup Operator",
        password: "playwright-pass",
      },
    });
    expect(extraUserResponse.ok()).toBeTruthy();

    const verifyExtraUserResponse = await request.post("/api/users/verify", {
      data: {
        code: await getLatestVerificationCode("playwright-backup-operator@example.com"),
        email: "playwright-backup-operator@example.com",
      },
    });
    expect(verifyExtraUserResponse.ok()).toBeTruthy();

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
        expect.objectContaining({ email: "playwright-backup-admin@example.com" }),
        expect.objectContaining({ email: "playwright-backup-operator@example.com" }),
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

    await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(originalSnapshot, null, 2)),
    });
    await expect(page.getByText(/Loaded backup .* with 1 users, 1 conversations,/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm restore workspace backup" })).toBeDisabled();
    await page.getByRole("button", { name: "Clear selected backup" }).click();
    await expect(page.getByText(/Loaded backup .* with 1 users, 1 conversations,/)).toHaveCount(0);

    await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(originalSnapshot, null, 2)),
    });
    await expect(page.getByText(/Loaded backup .* with 1 users, 1 conversations,/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm restore workspace backup" })).toBeDisabled();
    await page.getByRole("checkbox", { name: /i understand this restore overwrites/i }).check();
    await page.getByRole("button", { name: "Confirm restore workspace backup" }).click();
    await expect(page.getByText("Workspace backup restored.")).toBeVisible();

    const restoredUsersResponse = await request.get("/api/users", {
      headers: {
        cookie: adminCookieHeader,
      },
    });
    expect(restoredUsersResponse.ok()).toBeTruthy();
    await expect.soft(restoredUsersResponse.json()).resolves.toMatchObject({
      users: [expect.objectContaining({ email: "playwright-backup-admin@example.com" })],
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

    const activityAfterRestoreResponse = await request.get("/api/admin/activity", {
      headers: {
        cookie: adminCookieHeader,
      },
    });
    expect(activityAfterRestoreResponse.ok()).toBeTruthy();
    const activityAfterRestorePayload = (await activityAfterRestoreResponse.json()) as {
      events: Array<{
        type: string;
        summary: string;
        details?: string;
      }>;
    };
    expect(activityAfterRestorePayload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workspace.backup_restored",
          summary: "Workspace backup restored",
          details: expect.stringContaining("restored a workspace backup snapshot containing 1 users, 1 conversations"),
        }),
      ]),
    );

    const signedOutSnapshot: WorkspaceBackupSnapshot = {
      ...originalSnapshot,
      users: [],
      conversations: [],
      activityEvents: [],
      jobHistory: [],
    };

    await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
      name: "oload-backup-empty.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(signedOutSnapshot, null, 2)),
    });
    await expect(page.getByText(/Loaded backup oload-backup-empty\.json with 0 users, 0 conversations,/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm restore workspace backup" })).toBeDisabled();
    await page.getByRole("checkbox", { name: /i understand this restore overwrites/i }).check();
    await page.getByRole("button", { name: "Confirm restore workspace backup" }).click();
    await expect(page.getByText("Workspace backup restored. Your previous session was cleared because the restored workspace no longer includes any local users.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" }).first()).toBeVisible();

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

  await resetPlaywrightData();

  try {
    await registerAndAuthenticateLocalUser({
      displayName: "Playwright Restore Role Admin",
      email: "playwright-restore-role-admin@example.com",
      page,
      password: "playwright-pass",
      rememberSession: true,
      request,
    });

    await page.goto("/");
    await expect(page.getByLabel("Sign out")).toBeVisible();
    await page.getByRole("button", { name: "Admin Ops" }).click();
    await page.getByRole("button", { name: "Hide command deck" }).click();

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

    await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
      name: "oload-backup-downgraded.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(downgradedSnapshot, null, 2)),
    });
    await expect(page.getByText(/Loaded backup oload-backup-downgraded\.json with 1 users, 1 conversations,/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm restore workspace backup" })).toBeDisabled();
    await page.getByRole("checkbox", { name: /i understand this restore overwrites/i }).check();
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