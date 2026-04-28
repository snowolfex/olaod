import { getDataStorePath, readJsonStore, updateJsonStore } from "@/lib/data-store";
import type { AiKnowledgeBase } from "@/lib/ai-types";

const STORE_PATH = getDataStorePath("ai-knowledge-bases.json");

type KnowledgeBaseInput = {
  id?: string;
  name: string;
  description?: string;
  entryIds?: string[];
};

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEntryIds(entryIds: string[] | undefined) {
  return Array.from(new Set((entryIds ?? []).map((entryId) => entryId.trim()).filter(Boolean)));
}

function normalizeKnowledgeBase(input: KnowledgeBaseInput, previous?: AiKnowledgeBase): AiKnowledgeBase {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Knowledge base name is required.");
  }

  return {
    id: previous?.id ?? input.id?.trim() ?? createId(),
    name,
    description: input.description?.trim() ?? previous?.description ?? "",
    entryIds: normalizeEntryIds(input.entryIds ?? previous?.entryIds),
    updatedAt: new Date().toISOString(),
  };
}

function sortKnowledgeBases(bases: AiKnowledgeBase[]) {
  return [...bases].sort((left, right) => left.name.localeCompare(right.name));
}

export async function listAiKnowledgeBases() {
  return sortKnowledgeBases(await readJsonStore<AiKnowledgeBase[]>(STORE_PATH, []));
}

export async function saveAiKnowledgeBase(input: KnowledgeBaseInput) {
  return updateJsonStore<AiKnowledgeBase[]>(STORE_PATH, [], (current) => {
    const next = [...current];
    const existingIndex = input.id ? next.findIndex((base) => base.id === input.id) : -1;
    const existing = existingIndex >= 0 ? next[existingIndex] : undefined;
    const knowledgeBase = normalizeKnowledgeBase(input, existing);
    const duplicateIndex = next.findIndex((base) =>
      base.id !== knowledgeBase.id && base.name.toLowerCase() === knowledgeBase.name.toLowerCase()
    );

    if (duplicateIndex >= 0) {
      throw new Error("Knowledge base names must be unique.");
    }

    if (existingIndex >= 0) {
      next[existingIndex] = knowledgeBase;
    } else {
      next.push(knowledgeBase);
    }

    return sortKnowledgeBases(next);
  });
}

export async function deleteAiKnowledgeBase(id: string) {
  const trimmedId = id.trim();

  if (!trimmedId) {
    throw new Error("Knowledge base id is required.");
  }

  const current = await readJsonStore<AiKnowledgeBase[]>(STORE_PATH, []);
  const next = current.filter((base) => base.id !== trimmedId);

  if (next.length === current.length) {
    return false;
  }

  await updateJsonStore<AiKnowledgeBase[]>(STORE_PATH, [], () => next);
  return true;
}

export async function getKnowledgeBaseEntryIds(ids: string[] | undefined) {
  const requestedIds = normalizeEntryIds(ids);

  if (requestedIds.length === 0) {
    return [];
  }

  const requestedIdSet = new Set(requestedIds);
  const bases = await listAiKnowledgeBases();
  return Array.from(new Set(
    bases
      .filter((base) => requestedIdSet.has(base.id))
      .flatMap((base) => base.entryIds),
  ));
}

export async function removeKnowledgeEntryFromBases(entryId: string) {
  const trimmedId = entryId.trim();

  if (!trimmedId) {
    return;
  }

  await updateJsonStore<AiKnowledgeBase[]>(STORE_PATH, [], (current) =>
    current.map((base) => ({
      ...base,
      entryIds: base.entryIds.filter((candidateId) => candidateId !== trimmedId),
    })),
  );
}