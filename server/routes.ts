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
import { testExecutor } from "./test-executor";
import { setupAuth, isAuthenticated, createUser, getUserByEmail } from "./auth";
import { addProjectMemberSchema } from "@shared/models/auth";

// Partial schemas for PATCH operations
const partialTestSuiteSchema = insertTestSuiteSchema.partial();
const partialTestCaseSchema = insertTestCaseSchema.partial();
const partialTestAgentSchema = insertTestAgentSchema.partial();

// Custom schemas for generation endpoints
const generateTestsSchema = z.object({
  title: z.string().optional(),
  description: z.string().min(1, "Description is required"),
});

const generateScriptSchema = z.object({
  testCaseId: z.string().min(1, "Test case ID is required"),
  framework: z.enum(["playwright", "cypress", "selenium", "puppeteer"]),
  language: z.enum(["typescript", "javascript", "python", "java"]),
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
  // Setup authentication before other routes
  await setupAuth(app);

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
      const { suiteId, agentId, environment, targetUrl, framework, testData } = validation.data;

      // Get test cases for the suite
      const testCases = suiteId 
        ? await storage.getTestCasesBySuite(suiteId)
        : await storage.getAllTestCases();

      if (testCases.length === 0) {
        return res.status(400).json({ error: "No test cases found to execute" });
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

      // Run real test execution asynchronously with selected framework
      testExecutor.runExecution(execution.id, testCases, targetUrl, framework ?? "playwright", testData).catch((error) => {
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

  // AI Test Generation
  app.post("/api/generate-tests", async (req: Request, res: Response) => {
    try {
      const validation = validateBody(generateTestsSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      const { title, description } = validation.data;

      const systemPrompt = `You are a QA expert that generates comprehensive test cases from requirements. Generate test cases in JSON format with the following structure:
{
  "testCases": [
    {
      "title": "Short descriptive title",
      "description": "What this test verifies",
      "preconditions": "Any setup required",
      "steps": [
        { "step": "Action to perform", "expected": "Expected result" }
      ],
      "priority": "low|medium|high|critical"
    }
  ]
}
Generate 3-5 comprehensive test cases covering positive, negative, and edge cases. Only output valid JSON.`;

      const userPrompt = `Generate test cases for the following requirement:\n\nTitle: ${title}\n\nDescription: ${description}`;

      const aiClient = await getAiClient();
      const content = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);

      let result;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        result = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch {
        result = { testCases: [] };
      }

      res.json(result);
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

      const aiClient = await getAiClient();
      const code = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);

      // Save the generated script
      const script = await storage.createScript({
        testCaseId,
        name: `${testCase.title} - ${framework}`,
        framework,
        language,
        code,
      });

      res.json({ code, script });
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

      // Start execution
      const testCases = await storage.getTestCasesBySuite(webhook.suiteId);
      testExecutor.runExecution(execution.id, testCases, targetUrl, "playwright");

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
      // Add creator as owner in team memberships
      const adminRole = await storage.getRoleByName("admin");
      if (adminRole) {
        await storage.createTeamMembership({
          userId,
          projectId: project.id,
          roleId: adminRole.id,
          isOwner: true,
        });
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

  return httpServer;
}
