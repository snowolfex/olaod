import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

type BrowserPage = Parameters<Parameters<typeof test>[1]>[0]["page"];

function getPlaywrightDataDir() {
  return path.join(process.cwd(), ".playwright-data");
}

async function getCookieHeader(page: BrowserPage) {
  const cookies = await page.context().cookies();
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
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

  test("records failed direct model deletion attempts in jobs and activity", async ({ page, request }) => {
    const createUserSubmitButton = page.getByRole("button", { name: "Create user" }).nth(1);
    const missingModelName = "playwright:delete-fail-missing";

    await resetPlaywrightData();
    await page.goto("/");
    await page.getByRole("button", { name: "Create user" }).first().click();
    await page.getByPlaceholder("Username").fill("playwright-delete-admin");
    await page.getByPlaceholder("Display name").fill("Playwright Delete Admin");
    await page.getByPlaceholder("Password").fill("playwright-pass");
    await createUserSubmitButton.click();

    await expect(page.getByRole("button", { name: "Sign out user" })).toBeVisible();

    const cookieHeader = await getCookieHeader(page);
    const deleteResponse = await request.delete("/api/ollama/models", {
      headers: {
        cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      data: {
        name: missingModelName,
      },
    });

    expect(deleteResponse.ok()).toBeFalsy();

    await expect.poll(async () => {
      const jobsResponse = await request.get("/api/admin/jobs?limit=24&type=model.delete", {
        headers: {
          cookie: cookieHeader,
        },
      });

      expect(jobsResponse.ok()).toBeTruthy();

      const jobsPayload = (await jobsResponse.json()) as {
        jobs: Array<{
          target: string;
          status: string;
        }>;
      };

      return jobsPayload.jobs.some(
        (job) => job.target === missingModelName && job.status === "failed",
      );
    }, { timeout: 20_000 }).toBe(true);

    const activityResponse = await request.get("/api/admin/activity", {
      headers: {
        cookie: cookieHeader,
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
          type: "model.delete_failed",
          summary: `Model delete failed: ${missingModelName}`,
          details: "Playwright forced delete failure.",
        }),
      ]),
    );
  });

  test("records successful direct model deletion attempts in jobs and activity", async ({ page, request }) => {
    const createUserSubmitButton = page.getByRole("button", { name: "Create user" }).nth(1);
    const deletedModelName = "playwright:delete-success-demo";

    await resetPlaywrightData();
    await page.goto("/");
    await page.getByRole("button", { name: "Create user" }).first().click();
    await page.getByPlaceholder("Username").fill("playwright-delete-success-admin");
    await page.getByPlaceholder("Display name").fill("Playwright Delete Success Admin");
    await page.getByPlaceholder("Password").fill("playwright-pass");
    await createUserSubmitButton.click();

    await expect(page.getByRole("button", { name: "Sign out user" })).toBeVisible();

    const cookieHeader = await getCookieHeader(page);
    const deleteResponse = await request.delete("/api/ollama/models", {
      headers: {
        cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      data: {
        name: deletedModelName,
      },
    });

    expect(deleteResponse.ok()).toBeTruthy();

    await expect.poll(async () => {
      const jobsResponse = await request.get("/api/admin/jobs?limit=24&type=model.delete", {
        headers: {
          cookie: cookieHeader,
        },
      });

      expect(jobsResponse.ok()).toBeTruthy();

      const jobsPayload = (await jobsResponse.json()) as {
        jobs: Array<{
          target: string;
          status: string;
        }>;
      };

      return jobsPayload.jobs.some(
        (job) => job.target === deletedModelName && job.status === "succeeded",
      );
    }, { timeout: 20_000 }).toBe(true);

    const activityResponse = await request.get("/api/admin/activity", {
      headers: {
        cookie: cookieHeader,
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
          type: "model.deleted",
          summary: `Model deleted: ${deletedModelName}`,
          details: "A privileged model deletion request completed.",
        }),
      ]),
    );
  });
});