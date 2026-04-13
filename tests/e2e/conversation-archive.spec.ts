import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

function getPlaywrightDataDir() {
  return path.join(process.cwd(), ".playwright-data");
}

type BrowserPage = Parameters<Parameters<typeof test>[1]>[0]["page"];

async function getCookieHeader(page: BrowserPage) {
  const cookies = await page.context().cookies();
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function seedConversations(ownerId: string) {
  const dataDir = getPlaywrightDataDir();
  const now = Date.now();
  const recentTimestamp = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const archivedTimestamp = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString();

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
}

test("covers archived conversation filtering, selection, and restore flows", async ({ page, request }) => {
  test.setTimeout(60_000);

  const createUserSubmitButton = page.getByRole("button", { name: "Create user" }).nth(1);

  await page.goto("/");
  await page.getByRole("button", { name: "Create user" }).first().click();
  await page.getByPlaceholder("Username").fill("playwright-chat-admin");
  await page.getByPlaceholder("Display name").fill("Playwright Chat Admin");
  await page.getByPlaceholder("Password").fill("playwright-pass");
  await createUserSubmitButton.click();

  await expect(page.getByRole("button", { name: "Sign out user" })).toBeVisible();

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

  await expect(page.getByRole("button", { name: /Active Recent seeded chat/i })).toBeVisible();
  await page.getByRole("button", { name: "Show archived" }).click();

  await expect(page.getByText("Archived empty seed")).toBeVisible();
  await expect(page.getByText("Archived restore seed")).toBeVisible();
  await expect(page.getByText(/Showing 2 all archived chats, sorted newest archived first\./)).toBeVisible();

  await page.getByRole("button", { name: /show empty 1 archived chats/i }).click();
  await expect(page.getByText(/Showing 1 empty archived chats, sorted newest archived first\./)).toBeVisible();
  await expect(page.getByText("Archived empty seed")).toBeVisible();
  await expect(page.getByText("Archived restore seed")).toHaveCount(0);

  await page.getByRole("button", { name: /show all 2 archived chats/i }).click();
  await expect(page.getByText("Archived restore seed")).toBeVisible();
  await page.getByRole("button", { name: "Select archived conversation Archived restore seed" }).click();
  await expect(page.getByText(/1 selected for bulk actions\./)).toBeVisible();

  await page.getByRole("button", { name: /Restore selected archived chats/i }).click();
  await page.getByRole("button", { name: /Confirm selected archived chats/i }).click();

  await expect(page.getByText("Restored 1 archived chat from the current selection.")).toBeVisible();
  await expect(page.getByText("Archived empty seed")).toBeVisible();
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