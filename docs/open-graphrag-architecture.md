# Open GraphRAG Architecture For oload

## Objective

Design a fully local, free, and open GraphRAG path for oload that layers on top of the current JSON-backed knowledge store and the new hybrid lexical plus vector retrieval path.

## Non-negotiable constraints

- No paid SaaS dependency.
- No proprietary graph database requirement.
- Must run in an offline-friendly local deployment.
- Must keep a safe fallback path when graph artifacts are missing or stale.

## Existing baseline

- Canonical knowledge entries live in `data/ai-knowledge.json`.
- Hybrid retrieval now ranks by lexical score plus optional local Ollama embeddings.
- The current grounding pipeline still consumes chunk text and citations, which is a good compatibility anchor.

## Target architecture

### 1. Source layer

- Keep `data/ai-knowledge.json` as the source of truth for imported or manually entered knowledge.
- Continue chunking entries in `src/lib/ai-context.ts`.

### 2. Vector layer

- Persist chunk embeddings in `data/ai-knowledge-vectors.json`.
- Use a local Ollama embedding model selected through `OLOAD_KNOWLEDGE_EMBED_MODEL`.
- Preserve lexical-only search when embeddings are unavailable.

### 3. Graph extraction layer

- Build an offline graph index from chunks into a new local artifact such as `data/ai-knowledge-graph.json`.
- Graph nodes:
  - document
  - chunk
  - entity
  - topic
  - provider scope
  - model scope
- Graph edges:
  - `contains`
  - `mentions`
  - `related_to`
  - `scoped_to_provider`
  - `scoped_to_model`
  - `near_vector_neighbor`

## Extraction strategy

### Phase A: deterministic first pass

- Extract candidate entities with lightweight local heuristics before introducing model-driven extraction.
- Seed entity edges from title tokens, tags, repeated noun-like phrases, URLs, product names, and model/provider identifiers.
- This keeps the first graph build free, reproducible, and explainable.

### Phase B: optional local LLM enrichment

- Add an offline enrichment job that asks a local Ollama model to summarize chunk topics and propose typed relationships.
- Store the extracted claims separately with provenance back to the originating chunk.
- Never let enrichment replace the source chunk; it only adds graph metadata.

## Storage format

Use plain JSON artifacts first:

```ts
type KnowledgeGraphStore = {
  version: 1;
  builtAt: string;
  embeddingModel: string | null;
  nodes: Array<{
    id: string;
    type: "document" | "chunk" | "entity" | "topic" | "provider" | "model";
    label: string;
    sourceEntryId?: string;
    sourceChunkKey?: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    relation: string;
    weight: number;
    provenanceChunkKey?: string;
  }>;
};
```

This keeps the system inspectable, git-ignorably local, and easy to export later as GraphML for external review in Gephi.

## Query modes

### Direct hybrid retrieval

- Current default.
- Best for short factual grounding and low-latency chat turns.

### Local graph expansion

- Start from top hybrid chunks.
- Expand one or two graph hops through high-confidence entities and related chunks.
- Use this for broader synthesis questions where linked context matters more than exact token overlap.

### Community summary mode

- Cluster graph neighborhoods by shared entities or topics.
- Precompute short local summaries for dense neighborhoods.
- Use this for admin exploration and large-corpus overview questions.

## Prompt assembly changes

- Keep the existing citation format in `src/lib/ai-service.ts`.
- Add source labels that distinguish:
  - direct chunk evidence
  - graph-expanded neighbor evidence
  - generated local community summary
- Require provenance for every graph-expanded statement so the assistant can still point back to the raw chunk.

## Jobs and maintenance

- Add an admin-triggered `Rebuild graph index` job.
- Add incremental refresh when knowledge entries are saved or deleted.
- Mark graph artifacts stale when chunking logic or embedding model changes.
- Surface graph-build status in the admin jobs panel instead of hiding it behind silent background writes.

## Admin UX

- Extend the shared-knowledge debugger with:
  - `Hybrid search`
  - `Graph expansion`
  - `Community summary`
- Add provenance panels so operators can see which graph edges introduced each extra chunk.
- Export GraphML as a debugging artifact, not as the primary runtime store.

## Free and open component lane

- Ollama for local embeddings and optional local graph-enrichment prompts.
- Plain JSON plus existing file-store helpers for persistence.
- Optional Cytoscape.js or D3 for in-app graph inspection.
- Optional GraphML export for Gephi desktop analysis.

## Recommended implementation order

1. Keep the current hybrid retriever as the default search path.
2. Add deterministic graph extraction into a local JSON artifact.
3. Expose graph expansion in the admin debugger before using it in chat.
4. Only then add graph-expanded context assembly to chat prompts.
5. Treat local LLM graph enrichment as an optional later enhancement.

## Why this order fits oload

It preserves today’s working chat flow, keeps every new artifact explainable, and avoids trapping the product behind a heavyweight graph database decision too early.