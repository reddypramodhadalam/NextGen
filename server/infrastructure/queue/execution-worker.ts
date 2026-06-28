/**
 * Execution Worker
 * Processes test execution jobs from the queue
 */

import { Job as BullJob } from "bull";
import { ExecutionOrchestratorService } from "../../services";
import { storage } from "../../storage";
import { ExecutionJobData, ExecutionJobProgress, ExecutionJobResult } from "./execution-queue.types";
import { logger } from "../logger";
import { getExecutionQueue } from "./";

export class ExecutionWorker {
  private static workerId = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  private static startTime = Date.now();
  private static processedCount = 0;
  private static failedCount = 0;

  /**
   * Start worker process
   */
  static async start(concurrency: number = 3): Promise<void> {
    const queue = getExecutionQueue();
    const bullQueue = queue.getQueueInstance();

    logger.info(`[ExecutionWorker] Starting worker`, {
      workerId: this.workerId,
      concurrency,
    });

    await bullQueue.process(concurrency, async (job: BullJob<ExecutionJobData>) => {
      return this.processJob(job, queue);
    });

    // Listen to worker events
    bullQueue.on("active", (job) => {
      logger.info(`[ExecutionWorker] Job started`, { workerId: this.workerId, jobId: job.id });
    });

    bullQueue.on("completed", (job) => {
      logger.info(`[ExecutionWorker] Job completed`, { workerId: this.workerId, jobId: job.id });
    });

    bullQueue.on("failed", (job, err) => {
      logger.error(`[ExecutionWorker] Job failed`, {
        workerId: this.workerId,
        jobId: job.id,
        error: err.message,
      });
    });
  }

  /**
   * Process a single job
   */
  private static async processJob(job: BullJob<ExecutionJobData>, queue: any): Promise<ExecutionJobResult> {
    const { executionId, testCaseIds, platform, targetUrl, framework, testData, selfHealing, maxRetries } = job.data;
    const startTime = Date.now();

    logger.info(`[ExecutionWorker] Processing job`, {
      workerId: this.workerId,
      executionId,
      testCaseCount: testCaseIds.length,
    });

    // Update execution status
    await storage.updateExecution(executionId, {
      status: "running",
      startedAt: new Date(),
    });

    const results = [];
    let passedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    try {
      for (let i = 0; i < testCaseIds.length; i++) {
        const testCaseId = testCaseIds[i];

        try {
          logger.debug(`[ExecutionWorker] Executing test case`, {
            workerId: this.workerId,
            executionId,
            testCaseId,
            progress: `${i + 1}/${testCaseIds.length}`,
          });

          // Execute test case
          const result = await ExecutionOrchestratorService.executeTestCase(testCaseId, platform, targetUrl, framework, {
            selfHealing,
            maxRetries,
          });

          // Update progress
          const progress: Partial<ExecutionJobProgress> = {
            completedTests: i + 1,
            currentTestIndex: i,
            currentTestId: testCaseId,
            passedTests: passedCount + (result.status === "completed" ? 1 : 0),
            failedTests: failedCount + (result.status === "failed" ? 1 : 0),
          };

          await job.progress(progress as any);

          // Store result
          await storage.createResult({
            executionId,
            testCaseId,
            status: result.status,
            duration: result.duration,
            keywords: result.keywords,
            screenshots: result.screenshots,
            logs: result.logs,
            error: result.error?.message,
          });

          if (result.status === "completed") {
            passedCount++;
          } else {
            failedCount++;
          }

          results.push({
            testCaseId,
            testName: result.executionId,
            passed: result.status === "completed",
            duration: result.duration,
            error: result.error?.message,
            screenshots: result.screenshots,
            logs: result.logs,
          });
        } catch (error: any) {
          logger.error(`[ExecutionWorker] Test case execution error`, {
            workerId: this.workerId,
            executionId,
            testCaseId,
            error: error.message,
          });

          failedCount++;
          results.push({
            testCaseId,
            testName: testCaseId,
            passed: false,
            duration: 0,
            error: error?.message || "Unknown error",
          });

          // Continue with next test case
        }
      }

      // Update execution with final stats
      const duration = Date.now() - startTime;
      await storage.updateExecution(executionId, {
        status: "completed",
        totalTests: testCaseIds.length,
        passedTests: passedCount,
        failedTests: failedCount,
        skippedTests: skippedCount,
        completedAt: new Date(),
        duration,
      });

      this.processedCount++;

      logger.info(`[ExecutionWorker] Job completed`, {
        workerId: this.workerId,
        executionId,
        duration,
        passed: passedCount,
        failed: failedCount,
      });

      return {
        executionId,
        status: failedCount === 0 ? "completed" : "partial",
        results,
        summary: {
          total: testCaseIds.length,
          passed: passedCount,
          failed: failedCount,
          skipped: skippedCount,
          duration,
          successRate: testCaseIds.length > 0 ? (passedCount / testCaseIds.length) * 100 : 0,
        },
        startedAt: new Date(startTime),
        completedAt: new Date(),
      };
    } catch (error: any) {
      logger.error(`[ExecutionWorker] Job processing failed`, {
        workerId: this.workerId,
        executionId,
        error: error.message,
      });

      const duration = Date.now() - startTime;

      // Update execution as failed
      await storage.updateExecution(executionId, {
        status: "failed",
        completedAt: new Date(),
        duration,
      });

      this.failedCount++;

      throw error;
    }
  }

  /**
   * Get worker statistics
   */
  static getStats() {
    return {
      workerId: this.workerId,
      uptime: Date.now() - this.startTime,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      successRate: this.processedCount > 0 ? ((this.processedCount - this.failedCount) / this.processedCount) * 100 : 0,
    };
  }
}
