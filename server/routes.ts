// @ts-nocheck
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getAiClient } from "./ai-client";
import { z } from "zod";
import {
  insertTestSuiteSchema,
  insertTestCaseSchema,
  insertTestAgentSchema,
  insertTestExecutionSchema,
  insertPlatformSettingSchema,
  insertEnvironmentSchema,
  insertTestDataPoolSchema,
  insertVisualBaselineSchema,
  insertApiMockSchema,
  insertCicdWebhookSchema,
  insertRoleSchema,
  insertMobileDeviceSchema,
  insertProjectSchema,
  insertTeamMembershipSchema,
} from "@shared/schema";
import { aiTestExecutor } from "./ai-test-executor";
import { apiTestExecutor } from "./api-test-executor";
import { setupAuth, isAuthenticated, createUser, getUserByEmail } from "./auth";
import { addProjectMemberSchema } from "@shared/models/auth";
import {
  getPredictiveFailureAnalysis,
  getTestOptimizationRecommendations,
  getPassFailStats,
  storeTestResult,
} from './reportAnalytics';
import { APP_PROFILES, APP_PROFILE_CATEGORIES } from "./app-profiles";
import { sendTestNotification } from "./notifications";
import { salesforceExecutor, type SalesforceConfig } from "./salesforce-executor";
import { jdeExecutor, JDEAisClient, type JDEConfig } from "./jde-executor";
import { resolveAuth, testAuthConfig, saveAuthConfig, loadAuthConfigs, generateTOTP } from "./enterprise-auth";
import { sapFioriExecutor, type SAPFioriConfig } from "./sap-fiori-executor";
import { sapGuiExecutor, type SAPGUIConfig } from "./sap-gui-executor";
import { testScheduler } from "./test-scheduler";
import { dotNetDesktopExecutor, type DotNetDesktopConfig } from "./dotnet-desktop-executor";
import { mobileExecutor, type MobileConfig } from "./mobile-executor";
import { javaDesktopExecutor, type JavaDesktopConfig } from "./java-desktop-executor";
import { visualRegressionEngine } from "./visual-regression-engine";
// import { aiTestHealer } from "./ai-test-healer";  // DEPRECATED - Using unified healer
import { unifiedAIHealer } from "./unified-ai-healer";  // NEW: Single unified healer engine
import { deepAPIExecutor } from "./deep-api-executor";
import { performanceBenchmark } from "./performance-benchmark";
import { testDataFactory } from "./test-data-factory";
import { cicdEngine, type CICDProvider, verifyGitHubSignature, verifyGitLabToken, parseGitHubEvent, parseGitLabEvent, parseJenkinsEvent, parseAzureDevOpsEvent } from "./cicd-engine";
import { coverageMatrix } from "./coverage-matrix";
import { logAudit, getAuditLog, getAuditStats } from "./audit-log";
import { healthMonitor } from "./health-monitor";
import { WORLD_CLASS_TEST_GENERATION_PROMPT } from "./world-class-prompt";
import { TestCaseValidator } from "./test-case-validator";
import {
  generateRuleBasedTests,
  generateRuleBasedScript,
  generateCombinedRuleBasedScript as generateRuleBasedCombinedScript,
} from "./test-generation-rules";
import {
  buildJDESystemPrompt,
  extractJDEObjectsFromText,
  getJDEObjectKnowledge,
  JDE_DOCUMENT_STRUCTURING_PROMPT,
  JDE_TEST_GENERATION_PROMPT,
} from "./jde-knowledge-base";
import {
  classifyJDEDocument,
  resolveTestTypes,
  getModuleGovernanceRules,
} from "./jde-document-classifier";
import {
  validateJDETestCases,
  autoCorrectTestCases,
} from "./jde-test-validator";
import {
  generateJDERuleBasedTests,
} from "./jde-rule-based-generator";
import knowledgeBaseRoutes from "./knowledge-routes";
import multer from "multer";
import nodePath from "path";
import * as XLSX from "xlsx";
import {
  CanonicalTestCase,
  CanonicalTestStep,
  ActionTypes,
  validateCanonicalTestCase,
  parseExcelToCanonical,
  classifyActionType,
  extractTargetValue,
  generatePlaywrightCode,
  generateCypressCode,
  generateSeleniumCode,
  generatePuppeteerCode,
  generateAutomationCode,
  objectRepository,
} from "./canonical-test-case";

// In-memory upload for spec documents (PDF/DOCX/TXT, max 50 MB)
const specUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50*1024*1024 }, fileFilter: (_r:any,f:any,cb:any)=>{ cb(null,[".pdf",".docx",".doc",".txt",".md"].includes(nodePath.extname(f.originalname).toLowerCase())); } });

// In-memory upload for Excel/CSV files (max 20 MB)
const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20*1024*1024 } });

// Partial schemas for PATCH operations
const partialTestSuiteSchema = insertTestSuiteSchema.partial();
const partialTestCaseSchema = insertTestCaseSchema.partial();
const partialTestAgentSchema = insertTestAgentSchema.partial();

// Custom schemas for generation endpoints
const generateTestsSchema = z.object({
  // Core
  title: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  appType: z.string().optional(),
  appHints: z.string().optional(),
  includeE2E: z.boolean().optional().default(false),
  testDepth: z.enum(["standard", "comprehensive", "exhaustive"]).optional().default("comprehensive"),
  // Architect Context Fields
  appName: z.string().optional(),
  moduleName: z.string().optional(),
  businessUseCase: z.string().optional(),
  userRoles: z.string().optional(),
  appContext: z.string().optional(),
  functionalRequirements: z.string().optional(),
  nonFunctionalRequirements: z.string().optional(),
  apiDetails: z.string().optional(),
  uiWorkflow: z.string().optional(),
  dataVariations: z.string().optional(),
  environment: z.string().optional(),
  targetUrl: z.string().optional(),
});

const generateScriptSchema = z.object({
  testCaseId: z.string().min(1, "Test case ID is required"),
  framework: z.enum(["playwright", "cypress", "selenium", "puppeteer"]),
  language: z.enum(["typescript", "javascript", "python", "java", "csharp"]),
});

const generateCombinedScriptSchema = z.object({
  testCaseIds: z.array(z.string()).min(1, "At least one test case ID is required"),
  framework: z.enum(["playwright", "cypress", "selenium", "puppeteer"]).default("playwright"),
  language: z.enum(["typescript", "javascript", "python", "java", "csharp"]).default("typescript"),
});

const testDataParamSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  type: z.enum(["text", "password", "email", "url", "number"]),
  description: z.string().optional(),
});

const createExecutionSchema = z.object({
  suiteId: z.string().optional().nullable(),
  agentId: z.string().optional().nullable(),
  targetUrl: z.string().url("Valid URL is required"),
  framework: z.enum(["playwright", "puppeteer", "selenium"]).optional().default("playwright"),
  testData: z.array(testDataParamSchema).optional(),
  environment: z.enum(["development", "staging", "production"]).optional(),
  selfHealing: z.boolean().optional().default(true),
  maxRetries: z.number().min(1).max(5).optional().default(3),
});

const importTestCasesSchema = z.object({
  suiteId: z.string().optional().nullable(),
  testCases: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    preconditions: z.string().optional(),
    targetUrl: z.string().optional(),
    steps: z.array(z.object({
      step: z.string(),
      expected: z.string(),
    })).optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    tags: z.array(z.string()).optional(),
  })),
});


// Helper for validation
function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return { success: false, error: result.error.errors.map(e => e.message).join(", ") };
  }
  return { success: true, data: result.data };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Health check endpoints MUST be registered BEFORE auth middleware
  // to ensure they are publicly accessible for container orchestration
  
  // Liveness probe - lightweight check that app is running (no auth, no DB)
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      version: "1.0.0"
    });
  });

  // Readiness probe - verifies app is ready to accept traffic (checks DB)
  app.get("/api/ready", async (req: Request, res: Response) => {
    try {
      // Quick DB connectivity check
      await storage.getAllTestSuites();
      res.json({ 
        status: "ready", 
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({ 
        status: "not_ready", 
        timestamp: new Date().toISOString(),
        error: "Database connection failed"
      });
    }
  });

  // Setup authentication after health endpoints
  await setupAuth(app);

  // ========================================
  // KNOWLEDGE BASE ROUTES
  // ========================================
  app.use("/api/knowledge", knowledgeBaseRoutes);
  console.log("[Routes] Knowledge Base routes registered at /api/knowledge");

  // ========================================
  // COVERAGE MATRIX ROUTES
  // ========================================
  app.get("/api/coverage/matrix", async (req: Request, res: Response) => {
    try {
      const { suiteId } = req.query;
      console.log("[Coverage Matrix] Building matrix, suiteId:", suiteId || "all");
      const matrix = await coverageMatrix.buildMatrix(suiteId as string | undefined);
      console.log("[Coverage Matrix] Built matrix with", matrix.requirements.length, "requirements,", matrix.stats.totalTestCases, "test cases");
      res.json(matrix);
    } catch (error: any) {
      console.error("[Coverage Matrix] Error:", error);
      res.status(500).json({ error: error.message || "Failed to build coverage matrix" });
    }
  });

  app.get("/api/coverage/requirement/:id", async (req: Request, res: Response) => {
    try {
      const coverage = await coverageMatrix.getRequirementCoverage(req.params.id);
      res.json(coverage);
    } catch (error: any) {
      console.error("[Coverage Matrix] Error getting requirement coverage:", error);
      res.status(404).json({ error: error.message || "Requirement not found" });
    }
  });
  console.log("[Routes] Coverage Matrix routes registered at /api/coverage");

  // ========================================
  // ENTERPRISE COVERAGE ANALYTICS
  // Multi-dimensional coverage: Process, Object, Table, API, Negative
  // ========================================
  const { enterpriseCoverageAnalytics, CoverageExtractor } = await import("./enterprise-coverage-analytics");
  
  // Get enterprise coverage dashboard
  app.get("/api/coverage/enterprise", async (_req: Request, res: Response) => {
    try {
      console.log("[Enterprise Coverage] Building dashboard...");
      const dashboard = await enterpriseCoverageAnalytics.buildDashboard();
      console.log("[Enterprise Coverage] Dashboard built, overall coverage:", dashboard.summary.overallCoverage + "%");
      res.json(dashboard);
    } catch (error: any) {
      console.error("[Enterprise Coverage] Error:", error);
      res.status(500).json({ error: error.message || "Failed to build enterprise coverage dashboard" });
    }
  });
  
  // Extract coverage from a test case
  app.post("/api/coverage/extract", async (req: Request, res: Response) => {
    try {
      const { testCase } = req.body;
      if (!testCase) {
        return res.status(400).json({ error: "testCase is required" });
      }
      const metrics = CoverageExtractor.extractCoverageKeys(testCase);
      res.json({
        testCaseId: testCase.id,
        metricsCount: metrics.length,
        metrics,
        applicationType: CoverageExtractor.detectApplicationType(JSON.stringify(testCase)),
      });
    } catch (error: any) {
      console.error("[Coverage Extract] Error:", error);
      res.status(500).json({ error: error.message || "Failed to extract coverage" });
    }
  });
  
  // Get process coverage for JDE/SAP
  app.get("/api/coverage/process/:processId", async (req: Request, res: Response) => {
    try {
      await enterpriseCoverageAnalytics.processAllTestCases();
      const coverage = enterpriseCoverageAnalytics.calculateProcessCoverage(req.params.processId);
      res.json({
        processId: req.params.processId,
        ...coverage,
      });
    } catch (error: any) {
      console.error("[Process Coverage] Error:", error);
      res.status(500).json({ error: error.message || "Failed to calculate process coverage" });
    }
  });
  
  // Get object coverage by application type
  app.get("/api/coverage/objects/:appType", async (req: Request, res: Response) => {
    try {
      await enterpriseCoverageAnalytics.processAllTestCases();
      const appType = req.params.appType.toUpperCase() as any;
      const coverage = enterpriseCoverageAnalytics.calculateObjectCoverage(appType);
      res.json({
        applicationType: appType,
        ...coverage,
      });
    } catch (error: any) {
      console.error("[Object Coverage] Error:", error);
      res.status(500).json({ error: error.message || "Failed to calculate object coverage" });
    }
  });
  
  // Get coverage gaps
  app.get("/api/coverage/gaps", async (_req: Request, res: Response) => {
    try {
      await enterpriseCoverageAnalytics.processAllTestCases();
      const gaps = enterpriseCoverageAnalytics.identifyGaps();
      res.json({
        totalGaps: gaps.length,
        criticalGaps: gaps.filter(g => g.severity === "critical").length,
        highGaps: gaps.filter(g => g.severity === "high").length,
        gaps,
      });
    } catch (error: any) {
      console.error("[Coverage Gaps] Error:", error);
      res.status(500).json({ error: error.message || "Failed to identify coverage gaps" });
    }
  });
  
  // Get test case coverage details
  app.get("/api/coverage/test-case/:testCaseId", async (req: Request, res: Response) => {
    try {
      const testCase = await storage.getTestCase(req.params.testCaseId);
      if (!testCase) {
        return res.status(404).json({ error: "Test case not found" });
      }
      const metrics = CoverageExtractor.extractCoverageKeys(testCase);
      res.json({
        testCaseId: req.params.testCaseId,
        title: testCase.title,
        metrics,
        applicationType: CoverageExtractor.detectApplicationType(JSON.stringify(testCase)),
      });
    } catch (error: any) {
      console.error("[Test Case Coverage] Error:", error);
      res.status(500).json({ error: error.message || "Failed to get test case coverage" });
    }
  });
  
  console.log("[Routes] Enterprise Coverage Analytics routes registered at /api/coverage/*");

  // ========================================
  // UNIFIED EXECUTION ADAPTER
  // Supports: JDE, SAP, Web, API, Mobile
  // ========================================
  const { unifiedExecutionController } = await import("./unified-execution-adapter");
  
  // Execute test case with unified adapter
  app.post("/api/execute/unified", async (req: Request, res: Response) => {
    try {
      const { testCaseId, targetUrl, credentials, config, testData } = req.body;
      
      if (!testCaseId) {
        return res.status(400).json({ error: "testCaseId is required" });
      }
      
      const testCase = await storage.getTestCase(testCaseId);
      if (!testCase) {
        return res.status(404).json({ error: "Test case not found" });
      }
      
      // Create execution record
      const execution = await storage.createExecution({
        suiteId: testCase.suiteId || undefined,
        targetUrl: targetUrl || testCase.targetUrl || "",
        framework: "unified",
        testData,
        environment: config?.environment || "staging",
        status: "running",
        totalTests: 1,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
      });
      
      console.log(`[Unified Execution] Starting execution ${execution.id} for test case ${testCaseId}`);
      
      // Initialize controller
      await unifiedExecutionController.initialize({
        executionId: execution.id,
        testCaseId: testCase.id,
        testCaseTitle: testCase.title,
        targetUrl: targetUrl || testCase.targetUrl,
        credentials,
        testData,
        config,
      });
      
      // Convert test case steps to adapter format
      const steps = (testCase.steps as any[] || []).map((s: any, idx: number) => ({
        stepNumber: idx + 1,
        actionType: s.actionType || s.step?.split(":")[0]?.toUpperCase() || "VERIFY",
        target: s.target || s.step?.split(":")[1]?.trim(),
        value: s.value,
        selector: s.selector,
        expectedResult: s.expected || s.expectedResult || "Step completes successfully",
        timeout: s.timeout,
        optional: s.optional,
        jdeProgram: s.jdeProgram,
        jdeTable: s.jdeTable,
        sapTCode: s.sapTCode,
        sapTable: s.sapTable,
        apiEndpoint: s.apiEndpoint,
        apiMethod: s.apiMethod,
      }));
      
      // Execute
      const summary = await unifiedExecutionController.executeTestCase(steps);
      
      // Cleanup
      await unifiedExecutionController.cleanup();
      
      // Update execution record
      await storage.updateExecution(execution.id, {
        status: summary.status.toLowerCase() as any,
        passedTests: summary.passedSteps > 0 ? 1 : 0,
        failedTests: summary.failedSteps > 0 ? 1 : 0,
        completedAt: new Date(),
      });
      
      // Store step results
      for (const result of summary.results) {
        await storage.createTestResult({
          executionId: execution.id,
          testCaseId,
          status: result.status.toLowerCase() as any,
          duration: result.duration,
          error: result.error,
          screenshot: result.screenshot,
          logs: result.logs,
        });
      }
      
      console.log(`[Unified Execution] Completed: ${summary.status}, ${summary.passedSteps}/${summary.totalSteps} passed`);
      
      res.json({
        executionId: execution.id,
        summary,
        coverage: {
          metricsExtracted: summary.coverageMetrics.length,
          adapterBreakdown: summary.adapterBreakdown,
        },
      });
      
    } catch (error: any) {
      console.error("[Unified Execution] Error:", error);
      res.status(500).json({ error: error.message || "Execution failed" });
    }
  });
  
  // Get supported adapters info
  app.get("/api/execute/adapters", (_req: Request, res: Response) => {
    res.json({
      adapters: [
        { type: "JDE", modes: ["UI", "BATCH", "DB"], description: "Oracle JD Edwards E1" },
        { type: "SAP", modes: ["UI", "API", "DB"], description: "SAP S/4HANA, ECC, Fiori" },
        { type: "SALESFORCE", modes: ["UI", "API"], description: "Salesforce Lightning" },
        { type: "WEB", modes: ["UI"], description: "Web applications (Playwright/Selenium)" },
        { type: "API", modes: ["API"], description: "REST/GraphQL/SOAP APIs" },
        { type: "MOBILE", modes: ["UI"], description: "iOS/Android apps (Appium)" },
      ],
      executionModes: ["UI", "BATCH", "API", "DB", "HYBRID"],
    });
  });
  
  console.log("[Routes] Unified Execution Adapter routes registered at /api/execute/*");

  // ========================================
  // AI TEST HEALER ROUTES
  // Automatically detect, diagnose, and fix broken test cases
  // ========================================
  
  // Analyze a single test case for healing suggestions
  app.post("/api/healer/analyse", async (req: Request, res: Response) => {
    try {
      const { testCaseId, autoHeal, appType } = req.body;
      
      if (!testCaseId) {
        return res.status(400).json({ error: "testCaseId is required" });
      }
      
      console.log(`[AI Healer] Analysing test case: ${testCaseId}, autoHeal: ${autoHeal}, appType: ${appType}`);
      
      const report = await unifiedAIHealer.analyseTestCase(testCaseId, { autoHeal, appType });
      
      console.log(`[AI Healer] Analysis complete: ${report.suggestions.length} suggestions, health: ${report.overallHealth}`);
      
      res.json(report);
    } catch (error: any) {
      console.error("[AI Healer] Error analysing test case:", error);
      res.status(500).json({ error: error.message || "Failed to analyse test case" });
    }
  });
  
  // Analyze all test cases in a suite
  app.post("/api/healer/analyse-suite", async (req: Request, res: Response) => {
    try {
      const { suiteId, autoHeal, appType } = req.body;
      
      if (!suiteId) {
        return res.status(400).json({ error: "suiteId is required" });
      }
      
      console.log(`[AI Healer] Analysing suite: ${suiteId}, autoHeal: ${autoHeal}, appType: ${appType}`);
      
      const result = await unifiedAIHealer.analyseSuite(suiteId, { autoHeal, appType });
      
      console.log(`[AI Healer] Suite analysis complete: ${result.stats.totalAnalysed} tests, ${result.stats.totalHealed} healed`);
      
      res.json(result);
    } catch (error: any) {
      console.error("[AI Healer] Error analysing suite:", error);
      res.status(500).json({ error: error.message || "Failed to analyse suite" });
    }
  });
  
  // Apply a specific heal suggestion
  app.post("/api/healer/apply", async (req: Request, res: Response) => {
    try {
      const { testCaseId, suggestion } = req.body;
      
      if (!testCaseId || !suggestion) {
        return res.status(400).json({ error: "testCaseId and suggestion are required" });
      }
      
      console.log(`[AI Healer] Applying heal to test case: ${testCaseId}, step: ${suggestion.stepIndex}`);
      
      const updatedTestCase = await unifiedAIHealer.applyHeal(testCaseId, suggestion);
      
      console.log(`[AI Healer] Heal applied successfully to "${updatedTestCase.title}"`);
      
      res.json({ 
        success: true, 
        testCase: updatedTestCase,
        message: `Successfully applied fix to step ${suggestion.stepIndex}`
      });
    } catch (error: any) {
      console.error("[AI Healer] Error applying heal:", error);
      res.status(500).json({ error: error.message || "Failed to apply heal" });
    }
  });
  
  // Get heal history for a test case
  app.get("/api/healer/history/:testCaseId", async (req: Request, res: Response) => {
    try {
      const { testCaseId } = req.params;
      
      console.log(`[AI Healer] Getting heal history for: ${testCaseId}`);
      
      const history = unifiedAIHealer.getHealHistory(testCaseId);
      
      res.json({
        testCaseId,
        historyCount: history.length,
        history
      });
    } catch (error: any) {
      console.error("[AI Healer] Error getting history:", error);
      res.status(500).json({ error: error.message || "Failed to get heal history" });
    }
  });
  
  console.log("[Routes] AI Test Healer routes registered at /api/healer/*");

  // ========================================
  // ENTERPRISE AI HEALER
  // State Machine Control, Rollback Logic, Confidence Scoring
  // Alternative Fix Ranking, Learning Engine, Global Selector Promotion
  // ========================================
  const { enterpriseAIHealer } = await import("./ai-healer-enterprise");

  // Start a new healing session (with full state machine)
  app.post("/api/healer/enterprise/session/start", async (req: Request, res: Response) => {
    try {
      const { testCaseId, environment, appType } = req.body;
      const user = (req as any).user;
      
      if (!testCaseId) {
        return res.status(400).json({ error: "testCaseId is required" });
      }
      
      console.log(`[Enterprise Healer] Starting session for: ${testCaseId}`);
      
      const session = await enterpriseAIHealer.startHealingSession(testCaseId, {
        triggeredBy: user?.email || "manual",
        environment: (environment || "QA").toUpperCase() as any,
        appType,
      });
      
      res.status(201).json({
        message: "Healing session started",
        session,
        nextAction: session.proposedFixes.length > 0 
          ? "Review proposed fixes and select one to apply" 
          : "No fixes proposed - test may be healthy"
      });
    } catch (error: any) {
      console.error("[Enterprise Healer] Error starting session:", error);
      res.status(500).json({ error: error.message || "Failed to start healing session" });
    }
  });

  // Get healing session details
  app.get("/api/healer/enterprise/session/:sessionId", async (req: Request, res: Response) => {
    try {
      const session = enterpriseAIHealer.getSession(req.params.sessionId);
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all active sessions
  app.get("/api/healer/enterprise/sessions/active", async (_req: Request, res: Response) => {
    try {
      const sessions = enterpriseAIHealer.getActiveSessions();
      res.json({
        count: sessions.length,
        sessions
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get session history
  app.get("/api/healer/enterprise/sessions/history", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const history = enterpriseAIHealer.getSessionHistory(limit);
      res.json({
        count: history.length,
        sessions: history
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Apply fix with full validation workflow (THE SAFE WAY)
  app.post("/api/healer/enterprise/session/:sessionId/apply", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { suggestionId, requireApproval } = req.body;
      
      if (!suggestionId) {
        return res.status(400).json({ error: "suggestionId is required" });
      }
      
      console.log(`[Enterprise Healer] Applying fix ${suggestionId} in session ${sessionId}`);
      
      const result = await enterpriseAIHealer.applyFixWithValidation(sessionId, suggestionId, {
        requireApproval
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("[Enterprise Healer] Error applying fix:", error);
      res.status(500).json({ error: error.message || "Failed to apply fix" });
    }
  });

  // Approve pending fix (for manual approval workflow)
  app.post("/api/healer/enterprise/session/:sessionId/approve", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const user = (req as any).user;
      
      const result = await enterpriseAIHealer.approveAndApplyFix(
        sessionId, 
        user?.email || "approver"
      );
      
      res.json(result);
    } catch (error: any) {
      console.error("[Enterprise Healer] Error approving fix:", error);
      res.status(500).json({ error: error.message || "Failed to approve fix" });
    }
  });

  // Cancel a session
  app.post("/api/healer/enterprise/session/:sessionId/cancel", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { reason } = req.body;
      
      enterpriseAIHealer.cancelSession(sessionId, reason || "User cancelled");
      
      res.json({ 
        success: true, 
        message: "Session cancelled" 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get alternative fixes for a suggestion
  app.get("/api/healer/enterprise/session/:sessionId/alternatives/:suggestionId", async (req: Request, res: Response) => {
    try {
      const { sessionId, suggestionId } = req.params;
      
      const alternatives = await enterpriseAIHealer.getAlternativeFixes(sessionId, suggestionId);
      
      res.json({
        suggestionId,
        count: alternatives.length,
        alternatives
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get confidence thresholds for environment
  app.get("/api/healer/enterprise/confidence/:environment", async (req: Request, res: Response) => {
    try {
      const thresholds = enterpriseAIHealer.getConfidenceThreshold(req.params.environment);
      res.json({
        environment: req.params.environment,
        ...thresholds
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Learning Engine Routes ─────────────────────────────────────────────────

  // Get learning insights
  app.get("/api/healer/enterprise/learning/insights", async (_req: Request, res: Response) => {
    try {
      const insights = enterpriseAIHealer.getLearningInsights();
      res.json(insights);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Global Selector Promotion Routes ───────────────────────────────────────

  // Request selector promotion
  app.post("/api/healer/enterprise/selectors/promote", async (req: Request, res: Response) => {
    try {
      const { sessionId, suggestion, logicalName } = req.body;
      const user = (req as any).user;
      
      if (!sessionId || !suggestion || !logicalName) {
        return res.status(400).json({ 
          error: "sessionId, suggestion, and logicalName are required" 
        });
      }
      
      const request = await enterpriseAIHealer.requestSelectorPromotion(
        sessionId,
        suggestion,
        logicalName,
        user?.email || "unknown"
      );
      
      res.status(201).json({
        message: "Promotion request created",
        request
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get pending promotions
  app.get("/api/healer/enterprise/selectors/pending", async (_req: Request, res: Response) => {
    try {
      const pending = enterpriseAIHealer.getPendingPromotions();
      res.json({
        count: pending.length,
        requests: pending
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Approve promotion
  app.post("/api/healer/enterprise/selectors/promote/:requestId/approve", async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
      const { notes } = req.body;
      const user = (req as any).user;
      
      const result = await enterpriseAIHealer.approvePromotion(
        requestId,
        user?.email || "approver",
        notes
      );
      
      res.json({
        message: "Promotion approved and applied",
        ...result
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reject promotion
  app.post("/api/healer/enterprise/selectors/promote/:requestId/reject", async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
      const { notes } = req.body;
      const user = (req as any).user;
      
      if (!notes) {
        return res.status(400).json({ error: "Rejection notes are required" });
      }
      
      enterpriseAIHealer.rejectPromotion(
        requestId,
        user?.email || "reviewer",
        notes
      );
      
      res.json({ 
        success: true, 
        message: "Promotion rejected" 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Healer KPI Dashboard Routes ────────────────────────────────────────────

  // Get comprehensive KPIs
  app.get("/api/healer/enterprise/kpis", async (_req: Request, res: Response) => {
    try {
      const kpis = enterpriseAIHealer.getKPIs();
      res.json(kpis);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get dashboard summary
  app.get("/api/healer/enterprise/dashboard", async (_req: Request, res: Response) => {
    try {
      const kpis = enterpriseAIHealer.getKPIs();
      const activeSessions = enterpriseAIHealer.getActiveSessions();
      const recentHistory = enterpriseAIHealer.getSessionHistory(10);
      const learning = enterpriseAIHealer.getLearningInsights();
      const pendingPromotions = enterpriseAIHealer.getPendingPromotions();
      
      res.json({
        summary: {
          activeSessions: activeSessions.length,
          healSuccessRate: kpis.healSuccessRate.toFixed(1) + "%",
          avgConfidence: kpis.avgConfidenceScore.toFixed(0),
          regressionsBlocked: kpis.regressionsPrevented,
          totalHeals: kpis.successfulHeals,
        },
        kpis,
        activeSessions,
        recentHistory,
        learning: {
          totalRecords: learning.totalRecords,
          topPatterns: learning.topSuccessfulPatterns.slice(0, 3),
          recommendations: learning.recommendations,
        },
        pendingPromotions: pendingPromotions.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[Routes] Enterprise AI Healer routes registered at /api/healer/enterprise/*");
  console.log("  ✅ Session Management: /api/healer/enterprise/session/*");
  console.log("  ✅ Alternative Fixes: /api/healer/enterprise/session/:id/alternatives/*");
  console.log("  ✅ Learning Engine: /api/healer/enterprise/learning/*");
  console.log("  ✅ Selector Promotion: /api/healer/enterprise/selectors/*");
  console.log("  ✅ KPI Dashboard: /api/healer/enterprise/kpis, /dashboard");

  // ========================================
  // ENTERPRISE AGENT MANAGEMENT
  // Capabilities-aware routing, trust levels, cost throttling, audit logs
  // ========================================
  const { enterpriseAgentManager } = await import("./enterprise-agent-manager");

  // Get enterprise agent dashboard
  app.get("/api/enterprise/agents/dashboard", async (_req: Request, res: Response) => {
    try {
      const dashboard = enterpriseAgentManager.getDashboardData();
      res.json(dashboard);
    } catch (error: any) {
      console.error("[Enterprise Agents] Dashboard error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all enterprise agents
  app.get("/api/enterprise/agents", async (req: Request, res: Response) => {
    try {
      const { group, type } = req.query;
      let agents = enterpriseAgentManager.getAllAgents();
      
      if (group) {
        agents = agents.filter(a => a.group === group);
      }
      if (type) {
        agents = agents.filter(a => a.type === type);
      }
      
      res.json({
        total: agents.length,
        agents,
        stats: enterpriseAgentManager.getAgentStats()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get agents by group
  app.get("/api/enterprise/agents/group/:group", async (req: Request, res: Response) => {
    try {
      const group = req.params.group.toUpperCase() as any;
      const agents = enterpriseAgentManager.getAgentsByGroup(group);
      const online = agents.filter(a => a.status === "ONLINE" || a.status === "BUSY");
      
      res.json({
        group,
        total: agents.length,
        online: online.length,
        offline: agents.length - online.length,
        agents
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Register enterprise agent
  app.post("/api/enterprise/agents/register", async (req: Request, res: Response) => {
    try {
      const { name, description, type, group, trustLevel, capabilities, environment, os, tags, maxConcurrentExecutions } = req.body;
      
      if (!name || !type || !group) {
        return res.status(400).json({ error: "name, type, and group are required" });
      }
      
      const agent = enterpriseAgentManager.registerAgent({
        name,
        description,
        type: type.toUpperCase(),
        group: group.toUpperCase(),
        trustLevel: (trustLevel || "LOW").toUpperCase(),
        capabilities: capabilities || { web: true, api: true, jde: false, sap: false, mobile: false, database: false },
        environment: environment || group,
        os,
        tags: tags || [],
        metadata: {},
        status: "OFFLINE",
        maxConcurrentExecutions: maxConcurrentExecutions || 5,
        lastSeenAt: null,
      });
      
      // Generate API key for agent
      const apiKey = `aitas_ent_${agent.agentId.substring(0, 12)}_${Date.now().toString(36)}`;
      
      res.status(201).json({
        agent,
        apiKey,
        heartbeatEndpoint: "/api/enterprise/agents/:agentId/heartbeat",
        heartbeatIntervalMs: 30000,
        installInstructions: {
          step1: `curl -O https://aitas.io/install-agent.sh`,
          step2: `./install-agent.sh --env ${group} --capabilities ${Object.entries(capabilities || {}).filter(([,v]) => v).map(([k]) => k).join(",")}`,
          step3: "Agent will auto-register and appear in the dashboard"
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Agent heartbeat
  app.post("/api/enterprise/agents/:agentId/heartbeat", async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const { cpu, memory, disk, secureTunnel } = req.body;
      
      const result = enterpriseAgentManager.processHeartbeat(agentId, { cpu, memory, disk, secureTunnel });
      
      if (!result.success) {
        return res.status(404).json({ error: "Agent not found" });
      }
      
      res.json({
        status: "ok",
        serverTime: new Date().toISOString(),
        nextHeartbeatIn: result.nextHeartbeatIn
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get agent health
  app.get("/api/enterprise/agents/:agentId/health", async (req: Request, res: Response) => {
    try {
      const agent = enterpriseAgentManager.getAgent(req.params.agentId);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      
      res.json({
        agentId: agent.agentId,
        name: agent.name,
        status: agent.status,
        health: agent.health,
        capabilities: agent.capabilities,
        group: agent.group,
        trustLevel: agent.trustLevel,
        currentExecutions: agent.currentExecutions,
        maxConcurrentExecutions: agent.maxConcurrentExecutions
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Execute test with enterprise routing
  app.post("/api/enterprise/execute", async (req: Request, res: Response) => {
    try {
      const { testCaseId, testCaseTitle, group, requiredCapabilities, priority, estimatedDurationMinutes } = req.body;
      
      if (!testCaseId || !group) {
        return res.status(400).json({ error: "testCaseId and group are required" });
      }
      
      const result = await enterpriseAgentManager.executeTest({
        testCaseId,
        testCaseTitle: testCaseTitle || `Test ${testCaseId}`,
        group: group.toUpperCase(),
        requiredCapabilities: requiredCapabilities || ["WEB"],
        priority: priority || 5,
        estimatedDurationMinutes: estimatedDurationMinutes || 5,
        userId: (req as any).user?.id
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Complete execution
  app.post("/api/enterprise/execute/:executionId/complete", async (req: Request, res: Response) => {
    try {
      const { executionId } = req.params;
      const { success, durationMinutes, error, failureType } = req.body;
      
      enterpriseAgentManager.completeExecution(
        executionId,
        success,
        durationMinutes || 1,
        error,
        failureType
      );
      
      res.json({ status: "ok" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get execution queue
  app.get("/api/enterprise/queue", async (req: Request, res: Response) => {
    try {
      const { group, status } = req.query;
      const executions = enterpriseAgentManager.getQueuedExecutions({
        group: group as any,
        status: status as any
      });
      const stats = enterpriseAgentManager.getQueueStats();
      
      res.json({
        executions,
        stats
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Process queue (trigger assignment)
  app.post("/api/enterprise/queue/process", async (_req: Request, res: Response) => {
    try {
      enterpriseAgentManager.processQueue();
      res.json({ status: "ok", message: "Queue processing triggered" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get cost budgets
  app.get("/api/enterprise/cost/budgets", async (_req: Request, res: Response) => {
    try {
      const budgets = enterpriseAgentManager.getCostBudgets();
      res.json({ budgets });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get cost budget for group
  app.get("/api/enterprise/cost/budgets/:group", async (req: Request, res: Response) => {
    try {
      const group = req.params.group.toUpperCase() as any;
      const budget = enterpriseAgentManager.getCostBudget(group);
      
      if (!budget) {
        return res.status(404).json({ error: "Budget not found" });
      }
      
      const usagePercent = Math.round((budget.usedUnits / budget.dailyBudgetUnits) * 100);
      
      res.json({
        ...budget,
        usagePercent,
        remaining: budget.dailyBudgetUnits - budget.usedUnits,
        status: usagePercent >= budget.alertThreshold ? "WARNING" : "HEALTHY"
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update cost budget
  app.put("/api/enterprise/cost/budgets/:group", async (req: Request, res: Response) => {
    try {
      const group = req.params.group.toUpperCase() as any;
      const { dailyBudgetUnits, alertThreshold } = req.body;
      
      if (!dailyBudgetUnits) {
        return res.status(400).json({ error: "dailyBudgetUnits is required" });
      }
      
      enterpriseAgentManager.setCostBudget(group, dailyBudgetUnits, alertThreshold);
      
      res.json({ status: "ok", message: `Budget updated for ${group}` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get audit logs
  app.get("/api/enterprise/audit", async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, actorType, actorId, action, resourceType, environment, severity, limit } = req.query;
      
      const logs = enterpriseAgentManager.getAuditLogs({
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        actorType: actorType as string,
        actorId: actorId as string,
        action: action as string,
        resourceType: resourceType as string,
        environment: environment as any,
        severity: severity as string,
        limit: limit ? parseInt(limit as string) : 100
      });
      
      const stats = enterpriseAgentManager.getAuditStats();
      
      res.json({
        logs,
        stats,
        total: logs.length
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get audit stats
  app.get("/api/enterprise/audit/stats", async (_req: Request, res: Response) => {
    try {
      const stats = enterpriseAgentManager.getAuditStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[Routes] Enterprise Agent Management routes registered at /api/enterprise/*");

  // ========================================
  // ENTERPRISE EXECUTION ROUTER
  // Intelligent routing of executions to appropriate agents
  // ========================================
  const { enterpriseExecutionRouter, detectRequiredCapabilities } = await import("./enterprise-execution-router");

  // Initialize the router (registers default agents)
  await enterpriseExecutionRouter.initialize();

  // Get Enterprise Router status
  app.get("/api/enterprise/router/status", (_req: Request, res: Response) => {
    try {
      const status = enterpriseExecutionRouter.getStatus();
      res.json({
        ...status,
        message: status.initialized 
          ? `Enterprise Router active with ${status.onlineAgents} online agents`
          : "Enterprise Router not initialized"
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Analyze test cases to detect required capabilities
  app.post("/api/enterprise/router/analyze", async (req: Request, res: Response) => {
    try {
      const { testCaseIds, targetUrl } = req.body;
      
      if (!testCaseIds || !Array.isArray(testCaseIds) || testCaseIds.length === 0) {
        return res.status(400).json({ error: "testCaseIds array is required" });
      }

      const testCases = await Promise.all(
        testCaseIds.map(id => storage.getTestCase(id))
      );
      const validTestCases = testCases.filter(tc => tc !== null) as any[];

      if (validTestCases.length === 0) {
        return res.status(404).json({ error: "No valid test cases found" });
      }

      const detection = detectRequiredCapabilities(validTestCases, targetUrl || "");

      res.json({
        testCaseCount: validTestCases.length,
        capabilities: detection.capabilities,
        detectedPatterns: detection.detectedPatterns,
        recommendedAgentType: detection.recommendedAgentType,
        confidence: detection.confidence,
        requiresEnterpriseAgent: detection.capabilities.some(
          c => ["JDE", "SAP", "MOBILE", "DATABASE"].includes(c)
        )
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Preview routing decision without executing
  app.post("/api/enterprise/router/preview", async (req: Request, res: Response) => {
    try {
      const { testCaseIds, targetUrl, environment, forceEnterpriseAgent } = req.body;

      if (!testCaseIds || !Array.isArray(testCaseIds) || testCaseIds.length === 0) {
        return res.status(400).json({ error: "testCaseIds array is required" });
      }

      const testCases = await Promise.all(
        testCaseIds.map(id => storage.getTestCase(id))
      );
      const validTestCases = testCases.filter(tc => tc !== null) as any[];

      if (validTestCases.length === 0) {
        return res.status(404).json({ error: "No valid test cases found" });
      }

      const routeResult = await enterpriseExecutionRouter.routeExecution({
        executionId: "preview",
        testCases: validTestCases,
        targetUrl: targetUrl || "",
        framework: "selenium",
        environment: environment || "QA",
        forceEnterpriseAgent
      });

      res.json({
        preview: true,
        routing: routeResult
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[Routes] Enterprise Execution Router routes registered at /api/enterprise/router/*");
  console.log("  ✅ GET /api/enterprise/router/status - Router status and agent count");
  console.log("  ✅ POST /api/enterprise/router/analyze - Analyze test cases for capabilities");
  console.log("  ✅ POST /api/enterprise/router/preview - Preview routing decision");

  // ========================================
  // LLM TEST ENGINE
  // Enterprise-grade testing for LLM/AI applications
  // 5-Layer Evaluation Framework:
  // 1. Prompt Tests - Schema & format validation
  // 2. Functional Tests - Semantic correctness via LLM-as-Judge
  // 3. RAG Tests - Context grounding, faithfulness, hallucination
  // 4. Safety Tests - Policy compliance, PII, bias detection
  // 5. Regression Tests - Golden comparison, drift detection
  // ========================================
  const { llmTestEngine } = await import("./llm-test-engine");

  // Get LLM test dashboard
  app.get("/api/llm-tests/dashboard", (_req: Request, res: Response) => {
    try {
      const dashboard = llmTestEngine.getDashboard();
      res.json(dashboard);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all LLM test cases
  app.get("/api/llm-tests/cases", (req: Request, res: Response) => {
    try {
      const { type } = req.query;
      let testCases = llmTestEngine.getAllTestCases();
      
      if (type) {
        testCases = testCases.filter(tc => tc.testType === type);
      }
      
      res.json({
        count: testCases.length,
        testCases
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get LLM test case by ID
  app.get("/api/llm-tests/cases/:testId", (req: Request, res: Response) => {
    try {
      const testCase = llmTestEngine.getTestCase(req.params.testId);
      
      if (!testCase) {
        return res.status(404).json({ error: "Test case not found" });
      }
      
      res.json(testCase);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a prompt test
  app.post("/api/llm-tests/cases/prompt", (req: Request, res: Response) => {
    try {
      const { name, prompt, systemPrompt, expectedFormat, schema, keywords, forbiddenKeywords } = req.body;
      
      if (!name || !prompt) {
        return res.status(400).json({ error: "name and prompt are required" });
      }
      
      const testCase = llmTestEngine.createPromptTest({
        name,
        prompt,
        systemPrompt,
        expectedFormat: expectedFormat || "TEXT",
        schema,
        keywords,
        forbiddenKeywords,
      });
      
      res.status(201).json(testCase);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a RAG test
  app.post("/api/llm-tests/cases/rag", (req: Request, res: Response) => {
    try {
      const { name, question, contexts, expectedGrounded, groundTruth } = req.body;
      
      if (!name || !question || !contexts || !Array.isArray(contexts)) {
        return res.status(400).json({ error: "name, question, and contexts array are required" });
      }
      
      const testCase = llmTestEngine.createRAGTest({
        name,
        question,
        contexts,
        expectedGrounded,
        groundTruth,
      });
      
      res.status(201).json(testCase);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a safety test
  app.post("/api/llm-tests/cases/safety", (req: Request, res: Response) => {
    try {
      const { name, prompt, checkPII, checkToxicity, checkBias, policyRules } = req.body;
      
      if (!name || !prompt) {
        return res.status(400).json({ error: "name and prompt are required" });
      }
      
      const testCase = llmTestEngine.createSafetyTest({
        name,
        prompt,
        checkPII,
        checkToxicity,
        checkBias,
        policyRules,
      });
      
      res.status(201).json(testCase);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a regression test
  app.post("/api/llm-tests/cases/regression", (req: Request, res: Response) => {
    try {
      const { name, prompt, systemPrompt, goldenOutput, goldenScores, driftThreshold } = req.body;
      
      if (!name || !prompt || !goldenOutput) {
        return res.status(400).json({ error: "name, prompt, and goldenOutput are required" });
      }
      
      const testCase = llmTestEngine.createRegressionTest({
        name,
        prompt,
        systemPrompt,
        goldenOutput,
        goldenScores: goldenScores || {},
        driftThreshold,
      });
      
      res.status(201).json(testCase);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Run a single LLM test
  app.post("/api/llm-tests/run/:testId", async (req: Request, res: Response) => {
    try {
      const result = await llmTestEngine.runTest(req.params.testId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Run multiple LLM tests
  app.post("/api/llm-tests/run", async (req: Request, res: Response) => {
    try {
      const { testIds, type } = req.body;
      const user = (req as any).user;
      
      let run;
      
      if (type) {
        // Run all tests of a specific type
        run = await llmTestEngine.runTestsByType(type, user?.email || "manual");
      } else if (testIds && Array.isArray(testIds)) {
        // Run specific tests
        run = await llmTestEngine.runTests(testIds, user?.email || "manual");
      } else {
        return res.status(400).json({ error: "Either testIds array or type is required" });
      }
      
      res.json(run);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all test runs
  app.get("/api/llm-tests/runs", (_req: Request, res: Response) => {
    try {
      const runs = llmTestEngine.getAllTestRuns();
      res.json({
        count: runs.length,
        runs
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get test run by ID
  app.get("/api/llm-tests/runs/:runId", (req: Request, res: Response) => {
    try {
      const run = llmTestEngine.getTestRun(req.params.runId);
      
      if (!run) {
        return res.status(404).json({ error: "Test run not found" });
      }
      
      res.json(run);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get test history
  app.get("/api/llm-tests/history/:testId", (req: Request, res: Response) => {
    try {
      const history = llmTestEngine.getTestHistory(req.params.testId);
      const regression = llmTestEngine.detectRegression(req.params.testId);
      
      res.json({
        testId: req.params.testId,
        historyCount: history.length,
        regression,
        history
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Evaluate RAG quality
  app.post("/api/llm-tests/evaluate/rag", async (req: Request, res: Response) => {
    try {
      const { question, retrievedContexts, generatedAnswer, groundTruth } = req.body;
      
      if (!question || !retrievedContexts || !generatedAnswer) {
        return res.status(400).json({ 
          error: "question, retrievedContexts, and generatedAnswer are required" 
        });
      }
      
      const result = await llmTestEngine.evaluateRAG({
        question,
        retrievedContexts,
        generatedAnswer,
        groundTruth,
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get statistics
  app.get("/api/llm-tests/stats", (_req: Request, res: Response) => {
    try {
      const stats = llmTestEngine.getStatistics();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get available metrics
  app.get("/api/llm-tests/metrics", (_req: Request, res: Response) => {
    res.json({
      metrics: [
        { name: "RELEVANCE", description: "Answer matches intent", category: "Semantic" },
        { name: "FAITHFULNESS", description: "Uses provided context only", category: "RAG" },
        { name: "CORRECTNESS", description: "Domain-accurate", category: "Semantic" },
        { name: "COHERENCE", description: "Logical flow", category: "Quality" },
        { name: "COMPLETENESS", description: "Covers all aspects", category: "Quality" },
        { name: "FORMAT_COMPLIANCE", description: "Matches expected format", category: "Format" },
        { name: "SAFETY", description: "Policy compliant", category: "Safety" },
        { name: "HALLUCINATION_FREE", description: "No fabricated facts", category: "RAG" },
        { name: "BIAS_FREE", description: "No discriminatory content", category: "Safety" },
        { name: "GROUNDEDNESS", description: "Claims supported by context", category: "RAG" },
        { name: "CONTEXT_RELEVANCE", description: "Retrieved context is relevant", category: "RAG" },
        { name: "ANSWER_RELEVANCE", description: "Answer addresses the question", category: "RAG" },
        { name: "SEMANTIC_SIMILARITY", description: "Similarity to expected output", category: "Regression" },
        { name: "TOXICITY_FREE", description: "No harmful content", category: "Safety" },
        { name: "PII_SAFE", description: "No personal data leakage", category: "Safety" },
      ],
      testTypes: [
        { type: "PROMPT_TEST", description: "Validate prompt format and schema compliance" },
        { type: "FUNCTIONAL_TEST", description: "Semantic correctness via LLM-as-Judge" },
        { type: "RAG_TEST", description: "RAG quality - grounding, faithfulness, hallucination" },
        { type: "SAFETY_TEST", description: "Policy compliance, PII, bias detection" },
        { type: "REGRESSION_TEST", description: "Golden comparison and drift detection" },
      ],
    });
  });

  console.log("[Routes] LLM Test Engine routes registered at /api/llm-tests/*");
  console.log("  ✅ Dashboard: GET /api/llm-tests/dashboard");
  console.log("  ✅ Test Cases: GET/POST /api/llm-tests/cases/*");
  console.log("  ✅ Test Runs: POST /api/llm-tests/run, GET /api/llm-tests/runs");
  console.log("  ✅ RAG Evaluation: POST /api/llm-tests/evaluate/rag");
  console.log("  ✅ Regression Detection: GET /api/llm-tests/history/:testId");

  // ========================================
  // ENTERPRISE COMPLIANCE MODULE
  // 1. Approval Workflows for PROD Execution
  // 2. Compliance Export (CSV/PDF)
  // 3. Flaky Test Detection Engine
  // 4. Cost Forecasting using Historical Data
  // ========================================
  const { 
    approvalWorkflow, 
    complianceExport, 
    flakyTestDetection, 
    costForecasting 
  } = await import("./enterprise-compliance");

  // ----------------------------------------
  // 1. APPROVAL WORKFLOW ROUTES
  // ----------------------------------------

  // Check if environment requires approval
  app.get("/api/compliance/approval/required/:environment", (req: Request, res: Response) => {
    try {
      const environment = req.params.environment.toUpperCase() as any;
      const required = approvalWorkflow.requiresApproval(environment);
      const policy = approvalWorkflow.getPolicy(environment);
      
      res.json({
        environment,
        requiresApproval: required,
        policy: policy ? {
          requiredApproverRoles: policy.requiredApproverRoles,
          minApprovers: policy.minApprovers,
          expirationHours: policy.expirationHours,
        } : null
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create approval request for PROD execution
  app.post("/api/compliance/approval/request", (req: Request, res: Response) => {
    try {
      const { 
        executionId, 
        testCaseIds, 
        environment, 
        justification, 
        scheduledTime 
      } = req.body;

      if (!executionId || !testCaseIds || !environment) {
        return res.status(400).json({ 
          error: "executionId, testCaseIds, and environment are required" 
        });
      }

      if (!justification && environment === "PROD") {
        return res.status(400).json({ 
          error: "Justification is required for PROD execution" 
        });
      }

      const user = (req as any).user;
      
      const request = approvalWorkflow.createApprovalRequest({
        executionId,
        testCaseIds,
        environment: environment.toUpperCase(),
        requesterId: user?.id || "unknown",
        requesterName: user?.firstName ? `${user.firstName} ${user.lastName}` : user?.email || "Unknown User",
        requesterEmail: user?.email || "",
        justification: justification || "Standard execution request",
        scheduledTime: scheduledTime ? new Date(scheduledTime) : undefined,
      });

      res.status(201).json({
        message: "🔒 Production Execution Requires Approval",
        request,
        nextSteps: [
          "Request has been sent to approvers",
          "You will be notified when approved/rejected",
          "Approval expires in " + approvalWorkflow.getPolicy(environment)?.expirationHours + " hours"
        ]
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Approve execution request
  app.post("/api/compliance/approval/:requestId/approve", (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
      const { comment } = req.body;
      const user = (req as any).user;

      const approverName = user?.firstName ? `${user.firstName} ${user.lastName}` : user?.email || "Approver";
      
      const request = approvalWorkflow.approve(
        requestId,
        user?.id || "unknown",
        approverName,
        comment
      );

      res.json({
        message: "✅ Execution Approved",
        request,
        executionAllowed: true
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Reject execution request
  app.post("/api/compliance/approval/:requestId/reject", (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
      const { reason } = req.body;
      const user = (req as any).user;

      if (!reason) {
        return res.status(400).json({ error: "Rejection reason is required" });
      }

      const approverName = user?.firstName ? `${user.firstName} ${user.lastName}` : user?.email || "Approver";
      
      const request = approvalWorkflow.reject(
        requestId,
        user?.id || "unknown",
        approverName,
        reason
      );

      res.json({
        message: "❌ Execution Rejected",
        request,
        executionAllowed: false
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Check if execution can proceed (ENFORCEMENT GATE)
  app.get("/api/compliance/approval/check/:executionId/:environment", (req: Request, res: Response) => {
    try {
      const { executionId, environment } = req.params;
      const result = approvalWorkflow.canExecute(executionId, environment.toUpperCase() as any);
      
      res.json({
        executionId,
        environment: environment.toUpperCase(),
        ...result
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get pending approvals
  app.get("/api/compliance/approval/pending", (req: Request, res: Response) => {
    try {
      const { role } = req.query;
      const pending = approvalWorkflow.getPendingApprovals(role as any);
      
      res.json({
        count: pending.length,
        requests: pending
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get approval request details
  app.get("/api/compliance/approval/:requestId", (req: Request, res: Response) => {
    try {
      const request = approvalWorkflow.getRequest(req.params.requestId);
      
      if (!request) {
        return res.status(404).json({ error: "Approval request not found" });
      }
      
      res.json(request);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get approval statistics
  app.get("/api/compliance/approval/stats", (_req: Request, res: Response) => {
    try {
      const stats = approvalWorkflow.getStatistics();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update approval policy
  app.put("/api/compliance/approval/policy/:environment", (req: Request, res: Response) => {
    try {
      const environment = req.params.environment.toUpperCase() as any;
      const updates = req.body;
      
      const policy = approvalWorkflow.updatePolicy(environment, updates);
      
      res.json({
        message: `Policy updated for ${environment}`,
        policy
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[Routes] Approval Workflow routes registered at /api/compliance/approval/*");

  // ----------------------------------------
  // 2. COMPLIANCE EXPORT ROUTES
  // ----------------------------------------

  // Create compliance export request
  app.post("/api/compliance/export", async (req: Request, res: Response) => {
    try {
      const { exportType, format, dateRange, environment, filters } = req.body;
      const user = (req as any).user;

      if (!exportType || !format || !dateRange?.start || !dateRange?.end) {
        return res.status(400).json({ 
          error: "exportType, format, and dateRange (start/end) are required" 
        });
      }

      const exportRequest = await complianceExport.createExport({
        exportType,
        format,
        dateRange: {
          start: new Date(dateRange.start),
          end: new Date(dateRange.end),
        },
        environment,
        filters,
        requestedBy: user?.email || "unknown",
      });

      res.status(201).json({
        message: "Export request created",
        export: exportRequest
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Generate audit log CSV export
  app.post("/api/compliance/export/audit-csv", async (req: Request, res: Response) => {
    try {
      const { dateRange, environment } = req.body;
      
      // Get audit logs from enterprise agent manager
      const logs = enterpriseAgentManager.getAuditLogs({
        startDate: dateRange?.start ? new Date(dateRange.start) : undefined,
        endDate: dateRange?.end ? new Date(dateRange.end) : undefined,
        environment,
      });

      const csv = complianceExport.generateAuditLogCSV(logs);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=audit-log-${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Generate execution history CSV
  app.post("/api/compliance/export/executions-csv", async (req: Request, res: Response) => {
    try {
      const { dateRange, environment } = req.body;
      
      // Get executions from storage
      let executions = await storage.getAllExecutions();
      
      if (dateRange?.start) {
        const start = new Date(dateRange.start);
        executions = executions.filter(e => new Date(e.createdAt || 0) >= start);
      }
      if (dateRange?.end) {
        const end = new Date(dateRange.end);
        executions = executions.filter(e => new Date(e.createdAt || 0) <= end);
      }
      if (environment) {
        executions = executions.filter(e => e.environment === environment);
      }

      const csv = complianceExport.generateExecutionCSV(executions);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=executions-${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Generate approval history CSV
  app.post("/api/compliance/export/approvals-csv", async (req: Request, res: Response) => {
    try {
      const { environment } = req.body;
      
      let approvals = environment 
        ? approvalWorkflow.getRequestsByEnvironment(environment)
        : [...approvalWorkflow.getPendingApprovals(), ...approvalWorkflow.getRequestsByEnvironment("PROD")];

      const csv = complianceExport.generateApprovalCSV(approvals);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=approvals-${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Generate full compliance report (JSON format for PDF generation)
  app.post("/api/compliance/report", async (req: Request, res: Response) => {
    try {
      const { dateRange, environment } = req.body;
      const user = (req as any).user;

      if (!dateRange?.start || !dateRange?.end || !environment) {
        return res.status(400).json({ 
          error: "dateRange (start/end) and environment are required" 
        });
      }

      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);

      // Get all data
      let executions = await storage.getAllExecutions();
      executions = executions.filter(e => {
        const date = new Date(e.createdAt || 0);
        return date >= startDate && date <= endDate && e.environment === environment;
      });

      const approvals = approvalWorkflow.getRequestsByEnvironment(environment)
        .filter(a => a.requestedAt >= startDate && a.requestedAt <= endDate);

      const auditLogs = enterpriseAgentManager.getAuditLogs({
        startDate,
        endDate,
        environment,
      });

      // Generate report
      const report = complianceExport.generateComplianceReport({
        dateRange: { start: startDate, end: endDate },
        environment,
        executions,
        approvals,
        auditLogs,
        coverage: {
          overallCoverage: 0,
          requirementsCovered: 0,
          requirementsTotal: 0,
          byModule: [],
          byPriority: [],
        },
        generatedBy: user?.email || "unknown",
      });

      res.json(report);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get export history
  app.get("/api/compliance/export/history", (_req: Request, res: Response) => {
    try {
      const exports = complianceExport.getAllExports();
      res.json({
        count: exports.length,
        exports
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[Routes] Compliance Export routes registered at /api/compliance/export/*");

  // ----------------------------------------
  // 3. FLAKY TEST DETECTION ROUTES
  // ----------------------------------------

  // Record test execution (for flaky detection)
  app.post("/api/compliance/flaky/record", (req: Request, res: Response) => {
    try {
      const { 
        testCaseId, 
        testCaseTitle, 
        status, 
        duration, 
        environment, 
        agent, 
        error, 
        retryCount 
      } = req.body;

      if (!testCaseId || !status) {
        return res.status(400).json({ error: "testCaseId and status are required" });
      }

      flakyTestDetection.recordExecution({
        runId: `RUN-${Date.now()}`,
        testCaseId,
        testCaseTitle: testCaseTitle || testCaseId,
        status: status.toUpperCase(),
        duration: duration || 0,
        timestamp: new Date(),
        environment: (environment || "QA").toUpperCase(),
        agent: agent || "default",
        error,
        retryCount: retryCount || 0,
      });

      const analysis = flakyTestDetection.getAnalysis(testCaseId);

      res.json({
        message: "Execution recorded",
        analysis: analysis ? {
          stability: analysis.stability,
          flakinessScore: analysis.flakinessScore,
          recommendation: analysis.recommendation,
          excludeFromCI: analysis.excludeFromCI,
        } : null
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get flaky test analysis for a specific test
  app.get("/api/compliance/flaky/analysis/:testCaseId", (req: Request, res: Response) => {
    try {
      const analysis = flakyTestDetection.getAnalysis(req.params.testCaseId);
      
      if (!analysis) {
        return res.status(404).json({ 
          error: "No analysis available (need at least 5 runs)" 
        });
      }

      res.json(analysis);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all flaky tests
  app.get("/api/compliance/flaky/tests", (_req: Request, res: Response) => {
    try {
      const flakyTests = flakyTestDetection.getFlakyTests();
      
      res.json({
        count: flakyTests.length,
        tests: flakyTests.map(t => ({
          testCaseId: t.testCaseId,
          testCaseTitle: t.testCaseTitle,
          stability: t.stability,
          flakinessScore: t.flakinessScore,
          pattern: t.pattern,
          recommendation: t.recommendation,
          quarantined: t.quarantined,
        }))
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get quarantined tests
  app.get("/api/compliance/flaky/quarantined", (_req: Request, res: Response) => {
    try {
      const quarantined = flakyTestDetection.getQuarantinedTests();
      
      res.json({
        count: quarantined.length,
        tests: quarantined
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Quarantine a test
  app.post("/api/compliance/flaky/quarantine/:testCaseId", (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      flakyTestDetection.quarantineTest(
        req.params.testCaseId, 
        user?.email || "manual"
      );
      
      res.json({
        message: `Test ${req.params.testCaseId} quarantined`,
        testCaseId: req.params.testCaseId,
        quarantined: true
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Unquarantine a test
  app.post("/api/compliance/flaky/unquarantine/:testCaseId", (req: Request, res: Response) => {
    try {
      flakyTestDetection.unquarantineTest(req.params.testCaseId);
      
      res.json({
        message: `Test ${req.params.testCaseId} unquarantined`,
        testCaseId: req.params.testCaseId,
        quarantined: false
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Check if test should run in CI
  app.get("/api/compliance/flaky/ci-check/:testCaseId", (req: Request, res: Response) => {
    try {
      const shouldRun = flakyTestDetection.shouldRunInCI(req.params.testCaseId);
      const analysis = flakyTestDetection.getAnalysis(req.params.testCaseId);
      
      res.json({
        testCaseId: req.params.testCaseId,
        shouldRunInCI: shouldRun,
        reason: !shouldRun 
          ? (analysis?.quarantined ? "Test is quarantined" : "Test is flaky/unstable")
          : "Test is stable or unknown",
        indicator: analysis?.stability === "STABLE" ? "🟢" : 
                   analysis?.stability === "FLAKY" ? "🟡" : 
                   analysis?.stability === "UNSTABLE" ? "🔴" : "⚪"
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get flaky test statistics
  app.get("/api/compliance/flaky/stats", (_req: Request, res: Response) => {
    try {
      const stats = flakyTestDetection.getStatistics();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[Routes] Flaky Test Detection routes registered at /api/compliance/flaky/*");

  // ----------------------------------------
  // 4. COST FORECASTING ROUTES
  // ----------------------------------------

  // Record execution cost
  app.post("/api/compliance/cost/record", (req: Request, res: Response) => {
    try {
      const { 
        executionId, 
        testCaseId, 
        environment, 
        costUnits, 
        capability, 
        agent, 
        duration 
      } = req.body;

      if (!executionId || !testCaseId || !environment || costUnits === undefined) {
        return res.status(400).json({ 
          error: "executionId, testCaseId, environment, and costUnits are required" 
        });
      }

      costForecasting.recordCost({
        recordId: `COST-${Date.now()}`,
        executionId,
        testCaseId,
        environment: environment.toUpperCase(),
        costUnits,
        capability: capability || "WEB",
        timestamp: new Date(),
        agent: agent || "default",
        duration: duration || 0,
      });

      res.json({
        message: "Cost recorded",
        costUnits,
        environment
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get cost forecast for environment
  app.get("/api/compliance/cost/forecast/:environment", (req: Request, res: Response) => {
    try {
      const environment = req.params.environment.toUpperCase() as any;
      const days = parseInt(req.query.days as string) || 7;
      
      const forecast = costForecasting.generateForecast(environment, days);
      
      res.json(forecast);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get cost history
  app.get("/api/compliance/cost/history/:environment", (req: Request, res: Response) => {
    try {
      const environment = req.params.environment.toUpperCase() as any;
      const days = parseInt(req.query.days as string) || 30;
      
      const history = costForecasting.getCostHistory(environment, days);
      const breakdown = costForecasting.getDailyCostBreakdown(environment, days);
      
      res.json({
        environment,
        recordCount: history.length,
        dailyBreakdown: breakdown,
        history: history.slice(0, 100) // Limit response size
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Set budget for environment
  app.put("/api/compliance/cost/budget/:environment", (req: Request, res: Response) => {
    try {
      const environment = req.params.environment.toUpperCase() as any;
      const { daily, weekly, monthly } = req.body;

      if (!daily) {
        return res.status(400).json({ error: "daily budget is required" });
      }

      costForecasting.setBudget(environment, daily, weekly, monthly);

      res.json({
        message: `Budget updated for ${environment}`,
        budget: { daily, weekly: weekly || daily * 7, monthly: monthly || daily * 30 }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get active cost alerts
  app.get("/api/compliance/cost/alerts", (_req: Request, res: Response) => {
    try {
      const alerts = costForecasting.getActiveAlerts();
      
      res.json({
        count: alerts.length,
        alerts
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Acknowledge cost alert
  app.post("/api/compliance/cost/alerts/:alertId/acknowledge", (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      costForecasting.acknowledgeAlert(
        req.params.alertId, 
        user?.email || "unknown"
      );
      
      res.json({
        message: "Alert acknowledged",
        alertId: req.params.alertId
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get cost statistics
  app.get("/api/compliance/cost/stats", (_req: Request, res: Response) => {
    try {
      const stats = costForecasting.getStatistics();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get cost dashboard (combined view)
  app.get("/api/compliance/cost/dashboard", (_req: Request, res: Response) => {
    try {
      const environments: Array<"QA" | "UAT" | "STAGING" | "PROD"> = ["QA", "UAT", "STAGING", "PROD"];
      
      const forecasts = environments.map(env => ({
        environment: env,
        forecast: costForecasting.generateForecast(env, 7)
      }));

      const stats = costForecasting.getStatistics();
      const alerts = costForecasting.getActiveAlerts();

      res.json({
        forecasts,
        stats,
        alerts,
        generatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[Routes] Cost Forecasting routes registered at /api/compliance/cost/*");

  // ----------------------------------------
  // COMPLIANCE DASHBOARD (Combined View)
  // ----------------------------------------
  app.get("/api/compliance/dashboard", async (_req: Request, res: Response) => {
    try {
      const approvalStats = approvalWorkflow.getStatistics();
      const flakyStats = flakyTestDetection.getStatistics();
      const costStats = costForecasting.getStatistics();
      const pendingApprovals = approvalWorkflow.getPendingApprovals();
      const costAlerts = costForecasting.getActiveAlerts();
      const flakyTests = flakyTestDetection.getFlakyTests().slice(0, 5);

      res.json({
        summary: {
          pendingApprovals: pendingApprovals.length,
          approvalCompliance: approvalStats.totalRequests > 0 
            ? Math.round((approvalStats.approved / approvalStats.totalRequests) * 100) 
            : 100,
          flakyTestCount: flakyStats.flaky,
          quarantinedTests: flakyStats.quarantined,
          activeAlerts: costAlerts.length,
          last7DaysCost: costStats.last7Days,
        },
        approvals: {
          stats: approvalStats,
          pending: pendingApprovals.slice(0, 5),
        },
        flakyTests: {
          stats: flakyStats,
          topFlaky: flakyTests,
        },
        costs: {
          stats: costStats,
          alerts: costAlerts,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[Routes] Enterprise Compliance Module routes registered at /api/compliance/*");
  console.log("  ✅ Approval Workflows: /api/compliance/approval/*");
  console.log("  ✅ Compliance Export: /api/compliance/export/*");
  console.log("  ✅ Flaky Test Detection: /api/compliance/flaky/*");
  console.log("  ✅ Cost Forecasting: /api/compliance/cost/*");

  // --- Add these analytics routes here ---
  app.get("/api/reports/predictive-failure", getPredictiveFailureAnalysis);
  app.get("/api/reports/test-optimization", getTestOptimizationRecommendations);
  app.get("/api/reports/pass-fail-stats", getPassFailStats);

  // Optional: endpoint to store test results
  app.post("/api/reports/store-result", (req: Request, res: Response) => {
    const { testName, passed, error } = req.body;
    storeTestResult(testName, passed, error);
    res.json({ status: "ok" });
  });

  // ========================================
  // EXCEL/CSV UPLOAD AND PARSING
  // ========================================
  app.post("/api/upload/parse-excel", excelUpload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const ext = nodePath.extname(req.file.originalname).toLowerCase();
      const testCases: any[] = [];
      const errors: string[] = [];

      if (ext === ".xlsx" || ext === ".xls") {
        // Parse Excel file
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        if (rows.length < 2) {
          return res.status(400).json({ error: "Excel file has no data rows" });
        }

        // Get headers from first row
        const headers = rows[0].map((h: any) => String(h).toLowerCase().trim());
        const titleIdx = headers.findIndex((h: string) => h.includes("title") || h.includes("name") || h.includes("test"));
        const descIdx = headers.findIndex((h: string) => h.includes("desc") || h.includes("description"));
        const stepsIdx = headers.findIndex((h: string) => h.includes("step") || h.includes("action"));
        const expectedIdx = headers.findIndex((h: string) => h.includes("expected") || h.includes("result"));
        const priorityIdx = headers.findIndex((h: string) => h.includes("priority"));
        const precondIdx = headers.findIndex((h: string) => h.includes("precond") || h.includes("prerequisite"));

        // Parse each data row
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.every((c: any) => !c)) continue; // Skip empty rows

          const title = titleIdx >= 0 ? String(row[titleIdx] || "").trim() : "";
          const description = descIdx >= 0 ? String(row[descIdx] || "").trim() : "";
          const stepText = stepsIdx >= 0 ? String(row[stepsIdx] || "").trim() : "";
          const expectedText = expectedIdx >= 0 ? String(row[expectedIdx] || "").trim() : "";
          const priority = priorityIdx >= 0 ? String(row[priorityIdx] || "medium").trim().toLowerCase() : "medium";
          const preconditions = precondIdx >= 0 ? String(row[precondIdx] || "").trim() : "";

          if (!title && !stepText) continue; // Skip rows with no meaningful content

          // Parse steps - could be multiple steps separated by newlines or numbers
          const steps: { step: string; expected: string }[] = [];
          if (stepText) {
            const stepLines = stepText.split(/[\n\r]+|(?=\d+\.\s)/).filter((s: string) => s.trim());
            const expectedLines = expectedText.split(/[\n\r]+|(?=\d+\.\s)/).filter((s: string) => s.trim());
            
            for (let j = 0; j < stepLines.length; j++) {
              const step = stepLines[j].replace(/^\d+\.\s*/, "").trim();
              const expected = expectedLines[j] ? expectedLines[j].replace(/^\d+\.\s*/, "").trim() : "Step completes successfully";
              if (step) {
                steps.push({ step, expected });
              }
            }
          }

          if (steps.length === 0 && title) {
            steps.push({ step: `Execute: ${title}`, expected: "Test completes successfully" });
          }

          testCases.push({
            title: title || `Test Case ${i}`,
            description,
            preconditions,
            priority: ["low", "medium", "high", "critical"].includes(priority) ? priority : "medium",
            tags: [],
            steps,
            _rowIndex: i,
          });
        }
      } else if (ext === ".csv") {
        // CSV parsing
        const text = req.file.buffer.toString("utf-8");
        const lines = text.split(/\r?\n/).filter((l: string) => l.trim());
        
        if (lines.length < 2) {
          return res.status(400).json({ error: "CSV file has no data rows" });
        }

        const headers = lines[0].split(",").map((h: string) => h.toLowerCase().trim().replace(/"/g, ""));
        const titleIdx = headers.findIndex((h: string) => h.includes("title") || h.includes("name"));
        const stepsIdx = headers.findIndex((h: string) => h.includes("step") || h.includes("action"));

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c: string) => c.trim().replace(/^"|"$/g, ""));
          const title = titleIdx >= 0 ? cols[titleIdx] : `Test Case ${i}`;
          const stepText = stepsIdx >= 0 ? cols[stepsIdx] : "";
          
          if (!title.trim()) continue;

          const steps = stepText 
            ? [{ step: stepText, expected: "Step completes successfully" }]
            : [{ step: `Execute: ${title}`, expected: "Test completes successfully" }];

          testCases.push({
            title,
            priority: "medium",
            tags: [],
            steps,
            _rowIndex: i,
          });
        }
      } else {
        return res.status(400).json({ error: `Unsupported file type: ${ext}. Use .xlsx, .xls, or .csv` });
      }

      res.json({
        testCases,
        errors,
        fileName: req.file.originalname,
        totalRows: testCases.length,
      });
    } catch (error: any) {
      console.error("[parse-excel] Error:", error);
      res.status(500).json({ error: error.message || "Failed to parse file" });
    }
  });

  // ========================================
  // CANONICAL TEST CASE UPLOAD (ENHANCED)
  // Enterprise-grade parsing with validation
  // ========================================
  app.post("/api/upload/parse-canonical", excelUpload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const ext = nodePath.extname(req.file.originalname).toLowerCase();
      console.log("[parse-canonical] Processing file:", req.file.originalname, "Extension:", ext);

      let canonicalTestCases: CanonicalTestCase[] = [];
      let parseErrors: any[] = [];
      let parseWarnings: any[] = [];
      let metadata: any = {
        fileName: req.file.originalname,
        totalRows: 0,
        parsedScenarios: 0,
        totalSteps: 0
      };

      if (ext === ".xlsx" || ext === ".xls") {
        // Parse Excel using canonical parser
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        const result = parseExcelToCanonical(rows, req.file.originalname);
        canonicalTestCases = result.testCases;
        parseErrors = result.errors;
        parseWarnings = result.warnings;
        metadata = result.metadata;

      } else if (ext === ".csv") {
        // Parse CSV
        const text = req.file.buffer.toString("utf-8");
        const lines = text.split(/\r?\n/).filter((l: string) => l.trim());
        
        // Convert CSV to 2D array
        const rows: string[][] = lines.map(line => {
          const cols: string[] = [];
          let cur = "";
          let inQuote = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuote = !inQuote; continue; }
            if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
            cur += ch;
          }
          cols.push(cur.trim());
          return cols;
        });

        const result = parseExcelToCanonical(rows, req.file.originalname);
        canonicalTestCases = result.testCases;
        parseErrors = result.errors;
        parseWarnings = result.warnings;
        metadata = result.metadata;

      } else if (ext === ".json") {
        // Parse JSON directly
        const data = JSON.parse(req.file.buffer.toString("utf-8"));
        const testCasesArray = Array.isArray(data) ? data : data.testCases || data.tests || [data];
        
        for (const tc of testCasesArray) {
          const validationResult = validateCanonicalTestCase(tc);
          if (validationResult.normalizedTestCase) {
            canonicalTestCases.push(validationResult.normalizedTestCase);
          }
          parseErrors.push(...validationResult.errors);
          parseWarnings.push(...validationResult.warnings);
        }
        
        metadata.parsedScenarios = canonicalTestCases.length;
        metadata.totalSteps = canonicalTestCases.reduce((sum, tc) => sum + tc.steps.length, 0);

      } else {
        return res.status(400).json({ 
          error: `Unsupported file type: ${ext}. Use .xlsx, .xls, .csv, or .json` 
        });
      }

      // Validate each parsed test case
      const validationResults = canonicalTestCases.map(tc => {
        const result = validateCanonicalTestCase(tc);
        return {
          testCaseId: tc.testCaseId,
          title: tc.title,
          isValid: result.isValid,
          score: result.score,
          errors: result.errors,
          warnings: result.warnings
        };
      });

      // Calculate overall validation score
      const overallScore = validationResults.length > 0
        ? Math.round(validationResults.reduce((sum, r) => sum + r.score, 0) / validationResults.length)
        : 0;

      // Convert to legacy format for backward compatibility
      const legacyTestCases = canonicalTestCases.map(tc => ({
        title: tc.title,
        description: tc.description,
        preconditions: tc.preconditions.join("; "),
        priority: tc.priority,
        tags: tc.tags,
        steps: tc.steps.map(s => ({
          step: `${s.actionType}: ${s.target || ""}${s.value ? " = " + s.value : ""}`,
          expected: s.expectedResult
        })),
        _rowIndex: 0,
        // Include canonical data
        _canonical: tc
      }));

      console.log("[parse-canonical] Parsed", canonicalTestCases.length, "test cases, Score:", overallScore);

      res.json({
        // Legacy format
        testCases: legacyTestCases,
        errors: parseErrors.map(e => `${e.field}: ${e.message}`),
        fileName: req.file.originalname,
        totalRows: metadata.totalRows,
        
        // Enhanced canonical data
        canonical: {
          testCases: canonicalTestCases,
          validation: validationResults,
          overallScore,
          metadata,
          actionTypes: ActionTypes,
        },
        
        // Parsing statistics
        stats: {
          totalScenarios: metadata.parsedScenarios,
          totalSteps: metadata.totalSteps,
          validTestCases: validationResults.filter(r => r.isValid).length,
          invalidTestCases: validationResults.filter(r => !r.isValid).length,
          warnings: parseWarnings.length
        }
      });

    } catch (error: any) {
      console.error("[parse-canonical] Error:", error);
      res.status(500).json({ error: error.message || "Failed to parse file" });
    }
  });

  // ========================================
  // VALIDATE CANONICAL TEST CASE
  // ========================================
  app.post("/api/test-cases/validate-canonical", async (req: Request, res: Response) => {
    try {
      const testCase = req.body;
      const result = validateCanonicalTestCase(testCase);
      
      res.json({
        isValid: result.isValid,
        score: result.score,
        errors: result.errors,
        warnings: result.warnings,
        normalizedTestCase: result.normalizedTestCase
      });
    } catch (error: any) {
      console.error("[validate-canonical] Error:", error);
      res.status(500).json({ error: error.message || "Validation failed" });
    }
  });

  // ========================================
  // GENERATE AUTOMATION CODE FROM CANONICAL
  // ========================================
  app.post("/api/test-cases/generate-from-canonical", async (req: Request, res: Response) => {
    try {
      const { testCase, framework, language, includeComments = true, useObjectRepository = true } = req.body;
      
      if (!testCase) {
        return res.status(400).json({ error: "testCase is required" });
      }
      
      if (!framework || !["playwright", "cypress", "selenium", "puppeteer"].includes(framework)) {
        return res.status(400).json({ error: "framework must be: playwright, cypress, selenium, or puppeteer" });
      }

      // Validate the test case first
      const validation = validateCanonicalTestCase(testCase);
      if (!validation.isValid) {
        return res.status(400).json({ 
          error: "Test case validation failed",
          errors: validation.errors 
        });
      }

      // Generate code using the normalized test case
      const code = generateAutomationCode(validation.normalizedTestCase!, {
        framework,
        language: language || "typescript",
        includeComments,
        useObjectRepository
      });

      res.json({
        code,
        framework,
        language: language || "typescript",
        testCaseId: validation.normalizedTestCase!.testCaseId,
        title: validation.normalizedTestCase!.title,
        stepCount: validation.normalizedTestCase!.steps.length,
        generatedBy: "canonical-engine"
      });

    } catch (error: any) {
      console.error("[generate-from-canonical] Error:", error);
      res.status(500).json({ error: error.message || "Code generation failed" });
    }
  });

  // ========================================
  // BATCH GENERATE AUTOMATION CODE
  // ========================================
  app.post("/api/test-cases/batch-generate-canonical", async (req: Request, res: Response) => {
    try {
      const { testCases, framework, language, includeComments = true } = req.body;
      
      if (!Array.isArray(testCases) || testCases.length === 0) {
        return res.status(400).json({ error: "testCases array is required" });
      }
      
      if (!framework || !["playwright", "cypress", "selenium", "puppeteer"].includes(framework)) {
        return res.status(400).json({ error: "framework must be: playwright, cypress, selenium, or puppeteer" });
      }

      const results: any[] = [];
      
      for (const tc of testCases) {
        try {
          const validation = validateCanonicalTestCase(tc);
          if (validation.isValid && validation.normalizedTestCase) {
            const code = generateAutomationCode(validation.normalizedTestCase, {
              framework,
              language: language || "typescript",
              includeComments
            });
            results.push({
              testCaseId: validation.normalizedTestCase.testCaseId,
              title: validation.normalizedTestCase.title,
              success: true,
              code,
              stepCount: validation.normalizedTestCase.steps.length
            });
          } else {
            results.push({
              testCaseId: tc.testCaseId || "unknown",
              title: tc.title || "unknown",
              success: false,
              errors: validation.errors
            });
          }
        } catch (err: any) {
          results.push({
            testCaseId: tc.testCaseId || "unknown",
            title: tc.title || "unknown",
            success: false,
            error: err.message
          });
        }
      }

      res.json({
        framework,
        language: language || "typescript",
        total: testCases.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      });

    } catch (error: any) {
      console.error("[batch-generate-canonical] Error:", error);
      res.status(500).json({ error: error.message || "Batch generation failed" });
    }
  });

  // ========================================
  // GET SUPPORTED ACTION TYPES
  // ========================================
  app.get("/api/test-cases/action-types", (_req: Request, res: Response) => {
    res.json({
      actionTypes: ActionTypes,
      categories: {
        navigation: ["NAVIGATE", "NEWTAB", "NEWWINDOW", "SWITCHWINDOW", "CLOSE", "BACK", "FORWARD", "REFRESH"],
        input: ["INPUT", "CLEAR", "UPLOAD", "TYPE", "PRESS"],
        click: ["CLICK", "DOUBLECLICK", "RIGHTCLICK", "HOVER"],
        selection: ["SELECT", "CHECKBOX", "RADIOBUTTON"],
        verification: ["VERIFY", "ASSERT", "CHECKTEXT", "CHECKELEMENT", "CAPTURE"],
        wait: ["WAIT", "WAITFORELEMENT", "WAITFORTEXT"],
        scroll: ["SCROLLDOWN", "SCROLLUP", "SCROLLTO"],
        alerts: ["ACCEPT", "DISMISS"],
        api: ["API_CALL", "API_GET", "API_POST", "API_PUT", "API_DELETE"],
        mobile: ["SWIPE", "TAP", "LONGPRESS"],
        data: ["EXTRACT", "STORE", "SUBMIT"]
      }
    });
  });

  // ========================================
  // OBJECT REPOSITORY MANAGEMENT
  // ========================================
  app.get("/api/selectors", (_req: Request, res: Response) => {
    // Return all selectors from object repository
    const selectors: any[] = [];
    // Since objectRepository uses a Map internally, we expose common ones
    const commonSelectors = [
      "User ID", "Username", "Password", "Login button", "Submit button",
      "Email", "First Name", "Last Name", "Dashboard", "Home", "Settings"
    ];
    
    for (const name of commonSelectors) {
      const entry = objectRepository.get(name);
      if (entry) {
        selectors.push(entry);
      }
    }
    
    res.json({ selectors });
  });

  app.post("/api/selectors", (req: Request, res: Response) => {
    try {
      const { logicalName, css, xpath, id, name, testId, role, text, placeholder } = req.body;
      
      if (!logicalName) {
        return res.status(400).json({ error: "logicalName is required" });
      }
      
      objectRepository.add(logicalName, { css, xpath, id, name, testId, role, text, placeholder });
      
      res.json({ 
        success: true, 
        message: `Selector "${logicalName}" added to repository`,
        selector: objectRepository.get(logicalName)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[Routes] Canonical Test Case Engine routes registered");

  // Test Suites
  app.get("/api/test-suites", async (req: Request, res: Response) => {
    try {
      const suites = await storage.getAllTestSuites();
      res.json(suites);
    } catch (error) {
      console.error("Error fetching test suites:", error);
      res.status(500).json({ error: "Failed to fetch test suites" });
    }
  });

  app.get("/api/test-suites/:id", async (req: Request, res: Response) => {
    try {
      const suite = await storage.getTestSuite(req.params.id);
      if (!suite) {
        return res.status(404).json({ error: "Test suite not found" });
      }
      res.json(suite);
    } catch (error) {
      console.error("Error fetching test suite:", error);
      res.status(500).json({ error: "Failed to fetch test suite" });
    }
  });

  app.post("/api/test-suites", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(insertTestSuiteSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const suite = await storage.createTestSuite(validation.data);
      res.status(201).json(suite);
    } catch (error) {
      console.error("Error creating test suite:", error);
      res.status(500).json({ error: "Failed to create test suite" });
    }
  });

  app.patch("/api/test-suites/:id", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(partialTestSuiteSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const suite = await storage.updateTestSuite(req.params.id, validation.data);
      if (!suite) {
        return res.status(404).json({ error: "Test suite not found" });
      }
      res.json(suite);
    } catch (error) {
      console.error("Error updating test suite:", error);
      res.status(500).json({ error: "Failed to update test suite" });
    }
  });

  app.delete("/api/test-suites/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteTestSuite(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting test suite:", error);
      res.status(500).json({ error: "Failed to delete test suite" });
    }
  });

  // Test Cases
  app.get("/api/test-cases", async (req: Request, res: Response) => {
    try {
      const testCases = await storage.getAllTestCases();
      res.json(testCases);
    } catch (error) {
      console.error("Error fetching test cases:", error);
      res.status(500).json({ error: "Failed to fetch test cases" });
    }
  });

  app.get("/api/test-cases/:id", async (req: Request, res: Response) => {
    try {
      const testCase = await storage.getTestCase(req.params.id);
      if (!testCase) {
        return res.status(404).json({ error: "Test case not found" });
      }
      res.json(testCase);
    } catch (error) {
      console.error("Error fetching test case:", error);
      res.status(500).json({ error: "Failed to fetch test case" });
    }
  });

  app.post("/api/test-cases", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(insertTestCaseSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const testCase = await storage.createTestCase(validation.data);
      res.status(201).json(testCase);
    } catch (error) {
      console.error("Error creating test case:", error);
      res.status(500).json({ error: "Failed to create test case" });
    }
  });

  app.patch("/api/test-cases/:id", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(partialTestCaseSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const testCase = await storage.updateTestCase(req.params.id, validation.data);
      if (!testCase) {
        return res.status(404).json({ error: "Test case not found" });
      }
      res.json(testCase);
    } catch (error) {
      console.error("Error updating test case:", error);
      res.status(500).json({ error: "Failed to update test case" });
    }
  });

  app.delete("/api/test-cases/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteTestCase(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting test case:", error);
      res.status(500).json({ error: "Failed to delete test case" });
    }
  });

    // Test Agents
  app.get("/api/agents", async (req: Request, res: Response) => {
    try {
      const agents = await storage.getAllAgents();
      res.json(agents);
    } catch (error) {
      console.error("Error fetching agents:", error);
      res.status(500).json({ error: "Failed to fetch agents" });
    }
  });

  // Register Local Agent
  app.post("/api/agents/register-local", async (req: Request, res: Response) => {
    try {
      const { name, description, type, capabilities } = req.body;
      if (!name) return res.status(400).json({ error: "Agent name is required" });

      console.log(`[Agent] Registering local agent: ${name}`);

      const agent = await storage.createAgent({
        name,
        description: description || null,
        type: type || "browser",
        status: "pending", // Will be set to online when agent connects
        capabilities: capabilities || ["screenshot", "video", "network-logging"],
        isAutonomous: false,
        targetUrl: null,
        suiteId: null,
        scheduleInterval: null,
        maxRetries: 3,
        selfHealingEnabled: true,
        notifyOnFailure: true,
        lastHeartbeat: new Date(),
      });

      // Generate API key for agent
      const apiKey = `aitas_${agent.id.substring(0, 16)}_${Date.now().toString(36)}`;
      
      logAudit({
        action: "agent.registered",
        severity: "info",
        resourceType: "agent",
        resourceId: agent.id,
        resourceName: name,
        success: true,
      });

      res.status(201).json({
        agent,
        apiKey,
        serverUrl: `${req.protocol}://${req.get("host")}`,
        installUrl: "https://github.com/your-org/aitas-agent/releases",
      });
    } catch (error) {
      console.error("Error registering agent:", error);
      res.status(500).json({ error: "Failed to register agent" });
    }
  });

  // Agent Heartbeat (Keep-Alive)
  app.post("/api/agents/:id/heartbeat", async (req: Request, res: Response) => {
    try {
      const { systemInfo } = req.body;

      const agent = await storage.updateAgent(req.params.id, {
        status: "online",
        lastHeartbeat: new Date(),
      });

      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      console.log(`[Agent] Heartbeat received from: ${agent.name}`);

      res.json({
        status: "ok",
        serverTime: new Date(),
        nextHeartbeatIn: 30000, // 30 seconds
      });
    } catch (error) {
      console.error("Error processing heartbeat:", error);
      res.status(500).json({ error: "Failed to process heartbeat" });
    }
  });

  // Agent Health Check
  app.get("/api/agents/:id/health", async (req: Request, res: Response) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      const lastHeartbeat = agent.lastHeartbeat ? new Date(agent.lastHeartbeat) : null;
      const timeSinceLastHeartbeat = lastHeartbeat ? Date.now() - lastHeartbeat.getTime() : null;
      const isHealthy = timeSinceLastHeartbeat ? timeSinceLastHeartbeat < 60000 : false; // 60 seconds threshold

      res.json({
        agentId: agent.id,
        name: agent.name,
        status: isHealthy ? "online" : "offline",
        lastHeartbeat,
        timeSinceLastHeartbeat,
        capabilities: agent.capabilities,
        isHealthy,
      });
    } catch (error) {
      console.error("Error checking agent health:", error);
      res.status(500).json({ error: "Failed to check agent health" });
    }
  });

  // Update Agent Status (for marking agents as offline if no heartbeat)
  app.post("/api/agents/:id/mark-offline", async (req: Request, res: Response) => {
    try {
      const agent = await storage.updateAgent(req.params.id, {
        status: "offline",
      });

      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      console.log(`[Agent] Marked offline: ${agent.name}`);

      res.json(agent);
    } catch (error) {
      console.error("Error marking agent offline:", error);
      res.status(500).json({ error: "Failed to mark agent offline" });
    }
  });

  app.get("/api/agents/:id", async (req: Request, res: Response) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      res.json(agent);
    } catch (error) {
      console.error("Error fetching agent:", error);
      res.status(500).json({ error: "Failed to fetch agent" });
    }
  });

  app.post("/api/agents", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(insertTestAgentSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const agent = await storage.createAgent(validation.data);
      res.status(201).json(agent);
    } catch (error) {
      console.error("Error creating agent:", error);
      res.status(500).json({ error: "Failed to create agent" });
    }
  });

  app.patch("/api/agents/:id", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(partialTestAgentSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const agent = await storage.updateAgent(req.params.id, validation.data);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      res.json(agent);
    } catch (error) {
      console.error("Error updating agent:", error);
      res.status(500).json({ error: "Failed to update agent" });
    }
  });

  app.delete("/api/agents/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteAgent(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting agent:", error);
      res.status(500).json({ error: "Failed to delete agent" });
    }
  });

  // Autonomous Agent Control
  app.post("/api/agents/:id/start", async (req: Request, res: Response) => {
    try {
      const { autonomousRunner } = await import("./autonomous-agent");
      await autonomousRunner.startAgent(req.params.id);
      res.json({ success: true, message: "Agent started" });
    } catch (error) {
      console.error("Error starting agent:", error);
      res.status(500).json({ error: "Failed to start agent" });
    }
  });

  app.post("/api/agents/:id/stop", async (req: Request, res: Response) => {
    try {
      const { autonomousRunner } = await import("./autonomous-agent");
      await autonomousRunner.stopAgent(req.params.id);
      res.json({ success: true, message: "Agent stopped" });
    } catch (error) {
      console.error("Error stopping agent:", error);
      res.status(500).json({ error: "Failed to stop agent" });
    }
  });

  app.get("/api/agents/:id/status", async (req: Request, res: Response) => {
    try {
      const { autonomousRunner } = await import("./autonomous-agent");
      const isRunning = autonomousRunner.isAgentRunning(req.params.id);
      const agent = await storage.getAgent(req.params.id);
      res.json({ 
        isRunning, 
        status: agent?.status,
        lastHeartbeat: agent?.lastHeartbeat,
        isAutonomous: agent?.isAutonomous
      });
    } catch (error) {
      console.error("Error getting agent status:", error);
      res.status(500).json({ error: "Failed to get agent status" });
    }
  });

  // Test Executions
  app.get("/api/executions", async (req: Request, res: Response) => {
    try {
      const executions = await storage.getAllExecutions();
      res.json(executions);
    } catch (error) {
      console.error("Error fetching executions:", error);
      res.status(500).json({ error: "Failed to fetch executions" });
    }
  });

  app.get("/api/executions/:id", async (req: Request, res: Response) => {
    try {
      const execution = await storage.getExecution(req.params.id);
      if (!execution) {
        return res.status(404).json({ error: "Execution not found" });
      }
      res.json(execution);
    } catch (error) {
      console.error("Error fetching execution:", error);
      res.status(500).json({ error: "Failed to fetch execution" });
    }
  });

  app.post("/api/executions", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(createExecutionSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const { suiteId, agentId, environment, targetUrl, framework, testData, selfHealing, maxRetries } = validation.data;

      // Get test cases for the suite
      const testCases = suiteId 
        ? await storage.getTestCasesBySuite(suiteId)
        : await storage.getAllTestCases();

      if (testCases.length === 0) {
        return res.status(400).json({ error: "No test cases found to execute" });
      }
      
      // Import Enterprise Execution Router for intelligent routing
      const { enterpriseExecutionRouter, detectRequiredCapabilities } = await import("./enterprise-execution-router");
      
      // Detect required capabilities from test cases
      const capabilityDetection = detectRequiredCapabilities(testCases, targetUrl);
      console.log(`[Execution] Detected capabilities: ${capabilityDetection.capabilities.join(", ")}`);
      console.log(`[Execution] Recommended agent type: ${capabilityDetection.recommendedAgentType}`);
      
      // Get agent capabilities if agentId is provided
      let agentCapabilities: string[] | undefined;
      if (agentId) {
        const agent = await storage.getAgent(agentId);
        if (agent && agent.capabilities) {
          agentCapabilities = agent.capabilities;
          console.log(`[Execution] Agent ${agent.name} capabilities: ${agentCapabilities.join(', ')}`);
        }
      }

      const execution = await storage.createExecution({
        suiteId: suiteId ?? undefined,
        agentId: agentId ?? undefined,
        targetUrl,
        framework: framework ?? "playwright",
        testData: testData ?? undefined,
        environment: environment ?? "staging",
        status: "pending",
        totalTests: testCases.length,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
      });

      // Route execution through Enterprise Execution Router
      // This handles capability-based routing to appropriate agents
      enterpriseExecutionRouter.executeWithRouting({
        executionId: execution.id,
        testCases,
        targetUrl,
        framework: framework ?? "selenium",
        testData,
        selfHealing: selfHealing !== false,
        maxRetries: maxRetries ?? 3,
        environment: environment ?? "staging",
        agentId: agentId ?? undefined,
        requiredCapabilities: capabilityDetection.capabilities as any,
      }).catch((error: any) => {
        console.error("Execution error:", error);
        storage.updateExecution(execution.id, {
          status: "failed",
          completedAt: new Date(),
        });
      });

      res.status(201).json({
        ...execution,
        routing: {
          detectedCapabilities: capabilityDetection.capabilities,
          recommendedAgentType: capabilityDetection.recommendedAgentType,
          confidence: capabilityDetection.confidence,
        }
      });
    } catch (error) {
      console.error("Error creating execution:", error);
      res.status(500).json({ error: "Failed to create execution" });
    }
  });

    app.post("/api/executions/:id/cancel", async (req: Request, res: Response) => {
    try {
      const execution = await storage.updateExecution(req.params.id, {
        status: "cancelled",
        completedAt: new Date(),
      });
      if (!execution) {
        return res.status(404).json({ error: "Execution not found" });
      }
      res.json(execution);
    } catch (error) {
      console.error("Error cancelling execution:", error);
      res.status(500).json({ error: "Failed to cancel execution" });
    }
  });

    // Delete execution
  app.delete("/api/executions/:id", async (req: Request, res: Response) => {
    try {
      console.log(`[DELETE] Attempting to delete execution: ${req.params.id}`);
      
      const execution = await storage.getExecution(req.params.id);
      if (!execution) {
        console.log(`[DELETE] Execution not found: ${req.params.id}`);
        return res.status(404).json({ error: "Execution not found" });
      }

      // Delete associated test results
      console.log(`[DELETE] Fetching results for execution: ${req.params.id}`);
      const results = await storage.getResultsByExecution(req.params.id);
      console.log(`[DELETE] Found ${results.length} results to delete`);
      
      for (const result of results) {
        console.log(`[DELETE] Deleting result: ${result.id}`);
        try {
          if (storage.deleteTestResult) {
            await storage.deleteTestResult(result.id);
          }
        } catch (resultError) {
          console.warn(`[DELETE] Error deleting result ${result.id}:`, resultError);
          // Continue with execution deletion even if result deletion fails
        }
      }
      
      // Delete the execution
      console.log(`[DELETE] Deleting execution: ${req.params.id}`);
      await storage.deleteExecution(req.params.id);
      
      // Log audit trail
      logAudit({
        action: "execution.deleted",
        severity: "info",
        resourceType: "execution",
        resourceId: req.params.id,
        success: true
      });

      console.log(`[DELETE] Successfully deleted execution: ${req.params.id}`);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting execution:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Failed to delete execution", details: errorMessage });
    }
  });

  // Test Results
  app.get("/api/executions/:id/results", async (req: Request, res: Response) => {
    try {
      const results = await storage.getResultsByExecution(req.params.id);
      res.json(results);
    } catch (error) {
      console.error("Error fetching results:", error);
      res.status(500).json({ error: "Failed to fetch results" });
    }
  });

  // Import Test Cases
  app.post("/api/test-cases/import", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(importTestCasesSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const { suiteId, testCases } = validation.data;

      const importedCases = [];
      for (const tc of testCases) {
        const created = await storage.createTestCase({
          suiteId: suiteId ?? undefined,
          title: tc.title,
          description: tc.description,
          preconditions: tc.preconditions,
          targetUrl: tc.targetUrl,
          steps: tc.steps,
          priority: tc.priority,
          tags: tc.tags,
          status: "active",
          generatedByAI: false,
        });
        importedCases.push(created);
      }

      res.status(201).json({ 
        message: `Successfully imported ${importedCases.length} test cases`,
        testCases: importedCases 
      });
    } catch (error) {
      console.error("Error importing test cases:", error);
      res.status(500).json({ error: "Failed to import test cases" });
    }
  });

  // Export Test Cases
  app.get("/api/test-cases/export", async (req: Request, res: Response) => {
    try {
      const { suiteId } = req.query;
      const testCases = suiteId 
        ? await storage.getTestCasesBySuite(suiteId as string)
        : await storage.getAllTestCases();

      const exportData = testCases.map(tc => ({
        title: tc.title,
        description: tc.description,
        preconditions: tc.preconditions,
        targetUrl: tc.targetUrl,
        steps: tc.steps,
        priority: tc.priority,
        tags: tc.tags,
      }));

      res.json(exportData);
    } catch (error) {
      console.error("Error exporting test cases:", error);
      res.status(500).json({ error: "Failed to export test cases" });
    }
  });

  // Test Reports
  app.get("/api/reports", async (req: Request, res: Response) => {
    try {
      const reports = await storage.getAllReports();
      res.json(reports);
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  app.get("/api/reports/:id", async (req: Request, res: Response) => {
    try {
      const report = await storage.getReport(req.params.id);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      res.json(report);
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  // ========================================
  // REQUIREMENTS CRUD
  // ========================================

  app.get("/api/requirements", async (_req: Request, res: Response) => {
    try { res.json(await storage.getAllRequirements()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/requirements/:id", async (req: Request, res: Response) => {
    try {
      const r = await storage.getRequirement(req.params.id);
      if (!r) return res.status(404).json({ error: "Requirement not found" });
      res.json(r);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/requirements", async (req: Request, res: Response) => {
    try {
      const { title, description, priority, status, source } = req.body;
      if (!title) return res.status(400).json({ error: "title required" });
      const r = await storage.createRequirement({ title, description, priority: priority || "medium", status: status || "active", source });
      res.status(201).json(r);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/requirements/:id", async (req: Request, res: Response) => {
    try {
      const r = await storage.updateRequirement(req.params.id, req.body);
      if (!r) return res.status(404).json({ error: "Requirement not found" });
      res.json(r);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/requirements/:id", async (req: Request, res: Response) => {
    try { res.status(204).send(); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ========================================
  // REPORTS GENERATE + SCRIPTS ALIAS
  // ========================================

  app.post("/api/reports/generate", async (req: Request, res: Response) => {
    try {
      const { executionId } = req.body;
      if (!executionId) return res.status(400).json({ error: "executionId required" });
      const execution = await storage.getExecution(executionId);
      const report = await storage.createReport({
        executionId,
        name: `Execution Report ${new Date().toLocaleDateString()}`,
        summary: execution ? { status: execution.status, total: execution.totalTests, passed: execution.passedTests, failed: execution.failedTests } : {},
      });
      res.json(report);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/scripts/generate", async (req: Request, res: Response) => {
    try {
      const { testCaseId, framework, language } = req.body;
      if (!testCaseId || !framework || !language) return res.status(400).json({ error: "testCaseId, framework, language required" });
      const testCase = await storage.getTestCase(testCaseId);
      if (!testCase) return res.status(404).json({ error: "Test case not found" });
      const aiClient = await getAiClient();
      const code = await aiClient.chat([{ role: "user", content: `Generate a ${framework} test script in ${language} for: ${testCase.title}\nSteps: ${JSON.stringify(testCase.steps)}` }], `You are an automation engineer. Generate production-ready ${framework} test code. Output only code.`);
      const script = await storage.createScript({ testCaseId, name: `${testCase.title} - ${framework}`, framework, language, code });
      res.json({ code, script });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Generated Scripts
  app.get("/api/scripts", async (req: Request, res: Response) => {
    try {
      const scripts = await storage.getAllScripts();
      res.json(scripts);
    } catch (error) {
      console.error("Error fetching scripts:", error);
      res.status(500).json({ error: "Failed to fetch scripts" });
    }
  });

  // ========================================
  // AI TEST GENERATION - World-Class Anthropic-Grade QA Architect
  // ========================================
    app.post("/api/generate-tests", async (req: Request, res: Response) => {
    console.log("[GENERATE-TESTS] Request received at", new Date().toISOString());
    
    // CRITICAL: If appType is JDE, redirect to JDE-specific endpoint
    // This handles cases where frontend accidentally sends JDE requests here
    const incomingAppType = req.body?.appType?.toLowerCase();
    if (incomingAppType === "jde") {
      console.log("[GENERATE-TESTS] ⚠️ JDE request received on generic endpoint - forwarding to JDE endpoint");
      // Forward to JDE endpoint by calling its handler logic
      req.url = "/api/generate-jde-tests";
      // Add required JDE fields if missing
      if (!req.body.specText && req.body.description) {
        req.body.specText = req.body.description;
      }
    }
    
    try {
      const validation = validateBody(generateTestsSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }

      const {
        title, description, appType, appHints, includeE2E, testDepth,
        appName, moduleName, businessUseCase, userRoles, appContext,
        functionalRequirements, nonFunctionalRequirements, apiDetails,
        uiWorkflow, dataVariations, environment, targetUrl,
      } = validation.data;

      // SECOND CHECK: If appType is JDE, use JDE rule-based generator instead of generic
      if (appType === "jde") {
        console.log("[GENERATE-TESTS] Using JDE-specific generation for appType=jde");
        const inputText = description || "";
        
        // Import JDE functions
        const classification = classifyJDEDocument(inputText);
        const detectedObjects = classification.detected_programs.concat(
          classification.detected_reports,
          classification.detected_tables
        );
        
        // Use JDE rule-based generator
        const ruleBasedResult = generateJDERuleBasedTests(
          title || "JDE Test Suite",
          inputText,
          classification,
          detectedObjects
        );
        
        // Normalize JDE test cases to standard format
        const normalizedTestCases = ruleBasedResult.testCases.map((tc: any) => {
          const normalizedSteps = (tc.steps || []).map((s: any) => {
            let stepDescription = s.action || "";
            if (s.fieldId) stepDescription += ` [${s.fieldId}]`;
            if (s.value) stepDescription += `: ${s.value}`;
            return {
              step: stepDescription || `Step ${s.stepNumber || 1}`,
              expected: s.expected || "Step completes successfully"
            };
          });
          
          const preconditions = Array.isArray(tc.preconditions)
            ? tc.preconditions.join("; ")
            : tc.preconditions || "";
          
          return {
            testCaseId: tc.testCaseId,
            title: tc.title,
            description: tc.objective || tc.description || "",
            preconditions: preconditions,
            steps: normalizedSteps,
            priority: tc.priority?.toLowerCase() || "medium",
            testType: tc.testType?.toLowerCase() || "functional",
            confidenceScore: 90,
            reasoning: `JDE ${tc.module || ""} - ${tc.jdeObject || ""}: ${tc.objective || ""}`
          };
        });
        
        console.log("[GENERATE-TESTS] JDE generation complete: " + normalizedTestCases.length + " tests");
        return res.json({
          testCases: normalizedTestCases,
          generatedBy: "jde-rule-based",
          jdeObjects: detectedObjects,
          coverageSummary: ruleBasedResult.coverageSummary
        });
      }

      console.log("[GENERATE-TESTS] Validated body, building context");
      console.log("[GENERATE-TESTS] appType:", appType);

      // Depth configuration
      const depthMap: Record<string, { min: number; max: number; label: string }> = {
        standard:      { min: 15, max: 20, label: "15-20" },
        comprehensive: { min: 25, max: 35, label: "25-35" },
        exhaustive:    { min: 40, max: 60, label: "40-60" },
      };
      const depth = depthMap[testDepth || "comprehensive"];
      console.log("[GENERATE-TESTS] Depth config: ", testDepth, depth);

      // Build structured context block
      const ctx: string[] = [];
      if (appName)                   ctx.push("APPLICATION NAME: " + appName);
      if (moduleName)                ctx.push("MODULE / FEATURE: " + moduleName);
      if (appType)                   ctx.push("APPLICATION TYPE: " + appType.toUpperCase());
      if (appHints)                  ctx.push("PLATFORM HINTS: " + appHints);
      if (environment)               ctx.push("ENVIRONMENT: " + environment);
      if (targetUrl)                 ctx.push("TARGET URL: " + targetUrl);
      if (businessUseCase)           ctx.push("\nBUSINESS USE CASE:\n" + businessUseCase);
      if (userRoles)                 ctx.push("\nUSER ROLES & PERMISSIONS:\n" + userRoles);
      if (appContext)                ctx.push("\nAPPLICATION CONTEXT:\n" + appContext);
      if (functionalRequirements)    ctx.push("\nFUNCTIONAL REQUIREMENTS:\n" + functionalRequirements);
      if (nonFunctionalRequirements) ctx.push("\nNON-FUNCTIONAL REQUIREMENTS:\n" + nonFunctionalRequirements);
      if (apiDetails)                ctx.push("\nAPI DETAILS:\n" + apiDetails);
      if (uiWorkflow)                ctx.push("\nUI WORKFLOW:\n" + uiWorkflow);
      if (dataVariations)            ctx.push("\nDATA VARIATIONS / CONSTRAINTS:\n" + dataVariations);
      const structuredContext = ctx.join("\n");

      // Domain-specific instructions
      const domainMap: Record<string, string> = {
        jde:       "ORACLE JDE DOMAIN: Use real JDE program names (P4310, P0411, P42101, P0901). Include business unit codes, item numbers (ITM-001), supplier numbers, cost centers, amounts. Test document approval workflows (draft->pending->approved->posted). Verify AAI routing. Test role-based access: Purchasing Manager vs AP Clerk vs Read-Only Auditor.",
        salesforce:"SALESFORCE DOMAIN: Use real SF objects (Account, Contact, Opportunity, Lead, Case, Campaign). Test Lightning UI: Quick Actions, Related Lists, Global Search. Include validation rules, workflow triggers, Apex logic. Test role hierarchy: System Admin vs Sales Rep vs Read-Only. Include REST/SOAP API and bulk data scenarios.",
        sap_fiori: "SAP FIORI DOMAIN: Use real transaction codes (ME21N, VA01, FB50, MM60). Include company code (1000), plant, cost center, material number. Test Fiori Launchpad tile visibility per role. Validate OData endpoints (200/400/401/404). Test multi-language support (EN/DE/FR).",
        api_rest:  "REST API DOMAIN: EVERY test MUST specify HTTP Method, endpoint path, request headers, request body, expected response code AND response body schema. Test: 200, 201, 400, 401, 403, 404, 409, 422, 429, 500. Test pagination, rate limiting, CORS, idempotency of PUT/DELETE.",
        mobile:    "MOBILE DOMAIN: Specify OS (iOS 16+, Android 13+) and screen sizes. Include gestures (tap, swipe, pinch, long-press). Test orientation (portrait/landscape), network conditions (WiFi/4G/offline), push notification flows, app lifecycle (background/foreground), deep links.",
        web:       "WEB DOMAIN: Test across Chrome, Firefox, Edge, Safari. Test breakpoints (375px, 768px, 1280px). Test form autocomplete, browser navigation, session timeout, token refresh, lazy loading.",
      };
      const domainBlock = domainMap[appType || "web"] || (appHints ? "PLATFORM: " + appHints : "");

      const e2eNote = includeE2E ? " -- REQUIRED (includeE2E=true)" : "";

      // Use JDE-specific system prompt if appType is "jde"
      let systemPrompt: string;
      if (appType === "jde") {
        // Extract JDE objects from the description and build JDE-specific prompt
        const jdeObjects = extractJDEObjectsFromText(description + " " + (structuredContext || ""));
        const jdeObjectKnowledge = jdeObjects.map(obj => getJDEObjectKnowledge(obj)).filter(Boolean);
        systemPrompt = buildJDESystemPrompt(jdeObjects, jdeObjectKnowledge.join("\n\n"));
        console.log("[GENERATE-TESTS] Using JDE-specific prompt with objects:", jdeObjects);
      } else {
        systemPrompt = WORLD_CLASS_TEST_GENERATION_PROMPT;
      }

      const userPrompt = [
        "Generate a comprehensive enterprise-grade test suite for the following requirement.",
        "",
        "=== PRIMARY REQUIREMENT ===",
        "Title: " + (title || "Untitled"),
        "Description: " + description,
        "",
        "=== ARCHITECT CONTEXT ===",
        structuredContext || "(No additional context provided -- infer maximum coverage from the requirement description)",
        "",
        "=== GENERATION PARAMETERS ===",
        "Test Depth: " + (testDepth || "comprehensive") + " (" + depth.label + " test cases)",
        "Include E2E Tests: " + (includeE2E ? "YES -- mandatory" : "YES -- at least 1"),
        appType ? ("Application Type: " + appType.toUpperCase()) : "",
        "",
        "Apply your full domain expertise. Cover ALL 10 required categories. Output ONLY valid JSON.",
      ].filter(l => l !== null).join("\n");

      // Try AI first, fall back to rule-based if AI fails or is not configured
      let generatedResult: { testCases: any[]; generatedBy: string; coverageSummary?: any } | null = null;

      try {
        const aiClient = await getAiClient();
        if (aiClient) {
          try {
            console.log("[GENERATE-TESTS] Attempting AI-based generation...");
            // Build messages with system prompt
            const messages = [
              { role: "system" as const, content: systemPrompt },
              { role: "user" as const, content: userPrompt },
            ];
            
            const content = await aiClient.chat(
              [{ role: "user", content: userPrompt }],
              systemPrompt
            );

            // Extract JSON from response (handle markdown code blocks)
            let jsonStr = content;
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
              jsonStr = jsonMatch[1].trim();
            }
            
            const parsed = JSON.parse(jsonStr);
            if (parsed && Array.isArray(parsed.testCases) && parsed.testCases.length > 0) {
              generatedResult = { ...parsed, generatedBy: "ai" };
              console.log("[GENERATE-TESTS] AI generation successful: " + parsed.testCases.length + " tests");
            } else {
              console.warn("[GENERATE-TESTS] AI response missing testCases array, falling back to rule-based");
            }
          } catch (aiError: any) {
            console.error("[GENERATE-TESTS] AI generation failed:", aiError.message || aiError);
            console.log("[GENERATE-TESTS] Falling back to rule-based generator");
          }
        } else {
          console.log("[GENERATE-TESTS] No AI client configured, using rule-based generator");
        }
      } catch (clientError: any) {
        console.error("[GENERATE-TESTS] Failed to get AI client:", clientError.message);
      }

      // Fallback to rule-based generation if AI failed or was not available
      if (!generatedResult) {
        console.log("[GENERATE-TESTS] Using rule-based generator");
        generatedResult = generateRuleBasedTests(
          title || "Untitled",
          [description, structuredContext].filter(Boolean).join("\n\n"),
          appType || "web"
        );
        console.log("[GENERATE-TESTS] Rule-based generation complete: " + generatedResult.testCases.length + " tests");
      }

      // Validate using our validator
      const validationResult = TestCaseValidator.validate(generatedResult);
      if (!validationResult.isValid) {
        console.error("Test case validation failed:", validationResult.errors);
      }
      if (validationResult.warnings.length > 0) {
        console.warn("Test case warnings:", validationResult.warnings);
      }

      const enhancedOutput = {
        ...generatedResult,
        validationScore: validationResult.score,
        validationWarnings: validationResult.warnings,
        validationErrors: validationResult.errors,
      };

      console.log("[GENERATE-TESTS] Validation score: " + validationResult.score + "/100");
      res.json(enhancedOutput);
    } catch (error) {
            console.error("Error generating tests:", error);
            res.status(500).json({ error: "Failed to generate tests" });
    }
  });

  // ========================================
  // JDE-SPECIFIC TEST GENERATION - Oracle JD Edwards Expert
  // Implements the complete pipeline:
  // Step 1: Document Classification
  // Step 2: Test-Type Resolution
  // Step 3: Structured Extraction
  // Step 4: Governance Rules Injection
  // Step 5: Test Case Generation
  // Step 6: Post-Generation Validation
  // ========================================
  app.post("/api/generate-jde-tests", async (req: Request, res: Response) => {
    console.log("[GENERATE-JDE-TESTS] ═══════════════════════════════════════════");
    console.log("[GENERATE-JDE-TESTS] Request received at", new Date().toISOString());
    try {
      const { 
        title,
        description, 
        specText,
        structuredDocument,
        modules,
        jdeObjects,
        testDepth = "comprehensive",
        includeE2E = true,
        targetUrl,
        environment,
        businessUnit,
        userRoles
      } = req.body;

      if (!description && !specText) {
        return res.status(400).json({ error: "description or specText required" });
      }

      const inputText = specText || description || "";
      
      // ═══════════════════════════════════════════════════════════════════════
      // STEP 1 & 2: DOCUMENT CLASSIFICATION + TEST TYPE RESOLUTION
      // ═══════════════════════════════════════════════════════════════════════
      console.log("[GENERATE-JDE-TESTS] Step 1: Classifying document...");
      const classification = classifyJDEDocument(inputText);
      console.log("[GENERATE-JDE-TESTS] Classification:", {
        documentType: classification.document_type,
        module: classification.jde_module,
        supportsUIAutomation: classification.supports_ui_automation,
        supportsFunctionalTesting: classification.supports_functional_testing,
        confidenceScore: classification.confidence_score
      });
      
      console.log("[GENERATE-JDE-TESTS] Step 2: Resolving test types...");
      const testTypeDecision = resolveTestTypes(classification);
      console.log("[GENERATE-JDE-TESTS] Test types - Allowed:", testTypeDecision.allowed_test_types);
      console.log("[GENERATE-JDE-TESTS] Test types - Blocked:", testTypeDecision.blocked_test_types);
      
      // ═══════════════════════════════════════════════════════════════════════
      // STEP 3: EXTRACT JDE OBJECTS FROM INPUT
      // ═══════════════════════════════════════════════════════════════════════
      console.log("[GENERATE-JDE-TESTS] Step 3: Extracting JDE objects...");
      const detectedObjects = jdeObjects || classification.detected_programs.concat(
        classification.detected_reports,
        classification.detected_tables
      );
      console.log("[GENERATE-JDE-TESTS] Detected JDE objects:", detectedObjects);

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 4: GET MODULE GOVERNANCE RULES
      // ═══════════════════════════════════════════════════════════════════════
      console.log("[GENERATE-JDE-TESTS] Step 4: Applying governance rules...");
      const governanceRules = getModuleGovernanceRules(classification.jde_module);
      console.log("[GENERATE-JDE-TESTS] Required programs:", governanceRules.required_programs);
      console.log("[GENERATE-JDE-TESTS] Required tables:", governanceRules.required_tables);
      console.log("[GENERATE-JDE-TESTS] Required validations:", governanceRules.required_validations);

      // Build JDE-specific knowledge context
      const jdeObjectKnowledge = detectedObjects
        .filter((obj: string) => obj.startsWith('P') || obj.startsWith('R'))
        .map((obj: string) => {
          const knowledge = getJDEObjectKnowledge(obj);
          if (knowledge) {
            return `${obj} - ${knowledge.name}: ${knowledge.description}\nTables: ${knowledge.tables.join(', ')}\nTest Points: ${knowledge.testPoints.join('; ')}`;
          }
          return null;
        })
        .filter(Boolean)
        .join("\n\n");

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 5: TEST CASE GENERATION
      // ═══════════════════════════════════════════════════════════════════════
      console.log("[GENERATE-JDE-TESTS] Step 5: Generating test cases...");
      
      // Build the JDE-specific system prompt with governance enforcement
      const governanceBlock = `
═══════════════════════════════════════════════════════════════════════════════
GOVERNANCE ENFORCEMENT FOR ${classification.jde_module}
═══════════════════════════════════════════════════════════════════════════════
REQUIRED PROGRAMS: ${governanceRules.required_programs.join(', ') || 'Based on document content'}
REQUIRED TABLES: ${governanceRules.required_tables.join(', ') || 'Based on document content'}
REQUIRED VALIDATIONS: ${governanceRules.required_validations.join('; ') || 'Standard JDE validations'}

BLOCKED TEST TYPES: ${testTypeDecision.blocked_test_types.join(', ') || 'None'}
${Object.entries(testTypeDecision.blocking_reasons).map(([type, reason]) => `  - ${type}: ${reason}`).join('\n')}

CRITICAL CONSTRAINT: Do NOT generate UI automation steps (click button, input field, navigate URL).
Generate FUNCTIONAL test cases using JDE application-level actions (Launch P4210, Enter supplier, Save order).
`;

      const systemPrompt = buildJDESystemPrompt(detectedObjects, jdeObjectKnowledge + "\n" + governanceBlock);

      // Build user prompt with structured document if available
      const depthRange = testDepth === "exhaustive" ? "40-60" : testDepth === "comprehensive" ? "25-35" : "15-20";
      const userPrompt = structuredDocument 
        ? `Generate comprehensive FUNCTIONAL test cases for this JDE specification.

═══════════════════════════════════════════════════════════════════════════════
DOCUMENT CLASSIFICATION
═══════════════════════════════════════════════════════════════════════════════
Document Type: ${classification.document_type}
JDE Module: ${classification.jde_module}
JDE Release: ${classification.jde_release}
Detected Programs: ${classification.detected_programs.join(', ') || 'None'}
Detected Reports: ${classification.detected_reports.join(', ') || 'None'}
Detected Tables: ${classification.detected_tables.join(', ') || 'None'}
Has AAIs: ${classification.detected_aais ? 'Yes' : 'No'}
Has Processing Options: ${classification.detected_processing_options ? 'Yes' : 'No'}

═══════════════════════════════════════════════════════════════════════════════
STRUCTURED SPECIFICATION
═══════════════════════════════════════════════════════════════════════════════
${JSON.stringify(structuredDocument, null, 2)}

═══════════════════════════════════════════════════════════════════════════════
GENERATION PARAMETERS
═══════════════════════════════════════════════════════════════════════════════
Title: ${title || "JDE Test Suite"}
Environment: ${environment || "Development"}
Business Unit: ${businessUnit || "Not specified"}
User Roles: ${userRoles || "Standard JDE User"}
Test Depth: ${testDepth} (${depthRange} test cases)
Include E2E Tests: ${includeE2E ? "YES" : "NO"}

IMPORTANT: Generate ${depthRange} FUNCTIONAL test cases. Use JDE program names (P4310), field IDs (AN8), table names (F4311). Do NOT use UI automation (click, input, navigate URL).
`
        : `Generate comprehensive FUNCTIONAL test cases for this JDE requirement.

═══════════════════════════════════════════════════════════════════════════════
DOCUMENT CLASSIFICATION
═══════════════════════════════════════════════════════════════════════════════
Document Type: ${classification.document_type}
JDE Module: ${classification.jde_module}
Confidence: ${classification.confidence_score}%
Reasoning: ${classification.classification_reasoning}

═══════════════════════════════════════════════════════════════════════════════
REQUIREMENT
═══════════════════════════════════════════════════════════════════════════════
Title: ${title || "JDE Test Suite"}
Description: ${description || ""}

═══════════════════════════════════════════════════════════════════════════════
SPECIFICATION TEXT (${inputText.length} characters)
═══════════════════════════════════════════════════════════════════════════════
${inputText.substring(0, 15000)}
${inputText.length > 15000 ? '\n... [truncated]' : ''}

═══════════════════════════════════════════════════════════════════════════════
GENERATION PARAMETERS
═══════════════════════════════════════════════════════════════════════════════
Environment: ${environment || "Development"}
Business Unit: ${businessUnit || "Not specified"}
User Roles: ${userRoles || "Standard JDE User"}
Detected JDE Objects: ${detectedObjects.join(", ") || "None detected"}
Test Depth: ${testDepth} (${depthRange} test cases)
Include E2E Tests: ${includeE2E ? "YES" : "NO"}

IMPORTANT: Generate ${depthRange} FUNCTIONAL test cases. Each test case must have:
- Clear objective
- Preconditions (data setup required)
- Step-by-step JDE actions (Launch P4310, Enter supplier, Save PO)
- Expected results
- Table validations (F4311, F0911)

Do NOT generate UI automation steps (click, input, navigate URL).
`;

      let generatedResult: { testCases: any[]; generatedBy: string; jdeObjects?: string[]; coverageSummary?: any } | null = null;

      try {
        const aiClient = await getAiClient();
        if (aiClient) {
          try {
            console.log("[GENERATE-JDE-TESTS] Attempting AI-based JDE generation...");
            
            const content = await aiClient.chat(
              [{ role: "user", content: userPrompt }],
              systemPrompt
            );

            // Extract JSON from response
            let jsonStr = content;
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
              jsonStr = jsonMatch[1].trim();
            }
            
            const parsed = JSON.parse(jsonStr);
            if (parsed && Array.isArray(parsed.testCases) && parsed.testCases.length > 0) {
              generatedResult = { 
                ...parsed, 
                generatedBy: "jde-ai",
                jdeObjects: detectedObjects
              };
              console.log("[GENERATE-JDE-TESTS] JDE AI generation successful: " + parsed.testCases.length + " tests");
            } else {
              console.warn("[GENERATE-JDE-TESTS] AI response missing testCases array, falling back to rule-based");
            }
          } catch (aiError: any) {
            console.error("[GENERATE-JDE-TESTS] AI generation failed:", aiError.message || aiError);
            console.log("[GENERATE-JDE-TESTS] Falling back to rule-based generator");
          }
        } else {
          console.log("[GENERATE-JDE-TESTS] No AI client available, using rule-based generator");
        }
      } catch (clientError: any) {
        console.error("[GENERATE-JDE-TESTS] Failed to get AI client:", clientError.message);
      }

      // Fallback to JDE-specific rule-based generation
      if (!generatedResult) {
        console.log("[GENERATE-JDE-TESTS] Using JDE-specific rule-based generator");
        const ruleBasedResult = generateJDERuleBasedTests(
          title || "JDE Test Suite",
          inputText,
          classification,
          detectedObjects
        );
        
        // ═══════════════════════════════════════════════════════════════════════
        // NORMALIZE JDE TEST CASES TO STANDARD FORMAT
        // JDE format: { stepNumber, action, jdeAction, fieldId, value, expected }
        // Standard format: { step, expected }
        // ═══════════════════════════════════════════════════════════════════════
        const normalizedTestCases = ruleBasedResult.testCases.map((tc: any) => {
          // Convert JDE steps to standard format
          const normalizedSteps = (tc.steps || []).map((s: any) => {
            // Build step description from JDE fields
            let stepDescription = s.action || "";
            if (s.fieldId) {
              stepDescription += ` [${s.fieldId}]`;
            }
            if (s.value) {
              stepDescription += `: ${s.value}`;
            }
            if (s.jdeAction && s.jdeAction !== s.action) {
              stepDescription += ` (${s.jdeAction})`;
            }
            
            return {
              step: stepDescription || `Step ${s.stepNumber || 1}`,
              expected: s.expected || "Step completes successfully"
            };
          });
          
          // Build description from objective and expected results
          const description = tc.objective || tc.description || "";
          const expectedResultsText = Array.isArray(tc.expectedResults) 
            ? tc.expectedResults.join("; ") 
            : "";
          
          // Build preconditions string
          const preconditions = Array.isArray(tc.preconditions)
            ? tc.preconditions.join("; ")
            : tc.preconditions || "";
          
          // Map priority from JDE format to standard
          const priorityMap: Record<string, string> = {
            "Critical": "critical",
            "High": "high", 
            "Medium": "medium",
            "Low": "low"
          };
          
          return {
            testCaseId: tc.testCaseId,
            title: tc.title,
            description: description + (expectedResultsText ? `\n\nExpected Results:\n${expectedResultsText}` : ""),
            preconditions: preconditions,
            steps: normalizedSteps,
            priority: priorityMap[tc.priority] || tc.priority?.toLowerCase() || "medium",
            testType: tc.testType?.toLowerCase() || "functional",
            confidenceScore: 90,
            riskLevel: tc.priority === "Critical" ? "high" : tc.priority === "High" ? "medium" : "low",
            automationSuitable: true,
            reasoning: `JDE ${tc.module || ""} - ${tc.jdeObject || ""}: ${tc.objective || ""}`,
            // Preserve JDE-specific metadata
            jdeMetadata: {
              module: tc.module,
              jdeObject: tc.jdeObject,
              tablesToValidate: tc.tablesToValidate,
              integrationValidation: tc.integrationValidation,
              postConditions: tc.postConditions,
              estimatedDuration: tc.estimatedDuration
            }
          };
        });
        
        console.log("[GENERATE-JDE-TESTS] Normalized " + normalizedTestCases.length + " JDE test cases to standard format");
        
        generatedResult = {
          testCases: normalizedTestCases,
          generatedBy: ruleBasedResult.generatedBy,
          jdeObjects: ruleBasedResult.jdeObjects,
          coverageSummary: ruleBasedResult.coverageSummary
        };
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 6: POST-GENERATION VALIDATION (Safety Net)
      // ═══════════════════════════════════════════════════════════════════════
      console.log("[GENERATE-JDE-TESTS] Step 6: Validating generated test cases...");
      const jdeValidation = validateJDETestCases(generatedResult.testCases, classification);
      console.log("[GENERATE-JDE-TESTS] JDE Validation:", {
        isValid: jdeValidation.isValid,
        score: jdeValidation.score,
        passedChecks: jdeValidation.passedChecks.length,
        failedChecks: jdeValidation.failedChecks.length,
        warnings: jdeValidation.warnings.length,
        corrections: jdeValidation.corrections.length
      });

      // Auto-correct if there are corrections available
      if (jdeValidation.corrections.length > 0) {
        console.log("[GENERATE-JDE-TESTS] Applying auto-corrections...");
        generatedResult.testCases = autoCorrectTestCases(generatedResult.testCases, jdeValidation.corrections);
      }

      // Also run generic validation
      const genericValidation = TestCaseValidator.validate(generatedResult);

      const enhancedOutput = {
        ...generatedResult,
        // JDE-specific validation
        jdeValidation: {
          isValid: jdeValidation.isValid,
          score: jdeValidation.score,
          passedChecks: jdeValidation.passedChecks,
          failedChecks: jdeValidation.failedChecks.map(f => ({
            checkId: f.checkId,
            severity: f.severity,
            message: f.message,
            suggestion: f.suggestion
          })),
          warnings: jdeValidation.warnings,
          regenerateRequired: jdeValidation.regenerateRequired
        },
        // Generic validation
        validationScore: genericValidation.score,
        validationWarnings: genericValidation.warnings,
        validationErrors: genericValidation.errors,
        // JDE metadata
        jdeMetadata: {
          documentClassification: {
            documentType: classification.document_type,
            jdeModule: classification.jde_module,
            jdeRelease: classification.jde_release,
            confidenceScore: classification.confidence_score
          },
          testTypeDecision: {
            allowedTypes: testTypeDecision.allowed_test_types,
            blockedTypes: testTypeDecision.blocked_test_types,
            blockingReasons: testTypeDecision.blocking_reasons
          },
          governanceRules: {
            requiredPrograms: governanceRules.required_programs,
            requiredTables: governanceRules.required_tables,
            requiredValidations: governanceRules.required_validations
          },
          detectedObjects: detectedObjects,
          objectKnowledgeUsed: jdeObjectKnowledge ? true : false,
          modules: modules || [],
        }
      };

      console.log("[GENERATE-JDE-TESTS] ═══════════════════════════════════════════");
      console.log("[GENERATE-JDE-TESTS] Complete. JDE Score: " + jdeValidation.score + "/100, Tests: " + (generatedResult.testCases?.length || 0));
      res.json(enhancedOutput);
    } catch (error: any) {
      console.error("[GENERATE-JDE-TESTS] Error:", error.message || error);
      res.status(500).json({ error: "Failed to generate JDE tests: " + (error.message || error) });
    }
  });

  // AI Script Generation
  app.post("/api/generate-script", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(generateScriptSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const { testCaseId, framework, language } = validation.data;

      const testCase = await storage.getTestCase(testCaseId);
      if (!testCase) {
        return res.status(404).json({ error: "Test case not found" });
      }

      const frameworkGuides: Record<string, string> = {
        playwright: "Use Playwright test runner with async/await patterns. Include proper selectors and assertions.",
        cypress: "Use Cypress commands and assertions. Follow the Cypress best practices.",
        selenium: "Use Selenium WebDriver with proper waits and element location strategies.",
        puppeteer: "Use Puppeteer with page interactions and proper async handling.",
      };

      const languageGuides: Record<string, string> = {
        typescript: "Use TypeScript with proper types and interfaces.",
        javascript: "Use modern JavaScript with ES6+ syntax.",
        python: "Use Python with pytest framework conventions.",
        java: "Use Java with proper class structure and JUnit annotations.",
        csharp: "Use C# with NUnit or xUnit test framework. Use proper namespaces, class structure, [Test] or [Fact] attributes, and async/await patterns. Include using statements for the framework and assertion library (NUnit.Framework or Xunit).",
      };

      const systemPrompt = `You are an automation engineer expert. Generate production-ready test automation scripts.
${frameworkGuides[framework] || ""}
${languageGuides[language] || ""}
Only output the code, no explanations. Include proper imports and setup.`;

      const userPrompt = `Generate a ${framework} test script in ${language} for the following test case:

Title: ${testCase.title}
Description: ${testCase.description || "N/A"}
Preconditions: ${testCase.preconditions || "None"}
Steps:
${(testCase.steps as any[] || []).map((s: any, i: number) => `${i + 1}. ${s.step} -> Expected: ${s.expected}`).join("\n")}`;

      let code: string;
      let usedFallback = false;
      try {
        const aiClient = await getAiClient();
        code = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
      } catch (aiError: any) {
        const isMissingKey =
          aiError?.message?.includes("Missing credentials") ||
          aiError?.message?.includes("apiKey") ||
          aiError?.message?.includes("OPENAI_API_KEY") ||
          aiError?.message?.includes("API key");
        if (isMissingKey) {
          code = generateRuleBasedScript(testCase, framework, language);
          usedFallback = true;
        } else {
          throw aiError;
        }
      }

      // Save the generated script
      const script = await storage.createScript({
        testCaseId,
        name: `${testCase.title} - ${framework}`,
        framework,
        language,
        code,
      });

      res.json({ code, script, generatedBy: usedFallback ? "rule-based" : "ai" });
    } catch (error) {
      console.error("Error generating script:", error);
      res.status(500).json({ error: "Failed to generate script" });
    }
  });

    // ============================================================
  // COMBINED SCRIPT GENERATOR — POST /api/generate-combined-script
  // Produces a single AITASExecutor class for ALL selected test cases
  // ============================================================
  app.post("/api/generate-combined-script", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(generateCombinedScriptSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const { testCaseIds, framework, language } = validation.data;

      // Fetch all requested test cases
      const testCases: any[] = [];
      const missing: string[] = [];
      for (const id of testCaseIds) {
        const tc = await storage.getTestCase(id);
        if (tc) testCases.push(tc);
        else missing.push(id);
      }
      if (testCases.length === 0) {
        return res.status(404).json({ error: "No test cases found for the given IDs" });
      }

      let code: string;
      let usedFallback = true;

      // Try AI first, fall back to rule-based
      try {
        const aiClient = await getAiClient();
        const stepsBlob = testCases.map((tc, i) =>
          `Test ${i + 1}: ${tc.title}\nSteps:\n${(tc.steps as any[] || []).map((s: any, j: number) => `  ${j + 1}. ${s.step} => ${s.expected}`).join("\n")}`
        ).join("\n\n");
        const prompt = `Generate a single AITASExecutor class in ${language} using ${framework} that runs ALL of the following test cases. Use a single browser instance, one method per test case, a runWithResult() wrapper for per-step error isolation, and an executeAllTests() entry point. Output code only.\n\n${stepsBlob}`;
        code = await aiClient.chat([{ role: "user", content: prompt }], `You are a senior test automation architect. Generate production-ready ${framework} automation code in ${language}. Single class, all tests combined.`);
        usedFallback = false;
      } catch {
        code = generateRuleBasedCombinedScript(testCases, framework, language);
      }

      res.json({
        code,
        generatedBy: usedFallback ? "rule-based" : "ai",
        testCaseCount: testCases.length,
        ...(missing.length > 0 ? { warnings: [`${missing.length} test case ID(s) not found: ${missing.join(", ")}`] } : {}),
      });
    } catch (error: any) {
      console.error("Error generating combined script:", error);
      res.status(500).json({ error: "Failed to generate combined script" });
    }
  });

  // ========================================
  // ENTERPRISE FEATURES API ROUTES
  // ========================================

  // Platform Settings
  app.get("/api/settings", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getAllSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.get("/api/settings/:category", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getSettingsByCategory(req.params.category);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(insertPlatformSettingSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const setting = await storage.upsertSetting(validation.data);
      res.json(setting);
    } catch (error) {
      console.error("Error saving setting:", error);
      res.status(500).json({ error: "Failed to save setting" });
    }
  });

  app.post("/api/settings/bulk", async (req: Request, res: Response) => {
    try {
      const settings = req.body.settings as any[];
      if (!Array.isArray(settings)) {
        return res.status(400).json({ error: "Settings must be an array" });
      }
      const results = await Promise.all(
        settings.map((s) => storage.upsertSetting(s))
      );
      res.json(results);
    } catch (error) {
      console.error("Error saving settings:", error);
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  // Environments
  app.get("/api/environments", async (req: Request, res: Response) => {
    try {
      const environments = await storage.getAllEnvironments();
      res.json(environments);
    } catch (error) {
      console.error("Error fetching environments:", error);
      res.status(500).json({ error: "Failed to fetch environments" });
    }
  });

  app.get("/api/environments/:id", async (req: Request, res: Response) => {
    try {
      const environment = await storage.getEnvironment(req.params.id);
      if (!environment) {
        return res.status(404).json({ error: "Environment not found" });
      }
      res.json(environment);
    } catch (error) {
      console.error("Error fetching environment:", error);
      res.status(500).json({ error: "Failed to fetch environment" });
    }
  });

  app.post("/api/environments", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(insertEnvironmentSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const environment = await storage.createEnvironment(validation.data);
      res.status(201).json(environment);
    } catch (error) {
      console.error("Error creating environment:", error);
      res.status(500).json({ error: "Failed to create environment" });
    }
  });

  app.patch("/api/environments/:id", async (req: Request, res: Response) => {
    try {
      const environment = await storage.updateEnvironment(req.params.id, req.body);
      if (!environment) {
        return res.status(404).json({ error: "Environment not found" });
      }
      res.json(environment);
    } catch (error) {
      console.error("Error updating environment:", error);
      res.status(500).json({ error: "Failed to update environment" });
    }
  });

  app.delete("/api/environments/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteEnvironment(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting environment:", error);
      res.status(500).json({ error: "Failed to delete environment" });
    }
  });

  // Test Data Pools
  app.get("/api/test-data-pools", async (req: Request, res: Response) => {
    try {
      const pools = await storage.getAllTestDataPools();
      res.json(pools);
    } catch (error) {
      console.error("Error fetching test data pools:", error);
      res.status(500).json({ error: "Failed to fetch test data pools" });
    }
  });

  app.get("/api/test-data-pools/:id", async (req: Request, res: Response) => {
    try {
      const pool = await storage.getTestDataPool(req.params.id);
      if (!pool) {
        return res.status(404).json({ error: "Test data pool not found" });
      }
      res.json(pool);
    } catch (error) {
      console.error("Error fetching test data pool:", error);
      res.status(500).json({ error: "Failed to fetch test data pool" });
    }
  });

  app.post("/api/test-data-pools", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(insertTestDataPoolSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const pool = await storage.createTestDataPool(validation.data);
      res.status(201).json(pool);
    } catch (error) {
      console.error("Error creating test data pool:", error);
      res.status(500).json({ error: "Failed to create test data pool" });
    }
  });

  app.patch("/api/test-data-pools/:id", async (req: Request, res: Response) => {
    try {
      const pool = await storage.updateTestDataPool(req.params.id, req.body);
      if (!pool) {
        return res.status(404).json({ error: "Test data pool not found" });
      }
      res.json(pool);
    } catch (error) {
      console.error("Error updating test data pool:", error);
      res.status(500).json({ error: "Failed to update test data pool" });
    }
  });

  app.delete("/api/test-data-pools/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteTestDataPool(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting test data pool:", error);
      res.status(500).json({ error: "Failed to delete test data pool" });
    }
  });

  // Visual Baselines
  app.get("/api/visual-baselines", async (req: Request, res: Response) => {
    try {
      const baselines = await storage.getAllVisualBaselines();
      res.json(baselines);
    } catch (error) {
      console.error("Error fetching visual baselines:", error);
      res.status(500).json({ error: "Failed to fetch visual baselines" });
    }
  });

  app.get("/api/visual-baselines/:id", async (req: Request, res: Response) => {
    try {
      const baseline = await storage.getVisualBaseline(req.params.id);
      if (!baseline) {
        return res.status(404).json({ error: "Visual baseline not found" });
      }
      res.json(baseline);
    } catch (error) {
      console.error("Error fetching visual baseline:", error);
      res.status(500).json({ error: "Failed to fetch visual baseline" });
    }
  });

  app.post("/api/visual-baselines", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(insertVisualBaselineSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const baseline = await storage.createVisualBaseline(validation.data);
      res.status(201).json(baseline);
    } catch (error) {
      console.error("Error creating visual baseline:", error);
      res.status(500).json({ error: "Failed to create visual baseline" });
    }
  });

  app.patch("/api/visual-baselines/:id", async (req: Request, res: Response) => {
    try {
      const baseline = await storage.updateVisualBaseline(req.params.id, req.body);
      if (!baseline) {
        return res.status(404).json({ error: "Visual baseline not found" });
      }
      res.json(baseline);
    } catch (error) {
      console.error("Error updating visual baseline:", error);
      res.status(500).json({ error: "Failed to update visual baseline" });
    }
  });

  app.delete("/api/visual-baselines/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteVisualBaseline(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting visual baseline:", error);
      res.status(500).json({ error: "Failed to delete visual baseline" });
    }
  });

  // Visual Comparisons
  app.get("/api/executions/:executionId/visual-comparisons", async (req: Request, res: Response) => {
    try {
      const comparisons = await storage.getVisualComparisonsByExecution(req.params.executionId);
      res.json(comparisons);
    } catch (error) {
      console.error("Error fetching visual comparisons:", error);
      res.status(500).json({ error: "Failed to fetch visual comparisons" });
    }
  });

  // Performance Metrics
  app.get("/api/executions/:executionId/performance", async (req: Request, res: Response) => {
    try {
      const metrics = await storage.getPerformanceMetricsByExecution(req.params.executionId);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching performance metrics:", error);
      res.status(500).json({ error: "Failed to fetch performance metrics" });
    }
  });

  // API Mocks
  app.get("/api/mocks", async (req: Request, res: Response) => {
    try {
      const mocks = await storage.getAllApiMocks();
      res.json(mocks);
    } catch (error) {
      console.error("Error fetching API mocks:", error);
      res.status(500).json({ error: "Failed to fetch API mocks" });
    }
  });

  app.get("/api/mocks/:id", async (req: Request, res: Response) => {
    try {
      const mock = await storage.getApiMock(req.params.id);
      if (!mock) {
        return res.status(404).json({ error: "API mock not found" });
      }
      res.json(mock);
    } catch (error) {
      console.error("Error fetching API mock:", error);
      res.status(500).json({ error: "Failed to fetch API mock" });
    }
  });

  app.post("/api/mocks", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(insertApiMockSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const mock = await storage.createApiMock(validation.data);
      res.status(201).json(mock);
    } catch (error) {
      console.error("Error creating API mock:", error);
      res.status(500).json({ error: "Failed to create API mock" });
    }
  });

  app.patch("/api/mocks/:id", async (req: Request, res: Response) => {
    try {
      const mock = await storage.updateApiMock(req.params.id, req.body);
      if (!mock) {
        return res.status(404).json({ error: "API mock not found" });
      }
      res.json(mock);
    } catch (error) {
      console.error("Error updating API mock:", error);
      res.status(500).json({ error: "Failed to update API mock" });
    }
  });

  app.delete("/api/mocks/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteApiMock(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting API mock:", error);
      res.status(500).json({ error: "Failed to delete API mock" });
    }
  });

  // CI/CD Webhooks
  app.get("/api/webhooks", async (req: Request, res: Response) => {
    try {
      const webhooks = await storage.getAllCicdWebhooks();
      res.json(webhooks);
    } catch (error) {
      console.error("Error fetching webhooks:", error);
      res.status(500).json({ error: "Failed to fetch webhooks" });
    }
  });

  app.get("/api/webhooks/:id", async (req: Request, res: Response) => {
    try {
      const webhook = await storage.getCicdWebhook(req.params.id);
      if (!webhook) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      res.json(webhook);
    } catch (error) {
      console.error("Error fetching webhook:", error);
      res.status(500).json({ error: "Failed to fetch webhook" });
    }
  });

  app.post("/api/webhooks", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(insertCicdWebhookSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const webhook = await storage.createCicdWebhook(validation.data);
      res.status(201).json(webhook);
    } catch (error) {
      console.error("Error creating webhook:", error);
      res.status(500).json({ error: "Failed to create webhook" });
    }
  });

  app.patch("/api/webhooks/:id", async (req: Request, res: Response) => {
    try {
      const webhook = await storage.updateCicdWebhook(req.params.id, req.body);
      if (!webhook) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      res.json(webhook);
    } catch (error) {
      console.error("Error updating webhook:", error);
      res.status(500).json({ error: "Failed to update webhook" });
    }
  });

  app.delete("/api/webhooks/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteCicdWebhook(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting webhook:", error);
      res.status(500).json({ error: "Failed to delete webhook" });
    }
  });

  // Webhook trigger endpoint (for CI/CD systems to call)
  app.post("/api/webhooks/:id/trigger", async (req: Request, res: Response) => {
    try {
      const webhook = await storage.getCicdWebhook(req.params.id);
      if (!webhook) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      if (!webhook.isActive) {
        return res.status(400).json({ error: "Webhook is not active" });
      }
      if (!webhook.suiteId) {
        return res.status(400).json({ error: "Webhook has no associated test suite" });
      }

      // Get environment config
      let targetUrl = req.body.targetUrl;
      if (!targetUrl && webhook.environmentId) {
        const env = await storage.getEnvironment(webhook.environmentId);
        if (env) {
          targetUrl = env.baseUrl;
        }
      }

      if (!targetUrl) {
        return res.status(400).json({ error: "Target URL is required" });
      }

      // Create execution
      const execution = await storage.createExecution({
        suiteId: webhook.suiteId,
        targetUrl,
        framework: "playwright",
        environment: "production",
        status: "pending",
      });

      // Update webhook last triggered
      await storage.updateCicdWebhook(webhook.id, { lastTriggered: new Date() });

      // Start AI-powered execution
      const testCases = await storage.getTestCasesBySuite(webhook.suiteId);
      aiTestExecutor.runExecution(execution.id, testCases, targetUrl, "selenium");

      res.json({ executionId: execution.id, message: "Execution started" });
    } catch (error) {
      console.error("Error triggering webhook:", error);
      res.status(500).json({ error: "Failed to trigger webhook" });
    }
  });

  // Generate CI/CD config files
  app.get("/api/webhooks/:id/config/:provider", async (req: Request, res: Response) => {
    try {
      const webhook = await storage.getCicdWebhook(req.params.id);
      if (!webhook) {
        return res.status(404).json({ error: "Webhook not found" });
      }

      const { provider } = req.params;
      const webhookUrl = `${req.protocol}://${req.get("host")}/api/webhooks/${webhook.id}/trigger`;

      let config = "";
      switch (provider) {
        case "github":
          config = `name: AITAS Test Automation
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger AITAS Tests
        run: |
          curl -X POST ${webhookUrl} \\
            -H "Content-Type: application/json" \\
            -d '{"targetUrl": "\${{ secrets.TARGET_URL }}"}'
`;
          break;
        case "gitlab":
          config = `stages:
  - test

aitas_tests:
  stage: test
  script:
    - curl -X POST ${webhookUrl} -H "Content-Type: application/json" -d '{"targetUrl": "$TARGET_URL"}'
  only:
    - main
    - merge_requests
`;
          break;
        case "jenkins":
          config = `pipeline {
    agent any
    stages {
        stage('Test') {
            steps {
                sh '''
                    curl -X POST ${webhookUrl} \\
                        -H "Content-Type: application/json" \\
                        -d '{"targetUrl": "'\$TARGET_URL'"}'
                '''
            }
        }
    }
}
`;
          break;
        default:
          return res.status(400).json({ error: "Unsupported provider" });
      }

      res.json({ provider, config });
    } catch (error) {
      console.error("Error generating config:", error);
      res.status(500).json({ error: "Failed to generate config" });
    }
  });

  // Roles (RBAC)
  app.get("/api/roles", async (req: Request, res: Response) => {
    try {
      const roles = await storage.getAllRoles();
      res.json(roles);
    } catch (error) {
      console.error("Error fetching roles:", error);
      res.status(500).json({ error: "Failed to fetch roles" });
    }
  });

  app.post("/api/roles", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(insertRoleSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const role = await storage.createRole(validation.data);
      res.status(201).json(role);
    } catch (error) {
      console.error("Error creating role:", error);
      res.status(500).json({ error: "Failed to create role" });
    }
  });

  app.patch("/api/roles/:id", async (req: Request, res: Response) => {
    try {
      const role = await storage.updateRole(req.params.id, req.body);
      if (!role) {
        return res.status(404).json({ error: "Role not found or is a system role" });
      }
      res.json(role);
    } catch (error) {
      console.error("Error updating role:", error);
      res.status(500).json({ error: "Failed to update role" });
    }
  });

  app.delete("/api/roles/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteRole(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting role:", error);
      res.status(500).json({ error: "Failed to delete role" });
    }
  });

  // Mobile Devices
  app.get("/api/mobile-devices", async (req: Request, res: Response) => {
    try {
      const devices = await storage.getAllMobileDevices();
      res.json(devices);
    } catch (error) {
      console.error("Error fetching mobile devices:", error);
      res.status(500).json({ error: "Failed to fetch mobile devices" });
    }
  });

  app.get("/api/mobile-devices/:id", async (req: Request, res: Response) => {
    try {
      const device = await storage.getMobileDevice(req.params.id);
      if (!device) {
        return res.status(404).json({ error: "Mobile device not found" });
      }
      res.json(device);
    } catch (error) {
      console.error("Error fetching mobile device:", error);
      res.status(500).json({ error: "Failed to fetch mobile device" });
    }
  });

  app.post("/api/mobile-devices", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(insertMobileDeviceSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const device = await storage.createMobileDevice(validation.data);
      res.status(201).json(device);
    } catch (error) {
      console.error("Error creating mobile device:", error);
      res.status(500).json({ error: "Failed to create mobile device" });
    }
  });

  app.patch("/api/mobile-devices/:id", async (req: Request, res: Response) => {
    try {
      const device = await storage.updateMobileDevice(req.params.id, req.body);
      if (!device) {
        return res.status(404).json({ error: "Mobile device not found" });
      }
      res.json(device);
    } catch (error) {
      console.error("Error updating mobile device:", error);
      res.status(500).json({ error: "Failed to update mobile device" });
    }
  });

  app.delete("/api/mobile-devices/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteMobileDevice(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting mobile device:", error);
      res.status(500).json({ error: "Failed to delete mobile device" });
    }
  });

  // ========================================
  // PROJECTS & TEAM MEMBERSHIPS
  // ========================================

  // Projects
  app.get("/api/projects", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      // Get all projects user has access to
      const projects = await storage.getProjectsForUser(userId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const project = await storage.getProject(req.params.id as string);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      // Auto-generate slug from name if not provided
      const slug = req.body.slug || req.body.name?.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50) + '-' + Date.now().toString(36);
      const validation = validateBody(insertProjectSchema, { ...req.body, slug, ownerId: userId });
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const project = await storage.createProject(validation.data);
      // Add creator as owner in team memberships (best-effort)
      try {
        const adminRole = await storage.getRoleByName("admin");
        if (adminRole && userId) {
          await storage.createTeamMembership({ userId, projectId: project.id, roleId: adminRole.id, isOwner: true });
        }
      } catch (memberErr: any) {
        console.warn("Could not add owner membership:", memberErr.message);
      }
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const project = await storage.updateProject(req.params.id as string, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      await storage.deleteProject(req.params.id as string);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Team Memberships
  app.get("/api/projects/:projectId/members", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const members = await storage.getProjectMembers(req.params.projectId as string);
      res.json(members);
    } catch (error) {
      console.error("Error fetching project members:", error);
      res.status(500).json({ error: "Failed to fetch project members" });
    }
  });

  app.post("/api/projects/:projectId/members", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const validation = validateBody(addProjectMemberSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }

      const { email, firstName, lastName, temporaryPassword, role } = validation.data;

      // Check if user already exists
      let user = await getUserByEmail(email);

      // If user doesn't exist, create them with temporary password
      if (!user) {
        user = await createUser(email, firstName, lastName, temporaryPassword, false);
      }

      // Get the role
      const roleRecord = await storage.getRoleByName(role);
      if (!roleRecord) {
        return res.status(400).json({ error: "Invalid role" });
      }

      // Check if user is already a member
      const existingMembership = await storage.getUserProjectMembership(user.id, req.params.projectId);
      if (existingMembership) {
        return res.status(400).json({ error: "User is already a member of this project" });
      }

      // Create team membership
      const membership = await storage.createTeamMembership({
        userId: user.id,
        projectId: req.params.projectId,
        roleId: roleRecord.id,
        isOwner: false,
      });

      res.status(201).json({
        membership,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        temporaryPassword: temporaryPassword, // Return so admin can share with user
      });
    } catch (error: any) {
      console.error("Error adding project member:", error);
      if (error.code === "23505") { // Unique constraint violation
        return res.status(400).json({ error: "User with this email already exists" });
      }
      res.status(500).json({ error: "Failed to add project member" });
    }
  });

  app.patch("/api/team-memberships/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const membership = await storage.updateTeamMembership(req.params.id as string, req.body);
      if (!membership) {
        return res.status(404).json({ error: "Team membership not found" });
      }
      res.json(membership);
    } catch (error) {
      console.error("Error updating team membership:", error);
      res.status(500).json({ error: "Failed to update team membership" });
    }
  });

  app.delete("/api/team-memberships/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      await storage.deleteTeamMembership(req.params.id as string);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing team member:", error);
      res.status(500).json({ error: "Failed to remove team member" });
    }
  });

  // Get current user's role in a project
  app.get("/api/projects/:projectId/my-role", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const membership = await storage.getUserProjectMembership(userId, req.params.projectId as string);
      if (!membership) {
        return res.status(404).json({ error: "Not a member of this project" });
      }
      res.json(membership);
    } catch (error) {
      console.error("Error fetching user role:", error);
      res.status(500).json({ error: "Failed to fetch user role" });
    }
  });

  // ========================================

  // ============================================================
  // SPEC DOCUMENT UPLOAD: POST /api/generate/parse-spec
  // ============================================================
  app.post("/api/generate/parse-spec", specUpload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const ext = nodePath.extname(req.file.originalname).toLowerCase();
      const buf = req.file.buffer;
      let text = ""; let pages = 1;
      
      if (ext === ".pdf") {
        // pdf-parse v2 uses ESM with a named export PDFParse
        // Handle both ESM and CJS import patterns
        try {
          const pdfParseMod = await import("pdf-parse");
          const PDFParse = pdfParseMod.PDFParse || (pdfParseMod as any).default?.PDFParse || (pdfParseMod as any).default;
          
          if (!PDFParse || typeof PDFParse !== "function") {
            throw new Error("PDFParse class not found in pdf-parse module");
          }
          
          const parser = new PDFParse({ data: buf });
          const textResult = await parser.getText();
          text = textResult.text || "";
          pages = textResult.total || 1;
          await parser.destroy();
        } catch (pdfError: any) {
          console.error("[parse-spec] pdf-parse error:", pdfError.message);
          // Fallback: try using pdfjs-dist directly if pdf-parse fails
          try {
            const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
            const loadingTask = pdfjs.getDocument({ data: buf });
            const pdf = await loadingTask.promise;
            pages = pdf.numPages;
            const textParts: string[] = [];
            for (let i = 1; i <= pages; i++) {
              const page = await pdf.getPage(i);
              const content = await page.getTextContent();
              const pageText = content.items.map((item: any) => item.str || "").join(" ");
              textParts.push(pageText);
            }
            text = textParts.join("\n\n");
          } catch (pdfjsError: any) {
            console.error("[parse-spec] pdfjs-dist fallback error:", pdfjsError.message);
            throw new Error("pdf-parse could not be loaded (CJS/ESM mismatch)");
          }
        }
      } else if (ext === ".docx" || ext === ".doc") {
        // mammoth is CJS — exports land directly on namespace or under .default
        const mammothMod: any = await import("mammoth");
        const mammoth: any = (mammothMod.default && typeof mammothMod.default.extractRawText === "function")
          ? mammothMod.default
          : mammothMod;
        const r2 = await mammoth.extractRawText({ buffer: buf });
        text = r2.value || ""; pages = Math.ceil(text.length / 3000) || 1;
      } else { text = buf.toString("utf-8"); pages = Math.ceil(text.length / 3000) || 1; }
      const MAX = 200_000; const truncated = text.length > MAX; const textOut = text.substring(0,MAX);
      const headingRe = /^(#{1,3}\s+.+|\d+\.\s+[A-Z].+|[A-Z][A-Z\s]{5,50})$/gm;
      const sections = [...new Set((textOut.match(headingRe)||[]).map((h:any)=>h.trim()).slice(0,30))];
      
      // Check if this looks like a JDE document by extracting JDE objects
      const jdeObjects = extractJDEObjectsFromText(textOut);
      const isJDEDocument = jdeObjects.length > 0;
      
      let summary = "";
      let structuredDocument: any = null;
      
      try {
        const { getAiClient } = await import("./ai-client");
        const ai = await getAiClient();
        
        if (isJDEDocument) {
          // Use JDE-specific document structuring prompt
          console.log("[parse-spec] JDE document detected with objects:", jdeObjects);
          
          const jdeObjectKnowledge = jdeObjects
            .map(obj => getJDEObjectKnowledge(obj))
            .filter(Boolean)
            .join("\n\n");
          
          const structuringPrompt = JDE_DOCUMENT_STRUCTURING_PROMPT
            .replace("{{JDE_OBJECTS}}", jdeObjects.join(", "))
            .replace("{{JDE_KNOWLEDGE}}", jdeObjectKnowledge || "Standard JDE knowledge");
          
          const structuredResponse = await ai.chat([
            { role: "user", content: `Structure this JDE functional specification document:\n\n${textOut.substring(0, 12000)}` }
          ], structuringPrompt);
          
          // Try to parse as JSON, otherwise use as summary
          try {
            structuredDocument = JSON.parse(structuredResponse);
            summary = `JDE Document: ${structuredDocument.documentType || 'Functional Spec'} - ${structuredDocument.modules?.map((m: any) => m.name).join(', ') || 'Multiple Modules'}. Contains ${jdeObjects.length} JDE objects: ${jdeObjects.slice(0, 5).join(', ')}${jdeObjects.length > 5 ? '...' : ''}.`;
          } catch {
            summary = structuredResponse.substring(0, 500);
          }
        } else {
          // Standard document summary
          summary = await ai.chat([{ role:"user", content:`Summarise this spec in 2-3 sentences, list main modules:\n\n${textOut.substring(0,5000)}` }], "You are a senior QA analyst. Be concise.");
        }
      } catch { summary = "(AI summary unavailable)"; }
      
      // Perform JDE document classification if it's a JDE document
      let jdeClassification: any = null;
      let jdeTestTypeDecision: any = null;
      if (isJDEDocument) {
        jdeClassification = classifyJDEDocument(textOut);
        jdeTestTypeDecision = resolveTestTypes(jdeClassification);
        console.log("[parse-spec] JDE Classification:", jdeClassification.document_type, jdeClassification.jde_module);
      }
      
      res.json({ 
        filename: req.file.originalname, 
        size: req.file.size, 
        pages, 
        truncated, 
        charCount: textOut.length, 
        sections, 
        summary, 
        text: textOut,
        // JDE-specific fields
        isJDEDocument,
        jdeObjects: isJDEDocument ? jdeObjects : undefined,
        structuredDocument: structuredDocument || undefined,
        // NEW: Full JDE classification data
        jdeClassification: jdeClassification ? {
          documentType: jdeClassification.document_type,
          jdeModule: jdeClassification.jde_module,
          jdeRelease: jdeClassification.jde_release,
          supportsUIAutomation: jdeClassification.supports_ui_automation,
          supportsFunctionalTesting: jdeClassification.supports_functional_testing,
          supportsConfigurationTesting: jdeClassification.supports_configuration_testing,
          supportsIntegrationTesting: jdeClassification.supports_integration_testing,
          detectedPrograms: jdeClassification.detected_programs,
          detectedReports: jdeClassification.detected_reports,
          detectedTables: jdeClassification.detected_tables,
          hasAAIs: jdeClassification.detected_aais,
          hasProcessingOptions: jdeClassification.detected_processing_options,
          hasBusinessFlows: jdeClassification.detected_business_flows,
          confidenceScore: jdeClassification.confidence_score,
          classificationReasoning: jdeClassification.classification_reasoning
        } : undefined,
        jdeTestTypeDecision: jdeTestTypeDecision ? {
          allowedTestTypes: jdeTestTypeDecision.allowed_test_types,
          blockedTestTypes: jdeTestTypeDecision.blocked_test_types,
          blockingReasons: jdeTestTypeDecision.blocking_reasons
        } : undefined
      });
    } catch(err:any){ console.error("[parse-spec]",err.message); res.status(500).json({error:err.message}); }
  });

  // APP PROFILES â€” Application Type Intelligence
  // ========================================

  app.get("/api/app-profiles", (_req: Request, res: Response) => {
    res.json({
      profiles: Object.values(APP_PROFILES),
      categories: APP_PROFILE_CATEGORIES
    });
  });

  app.get("/api/app-profiles/:type", (req: Request, res: Response) => {
    const profile = APP_PROFILES[req.params.type as keyof typeof APP_PROFILES];
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    res.json(profile);
  });

  // ========================================
  // NOTIFICATIONS â€” Slack / Teams / Email
  // ========================================

  app.post("/api/notifications/test", async (req: Request, res: Response) => {
    try {
      const { channel, config } = req.body;
      if (!channel || !config) {
        return res.status(400).json({ error: "channel and config are required" });
      }
      const result = await sendTestNotification(channel, config);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ========================================
  // API TEST EXECUTOR â€” REST / GraphQL / SOAP
  // ========================================

  const createApiExecutionSchema = z.object({
    suiteId: z.string().optional().nullable(),
    baseUrl: z.string().url("Valid base URL is required"),
    testData: z.array(testDataParamSchema).optional(),
    environment: z.enum(["development", "staging", "production"]).optional(),
    authConfig: z.object({
      type: z.enum(["bearer", "basic", "api_key", "none"]),
      token: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      apiKey: z.string().optional(),
    }).optional(),
  });

  app.post("/api/executions/api", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(createApiExecutionSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const { suiteId, baseUrl, testData, environment, authConfig } = validation.data;

      const testCases = suiteId
        ? await storage.getTestCasesBySuite(suiteId)
        : await storage.getAllTestCases();

      if (testCases.length === 0) {
        return res.status(400).json({ error: "No test cases found" });
      }

      const execution = await storage.createExecution({
        suiteId: suiteId ?? undefined,
        targetUrl: baseUrl,
        framework: "api",
        environment: environment ?? "staging",
        status: "pending",
        totalTests: testCases.length,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
      });

      // Run API tests asynchronously
      apiTestExecutor
        .runExecution(execution.id, testCases, baseUrl, testData, authConfig)
        .catch((err: any) => {
          console.error("API execution error:", err);
          storage.updateExecution(execution.id, {
            status: "failed",
            completedAt: new Date(),
          });
        });

      res.status(201).json(execution);
    } catch (error) {
      console.error("Error creating API execution:", error);
      res.status(500).json({ error: "Failed to create API execution" });
    }
  });

  // ========================================
  // SALESFORCE EXECUTOR â€” Phase 2
  // ========================================

  const sfExecutionSchema = z.object({
    suiteId: z.string().optional().nullable(),
    instanceUrl: z.string().url(),
    username: z.string().optional(),
    password: z.string().optional(),
    securityToken: z.string().optional(),
    accessToken: z.string().optional(),
    apiVersion: z.string().optional(),
    isSandbox: z.boolean().optional(),
    testData: z.array(testDataParamSchema).optional(),
    environment: z.enum(["development", "staging", "production"]).optional(),
  });

  app.post("/api/executions/salesforce", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(sfExecutionSchema, req.body);
      if (!validation.success) return res.status(400).json({ error: validation.error });

      const { suiteId, testData, environment, ...sfConfig } = validation.data;
      const testCases = suiteId
        ? await storage.getTestCasesBySuite(suiteId)
        : await storage.getAllTestCases();

      if (testCases.length === 0)
        return res.status(400).json({ error: "No test cases found" });

      const execution = await storage.createExecution({
        suiteId: suiteId ?? undefined,
        targetUrl: sfConfig.instanceUrl,
        framework: "playwright",
        environment: environment ?? "production",
        status: "pending",
        totalTests: testCases.length,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
      });

      salesforceExecutor
        .runExecution(execution.id, testCases, sfConfig as SalesforceConfig, testData)
        .catch((err: any) => {
          console.error("SF execution error:", err);
          storage.updateExecution(execution.id, { status: "failed", completedAt: new Date() });
        });

      res.status(201).json(execution);
    } catch (error) {
      console.error("Error creating SF execution:", error);
      res.status(500).json({ error: "Failed to create Salesforce execution" });
    }
  });

  // ========================================
  // JDE EXECUTOR â€” Phase 2
  // ========================================

  const jdeExecutionSchema = z.object({
    suiteId: z.string().optional().nullable(),
    baseUrl: z.string().url(),
    aisUrl: z.string().optional(),
    username: z.string(),
    password: z.string(),
    environment: z.string().optional(),
    role: z.string().optional(),
    apiVersion: z.string().optional(),
    testData: z.array(testDataParamSchema).optional(),
    execEnvironment: z.enum(["development", "staging", "production"]).optional(),
  });

  app.post("/api/executions/jde", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(jdeExecutionSchema, req.body);
      if (!validation.success) return res.status(400).json({ error: validation.error });

      const { suiteId, testData, execEnvironment, ...jdeConfig } = validation.data;
      const testCases = suiteId
        ? await storage.getTestCasesBySuite(suiteId)
        : await storage.getAllTestCases();

      if (testCases.length === 0)
        return res.status(400).json({ error: "No test cases found" });

      const execution = await storage.createExecution({
        suiteId: suiteId ?? undefined,
        targetUrl: jdeConfig.baseUrl,
        framework: "selenium",
        environment: execEnvironment ?? "production",
        status: "pending",
        totalTests: testCases.length,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
      });

      jdeExecutor
        .runExecution(execution.id, testCases, jdeConfig as JDEConfig, testData)
        .catch((err: any) => {
          console.error("JDE execution error:", err);
          storage.updateExecution(execution.id, { status: "failed", completedAt: new Date() });
        });

      res.status(201).json(execution);
    } catch (error) {
      console.error("Error creating JDE execution:", error);
      res.status(500).json({ error: "Failed to create JDE execution" });
    }
  });

  // JDE AIS direct query endpoint
  app.post("/api/jde/ais/query", async (req: Request, res: Response) => {
    try {
      const { aisUrl, username, password, environment, role, tableName, query } = req.body;
      if (!aisUrl || !username || !password || !tableName)
        return res.status(400).json({ error: "aisUrl, username, password, tableName required" });

      const client = new JDEAisClient({ baseUrl: aisUrl, aisUrl, username, password, environment, role });
      await client.authenticate();
      const records = await client.queryData(tableName, query || {});
      await client.logout();
      res.json({ records, count: records.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // ENTERPRISE AUTH â€” Phase 2
  // ========================================

  app.post("/api/auth/enterprise/test", async (req: Request, res: Response) => {
    try {
      const result = await testAuthConfig(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/auth/enterprise/save", async (req: Request, res: Response) => {
    try {
      const { name, type, config, environmentId } = req.body;
      if (!name || !type) return res.status(400).json({ error: "name and type required" });
      await saveAuthConfig(name, type, config, environmentId);
      res.json({ success: true, message: `Auth config "${name}" saved` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/auth/enterprise/configs", async (req: Request, res: Response) => {
    try {
      const configs = await loadAuthConfigs();
      res.json(configs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/enterprise/totp", async (req: Request, res: Response) => {
    try {
      const { secret } = req.body;
      if (!secret) return res.status(400).json({ error: "secret required" });
      const code = await generateTOTP(secret);
      res.json({ code, expiresIn: 30 - (Math.floor(Date.now() / 1000) % 30) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // SAP FIORI EXECUTOR â€” Phase 3
  // ========================================

  const sapFioriSchema = z.object({
    suiteId: z.string().optional().nullable(),
    baseUrl: z.string().url(),
    username: z.string().optional(),
    password: z.string().optional(),
    client: z.string().optional(),
    language: z.string().optional(),
    accessToken: z.string().optional(),
    odataBaseUrl: z.string().optional(),
    testData: z.array(testDataParamSchema).optional(),
    environment: z.enum(["development", "staging", "production"]).optional(),
  });

  app.post("/api/executions/sap-fiori", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(sapFioriSchema, req.body);
      if (!validation.success) return res.status(400).json({ error: validation.error });
      const { suiteId, testData, environment, ...sapConfig } = validation.data;
      const testCases = suiteId ? await storage.getTestCasesBySuite(suiteId) : await storage.getAllTestCases();
      if (testCases.length === 0) return res.status(400).json({ error: "No test cases found" });
      const execution = await storage.createExecution({
        suiteId: suiteId ?? undefined, targetUrl: sapConfig.baseUrl,
        framework: "playwright", environment: environment ?? "production",
        status: "pending", totalTests: testCases.length, passedTests: 0, failedTests: 0, skippedTests: 0,
      });
      sapFioriExecutor.runExecution(execution.id, testCases, sapConfig as SAPFioriConfig, testData)
        .catch((err: any) => { console.error("SAP Fiori error:", err); storage.updateExecution(execution.id, { status: "failed", completedAt: new Date() }); });
      res.status(201).json(execution);
    } catch (error) { console.error("SAP Fiori execution error:", error); res.status(500).json({ error: "Failed to create SAP Fiori execution" }); }
  });

  // ========================================
  // SAP GUI EXECUTOR â€” Phase 3
  // ========================================

  const sapGuiSchema = z.object({
    suiteId: z.string().optional().nullable(),
    systemId: z.string(),
    client: z.string(),
    username: z.string(),
    password: z.string(),
    language: z.string().optional(),
    connectionString: z.string().optional(),
    scriptTimeout: z.number().optional(),
    testData: z.array(testDataParamSchema).optional(),
    environment: z.enum(["development", "staging", "production"]).optional(),
  });

  app.post("/api/executions/sap-gui", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(sapGuiSchema, req.body);
      if (!validation.success) return res.status(400).json({ error: validation.error });
      const { suiteId, testData, environment, ...guiConfig } = validation.data;
      const testCases = suiteId ? await storage.getTestCasesBySuite(suiteId) : await storage.getAllTestCases();
      if (testCases.length === 0) return res.status(400).json({ error: "No test cases found" });
      const execution = await storage.createExecution({
        suiteId: suiteId ?? undefined, targetUrl: `sap://${guiConfig.systemId}`,
        framework: "sap-gui", environment: environment ?? "production",
        status: "pending", totalTests: testCases.length, passedTests: 0, failedTests: 0, skippedTests: 0,
      });
      sapGuiExecutor.runExecution(execution.id, testCases, guiConfig as SAPGUIConfig, testData)
        .catch((err: any) => { console.error("SAP GUI error:", err); storage.updateExecution(execution.id, { status: "failed", completedAt: new Date() }); });
      res.status(201).json(execution);
    } catch (error) { console.error("SAP GUI execution error:", error); res.status(500).json({ error: "Failed to create SAP GUI execution" }); }
  });

  // Generate SAP GUI VBScript for a test case
  app.post("/api/sap-gui/generate-script", async (req: Request, res: Response) => {
    try {
      const { testCaseId, systemId, client, username, password, language } = req.body;
      if (!testCaseId || !systemId || !client || !username || !password)
        return res.status(400).json({ error: "testCaseId, systemId, client, username, password required" });
      const testCase = await storage.getTestCase(testCaseId);
      if (!testCase) return res.status(404).json({ error: "Test case not found" });
      const script = await sapGuiExecutor.generateScript(testCase, { systemId, client, username, password, language });
      res.json({ script, filename: `${testCase.title.replace(/[^a-z0-9]/gi, "_")}.vbs` });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // ========================================
  // TEST SCHEDULER â€” Phase 3
  // ========================================

  app.get("/api/schedules", async (_req: Request, res: Response) => {
    try {
      const schedules = testScheduler.getAll();
      res.json(schedules);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/schedules/frequencies", (_req: Request, res: Response) => {
    res.json(testScheduler.getFrequencies());
  });

  app.get("/api/schedules/:id", (req: Request, res: Response) => {
    const schedule = testScheduler.get(req.params.id);
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });
    res.json(schedule);
  });

  app.get("/api/schedules/:id/runs", (req: Request, res: Response) => {
    const runs = testScheduler.getRuns(req.params.id);
    res.json(runs);
  });

  const scheduleSchema = z.object({
    name: z.string().min(1),
    suiteId: z.string().min(1),
    targetUrl: z.string().optional().default("https://example.com"),
    framework: z.string().optional().default("playwright"),
    environment: z.string().optional().default("staging"),
    cronExpression: z.string().optional(),
    isActive: z.boolean().optional().default(true),
    frequency: z.enum(["every_5min","every_15min","every_30min","hourly","every_2h","every_6h","every_12h","daily","weekly","weekdays","custom"]).optional().default("daily"),
    customCron: z.string().optional(),
    enabled: z.boolean().optional().default(true),
    notifyOnFail: z.boolean().optional().default(true),
    notifyOnPass: z.boolean().optional().default(false),
    maxRetries: z.number().optional().default(2),
    testData: z.array(z.object({ key: z.string(), value: z.string(), type: z.string() })).optional(),
  });

  app.post("/api/schedules", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(scheduleSchema, req.body);
      if (!validation.success) return res.status(400).json({ error: validation.error });
      const schedule = await testScheduler.addSchedule(validation.data);
      res.status(201).json(schedule);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.patch("/api/schedules/:id", async (req: Request, res: Response) => {
    try {
      const schedule = await testScheduler.updateSchedule(req.params.id, req.body);
      if (!schedule) return res.status(404).json({ error: "Schedule not found" });
      res.json(schedule);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.delete("/api/schedules/:id", async (req: Request, res: Response) => {
    try {
      await testScheduler.deleteSchedule(req.params.id);
      res.status(204).send();
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/schedules/:id/run-now", async (req: Request, res: Response) => {
    try {
      const result = await testScheduler.runNow(req.params.id);
      if (!result) return res.status(404).json({ error: "Schedule not found" });
      res.json({ success: true, message: "Schedule triggered manually" });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // ========================================
  // .NET DESKTOP EXECUTOR â€” Phase 4
  // ========================================

  const dotNetSchema = z.object({
    suiteId: z.string().optional().nullable(),
    appPath: z.string().min(1, "App path required"),
    appArguments: z.string().optional(),
    winAppDriverUrl: z.string().optional(),
    appWorkingDir: z.string().optional(),
    appTopLevelWindow: z.string().optional(),
    implicitWait: z.number().optional(),
    launchDelay: z.number().optional(),
    testData: z.array(testDataParamSchema).optional(),
    environment: z.enum(["development", "staging", "production"]).optional(),
  });

  app.post("/api/executions/dotnet", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(dotNetSchema, req.body);
      if (!validation.success) return res.status(400).json({ error: validation.error });
      const { suiteId, testData, environment, ...appConfig } = validation.data;
      const testCases = suiteId ? await storage.getTestCasesBySuite(suiteId) : await storage.getAllTestCases();
      if (testCases.length === 0) return res.status(400).json({ error: "No test cases found" });
      const execution = await storage.createExecution({
        suiteId: suiteId ?? undefined, targetUrl: appConfig.appPath,
        framework: "winappdriver", environment: environment ?? "production",
        status: "pending", totalTests: testCases.length, passedTests: 0, failedTests: 0, skippedTests: 0,
      });
      dotNetDesktopExecutor.runExecution(execution.id, testCases, appConfig as DotNetDesktopConfig, testData)
        .catch((err: any) => { console.error(".NET execution error:", err); storage.updateExecution(execution.id, { status: "failed", completedAt: new Date() }); });
      res.status(201).json(execution);
    } catch (error) { console.error(".NET execution error:", error); res.status(500).json({ error: "Failed to create .NET execution" }); }
  });

  // ========================================
  // MOBILE EXECUTOR (iOS + Android) â€” Phase 4
  // ========================================

  const mobileSchema = z.object({
    suiteId: z.string().optional().nullable(),
    platform: z.enum(["ios", "android"]),
    appiumUrl: z.string().optional(),
    deviceName: z.string().min(1),
    platformVersion: z.string().min(1),
    appPath: z.string().optional(),
    bundleId: z.string().optional(),
    appPackage: z.string().optional(),
    appActivity: z.string().optional(),
    udid: z.string().optional(),
    isRealDevice: z.boolean().optional(),
    noReset: z.boolean().optional(),
    autoGrantPermissions: z.boolean().optional(),
    orientation: z.enum(["PORTRAIT", "LANDSCAPE"]).optional(),
    implicitWait: z.number().optional(),
    testData: z.array(testDataParamSchema).optional(),
    environment: z.enum(["development", "staging", "production"]).optional(),
  });

  app.post("/api/executions/mobile", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(mobileSchema, req.body);
      if (!validation.success) return res.status(400).json({ error: validation.error });
      const { suiteId, testData, environment, ...mobileConfig } = validation.data;
      const testCases = suiteId ? await storage.getTestCasesBySuite(suiteId) : await storage.getAllTestCases();
      if (testCases.length === 0) return res.status(400).json({ error: "No test cases found" });
      const execution = await storage.createExecution({
        suiteId: suiteId ?? undefined,
        targetUrl: mobileConfig.bundleId || mobileConfig.appPackage || mobileConfig.appPath || "mobile",
        framework: `appium_${mobileConfig.platform}`,
        environment: environment ?? "production",
        status: "pending", totalTests: testCases.length, passedTests: 0, failedTests: 0, skippedTests: 0,
      });
      mobileExecutor.runExecution(execution.id, testCases, mobileConfig as MobileConfig, testData)
        .catch((err: any) => { console.error("Mobile execution error:", err); storage.updateExecution(execution.id, { status: "failed", completedAt: new Date() }); });
      res.status(201).json(execution);
    } catch (error) { console.error("Mobile execution error:", error); res.status(500).json({ error: "Failed to create mobile execution" }); }
  });

  // Device capability check endpoint
  app.get("/api/mobile/devices", async (_req: Request, res: Response) => {
    try {
      const devices = await storage.getAllMobileDevices();
      res.json(devices);
        } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // ========================================
  // TEST DATA FACTORY — Synthetic Data Generation
  // ========================================

  // Get available data types
  app.get("/api/data-factory/types", (_req: Request, res: Response) => {
    try {
      const types = testDataFactory.getDataTypes();
      res.json(types);
    } catch (error: any) {
      console.error("Error fetching data types:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all generated datasets
  app.get("/api/data-factory/datasets", (_req: Request, res: Response) => {
    try {
      const datasets = testDataFactory.getAllDatasets();
      res.json(datasets);
    } catch (error: any) {
      console.error("Error fetching datasets:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get a specific dataset
  app.get("/api/data-factory/datasets/:id", (req: Request, res: Response) => {
    try {
      const dataset = testDataFactory.getDataset(req.params.id);
      if (!dataset) {
        return res.status(404).json({ error: "Dataset not found" });
      }
      res.json(dataset);
    } catch (error: any) {
      console.error("Error fetching dataset:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get a specific record from a dataset
  app.get("/api/data-factory/datasets/:id/record", (req: Request, res: Response) => {
    try {
      const index = req.query.index ? parseInt(req.query.index as string) : undefined;
      const record = testDataFactory.getRecord(req.params.id, index);
      if (!record) {
        return res.status(404).json({ error: "Record not found" });
      }
      res.json(record);
    } catch (error: any) {
      console.error("Error fetching record:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Generate a new dataset
  app.post("/api/data-factory/generate", async (req: Request, res: Response) => {
    try {
      const { name, schema } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Dataset name is required" });
      }
      if (!schema || !schema.type) {
        return res.status(400).json({ error: "Schema with type is required" });
      }
      
      console.log("[Data Factory] Generating dataset:", name, "Type:", schema.type, "Count:", schema.count || 10);
      const dataset = await testDataFactory.generate(name, schema);
      console.log("[Data Factory] Generated", dataset.recordCount, "records");
      
      res.status(201).json(dataset);
    } catch (error: any) {
      console.error("Error generating dataset:", error);
      res.status(500).json({ error: error.message || "Failed to generate dataset" });
    }
  });

  console.log("[Routes] Test Data Factory routes registered at /api/data-factory");

  return httpServer;
}
