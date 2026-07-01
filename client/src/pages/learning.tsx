import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain, Loader2, TrendingUp, TrendingDown, Activity, Anchor as AnchorIcon,
  AlertTriangle, CheckCircle2, RefreshCw, Sparkles, History, Target,
  ShieldCheck, Gauge, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types (match server/learning-routes.ts responses) ──────────────────────────

interface LearningSummary {
  totalObservations: number;
  successes: number;
  failures: number;
  heals: number;
  locatorVersions: number;
  trackedAnchors: number;
  healRate: number;
  successRate: number;
}

interface AnchorStat {
  id: string;
  objectId?: string;
  application?: string;
  anchorType: string;
  anchorValue?: string;
  successCount: number;
  failureCount: number;
  reliability: number;
  lastUsedAt?: number;
}

type ObjectHealth = "healthy" | "watch" | "flaky" | "unknown";

interface ObjectInsight {
  objectId: string;
  objectName?: string;
  application?: string;
  form?: string;
  reliability: number;
  success: number;
  failure: number;
  heals: number;
  health: ObjectHealth;
  recommendation: string;
}

interface InsightsResponse {
  summary: LearningSummary;
  anchorLeaderboard: AnchorStat[];
  driftObjects: ObjectInsight[];
  headlines: string[];
}

interface LocatorVersion {
  id: string;
  objectId: string;
  application?: string;
  form?: string;
  objectName?: string;
  version: number;
  locatorStrategy?: string;
  locatorValue?: string;
  previousValue?: string;
  changeReason?: string;
  confidence?: number;
  createdAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pct = (n: number) => `${Math.round((n || 0) * 100)}%`;

function relTime(unixSeconds?: number): string {
  if (!unixSeconds) return "—";
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const HEALTH_STYLES: Record<ObjectHealth, { label: string; cls: string; icon: any }> = {
  healthy: { label: "Healthy", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
  watch: { label: "Watch", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", icon: Activity },
  flaky: { label: "Flaky", cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20", icon: AlertTriangle },
  unknown: { label: "New", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20", icon: Sparkles },
};

function reliabilityColor(r: number): string {
  if (r >= 0.9) return "bg-emerald-500";
  if (r >= 0.6) return "bg-amber-500";
  return "bg-red-500";
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: any; color: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <div className={cn("p-1.5 rounded-lg", color)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ReliabilityBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", reliabilityColor(value))} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums w-9 text-right font-medium">{pct(value)}</span>
    </div>
  );
}

// ─── Per-object version history (lazy-loaded on expand) ─────────────────────────

function VersionHistory({ objectId }: { objectId: string }) {
  const { data, isLoading } = useQuery<LocatorVersion[]>({
    queryKey: ["/api/learning/objects", objectId, "versions"],
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading history…</div>;
  }
  if (!data || data.length === 0) {
    return <div className="text-xs text-muted-foreground py-2">No version history recorded yet.</div>;
  }

  return (
    <div className="space-y-2 pt-2">
      {data.map((v) => (
        <div key={v.id} className="flex items-start gap-3 text-xs">
          <Badge variant="outline" className="font-mono shrink-0">v{v.version}</Badge>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-foreground">{v.locatorStrategy}={v.locatorValue}</span>
              <Badge variant="secondary" className="text-[10px]">{v.changeReason}</Badge>
              {typeof v.confidence === "number" && (
                <span className="text-muted-foreground">conf {pct(v.confidence)}</span>
              )}
            </div>
            {v.previousValue && (
              <div className="text-muted-foreground mt-0.5">was: <span className="font-mono">{v.previousValue}</span></div>
            )}
          </div>
          <span className="text-muted-foreground shrink-0">{relTime(v.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function LearningPage() {
  const [expandedObject, setExpandedObject] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<InsightsResponse>({
    queryKey: ["/api/learning/insights"],
    refetchInterval: 30000, // live-ish: refresh every 30s
  });

  const summary = data?.summary;
  const headlines = data?.headlines ?? [];
  const anchors = data?.anchorLeaderboard ?? [];
  const drift = data?.driftObjects ?? [];

  const hasData = (summary?.totalObservations ?? 0) > 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20">
            <Brain className="h-6 w-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Learning &amp; Analytics
              <Badge className="bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20">Agent 11</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Self-improving locator intelligence — learns reliability from every execution.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-learning">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !hasData ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Brain className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No learning data yet</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Run some JDE test executions and the platform will start recording locator
              outcomes, anchor reliability, and repository versions here automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Headlines */}
          {headlines.length > 0 && (
            <Card className="bg-gradient-to-br from-violet-500/5 to-transparent border-violet-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" /> Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {headlines.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-violet-500 mt-1">•</span>
                    <span>{h}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Observations" value={summary!.totalObservations} icon={Activity}
              color="bg-blue-500/10 text-blue-600 dark:text-blue-400" />
            <StatCard label="Success Rate" value={pct(summary!.successRate)} sub={`${summary!.successes} ok / ${summary!.failures} fail`}
              icon={TrendingUp} color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
            <StatCard label="Self-Heals" value={summary!.heals} sub={`${pct(summary!.healRate)} of resolved`}
              icon={ShieldCheck} color="bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400" />
            <StatCard label="Tracked Anchors" value={summary!.trackedAnchors} icon={AnchorIcon}
              color="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
            <StatCard label="Locator Versions" value={summary!.locatorVersions} icon={History}
              color="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" />
            <StatCard label="Drift Objects" value={drift.filter(d => d.health === "flaky").length} sub="need attention"
              icon={AlertTriangle} color="bg-red-500/10 text-red-600 dark:text-red-400" />
          </div>

          {/* Tabs: Drift + Anchors */}
          <Tabs defaultValue="drift" className="space-y-4">
            <TabsList>
              <TabsTrigger value="drift" data-testid="tab-drift">
                <Target className="h-4 w-4 mr-2" /> Object Health
              </TabsTrigger>
              <TabsTrigger value="anchors" data-testid="tab-anchors">
                <AnchorIcon className="h-4 w-4 mr-2" /> Anchor Leaderboard
              </TabsTrigger>
            </TabsList>

            {/* Drift / object health */}
            <TabsContent value="drift">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gauge className="h-4 w-4" /> Object Reliability &amp; Drift
                  </CardTitle>
                  <CardDescription>
                    Objects ranked by failure rate. Click a row to view its locator version history.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {drift.length === 0 ? (
                    <div className="px-6 py-8 text-sm text-muted-foreground text-center">No object outcomes recorded yet.</div>
                  ) : (
                    <div className="divide-y">
                      {drift.map((o) => {
                        const hs = HEALTH_STYLES[o.health];
                        const HIcon = hs.icon;
                        const expanded = expandedObject === o.objectId;
                        return (
                          <div key={o.objectId}>
                            <button
                              className="w-full px-4 md:px-6 py-3 flex items-center gap-4 hover:bg-muted/40 transition-colors text-left"
                              onClick={() => setExpandedObject(expanded ? null : o.objectId)}
                              data-testid={`row-object-${o.objectId}`}
                            >
                              <div className={cn("p-1.5 rounded-lg border shrink-0", hs.cls)}>
                                <HIcon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium truncate">{o.objectName || o.objectId}</span>
                                  {o.application && <Badge variant="outline" className="text-[10px]">{o.application}</Badge>}
                                  {o.form && <Badge variant="secondary" className="text-[10px]">{o.form}</Badge>}
                                </div>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{o.recommendation}</p>
                              </div>
                              <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                                <span className="text-emerald-600 dark:text-emerald-400">{o.success}✓</span>
                                <span className="text-red-600 dark:text-red-400">{o.failure}✗</span>
                                {o.heals > 0 && <span className="text-fuchsia-600 dark:text-fuchsia-400">{o.heals}⚕</span>}
                              </div>
                              <ReliabilityBar value={o.reliability} />
                            </button>
                            {expanded && (
                              <div className="px-4 md:px-6 pb-4 bg-muted/20">
                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground pt-3 pb-1">
                                  <History className="h-3.5 w-3.5" /> Locator Version History
                                </div>
                                <VersionHistory objectId={o.objectId} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Anchor leaderboard */}
            <TabsContent value="anchors">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-4 w-4" /> Anchor Reliability Leaderboard
                  </CardTitle>
                  <CardDescription>
                    Which anchor types are most reliable across executions — the basis for multi-anchor validation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {anchors.length === 0 ? (
                    <div className="px-6 py-8 text-sm text-muted-foreground text-center">No anchor outcomes recorded yet.</div>
                  ) : (
                    <div className="divide-y">
                      {anchors.map((a, i) => (
                        <div key={a.id} className="px-4 md:px-6 py-3 flex items-center gap-4">
                          <span className="text-sm font-mono text-muted-foreground w-6 text-center shrink-0">{i + 1}</span>
                          <div className={cn("p-1.5 rounded-lg shrink-0",
                            a.reliability >= 0.9 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                            a.reliability >= 0.6 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                            "bg-red-500/10 text-red-600 dark:text-red-400")}>
                            <AnchorIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="capitalize">{a.anchorType}</Badge>
                              {a.anchorValue && <span className="text-sm truncate">{a.anchorValue}</span>}
                              {a.application && <Badge variant="secondary" className="text-[10px]">{a.application}</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {a.successCount} success · {a.failureCount} fail · used {relTime(a.lastUsedAt)}
                            </p>
                          </div>
                          <ReliabilityBar value={a.reliability} />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
