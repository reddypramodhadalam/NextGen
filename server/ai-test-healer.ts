/**
 * AI Test Healer — AITAS Phase 5
 * Automatically detects, diagnoses, and heals broken test cases
 * Analyzes failure patterns and suggests/applies fixes
 */

import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestResult } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FailureCategory =
  | "selector_stale"        // Element selector no longer works
  | "timing_issue"          // Race condition / element not ready
  | "data_mismatch"         // Test data changed
  | "ui_change"             // UI was redesigned
  | "env_issue"             // Environment/network problem
  | "logic_error"           // Test logic is wrong
  | "auth_failure"          // Authentication expired/changed
  | "unknown";

export interface HealSuggestion {
  stepIndex: number;
  originalStep: string;
  originalExpected: string;
  issue: string;
  category: FailureCategory;
  confidence: number;           // 0-100
  suggestedStep?: string;
  suggestedExpected?: string;
  suggestedSelector?: string;
  explanation: string;
  autoHealable: boolean;
}

export interface HealReport {
  testCaseId: string;
  testCaseTitle: string;
  analysedAt: Date;
  failureCount: number;
  lastFailureMessage?: string;
  suggestions: HealSuggestion[];
  overallHealth: "healthy" | "degraded" | "broken" | "critical";
  autoHealApplied: boolean;
  healedSteps: number;
}

export interface HealerStats {
  totalAnalysed: number;
  totalHealed: number;
  autoHealRate: number;
  topFailureCategories: Array<{ category: FailureCategory; count: number }>;
  recentHeals: HealReport[];
}

// ─── Failure Pattern Detector ─────────────────────────────────────────────────

function detectFailureCategory(errorMessage: string, logs: string[]): FailureCategory {
  const msg = (errorMessage || "").toLowerCase();
  const logStr = logs.join(" ").toLowerCase();

  if (msg.includes("no such element") || msg.includes("element not found") ||
      msg.includes("unable to locate") || msg.includes("stale element")) {
    return "selector_stale";
  }
  if (msg.includes("timeout") || msg.includes("timed out") ||
      msg.includes("element not visible") || msg.includes("not interactable")) {
    return "timing_issue";
  }
  if (msg.includes("expected") && (msg.includes("got") || msg.includes("actual"))) {
    return "data_mismatch";
  }
  if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") ||
      msg.includes("forbidden") || msg.includes("session expired")) {
    return "auth_failure";
  }
  if (msg.includes("network") || msg.includes("connection") || msg.includes("econnrefused") ||
      msg.includes("enotfound") || msg.includes("500") || msg.includes("503")) {
    return "env_issue";
  }
  if (logStr.includes("visual") || logStr.includes("screenshot") || logStr.includes("diff")) {
    return "ui_change";
  }
  return "unknown";
}

function computeHealthScore(failureCount: number, totalRuns: number): HealReport["overallHealth"] {
  if (totalRuns === 0) return "healthy";
  const failRate = failureCount / totalRuns;
  if (failRate === 0) return "healthy";
  if (failRate < 0.2) return "degraded";
  if (failRate < 0.6) return "broken";
  return "critical";
}

// ─── AI Healer ────────────────────────────────────────────────────────────────

async function analyzeWithAI(
  testCase: TestCase,
  failedResults: TestResult[],
  appType?: string
): Promise<HealSuggestion[]> {
  const aiClient = await getAiClient();

  const steps = (testCase.steps as { step: string; expected: string }[]) || [];
  const recentErrors = failedResults
    .slice(0, 5)
    .map((r) => ({
      error: r.errorMessage,
      logs: Array.isArray(r.logs) ? (r.logs as string[]).slice(-10).join("\n") : String(r.logs || ""),
    }));

  const systemPrompt = `You are an AI test automation healer. Analyze failing test cases and suggest fixes.

Return ONLY a JSON array of heal suggestions:
[{
  "stepIndex": 0,
  "originalStep": "original step text",
  "originalExpected": "original expected text",
  "issue": "brief issue description",
  "category": "selector_stale|timing_issue|data_mismatch|ui_change|env_issue|logic_error|auth_failure|unknown",
  "confidence": 85,
  "suggestedStep": "improved step text",
  "suggestedExpected": "improved expected text",
  "suggestedSelector": "better CSS/XPath selector if applicable",
  "explanation": "detailed explanation of what changed and why this fix works",
  "autoHealable": true
}]

HEALING RULES:
1. selector_stale: Suggest more stable selectors (data-testid, aria-label, text content)
2. timing_issue: Add explicit wait conditions, increase timeouts
3. data_mismatch: Make assertions more flexible (contains vs equals, regex)
4. ui_change: Update step to match new UI structure
5. auth_failure: Add re-authentication step before the failing step
6. env_issue: Add retry logic or environment check
7. autoHealable=true only if the fix is safe to apply automatically
8. confidence: 0-100 based on how certain you are about the fix
9. Only suggest fixes for steps that are actually failing
10. Consider the app type: ${appType || "web"} when suggesting selectors`;

  const userPrompt = `Test Case: "${testCase.title}"
App Type: ${appType || "web"}

Steps:
${steps.map((s, i) => `${i}: "${s.step}" → Expected: "${s.expected}"`).join("\n")}

Recent Failures (${recentErrors.length}):
${recentErrors.map((e, i) => `[${i + 1}] Error: ${e.error}\nLogs:\n${e.logs}`).join("\n\n")}

Analyze the failures and suggest healing actions.`;

  try {
    const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]) as HealSuggestion[];
      return suggestions.filter((s) => s.stepIndex >= 0 && s.stepIndex < steps.length);
    }
  } catch (e: any) {
    console.error("[Healer] AI analysis failed:", e.message);
  }
  return [];
}

// ─── Main AI Test Healer ──────────────────────────────────────────────────────

export class AITestHealer {
  private healHistory = new Map<string, HealReport[]>();

  /** Analyse a test case and generate heal suggestions */
  async analyseTestCase(
    testCaseId: string,
    options: { autoHeal?: boolean; appType?: string } = {}
  ): Promise<HealReport> {
    const testCase = await storage.getTestCase(testCaseId);
    if (!testCase) throw new Error(`Test case ${testCaseId} not found`);

    // Get all results for this test case
    const allExecutions = await storage.getAllExecutions();
    const allResults: TestResult[] = [];

    for (const exec of allExecutions.slice(0, 20)) {
      const results = await storage.getResultsByExecution(exec.id);
      const tcResult = results.find((r) => r.testCaseId === testCaseId);
      if (tcResult) allResults.push(tcResult);
    }

    const failedResults = allResults.filter((r) => r.status === "failed");
    const totalRuns = allResults.length;
    const failureCount = failedResults.length;

    const lastFailure = failedResults[0];
    const lastFailureMessage = lastFailure?.errorMessage || undefined;

    // Detect failure categories from recent errors
    const categories = failedResults.slice(0, 5).map((r) =>
      detectFailureCategory(r.errorMessage || "", Array.isArray(r.logs) ? r.logs as string[] : [])
    );

    // Get AI suggestions
    const suggestions = failureCount > 0
      ? await analyzeWithAI(testCase, failedResults, options.appType)
      : [];

    // Auto-heal if requested
    let autoHealApplied = false;
    let healedSteps = 0;

    if (options.autoHeal && suggestions.length > 0) {
      const autoHealable = suggestions.filter((s) => s.autoHealable && s.confidence >= 75);
      if (autoHealable.length > 0) {
        const steps = [...((testCase.steps as { step: string; expected: string }[]) || [])];
        let changed = false;

        for (const suggestion of autoHealable) {
          if (suggestion.stepIndex < steps.length) {
            if (suggestion.suggestedStep) {
              steps[suggestion.stepIndex] = {
                ...steps[suggestion.stepIndex],
                step: suggestion.suggestedStep,
              };
              changed = true;
              healedSteps++;
            }
            if (suggestion.suggestedExpected) {
              steps[suggestion.stepIndex] = {
                ...steps[suggestion.stepIndex],
                expected: suggestion.suggestedExpected,
              };
              changed = true;
            }
          }
        }

        if (changed) {
          await storage.updateTestCase(testCaseId, { steps });
          autoHealApplied = true;
          console.log(`[Healer] Auto-healed ${healedSteps} steps in "${testCase.title}"`);
        }
      }
    }

    const report: HealReport = {
      testCaseId,
      testCaseTitle: testCase.title,
      analysedAt: new Date(),
      failureCount,
      lastFailureMessage,
      suggestions,
      overallHealth: computeHealthScore(failureCount, totalRuns),
      autoHealApplied,
      healedSteps,
    };

    // Store in history
    const history = this.healHistory.get(testCaseId) || [];
    history.unshift(report);
    if (history.length > 10) history.pop();
    this.healHistory.set(testCaseId, history);

    return report;
  }

  /** Analyse all test cases in a suite */
  async analyseSuite(
    suiteId: string,
    options: { autoHeal?: boolean; appType?: string } = {}
  ): Promise<{ reports: HealReport[]; stats: HealerStats }> {
    const testCases = await storage.getTestCasesBySuite(suiteId);
    const reports: HealReport[] = [];

    for (const tc of testCases) {
      try {
        const report = await this.analyseTestCase(tc.id, options);
        reports.push(report);
      } catch (e: any) {
        console.error(`[Healer] Failed to analyse ${tc.id}:`, e.message);
      }
    }

    const stats = this.computeStats(reports);
    return { reports, stats };
  }

  /** Apply a specific heal suggestion manually */
  async applyHeal(testCaseId: string, suggestion: HealSuggestion): Promise<TestCase> {
    const testCase = await storage.getTestCase(testCaseId);
    if (!testCase) throw new Error(`Test case ${testCaseId} not found`);

    const steps = [...((testCase.steps as { step: string; expected: string }[]) || [])];

    if (suggestion.stepIndex < steps.length) {
      if (suggestion.suggestedStep) {
        steps[suggestion.stepIndex] = {
          ...steps[suggestion.stepIndex],
          step: suggestion.suggestedStep,
        };
      }
      if (suggestion.suggestedExpected) {
        steps[suggestion.stepIndex] = {
          ...steps[suggestion.stepIndex],
          expected: suggestion.suggestedExpected,
        };
      }
    }

    const updated = await storage.updateTestCase(testCaseId, { steps });
    if (!updated) throw new Error("Failed to update test case");

    console.log(`[Healer] Manually applied heal to step ${suggestion.stepIndex} of "${testCase.title}"`);
    return updated;
  }

  /** Get heal history for a test case */
  getHealHistory(testCaseId: string): HealReport[] {
    return this.healHistory.get(testCaseId) || [];
  }

  /** Compute aggregate stats */
  private computeStats(reports: HealReport[]): HealerStats {
    const categoryCount = new Map<FailureCategory, number>();

    for (const report of reports) {
      for (const suggestion of report.suggestions) {
        categoryCount.set(suggestion.category, (categoryCount.get(suggestion.category) || 0) + 1);
      }
    }

    const totalHealed = reports.filter((r) => r.autoHealApplied).length;
    const totalAnalysed = reports.length;

    return {
      totalAnalysed,
      totalHealed,
      autoHealRate: totalAnalysed > 0 ? (totalHealed / totalAnalysed) * 100 : 0,
      topFailureCategories: Array.from(categoryCount.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      recentHeals: reports.filter((r) => r.autoHealApplied).slice(0, 10),
    };
  }
}

export const aiTestHealer = new AITestHealer();
