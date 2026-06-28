import { useState } from "react";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { Checkbox } from "@/components/ui/checkbox";
  import { EmptyState } from "@/components/empty-state";
  import { useQuery } from "@tanstack/react-query";
  import { useToast } from "@/hooks/use-toast";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select";
  import {
    FileText,
    Download,
    TrendingUp,
    TrendingDown,
    CheckCircle2,
    XCircle,
    Clock,
    Calendar,
    Loader2,
    BarChart3,
    FileJson,
    FileCode,
    Trash2,
  } from "lucide-react";
  import type { TestReport, TestExecution, TestSuite } from "@shared/schema";
  import { useEffect } from "react";
  import { Bar } from "react-chartjs-2";
  import { Chart, BarElement, CategoryScale, LinearScale, Legend, Tooltip } from "chart.js";
  Chart.register(BarElement, CategoryScale, LinearScale, Legend, Tooltip);

  export default function Reports() {
    const { toast } = useToast();
    const [exportFormat, setExportFormat] = useState("html");

    const { data: reports = [], isLoading: reportsLoading } = useQuery<TestReport[]>({
      queryKey: ["/api/reports"],
    });

    // --- Predictive Failure Analysis, Test Optimization, Pass/Fail stats ---
  const [failureAnalysis, setFailureAnalysis] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [passFailStats, setPassFailStats] = useState<any[]>([]);

  // Selection + delete state for the analytics tables
  const [selectedFailures, setSelectedFailures] = useState<Set<string>>(new Set());
  const [selectedRecommendations, setSelectedRecommendations] = useState<Set<string>>(new Set());
  const [isDeletingFailures, setIsDeletingFailures] = useState(false);
  const [isDeletingRecommendations, setIsDeletingRecommendations] = useState(false);

  const loadAnalytics = () => {
    fetch("/api/reports/predictive-failure").then(r => r.json()).then(setFailureAnalysis);
    fetch("/api/reports/test-optimization").then(r => r.json()).then(setRecommendations);
    fetch("/api/reports/pass-fail-stats").then(r => r.json()).then(setPassFailStats);
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  // Generic helper to toggle a name within a selection Set
  const toggleSelection = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    name: string,
  ) => {
    setter(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const deleteAnalytics = async (testNames: string[]) => {
    const res = await fetch("/api/reports/analytics/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testNames }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Delete failed");
    }
    return res.json();
  };

  const handleDeleteFailures = async () => {
    const names = Array.from(selectedFailures);
    if (names.length === 0) return;
    setIsDeletingFailures(true);
    try {
      const { removed } = await deleteAnalytics(names);
      toast({ title: "Deleted", description: `Removed ${removed} record(s) for ${names.length} test(s).` });
      setSelectedFailures(new Set());
      loadAnalytics();
    } catch (err: any) {
      toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDeletingFailures(false);
    }
  };

  const handleDeleteRecommendations = async () => {
    const names = Array.from(selectedRecommendations);
    if (names.length === 0) return;
    setIsDeletingRecommendations(true);
    try {
      const { removed } = await deleteAnalytics(names);
      toast({ title: "Deleted", description: `Removed ${removed} record(s) for ${names.length} test(s).` });
      setSelectedRecommendations(new Set());
      loadAnalytics();
    } catch (err: any) {
      toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDeletingRecommendations(false);
    }
  };
    const { data: executions = [], isLoading: executionsLoading } = useQuery<TestExecution[]>({
      queryKey: ["/api/executions"],
    });

    const { data: suites = [] } = useQuery<TestSuite[]>({
      queryKey: ["/api/test-suites"],
    });

    const isLoading = reportsLoading || executionsLoading;

    const handleExport = () => {
      const completedExecs = executions.filter((e) => e.status === "passed" || e.status === "failed");
      const totalTests = completedExecs.reduce((acc, e) => acc + (e.totalTests || 0), 0);
      const totalPassed = completedExecs.reduce((acc, e) => acc + (e.passedTests || 0), 0);
      const totalFailed = completedExecs.reduce((acc, e) => acc + (e.failedTests || 0), 0);
      const passRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

      const reportData = {
        generatedAt: new Date().toISOString(),
        summary: {
          totalExecutions: completedExecs.length,
          totalTests,
          passed: totalPassed,
          failed: totalFailed,
          passRate,
        },
        executions: completedExecs.map((e) => ({
          id: e.id,
          status: e.status,
          totalTests: e.totalTests,
          passedTests: e.passedTests,
          failedTests: e.failedTests,
          duration: e.duration,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          framework: e.framework,
        })),
      };

      let content: string;
      let filename: string;
      let mimeType: string;

      if (exportFormat === "json") {
        content = JSON.stringify(reportData, null, 2);
        filename = `test-report-${Date.now()}.json`;
        mimeType = "application/json";
      } else if (exportFormat === "html") {
        content = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Test Report - ${new Date().toLocaleDateString()}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 12px; margin-bottom: 30px; }
      .header h1 { margin: 0 0 10px 0; }
      .header p { margin: 0; opacity: 0.8; }
      .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
      .stat-card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .stat-value { font-size: 36px; font-weight: bold; }
      .stat-label { color: #666; margin-top: 4px; }
      .passed { color: #10b981; }
      .failed { color: #ef4444; }
      table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      th, td { padding: 16px; text-align: left; border-bottom: 1px solid #eee; }
      th { background: #f9fafb; font-weight: 600; }
      .badge { padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 500; }
      .badge-passed { background: #d1fae5; color: #059669; }
      .badge-failed { background: #fee2e2; color: #dc2626; }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>Test Execution Report</h1>
      <p>Generated: ${new Date().toLocaleString()}</p>
    </div>
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${reportData.summary.passRate}%</div>
        <div class="stat-label">Pass Rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${reportData.summary.totalTests}</div>
        <div class="stat-label">Total Tests</div>
      </div>
      <div class="stat-card">
        <div class="stat-value passed">${reportData.summary.passed}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value failed">${reportData.summary.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Execution ID</th>
          <th>Status</th>
          <th>Framework</th>
          <th>Tests</th>
          <th>Passed</th>
          <th>Failed</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${reportData.executions.map((e) => `
          <tr>
            <td>${e.id.slice(0, 8)}...</td>
            <td><span class="badge badge-${e.status}">${e.status}</span></td>
            <td>${e.framework || "playwright"}</td>
            <td>${e.totalTests || 0}</td>
            <td>${e.passedTests || 0}</td>
            <td>${e.failedTests || 0}</td>
            <td>${e.duration ? Math.round(e.duration / 1000) + "s" : "-"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </body>
  </html>`;
        filename = `test-report-${Date.now()}.html`;
        mimeType = "text/html";
      } else {
        content = `<?xml version="1.0" encoding="UTF-8"?>
  <testsuites name="Test Report" tests="${reportData.summary.totalTests}" failures="${reportData.summary.failed}" time="0">
  ${reportData.executions.map((e) => `  <testsuite name="Execution ${e.id.slice(0, 8)}" tests="${e.totalTests || 0}" failures="${e.failedTests || 0}" />`).join("\n")}
  </testsuites>`;
        filename = `test-report-${Date.now()}.xml`;
        mimeType = "application/xml";
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      // Use a more reliable download method
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      
      // For better compatibility, trigger download via timeout
      setTimeout(() => {
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 100);
      }, 0);

      toast({
        title: "Report Exported",
        description: `Downloading ${filename}...`,
      });
    };

    // Calculate metrics
    const completedExecutions = executions.filter((e) => e.status === "passed" || e.status === "failed");
    const totalTests = completedExecutions.reduce((acc, e) => acc + (e.totalTests || 0), 0);
    const totalPassed = completedExecutions.reduce((acc, e) => acc + (e.passedTests || 0), 0);
    const totalFailed = completedExecutions.reduce((acc, e) => acc + (e.failedTests || 0), 0);
    const overallPassRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
    const avgDuration = completedExecutions.length > 0
      ? Math.round(completedExecutions.reduce((acc, e) => acc + (e.duration || 0), 0) / completedExecutions.length)
      : 0;

    const formatDuration = (ms: number) => {
      if (!ms) return "-";
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
      }
      return `${seconds}s`;
    };

    const formatDate = (date: Date | string | null) => {
      if (!date) return "-";
      return new Date(date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    // Download a single generated report. Uses the stored `content` when the
    // server pre-rendered it, otherwise builds an HTML document on the fly from
    // the report's summary/insights so the download always works.
    const downloadReport = (report: TestReport) => {
      try {
        const r = report as any;
        const fmt = (r.format || "html").toLowerCase();
        const safeName = (report.name || "test-report").replace(/[^a-z0-9-_]+/gi, "-");
        let content = r.content || "";
        let mimeType = fmt === "json" ? "application/json" : fmt === "xml" ? "application/xml" : "text/html";
        let ext = fmt === "json" ? "json" : fmt === "xml" ? "xml" : "html";

        // No pre-rendered content → synthesize a document from the stored fields.
        if (!content) {
          const summary: any = (report as any).summary || {};
          const insights: any[] = Array.isArray((report as any).insights) ? (report as any).insights : [];
          const passRate = report.passRate ?? summary.passRate ?? 0;
          const total = summary.total ?? summary.totalTests ?? 0;
          const passed = summary.passed ?? 0;
          const failed = summary.failed ?? 0;
          const durationSec = report.totalDuration ? Math.round(report.totalDuration / 1000) : 0;

          content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${report.name}</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #f9fafb; margin: 0; padding: 40px; color: #111827; }
    .header { margin-bottom: 24px; }
    .header h1 { margin: 0 0 4px; }
    .meta { color: #6b7280; font-size: 14px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat-card { background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .stat-value { font-size: 30px; font-weight: 700; }
    .stat-label { color: #6b7280; margin-top: 4px; font-size: 13px; }
    .passed { color: #10b981; } .failed { color: #ef4444; }
    .insights { background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .insight { padding: 8px 12px; border-radius: 8px; margin-bottom: 8px; font-size: 14px; }
    .insight.info { background: #eff6ff; color: #1d4ed8; }
    .insight.success { background: #d1fae5; color: #059669; }
    .insight.warning { background: #fef3c7; color: #b45309; }
    .insight.error { background: #fee2e2; color: #dc2626; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${report.name}</h1>
    <p class="meta">Generated: ${new Date(report.createdAt || Date.now()).toLocaleString()}${summary.framework ? ` · Framework: ${summary.framework}` : ""}</p>
  </div>
  <div class="stats">
    <div class="stat-card"><div class="stat-value">${passRate}%</div><div class="stat-label">Pass Rate</div></div>
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total Tests</div></div>
    <div class="stat-card"><div class="stat-value passed">${passed}</div><div class="stat-label">Passed</div></div>
    <div class="stat-card"><div class="stat-value failed">${failed}</div><div class="stat-label">Failed</div></div>
  </div>
  ${durationSec ? `<p class="meta">Total duration: ${durationSec}s</p>` : ""}
  ${insights.length ? `<div class="insights"><h3>Insights</h3>${insights.map(i => `<div class="insight ${i.type || "info"}">${i.message || ""}</div>`).join("")}</div>` : ""}
</body>
</html>`;
          mimeType = "text/html";
          ext = "html";
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeName}.${ext}`;
        link.style.display = "none";
        document.body.appendChild(link);
        setTimeout(() => {
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }, 100);
        }, 0);

        toast({ title: "Report Downloaded", description: `Downloading ${safeName}.${ext}...` });
      } catch (err: any) {
        toast({ title: "Download failed", description: err?.message || "Could not download report", variant: "destructive" });
      }
    };

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">Loading reports...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Test Reports</h1>
              <p className="text-sm text-muted-foreground">Analyze test results and track quality metrics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger className="w-32" data-testid="select-export-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="html">
                  <span className="flex items-center gap-2">
                    <FileCode className="h-4 w-4" />
                    HTML
                  </span>
                </SelectItem>
                <SelectItem value="json">
                  <span className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    JSON
                  </span>
                </SelectItem>
                <SelectItem value="junit">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    JUnit XML
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleExport} data-testid="button-export-report">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card colorSeed="reports-pass-rate">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pass Rate</p>
                  <p className="text-3xl font-bold">{overallPassRate}%</p>
                </div>
                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                  overallPassRate >= 80 
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" 
                    : overallPassRate >= 50 
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-red-500/15 text-red-600 dark:text-red-400"
                }`}>
                  {overallPassRate >= 50 ? (
                    <TrendingUp className="h-6 w-6" />
                  ) : (
                    <TrendingDown className="h-6 w-6" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card colorSeed="reports-tests-passed">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tests Passed</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{totalPassed}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card colorSeed="reports-tests-failed">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tests Failed</p>
                  <p className="text-3xl font-bold text-red-600 dark:text-red-400">{totalFailed}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-red-500/15 flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card colorSeed="reports-avg-duration">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Duration</p>
                  <p className="text-3xl font-bold">{formatDuration(avgDuration)}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-500/15 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {completedExecutions.length === 0 && reports.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No reports available"
            description="Complete test executions to generate reports and see metrics."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card colorSeed="reports-execution-summary">
              <CardHeader>
                <CardTitle className="text-base">Execution Summary</CardTitle>
                <CardDescription>Results from recent test runs</CardDescription>
              </CardHeader>
              <CardContent>
                {completedExecutions.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No completed executions yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {completedExecutions.slice(0, 5).map((execution) => {
                      const passRate = execution.totalTests
                        ? Math.round(((execution.passedTests || 0) / execution.totalTests) * 100)
                        : 0;
                      const suiteName = suites.find(s => s.id.toString() === execution.suiteId)?.name || "Unknown Suite";
                      return (
                        <div key={execution.id} className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">
                                {suiteName} - {execution.environment}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {passRate}%
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  passRate >= 80
                                    ? "bg-emerald-500"
                                    : passRate >= 50
                                    ? "bg-amber-500"
                                    : "bg-red-500"
                                }`}
                                style={{ width: `${passRate}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0">
                            {execution.passedTests}/{execution.totalTests}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card colorSeed="reports-generated-reports">
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base">Generated Reports</CardTitle>
                  <CardDescription>Downloadable test reports</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {reports.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No reports generated yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reports.map((report) => (
                      <div
                        key={report.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-primary" />
                          <div>
                            <p className="font-medium text-sm">{report.name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {formatDate(report.createdAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {report.passRate !== null && (
                            <Badge
                              variant="outline"
                              className={
                                (report.passRate || 0) >= 80
                                  ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/20"
                                  : (report.passRate || 0) >= 50
                                  ? "bg-amber-500/15 text-amber-600 border-amber-500/20"
                                  : "bg-red-500/15 text-red-600 border-red-500/20"
                              }
                            >
                              {report.passRate}%
                            </Badge>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => downloadReport(report)}
                            data-testid={`button-download-report-${report.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <Card colorSeed="reports-quality-insights">
          <CardHeader>
            <CardTitle className="text-base">Quality Insights</CardTitle>
            <CardDescription>AI-powered recommendations based on your test results</CardDescription>
          </CardHeader>
          <CardContent>
            {completedExecutions.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Run more tests to get quality insights</p>
              </div>
            ) : (
              <div className="space-y-3">
                {overallPassRate < 80 && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <TrendingDown className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-600 dark:text-amber-400">Pass rate below target</p>
                      <p className="text-sm text-muted-foreground">
                        Your current pass rate is {overallPassRate}%. Consider reviewing failing tests and addressing common failure patterns.
                      </p>
                    </div>
                  </div>
                )}
                {overallPassRate >= 80 && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-emerald-600 dark:text-emerald-400">Great test coverage</p>
                      <p className="text-sm text-muted-foreground">
                        Your pass rate of {overallPassRate}% indicates healthy test coverage. Continue maintaining quality standards.
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-600 dark:text-blue-400">Execution time</p>
                    <p className="text-sm text-muted-foreground">
                      Average execution time is {formatDuration(avgDuration)}. Consider parallel execution for faster feedback cycles.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card colorSeed="reports-predictive-failure-analysis">
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Predictive Failure Analysis</CardTitle>
          <CardDescription>AI-powered prediction of likely test failures</CardDescription>
        </div>
        {failureAnalysis.length > 0 && selectedFailures.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={handleDeleteFailures}
            disabled={isDeletingFailures}
          >
            {isDeletingFailures
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />}
            Delete ({selectedFailures.size})
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      {failureAnalysis.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Run more tests to get predictive failure analysis</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-2 py-1.5 text-left w-8">
                  <Checkbox
                    checked={selectedFailures.size === failureAnalysis.length && failureAnalysis.length > 0}
                    onCheckedChange={(checked) => {
                      setSelectedFailures(
                        checked ? new Set(failureAnalysis.map(r => r.testName)) : new Set()
                      );
                    }}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-2 py-1 text-left">Test Name</th>
                <th className="px-2 py-1 text-left">Failure Rate</th>
                <th className="px-2 py-1 text-left">Last Fail</th>
                <th className="px-2 py-1 text-left">Prediction</th>
              </tr>
            </thead>
            <tbody>
              {failureAnalysis.map(row => (
                <tr
                  key={row.testName}
                  className={selectedFailures.has(row.testName) ? "bg-primary/5" : undefined}
                >
                  <td className="px-2 py-1">
                    <Checkbox
                      checked={selectedFailures.has(row.testName)}
                      onCheckedChange={() => toggleSelection(setSelectedFailures, row.testName)}
                      aria-label={`Select ${row.testName}`}
                    />
                  </td>
                  <td className="px-2 py-1">{row.testName}</td>
                  <td className="px-2 py-1">{(row.failureRate * 100).toFixed(1)}%</td>
                  <td className="px-2 py-1">{row.lastFail ? new Date(row.lastFail).toLocaleString() : "-"}</td>
                  <td className="px-2 py-1">{row.prediction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardContent>
  </Card>
  <Card colorSeed="reports-optimization-recommendations">
  <CardHeader>
    <div className="flex items-start justify-between gap-3">
      <div>
        <CardTitle className="text-base">Test Optimization Recommendations</CardTitle>
        <CardDescription>Suggestions to optimize your test suite</CardDescription>
      </div>
      {recommendations.length > 0 && selectedRecommendations.size > 0 && (
        <Button
          variant="destructive"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={handleDeleteRecommendations}
          disabled={isDeletingRecommendations}
        >
          {isDeletingRecommendations
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />}
          Delete ({selectedRecommendations.size})
        </Button>
      )}
    </div>
  </CardHeader>
  <CardContent>
    {recommendations.length === 0 ? (
      <div className="py-8 text-center text-muted-foreground">
        <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Run more tests to get optimization recommendations</p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-2 py-1.5 text-left w-8">
                <Checkbox
                  checked={selectedRecommendations.size === recommendations.length && recommendations.length > 0}
                  onCheckedChange={(checked) => {
                    setSelectedRecommendations(
                      checked ? new Set(recommendations.map(r => r.testName)) : new Set()
                    );
                  }}
                  aria-label="Select all"
                />
              </th>
              <th className="px-2 py-1 text-left">Test Name</th>
              <th className="px-2 py-1 text-left">Recommendation</th>
              <th className="px-2 py-1 text-left">Common Failure Reason</th>
            </tr>
          </thead>
          <tbody>
            {recommendations.map(row => (
              <tr
                key={row.testName}
                className={selectedRecommendations.has(row.testName) ? "bg-primary/5" : undefined}
              >
                <td className="px-2 py-1">
                  <Checkbox
                    checked={selectedRecommendations.has(row.testName)}
                    onCheckedChange={() => toggleSelection(setSelectedRecommendations, row.testName)}
                    aria-label={`Select ${row.testName}`}
                  />
                </td>
                <td className="px-2 py-1">{row.testName}</td>
                <td className="px-2 py-1">{row.recommendation}</td>
                <td className="px-2 py-1">{row.commonError || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </CardContent>
</Card>

  <Card colorSeed="reports-bar-chart">
    <CardHeader>
      <CardTitle className="text-base">Pass/Fail Rate Graph</CardTitle>
      <CardDescription>Visualize pass/fail rates for each test</CardDescription>
    </CardHeader>
    <CardContent>
      {passFailStats.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No test execution data for graph</p>
        </div>
      ) : (
        <Bar
          data={{
            labels: passFailStats.map(s => s.testName),
            datasets: [
              {
                label: "Passed",
                data: passFailStats.map(s => s.passed),
                backgroundColor: "#4caf50",
              },
              {
                label: "Failed",
                data: passFailStats.map(s => s.failed),
                backgroundColor: "#f44336",
              },
            ],
          }}
          options={{
            responsive: true,
            plugins: { legend: { position: "top" } },
            scales: { y: { beginAtZero: true } },
          }}
        />
      )}
    </CardContent>
  </Card>
      </div>
    );
  }
