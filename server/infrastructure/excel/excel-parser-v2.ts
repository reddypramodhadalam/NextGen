import * as XLSX from "xlsx";

export interface ParsedTestCase {
  title: string;
  description?: string;
  preconditions?: string;
  targetUrl?: string;
  priority?: "low" | "medium" | "high" | "critical";
  tags?: string[];
  steps: Array<{ step: string; expected: string }>;
  testData?: Array<{ key: string; value: string; type: string }>;
  _rowIndex: number;
}

export interface ParsedDataParameter {
  key: string;
  value: string;
  type: string;
  description?: string;
  _rowIndex: number;
}

export interface ParserResult {
  testCases?: ParsedTestCase[];
  parameters?: ParsedDataParameter[];
  errors: string[];
  summary: { totalRows: number; successfulRows: number; errorRows: number };
}

export class ExcelParserV2 {
  static async parseTestCases(buffer: Buffer): Promise<ParserResult> {
    try {
      const wb = XLSX.read(buffer, { type: "buffer" });
      if (wb.SheetNames.length === 0) {
        return { testCases: [], errors: ["No sheets"], summary: { totalRows: 0, successfulRows: 0, errorRows: 0 } };
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      console.log(`[ExcelParser] Loaded ${rows.length} rows`);
      if (rows.length > 0) console.log(`[ExcelParser] Headers: ${JSON.stringify(rows[0])}`);
      return this.parseTestCaseRows(rows);
    } catch (error: any) {
      console.error(`[ExcelParser] Error:`, error.message);
      return { testCases: [], errors: [`Failed: ${error.message}`], summary: { totalRows: 0, successfulRows: 0, errorRows: 0 } };
    }
  }

  static async parseDataSheet(buffer: Buffer): Promise<ParserResult> {
    try {
      const wb = XLSX.read(buffer, { type: "buffer" });
      if (wb.SheetNames.length === 0) {
        return { parameters: [], errors: ["No sheets"], summary: { totalRows: 0, successfulRows: 0, errorRows: 0 } };
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      return this.parseDataSheetRows(rows);
    } catch (error: any) {
      return { parameters: [], errors: [`Failed: ${error.message}`], summary: { totalRows: 0, successfulRows: 0, errorRows: 0 } };
    }
  }

  private static findColumnIndex(headers: string[], patterns: string[]): number {
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i] || "").toLowerCase().trim();
      for (const p of patterns) {
        if (h === p.toLowerCase() || h.includes(p.toLowerCase())) {
          console.log(`[ExcelParser] ✓ Found "${p}" at index ${i}`);
          return i;
        }
      }
    }
    return -1;
  }

  private static parseTestCaseRows(rows: any[][]): ParserResult {
    if (rows.length < 2) {
      return { testCases: [], errors: ["Need header + data"], summary: { totalRows: 0, successfulRows: 0, errorRows: 0 } };
    }

    const headers = rows[0] as string[];
    const titleIdx = this.findColumnIndex(headers, ["title", "test case", "test", "name"]);
    const stepIdx = this.findColumnIndex(headers, ["step", "steps", "action"]);
    const expectedIdx = this.findColumnIndex(headers, ["expected", "expect", "result"]);
    const descIdx = this.findColumnIndex(headers, ["description", "desc"]);

    console.log(`[ExcelParser] Indices: title=${titleIdx}, step=${stepIdx}, expected=${expectedIdx}`);

    if (titleIdx === -1 || stepIdx === -1 || expectedIdx === -1) {
      return { testCases: [], errors: ["Missing: Title, Step, or Expected"], summary: { totalRows: rows.length - 1, successfulRows: 0, errorRows: rows.length - 1 } };
    }

    const result: ParserResult = { testCases: [], errors: [], summary: { totalRows: rows.length - 1, successfulRows: 0, errorRows: 0 } };

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      if (!row || row.every((c: any) => !c && c !== 0)) continue;

      const getCell = (idx: number): string => (idx < 0 || idx >= row.length ? "" : String(row[idx] || "").trim());

      const title = getCell(titleIdx);
      const step = getCell(stepIdx);
      const expected = getCell(expectedIdx);

      if (!title || !step || !expected) {
        result.summary.errorRows++;
        continue;
      }

      result.testCases?.push({
        title,
        description: descIdx >= 0 ? getCell(descIdx) : undefined,
        priority: "medium",
        steps: [{ step, expected }],
        tags: [],
        _rowIndex: rowNum,
      });
      result.summary.successfulRows++;
      console.log(`[ExcelParser] Row ${rowNum}: OK - "${title}"`);
    }

    return result;
  }

  private static parseDataSheetRows(rows: any[][]): ParserResult {
    if (rows.length < 2) {
      return { parameters: [], errors: ["Need header + data"], summary: { totalRows: 0, successfulRows: 0, errorRows: 0 } };
    }

    const headers = rows[0] as string[];
    const keyIdx = this.findColumnIndex(headers, ["key", "parameter", "name"]);
    const valIdx = this.findColumnIndex(headers, ["value", "val", "data"]);
    const typeIdx = this.findColumnIndex(headers, ["type", "data type"]);

    const result: ParserResult = { parameters: [], errors: [], summary: { totalRows: rows.length - 1, successfulRows: 0, errorRows: 0 } };

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c: any) => !c && c !== 0)) continue;

      const getCell = (idx: number): string => (idx < 0 || idx >= row.length ? "" : String(row[idx] || "").trim());
      const key = getCell(keyIdx);

      if (!key) {
        result.summary.errorRows++;
        continue;
      }

      result.parameters?.push({ key, value: getCell(valIdx), type: getCell(typeIdx) || "text", _rowIndex: i + 1 });
      result.summary.successfulRows++;
    }

    return result;
  }

  static validate(testCases: ParsedTestCase[]): { valid: boolean; errors: Map<number, string[]> } {
    const errors = new Map<number, string[]>();
    testCases.forEach((tc) => {
      const tcErrors: string[] = [];
      if (!tc.title?.trim()) tcErrors.push("Missing title");
      if (!tc.steps || tc.steps.length === 0) tcErrors.push("No steps");
      if (tcErrors.length > 0) errors.set(tc._rowIndex, tcErrors);
    });
    return { valid: errors.size === 0, errors };
  }
}
