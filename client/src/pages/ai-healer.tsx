import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Zap, Loader2, AlertTriangle, CheckCircle2, XCircle, Wrench,
  Brain, TrendingUp, Shield, RefreshCw, ChevronRight, Sparkles,
  Clock, Target, Activity, BarChart3, Gauge, History, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestSuite, TestCase } from "@shared/schema";
import {
  AiDisclaimerBanner,
  HumanReviewGate,
  type ReviewableItem,
} from "@/components/governance";
import { useGovernance } from "@/hooks/useGovernance";
import { EnterpriseAIHealerPage } from "@/pages/ai-healer-enterprise";

// ─── Types ────────────────────────────────────────────────────────────────────

type FailureCategory =
  | "selector_stale" | "timing_issue" | "data_mismatch" | "ui_change"
  | "env_issue" | "logic_error" | "auth_failure" | "unknown";

type HealthStatus = "healthy" | "degraded" | "broken" | "critical";

interface HealSuggestion {
  stepIndex: number;
  originalStep: string;
  originalExpected: string;
  issue: string;
  category: FailureCategory;
  confidence: number;
  suggestedStep?: string;
  suggestedExpected?: string;
  suggestedSelector?: string;
  explanation: string;
  autoHealable: boolean;
}

interface HealReport {
  testCaseId: string;
  testCaseTitle: string;
  analysedAt: string;
  failureCount: number;
  lastFailureMessage?: string;
  suggestions: HealSuggestion[];
  overallHealth: HealthStatus;
  autoHealApplied: boolean;
  healedSteps: number;
  /** Healing mode that produced this report (BASIC | ADVANCED | PRO). */
  mode?: string;
  /** Overall confidence score (0-100) for the report's suggestions. */
  confidenceScore?: number;
}

interface SuiteAnalysisResult {
  reports: HealReport[];
  stats: {
    totalAnalysed: number;
    totalHealed: number;
    autoHealRate: number;
    topFailureCategories: Array<{ category: FailureCategory; count: number }>;
    recentHeals: HealReport[];
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<HealthStatus, { label: string; color: string; icon: any; bg: string }> = {
  healthy:  { label: "Healthy",  color: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle2, bg: "bg-emerald-500/10 border-emerald-500/20" },
  degraded: { label: "Degraded", color: "text-amber-600 dark:text-amber-400",    icon: AlertTriangle, bg: "bg-amber-500/10 border-amber-500/20" },
  broken:   { label: "Broken",   color: "text-orange-600 dark:text-orange-400",  icon: XCircle,       bg: "bg-orange-500/10 border-orange-500/20" },
  critical: { label: "Critical", color: "text-red-600 dark:text-red-400",        icon: XCircle,       bg: "bg-red-500/10 border-red-500/20" },
};

const CATEGORY_CONFIG: Record<FailureCategory, { label: string; color: string }> = {
  selector_stale: { label: "Stale Selector",  color: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  timing_issue:   { label: "Timing Issue",    color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  data_mismatch:  { label: "Data Mismatch",   color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  ui_change:      { label: "UI Changed",      color: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  env_issue:      { label: "Env Issue",       color: "bg-slate-500/15 text-slate-700 dark:text-slate-400" },
  logic_error:    { label: "Logic Error",     color: "bg-red-500/15 text-red-700 dark:text-red-400" },
  auth_failure:   { label: "Auth Failure",    color: "bg-pink-500/15 text-pink-700 dark:text-pink-400" },
  unknown:        { label: "Unknown",         color: "bg-muted text-muted-foreground" },
};

/**
 * Safely resolve a failure-category's display config. The backend may emit a
 * category that isn't in CATEGORY_CONFIG (e.g. a newly added or unexpected
 * value); in that case we fall back to the "unknown" entry so the UI never
 * crashes on `cat.color` / `cat.label`.
 */
function getCategoryConfig(category: FailureCategory | string | undefined | null) {
  return (
    (category && CATEGORY_CONFIG[category as FailureCategory]) ||
    CATEGORY_CONFIG.unknown
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const color = value >= 80 ? "text-emerald-600" : value >= 60 ? "text-amber-600" : "text-red-500";
  return (
    <span className={cn("text-xs font-bold tabular-nums", color)}>{value}%</span>
  );
}

// ─── Suggestion Card ──────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion, testCaseId, onApply,
}: {
  suggestion: HealSuggestion;
  testCaseId: string;
  onApply: (s: HealSuggestion) => void;
}) {
  const cat = getCategoryConfig(suggestion.category);

  return (
    <div className="p-4 rounded-xl border bg-card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn("text-xs h-5 border-0", cat.color)}>{cat.label}</Badge>
          {suggestion.autoHealable && (
            <Badge className="text-xs h-5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0">
              Auto-healable
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">Step {suggestion.stepIndex + 1}</span>
        </div>
        <ConfidenceBadge value={suggestion.confidence} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-destructive">{suggestion.issue}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{suggestion.explanation}</p>
      </div>

      {(suggestion.suggestedStep || suggestion.suggestedExpected) && (
        <div className="space-y-2 pt-1">
          {suggestion.suggestedStep && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Suggested step:</p>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <p className="text-xs line-through text-muted-foreground/60 bg-muted/30 px-2 py-1 rounded">
                    {suggestion.originalStep}
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded font-mono">
                    {suggestion.suggestedStep}
                  </p>
                </div>
              </div>
            </div>
          )}
          {suggestion.suggestedSelector && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Better selector:</p>
              <code className="text-xs bg-muted px-2 py-1 rounded block font-mono text-primary">
                {suggestion.suggestedSelector}
              </code>
            </div>
          )}
        </div>
      )}

      <Button
        size="sm"
        variant="outline"
        className="w-full h-8 text-xs gap-1.5"
        onClick={() => onApply(suggestion)}
      >
        <Wrench className="h-3.5 w-3.5" />
        Apply This Fix
      </Button>
    </div>
  );
}

// ─── Report Card ──────────────────────────────────────────────────────────────

function ReportCard({
  report, onApply, onHistory,
}: {
  report: HealReport;
  onApply: (testCaseId: string, suggestion: HealSuggestion) => void;
  onHistory?: (testCaseId: string, title: string) => void;
}) {
  const health = HEALTH_CONFIG[report.overallHealth];
  const HealthIcon = health.icon;

  return (
    <AccordionItem value={report.testCaseId} className="border rounded-xl px-0 overflow-hidden">
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/20">
        <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div className={cn("h-8 w-8 rounded-lg border flex items-center justify-center shrink-0", health.bg)}>
            <HealthIcon className={cn("h-4 w-4", health.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{report.testCaseTitle}</p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className={cn("text-xs font-medium", health.color)}>{health.label}</span>
              {report.failureCount > 0 && (
                <span className="text-xs text-muted-foreground">{report.failureCount} failures</span>
              )}
              {report.suggestions.length > 0 && (
                <span className="text-xs text-primary">{report.suggestions.length} suggestion{report.suggestions.length !== 1 ? "s" : ""}</span>
              )}
              {report.autoHealApplied && (
                <Badge className="text-xs h-4 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0">
                  Healed ✓
                </Badge>
              )}
            </div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-0">
        <div className="mb-3 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => onHistory?.(report.testCaseId, report.testCaseTitle)}
          >
            <History className="h-3.5 w-3.5" />
            View Heal History
          </Button>
        </div>
        {report.lastFailureMessage && (
          <div className="mb-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
            <p className="text-xs font-medium text-destructive mb-1">Last error:</p>
            <p className="text-xs text-muted-foreground font-mono">{report.lastFailureMessage}</p>
          </div>
        )}
        {report.suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {report.failureCount === 0 ? "No failures detected — test is healthy" : "No specific suggestions generated"}
          </p>
        ) : (
          <div className="space-y-3">
            {report.suggestions.map((s, i) => (
              <SuggestionCard
                key={i}
                suggestion={s}
                testCaseId={report.testCaseId}
                onApply={(suggestion) => onApply(report.testCaseId, suggestion)}
              />
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

// ─── Standard Healer Panel ────────────────────────────────────────────────────

function StandardHealerPanel() {
  const { toast } = useToast();
  const [selectedSuite, setSelectedSuite] = useState("");
  const [autoHeal, setAutoHeal] = useState(false);
  const [appType, setAppType] = useState("web");
  const [result, setResult] = useState<SuiteAnalysisResult | null>(null);

  // ── Governance ─────────────────────────────────────────────────────────
  const governance = useGovernance();
  const [healGateOpen, setHealGateOpen] = useState(false);
  const [pendingHeal, setPendingHeal] = useState<
    { testCaseId: string; testCaseTitle: string; suggestion: HealSuggestion } | null
  >(null);

  // ── History dialog ─────────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; title: string } | null>(null);

  const { data: suites = [] } = useQuery<TestSuite[]>({ queryKey: ["/api/test-suites"] });

  const analyseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/healer/analyse-suite", {
        suiteId: selectedSuite, autoHeal, appType,
      });
      return res.json() as Promise<SuiteAnalysisResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      const healed = data.reports.filter((r) => r.autoHealApplied).length;
      toast({
        title: "Analysis Complete",
        description: `Analysed ${data.stats.totalAnalysed} tests. ${healed > 0 ? `Auto-healed ${healed} tests.` : ""}`,
      });
    },
    onError: (e: any) => toast({ title: "Analysis Failed", description: e.message, variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: async ({ testCaseId, suggestion, approvalId }: { testCaseId: string; suggestion: HealSuggestion; approvalId?: string }) => {
      const res = await apiRequest("POST", "/api/healer/apply", { testCaseId, suggestion, approvalId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-cases"] });
      toast({ title: "Fix Applied", description: "Test case has been updated with the suggested fix." });
    },
    onError: (e: any) => toast({ title: "Apply Failed", description: e.message, variant: "destructive" }),
  });

  // Clear the current on-screen analysis results.
  const clearResults = () => {
    setResult(null);
    toast({ title: "Analysis Cleared", description: "The current analysis results were removed." });
  };

  // Delete ALL persisted heal history/analysis on the server.
  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/healer/history");
      return res.json();
    },
    onSuccess: (data: any) => {
      setResult(null);
      toast({
        title: "History Deleted",
        description: `Cleared ${data?.cleared ?? 0} saved heal report(s).`,
      });
    },
    onError: (e: any) => toast({ title: "Delete Failed", description: e.message, variant: "destructive" }),
  });

  const openHistory = (id: string, title: string) => {
    setHistoryTarget({ id, title });
    setHistoryOpen(true);
  };

  const stats = result?.stats;
  const reports = result?.reports || [];
  const brokenReports = reports.filter((r) => r.overallHealth === "broken" || r.overallHealth === "critical");
  const degradedReports = reports.filter((r) => r.overallHealth === "degraded");
  const healthyReports = reports.filter((r) => r.overallHealth === "healthy");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analyse & Heal</CardTitle>
          <CardDescription>Select a test suite to analyse failure patterns and get AI-powered fix suggestions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2 flex-1 min-w-48">
              <Label>Test Suite</Label>
              <Select value={selectedSuite} onValueChange={setSelectedSuite}>
                <SelectTrigger><SelectValue placeholder="Select suite to analyse..." /></SelectTrigger>
                <SelectContent>
                  {suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 min-w-40">
              <Label>App Type</Label>
              <Select value={appType} onValueChange={setAppType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="salesforce">Salesforce</SelectItem>
                  <SelectItem value="jde">JDE</SelectItem>
                  <SelectItem value="sap_fiori">SAP Fiori</SelectItem>
                  <SelectItem value="sap_gui">SAP GUI</SelectItem>
                  <SelectItem value="dotnet_desktop">.NET Desktop</SelectItem>
                  <SelectItem value="mobile_ios">iOS</SelectItem>
                  <SelectItem value="mobile_android">Android</SelectItem>
                  <SelectItem value="api_rest">REST API</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Switch
                id="auto-heal"
                checked={autoHeal && !governance.isValidated}
                disabled={governance.isValidated}
                onCheckedChange={(v) => setAutoHeal(v && !governance.isValidated)}
              />
              <Label htmlFor="auto-heal" className="cursor-pointer">
                <span className="text-sm font-medium">
                  Auto-heal
                  {governance.isValidated && (
                    <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-400">
                      (disabled in VALIDATED systems)
                    </span>
                  )}
                </span>
                <p className="text-xs text-muted-foreground">
                  {governance.isValidated
                    ? "Auto-apply is not permitted - every fix requires human approval"
                    : "Apply high-confidence fixes automatically"}
                </p>
              </Label>
            </div>
            <Button
              onClick={() => analyseMutation.mutate()}
              disabled={analyseMutation.isPending || !selectedSuite}
              className="gap-2"
            >
              {analyseMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" />Analysing...</>
                : <><Brain className="h-4 w-4" />Analyse Suite</>}
            </Button>
            {result && (
              <Button
                variant="outline"
                onClick={clearResults}
                className="gap-2"
                title="Clear the current analysis results from the screen"
              >
                <XCircle className="h-4 w-4" />
                Clear
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => clearHistoryMutation.mutate()}
              disabled={clearHistoryMutation.isPending}
              className="gap-2 text-destructive hover:text-destructive"
              title="Delete all saved heal analysis/history on the server"
            >
              {clearHistoryMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Trash2 className="h-4 w-4" />}
              Delete History
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      {stats && (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Tests Analysed", value: stats.totalAnalysed, icon: Activity, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
            { label: "Auto-Healed",    value: stats.totalHealed,   icon: Wrench,   color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "Heal Rate",      value: `${stats.autoHealRate.toFixed(0)}%`, icon: TrendingUp, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10" },
            { label: "Broken Tests",   value: brokenReports.length, icon: XCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", stat.bg)}>
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Reports */}
          <div className="lg:col-span-2 space-y-4">
            {/* Health Summary Bar */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border">
              {[
                { label: "Critical/Broken", count: brokenReports.length, color: "bg-red-500" },
                { label: "Degraded", count: degradedReports.length, color: "bg-amber-500" },
                { label: "Healthy", count: healthyReports.length, color: "bg-emerald-500" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
                  <span className="text-xs text-muted-foreground">{item.count} {item.label}</span>
                </div>
              ))}
              <div className="flex-1 ml-2">
                <Progress
                  value={reports.length > 0 ? (healthyReports.length / reports.length) * 100 : 0}
                  className="h-2"
                />
              </div>
            </div>

            {/* Report Accordion */}
            {reports.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No results yet</p>
                <p className="text-sm mt-1">Select a suite and click Analyse</p>
              </div>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {/* Show broken first */}
                {[...brokenReports, ...degradedReports, ...healthyReports].map((report) => (
                  <ReportCard
                    key={report.testCaseId}
                    report={report}
                    onHistory={openHistory}
                    onApply={(tcId, suggestion) => {
                      // ── Governance: in VALIDATED mode, route through HumanReviewGate ──
                      if (governance.requireHumanReview) {
                        setPendingHeal({
                          testCaseId: tcId,
                          testCaseTitle: report.testCaseTitle || tcId,
                          suggestion,
                        });
                        setHealGateOpen(true);
                      } else {
                        applyMutation.mutate({ testCaseId: tcId, suggestion });
                      }
                    }}
                  />
                ))}
              </Accordion>
            )}
          </div>

          {/* Right: Insights */}
          <div className="space-y-4">
            {/* Top Failure Categories */}
            {stats && stats.topFailureCategories.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Top Failure Patterns
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {stats.topFailureCategories.map(({ category, count }) => {
                    const cat = getCategoryConfig(category);
                    const maxCount = stats.topFailureCategories[0]?.count || 1;
                    return (
                      <div key={category} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge className={cn("text-xs h-5 border-0", cat.color)}>{cat.label}</Badge>
                          <span className="text-xs font-bold tabular-nums">{count}</span>
                        </div>
                        <Progress value={(count / maxCount) * 100} className="h-1.5" />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Heal Tips */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Healing Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { icon: Target, tip: "Use data-testid attributes for stable selectors that survive UI redesigns" },
                  { icon: Clock, tip: "Add explicit waits instead of fixed sleeps to handle timing issues" },
                  { icon: Shield, tip: "Use contains() assertions instead of exact match for dynamic text" },
                  { icon: RefreshCw, tip: "Enable auto-heal for high-confidence fixes (≥75%) to save time" },
                ].map(({ icon: Icon, tip }, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{tip}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Recent Auto-Heals */}
            {stats && stats.recentHeals.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-emerald-500" />
                    Auto-Healed
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {stats.recentHeals.map((r) => (
                    <div key={r.testCaseId} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{r.testCaseTitle}</p>
                        <p className="text-xs text-muted-foreground">{r.healedSteps} step{r.healedSteps !== 1 ? "s" : ""} healed</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !analyseMutation.isPending && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-rose-500/20 to-pink-600/20 flex items-center justify-center mx-auto mb-4">
            <Brain className="h-10 w-10 text-rose-500/60" />
          </div>
          <h3 className="font-semibold text-lg text-foreground">AI Test Healer</h3>
          <p className="text-sm mt-2 max-w-md mx-auto">
            Select a test suite above and click <strong>Analyse Suite</strong> to detect failure patterns,
            get AI-powered fix suggestions, and optionally auto-heal broken tests.
          </p>
          <div className="flex items-center justify-center gap-6 mt-6 text-xs">
            {[
              { icon: Brain, label: "AI-powered diagnosis" },
              { icon: Wrench, label: "One-click fixes" },
              { icon: Zap, label: "Auto-heal mode" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-muted-foreground">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          GOVERNANCE: Human Review Gate for AI Healer fix application
      ───────────────────────────────────────────────────────────────────── */}
      <HumanReviewGate
        open={healGateOpen}
        onOpenChange={setHealGateOpen}
        title="Approve AI Healer Fix"
        intro="The AI Healer is proposing a fix to a test case. In a VALIDATED system, you must explicitly approve every AI-suggested modification before it is applied."
        items={
          pendingHeal
            ? [{
                id: pendingHeal.testCaseId,
                type: "HEAL_SUGGESTION",
                title: pendingHeal.testCaseTitle,
                subtitle: `Step ${pendingHeal.suggestion.stepIndex + 1}: ${pendingHeal.suggestion.originalStep || "(modified)"}`,
                contentPreview: pendingHeal.suggestion.suggestedStep
                  ? `Proposed step: ${pendingHeal.suggestion.suggestedStep}`
                  : pendingHeal.suggestion.explanation,
              } as ReviewableItem]
            : []
        }
        onApproved={async (reviewIds) => {
          if (!pendingHeal) return;
          // Re-call /api/healer/apply with the approval token recorded above
          applyMutation.mutate({
            testCaseId: pendingHeal.testCaseId,
            suggestion: pendingHeal.suggestion,
            approvalId: reviewIds[0],
          });
          setPendingHeal(null);
        }}
      />

      {/* ── Heal History dialog ── */}
      <HealHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        target={historyTarget}
      />
    </div>
  );
}

// ─── Heal History Dialog ──────────────────────────────────────────────────────

function HealHistoryDialog({
  open, onOpenChange, target,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: { id: string; title: string } | null;
}) {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery<{ history: HealReport[]; historyCount: number }>({
    queryKey: ["/api/healer/history", target?.id],
    enabled: open && !!target?.id,
  });

  const clearOne = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/healer/history/${target?.id}`);
      return res.json();
    },
    onSuccess: (d: any) => {
      toast({ title: "History Cleared", description: `Removed ${d?.cleared ?? 0} report(s) for this test.` });
      refetch();
    },
    onError: (e: any) => toast({ title: "Delete Failed", description: e.message, variant: "destructive" }),
  });

  const history = data?.history || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Heal History
          </DialogTitle>
          <DialogDescription>
            {target?.title ? `Past analyses and applied fixes for "${target.title}".` : "Past analyses and applied fixes."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No heal history recorded yet for this test case.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => clearOne.mutate()}
                disabled={clearOne.isPending}
              >
                {clearOne.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Clear This History
              </Button>
            </div>
            {history.map((report, idx) => {
              const health = HEALTH_CONFIG[report.overallHealth] ?? HEALTH_CONFIG.healthy;
              const HealthIcon = health.icon;
              return (
                <div key={idx} className="p-3 rounded-xl border bg-card space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className={cn("h-7 w-7 rounded-lg border flex items-center justify-center shrink-0", health.bg)}>
                        <HealthIcon className={cn("h-4 w-4", health.color)} />
                      </div>
                      <div>
                        <p className="text-xs font-medium">{health.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(report.analysedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {report.autoHealApplied && (
                        <Badge className="text-xs h-5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0">
                          {report.healedSteps} healed
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs h-5">{report.mode ?? "BASIC"}</Badge>
                    </div>
                  </div>
                  {report.lastFailureMessage && (
                    <p className="text-xs text-muted-foreground font-mono bg-muted/40 px-2 py-1 rounded">
                      {report.lastFailureMessage}
                    </p>
                  )}
                  {report.suggestions.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {report.suggestions.length} suggestion{report.suggestions.length !== 1 ? "s" : ""} ·
                      {" "}confidence {report.confidenceScore ?? 0}%
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Unified AI Healer Page ─────────────────────────────────────────────────────
//
// Combines the Standard suite-analysis healer and the Pro (enterprise) state-machine
// healer into a single page with a mode switch. The "Standard" tab exposes the
// lightweight suite-wide diagnosis + one-click fixes (with VALIDATED-mode review
// gates); the "Pro" tab exposes the full enterprise workflow (sessions, confidence
// scoring, automatic rollback, regression checks, KPIs and learning).

export default function AIHealer() {
  const [mode, setMode] = useState<"standard" | "pro">("standard");

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Shared Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Test Healer</h1>
            <p className="text-sm text-muted-foreground">
              Automatically detect, diagnose, and fix broken test cases
            </p>
          </div>
        </div>

        {/* Mode switch */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as "standard" | "pro")} className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-2 sm:w-[320px]">
            <TabsTrigger value="standard" className="gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              Standard
            </TabsTrigger>
            <TabsTrigger value="pro" className="gap-1.5">
              <Gauge className="h-3.5 w-3.5" />
              Pro
              <Badge className="ml-1 h-4 px-1.5 text-[10px] bg-purple-500/15 text-purple-700 dark:text-purple-300 border-0">
                ENTERPRISE
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ── Governance: mandatory disclaimer above all AI healer surfaces ── */}
      <AiDisclaimerBanner variant="healer" />

      {/* Mode content */}
      {mode === "standard" ? <StandardHealerPanel /> : <EnterpriseAIHealerPage />}
    </div>
  );
}

