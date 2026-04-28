import { getDataStorePath, readJsonStore, updateJsonStore, writeJsonStore } from "@/lib/data-store";
import { removeKnowledgeEntryFromBases } from "@/lib/ai-knowledge-bases";
import { requestOllamaEmbeddings } from "@/lib/ollama";
import type {
  AiKnowledgeDebugResult,
  AiKnowledgeEntry,
  AiKnowledgeOverlapBreakdown,
  AiKnowledgeOverlapResult,
  AiKnowledgeScoreBreakdown,
  AiKnowledgeSearchResult,
  AiProviderId,
} from "@/lib/ai-types";

const STORE_PATH = getDataStorePath("ai-knowledge.json");
const VECTOR_STORE_PATH = getDataStorePath("ai-knowledge-vectors.json");
const KNOWLEDGE_CHUNK_TARGET_LENGTH = 700;
const DEFAULT_KNOWLEDGE_EMBED_MODEL = process.env.OLOAD_KNOWLEDGE_EMBED_MODEL?.trim() || "nomic-embed-text";
const MIN_VECTOR_ONLY_SIMILARITY = 0.63;

type KnowledgeVectorRecord = {
  key: string;
  entryId: string;
  updatedAt: string;
  chunkIndex: number;
  chunk: string;
  embedding: number[];
};

type KnowledgeVectorStore = {
  embeddingModel: string;
  records: KnowledgeVectorRecord[];
};

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function uniqueTokens(value: string) {
  return Array.from(new Set(tokenize(value)));
}

function normalizeProviderIds(providerIds: AiProviderId[] | undefined) {
  const allowedProviderIds = new Set<AiProviderId>(["ollama", "anthropic", "openai"]);
  return Array.from(new Set((providerIds ?? []).filter((providerId) => allowedProviderIds.has(providerId))));
}

function normalizeModelIds(modelIds: string[] | undefined) {
  return Array.from(new Set((modelIds ?? []).map((modelId) => modelId.trim()).filter(Boolean)));
}

function normalizeTags(tags: string[] | undefined) {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)));
}

function normalizeKnowledgeEntry(entry: AiKnowledgeEntry): AiKnowledgeEntry {
  return {
    ...entry,
    providerIds: normalizeProviderIds(entry.providerIds),
    modelIds: normalizeModelIds(entry.modelIds),
    tags: normalizeTags(entry.tags),
  };
}

function filterKnowledgeEntries(
  entries: AiKnowledgeEntry[],
  options?: { providerId?: AiProviderId; modelId?: string; entryIds?: string[] },
) {
  const allowedEntryIds = options?.entryIds && options.entryIds.length > 0
    ? new Set(options.entryIds)
    : null;

  return entries.filter((entry) => {
    if (allowedEntryIds && !allowedEntryIds.has(entry.id)) {
      return false;
    }

    if (!options?.providerId || entry.providerIds.length === 0) {
      // fall through to model filtering below
    } else if (!entry.providerIds.includes(options.providerId)) {
      return false;
    }

    if (!options?.modelId || entry.modelIds.length === 0) {
      return true;
    }

    return entry.modelIds.includes(options.modelId);
  });
}

function splitOversizedParagraph(paragraph: string) {
  const sentences = paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return [paragraph.trim()];
  }

  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if (!currentChunk) {
      currentChunk = sentence;
      continue;
    }

    if (`${currentChunk} ${sentence}`.length <= KNOWLEDGE_CHUNK_TARGET_LENGTH) {
      currentChunk = `${currentChunk} ${sentence}`;
      continue;
    }

    chunks.push(currentChunk);
    currentChunk = sentence;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildKnowledgeChunks(content: string) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [content.trim()].filter(Boolean);
  }

  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    const paragraphUnits = paragraph.length > KNOWLEDGE_CHUNK_TARGET_LENGTH
      ? splitOversizedParagraph(paragraph)
      : [paragraph];

    for (const unit of paragraphUnits) {
      if (!currentChunk) {
        currentChunk = unit;
        continue;
      }

      if (`${currentChunk}\n\n${unit}`.length <= KNOWLEDGE_CHUNK_TARGET_LENGTH) {
        currentChunk = `${currentChunk}\n\n${unit}`;
        continue;
      }

      chunks.push(currentChunk);
      currentChunk = unit;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function scoreKnowledgeText(value: string, tokens: string[], weight: number) {
  const normalizedValue = value.toLowerCase();
  return tokens.reduce((total, token) => total + (normalizedValue.includes(token) ? weight : 0), 0);
}

function buildKnowledgeScoreBreakdown(input: {
  title: string;
  source: string;
  tags: string[];
  chunk: string;
  tokens: string[];
  normalizedQuery: string;
}): AiKnowledgeScoreBreakdown {
  const combinedText = [input.title, input.source, input.tags.join(" "), input.chunk]
    .join(" ")
    .toLowerCase();
  const exactPhraseBonus = combinedText.includes(input.normalizedQuery) ? 8 : 0;
  const allTokenBonus = input.tokens.every((token) => combinedText.includes(token)) ? 5 : 0;
  const normalizedTags = new Set(input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  const matchedTags = input.tokens.filter((token) => normalizedTags.has(token));
  const exactTagBonus = matchedTags.length * 4;
  const titleScore = scoreKnowledgeText(input.title, input.tokens, 4);
  const tagsScore = scoreKnowledgeText(input.tags.join(" "), input.tokens, 3);
  const sourceScore = scoreKnowledgeText(input.source, input.tokens, 2);
  const chunkScore = scoreKnowledgeText(input.chunk, input.tokens, 1);
  const lexicalScoreTotal = exactPhraseBonus + allTokenBonus + exactTagBonus + titleScore + tagsScore + sourceScore + chunkScore;
  const matchedTokens = input.tokens.filter((token) => combinedText.includes(token));

  return {
    exactPhraseBonus,
    allTokenBonus,
    exactTagBonus,
    titleScore,
    tagsScore,
    sourceScore,
    chunkScore,
    lexicalScoreTotal,
    vectorScore: 0,
    vectorSimilarity: null,
    vectorAvailable: false,
    vectorModel: null,
    hybridScore: lexicalScoreTotal,
    scoringMode: "lexical",
    duplicatePenalty: 0,
    duplicateReferenceTitle: null,
    duplicateReferenceScore: 0,
    matchedTokens,
    matchedTags,
  };
}

function normalizeEmbeddingModelName(value: string | undefined) {
  return value?.trim() || DEFAULT_KNOWLEDGE_EMBED_MODEL;
}

function createEmptyVectorStore(embeddingModel: string): KnowledgeVectorStore {
  return {
    embeddingModel,
    records: [],
  };
}

function buildKnowledgeChunkKey(entry: AiKnowledgeEntry, chunkIndex: number) {
  return `${entry.id}:${entry.updatedAt}:${chunkIndex}`;
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return null;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return null;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function scoreVectorSimilarity(similarity: number | null) {
  if (similarity === null) {
    return 0;
  }

  const normalized = Math.max(0, Math.min(1, (similarity - 0.55) / 0.25));
  return Math.round(normalized * 12);
}

function applyVectorSignals(
  breakdown: AiKnowledgeScoreBreakdown,
  vectorSimilarity: number | null,
  vectorModel: string | null,
): AiKnowledgeScoreBreakdown {
  const vectorScore = scoreVectorSimilarity(vectorSimilarity);
  return {
    ...breakdown,
    vectorScore,
    vectorSimilarity,
    vectorAvailable: vectorSimilarity !== null,
    vectorModel,
    hybridScore: breakdown.lexicalScoreTotal + vectorScore,
    scoringMode: vectorSimilarity !== null ? "hybrid" : "lexical",
  };
}

async function loadKnowledgeVectorStore(embeddingModel: string) {
  const current = await readJsonStore<KnowledgeVectorStore>(
    VECTOR_STORE_PATH,
    createEmptyVectorStore(embeddingModel),
  );

  if (current.embeddingModel !== embeddingModel) {
    return createEmptyVectorStore(embeddingModel);
  }

  return current;
}

async function removeKnowledgeVectorsForEntryIds(entryIds: string[]) {
  if (entryIds.length === 0) {
    return;
  }

  const entryIdSet = new Set(entryIds);
  await updateJsonStore<KnowledgeVectorStore>(
    VECTOR_STORE_PATH,
    createEmptyVectorStore(normalizeEmbeddingModelName(undefined)),
    (current) => ({
      embeddingModel: current.embeddingModel,
      records: current.records.filter((record) => !entryIdSet.has(record.entryId)),
    }),
  );
}

async function ensureKnowledgeVectorIndex(entries: AiKnowledgeEntry[], embeddingModel: string) {
  const currentStore = await loadKnowledgeVectorStore(embeddingModel);
  const currentRecordMap = new Map(currentStore.records.map((record) => [record.key, record]));
  const desiredKeys = new Set<string>();
  const pendingInputs: string[] = [];
  const pendingMetadata: Array<{ key: string; entryId: string; updatedAt: string; chunkIndex: number; chunk: string }> = [];

  for (const entry of entries) {
    const chunks = buildKnowledgeChunks(entry.content);
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const key = buildKnowledgeChunkKey(entry, chunkIndex);
      desiredKeys.add(key);
      if (!currentRecordMap.has(key)) {
        pendingInputs.push(chunk);
        pendingMetadata.push({
          key,
          entryId: entry.id,
          updatedAt: entry.updatedAt,
          chunkIndex,
          chunk,
        });
      }
    }
  }

  const nextRecords = currentStore.records.filter((record) => desiredKeys.has(record.key));

  if (pendingInputs.length === 0) {
    return nextRecords;
  }

  const embeddings = await requestOllamaEmbeddings(pendingInputs, embeddingModel);
  for (const [index, metadata] of pendingMetadata.entries()) {
    const embedding = embeddings[index];
    if (!Array.isArray(embedding) || embedding.length === 0) {
      continue;
    }

    nextRecords.push({
      ...metadata,
      embedding,
    });
  }

  await writeJsonStore(VECTOR_STORE_PATH, {
    embeddingModel,
    records: nextRecords,
  } satisfies KnowledgeVectorStore, createEmptyVectorStore(embeddingModel));

  return nextRecords;
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function intersectValues<T extends string>(left: T[], right: T[]) {
  const rightValues = new Set(right);
  return left.filter((value) => rightValues.has(value));
}

function haveScopeOverlap(left: string[], right: string[]) {
  return left.length === 0 || right.length === 0 || intersectValues(left, right).length > 0;
}

function classifyScopeOverlap(left: string[], right: string[]): AiKnowledgeOverlapBreakdown["scopeOverlap"] {
  if (left.length === 0 || right.length === 0) {
    return "global";
  }

  if (left.length === right.length && left.every((value) => right.includes(value))) {
    return "exact";
  }

  return "partial";
}

function calculateTokenOverlap(leftText: string, rightText: string) {
  const leftTokens = uniqueTokens(leftText);
  const rightTokens = uniqueTokens(rightText);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const sharedCount = intersectValues(leftTokens, rightTokens).length;
  return sharedCount / Math.min(leftTokens.length, rightTokens.length);
}

function calculateContentSimilarity(leftContent: string, rightContent: string) {
  const leftChunks = buildKnowledgeChunks(leftContent);
  const rightChunks = buildKnowledgeChunks(rightContent);
  let bestSimilarity = calculateTokenOverlap(leftContent, rightContent);

  for (const leftChunk of leftChunks) {
    for (const rightChunk of rightChunks) {
      bestSimilarity = Math.max(bestSimilarity, calculateTokenOverlap(leftChunk, rightChunk));
    }
  }

  return bestSimilarity;
}

function buildKnowledgeOverlapBreakdown(input: {
  candidate: AiKnowledgeEntry;
  draft: Pick<AiKnowledgeEntry, "content" | "modelIds" | "providerIds" | "tags" | "title">;
}): AiKnowledgeOverlapBreakdown {
  const draftTitle = input.draft.title.trim().toLowerCase();
  const candidateTitle = input.candidate.title.trim().toLowerCase();
  const draftContent = input.draft.content.trim().toLowerCase();
  const candidateContent = input.candidate.content.trim().toLowerCase();
  const draftTags = normalizeTags(input.draft.tags).map((tag) => tag.toLowerCase());
  const candidateTags = normalizeTags(input.candidate.tags).map((tag) => tag.toLowerCase());
  const sharedTags = intersectValues(draftTags, candidateTags);
  const sharedProviders = intersectValues(input.draft.providerIds, input.candidate.providerIds);
  const sharedModels = intersectValues(input.draft.modelIds, input.candidate.modelIds);

  return {
    scopeOverlap: classifyScopeOverlap(input.draft.providerIds, input.candidate.providerIds) === "exact"
      && classifyScopeOverlap(input.draft.modelIds, input.candidate.modelIds) === "exact"
      ? "exact"
      : (input.draft.providerIds.length === 0 || input.candidate.providerIds.length === 0 || input.draft.modelIds.length === 0 || input.candidate.modelIds.length === 0)
        ? "global"
        : "partial",
    titleSimilarity: calculateTokenOverlap(input.draft.title, input.candidate.title),
    contentSimilarity: calculateContentSimilarity(input.draft.content, input.candidate.content),
    sharedTagCount: sharedTags.length,
    sharedProviderCount: sharedProviders.length,
    sharedModelCount: sharedModels.length,
    exactTitleMatch: Boolean(draftTitle) && draftTitle === candidateTitle,
    exactContentMatch: Boolean(draftContent) && draftContent === candidateContent,
    sharedTags,
    sharedProviders,
    sharedModels,
  };
}

function scoreKnowledgeOverlap(breakdown: AiKnowledgeOverlapBreakdown) {
  const scopeBonus = breakdown.scopeOverlap === "exact" ? 8 : breakdown.scopeOverlap === "global" ? 3 : 5;

  return (breakdown.exactTitleMatch ? 40 : 0)
    + (breakdown.exactContentMatch ? 45 : 0)
    + Math.round(breakdown.titleSimilarity * 30)
    + Math.round(breakdown.contentSimilarity * 40)
    + (breakdown.sharedTagCount * 6)
    + (breakdown.sharedProviderCount * 2)
    + (breakdown.sharedModelCount * 3)
    + scopeBonus;
}

function isMeaningfulOverlap(result: AiKnowledgeOverlapResult) {
  return result.breakdown.exactTitleMatch
    || result.breakdown.exactContentMatch
    || result.breakdown.titleSimilarity >= 0.5
    || result.breakdown.contentSimilarity >= 0.45
    || result.breakdown.sharedTagCount >= 2
    || result.overlapScore >= 24;
}

function buildKnowledgeEntryOverlap(left: AiKnowledgeEntry, right: AiKnowledgeEntry) {
  const breakdown = buildKnowledgeOverlapBreakdown({
    candidate: left,
    draft: {
      title: right.title,
      content: right.content,
      tags: right.tags,
      providerIds: right.providerIds,
      modelIds: right.modelIds,
    },
  });

  return {
    breakdown,
    overlapScore: scoreKnowledgeOverlap(breakdown),
  };
}

function calculateDuplicatePenalty(candidate: AiKnowledgeEntry, selected: AiKnowledgeEntry[]) {
  const strongestOverlap = selected
    .map((entry) => ({
      entry,
      ...buildKnowledgeEntryOverlap(candidate, entry),
    }))
    .sort((left, right) => right.overlapScore - left.overlapScore)[0];

  if (!strongestOverlap) {
    return {
      duplicatePenalty: 0,
      duplicateReferenceTitle: null,
      duplicateReferenceScore: 0,
    };
  }

  const { breakdown, entry, overlapScore } = strongestOverlap;
  let duplicatePenalty = 0;

  if (breakdown.exactContentMatch) {
    duplicatePenalty = 18;
  } else if (breakdown.exactTitleMatch) {
    duplicatePenalty = 14;
  } else if (breakdown.contentSimilarity >= 0.9) {
    duplicatePenalty = 12;
  } else if (breakdown.contentSimilarity >= 0.75 || breakdown.titleSimilarity >= 0.8) {
    duplicatePenalty = 8;
  } else if (overlapScore >= 45) {
    duplicatePenalty = 6;
  }

  return {
    duplicatePenalty,
    duplicateReferenceTitle: duplicatePenalty > 0 ? entry.title : null,
    duplicateReferenceScore: duplicatePenalty > 0 ? overlapScore : 0,
  };
}

function diversifyKnowledgeResults(results: AiKnowledgeDebugResult[], limit: number) {
  const remaining = [...results].sort((left, right) => right.score - left.score || right.updatedAt.localeCompare(left.updatedAt));
  const selected: AiKnowledgeDebugResult[] = [];

  while (remaining.length > 0 && selected.length < limit) {
    const rankedCandidates = remaining
      .map((entry) => {
        const duplicateSignals = calculateDuplicatePenalty(entry, selected);
        return {
          entry: {
            ...entry,
            score: Math.max(0, entry.score - duplicateSignals.duplicatePenalty),
            breakdown: {
              ...entry.breakdown,
              ...duplicateSignals,
            },
          },
          baseScore: entry.score,
        };
      })
      .sort((left, right) => right.entry.score - left.entry.score || right.baseScore - left.baseScore || right.entry.updatedAt.localeCompare(left.entry.updatedAt));

    const winner = rankedCandidates[0]?.entry;

    if (!winner || winner.score <= 0) {
      break;
    }

    selected.push(winner);
    const winnerIndex = remaining.findIndex((entry) => entry.id === winner.id);

    if (winnerIndex >= 0) {
      remaining.splice(winnerIndex, 1);
    } else {
      break;
    }
  }

  return selected;
}

export async function listAiKnowledge() {
  const entries = await readJsonStore<Array<AiKnowledgeEntry & { providerIds?: AiProviderId[]; modelIds?: string[] }>>(STORE_PATH, []);
  return entries.map((entry) => normalizeKnowledgeEntry({
    ...entry,
    providerIds: entry.providerIds ?? [],
    modelIds: entry.modelIds ?? [],
    tags: entry.tags ?? [],
  }));
}

export async function saveAiKnowledgeEntry(input: {
  id?: string;
  title: string;
  content: string;
  source?: string;
  tags?: string[];
  providerIds?: AiProviderId[];
  modelIds?: string[];
}) {
  const title = input.title.trim();
  const content = input.content.trim();

  if (!title || !content) {
    throw new Error("Knowledge title and content are required.");
  }

  const nextEntry: AiKnowledgeEntry = {
    id: input.id?.trim() || createId(),
    title,
    content,
    source: input.source?.trim() || "manual",
    tags: (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
    providerIds: normalizeProviderIds(input.providerIds),
    modelIds: normalizeModelIds(input.modelIds),
    updatedAt: new Date().toISOString(),
  };

  const entries = await updateJsonStore<AiKnowledgeEntry[]>(STORE_PATH, [], (current) => {
    const next = current.filter((entry) => entry.id !== nextEntry.id);
    return [nextEntry, ...next];
  });

  await removeKnowledgeVectorsForEntryIds([nextEntry.id]);

  return entries.find((entry) => entry.id === nextEntry.id) ?? nextEntry;
}

export async function deleteAiKnowledgeEntry(id: string) {
  await updateJsonStore<AiKnowledgeEntry[]>(STORE_PATH, [], (current) =>
    current.filter((entry) => entry.id !== id),
  );
  await removeKnowledgeVectorsForEntryIds([id]);
  await removeKnowledgeEntryFromBases(id);
}

export async function findAiKnowledgeOverlaps(input: {
  content: string;
  id?: string;
  limit?: number;
  modelIds?: string[];
  providerIds?: AiProviderId[];
  tags?: string[];
  title: string;
}) {
  const draft: Pick<AiKnowledgeEntry, "content" | "modelIds" | "providerIds" | "tags" | "title"> = {
    title: input.title.trim(),
    content: input.content.trim(),
    tags: normalizeTags(input.tags),
    providerIds: normalizeProviderIds(input.providerIds),
    modelIds: normalizeModelIds(input.modelIds),
  };

  if (!draft.title && !draft.content && draft.tags.length === 0) {
    return [];
  }

  const entries = await listAiKnowledge();

  return entries
    .filter((entry) => entry.id !== input.id?.trim())
    .filter((entry) => haveScopeOverlap(draft.providerIds, entry.providerIds) && haveScopeOverlap(draft.modelIds, entry.modelIds))
    .map((entry) => {
      const breakdown = buildKnowledgeOverlapBreakdown({ candidate: entry, draft });
      return {
        ...entry,
        breakdown,
        overlapScore: scoreKnowledgeOverlap(breakdown),
      } satisfies AiKnowledgeOverlapResult;
    })
    .filter(isMeaningfulOverlap)
    .sort((left, right) => right.overlapScore - left.overlapScore || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, input.limit ?? 3);
}

export async function searchAiKnowledge(
  query: string,
  limit = 4,
  options?: { providerId?: AiProviderId; modelId?: string; entryIds?: string[]; additionalEntries?: AiKnowledgeEntry[] },
): Promise<AiKnowledgeSearchResult[]> {
  const results = await debugAiKnowledgeSearch(query, limit, options);
  return results.map((entry) => ({
    id: entry.id,
    title: entry.title,
    content: entry.content,
    source: entry.source,
    tags: entry.tags,
    providerIds: entry.providerIds,
    modelIds: entry.modelIds,
    updatedAt: entry.updatedAt,
    score: entry.score,
  }));
}

export async function debugAiKnowledgeSearch(
  query: string,
  limit = 4,
  options?: { providerId?: AiProviderId; modelId?: string; entryIds?: string[]; additionalEntries?: AiKnowledgeEntry[] },
): Promise<AiKnowledgeDebugResult[]> {
  const tokens = tokenize(query);
  const normalizedQuery = query.trim().toLowerCase();

  if (tokens.length === 0 || !normalizedQuery) {
    return [];
  }

  const persistentEntries = filterKnowledgeEntries(await listAiKnowledge(), options);
  const additionalEntries = filterKnowledgeEntries(
    (options?.additionalEntries ?? []).map((entry) => normalizeKnowledgeEntry(entry)),
    options,
  );
  const entries = [...persistentEntries, ...additionalEntries];

  const embeddingModel = normalizeEmbeddingModelName(process.env.OLOAD_KNOWLEDGE_EMBED_MODEL);
  let queryEmbedding: number[] | null = null;
  let vectorRecordMap = new Map<string, KnowledgeVectorRecord>();
  let vectorAvailable = false;

  try {
    if (entries.length > 0) {
      const [embeddedQuery] = await requestOllamaEmbeddings([query], embeddingModel);
      if (Array.isArray(embeddedQuery) && embeddedQuery.length > 0) {
        queryEmbedding = embeddedQuery;
        const vectorRecords = await ensureKnowledgeVectorIndex(entries, embeddingModel);
        vectorRecordMap = new Map(vectorRecords.map((record) => [record.key, record]));
        vectorAvailable = true;
      }
    }
  } catch {
    queryEmbedding = null;
    vectorRecordMap = new Map<string, KnowledgeVectorRecord>();
    vectorAvailable = false;
  }

  const scoredEntries = entries
    .map((entry) => {
      const bestChunk = buildKnowledgeChunks(entry.content)
        .map((chunk, chunkIndex) => {
          const lexicalBreakdown = buildKnowledgeScoreBreakdown({
            title: entry.title,
            source: entry.source,
            tags: entry.tags,
            chunk,
            tokens,
            normalizedQuery,
          });
          const vectorRecord = vectorRecordMap.get(buildKnowledgeChunkKey(entry, chunkIndex));
          const vectorSimilarity = queryEmbedding && vectorRecord
            ? cosineSimilarity(queryEmbedding, vectorRecord.embedding)
            : null;
          const breakdown = applyVectorSignals(
            lexicalBreakdown,
            vectorSimilarity,
            vectorAvailable ? embeddingModel : null,
          );
          return {
            chunk,
            breakdown,
            score: breakdown.hybridScore,
          };
        })
        .sort((left, right) => right.score - left.score || right.chunk.length - left.chunk.length)[0];

      const score = bestChunk?.score ?? 0;
      const vectorSimilarity = bestChunk?.breakdown.vectorSimilarity ?? null;
      const shouldInclude = score > 0 && (
        (bestChunk?.breakdown.lexicalScoreTotal ?? 0) > 0
        || vectorSimilarity === null
        || vectorSimilarity >= MIN_VECTOR_ONLY_SIMILARITY
      );

      return {
        ...entry,
        content: bestChunk?.chunk ?? entry.content,
        breakdown: bestChunk?.breakdown ?? applyVectorSignals(
          buildKnowledgeScoreBreakdown({
            title: entry.title,
            source: entry.source,
            tags: entry.tags,
            chunk: entry.content,
            tokens,
            normalizedQuery,
          }),
          null,
          null,
        ),
        score,
        shouldInclude,
      };
    })
    .filter((entry) => entry.shouldInclude)
    .sort((left, right) => right.score - left.score || right.updatedAt.localeCompare(left.updatedAt));

  return diversifyKnowledgeResults(scoredEntries.map((entry) => {
    const nextEntry = { ...entry };
    delete nextEntry.shouldInclude;
    return nextEntry;
  }), limit);
}

export async function getAiKnowledgeDebugSnapshot(
  query: string,
  limit = 4,
  options?: { providerId?: AiProviderId; modelId?: string; entryIds?: string[]; additionalEntries?: AiKnowledgeEntry[] },
) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return {
      query: normalizedQuery,
      scoringMode: "lexical" as const,
      vectorAvailable: false,
      vectorModel: null,
      knowledgeCount: 0,
      fallbackReason: "no-query" as const,
      results: [],
    };
  }

  const results = await debugAiKnowledgeSearch(normalizedQuery, limit, options);
  const entries = [
    ...filterKnowledgeEntries(await listAiKnowledge(), options),
    ...filterKnowledgeEntries((options?.additionalEntries ?? []).map((entry) => normalizeKnowledgeEntry(entry)), options),
  ];

  const vectorAvailable = results.some((entry) => entry.breakdown.vectorAvailable);
  const vectorModel = results.find((entry) => entry.breakdown.vectorModel)?.breakdown.vectorModel ?? null;

  return {
    query: normalizedQuery,
    scoringMode: vectorAvailable ? "hybrid" as const : "lexical" as const,
    vectorAvailable,
    vectorModel,
    knowledgeCount: entries.length,
    fallbackReason: entries.length === 0 ? "no-knowledge" as const : vectorAvailable ? null : "vector-unavailable" as const,
    results,
  };
}