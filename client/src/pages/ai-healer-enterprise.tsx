import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Zap, Loader2, AlertTriangle, CheckCircle2, XCircle, Wrench,
  Brain, TrendingUp, Shield, RefreshCw, ChevronRight, Sparkles,
  Clock, Target, Activity, BarChart3, Play, Pause, RotateCcw,
  GitCompare, Database, Eye, ThumbsUp, ThumbsDown, ArrowRight,
  Lock, Unlock, CircleDot, History, Lightbulb, Trophy, AlertCircle,
  ArrowUpRight, ArrowDownRight, Gauge, Boxes, Users
} from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type HealerState =
  | "IDLE" | "ANALYSING" | "FIX_PROPOSED" | "PRE_VALIDATION"
  | "PARTIAL_RERUN" | "FULL_RERUN" | "REGRESSION_CHECK"
  | "FIX_ACCEPTED" | "FIX_REJECTED" | "AWAITING_APPROVAL";

type HealingScope = "STEP_ONLY" | "TEST_CASE" | "GLOBAL";

interface ConfidenceFactors {
  selectorUniqueness: number;
  domStability: number;
  scopeSafety: number;
  historicalSuccess: number;
  partialRunSuccess: number;
}

interface HealSuggestion {
  id: string;
  stepIndex: number;
  originalStep: string;
  originalExpected: string;
  issue: string;
  category: string;
  confidence: number;
  confidenceFactors: ConfidenceFactors;
  regressionRisk: "LOW" | "MEDIUM" | "HIGH";
  suggestedStep?: string;
  suggestedExpected?: string;
  suggestedSelector?: string;
  alternativeSelectors?: string[];
  explanation: string;
  autoHealable: boolean;
  scope: HealingScope;
  affectedTargets: string[];
}

interface HealingSession {
  id: string;
  testCaseId: string;
  testCaseTitle: string;
  state: HealerState;
  stateHistory: Array<{ state: HealerState; timestamp: string; details?: string }>;
  proposedFixes: HealSuggestion[];
  selectedFix?: HealSuggestion;
  preValidationResult?: {
    selectorExists: boolean;
    selectorUnique: boolean;
    noConflictWithOtherSteps: boolean;
    stableAcrossReload: boolean;
    allPassed: boolean;
  };
  partialRerunResult?: {
    passed: boolean;
    stepsRun: number;
    stepsPassed: number;
    errors: string[];
  };
  fullRerunResult?: {
    passed: boolean;
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    newFailures: number;
    regressionDetected: boolean;
  };
  outcome: "pending" | "accepted" | "rejected" | "rolled_back";
  rejectionReason?: string;
  confidenceScore: number;
  startedAt: string;
  completedAt?: string;
  environment: string;
}

interface AlternativeFix {
  id: string;
  rank: number;
  selector: string;
  selectorType: string;
  confidence: number;
  reasoning: string;
  validationStatus: string;
  usageCount: number;
}

interface HealerKPIs {
  totalHealingSessions: number;
  successfulHeals: number;
  failedHeals: number;
  healSuccessRate: number;
  avgConfidenceScore: number;
  regressionsDetected: number;
  regressionsPrevented: number;
  rollbackCount: number;
  avgHealingTimeMs: number;
  totalLearningRecords: number;
  topSuccessfulPatterns: Array<{ pattern: string; successRate: number }>;
  autoHealRate: number;
  manualApprovalRate: number;
  fixReusabilityRate: number;
  categoryBreakdown: Array<{ category: string; count: number; successRate: number }>;
}

interface Dashboard {
  summary: {
    activeSessions: number;
    healSuccessRate: string;
    avgConfidence: string;
    regressionsBlocked: number;
    totalHeals: number;
  };
  kpis: HealerKPIs;
  activeSessions: HealingSession[];
  recentHistory: HealingSession[];
  learning: {
    totalRecords: number;
    topPatterns: Array<{ pattern: string; successRate: number }>;
    recommendations: string[];
  };
  pendingPromotions: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MACHINE VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

const STATE_CONFIG: Record<HealerState, {
  label: string;
  icon: any;
  color: string;
  bgColor: string;
  description: string;
}> = {
  IDLE: { label: "Idle", icon: CircleDot, color: "text-gray-500", bgColor: "bg-gray-500/10", description: "Ready to start" },
  ANALYSING: { label: "Analyzing", icon: Brain, color: "text-blue-500", bgColor: "bg-blue-500/10", description: "Identifying failures" },
  FIX_PROPOSED: { label: "Fix Proposed", icon: Lightbulb, color: "text-yellow-500", bgColor: "bg-yellow-500/10", description: "Fixes ready for review" },
  PRE_VALIDATION: { label: "Pre-Validation", icon: Shield, color: "text-purple-500", bgColor: "bg-purple-500/10", description: "Validating fix safety" },
  PARTIAL_RERUN: { label: "Partial Rerun", icon: Play, color: "text-cyan-500", bgColor: "bg-cyan-500/10", description: "Testing affected steps" },
  FULL_RERUN: { label: "Full Rerun", icon: RotateCcw, color: "text-indigo-500", bgColor: "bg-indigo-500/10", description: "Running complete test" },
  REGRESSION_CHECK: { label: "Regression Check", icon: GitCompare, color: "text-orange-500", bgColor: "bg-orange-500/10", description: "Comparing results" },
  FIX_ACCEPTED: { label: "Fix Accepted", icon: CheckCircle2, color: "text-green-500", bgColor: "bg-green-500/10", description: "Healing successful" },
  FIX_REJECTED: { label: "Fix Rejected", icon: XCircle, color: "text-red-500", bgColor: "bg-red-500/10", description: "Fix caused issues" },
  AWAITING_APPROVAL: { label: "Awaiting Approval", icon: Lock, color: "text-amber-500", bgColor: "bg-amber-500/10", description: "Needs manual approval" },
};

const STATE_ORDER: HealerState[] = [
  "IDLE", "ANALYSING", "FIX_PROPOSED", "PRE_VALIDATION",
  "PARTIAL_RERUN", "FULL_RERUN", "REGRESSION_CHECK"
];

function StateMachineProgress({ session }: { session: HealingSession }) {
  const currentIndex = STATE_ORDER.indexOf(session.state);
  const isFinal = session.state === "FIX_ACCEPTED" || session.state === "FIX_REJECTED";
  const isAwaiting = session.state === "AWAITING_APPROVAL";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {STATE_ORDER.slice(0, 7).map((state, idx) => {
          const config = STATE_CONFIG[state];
          const StateIcon = config.icon;
          const isActive = state === session.state;
          const isPast = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <div key={state} className="flex flex-col items-center gap-1">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                isPast ? "bg-green-500/20 border-green-500 text-green-500" :
                isCurrent ? `${config.bgColor} ${config.color} border-current animate-pulse` :
                "bg-muted border-muted-foreground/20 text-muted-foreground"
              )}>
                {isPast ? <CheckCircle2 className="h-5 w-5" /> : <StateIcon className="h-5 w-5" />}
              </div>
              <span className={cn(
                "text-xs font-medium",
                isPast || isCurrent ? config.color : "text-muted-foreground"
              )}>
                {config.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <Progress 
        value={isFinal ? 100 : isAwaiting ? 30 : (currentIndex / 6) * 100} 
        className={cn(
          "h-2",
          session.state === "FIX_ACCEPTED" ? "[&>div]:bg-green-500" :
          session.state === "FIX_REJECTED" ? "[&>div]:bg-red-500" :
          "[&>div]:bg-blue-500"
        )}
      />

      {/* Current state description */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg",
        STATE_CONFIG[session.state].bgColor
      )}>
        {(() => {
          const Icon = STATE_CONFIG[session.state].icon;
          return <Icon className={cn("h-4 w-4", STATE_CONFIG[session.state].color)} />;
        })()}
        <span className={cn("text-sm font-medium", STATE_CONFIG[session.state].color)}>
          {STATE_CONFIG[session.state].description}
        </span>
        {session.rejectionReason && (
          <span className="text-xs text-muted-foreground ml-2">
            — {session.rejectionReason}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIDENCE VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

function ConfidenceBreakdown({ factors, overall }: { factors: ConfidenceFactors; overall: number }) {
  const factorLabels: Record<keyof ConfidenceFactors, { label: string; weight: string }> = {
    selectorUniqueness: { label: "Selector Uniqueness", weight: "30%" },
    domStability: { label: "DOM Stability", weight: "25%" },
    scopeSafety: { label: "Scope Safety", weight: "20%" },
    historicalSuccess: { label: "Historical Success", weight: "15%" },
    partialRunSuccess: { label: "Partial Run", weight: "10%" },
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Overall Confidence</span>
        <div className="flex items-center gap-2">
          <Progress value={overall} className="w-32 h-2" />
          <span className={cn(
            "text-lg font-bold",
            overall >= 85 ? "text-green-500" :
            overall >= 70 ? "text-yellow-500" : "text-red-500"
          )}>
            {overall}%
          </span>
        </div>
      </div>
      <Separator />
      <div className="space-y-2">
        {(Object.entries(factors) as [keyof ConfidenceFactors, number][]).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {factorLabels[key].label}
              <span className="text-xs ml-1">({factorLabels[key].weight})</span>
            </span>
            <div className="flex items-center gap-2">
              <Progress value={value * 100} className="w-20 h-1.5" />
              <span className="w-8 text-right">{Math.round(value * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX SUGGESTION CARD
// ═══════════════════════════════════════════════════════════════════════════════

function FixSuggestionCard({
  suggestion,
  isSelected,
  onSelect,
  onViewAlternatives,
}: {
  suggestion: HealSuggestion;
  isSelected: boolean;
  onSelect: () => void;
  onViewAlternatives: () => void;
}) {
  const riskColors = {
    LOW: "bg-green-500/15 text-green-700 dark:text-green-400",
    MEDIUM: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    HIGH: "bg-red-500/15 text-red-700 dark:text-red-400",
  };

  return (
    <Card className={cn(
      "cursor-pointer transition-all hover:border-primary/50",
      isSelected && "border-primary ring-2 ring-primary/20"
    )} onClick={onSelect}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              Step {suggestion.stepIndex + 1}
            </Badge>
            <Badge className={cn("text-xs border-0", riskColors[suggestion.regressionRisk])}>
              {suggestion.regressionRisk} Risk
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {suggestion.scope}
            </Badge>
          </div>
          <div className={cn(
            "text-lg font-bold",
            suggestion.confidence >= 85 ? "text-green-500" :
            suggestion.confidence >= 70 ? "text-yellow-500" : "text-red-500"
          )}>
            {suggestion.confidence}%
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-destructive">{suggestion.issue}</p>
          <p className="text-xs text-muted-foreground mt-1">{suggestion.explanation}</p>
        </div>

        {suggestion.suggestedSelector && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Suggested Selector:</p>
            <code className="text-xs bg-muted px-2 py-1 rounded block font-mono text-primary">
              {suggestion.suggestedSelector}
            </code>
          </div>
        )}

        {suggestion.alternativeSelectors && suggestion.alternativeSelectors.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full text-xs"
            onClick={(e) => { e.stopPropagation(); onViewAlternatives(); }}
          >
            <Boxes className="h-3 w-3 mr-1" />
            View {suggestion.alternativeSelectors.length} Alternative Selectors
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function EnterpriseAIHealerPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedTestCase, setSelectedTestCase] = useState("");
  const [selectedEnvironment, setSelectedEnvironment] = useState("QA");
  const [activeSession, setActiveSession] = useState<HealingSession | null>(null);
  const [selectedFix, setSelectedFix] = useState<string | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [alternatives, setAlternatives] = useState<AlternativeFix[]>([]);

  // Fetch dashboard data
  const { data: dashboard, isLoading: dashboardLoading, refetch: refetchDashboard } = useQuery<Dashboard>({
    queryKey: ["/api/healer/enterprise/dashboard"],
    refetchInterval: 10000,
  });

  // Fetch test cases
  const { data: testCases = [] } = useQuery<any[]>({
    queryKey: ["/api/test-cases"],
  });

  // Start healing session
  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/healer/enterprise/session/start", {
        testCaseId: selectedTestCase,
        environment: selectedEnvironment,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveSession(data.session);
      setActiveTab("session");
      toast({ title: "Healing session started", description: data.nextAction });
      refetchDashboard();
    },
    onError: (error: any) => {
      toast({ title: "Failed to start session", description: error.message, variant: "destructive" });
    },
  });

  // Apply fix
  const applyFixMutation = useMutation({
    mutationFn: async () => {
      if (!activeSession || !selectedFix) return;
      const res = await apiRequest("POST", `/api/healer/enterprise/session/${activeSession.id}/apply`, {
        suggestionId: selectedFix,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveSession(data.session);
      if (data.success) {
        toast({ 
          title: "✅ Healing Successful", 
          description: "Fix applied with no regressions detected" 
        });
      } else {
        toast({ 
          title: "❌ Healing Rejected", 
          description: data.message,
          variant: "destructive"
        });
      }
      refetchDashboard();
    },
    onError: (error: any) => {
      toast({ title: "Failed to apply fix", description: error.message, variant: "destructive" });
    },
  });

  // Approve pending fix
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!activeSession) return;
      const res = await apiRequest("POST", `/api/healer/enterprise/session/${activeSession.id}/approve`, {});
      return res.json();
    },
    onSuccess: (data) => {
      setActiveSession(data.session);
      toast({ title: "Fix approved and applied" });
      refetchDashboard();
    },
  });

  // Fetch alternatives
  const fetchAlternatives = async (suggestionId: string) => {
    if (!activeSession) return;
    try {
      const res = await apiRequest("GET", `/api/healer/enterprise/session/${activeSession.id}/alternatives/${suggestionId}`);
      const data = await res.json();
      setAlternatives(data.alternatives);
      setShowAlternatives(true);
    } catch (error) {
      console.error("Failed to fetch alternatives:", error);
    }
  };

  if (dashboardLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Brain className="h-12 w-12 animate-pulse text-purple-500" />
          <p className="text-muted-foreground">Loading Enterprise AI Healer...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-header: enterprise tagline + refresh (page-level header lives in the unified AI Healer page) */}
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-gradient-to-r from-purple-500/5 to-pink-500/5 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4 text-purple-500" />
          State Machine Control • Automatic Rollback • Confidence Scoring
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchDashboard()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Active Sessions</span>
            </div>
            <div className="text-2xl font-bold">{dashboard?.summary.activeSessions || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Success Rate</span>
            </div>
            <div className="text-2xl font-bold text-green-500">{dashboard?.summary.healSuccessRate || "0%"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Gauge className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Avg Confidence</span>
            </div>
            <div className="text-2xl font-bold">{dashboard?.summary.avgConfidence || 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">Regressions Blocked</span>
            </div>
            <div className="text-2xl font-bold text-orange-500">{dashboard?.summary.regressionsBlocked || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Total Heals</span>
            </div>
            <div className="text-2xl font-bold">{dashboard?.summary.totalHeals || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="dashboard">
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="heal">
            <Wrench className="h-4 w-4 mr-2" />
            Start Healing
          </TabsTrigger>
          <TabsTrigger value="session" disabled={!activeSession}>
            <Activity className="h-4 w-4 mr-2" />
            Active Session
          </TabsTrigger>
          <TabsTrigger value="learning">
            <Sparkles className="h-4 w-4 mr-2" />
            Learning
          </TabsTrigger>
          <TabsTrigger value="kpis">
            <Target className="h-4 w-4 mr-2" />
            KPIs
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Active Sessions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-500" />
                  Active Healing Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {(dashboard?.activeSessions || []).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No active sessions</p>
                  ) : (
                    <div className="space-y-3">
                      {(dashboard?.activeSessions || []).map((session) => (
                        <div 
                          key={session.id} 
                          className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:border-primary"
                          onClick={() => { setActiveSession(session); setActiveTab("session"); }}
                        >
                          <div>
                            <div className="font-medium text-sm">{session.testCaseTitle}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {session.state}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {session.environment}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Recent History */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5 text-purple-500" />
                  Recent Healing History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {(dashboard?.recentHistory || []).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No history yet</p>
                  ) : (
                    <div className="space-y-3">
                      {(dashboard?.recentHistory || []).map((session) => (
                        <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="font-medium text-sm">{session.testCaseTitle}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge className={cn(
                                "text-xs",
                                session.outcome === "accepted" ? "bg-green-500/15 text-green-700" :
                                session.outcome === "rejected" ? "bg-red-500/15 text-red-700" :
                                "bg-yellow-500/15 text-yellow-700"
                              )}>
                                {session.outcome}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(session.startedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="text-lg font-bold">
                            {session.confidenceScore}%
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Learning Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Learning Insights & Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <h4 className="text-sm font-medium mb-2">Top Successful Patterns</h4>
                  <div className="space-y-2">
                    {(dashboard?.learning.topPatterns || []).map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                          {p.pattern}
                        </span>
                        <span className="text-green-500">{p.successRate.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <h4 className="text-sm font-medium mb-2">Recommendations</h4>
                  <div className="space-y-2">
                    {(dashboard?.learning.recommendations || []).map((rec, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                        {rec}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Start Healing Tab */}
        <TabsContent value="heal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Start New Healing Session</CardTitle>
              <CardDescription>
                Select a failing test case to begin the enterprise healing workflow
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Test Case</Label>
                  <Select value={selectedTestCase} onValueChange={setSelectedTestCase}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a test case" />
                    </SelectTrigger>
                    <SelectContent>
                      {testCases.map((tc) => (
                        <SelectItem key={tc.id} value={tc.id}>
                          {tc.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Environment</Label>
                  <Select value={selectedEnvironment} onValueChange={setSelectedEnvironment}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="QA">QA</SelectItem>
                      <SelectItem value="UAT">UAT</SelectItem>
                      <SelectItem value="STAGING">Staging</SelectItem>
                      <SelectItem value="PROD">Production</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => startSessionMutation.mutate()}
                disabled={!selectedTestCase || startSessionMutation.isPending}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
              >
                {startSessionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Brain className="h-4 w-4 mr-2" />
                )}
                Start Healing Session
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Active Session Tab */}
        <TabsContent value="session" className="space-y-4">
          {activeSession && (
            <>
              {/* State Machine Progress */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Healing: {activeSession.testCaseTitle}</span>
                    <Badge variant="outline">{activeSession.environment}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StateMachineProgress session={activeSession} />
                </CardContent>
              </Card>

              {/* Proposed Fixes */}
              {activeSession.state === "FIX_PROPOSED" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Proposed Fixes</CardTitle>
                    <CardDescription>
                      Select a fix to apply. The system will validate, run partial tests, 
                      and check for regressions before committing.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      {activeSession.proposedFixes.map((fix) => (
                        <FixSuggestionCard
                          key={fix.id}
                          suggestion={fix}
                          isSelected={selectedFix === fix.id}
                          onSelect={() => setSelectedFix(fix.id)}
                          onViewAlternatives={() => fetchAlternatives(fix.id)}
                        />
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <div className="text-sm text-muted-foreground">
                      {selectedFix ? "Fix selected. Click 'Apply Fix & Validate' to proceed." : "Select a fix above"}
                    </div>
                    <Button 
                      onClick={() => applyFixMutation.mutate()}
                      disabled={!selectedFix || applyFixMutation.isPending}
                      className="bg-gradient-to-r from-purple-500 to-pink-500"
                    >
                      {applyFixMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4 mr-2" />
                      )}
                      Apply Fix & Validate
                    </Button>
                  </CardFooter>
                </Card>
              )}

              {/* Awaiting Approval */}
              {activeSession.state === "AWAITING_APPROVAL" && (
                <Card className="border-amber-500">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-amber-500">
                      <Lock className="h-5 w-5" />
                      Manual Approval Required
                    </CardTitle>
                    <CardDescription>
                      This fix requires manual approval due to low confidence or production environment.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {activeSession.selectedFix && (
                      <ConfidenceBreakdown 
                        factors={activeSession.selectedFix.confidenceFactors}
                        overall={activeSession.selectedFix.confidence}
                      />
                    )}
                  </CardContent>
                  <CardFooter className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => {
                        // Cancel session
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                    <Button 
                      className="flex-1"
                      onClick={() => approveMutation.mutate()}
                      disabled={approveMutation.isPending}
                    >
                      {approveMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ThumbsUp className="h-4 w-4 mr-2" />
                      )}
                      Approve & Apply
                    </Button>
                  </CardFooter>
                </Card>
              )}

              {/* Validation Results */}
              {activeSession.preValidationResult && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Pre-Validation Results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-4">
                      {Object.entries(activeSession.preValidationResult).map(([key, value]) => {
                        if (key === "allPassed") return null;
                        return (
                          <div key={key} className="flex items-center gap-2">
                            {value ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className="text-sm capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Final Outcome */}
              {(activeSession.state === "FIX_ACCEPTED" || activeSession.state === "FIX_REJECTED") && (
                <Card className={cn(
                  "border-2",
                  activeSession.state === "FIX_ACCEPTED" ? "border-green-500 bg-green-500/5" : "border-red-500 bg-red-500/5"
                )}>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      {activeSession.state === "FIX_ACCEPTED" ? (
                        <CheckCircle2 className="h-12 w-12 text-green-500" />
                      ) : (
                        <XCircle className="h-12 w-12 text-red-500" />
                      )}
                      <div>
                        <h3 className={cn(
                          "text-xl font-bold",
                          activeSession.state === "FIX_ACCEPTED" ? "text-green-500" : "text-red-500"
                        )}>
                          {activeSession.state === "FIX_ACCEPTED" 
                            ? "✅ Healing Successful" 
                            : "❌ Healing Rejected"}
                        </h3>
                        <p className="text-muted-foreground">
                          {activeSession.state === "FIX_ACCEPTED"
                            ? "Fix applied with no regressions detected"
                            : activeSession.rejectionReason || "Fix caused regressions or failed validation"}
                        </p>
                      </div>
                    </div>
                    {activeSession.fullRerunResult && (
                      <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
                        <div>
                          <div className="text-sm text-muted-foreground">Total Steps</div>
                          <div className="text-lg font-bold">{activeSession.fullRerunResult.totalSteps}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Passed</div>
                          <div className="text-lg font-bold text-green-500">{activeSession.fullRerunResult.passedSteps}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Failed</div>
                          <div className="text-lg font-bold text-red-500">{activeSession.fullRerunResult.failedSteps}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">New Failures</div>
                          <div className={cn(
                            "text-lg font-bold",
                            activeSession.fullRerunResult.newFailures > 0 ? "text-red-500" : "text-green-500"
                          )}>
                            {activeSession.fullRerunResult.newFailures}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Learning Tab */}
        <TabsContent value="learning" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                Learning Engine
              </CardTitle>
              <CardDescription>
                The AI Healer learns from every healing session to improve future fixes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Learning data will appear here as you complete healing sessions</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* KPIs Tab */}
        <TabsContent value="kpis" className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Total Sessions</div>
                <div className="text-3xl font-bold">{dashboard?.kpis.totalHealingSessions || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Success Rate</div>
                <div className="text-3xl font-bold text-green-500">
                  {(dashboard?.kpis.healSuccessRate || 0).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Auto-Heal Rate</div>
                <div className="text-3xl font-bold text-blue-500">
                  {(dashboard?.kpis.autoHealRate || 0).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Regressions Prevented</div>
                <div className="text-3xl font-bold text-orange-500">
                  {dashboard?.kpis.regressionsPrevented || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Category Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(dashboard?.kpis.categoryBreakdown || []).map((cat) => (
                  <div key={cat.category} className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{cat.category.replace("_", " ")}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">{cat.count} fixes</span>
                      <div className="w-32">
                        <Progress value={cat.successRate} className="h-2" />
                      </div>
                      <span className={cn(
                        "text-sm font-bold w-12 text-right",
                        cat.successRate >= 80 ? "text-green-500" :
                        cat.successRate >= 50 ? "text-yellow-500" : "text-red-500"
                      )}>
                        {cat.successRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Alternatives Dialog */}
      <Dialog open={showAlternatives} onOpenChange={setShowAlternatives}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Alternative Selectors</DialogTitle>
            <DialogDescription>
              Ranked by stability and historical success rate
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {alternatives.map((alt) => (
                <div key={alt.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted font-bold">
                      #{alt.rank}
                    </div>
                    <div>
                      <code className="text-sm bg-muted px-2 py-0.5 rounded">{alt.selector}</code>
                      <p className="text-xs text-muted-foreground mt-1">{alt.reasoning}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      "text-lg font-bold",
                      alt.confidence >= 85 ? "text-green-500" :
                      alt.confidence >= 70 ? "text-yellow-500" : "text-red-500"
                    )}>
                      {alt.confidence}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {alt.usageCount} uses
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Backwards-compatible default export (the page is now embedded as the "Pro"
// panel inside the unified AI Healer page, but the standalone route still works).
export default EnterpriseAIHealerPage;

