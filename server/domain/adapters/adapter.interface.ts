/**
 * Adapter Interface
 * Unified contract for all execution adapters
 */

import { Keyword, KeywordExecutionResult, KeywordContext } from "../keyword-framework/keyword.types";

export type PlatformType = "web" | "api" | "mobile" | "sap" | "desktop";
export type ExecutionStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface AdapterCapability {
  keyword: string;
  supported: boolean;
  notes?: string;
}

export interface ExecutionContext extends KeywordContext {
  platform: PlatformType;
  targetUrl?: string;
  framework?: string;
  browser?: string;
  device?: string;
  testData?: Array<{ key: string; value: string; type: string }>;
  selfHealing?: boolean;
  maxRetries?: number;
}

export interface ExecutionStats {
  totalKeywords: number;
  successfulKeywords: number;
  failedKeywords: number;
  healedKeywords: number;
  totalDuration: number; // ms
  avgKeywordDuration: number; // ms
}

export abstract class BaseExecutionAdapter {
  abstract platform: PlatformType;
  abstract framework: string;

  /**
   * Initialize adapter (setup browser, connections, etc.)
   */
  abstract initialize(context: ExecutionContext): Promise<void>;

  /**
   * Execute a single keyword
   */
  abstract executeKeyword(keyword: Keyword, context: ExecutionContext): Promise<KeywordExecutionResult>;

  /**
   * Execute multiple keywords in sequence
   */
  async executeKeywordSequence(keywords: Keyword[], context: ExecutionContext): Promise<KeywordExecutionResult[]> {
    const results: KeywordExecutionResult[] = [];

    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      const startTime = Date.now();

      try {
        const result = await this.executeKeyword(keyword, context);
        result.duration = Date.now() - startTime;
        results.push(result);

        // Store in context for subsequent keywords
        context.previousResults.push(result);

        // Early exit on failure if no retry
        if (!result.success && context.maxRetries === 0) {
          break;
        }
      } catch (error: any) {
        results.push({
          keyword,
          success: false,
          duration: Date.now() - startTime,
          error: {
            message: error?.message || "Unknown error",
            code: "EXECUTION_ERROR",
            details: error,
          },
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * Cleanup (close browser, connections, etc.)
   */
  abstract cleanup(): Promise<void>;

  /**
   * Check if adapter is ready
   */
  abstract isReady(): Promise<boolean>;

  /**
   * Get adapter capabilities
   */
  abstract getCapabilities(): AdapterCapability[];

  /**
   * Get execution statistics
   */
  abstract getStats(): ExecutionStats;

  /**
   * Take screenshot
   */
  async takeScreenshot?(context: ExecutionContext): Promise<string>;

  /**
   * Get page source/response
   */
  async getPageSource?(context: ExecutionContext): Promise<string>;

  /**
   * Get current URL
   */
  async getCurrentUrl?(context: ExecutionContext): Promise<string>;

  /**
   * Get console logs
   */
  async getConsoleLogs?(context: ExecutionContext): Promise<Array<{ level: string; message: string }>>;
}

/**
 * Result of test execution
 */
export interface ExecutionResult {
  executionId: string;
  testCaseId: string;
  status: ExecutionStatus;
  keywords: KeywordExecutionResult[];
  stats: ExecutionStats;
  screenshots: string[];
  logs: string[];
  error?: {
    message: string;
    code: string;
    details?: any;
  };
  startedAt: Date;
  completedAt: Date;
  duration: number; // ms
}
