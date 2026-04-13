import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

function getPlaywrightDataDir() {
  return path.join(process.cwd(), ".playwright-data");
}

async function seedJobHistory(requestedBy: string) {
  const dataDir = getPlaywrightDataDir();
  const now = new Date().toISOString();

  await mkdir(dataDir, { recursive: true });
  await writeFile(
    path.join(dataDir, "job-history.json"),
    `${JSON.stringify([
      {
        id: "seeded-job-1",
        type: "model.pull",
        target: "phi3:mini",
        status: "queued",
        queuePosition: 1,
        createdAt: now,
        updatedAt: now,
        requestedBy,
        progressMessage: "Queued. Next to run.",
        progressEntries: [
          {
            createdAt: now,
            message: "Queued. Next to run.",
            statusLabel: "queued",
          },
        ],
      },
    ], null, 2)}\n`,
    "utf8",
  );
}

test("supports admin registration, auth guardrails, and seeded jobs access", async ({ page, request }) => {
  const pullModelButton = page.getByRole("button", { name: "Start pulling the requested model" });
  const createUserSubmitButton = page.getByRole("button", { name: "Create user" }).nth(1);
  const signInSubmitButton = page.getByRole("button", { name: "Sign in" }).nth(1);

  await seedJobHistory("Playwright Admin");
  await page.goto("/");

  await page.getByRole("button", { name: "Create user" }).click();
  await page.getByPlaceholder("Username").fill("playwright-admin");
  await page.getByPlaceholder("Display name").fill("Playwright Admin");
  await page.getByPlaceholder("Password").fill("playwright-pass");
  await expect(createUserSubmitButton).toBeVisible();
  await createUserSubmitButton.click();

  await expect(page.getByText("Playwright Admin")).toBeVisible();
  await expect(page.getByText("admin").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out user" })).toBeVisible();

  const authenticatedCookies = await page.context().cookies();
  const authenticatedCookieHeader = authenticatedCookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  const authenticatedJobsResponse = await request.get("/api/admin/jobs?limit=12", {
    headers: {
      cookie: authenticatedCookieHeader,
    },
  });

  expect(authenticatedJobsResponse.ok()).toBeTruthy();
  const authenticatedJobsPayload = await authenticatedJobsResponse.json();
  expect(authenticatedJobsPayload.jobs).toHaveLength(1);
  expect(authenticatedJobsPayload.jobs[0]).toMatchObject({
    id: "seeded-job-1",
    target: "phi3:mini",
    requestedBy: "Playwright Admin",
    status: "queued",
  });

  await expect(page.getByText("phi3:mini")).toBeVisible();
  await page.getByRole("button", { name: "Sign out user" }).click();

  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Auth disabled")).toBeVisible();
  await expect(pullModelButton).toBeDisabled();

  const unauthenticatedJobsResponse = await request.get("/api/admin/jobs?limit=12");
  expect(unauthenticatedJobsResponse.status()).toBe(401);

  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByPlaceholder("Username").fill("playwright-admin");
  await page.getByPlaceholder("Password").fill("playwright-pass");
  await expect(signInSubmitButton).toBeVisible();
  await signInSubmitButton.click();

  await expect(page.getByRole("button", { name: "Sign out user" })).toBeVisible();
  await page.getByLabel("Model name to pull").fill("phi3:mini");
  await expect(pullModelButton).toBeEnabled();
});