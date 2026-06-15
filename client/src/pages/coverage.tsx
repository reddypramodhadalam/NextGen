import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Target, RefreshCw, Loader2, CheckCircle2, XCircle,
  AlertTriangle, Minus, TrendingUp, Shield, BarChart3,
  ChevronDown, ChevronRight, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestSuite } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoverageCell {
  testCaseId: string; testCaseTitle: string;
  status: "covered" | "partial" | "uncovered" | "failing";
  lastRunStatus?: string; executionCount: number;
  passRate: number; riskScore: number;
}

interface RequirementRow {
  id: string; title: string; status: string; priority?: string;
  testCases: CoverageCell[];
  coverageStatus: "covered" | "partial" | "uncovered";
  passRate: number; riskScore: number;
}

interface CoverageMatrix {
  requirements: RequirementRow[];
  orphanTestCases: Array<{ id: string; title: string; lastStatus?: string }>;
  stats: {
    totalRequirements: number; coveredRequirements: number; uncoveredRequirements: number;
    totalTestCases: number; coveragePercent: number; passRate: number; riskScore: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, { total: number; covered: number; passing: number }>;
  };
  generatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COVERAGE_CONFIG = {
  covered:   { label: "Covered",   color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  partial:   { label: "Partial",   color: "text-amber-600 dark:text-amber-400",    bg: "bg-amber-500/10 border-amber-500/20",    icon: AlertTriangle },
  uncovered: { label: "Uncovered", color: "text-red-600 dark:text-red-400",        bg: "bg-red-500/10 border-red-500/20",        icon: XCircle },
  failing:   { label: "Failing",   color: "text-orange-600 dark:text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20",  icon: XCircle },
};

function RiskBadge({ score }: { score: number }) {
  const color = score >= 70 ? "bg-red-500/15 text-red-700 dark:text-red-400"
    : score >= 40 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  const label = score >= 70 ? "High" : score >= 40 ? "Med" : "Low";
  return <Badge className={cn("text-xs h-5 border-0", color)}>{label} {score}</Badge>;
}

function StatusDot({ status }: { status?: string }) {
  const colors: Record<string, string> = {
    passed: "bg-emerald-500", failed: "bg-red-500",
    skipped: "bg-amber-500", pending: "bg-slate-400",
  };
  return <span className={cn("h-2 w-2 rounded-full inline-block", colors[status || "pending"] || "bg-slate-400")} />;
}

// ─── Requirement Row ──────────────────────────────────────────────────────────

function RequirementRowComponent({ row }: { row: RequirementRow }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = COVERAGE_CONFIG[row.coverageStatus];
  const Icon = cfg.icon;

  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        <div className={cn("h-7 w-7 rounded-lg border flex items-center justify-center shrink-0", cfg.bg)}>
          <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{row.title}</p>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span className={cfg.color}>{cfg.label}</span>
            <span>{row.testCases.length} test{row.testCases.length !== 1 ? "s" : ""}</span>
            {row.priority && <span className="capitalize">{row.priority}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium tabular-nums">{row.passRate}%</p>
            <p className="text-xs text-muted-foreground">pass rate</p>
          </div>
          <RiskBadge score={row.riskScore} />
        </div>
      </button>

      {expanded && row.testCases.length > 0 && (
        <div className="border-t bg-muted/10 divide-y divide-border/30">
          {row.testCases.map((cell) => (
            <div key={cell.testCaseId} className="flex items-center gap-3 px-4 py-2.5">
              <StatusDot status={cell.lastRunStatus} />
              <p className="text-xs flex-1 truncate">{cell.testCaseTitle}</p>
              <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                <span>{cell.executionCount} runs</span>
                <span className={cell.passRate >= 80 ? "text-emerald-600" : cell.passRate >= 50 ? "text-amber-600" : "text-red-500"}>
                  {cell.passRate}%
                </span>
                <RiskBadge score={cell.riskScore} />
              </div>
            </div>
          ))}
        </div>
      )}

      {expanded && row.testCases.length === 0 && (
        <div className="border-t bg-muted/10 px-4 py-3 text-xs text-muted-foreground text-center">
          No test cases linked to this requirement
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoveragePage() {
  const [selectedSuite, setSelectedSuite] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [matrix, setMatrix] = useState<CoverageMatrix | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: suites = [] } = useQuery<TestSuite[]>({ queryKey: ["/api/test-suites"] });

  const loadMatrix = async () => {
    setLoading(true);
    try {
      const params = selectedSuite !== "all" ? `?suiteId=${selectedSuite}` : "";
      const res = await apiRequest("GET", `/api/coverage/matrix${params}`);
      const data = await res.json();
      setMatrix(data);
    } catch (e: any) {
      console.error("Coverage matrix error:", e);
    } finally {
      setLoading(false);
    }
  };

  const filteredRequirements = matrix?.requirements.filter((r) =>
    filterStatus === "all" || r.coverageStatus === filterStatus
  ) || [];

  const stats = matrix?.stats;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
          <Target className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Test Coverage Matrix</h1>
          <p className="text-sm text-muted-foreground">Requirements → test cases → pass/fail with risk scoring</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Test Suite</label>
          <Select value={selectedSuite} onValueChange={setSelectedSuite}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Test Cases</SelectItem>
              {suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={loadMatrix} disabled={loading} className="gap-2">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Building Matrix...</> : <><RefreshCw className="h-4 w-4" />Build Coverage Matrix</>}
        </Button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Coverage",      value: `${stats.coveragePercent}%`, icon: Target,    color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10" },
            { label: "Pass Rate",     value: `${stats.passRate}%`,        icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "Risk Score",    value: stats.riskScore,             icon: Shield,    color: stats.riskScore >= 60 ? "text-red-600" : "text-amber-600", bg: stats.riskScore >= 60 ? "bg-red-500/10" : "bg-amber-500/10" },
            { label: "Requirements",  value: `${stats.coveredRequirements}/${stats.totalRequirements}`, icon: BarChart3, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", s.bg)}>
                  <s.icon className={cn("h-5 w-5", s.color)} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {matrix && (
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Matrix */}
          <div className="lg:col-span-3 space-y-4">
            {/* Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              {["all", "covered", "partial", "uncovered"].map((s) => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-all capitalize", filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border/50 hover:border-border")}>
                  {s === "all" ? `All (${matrix.requirements.length})` : `${s} (${matrix.stats.byStatus[s] || 0})`}
                </button>
              ))}
            </div>

            {filteredRequirements.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">
                  {matrix.requirements.length === 0 ? "No requirements found" : "No requirements match filter"}
                </p>
                <p className="text-sm mt-1">
                  {matrix.requirements.length === 0
                    ? "Add requirements in the Test Repository to see coverage"
                    : "Try a different filter"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRequirements
                  .sort((a, b) => b.riskScore - a.riskScore)
                  .map((row) => <RequirementRowComponent key={row.id} row={row} />)}
              </div>
            )}

            {/* Orphan Test Cases */}
            {matrix.orphanTestCases.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Unlinked Test Cases ({matrix.orphanTestCases.length})
                  </CardTitle>
                  <CardDescription className="text-xs">These tests are not linked to any requirement</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {matrix.orphanTestCases.slice(0, 10).map((tc) => (
                    <div key={tc.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                      <StatusDot status={tc.lastStatus} />
                      <p className="text-xs flex-1 truncate">{tc.title}</p>
                      {tc.lastStatus && <Badge variant="outline" className="text-xs h-5">{tc.lastStatus}</Badge>}
                    </div>
                  ))}
                  {matrix.orphanTestCases.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">+{matrix.orphanTestCases.length - 10} more</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar Stats */}
          <div className="space-y-4">
            {/* Coverage Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Coverage Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(COVERAGE_CONFIG).slice(0, 3).map(([key, cfg]) => {
                  const count = stats?.byStatus[key] || 0;
                  const total = stats?.totalRequirements || 1;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn("font-medium", cfg.color)}>{cfg.label}</span>
                        <span className="tabular-nums">{count}</span>
                      </div>
                      <Progress value={(count / total) * 100} className="h-1.5" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* By Priority */}
            {stats && Object.keys(stats.byPriority).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">By Priority</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(stats.byPriority).map(([priority, data]) => (
                    <div key={priority} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium capitalize">{priority}</span>
                        <span className="text-muted-foreground">{data.passing}/{data.total} passing</span>
                      </div>
                      <Progress value={data.total > 0 ? (data.passing / data.total) * 100 : 0} className="h-1.5" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Risk Legend */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Risk Score Guide
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {[
                  { range: "70-100", label: "High Risk", color: "text-red-600", desc: "No tests or consistently failing" },
                  { range: "40-69",  label: "Medium Risk", color: "text-amber-600", desc: "Partial coverage or low pass rate" },
                  { range: "0-39",   label: "Low Risk", color: "text-emerald-600", desc: "Well covered and passing" },
                ].map((r) => (
                  <div key={r.range} className="flex items-start gap-2">
                    <span className={cn("font-bold tabular-nums w-14 shrink-0", r.color)}>{r.range}</span>
                    <div>
                      <p className={cn("font-medium", r.color)}>{r.label}</p>
                      <p className="text-muted-foreground">{r.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              Generated {matrix ? new Date(matrix.generatedAt).toLocaleTimeString() : ""}
            </p>
          </div>
        </div>
      )}

      {!matrix && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center mx-auto mb-4">
            <Target className="h-10 w-10 text-indigo-500/60" />
          </div>
          <h3 className="font-semibold text-lg text-foreground">Test Coverage Matrix</h3>
          <p className="text-sm mt-2 max-w-md mx-auto">
            Click <strong>Build Coverage Matrix</strong> to map your requirements to test cases,
            see pass rates, and identify high-risk gaps.
          </p>
        </div>
      )}
    </div>
  );
}
