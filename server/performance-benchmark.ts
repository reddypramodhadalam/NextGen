/**
 * Performance Benchmarking Engine — AITAS Phase 6
 * Load testing, Core Web Vitals, response time analysis, threshold alerting
 */

import { storage } from "./storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BenchmarkConfig {
  targetUrl: string;
  concurrentUsers?: number;       // Default 10
  requestsPerUser?: number;       // Default 10
  rampUpSeconds?: number;         // Default 5
  thinkTimeMs?: number;           // Pause between requests, default 500
  timeoutMs?: number;             // Per-request timeout, default 10000
  headers?: Record<string, string>;
  authToken?: string;
  scenarios?: BenchmarkScenario[];
  thresholds?: PerformanceThreshold[];
}

export interface BenchmarkScenario {
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: any;
  weight?: number;                // Relative frequency 1-10
}

export interface PerformanceThreshold {
  metric: "p50" | "p95" | "p99" | "avg" | "error_rate" | "throughput";
  operator: "lt" | "gt" | "lte" | "gte";
  value: number;
  unit?: "ms" | "%" | "rps";
}

export interface RequestSample {
  url: string;
  method: string;
  status: number;
  duration: number;
  size: number;
  timestamp: number;
  error?: string;
}

export interface BenchmarkResult {
  id: string;
  targetUrl: string;
  startedAt: Date;
  completedAt: Date;
  config: BenchmarkConfig;
  // Aggregate stats
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  // Timing percentiles (ms)
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  // Throughput
  requestsPerSecond: number;
  bytesPerSecond: number;
  totalBytes: number;
  // Threshold results
  thresholdResults: Array<{
    threshold: PerformanceThreshold;
    actual: number;
    passed: boolean;
  }>;
  // Samples (last 100)
  samples: RequestSample[];
  // Timeline (bucketed by second)
  timeline: Array<{
    second: number;
    requests: number;
    avgDuration: number;
    errors: number;
  }>;
  passed: boolean;
  summary: string;
}

// ─── Percentile Calculator ────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ─── Single Request Executor ──────────────────────────────────────────────────

async function executeRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: any,
  timeoutMs = 10000
): Promise<RequestSample> {
  const start = Date.now();
  const timestamp = start;

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (body && !["GET", "HEAD"].includes(method)) {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const res = await fetch(url, fetchOptions);
    const text = await res.text();
    const duration = Date.now() - start;

    return {
      url, method,
      status: res.status,
      duration,
      size: new TextEncoder().encode(text).length,
      timestamp,
    };
  } catch (err: any) {
    return {
      url, method,
      status: 0,
      duration: Date.now() - start,
      size: 0,
      timestamp,
      error: err.message,
    };
  }
}

// ─── Main Benchmark Engine ────────────────────────────────────────────────────

export class PerformanceBenchmarkEngine {
  private activeRuns = new Map<string, boolean>();

  async runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult> {
    const id = `bench_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date();
    this.activeRuns.set(id, true);

    const {
      targetUrl,
      concurrentUsers = 10,
      requestsPerUser = 10,
      rampUpSeconds = 5,
      thinkTimeMs = 500,
      timeoutMs = 10000,
      headers = {},
      authToken,
      scenarios = [],
      thresholds = [],
    } = config;

    const allHeaders: Record<string, string> = { ...headers };
    if (authToken) allHeaders["Authorization"] = `Bearer ${authToken}`;

    // Build scenario list
    const effectiveScenarios: BenchmarkScenario[] = scenarios.length > 0
      ? scenarios
      : [{ name: "Default GET", method: "GET", path: "", weight: 1 }];

    // Weighted scenario selector
    const totalWeight = effectiveScenarios.reduce((s, sc) => s + (sc.weight || 1), 0);
    const selectScenario = (): BenchmarkScenario => {
      let r = Math.random() * totalWeight;
      for (const sc of effectiveScenarios) {
        r -= (sc.weight || 1);
        if (r <= 0) return sc;
      }
      return effectiveScenarios[0];
    };

    const allSamples: RequestSample[] = [];
    const timelineMap = new Map<number, { requests: number; totalDuration: number; errors: number }>();

    // Ramp-up: stagger user starts
    const rampDelayMs = rampUpSeconds > 0 ? (rampUpSeconds * 1000) / concurrentUsers : 0;

    const userPromises = Array.from({ length: concurrentUsers }, async (_, userIdx) => {
      // Stagger start
      await new Promise((r) => setTimeout(r, userIdx * rampDelayMs));

      for (let req = 0; req < requestsPerUser; req++) {
        if (!this.activeRuns.get(id)) break;

        const scenario = selectScenario();
        const url = targetUrl.replace(/\/$/, "") + (scenario.path || "");
        const sample = await executeRequest(url, scenario.method, allHeaders, scenario.body, timeoutMs);
        allSamples.push(sample);

        // Bucket into timeline
        const second = Math.floor((sample.timestamp - startedAt.getTime()) / 1000);
        const bucket = timelineMap.get(second) || { requests: 0, totalDuration: 0, errors: 0 };
        bucket.requests++;
        bucket.totalDuration += sample.duration;
        if (sample.error || sample.status >= 400) bucket.errors++;
        timelineMap.set(second, bucket);

        if (thinkTimeMs > 0) await new Promise((r) => setTimeout(r, thinkTimeMs));
      }
    });

    await Promise.all(userPromises);
    this.activeRuns.delete(id);

    const completedAt = new Date();
    const totalDurationSec = (completedAt.getTime() - startedAt.getTime()) / 1000;

    // Compute stats
    const successful = allSamples.filter((s) => !s.error && s.status >= 200 && s.status < 400);
    const failed = allSamples.filter((s) => s.error || s.status >= 400);
    const durations = allSamples.map((s) => s.duration).sort((a, b) => a - b);
    const totalBytes = allSamples.reduce((s, r) => s + r.size, 0);

    const avgResponseTime = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const p50 = percentile(durations, 50);
    const p75 = percentile(durations, 75);
    const p95 = percentile(durations, 95);
    const p99 = percentile(durations, 99);
    const errorRate = allSamples.length > 0 ? (failed.length / allSamples.length) * 100 : 0;
    const rps = totalDurationSec > 0 ? allSamples.length / totalDurationSec : 0;
    const bps = totalDurationSec > 0 ? totalBytes / totalDurationSec : 0;

    // Evaluate thresholds
    const metricValues: Record<string, number> = {
      p50, p75, p95, p99, avg: avgResponseTime,
      error_rate: errorRate, throughput: rps,
    };

    const thresholdResults = thresholds.map((t) => {
      const actual = metricValues[t.metric] ?? 0;
      let passed = false;
      switch (t.operator) {
        case "lt":  passed = actual < t.value; break;
        case "lte": passed = actual <= t.value; break;
        case "gt":  passed = actual > t.value; break;
        case "gte": passed = actual >= t.value; break;
      }
      return { threshold: t, actual, passed };
    });

    const allThresholdsPassed = thresholdResults.every((r) => r.passed);
    const overallPassed = errorRate < 5 && allThresholdsPassed;

    // Build timeline
    const timeline = Array.from(timelineMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([second, bucket]) => ({
        second,
        requests: bucket.requests,
        avgDuration: bucket.requests > 0 ? Math.round(bucket.totalDuration / bucket.requests) : 0,
        errors: bucket.errors,
      }));

    const summary = [
      `${allSamples.length} requests in ${totalDurationSec.toFixed(1)}s`,
      `${rps.toFixed(1)} req/s`,
      `p95: ${p95}ms`,
      `errors: ${errorRate.toFixed(1)}%`,
      overallPassed ? "✓ PASSED" : "✗ FAILED",
    ].join(" | ");

    const result: BenchmarkResult = {
      id, targetUrl, startedAt, completedAt, config,
      totalRequests: allSamples.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      errorRate,
      avgResponseTime: Math.round(avgResponseTime),
      minResponseTime: durations[0] || 0,
      maxResponseTime: durations[durations.length - 1] || 0,
      p50, p75, p95, p99,
      requestsPerSecond: Math.round(rps * 10) / 10,
      bytesPerSecond: Math.round(bps),
      totalBytes,
      thresholdResults,
      samples: allSamples.slice(-100),
      timeline,
      passed: overallPassed,
      summary,
    };

    // Persist to performance_metrics
    try {
      const executions = await storage.getAllExecutions();
      const latestExec = executions[0];
      if (latestExec) {
        await storage.createPerformanceMetric({
          executionId: latestExec.id,
          url: targetUrl,
          pageLoadTime: Math.round(avgResponseTime),
          ttfb: p50,
          domLoadTime: p75,
          requestCount: allSamples.length,
          transferSize: totalBytes,
        });
      }
    } catch {}

    return result;
  }

  stopBenchmark(id: string): void {
    this.activeRuns.set(id, false);
  }

  /** Quick single-URL performance check */
  async quickCheck(url: string, samples = 5): Promise<{
    avg: number; p95: number; min: number; max: number; errorRate: number;
  }> {
    const results: RequestSample[] = [];
    for (let i = 0; i < samples; i++) {
      results.push(await executeRequest(url, "GET", {}, undefined, 10000));
      if (i < samples - 1) await new Promise((r) => setTimeout(r, 200));
    }
    const durations = results.map((r) => r.duration).sort((a, b) => a - b);
    const errors = results.filter((r) => r.error || r.status >= 400).length;
    return {
      avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      p95: percentile(durations, 95),
      min: durations[0],
      max: durations[durations.length - 1],
      errorRate: (errors / results.length) * 100,
    };
  }
}

export const performanceBenchmark = new PerformanceBenchmarkEngine();
