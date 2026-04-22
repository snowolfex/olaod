import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import { getCookieHeader, registerAndAuthenticateLocalUser, resetPlaywrightData } from "./helpers/local-auth";

function getPlaywrightDataDir() {
  return path.join(process.cwd(), ".playwright-data");
}

function getPlaywrightDataDirCandidates() {
  return [
    getPlaywrightDataDir(),
    path.join(process.cwd(), ".next", "standalone", ".playwright-data"),
  ];
}

async function seedConversations(ownerId: string) {
  const now = Date.now();
  const recentTimestamp = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const archivedTimestamp = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString();

  await Promise.all(getPlaywrightDataDirCandidates().map(async (dataDir) => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      path.join(dataDir, "conversations.json"),
      `${JSON.stringify([
      {
        id: "recent-seeded-conversation",
        ownerId,
        title: "Recent seeded chat",
        createdAt: recentTimestamp,
        updatedAt: recentTimestamp,
        archivedAt: null,
        messages: [
          {
            role: "user",
            content: "Keep this conversation active.",
          },
          {
            role: "assistant",
            content: "Recent conversation seeded for browser coverage.",
          },
        ],
        settings: {
          model: "",
          systemPrompt: "You are a concise, high-signal local assistant running through Ollama.",
          temperature: 0.7,
        },
      },
      {
        id: "archived-empty-seeded",
        ownerId,
        title: "Archived empty seed",
        createdAt: archivedTimestamp,
        updatedAt: archivedTimestamp,
        archivedAt: archivedTimestamp,
        messages: [],
        settings: {
          model: "",
          systemPrompt: "You are a concise, high-signal local assistant running through Ollama.",
          temperature: 0.7,
        },
      },
      {
        id: "archived-restore-seeded",
        ownerId,
        title: "Archived restore seed",
        createdAt: archivedTimestamp,
        updatedAt: archivedTimestamp,
        archivedAt: archivedTimestamp,
        messages: [
          {
            role: "user",
            content: "This archived conversation should be restorable.",
          },
        ],
        settings: {
          model: "",
          systemPrompt: "You are a concise, high-signal local assistant running through Ollama.",
          temperature: 0.7,
        },
      },
      ], null, 2)}\n`,
      "utf8",
    );
  }));
}

test("covers archived conversation filtering, selection, and restore flows", async ({ page, request }) => {
  test.setTimeout(60_000);

  await resetPlaywrightData();
  await registerAndAuthenticateLocalUser({
    displayName: "Playwright Chat Admin",
    email: "playwright-chat-admin@example.com",
    page,
    password: "playwright-pass",
    rememberSession: true,
    request,
  });

  await page.goto("/");
  await expect(page.getByLabel("Sign out")).toBeVisible();
  await page.getByRole("button", { name: "Hide command deck" }).click();

  const cookieHeader = await getCookieHeader(page);
  const sessionResponse = await request.get("/api/users/session", {
    headers: {
      cookie: cookieHeader,
    },
  });
  const sessionPayload = (await sessionResponse.json()) as {
    user: {
      id: string;
    } | null;
  };

  if (!sessionPayload.user?.id) {
    throw new Error("Expected a signed-in user session for conversation archive coverage.");
  }

  await seedConversations(sessionPayload.user.id);
  await page.reload();

  await expect(page.getByText("Recent conversation seeded for browser coverage.").first()).toBeVisible();
  await page.getByRole("button", { name: "Show archived" }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  await expect(page.getByText("Archived empty seed").first()).toBeVisible();
  await expect(page.getByText("Archived restore seed").first()).toBeVisible();
  await expect(page.getByText(/Showing 2 all archived chats, sorted newest archived first\./)).toBeVisible();

  await page.getByRole("button", { name: /show empty 1 archived chats/i }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByText(/Showing 1 empty archived chats, sorted newest archived first\./)).toBeVisible();
  await expect(page.getByText("Archived empty seed").first()).toBeVisible();
  await expect(page.getByText("Archived restore seed")).toHaveCount(0);

  await page.getByRole("button", { name: /show all 2 archived chats/i }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByText("Archived restore seed").first()).toBeVisible();
  await page.getByRole("button", { name: "Select archived conversation Archived restore seed" }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByText(/1 selected for bulk actions\./)).toBeVisible();

  await page.getByRole("button", { name: /Restore selected archived/i }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await page.getByRole("button", { name: /Confirm selected archived chats/i }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  await expect(page.getByText("Restored 1 archived chat from the current selection.")).toBeVisible();
  await expect(page.getByText("Archived empty seed").first()).toBeVisible();
  await expect(page.getByText(/Showing 1 all archived chats, sorted newest archived first\./)).toBeVisible();

  const refreshedCookieHeader = await getCookieHeader(page);
  const conversationsResponse = await request.get("/api/conversations", {
    headers: {
      cookie: refreshedCookieHeader,
    },
  });
  expect(conversationsResponse.ok()).toBeTruthy();

  const conversationsPayload = (await conversationsResponse.json()) as {
    conversations: Array<{
      id: string;
      archivedAt: string | null;
      title: string;
    }>;
  };

  expect(conversationsPayload.conversations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "archived-restore-seeded",
        title: "Archived restore seed",
        archivedAt: null,
      }),
      expect.objectContaining({
        id: "archived-empty-seeded",
        title: "Archived empty seed",
      }),
    ]),
  );
});