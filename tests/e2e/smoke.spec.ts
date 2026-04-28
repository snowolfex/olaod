import { expect, test } from "@playwright/test";
import { getCookieHeader, registerAndAuthenticateLocalUser, resetPlaywrightData } from "./helpers/local-auth";

async function hideCommandDeckIfVisible(page: Parameters<Parameters<typeof test>[1]>[0]["page"]) {
  const hideButton = page.getByRole("button", { name: "Hide command deck" });

  if (await hideButton.isVisible()) {
    await hideButton.click();
  }
}

test.describe("oload smoke coverage", () => {
  test("renders the core control-plane sections", async ({ page, request }) => {
    await resetPlaywrightData();
    await registerAndAuthenticateLocalUser({
      displayName: "Playwright Smoke Admin",
      email: "playwright-smoke-admin@example.com",
      page,
      password: "playwright-pass",
      rememberSession: true,
      request,
    });

    await page.goto("/");
    await expect(page.getByLabel("Sign out")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Admin Ops" })).toBeVisible();
    await page.getByRole("button", { name: "Admin Ops" }).click();
    await hideCommandDeckIfVisible(page);

    await expect(page.getByText("Role management", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Runtime Models Library and ready/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Execution Jobs Queue and detail/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Audit Activity Audit trail/i })).toBeVisible();
  });

  test("persists model-library filter and sort controls", async ({ page, request }) => {
    await resetPlaywrightData();
    await registerAndAuthenticateLocalUser({
      displayName: "Playwright Library Admin",
      email: "playwright-library-admin@example.com",
      page,
      password: "playwright-pass",
      rememberSession: true,
      request,
    });

    await page.goto("/");
    await expect(page.getByLabel("Sign out")).toBeVisible();
    await page.getByRole("button", { name: "Admin Ops" }).click();
    await hideCommandDeckIfVisible(page);
    await page.getByRole("button", { name: /Runtime Models Library and ready/i }).click();

    const runningOnlyButton = page.getByRole("button", { name: /show only models with active runtimes/i });
    const allInstalledButton = page.getByRole("button", { name: /show installed models only/i });
    const sortSelect = page.getByLabel("Sort installed models");
    const searchInput = page.getByLabel("Choose a model from the library");

    await expect(allInstalledButton).toHaveAttribute("aria-pressed", "false");
    await expect(searchInput).toBeVisible();

    await runningOnlyButton.click();
    await sortSelect.selectOption("name");
    await searchInput.fill("zz-smoke-filter");

    await expect(runningOnlyButton).toHaveAttribute("aria-pressed", "true");
    await expect(sortSelect).toHaveValue("name");

    await page.reload();
    await hideCommandDeckIfVisible(page);
    await page.getByRole("button", { name: /Runtime Models Library and ready/i }).click();

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
    const missingModelName = "playwright:delete-fail-missing";

    await resetPlaywrightData();
    await registerAndAuthenticateLocalUser({
      displayName: "Playwright Delete Admin",
      email: "playwright-delete-admin@example.com",
      page,
      password: "playwright-pass",
      rememberSession: true,
      request,
    });

    await page.goto("/");
    await expect(page.getByLabel("Sign out")).toBeVisible();

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
    const deletedModelName = "playwright:delete-success-demo";

    await resetPlaywrightData();
    await registerAndAuthenticateLocalUser({
      displayName: "Playwright Delete Success Admin",
      email: "playwright-delete-success-admin@example.com",
      page,
      password: "playwright-pass",
      rememberSession: true,
      request,
    });

    await page.goto("/");
    await expect(page.getByLabel("Sign out")).toBeVisible();

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