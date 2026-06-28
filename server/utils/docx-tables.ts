/**
 * DOCX → text + Markdown tables
 * ─────────────────────────────────────────────────────────────────────────────
 * `mammoth.extractRawText()` throws away ALL table structure — rows and columns
 * collapse into an unreadable wall of text. For JDE / ERP functional specs that
 * is catastrophic: the most important business rules (e.g. the F47047 line
 * consolidation grid — "same DOCO, DOC, LITM, UPRC → consolidate, keep smallest
 * EDLN") live INSIDE tables. When that structure is lost the AI cannot generate
 * accurate table-validation steps.
 *
 * This helper converts the DOCX to HTML (which preserves <table>/<tr>/<td>) and
 * then renders every table as a clean GitHub-flavoured Markdown grid, inlined at
 * the correct position in the document text. Headings and paragraphs are kept as
 * readable text. The result is far more faithful to the source — and the AI can
 * now "see" the columns.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface DocxExtractionResult {
  /** Full document text with tables rendered as Markdown grids inline. */
  text: string;
  /** Number of tables detected and converted. */
  tableCount: number;
  /** Non-fatal warnings (e.g. fell back to raw text). */
  warnings: string[];
}

/** Decode the handful of HTML entities mammoth emits. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Strip inline tags and collapse whitespace inside a single cell. */
function cleanCell(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
  ).replace(/\|/g, "\\|"); // escape pipes so they don't break the MD grid
}

/** Convert one <table>…</table> HTML fragment into a Markdown grid. */
function tableToMarkdown(tableHtml: string): string {
  const rows: string[][] = [];
  const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  for (const row of rowMatches) {
    const cellMatches = row.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || [];
    const cells = cellMatches.map((c) =>
      cleanCell(c.replace(/^<t[hd][^>]*>/i, "").replace(/<\/t[hd]>$/i, ""))
    );
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return "";

  // Normalise every row to the widest column count.
  const cols = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => {
    const copy = [...r];
    while (copy.length < cols) copy.push("");
    return copy;
  };

  const header = pad(rows[0]);
  const body = rows.slice(1).map(pad);

  const lines: string[] = [];
  lines.push("| " + header.join(" | ") + " |");
  lines.push("| " + header.map(() => "---").join(" | ") + " |");
  for (const r of body) lines.push("| " + r.join(" | ") + " |");

  return "\n" + lines.join("\n") + "\n";
}

/**
 * Extract DOCX content as readable text with tables preserved as Markdown grids.
 * Falls back to raw text extraction if HTML conversion fails for any reason.
 */
export async function extractDocxWithTables(buffer: Buffer): Promise<DocxExtractionResult> {
  const warnings: string[] = [];
  const mammothMod: any = await import("mammoth");
  const mammoth: any =
    mammothMod.default && typeof mammothMod.default.convertToHtml === "function"
      ? mammothMod.default
      : mammothMod;

  try {
    const { value: html } = await mammoth.convertToHtml(
      { buffer },
      // Keep it simple: we only care about structure, not styling.
      { includeDefaultStyleMap: true }
    );

    let tableCount = 0;

    // Replace each <table> with a Markdown grid placeholder first so we don't
    // strip its tags in the generic pass below.
    const withTables = html.replace(/<table[\s\S]*?<\/table>/gi, (tbl: string) => {
      const md = tableToMarkdown(tbl);
      if (md) tableCount++;
      return `\n\n${md}\n\n`;
    });

    // Turn block elements into newlines, headings into Markdown headings.
    let text = withTables
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m: string, t: string) => `\n\n# ${cleanCell(t)}\n`)
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m: string, t: string) => `\n\n## ${cleanCell(t)}\n`)
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m: string, t: string) => `\n\n### ${cleanCell(t)}\n`)
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: string, t: string) => `\n- ${cleanCell(t)}`)
      .replace(/<\/p>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n");

    // Strip any remaining tags (but the Markdown tables are already plain text).
    text = decodeEntities(text.replace(/<[^>]+>/g, ""));

    // Collapse excessive blank lines.
    text = text.replace(/\n{3,}/g, "\n\n").trim();

    if (!text) {
      throw new Error("HTML conversion produced empty text");
    }

    return { text, tableCount, warnings };
  } catch (e: any) {
    warnings.push(`Table-aware extraction failed, used raw text: ${e.message}`);
    const r = await mammoth.extractRawText({ buffer });
    return { text: r.value || "", tableCount: 0, warnings };
  }
}
