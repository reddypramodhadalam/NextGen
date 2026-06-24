/**
 * Execution Queue Types
 */

export interface ExecutionJobData {
  executionId: string;
  suiteId?: string;
  testCaseIds: string[];
  platform: "web" | "api" | "mobile" | "sap" | "desktop";
  targetUrl: string;
  framework?: string;
  environment?: "development" | "staging" | "production";
  testData?: Array<{ key: string; value: string; type: string }>;
  selfHealing?: boolean;
  maxRetries?: number;
  metadata?: Record<string, any>;
}

export interface ExecutionJobProgress {
  executionId: string;
  totalTests: number;
  completedTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  currentTestIndex: number;
  currentTestId?: string;
  currentStep?: number;
  totalSteps?: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  estimatedTimeRemaining?: number; // seconds
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface ExecutionJobResult {
  executionId: string;
  status: "completed" | "failed" | "cancelled" | "partial";
  results: Array<{
    testCaseId: string;
    testName: string;
    passed: boolean;
    duration: number;
    error?: string;
    screenshots?: string[];
    logs?: string[];
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    successRate: number;
  };
  startedAt: Date;
  completedAt: Date;
}

export interface QueueConfig {
  concurrency: number;
  maxRetries: number;
  retryDelay: number; // ms
  removeOnComplete: boolean;
  removeOnFail: boolean;
  stalledInterval: number; // ms
  maxStalledCount: number;
  lockDuration: number; // ms
  lockRenewTime: number; // ms
}

export interface WorkerStats {
  workerId: string;
  status: "idle" | "processing" | "error";
  currentJobId?: string;
  totalProcessed: number;
  totalFailed: number;
  totalRetried: number;
  uptime: number; // seconds
  cpuUsage?: number; // percent
  memoryUsage?: number; // MB
}
