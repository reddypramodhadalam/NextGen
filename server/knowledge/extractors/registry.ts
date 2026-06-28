/**
 * Extractor Registry
 * ═══════════════════════════════════════════════════════════════════════════════
 * Central dispatcher that picks the right extractor for a given input.
 * Add new extractors here.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { IContentExtractor, ExtractorInput, ExtractionResult } from "./types";
import { ExtractorError } from "./types";
import { pptxExtractor } from "./pptx-extractor";
import { pdfExtractor } from "./pdf-extractor";
import { docxExtractor } from "./docx-extractor";
import { imageExtractor } from "./image-extractor";
import { urlExtractor } from "./url-extractor";

export class ExtractorRegistry {
  private extractors: IContentExtractor[] = [];

  constructor() {
    this.register(pptxExtractor);
    this.register(pdfExtractor);
    this.register(docxExtractor);
    this.register(imageExtractor);
    this.register(urlExtractor);
  }

  register(extractor: IContentExtractor): void {
    this.extractors.push(extractor);
  }

  /**
   * Pick the best extractor for the input and run extraction.
   */
  async extract(input: ExtractorInput): Promise<ExtractionResult> {
    const extractor = this.extractors.find((e) => e.canExtract(input));
    if (!extractor) {
      throw new ExtractorError(
        `No extractor available for source: ${input.sourceName} (ext=${input.extension}, mime=${input.mimeType})`,
        "Registry",
        "TEXT"
      );
    }
    console.log(
      `[ExtractorRegistry] Using ${extractor.name} for ${input.sourceName}`
    );
    return extractor.extract(input);
  }

  /**
   * Check if any extractor supports a given file/URL without running it.
   */
  canExtract(input: ExtractorInput): boolean {
    return this.extractors.some((e) => e.canExtract(input));
  }

  /**
   * List of all registered extractor names.
   */
  list(): Array<{ name: string; types: string[] }> {
    return this.extractors.map((e) => ({
      name: e.name,
      types: e.supportedTypes as string[],
    }));
  }
}

export const extractorRegistry = new ExtractorRegistry();
