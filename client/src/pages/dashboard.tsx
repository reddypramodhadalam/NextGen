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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import type { TestSuite, TestCase, TestExecution, TestAgent } from "@shared/schema";

export default function Dashboard() {
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
  const passRate = executions.length > 0 
    ? Math.round((passedExecutions / executions.length) * 100) 
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your test automation platform
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/generator">
            <Button data-testid="button-quick-generate">
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Tests
            </Button>
          </Link>
          <Link href="/executions">
            <Button variant="outline" data-testid="button-run-tests">
              <Play className="h-4 w-4 mr-2" />
              Run Tests
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Test Suites"
          value={suites.length}
          description="Total test suites"
          icon={FolderOpen}
        />
        <StatCard
          title="Test Cases"
          value={testCases.length}
          description={`${testCases.filter((t) => t.generatedByAI).length} AI-generated`}
          icon={TestTube2}
        />
        <StatCard
          title="Pass Rate"
          value={`${passRate}%`}
          description="Last 30 days"
          icon={TrendingUp}
          trend={passRate > 0 ? { value: 5, label: "vs last month" } : undefined}
        />
        <StatCard
          title="Active Agents"
          value={onlineAgents}
          description={`${agents.length} total agents`}
          icon={Bot}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-base font-semibold">Recent Executions</CardTitle>
            <Link href="/executions">
              <Button variant="ghost" size="sm" data-testid="link-view-all-executions">
                View all
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentExecutions.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No executions yet</p>
                <p className="text-sm">Run your first test to see results here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentExecutions.map((execution) => (
                  <div
                    key={execution.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate"
                    data-testid={`card-execution-${execution.id.slice(0, 8)}`}
                  >
                    <div className="flex items-center gap-3">
                      <StatusBadge status={execution.status as any} />
                      <div>
                        <p className="font-medium text-sm" data-testid={`text-execution-id-${execution.id.slice(0, 8)}`}>Execution #{execution.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">
                          {execution.totalTests} tests
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {execution.passedTests}
                      </span>
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-base font-semibold">Agent Status</CardTitle>
            <Link href="/agents">
              <Button variant="ghost" size="sm" data-testid="link-manage-agents">
                Manage
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No agents configured</p>
                <p className="text-sm">Set up agents to run automated tests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate"
                    data-testid={`card-agent-${agent.id.slice(0, 8)}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-2.5 w-2.5 rounded-full ${
                        agent.status === "online" 
                          ? "bg-emerald-500" 
                          : agent.status === "busy"
                          ? "bg-amber-500 animate-pulse-status"
                          : "bg-slate-400"
                      }`} />
                      <div>
                        <p className="font-medium text-sm" data-testid={`text-agent-name-${agent.id.slice(0, 8)}`}>{agent.name}</p>
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
          <CardTitle className="text-base font-semibold">Quick Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {passedExecutions}
                </p>
                <p className="text-sm text-muted-foreground">Passed Executions</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-lg bg-red-500/10">
              <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {failedExecutions}
                </p>
                <p className="text-sm text-muted-foreground">Failed Executions</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-lg bg-blue-500/10">
              <Clock className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {executions.filter((e) => e.status === "running").length}
                </p>
                <p className="text-sm text-muted-foreground">Running Now</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
