/**
 * Knowledge Base Retrieval Helper
 * ═══════════════════════════════════════════════════════════════════════════════
 * Single, shared entry point that ALL test generators (AI, JDE rule-based,
 * parse-spec) use to pull relevant knowledge from the unified Knowledge Base.
 *
 * Why this exists:
 *   - Before this file: only /api/generate-tests called ingestionEngine.retrieve()
 *     while /api/generate-jde-tests and /api/generate/parse-spec used hardcoded
 *     JDE knowledge only. That meant uploaded PPT/PDF/Image content was not
 *     visible to those generators.
 *   - After this file: every generator gets the same enriched context with the
 *     same formatting, the same application/module filters, and the same
 *     anti-hallucination safety net.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { ingestionEngine } from "./ingestion-engine";
import { knowledgeStorage } from "../knowledge-storage";

export interface RagQueryOptions {
  application?: string;
  module?: string;
  objectName?: string;
  /** Top-K results. Default 6 - tuned to fit in a single LLM prompt without
   *  pushing out the system prompt or user requirement. */
  topK?: number;
  /** Maximum number of characters per snippet (default 1500). Raised from 600
   *  so dense mapping-table / rule content in a retrieved chunk survives instead
   *  of being clipped mid-table — matching Copilot's fuller context window. */
  snippetLength?: number;
  /** Applications to DROP from results (post-retrieval, case-insensitive).
   *  Use this to stop pre-seeded enterprise knowledge (e.g. JDE samples) from
   *  polluting a different application's generation. e.g. a Model N / generic
   *  web spec must never inherit "Log in to JDE" steps from JDE KB entries. */
  excludeApplications?: string[];
}

export interface RagContext {
  blockText: string;
  resultCount: number;
  topObjects: string[];
  sources: Set<string>;
  warnings?: string[];
}

/**
 * Retrieves relevant knowledge from the KB and returns it as a single
 * pre-formatted text block ready to be appended to an LLM prompt.
 *
 * Returns an empty block if nothing is found or the index is empty,
 * so callers can safely just concatenate the result.
 */
export async function buildRAGContextBlock(
  query: string,
  opts: RagQueryOptions = {}
): Promise<RagContext> {
  const warnings: string[] = [];
  const empty: RagContext = {
    blockText: "",
    resultCount: 0,
    topObjects: [],
    sources: new Set<string>(),
    warnings,
  };

  const trimmed = (query || "").trim();
  if (trimmed.length < 20) {
    return empty;
  }

  try {
    const topK = opts.topK ?? 6;
    const snippetLength = opts.snippetLength ?? 1500;
    const ragResults = await ingestionEngine.retrieve(trimmed.slice(0, 2000), {
      application: opts.application,
      module: opts.module,
      objectName: opts.objectName,
      topK,
    });

    if (ragResults.length === 0) {
      return empty;
    }

    // Drop cross-application knowledge (e.g. pre-seeded JDE samples) so a
    // different application's spec never inherits the wrong system's steps.
    const exclude = new Set((opts.excludeApplications || []).map((a) => a.toUpperCase()));
    const filtered = exclude.size
      ? ragResults.filter((r) => !exclude.has((r.entry.metadata.application || "").toUpperCase()))
      : ragResults;

    if (filtered.length === 0) {
      warnings.push(
        `All ${ragResults.length} KB matches were excluded by application filter (${Array.from(exclude).join(", ")})`
      );
      return { ...empty, warnings };
    }

    const lines: string[] = [
      `\n=== RELEVANT KNOWLEDGE BASE CONTEXT (top ${filtered.length} matches) ===`,
    ];
    const topObjects: string[] = [];
    const sources = new Set<string>();

    for (const r of filtered) {
      const meta = r.entry.metadata;
      const snippet = r.entry.chunkText.slice(0, snippetLength);
      lines.push(
        `\n• [${meta.objectName}] ${meta.application}/${meta.module} (score=${r.score.toFixed(2)})`
      );
      lines.push(`  ${snippet}${r.entry.chunkText.length > snippetLength ? "..." : ""}`);
      if (meta.objectName && !topObjects.includes(meta.objectName)) {
        topObjects.push(meta.objectName);
      }
      if (r.entry.sourceId) sources.add(r.entry.sourceId);
    }

    return {
      blockText: lines.join("\n"),
      resultCount: filtered.length,
      topObjects,
      sources,
      warnings,
    };
  } catch (e: any) {
    warnings.push(`RAG retrieval failed: ${e.message}`);
    return { ...empty, warnings };
  }
}

/**
 * Retrieves the FULL structured knowledge facts (not just text snippets) for a
 * query. Unlike {@link buildRAGContextBlock} — which formats a text block for an
 * LLM prompt — this returns the raw canonical facts (business process steps,
 * fields, validations, test points, prerequisites) so the rule-based generator
 * can synthesise detailed functional test cases when the AI path is unavailable.
 *
 * Returns an empty array when nothing relevant is found.
 */
export async function retrieveStructuredKnowledge(
  query: string,
  opts: RagQueryOptions = {}
): Promise<
  Array<{
    application: string;
    module: string;
    objectName: string;
    knowledgeType: string;
    score: number;
    facts: any;
  }>
> {
  const trimmed = (query || "").trim();
  if (trimmed.length < 8) return [];

  try {
    const topK = opts.topK ?? 8;
    const ragResults = await ingestionEngine.retrieve(trimmed.slice(0, 2000), {
      application: opts.application,
      module: opts.module,
      objectName: opts.objectName,
      topK,
    });
    if (ragResults.length === 0) return [];

    // Drop cross-application knowledge (e.g. pre-seeded JDE samples) so the
    // deterministic fallback never builds "Log in to JDE" tests for a Model N
    // or generic web spec.
    const exclude = new Set((opts.excludeApplications || []).map((a) => a.toUpperCase()));
    const scoped = exclude.size
      ? ragResults.filter((r) => !exclude.has((r.entry.metadata.application || "").toUpperCase()))
      : ragResults;
    if (scoped.length === 0) return [];

    const out: Array<{
      application: string;
      module: string;
      objectName: string;
      knowledgeType: string;
      score: number;
      facts: any;
    }> = [];

    for (const r of scoped) {
      let facts: any = {};
      try {
        if (r.entry.knowledgeId) {
          const sk = await knowledgeStorage.getStructuredKnowledge(r.entry.knowledgeId);
          if (sk?.facts) facts = sk.facts;
        }
      } catch {
        /* fall back to metadata-only entry */
      }
      out.push({
        application: r.entry.metadata.application,
        module: r.entry.metadata.module,
        objectName: r.entry.metadata.objectName,
        knowledgeType: r.entry.metadata.knowledgeType,
        score: r.score,
        facts,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Health check: verifies the entire KB pipeline is wired correctly.
 * Returns a structured report telling you exactly which pieces are healthy
 * and which are broken.
 */
export async function checkKBIntegrationHealth(): Promise<{
  overall: "HEALTHY" | "DEGRADED" | "BROKEN";
  checks: Array<{
    name: string;
    status: "PASS" | "WARN" | "FAIL";
    detail: string;
  }>;
  stats: {
    sources: number;
    structuredKnowledge: number;
    vectorIndexEntries: number;
    sourcesByStatus: Record<string, number>;
  };
}> {
  const checks: Array<{ name: string; status: "PASS" | "WARN" | "FAIL"; detail: string }> = [];

  // ── 1) Database wiring ────────────────────────────────────────────────────
  let sources: any[] = [];
  let knowledge: any[] = [];
  try {
    sources = await knowledgeStorage.getAllKnowledgeSources();
    knowledge = await knowledgeStorage.searchStructuredKnowledge({});
    checks.push({
      name: "Database wiring",
      status: "PASS",
      detail: `Found ${sources.length} sources, ${knowledge.length} knowledge items`,
    });
  } catch (e: any) {
    checks.push({
      name: "Database wiring",
      status: "FAIL",
      detail: `Database unreachable: ${e.message}`,
    });
  }

  // ── 2) Vector index health ────────────────────────────────────────────────
  let vectorEntries = 0;
  try {
    const { vectorIndex } = await import("./vector-index");
    const stats = vectorIndex.getStats();
    vectorEntries = stats.totalEntries;
    if (knowledge.length > 0 && vectorEntries === 0) {
      checks.push({
        name: "Vector index",
        status: "WARN",
        detail: `${knowledge.length} knowledge items in DB but vector index is empty. Bootstrap may still be running.`,
      });
    } else if (knowledge.length > 0 && vectorEntries < knowledge.length) {
      checks.push({
        name: "Vector index",
        status: "WARN",
        detail: `Vector index out of sync: ${vectorEntries} entries vs ${knowledge.length} in DB.`,
      });
    } else {
      checks.push({
        name: "Vector index",
        status: "PASS",
        detail: `${vectorEntries} entries indexed`,
      });
    }
  } catch (e: any) {
    checks.push({
      name: "Vector index",
      status: "FAIL",
      detail: `Vector index unavailable: ${e.message}`,
    });
  }

  // ── 3) Extractors registered ──────────────────────────────────────────────
  try {
    const { extractorRegistry } = await import("./extractors/registry");
    const list = extractorRegistry.list();
    const names = list.map((e: any) => e?.name || String(e)).join(", ");
    if (list.length >= 5) {
      checks.push({
        name: "Extractors",
        status: "PASS",
        detail: `${list.length} extractors registered: ${names}`,
      });
    } else {
      checks.push({
        name: "Extractors",
        status: "WARN",
        detail: `Only ${list.length} extractors registered: ${names}`,
      });
    }
  } catch (e: any) {
    checks.push({
      name: "Extractors",
      status: "FAIL",
      detail: `Extractor registry unavailable: ${e.message}`,
    });
  }

  // ── 4) AI client ──────────────────────────────────────────────────────────
  try {
    const { getAiClient } = await import("../ai-client");
    const ai = await getAiClient();
    if (ai) {
      checks.push({
        name: "AI client",
        status: "PASS",
        detail: "AI client configured and reachable",
      });
    } else {
      checks.push({
        name: "AI client",
        status: "WARN",
        detail: "AI client not configured. RAG falls back to keyword search; structuring will fail for new ingestions.",
      });
    }
  } catch (e: any) {
    checks.push({
      name: "AI client",
      status: "FAIL",
      detail: `AI client error: ${e.message}`,
    });
  }

  // ── 5) End-to-end retrieval test ──────────────────────────────────────────
  try {
    const probe = await ingestionEngine.retrieve("procurement purchase order", { topK: 1 });
    if (probe.length > 0 || vectorEntries === 0) {
      checks.push({
        name: "End-to-end retrieval",
        status: "PASS",
        detail: vectorEntries === 0
          ? "Index empty - upload a source to test retrieval"
          : `Retrieved ${probe.length} test results`,
      });
    } else {
      checks.push({
        name: "End-to-end retrieval",
        status: "WARN",
        detail: "Retrieval returned 0 results despite index having entries",
      });
    }
  } catch (e: any) {
    checks.push({
      name: "End-to-end retrieval",
      status: "FAIL",
      detail: `Retrieval failed: ${e.message}`,
    });
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const hasFail = checks.some((c) => c.status === "FAIL");
  const hasWarn = checks.some((c) => c.status === "WARN");
  const overall: "HEALTHY" | "DEGRADED" | "BROKEN" = hasFail
    ? "BROKEN"
    : hasWarn
    ? "DEGRADED"
    : "HEALTHY";

  const sourcesByStatus = sources.reduce((acc: Record<string, number>, s: any) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  return {
    overall,
    checks,
    stats: {
      sources: sources.length,
      structuredKnowledge: knowledge.length,
      vectorIndexEntries: vectorEntries,
      sourcesByStatus,
    },
  };
}
