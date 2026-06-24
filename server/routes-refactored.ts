/**
 * Refactored Routes
 * Thin routing layer delegating to controllers/services
 * Can be used alongside existing routes.ts for non-breaking migration
 */

import type { Express, Request, Response } from "express";
import { isAuthenticated } from "./auth";
import { ExecutionController } from "./controllers";
import { TestGenerationService } from "./services";
import { storage } from "./storage";
import { logger } from "./infrastructure/logger";
import { KeywordLibrary } from "./domain/keyword-framework";
import { KeywordInterpreter } from "./domain/keyword-framework";
import multer from "multer";
import * as path from "path";
import requirementRouter from "./test-generation/requirement-api";

// Multer configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export async function registerRefactoredRoutes(app: Express): Promise<void> {
  logger.info("[Routes] Registering refactored routes");

  // ========================================
  // EXECUTION ENDPOINTS
  // ========================================

  // POST /api/v2/executions - Queue test execution
  app.post("/api/v2/executions", isAuthenticated, async (req: Request, res: Response) => {
    await ExecutionController.createExecution(req, res);
  });

  // GET /api/v2/executions/:id - Get execution details
  app.get("/api/v2/executions/:id", isAuthenticated, async (req: Request, res: Response) => {
    await ExecutionController.getExecution(req, res);
  });

  // GET /api/v2/executions/:id/progress - Get execution progress
  app.get("/api/v2/executions/:id/progress", isAuthenticated, async (req: Request, res: Response) => {
    await ExecutionController.getExecutionProgress(req, res);
  });

  // GET /api/v2/executions/:id/results - Get execution results
  app.get("/api/v2/executions/:id/results", isAuthenticated, async (req: Request, res: Response) => {
    await ExecutionController.getExecutionResults(req, res);
  });

  // POST /api/v2/executions/:id/cancel - Cancel execution
  app.post("/api/v2/executions/:id/cancel", isAuthenticated, async (req: Request, res: Response) => {
    await ExecutionController.cancelExecution(req, res);
  });

  // POST /api/v2/executions/:id/retry - Retry failed execution
  app.post("/api/v2/executions/:id/retry", isAuthenticated, async (req: Request, res: Response) => {
    await ExecutionController.retryExecution(req, res);
  });

  // GET /api/v2/executions/:id/screenshots - Get execution screenshots
  app.get("/api/v2/executions/:id/screenshots", isAuthenticated, async (req: Request, res: Response) => {
    await ExecutionController.getScreenshots(req, res);
  });

  // GET /api/v2/executions/:id/logs - Get execution logs
  app.get("/api/v2/executions/:id/logs", isAuthenticated, async (req: Request, res: Response) => {
    await ExecutionController.getLogs(req, res);
  });

  // ========================================
  // TEST GENERATION ENDPOINTS
  // ========================================

  // POST /api/v2/generate-tests - Generate test cases with improved quality
  app.post("/api/v2/generate-tests", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { title, description, appType, appHints } = req.body;

      if (!description) {
        res.status(400).json({ error: "Description is required" });
        return;
      }

      const result = await TestGenerationService.generateTestCases(title, description, appType, appHints);

      res.json({
        testCases: result.testCases,
        generatedBy: result.generatedBy,
        statistics: result.statistics,
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error("[Routes] Test generation failed", { error: error.message });
      res.status(500).json({ error: "Test generation failed" });
    }
  });

  // POST /api/v2/generate-tests/save - Generate and save test cases
  app.post("/api/v2/generate-tests/save", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { suiteId, title, description, appType, appHints } = req.body;

      if (!suiteId || !description) {
        res.status(400).json({ error: "suiteId and description are required" });
        return;
      }

      const result = await TestGenerationService.generateTestCases(title, description, appType, appHints);
      await TestGenerationService.saveGeneratedTestCases(suiteId, result.testCases);

      res.json({
        testCases: result.testCases,
        generatedBy: result.generatedBy,
        statistics: result.statistics,
        saved: true,
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error("[Routes] Test generation/save failed", { error: error.message });
      res.status(500).json({ error: "Test generation failed" });
    }
  });

  // ========================================
  // EXCEL PARSING ENDPOINTS
  // ========================================

  // POST /api/v2/upload/parse-excel - Parse Excel with improved parser
  app.post("/api/v2/upload/parse-excel", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const { ExcelParserV2 } = await import("./infrastructure/excel/excel-parser-v2.js");
      const result = await ExcelParserV2.parseTestCases(req.file.buffer);

      res.json({
        testCases: result.testCases,
        errors: result.errors,
        summary: result.summary,
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error("[Routes] Excel parsing failed", { error: error.message });
      res.status(500).json({ error: "Excel parsing failed" });
    }
  });

  // POST /api/v2/upload/parse-data-sheet - Parse data sheet
  app.post("/api/v2/upload/parse-data-sheet", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const { ExcelParserV2 } = await import("./infrastructure/excel/excel-parser-v2.js");
      const result = await ExcelParserV2.parseDataSheet(req.file.buffer);

      res.json({
        parameters: result.parameters,
        errors: result.errors,
        summary: result.summary,
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error("[Routes] Data sheet parsing failed", { error: error.message });
      res.status(500).json({ error: "Data sheet parsing failed" });
    }
  });

  // ========================================
  // KEYWORD FRAMEWORK ENDPOINTS
  // ========================================

  // GET /api/v2/keywords - Get all available keywords
  app.get("/api/v2/keywords", (req: Request, res: Response) => {
    try {
      const keywords = KeywordLibrary.getAllKeywords();
      res.json({
        keywords,
        count: keywords.length,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch keywords" });
    }
  });

  // GET /api/v2/keywords/:platform - Get keywords for platform
  app.get("/api/v2/keywords/:platform", (req: Request, res: Response) => {
    try {
      const keywords = KeywordLibrary.getKeywordsByPlatform(req.params.platform);
      res.json({
        platform: req.params.platform,
        keywords,
        count: keywords.length,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch keywords" });
    }
  });

  // POST /api/v2/interpret - Interpret free text to keywords
  app.post("/api/v2/interpret", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { step, platform } = req.body;

      if (!step) {
        res.status(400).json({ error: "step is required" });
        return;
      }

      const { KeywordInterpreter } = await import("./domain/keyword-framework/keyword-interpreter");
      const keywords = await KeywordInterpreter.interpret(step, { platform });

      res.json({
        originalStep: step,
        interpretedKeywords: keywords,
        summary: KeywordInterpreter.summarize(keywords),
      });
    } catch (error: any) {
      logger.error("[Routes] Keyword interpretation failed", { error: error.message });
      res.status(500).json({ error: "Keyword interpretation failed" });
    }
  });

  // ========================================
  // TEST CASE IMPORT/EXPORT
  // ========================================

  // POST /api/v2/test-cases/bulk-import - Import multiple test cases
  app.post("/api/v2/test-cases/bulk-import", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { suiteId, testCases } = req.body;

      if (!suiteId || !Array.isArray(testCases)) {
        res.status(400).json({ error: "suiteId and testCases array are required" });
        return;
      }

      const imported = [];
      const errors = [];

      for (let i = 0; i < testCases.length; i++) {
        try {
          const tc = testCases[i];
          const created = await storage.createTestCase({
            suiteId,
            title: tc.title,
            description: tc.description,
            preconditions: tc.preconditions,
            targetUrl: tc.targetUrl,
            steps: tc.steps || [],
            priority: tc.priority || "medium",
            tags: tc.tags || [],
            status: "active",
            generatedByAI: false,
          });
          imported.push(created);
        } catch (error: any) {
          errors.push({ index: i, error: error.message });
        }
      }

      res.json({
        imported: imported.length,
        failed: errors.length,
        testCases: imported,
        errors,
      });
    } catch (error: any) {
      logger.error("[Routes] Bulk import failed", { error: error.message });
      res.status(500).json({ error: "Bulk import failed" });
    }
  });

  // ========================================
  // SELF-HEALING ENDPOINTS
  // ========================================

  // POST /api/v2/healer/analyze - Analyze test case for healing opportunities
  app.post("/api/v2/healer/analyze", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { testCaseId, autoHeal } = req.body;

      if (!testCaseId) {
        res.status(400).json({ error: "testCaseId is required" });
        return;
      }

      const { SelfHealer } = await import("./domain/self-healing/self-healer");

      // Analyze test case selectors
      const testCase = await storage.getTestCase(testCaseId);
      if (!testCase) {
        res.status(404).json({ error: "Test case not found" });
        return;
      }

      const stats = SelfHealer.getStatistics();
      const suggestions = SelfHealer.exportSuggestions();

      res.json({
        testCaseId,
        statistics: stats,
        suggestions: Object.keys(suggestions).length > 0 ? suggestions : {},
        autoHealEnabled: autoHeal || false,
      });
    } catch (error: any) {
      logger.error("[Routes] Healing analysis failed", { error: error.message });
      res.status(500).json({ error: "Healing analysis failed" });
    }
  });

  // ========================================
  // REQUIREMENT-BASED TEST GENERATION
  // ========================================
  app.use(requirementRouter);
  logger.info("[Routes] ✅ Requirement-based test generation API mounted at /api/v2/generate-from-requirements");

  logger.info("[Routes] Refactored routes registered successfully");
}


