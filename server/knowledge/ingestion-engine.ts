/**
 * Knowledge Ingestion Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 * The orchestrator that runs the FULL pipeline:
 *
 *   File/URL → Extract → Structure → Validate → Store → Index for RAG
 *
 * This replaces the fake `generateSampleKnowledge` in knowledge-routes.ts.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import nodePath from "path";
import { extractorRegistry } from "./extractors/registry";
import type { ExtractorInput, ExtractionResult } from "./extractors/types";
import { knowledgeStructurer, type CanonicalKnowledge } from "./knowledge-structurer";
import { knowledgeValidator } from "./knowledge-validator";
import { vectorIndex } from "./vector-index";
import { knowledgeStorage } from "../knowledge-storage";

export interface IngestionInput {
  /** Knowledge source ID (already created in DB) */
  sourceId: string;
  /** Original file name OR URL */
  sourceName: string;
  /** File buffer if file upload, else undefined */
  buffer?: Buffer;
  /** URL if web-based source */
  url?: string;
  /** MIME type hint */
  mimeType?: string;
  /** File extension hint */
  extension?: string;
  /** Target application (JDE, SAP, SALESFORCE, CUSTOM) */
  application?: string;
  /** Target module (e.g., PROCUREMENT) */
  module?: string;
  /** Module tag from KB schema */
  moduleTag?: string;
  /** Language for OCR */
  language?: string;
}

export interface IngestionResult {
  sourceId: string;
  success: boolean;
  status:
    | "EXTRACTING"
    | "STRUCTURING"
    | "VALIDATING"
    | "INDEXING"
    | "READY"
    | "FAILED";
  extraction?: {
    totalUnits: number;
    wordCount: number;
    durationMs: number;
    warnings?: string[];
  };
  structuring?: {
    itemsExtracted: number;
    overallConfidence: number;
    aiCallsMade: number;
    durationMs: number;
  };
  validation?: {
    total: number;
    valid: number;
    rejected: number;
    avgScore: number;
  };
  storage?: {
    itemsStored: number;
    indexedForRAG: boolean;
  };
  knowledge?: CanonicalKnowledge[];
  rejectedKnowledge?: Array<CanonicalKnowledge & { issues: any[] }>;
  errorMessage?: string;
  totalDurationMs: number;
}

export class IngestionEngine {
  /**
   * Run the COMPLETE ingestion pipeline.
   * Updates the source status at each stage so the UI can poll progress.
   */
  async ingest(input: IngestionInput): Promise<IngestionResult> {
    const started = Date.now();
    console.log(`[IngestionEngine] ═══ Starting ingestion: ${input.sourceName} ═══`);

    const result: IngestionResult = {
      sourceId: input.sourceId,
      success: false,
      status: "EXTRACTING",
      totalDurationMs: 0,
    };

    try {
      // ───────────────────────────────────────────────────────────────────────
      // STAGE 1: EXTRACT
      // ───────────────────────────────────────────────────────────────────────
      await this.updateStatus(input.sourceId, "INGESTING");
      const extractInput: ExtractorInput = {
        sourceName: input.sourceName,
        buffer: input.buffer,
        url: input.url,
        mimeType: input.mimeType,
        extension: input.extension || (input.sourceName ? nodePath.extname(input.sourceName) : undefined),
        hints: {
          language: input.language,
          application: input.application,
          moduleTag: input.moduleTag,
        },
      };

      let extraction: ExtractionResult;
      try {
        extraction = await extractorRegistry.extract(extractInput);
      } catch (e: any) {
        console.error(`[IngestionEngine] Extraction failed:`, e.message);
        await this.updateStatus(input.sourceId, "FAILED", e.message);
        result.errorMessage = `Extraction failed: ${e.message}`;
        result.totalDurationMs = Date.now() - started;
        return result;
      }

      result.extraction = {
        totalUnits: extraction.totalUnits,
        wordCount: extraction.metadata.wordCount,
        durationMs: extraction.metadata.durationMs,
        warnings: extraction.metadata.warnings,
      };
      console.log(
        `[IngestionEngine] ✓ Extracted ${extraction.totalUnits} units, ${extraction.metadata.wordCount} words`
      );

      // ───────────────────────────────────────────────────────────────────────
      // STAGE 2: STRUCTURE (AI)
      // ───────────────────────────────────────────────────────────────────────
      result.status = "STRUCTURING";
      await this.updateStatus(input.sourceId, "CLASSIFYING");

      const structuring = await knowledgeStructurer.structure(extraction, {
        application: input.application,
        module: input.module,
        moduleTag: input.moduleTag,
      });

      result.structuring = {
        itemsExtracted: structuring.knowledge.length,
        overallConfidence: structuring.overallConfidence,
        aiCallsMade: structuring.metrics.aiCallsMade,
        durationMs: structuring.metrics.durationMs,
      };
      console.log(
        `[IngestionEngine] ✓ Structured into ${structuring.knowledge.length} items (conf ${structuring.overallConfidence}%)`
      );

      // ───────────────────────────────────────────────────────────────────────
      // STAGE 3: VALIDATE (anti-hallucination)
      // ───────────────────────────────────────────────────────────────────────
      result.status = "VALIDATING";
      await this.updateStatus(input.sourceId, "EXTRACTING");

      const validation = knowledgeValidator.validateBatch(
        structuring.knowledge,
        extraction.fullText
      );

      result.validation = validation.summary;
      console.log(
        `[IngestionEngine] ✓ Validated: ${validation.summary.valid}/${validation.summary.total} passed (avg ${validation.summary.avgScore})`
      );

      result.rejectedKnowledge = validation.rejected.map((r) => ({
        ...r,
        issues: r.validation.issues,
      }));

      // ───────────────────────────────────────────────────────────────────────
      // STAGE 4: STORE in DB
      // ───────────────────────────────────────────────────────────────────────
      result.status = "INDEXING";
      await this.updateStatus(input.sourceId, "EMBEDDING");

      const storedItems: Array<CanonicalKnowledge & { id: string; sourceId: string }> = [];
      for (const item of validation.valid) {
        try {
          const saved = await knowledgeStorage.createStructuredKnowledge({
            sourceId: input.sourceId,
            application: item.application,
            module: item.module,
            objectName: item.objectName,
            knowledgeType: item.knowledgeType,
            facts: item.facts as any,
            isAuthoritative: item.confidenceScore >= 70,
          } as any);
          storedItems.push({
            ...item,
            id: (saved as any).id,
            sourceId: input.sourceId,
          });
        } catch (e: any) {
          console.warn(`[IngestionEngine] Failed to store item: ${e.message}`);
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // STAGE 5: INDEX for RAG
      // ───────────────────────────────────────────────────────────────────────
      let indexedForRAG = false;
      if (storedItems.length > 0) {
        try {
          await vectorIndex.addKnowledge(storedItems);
          indexedForRAG = true;
          // Persist immediately after a successful ingestion
          await vectorIndex.flush();
        } catch (e: any) {
          console.warn(`[IngestionEngine] Vector indexing failed (non-fatal): ${e.message}`);
        }
      }

      result.storage = {
        itemsStored: storedItems.length,
        indexedForRAG,
      };
      result.knowledge = validation.valid;

      // ───────────────────────────────────────────────────────────────────────
      // STAGE 6: READY
      // ───────────────────────────────────────────────────────────────────────
      await knowledgeStorage.incrementDocumentCount(input.sourceId, storedItems.length);
      await this.updateStatus(input.sourceId, "READY");
      result.status = "READY";
      result.success = true;

      result.totalDurationMs = Date.now() - started;
      console.log(
        `[IngestionEngine] ✅ COMPLETE in ${result.totalDurationMs}ms: ${storedItems.length} items stored, RAG-indexed: ${indexedForRAG}`
      );
      return result;
    } catch (err: any) {
      console.error(`[IngestionEngine] ❌ FAILED:`, err);
      await this.updateStatus(input.sourceId, "FAILED", err.message);
      result.errorMessage = err.message;
      result.totalDurationMs = Date.now() - started;
      return result;
    }
  }

  /**
   * Preview-only: run extract + structure + validate WITHOUT storing.
   * Used by the UI to show the user what will be ingested.
   */
  async preview(
    input: Omit<IngestionInput, "sourceId">
  ): Promise<{
    success: boolean;
    extraction?: ExtractionResult;
    knowledge?: CanonicalKnowledge[];
    rejected?: Array<CanonicalKnowledge & { issues: any[] }>;
    errorMessage?: string;
  }> {
    try {
      const extraction = await extractorRegistry.extract({
        sourceName: input.sourceName,
        buffer: input.buffer,
        url: input.url,
        mimeType: input.mimeType,
        extension: input.extension || (input.sourceName ? nodePath.extname(input.sourceName) : undefined),
        hints: {
          language: input.language,
          application: input.application,
          moduleTag: input.moduleTag,
        },
      });

      const structuring = await knowledgeStructurer.structure(extraction, {
        application: input.application,
        module: input.module,
        moduleTag: input.moduleTag,
      });

      const validation = knowledgeValidator.validateBatch(
        structuring.knowledge,
        extraction.fullText
      );

      return {
        success: true,
        extraction,
        knowledge: validation.valid,
        rejected: validation.rejected.map((r) => ({
          ...r,
          issues: r.validation.issues,
        })),
      };
    } catch (err: any) {
      return { success: false, errorMessage: err.message };
    }
  }

  /**
   * RAG retrieval - find relevant knowledge for a query.
   */
  async retrieve(
    query: string,
    options: {
      application?: string;
      module?: string;
      objectName?: string;
      topK?: number;
    } = {}
  ) {
    return vectorIndex.search(query, {
      filterApplication: options.application,
      filterModule: options.module,
      filterObjectName: options.objectName,
      topK: options.topK || 8,
    });
  }

  private async updateStatus(
    sourceId: string,
    status:
      | "PENDING"
      | "INGESTING"
      | "CLASSIFYING"
      | "EXTRACTING"
      | "EMBEDDING"
      | "READY"
      | "FAILED",
    errorMessage?: string
  ): Promise<void> {
    try {
      await knowledgeStorage.updateIngestionStatus(sourceId, status, errorMessage);
    } catch (e: any) {
      console.warn(`[IngestionEngine] Status update failed: ${e.message}`);
    }
  }
}

export const ingestionEngine = new IngestionEngine();
