/**
 * Visual Test Scheduler — AITAS Phase 3
 * Cron-based scheduling for automated test runs with full history tracking
 */

import { storage } from "./storage";
import { aiTestExecutor } from "./ai-test-executor";
import { sendExecutionNotifications } from "./notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScheduleFrequency =
  | "every_5min"
  | "every_15min"
  | "every_30min"
  | "hourly"
  | "every_2h"
  | "every_6h"
  | "every_12h"
  | "daily"
  | "weekly"
  | "weekdays"
  | "custom";

export interface ScheduleConfig {
  id: string;
  name: string;
  suiteId: string;
  targetUrl: string;
  framework: string;
  environment: string;
  frequency: ScheduleFrequency;
  customCron?: string;          // For "custom" frequency
  enabled: boolean;
  notifyOnFail: boolean;
  notifyOnPass: boolean;
  maxRetries: number;
  testData?: Array<{ key: string; value: string; type: string }>;
  lastRun?: Date;
  nextRun?: Date;
  lastStatus?: "passed" | "failed" | "running" | "pending";
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleRun {
  scheduleId: string;
  executionId: string;
  startedAt: Date;
  completedAt?: Date;
  status: "passed" | "failed" | "running";
  passedTests: number;
  failedTests: number;
  totalTests: number;
  duration?: number;
}

// ─── Frequency to milliseconds ────────────────────────────────────────────────

const FREQUENCY_MS: Record<ScheduleFrequency, number> = {
  every_5min:  5 * 60 * 1000,
  every_15min: 15 * 60 * 1000,
  every_30min: 30 * 60 * 1000,
  hourly:      60 * 60 * 1000,
  every_2h:    2 * 60 * 60 * 1000,
  every_6h:    6 * 60 * 60 * 1000,
  every_12h:   12 * 60 * 60 * 1000,
  daily:       24 * 60 * 60 * 1000,
  weekly:      7 * 24 * 60 * 60 * 1000,
  weekdays:    24 * 60 * 60 * 1000,   // checked daily, skips weekends
  custom:      60 * 60 * 1000,        // fallback
};

const FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  every_5min:  "Every 5 minutes",
  every_15min: "Every 15 minutes",
  every_30min: "Every 30 minutes",
  hourly:      "Every hour",
  every_2h:    "Every 2 hours",
  every_6h:    "Every 6 hours",
  every_12h:   "Every 12 hours",
  daily:       "Daily",
  weekly:      "Weekly",
  weekdays:    "Weekdays only",
  custom:      "Custom (cron)",
};

// ─── In-memory schedule store (persisted to platform_settings) ───────────────

class ScheduleStore {
  private schedules = new Map<string, ScheduleConfig>();
  private runs = new Map<string, ScheduleRun[]>();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const settings = await storage.getSettingsByCategory("schedules");
      for (const s of settings) {
        if (s.valueJson) {
          const config = s.valueJson as ScheduleConfig;
          this.schedules.set(config.id, config);
        }
      }
      this.loaded = true;
    } catch (e) {
      console.error("[Scheduler] Failed to load schedules:", e);
    }
  }

  async save(config: ScheduleConfig): Promise<void> {
    this.schedules.set(config.id, config);
    await storage.upsertSetting({
      category: "schedules",
      key: `schedule_${config.id}`,
      value: config.name,
      valueJson: config,
      description: `Schedule: ${config.name}`,
    });
  }

  async delete(id: string): Promise<void> {
    this.schedules.delete(id);
    const settings = await storage.getSettingsByCategory("schedules");
    const setting = settings.find((s) => s.key === `schedule_${id}`);
    if (setting) {
      // Mark as deleted by setting enabled=false and empty
      await storage.upsertSetting({
        category: "schedules_deleted",
        key: `deleted_${id}`,
        value: id,
      });
    }
  }

  getAll(): ScheduleConfig[] {
    return Array.from(this.schedules.values());
  }

  get(id: string): ScheduleConfig | undefined {
    return this.schedules.get(id);
  }

  addRun(run: ScheduleRun): void {
    const runs = this.runs.get(run.scheduleId) || [];
    runs.unshift(run); // newest first
    if (runs.length > 50) runs.pop(); // keep last 50
    this.runs.set(run.scheduleId, runs);
  }

  getRuns(scheduleId: string): ScheduleRun[] {
    return this.runs.get(scheduleId) || [];
  }
}

const scheduleStore = new ScheduleStore();

// ─── Scheduler Engine ─────────────────────────────────────────────────────────

class TestScheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private running = false;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await scheduleStore.load();
    const schedules = scheduleStore.getAll();

    for (const schedule of schedules) {
      if (schedule.enabled) {
        this.scheduleNext(schedule);
      }
    }

    console.log(`[Scheduler] Started with ${schedules.filter((s) => s.enabled).length} active schedules`);
  }

  stop(): void {
    this.running = false;
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    console.log("[Scheduler] Stopped");
  }

  private scheduleNext(config: ScheduleConfig): void {
    const existing = this.timers.get(config.id);
    if (existing) clearTimeout(existing);

    const now = Date.now();
    const intervalMs = FREQUENCY_MS[config.frequency] || FREQUENCY_MS.hourly;

    // Calculate next run time
    let nextRunMs = intervalMs;
    if (config.lastRun) {
      const lastRunMs = new Date(config.lastRun).getTime();
      const elapsed = now - lastRunMs;
      nextRunMs = Math.max(0, intervalMs - elapsed);
    }

    // Skip weekends for weekdays schedule
    if (config.frequency === "weekdays") {
      const nextDate = new Date(now + nextRunMs);
      const day = nextDate.getDay();
      if (day === 0) nextRunMs += 24 * 60 * 60 * 1000; // Sunday → Monday
      if (day === 6) nextRunMs += 2 * 24 * 60 * 60 * 1000; // Saturday → Monday
    }

    const timer = setTimeout(async () => {
      await this.runSchedule(config);
      // Re-schedule after completion
      const updated = scheduleStore.get(config.id);
      if (updated?.enabled) {
        this.scheduleNext(updated);
      }
    }, nextRunMs);

    this.timers.set(config.id, timer);

    // Update nextRun in store
    const updated = { ...config, nextRun: new Date(now + nextRunMs) };
    scheduleStore.save(updated).catch(() => {});
  }

  private async runSchedule(config: ScheduleConfig): Promise<void> {
    console.log(`[Scheduler] Running schedule: ${config.name}`);

    try {
      const testCases = await storage.getTestCasesBySuite(config.suiteId);
      if (testCases.length === 0) {
        console.log(`[Scheduler] No test cases for suite ${config.suiteId}`);
        return;
      }

      const execution = await storage.createExecution({
        suiteId: config.suiteId,
        targetUrl: config.targetUrl,
        framework: config.framework || "playwright",
        environment: config.environment || "staging",
        status: "pending",
        totalTests: testCases.length,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
      });

      const run: ScheduleRun = {
        scheduleId: config.id,
        executionId: execution.id,
        startedAt: new Date(),
        status: "running",
        passedTests: 0,
        failedTests: 0,
        totalTests: testCases.length,
      };
      scheduleStore.addRun(run);

      // Update lastRun
      const updatedConfig = {
        ...config,
        lastRun: new Date(),
        lastStatus: "running" as const,
      };
      await scheduleStore.save(updatedConfig);

      // Run tests
      await aiTestExecutor.runExecution(
        execution.id,
        testCases,
        config.targetUrl,
        config.framework || "playwright",
        config.testData,
        true,
        config.maxRetries || 2
      );

      // Get final execution state
      const finalExecution = await storage.getExecution(execution.id);
      const finalStatus = finalExecution?.status === "passed" ? "passed" : "failed";

      // Update run record
      run.completedAt = new Date();
      run.status = finalStatus;
      run.passedTests = finalExecution?.passedTests || 0;
      run.failedTests = finalExecution?.failedTests || 0;
      run.duration = run.completedAt.getTime() - run.startedAt.getTime();
      scheduleStore.addRun(run);

      // Update consecutive failures
      const consecutiveFailures = finalStatus === "failed"
        ? (config.consecutiveFailures || 0) + 1
        : 0;

      await scheduleStore.save({
        ...updatedConfig,
        lastStatus: finalStatus,
        consecutiveFailures,
      });

      // Send notifications
      const suite = await storage.getTestSuite(config.suiteId);
      if (
        (finalStatus === "failed" && config.notifyOnFail) ||
        (finalStatus === "passed" && config.notifyOnPass)
      ) {
        await sendExecutionNotifications({
          executionId: execution.id,
          suiteName: `[Scheduled] ${suite?.name || config.name}`,
          status: finalStatus,
          totalTests: testCases.length,
          passedTests: run.passedTests,
          failedTests: run.failedTests,
          duration: run.duration || 0,
          environment: config.environment,
          targetUrl: config.targetUrl,
        });
      }

      console.log(`[Scheduler] Schedule "${config.name}" completed: ${finalStatus} (${run.passedTests}/${testCases.length} passed)`);
    } catch (error: any) {
      console.error(`[Scheduler] Schedule "${config.name}" failed:`, error.message);
      await scheduleStore.save({
        ...config,
        lastRun: new Date(),
        lastStatus: "failed",
        consecutiveFailures: (config.consecutiveFailures || 0) + 1,
      });
    }
  }

  async addSchedule(config: Omit<ScheduleConfig, "id" | "createdAt" | "updatedAt" | "consecutiveFailures">): Promise<ScheduleConfig> {
    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    const full: ScheduleConfig = {
      ...config,
      id,
      consecutiveFailures: 0,
      createdAt: now,
      updatedAt: now,
    };

    await scheduleStore.save(full);

    if (full.enabled) {
      this.scheduleNext(full);
    }

    return full;
  }

  async updateSchedule(id: string, updates: Partial<ScheduleConfig>): Promise<ScheduleConfig | null> {
    const existing = scheduleStore.get(id);
    if (!existing) return null;

    const updated: ScheduleConfig = { ...existing, ...updates, id, updatedAt: new Date() };
    await scheduleStore.save(updated);

    // Re-schedule if enabled state changed or frequency changed
    if (updated.enabled) {
      this.scheduleNext(updated);
    } else {
      const timer = this.timers.get(id);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(id);
      }
    }

    return updated;
  }

  async deleteSchedule(id: string): Promise<void> {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    await scheduleStore.delete(id);
  }

  async runNow(id: string): Promise<string | null> {
    const config = scheduleStore.get(id);
    if (!config) return null;

    // Run immediately in background
    this.runSchedule(config).catch((e) =>
      console.error(`[Scheduler] Manual run failed for ${id}:`, e.message)
    );

    return config.id;
  }

  getAll(): ScheduleConfig[] {
    return scheduleStore.getAll();
  }

  get(id: string): ScheduleConfig | undefined {
    return scheduleStore.get(id);
  }

  getRuns(scheduleId: string): ScheduleRun[] {
    return scheduleStore.getRuns(scheduleId);
  }

  getFrequencyLabel(freq: ScheduleFrequency): string {
    return FREQUENCY_LABELS[freq] || freq;
  }

  getFrequencies(): Array<{ value: ScheduleFrequency; label: string }> {
    return Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({
      value: value as ScheduleFrequency,
      label,
    }));
  }
}

export const testScheduler = new TestScheduler();

// Auto-start scheduler when module loads
testScheduler.start().catch((e) => console.error("[Scheduler] Start failed:", e));
