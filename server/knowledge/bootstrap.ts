/**
 * Knowledge Base Bootstrap
 * ═══════════════════════════════════════════════════════════════════════════════
 * Called once at server startup. Rebuilds the in-memory vector index from
 * existing structured_knowledge rows if the persisted index file is missing,
 * empty, or out of sync with the database.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { knowledgeStorage } from "../knowledge-storage";
import { vectorIndex } from "./vector-index";

let bootstrapped = false;

/**
 * Restores the vector index from the database if needed.
 * Safe to call multiple times — it's idempotent.
 */
export async function bootstrapKnowledgeBase(): Promise<void> {
  if (bootstrapped) {
    return;
  }
  bootstrapped = true;

  try {
    // Give the VectorIndex constructor a moment to attempt loading from disk
    await new Promise((r) => setTimeout(r, 500));

    const indexStats = vectorIndex.getStats();
    const allKnowledge = await knowledgeStorage.searchStructuredKnowledge({});

    console.log(
      `[KnowledgeBootstrap] Index has ${indexStats.totalEntries} entries, DB has ${allKnowledge.length} knowledge rows`
    );

    // Re-index if:
    //  - DB has rows but index is empty (cold start / first run)
    //  - DB has more rows than index (drift / inconsistency)
    const needsRebuild =
      allKnowledge.length > 0 && indexStats.totalEntries < allKnowledge.length;

    if (!needsRebuild) {
      console.log("[KnowledgeBootstrap] Vector index is healthy. No rebuild needed.");
      return;
    }

    console.log(
      `[KnowledgeBootstrap] Rebuilding vector index for ${allKnowledge.length} items...`
    );

    // Convert DB rows back to the shape expected by vectorIndex.addKnowledge
    const items = allKnowledge.map((k: any) => ({
      id: k.id,
      sourceId: k.sourceId,
      application: k.application,
      module: k.module,
      objectName: k.objectName,
      knowledgeType: k.knowledgeType,
      facts: k.facts || {},
      confidenceScore: 80, // unknown — use a reasonable default
      sourceUnit: undefined,
      reasoning: "Restored from database on startup",
    }));

    // Batch in groups of 25 to avoid embedding API rate-limits
    const BATCH = 25;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      try {
        await vectorIndex.addKnowledge(batch as any);
      } catch (e: any) {
        console.warn(
          `[KnowledgeBootstrap] Batch ${i / BATCH + 1} failed (continuing): ${e.message}`
        );
      }
    }

    await vectorIndex.flush();
    const finalStats = vectorIndex.getStats();
    console.log(
      `[KnowledgeBootstrap] ✅ Rebuild complete. Index now has ${finalStats.totalEntries} entries.`
    );
  } catch (error: any) {
    console.error(`[KnowledgeBootstrap] Failed (non-fatal): ${error.message}`);
  }
}
