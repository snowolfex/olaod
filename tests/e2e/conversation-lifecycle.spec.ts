import { expect, test } from "@playwright/test";

type BrowserPage = Parameters<Parameters<typeof test>[1]>[0]["page"];

async function getCookieHeader(page: BrowserPage) {
  const cookies = await page.context().cookies();
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

test("covers saved conversation rename, pin, and archive-from-active-thread flows", async ({ page, request }) => {
  test.setTimeout(60_000);

  const createUserSubmitButton = page.getByRole("button", { name: "Create user" }).nth(1);

  await page.goto("/");
  await page.getByRole("button", { name: "Create user" }).first().click();
  await page.getByPlaceholder("Username").fill("playwright-convo-admin");
  await page.getByPlaceholder("Display name").fill("Playwright Conversation Admin");
  await page.getByPlaceholder("Password").fill("playwright-pass");
  await createUserSubmitButton.click();

  await expect(page.getByRole("button", { name: "Sign out user" })).toBeVisible();

  const cookieHeader = await getCookieHeader(page);
  const sessionResponse = await request.get("/api/users/session", {
    headers: {
      cookie: cookieHeader,
    },
  });
  expect(sessionResponse.ok()).toBeTruthy();
  const userSessionPayload = (await sessionResponse.json()) as {
    user: {
      id: string;
    } | null;
  };

  const conversationResponse = await request.post("/api/conversations", {
    headers: {
      cookie: cookieHeader,
      "Content-Type": "application/json",
    },
    data: {
      title: "Lifecycle seed",
      messages: [
        {
          role: "user",
          content: "Please persist this seeded conversation.",
        },
        {
          role: "assistant",
          content: "Seeded conversation ready for lifecycle coverage.",
        },
      ],
      settings: {
        model: "",
        systemPrompt: "You are a concise, high-signal local assistant running through Ollama.",
        temperature: 0.7,
      },
    },
  });
  expect(conversationResponse.ok()).toBeTruthy();

  const conversationPayload = (await conversationResponse.json()) as {
    conversation: {
      id: string;
      archivedAt: string | null;
      title: string;
    };
  };

  await page.reload();

  await page.getByRole("button", { name: /Lifecycle seed/i }).click();
  await expect(page.getByPlaceholder("Conversation title")).toHaveValue("Lifecycle seed");

  const renamedTitle = "Lifecycle renamed chat";
  const titleInput = page.getByPlaceholder("Conversation title");
  await titleInput.fill(renamedTitle);
  await page.getByRole("button", { name: "Save title" }).click();
  await expect(titleInput).toHaveValue(renamedTitle);

  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await expect(page.getByText("1 pinned")).toBeVisible();
  const currentUserId = userSessionPayload.user?.id;

  if (!currentUserId) {
    throw new Error("Expected a signed-in user id for conversation lifecycle coverage.");
  }

  const pinnedIdsBeforeArchive = await page.evaluate((userId) => {
    const raw = window.localStorage.getItem(`oload:chat:pinned-conversations:${userId}`);
    return raw ? JSON.parse(raw) : [];
  }, currentUserId);
  expect(pinnedIdsBeforeArchive).toContain(conversationPayload.conversation.id);

  await page.getByRole("button", { name: "Archive chat" }).click();
  await expect(page.getByText("New conversation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide archived" })).toBeVisible();
  await expect(page.getByText(renamedTitle)).toBeVisible();

  const pinnedIdsAfterArchive = await page.evaluate((userId) => {
    const raw = window.localStorage.getItem(`oload:chat:pinned-conversations:${userId}`);
    return raw ? JSON.parse(raw) : [];
  }, currentUserId);
  expect(pinnedIdsAfterArchive).not.toContain(conversationPayload.conversation.id);

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
      title: string;
      archivedAt: string | null;
    }>;
  };
  expect(conversationsPayload.conversations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: conversationPayload.conversation.id,
        title: renamedTitle,
      }),
    ]),
  );

  const archivedConversation = conversationsPayload.conversations.find(
    (conversation) => conversation.id === conversationPayload.conversation.id,
  );
  expect(archivedConversation?.archivedAt).toBeTruthy();
});