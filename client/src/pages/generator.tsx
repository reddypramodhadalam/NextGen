import { useState } from "react";
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
} from "lucide-react";
import type { TestSuite } from "@shared/schema";

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
  coverageAreas: string[];
  gapAreas: string[];
}
interface RiskArea {
  area: string; severity: string; mitigation: string;
}
interface AutomationCandidate {
  testCaseId: string; reason: string; suggestedFramework: string;
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
          {/* Steps preview */}
          <div className="space-y-0.5">
            {test.steps.slice(0, expanded ? 99 : 3).map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs">
                <span className="text-muted-foreground font-mono shrink-0 w-4 text-right">{i+1}.</span>
                <span className="text-muted-foreground">{s.step}</span>
              </div>
            ))}
          </div>
          {test.steps.length > 3 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary mt-1 hover:underline"
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

  const { data: suites = [] } = useQuery<TestSuite[]>({ queryKey: ["/api/test-suites"] });
  const { data: profilesData } = useQuery<{ profiles: AppProfile[] }>({ queryKey: ["/api/app-profiles"] });
  const profiles = profilesData?.profiles || [];
  const selectedProfile = profiles.find(p => p.type === selectedAppType);
  const profileColors = selectedProfile ? (COLOR_CLASSES[selectedProfile.color] || COLOR_CLASSES.blue) : COLOR_CLASSES.blue;

  const contextFieldCount = [appName, moduleName, businessUseCase, userRoles, appContext,
    functionalRequirements, nonFunctionalRequirements, apiDetails, uiWorkflow, dataVariations, environment
  ].filter(Boolean).length;

  const generateMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        title: requirementTitle || "Untitled Requirement",
        description: requirement,
        appType: selectedAppType,
        appHints: selectedProfile?.aiPromptHints,
        includeE2E,
        testDepth,
        appName: appName || undefined,
        moduleName: moduleName || undefined,
        businessUseCase: businessUseCase || undefined,
        userRoles: userRoles || undefined,
        appContext: appContext || undefined,
        functionalRequirements: functionalRequirements || undefined,
        nonFunctionalRequirements: nonFunctionalRequirements || undefined,
        apiDetails: apiDetails || undefined,
        uiWorkflow: uiWorkflow || undefined,
        dataVariations: dataVariations || undefined,
        environment: environment || undefined,
      };
      const res = await apiRequest("POST", "/api/generate-tests", payload);
      return res.json();
    },
    onSuccess: (data: GenerationResult) => {
      setResult(data);
      setSelectedTests(new Set(data.testCases.map((_, i) => i)));
      setActiveTab("tests");
      toast({
        title: `${data.testCases.length} Test Cases Generated`,
        description: `Coverage: ${Object.entries(data.coverageSummary?.byType || {}).filter(([,v]) => (v as number) > 0).map(([k,v]) => `${v} ${k}`).join(", ")}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Generation Failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (testCases: GeneratedTestCase[]) => {
      const promises = testCases.map(tc =>
        apiRequest("POST", "/api/test-cases", { ...tc, suiteId: selectedSuite || null, generatedByAI: true })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-cases"] });
      toast({ title: "Tests Saved", description: `${selectedTests.size} test cases saved to repository.` });
      setResult(null); setSelectedTests(new Set()); setRequirement(""); setRequirementTitle("");
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

  const depthInfo = {
    standard:      { label: "Standard", desc: "15-20 test cases", color: "text-emerald-500" },
    comprehensive: { label: "Comprehensive", desc: "25-35 test cases", color: "text-blue-500" },
    exhaustive:    { label: "Exhaustive", desc: "40-60 test cases", color: "text-violet-500" },
  }[testDepth];

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
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
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-muted-foreground">{result.testCases.length} tests generated</span>
          </div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        {/* ── LEFT PANEL: Input ──────────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-4">

          {/* App Type */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <AppWindow className="h-4 w-4" />Application Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
                {profiles.map(profile => {
                  const Icon = ICON_MAP[profile.icon] || Globe;
                  const colors = COLOR_CLASSES[profile.color] || COLOR_CLASSES.blue;
                  const sel = selectedAppType === profile.type;
                  return (
                    <button key={profile.type} onClick={() => setSelectedAppType(profile.type)}
                      className={cn("flex items-center gap-2 p-2 rounded-lg border text-left transition-all text-xs",
                        sel ? `${colors.bg} ${colors.border} font-semibold` : "bg-muted/30 border-border/50 hover:border-border"
                      )}>
                      <div className={cn("h-6 w-6 rounded flex items-center justify-center shrink-0", colors.bg)}>
                        <Icon className={cn("h-3 w-3", colors.text)} />
                      </div>
                      <span className="truncate">{profile.label}</span>
                      {sel && <Check className={cn("h-3 w-3 ml-auto shrink-0", colors.text)} />}
                    </button>
                  );
                })}
              </div>
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

        {/* ── RIGHT PANEL: Results ───────────────────────────────────────── */}
        <div className="xl:col-span-3">
          {!result ? (
            <Card className="h-full min-h-[600px] flex items-center justify-center">
              <div className="text-center py-12 px-6">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center mx-auto mb-4">
                  <Brain className="h-8 w-8 text-primary/50" />
                </div>
                <h3 className="font-semibold text-lg mb-2">AI QA Architect Ready</h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Configure your requirement and architect context, then generate a comprehensive enterprise test suite
                </p>
                <div className="mt-6 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                  {[
                    { icon: Shield, label: "10 Coverage Categories" },
                    { icon: Target, label: "Domain-Specific Rules" },
                    { icon: Code2, label: "Automation-Ready Steps" },
                  ].map(f => (
                    <div key={f.label} className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-muted/30">
                      <f.icon className="h-4 w-4 text-primary/60" />
                      <span>{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Total Tests", value: result.testCases.length, color: "text-primary" },
                  { label: "Selected", value: selectedTests.size, color: "text-foreground" },
                  { label: "Risk Areas", value: result.riskAreas?.length || 0, color: "text-amber-500" },
                  { label: "Auto-Ready", value: result.automationCandidates?.length || 0, color: "text-emerald-500" },
                ].map(s => (
                  <Card key={s.label}><CardContent className="p-3 text-center">
                    <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </CardContent></Card>
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
                    <Button onClick={handleSave} disabled={saveMutation.isPending || selectedTests.size === 0} size="sm">
                      {saveMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Saving...</> : <><Plus className="h-3.5 w-3.5 mr-1" />Save {selectedTests.size} Selected</>}
                    </Button>
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
                      <ScrollArea className="h-[480px]">
                        <div className="space-y-2 pr-2">
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
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {Object.entries(result.coverageSummary.byType).map(([type, count]) => (
                              <div key={type} className={cn("p-2 rounded-lg border text-center", (count as number) > 0 ? testTypeColors[type] || testTypeColors.functional : "bg-muted/30 border-border text-muted-foreground")}>
                                <p className="text-lg font-bold">{count as number}</p>
                                <p className="text-[10px] capitalize">{type}</p>
                              </div>
                            ))}
                          </div>
                          {result.coverageSummary.coverageAreas.length > 0 && (
                            <div>
                              <p className="text-xs font-medium mb-1.5 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Areas Covered</p>
                              <div className="flex flex-wrap gap-1.5">
                                {result.coverageSummary.coverageAreas.map((a, i) => (
                                  <span key={i} className="text-xs bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 rounded">{a}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {result.coverageSummary.gapAreas.length > 0 && (
                            <div>
                              <p className="text-xs font-medium mb-1.5 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" />Coverage Gaps</p>
                              <div className="flex flex-wrap gap-1.5">
                                {result.coverageSummary.gapAreas.map((a, i) => (
                                  <span key={i} className="text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2 py-0.5 rounded">{a}</span>
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
    </div>
  );
}
