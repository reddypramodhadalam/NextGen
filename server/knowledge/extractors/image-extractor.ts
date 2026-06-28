/**
 * Image Extractor
 * ═══════════════════════════════════════════════════════════════════════════════
 * OCR + UI element classification for screenshots and UI mockups.
 * Uses tesseract.js (WASM-based) - works offline, no API key needed.
 *
 * Algorithm:
 * 1. Run OCR on the image → extract text with bounding boxes
 * 2. Heuristic UI classification based on text patterns:
 *    - "Submit", "Login", "Save" → BUTTON
 *    - "Email", "Username", "Password" → INPUT label
 *    - "[ ]", "☐", "checkbox" → CHECKBOX
 *    - "▼", "Select" → DROPDOWN
 * 3. Reconstruct rough form/flow structure
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type {
  ExtractedUnit,
  ExtractionResult,
  ExtractorInput,
  ExtractorSourceType,
  IContentExtractor,
} from "./types";
import { ExtractorError } from "./types";

export class ImageExtractor implements IContentExtractor {
  readonly name = "ImageExtractor";
  readonly supportedTypes: ExtractorSourceType[] = ["IMAGE"];

  /** Cached worker - lazy initialized */
  private worker: any = null;
  private workerPromise: Promise<any> | null = null;

  canExtract(input: ExtractorInput): boolean {
    if (!input.buffer) return false;
    const ext = (input.extension || "").toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"].includes(ext)) return true;
    const mime = (input.mimeType || "").toLowerCase();
    return mime.startsWith("image/");
  }

  /** Lazy-initialize tesseract worker (loads ~10MB WASM only when needed) */
  private async getWorker(language: string = "eng"): Promise<any> {
    if (this.worker) return this.worker;
    if (this.workerPromise) return this.workerPromise;

    this.workerPromise = (async () => {
      try {
        const tesseract = await import("tesseract.js");
        const worker = await tesseract.createWorker(language);
        this.worker = worker;
        console.log("[ImageExtractor] Tesseract worker initialized");
        return worker;
      } catch (e: any) {
        console.error("[ImageExtractor] Failed to init Tesseract:", e.message);
        this.workerPromise = null;
        throw e;
      }
    })();

    return this.workerPromise;
  }

  async extract(input: ExtractorInput): Promise<ExtractionResult> {
    if (!input.buffer) {
      throw new ExtractorError("Image extractor requires a buffer", this.name, "IMAGE");
    }

    const started = Date.now();
    const warnings: string[] = [];

    try {
      const language = input.hints?.language || "eng";
      const worker = await this.getWorker(language);

      console.log(`[ImageExtractor] OCR start: ${input.sourceName}`);
      const result = await worker.recognize(input.buffer);
      const data = result?.data || {};
      const fullText: string = data.text || "";
      const confidence: number = data.confidence || 0;

      // Extract words with positions (for layout analysis)
      const words = Array.isArray(data.words) ? data.words : [];

      // Classify UI elements from the text
      const uiElements = this.classifyUIElements(fullText, words);

      // Group OCR text into logical lines/regions
      const lines: string[] = fullText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const unit: ExtractedUnit = {
        unitNumber: 1,
        unitType: "IMAGE_REGION",
        title: this.detectScreenTitle(lines),
        content: fullText,
        bullets: lines,
        uiElements,
        confidence,
      };

      const wordCount = fullText.split(/\s+/).filter(Boolean).length;

      if (confidence < 50) {
        warnings.push(
          `Low OCR confidence (${confidence.toFixed(1)}%) - results may be inaccurate`
        );
      }

      return {
        sourceType: "IMAGE",
        sourceName: input.sourceName,
        sizeBytes: input.buffer.length,
        totalUnits: 1,
        units: [unit],
        fullText,
        metadata: {
          fileName: input.sourceName,
          fileType: "image",
          wordCount,
          extractedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
        hasPartialData: confidence < 50,
      };
    } catch (err: any) {
      throw new ExtractorError(
        `OCR extraction failed: ${err.message}`,
        this.name,
        "IMAGE",
        err
      );
    }
  }

  /**
   * Classify UI elements from OCR text using heuristics.
   * Returns a list of recognized UI components with their text.
   */
  private classifyUIElements(
    fullText: string,
    words: Array<{ text: string; bbox?: any; confidence?: number }>
  ): Array<{
    type: "BUTTON" | "INPUT" | "LABEL" | "LINK" | "CHECKBOX" | "DROPDOWN" | "TEXT" | "UNKNOWN";
    text: string;
    confidence?: number;
  }> {
    const elements: Array<any> = [];
    const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    // Common patterns
    const BUTTON_KEYWORDS = [
      "submit", "save", "login", "log in", "sign in", "sign up", "register",
      "continue", "next", "back", "cancel", "ok", "yes", "no", "delete",
      "edit", "update", "create", "add", "remove", "search", "send", "apply",
      "confirm", "accept", "decline", "approve", "reject", "close",
    ];
    const INPUT_LABEL_KEYWORDS = [
      "email", "username", "user id", "password", "name", "first name", "last name",
      "phone", "address", "city", "state", "zip", "country", "date", "amount",
      "quantity", "price", "description", "title", "subject", "message",
    ];
    const LINK_PATTERNS = [/^https?:\/\//i, /forgot password\?/i, /click here/i, /learn more/i];

    for (const line of lines) {
      const lower = line.toLowerCase();
      const wordCount = line.split(/\s+/).length;

      // Buttons - short text matching button keywords
      if (wordCount <= 3 && BUTTON_KEYWORDS.some((kw) => lower === kw || lower.startsWith(kw + " "))) {
        elements.push({ type: "BUTTON", text: line });
        continue;
      }

      // Input field labels
      if (
        wordCount <= 4 &&
        INPUT_LABEL_KEYWORDS.some((kw) => lower === kw || lower.startsWith(kw + ":") || lower === kw + "*")
      ) {
        elements.push({ type: "INPUT", text: line.replace(/[:*]$/, "").trim() });
        continue;
      }

      // Links
      if (LINK_PATTERNS.some((p) => p.test(line))) {
        elements.push({ type: "LINK", text: line });
        continue;
      }

      // Checkboxes - lines starting with [ ], [x], ☐, ☑
      if (/^\[\s*[xX]?\s*\]/.test(line) || /^[☐☑✓✔]/.test(line)) {
        elements.push({
          type: "CHECKBOX",
          text: line.replace(/^[\[\]☐☑✓✔\sxX]+/, "").trim(),
        });
        continue;
      }

      // Dropdowns
      if (/[▼▾↓]/.test(line) || /^select\s+/i.test(line)) {
        elements.push({ type: "DROPDOWN", text: line.replace(/[▼▾↓]/g, "").trim() });
        continue;
      }

      // Generic short text → LABEL or TEXT
      if (wordCount <= 5) {
        elements.push({ type: "LABEL", text: line });
      } else {
        elements.push({ type: "TEXT", text: line });
      }
    }

    return elements;
  }

  /** Detect screen/page title from first few lines */
  private detectScreenTitle(lines: string[]): string {
    if (lines.length === 0) return "Untitled Screen";
    // First short line is usually the title
    for (const line of lines.slice(0, 3)) {
      if (line.length > 0 && line.length < 60 && !line.includes(":")) {
        return line;
      }
    }
    return lines[0].substring(0, 60);
  }

  /** Cleanup worker on shutdown */
  async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
      this.workerPromise = null;
    }
  }
}

export const imageExtractor = new ImageExtractor();
