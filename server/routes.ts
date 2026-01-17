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

const createExecutionSchema = z.object({
  suiteId: z.string().optional().nullable(),
  agentId: z.string().optional().nullable(),
  environment: z.enum(["development", "staging", "production"]).optional(),
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
      const { suiteId, agentId, environment } = validation.data;

      // Get test cases for the suite
      const testCases = suiteId 
        ? await storage.getTestCasesBySuite(suiteId)
        : await storage.getAllTestCases();

      const execution = await storage.createExecution({
        suiteId: suiteId ?? undefined,
        agentId: agentId ?? undefined,
        environment: environment ?? "staging",
        status: "running",
        totalTests: testCases.length,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
      });

      // Update execution with started time
      await storage.updateExecution(execution.id, {
        startedAt: new Date(),
      });

      // Simulate test execution (in a real app, this would be async)
      simulateExecution(execution.id, testCases.length);

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

// Simulate test execution (for demo purposes)
async function simulateExecution(executionId: string, totalTests: number) {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  let passed = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < totalTests; i++) {
    await delay(1000 + Math.random() * 2000); // Random delay 1-3 seconds

    // Random pass/fail (80% pass rate)
    if (Math.random() > 0.2) {
      passed++;
    } else {
      failed++;
    }

    await storage.updateExecution(executionId, {
      passedTests: passed,
      failedTests: failed,
    });
  }

  const duration = Date.now() - startTime;
  const finalStatus = failed === 0 ? "passed" : "failed";

  await storage.updateExecution(executionId, {
    status: finalStatus,
    duration,
    completedAt: new Date(),
  });

  // Create a report
  await storage.createReport({
    executionId,
    name: `Execution Report - ${new Date().toISOString().split("T")[0]}`,
    summary: `Completed ${totalTests} tests with ${passed} passed and ${failed} failed.`,
    passRate: Math.round((passed / totalTests) * 100),
    totalDuration: duration,
    insights: [
      { type: "info", message: `Average test duration: ${Math.round(duration / totalTests / 1000)}s` },
      failed > 0
        ? { type: "warning", message: `${failed} test(s) failed - review needed` }
        : { type: "success", message: "All tests passed" },
    ],
  });
}
