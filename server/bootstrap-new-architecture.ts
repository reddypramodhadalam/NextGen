/**
 * Bootstrap New Architecture
 * Initialize all new infrastructure components
 * 
 * Usage in app.ts:
 * import { bootstrapNewArchitecture } from "./bootstrap-new-architecture";
 * await bootstrapNewArchitecture(app);
 */

import type { Express } from "express";
import { AdapterFactory } from "./domain/adapters";
import { PlaywrightAdapter } from "./domain/adapters/playwright-adapter";
import { getExecutionQueue } from "./infrastructure/queue";
import { ExecutionWorker } from "./infrastructure/queue/execution-worker";
import { registerRefactoredRoutes } from "./routes-refactored";
import { logger } from "./infrastructure/logger";

export async function bootstrapNewArchitecture(app: Express): Promise<void> {
  logger.info("[Bootstrap] Starting new architecture initialization...");

  try {
    // Step 1: Register Adapters
    logger.info("[Bootstrap] Registering execution adapters...");
    
    // Register Playwright adapter (web automation)
    AdapterFactory.registerAdapter("web_playwright", new PlaywrightAdapter());
    
    // TODO: Register additional adapters as they are implemented
    // AdapterFactory.registerAdapter("api_rest", new RestApiAdapter());
    // AdapterFactory.registerAdapter("mobile_appium", new AppiumAdapter());
    // etc.

    const adapters = AdapterFactory.list();
    logger.info(`[Bootstrap] ✅ ${adapters.length} adapter(s) registered`, {
      adapters: adapters.map((a) => a.key),
    });

    // Step 2: Initialize Execution Queue
    logger.info("[Bootstrap] Initializing execution queue...");
    
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const queue = getExecutionQueue(redisUrl, {
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY || "3"),
      maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || "2"),
    });

    logger.info("[Bootstrap] ✅ Execution queue initialized", { redisUrl });

    // Step 3: Start Worker Process (non-blocking)
    logger.info("[Bootstrap] Starting execution workers...");
    
    const concurrency = parseInt(process.env.WORKER_CONCURRENCY || "3");
    // Start worker in background, don't wait for it
    ExecutionWorker.start(concurrency).catch((err: any) => {
      logger.error("[Bootstrap] Worker startup error", { error: err.message });
    });
    
    const workerStats = ExecutionWorker.getStats();
    logger.info("[Bootstrap] ✅ Workers starting in background", {
      workerId: workerStats.workerId,
      concurrency,
    });

    // Step 4: Register Refactored Routes
    logger.info("[Bootstrap] Registering refactored routes...");
    
    await registerRefactoredRoutes(app);
    
    logger.info("[Bootstrap] ✅ Refactored routes registered on /api/v2/*");

    // Step 5: Setup Queue Event Listeners (for debugging)
    queue.on("job:started", (data) => {
      logger.debug("[Queue] Job started", { executionId: data.executionId });
    });

    queue.on("job:completed", (data) => {
      logger.info("[Queue] Job completed", { executionId: data.executionId });
    });

    queue.on("job:failed", (data) => {
      logger.error("[Queue] Job failed", { executionId: data.executionId, error: data.error });
    });

    queue.on("queue:error", (error) => {
      logger.error("[Queue] Queue error", { error: error.message });
    });

    logger.info("[Bootstrap] ✅ Queue event listeners configured");

    // Final status
    logger.info("[Bootstrap] ======================================");
    logger.info("[Bootstrap] ✅ NEW ARCHITECTURE SUCCESSFULLY INITIALIZED");
    logger.info("[Bootstrap] ======================================");
    logger.info("[Bootstrap] Available endpoints:");
    logger.info("[Bootstrap]   - GET  /api/v2/keywords");
    logger.info("[Bootstrap]   - POST /api/v2/executions");
    logger.info("[Bootstrap]   - GET  /api/v2/executions/:id");
    logger.info("[Bootstrap]   - GET  /api/v2/executions/:id/progress");
    logger.info("[Bootstrap]   - POST /api/v2/generate-tests");
    logger.info("[Bootstrap]   - POST /api/v2/upload/parse-excel");
    logger.info("[Bootstrap] ======================================");
  } catch (error: any) {
    logger.error("[Bootstrap] Initialization failed", { error: error.message });
    throw error;
  }
}

/**
 * Optional: Graceful shutdown
 */
export async function shutdownNewArchitecture(): Promise<void> {
  logger.info("[Bootstrap] Shutting down new architecture...");

  try {
    const queue = getExecutionQueue();
    await queue.close();
    logger.info("[Bootstrap] ✅ Queue closed");
  } catch (error: any) {
    logger.error("[Bootstrap] Shutdown error", { error: error.message });
  }
}
