import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

type BrowserPage = Parameters<Parameters<typeof test>[1]>[0]["page"];
type ApiRequest = Parameters<Parameters<typeof test>[1]>[0]["request"];

function getPlaywrightDataDir() {
  return path.join(process.cwd(), ".playwright-data");
}

async function resetPlaywrightData() {
  const dataDir = getPlaywrightDataDir();

  await mkdir(dataDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(dataDir, "users.json"), "[]\n", "utf8"),
    writeFile(path.join(dataDir, "conversations.json"), "[]\n", "utf8"),
    writeFile(path.join(dataDir, "activity-log.json"), "[]\n", "utf8"),
    writeFile(path.join(dataDir, "job-history.json"), "[]\n", "utf8"),
  ]);
}

async function getCookieHeader(page: BrowserPage) {
  const cookies = await page.context().cookies();
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function getConversationPayload(request: ApiRequest, cookieHeader: string) {
  const response = await request.get("/api/conversations", {
    headers: {
      cookie: cookieHeader,
    },
  });

  expect(response.ok()).toBeTruthy();

  return response.json() as Promise<{
    conversations: Array<{
      id: string;
      title: string;
      lastMessagePreview: string;
      messageCount: number;
      archivedAt: string | null;
    }>;
  }>;
}

test("covers signed-in chat streaming completion and stop flows", async ({ page, request }) => {
  test.setTimeout(60_000);

  await resetPlaywrightData();

  try {
    const createUserSubmitButton = page.getByRole("button", { name: "Create user" }).nth(1);

    await page.goto("/");
    await page.getByRole("button", { name: "Create user" }).first().click();
    await page.getByPlaceholder("Username").fill("playwright-chat-admin");
    await page.getByPlaceholder("Display name").fill("Playwright Chat Admin");
    await page.getByPlaceholder("Password").fill("playwright-pass");
    await createUserSubmitButton.click();

    await expect(page.getByRole("button", { name: "Sign out user" })).toBeVisible();

    const composer = page.getByPlaceholder("Ask Ollama something useful...");
    const sendButton = page.getByRole("button", { name: "Send prompt" });
    const stopButton = page.getByRole("button", { name: "Stop", exact: true });

    await composer.fill("playwright:reply");
    await sendButton.click();

    await expect(stopButton).toBeEnabled();
    await expect(page.getByText("Playwright deterministic reply. The browser stream completed successfully.")).toBeVisible();
    await expect(page.getByText(/Last response streamed in \d+ ms\./)).toBeVisible();
    await expect(stopButton).toBeDisabled();

    const cookieHeader = await getCookieHeader(page);
    await expect.poll(async () => {
      const payload = await getConversationPayload(request, cookieHeader);
      return {
        count: payload.conversations.length,
        preview: payload.conversations[0]?.lastMessagePreview ?? "",
        messageCount: payload.conversations[0]?.messageCount ?? 0,
      };
    }).toMatchObject({
      count: 1,
      messageCount: 2,
    });

    const completedConversations = await getConversationPayload(request, cookieHeader);
    expect(completedConversations.conversations[0].archivedAt).toBeNull();
    expect(completedConversations.conversations[0].lastMessagePreview).toContain("Playwright deterministic reply.");

    await page.getByRole("button", { name: "New chat" }).click();
    await composer.fill("playwright:stop");
    await sendButton.click();

    await expect(page.getByText("Streaming reply started.")).toBeVisible();
    await stopButton.click();
    await expect(stopButton).toBeDisabled();
    await expect(page.getByText("This partial reply should remain after stop.")).toBeVisible();

    await expect.poll(async () => {
      const payload = await getConversationPayload(request, cookieHeader);
      return {
        count: payload.conversations.length,
        hasStoppedPreview: payload.conversations.some((conversation) =>
          conversation.lastMessagePreview.includes("This partial reply should remain after stop.")),
      };
    }).toMatchObject({
      count: 2,
      hasStoppedPreview: true,
    });
  } finally {
    await resetPlaywrightData();
  }
});