/**
 * URL Extractor
 * ═══════════════════════════════════════════════════════════════════════════════
 * Fetch and extract content from web pages, GitHub repos, Confluence pages, etc.
 * Strips HTML tags, removes nav/script/style, preserves text structure.
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

export class URLExtractor implements IContentExtractor {
  readonly name = "URLExtractor";
  readonly supportedTypes: ExtractorSourceType[] = ["URL"];

  canExtract(input: ExtractorInput): boolean {
    return !!input.url && /^https?:\/\//i.test(input.url);
  }

  async extract(input: ExtractorInput): Promise<ExtractionResult> {
    if (!input.url) {
      throw new ExtractorError("URL extractor requires a URL", this.name, "URL");
    }

    const started = Date.now();
    const warnings: string[] = [];

    try {
      const isGitHub = /github\.com/i.test(input.url);
      const isRawText = /\.(md|txt|json)$/i.test(input.url);

      let url = input.url;
      // If GitHub blob URL, convert to raw
      if (isGitHub && /\/blob\//i.test(url)) {
        url = url
          .replace("github.com", "raw.githubusercontent.com")
          .replace("/blob/", "/");
      }

      const response = await fetch(url, {
        headers: {
          "User-Agent": "AITAS-KnowledgeBase/1.0",
          Accept: isRawText ? "text/plain" : "text/html,application/xhtml+xml,*/*",
        },
        // Note: fetch in node 20+ has built-in support; redirect by default
      });

      if (!response.ok) {
        throw new ExtractorError(
          `URL fetch failed: HTTP ${response.status} ${response.statusText}`,
          this.name,
          "URL"
        );
      }

      const contentType = response.headers.get("content-type") || "";
      const rawContent = await response.text();
      let fullText: string;
      let title: string | undefined;

      if (contentType.includes("html")) {
        const parsed = this.stripHTML(rawContent);
        fullText = parsed.text;
        title = parsed.title;
      } else if (contentType.includes("json")) {
        try {
          const json = JSON.parse(rawContent);
          fullText = JSON.stringify(json, null, 2);
          title = "JSON Content";
        } catch {
          fullText = rawContent;
        }
      } else {
        // Plain text, markdown, etc.
        fullText = rawContent;
        const firstLine = fullText.split(/\r?\n/)[0]?.trim();
        if (firstLine && firstLine.length < 200) {
          title = firstLine.replace(/^#+\s*/, "");
        }
      }

      // Split into sections by markdown-like headings
      const units = this.splitIntoSections(fullText, title);
      const wordCount = fullText.split(/\s+/).filter(Boolean).length;

      if (wordCount < 50) {
        warnings.push(
          "Very little content extracted - URL may require authentication or be JS-rendered"
        );
      }

      return {
        sourceType: "URL",
        sourceName: input.url,
        totalUnits: units.length,
        units,
        fullText: fullText.trim(),
        metadata: {
          fileName: input.url,
          fileType: contentType,
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
        `URL extraction failed: ${err.message}`,
        this.name,
        "URL",
        err
      );
    }
  }

  /**
   * Strip HTML tags, preserve structure (headings, lists, paragraphs).
   * Lightweight - no cheerio dep needed for basic cleaning.
   */
  private stripHTML(html: string): { text: string; title?: string } {
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    let cleaned = html
      // Remove script and style content
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, "")
      // Replace headings with markdown-style for later detection
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, _l, t) => `\n\n## ${this.stripTags(t).trim()}\n\n`)
      // Replace paragraphs with double newlines
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, t) => `\n${this.stripTags(t).trim()}\n`)
      // Replace list items
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, t) => `• ${this.stripTags(t).trim()}\n`)
      // Replace breaks
      .replace(/<br\s*\/?>/gi, "\n")
      // Strip remaining tags
      .replace(/<[^>]+>/g, " ")
      // Decode common HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n)))
      // Collapse whitespace
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return { text: cleaned, title };
  }

  private stripTags(s: string): string {
    return s.replace(/<[^>]+>/g, "").trim();
  }

  private splitIntoSections(text: string, defaultTitle?: string): ExtractedUnit[] {
    // Match markdown-style headings (##, ###)
    const sections = text.split(/^#{1,6}\s+/m).filter((s) => s.trim());
    if (sections.length <= 1) {
      // Single section
      return [
        {
          unitNumber: 1,
          unitType: "SECTION",
          title: defaultTitle || "Main Content",
          content: text.trim(),
        },
      ];
    }

    return sections.map((sec, idx) => {
      const lines = sec.split(/\r?\n/);
      const title = lines[0]?.trim() || `Section ${idx + 1}`;
      const content = lines.slice(1).join("\n").trim();
      const bullets = content
        .split(/\r?\n/)
        .filter((l) => /^[•\-*]\s/.test(l.trim()))
        .map((l) => l.trim().replace(/^[•\-*]\s+/, ""));

      return {
        unitNumber: idx + 1,
        unitType: "SECTION" as const,
        title,
        content,
        bullets: bullets.length > 0 ? bullets : undefined,
      };
    });
  }
}

export const urlExtractor = new URLExtractor();
