import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import { registerAndAuthenticateLocalUser, resetPlaywrightData } from "./helpers/local-auth";

function getPlaywrightDataDir() {
  return path.join(process.cwd(), ".playwright-data");
}

function getPlaywrightDataDirCandidates() {
  return [
    getPlaywrightDataDir(),
    path.join(process.cwd(), ".next", "standalone", ".playwright-data"),
  ];
}

async function seedKnowledgeEntries() {
  const now = new Date().toISOString();

  await Promise.all(getPlaywrightDataDirCandidates().map(async (dataDir) => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      path.join(dataDir, "ai-knowledge.json"),
      `${JSON.stringify([
      {
        id: "knowledge-baseline",
        title: "Dedup retrieval baseline",
        source: "playwright shared knowledge",
        tags: ["dedup", "retrieval", "validation"],
        providerIds: [],
        modelIds: [],
        updatedAt: now,
        content:
          "Retrieval dedup validation baseline. This note explains that overlapping entries should not crowd out more diverse shared knowledge results in the final ranked set.",
      },
      {
        id: "knowledge-follow-up",
        title: "Dedup retrieval follow-up",
        source: "playwright shared knowledge",
        tags: ["dedup", "retrieval"],
        providerIds: [],
        modelIds: [],
        updatedAt: now,
        content:
          "Retrieval dedup validation baseline. This note explains that overlapping entries should not crowd out more diverse shared knowledge results in the final ranked set with slightly different wording.",
      },
      {
        id: "knowledge-contrast",
        title: "Dedup retrieval contrast",
        source: "playwright shared knowledge",
        tags: ["dedup", "retrieval", "validation", "contrast"],
        providerIds: [],
        modelIds: [],
        updatedAt: now,
        content:
          "Retrieval validation contrast note. Use this different angle to confirm the ranked set keeps a more diverse shared knowledge result available when the top two notes overlap heavily.",
      },
      ], null, 2)}\n`,
      "utf8",
    );
  }));
}

async function seedCitationKnowledgeEntries() {
  const now = new Date().toISOString();

  await Promise.all(getPlaywrightDataDirCandidates().map(async (dataDir) => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      path.join(dataDir, "ai-knowledge.json"),
      `${JSON.stringify([
      {
        id: "citation-baseline",
        title: "Citation dedupe baseline",
        source: "playwright citation dedupe",
        tags: ["playwright", "citation", "dedupe"],
        providerIds: [],
        modelIds: [],
        updatedAt: now,
        content:
          "playwright reply citation dedupe baseline. Use this note to verify that overlapping shared knowledge sources do not render repeated source cards or duplicate footer entries.",
      },
      {
        id: "citation-follow-up",
        title: "Citation dedupe follow-up",
        source: "playwright citation dedupe",
        tags: ["playwright", "citation", "dedupe"],
        providerIds: [],
        modelIds: [],
        updatedAt: now,
        content:
          "playwright reply citation dedupe baseline. Use this note to verify that overlapping shared knowledge sources do not render repeated source cards or duplicate footer entries with slightly different wording.",
      },
      ], null, 2)}\n`,
      "utf8",
    );
  }));
}

async function seedOverlapEditKnowledgeEntry() {
  const now = new Date().toISOString();

  await Promise.all(getPlaywrightDataDirCandidates().map(async (dataDir) => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      path.join(dataDir, "ai-knowledge.json"),
      `${JSON.stringify([
      {
        id: "overlap-edit-baseline",
        title: "Overlap edit baseline",
        source: "playwright overlap edit",
        tags: ["overlap", "edit"],
        providerIds: [],
        modelIds: [],
        updatedAt: now,
        content:
          "Use this temporary note to validate the overlap warning edit action. The existing note should open directly in the editor when selected from the warning card.",
      },
      ], null, 2)}\n`,
      "utf8",
    );
  }));
}

async function getLatestVerificationCode(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  for (const dataDir of getPlaywrightDataDirCandidates()) {
    try {
      const raw = await readFile(path.join(dataDir, "email-outbox.json"), "utf8");
      const outbox = JSON.parse(raw) as Array<{ code: string; email: string }>;
      const match = outbox.find((entry) => entry.email === normalizedEmail);

      if (match) {
        return match.code;
      }
    } catch {
      // Try the next runtime data directory.
    }
  }

  throw new Error(`No verification code found for ${normalizedEmail}.`);
}

async function registerAdmin(request: Parameters<Parameters<typeof test>[1]>[0]["request"]) {
  const registerResponse = await request.post("/api/users/register", {
    data: {
      email: "playwright-knowledge-admin@example.com",
      displayName: "Playwright Knowledge Admin",
      password: "playwright-pass",
      rememberSession: true,
    },
  });

  expect(registerResponse.ok()).toBeTruthy();

  const verifyResponse = await request.post("/api/users/verify", {
    data: {
      code: await getLatestVerificationCode("playwright-knowledge-admin@example.com"),
      email: "playwright-knowledge-admin@example.com",
    },
  });
  expect(verifyResponse.ok()).toBeTruthy();

  const cookieHeader = verifyResponse.headers()["set-cookie"]?.split(";")[0] ?? "";
  expect(cookieHeader).toContain("=");

  return cookieHeader;
}

test("reranks overlapping shared knowledge behind more diverse matches", async ({ request }) => {
  await resetPlaywrightData();
  await seedKnowledgeEntries();
  const cookieHeader = await registerAdmin(request);

  const debugResponse = await request.get("/api/admin/ai/context/debug?q=dedup%20retrieval%20validation&limit=3", {
    headers: {
      cookie: cookieHeader,
    },
  });
  expect(debugResponse.ok()).toBeTruthy();

  const debugPayload = (await debugResponse.json()) as {
    results: Array<{
      title: string;
      score: number;
      breakdown: {
        duplicatePenalty: number;
        duplicateReferenceScore: number;
        duplicateReferenceTitle: string | null;
      };
    }>;
  };

  expect(debugPayload.results.map((entry) => entry.title)).toEqual([
    "Dedup retrieval baseline",
    "Dedup retrieval contrast",
    "Dedup retrieval follow-up",
  ]);

  const followUpEntry = debugPayload.results[2];
  expect(followUpEntry?.breakdown.duplicatePenalty).toBeGreaterThan(0);
  expect(followUpEntry?.breakdown.duplicateReferenceTitle).toBe("Dedup retrieval baseline");
  expect(followUpEntry?.breakdown.duplicateReferenceScore).toBeGreaterThan(0);

  const previewResponse = await request.get("/api/ai/context/search?q=dedup%20retrieval%20validation&limit=3");
  expect(previewResponse.ok()).toBeTruthy();

  const previewPayload = (await previewResponse.json()) as {
    results: Array<{ title: string }>;
  };

  expect(previewPayload.results.map((entry) => entry.title)).toEqual([
    "Dedup retrieval baseline",
    "Dedup retrieval contrast",
    "Dedup retrieval follow-up",
  ]);
});

test("deduplicates overlapping shared-knowledge citations in grounded chat responses", async ({ request }) => {
  await resetPlaywrightData();
  await seedCitationKnowledgeEntries();

  const response = await request.post("/api/ai/chat", {
    data: {
      providerId: "ollama",
      model: "deepseek-r1:1.5b",
      messages: [
        {
          role: "user",
          content: "playwright:reply citation dedupe baseline",
        },
      ],
      temperature: 0,
      systemPrompt: "Reply with the deterministic Playwright test response.",
      useKnowledge: true,
    },
  });

  expect(response.ok()).toBeTruthy();

  const citationsHeader = response.headers()["x-oload-knowledge-sources"];
  expect(citationsHeader).toBeTruthy();

  const citations = JSON.parse(citationsHeader) as Array<{ title: string; source: string }>;
  expect(citations).toHaveLength(1);
  expect(citations[0]).toMatchObject({
    title: "Citation dedupe baseline",
    source: "playwright citation dedupe",
  });

  const reply = await response.text();
  expect(reply).toContain("Playwright deterministic reply.");
  expect(reply).toContain("Sources: Citation dedupe baseline");
  expect(reply).not.toContain("Sources: Citation dedupe baseline; Citation dedupe follow-up");
});

test("opens the existing knowledge entry from the overlap warning card", async ({ page, request }) => {
  await resetPlaywrightData();
  await seedOverlapEditKnowledgeEntry();

  await registerAndAuthenticateLocalUser({
    displayName: "Playwright Overlap Edit Admin",
    email: "playwright-overlap-edit-admin@example.com",
    page,
    password: "playwright-pass",
    rememberSession: true,
    request,
  });

  await page.goto("/");
  await expect(page.getByLabel("Sign out")).toBeVisible();
  await page.getByRole("button", { name: "Admin" }).click();
  await page.getByRole("button", { name: "Hide command deck" }).click();

  await expect(page.getByRole("button", { name: "Refresh knowledge" })).toBeVisible();

  await page.getByPlaceholder("Entry title").fill("Overlap edit follow-up");
  await page.getByPlaceholder("Tags, comma-separated").fill("overlap, edit");
  await page.getByPlaceholder("Shared context content").fill(
    "Use this temporary note to validate the overlap warning edit action. The existing note should open directly in the editor when selected from the warning card with similar wording.",
  );

  const editExistingButton = page.getByRole("button", { name: "Edit existing note" });
  await expect(editExistingButton).toBeVisible();
  await editExistingButton.click();

  await expect(page.getByText("Edit knowledge entry")).toBeVisible();
  await expect(page.getByPlaceholder("Entry title")).toHaveValue("Overlap edit baseline");
  await expect(page.getByPlaceholder("Source label")).toHaveValue("playwright overlap edit");
  await expect(page.getByPlaceholder("Tags, comma-separated")).toHaveValue("overlap, edit");
  await expect(page.getByPlaceholder("Shared context content")).toHaveValue(
    "Use this temporary note to validate the overlap warning edit action. The existing note should open directly in the editor when selected from the warning card.",
  );
  await expect(page.getByRole("button", { name: "Editing this note" })).toBeDisabled();
});