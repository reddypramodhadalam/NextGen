import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  StopCircle,
  RefreshCw,
  Eye,
  Globe,
} from "lucide-react";
import type { TestSuite, TestAgent, TestExecution } from "@shared/schema";

export default function Executions() {
  const { toast } = useToast();
  const [selectedSuite, setSelectedSuite] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("staging");
  const [selectedFramework, setSelectedFramework] = useState<string>("playwright");
  const [targetUrl, setTargetUrl] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: suites = [] } = useQuery<TestSuite[]>({
    queryKey: ["/api/test-suites"],
  });

  const { data: agents = [] } = useQuery<TestAgent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: executions = [], isLoading } = useQuery<TestExecution[]>({
    queryKey: ["/api/executions"],
  });

  const runMutation = useMutation({
    mutationFn: async (data: { suiteId: string; agentId: string; environment: string; targetUrl: string; framework: string }) => {
      const res = await apiRequest("POST", "/api/executions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
      toast({ title: "Execution Started", description: `Real browser tests are now running with ${selectedFramework.toUpperCase()}.` });
      setDialogOpen(false);
      setSelectedSuite("");
      setSelectedAgent("");
      setTargetUrl("");
      setSelectedFramework("playwright");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to start execution.", variant: "destructive" });
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/executions/${id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
      toast({ title: "Execution Cancelled", description: "Test execution has been cancelled." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to cancel execution.", variant: "destructive" });
    },
  });

  const handleRunTests = () => {
    if (!selectedSuite || !selectedAgent || !targetUrl) {
      toast({
        title: "Selection Required",
        description: "Please select a test suite, agent, and enter a target URL.",
        variant: "destructive",
      });
      return;
    }
    try {
      new URL(targetUrl);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL (e.g., https://example.com).",
        variant: "destructive",
      });
      return;
    }
    runMutation.mutate({
      suiteId: selectedSuite,
      agentId: selectedAgent,
      environment: selectedEnvironment,
      targetUrl,
      framework: selectedFramework,
    });
  };

  const onlineAgents = agents.filter((a) => a.status === "online");
  const runningExecutions = executions.filter((e) => e.status === "running");

  const formatDuration = (ms: number | null) => {
    if (!ms) return "-";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Play className="h-6 w-6 text-primary" />
            Test Executions
          </h1>
          <p className="text-muted-foreground">
            Run and monitor your automated tests
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-run-execution">
              <Play className="h-4 w-4 mr-2" />
              Run Tests
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start Test Execution</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="exec-url">Target URL</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="exec-url"
                    type="url"
                    placeholder="https://example.com"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="pl-9"
                    data-testid="input-target-url"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The URL where tests will be executed using real browser automation
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="exec-suite">Test Suite</Label>
                <Select value={selectedSuite} onValueChange={setSelectedSuite}>
                  <SelectTrigger id="exec-suite" data-testid="select-exec-suite">
                    <SelectValue placeholder="Select a suite..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suites.map((suite) => (
                      <SelectItem key={suite.id} value={suite.id}>
                        {suite.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="exec-agent">Agent</Label>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger id="exec-agent" data-testid="select-exec-agent">
                    <SelectValue placeholder="Select an agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {onlineAgents.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No online agents available
                      </div>
                    ) : (
                      onlineAgents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-emerald-500" />
                            {agent.name}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="exec-env">Environment</Label>
                <Select value={selectedEnvironment} onValueChange={setSelectedEnvironment}>
                  <SelectTrigger id="exec-env" data-testid="select-exec-env">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="exec-framework">Execution Framework</Label>
                <Select value={selectedFramework} onValueChange={setSelectedFramework}>
                  <SelectTrigger id="exec-framework" data-testid="select-exec-framework">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="playwright">Playwright</SelectItem>
                    <SelectItem value="puppeteer">Puppeteer</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose the browser automation framework to execute tests
                </p>
              </div>

              <Button
                onClick={handleRunTests}
                disabled={!selectedSuite || !selectedAgent || !targetUrl || runMutation.isPending}
                className="w-full"
                data-testid="button-confirm-run"
              >
                {runMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start Execution
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {runningExecutions.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Running Executions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {runningExecutions.map((execution) => {
              const progress = execution.totalTests
                ? Math.round(((execution.passedTests || 0) + (execution.failedTests || 0) + (execution.skippedTests || 0)) / execution.totalTests * 100)
                : 0;
              return (
                <div key={execution.id} className="p-4 rounded-lg bg-background border">
                  <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
                    <div>
                      <p className="font-medium">Execution #{execution.id.slice(0, 8)}</p>
                      <p className="text-sm text-muted-foreground capitalize">{execution.environment}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cancelMutation.mutate(execution.id)}
                      disabled={cancelMutation.isPending}
                      data-testid={`button-cancel-${execution.id}`}
                    >
                      <StopCircle className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                  <Progress value={progress} className="h-2 mb-2" />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{progress}% complete</span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {execution.passedTests || 0}
                      </span>
                      <span className="flex items-center gap-1 text-red-600">
                        <XCircle className="h-3.5 w-3.5" />
                        {execution.failedTests || 0}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {executions.length === 0 ? (
        <EmptyState
          icon={Play}
          title="No executions yet"
          description="Run your first test execution to see results and track progress."
          action={{ label: "Run Tests", onClick: () => setDialogOpen(true) }}
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Execution History</CardTitle>
              <CardDescription>All test executions and their results</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/executions"] })}
              data-testid="button-refresh-executions"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {executions.map((execution) => (
                <div
                  key={execution.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover-elevate gap-4 flex-wrap"
                >
                  <div className="flex items-center gap-4">
                    <StatusBadge status={execution.status as any} />
                    <div>
                      <p className="font-medium">Execution #{execution.id.slice(0, 8)}</p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {execution.framework || "playwright"} - {execution.environment} - {execution.totalTests} tests
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        {execution.passedTests || 0}
                      </span>
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <XCircle className="h-4 w-4" />
                        {execution.failedTests || 0}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {formatDuration(execution.duration)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`button-view-execution-${execution.id}`}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
