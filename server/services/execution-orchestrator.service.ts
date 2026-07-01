/**
 * Execution Orchestrator Service
 * Coordinates test execution across the platform
 * Uses keyword framework, self-healing, and adapters
 */

import { storage } from "../storage";
import { KeywordInterpreter } from "../domain/keyword-framework";
import { KeywordLibrary } from "../domain/keyword-framework";
import { SelfHealer } from "../domain/self-healing";
import { AdapterFactory } from "../domain/adapters";
import { BaseExecutionAdapter, ExecutionContext, ExecutionResult, PlatformType } from "../domain/adapters";
import { Keyword, KeywordExecutionResult } from "../domain/keyword-framework";
import { logger } from "../infrastructure/logger";
import { getExecutionQueue } from "../infrastructure/queue";
import { observeAppSteps } from "../learning/observe";

export class ExecutionOrchestratorService {
  /**
   * Run a test suite with keyword-driven execution
   */
  static async executeTestSuite(
    suiteId: string,
    platform: PlatformType = "web",
    targetUrl: string,
    framework?: string,
    options?: {
      selfHealing?: boolean;
      maxRetries?: number;
      testData?: Array<{ key: string; value: string; type: string }>;
    }
  ): Promise<string> {
    try {
      // Get test cases
      const testCases = await storage.getTestCasesBySuite(suiteId);
      if (testCases.length === 0) {
        throw new Error("No test cases in suite");
      }

      // Create execution record
      const execution = await storage.createExecution({
        suiteId,
        targetUrl,
        framework: framework || "playwright",
        environment: "staging",
        status: "pending",
        totalTests: testCases.length,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
      });

      // Queue the execution
      const queue = getExecutionQueue();
      await queue.addJob({
        executionId: execution.id,
        suiteId,
        testCaseIds: testCases.map((tc) => tc.id),
        platform,
        targetUrl,
        framework,
        testData: options?.testData,
        selfHealing: options?.selfHealing !== false,
        maxRetries: options?.maxRetries || 2,
      });

      logger.info(`[ExecutionOrchestrator] Execution queued`, { executionId: execution.id, suiteId });
      return execution.id;
    } catch (error: any) {
      logger.error(`[ExecutionOrchestrator] Failed to queue execution`, { suiteId, error: error.message });
      throw error;
    }
  }

  /**
   * Execute a single test case
   */
  static async executeTestCase(
    testCaseId: string,
    platform: PlatformType = "web",
    targetUrl: string,
    framework?: string,
    options?: {
      selfHealing?: boolean;
      maxRetries?: number;
    }
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const testCase = await storage.getTestCase(testCaseId);

    if (!testCase) {
      throw new Error(`Test case ${testCaseId} not found`);
    }

    const executionId = `exec_${Date.now()}`;
    const adapter = AdapterFactory.getAdapter(platform, framework);

    if (!adapter) {
      throw new Error(`No adapter found for platform: ${platform}, framework: ${framework}`);
    }

    const context: ExecutionContext = {
      executionId,
      testCaseId,
      stepIndex: 0,
      platform,
      targetUrl,
      framework,
      variables: new Map(),
      previousResults: [],
      selfHealing: options?.selfHealing !== false,
      maxRetries: options?.maxRetries || 2,
    };

    const keywords: KeywordExecutionResult[] = [];
    let screenshots: string[] = [];
    let logs: string[] = [];

    try {
      // Initialize adapter
      await adapter.initialize(context);

      // Convert test case steps to keywords
      const keywordsToExecute: Keyword[] = [];

      const testCaseSteps = testCase.steps ?? [];
      for (let i = 0; i < testCaseSteps.length; i++) {
        const step = testCaseSteps[i];
        const interpreted = await KeywordInterpreter.interpret(step.step, { platform });
        keywordsToExecute.push(...interpreted);
      }

      logger.debug(`[ExecutionOrchestrator] Executing ${keywordsToExecute.length} keywords`, { testCaseId, executionId });

      // Execute keywords
      let lastError: any = null;
      for (let i = 0; i < keywordsToExecute.length; i++) {
        const keyword = keywordsToExecute[i];
        context.stepIndex = i;

        let result: KeywordExecutionResult | null = null;
        let retryCount = 0;

        // Retry loop
        while (retryCount <= (context.maxRetries || 0)) {
          try {
            result = await adapter.executeKeyword(keyword, context);

            if (result.success) {
              keywords.push(result);
              context.previousResults.push(result);
              lastError = null;
              break; // Success, exit retry loop
            } else {
              lastError = result.error;

              // Try self-healing if enabled
              if (context.selfHealing && keyword.selector) {
                logger.warn(`[ExecutionOrchestrator] Keyword failed, attempting self-heal`, {
                  testCaseId,
                  keyword: keyword.type,
                  attempt: retryCount + 1,
                });

                const suggestion = await SelfHealer.heal(keyword, result.error, undefined, context.previousResults);

                if (suggestion.suggestedSelectors.length > 0) {
                  // Try first suggested selector
                  const bestSelector = suggestion.suggestedSelectors[0];
                  const healedKeyword = { ...keyword, selector: bestSelector.selector };

                  result = await adapter.executeKeyword(healedKeyword, context);
                  result.healed = true;
                  result.healingStrategy = bestSelector.strategy;

                  if (result.success) {
                    keywords.push(result);
                    context.previousResults.push(result);
                    lastError = null;
                    break;
                  }
                }
              }

              lastError = result.error;
              retryCount++;

              if (retryCount > (context.maxRetries || 0)) {
                keywords.push(result);
                context.previousResults.push(result);
                break;
              }
            }
          } catch (error: any) {
            lastError = error;
            retryCount++;

            if (retryCount > (context.maxRetries || 0)) {
              keywords.push({
                keyword,
                success: false,
                duration: 0,
                error: {
                  message: error?.message || "Unknown error",
                  code: "EXECUTION_ERROR",
                  details: error,
                },
                timestamp: new Date(),
              });
              break;
            }
          }
        }
      }

      // Take final screenshot
      if (adapter.takeScreenshot) {
        try {
          const screenshot = await adapter.takeScreenshot(context);
          screenshots.push(screenshot);
        } catch (error) {
          logger.warn(`[ExecutionOrchestrator] Failed to capture screenshot`, { testCaseId });
        }
      }

      // Collect logs
      if (adapter.getConsoleLogs) {
        try {
          const consoleLogs = await adapter.getConsoleLogs(context);
          logs = consoleLogs.map((log) => `[${log.level}] ${log.message}`);
        } catch (error) {
          logger.warn(`[ExecutionOrchestrator] Failed to collect logs`, { testCaseId });
        }
      }

      // Determine overall status
      const failedCount = keywords.filter((k) => !k.success).length;
      const status = failedCount === 0 ? "completed" : failedCount === keywords.length ? "failed" : "completed";

      // ── Learning & Memory feed (best-effort, non-fatal). The keyword-driven
      //    "unified" path previously never recorded outcomes, so the Learning &
      //    Analytics dashboard stayed empty even after real runs. Feed each
      //    keyword result so success/heal/failure analytics populate per app.
      try {
        observeAppSteps(
          String(platform || "web").toUpperCase(),
          keywords.map((k) => ({
            step: `${k.keyword?.type || "STEP"}${k.keyword?.selector ? ` ${k.keyword.selector}` : ""}`.trim(),
            passed: k.success,
            selector: k.keyword?.selector,
            healed: !!k.healed,
          })),
          { sessionId: executionId },
        );
      } catch { /* never break execution on a learning write */ }

      const stats = adapter.getStats();

      const result: ExecutionResult = {
        executionId,
        testCaseId,
        status,
        keywords,
        stats,
        screenshots,
        logs,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        duration: Date.now() - startTime,
      };

      logger.info(`[ExecutionOrchestrator] Test case execution completed`, {
        testCaseId,
        status,
        duration: result.duration,
        passed: failedCount === 0,
      });

      return result;
    } catch (error: any) {
      logger.error(`[ExecutionOrchestrator] Test case execution failed`, { testCaseId, error: error.message });

      return {
        executionId,
        testCaseId,
        status: "failed",
        keywords,
        stats: { totalKeywords: 0, successfulKeywords: 0, failedKeywords: 0, healedKeywords: 0, totalDuration: 0, avgKeywordDuration: 0 },
        screenshots,
        logs,
        error: {
          message: error?.message || "Unknown error",
          code: "EXECUTION_FAILED",
          details: error,
        },
        startedAt: new Date(startTime),
        completedAt: new Date(),
        duration: Date.now() - startTime,
      };
    } finally {
      // Cleanup
      try {
        await adapter.cleanup();
      } catch (error) {
        logger.warn(`[ExecutionOrchestrator] Cleanup failed`, { testCaseId, error });
      }
    }
  }

  /**
   * Get execution progress
   */
  static async getExecutionProgress(executionId: string) {
    const queue = getExecutionQueue();
    return queue.getJobProgress(executionId);
  }

  /**
   * Cancel execution
   */
  static async cancelExecution(executionId: string): Promise<boolean> {
    const queue = getExecutionQueue();
    return queue.cancelJob(executionId);
  }

  /**
   * Get execution result
   */
  static async getExecutionResult(executionId: string) {
    const queue = getExecutionQueue();
    return queue.getJobResult(executionId);
  }
}
