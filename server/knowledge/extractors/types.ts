/**
 * AITAS Knowledge Base - Extractor Type Definitions
 * ═══════════════════════════════════════════════════════════════════════════════
 * Common types for all content extractors (PPT, PDF, Image, DOCX, URL)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Source type that the extractor handles
 */
export type ExtractorSourceType =
  | "PPTX"
  | "PPT"
  | "PDF"
  | "DOCX"
  | "IMAGE"
  | "URL"
  | "TEXT"
  | "MARKDOWN";

/**
 * A single extracted unit (slide, page, image region, section)
 * This is the lowest-level RAW extraction before AI structuring.
 */
export interface ExtractedUnit {
  /** Sequential unit number (slide #, page #, etc.) */
  unitNumber: number;
  /** Type of unit */
  unitType: "SLIDE" | "PAGE" | "SECTION" | "IMAGE_REGION" | "TABLE" | "CHART";
  /** Title or heading of this unit */
  title?: string;
  /** Main textual content */
  content: string;
  /** Bullet points, list items */
  bullets?: string[];
  /** Tables found in this unit (rows of cells) */
  tables?: Array<{
    headers?: string[];
    rows: string[][];
  }>;
  /** Speaker notes (PPT) */
  notes?: string;
  /** OCR or layout-detected UI elements (Image) */
  uiElements?: Array<{
    type: "BUTTON" | "INPUT" | "LABEL" | "LINK" | "CHECKBOX" | "DROPDOWN" | "TEXT" | "UNKNOWN";
    text: string;
    confidence?: number;
  }>;
  /** Detected diagram/flow shapes */
  shapes?: Array<{
    type: "FLOWCHART" | "ARROW" | "BOX" | "DECISION" | "UNKNOWN";
    text?: string;
  }>;
  /** OCR confidence (for images) */
  confidence?: number;
}

/**
 * Complete extraction result for a single source file/url
 */
export interface ExtractionResult {
  /** Source type used for extraction */
  sourceType: ExtractorSourceType;
  /** Original file name or URL */
  sourceName: string;
  /** File size in bytes (if file) */
  sizeBytes?: number;
  /** Total units extracted */
  totalUnits: number;
  /** All extracted units */
  units: ExtractedUnit[];
  /** Aggregated full text (useful for embeddings) */
  fullText: string;
  /** Top-level metadata */
  metadata: {
    fileName?: string;
    fileType?: string;
    pageCount?: number;
    slideCount?: number;
    wordCount: number;
    extractedAt: string;
    durationMs: number;
    /** Any warnings during extraction (not failures) */
    warnings?: string[];
  };
  /** True if extraction had issues but partial data is available */
  hasPartialData?: boolean;
}

/**
 * Common interface every extractor implements
 */
export interface IContentExtractor {
  /** Extractor name for logs */
  readonly name: string;
  /** Source types this extractor supports */
  readonly supportedTypes: ExtractorSourceType[];
  /** Whether the buffer/url is supported */
  canExtract(input: ExtractorInput): boolean;
  /** Perform extraction */
  extract(input: ExtractorInput): Promise<ExtractionResult>;
}

/**
 * Input to any extractor - either a file buffer or a URL
 */
export interface ExtractorInput {
  sourceName: string;
  mimeType?: string;
  extension?: string;
  buffer?: Buffer;
  url?: string;
  /** Optional hints (e.g., language for OCR) */
  hints?: {
    language?: string;
    moduleTag?: string;
    application?: string;
  };
}

/**
 * Extractor error - used to signal recoverable extraction failures
 */
export class ExtractorError extends Error {
  constructor(
    message: string,
    public readonly extractor: string,
    public readonly sourceType: ExtractorSourceType,
    public readonly cause?: any
  ) {
    super(message);
    this.name = "ExtractorError";
  }
}
