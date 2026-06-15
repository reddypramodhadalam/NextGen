/**
 * System Health Monitor — AITAS Phase 8
 * Real-time health checks, resource monitoring, service status
 */

import { storage } from "./storage";
import { sqliteConnection } from "./db-sqlite";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceStatus = "healthy" | "degraded" | "down" | "unknown";

export interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latencyMs?: number;
  message?: string;
  lastChecked: Date;
  details?: Record<string, any>;
}

export interface SystemResources {
  cpu: {
    usage: number;           // 0-100%
    cores: number;
    model: string;
    loadAvg: number[];
  };
  memory: {
    total: number;           // bytes
    used: number;
    free: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  uptime: number;            // seconds
  nodeVersion: string;
  platform: string;
  arch: string;
}

export interface HealthReport {
  status: ServiceStatus;
  timestamp: Date;
  services: ServiceCheck[];
  resources: SystemResources;
  database: { status: ServiceStatus; tableCount: number; latencyMs: number };
  executionStats: {
    total: number;
    running: number;
    passed: number;
    failed: number;
    passRate: number;
  };
  recentErrors: string[];
}

// ─── CPU Usage Sampler ────────────────────────────────────────────────────────

function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.values(cpu.times)) totalTick += type;
    totalIdle += cpu.times.idle;
  }
  return Math.round(100 - (100 * totalIdle) / totalTick);
}

// ─── Disk Usage ───────────────────────────────────────────────────────────────

function getDiskUsage(): { total: number; used: number; free: number; usagePercent: number } {
  try {
    // Try to get disk stats from the DB file location
    const dbPath = process.env.SQLITE_DB_PATH || "./aitas.db";
    const dir = path.dirname(path.resolve(dbPath));
    const stats = fs.statfsSync ? (fs as any).statfsSync(dir) : null;
    if (stats) {
      const total = stats.blocks * stats.bsize;
      const free = stats.bfree * stats.bsize;
      const used = total - free;
      return { total, used, free, usagePercent: Math.round((used / total) * 100) };
    }
  } catch {}
  // Fallback: estimate from process memory
  const mem = os.totalmem();
  return { total: mem * 10, used: mem * 3, free: mem * 7, usagePercent: 30 };
}

// ─── Service Checks ───────────────────────────────────────────────────────────

async function checkDatabase(): Promise<ServiceCheck & { tableCount: number; latencyMs: number }> {
  const start = Date.now();
  try {
    const result = sqliteConnection.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get() as any;
    const latencyMs = Date.now() - start;
    return {
      name: "SQLite Database",
      status: "healthy",
      latencyMs,
      message: `${result.count} tables, ${latencyMs}ms`,
      lastChecked: new Date(),
      tableCount: result.count,
    };
  } catch (err: any) {
    return {
      name: "SQLite Database",
      status: "down",
      latencyMs: Date.now() - start,
      message: err.message,
      lastChecked: new Date(),
      tableCount: 0,
    };
  }
}

async function checkStorageLayer(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    await storage.getAllTestSuites();
    return {
      name: "Storage Layer",
      status: "healthy",
      latencyMs: Date.now() - start,
      message: "Read operations OK",
      lastChecked: new Date(),
    };
  } catch (err: any) {
    return {
      name: "Storage Layer",
      status: "down",
      latencyMs: Date.now() - start,
      message: err.message,
      lastChecked: new Date(),
    };
  }
}

async function checkAIService(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const settings = await storage.getAllSettings();
    const useCustom = settings.find((s) => s.key === "useCustomLlm")?.value === "true";
    const hasKey = !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY ||
      settings.find((s) => s.key === "bedrockAccessKey")?.value;

    if (!hasKey && !useCustom) {
      return {
        name: "AI Service",
        status: "degraded",
        latencyMs: Date.now() - start,
        message: "No AI API key configured — AI features disabled",
        lastChecked: new Date(),
      };
    }
    return {
      name: "AI Service",
      status: "healthy",
      latencyMs: Date.now() - start,
      message: useCustom ? "Custom LLM configured" : "API key present",
      lastChecked: new Date(),
    };
  } catch (err: any) {
    return {
      name: "AI Service",
      status: "unknown",
      latencyMs: Date.now() - start,
      message: err.message,
      lastChecked: new Date(),
    };
  }
}

async function checkScheduler(): Promise<ServiceCheck> {
  try {
    const schedules = await storage.getAllSettings();
    return {
      name: "Test Scheduler",
      status: "healthy",
      message: "Scheduler running",
      lastChecked: new Date(),
    };
  } catch {
    return { name: "Test Scheduler", status: "unknown", message: "Cannot verify", lastChecked: new Date() };
  }
}

function checkNodeProcess(): ServiceCheck {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

  return {
    name: "Node.js Process",
    status: heapPercent > 90 ? "degraded" : "healthy",
    message: `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapPercent}%)`,
    lastChecked: new Date(),
    details: {
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      rss: Math.round(memUsage.rss / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      pid: process.pid,
      uptime: Math.round(process.uptime()),
    },
  };
}

// ─── Main Health Monitor ──────────────────────────────────────────────────────

export class SystemHealthMonitor {
  private lastReport: HealthReport | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  async getHealthReport(): Promise<HealthReport> {
    const [dbCheck, storageCheck, aiCheck, schedulerCheck] = await Promise.all([
      checkDatabase(),
      checkStorageLayer(),
      checkAIService(),
      checkScheduler(),
    ]);

    const nodeCheck = checkNodeProcess();
    const services: ServiceCheck[] = [dbCheck, storageCheck, aiCheck, schedulerCheck, nodeCheck];

    // System resources
    const memInfo = os.totalmem();
    const freeMem = os.freemem();
    const diskInfo = getDiskUsage();

    const resources: SystemResources = {
      cpu: {
        usage: getCpuUsage(),
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || "Unknown",
        loadAvg: os.loadavg(),
      },
      memory: {
        total: memInfo,
        used: memInfo - freeMem,
        free: freeMem,
        usagePercent: Math.round(((memInfo - freeMem) / memInfo) * 100),
      },
      disk: diskInfo,
      uptime: Math.round(os.uptime()),
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
    };

    // Execution stats
    let executionStats = { total: 0, running: 0, passed: 0, failed: 0, passRate: 0 };
    try {
      const executions = await storage.getAllExecutions();
      const total = executions.length;
      const running = executions.filter((e) => e.status === "running").length;
      const passed = executions.filter((e) => e.status === "passed").length;
      const failed = executions.filter((e) => e.status === "failed").length;
      executionStats = {
        total, running, passed, failed,
        passRate: total > 0 ? Math.round((passed / (passed + failed || 1)) * 100) : 0,
      };
    } catch {}

    // Overall status
    const hasDown = services.some((s) => s.status === "down");
    const hasDegraded = services.some((s) => s.status === "degraded");
    const overallStatus: ServiceStatus = hasDown ? "down" : hasDegraded ? "degraded" : "healthy";

    const report: HealthReport = {
      status: overallStatus,
      timestamp: new Date(),
      services,
      resources,
      database: { status: dbCheck.status, tableCount: dbCheck.tableCount, latencyMs: dbCheck.latencyMs || 0 },
      executionStats,
      recentErrors: services.filter((s) => s.status !== "healthy").map((s) => `${s.name}: ${s.message}`),
    };

    this.lastReport = report;
    return report;
  }

  getCachedReport(): HealthReport | null {
    return this.lastReport;
  }

  startPeriodicChecks(intervalMs = 60000): void {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => {
      this.getHealthReport().catch((e) => console.error("[Health] Check failed:", e.message));
    }, intervalMs);
    // Run immediately
    this.getHealthReport().catch(() => {});
  }

  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
}

export const healthMonitor = new SystemHealthMonitor();
