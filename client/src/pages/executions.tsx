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
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Plus,
  Trash2,
  Key,
} from "lucide-react";
import type { TestSuite, TestAgent, TestExecution, TestDataParam, TestCase } from "@shared/schema";

// Helper to extract {{placeholder}} keys from test case steps
function extractPlaceholders(testCases: TestCase[]): string[] {
  const placeholders = new Set<string>();
  const regex = /\{\{([^}]+)\}\}/g;
  
  for (const tc of testCases) {
    const steps = (tc.steps as { step: string; expected: string }[]) || [];
    for (const step of steps) {
      let match;
      while ((match = regex.exec(step.step)) !== null) {
        placeholders.add(match[1].trim());
      }
      while ((match = regex.exec(step.expected)) !== null) {
        placeholders.add(match[1].trim());
      }
    }
  }
  
  return Array.from(placeholders);
}

// Helper to guess input type from placeholder key name
function guessInputType(key: string): "text" | "password" | "email" | "url" | "number" {
  const keyLower = key.toLowerCase();
  if (keyLower.includes("password") || keyLower.includes("secret") || keyLower.includes("pin")) return "password";
  if (keyLower.includes("email") || keyLower.includes("mail")) return "email";
  if (keyLower.includes("url") || keyLower.includes("link") || keyLower.includes("website")) return "url";
  if (keyLower.includes("count") || keyLower.includes("amount") || keyLower.includes("quantity") || keyLower.includes("number") || keyLower.includes("age") || keyLower.includes("price")) return "number";
  return "text";
}

export default function Executions() {
  const { toast } = useToast();
  const [selectedSuite, setSelectedSuite] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("staging");
  const [selectedFramework, setSelectedFramework] = useState<string>("playwright");
  const [targetUrl, setTargetUrl] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testData, setTestData] = useState<TestDataParam[]>([]);
  const [detectedPlaceholders, setDetectedPlaceholders] = useState<string[]>([]);
  const [viewingExecution, setViewingExecution] = useState<TestExecution | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  const addTestDataParam = () => {
    setTestData([...testData, { key: "", value: "", type: "text" }]);
  };

  const removeTestDataParam = (index: number) => {
    setTestData(testData.filter((_, i) => i !== index));
  };

  const updateTestDataParam = (index: number, field: keyof TestDataParam, value: string) => {
    const updated = [...testData];
    updated[index] = { ...updated[index], [field]: value };
    setTestData(updated);
  };

  const { data: suites = [] } = useQuery<TestSuite[]>({
    queryKey: ["/api/test-suites"],
  });

  const { data: agents = [] } = useQuery<TestAgent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: allTestCases = [] } = useQuery<TestCase[]>({
    queryKey: ["/api/test-cases"],
  });

  const { data: executions = [], isLoading } = useQuery<TestExecution[]>({
    queryKey: ["/api/executions"],
  });

  // Auto-detect placeholders when suite is selected
  useEffect(() => {
    if (selectedSuite) {
      const suiteTestCases = allTestCases.filter(tc => tc.suiteId?.toString() === selectedSuite);
      const placeholders = extractPlaceholders(suiteTestCases);
      setDetectedPlaceholders(placeholders);
      
      // Auto-populate test data with detected placeholders (only on suite change)
      if (placeholders.length > 0) {
        const autoParams: TestDataParam[] = placeholders.map(key => ({
          key,
          value: "",
          type: guessInputType(key),
        }));
        setTestData(autoParams);
      } else {
        setTestData([]);
      }
    } else {
      setDetectedPlaceholders([]);
      setTestData([]);
    }
  }, [selectedSuite, allTestCases]);

  // Fetch execution results when viewing
  const { data: executionResults = [] } = useQuery({
    queryKey: ["/api/executions", viewingExecution?.id, "results"],
    queryFn: async () => {
      if (!viewingExecution) return [];
      const res = await fetch(`/api/executions/${viewingExecution.id}/results`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!viewingExecution,
  });

  const runMutation = useMutation({
    mutationFn: async (data: { suiteId: string; agentId: string; environment: string; targetUrl: string; framework: string; testData?: TestDataParam[] }) => {
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
      setTestData([]);
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
    // Filter out empty test data entries
    const validTestData = testData.filter(d => d.key.trim() !== "");
    
    runMutation.mutate({
      suiteId: selectedSuite,
      agentId: selectedAgent,
      environment: selectedEnvironment,
      targetUrl,
      framework: selectedFramework,
      testData: validTestData.length > 0 ? validTestData : undefined,
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
                    <SelectItem value="selenium">Selenium</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose the browser automation framework to execute tests
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Test Data Parameters
                    {detectedPlaceholders.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {detectedPlaceholders.length} detected
                      </Badge>
                    )}
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTestDataParam}
                    data-testid="button-add-test-data"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                {detectedPlaceholders.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Placeholders detected in test cases. Please provide values for each parameter below.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Add test data parameters like login credentials. Use {"{{key}}"} in test steps to reference values.
                  </p>
                )}
                {testData.length > 0 && (
                  <ScrollArea className="max-h-40">
                    <div className="space-y-2">
                      {testData.map((param, index) => (
                        <div key={index} className="flex items-center gap-2" data-testid={`test-data-row-${index}`}>
                          <Input
                            placeholder="Key (e.g., username)"
                            value={param.key}
                            onChange={(e) => updateTestDataParam(index, "key", e.target.value)}
                            className="flex-1"
                            data-testid={`input-test-data-key-${index}`}
                          />
                          <Input
                            placeholder="Value"
                            type={param.type === "password" ? "password" : "text"}
                            value={param.value}
                            onChange={(e) => updateTestDataParam(index, "value", e.target.value)}
                            className="flex-1"
                            data-testid={`input-test-data-value-${index}`}
                          />
                          <Select
                            value={param.type}
                            onValueChange={(v) => updateTestDataParam(index, "type", v)}
                          >
                            <SelectTrigger className="w-24" data-testid={`select-test-data-type-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="password">Password</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="url">URL</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeTestDataParam(index)}
                            data-testid={`button-remove-test-data-${index}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
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
                      onClick={() => {
                        setViewingExecution(execution);
                        setViewDialogOpen(true);
                      }}
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

      {/* View Execution Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Execution Details
            </DialogTitle>
          </DialogHeader>
          
          {viewingExecution && (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Execution Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <StatusBadge status={viewingExecution.status || "pending"} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Framework</p>
                  <Badge variant="outline">{viewingExecution.framework || "playwright"}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-medium">{formatDuration(viewingExecution.duration)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Target URL</p>
                  <p className="font-medium text-sm truncate">{viewingExecution.targetUrl || "N/A"}</p>
                </div>
              </div>

              {/* Pass/Fail Stats */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="font-medium">{viewingExecution.passedTests || 0} Passed</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <span className="font-medium">{viewingExecution.failedTests || 0} Failed</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {new Date(viewingExecution.startedAt || "").toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Test Results */}
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium mb-2">Test Results</p>
                <ScrollArea className="h-[300px] border rounded-lg">
                  {executionResults.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      No test results available
                    </div>
                  ) : (
                    <div className="divide-y">
                      {executionResults.map((result: any) => (
                        <div key={result.id} className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">Test Case #{result.testCaseId}</span>
                            <Badge variant={result.status === "passed" ? "default" : "destructive"}>
                              {result.status}
                            </Badge>
                          </div>
                          {result.error && (
                            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 p-2 rounded mt-2">
                              {result.error}
                            </div>
                          )}
                          {result.logs && (
                            <details className="mt-2">
                              <summary className="text-sm text-muted-foreground cursor-pointer">
                                View Logs
                              </summary>
                              <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto whitespace-pre-wrap">
                                {typeof result.logs === "string" ? result.logs : JSON.stringify(result.logs, null, 2)}
                              </pre>
                            </details>
                          )}
                          {result.screenshot && (
                            <details className="mt-2">
                              <summary className="text-sm text-muted-foreground cursor-pointer">
                                View Screenshot
                              </summary>
                              <img 
                                src={result.screenshot} 
                                alt="Test screenshot" 
                                className="mt-2 rounded border max-w-full"
                              />
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
