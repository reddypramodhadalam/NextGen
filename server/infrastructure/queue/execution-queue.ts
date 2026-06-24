/**
 * Execution Queue
 * Manages asynchronous test execution using BullMQ
 */

import Bull, { Queue as BullQueue, Job as BullJob } from "bull";
import { EventEmitter } from "events";
import { ExecutionJobData, ExecutionJobProgress, ExecutionJobResult, QueueConfig, WorkerStats } from "./execution-queue.types";
import { logger } from "../logger";

export class ExecutionQueue extends EventEmitter {
  private queue: BullQueue<ExecutionJobData>;
  private config: QueueConfig;
  private stats: Map<string, WorkerStats> = new Map();

  static defaultConfig: QueueConfig = {
    concurrency: 3,
    maxRetries: 2,
    retryDelay: 1000,
    removeOnComplete: true,
    removeOnFail: false,
    stalledInterval: 5000,
    maxStalledCount: 3,
    lockDuration: 30000,
    lockRenewTime: 15000,
  };

  constructor(redisUrl: string, config: Partial<QueueConfig> = {}) {
    super();

    this.config = { ...ExecutionQueue.defaultConfig, ...config };

    this.queue = new Bull<ExecutionJobData>("test-executions", {
      redis: { url: redisUrl },
      defaultJobOptions: {
        attempts: this.config.maxRetries + 1,
        backoff: {
          type: "exponential",
          delay: this.config.retryDelay,
        },
        removeOnComplete: this.config.removeOnComplete,
        removeOnFail: this.config.removeOnFail,
      },
      settings: {
        stalledInterval: this.config.stalledInterval,
        maxStalledCount: this.config.maxStalledCount,
        lockDuration: this.config.lockDuration,
        lockRenewTime: this.config.lockRenewTime,
      },
    });

    this.setupEventListeners();
  }

  /**
   * Setup queue event listeners
   */
  private setupEventListeners(): void {
    this.queue.on("waiting", (job) => {
      logger.debug(`[ExecutionQueue] Job ${job.id} waiting`, { executionId: job.data.executionId });
      this.emit("job:waiting", job.data);
    });

    this.queue.on("active", (job) => {
      logger.info(`[ExecutionQueue] Job ${job.id} started`, { executionId: job.data.executionId });
      this.emit("job:started", job.data);
    });

    this.queue.on("progress", (job, progress) => {
      this.emit("job:progress", { executionId: job.data.executionId, progress });
    });

    this.queue.on("completed", (job, result) => {
      logger.info(`[ExecutionQueue] Job ${job.id} completed`, { executionId: job.data.executionId });
      this.emit("job:completed", { executionId: job.data.executionId, result });
    });

    this.queue.on("failed", (job, error) => {
      logger.error(`[ExecutionQueue] Job ${job.id} failed`, { executionId: job.data.executionId, error: error.message });
      this.emit("job:failed", { executionId: job.data.executionId, error: error.message, attempt: job.attemptsMade });
    });

    this.queue.on("stalled", (job) => {
      logger.warn(`[ExecutionQueue] Job ${job.id} stalled`, { executionId: job.data.executionId });
      this.emit("job:stalled", job.data);
    });

    this.queue.on("error", (error) => {
      logger.error(`[ExecutionQueue] Queue error:`, { error: error.message });
      this.emit("queue:error", error);
    });
  }

  /**
   * Add an execution job to the queue
   */
  async addJob(data: ExecutionJobData, options?: any): Promise<string> {
    try {
      const job = await this.queue.add(data, {
        ...options,
        jobId: data.executionId,
      });

      logger.info(`[ExecutionQueue] Job added`, { executionId: data.executionId, jobId: job.id });
      return job.id || data.executionId;
    } catch (error) {
      logger.error(`[ExecutionQueue] Failed to add job`, { executionId: data.executionId, error });
      throw error;
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<BullJob<ExecutionJobData> | null> {
    return this.queue.getJob(jobId);
  }

  /**
   * Get job progress
   */
  async getJobProgress(jobId: string): Promise<ExecutionJobProgress | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    return {
      executionId: job.data.executionId,
      totalTests: job.data.testCaseIds.length,
      completedTests: (job.progress() as any)?.completedTests || 0,
      passedTests: (job.progress() as any)?.passedTests || 0,
      failedTests: (job.progress() as any)?.failedTests || 0,
      skippedTests: (job.progress() as any)?.skippedTests || 0,
      currentTestIndex: (job.progress() as any)?.currentTestIndex || 0,
      currentTestId: (job.progress() as any)?.currentTestId,
      status: job.isCompleted() ? "completed" : job.isFailed() ? "failed" : job.isActive() ? "running" : "pending",
      startedAt: job.processedOn ? new Date(job.processedOn) : new Date(),
      updatedAt: new Date(),
      completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
    };
  }

  /**
   * Get job result
   */
  async getJobResult(jobId: string): Promise<ExecutionJobResult | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    return job.returnvalue as ExecutionJobResult;
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job) return false;

    await job.remove();
    logger.info(`[ExecutionQueue] Job cancelled`, { jobId });
    return true;
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<string | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    const newJob = await this.addJob(job.data);
    logger.info(`[ExecutionQueue] Job retried`, { originalJobId: jobId, newJobId: newJob });
    return newJob;
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    const counts = await this.queue.getJobCounts();
    const jobs = await this.queue.getJobs(["active", "waiting", "completed", "failed"]);

    return {
      queue: {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
        paused: counts.paused || 0,
      },
      workers: Array.from(this.stats.values()),
      jobs: jobs.length,
    };
  }

  /**
   * Register worker stats
   */
  registerWorker(workerId: string, stats: WorkerStats): void {
    this.stats.set(workerId, stats);
  }

  /**
   * Update worker stats
   */
  updateWorker(workerId: string, updates: Partial<WorkerStats>): void {
    const current = this.stats.get(workerId) || {
      workerId,
      status: "idle",
      totalProcessed: 0,
      totalFailed: 0,
      totalRetried: 0,
      uptime: 0,
    };

    this.stats.set(workerId, { ...current, ...updates });
  }

  /**
   * Pause queue
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    logger.info(`[ExecutionQueue] Queue paused`);
  }

  /**
   * Resume queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    logger.info(`[ExecutionQueue] Queue resumed`);
  }

  /**
   * Clean completed jobs older than specified time
   */
  async clean(age: number, status: "completed" | "failed" = "completed"): Promise<void> {
    await this.queue.clean(age, status);
    logger.info(`[ExecutionQueue] Cleaned old ${status} jobs`);
  }

  /**
   * Close queue
   */
  async close(): Promise<void> {
    await this.queue.close();
    logger.info(`[ExecutionQueue] Queue closed`);
  }

  /**
   * Get queue instance (for advanced operations)
   */
  getQueueInstance(): BullQueue<ExecutionJobData> {
    return this.queue;
  }
}

// Singleton instance
let executionQueueInstance: ExecutionQueue | null = null;

export function getExecutionQueue(redisUrl?: string, config?: Partial<QueueConfig>): ExecutionQueue {
  if (!executionQueueInstance) {
    const redis = redisUrl || process.env.REDIS_URL || "redis://localhost:6379";
    executionQueueInstance = new ExecutionQueue(redis, config);
  }
  return executionQueueInstance;
}
