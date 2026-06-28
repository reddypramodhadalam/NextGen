/**
 * DOCX Extractor
 * ═══════════════════════════════════════════════════════════════════════════════
 * Extract text and structure from Microsoft Word .docx files via mammoth.
 * Treats each top-level heading as one ExtractedUnit (SECTION).
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

export class DOCXExtractor implements IContentExtractor {
  readonly name = "DOCXExtractor";
  readonly supportedTypes: ExtractorSourceType[] = ["DOCX"];

  canExtract(input: ExtractorInput): boolean {
    if (!input.buffer) return false;
    const ext = (input.extension || "").toLowerCase();
    if (ext === ".docx" || ext === ".doc") return true;
    const mime = (input.mimeType || "").toLowerCase();
    return mime.includes("wordprocessingml") || mime.includes("msword");
  }

  async extract(input: ExtractorInput): Promise<ExtractionResult> {
    if (!input.buffer) {
      throw new ExtractorError("DOCX extractor requires a buffer", this.name, "DOCX");
    }

    const started = Date.now();

    try {
      // Table-aware extraction: preserves <table> structure as Markdown grids so
      // business rules embedded in tables survive into the Knowledge Base instead
      // of collapsing into an unreadable wall of text.
      const { extractDocxWithTables } = await import("../../utils/docx-tables");
      const { text: fullText, tableCount } = await extractDocxWithTables(
        input.buffer as Buffer
      );

      // Split by detected headings (lines that look like titles - short, no period)
      const units: ExtractedUnit[] = this.splitIntoSections(fullText);
      const wordCount = fullText.split(/\s+/).filter(Boolean).length;

      return {
        sourceType: "DOCX",
        sourceName: input.sourceName,
        sizeBytes: input.buffer.length,
        totalUnits: units.length,
        units,
        fullText: fullText.trim(),
        metadata: {
          fileName: input.sourceName,
          fileType: "docx",
          wordCount,
          extractedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
          warnings: tableCount > 0 ? [`Converted ${tableCount} table(s) to Markdown`] : undefined,
        },
      };
    } catch (err: any) {
      throw new ExtractorError(
        `DOCX extraction failed: ${err.message}`,
        this.name,
        "DOCX",
        err
      );
    }
  }

  private splitIntoSections(text: string): ExtractedUnit[] {
    const lines = text.split(/\r?\n/);
    const units: ExtractedUnit[] = [];
    let current: ExtractedUnit = {
      unitNumber: 1,
      unitType: "SECTION",
      title: "Introduction",
      content: "",
      bullets: [],
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Heuristic: short line, all caps OR title case, no terminal punctuation = heading
      const isHeading =
        line.length > 0 &&
        line.length < 80 &&
        !line.endsWith(".") &&
        !line.endsWith(",") &&
        (line === line.toUpperCase() || /^[A-Z]/.test(line)) &&
        line.split(/\s+/).length <= 10;

      // Bullet detection
      const bulletMatch = line.match(/^[-•*●○◦▪▫]\s+(.+)/);

      if (isHeading && current.content.length > 0) {
        // Save previous section, start new
        units.push(current);
        current = {
          unitNumber: units.length + 1,
          unitType: "SECTION",
          title: line,
          content: "",
          bullets: [],
        };
      } else if (bulletMatch) {
        current.bullets!.push(bulletMatch[1].trim());
        current.content += "\n" + line;
      } else {
        current.content += (current.content ? "\n" : "") + line;
      }
    }

    // Push the last unit
    if (current.content.length > 0 || (current.bullets && current.bullets.length > 0)) {
      units.push(current);
    }

    // Clean up - remove empty bullets arrays
    return units.map((u) => ({
      ...u,
      bullets: u.bullets && u.bullets.length > 0 ? u.bullets : undefined,
      content: u.content.trim(),
    }));
  }
}

export const docxExtractor = new DOCXExtractor();
