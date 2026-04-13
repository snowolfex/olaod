import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

type BrowserPage = Parameters<Parameters<typeof test>[1]>[0]["page"];
type ApiRequest = Parameters<Parameters<typeof test>[1]>[0]["request"];

type BackgroundPull = {
  id: string;
};

type JobRecord = {
  id: string;
  target: string;
  status: string;
  queuePosition?: number;
  progressEntries: Array<{
    message: string;
  }>;
};

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

async function listJobs(request: ApiRequest, cookieHeader: string) {
  const response = await request.get("/api/admin/jobs?limit=48", {
    headers: {
      cookie: cookieHeader,
    },
  });

  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    jobs: JobRecord[];
  };

  return payload.jobs;
}

async function getJob(request: ApiRequest, cookieHeader: string, jobId: string) {
  const response = await request.get(`/api/admin/jobs/${jobId}`, {
    headers: {
      cookie: cookieHeader,
    },
  });

  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    job: JobRecord;
  };

  return payload.job;
}

async function startBackgroundPull(page: BrowserPage, modelName: string): Promise<BackgroundPull> {
  const [id] = await startBackgroundPulls(page, [modelName]);

  return { id };
}

async function startBackgroundPulls(page: BrowserPage, modelNames: readonly string[]) {
  return page.evaluate((names) => {
    const windowWithPulls = window as Window & {
      __oloadPlaywrightPulls?: Record<string, { controller: AbortController; settled: Promise<void> }>;
    };
    const store = windowWithPulls.__oloadPlaywrightPulls ?? {};

    const ids = names.map((name) => {
      const pullId = crypto.randomUUID();
      const controller = new AbortController();

      store[pullId] = {
        controller,
        settled: fetch("/api/ollama/models/pull", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
          signal: controller.signal,
        })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(await response.text());
            }

            await response.text();
          })
          .catch(() => undefined),
      };

      return pullId;
    });

    windowWithPulls.__oloadPlaywrightPulls = store;
    return ids;
  }, [...modelNames]);
}

async function waitForBackgroundPull(page: BrowserPage, pull: BackgroundPull) {
  await page.evaluate(async (pullId) => {
    const store = (window as Window & {
      __oloadPlaywrightPulls?: Record<string, { settled: Promise<void> }>;
    }).__oloadPlaywrightPulls;

    await store?.[pullId]?.settled;
  }, pull.id);
}

test("covers jobs queue reorder, bulk queued cancel, and failed-pull retry flows", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  await resetPlaywrightData();

  const createUserSubmitButton = page.getByRole("button", { name: "Create user" }).nth(1);
  const holdTargets = [
    "playwright:hold-primary",
    "playwright:hold-secondary",
    "playwright:hold-tertiary",
  ] as const;
  const failedTarget = "playwright:fail-retry";

  await page.goto("/");
  await page.getByRole("button", { name: "Create user" }).first().click();
  await page.getByPlaceholder("Username").fill("playwright-jobs-admin");
  await page.getByPlaceholder("Display name").fill("Playwright Jobs Admin");
  await page.getByPlaceholder("Password").fill("playwright-pass");
  await createUserSubmitButton.click();

  await expect(page.getByRole("button", { name: "Sign out user" })).toBeVisible();

  const cookieHeader = await getCookieHeader(page);
  const runningPull = await startBackgroundPull(page, holdTargets[0]);

  await expect.poll(async () => {
    const jobs = await listJobs(request, cookieHeader);
    return jobs.filter((job) => job.target === holdTargets[0]).length;
  }, { timeout: 20_000 }).toBe(1);

  const queuedPullOne = await startBackgroundPull(page, holdTargets[1]);

  await expect.poll(async () => {
    const jobs = await listJobs(request, cookieHeader);
    return jobs.filter((job) => holdTargets.includes(job.target as (typeof holdTargets)[number])).length;
  }, { timeout: 20_000 }).toBe(2);

  const queuedPullTwo = await startBackgroundPull(page, holdTargets[2]);
  const queuedPulls = [queuedPullOne, queuedPullTwo];

  try {
    await expect.poll(async () => {
      const jobs = await listJobs(request, cookieHeader);
      const scopedJobs = jobs.filter((job) => holdTargets.includes(job.target as (typeof holdTargets)[number]));

      return JSON.stringify({
        total: scopedJobs.length,
        queuedPositions: scopedJobs
          .filter((job) => job.status === "queued" && typeof job.queuePosition === "number")
          .map((job) => job.queuePosition)
          .sort((left, right) => left - right),
      });
    }, { timeout: 20_000 }).toContain('"queuedPositions":[1,2]');

    await expect.poll(async () => {
      const jobs = await listJobs(request, cookieHeader);
      const scopedJobs = jobs.filter((job) => holdTargets.includes(job.target as (typeof holdTargets)[number]));

      return scopedJobs.length;
    }, { timeout: 20_000 }).toBe(3);

    const queuedJobsBeforeReorder = await listJobs(request, cookieHeader);
    const tertiaryJob = queuedJobsBeforeReorder.find((job) => holdTargets.includes(job.target as (typeof holdTargets)[number]) && job.queuePosition === 2);

    if (!tertiaryJob) {
      throw new Error("Expected a queued pull job in queue position 2.");
    }

    await page.getByRole("button", { name: "Refresh jobs" }).click();
    await expect(page.locator(`#job-row-${tertiaryJob.id}`)).toBeVisible();
    await page.locator(`#job-row-${tertiaryJob.id}`).getByRole("button", { name: "Move earlier" }).click();
    await expect(page.getByText(`Moved ${holdTargets[2]} earlier in the pull queue.`)).toBeVisible();

    await expect.poll(async () => {
      const job = await getJob(request, cookieHeader, tertiaryJob.id);
      return job.queuePosition ?? 0;
    }).toBe(1);

    await page.getByRole("button", { name: "Cancel queued pull jobs across all operators" }).click();
    await page.getByRole("button", { name: "Confirm queued pull jobs across all operators" }).click();
    await expect(page.getByText("Cancelled 2 queued pull jobs.")).toBeVisible();

    await expect.poll(async () => {
      const jobs = await listJobs(request, cookieHeader);
      const scopedJobs = jobs.filter((job) => holdTargets.includes(job.target as (typeof holdTargets)[number]));

      return scopedJobs.filter((job) => job.status === "cancelled").length;
    }).toBe(2);

    const failedPull = await startBackgroundPull(page, failedTarget);
    await waitForBackgroundPull(page, failedPull);

    await page.getByRole("button", { name: "Refresh jobs" }).click();

    await expect.poll(async () => {
      const jobs = await listJobs(request, cookieHeader);
      return jobs.some((job) => job.target === failedTarget && job.status === "failed");
    }).toBe(true);

    await page.getByRole("button", { name: failedTarget, exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry pull" })).toBeVisible();
    await page.getByRole("button", { name: "Retry pull" }).click();
    await expect(page.getByText(`Queued retry for ${failedTarget}.`)).toBeVisible();

    await expect.poll(async () => {
      const jobs = await listJobs(request, cookieHeader);
      return jobs.filter((job) => job.target === failedTarget).length;
    }).toBeGreaterThan(1);

    await expect.poll(async () => {
      const jobs = await listJobs(request, cookieHeader);
      return jobs.some(
        (job) => job.target === failedTarget && job.progressEntries[0]?.message === "Retry queued.",
      );
    }).toBe(true);

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
          type: "model.pull_reordered",
          summary: `Queued pull reprioritized: ${holdTargets[2]}`,
          details: "Queued pull moved up in the execution order.",
        }),
        expect.objectContaining({
          type: "model.pull_bulk_cancel",
          summary: "Bulk queued pull cancel: 2 jobs",
          details: expect.stringContaining("were cancelled from the bulk operator action."),
        }),
        expect.objectContaining({
          type: "model.pull_retried",
          summary: `Model pull retried: ${failedTarget}`,
          details: "A failed or cancelled pull job was queued again.",
        }),
      ]),
    );
  } finally {
    if (!page.isClosed()) {
      await waitForBackgroundPull(page, runningPull);
      await Promise.allSettled(queuedPulls.map((pull) => waitForBackgroundPull(page, pull)));
    }
    await resetPlaywrightData();
  }
});