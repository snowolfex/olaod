import { expect, test } from "@playwright/test";
import { getCookieHeader, registerAndAuthenticateLocalUser, resetPlaywrightData } from "./helpers/local-auth";

type ApiRequest = Parameters<Parameters<typeof test>[1]>[0]["request"];

type BackgroundPull = {
  settled: Promise<void>;
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

function startBackgroundPull(request: ApiRequest, cookieHeader: string, modelName: string): BackgroundPull {
  return startBackgroundPulls(request, cookieHeader, [modelName])[0];
}

function startBackgroundPulls(request: ApiRequest, cookieHeader: string, modelNames: readonly string[]) {
  return modelNames.map((name) => ({
    settled: request.post("/api/ollama/models/pull", {
      headers: {
        cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      data: {
        name,
      },
    })
      .then(async (response) => {
        if (!response.ok()) {
          throw new Error(await response.text());
        }

        await response.text();
      })
      .catch(() => undefined),
  }));
}

async function waitForBackgroundPull(pull: BackgroundPull) {
  await pull.settled;
}

test("covers jobs queue reorder, bulk queued cancel, and failed-pull retry flows", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  await resetPlaywrightData();

  const holdTargets = [
    "playwright:hold-primary",
    "playwright:hold-secondary",
    "playwright:hold-tertiary",
  ] as const;
  const failedTarget = "playwright:fail-retry";

  await registerAndAuthenticateLocalUser({
    displayName: "Playwright Jobs Admin",
    email: "playwright-jobs-admin@example.com",
    page,
    password: "playwright-pass",
    rememberSession: true,
    request,
  });

  await page.goto("/");
  await expect(page.getByLabel("Sign out")).toBeVisible();

  const cookieHeader = await getCookieHeader(page);
  const runningPull = startBackgroundPull(request, cookieHeader, holdTargets[0]);

  await expect.poll(async () => {
    const jobs = await listJobs(request, cookieHeader);
    return jobs.filter((job) => job.target === holdTargets[0]).length;
  }, { timeout: 20_000 }).toBe(1);

  const queuedPullOne = startBackgroundPull(request, cookieHeader, holdTargets[1]);

  await expect.poll(async () => {
    const jobs = await listJobs(request, cookieHeader);
    return jobs.filter((job) => holdTargets.includes(job.target as (typeof holdTargets)[number])).length;
  }, { timeout: 20_000 }).toBe(2);

  const queuedPullTwo = startBackgroundPull(request, cookieHeader, holdTargets[2]);
  const queuedPulls = [queuedPullOne, queuedPullTwo];

  try {
    await expect.poll(async () => {
      const jobs = await listJobs(request, cookieHeader);
      return jobs.filter(
        (job) => holdTargets.includes(job.target as (typeof holdTargets)[number])
          && job.status === "queued"
          && typeof job.queuePosition === "number",
      );
    }, { timeout: 20_000 }).toHaveLength(2);

    const queuedJobsBeforeReorder = (await listJobs(request, cookieHeader)).filter(
      (job) => holdTargets.includes(job.target as (typeof holdTargets)[number])
        && job.status === "queued"
        && typeof job.queuePosition === "number",
    );

    const tertiaryJob = [...queuedJobsBeforeReorder].sort(
      (left, right) => (right.queuePosition ?? 0) - (left.queuePosition ?? 0),
    )[0];

    if (!tertiaryJob) {
      throw new Error("Expected a queued pull job to be available for reorder coverage.");
    }

    const reorderResponse = await request.post(`/api/admin/jobs/${tertiaryJob.id}/reorder`, {
      headers: {
        cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      data: {
        direction: "up",
      },
    });
    expect(reorderResponse.ok()).toBeTruthy();

    await expect.poll(async () => {
      const job = await getJob(request, cookieHeader, tertiaryJob.id);
      return job.queuePosition ?? 0;
    }).toBeLessThan(tertiaryJob.queuePosition ?? Number.MAX_SAFE_INTEGER);

    const queuedJobsBeforeCancel = await listJobs(request, cookieHeader);
    const queuedScopedJobs = queuedJobsBeforeCancel.filter(
      (job) => holdTargets.includes(job.target as (typeof holdTargets)[number]) && job.status === "queued",
    );

    const bulkCancelResponse = await request.post("/api/admin/jobs/bulk", {
      headers: {
        cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      data: {
        action: "cancel-queued-pulls",
      },
    });
    expect(bulkCancelResponse.ok()).toBeTruthy();
    await expect.soft(bulkCancelResponse.json()).resolves.toMatchObject({
      cancelledCount: queuedScopedJobs.length,
    });

    await expect.poll(async () => {
      const jobs = await listJobs(request, cookieHeader);
      const scopedJobs = jobs.filter((job) => holdTargets.includes(job.target as (typeof holdTargets)[number]));

      return scopedJobs.filter((job) => job.status === "cancelled").length;
    }).toBe(queuedScopedJobs.length);

    const failedPull = startBackgroundPull(request, cookieHeader, failedTarget);
    await waitForBackgroundPull(failedPull);

    await expect.poll(async () => {
      const jobs = await listJobs(request, cookieHeader);
      return jobs.some((job) => job.target === failedTarget && job.status === "failed");
    }, { timeout: 20_000 }).toBe(true);

    const failedJobs = await listJobs(request, cookieHeader);
    const failedJob = failedJobs.find((job) => job.target === failedTarget && job.status === "failed");

    if (!failedJob) {
      throw new Error("Expected a failed pull job to appear after the forced failure.");
    }

    const retryResponse = await request.post(`/api/admin/jobs/${failedJob.id}/retry`, {
      headers: {
        cookie: cookieHeader,
      },
    });

    expect(retryResponse.ok()).toBeTruthy();

    const retryPayload = (await retryResponse.json()) as {
      jobId: string;
    };

    await expect.poll(async () => {
      const jobs = await listJobs(request, cookieHeader);
      return jobs.filter((job) => job.target === failedTarget).length;
    }, { timeout: 20_000 }).toBeGreaterThan(1);

    await expect.poll(async () => {
      const jobs = await listJobs(request, cookieHeader);
      const retryJob = jobs.find((job) => job.id === retryPayload.jobId);
      return retryJob?.progressEntries[0]?.message ?? null;
    }, { timeout: 20_000 }).toBe("Retry queued.");

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
          type: "model.pull_requested",
          summary: `Model pull requested: ${holdTargets[0]}`,
          details: "A privileged model pull request was started.",
        }),
        expect.objectContaining({
          type: "model.pull_requested",
          summary: `Model pull requested: ${failedTarget}`,
          details: "A privileged model pull request was started.",
        }),
        expect.objectContaining({
          type: "model.pull_failed",
          summary: `Model pull failed: ${failedTarget}`,
          details: "Playwright forced pull failure.",
        }),
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
    await Promise.allSettled([waitForBackgroundPull(runningPull), ...queuedPulls.map((pull) => waitForBackgroundPull(pull))]);
    await resetPlaywrightData();
  }
});