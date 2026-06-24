/**
 * Enterprise Compliance Dashboard
 * 
 * Features:
 * - Approval Workflows for PROD Execution
 * - Compliance Export (CSV/PDF)
 * - Flaky Test Detection
 * - Cost Forecasting
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Shield, 
  FileText, 
  AlertTriangle, 
  TrendingUp,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  RefreshCw,
  Filter,
  Calendar,
  DollarSign,
  Activity,
  BarChart3,
  ChevronRight,
  Bell,
  Lock,
  Unlock,
  Eye,
  FileDown
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface ApprovalRequest {
  requestId: string;
  executionId: string;
  testCaseIds: string[];
  environment: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  justification: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  requestedAt: string;
  respondedAt?: string;
  approverName?: string;
}

interface FlakyTest {
  testCaseId: string;
  testCaseTitle: string;
  stability: "STABLE" | "FLAKY" | "UNSTABLE" | "UNKNOWN";
  flakinessScore: number;
  pattern: string;
  recommendation: string;
  quarantined: boolean;
}

interface CostForecast {
  environment: string;
  forecast: {
    expectedCost: number;
    lowEstimate: number;
    highEstimate: number;
    confidence: number;
  };
  budget: {
    allocated: number;
    used: number;
    remaining: number;
    riskLevel: "SAFE" | "WARNING" | "CRITICAL";
    daysUntilExhausted?: number;
  };
  historicalData: {
    dailyAverage: number;
    weeklyAverage: number;
    trend: string;
  };
  alerts: Array<{
    alertId: string;
    type: string;
    message: string;
    severity: string;
  }>;
}

interface ComplianceDashboard {
  summary: {
    pendingApprovals: number;
    approvalCompliance: number;
    flakyTestCount: number;
    quarantinedTests: number;
    activeAlerts: number;
    last7DaysCost: number;
  };
  approvals: {
    stats: {
      totalRequests: number;
      pending: number;
      approved: number;
      rejected: number;
    };
    pending: ApprovalRequest[];
  };
  flakyTests: {
    stats: {
      totalAnalyzed: number;
      stable: number;
      flaky: number;
      unstable: number;
      quarantined: number;
    };
    topFlaky: FlakyTest[];
  };
  costs: {
    stats: {
      totalCostAllTime: number;
      last7Days: number;
      last30Days: number;
    };
    alerts: Array<{ alertId: string; message: string; severity: string }>;
  };
}

// ============================================
// COMPONENTS
// ============================================

// Approval Card Component
function ApprovalCard({ request, onApprove, onReject }: { 
  request: ApprovalRequest; 
  onApprove: (id: string, comment: string) => void;
  onReject: (id: string, reason: string) => void;
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [action, setAction] = useState<"approve" | "reject">("approve");
  const [input, setInput] = useState("");

  const riskColors = {
    LOW: "bg-green-100 text-green-800",
    MEDIUM: "bg-yellow-100 text-yellow-800",
    HIGH: "bg-orange-100 text-orange-800",
    CRITICAL: "bg-red-100 text-red-800",
  };

  const handleSubmit = () => {
    if (action === "approve") {
      onApprove(request.requestId, input);
    } else {
      onReject(request.requestId, input);
    }
    setShowDialog(false);
    setInput("");
  };

  return (
    <>
      <Card className="border-l-4 border-l-orange-500">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-orange-500" />
                <span className="font-medium">{request.environment} Execution</span>
                <Badge className={riskColors[request.riskLevel]}>
                  {request.riskLevel} Risk
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Requested by {request.requesterName}
              </p>
              <p className="text-sm">{request.justification}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{request.testCaseIds.length} test cases</span>
                <span>•</span>
                <span>{new Date(request.requestedAt).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="outline"
                className="text-green-600 border-green-600 hover:bg-green-50"
                onClick={() => { setAction("approve"); setShowDialog(true); }}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                className="text-red-600 border-red-600 hover:bg-red-50"
                onClick={() => { setAction("reject"); setShowDialog(true); }}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "approve" ? "Approve Execution" : "Reject Execution"}
            </DialogTitle>
            <DialogDescription>
              {action === "approve" 
                ? "Add an optional comment for this approval."
                : "Please provide a reason for rejection."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{action === "approve" ? "Comment (optional)" : "Reason"}</Label>
              <Textarea 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={action === "approve" ? "Optional comment..." : "Reason for rejection..."}
                required={action === "reject"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              className={action === "approve" ? "bg-green-600" : "bg-red-600"}
              disabled={action === "reject" && !input.trim()}
            >
              {action === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Flaky Test Card Component
function FlakyTestCard({ test, onQuarantine, onUnquarantine }: {
  test: FlakyTest;
  onQuarantine: (id: string) => void;
  onUnquarantine: (id: string) => void;
}) {
  const stabilityIcons = {
    STABLE: { icon: "🟢", color: "text-green-600" },
    FLAKY: { icon: "🟡", color: "text-yellow-600" },
    UNSTABLE: { icon: "🔴", color: "text-red-600" },
    UNKNOWN: { icon: "⚪", color: "text-gray-600" },
  };

  const { icon, color } = stabilityIcons[test.stability];

  return (
    <Card className={cn(
      "transition-all",
      test.quarantined && "bg-gray-50 border-dashed"
    )}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{icon}</span>
              <span className={cn("font-medium", color)}>{test.stability}</span>
              {test.quarantined && (
                <Badge variant="outline" className="text-orange-600">
                  Quarantined
                </Badge>
              )}
            </div>
            <p className="font-medium">{test.testCaseTitle}</p>
            <p className="text-sm text-muted-foreground">{test.testCaseId}</p>
            <div className="flex items-center gap-2">
              <span className="text-sm">Flakiness Score:</span>
              <Progress value={test.flakinessScore} className="w-24 h-2" />
              <span className="text-sm font-medium">{test.flakinessScore}%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Pattern: {test.pattern.replace(/_/g, " ")}
            </p>
            <p className="text-xs text-blue-600">{test.recommendation}</p>
          </div>
          <div>
            {test.quarantined ? (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onUnquarantine(test.testCaseId)}
              >
                <Unlock className="h-4 w-4 mr-1" />
                Unquarantine
              </Button>
            ) : (
              <Button 
                size="sm" 
                variant="outline"
                className="text-orange-600 border-orange-600"
                onClick={() => onQuarantine(test.testCaseId)}
              >
                <Lock className="h-4 w-4 mr-1" />
                Quarantine
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Cost Forecast Card Component
function CostForecastCard({ forecast }: { forecast: CostForecast }) {
  const riskColors = {
    SAFE: "text-green-600",
    WARNING: "text-yellow-600",
    CRITICAL: "text-red-600",
  };

  const usagePercent = Math.round((forecast.budget.used / forecast.budget.allocated) * 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{forecast.environment}</CardTitle>
          <Badge className={cn(
            forecast.budget.riskLevel === "SAFE" && "bg-green-100 text-green-800",
            forecast.budget.riskLevel === "WARNING" && "bg-yellow-100 text-yellow-800",
            forecast.budget.riskLevel === "CRITICAL" && "bg-red-100 text-red-800",
          )}>
            {forecast.budget.riskLevel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Budget Usage</span>
            <span className={riskColors[forecast.budget.riskLevel]}>
              {usagePercent}%
            </span>
          </div>
          <Progress 
            value={usagePercent} 
            className={cn(
              "h-2",
              forecast.budget.riskLevel === "CRITICAL" && "[&>div]:bg-red-500",
              forecast.budget.riskLevel === "WARNING" && "[&>div]:bg-yellow-500",
            )}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{forecast.budget.used} used</span>
            <span>{forecast.budget.remaining} remaining</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">7-Day Forecast</p>
            <p className="font-medium">{forecast.forecast.expectedCost} units</p>
            <p className="text-xs text-muted-foreground">
              ({forecast.forecast.confidence}% confidence)
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Daily Average</p>
            <p className="font-medium">{forecast.historicalData.dailyAverage} units</p>
            <p className="text-xs text-muted-foreground">
              Trend: {forecast.historicalData.trend}
            </p>
          </div>
        </div>

        {forecast.budget.daysUntilExhausted && forecast.budget.daysUntilExhausted < 7 && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
            <AlertTriangle className="h-4 w-4" />
            <span>Budget risk in {forecast.budget.daysUntilExhausted} days</span>
          </div>
        )}

        {forecast.alerts.length > 0 && (
          <div className="space-y-1">
            {forecast.alerts.slice(0, 2).map((alert, i) => (
              <div 
                key={i}
                className={cn(
                  "text-xs p-2 rounded flex items-center gap-2",
                  alert.severity === "CRITICAL" && "bg-red-50 text-red-600",
                  alert.severity === "WARNING" && "bg-yellow-50 text-yellow-600",
                )}
              >
                <Bell className="h-3 w-3" />
                {alert.message}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function CompliancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportType, setExportType] = useState<string>("audit");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  // Fetch compliance dashboard
  const { data: dashboard, isLoading, refetch } = useQuery<ComplianceDashboard>({
    queryKey: ["/api/compliance/dashboard"],
  });

  // Fetch cost forecasts
  const { data: costDashboard } = useQuery({
    queryKey: ["/api/compliance/cost/dashboard"],
  });

  // Fetch all flaky tests
  const { data: flakyTests } = useQuery({
    queryKey: ["/api/compliance/flaky/tests"],
  });

  // Mutations
  const approveMutation = useMutation({
    mutationFn: async ({ requestId, comment }: { requestId: string; comment: string }) => {
      const res = await fetch(`/api/compliance/approval/${requestId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) throw new Error("Failed to approve");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Execution Approved", description: "The execution request has been approved." });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/dashboard"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const res = await fetch(`/api/compliance/approval/${requestId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed to reject");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "❌ Execution Rejected", description: "The execution request has been rejected." });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/dashboard"] });
    },
  });

  const quarantineMutation = useMutation({
    mutationFn: async (testCaseId: string) => {
      const res = await fetch(`/api/compliance/flaky/quarantine/${testCaseId}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to quarantine");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test Quarantined", description: "The test has been quarantined and will be excluded from CI." });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/flaky/tests"] });
    },
  });

  const unquarantineMutation = useMutation({
    mutationFn: async (testCaseId: string) => {
      const res = await fetch(`/api/compliance/flaky/unquarantine/${testCaseId}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to unquarantine");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test Unquarantined", description: "The test has been restored and will run in CI." });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/flaky/tests"] });
    },
  });

  const handleExport = async () => {
    try {
      const endpoint = exportType === "audit" 
        ? "/api/compliance/export/audit-csv"
        : exportType === "executions"
        ? "/api/compliance/export/executions-csv"
        : "/api/compliance/export/approvals-csv";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          dateRange: dateRange.start && dateRange.end ? dateRange : undefined 
        }),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportType}-export-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({ title: "Export Complete", description: "Your CSV file has been downloaded." });
      setExportDialogOpen(false);
    } catch (error) {
      toast({ title: "Export Failed", description: "Failed to generate export.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="h-8 w-8 text-blue-600" />
            Enterprise Compliance
          </h1>
          <p className="text-muted-foreground mt-1">
            Approval workflows, compliance exports, flaky detection, and cost forecasting
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setExportDialogOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            Export Reports
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={cn(
          "border-l-4",
          dashboard?.summary.pendingApprovals ? "border-l-orange-500" : "border-l-green-500"
        )}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Approvals</p>
                <p className="text-2xl font-bold">{dashboard?.summary.pendingApprovals || 0}</p>
              </div>
              <Clock className={cn(
                "h-8 w-8",
                dashboard?.summary.pendingApprovals ? "text-orange-500" : "text-green-500"
              )} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approval Compliance</p>
                <p className="text-2xl font-bold">{dashboard?.summary.approvalCompliance || 100}%</p>
              </div>
              <CheckCircle className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className={cn(
          "border-l-4",
          (dashboard?.summary.flakyTestCount || 0) > 5 ? "border-l-yellow-500" : "border-l-green-500"
        )}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Flaky Tests</p>
                <p className="text-2xl font-bold">
                  {dashboard?.summary.flakyTestCount || 0}
                  <span className="text-sm text-muted-foreground ml-2">
                    ({dashboard?.summary.quarantinedTests || 0} quarantined)
                  </span>
                </p>
              </div>
              <AlertTriangle className={cn(
                "h-8 w-8",
                (dashboard?.summary.flakyTestCount || 0) > 5 ? "text-yellow-500" : "text-green-500"
              )} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">7-Day Cost</p>
                <p className="text-2xl font-bold">
                  {dashboard?.summary.last7DaysCost || 0}
                  <span className="text-sm text-muted-foreground ml-1">units</span>
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="approvals" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Approvals
            {(dashboard?.summary.pendingApprovals || 0) > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {dashboard?.summary.pendingApprovals}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="flaky" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Flaky Tests
          </TabsTrigger>
          <TabsTrigger value="costs" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Cost Forecast
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pending Approvals Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Pending Approvals
                </CardTitle>
                <CardDescription>
                  Production execution requests awaiting review
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(dashboard?.approvals.pending.length || 0) > 0 ? (
                  <div className="space-y-4">
                    {dashboard?.approvals.pending.slice(0, 3).map((req) => (
                      <div key={req.requestId} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                        <div>
                          <p className="font-medium">{req.environment} Execution</p>
                          <p className="text-sm text-muted-foreground">
                            {req.requesterName} • {req.testCaseIds.length} tests
                          </p>
                        </div>
                        <Button size="sm" onClick={() => setActiveTab("approvals")}>
                          Review <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mb-2 text-green-500" />
                    <p>No pending approvals</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Flaky Tests Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Top Flaky Tests
                </CardTitle>
                <CardDescription>
                  Tests with highest flakiness scores
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(dashboard?.flakyTests.topFlaky.length || 0) > 0 ? (
                  <div className="space-y-3">
                    {dashboard?.flakyTests.topFlaky.slice(0, 4).map((test) => (
                      <div key={test.testCaseId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>
                            {test.stability === "STABLE" ? "🟢" : 
                             test.stability === "FLAKY" ? "🟡" : "🔴"}
                          </span>
                          <span className="text-sm truncate max-w-[200px]">
                            {test.testCaseTitle}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress value={test.flakinessScore} className="w-16 h-2" />
                          <span className="text-sm font-medium w-10">
                            {test.flakinessScore}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mb-2 text-green-500" />
                    <p>No flaky tests detected</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Cost Alerts */}
          {(dashboard?.costs.alerts.length || 0) > 0 && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-800">
                  <Bell className="h-5 w-5" />
                  Active Cost Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dashboard?.costs.alerts.map((alert, i) => (
                    <div 
                      key={i}
                      className={cn(
                        "p-3 rounded-lg flex items-center gap-3",
                        alert.severity === "CRITICAL" && "bg-red-100 text-red-800",
                        alert.severity === "WARNING" && "bg-yellow-100 text-yellow-800",
                      )}
                    >
                      <AlertTriangle className="h-5 w-5" />
                      <span>{alert.message}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Approvals Tab */}
        <TabsContent value="approvals" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Pending Approval Requests</h2>
            <Badge variant="outline">
              {dashboard?.approvals.stats.pending || 0} pending
            </Badge>
          </div>

          {(dashboard?.approvals.pending.length || 0) > 0 ? (
            <div className="space-y-4">
              {dashboard?.approvals.pending.map((req) => (
                <ApprovalCard
                  key={req.requestId}
                  request={req}
                  onApprove={(id, comment) => approveMutation.mutate({ requestId: id, comment })}
                  onReject={(id, reason) => rejectMutation.mutate({ requestId: id, reason })}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                <h3 className="text-lg font-medium">All Caught Up!</h3>
                <p className="text-muted-foreground">No pending approval requests</p>
              </CardContent>
            </Card>
          )}

          {/* Approval Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Approval Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{dashboard?.approvals.stats.totalRequests || 0}</p>
                  <p className="text-sm text-muted-foreground">Total Requests</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{dashboard?.approvals.stats.approved || 0}</p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{dashboard?.approvals.stats.rejected || 0}</p>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-600">{dashboard?.approvals.stats.pending || 0}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Flaky Tests Tab */}
        <TabsContent value="flaky" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Flaky Test Detection</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span>🟢 Stable</span>
                <span>🟡 Flaky</span>
                <span>🔴 Unstable</span>
              </div>
            </div>
          </div>

          {/* Flaky Stats */}
          <div className="grid grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold">{dashboard?.flakyTests.stats.totalAnalyzed || 0}</p>
                <p className="text-sm text-muted-foreground">Analyzed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-green-600">{dashboard?.flakyTests.stats.stable || 0}</p>
                <p className="text-sm text-muted-foreground">🟢 Stable</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-yellow-600">{dashboard?.flakyTests.stats.flaky || 0}</p>
                <p className="text-sm text-muted-foreground">🟡 Flaky</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-red-600">{dashboard?.flakyTests.stats.unstable || 0}</p>
                <p className="text-sm text-muted-foreground">🔴 Unstable</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-orange-600">{dashboard?.flakyTests.stats.quarantined || 0}</p>
                <p className="text-sm text-muted-foreground">🔒 Quarantined</p>
              </CardContent>
            </Card>
          </div>

          {/* Flaky Test List */}
          {(flakyTests as any)?.tests?.length > 0 ? (
            <div className="space-y-4">
              {(flakyTests as any).tests.map((test: FlakyTest) => (
                <FlakyTestCard
                  key={test.testCaseId}
                  test={test}
                  onQuarantine={(id) => quarantineMutation.mutate(id)}
                  onUnquarantine={(id) => unquarantineMutation.mutate(id)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                <h3 className="text-lg font-medium">No Flaky Tests Detected</h3>
                <p className="text-muted-foreground">All analyzed tests are stable</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Cost Forecast Tab */}
        <TabsContent value="costs" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Cost Forecasting</h2>
            <Badge variant="outline">
              Next 7 Days
            </Badge>
          </div>

          {/* Cost Forecast Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(costDashboard as any)?.forecasts?.map((f: any) => (
              <CostForecastCard 
                key={f.environment} 
                forecast={f.forecast} 
              />
            ))}
          </div>

          {/* Cost Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Cost Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{dashboard?.costs.stats.last7Days || 0}</p>
                  <p className="text-sm text-muted-foreground">Last 7 Days</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{dashboard?.costs.stats.last30Days || 0}</p>
                  <p className="text-sm text-muted-foreground">Last 30 Days</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{dashboard?.costs.stats.totalCostAllTime || 0}</p>
                  <p className="text-sm text-muted-foreground">All Time</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5" />
              Export Compliance Report
            </DialogTitle>
            <DialogDescription>
              Generate a compliance report in CSV format
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Export Type</Label>
              <Select value={exportType} onValueChange={setExportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audit">Audit Logs</SelectItem>
                  <SelectItem value="executions">Execution History</SelectItem>
                  <SelectItem value="approvals">Approval History</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date (optional)</Label>
                <Input 
                  type="date" 
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                />
              </div>
              <div>
                <Label>End Date (optional)</Label>
                <Input 
                  type="date" 
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
