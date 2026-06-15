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
  Clock,
  TrendingUp,
  Bot,
  Sparkles,
  Zap,
  Activity,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import type { TestSuite, TestCase, TestExecution, TestAgent } from "@shared/schema";

export default function Dashboard() {
  const { user } = useAuth();

  const { data: suites = [] } = useQuery<TestSuite[]>({
    queryKey: ["/api/test-suites"],
  });

  const { data: testCases = [] } = useQuery<TestCase[]>({
    queryKey: ["/api/test-cases"],
  });

  const { data: executions = [] } = useQuery<TestExecution[]>({
    queryKey: ["/api/executions"],
  });

  const { data: agents = [] } = useQuery<TestAgent[]>({
    queryKey: ["/api/agents"],
  });

  const recentExecutions = executions.slice(0, 5);
  const onlineAgents = agents.filter((a) => a.status === "online").length;
  const passedExecutions = executions.filter((e) => e.status === "passed").length;
  const failedExecutions = executions.filter((e) => e.status === "failed").length;
  const runningExecutions = executions.filter((e) => e.status === "running").length;
  const passRate = executions.length > 0
    ? Math.round((passedExecutions / executions.length) * 100)
    : 0;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const firstName = user?.firstName || user?.email?.split("@")[0] || "there";

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-violet-700 p-6 text-white shadow-xl">
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
              <Zap className="h-4 w-4 text-yellow-300" />
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
            <Link href="/generator">
              <Button
                className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-lg hover:shadow-xl transition-all"
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
              <stat.icon className="h-5 w-5 text-blue-200 shrink-0" />
              <div>
                <p className="text-lg font-bold leading-none">{stat.value}</p>
                <p className="text-xs text-blue-200 mt-0.5">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stat Cards Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 stagger-children">
        <StatCard
          title="Test Suites"
          value={suites.length}
          description="Total test suites"
          icon={FolderOpen}
          colorClass="metric-blue"
        />
        <StatCard
          title="Test Cases"
          value={testCases.length}
          description={`${testCases.filter((t) => t.generatedByAI).length} AI-generated`}
          icon={TestTube2}
          colorClass="metric-purple"
        />
        <StatCard
          title="Pass Rate"
          value={`${passRate}%`}
          description="All executions"
          icon={TrendingUp}
          colorClass="metric-green"
          trend={passRate > 0 ? { value: 5, label: "vs last month" } : undefined}
        />
        <StatCard
          title="Active Agents"
          value={onlineAgents}
          description={`${agents.length} total agents`}
          icon={Bot}
          colorClass="metric-amber"
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
                {recentExecutions.map((execution) => (
                  <div
                    key={execution.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors cursor-default"
                    data-testid={`card-execution-${execution.id.slice(0, 8)}`}
                  >
                    <div className="flex items-center gap-3">
                      <StatusBadge status={execution.status as any} />
                      <div>
                        <p className="font-medium text-sm" data-testid={`text-execution-id-${execution.id.slice(0, 8)}`}>
                          Execution #{execution.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground">{execution.totalTests} tests</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {execution.passedTests}
                      </span>
                      <span className="flex items-center gap-1 text-red-500 dark:text-red-400 font-medium">
                        <XCircle className="h-3.5 w-3.5" />
                        {execution.failedTests}
                      </span>
                    </div>
                  </div>
                ))}
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
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
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
                    <StatusBadge status={agent.status as any} showIcon={false} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Bottom Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex items-center gap-4 p-5 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 hover-elevate">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {passedExecutions}
            </p>
            <p className="text-sm text-muted-foreground font-medium">Passed Executions</p>
          </div>
        </div>

        <div className="flex items-center gap-4 p-5 rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/10 to-red-500/5 hover-elevate">
          <div className="h-12 w-12 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
              {failedExecutions}
            </p>
            <p className="text-sm text-muted-foreground font-medium">Failed Executions</p>
          </div>
        </div>

        <div className="flex items-center gap-4 p-5 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-500/5 hover-elevate">
          <div className="h-12 w-12 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
            <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
              {runningExecutions}
            </p>
            <p className="text-sm text-muted-foreground font-medium">Running Now</p>
          </div>
        </div>
      </div>
    </div>
  );
}
