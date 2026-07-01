/**
 * AITAS Knowledge Base API Routes
 * ═══════════════════════════════════════════════════════════════════════════════
 * REST API for Knowledge Base management with REAL ingestion pipeline:
 *   - URL sources (GitHub, Confluence, etc.) via URL extractor
 *   - File uploads (PPT, PDF, DOCX, Images) via multipart endpoint
 *   - Live preview (extract+structure+validate WITHOUT storing)
 *   - RAG retrieval for test generation
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import nodePath from "path";
import { knowledgeStorage } from "./knowledge-storage";
import {
  insertKnowledgeSourceSchema,
  insertGovernanceRuleSchema,
  IngestionStatus,
} from "../shared/knowledge-schema";
import { ingestionEngine } from "./knowledge/ingestion-engine";
import { vectorIndex } from "./knowledge/vector-index";
import { resolveIngestionTarget, sha256, recordSourceFingerprint } from "./knowledge/idempotent-ingest";

const router = Router();

// File upload config - 50MB max, allowed: PPT/PDF/DOCX/Images
const ALLOWED_EXTENSIONS = new Set([
  ".pptx", ".ppt",
  ".pdf",
  ".docx", ".doc",
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp",
  ".txt", ".md", ".csv",
]);

const knowledgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req: any, file: any, cb: any) => {
    const ext = nodePath.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`));
    }
  },
});

// Helper to safely get string param
const getParam = (param: string | string[]): string => Array.isArray(param) ? param[0] : param;

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE SOURCES
// ═══════════════════════════════════════════════════════════════════════════════

// Get all knowledge sources
router.get("/sources", async (req: Request, res: Response) => {
  try {
    const sources = await knowledgeStorage.getAllKnowledgeSources();
    res.json(sources);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching sources:", error);
    res.status(500).json({ error: "Failed to fetch knowledge sources" });
  }
});

// Get knowledge source by ID
router.get("/sources/:id", async (req: Request, res: Response) => {
  try {
    const source = await knowledgeStorage.getKnowledgeSource(String(req.params.id));
    if (!source) {
      return res.status(404).json({ error: "Knowledge source not found" });
    }
    res.json(source);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching source:", error);
    res.status(500).json({ error: "Failed to fetch knowledge source" });
  }
});

// Create knowledge source
router.post("/sources", async (req: Request, res: Response) => {
  try {
    const validation = insertKnowledgeSourceSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }
    
    const source = await knowledgeStorage.createKnowledgeSource({
      ...validation.data,
      status: "PENDING",
      documentCount: 0,
    } as any);
    
    // Trigger async ingestion automatically (non-blocking)
    if (source.id) {
      processIngestion(source.id).catch((err) => {
        console.error("[KnowledgeBase] Auto-ingestion error:", err);
      });
    }
    
    res.status(201).json(source);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error creating source:", error);
    res.status(500).json({ error: "Failed to create knowledge source" });
  }
});

// Update knowledge source
router.patch("/sources/:id", async (req: Request, res: Response) => {
  try {
    const source = await knowledgeStorage.updateKnowledgeSource(String(req.params.id), req.body);
    if (!source) {
      return res.status(404).json({ error: "Knowledge source not found" });
    }
    res.json(source);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error updating source:", error);
    res.status(500).json({ error: "Failed to update knowledge source" });
  }
});

// Delete knowledge source (cascade deletes documents and knowledge)
router.delete("/sources/:id", async (req: Request, res: Response) => {
  try {
    const sourceId = String(req.params.id);
    // Remove from vector index FIRST (storage cascade will drop the rows)
    try {
      vectorIndex.removeBySource(sourceId);
      await vectorIndex.flush();
    } catch (vecErr: any) {
      console.warn("[KnowledgeBase] Vector index cleanup failed (non-fatal):", vecErr.message);
    }
    await knowledgeStorage.deleteKnowledgeSource(sourceId);
    res.status(204).send();
  } catch (error: any) {
    console.error("[KnowledgeBase] Error deleting source:", error);
    res.status(500).json({ error: "Failed to delete knowledge source" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INGESTION PROCESSOR — REAL PIPELINE
// Uses the IngestionEngine: Extract → Structure (AI) → Validate → Store → Index
// Replaces the previous fake `generateSampleKnowledge` with real content parsing.
// ═══════════════════════════════════════════════════════════════════════════════
async function processIngestion(sourceId: string): Promise<void> {
  console.log(`[KnowledgeBase] Starting REAL ingestion for source: ${sourceId}`);

  const source = await knowledgeStorage.getKnowledgeSource(sourceId);
  if (!source) {
    console.error(`[KnowledgeBase] Source ${sourceId} not found`);
    return;
  }

  // Resolve module name from moduleTag (e.g., "JDE_PROCUREMENT" -> "Procurement")
  const moduleTag = (source as any).moduleTag || (source as any).module_tag;
  const moduleReadable = moduleTag
    ? String(moduleTag).replace(/^[A-Z]+_/, "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
    : undefined;

  const url = source.sourceUrl;
  // We only call the engine here for URL-based sources. File-upload sources are
  // handled directly by the /upload endpoint which passes the buffer in memory.
  if (!url || url.startsWith("file://")) {
    console.log(`[KnowledgeBase] Skipping engine ingest for non-URL source ${sourceId} (handled by upload endpoint)`);
    return;
  }

  try {
    const result = await ingestionEngine.ingest({
      sourceId,
      sourceName: source.name,
      url,
      application: source.application,
      module: moduleReadable,
      moduleTag,
    });

    if (result.success) {
      console.log(
        `[KnowledgeBase] ✅ Ingestion COMPLETE for ${source.name} — ` +
        `${result.storage?.itemsStored ?? 0} items stored (${result.validation?.rejected ?? 0} rejected), ` +
        `RAG-indexed: ${result.storage?.indexedForRAG}, took ${result.totalDurationMs}ms`
      );
    } else {
      console.error(`[KnowledgeBase] ❌ Ingestion FAILED for ${source.name}: ${result.errorMessage}`);
    }
  } catch (error: any) {
    console.error(`[KnowledgeBase] ❌ Ingestion EXCEPTION for ${sourceId}:`, error.message);
    try {
      await knowledgeStorage.updateIngestionStatus(sourceId, "FAILED", error.message);
    } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE UPLOAD INGESTION
// Accepts: PPTX, PDF, DOCX, Images (PNG/JPG/GIF/BMP/WEBP), TXT, MD, CSV
// Body: multipart/form-data with `file` + metadata fields
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/sources/upload", knowledgeUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: "No file provided. Send as multipart 'file' field." });
    }

    const { name, moduleTag, application, sourceType } = req.body || {};
    if (!moduleTag || !application) {
      return res.status(400).json({ error: "moduleTag and application are required" });
    }

    const filename = file.originalname || "uploaded";
    const ext = nodePath.extname(filename).toLowerCase();
    const displayName = name || filename;

    // ── IDEMPOTENT INGESTION ──────────────────────────────────────────────────
    // Detect "same file uploaded again" (skip) vs "content changed" (re-ingest in
    // place) so we never store duplicate records for the same document.
    const checksum = sha256(file.buffer);
    const decision = await resolveIngestionTarget(
      { application, moduleTag, name: displayName },
      checksum,
      file.size
    );

    if (decision.action === "skip") {
      console.log(`[KnowledgeBase] ⏭️  Upload skipped — ${decision.reason}: ${displayName}`);
      return res.status(200).json({
        ...decision.source,
        skipped: true,
        alreadyAvailable: true,
        message: `Already available — ${decision.reason}. Document was not re-ingested.`,
        filename,
        fileSize: file.size,
      });
    }

    // create / update / resume → we (re)use one source record.
    let source: any;
    if (decision.action === "create") {
      source = await knowledgeStorage.createKnowledgeSource({
        name: displayName,
        sourceType: sourceType || "FILE_UPLOAD",
        // source_url is NOT NULL in the DB — use a synthetic uri for uploads
        sourceUrl: `file:///uploaded/${encodeURIComponent(filename)}`,
        moduleTag,
        application,
        authType: "NONE",
        status: "PENDING",
        documentCount: 0,
        checksum,
        contentSize: file.size,
      } as any);
    } else {
      source = decision.source;
      console.log(`[KnowledgeBase] ♻️  Upload ${decision.action} — ${decision.reason}: ${displayName}`);
      await knowledgeStorage.updateKnowledgeSource(source.id, {
        status: "PENDING",
        errorMessage: undefined,
        checksum,
        contentSize: file.size,
      } as any);
    }

    if (!source?.id) {
      return res.status(500).json({ error: "Failed to create source record" });
    }

    const moduleReadable = String(moduleTag)
      .replace(/^[A-Z]+_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    // 2) Kick off REAL ingestion asynchronously with the buffer in memory
    ingestionEngine
      .ingest({
        sourceId: source.id,
        sourceName: filename,
        buffer: file.buffer,
        mimeType: file.mimetype,
        extension: ext,
        application,
        module: moduleReadable,
        moduleTag,
      })
      .then(async (result) => {
        // Persist the fingerprint so a future identical upload is skipped.
        if (result.success) await recordSourceFingerprint(source.id, checksum, file.size);
        console.log(
          `[KnowledgeBase] ✅ Upload ingestion COMPLETE for ${filename} — ` +
          `${result.storage?.itemsStored ?? 0} items, success=${result.success}`
        );
      })
      .catch((err) => {
        console.error("[KnowledgeBase] Upload ingestion error:", err);
      });

    // 3) Respond immediately with the source so the UI can poll for status
    res.status(201).json({
      ...source,
      action: decision.action,
      message:
        decision.action === "create"
          ? "Upload accepted. Ingestion started."
          : `Existing document ${decision.action === "update" ? "updated" : "resumed"}. Re-ingestion started.`,
      filename,
      fileSize: file.size,
    });
  } catch (error: any) {
    console.error("[KnowledgeBase] Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to process upload" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREVIEW (no-store): Extract + structure + validate so the user can confirm
// before committing to the database.
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/preview", knowledgeUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    const { url, name, moduleTag, application } = req.body || {};

    if (!file && !url) {
      return res.status(400).json({ error: "Provide either a 'file' (multipart) or 'url' (form field)." });
    }

    const filename =
      file?.originalname ||
      name ||
      (url ? (url as string).split("/").pop() || "preview" : "preview");
    const moduleReadable = moduleTag
      ? String(moduleTag).replace(/^[A-Z]+_/, "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      : undefined;

    const preview = await ingestionEngine.preview({
      sourceName: filename,
      buffer: file?.buffer,
      url,
      mimeType: file?.mimetype,
      extension: file ? nodePath.extname(file.originalname).toLowerCase() : undefined,
      application,
      module: moduleReadable,
      moduleTag,
    });

    if (!preview.success) {
      return res.status(422).json({
        success: false,
        error: preview.errorMessage || "Preview failed",
      });
    }

    res.json({
      success: true,
      extraction: {
        units: preview.extraction?.units?.length || 0,
        wordCount: preview.extraction?.metadata?.wordCount,
        warnings: preview.extraction?.metadata?.warnings,
        sampleText: preview.extraction?.fullText?.slice(0, 800),
      },
      knowledge: preview.knowledge || [],
      rejected: preview.rejected || [],
      counts: {
        total: (preview.knowledge?.length || 0) + (preview.rejected?.length || 0),
        valid: preview.knowledge?.length || 0,
        rejected: preview.rejected?.length || 0,
      },
    });
  } catch (error: any) {
    console.error("[KnowledgeBase] Preview error:", error);
    res.status(500).json({ error: error.message || "Failed to preview" });
  }
});

// Trigger re-ingestion
router.post("/sources/:id/reingest", async (req: Request, res: Response) => {
  try {
    const sourceId = String(req.params.id);
    const source = await knowledgeStorage.getKnowledgeSource(sourceId);
    if (!source) {
      return res.status(404).json({ error: "Knowledge source not found" });
    }

    // Clear existing data including the RAG index
    try {
      vectorIndex.removeBySource(sourceId);
    } catch (e: any) {
      console.warn("[KnowledgeBase] Vector cleanup non-fatal:", e.message);
    }
    await knowledgeStorage.deleteRawDocumentsBySource(sourceId);
    await knowledgeStorage.deleteStructuredKnowledgeBySource(sourceId);

    // Reset status to PENDING
    await knowledgeStorage.updateIngestionStatus(sourceId, "PENDING");

    // Trigger async ingestion (non-blocking) - URL sources only.
    // File-upload sources cannot be re-ingested because the original buffer is
    // no longer available; user must re-upload the file.
    if (source.sourceUrl && !source.sourceUrl.startsWith("file://")) {
      processIngestion(sourceId).catch((err) => {
        console.error("[KnowledgeBase] Async ingestion error:", err);
      });
      res.json({ message: "Re-ingestion started", sourceId, status: "INGESTING" });
    } else {
      res.status(400).json({
        error: "File-upload sources cannot be auto-reingested. Please re-upload the file.",
        sourceId,
      });
    }
  } catch (error: any) {
    console.error("[KnowledgeBase] Error triggering re-ingestion:", error);
    res.status(500).json({ error: "Failed to trigger re-ingestion" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURED KNOWLEDGE
// ═══════════════════════════════════════════════════════════════════════════════

// Search structured knowledge
router.get("/knowledge", async (req: Request, res: Response) => {
  try {
    const { application, module, objectName, knowledgeType } = req.query;
    const knowledge = await knowledgeStorage.searchStructuredKnowledge({
      application: application as string,
      module: module as string,
      objectName: objectName as string,
      knowledgeType: knowledgeType as string,
    });
    res.json(knowledge);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error searching knowledge:", error);
    res.status(500).json({ error: "Failed to search knowledge" });
  }
});

// Get knowledge by module
router.get("/knowledge/module/:module", async (req: Request, res: Response) => {
  try {
    const knowledge = await knowledgeStorage.getStructuredKnowledgeByModule(String(req.params.module));
    res.json(knowledge);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching knowledge by module:", error);
    res.status(500).json({ error: "Failed to fetch knowledge" });
  }
});

// Get knowledge by object name (e.g., P4310, ME21N)
router.get("/knowledge/object/:objectName", async (req: Request, res: Response) => {
  try {
    const knowledge = await knowledgeStorage.getStructuredKnowledgeByObject(String(req.params.objectName));
    res.json(knowledge);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching knowledge by object:", error);
    res.status(500).json({ error: "Failed to fetch knowledge" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOVERNANCE RULES
// ═══════════════════════════════════════════════════════════════════════════════

// Get all governance rules
router.get("/governance", async (req: Request, res: Response) => {
  try {
    const rules = await knowledgeStorage.getAllGovernanceRules();
    res.json(rules);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching governance rules:", error);
    res.status(500).json({ error: "Failed to fetch governance rules" });
  }
});

// Get governance rule by application/module
router.get("/governance/:application/:module", async (req: Request, res: Response) => {
  try {
    const rule = await knowledgeStorage.getGovernanceRuleByModule(
      String(req.params.application),
      String(req.params.module)
    );
    if (!rule) {
      return res.status(404).json({ error: "Governance rule not found" });
    }
    res.json(rule);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching governance rule:", error);
    res.status(500).json({ error: "Failed to fetch governance rule" });
  }
});

// Create governance rule
router.post("/governance", async (req: Request, res: Response) => {
  try {
    const validation = insertGovernanceRuleSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }
    
    const rule = await knowledgeStorage.createGovernanceRule(validation.data);
    res.status(201).json(rule);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error creating governance rule:", error);
    res.status(500).json({ error: "Failed to create governance rule" });
  }
});

// Update governance rule
router.patch("/governance/:id", async (req: Request, res: Response) => {
  try {
    const rule = await knowledgeStorage.updateGovernanceRule(String(req.params.id), req.body);
    if (!rule) {
      return res.status(404).json({ error: "Governance rule not found" });
    }
    res.json(rule);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error updating governance rule:", error);
    res.status(500).json({ error: "Failed to update governance rule" });
  }
});

// Delete governance rule
router.delete("/governance/:id", async (req: Request, res: Response) => {
  try {
    await knowledgeStorage.deleteGovernanceRule(String(req.params.id));
    res.status(204).send();
  } catch (error: any) {
    console.error("[KnowledgeBase] Error deleting governance rule:", error);
    res.status(500).json({ error: "Failed to delete governance rule" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RAG QUERY ENDPOINT (for test generation)
// Returns governance rules + structured knowledge filtered by application/module.
// If `question` is provided, also runs RAG semantic+keyword search.
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/query", async (req: Request, res: Response) => {
  try {
    const { module, application, objectName, question, topK } = req.body;

    if (!module || !application) {
      return res.status(400).json({ error: "module and application are required" });
    }

    // Get governance rules
    const governance = await knowledgeStorage.getGovernanceRuleByModule(application, module);

    // Get structured knowledge (filter-based - exact match)
    const knowledge = await knowledgeStorage.searchStructuredKnowledge({
      application,
      module,
      objectName,
    });

    // If a `question` was supplied, run hybrid RAG search to find the most
    // semantically relevant knowledge. Otherwise return the filter results.
    let ragResults: any[] = [];
    if (question && typeof question === "string" && question.trim().length > 0) {
      try {
        ragResults = await ingestionEngine.retrieve(question, {
          application,
          module,
          objectName,
          topK: typeof topK === "number" ? topK : 8,
        });
      } catch (e: any) {
        console.warn("[KnowledgeBase] RAG retrieval failed (non-fatal):", e.message);
      }
    }

    // Transform to RAG-ready format
    const context = {
      module,
      application,
      governance: governance || null,
      knowledge: knowledge.map((k) => ({
        objectName: k.objectName,
        knowledgeType: k.knowledgeType,
        facts: k.facts,
      })),
      ragResults: ragResults.map((r) => ({
        application: r.entry.metadata.application,
        module: r.entry.metadata.module,
        objectName: r.entry.metadata.objectName,
        knowledgeType: r.entry.metadata.knowledgeType,
        score: r.score,
        semanticScore: r.semanticScore,
        keywordScore: r.keywordScore,
        snippet: r.entry.chunkText.slice(0, 500),
      })),
      allowedTestTypes: governance
        ? ["FUNCTIONAL", "CONFIGURATION", "INTEGRATION"].filter((t) => !governance.blockedTestTypes.includes(t))
        : ["FUNCTIONAL", "CONFIGURATION", "INTEGRATION"],
      blockedTestTypes: governance?.blockedTestTypes || [],
      requiredObjects: governance?.requiredObjects || [],
      requiredTables: governance?.requiredTables || [],
      businessFlow: governance?.businessFlowOrder || [],
    };

    res.json(context);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error querying knowledge:", error);
    res.status(500).json({ error: "Failed to query knowledge base" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RAG RETRIEVE ENDPOINT (pure vector search, no governance)
// Used by the test generator to inject the top-K most relevant knowledge into
// the prompt.
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/retrieve", async (req: Request, res: Response) => {
  try {
    const { query, application, module, objectName, topK } = req.body || {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "`query` is required and must be a string" });
    }

    const results = await ingestionEngine.retrieve(query, {
      application,
      module,
      objectName,
      topK: typeof topK === "number" ? topK : 8,
    });

    res.json({
      query,
      count: results.length,
      results: results.map((r) => ({
        knowledgeId: r.entry.knowledgeId,
        sourceId: r.entry.sourceId,
        application: r.entry.metadata.application,
        module: r.entry.metadata.module,
        objectName: r.entry.metadata.objectName,
        knowledgeType: r.entry.metadata.knowledgeType,
        score: r.score,
        semanticScore: r.semanticScore,
        keywordScore: r.keywordScore,
        reason: r.reason,
        snippet: r.entry.chunkText.slice(0, 500),
      })),
      stats: vectorIndex.getStats(),
    });
  } catch (error: any) {
    console.error("[KnowledgeBase] Error in /retrieve:", error);
    res.status(500).json({ error: error.message || "Failed to retrieve" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH / INTEGRATION CHECK
// Verifies that DB + Vector Index + Extractors + AI client + End-to-end
// retrieval are all wired correctly. Use this before relying on the KB for
// test generation.
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const { checkKBIntegrationHealth } = await import("./knowledge/rag-helper");
    const health = await checkKBIntegrationHealth();
    const httpStatus = health.overall === "BROKEN" ? 503 : 200;
    res.status(httpStatus).json(health);
  } catch (error: any) {
    res.status(500).json({
      overall: "BROKEN",
      checks: [{ name: "Health endpoint", status: "FAIL", detail: error.message }],
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SHAREPOINT CRAWLER
// Adds a SharePoint site as a knowledge source. Each discovered file becomes
// its own KnowledgeSource row and runs through the standard ingestion pipeline.
// Body:
//   {
//     name: "JDE SharePoint Docs",
//     siteUrl: "https://contoso.sharepoint.com/sites/JDEDocs",
//     folderPath: "Shared Documents/Specs",
//     accessToken: "<oauth bearer>",
//     application: "JDE",
//     moduleTag: "JDE_PROCUREMENT",
//     applicationScope: ["JDE"],
//     maxFiles: 50
//   }
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/sources/sharepoint", async (req: Request, res: Response) => {
  try {
    const {
      name,
      siteUrl,
      folderPath,
      accessToken,
      application,
      moduleTag,
      applicationScope,
      maxFiles,
      maxDepth,
    } = req.body || {};

    if (!siteUrl || !accessToken || !moduleTag || !application) {
      return res.status(400).json({
        error: "siteUrl, accessToken, application, and moduleTag are required",
      });
    }

    // 1) Create the parent SharePoint source so the UI shows it as one entry
    const parentSource = await knowledgeStorage.createKnowledgeSource({
      name: name || `SharePoint: ${siteUrl}`,
      sourceType: "SHAREPOINT",
      sourceUrl: siteUrl,
      moduleTag,
      application,
      authType: "OAUTH",
      // We intentionally do NOT persist the bearer token - it stays in memory.
      status: "PENDING",
      documentCount: 0,
    } as any);

    if (!parentSource.id) {
      return res.status(500).json({ error: "Failed to create source record" });
    }

    // 2) Kick off the crawl asynchronously
    const { sharePointConnector } = await import("./knowledge/sharepoint-connector");
    sharePointConnector
      .crawlAndIngest(parentSource.id, {
        siteUrl,
        folderPath,
        accessToken,
        application,
        moduleTag,
        applicationScope,
        maxFiles,
        maxDepth,
      })
      .then((result) => {
        console.log(
          `[KnowledgeBase] SharePoint crawl complete: ` +
          `${result.filesIngested}/${result.filesFound} ingested, ${result.errors.length} errors`
        );
      })
      .catch((err) => {
        console.error("[KnowledgeBase] SharePoint crawl crashed:", err);
      });

    // 3) Respond immediately - the UI will poll for status
    res.status(201).json({
      ...parentSource,
      message: "SharePoint crawl started. Each discovered file will appear as a separate source.",
    });
  } catch (error: any) {
    console.error("[KnowledgeBase] SharePoint error:", error);
    res.status(500).json({ error: error.message || "SharePoint crawl failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SHAREPOINT SSO BROWSER CRAWLER (no token)
// Crawls an on-prem / SSO-protected SharePoint library using the SAME persistent
// Chrome profile the test executor uses for JDE SSO. The user signs in ONCE in the
// opened browser; the crawler then enumerates + downloads + ingests every supported
// file. Use this for sites Microsoft Graph cannot reach (e.g. worksites.baxter.com).
// Body:
//   {
//     name: "JDE Supply Chain SOPs",
//     libraryUrl: "https://worksites.baxter.com/sites/.../AllItems.aspx?RootFolder=/sites/.../SOP",
//     application: "JDE",
//     moduleTag: "JDE_SUPPLYCHAIN",
//     recursive: true,
//     maxFiles: 200
//   }
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/sources/sharepoint-sso", async (req: Request, res: Response) => {
  try {
    const {
      name,
      libraryUrl,
      application,
      moduleTag,
      recursive,
      maxFiles,
      maxDepth,
    } = req.body || {};

    if (!libraryUrl || !moduleTag || !application) {
      return res.status(400).json({
        error: "libraryUrl, application, and moduleTag are required",
      });
    }

    // Basic URL sanity check so we fail fast instead of launching a browser for junk.
    try {
      // eslint-disable-next-line no-new
      new URL(libraryUrl);
    } catch {
      return res.status(400).json({ error: "libraryUrl is not a valid URL" });
    }

    // 1) Create the parent source so the UI shows it as one entry.
    const parentSource = await knowledgeStorage.createKnowledgeSource({
      name: name || `SharePoint (SSO): ${libraryUrl}`,
      sourceType: "SHAREPOINT",
      sourceUrl: libraryUrl,
      moduleTag,
      application,
      authType: "NONE", // session-cookie based; nothing is stored
      status: "PENDING",
      documentCount: 0,
    } as any);

    if (!parentSource.id) {
      return res.status(500).json({ error: "Failed to create source record" });
    }

    // 2) Kick off the SSO crawl asynchronously (opens a headed Chrome window).
    const { sharePointSsoCrawler } = await import("./knowledge/sharepoint-sso-crawler");
    sharePointSsoCrawler
      .crawlAndIngest(parentSource.id, {
        libraryUrl,
        application,
        moduleTag,
        recursive: recursive !== false,
        maxFiles: typeof maxFiles === "number" ? maxFiles : undefined,
        maxDepth: typeof maxDepth === "number" ? maxDepth : undefined,
      })
      .then((result) => {
        console.log(
          `[KnowledgeBase] SharePoint SSO crawl complete: ` +
          `${result.filesIngested}/${result.filesFound} ingested, ${result.errors.length} errors`
        );
      })
      .catch((err) => {
        console.error("[KnowledgeBase] SharePoint SSO crawl crashed:", err);
      });

    // 3) Respond immediately — the UI polls for status.
    res.status(201).json({
      ...parentSource,
      message:
        "SharePoint SSO crawl started. A Chrome window will open — sign in once if prompted. " +
        "Each discovered file will appear as a separate source.",
    });
  } catch (error: any) {
    console.error("[KnowledgeBase] SharePoint SSO error:", error);
    res.status(500).json({ error: error.message || "SharePoint SSO crawl failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATS ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const sources = await knowledgeStorage.getAllKnowledgeSources();
    const rules = await knowledgeStorage.getAllGovernanceRules();
    
    const stats = {
      totalSources: sources.length,
      sourcesByStatus: sources.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      sourcesByApplication: sources.reduce((acc, s) => {
        acc[s.application] = (acc[s.application] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalDocuments: sources.reduce((sum, s) => sum + (s.documentCount || 0), 0),
      totalGovernanceRules: rules.length,
      activeGovernanceRules: rules.filter(r => r.isActive).length,
    };
    
    res.json(stats);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
