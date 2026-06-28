/**
 * PPTX Extractor
 * ═══════════════════════════════════════════════════════════════════════════════
 * Extracts structured content from .pptx files using zip + XML parsing.
 * No external service required - pure Node.js.
 *
 * Algorithm:
 * 1. .pptx is a ZIP archive containing XML files
 * 2. Unzip → find ppt/slides/slide*.xml
 * 3. Parse XML → walk text runs (a:t elements)
 * 4. Detect titles (placeholder type="title")
 * 5. Detect bullets (paragraph levels)
 * 6. Extract speaker notes (notesSlides)
 * 7. Extract tables (a:tbl)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import JSZip from "jszip";
import { parseStringPromise } from "xml2js";
import type {
  ExtractedUnit,
  ExtractionResult,
  ExtractorInput,
  ExtractorSourceType,
  IContentExtractor,
} from "./types";
import { ExtractorError } from "./types";

export class PPTXExtractor implements IContentExtractor {
  readonly name = "PPTXExtractor";
  readonly supportedTypes: ExtractorSourceType[] = ["PPTX", "PPT"];

  canExtract(input: ExtractorInput): boolean {
    if (!input.buffer) return false;
    const ext = (input.extension || "").toLowerCase();
    if (ext === ".pptx" || ext === ".ppt") return true;
    const mime = (input.mimeType || "").toLowerCase();
    return (
      mime.includes("presentationml") ||
      mime.includes("ms-powerpoint")
    );
  }

  async extract(input: ExtractorInput): Promise<ExtractionResult> {
    if (!input.buffer) {
      throw new ExtractorError("PPTX extractor requires a buffer", this.name, "PPTX");
    }

    const started = Date.now();
    const warnings: string[] = [];

    try {
      const zip = await JSZip.loadAsync(input.buffer);

      // Collect slide files in order
      const slideFiles = Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
        .sort((a, b) => {
          const an = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || "0");
          const bn = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || "0");
          return an - bn;
        });

      if (slideFiles.length === 0) {
        throw new ExtractorError(
          "No slides found in PPTX",
          this.name,
          "PPTX"
        );
      }

      const units: ExtractedUnit[] = [];
      let allText = "";

      for (let i = 0; i < slideFiles.length; i++) {
        const slidePath = slideFiles[i];
        const slideNum = i + 1;

        try {
          const xmlContent = await zip.files[slidePath].async("string");
          const unit = await this.parseSlide(xmlContent, slideNum);

          // Try to find corresponding notes file
          const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
          if (zip.files[notesPath]) {
            try {
              const notesXml = await zip.files[notesPath].async("string");
              unit.notes = this.extractAllText(await parseStringPromise(notesXml));
            } catch {
              // notes are optional
            }
          }

          units.push(unit);
          allText += `\n\n## Slide ${slideNum}: ${unit.title || "(untitled)"}\n${unit.content}`;
          if (unit.bullets?.length) {
            allText += "\n" + unit.bullets.map((b) => `• ${b}`).join("\n");
          }
          if (unit.notes) {
            allText += `\n[Notes] ${unit.notes}`;
          }
        } catch (e: any) {
          warnings.push(`Failed to parse ${slidePath}: ${e.message}`);
        }
      }

      const wordCount = allText.split(/\s+/).filter(Boolean).length;

      return {
        sourceType: "PPTX",
        sourceName: input.sourceName,
        sizeBytes: input.buffer.length,
        totalUnits: units.length,
        units,
        fullText: allText.trim(),
        metadata: {
          fileName: input.sourceName,
          fileType: "pptx",
          slideCount: units.length,
          wordCount,
          extractedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
        hasPartialData: warnings.length > 0,
      };
    } catch (err: any) {
      if (err instanceof ExtractorError) throw err;
      throw new ExtractorError(
        `Failed to parse PPTX: ${err.message}`,
        this.name,
        "PPTX",
        err
      );
    }
  }

  /**
   * Parse one slide XML into an ExtractedUnit
   */
  private async parseSlide(xmlContent: string, slideNum: number): Promise<ExtractedUnit> {
    const parsed = await parseStringPromise(xmlContent, {
      explicitArray: false,
      mergeAttrs: true,
    });

    const unit: ExtractedUnit = {
      unitNumber: slideNum,
      unitType: "SLIDE",
      content: "",
      bullets: [],
      tables: [],
    };

    // Walk the slide tree to find sp (shape) elements
    const slideRoot = parsed?.["p:sld"]?.["p:cSld"]?.["p:spTree"];
    if (!slideRoot) return unit;

    const shapes = this.toArray(slideRoot["p:sp"]);
    const tables = this.toArray(slideRoot["p:graphicFrame"]);

    for (const sp of shapes) {
      const isTitle = this.isTitlePlaceholder(sp);
      const txBody = sp?.["p:txBody"];
      if (!txBody) continue;

      const paragraphs = this.toArray(txBody["a:p"]);
      const lines: string[] = [];
      const bullets: string[] = [];

      for (const p of paragraphs) {
        const text = this.extractParaText(p);
        if (!text.trim()) continue;
        const isBullet = this.isBulletPara(p);
        if (isBullet) {
          bullets.push(text.trim());
        } else {
          lines.push(text.trim());
        }
      }

      if (isTitle && !unit.title) {
        unit.title = lines.join(" ") || bullets.join(" ");
      } else {
        unit.content = (unit.content + "\n" + lines.join("\n")).trim();
        if (bullets.length > 0) {
          unit.bullets = [...(unit.bullets || []), ...bullets];
        }
      }
    }

    // Extract tables
    for (const gf of tables) {
      const tbl = gf?.["a:graphic"]?.["a:graphicData"]?.["a:tbl"];
      if (!tbl) continue;
      const rows = this.toArray(tbl["a:tr"]);
      const tableRows: string[][] = [];
      for (const tr of rows) {
        const cells = this.toArray(tr["a:tc"]);
        const cellTexts = cells.map((tc: any) => {
          const txBody = tc?.["a:txBody"];
          if (!txBody) return "";
          const paras = this.toArray(txBody["a:p"]);
          return paras.map((p: any) => this.extractParaText(p)).join(" ").trim();
        });
        if (cellTexts.some((c) => c)) tableRows.push(cellTexts);
      }
      if (tableRows.length > 0) {
        unit.tables = unit.tables || [];
        unit.tables.push({
          headers: tableRows[0],
          rows: tableRows.slice(1),
        });
      }
    }

    // If no title found, derive from first non-empty line
    if (!unit.title) {
      const firstLine = unit.content.split("\n").find((l) => l.trim());
      unit.title = firstLine?.trim().substring(0, 100) || `Slide ${slideNum}`;
    }

    return unit;
  }

  private isTitlePlaceholder(sp: any): boolean {
    const ph = sp?.["p:nvSpPr"]?.["p:nvPr"]?.["p:ph"];
    if (!ph) return false;
    const type = ph.type || ph["$"]?.type;
    return type === "title" || type === "ctrTitle";
  }

  private isBulletPara(p: any): boolean {
    const pPr = p?.["a:pPr"];
    if (!pPr) return false;
    // Has bullet character or indent level > 0
    if (pPr["a:buChar"] || pPr["a:buAutoNum"]) return true;
    const lvl = pPr.lvl || pPr["$"]?.lvl;
    return lvl !== undefined && parseInt(lvl) >= 0;
  }

  private extractParaText(p: any): string {
    if (!p) return "";
    const runs = this.toArray(p["a:r"]);
    return runs.map((r: any) => r?.["a:t"] || "").join("");
  }

  /**
   * Recursively extract all <a:t> text from any subtree
   */
  private extractAllText(node: any): string {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map((n) => this.extractAllText(n)).join(" ");
    if (typeof node === "object") {
      const parts: string[] = [];
      for (const [key, value] of Object.entries(node)) {
        if (key === "a:t") {
          if (typeof value === "string") parts.push(value);
          else if (Array.isArray(value)) parts.push(value.filter((v) => typeof v === "string").join(" "));
        } else {
          parts.push(this.extractAllText(value));
        }
      }
      return parts.filter(Boolean).join(" ");
    }
    return "";
  }

  private toArray(x: any): any[] {
    if (x === undefined || x === null) return [];
    return Array.isArray(x) ? x : [x];
  }
}

export const pptxExtractor = new PPTXExtractor();
