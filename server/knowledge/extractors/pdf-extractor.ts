/**
 * PDF Extractor
 * ═══════════════════════════════════════════════════════════════════════════════
 * Extract text content from PDF files using pdf-parse.
 * Each page becomes one ExtractedUnit.
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

export class PDFExtractor implements IContentExtractor {
  readonly name = "PDFExtractor";
  readonly supportedTypes: ExtractorSourceType[] = ["PDF"];

  canExtract(input: ExtractorInput): boolean {
    if (!input.buffer) return false;
    const ext = (input.extension || "").toLowerCase();
    if (ext === ".pdf") return true;
    const mime = (input.mimeType || "").toLowerCase();
    return mime === "application/pdf";
  }

  async extract(input: ExtractorInput): Promise<ExtractionResult> {
    if (!input.buffer) {
      throw new ExtractorError("PDF extractor requires a buffer", this.name, "PDF");
    }

    const started = Date.now();
    const warnings: string[] = [];

    try {
      // pdf-parse v2 exposes a PDFParse class with getText()
      let fullText = "";
      let numPages = 1;

      try {
        const pdfParseMod: any = await import("pdf-parse");
        const PDFParse =
          pdfParseMod.PDFParse ||
          pdfParseMod.default?.PDFParse ||
          pdfParseMod.default;

        if (!PDFParse || typeof PDFParse !== "function") {
          throw new Error("PDFParse class not found in pdf-parse module");
        }

        const parser = new PDFParse({ data: input.buffer });
        const result = await parser.getText();
        fullText = result.text || "";
        numPages = result.total || 1;
        await parser.destroy();
      } catch (primaryErr: any) {
        // Fallback to pdfjs-dist if pdf-parse fails
        try {
          const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
          const loadingTask = pdfjs.getDocument({ data: input.buffer });
          const pdf = await loadingTask.promise;
          numPages = pdf.numPages;
          const parts: string[] = [];
          for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            parts.push(content.items.map((it: any) => it.str || "").join(" "));
          }
          fullText = parts.join("\f");
          warnings.push("Used pdfjs-dist fallback (pdf-parse failed)");
        } catch (fallbackErr: any) {
          throw new ExtractorError(
            `PDF parsing failed (both pdf-parse and pdfjs-dist): ${primaryErr.message} / ${fallbackErr.message}`,
            this.name,
            "PDF",
            primaryErr
          );
        }
      }

      // Split text by form-feed (PDF page break) or estimate
      const pageTexts = fullText.split("\f").filter((t) => t.trim());
      const effectivePages =
        pageTexts.length === numPages ? pageTexts : this.splitEvenly(fullText, numPages);

      const units: ExtractedUnit[] = effectivePages.map((pageText, idx) => {
        const lines = pageText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const title = lines[0]?.substring(0, 100) || `Page ${idx + 1}`;
        const bullets = lines.filter((l) => /^[-•*●○◦]\s+/.test(l)).map((l) => l.replace(/^[-•*●○◦]\s+/, ""));
        return {
          unitNumber: idx + 1,
          unitType: "PAGE",
          title,
          content: pageText.trim(),
          bullets: bullets.length > 0 ? bullets : undefined,
        };
      });

      const wordCount = fullText.split(/\s+/).filter(Boolean).length;

      if (fullText.length < 50) {
        warnings.push("Very little text extracted - PDF may be image-based (consider OCR)");
      }

      return {
        sourceType: "PDF",
        sourceName: input.sourceName,
        sizeBytes: input.buffer.length,
        totalUnits: units.length,
        units,
        fullText: fullText.trim(),
        metadata: {
          fileName: input.sourceName,
          fileType: "pdf",
          pageCount: numPages,
          wordCount,
          extractedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
        hasPartialData: warnings.length > 0,
      };
    } catch (err: any) {
      throw new ExtractorError(
        `PDF extraction failed: ${err.message}`,
        this.name,
        "PDF",
        err
      );
    }
  }

  private splitEvenly(text: string, parts: number): string[] {
    if (parts <= 1) return [text];
    const len = Math.ceil(text.length / parts);
    const chunks: string[] = [];
    for (let i = 0; i < parts; i++) {
      chunks.push(text.substring(i * len, (i + 1) * len));
    }
    return chunks;
  }
}

export const pdfExtractor = new PDFExtractor();
