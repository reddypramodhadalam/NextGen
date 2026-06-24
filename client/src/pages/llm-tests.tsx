import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Brain, 
  Play, 
  Plus, 
  FileText, 
  Shield, 
  GitCompare, 
  Database, 
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Clock,
  Target,
  Zap,
  RefreshCw,
  ChevronRight,
  BarChart3,
  Layers,
  Sparkles,
  Eye
} from "lucide-react";

// Types matching backend
type LLMTestType = "PROMPT_TEST" | "FUNCTIONAL_TEST" | "RAG_TEST" | "SAFETY_TEST" | "REGRESSION_TEST";
type TestStatus = "PENDING" | "PASSED" | "FAILED" | "ERROR";

interface EvaluationScore {
  metric: string;
  score: number;
  reasoning: string;
  passed: boolean;
}

interface LLMTestCase {
  id: string;
  name: string;
  testType: LLMTestType;
  prompt: string;
  systemPrompt?: string;
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface EvaluationResult {
  id: string;
  testCaseId: string;
  status: TestStatus;
  actualOutput?: string;
  scores: EvaluationScore[];
  overallScore: number;
  passedMetrics: number;
  totalMetrics: number;
  latencyMs: number;
  tokenCount?: number;
  error?: string;
  runAt: string;
}

interface TestRun {
  id: string;
  testIds: string[];
  status: "RUNNING" | "COMPLETED" | "FAILED";
  results: EvaluationResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageScore: number;
  totalLatencyMs: number;
  triggeredBy: string;
  startedAt: string;
  completedAt?: string;
}

interface Dashboard {
  totalTestCases: number;
  testsByType: Record<LLMTestType, number>;
  totalRuns: number;
  averagePassRate: number;
  averageScore: number;
  recentRuns: TestRun[];
  topFailingTests: { testId: string; failureCount: number; lastFailure: string }[];
  regressionAlerts: { testId: string; driftDetected: boolean; scoreChange: number }[];
}

const TEST_TYPE_INFO: Record<LLMTestType, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  PROMPT_TEST: { 
    label: "Prompt Test", 
    icon: <FileText className="h-4 w-4" />, 
    color: "bg-blue-500",
    description: "Schema & format validation for LLM outputs"
  },
  FUNCTIONAL_TEST: { 
    label: "Functional Test", 
    icon: <Target className="h-4 w-4" />, 
    color: "bg-green-500",
    description: "Semantic correctness via LLM-as-Judge"
  },
  RAG_TEST: { 
    label: "RAG Test", 
    icon: <Database className="h-4 w-4" />, 
    color: "bg-purple-500",
    description: "Context grounding, faithfulness & hallucination detection"
  },
  SAFETY_TEST: { 
    label: "Safety Test", 
    icon: <Shield className="h-4 w-4" />, 
    color: "bg-red-500",
    description: "Policy compliance, PII & bias detection"
  },
  REGRESSION_TEST: { 
    label: "Regression Test", 
    icon: <GitCompare className="h-4 w-4" />, 
    color: "bg-orange-500",
    description: "Golden comparison & drift detection"
  },
};

export default function LLMTestsPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [testCases, setTestCases] = useState<LLMTestCase[]>([]);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [selectedTestType, setSelectedTestType] = useState<LLMTestType>("PROMPT_TEST");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);
  const [ragEvalResult, setRagEvalResult] = useState<any>(null);

  // Fetch dashboard data
  useEffect(() => {
    fetchDashboard();
    fetchTestCases();
    fetchTestRuns();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await fetch("/api/llm-tests/dashboard");
      if (res.ok) {
        const data = await res.json();
        setDashboard(data);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTestCases = async () => {
    try {
      const res = await fetch("/api/llm-tests/cases");
      if (res.ok) {
        const data = await res.json();
        setTestCases(data.testCases || []);
      }
    } catch (error) {
      console.error("Failed to fetch test cases:", error);
    }
  };

  const fetchTestRuns = async () => {
    try {
      const res = await fetch("/api/llm-tests/runs");
      if (res.ok) {
        const data = await res.json();
        setTestRuns(data.runs || []);
      }
    } catch (error) {
      console.error("Failed to fetch test runs:", error);
    }
  };

  const runAllTests = async (type?: LLMTestType) => {
    setIsRunning(true);
    try {
      const res = await fetch("/api/llm-tests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(type ? { type } : { testIds: testCases.map(tc => tc.id) })
      });
      if (res.ok) {
        const run = await res.json();
        setTestRuns(prev => [run, ...prev]);
        fetchDashboard();
      }
    } catch (error) {
      console.error("Failed to run tests:", error);
    } finally {
      setIsRunning(false);
    }
  };

  const createTestCase = async (data: any) => {
    const endpoint = `/api/llm-tests/cases/${selectedTestType.toLowerCase().replace("_test", "")}`;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const newTest = await res.json();
        setTestCases(prev => [...prev, newTest]);
        setIsCreateDialogOpen(false);
        fetchDashboard();
      }
    } catch (error) {
      console.error("Failed to create test:", error);
    }
  };

  const evaluateRAG = async (data: any) => {
    try {
      const res = await fetch("/api/llm-tests/evaluate/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const result = await res.json();
        setRagEvalResult(result);
      }
    } catch (error) {
      console.error("Failed to evaluate RAG:", error);
    }
  };

  const getStatusBadge = (status: TestStatus) => {
    switch (status) {
      case "PASSED":
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Passed</Badge>;
      case "FAILED":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case "ERROR":
        return <Badge variant="outline" className="text-red-500"><AlertTriangle className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <Brain className="h-12 w-12 animate-pulse text-purple-500" />
          <p className="text-muted-foreground">Loading LLM Test Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">LLM Test Engine</h1>
            <p className="text-muted-foreground">5-Layer Evaluation Framework for AI/LLM Applications</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { fetchDashboard(); fetchTestCases(); fetchTestRuns(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => runAllTests()} disabled={isRunning || testCases.length === 0}>
            <Play className="h-4 w-4 mr-2" />
            {isRunning ? "Running..." : "Run All Tests"}
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                <Plus className="h-4 w-4 mr-2" />
                New Test
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <CreateTestDialog 
                testType={selectedTestType}
                setTestType={setSelectedTestType}
                onSubmit={createTestCase}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Test Type Cards */}
      <div className="grid grid-cols-5 gap-4">
        {(Object.entries(TEST_TYPE_INFO) as [LLMTestType, typeof TEST_TYPE_INFO[LLMTestType]][]).map(([type, info]) => {
          const count = dashboard?.testsByType[type] || 0;
          return (
            <Card 
              key={type} 
              className="cursor-pointer hover:border-purple-500 transition-colors"
              onClick={() => { setSelectedTestType(type); setActiveTab("tests"); }}
            >
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded ${info.color}`}>
                    {info.icon}
                  </div>
                  <span className="font-medium text-sm">{info.label}</span>
                </div>
                <div className="text-2xl font-bold">{count}</div>
                <p className="text-xs text-muted-foreground truncate">{info.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="tests">
            <Layers className="h-4 w-4 mr-2" />
            Test Cases
          </TabsTrigger>
          <TabsTrigger value="runs">
            <Activity className="h-4 w-4 mr-2" />
            Test Runs
          </TabsTrigger>
          <TabsTrigger value="rag-eval">
            <Sparkles className="h-4 w-4 mr-2" />
            RAG Evaluation
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Test Cases</CardDescription>
                <CardTitle className="text-3xl">{dashboard?.totalTestCases || 0}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Across all 5 test layers</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Runs</CardDescription>
                <CardTitle className="text-3xl">{dashboard?.totalRuns || 0}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Test executions performed</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Average Pass Rate</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  {((dashboard?.averagePassRate || 0) * 100).toFixed(1)}%
                  {(dashboard?.averagePassRate || 0) >= 0.8 ? (
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-500" />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={(dashboard?.averagePassRate || 0) * 100} className="h-2" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Average Score</CardDescription>
                <CardTitle className="text-3xl">{((dashboard?.averageScore || 0) * 100).toFixed(0)}%</CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={(dashboard?.averageScore || 0) * 100} className="h-2" />
              </CardContent>
            </Card>
          </div>

          {/* Recent Runs & Alerts */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Test Runs</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {(dashboard?.recentRuns || []).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No test runs yet</p>
                  ) : (
                    <div className="space-y-3">
                      {(dashboard?.recentRuns || []).map((run) => (
                        <div key={run.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="font-medium">{run.totalTests} tests</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(run.startedAt).toLocaleString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={run.status === "COMPLETED" ? "default" : "secondary"}>
                              {run.passedTests}/{run.totalTests} passed
                            </Badge>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => { setSelectedRun(run); setActiveTab("runs"); }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Regression Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {(dashboard?.regressionAlerts || []).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No regression alerts</p>
                  ) : (
                    <div className="space-y-3">
                      {(dashboard?.regressionAlerts || []).filter(a => a.driftDetected).map((alert, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 border border-yellow-500/50 rounded-lg bg-yellow-500/5">
                          <div>
                            <div className="font-medium text-sm">{alert.testId.slice(0, 8)}...</div>
                            <div className="text-xs text-muted-foreground">Drift detected</div>
                          </div>
                          <Badge variant="outline" className="text-yellow-600">
                            {alert.scoreChange > 0 ? "+" : ""}{(alert.scoreChange * 100).toFixed(1)}%
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Test Cases Tab */}
        <TabsContent value="tests" className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <Select value={selectedTestType} onValueChange={(v) => setSelectedTestType(v as LLMTestType)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEST_TYPE_INFO).map(([type, info]) => (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center gap-2">
                      {info.icon}
                      {info.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => runAllTests(selectedTestType)} disabled={isRunning}>
              <Play className="h-4 w-4 mr-2" />
              Run {TEST_TYPE_INFO[selectedTestType].label}s
            </Button>
          </div>

          <div className="grid gap-4">
            {testCases.filter(tc => tc.testType === selectedTestType).length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No {TEST_TYPE_INFO[selectedTestType].label}s yet</p>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Test
                  </Button>
                </CardContent>
              </Card>
            ) : (
              testCases.filter(tc => tc.testType === selectedTestType).map((testCase) => (
                <TestCaseCard key={testCase.id} testCase={testCase} onRun={() => runAllTests()} />
              ))
            )}
          </div>
        </TabsContent>

        {/* Test Runs Tab */}
        <TabsContent value="runs" className="space-y-4">
          {selectedRun ? (
            <TestRunDetail run={selectedRun} onBack={() => setSelectedRun(null)} />
          ) : (
            <div className="grid gap-4">
              {testRuns.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No test runs yet. Run some tests to see results.</p>
                  </CardContent>
                </Card>
              ) : (
                testRuns.map((run) => (
                  <Card key={run.id} className="cursor-pointer hover:border-purple-500" onClick={() => setSelectedRun(run)}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-full ${run.status === "COMPLETED" ? "bg-green-500/10" : run.status === "FAILED" ? "bg-red-500/10" : "bg-yellow-500/10"}`}>
                            {run.status === "COMPLETED" ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : run.status === "FAILED" ? (
                              <XCircle className="h-5 w-5 text-red-500" />
                            ) : (
                              <Clock className="h-5 w-5 text-yellow-500 animate-pulse" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium">Run {run.id.slice(0, 8)}</div>
                            <div className="text-sm text-muted-foreground">
                              {run.totalTests} tests • {new Date(run.startedAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-lg font-bold">{run.passedTests}/{run.totalTests}</div>
                            <div className="text-xs text-muted-foreground">passed</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">{(run.averageScore * 100).toFixed(0)}%</div>
                            <div className="text-xs text-muted-foreground">avg score</div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        {/* RAG Evaluation Tab */}
        <TabsContent value="rag-eval" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                RAG Quality Evaluation
              </CardTitle>
              <CardDescription>
                Evaluate the quality of Retrieval-Augmented Generation responses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RAGEvaluationForm onEvaluate={evaluateRAG} result={ragEvalResult} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Sub-components

function TestCaseCard({ testCase, onRun }: { testCase: LLMTestCase; onRun: () => void }) {
  const typeInfo = TEST_TYPE_INFO[testCase.testType];
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded ${typeInfo.color}`}>
              {typeInfo.icon}
            </div>
            <CardTitle className="text-lg">{testCase.name}</CardTitle>
          </div>
          <Badge variant="outline">{typeInfo.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-muted/50 rounded p-3 font-mono text-sm mb-3 max-h-24 overflow-hidden">
          {testCase.prompt.substring(0, 200)}...
        </div>
        <div className="text-xs text-muted-foreground">
          Created: {new Date(testCase.createdAt).toLocaleString()}
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button variant="outline" size="sm" onClick={onRun}>
          <Play className="h-3 w-3 mr-1" />
          Run
        </Button>
      </CardFooter>
    </Card>
  );
}

function TestRunDetail({ run, onBack }: { run: TestRun; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack}>
        ← Back to Runs
      </Button>
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Test Run {run.id.slice(0, 8)}</CardTitle>
            <Badge variant={run.status === "COMPLETED" ? "default" : "secondary"}>
              {run.status}
            </Badge>
          </div>
          <CardDescription>
            Triggered by {run.triggeredBy} on {new Date(run.startedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div>
              <div className="text-sm text-muted-foreground">Total Tests</div>
              <div className="text-2xl font-bold">{run.totalTests}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Passed</div>
              <div className="text-2xl font-bold text-green-500">{run.passedTests}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Failed</div>
              <div className="text-2xl font-bold text-red-500">{run.failedTests}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Avg Score</div>
              <div className="text-2xl font-bold">{(run.averageScore * 100).toFixed(0)}%</div>
            </div>
          </div>
          
          <Separator className="my-4" />
          
          <h4 className="font-medium mb-3">Results</h4>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {run.results.map((result) => (
                <div key={result.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm">{result.testCaseId.slice(0, 12)}...</span>
                    <Badge variant={result.status === "PASSED" ? "default" : "destructive"}>
                      {result.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Score: </span>
                      <span className="font-medium">{(result.overallScore * 100).toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Metrics: </span>
                      <span className="font-medium">{result.passedMetrics}/{result.totalMetrics}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Latency: </span>
                      <span className="font-medium">{result.latencyMs}ms</span>
                    </div>
                  </div>
                  {result.scores.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {result.scores.map((score, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          {score.passed ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-500" />
                          )}
                          <span className="font-medium">{score.metric}:</span>
                          <span>{(score.score * 100).toFixed(0)}%</span>
                          <span className="text-muted-foreground truncate flex-1">{score.reasoning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function CreateTestDialog({ 
  testType, 
  setTestType, 
  onSubmit 
}: { 
  testType: LLMTestType; 
  setTestType: (t: LLMTestType) => void;
  onSubmit: (data: any) => void;
}) {
  const [formData, setFormData] = useState<any>({});

  const handleSubmit = () => {
    onSubmit({ ...formData, name: formData.name || `${testType} ${Date.now()}` });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create LLM Test</DialogTitle>
        <DialogDescription>
          Create a new test case for your LLM application
        </DialogDescription>
      </DialogHeader>
      
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>Test Type</Label>
          <Select value={testType} onValueChange={(v) => setTestType(v as LLMTestType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TEST_TYPE_INFO).map(([type, info]) => (
                <SelectItem key={type} value={type}>
                  <div className="flex items-center gap-2">
                    {info.icon}
                    {info.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{TEST_TYPE_INFO[testType].description}</p>
        </div>

        <div className="space-y-2">
          <Label>Test Name</Label>
          <Input 
            placeholder="My LLM Test"
            value={formData.name || ""}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Prompt</Label>
          <Textarea 
            placeholder="Enter the prompt to test..."
            rows={4}
            value={formData.prompt || ""}
            onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
          />
        </div>

        {testType === "PROMPT_TEST" && (
          <>
            <div className="space-y-2">
              <Label>Expected Format</Label>
              <Select 
                value={formData.expectedFormat || "TEXT"}
                onValueChange={(v) => setFormData({ ...formData, expectedFormat: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">Text</SelectItem>
                  <SelectItem value="JSON">JSON</SelectItem>
                  <SelectItem value="MARKDOWN">Markdown</SelectItem>
                  <SelectItem value="CODE">Code</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Required Keywords (comma-separated)</Label>
              <Input 
                placeholder="keyword1, keyword2"
                value={formData.keywords || ""}
                onChange={(e) => setFormData({ ...formData, keywords: e.target.value.split(",").map((k: string) => k.trim()).filter(Boolean) })}
              />
            </div>
          </>
        )}

        {testType === "RAG_TEST" && (
          <>
            <div className="space-y-2">
              <Label>Question</Label>
              <Input 
                placeholder="What question should the RAG system answer?"
                value={formData.question || ""}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Contexts (one per line)</Label>
              <Textarea 
                placeholder="Context 1&#10;Context 2&#10;Context 3"
                rows={4}
                value={formData.contextsText || ""}
                onChange={(e) => setFormData({ ...formData, contextsText: e.target.value, contexts: e.target.value.split("\n").filter(Boolean) })}
              />
            </div>
          </>
        )}

        {testType === "SAFETY_TEST" && (
          <div className="space-y-2">
            <Label>Safety Checks</Label>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox 
                  checked={formData.checkPII || false}
                  onCheckedChange={(c) => setFormData({ ...formData, checkPII: c })}
                />
                <span className="text-sm">Check PII</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  checked={formData.checkToxicity || false}
                  onCheckedChange={(c) => setFormData({ ...formData, checkToxicity: c })}
                />
                <span className="text-sm">Check Toxicity</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  checked={formData.checkBias || false}
                  onCheckedChange={(c) => setFormData({ ...formData, checkBias: c })}
                />
                <span className="text-sm">Check Bias</span>
              </div>
            </div>
          </div>
        )}

        {testType === "REGRESSION_TEST" && (
          <div className="space-y-2">
            <Label>Golden Output (Expected)</Label>
            <Textarea 
              placeholder="The expected output to compare against..."
              rows={4}
              value={formData.goldenOutput || ""}
              onChange={(e) => setFormData({ ...formData, goldenOutput: e.target.value })}
            />
          </div>
        )}
      </div>

      <DialogFooter>
        <Button onClick={handleSubmit}>Create Test</Button>
      </DialogFooter>
    </>
  );
}

function RAGEvaluationForm({ onEvaluate, result }: { onEvaluate: (data: any) => void; result: any }) {
  const [question, setQuestion] = useState("");
  const [contexts, setContexts] = useState("");
  const [answer, setAnswer] = useState("");
  const [groundTruth, setGroundTruth] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleEvaluate = async () => {
    setIsLoading(true);
    await onEvaluate({
      question,
      retrievedContexts: contexts.split("\n").filter(Boolean),
      generatedAnswer: answer,
      groundTruth: groundTruth || undefined
    });
    setIsLoading(false);
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Question</Label>
          <Input 
            placeholder="What is the user asking?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>
        
        <div className="space-y-2">
          <Label>Retrieved Contexts (one per line)</Label>
          <Textarea 
            placeholder="Context chunk 1&#10;Context chunk 2&#10;Context chunk 3"
            rows={6}
            value={contexts}
            onChange={(e) => setContexts(e.target.value)}
          />
        </div>
        
        <div className="space-y-2">
          <Label>Generated Answer</Label>
          <Textarea 
            placeholder="The RAG system's response..."
            rows={4}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>
        
        <div className="space-y-2">
          <Label>Ground Truth (optional)</Label>
          <Input 
            placeholder="The correct answer for comparison"
            value={groundTruth}
            onChange={(e) => setGroundTruth(e.target.value)}
          />
        </div>
        
        <Button 
          onClick={handleEvaluate} 
          disabled={!question || !contexts || !answer || isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Zap className="h-4 w-4 mr-2 animate-pulse" />
              Evaluating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Evaluate RAG Quality
            </>
          )}
        </Button>
      </div>
      
      <div className="space-y-4">
        <h4 className="font-medium">Evaluation Results</h4>
        {result ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Overall Score</div>
                  <div className="text-3xl font-bold">{(result.overallScore * 100).toFixed(0)}%</div>
                  <Progress value={result.overallScore * 100} className="mt-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Verdict</div>
                  <div className="text-xl font-bold flex items-center gap-2">
                    {result.passed ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        Passed
                      </>
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-red-500" />
                        Failed
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Metric Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(result.scores || {}).map(([metric, score]: [string, any]) => (
                    <div key={metric} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{metric}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={score * 100} className="w-24 h-2" />
                        <span className="text-sm w-12 text-right">{(score * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            {result.issues && result.issues.length > 0 && (
              <Card className="border-yellow-500/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Issues Found
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {result.issues.map((issue: string, idx: number) => (
                      <li key={idx} className="text-muted-foreground">{issue}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Database className="h-12 w-12 mb-4 opacity-50" />
            <p>Enter RAG data and click evaluate to see results</p>
          </div>
        )}
      </div>
    </div>
  );
}
