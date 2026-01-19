import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";
import { z } from "zod";
import {
  insertTestSuiteSchema,
  insertTestCaseSchema,
  insertTestAgentSchema,
  insertTestExecutionSchema,
} from "@shared/schema";
import { testExecutor } from "./test-executor";

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

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
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

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a QA expert that generates comprehensive test cases from requirements. Generate test cases in JSON format with the following structure:
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
Generate 3-5 comprehensive test cases covering positive, negative, and edge cases.`,
          },
          {
            role: "user",
            content: `Generate test cases for the following requirement:\n\nTitle: ${title}\n\nDescription: ${description}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2000,
      });

      const content = completion.choices[0]?.message?.content || "{}";
      const result = JSON.parse(content);

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

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an automation engineer expert. Generate production-ready test automation scripts.
${frameworkGuides[framework] || ""}
${languageGuides[language] || ""}
Only output the code, no explanations. Include proper imports and setup.`,
          },
          {
            role: "user",
            content: `Generate a ${framework} test script in ${language} for the following test case:

Title: ${testCase.title}
Description: ${testCase.description || "N/A"}
Preconditions: ${testCase.preconditions || "None"}
Steps:
${(testCase.steps as any[] || []).map((s: any, i: number) => `${i + 1}. ${s.step} -> Expected: ${s.expected}`).join("\n")}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const code = completion.choices[0]?.message?.content || "";

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

  return httpServer;
}
