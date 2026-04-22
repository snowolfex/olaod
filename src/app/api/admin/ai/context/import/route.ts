import { requireAdminSession } from "@/lib/auth";
import { importKnowledgeFromFile, importKnowledgeFromUrl } from "@/lib/knowledge-import";
import type { AiProviderId } from "@/lib/ai-types";

export const dynamic = "force-dynamic";

function parseDelimitedList(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [];
  }

  return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean)));
}

function parseProviderIds(value: FormDataEntryValue | null) {
  return parseDelimitedList(value).filter((providerId): providerId is AiProviderId =>
    providerId === "ollama" || providerId === "anthropic" || providerId === "openai",
  );
}

export async function POST(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return Response.json({ error: "Knowledge import file is required." }, { status: 400 });
      }

      const entry = await importKnowledgeFromFile(file, {
        title: typeof formData.get("title") === "string" ? String(formData.get("title")) : undefined,
        source: typeof formData.get("source") === "string" ? String(formData.get("source")) : undefined,
        tags: parseDelimitedList(formData.get("tags")),
        providerIds: parseProviderIds(formData.get("providerIds")),
        modelIds: parseDelimitedList(formData.get("modelIds")),
      });

      return Response.json({ entry });
    }

    const payload = (await request.json()) as {
      modelIds?: string[];
      providerIds?: AiProviderId[];
      source?: string;
      tags?: string[];
      title?: string;
      url?: string;
    };

    const url = payload.url?.trim();
    if (!url) {
      return Response.json({ error: "Knowledge import URL is required." }, { status: 400 });
    }

    const entry = await importKnowledgeFromUrl(url, {
      title: payload.title,
      source: payload.source,
      tags: payload.tags,
      providerIds: payload.providerIds,
      modelIds: payload.modelIds,
    });

    return Response.json({ entry });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to import knowledge." }, { status: 400 });
  }
}