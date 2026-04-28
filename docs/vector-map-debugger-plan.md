# Vector Map Debugger Plan

## Goal

Add a retrieval-debugger mode that makes hybrid retrieval visible instead of opaque. The existing admin debug panel already exposes ranked chunks and score breakdowns; this plan extends that surface so an operator can see lexical hits, semantic proximity, and duplicate suppression in one place.

## Current anchor

- Retrieval ranking is computed in `src/lib/ai-context.ts`.
- Debug results are returned by `src/app/api/admin/ai/context/debug/route.ts`.
- The admin visualization surface already exists in `src/components/user-access-panel.tsx`.

## Phase 1: hybrid debug payload

- Return query-level retrieval metadata from the debug route: `scoringMode`, `vectorModel`, `vectorAvailable`, `knowledgeCount`, and whether the request fell back to lexical-only ranking.
- Extend each debug result with chunk-level vector similarity, lexical subtotal, hybrid total, and duplicate-suppression details.
- Keep the existing ranked-list UI as the canonical textual explanation layer.

## Phase 2: map view in Admin

- Add a toggle between `Ranked list` and `Vector map` in the shared-knowledge debugger card.
- Plot the query as a pinned node and each returned chunk as a surrounding node.
- Encode node meaning with simple, readable channels:
  - size: hybrid score
  - ring intensity: vector similarity
  - label badge: lexical score
  - line style from query to node: solid for vector-backed, dashed for lexical-only fallback
- Show duplicate-suppressed neighbors with a muted state rather than hiding them completely so operators can understand why they lost.

## Rendering approach

- Preferred library: Cytoscape.js because it is free, open source, browser-native, and good at graph layouts for modest datasets.
- Lightweight fallback: D3 force layout if the graph stays query-local and under a few dozen nodes.
- Scope the first render to query-local data only; do not attempt a full-corpus graph in the browser.

## Data shape

Suggested debug payload additions:

```ts
type AiKnowledgeDebugMapPayload = {
  query: string;
  scoringMode: "lexical" | "hybrid";
  vectorAvailable: boolean;
  vectorModel: string | null;
  nodes: Array<{
    id: string;
    kind: "query" | "chunk";
    title: string;
    hybridScore: number;
    lexicalScore: number;
    vectorSimilarity: number | null;
    duplicatePenalty: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    relation: "retrieved" | "suppressed";
    weight: number;
  }>;
};
```

## Interaction rules

- Hovering a node highlights the matching text card in the ranked list.
- Clicking a node opens the full chunk text, source, provider scope, and model scope.
- A `fallback` badge should be visible whenever vector signals are unavailable so operators do not misread lexical-only results as semantic retrieval.

## Performance guardrails

- Limit the map to the top 12 ranked chunks plus at most 8 suppressed neighbors.
- Reuse the persisted vector cache in `data/ai-knowledge-vectors.json`; do not compute map-only embeddings.
- Disable the map cleanly when the knowledge store is empty or the vector model is unavailable.

## Free and local-only constraint

- No paid APIs.
- No hosted vector database requirement.
- No proprietary visualization dependency.
- Vector computation stays on the local Ollama endpoint.

## Recommended next implementation step

Add debug-route metadata first, then wire a small `Vector map` toggle into the existing admin debugger card. That keeps the initial feature query-local, explainable, and reversible.