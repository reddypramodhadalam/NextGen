import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { useQuery } from "@tanstack/react-query";
import {
  TestTube2,
  FolderOpen,
  Play,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Bot,
  Sparkles,
  Zap,
  Activity,
  ArrowRight,
  FileUp,
  Code2,
  Database,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { TestSuite, TestCase, TestExecution, TestAgent } from "@shared/schema";

// ── End-to-end workflow shortcuts (each maps to a real, data-backed page) ───
const WORKFLOW = [
  { step: 1, title: "Import",    desc: "CSV · Excel · JSON",      url: "/upload",      icon: FileUp,    tone: "blue"   as const },
  { step: 2, title: "Generate",  desc: "AI from requirements",    url: "/generator",   icon: Sparkles,  tone: "violet" as const },
  { step: 3, title: "Knowledge", desc: "RAG document hub",        url: "/knowledge",   icon: Database,  tone: "cyan"   as const },
  { step: 4, title: "Repository",desc: "Manage test cases",       url: "/repository",  icon: FolderOpen,tone: "blue"   as const },
  { step: 5, title: "Scripts",   desc: "Auto-generate code",      url: "/scripts",     icon: Code2,     tone: "violet" as const },
  { step: 6, title: "Execute",   desc: "Run & monitor",           url: "/executions",  icon: Play,      tone: "green"  as const },
];

const TONE_CHIP: Record<string, string> = {
  blue:   "bg-[color:var(--baxter-primary)]",
  violet: "bg-[#6D28D9]",
  cyan:   "bg-[color:var(--baxter-accent)]",
  green:  "bg-[color:var(--baxter-success)]",
};

export default function Dashboard() {
  const { user } = useAuth();

  const { data: suites = [], isLoading: suitesLoading } = useQuery<TestSuite[]>({
    queryKey: ["/api/test-suites"],
  });

  const { data: testCases = [], isLoading: casesLoading } = useQuery<TestCase[]>({
    queryKey: ["/api/test-cases"],
  });

  const { data: executions = [], isLoading: execLoading, refetch: refetchExec, isFetching: execFetching } = useQuery<TestExecution[]>({
    queryKey: ["/api/executions"],
  });

  const { data: agents = [], refetch: refetchAgents } = useQuery<TestAgent[]>({
    queryKey: ["/api/agents"],
  });

  const isLoading = suitesLoading || casesLoading || execLoading;

  const recentExecutions = executions.slice(0, 5);
  const onlineAgents = agents.filter((a) => a.status === "online").length;
  const passedExecutions = executions.filter((e) => e.status === "passed").length;
  const failedExecutions = executions.filter((e) => e.status === "failed").length;
  const runningExecutions = executions.filter((e) => e.status === "running").length;
  const completedExecutions = passedExecutions + failedExecutions;
  const passRate = completedExecutions > 0
    ? Math.round((passedExecutions / completedExecutions) * 100)
    : 0;
  const aiGeneratedCount = testCases.filter((t) => t.generatedByAI).length;

  const refreshAll = () => { refetchExec(); refetchAgents(); };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const firstName = user?.firstName || user?.email?.split("@")[0] || "there";

  // ── First-load skeleton (avoids a flash of empty "0" cards) ──────────────
  if (isLoading && executions.length === 0 && suites.length === 0) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="h-44 rounded-2xl shimmer" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-xl shimmer" />)}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-xl shimmer" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-72 rounded-xl shimmer" />
          <div className="h-72 rounded-xl shimmer" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Hero Welcome Banner — Baxter brand gradient */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 text-white shadow-xl"
        style={{ background: "linear-gradient(120deg, var(--baxter-primary-dark) 0%, var(--baxter-primary) 45%, var(--baxter-secondary) 100%)" }}
      >
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-8 -right-8 h-48 w-48 rounded-full bg-white/5" />
          <div className="absolute -bottom-12 -left-8 h-56 w-56 rounded-full bg-white/5" />
          <div className="absolute top-1/2 right-1/4 h-24 w-24 rounded-full bg-white/5" />
          {/* Grid pattern */}
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)`,
            backgroundSize: "28px 28px"
          }} />
        </div>

        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-cyan-300" />
              <span className="text-sm font-medium text-blue-100">AI-Powered Test Automation</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {greeting()}, {firstName}!
            </h1>
            <p className="text-blue-100 mt-1 text-sm">
              Your test automation platform is {runningExecutions > 0 ? `running ${runningExecutions} active execution${runningExecutions > 1 ? "s" : ""}` : "ready to execute"}.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={refreshAll}
              className="border-white/30 text-white hover:bg-white/10 backdrop-blur-sm shrink-0"
              data-testid="button-refresh-dashboard"
              title="Refresh data"
            >
              <RefreshCw className={cn("h-4 w-4", execFetching && "animate-spin")} />
            </Button>
            <Link href="/generator">
              <Button
                className="bg-white text-[color:var(--baxter-primary)] hover:bg-blue-50 font-semibold shadow-lg hover:shadow-xl transition-all"
                data-testid="button-quick-generate"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Tests
              </Button>
            </Link>
            <Link href="/executions">
              <Button
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10 backdrop-blur-sm"
                data-testid="button-run-tests"
              >
                <Play className="h-4 w-4 mr-2" />
                Run Tests
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick stats strip */}
        <div className="relative mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Test Suites", value: suites.length, icon: FolderOpen },
            { label: "Test Cases", value: testCases.length, icon: TestTube2 },
            { label: "Pass Rate", value: `${passRate}%`, icon: TrendingUp },
            { label: "Active Agents", value: onlineAgents, icon: Bot },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
              <stat.icon className="h-5 w-5 text-cyan-200 shrink-0" />
              <div>
                <p className="text-lg font-bold leading-none tabular-nums">{stat.value}</p>
                <p className="text-xs text-blue-200 mt-0.5">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Workflow shortcuts — the end-to-end pipeline, each links to a live page ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Test Automation Workflow</h2>
          </div>
          <span className="text-xs text-muted-foreground">Click any step to begin</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {WORKFLOW.map((w) => (
            <Link key={w.url} href={w.url} data-testid={`workflow-${w.title.toLowerCase()}`}>
              <div className="group relative h-full rounded-xl border border-border/60 bg-card p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-[color:var(--baxter-primary)]/40 cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shadow-sm", TONE_CHIP[w.tone])}>
                    <w.icon className="h-4.5 w-4.5 text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground/40 tabular-nums">0{w.step}</span>
                </div>
                <p className="font-semibold text-sm flex items-center gap-1">
                  {w.title}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-[color:var(--baxter-primary)] transition-colors -ml-0.5 group-hover:ml-0" />
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{w.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Stat Cards Row — now clickable drill-downs with Baxter tones */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 stagger-children">
        <StatCard
          title="Test Suites"
          value={suites.length}
          description="Total test suites"
          icon={FolderOpen}
          tone="blue"
          href="/repository"
        />
        <StatCard
          title="Test Cases"
          value={testCases.length}
          description={`${aiGeneratedCount} AI-generated`}
          icon={TestTube2}
          tone="violet"
          href="/repository"
        />
        <StatCard
          title="Pass Rate"
          value={`${passRate}%`}
          description={`${completedExecutions} completed runs`}
          icon={TrendingUp}
          tone="green"
          href="/reports"
          trend={passRate > 0 ? { value: passRate >= 80 ? 5 : -3, label: "health" } : undefined}
        />
        <StatCard
          title="Active Agents"
          value={onlineAgents}
          description={`${agents.length} total agents`}
          icon={Bot}
          tone="amber"
          href="/agents"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Executions */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base font-semibold">Recent Executions</CardTitle>
            </div>
            <Link href="/executions">
              <Button variant="ghost" size="sm" className="text-primary hover:text-primary gap-1" data-testid="link-view-all-executions">
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentExecutions.length === 0 ? (
              <div className="py-10 text-center">
                <div className="h-14 w-14 rounded-2xl bg-muted mx-auto mb-3 flex items-center justify-center">
                  <Play className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium text-sm">No executions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Run your first test to see results here</p>
                <Link href="/executions">
                  <Button size="sm" className="mt-3" variant="outline">Start Execution</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentExecutions.map((execution) => {
                  const total = execution.totalTests || 0;
                  const passed = execution.passedTests || 0;
                  const execPass = total > 0 ? Math.round((passed / total) * 100) : 0;
                  return (
                    <Link key={execution.id} href="/executions">
                      <div
                        className="group flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
                        data-testid={`card-execution-${execution.id.slice(0, 8)}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <StatusBadge status={execution.status as any} />
                          <div className="min-w-0">
                            <p className="font-medium text-sm flex items-center gap-1" data-testid={`text-execution-id-${execution.id.slice(0, 8)}`}>
                              Execution #{execution.id.slice(0, 8)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {total} tests · {execution.environment || "staging"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-sm shrink-0">
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {passed}
                          </span>
                          <span className="flex items-center gap-1 text-red-500 dark:text-red-400 font-medium">
                            <XCircle className="h-3.5 w-3.5" />
                            {execution.failedTests || 0}
                          </span>
                          <span className="hidden sm:inline text-xs font-semibold tabular-nums w-9 text-right text-muted-foreground">
                            {execPass}%
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Status */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-violet-500" />
              </div>
              <CardTitle className="text-base font-semibold">Agent Status</CardTitle>
            </div>
            <Link href="/agents">
              <Button variant="ghost" size="sm" className="text-primary hover:text-primary gap-1" data-testid="link-manage-agents">
                Manage
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <div className="py-10 text-center">
                <div className="h-14 w-14 rounded-2xl bg-muted mx-auto mb-3 flex items-center justify-center">
                  <Bot className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium text-sm">No agents configured</p>
                <p className="text-xs text-muted-foreground mt-1">Set up agents to run automated tests</p>
                <Link href="/agents">
                  <Button size="sm" className="mt-3" variant="outline">Add Agent</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <Link key={agent.id} href="/agents">
                    <div
                      className="group flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
                      data-testid={`card-agent-${agent.id.slice(0, 8)}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          agent.status === "online"
                            ? "neon-dot-green"
                            : agent.status === "busy"
                            ? "neon-dot-amber animate-pulse-status"
                            : "neon-dot-slate"
                        }`} />
                        <div>
                          <p className="font-medium text-sm" data-testid={`text-agent-name-${agent.id.slice(0, 8)}`}>
                            {agent.name}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">{agent.type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={agent.status as any} showIcon={false} />
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Bottom Row — outcome breakdown, links to Reports */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/reports" className="block">
          <div className="group flex items-center gap-4 p-5 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{passedExecutions}</p>
              <p className="text-sm text-muted-foreground font-medium">Passed Executions</p>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/30 group-hover:text-foreground transition-colors" />
          </div>
        </Link>

        <Link href="/reports" className="block">
          <div className="group flex items-center gap-4 p-5 rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/10 to-red-500/5 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer">
            <div className="h-12 w-12 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
              <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">{failedExecutions}</p>
              <p className="text-sm text-muted-foreground font-medium">Failed Executions</p>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/30 group-hover:text-foreground transition-colors" />
          </div>
        </Link>

        <Link href="/executions" className="block">
          <div className="group flex items-center gap-4 p-5 rounded-2xl border border-[color:var(--baxter-primary)]/20 bg-gradient-to-br from-[color:var(--baxter-primary)]/10 to-[color:var(--baxter-primary)]/5 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer">
            <div className="h-12 w-12 rounded-xl bg-[color:var(--baxter-primary)]/15 flex items-center justify-center shrink-0">
              <Activity className="h-6 w-6 text-[color:var(--baxter-primary)] dark:text-blue-300" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-[color:var(--baxter-primary)] dark:text-blue-300 tabular-nums">{runningExecutions}</p>
              <p className="text-sm text-muted-foreground font-medium">Running Now</p>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/30 group-hover:text-foreground transition-colors" />
          </div>
        </Link>

        <Link href="/generator" className="block">
          <div className="group flex items-center gap-4 p-5 rounded-2xl border border-[#6D28D9]/20 bg-gradient-to-br from-[#6D28D9]/10 to-[#6D28D9]/5 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer">
            <div className="h-12 w-12 rounded-xl bg-[#6D28D9]/15 flex items-center justify-center shrink-0">
              <Sparkles className="h-6 w-6 text-[#6D28D9] dark:text-violet-300" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-[#6D28D9] dark:text-violet-300 tabular-nums">{aiGeneratedCount}</p>
              <p className="text-sm text-muted-foreground font-medium">AI-Generated Tests</p>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/30 group-hover:text-foreground transition-colors" />
          </div>
        </Link>
      </div>
    </div>
  );
}
