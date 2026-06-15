import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Upload, FileText, FileJson, Table2, CheckCircle2, XCircle,
  Loader2, Play, Code2, Download, Sparkles, AlertCircle,
  ChevronRight, FolderOpen, Eye, Trash2, RefreshCw, FileUp,
  ArrowRight, Zap, KeyRound, Database, Plus, Pencil, Save,
  X, EyeOff, Lock, Globe, AtSign, Hash, Type, ShieldCheck,
  FileSpreadsheet, Info, Copy,
} from "lucide-react";
import type { TestSuite, TestCase, TestDataParam } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedTestCase {
  title: string;
  description?: string;
  preconditions?: string;
  targetUrl?: string;
  priority?: string;
  tags?: string[];
  steps: { step: string; expected: string }[];
  _rowIndex?: number;
  _parseError?: string;
}

interface UploadResult {
  fileName: string;
  fileType: string;
  totalRows: number;
  parsed: ParsedTestCase[];
  errors: string[];
}

interface GeneratedScript {
  testCaseId: string;
  testCaseTitle: string;
  language: string;
  framework: string;
  code: string;
  generatedBy: "ai" | "rule-based";
}

const FRAMEWORKS = [
  { value: "playwright", label: "Playwright" },
  { value: "selenium",   label: "Selenium"   },
  { value: "cypress",    label: "Cypress"    },
  { value: "puppeteer",  label: "Puppeteer"  },
];

const LANGUAGES = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "python",     label: "Python"     },
  { value: "java",       label: "Java"       },
  { value: "csharp",     label: "C#"         },
];

const FILE_EXT_ICON: Record<string, React.ReactNode> = {
  json: <FileJson className="h-5 w-5 text-amber-500" />,
  csv:  <Table2   className="h-5 w-5 text-emerald-500" />,
  xlsx: <Table2   className="h-5 w-5 text-blue-500" />,
  xls:  <Table2   className="h-5 w-5 text-blue-500" />,
  txt:  <FileText className="h-5 w-5 text-slate-400" />,
};

// ─── CSV / plain-text parser (client-side) ────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  for (const line of lines) {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function csvRowsToTestCases(rows: string[][]): ParsedTestCase[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const idx = (name: string) => headers.findIndex(h => h.includes(name));

  const titleIdx       = idx("title") !== -1 ? idx("title") : 0;
  const descIdx        = idx("desc");
  const preIdx         = idx("precond");
  const urlIdx         = idx("url");
  const priorityIdx    = idx("priority");
  const tagsIdx        = idx("tag");
  const stepIdx        = idx("step");
  const expectedIdx    = idx("expect");

  return rows.slice(1).map((row, i) => {
    const get = (j: number) => (j >= 0 && j < row.length ? row[j] : "");
    const title = get(titleIdx);
    if (!title) return null;

    // Steps: either a single "step | expected" column or separate columns
    let steps: { step: string; expected: string }[] = [];
    if (stepIdx >= 0) {
      const stepText = get(stepIdx);
      const expText  = get(expectedIdx);
      if (stepText) steps.push({ step: stepText, expected: expText || "Step completes successfully" });
    }
    if (steps.length === 0) {
      steps = [{ step: `Execute: ${title}`, expected: "Test completes successfully" }];
    }

    return {
      title,
      description:   get(descIdx)     || undefined,
      preconditions: get(preIdx)      || undefined,
      targetUrl:     get(urlIdx)      || undefined,
      priority:      get(priorityIdx) || "medium",
      tags:          get(tagsIdx) ? get(tagsIdx).split(/[;,]/).map(t => t.trim()).filter(Boolean) : [],
      steps,
      _rowIndex: i + 2,
    } as ParsedTestCase;
  }).filter(Boolean) as ParsedTestCase[];
}

function parseJSON(text: string): ParsedTestCase[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.testCases ?? data.tests ?? [data];
  return arr.map((item: any, i: number) => ({
    title:         item.title || item.name || `Test Case ${i + 1}`,
    description:   item.description || item.desc || undefined,
    preconditions: item.preconditions || item.precondition || undefined,
    targetUrl:     item.targetUrl || item.url || undefined,
    priority:      item.priority || "medium",
    tags:          Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : [],
    steps: Array.isArray(item.steps)
      ? item.steps.map((s: any) =>
          typeof s === "string"
            ? { step: s, expected: "Step completes successfully" }
            : { step: s.step || s.action || s.description || s, expected: s.expected || s.result || "Step completes successfully" }
        )
      : [{ step: `Execute: ${item.title || "test"}`, expected: "Test completes successfully" }],
    _rowIndex: i + 1,
  }));
}

function parsePlainText(text: string): ParsedTestCase[] {
  // Each test case separated by blank line or "Test Case N:" header
  const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
  return blocks.map((block, i) => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const title = lines[0].replace(/^(test case\s*\d*:?\s*)/i, "").trim() || `Test Case ${i + 1}`;
    const steps = lines.slice(1).map((l, si) => ({
      step: l.replace(/^\d+\.\s*/, ""),
      expected: "Step completes successfully",
    }));
    return {
      title,
      steps: steps.length > 0 ? steps : [{ step: `Execute: ${title}`, expected: "Test completes successfully" }],
      priority: "medium",
      _rowIndex: i + 1,
    };
  });
}

// ─── localStorage key for credentials ───────────────────────────────────────
const CREDS_STORAGE_KEY = "aitas_upload_credentials";
const TEST_DATA_STORAGE_KEY = "aitas_upload_testdata";

// ─── Type icons for test data params ─────────────────────────────────────────
const TYPE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  text:     { icon: <Type     className="h-3 w-3" />, label: "Text",     color: "text-slate-500" },
  password: { icon: <Lock     className="h-3 w-3" />, label: "Password", color: "text-rose-500"  },
  email:    { icon: <AtSign   className="h-3 w-3" />, label: "Email",    color: "text-blue-500"  },
  url:      { icon: <Globe    className="h-3 w-3" />, label: "URL",      color: "text-violet-500"},
  number:   { icon: <Hash     className="h-3 w-3" />, label: "Number",   color: "text-amber-500" },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UploadTestCases() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Upload state
  const [isDragging, setIsDragging]     = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isParsing, setIsParsing]       = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import state
  const [selectedSuite, setSelectedSuite]   = useState("");
  const [importedCases, setImportedCases]   = useState<TestCase[]>([]);
  const [isImporting, setIsImporting]       = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // ── Test Data & Credentials state ────────────────────────────────────────────
  // Credentials
  const [credUsername, setCredUsername]   = useState("");
  const [credPassword, setCredPassword]   = useState("");
  const [credUrl, setCredUrl]             = useState("");
  const [showPassword, setShowPassword]   = useState(false);
  const [credsSaved, setCredsSaved]       = useState(false);
  const [credsEditing, setCredsEditing]   = useState(true);

  // Test data rows
  const [testDataRows, setTestDataRows]   = useState<TestDataParam[]>([]);
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [editingRow, setEditingRow]       = useState<TestDataParam | null>(null);

  // Data sheet upload
  const [isParsingSheet, setIsParsingSheet]   = useState(false);
  const [sheetDragging, setSheetDragging]     = useState(false);
  const [sheetFileName, setSheetFileName]     = useState("");
  const dataSheetRef = useRef<HTMLInputElement>(null);

  // Script generation state
  const [framework, setFramework]           = useState("playwright");
  const [language, setLanguage]             = useState("typescript");
  const [generatedScripts, setGeneratedScripts] = useState<GeneratedScript[]>([]);
  const [isGenerating, setIsGenerating]     = useState(false);
  const [genProgress, setGenProgress]       = useState(0);
  const [previewScript, setPreviewScript]   = useState<GeneratedScript | null>(null);

  // Execution state
  const [targetUrl, setTargetUrl]           = useState("");
  const [execSuiteId, setExecSuiteId]       = useState("");

  // Active tab — now 5 steps
  const [activeTab, setActiveTab] = useState<"upload" | "import" | "testdata" | "generate" | "execute">("upload");

  // ── Restore from localStorage on mount ───────────────────────────────────────
  useEffect(() => {
    try {
      const savedCreds = localStorage.getItem(CREDS_STORAGE_KEY);
      if (savedCreds) {
        const c = JSON.parse(savedCreds);
        setCredUsername(c.username ?? "");
        setCredPassword(c.password ?? "");
        setCredUrl(c.url ?? "");
        if (c.username || c.password || c.url) {
          setCredsEditing(false);
          setCredsSaved(true);
        }
      }
      const savedData = localStorage.getItem(TEST_DATA_STORAGE_KEY);
      if (savedData) {
        const rows = JSON.parse(savedData);
        if (Array.isArray(rows) && rows.length > 0) setTestDataRows(rows);
      }
    } catch {}
  }, []);

  const { data: suites = [] } = useQuery<TestSuite[]>({ queryKey: ["/api/test-suites"] });

  // ── Credentials helpers ───────────────────────────────────────────────────────
  const saveCredentials = () => {
    try {
      localStorage.setItem(CREDS_STORAGE_KEY, JSON.stringify({
        username: credUsername, password: credPassword, url: credUrl,
      }));
    } catch {}
    setCredsSaved(true);
    setCredsEditing(false);
    toast({ title: "Credentials Saved", description: "Stored in session for this pipeline run." });
  };

  const clearCredentials = () => {
    setCredUsername(""); setCredPassword(""); setCredUrl("");
    setCredsSaved(false); setCredsEditing(true);
    try { localStorage.removeItem(CREDS_STORAGE_KEY); } catch {}
  };

  // ── Test data row helpers ─────────────────────────────────────────────────────
  const persistTestData = (rows: TestDataParam[]) => {
    try { localStorage.setItem(TEST_DATA_STORAGE_KEY, JSON.stringify(rows)); } catch {}
  };

  const addTestDataRow = () => {
    const newRow: TestDataParam = { key: "", value: "", type: "text" };
    const updated = [...testDataRows, newRow];
    setTestDataRows(updated);
    setEditingRowIdx(updated.length - 1);
    setEditingRow({ ...newRow });
  };

  const startEditRow = (idx: number) => {
    setEditingRowIdx(idx);
    setEditingRow({ ...testDataRows[idx] });
  };

  const saveEditRow = () => {
    if (editingRowIdx === null || !editingRow) return;
    const updated = testDataRows.map((r, i) => i === editingRowIdx ? { ...editingRow } : r);
    setTestDataRows(updated);
    persistTestData(updated);
    setEditingRowIdx(null);
    setEditingRow(null);
  };

  const cancelEditRow = () => { setEditingRowIdx(null); setEditingRow(null); };

  const deleteTestDataRow = (idx: number) => {
    const updated = testDataRows.filter((_, i) => i !== idx);
    setTestDataRows(updated);
    persistTestData(updated);
    if (editingRowIdx === idx) { setEditingRowIdx(null); setEditingRow(null); }
  };

  // ── Data sheet upload ─────────────────────────────────────────────────────────
  const parseDataSheet = useCallback(async (file: File) => {
    setIsParsingSheet(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/parse-data-sheet", { method: "POST", body: formData });
      const rawText = await res.text();
      let data: any;
      try { data = JSON.parse(rawText); } catch {
        throw new Error("Server returned non-JSON response");
      }
      if (!res.ok) throw new Error(data.error || "Data sheet parsing failed");
      const incoming: TestDataParam[] = data.params ?? [];
      // Merge: incoming rows overwrite existing keys, new keys are appended
      const merged = [...testDataRows];
      for (const row of incoming) {
        const existingIdx = merged.findIndex(r => r.key === row.key);
        if (existingIdx >= 0) merged[existingIdx] = row;
        else merged.push(row);
      }
      setTestDataRows(merged);
      persistTestData(merged);
      setSheetFileName(file.name);
      toast({
        title: "Data Sheet Imported",
        description: `${incoming.length} params merged into test data table.`,
      });
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsParsingSheet(false);
    }
  }, [testDataRows, toast]);

  // ── Build final testData array for execution ──────────────────────────────────
  const buildTestData = (): TestDataParam[] => {
    const rows: TestDataParam[] = [...testDataRows];
    // Inject credentials as special keys if filled
    if (credUsername) rows.push({ key: "username", value: credUsername, type: "text" });
    if (credPassword) rows.push({ key: "password", value: credPassword, type: "password" });
    if (credUrl)      rows.push({ key: "baseUrl",  value: credUrl,      type: "url" });
    return rows;
  };

  // ── File parsing ─────────────────────────────────────────────────────────────

  const parseFile = useCallback(async (file: File) => {
    setIsParsing(true);
    setUploadResult(null);

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const errors: string[] = [];
    let parsed: ParsedTestCase[] = [];

    try {
      if (ext === "json") {
        const text = await file.text();
        parsed = parseJSON(text);
      } else if (ext === "csv") {
        const text = await file.text();
        const rows = parseCSV(text);
        parsed = csvRowsToTestCases(rows);
      } else if (ext === "xlsx" || ext === "xls") {
        // Send to server for Excel parsing — do NOT set Content-Type,
        // let the browser set it automatically with the correct multipart boundary
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload/parse-excel", { method: "POST", body: formData });
        // Read raw text first so we can give a useful error if it's not JSON
        const rawText = await res.text();
        let data: any;
        try {
          data = JSON.parse(rawText);
        } catch {
          // Server returned HTML (error page) or non-JSON — surface the real message
          const snippet = rawText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
          throw new Error(`Server error: ${snippet || "Unexpected response from server"}`);
        }
        if (!res.ok) throw new Error(data.error || "Excel parsing failed on server");
        parsed = data.testCases ?? [];
        errors.push(...(data.errors || []));
      } else if (ext === "txt") {
        const text = await file.text();
        parsed = parsePlainText(text);
      } else {
        errors.push(`Unsupported file type: .${ext}. Supported: .json, .csv, .xlsx, .txt`);
      }

      // Validate parsed cases
      parsed = parsed.map(tc => {
        if (!tc.title?.trim()) {
          return { ...tc, _parseError: "Missing title" };
        }
        return tc;
      });

      const validCount = parsed.filter(tc => !tc._parseError).length;

      setUploadResult({
        fileName: file.name,
        fileType: ext,
        totalRows: parsed.length,
        parsed,
        errors,
      });

      toast({
        title: "File Parsed Successfully",
        description: `Found ${validCount} valid test cases in ${file.name}`,
      });

      if (validCount > 0) setActiveTab("import");

    } catch (err: any) {
      errors.push(err.message);
      setUploadResult({ fileName: file.name, fileType: ext, totalRows: 0, parsed: [], errors });
      toast({ title: "Parse Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  };

  // ── Import to repository ──────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!uploadResult) return;
    const valid = uploadResult.parsed.filter(tc => !tc._parseError);
    if (valid.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);
    const imported: TestCase[] = [];

    try {
      for (let i = 0; i < valid.length; i++) {
        const tc = valid[i];
        const res = await apiRequest("POST", "/api/test-cases", {
          title:         tc.title,
          description:   tc.description || null,
          preconditions: tc.preconditions || null,
          targetUrl:     tc.targetUrl || null,
          suiteId:       selectedSuite || null,
          priority:      tc.priority || "medium",
          tags:          tc.tags || null,
          steps:         tc.steps,
          status:        "active",
          generatedByAI: false,
        });
        const created = await res.json();
        imported.push(created);
        setImportProgress(Math.round(((i + 1) / valid.length) * 100));
      }

      setImportedCases(imported);
      queryClient.invalidateQueries({ queryKey: ["/api/test-cases"] });

      toast({
        title: "Import Complete",
        description: `${imported.length} test cases imported to repository.`,
      });

      setActiveTab("testdata");
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  // ── Script generation ─────────────────────────────────────────────────────────

  const handleGenerateScripts = async () => {
    const cases = importedCases.length > 0 ? importedCases : [];
    if (cases.length === 0) {
      toast({ title: "No Test Cases", description: "Import test cases first.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setGenProgress(0);
    const scripts: GeneratedScript[] = [];

    try {
      for (let i = 0; i < cases.length; i++) {
        const tc = cases[i];
        const res = await apiRequest("POST", "/api/generate-script", {
          testCaseId: tc.id,
          framework,
          language,
        });
        const data = await res.json();
        scripts.push({
          testCaseId:    tc.id,
          testCaseTitle: tc.title,
          language,
          framework,
          code:          data.code,
          generatedBy:   data.generatedBy ?? "rule-based",
        });
        setGenProgress(Math.round(((i + 1) / cases.length) * 100));
      }

      setGeneratedScripts(scripts);
      toast({
        title: "Scripts Generated",
        description: `Generated ${scripts.length} ${language} scripts using ${framework}.`,
      });

      setActiveTab("execute");
    } catch (err: any) {
      toast({ title: "Generation Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Download all scripts ──────────────────────────────────────────────────────

  const handleDownloadAll = () => {
    const extMap: Record<string, string> = {
      typescript: "ts", javascript: "js", python: "py", java: "java", csharp: "cs",
    };
    const ext = extMap[language] ?? "txt";

    generatedScripts.forEach(s => {
      const blob = new Blob([s.code], { type: "text/plain" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${s.testCaseTitle.replace(/[^a-z0-9]/gi, "_")}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  // ── Execute uploaded test cases ───────────────────────────────────────────────

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!targetUrl) throw new Error("Target URL is required");
      const suiteId = execSuiteId || selectedSuite || null;
      const testData = buildTestData();
      const res = await apiRequest("POST", "/api/executions", {
        suiteId,
        targetUrl,
        framework: "playwright",
        environment: "staging",
        testData: testData.length > 0 ? testData : undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Execution Started",
        description: `Execution ${data.id.slice(0, 8)}... is running.`,
      });
      setLocation("/executions");
    },
    onError: (err: any) => {
      toast({ title: "Execution Failed", description: err.message, variant: "destructive" });
    },
  });

  // ─── Render ──────────────────────────────────────────────────────────────────

  const validCases  = uploadResult?.parsed.filter(tc => !tc._parseError) ?? [];
  const invalidCases = uploadResult?.parsed.filter(tc => tc._parseError) ?? [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg">
          <FileUp className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Upload Test Cases</h1>
          <p className="text-sm text-muted-foreground">
            Import from CSV, Excel, JSON or plain text → generate scripts → run instantly
          </p>
        </div>
      </div>

      {/* ── Pipeline progress bar ── */}
      <div className="flex items-center gap-1.5 p-3 rounded-2xl border border-border/60 bg-muted/30 overflow-x-auto">
        {([
          { step: "upload",   label: "1. Upload",      Icon: Upload        },
          { step: "import",   label: "2. Import",      Icon: FolderOpen    },
          { step: "testdata", label: "3. Test Data",   Icon: Database      },
          { step: "generate", label: "4. Generate",    Icon: Code2         },
          { step: "execute",  label: "5. Run Tests",   Icon: Play          },
        ] as const).map(({ step, label, Icon }, i) => {
          const isActive = activeTab === step;
          const isDone =
            (step === "upload"   && !!uploadResult) ||
            (step === "import"   && importedCases.length > 0) ||
            (step === "testdata" && (testDataRows.length > 0 || credUsername || credPassword)) ||
            (step === "generate" && generatedScripts.length > 0);
          return (
            <div key={step} className="flex items-center gap-1.5 flex-1 min-w-0">
              <button
                onClick={() => setActiveTab(step)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all flex-1 justify-center min-w-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : isDone
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {isDone && !isActive
                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  : <Icon className="h-3.5 w-3.5 shrink-0" />
                }
                <span className="hidden sm:inline truncate">{label}</span>
              </button>
              {i < 4 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
            </div>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1 — UPLOAD
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="upload" className="space-y-6 mt-0">
          <div className="grid gap-6 lg:grid-cols-3">

            {/* Drop zone */}
            <Card className="lg:col-span-2 border-2 border-dashed transition-all duration-200"
              style={{ borderColor: isDragging ? "hsl(var(--primary))" : undefined }}>
              <CardContent className="p-0">
                <div
                  className={cn(
                    "flex flex-col items-center justify-center gap-4 p-12 rounded-xl cursor-pointer transition-all duration-200",
                    isDragging ? "bg-primary/8" : "hover:bg-muted/40"
                  )}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv,.xlsx,.xls,.txt"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {isParsing ? (
                    <>
                      <Loader2 className="h-12 w-12 text-primary animate-spin" />
                      <p className="text-lg font-semibold">Parsing file...</p>
                    </>
                  ) : uploadResult ? (
                    <>
                      <div className="h-14 w-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold">{uploadResult.fileName}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {validCases.length} valid · {invalidCases.length} errors
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setUploadResult(null); }}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Upload Different File
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Upload className="h-8 w-8 text-primary" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold">Drop your file here</p>
                        <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-center">
                        {[".json", ".csv", ".xlsx", ".txt"].map(ext => (
                          <Badge key={ext} variant="secondary" className="font-mono text-xs">{ext}</Badge>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Format guide */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Supported Formats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                {[
                  {
                    ext: "JSON", icon: <FileJson className="h-4 w-4 text-amber-500" />,
                    desc: "Array of test case objects",
                    sample: `[{\n  "title": "Login test",\n  "steps": [\n    {"step":"Go to /login",\n     "expected":"Form shown"}\n  ]\n}]`,
                  },
                  {
                    ext: "CSV", icon: <Table2 className="h-4 w-4 text-emerald-500" />,
                    desc: "Columns: title, description, step, expected, priority, tags",
                    sample: `title,step,expected,priority\nLogin,Go to /login,Form shown,high`,
                  },
                  {
                    ext: "XLSX", icon: <Table2 className="h-4 w-4 text-blue-500" />,
                    desc: "Same columns as CSV in first sheet",
                    sample: "Excel spreadsheet with header row",
                  },
                  {
                    ext: "TXT", icon: <FileText className="h-4 w-4 text-slate-400" />,
                    desc: "Test cases separated by blank lines",
                    sample: `Login Test\n1. Go to /login\n2. Enter credentials\n\nSearch Test\n1. Click search`,
                  },
                ].map(f => (
                  <div key={f.ext} className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold">
                      {f.icon} {f.ext}
                    </div>
                    <p className="text-muted-foreground pl-6">{f.desc}</p>
                    <pre className="pl-6 text-[10px] text-muted-foreground/70 font-mono whitespace-pre-wrap leading-relaxed">
                      {f.sample}
                    </pre>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Parse results preview */}
          {uploadResult && uploadResult.parsed.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Parsed Preview — {uploadResult.fileName}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      {validCases.length} valid
                    </Badge>
                    {invalidCases.length > 0 && (
                      <Badge variant="destructive">{invalidCases.length} errors</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {uploadResult.parsed.slice(0, 20).map((tc, i) => (
                    <div key={i} className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border text-sm",
                      tc._parseError
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-border/50 bg-muted/30"
                    )}>
                      {tc._parseError
                        ? <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        : <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{tc.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {tc._parseError
                            ? `Error: ${tc._parseError}`
                            : `${tc.steps.length} steps · ${tc.priority ?? "medium"} priority`
                          }
                        </p>
                      </div>
                      {tc.tags && tc.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {tc.tags.slice(0, 2).map(t => (
                            <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">{t}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {uploadResult.parsed.length > 20 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      +{uploadResult.parsed.length - 20} more test cases
                    </p>
                  )}
                </div>
                {validCases.length > 0 && (
                  <Button className="w-full mt-4" onClick={() => setActiveTab("import")}>
                    Continue to Import
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2 — IMPORT
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="import" className="space-y-6 mt-0">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Import Settings</CardTitle>
                <CardDescription>Configure where to save the test cases</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Target Test Suite</Label>
                  <Select
                    value={selectedSuite || "__none__"}
                    onValueChange={(v) => setSelectedSuite(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned (no suite)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned (no suite)</SelectItem>
                      {suites.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3 rounded-xl bg-muted/50 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valid cases</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{validCases.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Skipped (errors)</span>
                    <span className="font-semibold text-destructive">{invalidCases.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Suite</span>
                    <span className="font-semibold truncate max-w-[120px]">
                      {suites.find(s => s.id === selectedSuite)?.name ?? "Unassigned"}
                    </span>
                  </div>
                </div>

                {isImporting && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Importing...</span>
                      <span>{importProgress}%</span>
                    </div>
                    <Progress value={importProgress} className="h-2" />
                  </div>
                )}

                {importedCases.length > 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {importedCases.length} cases imported successfully
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    onClick={handleImport}
                    disabled={isImporting || validCases.length === 0}
                  >
                    {isImporting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>
                    ) : (
                      <><FolderOpen className="h-4 w-4 mr-2" />Import {validCases.length} Test Cases</>
                    )}
                  </Button>
                )}

                {importedCases.length > 0 && (
                  <Button className="w-full" onClick={() => setActiveTab("testdata")}>
                    Set Up Test Data
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Test Cases to Import</CardTitle>
                <CardDescription>{validCases.length} valid test cases ready</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {validCases.map((tc, i) => (
                    <div key={i} className="p-3 rounded-lg border border-border/50 bg-muted/30 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">{tc.title}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{tc.priority}</Badge>
                      </div>
                      {tc.description && (
                        <p className="text-xs text-muted-foreground truncate">{tc.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{tc.steps.length} steps</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 3 — TEST DATA & CREDENTIALS
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="testdata" className="space-y-5 mt-0">

          {/* ── Section 1: Credentials ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                    <KeyRound className="h-4 w-4 text-rose-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Credentials</CardTitle>
                    <CardDescription className="text-xs">Injected as <code className="font-mono bg-muted px-1 rounded">{"{{username}}"}</code>, <code className="font-mono bg-muted px-1 rounded">{"{{password}}"}</code>, <code className="font-mono bg-muted px-1 rounded">{"{{baseUrl}}"}</code></CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {credsSaved && !credsEditing && (
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs">
                      <ShieldCheck className="h-3 w-3 mr-1" />Saved
                    </Badge>
                  )}
                  {!credsEditing && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setCredsEditing(true)}>
                      <Pencil className="h-3 w-3" />Edit
                    </Button>
                  )}
                  {(credUsername || credPassword || credUrl) && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={clearCredentials}>
                      <X className="h-3 w-3" />Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {credsEditing ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Username / Email</Label>
                    <div className="relative">
                      <AtSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input className="pl-8 h-9 text-sm" placeholder="admin@example.com" value={credUsername} onChange={e => setCredUsername(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        className="pl-8 pr-9 h-9 text-sm"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={credPassword}
                        onChange={e => setCredPassword(e.target.value)}
                      />
                      <button type="button" className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(v => !v)}>
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Base URL</Label>
                    <div className="relative">
                      <Globe className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input className="pl-8 h-9 text-sm" placeholder="https://app.example.com" value={credUrl} onChange={e => setCredUrl(e.target.value)} />
                    </div>
                  </div>
                  <div className="sm:col-span-3 flex gap-2 pt-1">
                    <Button size="sm" className="gap-1.5" onClick={saveCredentials}>
                      <Save className="h-3.5 w-3.5" />Save Credentials
                    </Button>
                    {credsSaved && <Button size="sm" variant="ghost" onClick={() => setCredsEditing(false)}>Cancel</Button>}
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Username", value: credUsername, icon: <AtSign className="h-3.5 w-3.5" /> },
                    { label: "Password", value: credPassword ? "•".repeat(Math.min(credPassword.length, 12)) : "", icon: <Lock className="h-3.5 w-3.5" /> },
                    { label: "Base URL", value: credUrl, icon: <Globe className="h-3.5 w-3.5" /> },
                  ].map(({ label, value, icon }) => (
                    <div key={label} className="p-3 rounded-xl bg-muted/40 border border-border/50">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">{icon}{label}</div>
                      <p className="text-sm font-medium truncate">{value || <span className="text-muted-foreground/50 italic">not set</span>}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Section 2: Test Data Table ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Database className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Test Data Parameters</CardTitle>
                    <CardDescription className="text-xs">Use <code className="font-mono bg-muted px-1 rounded">{"{{key}}"}</code> in test steps to inject values at runtime</CardDescription>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={addTestDataRow}>
                  <Plus className="h-3.5 w-3.5" />Add Row
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {testDataRows.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                  <Database className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No test data yet</p>
                  <p className="text-xs mt-1">Add rows manually or upload a data sheet below</p>
                </div>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-[30%]">Key / Placeholder</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-[35%]">Value</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-[18%]">Type</th>
                        <th className="px-3 py-2 w-[17%]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {testDataRows.map((row, idx) => (
                        <tr key={idx} className={cn("border-b last:border-0 transition-colors", editingRowIdx === idx ? "bg-primary/5" : "hover:bg-muted/30")}>
                          {editingRowIdx === idx && editingRow ? (
                            <>
                              <td className="px-2 py-1.5">
                                <Input className="h-7 text-xs font-mono" placeholder="e.g. username" value={editingRow.key} onChange={e => setEditingRow({ ...editingRow, key: e.target.value })} />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  className="h-7 text-xs"
                                  type={editingRow.type === "password" ? "password" : "text"}
                                  placeholder="value"
                                  value={editingRow.value}
                                  onChange={e => setEditingRow({ ...editingRow, value: e.target.value })}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Select value={editingRow.type} onValueChange={v => setEditingRow({ ...editingRow, type: v as TestDataParam["type"] })}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(TYPE_META).map(([val, meta]) => (
                                      <SelectItem key={val} value={val} className="text-xs">
                                        <span className="flex items-center gap-1.5">{meta.icon}{meta.label}</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={saveEditRow}><Save className="h-3.5 w-3.5" /></Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEditRow}><X className="h-3.5 w-3.5" /></Button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2">
                                <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{"{{"}{row.key}{"}}"}</code>
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-xs truncate max-w-[160px] block">
                                  {row.type === "password" ? "•".repeat(Math.min((row.value || "").length, 12)) : (row.value || <span className="text-muted-foreground/50 italic">empty</span>)}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={cn("flex items-center gap-1 text-xs", TYPE_META[row.type]?.color ?? "text-muted-foreground")}>
                                  {TYPE_META[row.type]?.icon}{TYPE_META[row.type]?.label ?? row.type}
                                </span>
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEditRow(idx)}><Pencil className="h-3.5 w-3.5" /></Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteTestDataRow(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Section 3: Data Sheet Upload ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <FileSpreadsheet className="h-4 w-4 text-violet-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Upload Data Sheet</CardTitle>
                  <CardDescription className="text-xs">
                    .xlsx or .csv with columns: <code className="font-mono bg-muted px-1 rounded">key</code>, <code className="font-mono bg-muted px-1 rounded">value</code>, <code className="font-mono bg-muted px-1 rounded">type</code> — merged into the table above
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                  sheetDragging ? "border-violet-500 bg-violet-500/5" : "border-border/60 hover:border-violet-500/50 hover:bg-muted/30"
                )}
                onDragOver={e => { e.preventDefault(); setSheetDragging(true); }}
                onDragLeave={() => setSheetDragging(false)}
                onDrop={e => { e.preventDefault(); setSheetDragging(false); const f = e.dataTransfer.files[0]; if (f) parseDataSheet(f); }}
                onClick={() => dataSheetRef.current?.click()}
              >
                <input ref={dataSheetRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) parseDataSheet(f); e.target.value = ""; }}
                />
                {isParsingSheet ? (
                  <><Loader2 className="h-8 w-8 text-violet-500 animate-spin" /><p className="text-sm font-medium">Parsing sheet...</p></>
                ) : sheetFileName ? (
                  <>
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                      <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    </div>
                    <p className="text-sm font-semibold">{sheetFileName}</p>
                    <p className="text-xs text-muted-foreground">{testDataRows.length} params in table</p>
                    <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); setSheetFileName(""); }}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Upload Different Sheet
                    </Button>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-8 w-8 text-muted-foreground/50" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Drop data sheet here</p>
                      <p className="text-xs text-muted-foreground mt-0.5">or click to browse</p>
                    </div>
                    <div className="flex gap-2">
                      {[".xlsx", ".xls", ".csv"].map(e => <Badge key={e} variant="secondary" className="font-mono text-xs">{e}</Badge>)}
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground max-w-xs text-center">
                      Expected columns: <strong>key</strong> | <strong>value</strong> | <strong>type</strong> (text/password/email/url/number)
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Summary + Continue ── */}
          <div className="flex items-center justify-between p-4 rounded-2xl border border-border/60 bg-muted/20">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Database className="h-4 w-4 text-blue-500" />
                <span className="font-semibold">{testDataRows.length}</span>
                <span className="text-muted-foreground">params</span>
              </div>
              {(credUsername || credPassword) && (
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span className="text-muted-foreground">Credentials set</span>
                </div>
              )}
              {testDataRows.length > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  Placeholders will be replaced in test steps at execution time
                </div>
              )}
            </div>
            <Button onClick={() => setActiveTab("generate")} className="gap-2">
              Continue to Generate Scripts
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 4 — GENERATE SCRIPTS
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="generate" className="space-y-6 mt-0">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Script Configuration</CardTitle>
                <CardDescription>Choose language and framework</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Framework</Label>
                  <Select value={framework} onValueChange={setFramework}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FRAMEWORKS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map(l => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3 rounded-xl bg-muted/50 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Test cases</span>
                    <span className="font-semibold">{importedCases.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Framework</span>
                    <span className="font-semibold capitalize">{framework}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Language</span>
                    <span className="font-semibold">
                      {LANGUAGES.find(l => l.value === language)?.label}
                    </span>
                  </div>
                </div>

                {isGenerating && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Generating scripts...</span>
                      <span>{genProgress}%</span>
                    </div>
                    <Progress value={genProgress} className="h-2" />
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={handleGenerateScripts}
                  disabled={isGenerating || importedCases.length === 0}
                >
                  {isGenerating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" />Generate {importedCases.length} Scripts</>
                  )}
                </Button>

                {generatedScripts.length > 0 && (
                  <Button variant="outline" className="w-full" onClick={handleDownloadAll}>
                    <Download className="h-4 w-4 mr-2" />
                    Download All Scripts
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Generated Scripts</CardTitle>
                    <CardDescription>
                      {generatedScripts.length > 0
                        ? `${generatedScripts.length} scripts · ${LANGUAGES.find(l => l.value === language)?.label} · ${framework}`
                        : "Scripts will appear here after generation"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {generatedScripts.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Code2 className="h-12 w-12 mx-auto mb-4 opacity-40" />
                    <p className="font-medium">No scripts generated yet</p>
                    <p className="text-sm mt-1">Configure and click Generate Scripts</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                    {generatedScripts.map((s, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Code2 className="h-4 w-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{s.testCaseTitle}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{s.framework}</Badge>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {LANGUAGES.find(l => l.value === s.language)?.label}
                              </Badge>
                              {s.generatedBy === "rule-based" && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                                  rule-based
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPreviewScript(s)}
                          className="shrink-0"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5" />
                          Preview
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {generatedScripts.length > 0 && (
                  <Button className="w-full mt-4" onClick={() => setActiveTab("execute")}>
                    Proceed to Run Tests
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 5 — EXECUTE
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="execute" className="space-y-6 mt-0">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Run Uploaded Test Cases
                </CardTitle>
                <CardDescription>
                  Execute the {importedCases.length} imported test cases against a target URL
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="target-url">Target URL *</Label>
                  <Input
                    id="target-url"
                    placeholder="https://your-app.com"
                    value={targetUrl}
                    onChange={e => setTargetUrl(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Test Suite</Label>
                  <Select
                    value={execSuiteId || selectedSuite || "__none__"}
                    onValueChange={(v) => setExecSuiteId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All imported test cases" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">All imported test cases</SelectItem>
                      {suites.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Test data summary */}
                {buildTestData().length > 0 && (
                  <div className="p-3 rounded-xl bg-blue-500/8 border border-blue-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                      <Database className="h-3.5 w-3.5" />
                      {buildTestData().length} test data params will be injected
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {buildTestData().slice(0, 6).map((p, i) => (
                        <code key={i} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{"{{"}{p.key}{"}}"}</code>
                      ))}
                      {buildTestData().length > 6 && (
                        <span className="text-[10px] text-muted-foreground">+{buildTestData().length - 6} more</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="p-4 rounded-xl bg-muted/50 space-y-3 text-sm">
                  <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">Execution Summary</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Test Cases",   value: importedCases.length },
                      { label: "Framework",    value: "Playwright + Selenium" },
                      { label: "Environment",  value: "Staging" },
                      { label: "Self-Healing", value: "Enabled" },
                    ].map(item => (
                      <div key={item.label} className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="font-semibold">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {importedCases.length === 0 && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Import test cases first before running execution.
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => executeMutation.mutate()}
                  disabled={!targetUrl || importedCases.length === 0 || executeMutation.isPending}
                >
                  {executeMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting...</>
                  ) : (
                    <><Play className="h-4 w-4 mr-2" />Run {importedCases.length} Test Cases</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* How it works */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">How Execution Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {[
                  {
                    icon: <Play className="h-4 w-4 text-blue-500" />,
                    title: "AI-Powered Browser Automation",
                    desc: "Each test step is interpreted by the AI executor using Selenium + Playwright. It reads the live DOM, identifies elements, and executes actions.",
                  },
                  {
                    icon: <RefreshCw className="h-4 w-4 text-violet-500" />,
                    title: "Self-Healing",
                    desc: "If a step fails, the executor retries with fresh page analysis. Element locators are automatically adapted to DOM changes.",
                  },
                  {
                    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
                    title: "Real-Time Results",
                    desc: "Results, screenshots, and performance metrics are captured per step. View them in the Executions page.",
                  },
                  {
                    icon: <Code2 className="h-4 w-4 text-amber-500" />,
                    title: "Generated Scripts",
                    desc: "The scripts you generated can be downloaded and run independently in your CI/CD pipeline using the same framework.",
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Script Preview Dialog ── */}
      <Dialog open={!!previewScript} onOpenChange={() => setPreviewScript(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code2 className="h-4 w-4" />
              {previewScript?.testCaseTitle}
              <Badge variant="secondary" className="ml-2 text-xs">
                {LANGUAGES.find(l => l.value === previewScript?.language)?.label} · {previewScript?.framework}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded-xl bg-muted p-4">
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {previewScript?.code}
            </pre>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (previewScript) {
                  const extMap: Record<string, string> = { typescript: "ts", javascript: "js", python: "py", java: "java", csharp: "cs" };
                  const ext = extMap[previewScript.language] ?? "txt";
                  const blob = new Blob([previewScript.code], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${previewScript.testCaseTitle.replace(/[^a-z0-9]/gi, "_")}.${ext}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              }}
            >
              <Download className="h-4 w-4 mr-2" /> Download
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (previewScript) navigator.clipboard.writeText(previewScript.code);
                toast({ title: "Copied", description: "Script copied to clipboard." });
              }}
            >
              Copy Code
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
