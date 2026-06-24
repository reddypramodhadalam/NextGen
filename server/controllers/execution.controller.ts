/**
 * Execution Controller
 * HTTP request handling for test execution
 */

import { Request, Response } from "express";
import { z } from "zod";
import { ExecutionOrchestratorService } from "../services";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";

// Validation schemas
const createExecutionSchema = z.object({
  suiteId: z.string().optional(),
  platform: z.enum(["web", "api", "mobile", "sap", "desktop"]).optional().default("web"),
  targetUrl: z.string().url("Valid URL required"),
  framework: z.string().optional(),
  testData: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
        type: z.enum(["text", "password", "email", "url", "number"]),
      })
    )
    .optional(),
  selfHealing: z.boolean().optional().default(true),
  maxRetries: z.number().min(0).max(5).optional().default(2),
});

type CreateExecutionRequest = z.infer<typeof createExecutionSchema>;

export class ExecutionController {
  /**
   * POST /api/executions
   * Create and queue a test execution
   */
  static async createExecution(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const validation = createExecutionSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: "Validation failed",
          details: validation.error.errors,
        });
        return;
      }

      const data = validation.data as CreateExecutionRequest;

      // Validate suite exists if provided
      if (data.suiteId) {
        const suite = await storage.getTestSuite(data.suiteId);
        if (!suite) {
          res.status(404).json({ error: "Test suite not found" });
          return;
        }
      }

      // Queue the execution
      const executionId = await ExecutionOrchestratorService.executeTestSuite(
        data.suiteId!,
        data.platform as any,
        data.targetUrl,
        data.framework,
        {
          selfHealing: data.selfHealing,
          maxRetries: data.maxRetries,
          testData: data.testData,
        }
      );

      logger.info(`[ExecutionController] Execution created`, { executionId, platform: data.platform });

      res.status(201).json({
        executionId,
        status: "queued",
        message: "Test execution queued successfully",
      });
    } catch (error: any) {
      logger.error(`[ExecutionController] Failed to create execution`, { error: error.message });
      res.status(500).json({ error: error.message || "Failed to create execution" });
    }
  }

  /**
   * GET /api/executions/:id
   * Get execution details
   */
  static async getExecution(req: Request, res: Response): Promise<void> {
    try {
      const execution = await storage.getExecution(req.params.id);
      if (!execution) {
        res.status(404).json({ error: "Execution not found" });
        return;
      }

      res.json(execution);
    } catch (error: any) {
      logger.error(`[ExecutionController] Failed to get execution`, { error: error.message });
      res.status(500).json({ error: "Failed to get execution" });
    }
  }

  /**
   * GET /api/executions/:id/progress
   * Get execution progress
   */
  static async getExecutionProgress(req: Request, res: Response): Promise<void> {
    try {
      const progress = await ExecutionOrchestratorService.getExecutionProgress(req.params.id);
      if (!progress) {
        res.status(404).json({ error: "Execution not found" });
        return;
      }

      res.json(progress);
    } catch (error: any) {
      logger.error(`[ExecutionController] Failed to get progress`, { error: error.message });
      res.status(500).json({ error: "Failed to get progress" });
    }
  }

  /**
   * GET /api/executions/:id/results
   * Get execution results
   */
  static async getExecutionResults(req: Request, res: Response): Promise<void> {
    try {
      const results = await storage.getResultsByExecution(req.params.id);
      res.json(results);
    } catch (error: any) {
      logger.error(`[ExecutionController] Failed to get results`, { error: error.message });
      res.status(500).json({ error: "Failed to get results" });
    }
  }

  /**
   * POST /api/executions/:id/cancel
   * Cancel an execution
   */
  static async cancelExecution(req: Request, res: Response): Promise<void> {
    try {
      const cancelled = await ExecutionOrchestratorService.cancelExecution(req.params.id);
      if (!cancelled) {
        res.status(404).json({ error: "Execution not found" });
        return;
      }

      res.json({ success: true, message: "Execution cancelled" });
    } catch (error: any) {
      logger.error(`[ExecutionController] Failed to cancel execution`, { error: error.message });
      res.status(500).json({ error: "Failed to cancel execution" });
    }
  }

  /**
   * GET /api/executions/:id/retry
   * Retry a failed execution
   */
  static async retryExecution(req: Request, res: Response): Promise<void> {
    try {
      const execution = await storage.getExecution(req.params.id);
      if (!execution) {
        res.status(404).json({ error: "Execution not found" });
        return;
      }

      if (execution.status !== "failed") {
        res.status(400).json({ error: "Only failed executions can be retried" });
        return;
      }

      // Re-queue the execution
      const newExecutionId = await ExecutionOrchestratorService.executeTestSuite(
        execution.suiteId!,
        "web",
        execution.targetUrl,
        execution.framework,
        { selfHealing: true, maxRetries: 2 }
      );

      res.json({
        originalExecutionId: execution.id,
        newExecutionId,
        message: "Execution retried",
      });
    } catch (error: any) {
      logger.error(`[ExecutionController] Failed to retry execution`, { error: error.message });
      res.status(500).json({ error: "Failed to retry execution" });
    }
  }

  /**
   * POST /api/executions/:id/screenshots
   * Get screenshots from execution
   */
  static async getScreenshots(req: Request, res: Response): Promise<void> {
    try {
      const results = await storage.getResultsByExecution(req.params.id);
      const screenshots = results.flatMap((r) => r.screenshots || []);

      res.json({ count: screenshots.length, screenshots });
    } catch (error: any) {
      logger.error(`[ExecutionController] Failed to get screenshots`, { error: error.message });
      res.status(500).json({ error: "Failed to get screenshots" });
    }
  }

  /**
   * POST /api/executions/:id/logs
   * Get logs from execution
   */
  static async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const results = await storage.getResultsByExecution(req.params.id);
      const logs = results.flatMap((r) => r.logs || []);

      res.json({ count: logs.length, logs });
    } catch (error: any) {
      logger.error(`[ExecutionController] Failed to get logs`, { error: error.message });
      res.status(500).json({ error: "Failed to get logs" });
    }
  }
}
