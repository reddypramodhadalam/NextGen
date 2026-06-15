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
import { Switch } from "@/components/ui/switch";
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
  RotateCcw,
  Zap,
  FileText,
  Camera,
  Video,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
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

// Helper to format timestamp as ddMMMyyyy HH:MM:SS
function formatExecutionTimestamp(date: Date | string | null | undefined): string {
  if (!date) return "Unknown";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Unknown";
  
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(d.getDate()).padStart(2, "0");
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  
  return `${day}${month}${year} ${hours}:${minutes}:${seconds}`;
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
  const [selfHealing, setSelfHealing] = useState<boolean>(true);
  const [maxRetries, setMaxRetries] = useState<number>(3);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [executionToDelete, setExecutionToDelete] = useState<string | null>(null);
  const itemsPerPage = 10;

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

  // Sort executions by createdAt descending (latest first) and paginate
  const sortedExecutions = [...executions].sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
  
  const completedExecutions = sortedExecutions.filter(e => e.status !== "running" && e.status !== "pending");
  const totalPages = Math.ceil(completedExecutions.length / itemsPerPage);
  const paginatedExecutions = completedExecutions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Auto-detect placeholders when suite is selected
  useEffect(() => {
    if (selectedSuite) {
      const suiteTestCases = allTestCases.filter(tc => tc.suiteId?.toString() === selectedSuite);
      const placeholders = extractPlaceholders(suiteTestCases);
      const newPlaceholdersKey = placeholders.join(',');
      const currentPlaceholdersKey = detectedPlaceholders.join(',');
      
      // Only update if placeholders actually changed
      if (newPlaceholdersKey !== currentPlaceholdersKey) {
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
      }
    } else if (detectedPlaceholders.length > 0) {
      setDetectedPlaceholders([]);
      setTestData([]);
    }
  }, [selectedSuite, allTestCases.length]);

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
    mutationFn: async (data: { 
      suiteId: string; 
      agentId: string; 
      environment: string; 
      targetUrl: string; 
      framework: string; 
      testData?: TestDataParam[];
      selfHealing?: boolean;
      maxRetries?: number;
    }) => {
      const res = await apiRequest("POST", "/api/executions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
      const healingMsg = selfHealing ? " with AI self-healing enabled" : "";
      toast({ title: "Execution Started", description: `Real browser tests are now running with ${selectedFramework.toUpperCase()}${healingMsg}.` });
      setDialogOpen(false);
      setSelectedSuite("");
      setSelectedAgent("");
      setTargetUrl("");
      setSelectedFramework("playwright");
      setTestData([]);
      setSelfHealing(true);
      setMaxRetries(3);
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

  const rerunMutation = useMutation({
    mutationFn: async (execution: TestExecution) => {
      const res = await apiRequest("POST", "/api/executions", {
        suiteId: execution.suiteId,
        agentId: execution.agentId,
        environment: execution.environment,
        targetUrl: execution.targetUrl,
        framework: execution.framework || "playwright",
        testData: execution.testData || [],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
      toast({ title: "Rerun Started", description: "A new test execution has been started with the same settings." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to rerun execution.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (executionId: string) => {
      await apiRequest("DELETE", `/api/executions/${executionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
      toast({ title: "Success", description: "Execution deleted successfully." });
      setDeleteConfirmOpen(false);
      setExecutionToDelete(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete execution.", variant: "destructive" });
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
      selfHealing,
      maxRetries,
    });
  };

  const onlineAgents = agents.filter((a) => a.status === "online");
  const runningExecutions = sortedExecutions.filter((e) => e.status === "running" || e.status === "pending");

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
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">Loading executions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
            <Play className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Test Executions</h1>
            <p className="text-sm text-muted-foreground">Run and monitor your automated tests in real browsers</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-run-execution">
              <Play className="h-4 w-4 mr-2" />
              Run Tests
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Start Test Execution</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4 overflow-y-auto flex-1 pr-2">
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
                    {agents.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No agents available. Create one in the Agents page.
                      </div>
                    ) : (
                      agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${agent.status === "online" ? "bg-emerald-500" : "bg-slate-400"}`} />
                            {agent.name}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">All agents can run tests. Status only indicates Scheduled Monitoring.</p>
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
                  <ScrollArea className="max-h-60">
                    <div className="space-y-2 pr-3">
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

              {/* Self-Healing Option */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-500" />
                      AI Self-Healing
                    </Label>
                    <p className="text-xs text-muted-foreground">Automatically retry failed tests with AI-suggested fixes</p>
                  </div>
                  <Switch
                    checked={selfHealing}
                    onCheckedChange={setSelfHealing}
                    data-testid="switch-self-healing"
                  />
                </div>
                
                {selfHealing && (
                  <div className="flex items-center gap-3 pl-6">
                    <Label className="text-sm text-muted-foreground">Max retries:</Label>
                    <Select 
                      value={maxRetries.toString()} 
                      onValueChange={(v) => setMaxRetries(parseInt(v))}
                    >
                      <SelectTrigger className="w-20" data-testid="select-max-retries">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                        <SelectItem value="5">5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                      <p className="font-medium">
                        {suites.find(s => s.id.toString() === execution.suiteId)?.name || "Unknown Suite"} - {formatExecutionTimestamp(execution.createdAt)}
                      </p>
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
              {paginatedExecutions.map((execution) => (
                <div
                  key={execution.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover-elevate gap-4 flex-wrap"
                >
                  <div className="flex items-center gap-4">
                    <StatusBadge status={execution.status as any} />
                    <div>
                      <p className="font-medium">
                        {suites.find(s => s.id.toString() === execution.suiteId)?.name || "Unknown Suite"} - {formatExecutionTimestamp(execution.createdAt)}
                      </p>
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
                    {(execution.status === "completed" || execution.status === "failed") && (
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`button-rerun-execution-${execution.id}`}
                        onClick={() => rerunMutation.mutate(execution)}
                        disabled={rerunMutation.isPending}
                      >
                        {rerunMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4 mr-2" />
                        )}
                        Rerun
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setExecutionToDelete(execution.id);
                        setDeleteConfirmOpen(true);
                      }}
                      disabled={deleteMutation.isPending && deleteMutation.variables === execution.id}
                      data-testid={`button-delete-execution-${execution.id}`}
                    >
                      {deleteMutation.isPending && deleteMutation.variables === execution.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-destructive" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, completedExecutions.length)} of {completedExecutions.length} executions
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    data-testid="button-next-page"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this execution record? This action cannot be undone.
            </p>
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
              <p className="text-sm font-medium text-destructive">
                This will permanently remove the execution record and all associated data (results, screenshots, videos, logs).
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (executionToDelete) {
                  deleteMutation.mutate(executionToDelete);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Execution
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                  <StatusBadge status={(viewingExecution.status || "pending") as "passed" | "failed" | "running" | "pending"} />
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

              {/* Framework Capabilities Indicator */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-muted-foreground">Capabilities:</span>
                <Badge variant="outline" className={viewingExecution.framework === "playwright" ? "border-green-500 text-green-600" : "border-muted text-muted-foreground"}>
                  Video {viewingExecution.framework === "playwright" ? "✓" : "✗"}
                </Badge>
                <Badge variant="outline" className={["playwright", "puppeteer"].includes(viewingExecution.framework || "") ? "border-green-500 text-green-600" : "border-muted text-muted-foreground"}>
                  Network {["playwright", "puppeteer"].includes(viewingExecution.framework || "") ? "✓" : "✗"}
                </Badge>
                <Badge variant="outline" className="border-green-500 text-green-600">
                  Performance ✓
                </Badge>
                <Badge variant="outline" className="border-green-500 text-green-600">
                  Screenshots ✓
                </Badge>
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
                <ScrollArea className="h-[500px] border rounded-lg">
                  {executionResults.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      No test results available
                    </div>
                  ) : (
                    <div className="divide-y">
                      {executionResults.map((result: any) => (
                        <div key={result.id} className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">Test Case #{result.testCaseId?.slice(0, 8)}...</span>
                            <Badge variant={result.status === "passed" ? "default" : "destructive"}>
                              {result.status?.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mb-2">
                            Duration: {result.duration ? `${(result.duration / 1000).toFixed(1)}s` : "-"}
                          </div>
                          
                          {/* Error Message - shown prominently for failed tests */}
                          {result.errorMessage && (
                            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded mt-2 border border-red-200 dark:border-red-800">
                              <div className="font-medium mb-1 flex items-center gap-2">
                                <XCircle className="h-4 w-4" />
                                Error Details:
                              </div>
                              <pre className="whitespace-pre-wrap text-xs">{result.errorMessage}</pre>
                            </div>
                          )}
                          
                          {/* Step Screenshots - show all steps with their screenshots */}
                          {result.stepScreenshots && Array.isArray(result.stepScreenshots) && result.stepScreenshots.length > 0 && (
                            <details className="mt-3" open={result.status === "failed"}>
                              <summary className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                <Camera className="h-4 w-4" />
                                Step-by-Step Screenshots ({result.stepScreenshots.length} steps)
                              </summary>
                              <div className="mt-2 space-y-3">
                                {result.stepScreenshots.map((stepShot: any, idx: number) => {
                                  // Support both old and new field names
                                  const isPassed = stepShot.status === "passed" || stepShot.passed === true;
                                  const stepNum = stepShot.stepNumber || stepShot.stepIndex || (idx + 1);
                                  const stepName = stepShot.action || stepShot.stepName || `Step ${stepNum}`;
                                  
                                  return (
                                    <div key={idx} className={`border rounded-lg p-3 ${isPassed ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20' : 'border-red-500/50 bg-red-50/50 dark:bg-red-950/20'}`}>
                                      <div className="flex items-center gap-2 mb-2">
                                        <Badge variant={isPassed ? "default" : "destructive"} className="text-xs">
                                          Step {stepNum}
                                        </Badge>
                                        <span className={`text-xs font-medium ${isPassed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                          {isPassed ? '✓ PASS' : '✗ FAIL'}
                                        </span>
                                      </div>
                                      <p className="text-xs text-muted-foreground mb-2 truncate" title={stepName}>
                                        {stepName}
                                      </p>
                                      {stepShot.screenshot && (
                                        <img 
                                          src={stepShot.screenshot.startsWith('data:') ? stepShot.screenshot : `data:image/png;base64,${stepShot.screenshot}`}
                                          alt={`Step ${stepNum} screenshot`}
                                          className="rounded border max-w-full shadow-sm"
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          )}
                          
                          {/* Fallback: Single screenshot if no step screenshots (backward compatibility) */}
                          {result.screenshot && (!result.stepScreenshots || result.stepScreenshots.length === 0) && (
                            <details className="mt-3" open={result.status === "failed"}>
                              <summary className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                Screenshot at Failure
                              </summary>
                              <img 
                                src={result.screenshot.startsWith('data:') ? result.screenshot : `data:image/png;base64,${result.screenshot}`}
                                alt="Test screenshot" 
                                className="mt-2 rounded border max-w-full shadow-sm"
                              />
                            </details>
                          )}
                          
                          {/* Video Recording */}
                          {result.video && (
                            <details className="mt-3" data-testid={`details-video-${result.id}`}>
                              <summary className="text-sm font-medium cursor-pointer flex items-center gap-2" data-testid={`summary-video-${result.id}`}>
                                <Video className="h-4 w-4" />
                                Test Video Recording
                              </summary>
                              <div className="mt-2">
                                <video 
                                  controls 
                                  className="rounded border max-w-full"
                                  data-testid={`video-player-${result.id}`}
                                  src={result.video.startsWith('data:') ? result.video : `data:video/webm;base64,${result.video}`}
                                />
                              </div>
                            </details>
                          )}
                          
                          {/* Performance Metrics */}
                          {result.performanceMetrics && (
                            <details className="mt-3" data-testid={`details-performance-${result.id}`}>
                              <summary className="text-sm font-medium cursor-pointer flex items-center gap-2" data-testid={`summary-performance-${result.id}`}>
                                <BarChart3 className="h-4 w-4" />
                                Performance Metrics
                              </summary>
                              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3" data-testid={`metrics-grid-${result.id}`}>
                                {(result.performanceMetrics.pageLoadTime || result.performanceMetrics.loadTime) && (
                                  <div className="bg-muted p-2 rounded text-center" data-testid={`metric-loadtime-${result.id}`}>
                                    <p className="text-xs text-muted-foreground">Page Load</p>
                                    <p className="font-bold text-lg">{result.performanceMetrics.pageLoadTime || result.performanceMetrics.loadTime}ms</p>
                                  </div>
                                )}
                                {result.performanceMetrics.domContentLoaded && (
                                  <div className="bg-muted p-2 rounded text-center" data-testid={`metric-domloaded-${result.id}`}>
                                    <p className="text-xs text-muted-foreground">DOM Loaded</p>
                                    <p className="font-bold text-lg">{result.performanceMetrics.domContentLoaded}ms</p>
                                  </div>
                                )}
                                {result.performanceMetrics.firstPaint && (
                                  <div className="bg-muted p-2 rounded text-center" data-testid={`metric-fp-${result.id}`}>
                                    <p className="text-xs text-muted-foreground">First Paint</p>
                                    <p className="font-bold text-lg">{result.performanceMetrics.firstPaint}ms</p>
                                  </div>
                                )}
                                {result.performanceMetrics.firstContentfulPaint && (
                                  <div className="bg-muted p-2 rounded text-center" data-testid={`metric-fcp-${result.id}`}>
                                    <p className="text-xs text-muted-foreground">First Contentful Paint</p>
                                    <p className="font-bold text-lg">{Math.round(result.performanceMetrics.firstContentfulPaint)}ms</p>
                                  </div>
                                )}
                                {result.performanceMetrics.largestContentfulPaint && (
                                  <div className="bg-muted p-2 rounded text-center" data-testid={`metric-lcp-${result.id}`}>
                                    <p className="text-xs text-muted-foreground">Largest Contentful Paint</p>
                                    <p className="font-bold text-lg">{Math.round(result.performanceMetrics.largestContentfulPaint)}ms</p>
                                  </div>
                                )}
                                {result.performanceMetrics.timeToInteractive && (
                                  <div className="bg-muted p-2 rounded text-center" data-testid={`metric-tti-${result.id}`}>
                                    <p className="text-xs text-muted-foreground">Interactive</p>
                                    <p className="font-bold text-lg">{Math.round(result.performanceMetrics.timeToInteractive)}ms</p>
                                  </div>
                                )}
                                {result.performanceMetrics.memoryUsed && (
                                  <div className="bg-muted p-2 rounded text-center" data-testid={`metric-memory-${result.id}`}>
                                    <p className="text-xs text-muted-foreground">Memory Used</p>
                                    <p className="font-bold text-lg">{Math.round(result.performanceMetrics.memoryUsed / 1024 / 1024)}MB</p>
                                  </div>
                                )}
                                {result.performanceMetrics.resourceCount && (
                                  <div className="bg-muted p-2 rounded text-center" data-testid={`metric-resources-${result.id}`}>
                                    <p className="text-xs text-muted-foreground">Resources</p>
                                    <p className="font-bold text-lg">{result.performanceMetrics.resourceCount}</p>
                                  </div>
                                )}
                              </div>
                            </details>
                          )}
                          
                          {/* Network Logs */}
                          {result.networkLogs && Array.isArray(result.networkLogs) && result.networkLogs.length > 0 && (
                            <details className="mt-3" data-testid={`details-network-${result.id}`}>
                              <summary className="text-sm font-medium cursor-pointer flex items-center gap-2" data-testid={`summary-network-${result.id}`}>
                                <Globe className="h-4 w-4" />
                                Network Requests ({result.networkLogs.length})
                              </summary>
                              <div className="mt-2 max-h-64 overflow-y-auto border rounded">
                                <table className="w-full text-xs" data-testid={`table-network-${result.id}`}>
                                  <thead className="bg-muted sticky top-0">
                                    <tr>
                                      <th className="p-2 text-left">Method</th>
                                      <th className="p-2 text-left">URL</th>
                                      <th className="p-2 text-center">Status</th>
                                      <th className="p-2 text-right">Duration</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {result.networkLogs.map((entry: any, idx: number) => (
                                      <tr key={idx} className="border-t hover:bg-muted/50" data-testid={`row-network-${result.id}-${idx}`}>
                                        <td className="p-2 font-mono">{entry.method}</td>
                                        <td className="p-2 truncate max-w-xs" title={entry.url}>
                                          {entry.url.length > 50 ? `${entry.url.substring(0, 50)}...` : entry.url}
                                        </td>
                                        <td className={`p-2 text-center font-mono ${entry.status >= 400 ? 'text-red-500' : entry.status >= 300 ? 'text-yellow-500' : 'text-green-500'}`}>
                                          {entry.status || '-'}
                                        </td>
                                        <td className="p-2 text-right font-mono">{entry.duration ? `${entry.duration}ms` : '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          )}
                          
                          {/* Execution Logs */}
                          {result.logs && Array.isArray(result.logs) && result.logs.length > 0 && (
                            <details className="mt-3">
                              <summary className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Execution Log ({result.logs.length} entries)
                              </summary>
                              <div className="mt-2 bg-slate-900 dark:bg-slate-950 rounded p-3 overflow-x-auto max-h-96 overflow-y-auto">
                                {result.logs.map((log: string, idx: number) => (
                                  <div 
                                    key={idx} 
                                    className={`text-xs font-mono ${
                                      log.includes('✗ FAIL') || log.includes('Error:') || log.includes('failed')
                                        ? 'text-red-400' 
                                        : log.includes('✓ PASS') || log.includes('[Self-Healing]')
                                          ? 'text-green-400'
                                          : log.includes('===')
                                            ? 'text-blue-400 font-bold mt-2'
                                            : 'text-slate-300'
                                    }`}
                                  >
                                    {log}
                                  </div>
                                ))}
                              </div>
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
