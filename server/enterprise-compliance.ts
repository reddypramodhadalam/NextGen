/**
 * AITAS Enterprise Compliance Module
 * 
 * Implements:
 * 1. Approval Workflows for PROD Execution
 * 2. Compliance Export (CSV/PDF)
 * 3. Flaky Test Detection Engine
 * 4. Cost Forecasting using Historical Data
 * 
 * Fortune-100 grade enterprise QA platform capabilities
 */

import { v4 as uuidv4 } from "uuid";

// ============================================
// TYPE DEFINITIONS
// ============================================

// Approval Workflow Types
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED";
export type ApproverRole = "RELEASE_MANAGER" | "PRODUCT_OWNER" | "QA_LEAD" | "SECURITY_OFFICER" | "ADMIN";
export type ExecutionEnvironment = "QA" | "UAT" | "STAGING" | "PROD";

export interface ApprovalRequest {
  requestId: string;
  executionId: string;
  testCaseIds: string[];
  environment: ExecutionEnvironment;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  approverRole: ApproverRole;
  approverId?: string;
  approverName?: string;
  approverEmail?: string;
  status: ApprovalStatus;
  justification: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  scheduledTime?: Date;
  requestedAt: Date;
  respondedAt?: Date;
  expiresAt: Date;
  comments: ApprovalComment[];
  metadata: Record<string, any>;
}

export interface ApprovalComment {
  id: string;
  userId: string;
  userName: string;
  comment: string;
  timestamp: Date;
}

export interface ApprovalPolicy {
  environment: ExecutionEnvironment;
  requiresApproval: boolean;
  requiredApproverRoles: ApproverRole[];
  minApprovers: number;
  expirationHours: number;
  autoRejectAfterHours: number;
  notifyOnRequest: string[];
  notifyOnApproval: string[];
  notifyOnRejection: string[];
}

// Compliance Export Types
export type ExportFormat = "CSV" | "PDF" | "JSON" | "XLSX";
export type ExportScope = "TEST_CASES" | "EXECUTIONS" | "AUDIT_LOGS" | "COVERAGE" | "APPROVALS" | "FULL_REPORT";

export interface ComplianceExportRequest {
  exportId: string;
  exportType: ExportScope;
  format: ExportFormat;
  dateRange: {
    start: Date;
    end: Date;
  };
  environment?: ExecutionEnvironment;
  filters: {
    modules?: string[];
    users?: string[];
    statuses?: string[];
    testSuiteIds?: string[];
  };
  requestedBy: string;
  requestedAt: Date;
  completedAt?: Date;
  status: "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
  filePath?: string;
  fileSize?: number;
  error?: string;
}

export interface ComplianceReport {
  reportId: string;
  title: string;
  generatedAt: Date;
  generatedBy: string;
  dateRange: { start: Date; end: Date };
  environment: ExecutionEnvironment;
  sections: {
    summary: ReportSummary;
    executionTimeline: ExecutionTimelineEntry[];
    approvalRecords: ApprovalRecord[];
    failures: FailureRecord[];
    coverage: CoverageSnapshot;
  };
}

export interface ReportSummary {
  totalTestCases: number;
  totalExecutions: number;
  passRate: number;
  failRate: number;
  averageDuration: number;
  totalCostUnits: number;
  approvalCompliance: number;
  flakyTestCount: number;
}

export interface ExecutionTimelineEntry {
  timestamp: Date;
  executionId: string;
  testCaseId: string;
  testCaseTitle: string;
  status: string;
  duration: number;
  agent: string;
  user: string;
}

export interface ApprovalRecord {
  requestId: string;
  executionId: string;
  requester: string;
  approver: string;
  status: ApprovalStatus;
  requestedAt: Date;
  respondedAt?: Date;
  justification: string;
}

export interface FailureRecord {
  executionId: string;
  testCaseId: string;
  testCaseTitle: string;
  failedAt: Date;
  error: string;
  screenshot?: string;
  retryCount: number;
  wasHealed: boolean;
}

export interface CoverageSnapshot {
  overallCoverage: number;
  requirementsCovered: number;
  requirementsTotal: number;
  byModule: { module: string; coverage: number }[];
  byPriority: { priority: string; coverage: number }[];
}

// Flaky Test Detection Types
export type TestStability = "STABLE" | "FLAKY" | "UNSTABLE" | "UNKNOWN";

export interface TestExecutionRecord {
  runId: string;
  testCaseId: string;
  testCaseTitle: string;
  status: "PASS" | "FAIL" | "SKIP" | "ERROR";
  duration: number;
  timestamp: Date;
  environment: ExecutionEnvironment;
  agent: string;
  error?: string;
  retryCount: number;
}

export interface FlakyTestAnalysis {
  testCaseId: string;
  testCaseTitle: string;
  stability: TestStability;
  flakinessScore: number; // 0-100, higher = more flaky
  totalRuns: number;
  passCount: number;
  failCount: number;
  skipCount: number;
  statusChanges: number;
  lastRunStatus: "PASS" | "FAIL" | "SKIP" | "ERROR";
  lastRunAt: Date;
  pattern: FlakinessPattern;
  recommendation: string;
  excludeFromCI: boolean;
  quarantined: boolean;
  quarantinedAt?: Date;
  quarantinedBy?: string;
  history: { date: Date; status: string }[];
}

export type FlakinessPattern = 
  | "RANDOM_FAILURES"      // No discernible pattern
  | "TIMING_SENSITIVE"     // Fails under load or slow conditions
  | "ORDER_DEPENDENT"      // Fails when run after certain tests
  | "ENVIRONMENT_SPECIFIC" // Fails only in certain environments
  | "DATA_DEPENDENT"       // Fails with certain data combinations
  | "NONE";                // Stable test

// Cost Forecasting Types
export interface CostRecord {
  recordId: string;
  executionId: string;
  testCaseId: string;
  environment: ExecutionEnvironment;
  costUnits: number;
  capability: string;
  timestamp: Date;
  agent: string;
  duration: number;
}

export interface CostForecast {
  forecastId: string;
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
  };
  environment: ExecutionEnvironment;
  historicalData: {
    dailyAverage: number;
    weeklyAverage: number;
    peakUsage: number;
    trend: "INCREASING" | "STABLE" | "DECREASING";
  };
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
  recommendations: string[];
  alerts: CostAlert[];
}

export interface CostAlert {
  alertId: string;
  type: "BUDGET_WARNING" | "BUDGET_CRITICAL" | "SPIKE_DETECTED" | "FORECAST_EXCEEDS_BUDGET";
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
}

// ============================================
// 1. APPROVAL WORKFLOW MANAGER
// ============================================

class ApprovalWorkflowManager {
  private requests: Map<string, ApprovalRequest> = new Map();
  private policies: Map<ExecutionEnvironment, ApprovalPolicy> = new Map();
  private auditLog: { timestamp: Date; action: string; details: any }[] = [];

  constructor() {
    this.initializeDefaultPolicies();
  }

  private initializeDefaultPolicies(): void {
    // QA - No approval required
    this.policies.set("QA", {
      environment: "QA",
      requiresApproval: false,
      requiredApproverRoles: [],
      minApprovers: 0,
      expirationHours: 24,
      autoRejectAfterHours: 48,
      notifyOnRequest: [],
      notifyOnApproval: [],
      notifyOnRejection: [],
    });

    // UAT - Optional approval
    this.policies.set("UAT", {
      environment: "UAT",
      requiresApproval: false,
      requiredApproverRoles: ["QA_LEAD"],
      minApprovers: 0,
      expirationHours: 24,
      autoRejectAfterHours: 48,
      notifyOnRequest: ["qa-team@company.com"],
      notifyOnApproval: [],
      notifyOnRejection: [],
    });

    // STAGING - Recommended approval
    this.policies.set("STAGING", {
      environment: "STAGING",
      requiresApproval: true,
      requiredApproverRoles: ["QA_LEAD", "RELEASE_MANAGER"],
      minApprovers: 1,
      expirationHours: 12,
      autoRejectAfterHours: 24,
      notifyOnRequest: ["qa-lead@company.com"],
      notifyOnApproval: ["devops@company.com"],
      notifyOnRejection: ["qa-team@company.com"],
    });

    // PROD - Mandatory approval (NON-NEGOTIABLE)
    this.policies.set("PROD", {
      environment: "PROD",
      requiresApproval: true,
      requiredApproverRoles: ["RELEASE_MANAGER", "PRODUCT_OWNER"],
      minApprovers: 1,
      expirationHours: 8,
      autoRejectAfterHours: 24,
      notifyOnRequest: ["release-managers@company.com", "security@company.com"],
      notifyOnApproval: ["devops@company.com", "qa-lead@company.com"],
      notifyOnRejection: ["qa-team@company.com"],
    });

    console.log("[ApprovalWorkflow] Default policies initialized for all environments");
  }

  /**
   * Check if execution requires approval
   */
  requiresApproval(environment: ExecutionEnvironment): boolean {
    const policy = this.policies.get(environment);
    return policy?.requiresApproval ?? false;
  }

  /**
   * Create approval request for PROD execution
   */
  createApprovalRequest(params: {
    executionId: string;
    testCaseIds: string[];
    environment: ExecutionEnvironment;
    requesterId: string;
    requesterName: string;
    requesterEmail: string;
    justification: string;
    scheduledTime?: Date;
    metadata?: Record<string, any>;
  }): ApprovalRequest {
    const policy = this.policies.get(params.environment);
    
    if (!policy) {
      throw new Error(`No approval policy defined for environment: ${params.environment}`);
    }

    // Calculate risk level based on test count and environment
    const riskLevel = this.calculateRiskLevel(params.testCaseIds.length, params.environment);

    const request: ApprovalRequest = {
      requestId: `APR-${uuidv4().substring(0, 8).toUpperCase()}`,
      executionId: params.executionId,
      testCaseIds: params.testCaseIds,
      environment: params.environment,
      requesterId: params.requesterId,
      requesterName: params.requesterName,
      requesterEmail: params.requesterEmail,
      approverRole: policy.requiredApproverRoles[0] || "RELEASE_MANAGER",
      status: "PENDING",
      justification: params.justification,
      riskLevel,
      scheduledTime: params.scheduledTime,
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + policy.expirationHours * 60 * 60 * 1000),
      comments: [],
      metadata: params.metadata || {},
    };

    this.requests.set(request.requestId, request);

    // Audit log
    this.logAudit("APPROVAL_REQUESTED", {
      requestId: request.requestId,
      environment: params.environment,
      requester: params.requesterName,
      testCount: params.testCaseIds.length,
      riskLevel,
    });

    console.log(`[ApprovalWorkflow] Request created: ${request.requestId} for ${params.environment}`);

    return request;
  }

  /**
   * Approve execution request
   */
  approve(requestId: string, approverId: string, approverName: string, comment?: string): ApprovalRequest {
    const request = this.requests.get(requestId);
    
    if (!request) {
      throw new Error(`Approval request not found: ${requestId}`);
    }

    if (request.status !== "PENDING") {
      throw new Error(`Request ${requestId} is not pending (current status: ${request.status})`);
    }

    if (new Date() > request.expiresAt) {
      request.status = "EXPIRED";
      this.requests.set(requestId, request);
      throw new Error(`Request ${requestId} has expired`);
    }

    // Update request
    request.status = "APPROVED";
    request.approverId = approverId;
    request.approverName = approverName;
    request.respondedAt = new Date();

    if (comment) {
      request.comments.push({
        id: uuidv4(),
        userId: approverId,
        userName: approverName,
        comment,
        timestamp: new Date(),
      });
    }

    this.requests.set(requestId, request);

    // Audit log
    this.logAudit("APPROVAL_GRANTED", {
      requestId,
      approver: approverName,
      environment: request.environment,
      executionId: request.executionId,
    });

    console.log(`[ApprovalWorkflow] Request ${requestId} APPROVED by ${approverName}`);

    return request;
  }

  /**
   * Reject execution request
   */
  reject(requestId: string, approverId: string, approverName: string, reason: string): ApprovalRequest {
    const request = this.requests.get(requestId);
    
    if (!request) {
      throw new Error(`Approval request not found: ${requestId}`);
    }

    if (request.status !== "PENDING") {
      throw new Error(`Request ${requestId} is not pending (current status: ${request.status})`);
    }

    // Update request
    request.status = "REJECTED";
    request.approverId = approverId;
    request.approverName = approverName;
    request.respondedAt = new Date();
    request.comments.push({
      id: uuidv4(),
      userId: approverId,
      userName: approverName,
      comment: `REJECTED: ${reason}`,
      timestamp: new Date(),
    });

    this.requests.set(requestId, request);

    // Audit log
    this.logAudit("APPROVAL_REJECTED", {
      requestId,
      approver: approverName,
      reason,
      environment: request.environment,
    });

    console.log(`[ApprovalWorkflow] Request ${requestId} REJECTED by ${approverName}: ${reason}`);

    return request;
  }

  /**
   * Check if execution is allowed (ENFORCEMENT GATE)
   */
  canExecute(executionId: string, environment: ExecutionEnvironment): { allowed: boolean; reason: string; requestId?: string } {
    // Non-PROD environments may not require approval
    if (!this.requiresApproval(environment)) {
      return { allowed: true, reason: "No approval required for this environment" };
    }

    // Find approval request for this execution
    const request = Array.from(this.requests.values())
      .find(r => r.executionId === executionId && r.environment === environment);

    if (!request) {
      return { 
        allowed: false, 
        reason: `🔒 Production Execution Requires Approval. No approval request found for execution ${executionId}` 
      };
    }

    if (request.status === "PENDING") {
      return { 
        allowed: false, 
        reason: `Approval request ${request.requestId} is pending review`,
        requestId: request.requestId
      };
    }

    if (request.status === "REJECTED") {
      return { 
        allowed: false, 
        reason: `Approval request ${request.requestId} was rejected`,
        requestId: request.requestId
      };
    }

    if (request.status === "EXPIRED") {
      return { 
        allowed: false, 
        reason: `Approval request ${request.requestId} has expired`,
        requestId: request.requestId
      };
    }

    if (request.status === "APPROVED") {
      return { 
        allowed: true, 
        reason: `Approved by ${request.approverName} on ${request.respondedAt?.toISOString()}`,
        requestId: request.requestId
      };
    }

    return { allowed: false, reason: "Unknown approval status" };
  }

  /**
   * Get pending approvals for a specific approver role
   */
  getPendingApprovals(approverRole?: ApproverRole): ApprovalRequest[] {
    return Array.from(this.requests.values())
      .filter(r => r.status === "PENDING")
      .filter(r => !approverRole || r.approverRole === approverRole)
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  /**
   * Get approval request by ID
   */
  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId);
  }

  /**
   * Get all requests for an environment
   */
  getRequestsByEnvironment(environment: ExecutionEnvironment): ApprovalRequest[] {
    return Array.from(this.requests.values())
      .filter(r => r.environment === environment)
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  /**
   * Get approval policy for environment
   */
  getPolicy(environment: ExecutionEnvironment): ApprovalPolicy | undefined {
    return this.policies.get(environment);
  }

  /**
   * Update approval policy
   */
  updatePolicy(environment: ExecutionEnvironment, updates: Partial<ApprovalPolicy>): ApprovalPolicy {
    const existing = this.policies.get(environment);
    if (!existing) {
      throw new Error(`No policy exists for environment: ${environment}`);
    }

    const updated = { ...existing, ...updates };
    this.policies.set(environment, updated);

    this.logAudit("POLICY_UPDATED", { environment, updates });

    return updated;
  }

  /**
   * Get approval statistics
   */
  getStatistics(): {
    totalRequests: number;
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
    averageResponseTimeHours: number;
    byEnvironment: Record<string, number>;
  } {
    const requests = Array.from(this.requests.values());
    const responded = requests.filter(r => r.respondedAt);

    const avgResponseTime = responded.length > 0
      ? responded.reduce((sum, r) => sum + (r.respondedAt!.getTime() - r.requestedAt.getTime()), 0) / responded.length / (1000 * 60 * 60)
      : 0;

    const byEnv: Record<string, number> = {};
    requests.forEach(r => {
      byEnv[r.environment] = (byEnv[r.environment] || 0) + 1;
    });

    return {
      totalRequests: requests.length,
      pending: requests.filter(r => r.status === "PENDING").length,
      approved: requests.filter(r => r.status === "APPROVED").length,
      rejected: requests.filter(r => r.status === "REJECTED").length,
      expired: requests.filter(r => r.status === "EXPIRED").length,
      averageResponseTimeHours: Math.round(avgResponseTime * 10) / 10,
      byEnvironment: byEnv,
    };
  }

  private calculateRiskLevel(testCount: number, environment: ExecutionEnvironment): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    if (environment === "PROD") {
      if (testCount > 50) return "CRITICAL";
      if (testCount > 20) return "HIGH";
      if (testCount > 5) return "MEDIUM";
      return "LOW";
    }
    if (environment === "STAGING") {
      if (testCount > 100) return "HIGH";
      if (testCount > 30) return "MEDIUM";
      return "LOW";
    }
    return "LOW";
  }

  private logAudit(action: string, details: any): void {
    this.auditLog.push({
      timestamp: new Date(),
      action,
      details,
    });
  }

  getAuditLog(): { timestamp: Date; action: string; details: any }[] {
    return [...this.auditLog];
  }
}

// ============================================
// 2. COMPLIANCE EXPORT MANAGER
// ============================================

class ComplianceExportManager {
  private exports: Map<string, ComplianceExportRequest> = new Map();
  private auditLog: { timestamp: Date; action: string; exportId: string; user: string }[] = [];

  /**
   * Create compliance export request
   */
  async createExport(params: {
    exportType: ExportScope;
    format: ExportFormat;
    dateRange: { start: Date; end: Date };
    environment?: ExecutionEnvironment;
    filters?: {
      modules?: string[];
      users?: string[];
      statuses?: string[];
      testSuiteIds?: string[];
    };
    requestedBy: string;
  }): Promise<ComplianceExportRequest> {
    const exportRequest: ComplianceExportRequest = {
      exportId: `EXP-${uuidv4().substring(0, 8).toUpperCase()}`,
      exportType: params.exportType,
      format: params.format,
      dateRange: params.dateRange,
      environment: params.environment,
      filters: params.filters || {},
      requestedBy: params.requestedBy,
      requestedAt: new Date(),
      status: "PENDING",
    };

    this.exports.set(exportRequest.exportId, exportRequest);

    // Log the export request
    this.auditLog.push({
      timestamp: new Date(),
      action: "EXPORT_REQUESTED",
      exportId: exportRequest.exportId,
      user: params.requestedBy,
    });

    console.log(`[ComplianceExport] Export request created: ${exportRequest.exportId}`);

    return exportRequest;
  }

  /**
   * Generate CSV export
   */
  generateCSV(data: any[], columns: string[]): string {
    const header = columns.join(",");
    const rows = data.map(row => 
      columns.map(col => {
        const value = row[col];
        if (value === null || value === undefined) return "";
        const str = String(value);
        // Escape quotes and wrap in quotes if contains comma
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(",")
    );
    return [header, ...rows].join("\n");
  }

  /**
   * Generate audit log CSV
   */
  generateAuditLogCSV(logs: any[]): string {
    const columns = ["Timestamp", "User", "Action", "TestCase", "Status", "Agent", "Environment", "Details"];
    return this.generateCSV(logs.map(log => ({
      Timestamp: log.timestamp?.toISOString() || "",
      User: log.actorId || log.user || "",
      Action: log.action || "",
      TestCase: log.resourceId || "",
      Status: log.outcome || log.status || "",
      Agent: log.agentId || "",
      Environment: log.environment || "",
      Details: JSON.stringify(log.details || {}),
    })), columns);
  }

  /**
   * Generate execution history CSV
   */
  generateExecutionCSV(executions: any[]): string {
    const columns = ["ExecutionID", "Timestamp", "TestCaseID", "TestCaseTitle", "Status", "Duration", "Agent", "Environment", "Error"];
    return this.generateCSV(executions.map(ex => ({
      ExecutionID: ex.executionId || ex.id || "",
      Timestamp: ex.timestamp?.toISOString() || ex.createdAt?.toISOString() || "",
      TestCaseID: ex.testCaseId || "",
      TestCaseTitle: ex.testCaseTitle || ex.title || "",
      Status: ex.status || "",
      Duration: ex.duration || 0,
      Agent: ex.agent || ex.agentId || "",
      Environment: ex.environment || "",
      Error: ex.error || "",
    })), columns);
  }

  /**
   * Generate approval history CSV
   */
  generateApprovalCSV(approvals: ApprovalRequest[]): string {
    const columns = ["RequestID", "ExecutionID", "Requester", "Environment", "Status", "Approver", "RequestedAt", "RespondedAt", "RiskLevel", "Justification"];
    return this.generateCSV(approvals.map(apr => ({
      RequestID: apr.requestId,
      ExecutionID: apr.executionId,
      Requester: apr.requesterName,
      Environment: apr.environment,
      Status: apr.status,
      Approver: apr.approverName || "",
      RequestedAt: apr.requestedAt.toISOString(),
      RespondedAt: apr.respondedAt?.toISOString() || "",
      RiskLevel: apr.riskLevel,
      Justification: apr.justification,
    })), columns);
  }

  /**
   * Generate compliance report (for PDF generation)
   */
  generateComplianceReport(params: {
    dateRange: { start: Date; end: Date };
    environment: ExecutionEnvironment;
    executions: any[];
    approvals: ApprovalRequest[];
    auditLogs: any[];
    coverage: CoverageSnapshot;
    generatedBy: string;
  }): ComplianceReport {
    const { dateRange, environment, executions, approvals, auditLogs, coverage, generatedBy } = params;

    // Calculate summary
    const totalExecutions = executions.length;
    const passed = executions.filter(e => e.status === "passed" || e.status === "PASS").length;
    const failed = executions.filter(e => e.status === "failed" || e.status === "FAIL").length;
    const totalDuration = executions.reduce((sum, e) => sum + (e.duration || 0), 0);

    const summary: ReportSummary = {
      totalTestCases: new Set(executions.map(e => e.testCaseId)).size,
      totalExecutions,
      passRate: totalExecutions > 0 ? Math.round((passed / totalExecutions) * 100) : 0,
      failRate: totalExecutions > 0 ? Math.round((failed / totalExecutions) * 100) : 0,
      averageDuration: totalExecutions > 0 ? Math.round(totalDuration / totalExecutions) : 0,
      totalCostUnits: executions.reduce((sum, e) => sum + (e.costUnits || 0), 0),
      approvalCompliance: approvals.length > 0 
        ? Math.round((approvals.filter(a => a.status === "APPROVED").length / approvals.length) * 100)
        : 100,
      flakyTestCount: 0, // Will be calculated by flaky detection engine
    };

    // Build execution timeline
    const executionTimeline: ExecutionTimelineEntry[] = executions
      .sort((a, b) => new Date(a.timestamp || a.createdAt).getTime() - new Date(b.timestamp || b.createdAt).getTime())
      .map(ex => ({
        timestamp: new Date(ex.timestamp || ex.createdAt),
        executionId: ex.executionId || ex.id,
        testCaseId: ex.testCaseId,
        testCaseTitle: ex.testCaseTitle || ex.title || "",
        status: ex.status,
        duration: ex.duration || 0,
        agent: ex.agent || ex.agentId || "",
        user: ex.userId || ex.user || "",
      }));

    // Build approval records
    const approvalRecords: ApprovalRecord[] = approvals.map(apr => ({
      requestId: apr.requestId,
      executionId: apr.executionId,
      requester: apr.requesterName,
      approver: apr.approverName || "",
      status: apr.status,
      requestedAt: apr.requestedAt,
      respondedAt: apr.respondedAt,
      justification: apr.justification,
    }));

    // Build failure records
    const failures: FailureRecord[] = executions
      .filter(ex => ex.status === "failed" || ex.status === "FAIL")
      .map(ex => ({
        executionId: ex.executionId || ex.id,
        testCaseId: ex.testCaseId,
        testCaseTitle: ex.testCaseTitle || ex.title || "",
        failedAt: new Date(ex.timestamp || ex.createdAt),
        error: ex.error || "Unknown error",
        screenshot: ex.screenshot,
        retryCount: ex.retryCount || 0,
        wasHealed: ex.wasHealed || false,
      }));

    return {
      reportId: `RPT-${uuidv4().substring(0, 8).toUpperCase()}`,
      title: `Compliance Report - ${environment} - ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}`,
      generatedAt: new Date(),
      generatedBy,
      dateRange,
      environment,
      sections: {
        summary,
        executionTimeline,
        approvalRecords,
        failures,
        coverage,
      },
    };
  }

  /**
   * Get export request by ID
   */
  getExport(exportId: string): ComplianceExportRequest | undefined {
    return this.exports.get(exportId);
  }

  /**
   * Get all exports
   */
  getAllExports(): ComplianceExportRequest[] {
    return Array.from(this.exports.values())
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  /**
   * Get export audit log
   */
  getExportAuditLog(): { timestamp: Date; action: string; exportId: string; user: string }[] {
    return [...this.auditLog];
  }
}

// ============================================
// 3. FLAKY TEST DETECTION ENGINE
// ============================================

class FlakyTestDetectionEngine {
  private executionHistory: Map<string, TestExecutionRecord[]> = new Map();
  private flakyAnalysis: Map<string, FlakyTestAnalysis> = new Map();
  private quarantinedTests: Set<string> = new Set();

  // Configuration
  private readonly FLAKINESS_WINDOW = 20; // Last N runs to analyze
  private readonly FLAKY_THRESHOLD_LOW = 20;  // 20% failure rate
  private readonly FLAKY_THRESHOLD_HIGH = 80; // 80% failure rate
  private readonly MIN_RUNS_FOR_ANALYSIS = 5;

  /**
   * Record a test execution result
   */
  recordExecution(record: TestExecutionRecord): void {
    const history = this.executionHistory.get(record.testCaseId) || [];
    history.push(record);

    // Keep only last N runs
    if (history.length > this.FLAKINESS_WINDOW * 2) {
      history.splice(0, history.length - this.FLAKINESS_WINDOW * 2);
    }

    this.executionHistory.set(record.testCaseId, history);

    // Re-analyze after each execution
    this.analyzeTest(record.testCaseId);
  }

  /**
   * Analyze a single test for flakiness
   */
  analyzeTest(testCaseId: string): FlakyTestAnalysis | null {
    const history = this.executionHistory.get(testCaseId);
    
    if (!history || history.length < this.MIN_RUNS_FOR_ANALYSIS) {
      return null;
    }

    // Get last N runs
    const recentRuns = history.slice(-this.FLAKINESS_WINDOW);
    const totalRuns = recentRuns.length;

    // Count statuses
    const passCount = recentRuns.filter(r => r.status === "PASS").length;
    const failCount = recentRuns.filter(r => r.status === "FAIL" || r.status === "ERROR").length;
    const skipCount = recentRuns.filter(r => r.status === "SKIP").length;

    // Count status changes (PASS→FAIL or FAIL→PASS)
    let statusChanges = 0;
    for (let i = 1; i < recentRuns.length; i++) {
      const prev = recentRuns[i - 1].status;
      const curr = recentRuns[i].status;
      if ((prev === "PASS" && (curr === "FAIL" || curr === "ERROR")) ||
          ((prev === "FAIL" || prev === "ERROR") && curr === "PASS")) {
        statusChanges++;
      }
    }

    // Calculate flakiness score (0-100)
    // Higher score = more flaky
    const flakinessScore = Math.round((statusChanges / (totalRuns - 1)) * 100);

    // Determine stability
    const failureRate = (failCount / totalRuns) * 100;
    let stability: TestStability;
    
    if (failureRate < 5 && statusChanges === 0) {
      stability = "STABLE";
    } else if (failureRate > 95) {
      stability = "UNSTABLE"; // Always fails
    } else if (failureRate >= this.FLAKY_THRESHOLD_LOW && failureRate <= this.FLAKY_THRESHOLD_HIGH) {
      stability = "FLAKY";
    } else if (statusChanges >= 3) {
      stability = "FLAKY";
    } else {
      stability = "STABLE";
    }

    // Detect pattern
    const pattern = this.detectPattern(recentRuns);

    // Generate recommendation
    const recommendation = this.generateRecommendation(stability, flakinessScore, pattern);

    const analysis: FlakyTestAnalysis = {
      testCaseId,
      testCaseTitle: recentRuns[0].testCaseTitle,
      stability,
      flakinessScore,
      totalRuns,
      passCount,
      failCount,
      skipCount,
      statusChanges,
      lastRunStatus: recentRuns[recentRuns.length - 1].status,
      lastRunAt: recentRuns[recentRuns.length - 1].timestamp,
      pattern,
      recommendation,
      excludeFromCI: stability === "FLAKY" || stability === "UNSTABLE",
      quarantined: this.quarantinedTests.has(testCaseId),
      quarantinedAt: this.quarantinedTests.has(testCaseId) ? new Date() : undefined,
      history: recentRuns.map(r => ({ date: r.timestamp, status: r.status })),
    };

    this.flakyAnalysis.set(testCaseId, analysis);

    // Auto-quarantine very flaky tests
    if (flakinessScore >= 60 && stability === "FLAKY") {
      this.quarantineTest(testCaseId, "AUTO");
    }

    return analysis;
  }

  /**
   * Detect flakiness pattern
   */
  private detectPattern(runs: TestExecutionRecord[]): FlakinessPattern {
    if (runs.length < 5) return "NONE";

    // Check for timing sensitivity (slower runs tend to fail)
    const failedRuns = runs.filter(r => r.status === "FAIL" || r.status === "ERROR");
    const passedRuns = runs.filter(r => r.status === "PASS");

    if (failedRuns.length > 0 && passedRuns.length > 0) {
      const avgFailedDuration = failedRuns.reduce((s, r) => s + r.duration, 0) / failedRuns.length;
      const avgPassedDuration = passedRuns.reduce((s, r) => s + r.duration, 0) / passedRuns.length;
      
      if (avgFailedDuration > avgPassedDuration * 1.5) {
        return "TIMING_SENSITIVE";
      }
    }

    // Check for environment-specific failures
    const envFailures: Record<string, number> = {};
    const envTotal: Record<string, number> = {};
    
    runs.forEach(r => {
      envTotal[r.environment] = (envTotal[r.environment] || 0) + 1;
      if (r.status === "FAIL" || r.status === "ERROR") {
        envFailures[r.environment] = (envFailures[r.environment] || 0) + 1;
      }
    });

    const envs = Object.keys(envTotal);
    if (envs.length > 1) {
      for (const env of envs) {
        const envFailRate = (envFailures[env] || 0) / envTotal[env];
        const otherEnvs = envs.filter(e => e !== env);
        const otherFailRate = otherEnvs.reduce((s, e) => s + (envFailures[e] || 0), 0) /
                              otherEnvs.reduce((s, e) => s + envTotal[e], 0);
        
        if (envFailRate > 0.5 && otherFailRate < 0.1) {
          return "ENVIRONMENT_SPECIFIC";
        }
      }
    }

    // Default to random if no pattern detected
    if (failedRuns.length > 0) {
      return "RANDOM_FAILURES";
    }

    return "NONE";
  }

  /**
   * Generate recommendation based on analysis
   */
  private generateRecommendation(stability: TestStability, score: number, pattern: FlakinessPattern): string {
    if (stability === "STABLE") {
      return "Test is stable. No action required.";
    }

    if (stability === "UNSTABLE") {
      return "Test consistently fails. Investigate root cause or disable test.";
    }

    // Flaky test recommendations based on pattern
    switch (pattern) {
      case "TIMING_SENSITIVE":
        return "Add explicit waits or increase timeouts. Consider async handling improvements.";
      case "ENVIRONMENT_SPECIFIC":
        return "Check environment configuration differences. May need environment-specific setup.";
      case "ORDER_DEPENDENT":
        return "Test may depend on other tests. Ensure proper test isolation.";
      case "DATA_DEPENDENT":
        return "Use consistent test data or reset state before each run.";
      case "RANDOM_FAILURES":
      default:
        return `Flakiness score: ${score}%. Consider quarantining until root cause is fixed.`;
    }
  }

  /**
   * Quarantine a flaky test
   */
  quarantineTest(testCaseId: string, by: string): void {
    this.quarantinedTests.add(testCaseId);
    
    const analysis = this.flakyAnalysis.get(testCaseId);
    if (analysis) {
      analysis.quarantined = true;
      analysis.quarantinedAt = new Date();
      analysis.quarantinedBy = by;
      this.flakyAnalysis.set(testCaseId, analysis);
    }

    console.log(`[FlakyDetection] Test ${testCaseId} quarantined by ${by}`);
  }

  /**
   * Unquarantine a test
   */
  unquarantineTest(testCaseId: string): void {
    this.quarantinedTests.delete(testCaseId);
    
    const analysis = this.flakyAnalysis.get(testCaseId);
    if (analysis) {
      analysis.quarantined = false;
      analysis.quarantinedAt = undefined;
      analysis.quarantinedBy = undefined;
      this.flakyAnalysis.set(testCaseId, analysis);
    }

    console.log(`[FlakyDetection] Test ${testCaseId} unquarantined`);
  }

  /**
   * Check if test should run in CI
   */
  shouldRunInCI(testCaseId: string): boolean {
    const analysis = this.flakyAnalysis.get(testCaseId);
    if (!analysis) return true; // Unknown tests run by default
    
    return !analysis.excludeFromCI && !analysis.quarantined;
  }

  /**
   * Get all flaky tests
   */
  getFlakyTests(): FlakyTestAnalysis[] {
    return Array.from(this.flakyAnalysis.values())
      .filter(a => a.stability === "FLAKY")
      .sort((a, b) => b.flakinessScore - a.flakinessScore);
  }

  /**
   * Get all quarantined tests
   */
  getQuarantinedTests(): FlakyTestAnalysis[] {
    return Array.from(this.flakyAnalysis.values())
      .filter(a => a.quarantined);
  }

  /**
   * Get test analysis
   */
  getAnalysis(testCaseId: string): FlakyTestAnalysis | undefined {
    return this.flakyAnalysis.get(testCaseId);
  }

  /**
   * Get flaky test statistics
   */
  getStatistics(): {
    totalAnalyzed: number;
    stable: number;
    flaky: number;
    unstable: number;
    quarantined: number;
    averageFlakinessScore: number;
    topFlaky: { testCaseId: string; score: number }[];
  } {
    const analyses = Array.from(this.flakyAnalysis.values());
    const flaky = analyses.filter(a => a.stability === "FLAKY");

    return {
      totalAnalyzed: analyses.length,
      stable: analyses.filter(a => a.stability === "STABLE").length,
      flaky: flaky.length,
      unstable: analyses.filter(a => a.stability === "UNSTABLE").length,
      quarantined: this.quarantinedTests.size,
      averageFlakinessScore: flaky.length > 0
        ? Math.round(flaky.reduce((s, a) => s + a.flakinessScore, 0) / flaky.length)
        : 0,
      topFlaky: flaky
        .sort((a, b) => b.flakinessScore - a.flakinessScore)
        .slice(0, 10)
        .map(a => ({ testCaseId: a.testCaseId, score: a.flakinessScore })),
    };
  }
}

// ============================================
// 4. COST FORECASTING ENGINE
// ============================================

class CostForecastingEngine {
  private costHistory: CostRecord[] = [];
  private alerts: CostAlert[] = [];
  private budgets: Map<ExecutionEnvironment, { daily: number; weekly: number; monthly: number }> = new Map();

  constructor() {
    this.initializeDefaultBudgets();
  }

  private initializeDefaultBudgets(): void {
    this.budgets.set("QA", { daily: 1000, weekly: 5000, monthly: 20000 });
    this.budgets.set("UAT", { daily: 500, weekly: 2500, monthly: 10000 });
    this.budgets.set("STAGING", { daily: 300, weekly: 1500, monthly: 6000 });
    this.budgets.set("PROD", { daily: 200, weekly: 1000, monthly: 4000 });
  }

  /**
   * Record execution cost
   */
  recordCost(record: CostRecord): void {
    this.costHistory.push(record);
    console.log(`[CostForecast] Recorded: ${record.costUnits} units for ${record.environment}`);

    // Check for budget alerts
    this.checkBudgetAlerts(record.environment);
  }

  /**
   * Check and create budget alerts
   */
  private checkBudgetAlerts(environment: ExecutionEnvironment): void {
    const budget = this.budgets.get(environment);
    if (!budget) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCost = this.costHistory
      .filter(r => r.environment === environment && new Date(r.timestamp) >= today)
      .reduce((sum, r) => sum + r.costUnits, 0);

    const usagePercent = (todayCost / budget.daily) * 100;

    if (usagePercent >= 90 && !this.hasRecentAlert(environment, "BUDGET_CRITICAL")) {
      this.createAlert({
        type: "BUDGET_CRITICAL",
        message: `${environment} daily budget 90% exhausted (${todayCost}/${budget.daily} units)`,
        severity: "CRITICAL",
        environment,
      });
    } else if (usagePercent >= 75 && !this.hasRecentAlert(environment, "BUDGET_WARNING")) {
      this.createAlert({
        type: "BUDGET_WARNING",
        message: `${environment} daily budget 75% used (${todayCost}/${budget.daily} units)`,
        severity: "WARNING",
        environment,
      });
    }
  }

  private hasRecentAlert(environment: ExecutionEnvironment, type: CostAlert["type"]): boolean {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return this.alerts.some(a => 
      a.type === type && 
      !a.acknowledged && 
      new Date(a.timestamp) > oneHourAgo
    );
  }

  private createAlert(params: { type: CostAlert["type"]; message: string; severity: CostAlert["severity"]; environment: ExecutionEnvironment }): void {
    const alert: CostAlert = {
      alertId: `ALT-${uuidv4().substring(0, 8).toUpperCase()}`,
      type: params.type,
      message: params.message,
      severity: params.severity,
      timestamp: new Date(),
      acknowledged: false,
    };
    this.alerts.push(alert);
    console.log(`[CostForecast] Alert: ${params.severity} - ${params.message}`);
  }

  /**
   * Generate cost forecast
   */
  generateForecast(environment: ExecutionEnvironment, forecastDays: number = 7): CostForecast {
    const budget = this.budgets.get(environment) || { daily: 1000, weekly: 5000, monthly: 20000 };
    
    // Get historical data (last 14 days)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const historicalRecords = this.costHistory.filter(r => 
      r.environment === environment && new Date(r.timestamp) >= twoWeeksAgo
    );

    // Calculate daily costs
    const dailyCosts: Map<string, number> = new Map();
    historicalRecords.forEach(r => {
      const dateKey = new Date(r.timestamp).toISOString().split("T")[0];
      dailyCosts.set(dateKey, (dailyCosts.get(dateKey) || 0) + r.costUnits);
    });

    const dailyCostValues = Array.from(dailyCosts.values());
    const dailyAverage = dailyCostValues.length > 0
      ? dailyCostValues.reduce((s, v) => s + v, 0) / dailyCostValues.length
      : 0;
    const weeklyAverage = dailyAverage * 7;
    const peakUsage = dailyCostValues.length > 0 ? Math.max(...dailyCostValues) : 0;

    // Determine trend
    let trend: "INCREASING" | "STABLE" | "DECREASING" = "STABLE";
    if (dailyCostValues.length >= 7) {
      const firstHalf = dailyCostValues.slice(0, Math.floor(dailyCostValues.length / 2));
      const secondHalf = dailyCostValues.slice(Math.floor(dailyCostValues.length / 2));
      const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
      
      if (secondAvg > firstAvg * 1.15) trend = "INCREASING";
      else if (secondAvg < firstAvg * 0.85) trend = "DECREASING";
    }

    // Calculate forecast
    const expectedCost = dailyAverage * forecastDays;
    const variance = dailyCostValues.length > 1
      ? Math.sqrt(dailyCostValues.reduce((s, v) => s + Math.pow(v - dailyAverage, 2), 0) / dailyCostValues.length)
      : dailyAverage * 0.2;
    
    const lowEstimate = Math.max(0, expectedCost - variance * forecastDays * 0.5);
    const highEstimate = expectedCost + variance * forecastDays * 0.5;
    const confidence = dailyCostValues.length >= 7 ? 85 : dailyCostValues.length >= 3 ? 60 : 30;

    // Calculate current usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCost = this.costHistory
      .filter(r => r.environment === environment && new Date(r.timestamp) >= today)
      .reduce((sum, r) => sum + r.costUnits, 0);

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekCost = this.costHistory
      .filter(r => r.environment === environment && new Date(r.timestamp) >= weekStart)
      .reduce((sum, r) => sum + r.costUnits, 0);

    // Calculate risk level
    const usagePercent = (weekCost / budget.weekly) * 100;
    let riskLevel: "SAFE" | "WARNING" | "CRITICAL" = "SAFE";
    if (usagePercent >= 90) riskLevel = "CRITICAL";
    else if (usagePercent >= 75) riskLevel = "WARNING";

    // Calculate days until budget exhausted
    const remainingBudget = budget.weekly - weekCost;
    const daysUntilExhausted = dailyAverage > 0 ? Math.floor(remainingBudget / dailyAverage) : undefined;

    // Generate recommendations
    const recommendations: string[] = [];
    if (trend === "INCREASING") {
      recommendations.push("Cost trend is increasing. Consider reviewing test execution patterns.");
    }
    if (riskLevel === "WARNING" || riskLevel === "CRITICAL") {
      recommendations.push(`Budget risk detected. Current usage: ${usagePercent.toFixed(1)}% of weekly budget.`);
    }
    if (expectedCost > budget.weekly) {
      recommendations.push(`Forecast exceeds weekly budget by ${(expectedCost - budget.weekly).toFixed(0)} units.`);
    }
    if (peakUsage > dailyAverage * 2) {
      recommendations.push("Significant peak usage detected. Consider load balancing executions.");
    }

    // Get unacknowledged alerts
    const activeAlerts = this.alerts.filter(a => !a.acknowledged);

    return {
      forecastId: `FCT-${uuidv4().substring(0, 8).toUpperCase()}`,
      generatedAt: new Date(),
      period: {
        start: new Date(),
        end: new Date(Date.now() + forecastDays * 24 * 60 * 60 * 1000),
      },
      environment,
      historicalData: {
        dailyAverage: Math.round(dailyAverage),
        weeklyAverage: Math.round(weeklyAverage),
        peakUsage: Math.round(peakUsage),
        trend,
      },
      forecast: {
        expectedCost: Math.round(expectedCost),
        lowEstimate: Math.round(lowEstimate),
        highEstimate: Math.round(highEstimate),
        confidence,
      },
      budget: {
        allocated: budget.weekly,
        used: Math.round(weekCost),
        remaining: Math.round(remainingBudget),
        riskLevel,
        daysUntilExhausted,
      },
      recommendations,
      alerts: activeAlerts,
    };
  }

  /**
   * Get cost history for an environment
   */
  getCostHistory(environment: ExecutionEnvironment, days: number = 30): CostRecord[] {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.costHistory
      .filter(r => r.environment === environment && new Date(r.timestamp) >= cutoff)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Get daily cost breakdown
   */
  getDailyCostBreakdown(environment: ExecutionEnvironment, days: number = 14): { date: string; cost: number }[] {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const records = this.costHistory.filter(r => 
      r.environment === environment && new Date(r.timestamp) >= cutoff
    );

    const dailyCosts: Map<string, number> = new Map();
    records.forEach(r => {
      const dateKey = new Date(r.timestamp).toISOString().split("T")[0];
      dailyCosts.set(dateKey, (dailyCosts.get(dateKey) || 0) + r.costUnits);
    });

    return Array.from(dailyCosts.entries())
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Set budget for environment
   */
  setBudget(environment: ExecutionEnvironment, daily: number, weekly?: number, monthly?: number): void {
    this.budgets.set(environment, {
      daily,
      weekly: weekly || daily * 7,
      monthly: monthly || daily * 30,
    });
    console.log(`[CostForecast] Budget updated for ${environment}: ${daily}/day`);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string, by: string): void {
    const alert = this.alerts.find(a => a.alertId === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = by;
      console.log(`[CostForecast] Alert ${alertId} acknowledged by ${by}`);
    }
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): CostAlert[] {
    return this.alerts.filter(a => !a.acknowledged);
  }

  /**
   * Get cost statistics
   */
  getStatistics(): {
    totalCostAllTime: number;
    last7Days: number;
    last30Days: number;
    byEnvironment: Record<string, number>;
    byCapability: Record<string, number>;
  } {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const byEnv: Record<string, number> = {};
    const byCap: Record<string, number> = {};

    this.costHistory.forEach(r => {
      byEnv[r.environment] = (byEnv[r.environment] || 0) + r.costUnits;
      byCap[r.capability] = (byCap[r.capability] || 0) + r.costUnits;
    });

    return {
      totalCostAllTime: this.costHistory.reduce((s, r) => s + r.costUnits, 0),
      last7Days: this.costHistory
        .filter(r => new Date(r.timestamp) >= sevenDaysAgo)
        .reduce((s, r) => s + r.costUnits, 0),
      last30Days: this.costHistory
        .filter(r => new Date(r.timestamp) >= thirtyDaysAgo)
        .reduce((s, r) => s + r.costUnits, 0),
      byEnvironment: byEnv,
      byCapability: byCap,
    };
  }
}

// ============================================
// EXPORT SINGLETONS
// ============================================

export const approvalWorkflow = new ApprovalWorkflowManager();
export const complianceExport = new ComplianceExportManager();
export const flakyTestDetection = new FlakyTestDetectionEngine();
export const costForecasting = new CostForecastingEngine();

console.log("[Enterprise Compliance] All modules initialized:");
console.log("  ✅ Approval Workflow Manager");
console.log("  ✅ Compliance Export Manager");
console.log("  ✅ Flaky Test Detection Engine");
console.log("  ✅ Cost Forecasting Engine");
