/**
 * Vector Index for RAG Retrieval
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lightweight in-memory vector store for semantic search over knowledge.
 *
 * DESIGN:
 * - Uses OpenAI embeddings (text-embedding-3-small) when available
 * - Falls back to TF-IDF keyword scoring when embeddings unavailable
 * - HYBRID retrieval: semantic similarity + keyword overlap
 * - Persists to disk so we don't re-embed on every restart
 *
 * This is intentionally a simple, dependency-free implementation.
 * Can be swapped for Pinecone/Weaviate/Qdrant in production at scale.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import fs from "fs/promises";
import path from "path";
import type { CanonicalKnowledge } from "./knowledge-structurer";

export interface VectorEntry {
  id: string;
  knowledgeId: string;
  sourceId: string;
  chunkText: string;
  /** Embedding vector - empty if embeddings unavailable */
  embedding: number[];
  metadata: {
    application: string;
    module: string;
    objectName: string;
    knowledgeType: string;
  };
  /** Pre-computed term frequency for hybrid scoring */
  termFreq: Record<string, number>;
}

export interface RetrievalResult {
  entry: VectorEntry;
  score: number;
  semanticScore?: number;
  keywordScore?: number;
  reason: string;
}

export class VectorIndex {
  private entries = new Map<string, VectorEntry>();
  private dirtyCount = 0;
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly persistPath: string;
  private embeddingsEnabled: boolean | null = null;

  constructor(persistPath?: string) {
    this.persistPath =
      persistPath || path.join(process.cwd(), "aitas-vector-index.json");
    this.loadFromDisk().catch((e) =>
      console.warn(`[VectorIndex] Failed to load: ${e.message}`)
    );
    // Auto-flush every 30s if dirty
    this.flushInterval = setInterval(() => this.maybeFlush(), 30000);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Add knowledge items to the vector index. Generates embeddings.
   */
  async addKnowledge(
    items: Array<CanonicalKnowledge & { id: string; sourceId: string }>
  ): Promise<void> {
    if (items.length === 0) return;
    console.log(`[VectorIndex] Adding ${items.length} knowledge items`);

    // Build chunk texts
    const chunks = items.map((item) => ({
      id: `vec-${item.id}`,
      knowledgeId: item.id,
      sourceId: item.sourceId,
      text: this.buildChunkText(item),
      metadata: {
        application: item.application,
        module: item.module,
        objectName: item.objectName,
        knowledgeType: item.knowledgeType,
      },
    }));

    // Try to compute embeddings in batch
    let embeddings: number[][] = [];
    try {
      embeddings = await this.computeEmbeddings(chunks.map((c) => c.text));
    } catch (e: any) {
      console.warn(
        `[VectorIndex] Embeddings unavailable, using keyword-only mode: ${e.message}`
      );
      embeddings = chunks.map(() => []);
    }

    // Store entries
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      this.entries.set(c.id, {
        id: c.id,
        knowledgeId: c.knowledgeId,
        sourceId: c.sourceId,
        chunkText: c.text,
        embedding: embeddings[i] || [],
        metadata: c.metadata,
        termFreq: this.computeTermFreq(c.text),
      });
    }

    this.dirtyCount += chunks.length;
    console.log(`[VectorIndex] Index now contains ${this.entries.size} entries`);
  }

  /**
   * Search the index using hybrid semantic + keyword scoring.
   */
  async search(
    query: string,
    options: {
      topK?: number;
      filterApplication?: string;
      filterModule?: string;
      filterObjectName?: string;
      minScore?: number;
    } = {}
  ): Promise<RetrievalResult[]> {
    const topK = options.topK || 10;
    const minScore = options.minScore ?? 0.05;

    // Try semantic search
    let queryEmbedding: number[] = [];
    try {
      const embs = await this.computeEmbeddings([query]);
      queryEmbedding = embs[0] || [];
    } catch {
      // Fall through to keyword-only
    }

    const queryTermFreq = this.computeTermFreq(query);
    const results: RetrievalResult[] = [];

    for (const entry of Array.from(this.entries.values())) {
      // Apply filters (application match is case-insensitive on BOTH sides so a
      // free-text app identity like "Model N" still matches regardless of how it
      // was cased at ingestion vs. at query time).
      if (
        options.filterApplication &&
        (entry.metadata.application || "").toUpperCase() !== options.filterApplication.toUpperCase()
      )
        continue;
      if (options.filterModule && entry.metadata.module !== options.filterModule) continue;
      if (options.filterObjectName && entry.metadata.objectName !== options.filterObjectName) continue;

      // Semantic score (cosine similarity)
      const semanticScore =
        queryEmbedding.length > 0 && entry.embedding.length > 0
          ? this.cosineSim(queryEmbedding, entry.embedding)
          : 0;

      // Keyword score (TF intersection)
      const keywordScore = this.keywordOverlap(queryTermFreq, entry.termFreq);

      // Hybrid score - semantic dominates when available, keyword as fallback
      const score =
        semanticScore > 0
          ? 0.7 * semanticScore + 0.3 * keywordScore
          : keywordScore;

      if (score >= minScore) {
        results.push({
          entry,
          score,
          semanticScore: semanticScore > 0 ? semanticScore : undefined,
          keywordScore,
          reason:
            semanticScore > 0
              ? `Semantic similarity ${(semanticScore * 100).toFixed(0)}% + keyword overlap ${(keywordScore * 100).toFixed(0)}%`
              : `Keyword overlap ${(keywordScore * 100).toFixed(0)}%`,
        });
      }
    }

    // Sort by score desc, take top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Remove all entries for a given knowledge source.
   */
  removeBySource(sourceId: string): number {
    let removed = 0;
    for (const [id, entry] of Array.from(this.entries.entries())) {
      if (entry.sourceId === sourceId) {
        this.entries.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      this.dirtyCount += removed;
      console.log(`[VectorIndex] Removed ${removed} entries for source ${sourceId}`);
    }
    return removed;
  }

  /**
   * Statistics about the index.
   */
  getStats(): {
    totalEntries: number;
    bySource: Record<string, number>;
    byApplication: Record<string, number>;
    byModule: Record<string, number>;
    embeddingsEnabled: boolean;
    avgChunkLength: number;
  } {
    const bySource: Record<string, number> = {};
    const byApp: Record<string, number> = {};
    const byMod: Record<string, number> = {};
    let totalLen = 0;
    let withEmbeddings = 0;

    for (const e of Array.from(this.entries.values())) {
      bySource[e.sourceId] = (bySource[e.sourceId] || 0) + 1;
      byApp[e.metadata.application] = (byApp[e.metadata.application] || 0) + 1;
      byMod[e.metadata.module] = (byMod[e.metadata.module] || 0) + 1;
      totalLen += e.chunkText.length;
      if (e.embedding.length > 0) withEmbeddings++;
    }

    return {
      totalEntries: this.entries.size,
      bySource,
      byApplication: byApp,
      byModule: byMod,
      embeddingsEnabled: withEmbeddings > 0,
      avgChunkLength: this.entries.size > 0 ? Math.round(totalLen / this.entries.size) : 0,
    };
  }

  /**
   * Force-persist the index to disk.
   */
  async flush(): Promise<void> {
    if (this.dirtyCount === 0) return;
    try {
      const data = JSON.stringify(
        {
          version: 1,
          updatedAt: new Date().toISOString(),
          entries: Array.from(this.entries.values()),
        },
        null,
        0 // compact - the file can be huge with embeddings
      );
      await fs.writeFile(this.persistPath, data, "utf-8");
      this.dirtyCount = 0;
    } catch (e: any) {
      console.warn(`[VectorIndex] Flush failed: ${e.message}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INTERNALS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Build the chunk text for embedding from a knowledge item.
   */
  private buildChunkText(item: CanonicalKnowledge): string {
    const parts: string[] = [
      `[${item.application}] ${item.module} > ${item.objectName} (${item.knowledgeType})`,
    ];
    const f = item.facts;
    if (f.description) parts.push(f.description);
    if (f.businessProcess?.length) parts.push("Process: " + f.businessProcess.join(" → "));
    if (f.fields?.length) parts.push("Fields: " + f.fields.map((x) => x.name).join(", "));
    if (f.validations?.length) parts.push("Validations: " + f.validations.join("; "));
    if (f.tables?.length) parts.push("Tables: " + f.tables.join(", "));
    if (f.testableActions?.length) parts.push("Actions: " + f.testableActions.join(", "));
    if (f.testPoints?.length) parts.push("Test Points: " + f.testPoints.join("; "));
    return parts.join("\n");
  }

  /**
   * Compute embeddings via OpenAI API. Returns [] for each input if API unavailable.
   */
  private async computeEmbeddings(texts: string[]): Promise<number[][]> {
    if (this.embeddingsEnabled === false) {
      throw new Error("Embeddings disabled");
    }

    const apiKey =
      process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY;
    if (!apiKey) {
      this.embeddingsEnabled = false;
      throw new Error("No OpenAI API key configured");
    }

    try {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey });
      const response = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: texts.map((t) => t.substring(0, 8000)), // safety cap
      });
      this.embeddingsEnabled = true;
      return response.data.map((d: any) => d.embedding as number[]);
    } catch (e: any) {
      this.embeddingsEnabled = false;
      throw e;
    }
  }

  private cosineSim(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  private computeTermFreq(text: string): Record<string, number> {
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const tf: Record<string, number> = {};
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
    return tf;
  }

  private keywordOverlap(
    a: Record<string, number>,
    b: Record<string, number>
  ): number {
    const aKeys = Object.keys(a);
    if (aKeys.length === 0) return 0;
    let overlap = 0;
    let total = 0;
    for (const k of aKeys) {
      total += a[k];
      if (b[k]) overlap += Math.min(a[k], b[k]);
    }
    return total > 0 ? overlap / total : 0;
  }

  private async maybeFlush(): Promise<void> {
    if (this.dirtyCount > 0) await this.flush();
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const data = await fs.readFile(this.persistPath, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed.entries && Array.isArray(parsed.entries)) {
        for (const e of parsed.entries) {
          this.entries.set(e.id, e);
        }
        console.log(
          `[VectorIndex] Loaded ${this.entries.size} entries from disk`
        );
      }
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      // First run - file doesn't exist yet, that's fine
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }
}

export const vectorIndex = new VectorIndex();
