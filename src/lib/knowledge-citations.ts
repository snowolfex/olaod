import type { AiKnowledgeCitation } from "@/lib/ai-types";

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

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function intersectValues(left: string[], right: string[]) {
  const rightValues = new Set(right);
  return left.filter((value) => rightValues.has(value));
}

function calculateTokenOverlap(leftText: string, rightText: string) {
  const leftTokens = uniqueTokens(leftText);
  const rightTokens = uniqueTokens(rightText);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  return intersectValues(leftTokens, rightTokens).length / Math.min(leftTokens.length, rightTokens.length);
}

function citationsOverlap(left: AiKnowledgeCitation, right: AiKnowledgeCitation) {
  const normalizedLeftSource = normalizeText(left.source);
  const normalizedRightSource = normalizeText(right.source);

  if (normalizedLeftSource && normalizedRightSource && normalizedLeftSource !== normalizedRightSource) {
    return false;
  }

  const exactExcerptMatch = normalizeText(left.excerpt) === normalizeText(right.excerpt);
  const exactTitleMatch = normalizeText(left.title) === normalizeText(right.title);
  const titleSimilarity = calculateTokenOverlap(left.title, right.title);
  const excerptSimilarity = calculateTokenOverlap(left.excerpt, right.excerpt);

  return exactExcerptMatch
    || exactTitleMatch
    || excerptSimilarity >= 0.85
    || (excerptSimilarity >= 0.72 && titleSimilarity >= 0.6);
}

export function dedupeKnowledgeCitations(citations: AiKnowledgeCitation[]) {
  const ordered = [...citations].sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
  const deduped: AiKnowledgeCitation[] = [];

  for (const citation of ordered) {
    if (deduped.some((entry) => citationsOverlap(entry, citation))) {
      continue;
    }

    deduped.push(citation);
  }

  return deduped;
}