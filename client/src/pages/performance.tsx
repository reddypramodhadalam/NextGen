import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Gauge, Loader2, Play, Plus, Trash2, AlertTriangle,
  CheckCircle2, XCircle, Zap, TrendingUp, Clock,
  BarChart3, Activity, Globe, Users, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BenchmarkScenario { name: string; method: string; path: string; weight: number; }
interface PerformanceThreshold { metric: string; operator: string; value: number; unit: string; }
interface TimelinePoint { second: number; requests: number; avgDuration: number; errors: number; }
interface ThresholdResult { threshold: PerformanceThreshold; actual: number; passed: boolean; }

interface BenchmarkResult {
  id: string; targetUrl: string; passed: boolean; summary: string;
  totalRequests: number; successfulRequests: number; failedRequests: number; errorRate: number;
  avgResponseTime: number; minResponseTime: number; maxResponseTime: number;
  p50: number; p75: number; p95: number; p99: number;
  requestsPerSecond: number; bytesPerSecond: number; totalBytes: number;
  thresholdResults: ThresholdResult[];
  timeline: TimelinePoint[];
}

interface QuickCheckResult { avg: number; p95: number; min: number; max: number; errorRate: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function MetricCard({ label, value, unit, color, icon: Icon, sub }: {
  label: string; value: string | number; unit?: string;
  color: string; icon: any; sub?: string;
}) {
  return (
    <div className={cn("p-4 rounded-xl border", color)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground/60" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums w-12 text-right">{value}ms</span>
    </div>
  );
}

// ─── Timeline Chart ───────────────────────────────────────────────────────────

function TimelineChart({ data }: { data: TimelinePoint[] }) {
  if (!data.length) return null;
  const maxReqs = Math.max(...data.map((d) => d.requests), 1);
  const maxDur = Math.max(...data.map((d) => d.avgDuration), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-0.5 h-24">
        {data.map((point, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div
              className="w-full bg-primary/70 rounded-t-sm transition-all hover:bg-primary"
              style={{ height: `${(point.requests / maxReqs) * 80}px` }}
            />
            {point.errors > 0 && (
              <div
                className="w-full bg-red-500/70 rounded-t-sm absolute bottom-0"
                style={{ height: `${(point.errors / maxReqs) * 80}px` }}
              />
            )}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover border rounded px-1.5 py-0.5 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
              t={point.second}s: {point.requests} req, {point.avgDuration}ms avg
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0s</span>
        <span className="text-primary">■ Requests</span>
        <span className="text-red-500">■ Errors</span>
        <span>{data[data.length - 1]?.second || 0}s</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const { toast } = useToast();
  const [targetUrl, setTargetUrl] = useState("https://");
  const [concurrentUsers, setConcurrentUsers] = useState(5);
  const [requestsPerUser, setRequestsPerUser] = useState(10);
  const [rampUpSeconds, setRampUpSeconds] = useState(3);
  const [thinkTimeMs, setThinkTimeMs] = useState(200);
  const [authToken, setAuthToken] = useState("");
  const [scenarios, setScenarios] = useState<BenchmarkScenario[]>([]);
  const [thresholds, setThresholds] = useState<PerformanceThreshold[]>([
    { metric: "p95", operator: "lt", value: 2000, unit: "ms" },
    { metric: "error_rate", operator: "lt", value: 5, unit: "%" },
  ]);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [quickResult, setQuickResult] = useState<QuickCheckResult | null>(null);
  const [quickUrl, setQuickUrl] = useState("https://");

  const benchmarkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/performance/benchmark/sync", {
        targetUrl, concurrentUsers, requestsPerUser, rampUpSeconds,
        thinkTimeMs, authToken: authToken || undefined,
        scenarios: scenarios.length > 0 ? scenarios : undefined,
        thresholds,
      });
      return res.json() as Promise<BenchmarkResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: data.passed ? "Benchmark Passed ✓" : "Benchmark Failed ✗",
        description: data.summary,
        variant: data.passed ? "default" : "destructive",
      });
    },
    onError: (e: any) => toast({ title: "Benchmark Error", description: e.message, variant: "destructive" }),
  });

  const quickMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/performance/quick-check", { url: quickUrl, samples: 5 });
      return res.json() as Promise<QuickCheckResult>;
    },
    onSuccess: (data) => {
      setQuickResult(data);
      toast({ title: "Quick Check Complete", description: `avg: ${data.avg}ms, p95: ${data.p95}ms` });
    },
    onError: (e: any) => toast({ title: "Quick Check Error", description: e.message, variant: "destructive" }),
  });

  const addScenario = () => setScenarios([...scenarios, { name: `Scenario ${scenarios.length + 1}`, method: "GET", path: "/", weight: 1 }]);
  const removeScenario = (i: number) => setScenarios(scenarios.filter((_, idx) => idx !== i));
  const updateScenario = (i: number, field: keyof BenchmarkScenario, value: any) =>
    setScenarios(scenarios.map((s, idx) => idx === i ? { ...s, [field]: value } : s));

  const addThreshold = () => setThresholds([...thresholds, { metric: "p95", operator: "lt", value: 1000, unit: "ms" }]);
  const removeThreshold = (i: number) => setThresholds(thresholds.filter((_, idx) => idx !== i));

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
          <Gauge className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performance Benchmarking</h1>
          <p className="text-sm text-muted-foreground">Load testing, response time analysis, and threshold alerting</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Config Panel */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quick Check</CardTitle>
              <CardDescription className="text-xs">5-sample response time check</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="https://api.example.com/health" value={quickUrl} onChange={(e) => setQuickUrl(e.target.value)} />
              <Button size="sm" className="w-full" onClick={() => quickMutation.mutate()} disabled={quickMutation.isPending || !quickUrl.startsWith("http")}>
                {quickMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Checking...</> : <><Zap className="h-3.5 w-3.5 mr-1.5" />Quick Check</>}
              </Button>
              {quickResult && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {[["Avg", quickResult.avg], ["P95", quickResult.p95], ["Min", quickResult.min], ["Max", quickResult.max]].map(([label, val]) => (
                    <div key={label} className="text-center p-2 rounded-lg bg-muted/40">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-bold tabular-nums">{val}ms</p>
                    </div>
                  ))}
                  <div className="col-span-2 text-center p-2 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground">Error Rate</p>
                    <p className={cn("text-sm font-bold", quickResult.errorRate > 0 ? "text-red-500" : "text-emerald-500")}>{quickResult.errorRate.toFixed(1)}%</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Load Test Config</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Target URL</Label>
                <Input placeholder="https://api.example.com" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Concurrent Users</Label>
                  <Input type="number" min={1} max={10} value={concurrentUsers} onChange={(e) => setConcurrentUsers(parseInt(e.target.value) || 1)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Requests/User</Label>
                  <Input type="number" min={1} max={20} value={requestsPerUser} onChange={(e) => setRequestsPerUser(parseInt(e.target.value) || 1)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ramp-up (s)</Label>
                  <Input type="number" min={0} max={30} value={rampUpSeconds} onChange={(e) => setRampUpSeconds(parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Think Time (ms)</Label>
                  <Input type="number" min={0} max={5000} value={thinkTimeMs} onChange={(e) => setThinkTimeMs(parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Auth Token (optional)</Label>
                <Input type="password" placeholder="Bearer token" value={authToken} onChange={(e) => setAuthToken(e.target.value)} />
              </div>

              {/* Thresholds */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Pass/Fail Thresholds</Label>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={addThreshold}><Plus className="h-3 w-3 mr-1" />Add</Button>
                </div>
                {thresholds.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <select className="flex-1 h-7 rounded border bg-background px-1.5 text-xs" value={t.metric} onChange={(e) => setThresholds(thresholds.map((th, idx) => idx === i ? { ...th, metric: e.target.value } : th))}>
                      {["p50","p75","p95","p99","avg","error_rate","throughput"].map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className="w-10 h-7 rounded border bg-background px-1 text-xs" value={t.operator} onChange={(e) => setThresholds(thresholds.map((th, idx) => idx === i ? { ...th, operator: e.target.value } : th))}>
                      <option value="lt">&lt;</option><option value="lte">≤</option><option value="gt">&gt;</option><option value="gte">≥</option>
                    </select>
                    <Input type="number" className="w-16 h-7 text-xs" value={t.value} onChange={(e) => setThresholds(thresholds.map((th, idx) => idx === i ? { ...th, value: parseFloat(e.target.value) || 0 } : th))} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeThreshold(i)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>

              <Button className="w-full" onClick={() => benchmarkMutation.mutate()} disabled={benchmarkMutation.isPending || !targetUrl.startsWith("http")}>
                {benchmarkMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running Load Test...</> : <><Play className="h-4 w-4 mr-2" />Run Load Test</>}
              </Button>
              <p className="text-xs text-muted-foreground text-center">Max: 10 users × 20 requests (sync mode)</p>
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-4">
          {!result && !benchmarkMutation.isPending && (
            <div className="flex items-center justify-center h-64 rounded-xl border-2 border-dashed border-border/50">
              <div className="text-center text-muted-foreground">
                <Gauge className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No results yet</p>
                <p className="text-sm mt-1">Configure and run a load test to see results</p>
              </div>
            </div>
          )}

          {benchmarkMutation.isPending && (
            <div className="flex items-center justify-center h-64 rounded-xl border bg-muted/20">
              <div className="text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-3" />
                <p className="font-medium">Running load test...</p>
                <p className="text-sm text-muted-foreground mt-1">{concurrentUsers} users × {requestsPerUser} requests</p>
              </div>
            </div>
          )}

          {result && (
            <>
              {/* Status Banner */}
              <div className={cn("p-4 rounded-xl border flex items-center gap-3", result.passed ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30")}>
                {result.passed ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" /> : <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
                <div>
                  <p className={cn("font-semibold text-sm", result.passed ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                    {result.passed ? "All thresholds passed" : "One or more thresholds failed"}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{result.summary}</p>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Avg Response" value={result.avgResponseTime} unit="ms" color="bg-card border" icon={Clock} sub={`min: ${result.minResponseTime}ms`} />
                <MetricCard label="Throughput" value={result.requestsPerSecond} unit="req/s" color="bg-card border" icon={TrendingUp} sub={`${result.totalRequests} total`} />
                <MetricCard label="Error Rate" value={result.errorRate.toFixed(1)} unit="%" color={cn("border", result.errorRate > 5 ? "bg-red-500/10" : "bg-card")} icon={AlertTriangle} sub={`${result.failedRequests} failed`} />
                <MetricCard label="Data Transfer" value={formatBytes(result.totalBytes)} color="bg-card border" icon={Activity} sub={`${formatBytes(result.bytesPerSecond)}/s`} />
              </div>

              {/* Percentiles */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" />Response Time Percentiles</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[["P50 (Median)", result.p50], ["P75", result.p75], ["P95", result.p95], ["P99", result.p99], ["Max", result.maxResponseTime]].map(([label, val]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
                      <MiniBar value={val as number} max={result.maxResponseTime} color={
                        (val as number) > 2000 ? "bg-red-500" : (val as number) > 1000 ? "bg-amber-500" : "bg-emerald-500"
                      } />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Timeline */}
              {result.timeline.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />Request Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TimelineChart data={result.timeline} />
                  </CardContent>
                </Card>
              )}

              {/* Threshold Results */}
              {result.thresholdResults.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Threshold Results</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.thresholdResults.map((tr, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2">
                          {tr.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                          <span className="text-sm font-mono">{tr.threshold.metric} {tr.threshold.operator} {tr.threshold.value}{tr.threshold.unit}</span>
                        </div>
                        <Badge variant={tr.passed ? "default" : "destructive"} className="text-xs">
                          actual: {typeof tr.actual === "number" ? tr.actual.toFixed(1) : tr.actual}{tr.threshold.unit}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
