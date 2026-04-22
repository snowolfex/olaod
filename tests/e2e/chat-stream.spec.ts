import { expect, test, type APIRequestContext } from "@playwright/test";

import { getCookieHeader, registerAndAuthenticateLocalUser, resetPlaywrightData } from "./helpers/local-auth";

async function getConversationPayload(request: APIRequestContext, cookieHeader: string) {
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

    const composer = page.locator('textarea[placeholder="Type your message..."]:visible').last();
    const composerForm = page.locator("form").filter({ has: composer }).last();
    const modelPicker = page.getByRole("combobox", { name: "Select the AI for this chat" }).last();
    const sendButton = composerForm.getByRole("button", { name: "Send" });
    const stopButton = composerForm.getByRole("button", { name: "Stop", exact: true });

    await expect(modelPicker).toHaveValue(/.+/);
    await composer.fill("playwright:reply");
    await expect(sendButton).toBeEnabled();
    await composerForm.evaluate((form) => {
      (form as HTMLFormElement).requestSubmit();
    });

    await expect(stopButton).toBeEnabled();
    await expect(page.getByText("Playwright deterministic reply. The browser stream completed successfully.")).toBeVisible();
    await expect(page.getByText(/\d+ ms/).first()).toBeVisible();
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

    await page.getByRole("button", { name: "New chat" }).first().click();
    await composer.fill("playwright:stop");
    await composerForm.evaluate((form) => {
      (form as HTMLFormElement).requestSubmit();
    });

    await expect(page.getByText("Streaming reply started.").first()).toBeVisible();
    await stopButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(stopButton).toBeDisabled();
    await expect(page.getByText("This partial reply should remain after stop.").first()).toBeVisible();

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