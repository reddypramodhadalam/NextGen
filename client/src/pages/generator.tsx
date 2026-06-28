import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel, SelectSeparator,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Sparkles, Loader2, Plus, Check, FileText, ArrowRight, TestTube2,
  Globe, Cloud, Database, Layers, Monitor, AppWindow, Coffee, Smartphone,
  Zap, FileCode, GitMerge, ChevronDown, Info, Brain, Shield, AlertTriangle,
  Target, BarChart3, Bot, Settings2, ChevronRight, Code2, Users, Cpu,
  Network, Activity, CheckCircle2, XCircle, Clock, TrendingUp,
  Upload, FileUp, RefreshCw, X, Wand2, BookOpen, FileSearch,
  Maximize2, Minimize2, ListChecks,
} from "lucide-react";
import type { TestSuite } from "@shared/schema";
import {
  AiDisclaimerBanner,
  HumanReviewGate,
  type ReviewableItem,
} from "@/components/governance";
import { useGovernance } from "@/hooks/useGovernance";

// ── Types ──────────────────────────────────────────────────────────────────

interface AppProfile {
  type: string; label: string; description: string; icon: string;
  category: string; color: string; aiPromptHints: string; locatorStrategy: string;
}
interface GeneratedTestCase {
  testCaseId?: string; title: string; description: string; preconditions: string;
  steps: { step: string; expected: string }[]; priority: string;
  testType?: string; reasoning?: string; confidenceScore?: number;
  riskLevel?: string; automationSuitable?: boolean; testData?: Record<string,string>;
}
interface CoverageSummary {
  totalTestCases: number;
  byType: Record<string, number>;
  coverageAreas?: string[];
  gapAreas?: string[];
  // JDE-specific coverage properties
  objectsCovered?: string[];
  tablesCovered?: string[];
  modulesCovered?: string[];
}
interface RiskArea {
  area: string; severity: string; mitigation: string;
}
interface AutomationCandidate {
  testCaseId: string; reason: string; suggestedFramework: string;
}
interface SpecParseResult {
  filename: string; size: number; pages: number; truncated: boolean;
  charCount: number; sections: string[]; summary: string; text: string;
  // JDE-specific fields from parse-spec
  isJDEDocument?: boolean;
  jdeObjects?: string[];
  structuredDocument?: any;
}
interface GenerationResult {
  testCases: GeneratedTestCase[];
  coverageSummary?: CoverageSummary;
  assumptions?: string[];
  riskAreas?: RiskArea[];
  automationCandidates?: AutomationCandidate[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, any> = {
  Globe, Cloud, Database, Layers, Monitor, AppWindow, Coffee,
  Smartphone, Zap, FileCode, GitMerge,
};
const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string }> = {
  blue:    { bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400",    border: "border-blue-500/30" },
  sky:     { bg: "bg-sky-500/10",     text: "text-sky-600 dark:text-sky-400",      border: "border-sky-500/30" },
  amber:   { bg: "bg-amber-500/10",   text: "text-amber-600 dark:text-amber-400",  border: "border-amber-500/30" },
  orange:  { bg: "bg-orange-500/10",  text: "text-orange-600 dark:text-orange-400",border: "border-orange-500/30" },
  red:     { bg: "bg-red-500/10",     text: "text-red-600 dark:text-red-400",      border: "border-red-500/30" },
  violet:  { bg: "bg-violet-500/10",  text: "text-violet-600 dark:text-violet-400",border: "border-violet-500/30" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400",border: "border-emerald-500/30" },
  green:   { bg: "bg-green-500/10",   text: "text-green-600 dark:text-green-400",  border: "border-green-500/30" },
  cyan:    { bg: "bg-cyan-500/10",    text: "text-cyan-600 dark:text-cyan-400",    border: "border-cyan-500/30" },
  purple:  { bg: "bg-purple-500/10",  text: "text-purple-600 dark:text-purple-400",border: "border-purple-500/30" },
  pink:    { bg: "bg-pink-500/10",    text: "text-pink-600 dark:text-pink-400",    border: "border-pink-500/30" },
  slate:   { bg: "bg-slate-500/10",   text: "text-slate-600 dark:text-slate-400",  border: "border-slate-500/30" },
};

const testTypeColors: Record<string, string> = {
  functional:    "bg-blue-500/10 text-blue-500 border-blue-500/20",
  negative:      "bg-red-500/10 text-red-500 border-red-500/20",
  boundary:      "bg-amber-500/10 text-amber-500 border-amber-500/20",
  security:      "bg-rose-500/10 text-rose-600 border-rose-500/20",
  smoke:         "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  regression:    "bg-violet-500/10 text-violet-500 border-violet-500/20",
  e2e:           "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  integration:   "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  accessibility: "bg-teal-500/10 text-teal-500 border-teal-500/20",
  performance:   "bg-orange-500/10 text-orange-500 border-orange-500/20",
  api:           "bg-sky-500/10 text-sky-500 border-sky-500/20",
  usability:     "bg-pink-500/10 text-pink-500 border-pink-500/20",
};

// ── Test Case Card ─────────────────────────────────────────────────────────

function TestCaseCard({ test, index, selected, onToggle }: {
  test: GeneratedTestCase; index: number; selected: boolean; onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeStyle = testTypeColors[test.testType || "functional"] || testTypeColors.functional;
  const confidence = test.confidenceScore ?? 80;
  const confColor = confidence >= 90 ? "text-emerald-500" : confidence >= 70 ? "text-amber-500" : "text-red-400";
  return (
    <div className={cn(
      "rounded-xl border transition-all duration-200",
      selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
    )}>
      <div className="flex items-start gap-3 p-3">
        <button onClick={onToggle} className="mt-0.5 shrink-0">
          <div className={cn("h-5 w-5 rounded border flex items-center justify-center transition-colors",
            selected ? "bg-primary border-primary" : "border-border")}>
            {selected && <Check className="h-3 w-3 text-primary-foreground" />}
          </div>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {test.testCaseId && (
              <span className="text-xs font-mono text-muted-foreground">{test.testCaseId}</span>
            )}
            <span className="font-semibold text-sm">{test.title}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", typeStyle)}>
              {test.testType || "functional"}
            </span>
            <PriorityBadge priority={test.priority as any} />
            {test.riskLevel && test.riskLevel !== "low" && (
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium",
                test.riskLevel === "critical" ? "bg-red-500/10 text-red-600 border-red-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
              )}>risk:{test.riskLevel}</span>
            )}
            {test.automationSuitable && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                auto-ready
              </span>
            )}
            <span className={cn("text-[10px] font-mono ml-auto", confColor)}>{confidence}%</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">{test.description}</p>
          {/* Steps table — Step # · Action · Expected Result */}
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left font-semibold text-muted-foreground px-2 py-1.5 w-7">#</th>
                  <th className="text-left font-semibold text-muted-foreground px-2 py-1.5">Action / Step</th>
                  <th className="text-left font-semibold text-muted-foreground px-2 py-1.5">Expected Result</th>
                </tr>
              </thead>
              <tbody>
                {test.steps.slice(0, expanded ? 99 : 3).map((s, i) => (
                  <tr key={i} className="border-t border-border/40 align-top">
                    <td className="px-2 py-1.5 font-mono text-muted-foreground text-right tabular-nums">{i + 1}</td>
                    <td className="px-2 py-1.5 text-foreground/90 break-words">{s.step}</td>
                    <td className="px-2 py-1.5 text-muted-foreground break-words">{s.expected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {test.steps.length > 3 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary mt-1.5 hover:underline"
            >
              {expanded ? "Show less" : `+${test.steps.length - 3} more steps`}
            </button>
          )}
          {expanded && test.reasoning && (
            <p className="text-xs text-muted-foreground mt-2 italic border-l-2 border-primary/30 pl-2">{test.reasoning}</p>
          )}
          {expanded && test.testData && Object.keys(test.testData).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(test.testData).map(([k,v]) => (
                <span key={k} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                  {k}: {String(v).substring(0,30)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Generator() {
  const { toast } = useToast();

  // Core inputs
  const [requirement, setRequirement] = useState("");
  const [requirementTitle, setRequirementTitle] = useState("");
  const [selectedSuite, setSelectedSuite] = useState("");
  const [selectedAppType, setSelectedAppType] = useState("web");
  const [includeE2E, setIncludeE2E] = useState(false);
  const [testDepth, setTestDepth] = useState<"standard"|"comprehensive"|"exhaustive">("comprehensive");

  // Architect context fields
  const [showContext, setShowContext] = useState(false);
  const [appName, setAppName] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [businessUseCase, setBusinessUseCase] = useState("");
  const [userRoles, setUserRoles] = useState("");
  const [appContext, setAppContext] = useState("");
  const [functionalRequirements, setFunctionalRequirements] = useState("");
  const [nonFunctionalRequirements, setNonFunctionalRequirements] = useState("");
  const [apiDetails, setApiDetails] = useState("");
  const [uiWorkflow, setUiWorkflow] = useState("");
  const [dataVariations, setDataVariations] = useState("");
  const [environment, setEnvironment] = useState("");

  // Results
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [selectedTests, setSelectedTests] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState("tests");
  const [resultsExpanded, setResultsExpanded] = useState(false);

  // ── Governance ─────────────────────────────────────────────────────────
  // In VALIDATED systems, "Save tests" must open a HumanReviewGate that
  // collects an attestation + e-signature before the rows are written.
  const governance = useGovernance();
  const [reviewGateOpen, setReviewGateOpen] = useState(false);
  const [savedTestCaseIds, setSavedTestCaseIds] = useState<string[]>([]);

  // Spec upload
  const [specResult, setSpecResult] = useState<SpecParseResult | null>(null);
  const [isParsingSpec, setIsParsingSpec] = useState(false);
  const [specDragging, setSpecDragging] = useState(false);
  const [showSpecUpload, setShowSpecUpload] = useState(true);
  const specInputRef = useRef<HTMLInputElement>(null);

  const { data: suites = [] } = useQuery<TestSuite[]>({ queryKey: ["/api/test-suites"] });
  const { data: profilesResponse } = useQuery<{ profiles: AppProfile[], categories: Record<string, string[]> }>({ queryKey: ["/api/app-profiles"] });
  const profiles = profilesResponse?.profiles || [];
  const selectedProfile = profiles.find((p: AppProfile) => p.type === selectedAppType);
  const profileColors = selectedProfile ? (COLOR_CLASSES[selectedProfile.color] || COLOR_CLASSES.blue) : COLOR_CLASSES.blue;

  // Group profiles by category for the dropdown (preserves a stable, sensible order)
  const groupedProfiles = (() => {
    const order = ["web", "erp", "desktop", "mobile", "api"];
    const labels: Record<string, string> = {
      web: "Web Applications", erp: "ERP Systems", desktop: "Desktop Applications",
      mobile: "Mobile Applications", api: "API & Services",
    };
    const groups = new Map<string, AppProfile[]>();
    for (const p of profiles) {
      const cat = (p as any).category || "web";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(p);
    }
    return order
      .filter(cat => groups.has(cat))
      .map(cat => ({ category: cat, label: labels[cat] || cat, items: groups.get(cat)! }))
      .concat(
        Array.from(groups.keys())
          .filter(cat => !order.includes(cat))
          .map(cat => ({ category: cat, label: labels[cat] || cat, items: groups.get(cat)! }))
      );
  })();
  const SelectedAppIcon = selectedProfile ? (ICON_MAP[selectedProfile.icon] || Globe) : AppWindow;

  const contextFieldCount = [appName, moduleName, businessUseCase, userRoles, appContext,
    functionalRequirements, nonFunctionalRequirements, apiDetails, uiWorkflow, dataVariations, environment
  ].filter(Boolean).length;

  const generateMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        // Core fields — aligned with /api/generate-tests schema
        title:                    requirementTitle || "Untitled Requirement",
        description:              requirement,                        // was 'requirements' — FIXED
        appType:                  selectedAppType,                    // ADD
        appHints:                 selectedProfile?.aiPromptHints || "", // ADD
        testDepth,                                                    // was numberOfTestCases — FIXED
        includeE2E,                                                   // ADD
        // Architect context — all as separate fields (server schema supports all)
        appName,
        moduleName,
        businessUseCase,
        userRoles,
        appContext,               // ADD (was missing from payload)
        functionalRequirements,
        nonFunctionalRequirements,
        apiDetails,
        uiWorkflow,
        dataVariations,
        environment,
      };
      
      // For JDE, include spec document data for better test generation
      if (selectedAppType === "jde" && specResult) {
        payload.specText = specResult.text;
        payload.structuredDocument = specResult.structuredDocument;
        payload.jdeObjects = specResult.jdeObjects;
        console.log("[Generator] JDE spec data included:", {
          hasSpecText: !!payload.specText,
          hasStructuredDocument: !!payload.structuredDocument,
          jdeObjects: payload.jdeObjects || []
        });
      }
      
      // Use JDE-specific endpoint for Oracle JDE to get accurate JDE test cases
      const endpoint = selectedAppType === "jde" ? "/api/generate-jde-tests" : "/api/generate-tests";
      console.log("[Generator] Using endpoint:", endpoint, "for appType:", selectedAppType);
      
      try {
        const res = await apiRequest("POST", endpoint, payload);
        return res.json();
      } catch (fetchError: any) {
        console.error("[Generator] API request failed:", fetchError);
        // Check if the error message contains HTML (indicates server returning error page)
        if (fetchError.message?.includes("<!DOCTYPE") || fetchError.message?.includes("<html")) {
          throw new Error("Server returned an error page. Please check if the server is running correctly.");
        }
        throw fetchError;
      }
    },
    onSuccess: (data: any) => {
      const rawCases: any[] = data.testCases || [];

      const mapped: GeneratedTestCase[] = rawCases.map((tc: any, i: number) => {
        // Normalise steps — handle string arrays, object arrays, or missing.
        // Field names vary across AI responses, so check every known variant.
        let steps: { step: string; expected: string }[] = [];
        if (Array.isArray(tc.steps) && tc.steps.length > 0) {
          steps = tc.steps
            .map((s: any) => {
              if (typeof s === "string") {
                return { step: s, expected: "Completed successfully" };
              }
              const stepText =
                s.step ||
                (s.action && s.target ? `${s.action}: ${s.target}` : s.action) ||
                s.actionDescription ||
                s.description ||
                s.instruction ||
                "";
              const expectedText =
                s.expected ||
                s.expectedResult ||
                s.expectedOutcome ||
                s.result ||
                "Completed successfully";
              return { step: stepText, expected: expectedText };
            })
            .filter((s: any) => s.step && s.step.trim());
        }
        const safeTitle = tc.title || tc.testCaseName || tc.name || `Test Case ${i + 1}`;
        if (steps.length === 0) {
          const desc = tc.description || tc.objective || "";
          steps = [
            {
              step: desc ? `Execute: ${String(desc).split("\n")[0]}` : `Execute ${safeTitle}`,
              expected: "Completed successfully",
            },
          ];
        }
        return {
          testCaseId:       tc.testCaseId  || `TC_${String(i + 1).padStart(3, "0")}`,
          title:            safeTitle,
          description:      tc.description || tc.objective || "",
          priority:         tc.priority    || "medium",
          preconditions:    Array.isArray(tc.preconditions) ? tc.preconditions.join("; ") : (tc.preconditions || "N/A"),
          steps,
          testType:         tc.testType         || "functional",
          confidenceScore:  tc.confidenceScore  ?? 85,
          riskLevel:        tc.riskLevel        || "low",
          automationSuitable: tc.automationSuitable ?? (tc.testType === "functional" || tc.testType === "smoke"),
          reasoning:        tc.reasoning || "",
        };
      });

      const generationResult: GenerationResult = {
        testCases:            mapped,
        coverageSummary:      data.coverageSummary || {
          totalTestCases: mapped.length,
          byType:         { functional: mapped.length },
          coverageAreas:  ["Core Functionality", "User Workflows", "Data Validation"],
          gapAreas:       [],
        },
        riskAreas:            data.riskAreas            || [],
        automationCandidates: data.automationCandidates || [],
        assumptions:          data.assumptions          || [],
      };

      setResult(generationResult);
      setSelectedTests(new Set(mapped.map((_, i) => i)));
      setActiveTab("tests");
      toast({
        title:       `✅ ${mapped.length} Test Cases Generated`,
        description: `Coverage: ${Object.keys(generationResult.coverageSummary?.byType || {}).filter(k => (generationResult.coverageSummary!.byType[k] as number) > 0).join(", ") || "functional"} · ${data.generatedBy === "ai" ? "AI-powered" : "Rule-based"} generation`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Generation Failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (testCases: GeneratedTestCase[]) => {
      // Save sequentially so we can collect the returned IDs in the order the
      // user picked them — the IDs are needed for the HumanReviewGate.
      const created: Array<{ id: string; title: string; preview: string }> = [];
      for (const tc of testCases) {
        const res = await apiRequest("POST", "/api/test-cases", {
          ...tc,
          suiteId: selectedSuite || null,
          generatedByAI: true,
        });
        const body = await res.json();
        created.push({
          id: body.id,
          title: body.title,
          preview: (body.description || "").slice(0, 140),
        });
      }
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-cases"] });
      const ids = created.map((c) => c.id);
      setSavedTestCaseIds(ids);

      if (governance.requireHumanReview) {
        // VALIDATED: the rows now exist as DRAFT. Open the review gate so the
        // user records an APPROVED governance review before they can execute.
        toast({
          title: "Tests saved as DRAFT",
          description: "Human review required before execution. Opening review dialog…",
        });
        setReviewGateOpen(true);
      } else {
        toast({
          title: "Tests Saved",
          description: `${created.length} test cases saved to repository.`,
        });
        setResult(null);
        setSelectedTests(new Set());
        setRequirement("");
        setRequirementTitle("");
      }
    },
    onError: () => {
      toast({ title: "Save Failed", description: "Failed to save test cases.", variant: "destructive" });
    },
  });

  const handleGenerate = () => {
    if (!requirement.trim()) {
      toast({ title: "Requirement Required", description: "Please enter a requirement description.", variant: "destructive" });
      return;
    }
    generateMutation.mutate();
  };

  const handleSave = () => {
    const toSave = (result?.testCases || []).filter((_, i) => selectedTests.has(i));
    if (!toSave.length) {
      toast({ title: "No Tests Selected", description: "Select at least one test case.", variant: "destructive" });
      return;
    }
    saveMutation.mutate(toSave);
  };

  const toggleTest = (i: number) => {
    const n = new Set(selectedTests);
    n.has(i) ? n.delete(i) : n.add(i);
    setSelectedTests(n);
  };

  // ── Spec upload handlers ────────────────────────────────────────────────
  const parseSpec = useCallback(async (file: File) => {
    setIsParsingSpec(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/generate/parse-spec", { method: "POST", body: formData });
      const rawText = await res.text();
      let data: any;
      try { data = JSON.parse(rawText); } catch { throw new Error("Invalid response from server"); }
      if (!res.ok) throw new Error(data.error || "Spec parsing failed");
      setSpecResult(data as SpecParseResult);
      
      // Show appropriate toast based on whether JDE document was detected
      if (data.isJDEDocument && data.jdeObjects?.length > 0) {
        toast({
          title: "🎯 JDE Spec Detected!",
          description: `"${data.filename}" · ${data.pages} page${data.pages !== 1 ? "s" : ""} · Found ${data.jdeObjects.length} JDE objects: ${data.jdeObjects.slice(0, 3).join(", ")}${data.jdeObjects.length > 3 ? "..." : ""}`,
        });
        // Auto-select JDE profile if a JDE document is detected
        setSelectedAppType("jde");
      } else {
        toast({
          title: "Spec Parsed Successfully",
          description: `"${data.filename}" · ${data.pages} page${data.pages !== 1 ? "s" : ""} · ${(data.charCount / 1000).toFixed(1)}k chars · ${data.sections.length} sections`,
        });
      }
    } catch (err: any) {
      toast({ title: "Parse Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsParsingSpec(false);
    }
  }, [toast]);

  const applySpecToRequirement = useCallback(() => {
    if (!specResult) return;
    setRequirementTitle(prev => prev || specResult.filename.replace(/\.[^.]+$/, ""));
    setRequirement(prev => prev || specResult.text.substring(0, 2000));
    toast({ title: "Auto-filled", description: "Requirement title and description updated from spec." });
  }, [specResult]);

  const applySpecToAllContext = useCallback(() => {
    if (!specResult) return;
    setRequirementTitle(prev => prev || specResult.filename.replace(/\.[^.]+$/, ""));
    setRequirement(prev => prev || specResult.text.substring(0, 2000));
    // Extract functional requirements from sections
    const funcSections = specResult.sections
      .filter(s => /functional|requirement|feature|story|acceptance/i.test(s))
      .slice(0, 10)
      .join("\n");
    if (funcSections) setFunctionalRequirements(prev => prev || funcSections);
    // Use AI summary as business use case
    if (specResult.summary && specResult.summary !== "(AI summary unavailable)") {
      setBusinessUseCase(prev => prev || specResult.summary);
    }
    // Use all sections as app context
    if (specResult.sections.length > 0) {
      setAppContext(prev => prev || specResult.sections.slice(0, 20).join(", "));
    }
    setShowContext(true);
    toast({ title: "All Context Auto-filled", description: "Requirement + Architect Context populated from spec." });
  }, [specResult]);

  const depthInfo = {
    standard:      { label: "Standard", desc: "15-20 test cases", color: "text-emerald-500" },
    comprehensive: { label: "Comprehensive", desc: "25-35 test cases", color: "text-blue-500" },
    exhaustive:    { label: "Exhaustive", desc: "40-60 test cases", color: "text-violet-500" },
  }[testDepth];

  return (
    <div className="p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI QA Architect</h1>
            <p className="text-sm text-muted-foreground">World-class test generation with enterprise domain expertise</p>
          </div>
        </div>
        {result && (
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="font-medium text-emerald-600 dark:text-emerald-400">{result.testCases.length} tests generated</span>
          </div>
        )}
      </div>

      {/*
        Layout: a 12-column grid on xl screens.
        - Input panel: 4 cols (compact, scrollable on its own)
        - Results panel: 8 cols (the "big screen" the user asked for)
        When the user expands results to fullscreen, the input panel collapses
        and results take the full 12 columns.
      */}
      <div className={cn("grid gap-5 items-start", resultsExpanded ? "xl:grid-cols-1" : "xl:grid-cols-12")}>
        {/* ── LEFT PANEL: Input ──────────────────────────────────────────── */}
        <div className={cn("space-y-4 xl:col-span-4 xl:sticky xl:top-4", resultsExpanded && "hidden")}>
          <div className="xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1.5 space-y-4">            {/* placeholder marker — content unchanged below */}
          {/* ── Spec / Documentation Upload Card ──────────────────────── */}
          <Card className={cn(specResult && "border-violet-500/40 bg-violet-500/3")}>
            <Collapsible open={showSpecUpload} onOpenChange={setShowSpecUpload}>
              <CollapsibleTrigger asChild>
                <button className="w-full text-left">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileSearch className={cn("h-4 w-4", specResult ? "text-violet-500" : "text-muted-foreground")} />
                      <span>Upload Spec / Documentation</span>
                      {specResult && !showSpecUpload && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1 bg-violet-500/10 text-violet-600 border-violet-500/20">
                          {specResult.filename}
                        </Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground font-normal">
                        {showSpecUpload ? "hide" : (specResult ? "spec loaded" : "upload PDF/DOCX/TXT")}
                      </span>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", showSpecUpload && "rotate-180")} />
                    </CardTitle>
                    {!showSpecUpload && !specResult && (
                      <CardDescription className="text-xs text-left">
                        Upload a requirements doc, PRD, or user story to auto-fill test inputs
                      </CardDescription>
                    )}
                  </CardHeader>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-3">
                  {!specResult ? (
                    /* ── Drop zone ── */
                    <div
                      className={cn(
                        "flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                        specDragging ? "border-violet-500 bg-violet-500/8" : "border-border/60 hover:border-violet-400/60 hover:bg-muted/30"
                      )}
                      onDragOver={e => { e.preventDefault(); setSpecDragging(true); }}
                      onDragLeave={() => setSpecDragging(false)}
                      onDrop={e => { e.preventDefault(); setSpecDragging(false); const f = e.dataTransfer.files[0]; if (f) parseSpec(f); }}
                      onClick={() => specInputRef.current?.click()}
                    >
                      <input ref={specInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) parseSpec(f); e.target.value = ""; }}
                      />
                      {isParsingSpec ? (
                        <><Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
                          <p className="text-sm font-medium text-muted-foreground">Parsing document...</p></>
                      ) : (
                        <>
                          <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                            <FileUp className="h-5 w-5 text-violet-500" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium">Drop spec document here</p>
                            <p className="text-xs text-muted-foreground mt-0.5">or click to browse · max 50 MB</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap justify-center">
                            {[".pdf", ".docx", ".txt", ".md"].map(ext => (
                              <Badge key={ext} variant="secondary" className="font-mono text-[10px]">{ext}</Badge>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    /* ── Parse result ── */
                    <div className="space-y-3">
                      {/* File info bar */}
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-violet-500/8 border border-violet-500/20">
                        <BookOpen className="h-4 w-4 text-violet-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{specResult.filename}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-[10px] text-muted-foreground">{specResult.pages} page{specResult.pages !== 1 ? "s" : ""}</span>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] text-muted-foreground">{(specResult.charCount / 1000).toFixed(1)}k chars</span>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] text-muted-foreground">{specResult.sections.length} sections</span>
                            {specResult.truncated && (
                              <span className="text-[10px] bg-amber-500/10 text-amber-600 border border-amber-500/20 px-1 rounded">truncated</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setSpecResult(null)}
                          className="shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* AI summary */}
                      {specResult.summary && specResult.summary !== "(AI summary unavailable)" && (
                        <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">AI Summary</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">{specResult.summary}</p>
                        </div>
                      )}

                      {/* Sections */}
                      {specResult.sections.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">Detected Sections</p>
                          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-1">
                            {specResult.sections.slice(0, 20).map((s, i) => (
                              <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border/50 truncate max-w-[160px]">{s}</span>
                            ))}
                            {specResult.sections.length > 20 && (
                              <span className="text-[10px] text-muted-foreground">+{specResult.sections.length - 20} more</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={applySpecToRequirement}>
                          <FileText className="h-3.5 w-3.5" />Auto-fill Requirement
                        </Button>
                        <Button size="sm" className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={applySpecToAllContext}>
                          <Wand2 className="h-3.5 w-3.5" />Auto-fill All Context
                        </Button>
                      </div>

                      {/* Re-upload link */}
                      <button
                        onClick={() => { setSpecResult(null); setTimeout(() => specInputRef.current?.click(), 50); }}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <RefreshCw className="h-3 w-3" />Upload different file
                      </button>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* App Type */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <AppWindow className="h-4 w-4" />Application Type
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Select value={selectedAppType} onValueChange={setSelectedAppType}>
                <SelectTrigger className="h-11" data-testid="select-app-type">
                  <SelectValue placeholder="Select application type...">
                    {selectedProfile && (
                      <span className="flex items-center gap-2.5">
                        <span className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", profileColors.bg)}>
                          <SelectedAppIcon className={cn("h-4 w-4", profileColors.text)} />
                        </span>
                        <span className="font-medium">{selectedProfile.label}</span>
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[360px]">
                  {groupedProfiles.map((group, gi) => (
                    <SelectGroup key={group.category}>
                      {gi > 0 && <SelectSeparator />}
                      <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        {group.label}
                      </SelectLabel>
                      {group.items.map(profile => {
                        const Icon = ICON_MAP[profile.icon] || Globe;
                        const colors = COLOR_CLASSES[profile.color] || COLOR_CLASSES.blue;
                        return (
                          <SelectItem key={profile.type} value={profile.type} className="py-2">
                            <span className="flex items-center gap-2.5">
                              <span className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", colors.bg)}>
                                <Icon className={cn("h-4 w-4", colors.text)} />
                              </span>
                              <span className="flex flex-col">
                                <span className="text-sm font-medium leading-tight">{profile.label}</span>
                                <span className="text-[11px] text-muted-foreground leading-tight line-clamp-1">{profile.description}</span>
                              </span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {/* Selected profile hint */}
              {selectedProfile && (
                <div className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-2", profileColors.bg, profileColors.border)}>
                  <Info className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", profileColors.text)} />
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground leading-snug">{selectedProfile.description}</p>
                    {selectedProfile.locatorStrategy && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                        <span className="font-medium">Strategy:</span> {selectedProfile.locatorStrategy}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Core Input */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />Requirement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Title (optional)</Label>
                <Input placeholder="e.g., User Login Feature" value={requirementTitle}
                  onChange={e => setRequirementTitle(e.target.value)} className="text-sm h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description *</Label>
                <Textarea
                  placeholder={selectedProfile?.type === "jde"
                    ? "e.g., As a purchasing manager, I want to create a Purchase Order in JDE P4310 for supplier 4001 with item 1001, quantity 10, and verify the PO is saved and approval workflow is triggered."
                    : selectedProfile?.type === "api_rest"
                    ? "e.g., The POST /api/users endpoint should create a new user with firstName, lastName, email, role. Returns 201 with the created user object. Validates email uniqueness (409 on duplicate)."
                    : "As a user, I want to log in with email and password so I can access my account.\n\nAcceptance Criteria:\n- Email and password fields are present\n- Validates credentials\n- Redirects to dashboard on success\n- Shows error on invalid credentials"}
                  value={requirement} onChange={e => setRequirement(e.target.value)}
                  className="min-h-[120px] resize-none text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Save to Suite</Label>
                  <Select value={selectedSuite} onValueChange={setSelectedSuite}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select suite..." /></SelectTrigger>
                    <SelectContent>
                      {suites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Test Depth</Label>
                  <Select value={testDepth} onValueChange={(v: any) => setTestDepth(v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard (15-20)</SelectItem>
                      <SelectItem value="comprehensive">Comprehensive (25-35)</SelectItem>
                      <SelectItem value="exhaustive">Exhaustive (40-60)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Include E2E toggle */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-xs font-medium">Include E2E Tests</p>
                  <p className="text-[10px] text-muted-foreground">Full user journey scenarios</p>
                </div>
                <button onClick={() => setIncludeE2E(!includeE2E)}
                  className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", includeE2E ? "bg-primary" : "bg-muted")}>
                  <span className={cn("inline-block h-3 w-3 rounded-full bg-white transition-transform", includeE2E ? "translate-x-5" : "translate-x-1")} />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Architect Context (Collapsible) */}
          <Card className={cn(contextFieldCount > 0 && "border-primary/30 bg-primary/3")}>
            <Collapsible open={showContext} onOpenChange={setShowContext}>
              <CollapsibleTrigger asChild>
                <button className="w-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Brain className={cn("h-4 w-4", contextFieldCount > 0 ? "text-primary" : "text-muted-foreground")} />
                      <span>Architect Context</span>
                      {contextFieldCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{contextFieldCount} fields</Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground font-normal">
                        {showContext ? "hide" : "expand for expert prompting"}
                      </span>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", showContext && "rotate-180")} />
                    </CardTitle>
                    {!showContext && (
                      <CardDescription className="text-xs text-left">
                        Provide deep context — app name, business rules, user roles, API details — for expert-level test generation
                      </CardDescription>
                    )}
                  </CardHeader>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-[11px]">Application Name</Label>
                      <Input placeholder="e.g., Oracle JDE 9.2" value={appName} onChange={e => setAppName(e.target.value)} className="h-7 text-xs" /></div>
                    <div className="space-y-1"><Label className="text-[11px]">Module / Feature</Label>
                      <Input placeholder="e.g., Purchase Order Entry" value={moduleName} onChange={e => setModuleName(e.target.value)} className="h-7 text-xs" /></div>
                    <div className="space-y-1"><Label className="text-[11px]">Environment</Label>
                      <Input placeholder="e.g., Web, Mobile, SAP GUI" value={environment} onChange={e => setEnvironment(e.target.value)} className="h-7 text-xs" /></div>
                    <div className="space-y-1"><Label className="text-[11px]">User Roles</Label>
                      <Input placeholder="e.g., Admin, Manager, Viewer" value={userRoles} onChange={e => setUserRoles(e.target.value)} className="h-7 text-xs" /></div>
                  </div>
                  {[
                    { label: "Business Use Case", val: businessUseCase, set: setBusinessUseCase, placeholder: "e.g., Purchasing department creates and approves purchase orders for inventory items..." },
                    { label: "Application Context", val: appContext, set: setAppContext, placeholder: "e.g., Legacy ERP system with approval workflow, integrated with EDI..." },
                    { label: "Functional Requirements", val: functionalRequirements, set: setFunctionalRequirements, placeholder: "1. System shall validate supplier code\n2. PO amount above $10k requires manager approval\n3. Item must exist in item master..." },
                    { label: "Non-Functional Requirements", val: nonFunctionalRequirements, set: setNonFunctionalRequirements, placeholder: "Response time < 2s, 99.9% uptime, SOX compliant, GDPR data handling..." },
                    { label: "API Details", val: apiDetails, set: setApiDetails, placeholder: "POST /api/orders\nHeaders: Authorization: Bearer {token}\nBody: { supplierId, items[], amount }\nResponse: 201 { orderId, status }" },
                    { label: "UI Workflow", val: uiWorkflow, set: setUiWorkflow, placeholder: "1. User navigates to Order Entry\n2. Fills header: Business Unit, Supplier\n3. Adds line items\n4. Submits for approval..." },
                    { label: "Data Variations / Constraints", val: dataVariations, set: setDataVariations, placeholder: "Supplier ID: 4-digit numeric\nAmount: max $999,999.99\nItem qty: 1-9999\nDate: cannot be in the past..." },
                  ].map(f => (
                    <div key={f.label} className="space-y-1">
                      <Label className="text-[11px]">{f.label}</Label>
                      <Textarea placeholder={f.placeholder} value={f.val}
                        onChange={e => f.set(e.target.value)} className="min-h-[56px] text-xs resize-y" />
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Generate Button */}
          <Button className="w-full h-11 text-sm font-semibold" onClick={handleGenerate}
            disabled={generateMutation.isPending || !requirement.trim()}>
            {generateMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating {depthInfo.desc}...</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />Generate {depthInfo.label} Test Suite ({depthInfo.desc})</>
            )}
          </Button>
          </div>
        </div>

        {/* ── RIGHT PANEL: Results ───────────────────────────────────────── */}
        <div className={cn(resultsExpanded ? "xl:col-span-1" : "xl:col-span-8")}>
          {generateMutation.isPending ? (
            /* ── LOADING STATE — fills the whole panel so the screen never looks half-empty ── */
            <Card className="h-[calc(100vh-7rem)] min-h-[600px] flex flex-col overflow-hidden">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0">
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 animate-pulse" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-white animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <CardTitle className="text-base">Generating {depthInfo.label} Test Suite…</CardTitle>
                    <CardDescription className="text-xs">
                      The AI QA Architect is analyzing your requirement and designing {depthInfo.desc}
                    </CardDescription>
                  </div>
                  <Loader2 className="h-5 w-5 text-primary animate-spin ml-auto" />
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden pt-5">
                {/* Animated pipeline steps */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                  {[
                    { icon: FileSearch, label: "Parsing requirement" },
                    { icon: Brain, label: "Designing scenarios" },
                    { icon: Shield, label: "Mapping coverage" },
                    { icon: Code2, label: "Writing steps" },
                  ].map((s, i) => (
                    <div key={s.label}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border/50 bg-muted/20 animate-pulse"
                      style={{ animationDelay: `${i * 200}ms` }}>
                      <s.icon className="h-4 w-4 text-primary/70" />
                      <span className="text-[10px] text-muted-foreground text-center leading-tight">{s.label}</span>
                    </div>
                  ))}
                </div>
                {/* Skeleton test-case rows */}
                <div className="space-y-2.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-xl border border-border/50 p-3"
                      style={{ opacity: 1 - i * 0.12 }}>
                      <div className="flex items-start gap-3">
                        <div className="h-5 w-5 rounded border border-border shrink-0 shimmer" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 w-2/3 rounded shimmer" />
                          <div className="flex gap-1.5">
                            <div className="h-4 w-16 rounded shimmer" />
                            <div className="h-4 w-12 rounded shimmer" />
                            <div className="h-4 w-20 rounded shimmer" />
                          </div>
                          <div className="h-3 w-full rounded shimmer" />
                          <div className="h-3 w-4/5 rounded shimmer" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : !result ? (
            /* ── EMPTY STATE — also fills the panel, centered ── */
            <Card className="h-[calc(100vh-7rem)] min-h-[600px] flex items-center justify-center border-dashed">
              <div className="text-center py-12 px-6 max-w-md">
                <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center mx-auto mb-5 animate-float">
                  <Brain className="h-10 w-10 text-primary/50" />
                </div>
                <h3 className="font-semibold text-xl mb-2">AI QA Architect Ready</h3>
                <p className="text-muted-foreground text-sm mb-6">
                  Pick your application type, describe the requirement, then generate a comprehensive enterprise test suite. Results will appear here.
                </p>
                <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                  {[
                    { icon: Shield, label: "10 Coverage Categories" },
                    { icon: Target, label: "Domain-Specific Rules" },
                    { icon: Code2, label: "Automation-Ready Steps" },
                  ].map(f => (
                    <div key={f.label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/40">
                      <f.icon className="h-5 w-5 text-primary/60" />
                      <span className="text-center leading-tight">{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* ── Mandatory AI disclaimer banner (governance) ──────── */}
              <AiDisclaimerBanner variant="generator" />

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Total Tests", value: result.testCases.length, color: "text-primary", icon: TestTube2 },
                  { label: "Selected", value: selectedTests.size, color: "text-foreground", icon: ListChecks },
                  { label: "Risk Areas", value: result.riskAreas?.length || 0, color: "text-amber-500", icon: AlertTriangle },
                  { label: "Auto-Ready", value: result.automationCandidates?.length || 0, color: "text-emerald-500", icon: Bot },
                ].map(s => (
                  <Card key={s.label} className="overflow-hidden">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className={cn("h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0", s.color)}>
                        <s.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={cn("text-xl font-bold leading-none", s.color)}>{s.value}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">{s.label}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                      <TabsList>
                        <TabsTrigger value="tests" className="text-xs">
                          <TestTube2 className="h-3.5 w-3.5 mr-1" />Tests ({result.testCases.length})
                        </TabsTrigger>
                        <TabsTrigger value="coverage" className="text-xs">
                          <BarChart3 className="h-3.5 w-3.5 mr-1" />Coverage
                        </TabsTrigger>
                        <TabsTrigger value="risks" className="text-xs">
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" />Risks ({result.riskAreas?.length || 0})
                        </TabsTrigger>
                        <TabsTrigger value="automation" className="text-xs">
                          <Bot className="h-3.5 w-3.5 mr-1" />Automation
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 hidden xl:inline-flex"
                        onClick={() => setResultsExpanded(v => !v)}
                        title={resultsExpanded ? "Collapse to split view" : "Expand results to full width"}
                      >
                        {resultsExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                        {resultsExpanded ? "Split View" : "Expand"}
                      </Button>
                      <Button onClick={handleSave} disabled={saveMutation.isPending || selectedTests.size === 0} size="sm" className="h-9">
                        {saveMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Saving...</> : <><Plus className="h-3.5 w-3.5 mr-1" />Save {selectedTests.size} Selected</>}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-3">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    {/* Tests Tab */}
                    <TabsContent value="tests" className="mt-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex gap-1 flex-wrap">
                          {Object.entries(result.coverageSummary?.byType || {}).filter(([,v]) => (v as number) > 0).map(([type, count]) => (
                            <span key={type} className={cn("text-[10px] px-1.5 py-0.5 rounded border", testTypeColors[type] || testTypeColors.functional)}>
                              {count} {type}
                            </span>
                          ))}
                        </div>
                        <button onClick={() => setSelectedTests(selectedTests.size === result.testCases.length ? new Set() : new Set(result.testCases.map((_,i) => i)))}
                          className="text-xs text-primary hover:underline shrink-0">
                          {selectedTests.size === result.testCases.length ? "Deselect all" : "Select all"}
                        </button>
                      </div>
                      <ScrollArea className="h-[calc(100vh-22rem)] min-h-[420px]">
                        <div className={cn("pr-2", resultsExpanded ? "grid grid-cols-1 lg:grid-cols-2 gap-2" : "space-y-2")}>
                          {result.testCases.map((tc, i) => (
                            <TestCaseCard key={i} test={tc} index={i} selected={selectedTests.has(i)} onToggle={() => toggleTest(i)} />
                          ))}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* Coverage Tab */}
                    <TabsContent value="coverage" className="mt-0 space-y-4">
                      {result.coverageSummary && (
                        <>
                          {result.coverageSummary.byType && (
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {Object.entries(result.coverageSummary.byType).map(([type, count]) => (
                              <div key={type} className={cn("p-2 rounded-lg border text-center", (count as number) > 0 ? testTypeColors[type] || testTypeColors.functional : "bg-muted/30 border-border text-muted-foreground")}>
                                <p className="text-lg font-bold">{count as number}</p>
                                <p className="text-[10px] capitalize">{type}</p>
                              </div>
                            ))}
                          </div>
                          )}
                          {((result.coverageSummary.coverageAreas && result.coverageSummary.coverageAreas.length > 0) || (result.coverageSummary.objectsCovered && result.coverageSummary.objectsCovered.length > 0)) && (
                            <div>
                              <p className="text-xs font-medium mb-1.5 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Areas Covered</p>
                              <div className="flex flex-wrap gap-1.5">
                                {(result.coverageSummary.coverageAreas || result.coverageSummary.objectsCovered || []).map((a: string, i: number) => (
                                  <span key={i} className="text-xs bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 rounded">{a}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {(result.coverageSummary.gapAreas && result.coverageSummary.gapAreas.length > 0) && (
                            <div>
                              <p className="text-xs font-medium mb-1.5 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" />Coverage Gaps</p>
                              <div className="flex flex-wrap gap-1.5">
                                {result.coverageSummary.gapAreas.map((a: string, i: number) => (
                                  <span key={i} className="text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2 py-0.5 rounded">{a}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {(result.coverageSummary.tablesCovered && result.coverageSummary.tablesCovered.length > 0) && (
                            <div>
                              <p className="text-xs font-medium mb-1.5 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />JDE Tables Covered</p>
                              <div className="flex flex-wrap gap-1.5">
                                {result.coverageSummary.tablesCovered.map((t: string, i: number) => (
                                  <span key={i} className="text-xs bg-blue-500/10 text-blue-600 border border-blue-500/20 px-2 py-0.5 rounded">{t}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {result.assumptions && result.assumptions.length > 0 && (
                            <div>
                              <p className="text-xs font-medium mb-1.5 flex items-center gap-1"><Info className="h-3.5 w-3.5 text-blue-500" />Assumptions Made</p>
                              <ul className="space-y-1">
                                {result.assumptions.map((a, i) => (
                                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5"><span className="mt-1 h-1 w-1 rounded-full bg-muted-foreground shrink-0" />{a}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                    </TabsContent>

                    {/* Risks Tab */}
                    <TabsContent value="risks" className="mt-0">
                      {!result.riskAreas?.length ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No specific risk areas identified</p>
                      ) : (
                        <div className="space-y-3">
                          {result.riskAreas.map((risk, i) => (
                            <div key={i} className={cn("p-3 rounded-lg border",
                              risk.severity === "high" || risk.severity === "critical"
                                ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"
                            )}>
                              <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0",
                                  risk.severity === "high" || risk.severity === "critical" ? "text-red-500" : "text-amber-500")} />
                                <span className="font-semibold text-sm">{risk.area}</span>
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded border ml-auto",
                                  risk.severity === "high" || risk.severity === "critical"
                                    ? "bg-red-500/10 text-red-600 border-red-500/20"
                                    : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                )}>{risk.severity}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">{risk.mitigation}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    {/* Automation Tab */}
                    <TabsContent value="automation" className="mt-0">
                      {!result.automationCandidates?.length ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No automation candidates identified</p>
                      ) : (
                        <div className="space-y-2">
                          {result.automationCandidates.map((cand, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
                              <Bot className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono text-muted-foreground">{cand.testCaseId}</span>
                                  {cand.suggestedFramework && (
                                    <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-mono">{cand.suggestedFramework}</span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{cand.reason}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          GOVERNANCE: Human Review Gate
          Opens after DRAFT save in VALIDATED systems. User MUST approve
          before the test cases can be executed.
      ───────────────────────────────────────────────────────────────────── */}
      <HumanReviewGate
        open={reviewGateOpen}
        onOpenChange={setReviewGateOpen}
        title="Approve AI-Generated Test Cases"
        intro="The test cases below are AI-generated drafts. They cannot be executed until you approve them. Final accountability rests with the reviewer."
        items={
          (result?.testCases || [])
            .filter((_, i) => selectedTests.has(i))
            .slice(0, savedTestCaseIds.length)
            .map((tc, i): ReviewableItem => ({
              id: savedTestCaseIds[i],
              type: "TEST_CASE",
              title: tc.title,
              subtitle: `${tc.steps.length} step(s) · ${tc.priority}`,
              contentPreview: tc.description?.slice(0, 200),
            }))
        }
        onApproved={() => {
          // Reset generator after successful approval
          setResult(null);
          setSelectedTests(new Set());
          setRequirement("");
          setRequirementTitle("");
          setSavedTestCaseIds([]);
        }}
      />
    </div>
  );
}

