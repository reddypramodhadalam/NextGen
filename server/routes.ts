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
import { aiTestHealer } from "./ai-test-healer";
import { deepAPIExecutor } from "./deep-api-executor";
import { performanceBenchmark } from "./performance-benchmark";
import { testDataFactory } from "./test-data-factory";
import { cicdEngine, type CICDProvider, verifyGitHubSignature, verifyGitLabToken, parseGitHubEvent, parseGitLabEvent, parseJenkinsEvent, parseAzureDevOpsEvent } from "./cicd-engine";
import { coverageMatrix } from "./coverage-matrix";
import { logAudit, getAuditLog, getAuditStats } from "./audit-log";
import { healthMonitor } from "./health-monitor";
import { WORLD_CLASS_TEST_GENERATION_PROMPT } from "./world-class-prompt";
import { TestCaseValidator } from "./test-case-validator";

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

      // Run AI-powered test execution asynchronously (Selenium primary, Playwright backup)
      aiTestExecutor.runExecution(
        execution.id, 
        testCases, 
        targetUrl, 
        framework ?? "selenium",
        testData,
        selfHealing !== false, // Self-healing ON unless explicitly disabled
        maxRetries ?? 3,
        agentCapabilities
      ).catch((error: any) => {
        console.error("Execution error:", error);
        storage.updateExecution(execution.id, {
          status: "failed",
          completedAt: new Date(),
        });
      });

      res.status(201).json(execution);
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

      console.log("[GENERATE-TESTS] Validated body, building context");

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

            let systemPrompt = WORLD_CLASS_TEST_GENERATION_PROMPT;

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


                        // SKIP AI and use rule-based generator immediately
            console.log("[GENERATE-TESTS] Skipping AI (no key configured), using rule-based generator");
            const fallback = generateRuleBasedTests(
              title || "Untitled",
              [description, structuredContext].filter(Boolean).join("\n\n"),
              appType || "web"
            );
            console.log("[GENERATE-TESTS] Rule-based generation complete: " + fallback.testCases.length + " tests");
            
            // Validate using our new validator
            const validationResult = TestCaseValidator.validate(fallback);
            if (!validationResult.isValid) {
              console.error("Test case validation failed:", validationResult.errors);
            }
            if (validationResult.warnings.length > 0) {
              console.warn("Test case warnings:", validationResult.warnings);
            }
            
            const enhancedOutput = {
              ...fallback,
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
  // APP PROFILES â€” Application Type Intelligence
  // ========================================

  app.get("/api/app-profiles", (_req: Request, res: Response) => {
    res.json(Object.values(APP_PROFILES));
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
  // JAVA DESKTOP EXECUTOR â€” Phase 5
  // ========================================

  const javaDesktopSchema = z.object({
    suiteId: z.string().optional().nullable(),
    appPath: z.string().min(1),
    appMainClass: z.string().optional(),
    appClasspath: z.string().optional(),
    javaPath: z.string().optional(),
    appiumUrl: z.string().optional(),
    jabEnabled: z.boolean().optional(),
    sikuliEnabled: z.boolean().optional(),
    sikuliImageDir: z.string().optional(),
    implicitWait: z.number().optional(),
    launchDelay: z.number().optional(),
    testData: z.array(testDataParamSchema).optional(),
    environment: z.enum(["development", "staging", "production"]).optional(),
  });

  app.post("/api/executions/java", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(javaDesktopSchema, req.body);
      if (!validation.success) return res.status(400).json({ error: validation.error });
      const { suiteId, testData, environment, ...javaConfig } = validation.data;
      const testCases = suiteId ? await storage.getTestCasesBySuite(suiteId) : await storage.getAllTestCases();
      if (testCases.length === 0) return res.status(400).json({ error: "No test cases found" });
      const execution = await storage.createExecution({
        suiteId: suiteId ?? undefined, targetUrl: javaConfig.appPath,
        framework: "appium_java", environment: environment ?? "production",
        status: "pending", totalTests: testCases.length, passedTests: 0, failedTests: 0, skippedTests: 0,
      });
      javaDesktopExecutor.runExecution(execution.id, testCases, javaConfig as JavaDesktopConfig, testData)
        .catch((err: any) => { console.error("Java execution error:", err); storage.updateExecution(execution.id, { status: "failed", completedAt: new Date() }); });
      res.status(201).json(execution);
    } catch (error) { res.status(500).json({ error: "Failed to create Java execution" }); }
  });

  // ========================================
  // VISUAL REGRESSION ENGINE â€” Phase 5
  // ========================================

  app.get("/api/visual/baselines/:testCaseId", async (req: Request, res: Response) => {
    try {
      const baselines = await visualRegressionEngine.getBaselines(req.params.testCaseId);
      res.json(baselines);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/visual/baseline", async (req: Request, res: Response) => {
    try {
      const { testCaseId, name, imageBase64, selector, fullPage, threshold, viewport } = req.body;
      if (!testCaseId || !name || !imageBase64)
        return res.status(400).json({ error: "testCaseId, name, imageBase64 required" });
      await visualRegressionEngine.updateBaseline(testCaseId, name, imageBase64, { selector, fullPage, threshold, viewport });
      res.json({ success: true, message: `Baseline "${name}" saved` });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/visual/compare", async (req: Request, res: Response) => {
    try {
      const { testCaseId, name, imageBase64, threshold } = req.body;
      if (!testCaseId || !name || !imageBase64)
        return res.status(400).json({ error: "testCaseId, name, imageBase64 required" });
      const result = await visualRegressionEngine.compare(testCaseId, name, imageBase64, { threshold });
      res.json(result);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/visual/suite", async (req: Request, res: Response) => {
    try {
      const { executionId, screenshots, options } = req.body;
      if (!executionId || !screenshots)
        return res.status(400).json({ error: "executionId and screenshots required" });
      const result = await visualRegressionEngine.runVisualSuite(executionId, screenshots, options);
      res.json(result);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/visual/comparisons/:executionId", async (req: Request, res: Response) => {
    try {
      const comparisons = await visualRegressionEngine.getComparisonHistory(req.params.executionId);
      res.json(comparisons);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // ========================================
  // AI TEST HEALER â€” Phase 5
  // ========================================

  app.post("/api/healer/analyse", async (req: Request, res: Response) => {
    try {
      const { testCaseId, autoHeal, appType } = req.body;
      if (!testCaseId) return res.status(400).json({ error: "testCaseId required" });
      const report = await aiTestHealer.analyseTestCase(testCaseId, { autoHeal, appType });
      res.json(report);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/healer/analyse-suite", async (req: Request, res: Response) => {
    try {
      const { suiteId, autoHeal, appType } = req.body;
      if (!suiteId) return res.status(400).json({ error: "suiteId required" });
      const result = await aiTestHealer.analyseSuite(suiteId, { autoHeal, appType });
      res.json(result);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/healer/apply", async (req: Request, res: Response) => {
    try {
      const { testCaseId, suggestion } = req.body;
      if (!testCaseId || !suggestion) return res.status(400).json({ error: "testCaseId and suggestion required" });
      const updated = await aiTestHealer.applyHeal(testCaseId, suggestion);
      res.json({ success: true, testCase: updated });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/healer/history/:testCaseId", (req: Request, res: Response) => {
    const history = aiTestHealer.getHealHistory(req.params.testCaseId);
    res.json(history);
  });

  // ========================================
  // GRAPHQL & SOAP DEEP TESTING â€” Phase 6
  // ========================================

  app.post("/api/executions/graphql", async (req: Request, res: Response) => {
    try {
      const { suiteId, endpoint, headers, authToken, introspect, testData, environment } = req.body;
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });
      const testCases = suiteId ? await storage.getTestCasesBySuite(suiteId) : await storage.getAllTestCases();
      if (testCases.length === 0) return res.status(400).json({ error: "No test cases found" });
      const execution = await storage.createExecution({
        suiteId, targetUrl: endpoint, framework: "graphql",
        environment: environment ?? "staging",
        status: "pending", totalTests: testCases.length, passedTests: 0, failedTests: 0, skippedTests: 0,
      });
      deepAPIExecutor.runGraphQLExecution(execution.id, testCases, { endpoint, headers, authToken, introspect }, testData)
        .catch((err: any) => { console.error("GraphQL error:", err); storage.updateExecution(execution.id, { status: "failed", completedAt: new Date() }); });
      res.status(201).json(execution);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/graphql/introspect", async (req: Request, res: Response) => {
    try {
      const { endpoint, authToken } = req.body;
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });
      const schema = await deepAPIExecutor.introspectGraphQL(endpoint, authToken);
      res.json({ schema, typeCount: schema?.types?.length || 0 });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/executions/soap", async (req: Request, res: Response) => {
    try {
      const { suiteId, endpoint, wsdlUrl, headers, username, password, wsSecurityEnabled, soapVersion, testData, environment } = req.body;
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });
      const testCases = suiteId ? await storage.getTestCasesBySuite(suiteId) : await storage.getAllTestCases();
      if (testCases.length === 0) return res.status(400).json({ error: "No test cases found" });
      const execution = await storage.createExecution({
        suiteId, targetUrl: endpoint, framework: "soap",
        environment: environment ?? "staging",
        status: "pending", totalTests: testCases.length, passedTests: 0, failedTests: 0, skippedTests: 0,
      });
      deepAPIExecutor.runSOAPExecution(execution.id, testCases, { endpoint, wsdlUrl, headers, username, password, wsSecurityEnabled, soapVersion }, testData)
        .catch((err: any) => { console.error("SOAP error:", err); storage.updateExecution(execution.id, { status: "failed", completedAt: new Date() }); });
      res.status(201).json(execution);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/soap/parse-wsdl", async (req: Request, res: Response) => {
    try {
      const { wsdlUrl } = req.body;
      if (!wsdlUrl) return res.status(400).json({ error: "wsdlUrl required" });
      const result = await deepAPIExecutor.parseWSDL(wsdlUrl);
      res.json(result);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // ========================================
  // PERFORMANCE BENCHMARKING â€” Phase 6
  // ========================================

  app.post("/api/performance/benchmark", async (req: Request, res: Response) => {
    try {
      const config = req.body;
      if (!config.targetUrl) return res.status(400).json({ error: "targetUrl required" });
      // Run async and return immediately with job ID
      const jobId = `bench_${Date.now()}`;
      res.json({ jobId, message: "Benchmark started", status: "running" });
      performanceBenchmark.runBenchmark(config)
        .then((result) => { console.log(`[Benchmark] ${result.summary}`); })
        .catch((err: any) => { console.error("Benchmark error:", err); });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/performance/benchmark/sync", async (req: Request, res: Response) => {
    try {
      const config = req.body;
      if (!config.targetUrl) return res.status(400).json({ error: "targetUrl required" });
      // Cap at 5 users x 5 requests for sync endpoint
      const safeCfg = { ...config, concurrentUsers: Math.min(config.concurrentUsers || 5, 10), requestsPerUser: Math.min(config.requestsPerUser || 5, 20) };
      const result = await performanceBenchmark.runBenchmark(safeCfg);
      res.json(result);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/performance/quick-check", async (req: Request, res: Response) => {
    try {
      const { url, samples } = req.body;
      if (!url) return res.status(400).json({ error: "url required" });
      const result = await performanceBenchmark.quickCheck(url, samples || 5);
      res.json(result);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // ========================================
  // TEST DATA FACTORY â€” Phase 6
  // ========================================

  app.get("/api/data-factory/types", (_req: Request, res: Response) => {
    res.json(testDataFactory.getDataTypes());
  });

  app.get("/api/data-factory/datasets", (_req: Request, res: Response) => {
    res.json(testDataFactory.getAllDatasets());
  });

  app.post("/api/data-factory/generate", async (req: Request, res: Response) => {
    try {
      const { name, schema } = req.body;
      if (!name || !schema) return res.status(400).json({ error: "name and schema required" });
      const dataset = await testDataFactory.generate(name, schema);
      res.status(201).json(dataset);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/data-factory/datasets/:id", (req: Request, res: Response) => {
    const ds = testDataFactory.getDataset(req.params.id);
    if (!ds) return res.status(404).json({ error: "Dataset not found" });
    res.json(ds);
  });

  app.get("/api/data-factory/datasets/:id/record", (req: Request, res: Response) => {
    const idx = req.query.index ? parseInt(req.query.index as string) : undefined;
    const record = testDataFactory.getRecord(req.params.id, idx);
    if (!record) return res.status(404).json({ error: "No records in dataset" });
    res.json({ record, params: testDataFactory.toTestDataParams(record) });
  });

  // ========================================
  // CI/CD PIPELINE INTEGRATION â€” Phase 7
  // ========================================

  // Get available providers
  app.get("/api/cicd/providers", (_req: Request, res: Response) => {
    res.json(cicdEngine.getProviders());
  });

  // Trigger a pipeline outbound
  app.post("/api/cicd/trigger", async (req: Request, res: Response) => {
    try {
      const config = req.body;
      if (!config.provider || !config.name) return res.status(400).json({ error: "provider and name required" });
      const result = await cicdEngine.triggerConfig(config);
      res.json(result);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // Inbound webhook â€” GitHub Actions
  app.post("/api/cicd/webhook/github", async (req: Request, res: Response) => {
    try {
      const signature = req.headers["x-hub-signature-256"] as string || "";
      const event = req.headers["x-github-event"] as string || "push";
      const body = req.body;
      const result = await cicdEngine.processInboundEvent("github_actions", event, body, signature);
      res.json(result);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // Inbound webhook â€” GitLab CI
  app.post("/api/cicd/webhook/gitlab", async (req: Request, res: Response) => {
    try {
      const token = req.headers["x-gitlab-token"] as string || "";
      const event = req.headers["x-gitlab-event"] as string || "Pipeline Hook";
      const result = await cicdEngine.processInboundEvent("gitlab_ci", event, req.body, token);
      res.json(result);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // Inbound webhook â€” Jenkins
  app.post("/api/cicd/webhook/jenkins", async (req: Request, res: Response) => {
    try {
      const result = await cicdEngine.processInboundEvent("jenkins", "build", req.body);
      res.json(result);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // Inbound webhook â€” Azure DevOps
  app.post("/api/cicd/webhook/azure", async (req: Request, res: Response) => {
    try {
      const event = req.body?.eventType || "build.complete";
      const result = await cicdEngine.processInboundEvent("azure_devops", event, req.body);
      res.json(result);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // Generic inbound webhook
  app.post("/api/cicd/webhook/generic", async (req: Request, res: Response) => {
    try {
      const result = await cicdEngine.processInboundEvent("generic", "trigger", req.body);
      res.json(result);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // CRUD for CI/CD webhooks (stored configs)
  app.get("/api/cicd/webhooks", async (_req: Request, res: Response) => {
    try { res.json(await storage.getAllCicdWebhooks()); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/cicd/webhooks", async (req: Request, res: Response) => {
    try {
      const { name, provider, webhookUrl, secretToken, suiteId, environmentId, triggerOn } = req.body;
      if (!name || !provider) return res.status(400).json({ error: "name and provider required" });
      const webhook = await storage.createCicdWebhook({ name, provider, webhookUrl, secretToken, suiteId, environmentId, triggerOn, isActive: true });
      res.status(201).json(webhook);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.patch("/api/cicd/webhooks/:id", async (req: Request, res: Response) => {
    try {
      const updated = await storage.updateCicdWebhook(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Webhook not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.delete("/api/cicd/webhooks/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteCicdWebhook(req.params.id);
      res.json({ success: true });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // ========================================
  // TEST COVERAGE MATRIX â€” Phase 7
  // ========================================

  app.get("/api/coverage/matrix", async (req: Request, res: Response) => {
    try {
      const suiteId = req.query.suiteId as string | undefined;
      const matrix = await coverageMatrix.buildMatrix(suiteId);
      res.json(matrix);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/coverage/requirement/:id", async (req: Request, res: Response) => {
    try {
      const coverage = await coverageMatrix.getRequirementCoverage(req.params.id);
      res.json(coverage);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // ========================================
  // ADMIN PANEL â€” RBAC & USER MANAGEMENT â€” Phase 8
  // ========================================

  // --- Users ---
  app.get("/api/admin/users", async (req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers ? storage.getAllUsers() : Promise.resolve([]);
      res.json(await allUsers);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.patch("/api/admin/users/:id", async (req: Request, res: Response) => {
    try {
      const { name, email, isActive, roleId } = req.body;
      const updated = await storage.updateUser(req.params.id, { name, email, isActive, roleId });
      if (!updated) return res.status(404).json({ error: "User not found" });
      logAudit({ action: "user.updated", severity: "info", resourceType: "user", resourceId: req.params.id, success: true });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.delete("/api/admin/users/:id", async (req: Request, res: Response) => {
    try {
      await storage.updateUser(req.params.id, { isActive: false });
      logAudit({ action: "user.deleted", severity: "warning", resourceType: "user", resourceId: req.params.id, success: true });
      res.json({ success: true });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // --- Roles ---
  app.get("/api/admin/roles", async (_req: Request, res: Response) => {
    try { res.json(await storage.getAllRoles()); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/admin/roles", async (req: Request, res: Response) => {
    try {
      const { name, displayName, description, permissions } = req.body;
      if (!name || !displayName) return res.status(400).json({ error: "name and displayName required" });
      const role = await storage.createRole({ name, displayName, description, permissions: permissions || [] });
      logAudit({ action: "role.created", severity: "info", resourceType: "role", resourceId: role.id, resourceName: name, success: true });
      res.status(201).json(role);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.patch("/api/admin/roles/:id", async (req: Request, res: Response) => {
    try {
      const updated = await storage.updateRole(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Role not found or is a system role" });
      logAudit({ action: "role.updated", severity: "info", resourceType: "role", resourceId: req.params.id, success: true });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.delete("/api/admin/roles/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteRole(req.params.id);
      logAudit({ action: "role.deleted", severity: "warning", resourceType: "role", resourceId: req.params.id, success: true });
      res.json({ success: true });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // --- User Role Assignment ---
  app.post("/api/admin/users/:userId/roles", async (req: Request, res: Response) => {
    try {
      const { roleId } = req.body;
      if (!roleId) return res.status(400).json({ error: "roleId required" });
      const userRole = await storage.assignUserRole({ userId: req.params.userId, roleId });
      logAudit({ action: "user.role_assigned", severity: "info", resourceType: "user", resourceId: req.params.userId, details: { roleId }, success: true });
      res.status(201).json(userRole);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.delete("/api/admin/users/:userId/roles/:roleId", async (req: Request, res: Response) => {
    try {
      await storage.removeUserRole(req.params.userId, req.params.roleId);
      logAudit({ action: "user.role_removed", severity: "info", resourceType: "user", resourceId: req.params.userId, details: { roleId: req.params.roleId }, success: true });
      res.json({ success: true });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/admin/users/:userId/roles", async (req: Request, res: Response) => {
    try { res.json(await storage.getUserRoles(req.params.userId)); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // ========================================
  // AUDIT LOG â€” Phase 8
  // ========================================

  app.get("/api/admin/audit-log", (req: Request, res: Response) => {
    try {
      const { action, userId, severity, resourceType, limit } = req.query as Record<string, string>;
      const entries = getAuditLog({
        action: action as any,
        userId,
        severity: severity as any,
        resourceType,
        limit: limit ? parseInt(limit) : 100,
      });
      res.json(entries);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/admin/audit-log/stats", (_req: Request, res: Response) => {
    res.json(getAuditStats());
  });

  // ========================================
  // SYSTEM HEALTH MONITOR â€” Phase 8
  // ========================================

  app.get("/api/admin/health", async (_req: Request, res: Response) => {
    try {
      const report = await healthMonitor.getHealthReport();
      res.json(report);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.get("/api/admin/health/quick", (_req: Request, res: Response) => {
    const cached = healthMonitor.getCachedReport();
    if (cached) return res.json({ status: cached.status, timestamp: cached.timestamp });
    res.json({ status: "unknown", timestamp: new Date() });
  });

  // ========================================
  // SUITES ALIAS (for backward compat)
  // ========================================
  app.get("/api/suites", async (req: Request, res: Response) => {
    try {
      const suites = await storage.getAllTestSuites();
      res.json(suites);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch suites" });
    }
  });

  // ========================================
  // EXCEL UPLOAD PARSER â€” for Upload Test Cases page
  // ========================================
  {
    // Scoped multer instance â€” memory storage, 10 MB limit
    const multer = (await import("multer")).default;
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /\.(xlsx|xls)$/i.test(file.originalname);
        cb(null, ok);
      },
    });

    app.post("/api/upload/parse-excel", upload.single("file"), async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded. Send the file as form-data field named 'file'." });
        }

        const XLSX = await import("xlsx");
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return res.json({ testCases: [], errors: ["Workbook has no sheets"] });

        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        if (rows.length < 2) {
          return res.json({ testCases: [], errors: ["Sheet is empty or has only a header row â€” no data found"] });
        }

        const headers = (rows[0] as string[]).map((h: string) =>
          String(h ?? "").toLowerCase().trim().replace(/\s+/g, "_")
        );

        const idx = (name: string) => headers.findIndex((h: string) => h.includes(name));

        const titleIdx    = idx("title") !== -1 ? idx("title") : 0;
        const descIdx     = idx("desc");
        const preIdx      = idx("precond");
        const urlIdx      = idx("url");
        const priorityIdx = idx("priority");
        const tagsIdx     = idx("tag");
        const stepIdx     = idx("step");
        const expectedIdx = idx("expect");

        const testCases: any[] = [];
        const errors: string[] = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as any[];
          // Skip completely empty rows
          if (row.every((cell: any) => !cell && cell !== 0)) continue;

          const get = (j: number) =>
            j >= 0 && j < row.length ? String(row[j] ?? "").trim() : "";

          const title = get(titleIdx);
          if (!title) {
            errors.push(`Row ${i + 1}: missing title â€” skipped`);
            continue;
          }

          const stepText = get(stepIdx);
          const expText  = get(expectedIdx);
          const steps = stepText
            ? [{ step: stepText, expected: expText || "Step completes successfully" }]
            : [{ step: `Execute: ${title}`, expected: "Test completes successfully" }];

          const tagsRaw = get(tagsIdx);
          testCases.push({
            title,
            description:   get(descIdx)     || undefined,
            preconditions: get(preIdx)      || undefined,
            targetUrl:     get(urlIdx)      || undefined,
            priority:      get(priorityIdx) || "medium",
            tags:          tagsRaw
              ? tagsRaw.split(/[;,]/).map((t: string) => t.trim()).filter(Boolean)
              : [],
            steps,
            _rowIndex: i + 1,
          });
        }

        console.log(`[Upload] Parsed ${testCases.length} test cases from ${req.file.originalname}`);
        res.json({ testCases, errors });
      } catch (error: any) {
        console.error("Excel parse error:", error);
        res.status(500).json({ error: `Excel parsing failed: ${error.message}` });
      }
    });

    // ========================================
    // DATA SHEET PARSER â€” key | value | type columns for test data
    // Accepts .xlsx, .xls, .csv
    // ========================================
    const dataSheetUpload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
        cb(null, ok);
      },
    });

    app.post("/api/upload/parse-data-sheet", dataSheetUpload.single("file"), async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded. Send the file as form-data field named 'file'." });
        }

        const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "";
        const VALID_TYPES = ["text", "password", "email", "url", "number"];
        const params: any[] = [];
        const errors: string[] = [];

        if (ext === "csv") {
          // Parse CSV client-side style
          const text = req.file.buffer.toString("utf-8");
          const lines = text.split(/\r?\n/).filter((l: string) => l.trim());
          if (lines.length < 2) return res.json({ params: [], errors: ["CSV has no data rows"] });

          const headers = lines[0].split(",").map((h: string) => h.trim().toLowerCase().replace(/["']/g, ""));
          const keyIdx  = headers.findIndex((h: string) => h.includes("key") || h.includes("name") || h.includes("param"));
          const valIdx  = headers.findIndex((h: string) => h.includes("value") || h.includes("val"));
          const typeIdx = headers.findIndex((h: string) => h.includes("type"));
          const descIdx = headers.findIndex((h: string) => h.includes("desc"));

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",").map((c: string) => c.trim().replace(/^"|"$/g, ""));
            const key  = keyIdx  >= 0 ? cols[keyIdx]  ?? "" : cols[0] ?? "";
            const val  = valIdx  >= 0 ? cols[valIdx]  ?? "" : cols[1] ?? "";
            const type = typeIdx >= 0 ? cols[typeIdx] ?? "" : cols[2] ?? "text";
            const desc = descIdx >= 0 ? cols[descIdx] ?? "" : "";
            if (!key) { errors.push(`Row ${i + 1}: missing key â€” skipped`); continue; }
            const resolvedType = VALID_TYPES.includes(type.toLowerCase()) ? type.toLowerCase() : "text";
            params.push({ key, value: val, type: resolvedType, description: desc || undefined });
          }
        } else {
          // Excel
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) return res.json({ params: [], errors: ["Workbook has no sheets"] });

          const sheet = workbook.Sheets[sheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          if (rows.length < 2) return res.json({ params: [], errors: ["Sheet has no data rows"] });

          const headers = (rows[0] as string[]).map((h: string) => String(h ?? "").toLowerCase().trim());
          const keyIdx  = headers.findIndex((h: string) => h.includes("key") || h.includes("name") || h.includes("param"));
          const valIdx  = headers.findIndex((h: string) => h.includes("value") || h.includes("val"));
          const typeIdx = headers.findIndex((h: string) => h.includes("type"));
          const descIdx = headers.findIndex((h: string) => h.includes("desc"));

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i] as any[];
            if (row.every((c: any) => !c && c !== 0)) continue;
            const get = (j: number) => j >= 0 && j < row.length ? String(row[j] ?? "").trim() : "";
            const key  = keyIdx  >= 0 ? get(keyIdx)  : get(0);
            const val  = valIdx  >= 0 ? get(valIdx)  : get(1);
            const type = typeIdx >= 0 ? get(typeIdx) : get(2);
            const desc = descIdx >= 0 ? get(descIdx) : "";
            if (!key) { errors.push(`Row ${i + 1}: missing key â€” skipped`); continue; }
            const resolvedType = VALID_TYPES.includes(type.toLowerCase()) ? type.toLowerCase() : "text";
            params.push({ key, value: val, type: resolvedType, description: desc || undefined });
          }
        }

        console.log(`[DataSheet] Parsed ${params.length} params from ${req.file.originalname}`);
        res.json({ params, errors });
      } catch (error: any) {
        console.error("Data sheet parse error:", error);
        res.status(500).json({ error: `Data sheet parsing failed: ${error.message}` });
      }
    });
  }

  // ========================================
  // MULTI-AGENT SYSTEM â€” World-Class AI Test Automation
  // Planner â†’ Navigator â†’ DOM Intelligence â†’ Action â†’ Validation
  // ========================================
  {
    const { orchestratorAgent, agentBus } = await import('./agents/index.js');

    // Start a new multi-agent session
    app.post('/api/multi-agent/sessions', async (req: Request, res: Response) => {
      try {
        const { targetUrl, testCaseId, testCaseTitle, steps, testData, maxRetries, captureScreenshots, headless } = req.body;
        if (!targetUrl) return res.status(400).json({ error: 'targetUrl is required' });
        if (!steps || !Array.isArray(steps) || steps.length === 0) {
          return res.status(400).json({ error: 'steps array is required and must not be empty' });
        }

        // If testCaseId provided, load steps from database
        let resolvedSteps = steps;
        if (testCaseId && (!steps || steps.length === 0)) {
          const tc = await storage.getTestCase(testCaseId);
          if (!tc) return res.status(404).json({ error: 'Test case not found' });
          resolvedSteps = (tc.steps as any[]) || [];
        }

        const sessionId = await orchestratorAgent.startSession({
          targetUrl,
          testCaseId,
          testCaseTitle: testCaseTitle || 'Unnamed Test',
          steps: resolvedSteps,
          testData: testData || {},
          maxRetries: maxRetries || 3,
          captureScreenshots: captureScreenshots !== false,
          headless: headless !== false,
        });

        res.status(201).json({ sessionId, status: 'started', message: 'Multi-agent session started' });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get session status / result
    app.get('/api/multi-agent/sessions/:sessionId', (req: Request, res: Response) => {
      const result = orchestratorAgent.getSessionResult(req.params.sessionId);
      if (!result) return res.status(404).json({ error: 'Session not found' });
      res.json(result);
    });

    // List all active sessions
    app.get('/api/multi-agent/sessions', (_req: Request, res: Response) => {
      const sessions = orchestratorAgent.listActiveSessions();
      res.json({ sessions, count: sessions.length });
    });

    // Server-Sent Events: real-time streaming for a session
    app.get('/api/multi-agent/sessions/:sessionId/stream', (req: Request, res: Response) => {
      const { sessionId } = req.params;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.flushHeaders();

      const send = (event: any) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      // Send initial state
      const initial = orchestratorAgent.getSessionResult(sessionId);
      if (initial) send({ type: 'initial_state', data: initial, sessionId });

      // Subscribe to session events
      const unsubscribe = agentBus.subscribeToSession(sessionId, (event) => {
        send(event);
        if (event.type === 'session_complete' || event.type === 'session_failed') {
          res.end();
        }
      });

      // Heartbeat every 15s
      const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 15000);

      req.on('close', () => {
        unsubscribe();
        clearInterval(heartbeat);
      });
    });

    // Capture DOM only (no test execution) â€” for URL analysis
    app.post('/api/multi-agent/capture-dom', async (req: Request, res: Response) => {
      try {
        const { url, headless } = req.body;
        if (!url) return res.status(400).json({ error: 'url is required' });
        const dom = await orchestratorAgent.captureDOM(url, headless !== false);
        res.json({
          url: dom.url,
          title: dom.title,
          elementCount: dom.rawElementCount,
          inputs: dom.inputs,
          buttons: dom.buttons,
          forms: dom.forms,
          dropdowns: dom.dropdowns,
          checkboxes: dom.checkboxes,
          links: dom.links.slice(0, 20),
          iframes: dom.iframes,
          tables: dom.tables,
          hasAlert: dom.hasAlert,
          windowCount: dom.windowCount,
          accessibilityTree: dom.accessibilityTree,
          capturedAt: dom.capturedAt,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Parse test steps without running (planner preview)
    app.post('/api/multi-agent/parse-steps', async (req: Request, res: Response) => {
      try {
        const { plannerAgent } = await import('./agents/planner-agent.js');
        const { steps, targetUrl, testData } = req.body;
        if (!steps || !Array.isArray(steps)) return res.status(400).json({ error: 'steps array required' });
        const result = await plannerAgent.plan({ rawSteps: steps, targetUrl: targetUrl || '', testData });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Start session directly from a saved test case
    app.post('/api/multi-agent/run-test-case/:testCaseId', async (req: Request, res: Response) => {
      try {
        const tc = await storage.getTestCase(req.params.testCaseId);
        if (!tc) return res.status(404).json({ error: 'Test case not found' });
        const { targetUrl, testData, maxRetries, captureScreenshots, headless } = req.body;
        const url = targetUrl || tc.targetUrl || '';
        if (!url) return res.status(400).json({ error: 'targetUrl is required (set on test case or in request body)' });
        const steps = (tc.steps as { step: string; expected: string }[]) || [];
        if (steps.length === 0) return res.status(400).json({ error: 'Test case has no steps' });
        const sessionId = await orchestratorAgent.startSession({
          targetUrl: url,
          testCaseId: tc.id,
          testCaseTitle: tc.title,
          steps,
          testData: testData || {},
          maxRetries: maxRetries || 3,
          captureScreenshots: captureScreenshots !== false,
          headless: headless !== false,
        });
        res.status(201).json({ sessionId, status: 'started', testCase: { id: tc.id, title: tc.title, steps: steps.length } });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Memory stats
    app.get('/api/multi-agent/memory', (_req: Request, res: Response) => {
      res.json(orchestratorAgent.getMemoryStats());
    });
  }

  return httpServer;
}

// ============================================================================
// RULE-BASED SCRIPT GENERATOR (fallback when no AI key is configured)
// ============================================================================

function generateRuleBasedScript(testCase: any, framework: string, language: string): string {
  const title = testCase.title || "Test Case";
  const steps: Array<{ step: string; expected: string }> = testCase.steps || [];
  const safeTitle = title.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const safeTitlePascal = safeTitle.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join("");

  const stepComments = steps.length > 0
    ? steps.map((s, i) => `Step ${i + 1}: ${s.step} => ${s.expected}`).join("\n")
    : "No steps defined";

  // â”€â”€ C# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (language === "csharp") {
    if (framework === "playwright") {
      return `using Microsoft.Playwright;
using Microsoft.Playwright.NUnit;
using NUnit.Framework;

namespace AutomationTests
{
    [TestFixture]
    [Parallelizable(ParallelScope.Self)]
    public class ${safeTitlePascal}Tests : PageTest
    {
        /*
         * Test Case : ${title}
         * Description: ${testCase.description || "N/A"}
         * Preconditions: ${testCase.preconditions || "None"}
         *
         * Steps:
${steps.map((s, i) => `         * ${i + 1}. ${s.step}\n         *    Expected: ${s.expected}`).join("\n")}
         */

        [Test]
        public async Task ${safeTitlePascal}_HappyPath()
        {
            // Arrange â€” navigate to the application
            await Page.GotoAsync("https://your-app-url.com");
            await Expect(Page).ToHaveTitleAsync(new System.Text.RegularExpressions.Regex(".*"));

${steps.map((s, i) => {
  const action = s.step.toLowerCase();
  if (action.includes("navigate") || action.includes("go to") || action.includes("open"))
    return `            // Step ${i + 1}: ${s.step}\n            await Page.GotoAsync("https://your-app-url.com");\n            // Expected: ${s.expected}`;
  if (action.includes("click"))
    return `            // Step ${i + 1}: ${s.step}\n            await Page.GetByRole(AriaRole.Button, new() { Name = "Submit" }).ClickAsync();\n            // Expected: ${s.expected}`;
  if (action.includes("enter") || action.includes("type") || action.includes("fill") || action.includes("input"))
    return `            // Step ${i + 1}: ${s.step}\n            await Page.GetByLabel("Field Label").FillAsync("value");\n            // Expected: ${s.expected}`;
  if (action.includes("verify") || action.includes("assert") || action.includes("check"))
    return `            // Step ${i + 1}: ${s.step}\n            await Expect(Page.GetByText("Expected Text")).ToBeVisibleAsync();\n            // Expected: ${s.expected}`;
  return `            // Step ${i + 1}: ${s.step}\n            await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);\n            // Expected: ${s.expected}`;
}).join("\n\n")}
        }

        [Test]
        public async Task ${safeTitlePascal}_ValidationErrors()
        {
            // Arrange
            await Page.GotoAsync("https://your-app-url.com");

            // Act â€” submit without required fields
            await Page.GetByRole(AriaRole.Button, new() { Name = "Submit" }).ClickAsync();

            // Assert â€” validation errors are shown
            await Expect(Page.GetByRole(AriaRole.Alert)).ToBeVisibleAsync();
        }
    }
}`;
    }

    if (framework === "selenium") {
      return `using NUnit.Framework;
using OpenQA.Selenium;
using OpenQA.Selenium.Chrome;
using OpenQA.Selenium.Support.UI;
using SeleniumExtras.WaitHelpers;

namespace AutomationTests
{
    [TestFixture]
    public class ${safeTitlePascal}Tests
    {
        private IWebDriver _driver;
        private WebDriverWait _wait;

        /*
         * Test Case : ${title}
         * Description: ${testCase.description || "N/A"}
         * Preconditions: ${testCase.preconditions || "None"}
         *
         * Steps:
${steps.map((s, i) => `         * ${i + 1}. ${s.step}\n         *    Expected: ${s.expected}`).join("\n")}
         */

        [SetUp]
        public void SetUp()
        {
            var options = new ChromeOptions();
            options.AddArgument("--start-maximized");
            _driver = new ChromeDriver(options);
            _wait = new WebDriverWait(_driver, TimeSpan.FromSeconds(10));
        }

        [TearDown]
        public void TearDown()
        {
            _driver?.Quit();
            _driver?.Dispose();
        }

        [Test]
        public void ${safeTitlePascal}_HappyPath()
        {
            // Arrange â€” navigate to the application
            _driver.Navigate().GoToUrl("https://your-app-url.com");

${steps.map((s, i) => {
  const action = s.step.toLowerCase();
  if (action.includes("navigate") || action.includes("go to") || action.includes("open"))
    return `            // Step ${i + 1}: ${s.step}\n            _driver.Navigate().GoToUrl("https://your-app-url.com");\n            // Expected: ${s.expected}`;
  if (action.includes("click"))
    return `            // Step ${i + 1}: ${s.step}\n            var btn${i + 1} = _wait.Until(ExpectedConditions.ElementToBeClickable(By.CssSelector("button[type='submit']")));\n            btn${i + 1}.Click();\n            // Expected: ${s.expected}`;
  if (action.includes("enter") || action.includes("type") || action.includes("fill") || action.includes("input"))
    return `            // Step ${i + 1}: ${s.step}\n            var field${i + 1} = _wait.Until(ExpectedConditions.ElementIsVisible(By.Id("fieldId")));\n            field${i + 1}.Clear();\n            field${i + 1}.SendKeys("value");\n            // Expected: ${s.expected}`;
  if (action.includes("verify") || action.includes("assert") || action.includes("check"))
    return `            // Step ${i + 1}: ${s.step}\n            var element${i + 1} = _wait.Until(ExpectedConditions.ElementIsVisible(By.CssSelector(".expected-element")));\n            Assert.That(element${i + 1}.Displayed, Is.True, "Element should be visible");\n            // Expected: ${s.expected}`;
  return `            // Step ${i + 1}: ${s.step}\n            _wait.Until(d => d.FindElement(By.TagName("body")).Displayed);\n            // Expected: ${s.expected}`;
}).join("\n\n")}
        }

        [Test]
        public void ${safeTitlePascal}_ValidationErrors()
        {
            _driver.Navigate().GoToUrl("https://your-app-url.com");
            var submitBtn = _wait.Until(ExpectedConditions.ElementToBeClickable(By.CssSelector("button[type='submit']")));
            submitBtn.Click();
            var errorMsg = _wait.Until(ExpectedConditions.ElementIsVisible(By.CssSelector(".error-message, [role='alert']")));
            Assert.That(errorMsg.Displayed, Is.True, "Validation error should be shown");
        }
    }
}`;
    }

    if (framework === "cypress") {
      return `// Cypress does not natively support C#.
// Use the Playwright or Selenium framework with C# instead.
// Below is a Cypress spec converted to C# NUnit style for reference.

using NUnit.Framework;

namespace AutomationTests
{
    /// <summary>
    /// NOTE: Cypress is a JavaScript framework. This C# equivalent uses NUnit + Playwright.
    /// Switch the framework to "Playwright" or "Selenium" for native C# support.
    /// </summary>
    [TestFixture]
    public class ${safeTitlePascal}Tests
    {
        /*
         * Test Case : ${title}
         * Steps:
${steps.map((s, i) => `         * ${i + 1}. ${s.step} => ${s.expected}`).join("\n")}
         */

        [Test]
        public void ${safeTitlePascal}_ShouldWork()
        {
            // TODO: Implement using Playwright.NUnit or Selenium WebDriver
            // cy.visit('/') equivalent: await Page.GotoAsync("https://your-app-url.com");
            // cy.get('[data-testid]').click() equivalent: await Page.Locator("[data-testid]").ClickAsync();
            Assert.Pass("Implement test steps using Playwright.NUnit or Selenium");
        }
    }
}`;
    }

    // puppeteer + C# â€” not a native combo, provide guidance
    return `// NOTE: Puppeteer is a Node.js library and does not have a native C# binding.
// For C# browser automation, use:
//   - Microsoft.Playwright (recommended)
//   - Selenium WebDriver
//
// Below is a Playwright C# equivalent for: ${title}

using Microsoft.Playwright;
using Microsoft.Playwright.NUnit;
using NUnit.Framework;

namespace AutomationTests
{
    [TestFixture]
    [Parallelizable(ParallelScope.Self)]
    public class ${safeTitlePascal}Tests : PageTest
    {
        /*
         * Test Case : ${title}
         * Steps:
${steps.map((s, i) => `         * ${i + 1}. ${s.step} => ${s.expected}`).join("\n")}
         */

        [Test]
        public async Task ${safeTitlePascal}()
        {
            await Page.GotoAsync("https://your-app-url.com");
${steps.map((s, i) => `            // Step ${i + 1}: ${s.step}\n            // Expected: ${s.expected}\n            await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);`).join("\n")}
        }
    }
}`;
  }

  // â”€â”€ TypeScript â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (language === "typescript") {
    if (framework === "playwright") {
      return `import { test, expect } from '@playwright/test';

/**
 * Test Case: ${title}
 * Description: ${testCase.description || "N/A"}
 * Preconditions: ${testCase.preconditions || "None"}
 */
test.describe('${title}', () => {
  test('happy path', async ({ page }) => {
    await page.goto('https://your-app-url.com');

${steps.map((s, i) => {
  const a = s.step.toLowerCase();
  if (a.includes("navigate") || a.includes("go to")) return `    // Step ${i+1}: ${s.step}\n    await page.goto('https://your-app-url.com');`;
  if (a.includes("click")) return `    // Step ${i+1}: ${s.step}\n    await page.getByRole('button', { name: 'Submit' }).click();`;
  if (a.includes("enter") || a.includes("fill") || a.includes("type")) return `    // Step ${i+1}: ${s.step}\n    await page.getByLabel('Field Label').fill('value');`;
  if (a.includes("verify") || a.includes("assert")) return `    // Step ${i+1}: ${s.step}\n    await expect(page.getByText('Expected Text')).toBeVisible();`;
  return `    // Step ${i+1}: ${s.step}\n    await page.waitForLoadState('networkidle');`;
}).join("\n")}
  });

  test('validation errors', async ({ page }) => {
    await page.goto('https://your-app-url.com');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });
});`;
    }
    if (framework === "cypress") {
      return `describe('${title}', () => {
  beforeEach(() => {
    cy.visit('https://your-app-url.com');
  });

  it('happy path', () => {
${steps.map((s, i) => {
  const a = s.step.toLowerCase();
  if (a.includes("click")) return `    // Step ${i+1}: ${s.step}\n    cy.get('button[type="submit"]').click();`;
  if (a.includes("enter") || a.includes("fill") || a.includes("type")) return `    // Step ${i+1}: ${s.step}\n    cy.get('#fieldId').clear().type('value');`;
  if (a.includes("verify") || a.includes("assert")) return `    // Step ${i+1}: ${s.step}\n    cy.contains('Expected Text').should('be.visible');`;
  return `    // Step ${i+1}: ${s.step}\n    cy.url().should('include', '/expected-path');`;
}).join("\n")}
  });
});`;
    }
    return `import { test, expect } from '@playwright/test';
// TODO: implement ${title} with ${framework}`;
  }

  // â”€â”€ JavaScript â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (language === "javascript") {
    if (framework === "playwright") {
      return `const { test, expect } = require('@playwright/test');

test.describe('${title}', () => {
  test('happy path', async ({ page }) => {
    await page.goto('https://your-app-url.com');
${steps.map((s, i) => `    // Step ${i+1}: ${s.step}\n    // Expected: ${s.expected}`).join("\n")}
  });
});`;
    }
    if (framework === "cypress") {
      return `describe('${title}', () => {
  it('happy path', () => {
    cy.visit('https://your-app-url.com');
${steps.map((s, i) => `    // Step ${i+1}: ${s.step}\n    // Expected: ${s.expected}`).join("\n")}
  });
});`;
    }
    if (framework === "puppeteer") {
      return `const puppeteer = require('puppeteer');

describe('${title}', () => {
  let browser, page;
  beforeAll(async () => { browser = await puppeteer.launch(); page = await browser.newPage(); });
  afterAll(async () => await browser.close());

  test('happy path', async () => {
    await page.goto('https://your-app-url.com');
${steps.map((s, i) => `    // Step ${i+1}: ${s.step}\n    // Expected: ${s.expected}`).join("\n")}
  });
});`;
    }
    return `// ${title} â€” ${framework} JavaScript\n// TODO: implement steps`;
  }

  // â”€â”€ Python â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (language === "python") {
    if (framework === "playwright") {
      return `import pytest
from playwright.sync_api import Page, expect


class Test${safeTitlePascal}:
    """
    Test Case: ${title}
    Description: ${testCase.description || "N/A"}
    Preconditions: ${testCase.preconditions || "None"}
    """

    def test_happy_path(self, page: Page):
        page.goto("https://your-app-url.com")

${steps.map((s, i) => {
  const a = s.step.toLowerCase();
  if (a.includes("navigate") || a.includes("go to")) return `        # Step ${i+1}: ${s.step}\n        page.goto("https://your-app-url.com")\n        # Expected: ${s.expected}`;
  if (a.includes("click")) return `        # Step ${i+1}: ${s.step}\n        page.get_by_role("button", name="Submit").click()\n        # Expected: ${s.expected}`;
  if (a.includes("enter") || a.includes("fill") || a.includes("type")) return `        # Step ${i+1}: ${s.step}\n        page.get_by_label("Field Label").fill("value")\n        # Expected: ${s.expected}`;
  if (a.includes("verify") || a.includes("assert")) return `        # Step ${i+1}: ${s.step}\n        expect(page.get_by_text("Expected Text")).to_be_visible()\n        # Expected: ${s.expected}`;
  return `        # Step ${i+1}: ${s.step}\n        page.wait_for_load_state("networkidle")\n        # Expected: ${s.expected}`;
}).join("\n")}

    def test_validation_errors(self, page: Page):
        page.goto("https://your-app-url.com")
        page.get_by_role("button", name="Submit").click()
        expect(page.get_by_role("alert")).to_be_visible()`;
    }
    if (framework === "selenium") {
      return `import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class Test${safeTitlePascal}:
    """
    Test Case: ${title}
    Steps:
${steps.map((s, i) => `    ${i+1}. ${s.step} => ${s.expected}`).join("\n")}
    """

    @pytest.fixture(autouse=True)
    def setup(self):
        self.driver = webdriver.Chrome()
        self.wait = WebDriverWait(self.driver, 10)
        yield
        self.driver.quit()

    def test_happy_path(self):
        self.driver.get("https://your-app-url.com")
${steps.map((s, i) => `        # Step ${i+1}: ${s.step}\n        # Expected: ${s.expected}`).join("\n")}
        assert True`;
    }
    return `# ${title} â€” ${framework} Python\nimport pytest\n\n# TODO: implement steps`;
  }

  // â”€â”€ Java â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (language === "java") {
    if (framework === "playwright") {
      return `import com.microsoft.playwright.*;
import com.microsoft.playwright.options.*;
import org.junit.jupiter.api.*;
import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

/**
 * Test Case: ${title}
 * Description: ${testCase.description || "N/A"}
 */
public class ${safeTitlePascal}Test {
    static Playwright playwright;
    static Browser browser;
    BrowserContext context;
    Page page;

    @BeforeAll
    static void launchBrowser() {
        playwright = Playwright.create();
        browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(false));
    }

    @AfterAll
    static void closeBrowser() {
        playwright.close();
    }

    @BeforeEach
    void createContextAndPage() {
        context = browser.newContext();
        page = context.newPage();
    }

    @AfterEach
    void closeContext() {
        context.close();
    }

    @Test
    void happyPath() {
        page.navigate("https://your-app-url.com");
${steps.map((s, i) => `        // Step ${i+1}: ${s.step}\n        // Expected: ${s.expected}`).join("\n")}
    }
}`;
    }
    if (framework === "selenium") {
      return `import org.junit.jupiter.api.*;
import org.openqa.selenium.*;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Test Case: ${title}
 */
public class ${safeTitlePascal}Test {
    private WebDriver driver;
    private WebDriverWait wait;

    @BeforeEach
    void setUp() {
        driver = new ChromeDriver();
        wait = new WebDriverWait(driver, java.time.Duration.ofSeconds(10));
        driver.manage().window().maximize();
    }

    @AfterEach
    void tearDown() {
        if (driver != null) driver.quit();
    }

    @Test
    void happyPath() {
        driver.get("https://your-app-url.com");
${steps.map((s, i) => `        // Step ${i+1}: ${s.step}\n        // Expected: ${s.expected}`).join("\n")}
    }
}`;
    }
    return `// ${title} â€” ${framework} Java\nimport org.junit.jupiter.api.*;\n\npublic class ${safeTitlePascal}Test {\n    @Test\n    void test() {\n        // TODO: implement\n    }\n}`;
  }

  // Generic fallback
  return `// Generated script for: ${title}\n// Framework: ${framework} | Language: ${language}\n//\n// Steps:\n${steps.map((s, i) => `// ${i+1}. ${s.step}\n//    Expected: ${s.expected}`).join("\n")}\n\n// TODO: Implement the above steps using ${framework} and ${language}`;
}

// ============================================================================
// RULE-BASED TEST CASE GENERATOR (fallback when no AI key is configured)
// ============================================================================

// ============================================================================
// COVERAGE SUMMARY BUILDER (used when AI doesn't return coverageSummary)
// ============================================================================
function buildCoverageSummary(testCases: any[]): any {
  const byType: Record<string, number> = {
    functional:0, negative:0, boundary:0, security:0, smoke:0,
    regression:0, e2e:0, integration:0, accessibility:0, performance:0,
  };
  const areas = new Set<string>();
  for (const tc of testCases) {
    const t = (tc.testType || "functional").toLowerCase();
    if (byType.hasOwnProperty(t)) byType[t]++;
    else byType["functional"]++;
    if (tc.title) areas.add(tc.title.split(" ").slice(0,3).join(" "));
  }
  return {
    totalTestCases: testCases.length,
    byType,
    coverageAreas: Array.from(areas).slice(0, 10),
    gapAreas: [],
  };
}


function generateRuleBasedTests(
  title: string,
  description: string,
  appType: string
): { testCases: any[]; generatedBy: string } {
  const lines = description
    .split(/[\n.]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 10);

  // Extract keywords to build contextual steps
  const lower = description.toLowerCase();
  const hasLogin    = lower.includes("login") || lower.includes("sign in") || lower.includes("authenticate");
  const hasForm     = lower.includes("form") || lower.includes("submit") || lower.includes("input") || lower.includes("field");
  const hasSearch   = lower.includes("search") || lower.includes("filter") || lower.includes("find");
  const hasCreate   = lower.includes("create") || lower.includes("add") || lower.includes("new");
  const hasDelete   = lower.includes("delete") || lower.includes("remove");
  const hasUpdate   = lower.includes("update") || lower.includes("edit") || lower.includes("modify");
  const hasNav      = lower.includes("navigate") || lower.includes("page") || lower.includes("redirect");
  const hasValidate = lower.includes("valid") || lower.includes("error") || lower.includes("required");
  const hasApi      = appType === "api_rest" || appType === "api_graphql" || appType === "api_soap";

  const testCases: any[] = [];

  // â”€â”€ Happy path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const happySteps: any[] = [];
  if (hasLogin) {
    happySteps.push(
      { step: "Navigate to the login page", expected: "Login form is displayed with email and password fields" },
      { step: "Enter valid credentials (email and password)", expected: "Credentials are accepted without errors" },
      { step: "Click the Sign In / Login button", expected: "User is authenticated and redirected to the dashboard" },
    );
  } else if (hasApi) {
    happySteps.push(
      { step: `Send a valid ${hasCreate ? "POST" : hasUpdate ? "PUT" : hasDelete ? "DELETE" : "GET"} request with correct payload`, expected: "API returns 2xx status code" },
      { step: "Verify the response body contains expected fields", expected: "Response matches the defined schema" },
      { step: "Verify response time is within acceptable limits", expected: "Response time is under 2000ms" },
    );
  } else if (hasCreate) {
    happySteps.push(
      { step: `Navigate to the ${title} page`, expected: "Page loads successfully" },
      { step: "Click the Create / Add New button", expected: "Creation form or dialog is displayed" },
      { step: "Fill in all required fields with valid data", expected: "Fields accept input without errors" },
      { step: "Submit the form", expected: "Record is created and success message is shown" },
    );
  } else if (hasForm) {
    happySteps.push(
      { step: `Navigate to the ${title} page`, expected: "Page loads and form is visible" },
      { step: "Fill in all required fields with valid data", expected: "All fields accept input" },
      { step: "Click the Submit button", expected: "Form submits successfully and confirmation is shown" },
    );
  } else {
    happySteps.push(
      { step: `Navigate to the ${title} feature`, expected: "Feature page loads without errors" },
      { step: "Perform the primary action described in the requirement", expected: "Action completes successfully" },
      { step: "Verify the expected outcome is displayed", expected: "UI reflects the successful state" },
    );
  }
  if (hasNav) {
    happySteps.push({ step: "Verify the page redirects or updates correctly", expected: "Correct page or state is shown" });
  }
  testCases.push({
    title: `${title} â€” Happy Path`,
    description: `Verify the primary success flow: ${lines[0] || description.substring(0, 100)}`,
    preconditions: hasLogin ? "User has a valid registered account" : "User is logged in and has required permissions",
    steps: happySteps,
    priority: "high",
  });

  // â”€â”€ Negative / validation path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const negativeSteps: any[] = [];
  if (hasLogin) {
    negativeSteps.push(
      { step: "Navigate to the login page", expected: "Login form is displayed" },
      { step: "Enter an invalid email address (e.g., 'notanemail')", expected: "Validation error is shown for the email field" },
      { step: "Enter a wrong password for a valid account", expected: "Error message 'Invalid credentials' is displayed" },
      { step: "Leave both fields empty and click Login", expected: "Required field errors are shown for both fields" },
    );
  } else if (hasApi) {
    negativeSteps.push(
      { step: "Send a request with missing required fields", expected: "API returns 400 Bad Request with validation error details" },
      { step: "Send a request with an invalid authentication token", expected: "API returns 401 Unauthorized" },
      { step: "Send a request with an invalid data type for a field", expected: "API returns 422 Unprocessable Entity" },
    );
  } else if (hasForm || hasCreate) {
    negativeSteps.push(
      { step: "Leave all required fields empty and submit the form", expected: "Validation errors are shown for each required field" },
      { step: "Enter invalid data (e.g., text in a number field)", expected: "Field-level validation error is displayed" },
      { step: "Enter data that exceeds the maximum allowed length", expected: "Error message about maximum length is shown" },
    );
  } else {
    negativeSteps.push(
      { step: "Attempt the action with invalid or missing input", expected: "Appropriate error message is displayed" },
      { step: "Attempt the action without required permissions", expected: "Access denied or error message is shown" },
    );
  }
  testCases.push({
    title: `${title} â€” Validation & Error Handling`,
    description: "Verify the system handles invalid inputs and errors gracefully",
    preconditions: hasLogin ? "User is on the login page" : "User is logged in",
    steps: negativeSteps,
    priority: "high",
  });

  // â”€â”€ Edge case â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const edgeSteps: any[] = [];
  if (hasSearch) {
    edgeSteps.push(
      { step: "Search with an empty query string", expected: "All results are shown or a helpful message is displayed" },
      { step: "Search with special characters (e.g., <, >, &, ')", expected: "Search handles special characters safely without errors" },
      { step: "Search with a very long string (500+ characters)", expected: "System handles long input gracefully" },
    );
  } else if (hasDelete) {
    edgeSteps.push(
      { step: "Attempt to delete a record that is referenced by other data", expected: "System shows a warning or prevents deletion with a clear message" },
      { step: "Attempt to delete a record that does not exist", expected: "Appropriate 404 or error message is shown" },
      { step: "Confirm deletion of a valid record", expected: "Record is removed and list is updated" },
    );
  } else if (hasUpdate) {
    edgeSteps.push(
      { step: "Update a record with the same values (no changes)", expected: "System accepts the update without errors" },
      { step: "Update a record with boundary values (min/max)", expected: "Boundary values are accepted and saved correctly" },
      { step: "Attempt to update a record that no longer exists", expected: "Appropriate error message is shown" },
    );
  } else {
    edgeSteps.push(
      { step: "Test with boundary values (minimum and maximum allowed input)", expected: "System handles boundary values correctly" },
      { step: "Test with special characters and Unicode input", expected: "System handles special characters without errors" },
      { step: "Test concurrent access (perform the action twice rapidly)", expected: "System handles concurrent requests without data corruption" },
    );
  }
  testCases.push({
    title: `${title} â€” Edge Cases`,
    description: "Verify the system handles boundary conditions and edge cases correctly",
    preconditions: "User is logged in with appropriate permissions",
    steps: edgeSteps,
    priority: "medium",
  });

  // â”€â”€ UI / UX verification (non-API) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!hasApi) {
    testCases.push({
      title: `${title} â€” UI & Accessibility`,
      description: "Verify the UI elements are correctly displayed and accessible",
      preconditions: "User is logged in",
      steps: [
        { step: `Navigate to the ${title} page`, expected: "Page loads within 3 seconds" },
        { step: "Verify all buttons, labels, and headings are visible", expected: "All UI elements are rendered correctly" },
        { step: "Resize the browser window to mobile size (375px)", expected: "Layout is responsive and all elements remain usable" },
        { step: "Tab through all interactive elements using keyboard", expected: "All elements are keyboard-accessible with visible focus indicators" },
      ],
      priority: "low",
    });
  }

  // â”€â”€ Security check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (hasLogin || hasForm || hasApi) {
    testCases.push({
      title: `${title} â€” Security`,
      description: "Verify the feature is protected against common security vulnerabilities",
      preconditions: "Tester has access to the application",
      steps: hasLogin
        ? [
            { step: "Attempt SQL injection in the email field (e.g., ' OR 1=1 --)", expected: "Input is sanitized and login fails with a normal error" },
            { step: "Attempt to access a protected page without logging in", expected: "User is redirected to the login page" },
            { step: "Verify the password field masks the input", expected: "Password characters are shown as dots or asterisks" },
          ]
        : [
            { step: "Attempt to access the feature without authentication", expected: "System returns 401 or redirects to login" },
            { step: "Attempt to access another user's data by modifying the ID in the request", expected: "System returns 403 Forbidden" },
            { step: "Submit a script tag in a text field (XSS attempt)", expected: "Input is sanitized and script is not executed" },
          ],
      priority: "critical",
    });
  }
  const coverageSummary = buildCoverageSummary(testCases);
  const riskAreas = [
    { area: "Authentication & Session Security", severity: "high", mitigation: "Ensure password hashing, session expiry, HTTPS enforcement, and brute-force protection are tested" },
    { area: "Input Validation & Data Integrity", severity: "medium", mitigation: "Test all form fields with boundary values, special characters, and injection payloads" },
    { area: "Role-Based Access Control", severity: "high", mitigation: "Verify each user role can only access their permitted features and data" },
  ];
  const automationCandidates = testCases
    .filter(tc => ["smoke", "functional", "regression"].includes(tc.testType || ""))
    .slice(0, 5)
    .map((tc, i) => ({
      testCaseId: tc.testCaseId || `TC-00${i+1}`,
      reason: "Stable, repeatable scenario suitable for automation",
      suggestedFramework: "playwright",
    }));
  return { testCases, coverageSummary, riskAreas, automationCandidates, assumptions: ["Standard user permissions assumed","Test environment matches production configuration"], generatedBy: "rule-based" };
  return { testCases, generatedBy: "rule-based" };
}

// ============================================================================
// ROBUST JSON EXTRACTION HELPERS (handles markdown blocks, truncated JSON, etc.)
// ============================================================================

function extractJsonFromResponse<T>(response: string): T | null {
  try {
    // Try 1: Direct parse
    try {
      return JSON.parse(response) as T;
    } catch {
      // continue
    }

    // Try 2: Extract from markdown code block ```json ... ```
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim()) as T;
      } catch {
        // continue
      }
    }

    // Try 3: Find the outermost balanced braces
    const jsonStr = extractBalancedJson(response);
    if (jsonStr) {
      return JSON.parse(jsonStr) as T;
    }

    // Try 4: Greedy regex with progressive trimming
    const greedyMatch = response.match(/\{[\s\S]*\}/);
    if (greedyMatch) {
      let candidate = greedyMatch[0];
      while (candidate.length > 2) {
        try {
          return JSON.parse(candidate) as T;
        } catch {
          const lastBrace = candidate.lastIndexOf('}');
          if (lastBrace <= 0) break;
          candidate = candidate.substring(0, lastBrace + 1);
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

function extractBalancedJson(text: string): string | null {
  const startIdx = text.indexOf('{');
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];
    if (escape) { escape = false; continue; }
    if (char === '\\' && inString) { escape = true; continue; }
    if (char === '"' && !escape) { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) return text.substring(startIdx, i + 1);
      }
    }
  }
  return null;
}
