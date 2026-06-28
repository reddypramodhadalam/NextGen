/**
 * AI Knowledge Structurer
 * ═══════════════════════════════════════════════════════════════════════════════
 * Converts raw extracted content (PPT slides, PDF pages, images, etc.) into
 * structured, validated, canonical knowledge for the Knowledge Base.
 *
 * Key principles:
 * - STRICT JSON output (validated against schema)
 * - NO hallucination (only extract what's in the source)
 * - DEDUPLICATION at process/object level
 * - CONFIDENCE SCORING for each extracted fact
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { getAiClient } from "../ai-client";
import type { ExtractionResult, ExtractedUnit } from "./extractors/types";

export type StructuredKnowledgeType =
  | "PROCESS"
  | "CONFIGURATION"
  | "INTEGRATION"
  | "TABLE_SCHEMA"
  | "BUSINESS_RULE"
  | "WORKFLOW"
  | "REPORT"
  | "UI_FLOW";

export interface StructuredFact {
  /** Description of the process/object */
  description?: string;
  /** Step-by-step business process or UI flow */
  businessProcess?: string[];
  /** Related ERP/system objects (P4310, ME21N, F4311 etc.) */
  relatedObjects?: string[];
  /** Database tables (F4311, EKKO etc.) */
  tables?: string[];
  /** Form fields / input fields */
  fields?: Array<{ name: string; description?: string; dataType?: string }>;
  /** Configuration settings */
  configurations?: string[];
  /** Required pre-conditions */
  prerequisites?: string[];
  /** Integration points with other systems */
  integrations?: string[];
  /** Validation rules / business rules */
  validations?: string[];
  /** Testable actions (Create, Approve, Cancel, etc.) */
  testableActions?: string[];
  /** Specific testing scenarios derived from the content */
  testPoints?: string[];
  /** UI elements detected (for image sources) */
  uiElements?: Array<{ type: string; text: string }>;
}

/**
 * Final canonical knowledge item ready to be saved to DB.
 */
export interface CanonicalKnowledge {
  application: string;
  module: string;
  objectName: string;
  knowledgeType: StructuredKnowledgeType;
  facts: StructuredFact;
  confidenceScore: number; // 0-100
  /** Where in the source this came from (slide #, page #) */
  sourceUnit?: number;
  /** Reasoning the AI used (for audit/debug) */
  reasoning?: string;
}

/**
 * Result of running structuring on a full ExtractionResult
 */
export interface StructuringResult {
  /** All canonical knowledge items extracted */
  knowledge: CanonicalKnowledge[];
  /** Overall confidence (0-100) */
  overallConfidence: number;
  /** Issues encountered during structuring */
  warnings: string[];
  /** Total tokens / cost (if available) */
  metrics: {
    chunksProcessed: number;
    aiCallsMade: number;
    durationMs: number;
  };
}

/**
 * The strict system prompt that controls AI structuring.
 * Designed to prevent hallucination and enforce schema compliance.
 */
const STRUCTURING_SYSTEM_PROMPT = `You are an Enterprise QA Knowledge Engineer for AITAS test automation platform.

Your task: Convert extracted documentation content into STRUCTURED, AUTHORITATIVE knowledge.

═══════════════════════════════════════════════════════════════════════════════
STRICT RULES (NON-NEGOTIABLE):
═══════════════════════════════════════════════════════════════════════════════
1. ONLY extract facts that are EXPLICITLY in the provided content.
2. NEVER hallucinate object IDs, table names, or field names.
3. NEVER invent business processes that aren't described.
4. If you're not sure, OMIT the field rather than guess.
5. Confidence MUST reflect actual evidence in the content.
6. Do NOT generate UI selectors (xpath, css) - those are runtime artifacts.
7. Do NOT generate test scripts - only knowledge facts.

═══════════════════════════════════════════════════════════════════════════════
WHAT TO EXTRACT:
═══════════════════════════════════════════════════════════════════════════════
- Business processes (sequence of business steps)
- Application objects (JDE programs like P4310, SAP T-codes like ME21N, Salesforce objects)
- Database tables (JDE F-files, SAP tables, Salesforce sObjects)
- Form fields and their data types
- Validation rules and business constraints
- Integration points between systems
- Test-worthy scenarios

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Return a JSON array of knowledge items. Each item:
{
  "objectName": "P4310" | "ME21N" | "Opportunity" | "LOGIN_FLOW" | etc.,
  "knowledgeType": "PROCESS" | "WORKFLOW" | "BUSINESS_RULE" | "TABLE_SCHEMA" | "CONFIGURATION" | "INTEGRATION" | "UI_FLOW",
  "facts": {
    "description": "Brief description (1-2 sentences max)",
    "businessProcess": ["Step 1", "Step 2", ...],
    "relatedObjects": ["P4312", "F4311"],
    "tables": ["F4311"],
    "fields": [{"name": "Supplier Number", "dataType": "string"}],
    "validations": ["Supplier must be active"],
    "prerequisites": ["User has procurement role"],
    "integrations": ["F0401 Address Book"],
    "testableActions": ["Create", "Approve", "Cancel"],
    "testPoints": ["Test approval workflow for high-value orders"]
  },
  "confidenceScore": 85,
  "reasoning": "Found explicit reference to P4310 with detailed process flow"
}

═══════════════════════════════════════════════════════════════════════════════
CRITICAL: Output MUST be valid JSON array. NO markdown. NO commentary.
If you find NOTHING extractable, return an empty array: []
═══════════════════════════════════════════════════════════════════════════════`;

export class KnowledgeStructurer {
  /** Maximum chars to send to AI per chunk */
  private readonly MAX_CHUNK_CHARS = 12000;
  /** Maximum knowledge items per chunk (to keep responses bounded) */
  private readonly MAX_ITEMS_PER_CHUNK = 10;

  /**
   * Structure an extracted document into canonical knowledge items.
   */
  async structure(
    extraction: ExtractionResult,
    options: {
      application?: string;
      module?: string;
      moduleTag?: string;
    } = {}
  ): Promise<StructuringResult> {
    const started = Date.now();
    const warnings: string[] = [];
    const allKnowledge: CanonicalKnowledge[] = [];
    let aiCallsMade = 0;

    // Build chunks for AI processing - group units to fit context window
    const chunks = this.chunkUnits(extraction.units, this.MAX_CHUNK_CHARS);
    console.log(
      `[KnowledgeStructurer] Processing ${chunks.length} chunks from ${extraction.totalUnits} units`
    );

    const aiClient = await getAiClient();

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const items = await this.structureChunk(
          aiClient,
          chunk,
          extraction.sourceType,
          options
        );
        aiCallsMade++;
        allKnowledge.push(...items);
        console.log(
          `[KnowledgeStructurer] Chunk ${i + 1}/${chunks.length}: extracted ${items.length} items`
        );
      } catch (e: any) {
        warnings.push(`Chunk ${i + 1} failed: ${e.message}`);
        console.error(`[KnowledgeStructurer] Chunk ${i + 1} failed:`, e.message);
      }
    }

    // Deduplicate by objectName + knowledgeType
    const deduped = this.deduplicate(allKnowledge);
    if (deduped.length < allKnowledge.length) {
      warnings.push(
        `Deduplicated ${allKnowledge.length - deduped.length} redundant entries`
      );
    }

    // Override application/module if specified
    if (options.application || options.module) {
      for (const item of deduped) {
        if (options.application) item.application = options.application;
        if (options.module) item.module = options.module;
      }
    }

    // Default fill missing fields
    for (const item of deduped) {
      if (!item.application) item.application = "CUSTOM";
      if (!item.module) item.module = options.moduleTag || "General";
    }

    const overallConfidence =
      deduped.length > 0
        ? Math.round(
            deduped.reduce((sum, k) => sum + k.confidenceScore, 0) / deduped.length
          )
        : 0;

    return {
      knowledge: deduped,
      overallConfidence,
      warnings,
      metrics: {
        chunksProcessed: chunks.length,
        aiCallsMade,
        durationMs: Date.now() - started,
      },
    };
  }

  /**
   * Run a single AI call on a chunk of content.
   */
  private async structureChunk(
    aiClient: any,
    chunk: { unitText: string; unitNumbers: number[] },
    sourceType: string,
    options: { application?: string; module?: string; moduleTag?: string }
  ): Promise<CanonicalKnowledge[]> {
    const userPrompt = this.buildUserPrompt(chunk.unitText, sourceType, options);

    const response = await aiClient.chat(
      [{ role: "user", content: userPrompt }],
      STRUCTURING_SYSTEM_PROMPT
    );

    // Parse and validate JSON output
    const parsed = this.parseAIResponse(response);

    // Normalize and add source unit metadata
    return parsed.map((item) => ({
      application: (item.application || options.application || "CUSTOM").toUpperCase(),
      module: item.module || options.module || options.moduleTag || "General",
      objectName: item.objectName || "UNKNOWN",
      knowledgeType: this.normalizeType(item.knowledgeType),
      facts: this.cleanFacts(item.facts || {}),
      confidenceScore: this.clamp(item.confidenceScore || item.confidence || 70, 0, 100),
      sourceUnit: chunk.unitNumbers[0],
      reasoning: item.reasoning,
    }));
  }

  /**
   * Build the user prompt for the structuring AI call.
   */
  private buildUserPrompt(
    content: string,
    sourceType: string,
    options: { application?: string; module?: string; moduleTag?: string }
  ): string {
    let contextHint = "";
    if (options.application) {
      contextHint += `\nTarget application: ${options.application}`;
    }
    if (options.moduleTag) {
      contextHint += `\nTarget module: ${options.moduleTag}`;
    }
    contextHint += `\nSource type: ${sourceType}`;

    return `Extract structured knowledge from the following content:
${contextHint}

═══════════════════════════════════════════════════════════════════════════════
CONTENT:
═══════════════════════════════════════════════════════════════════════════════
${content}

═══════════════════════════════════════════════════════════════════════════════
Return JSON array of knowledge items per the schema in your instructions.
Extract a maximum of ${this.MAX_ITEMS_PER_CHUNK} items per response.
If nothing extractable, return: []`;
  }

  /**
   * Parse AI response - extract JSON array, handle markdown wrapping.
   */
  private parseAIResponse(response: string): any[] {
    if (!response) return [];

    // Strip markdown code fences
    let cleaned = response.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

    // Find first [ ... last ]
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket === -1 || lastBracket === -1) {
      console.warn("[KnowledgeStructurer] No JSON array found in response");
      return [];
    }

    const jsonStr = cleaned.substring(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e: any) {
      console.warn(
        `[KnowledgeStructurer] Failed to parse JSON: ${e.message}. First 200 chars: ${jsonStr.substring(0, 200)}`
      );
      return [];
    }
  }

  /**
   * Chunk units into AI-sized pieces.
   * Groups consecutive units while staying under MAX_CHUNK_CHARS.
   */
  private chunkUnits(
    units: ExtractedUnit[],
    maxChars: number
  ): Array<{ unitText: string; unitNumbers: number[] }> {
    const chunks: Array<{ unitText: string; unitNumbers: number[] }> = [];
    let current = { unitText: "", unitNumbers: [] as number[] };

    for (const unit of units) {
      const unitText = this.unitToText(unit);
      if (current.unitText.length + unitText.length > maxChars && current.unitText.length > 0) {
        chunks.push(current);
        current = { unitText: "", unitNumbers: [] };
      }
      current.unitText += (current.unitText ? "\n\n---\n\n" : "") + unitText;
      current.unitNumbers.push(unit.unitNumber);
    }
    if (current.unitText.length > 0) chunks.push(current);

    return chunks;
  }

  /**
   * Convert an ExtractedUnit to a plain-text representation for the AI.
   */
  private unitToText(unit: ExtractedUnit): string {
    const parts: string[] = [];
    parts.push(`[${unit.unitType} ${unit.unitNumber}]${unit.title ? ` ${unit.title}` : ""}`);
    if (unit.content) parts.push(unit.content);
    if (unit.bullets && unit.bullets.length > 0) {
      parts.push(unit.bullets.map((b) => `• ${b}`).join("\n"));
    }
    if (unit.tables && unit.tables.length > 0) {
      for (const tbl of unit.tables) {
        if (tbl.headers) parts.push("TABLE: " + tbl.headers.join(" | "));
        for (const row of tbl.rows.slice(0, 20)) {
          parts.push("        " + row.join(" | "));
        }
      }
    }
    if (unit.notes) parts.push(`[Notes] ${unit.notes}`);
    if (unit.uiElements && unit.uiElements.length > 0) {
      parts.push(
        "UI ELEMENTS: " +
          unit.uiElements.map((e) => `${e.type}:"${e.text}"`).join(", ")
      );
    }
    return parts.join("\n");
  }

  /**
   * Deduplicate knowledge items by (objectName, knowledgeType, module).
   * Merges facts and keeps highest confidence.
   */
  private deduplicate(items: CanonicalKnowledge[]): CanonicalKnowledge[] {
    const map = new Map<string, CanonicalKnowledge>();

    for (const item of items) {
      const key = `${item.application}::${item.module}::${item.objectName}::${item.knowledgeType}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
      } else {
        // Merge facts
        existing.facts = this.mergeFacts(existing.facts, item.facts);
        existing.confidenceScore = Math.max(existing.confidenceScore, item.confidenceScore);
      }
    }

    return Array.from(map.values());
  }

  private mergeFacts(a: StructuredFact, b: StructuredFact): StructuredFact {
    const mergeArr = (x?: string[], y?: string[]) =>
      Array.from(new Set([...(x || []), ...(y || [])]));
    return {
      description: a.description || b.description,
      businessProcess: mergeArr(a.businessProcess, b.businessProcess),
      relatedObjects: mergeArr(a.relatedObjects, b.relatedObjects),
      tables: mergeArr(a.tables, b.tables),
      fields: [...(a.fields || []), ...(b.fields || [])].slice(0, 50),
      configurations: mergeArr(a.configurations, b.configurations),
      prerequisites: mergeArr(a.prerequisites, b.prerequisites),
      integrations: mergeArr(a.integrations, b.integrations),
      validations: mergeArr(a.validations, b.validations),
      testableActions: mergeArr(a.testableActions, b.testableActions),
      testPoints: mergeArr(a.testPoints, b.testPoints),
      uiElements: [...(a.uiElements || []), ...(b.uiElements || [])],
    };
  }

  private cleanFacts(facts: any): StructuredFact {
    const cleaned: StructuredFact = {};
    if (facts.description) cleaned.description = String(facts.description).trim();
    if (Array.isArray(facts.businessProcess))
      cleaned.businessProcess = facts.businessProcess.map((s: any) => String(s).trim()).filter(Boolean);
    if (Array.isArray(facts.relatedObjects))
      cleaned.relatedObjects = facts.relatedObjects.map((s: any) => String(s).trim()).filter(Boolean);
    if (Array.isArray(facts.tables))
      cleaned.tables = facts.tables.map((s: any) => String(s).trim()).filter(Boolean);
    if (Array.isArray(facts.fields)) cleaned.fields = facts.fields;
    if (Array.isArray(facts.configurations)) cleaned.configurations = facts.configurations;
    if (Array.isArray(facts.prerequisites)) cleaned.prerequisites = facts.prerequisites;
    if (Array.isArray(facts.integrations)) cleaned.integrations = facts.integrations;
    if (Array.isArray(facts.validations)) cleaned.validations = facts.validations;
    if (Array.isArray(facts.testableActions)) cleaned.testableActions = facts.testableActions;
    if (Array.isArray(facts.testPoints)) cleaned.testPoints = facts.testPoints;
    if (Array.isArray(facts.uiElements)) cleaned.uiElements = facts.uiElements;
    return cleaned;
  }

  private normalizeType(type: any): StructuredKnowledgeType {
    const t = String(type || "").toUpperCase();
    const valid: StructuredKnowledgeType[] = [
      "PROCESS",
      "CONFIGURATION",
      "INTEGRATION",
      "TABLE_SCHEMA",
      "BUSINESS_RULE",
      "WORKFLOW",
      "REPORT",
      "UI_FLOW",
    ];
    return (valid.includes(t as StructuredKnowledgeType) ? t : "PROCESS") as StructuredKnowledgeType;
  }

  private clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Number(n) || 0));
  }
}

export const knowledgeStructurer = new KnowledgeStructurer();
