import { expect, test } from "@playwright/test";

test.describe("oload smoke coverage", () => {
  test("renders the core control-plane sections", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: "One surface for chat, model operations, and Ollama administration.",
      }),
    ).toBeVisible();
    await expect(page.locator("h2", { hasText: "Conversation cockpit" }).first()).toBeVisible();
    await expect(page.locator("h2", { hasText: "Local users" }).first()).toBeVisible();
    await expect(page.locator("h2", { hasText: "Library control" }).first()).toBeVisible();
    await expect(page.locator("h2", { hasText: "Recent job history" }).first()).toBeVisible();
  });

  test("persists model-library filter and sort controls", async ({ page }) => {
    await page.goto("/");

    const runningOnlyButton = page.getByRole("button", { name: /show only models with active runtimes/i });
    const allInstalledButton = page.getByRole("button", { name: /show all installed models/i });
    const sortSelect = page.getByLabel("Sort installed models");
    const searchInput = page.getByLabel("Search installed models");

    await expect(allInstalledButton).toHaveAttribute("aria-pressed", "true");
    await expect(searchInput).toBeVisible();

    await runningOnlyButton.click();
    await sortSelect.selectOption("name");
    await searchInput.fill("zz-smoke-filter");

    await expect(runningOnlyButton).toHaveAttribute("aria-pressed", "true");
    await expect(sortSelect).toHaveValue("name");

    await page.reload();

    await expect(runningOnlyButton).toHaveAttribute("aria-pressed", "true");
    await expect(sortSelect).toHaveValue("name");
    await expect(searchInput).toHaveValue("");
  });

  test("serves public session and status APIs", async ({ request }) => {
    const sessionResponse = await request.get("/api/users/session");
    expect(sessionResponse.ok()).toBeTruthy();

    const sessionPayload = await sessionResponse.json();
    expect(sessionPayload).toMatchObject({
      authAvailable: true,
    });
    expect(typeof sessionPayload.userCount).toBe("number");

    const statusResponse = await request.get("/api/ollama/status");
    expect([200, 503]).toContain(statusResponse.status());

    const statusPayload = await statusResponse.json();
    expect(typeof statusPayload.isReachable).toBe("boolean");
    expect(Array.isArray(statusPayload.models)).toBeTruthy();
    expect(typeof statusPayload.modelCount).toBe("number");
    expect(typeof statusPayload.runningCount).toBe("number");
    expect(typeof statusPayload.baseUrl).toBe("string");
  });
});