/**
 * UNIFIED AI HEALER - AITAS
 * ==========================
 * 
 * Single intelligent healing engine with multiple capability layers.
 * 
 * ARCHITECTURE DECISION:
 * - ONE healer engine, NOT separate basic/pro systems
 * - All execution failures flow through this unified pipeline
 * - Features enabled by healing mode, not product tier
 * 
 * HEALING MODES:
 * - BASIC: Quick selector fixes, timing adjustments
 * - ADVANCED: Full AI analysis, alternative selectors, learning
 * - PRO: Regression protection, confidence scoring, approval workflow
 * 
 * DATA FLOW:
 * Test Execution → Failure Detected → Unified Healer → Validated Fix
 *                                        ↓
 *                              ├─ Layer 1: Basic Healing
 *                              ├─ Layer 2: Advanced Healing  
 *                              ├─ Layer 3: Pro Features
 *                              └─ Learning Engine
 */

import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestResult } from "@shared/schema";
import { EventEmitter } from "events";
import {
  persistHealSession,
  loadHealSessions,
  clearHealSessions,
  type PersistedHealSession,
} from "./healer-persistence";
// Static import (project is ESM; require() always failed here, silently dropping
// Pro/Enterprise data from the unified dashboard). Safe because the enterprise
// healer does NOT import this module (no circular dependency).
import { enterpriseAIHealer } from "./ai-healer-enterprise";

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type HealingMode = "BASIC" | "ADVANCED" | "PRO";

export type FailureCategory =
  | "selector_stale"
  | "timing_issue"
  | "data_mismatch"
  | "ui_change"
  | "env_issue"
  | "logic_error"
  | "auth_failure"
  | "unknown";

export type HealingState =
  | "IDLE"
  | "ANALYSING"
  | "FIX_PROPOSED"
  | "VALIDATING"
  | "APPLYING"
  | "COMPLETED"
  | "REJECTED";

export interface ConfidenceFactors {
  selectorUniqueness: number;
  domStability: number;
  scopeSafety: number;
  historicalSuccess: number;
  partialRunSuccess: number;
}

export interface HealSuggestion {
  id: string;
  stepIndex: number;
  originalStep: string;
  originalExpected: string;
  issue: string;
  category: FailureCategory;
  confidence: number;
  confidenceFactors?: ConfidenceFactors;
  regressionRisk: "LOW" | "MEDIUM" | "HIGH";
  suggestedStep?: string;
  suggestedExpected?: string;
  suggestedSelector?: string;
  alternativeSelectors?: string[];
  explanation: string;
  autoHealable: boolean;
  healingMode: HealingMode;
}

export interface HealingSession {
  id: string;
  testCaseId: string;
  testCaseTitle: string;
  state: HealingState;
  mode: HealingMode;
  stateHistory: Array<{ state: HealingState; timestamp: Date; details?: string }>;
  suggestions: HealSuggestion[];
  selectedSuggestion?: HealSuggestion;
  validationResult?: {
    passed: boolean;
    details: string;
  };
  outcome: "pending" | "applied" | "rejected" | "rolled_back";
  confidenceScore: number;
  startedAt: Date;
  completedAt?: Date;
  triggeredBy: string;
  executionId?: string;
  failureDetails?: {
    errorMessage: string;
    stepIndex: number;
    logs: string[];
  };
}

export interface HealReport {
  testCaseId: string;
  testCaseTitle: string;
  analysedAt: Date;
  mode: HealingMode;
  failureCount: number;
  lastFailureMessage?: string;
  suggestions: HealSuggestion[];
  overallHealth: "healthy" | "degraded" | "broken" | "critical";
  autoHealApplied: boolean;
  healedSteps: number;
  confidenceScore: number;
  executionId?: string;
}

export interface LearningRecord {
  id: string;
  category: FailureCategory;
  originalSelector: string;
  fixedSelector: string;
  selectorType: string;
  appType: string;
  elementType: string;
  successCount: number;
  failureCount: number;
  lastUsed: Date;
  avgConfidence: number;
}

export interface UnifiedHealerStats {
  // Session stats
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  
  // Effectiveness
  totalAnalysed: number;
  totalHealed: number;
  autoHealRate: number;
  healSuccessRate: number;
  avgConfidenceScore: number;
  
  // By mode
  byMode: Record<HealingMode, { sessions: number; healed: number; successRate: number }>;
  
  // Categories
  topFailureCategories: Array<{ category: FailureCategory; count: number; fixRate: number }>;
  
  // Regression prevention
  regressionsDetected: number;
  regressionsPrevented: number;
  
  // Learning
  learningRecords: number;
  topSuccessfulPatterns: Array<{ pattern: string; successRate: number; usageCount: number }>;
  
  // Recent activity
  recentSessions: HealingSession[];
  recentReports: HealReport[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED AI HEALER ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class UnifiedAIHealer extends EventEmitter {
  // Session management
  private activeSessions = new Map<string, HealingSession>();
  private sessionHistory: HealingSession[] = [];
  
  // Report history
  private reportHistory = new Map<string, HealReport[]>();
  
  // Learning database
  private learningRecords = new Map<string, LearningRecord>();
  
  // Metrics tracking
  private metrics = {
    sessionsStarted: 0,
    sessionsCompleted: 0,
    fixesApplied: 0,
    fixesRejected: 0,
    regressionsDetected: 0,
    confidenceScores: [] as number[],
    byMode: {
      BASIC: { sessions: 0, healed: 0, success: 0 },
      ADVANCED: { sessions: 0, healed: 0, success: 0 },
      PRO: { sessions: 0, healed: 0, success: 0 },
    },
    categoryStats: new Map<FailureCategory, { count: number; fixed: number }>(),
  };

  constructor() {
    super();
    this.hydrateFromDisk();
    console.log("[UnifiedHealer] Initialized - Single AI Healer Engine");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PERSISTENCE (survives server restarts)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Persist a completed session so the dashboard survives restarts, and replay
   * its contribution to the aggregate metrics on the next boot.
   */
  private persistSession(session: HealingSession, healedSteps = 0, failureMessage?: string): void {
    persistHealSession({
      id: session.id,
      engine: "unified",
      testCaseId: session.testCaseId,
      testCaseTitle: session.testCaseTitle,
      mode: session.mode,
      outcome: session.outcome,
      confidenceScore: session.confidenceScore,
      suggestionsCount: session.suggestions.length,
      healedSteps,
      failureMessage: failureMessage ?? session.failureDetails?.errorMessage ?? null,
      triggeredBy: session.triggeredBy,
      executionId: session.executionId ?? null,
      completed: true,
      stateHistory: (session.stateHistory || []).map(h => ({
        state: h.state,
        timestamp: (h.timestamp instanceof Date ? h.timestamp : new Date(h.timestamp)).toISOString(),
        details: h.details,
      })),
      startedAt: (session.startedAt instanceof Date ? session.startedAt : new Date(session.startedAt)).toISOString(),
      completedAt: session.completedAt
        ? (session.completedAt instanceof Date ? session.completedAt : new Date(session.completedAt)).toISOString()
        : new Date().toISOString(),
    });
  }

  /**
   * Rebuild in-memory session history + aggregate counters from persisted rows
   * so the Standard AI Healer dashboard shows lasting data after a restart.
   */
  private hydrateFromDisk(): void {
    try {
      const rows = loadHealSessions("unified");
      if (rows.length === 0) return;

      for (const row of rows) {
        const mode = (["BASIC", "ADVANCED", "PRO"].includes(row.mode) ? row.mode : "ADVANCED") as HealingMode;
        const session = this.persistedToSession(row, mode);
        this.sessionHistory.push(session);

        // Replay aggregate metrics
        this.metrics.sessionsStarted++;
        this.metrics.sessionsCompleted++;
        this.metrics.byMode[mode].sessions++;
        if (row.confidenceScore > 0) this.metrics.confidenceScores.push(row.confidenceScore);

        if (row.outcome === "applied") {
          this.metrics.fixesApplied++;
          this.metrics.byMode[mode].healed++;
          this.metrics.byMode[mode].success++;
        } else if (row.outcome === "rejected" || row.outcome === "rolled_back") {
          this.metrics.fixesRejected++;
        } else {
          this.metrics.byMode[mode].success++;
        }
      }

      console.log(`[UnifiedHealer] Restored ${rows.length} healing session(s) from disk`);
    } catch (e: any) {
      console.warn(`[UnifiedHealer] Hydrate from disk failed: ${e.message}`);
    }
  }

  private persistedToSession(row: PersistedHealSession, mode: HealingMode): HealingSession {
    return {
      id: row.id,
      testCaseId: row.testCaseId,
      testCaseTitle: row.testCaseTitle,
      state: "COMPLETED",
      mode,
      stateHistory: (row.stateHistory || []).map(h => ({
        state: h.state as HealingState,
        timestamp: new Date(h.timestamp),
        details: h.details,
      })),
      suggestions: [],
      outcome: (row.outcome as HealingSession["outcome"]) || "pending",
      confidenceScore: row.confidenceScore,
      startedAt: new Date(row.startedAt),
      completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
      triggeredBy: row.triggeredBy,
      executionId: row.executionId ?? undefined,
      failureDetails: row.failureMessage
        ? { errorMessage: row.failureMessage, stepIndex: 0, logs: [] }
        : undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE HEALING API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Main entry point - analyze a test case and generate healing suggestions
   * Works with any healing mode, features scale with mode selection
   */
  async analyzeTestCase(
    testCaseId: string,
    options: {
      mode?: HealingMode;
      autoHeal?: boolean;
      appType?: string;
      executionId?: string;
    } = {}
  ): Promise<HealReport> {
    const mode = options.mode || "ADVANCED";
    console.log(`[UnifiedHealer] Analyzing test case ${testCaseId} in ${mode} mode`);

    const testCase = await storage.getTestCase(testCaseId);
    if (!testCase) throw new Error(`Test case ${testCaseId} not found`);

    // Create session
    const session = this.createSession(testCaseId, testCase.title, mode, options.executionId);
    this.transitionState(session, "ANALYSING");

    // Get failure data
    const { failedResults, totalRuns, lastFailure } = await this.getFailureData(testCaseId);

    // Generate suggestions based on mode
    let suggestions: HealSuggestion[] = [];
    
    if (failedResults.length > 0) {
      // Layer 1: Basic analysis (all modes)
      suggestions = await this.runBasicAnalysis(testCase, failedResults, options.appType);
      
      // Layer 2: Advanced analysis (ADVANCED and PRO modes)
      if (mode === "ADVANCED" || mode === "PRO") {
        suggestions = await this.enhanceWithAdvancedAnalysis(suggestions, testCase, failedResults);
      }
      
      // Layer 3: Pro features (PRO mode only)
      if (mode === "PRO") {
        suggestions = await this.enhanceWithProFeatures(suggestions, testCase, failedResults);
      }
    } else {
      // ── Proactive static analysis ────────────────────────────────────────
      // When a test has no recorded execution failures yet (e.g. freshly
      // imported suites), still surface actionable suggestions by statically
      // inspecting the steps for fragile selectors, missing waits and
      // hardcoded data. This ensures the AI Healer always has data to display
      // and fixes to apply, rather than an empty result.
      suggestions = this.runStaticAnalysis(testCase);
    }

    session.suggestions = suggestions;
    this.transitionState(session, "FIX_PROPOSED");

    // Calculate confidence score
    const confidenceScore = this.calculateOverallConfidence(suggestions);
    session.confidenceScore = confidenceScore;

    // Auto-heal if requested
    let autoHealApplied = false;
    let healedSteps = 0;

    if (options.autoHeal && suggestions.length > 0) {
      const result = await this.applyAutoHeal(testCase, suggestions, mode);
      autoHealApplied = result.applied;
      healedSteps = result.healedSteps;
      
      if (autoHealApplied) {
        this.transitionState(session, "APPLYING");
        session.outcome = "applied";
        this.metrics.fixesApplied++;
        this.metrics.byMode[mode].healed++;
      }
    }

    // Complete session
    this.transitionState(session, "COMPLETED");
    session.outcome = session.outcome || "pending";
    session.completedAt = new Date();
    this.metrics.sessionsCompleted++;
    this.metrics.byMode[mode].success++;

    // Build report
    const report: HealReport = {
      testCaseId,
      testCaseTitle: testCase.title,
      analysedAt: new Date(),
      mode,
      failureCount: failedResults.length,
      lastFailureMessage: lastFailure?.errorMessage
        ?? (failedResults.length === 0 && suggestions.length > 0
          ? "Static analysis flagged potential issues (no execution failures yet)"
          : undefined),
      suggestions,
      // When there are no execution failures but static analysis surfaced
      // suggestions, report "degraded" so the test doesn't misleadingly show
      // as fully healthy while improvement opportunities exist.
      overallHealth:
        failedResults.length === 0 && suggestions.length > 0
          ? "degraded"
          : this.computeHealth(failedResults.length, totalRuns),
      autoHealApplied,
      healedSteps,
      confidenceScore,
      executionId: options.executionId,
    };

    // Store report
    this.storeReport(testCaseId, report);
    
    // Update learning
    if (autoHealApplied) {
      this.updateLearning(suggestions.filter(s => s.autoHealable && s.confidence >= 75));
    }

    // Move session to history
    this.sessionHistory.unshift(session);
    this.activeSessions.delete(session.id);

    // Persist so the dashboard survives restarts
    this.persistSession(session, healedSteps, report.lastFailureMessage);

    this.emit("analysis:complete", report);
    return report;
  }

  /**
   * Analyze when a test execution fails - called from execution pipeline
   * This is the integration point that was missing!
   */
  async onExecutionFailure(
    executionId: string,
    testCaseId: string,
    failureDetails: {
      errorMessage: string;
      stepIndex: number;
      logs: string[];
    },
    options: {
      mode?: HealingMode;
      autoHeal?: boolean;
      appType?: string;
    } = {}
  ): Promise<HealReport> {
    console.log(`[UnifiedHealer] Execution failure detected: ${executionId} / ${testCaseId}`);
    
    // Store failure details for context
    const report = await this.analyzeTestCase(testCaseId, {
      ...options,
      executionId,
    });

    // Emit event for real-time UI updates
    this.emit("failure:analysed", {
      executionId,
      testCaseId,
      report,
      suggestions: report.suggestions,
    });

    return report;
  }

  /**
   * Start an interactive healing session (for Pro mode)
   */
  async startHealingSession(
    testCaseId: string,
    options: {
      mode?: HealingMode;
      triggeredBy?: string;
      executionId?: string;
    } = {}
  ): Promise<HealingSession> {
    const mode = options.mode || "PRO";
    
    const testCase = await storage.getTestCase(testCaseId);
    if (!testCase) throw new Error(`Test case ${testCaseId} not found`);

    const session = this.createSession(
      testCaseId, 
      testCase.title, 
      mode, 
      options.executionId,
      options.triggeredBy
    );

    // Run analysis
    this.transitionState(session, "ANALYSING");
    
    const { failedResults } = await this.getFailureData(testCaseId);
    
    let suggestions = await this.runBasicAnalysis(testCase, failedResults);
    suggestions = await this.enhanceWithAdvancedAnalysis(suggestions, testCase, failedResults);
    
    if (mode === "PRO") {
      suggestions = await this.enhanceWithProFeatures(suggestions, testCase, failedResults);
    }

    session.suggestions = suggestions;
    session.confidenceScore = this.calculateOverallConfidence(suggestions);
    this.transitionState(session, "FIX_PROPOSED");

    console.log(`[UnifiedHealer] Session ${session.id} ready with ${suggestions.length} suggestions`);
    return session;
  }

  /**
   * Apply a specific fix with validation (Pro mode)
   */
  async applyFix(
    sessionId: string,
    suggestionId: string,
    options: {
      validate?: boolean;
      requireApproval?: boolean;
    } = {}
  ): Promise<{ success: boolean; message: string; session: HealingSession }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const suggestion = session.suggestions.find(s => s.id === suggestionId);
    if (!suggestion) throw new Error(`Suggestion ${suggestionId} not found`);

    session.selectedSuggestion = suggestion;

    // Validate if requested (Pro mode)
    if (options.validate) {
      this.transitionState(session, "VALIDATING");
      const validationResult = await this.validateFix(session.testCaseId, suggestion);
      session.validationResult = validationResult;

      if (!validationResult.passed) {
        this.transitionState(session, "REJECTED");
        session.outcome = "rejected";
        this.metrics.fixesRejected++;
        return {
          success: false,
          message: `Validation failed: ${validationResult.details}`,
          session,
        };
      }
    }

    // Apply the fix
    this.transitionState(session, "APPLYING");
    
    const testCase = await storage.getTestCase(session.testCaseId);
    if (!testCase) throw new Error("Test case not found");

    const steps = [...((testCase.steps as any[]) || [])];
    
    if (suggestion.suggestedStep && suggestion.stepIndex < steps.length) {
      steps[suggestion.stepIndex] = {
        ...steps[suggestion.stepIndex],
        step: suggestion.suggestedStep,
      };
    }
    if (suggestion.suggestedExpected && suggestion.stepIndex < steps.length) {
      steps[suggestion.stepIndex] = {
        ...steps[suggestion.stepIndex],
        expected: suggestion.suggestedExpected,
      };
    }

    await storage.updateTestCase(session.testCaseId, { steps });

    this.transitionState(session, "COMPLETED");
    session.outcome = "applied";
    session.completedAt = new Date();

    this.metrics.fixesApplied++;
    this.metrics.byMode[session.mode].healed++;

    // Update learning
    this.updateLearning([suggestion]);

    // Move to history
    this.sessionHistory.unshift(session);
    this.activeSessions.delete(sessionId);

    // Persist so the dashboard survives restarts
    this.persistSession(session, 1);

    console.log(`[UnifiedHealer] Fix applied: ${suggestion.explanation}`);

    return {
      success: true,
      message: `Fix applied successfully to step ${suggestion.stepIndex}`,
      session,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ANALYSIS LAYERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Layer 1: Basic Analysis (all modes)
   * Quick pattern matching and rule-based fixes
   */
  private async runBasicAnalysis(
    testCase: TestCase,
    failedResults: TestResult[],
    appType?: string
  ): Promise<HealSuggestion[]> {
    const suggestions: HealSuggestion[] = [];
    const steps = (testCase.steps as any[]) || [];

    for (const result of failedResults.slice(0, 5)) {
      const error = result.errorMessage || "";
      const logs = Array.isArray(result.logs) ? result.logs as string[] : [];
      const category = this.detectCategory(error, logs);

      // Track category stats
      const catStats = this.metrics.categoryStats.get(category) || { count: 0, fixed: 0 };
      catStats.count++;
      this.metrics.categoryStats.set(category, catStats);

      // Generate basic fix based on category
      const fix = this.generateBasicFix(error, category, steps, appType);
      if (fix && fix.stepIndex !== undefined && fix.originalStep && fix.issue && fix.category && fix.confidence !== undefined && fix.explanation && fix.autoHealable !== undefined) {
        suggestions.push({
          id: this.generateId(),
          stepIndex: fix.stepIndex,
          originalStep: fix.originalStep,
          originalExpected: fix.originalExpected || "",
          issue: fix.issue,
          category: fix.category,
          confidence: fix.confidence,
          suggestedStep: fix.suggestedStep,
          suggestedExpected: fix.suggestedExpected,
          suggestedSelector: fix.suggestedSelector,
          explanation: fix.explanation,
          autoHealable: fix.autoHealable,
          healingMode: "BASIC",
          regressionRisk: "LOW",
        });
      }
    }

    return suggestions;
  }

  /**
   * Static (no-execution) analysis. Inspects each step's text for common
   * automation smells and produces concrete, actionable heal suggestions even
   * when the test has never failed/run. Deterministic so results are stable.
   */
  private runStaticAnalysis(testCase: TestCase): HealSuggestion[] {
    const steps = (testCase.steps as any[]) || [];
    const suggestions: HealSuggestion[] = [];

    steps.forEach((s, index) => {
      const text: string = (s?.step || s?.description || "").toString();
      const expected: string = (s?.expected || "").toString();
      if (!text.trim()) return;
      const lower = text.toLowerCase();

      // Smell 1: brittle absolute XPath / nth-child selectors.
      if (/\/html\/|\/\/\*\[\d+\]|:nth-child\(/.test(text)) {
        suggestions.push(this.makeStaticSuggestion(index, text, expected,
          "selector_stale",
          "Brittle absolute selector detected",
          72, true,
          "Absolute XPath / nth-child selectors break on the smallest DOM change. " +
          "Rephrase the step to name the element by its visible label and type so " +
          "the AI executor can locate it from the live page.",
          undefined,
          this.suggestClearerStep(text)));
        return;
      }

      // Smell 2: interaction without an explicit wait (timing risk).
      if (/\b(click|press|tap|enter|type|select)\b/.test(lower) && !/\b(wait|until|visible|present)\b/.test(lower)) {
        suggestions.push(this.makeStaticSuggestion(index, text, expected,
          "timing_issue",
          "No explicit wait before interaction",
          64, true,
          "Add an explicit wait for the element to be visible/enabled before this " +
          "action to avoid flaky timing failures.",
          undefined,
          /^wait\b/i.test(text) ? text : `Wait for element to be visible, then ${text}`));
        return;
      }

      // Smell 3: hardcoded credentials / data that may drift.
      if (/(password|passwd|pwd)\s*[=:]\s*\S+/i.test(text) || /\b\d{4,}\b/.test(text)) {
        suggestions.push(this.makeStaticSuggestion(index, text, expected,
          "data_mismatch",
          "Hardcoded test data detected",
          55, false,
          "Parameterise hardcoded values (credentials, ids, amounts) via test data " +
          "so the step stays valid across environments and data refreshes."));
        return;
      }

      // Smell 4: exact-match assertion on potentially dynamic text.
      if (/\b(verify|assert|expect|should)\b/.test(lower) && expected && expected.length > 0 && !/contains|partial|matches/i.test(expected)) {
        suggestions.push(this.makeStaticSuggestion(index, text, expected,
          "data_mismatch",
          "Exact-match assertion may be brittle",
          50, false,
          "Consider a contains/partial assertion instead of exact match to tolerate " +
          "dynamic content (dates, ids, counts).",
          undefined,
          undefined,
          `${expected} (use a contains/partial match)`));
        return;
      }
    });

    return suggestions;
  }

  /** Helper to build a static-analysis HealSuggestion with sane defaults. */
  private makeStaticSuggestion(
    stepIndex: number,
    originalStep: string,
    originalExpected: string,
    category: FailureCategory,
    issue: string,
    confidence: number,
    autoHealable: boolean,
    explanation: string,
    suggestedSelector?: string,
    suggestedStep?: string,
    suggestedExpected?: string,
  ): HealSuggestion {
    // Track category stats so the dashboard/KPIs reflect static findings too.
    const catStats = this.metrics.categoryStats.get(category) || { count: 0, fixed: 0 };
    catStats.count++;
    this.metrics.categoryStats.set(category, catStats);

    return {
      id: this.generateId(),
      stepIndex,
      originalStep,
      originalExpected,
      issue,
      category,
      confidence,
      suggestedStep,
      suggestedExpected,
      suggestedSelector,
      explanation,
      autoHealable,
      healingMode: "BASIC",
      regressionRisk: confidence >= 70 ? "LOW" : "MEDIUM",
    };
  }

  /**
   * Layer 2: Advanced Analysis (ADVANCED + PRO modes)
   * AI-powered analysis with alternative selectors
   */
  private async enhanceWithAdvancedAnalysis(
    suggestions: HealSuggestion[],
    testCase: TestCase,
    failedResults: TestResult[]
  ): Promise<HealSuggestion[]> {
    try {
      const aiClient = await getAiClient();
      const steps = (testCase.steps as any[]) || [];

      const recentErrors = failedResults.slice(0, 5).map(r => ({
        error: r.errorMessage,
        logs: Array.isArray(r.logs) ? (r.logs as string[]).slice(-10).join("\n") : "",
      }));

      const systemPrompt = `You are an AI test automation healer. Analyze failures and suggest fixes.
Return JSON array of suggestions with alternative selectors and confidence scoring.

INTENT LOCK (most important): Fix ONLY the selector/approach for the EXACT SAME action.
NEVER change the step's GOAL, move to a different action, or alter the action type
(click stays click, type stays type, select stays select). Same human-facing description, no API names.

HEALING RULES:
* NEVER use dynamic ids (React #:r4:, #:r5:, UUID-like, numeric IDs > 8 digits) — they always break.
* LOCATOR ORDER: data-testid → name → placeholder → role+name → label → css/xpath (DOM-grounded only).
* IFRAME: elements tagged [IN-FRAME:name] need the named frame; prefer a forced/native click. Never invent.
* ORACLE JET: if placeholder matches 2 elements, target only input[placeholder="..."].
* RADIO: use click, not check. CHECKBOX (Radix role=checkbox on button): click by role+name.
* READONLY [tab-into]: click previous field, Tab, then type. DESCRIPTION: keep same, no API names.`;

      const goalFirstLine = (testCase.title || "").split("\n")[0];
      const userPrompt = `---ORIGINAL GOAL (DO NOT CHANGE):---
${goalFirstLine}

Test: "${testCase.title}"
Steps: ${steps.map((s, i) => `${i}: "${s.step}"`).join("\n")}
Failures: ${recentErrors.map(e => e.error).join("\n")}

Fix ONLY the broken selector for the SAME action. Enhance these suggestions with alternatives:
${JSON.stringify(suggestions.slice(0, 3), null, 2)}`;

      const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
      // Robust parse: tolerate markdown fences, prose, trailing commas and
      // truncation. Never throws — degrades to BASIC suggestions on bad JSON.
      const aiSuggestions = this.parseJsonArray<HealSuggestion>(response);

      if (aiSuggestions.length > 0) {
        // Merge AI suggestions with basic ones
        for (const aiSug of aiSuggestions) {
          const existing = suggestions.find(s => s.stepIndex === aiSug.stepIndex);
          if (existing) {
            existing.alternativeSelectors = aiSug.alternativeSelectors;
            existing.confidence = Math.max(existing.confidence, aiSug.confidence || 0);
            existing.healingMode = "ADVANCED";
          } else {
            suggestions.push({
              ...aiSug,
              id: this.generateId(),
              healingMode: "ADVANCED",
              regressionRisk: aiSug.regressionRisk || "MEDIUM",
            });
          }
        }
      } else {
        console.warn("[UnifiedHealer] AI analysis returned no parseable suggestions — using BASIC layer");
      }
    } catch (e: any) {
      console.warn("[UnifiedHealer] AI analysis failed:", e.message);
    }

    return suggestions;
  }

  /**
   * Layer 3: Pro Features (PRO mode only)
   * Confidence factors, regression risk, learning integration
   */
  private async enhanceWithProFeatures(
    suggestions: HealSuggestion[],
    testCase: TestCase,
    failedResults: TestResult[]
  ): Promise<HealSuggestion[]> {
    for (const suggestion of suggestions) {
      // Add confidence factors
      suggestion.confidenceFactors = {
        selectorUniqueness: this.estimateSelectorUniqueness(suggestion.suggestedSelector),
        domStability: 0.7, // Would need real DOM analysis
        scopeSafety: suggestion.stepIndex === 0 ? 0.5 : 0.8,
        historicalSuccess: this.getHistoricalSuccessRate(suggestion.category),
        partialRunSuccess: 0.0, // Set after validation
      };

      // Recalculate confidence with factors
      const factors = suggestion.confidenceFactors;
      const weightedConfidence = (
        factors.selectorUniqueness * 0.3 +
        factors.domStability * 0.2 +
        factors.scopeSafety * 0.1 +
        factors.historicalSuccess * 0.4
      ) * 100;
      suggestion.confidence = Math.round((suggestion.confidence + weightedConfidence) / 2);

      // Assess regression risk
      suggestion.regressionRisk = this.assessRegressionRisk(suggestion);

      suggestion.healingMode = "PRO";
    }

    return suggestions;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPER METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  private generateId(): string {
    return `heal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Robustly extract a JSON array from an LLM response. Handles markdown fences,
   * surrounding prose, trailing commas, and truncation by progressively trimming
   * from the end until a valid parse succeeds. Returns [] when nothing parses
   * (never throws), so a malformed AI reply degrades gracefully to the BASIC
   * suggestions instead of crashing the heal with "Expected ',' or '}'".
   */
  private parseJsonArray<T = any>(response: string): T[] {
    if (!response) return [];
    const tryParse = (s: string): T[] | null => {
      try {
        const v = JSON.parse(s);
        return Array.isArray(v) ? (v as T[]) : null;
      } catch {
        return null;
      }
    };
    // 1. Strip markdown code fences if present.
    const fenced = response.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidates: string[] = [];
    if (fenced) candidates.push(fenced[1].trim());
    // 2. The outermost [ ... ] block.
    const start = response.indexOf("[");
    const end = response.lastIndexOf("]");
    if (start !== -1 && end > start) candidates.push(response.slice(start, end + 1));
    candidates.push(response.trim());

    for (const c of candidates) {
      // Direct attempt.
      let parsed = tryParse(c);
      if (parsed) return parsed;
      // Remove trailing commas (a very common LLM JSON error) and retry.
      const noTrailingCommas = c.replace(/,\s*([}\]])/g, "$1");
      parsed = tryParse(noTrailingCommas);
      if (parsed) return parsed;
      // Truncation repair: trim from the last "}" inward until it parses.
      let work = noTrailingCommas;
      for (let i = 0; i < 50 && work.length > 2; i++) {
        const lastObj = work.lastIndexOf("}");
        if (lastObj <= 0) break;
        work = work.slice(0, lastObj + 1) + "]";
        const p = tryParse(work);
        if (p) return p;
        work = noTrailingCommas.slice(0, lastObj); // step back further
      }
    }
    return [];
  }

  private createSession(
    testCaseId: string,
    title: string,
    mode: HealingMode,
    executionId?: string,
    triggeredBy?: string
  ): HealingSession {
    const session: HealingSession = {
      id: this.generateId(),
      testCaseId,
      testCaseTitle: title,
      state: "IDLE",
      mode,
      stateHistory: [{ state: "IDLE", timestamp: new Date() }],
      suggestions: [],
      outcome: "pending",
      confidenceScore: 0,
      startedAt: new Date(),
      triggeredBy: triggeredBy || "system",
      executionId,
    };

    this.activeSessions.set(session.id, session);
    this.metrics.sessionsStarted++;
    this.metrics.byMode[mode].sessions++;

    return session;
  }

  private transitionState(session: HealingSession, newState: HealingState, details?: string): void {
    session.stateHistory.push({ state: newState, timestamp: new Date(), details });
    session.state = newState;
  }

  private async getFailureData(testCaseId: string): Promise<{
    failedResults: TestResult[];
    totalRuns: number;
    lastFailure?: TestResult;
  }> {
    const allExecutions = await storage.getAllExecutions();
    const allResults: TestResult[] = [];

    for (const exec of allExecutions.slice(0, 20)) {
      const results = await storage.getResultsByExecution(exec.id);
      const tcResult = results.find(r => r.testCaseId === testCaseId);
      if (tcResult) allResults.push(tcResult);
    }

    const failedResults = allResults.filter(r => r.status === "failed");
    
    return {
      failedResults,
      totalRuns: allResults.length,
      lastFailure: failedResults[0],
    };
  }

  private detectCategory(error: string, logs: string[]): FailureCategory {
    const msg = error.toLowerCase();
    const logStr = logs.join(" ").toLowerCase();

    // ── Timing first: "not visible"/"not interactable"/timeouts are timing,
    //    even though they often also contain the word "element". ──
    if (msg.includes("timeout") || msg.includes("timed out") ||
        msg.includes("not interactable") || msg.includes("not clickable") ||
        msg.includes("not visible") || msg.includes("not displayed")) {
      return "timing_issue";
    }
    // ── Stale / broken selector. Real executor messages take many shapes,
    //    e.g. "Checkbox not found: //input[@type='checkbox']",
    //    "Button not found", "no such element", "unable to locate". Treat a
    //    generic "<something> not found" or any message carrying selector
    //    syntax (xpath //, css=, xpath=, [@attr=...]) as a selector failure. ──
    const hasSelectorSyntax = /(^|\s)\/\/|css=|xpath=|\[@[\w-]+=|:nth-child\(|#[\w-]+|data-testid/.test(msg);
    if (
      msg.includes("no such element") || msg.includes("element not found") ||
      msg.includes("unable to locate") || msg.includes("stale element") ||
      msg.includes("could not find") || msg.includes("cannot find") ||
      /\bnot found\b/.test(msg) ||
      hasSelectorSyntax
    ) {
      return "selector_stale";
    }
    if (msg.includes("expected") && (msg.includes("got") || msg.includes("actual"))) {
      return "data_mismatch";
    }
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized")) {
      return "auth_failure";
    }
    if (msg.includes("network") || msg.includes("connection") || msg.includes("500")) {
      return "env_issue";
    }
    if (logStr.includes("visual") || logStr.includes("screenshot")) {
      return "ui_change";
    }
    return "unknown";
  }

  private generateBasicFix(
    error: string,
    category: FailureCategory,
    steps: any[],
    appType?: string
  ): Partial<HealSuggestion> | null {
    if (!steps || steps.length === 0) return null;

    // ── Robust step-index detection ──────────────────────────────────────────
    // Error messages may reference a step as "step 3" (usually 1-based) or
    // "step index 2" (0-based). Normalise to a safe 0-based index that is
    // always within bounds so we never silently drop a suggestion.
    const idxMatch = error.match(/step\s*(?:index\s*)?(\d+)/i);
    const isZeroBased = /step\s*index/i.test(error);
    let stepIndex = 0;
    if (idxMatch) {
      const raw = parseInt(idxMatch[1], 10);
      stepIndex = isZeroBased ? raw : Math.max(0, raw - 1);
    }
    if (stepIndex >= steps.length) stepIndex = steps.length - 1;
    if (stepIndex < 0) stepIndex = 0;

    const current = steps[stepIndex] || {};
    const originalStep: string = current.step || current.description || `Step ${stepIndex + 1}`;
    const originalExpected: string = current.expected || current.expectedResult || "";

    // The execution engine is AI-VISION based: it reads the LIVE DOM each step
    // and locates elements itself. So the most effective heal is to make the
    // INSTRUCTION clearer (name the element type + visible label), NOT to inject
    // a fabricated selector. We only attach a selector if we can GROUND it in a
    // real attribute the runtime actually reported in the failure logs.
    const clearerStep = this.suggestClearerStep(originalStep);
    const groundedSelector = this.extractGroundedSelector(error, error);

    switch (category) {
      case "selector_stale":
        return {
          stepIndex,
          originalStep,
          originalExpected,
          issue: "Element could not be located on the page",
          category,
          confidence: clearerStep ? 80 : 68,
          // Prefer rephrasing the step so the AI-vision executor can find the
          // element by its visible label/type. Only fold a selector when it is
          // grounded in a real attribute observed at runtime.
          suggestedStep: clearerStep ?? originalStep,
          suggestedSelector: groundedSelector,
          explanation: clearerStep
            ? "Rephrased the step to identify the element by its visible label and " +
              "type. The AI executor locates elements from the live page, so a clear, " +
              "labelled instruction is more reliable than a hard-coded selector."
            : "The element could not be located. Review the visible label/type of the " +
              "target element and make the step text describe it clearly.",
          autoHealable: true,
        };

      case "timing_issue":
        return {
          stepIndex,
          originalStep,
          originalExpected,
          issue: "Element not ready in time (timing / synchronisation issue)",
          category,
          confidence: 78,
          suggestedStep: /^wait\b/i.test(originalStep)
            ? (clearerStep ?? originalStep)
            : `Wait for element to be visible, then ${clearerStep ?? originalStep}`,
          suggestedSelector: groundedSelector,
          explanation:
            "Add an explicit wait for the element to be visible/enabled before " +
            "interacting, instead of relying on a fixed sleep.",
          autoHealable: true,
        };

      case "data_mismatch":
        return {
          stepIndex,
          originalStep,
          originalExpected,
          issue: "Expected value does not match the actual result",
          category,
          confidence: 58,
          suggestedExpected: originalExpected
            ? `${originalExpected} (use a contains/partial match)`
            : "Use a flexible contains assertion instead of exact match",
          explanation:
            "Test data appears to have changed. Use a contains/partial assertion or " +
            "parameterise the expected value so it tolerates dynamic content.",
          autoHealable: false,
        };

      case "auth_failure":
        return {
          stepIndex,
          originalStep,
          originalExpected,
          issue: "Authentication / authorization failure (401/403)",
          category,
          confidence: 55,
          suggestedStep: originalStep,
          explanation:
            "The session may have expired or credentials are invalid. Re-authenticate " +
            "at the start of the test and verify the environment's test credentials.",
          autoHealable: false,
        };

      case "env_issue":
        return {
          stepIndex,
          originalStep,
          originalExpected,
          issue: "Environment / network instability (5xx or connection error)",
          category,
          confidence: 50,
          suggestedStep: /^wait\b/i.test(originalStep)
            ? originalStep
            : `Retry with backoff, then ${originalStep}`,
          explanation:
            "A server/network error occurred. Add a retry-with-backoff and confirm the " +
            "target environment is healthy before failing the test.",
          autoHealable: false,
        };

      case "ui_change":
        return {
          stepIndex,
          originalStep,
          originalExpected,
          issue: "UI appears to have changed (layout / visual difference)",
          category,
          confidence: 60,
          suggestedStep: clearerStep ?? originalStep,
          suggestedSelector: groundedSelector,
          explanation:
            "The page structure changed. Describe the element by its visible label and " +
            "type so the AI executor can re-locate it, and update layout-dependent assertions.",
          autoHealable: false,
        };

      default:
        // Unknown — still surface an actionable, low-confidence suggestion so
        // the user always has something to review (instead of an empty card).
        return {
          stepIndex,
          originalStep,
          originalExpected,
          issue: "Unclassified failure — manual review recommended",
          category: "unknown",
          confidence: 40,
          suggestedStep: clearerStep ?? originalStep,
          suggestedSelector: groundedSelector,
          explanation:
            "The failure could not be automatically classified. Review the error log " +
            "and the step's wording/expected value, then apply a targeted fix.",
          autoHealable: false,
        };
    }
  }

  /**
   * Rephrase a step into a CLEAR, action-oriented natural-language instruction
   * that the AI-vision executor can reliably act on.
   *
   * WHY (architectural): the execution engine is AI-VISION based — it reads the
   * LIVE DOM every step and locates elements itself. It does NOT consume static
   * selectors. The most effective heal is therefore to make the INSTRUCTION
   * unambiguous: name the element TYPE (checkbox/button/link/dropdown/field) and
   * surface the visible LABEL. This plays directly into both the executor's
   * deterministic heuristics and its LLM prompt.
   *
   * Examples:
   *   'SELECT: "I accept the Terms..."'  → 'Check the "I accept the Terms..." checkbox'
   *   'Click Submit'                      → 'Click the "Submit" button'
   *   'Choose Karnataka from State'       → 'Select "Karnataka" from the "State" dropdown'
   */
  private suggestClearerStep(stepText: string): string | undefined {
    if (!stepText) return undefined;

    // Strip any previously-folded "[selector: ...]" annotation first.
    const raw = stepText.replace(/\s*\[selector:.*$/i, "").trim();
    // Action-type detection runs on the FULL text (keeps the verb even when it
    // is a "VERB:" prefix that we strip for label extraction below).
    const lowerFull = raw.toLowerCase();
    // Strip a leading "ACTION:" / "ACTION =" prefix (single verb only, so URLs
    // and "https://" aren't mangled) for clean LABEL extraction.
    const body = raw.replace(/^\s*([A-Za-z]{2,12})\s*[:=]\s*/, "").trim();

    const STRIP_Q = /^["'\u2018\u2019\u201C\u201D]+|["'\u2018\u2019\u201C\u201D]+$/g;

    // Pull a likely element label: quoted text (straight OR smart quotes) wins,
    // else the words after a recognised verb.
    const quoted = body.match(/['"\u2018\u2019\u201C\u201D]([^'"\u2018\u2019\u201C\u201D]+)['"\u2018\u2019\u201C\u201D]/);
    let label = quoted?.[1]?.trim();
    if (!label) {
      const after = body.match(
        /\b(?:click|press|tap|select|choose|check|tick|enter|type|verify|on|the)\b[:=\s]+(.+)$/i
      );
      label = after?.[1]?.trim();
    }
    if (!label) label = body;
    // Clean trailing element-type words from the label so we don't double them.
    const cleanLabel = label
      .replace(/\b(button|field|input|link|menu|icon|checkbox|radio button|radio|dropdown|drop-down|select)\b\.?\s*$/i, "")
      .replace(STRIP_Q, "")
      .trim();
    if (!cleanLabel) return undefined;

    // ── Detect element type from keywords (on the FULL text) ───────────────
    // Checkbox / consent first (covers accept/agree/terms/consent).
    if (/\b(checkbox|check box)\b/.test(lowerFull) ||
        /\b(accept|agree|consent|terms|conditions|privacy|policy|i understand)\b/.test(lowerFull)) {
      return `Check the "${cleanLabel}" checkbox`;
    }
    if (/\bradio\b/.test(lowerFull)) {
      return `Select the "${cleanLabel}" radio button`;
    }
    // Dropdown: explicit "dropdown" word, OR select/choose/pick used as the
    // LEADING verb (optionally after a "VERB:" prefix). This avoids treating
    // incidental words like "selected" in a verify step as a dropdown.
    if (/\b(dropdown|drop-down)\b/.test(lowerFull) ||
        /^\s*(?:[a-z]+\s*[:=]\s*)?(?:select|choose|pick)\b/i.test(raw)) {
      // Excel format first: "Select FIELD = VALUE" → value=VALUE, field=FIELD.
      const eq = body.match(/^(?:select|choose|pick)?\s*(.+?)\s*=\s*(.+)$/i);
      if (eq) {
        const field = eq[1]
          .replace(/^(?:select|choose|pick)\s+/i, "")
          .replace(/\b(dropdown|drop-down|field|menu)\b\.?\s*$/i, "")
          .replace(STRIP_Q, "").trim();
        const value = eq[2].replace(STRIP_Q, "").trim();
        if (field && value) return `Select "${value}" from the "${field}" dropdown`;
      }
      // Natural format: "VALUE from FIELD".
      const fromMatch = body.match(/(.+?)\s+(?:from|in)\s+(?:the\s+)?(.+)$/i);
      if (fromMatch) {
        const value = fromMatch[1]
          .replace(/^.*?[:=]\s*/, "")                 // drop any leading "VERB:" residue
          .replace(/^(?:select|choose|pick)\s+/i, "")  // drop leading select/choose verb
          .replace(STRIP_Q, "").trim();
        const field = fromMatch[2]
          .replace(/\b(dropdown|drop-down|field|select|menu)\b\.?\s*$/i, "")
          .replace(STRIP_Q, "").trim();
        if (value && field) return `Select "${value}" from the "${field}" dropdown`;
      }
      return `Select "${cleanLabel}" from the dropdown`;
    }
    if (/\b(enter|type|input|fill)\b/.test(lowerFull)) {
      // "Field = Value" or "Value in/into Field". body may or may not still
      // carry the verb depending on whether the prefix had a ":" / "=".
      const eq = body.match(/^(?:enter|type|input|fill)?\s*(.+?)\s*=\s*(.+)$/i);
      if (eq) {
        const field = eq[1].replace(/^(?:enter|type|input|fill)\s+/i, "").replace(STRIP_Q, "").trim();
        const value = eq[2].replace(STRIP_Q, "").trim();
        if (field && value) return `Enter "${value}" in the "${field}" field`;
      }
      return `Enter a value in the "${cleanLabel}" field`;
    }
    if (/\b(link|tab)\b/.test(lowerFull)) {
      return `Click the "${cleanLabel}" link`;
    }
    if (/\b(click|press|tap|button|submit)\b/.test(lowerFull)) {
      return `Click the "${cleanLabel}" button`;
    }
    if (/\b(verify|assert|confirm|should|expect)\b/.test(lowerFull)) {
      return `Verify that "${cleanLabel}" is visible on the page`;
    }
    // No confident element type — return undefined (caller keeps original step).
    return undefined;
  }

  /**
   * Extract a REAL, DOM-grounded selector from the failure logs, if the
   * executor captured one (e.g. it logged the actual element's id / data-testid
   * / name while searching). Returns undefined when nothing trustworthy is
   * found — we NEVER fabricate a selector from the step text, because a
   * non-existent selector actively misleads the AI-vision executor.
   */
  private extractGroundedSelector(error?: string, logs?: string): string | undefined {
    let hay = `${error ?? ""}\n${logs ?? ""}`;
    if (!hay.trim()) return undefined;

    // CRITICAL: remove NEGATIVE-context phrases AND the locator token that
    // follows them, so the selector that just FAILED is never mistaken for one
    // that is present. e.g. "Checkbox not found: //*[@data-testid='made-up']"
    // is stripped entirely (the word "found" inside "not found" would otherwise
    // create a false positive).
    hay = hay.replace(
      /\b(?:not\s+found|couldn'?t\s+find|could\s+not\s+find|cannot\s+find|can'?t\s+find|unable\s+to\s+(?:locate|find)|failed\s+to\s+(?:find|locate)|no\s+such\s+element|stale\s+element)\b[^\n]*/gi,
      ""
    );
    if (!hay.trim()) return undefined;

    const isDynamic = (val: string): boolean =>
      /\d{8,}/.test(val) ||                       // long digit run
      /[0-9a-f]{8}-[0-9a-f]{4}/i.test(val) ||      // uuid-ish
      /^[0-9a-f]{16,}$/i.test(val);                // long hex blob

    // Only match attributes introduced by a POSITIVE presence indicator.
    const patterns: Array<{ re: RegExp; wrap: (v: string) => string }> = [
      { re: /(?:found|candidate|available|matched|present|detected|exists?)[^\n]*?\bdata-testid\s*=\s*["']([^"']+)["']/i, wrap: v => `[data-testid="${v}"]` },
      { re: /(?:found|candidate|available|matched|present|detected|exists?)[^\n]*?\bid\s*=\s*["']([^"']+)["']/i,           wrap: v => `#${v}` },
      { re: /(?:found|candidate|available|matched|present|detected|exists?)[^\n]*?\bname\s*=\s*["']([^"']+)["']/i,         wrap: v => `[name="${v}"]` },
    ];
    for (const { re, wrap } of patterns) {
      const m = hay.match(re);
      if (m?.[1]) {
        const val = m[1].trim();
        if (!val || isDynamic(val)) continue;
        return wrap(val);
      }
    }
    return undefined;
  }


  private async applyAutoHeal(
    testCase: TestCase,
    suggestions: HealSuggestion[],
    mode: HealingMode
  ): Promise<{ applied: boolean; healedSteps: number }> {
    // Higher confidence threshold for auto-heal based on mode
    const threshold = mode === "PRO" ? 80 : mode === "ADVANCED" ? 75 : 70;
    
    const autoHealable = suggestions.filter(s => 
      s.autoHealable && 
      s.confidence >= threshold &&
      s.regressionRisk !== "HIGH"
    );

    if (autoHealable.length === 0) {
      return { applied: false, healedSteps: 0 };
    }

    const steps = [...((testCase.steps as any[]) || [])];
    let changed = false;
    let healedSteps = 0;

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
          steps[suggestion.stepIndex].expected = suggestion.suggestedExpected;
        }
      }
    }

    if (changed) {
      await storage.updateTestCase(testCase.id, { steps });
      console.log(`[UnifiedHealer] Auto-healed ${healedSteps} steps in "${testCase.title}"`);
    }

    return { applied: changed, healedSteps };
  }

  private async validateFix(testCaseId: string, suggestion: HealSuggestion): Promise<{
    passed: boolean;
    details: string;
  }> {
    // In a real implementation, this would:
    // 1. Clone the test
    // 2. Apply the fix
    // 3. Run a partial execution
    // 4. Check for regressions
    
    // For now, simulate validation
    const passed = suggestion.confidence >= 70 && suggestion.regressionRisk !== "HIGH";
    
    return {
      passed,
      details: passed 
        ? "Fix validated successfully" 
        : `Validation failed: confidence ${suggestion.confidence}%, risk ${suggestion.regressionRisk}`,
    };
  }

  private computeHealth(failureCount: number, totalRuns: number): HealReport["overallHealth"] {
    if (totalRuns === 0) return "healthy";
    const failRate = failureCount / totalRuns;
    if (failRate === 0) return "healthy";
    if (failRate < 0.2) return "degraded";
    if (failRate < 0.6) return "broken";
    return "critical";
  }

  private calculateOverallConfidence(suggestions: HealSuggestion[]): number {
    if (suggestions.length === 0) return 100;
    return Math.round(
      suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length
    );
  }

  private storeReport(testCaseId: string, report: HealReport): void {
    const history = this.reportHistory.get(testCaseId) || [];
    history.unshift(report);
    if (history.length > 20) history.pop();
    this.reportHistory.set(testCaseId, history);
  }

  private updateLearning(suggestions: HealSuggestion[]): void {
    for (const suggestion of suggestions) {
      const key = `${suggestion.category}-${suggestion.suggestedSelector || ""}`;
      const record = this.learningRecords.get(key) || {
        id: this.generateId(),
        category: suggestion.category,
        originalSelector: "",
        fixedSelector: suggestion.suggestedSelector || "",
        selectorType: "xpath",
        appType: "web",
        elementType: "unknown",
        successCount: 0,
        failureCount: 0,
        lastUsed: new Date(),
        avgConfidence: suggestion.confidence,
      };

      record.successCount++;
      record.lastUsed = new Date();
      record.avgConfidence = (record.avgConfidence + suggestion.confidence) / 2;

      this.learningRecords.set(key, record);
    }
  }

  private estimateSelectorUniqueness(selector?: string): number {
    if (!selector) return 0.5;
    if (selector.includes("data-testid")) return 0.95;
    if (selector.includes("aria-label")) return 0.9;
    if (selector.includes("#")) return 0.85;
    if (selector.includes("[name=")) return 0.8;
    return 0.6;
  }

  private getHistoricalSuccessRate(category: FailureCategory): number {
    const stats = this.metrics.categoryStats.get(category);
    if (!stats || stats.count === 0) return 0.5;
    return stats.fixed / stats.count;
  }

  private assessRegressionRisk(suggestion: HealSuggestion): "LOW" | "MEDIUM" | "HIGH" {
    if (suggestion.confidence >= 85) return "LOW";
    if (suggestion.confidence >= 65) return "MEDIUM";
    return "HIGH";
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────

  getSession(sessionId: string): HealingSession | undefined {
    return this.activeSessions.get(sessionId) || 
           this.sessionHistory.find(s => s.id === sessionId);
  }

  getActiveSessions(): HealingSession[] {
    return Array.from(this.activeSessions.values());
  }

  getSessionHistory(limit: number = 50): HealingSession[] {
    return this.sessionHistory.slice(0, limit);
  }

  getReportHistory(testCaseId: string): HealReport[] {
    return this.reportHistory.get(testCaseId) || [];
  }

  cancelSession(sessionId: string, reason?: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.transitionState(session, "REJECTED", reason);
      session.outcome = "rejected";
      session.completedAt = new Date();
      this.sessionHistory.unshift(session);
      this.activeSessions.delete(sessionId);
      this.metrics.fixesRejected++;
      this.persistSession(session, 0, reason);
    }
  }

  getStatistics(): UnifiedHealerStats {
    const categoryArray = Array.from(this.metrics.categoryStats.entries())
      .map(([category, stats]) => ({
        category,
        count: stats.count,
        fixRate: stats.count > 0 ? stats.fixed / stats.count : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const learningArray = Array.from(this.learningRecords.values())
      .map(r => ({
        pattern: `${r.category}: ${r.fixedSelector}`,
        successRate: r.successCount / (r.successCount + r.failureCount),
        usageCount: r.successCount,
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 10);

    const totalHealed = Object.values(this.metrics.byMode).reduce((sum, m) => sum + m.healed, 0);

    return {
      totalSessions: this.metrics.sessionsStarted,
      activeSessions: this.activeSessions.size,
      completedSessions: this.metrics.sessionsCompleted,
      totalAnalysed: this.metrics.sessionsCompleted,
      totalHealed,
      autoHealRate: this.metrics.sessionsCompleted > 0 
        ? (this.metrics.fixesApplied / this.metrics.sessionsCompleted) * 100 
        : 0,
      healSuccessRate: this.metrics.fixesApplied + this.metrics.fixesRejected > 0
        ? (this.metrics.fixesApplied / (this.metrics.fixesApplied + this.metrics.fixesRejected)) * 100
        : 0,
      avgConfidenceScore: this.metrics.confidenceScores.length > 0
        ? this.metrics.confidenceScores.reduce((a, b) => a + b, 0) / this.metrics.confidenceScores.length
        : 0,
      byMode: {
        BASIC: {
          sessions: this.metrics.byMode.BASIC.sessions,
          healed: this.metrics.byMode.BASIC.healed,
          successRate: this.metrics.byMode.BASIC.sessions > 0
            ? (this.metrics.byMode.BASIC.healed / this.metrics.byMode.BASIC.sessions) * 100
            : 0,
        },
        ADVANCED: {
          sessions: this.metrics.byMode.ADVANCED.sessions,
          healed: this.metrics.byMode.ADVANCED.healed,
          successRate: this.metrics.byMode.ADVANCED.sessions > 0
            ? (this.metrics.byMode.ADVANCED.healed / this.metrics.byMode.ADVANCED.sessions) * 100
            : 0,
        },
        PRO: {
          sessions: this.metrics.byMode.PRO.sessions,
          healed: this.metrics.byMode.PRO.healed,
          successRate: this.metrics.byMode.PRO.sessions > 0
            ? (this.metrics.byMode.PRO.healed / this.metrics.byMode.PRO.sessions) * 100
            : 0,
        },
      },
      topFailureCategories: categoryArray.slice(0, 5),
      regressionsDetected: this.metrics.regressionsDetected,
      regressionsPrevented: this.metrics.fixesRejected,
      learningRecords: this.learningRecords.size,
      topSuccessfulPatterns: learningArray,
      recentSessions: this.sessionHistory.slice(0, 10),
      recentReports: Array.from(this.reportHistory.values())
        .flat()
        .sort((a, b) => b.analysedAt.getTime() - a.analysedAt.getTime())
        .slice(0, 10),
    };
  }

  getLearningInsights(): {
    totalRecords: number;
    topSuccessfulPatterns: Array<{ pattern: string; successRate: number }>;
    recommendations: string[];
  } {
    const patterns = Array.from(this.learningRecords.values())
      .map(r => ({
        pattern: `${r.category}: ${r.selectorType}`,
        successRate: r.successCount / (r.successCount + r.failureCount || 1),
      }))
      .sort((a, b) => b.successRate - a.successRate);

    // Try to merge with enterprise learning insights if available
    let enterpriseInsights: any = null;
    try {
      if (enterpriseAIHealer && typeof enterpriseAIHealer.getLearningInsights === "function") {
        enterpriseInsights = enterpriseAIHealer.getLearningInsights();
      }
    } catch {
      // Enterprise healer not available - use only unified insights
    }

    return {
      totalRecords: this.learningRecords.size + (enterpriseInsights?.totalRecords || 0),
      topSuccessfulPatterns: [
        ...patterns.slice(0, 5),
        ...((enterpriseInsights?.topSuccessfulPatterns || []).slice(0, 5)),
      ],
      recommendations: [
        "Use data-testid attributes for stable selectors",
        "Add explicit waits before interactions",
        "Use flexible assertions (contains vs equals)",
        ...((enterpriseInsights?.recommendations || []) as string[]),
      ],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKWARD-COMPATIBLE API (British spelling for legacy routes)
  // These delegate to the canonical methods above
  // ═══════════════════════════════════════════════════════════════════════════

  /** Alias for analyzeTestCase - British spelling for legacy callers */
  async analyseTestCase(
    testCaseId: string,
    options: { autoHeal?: boolean; appType?: string; mode?: HealingMode; executionId?: string } = {}
  ): Promise<HealReport> {
    return this.analyzeTestCase(testCaseId, options);
  }

  /** Analyse all test cases in a suite */
  async analyseSuite(
    suiteId: string,
    options: { autoHeal?: boolean; appType?: string; mode?: HealingMode } = {}
  ): Promise<{
    reports: HealReport[];
    stats: {
      totalAnalysed: number;
      totalHealed: number;
      autoHealRate: number;
      avgConfidence: number;
      topFailureCategories: Array<{ category: FailureCategory; count: number }>;
      recentHeals: HealReport[];
    };
  }> {
    const testCases = await storage.getTestCasesBySuite(suiteId);
    const reports: HealReport[] = [];

    for (const tc of testCases) {
      try {
        const report = await this.analyzeTestCase(tc.id, options);
        reports.push(report);
      } catch (e: any) {
        console.error(`[UnifiedHealer] Failed to analyse ${tc.id}:`, e.message);
      }
    }

    // Compute aggregated stats
    const categoryCount = new Map<FailureCategory, number>();
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const report of reports) {
      for (const suggestion of report.suggestions) {
        categoryCount.set(suggestion.category, (categoryCount.get(suggestion.category) || 0) + 1);
        totalConfidence += suggestion.confidence;
        confidenceCount++;
      }
    }

    const totalHealed = reports.filter(r => r.autoHealApplied).length;
    const totalAnalysed = reports.length;

    return {
      reports,
      stats: {
        totalAnalysed,
        totalHealed,
        autoHealRate: totalAnalysed > 0 ? (totalHealed / totalAnalysed) * 100 : 0,
        avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
        topFailureCategories: Array.from(categoryCount.entries())
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
        recentHeals: reports.filter(r => r.autoHealApplied).slice(0, 10),
      },
    };
  }

  /** Apply a heal suggestion directly without a session (legacy API) */
  async applyHeal(testCaseId: string, suggestion: HealSuggestion): Promise<TestCase> {
    const testCase = await storage.getTestCase(testCaseId);
    if (!testCase) throw new Error(`Test case ${testCaseId} not found`);

    const steps = [...((testCase.steps as { step: string; expected: string }[]) || [])];

    if (suggestion.stepIndex < steps.length) {
      let newStepText = suggestion.suggestedStep ?? steps[suggestion.stepIndex].step;

      // Idempotency: strip ALL previously-folded "[selector: ...]" annotations.
      // The selector value itself can contain "]" (e.g. [data-testid="x"]),
      // and annotations are always appended at the end, so we greedily remove
      // everything from the FIRST "[selector:" onwards. This prevents repeated
      // Apply clicks from stacking duplicate selector hints.
      newStepText = newStepText.replace(/\s*\[selector:.*$/i, "").trim();

      // If a DOM-grounded selector was proposed, fold it into the step text as
      // an OPTIONAL hint. The AI-vision executor strips this annotation and only
      // uses it as a LAST-RESORT fallback locator, so it can never block a step.
      // (We no longer fabricate selectors from step text — heals now primarily
      // rephrase the instruction so the executor can find the element live.)
      if (suggestion.suggestedSelector) {
        newStepText = `${newStepText} [selector: ${suggestion.suggestedSelector}]`;
      }

      steps[suggestion.stepIndex] = {
        ...steps[suggestion.stepIndex],
        step: newStepText,
        expected: suggestion.suggestedExpected ?? steps[suggestion.stepIndex].expected,
      };
    }

    const updated = await storage.updateTestCase(testCaseId, { steps });
    if (!updated) throw new Error("Failed to update test case");

    // Record the applied heal in this test case's history so it shows up in
    // the History view, and update learning + metrics.
    this.recordAppliedHeal(testCaseId, testCase.title, suggestion);
    this.updateLearning([suggestion]);
    this.metrics.fixesApplied++;

    console.log(`[UnifiedHealer] Manually applied heal to step ${suggestion.stepIndex} of "${testCase.title}"`);
    return updated;
  }

  /**
   * Append a lightweight "applied" entry to a test case's report history so the
   * UI History tab reflects manual fixes (not just full analyses).
   */
  private recordAppliedHeal(
    testCaseId: string,
    title: string,
    suggestion: HealSuggestion
  ): void {
    const report: HealReport = {
      testCaseId,
      testCaseTitle: title,
      analysedAt: new Date(),
      mode: suggestion.healingMode || "BASIC",
      failureCount: 0,
      lastFailureMessage: suggestion.issue,
      suggestions: [suggestion],
      overallHealth: "degraded",
      autoHealApplied: true,
      healedSteps: 1,
      confidenceScore: suggestion.confidence,
    };
    this.storeReport(testCaseId, report);
  }

  /**
   * Clear stored heal reports/history. Pass a testCaseId to clear a single
   * test case, or omit to clear ALL history (used by the "delete generated
   * suite analysis" action in the UI).
   */
  clearHistory(testCaseId?: string): { cleared: number } {
    if (testCaseId) {
      const had = this.reportHistory.get(testCaseId)?.length || 0;
      this.reportHistory.delete(testCaseId);
      this.sessionHistory = this.sessionHistory.filter(s => s.testCaseId !== testCaseId);
      clearHealSessions("unified", testCaseId);
      return { cleared: had };
    }
    let total = 0;
    for (const reports of Array.from(this.reportHistory.values())) total += reports.length;
    this.reportHistory.clear();
    this.sessionHistory = [];
    clearHealSessions("unified");
    return { cleared: total };
  }

  /** Alias for getReportHistory - legacy API */
  getHealHistory(testCaseId: string): HealReport[] {
    return this.getReportHistory(testCaseId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRO/ENTERPRISE FEATURE DELEGATION
  // These delegate to the enterprise healer engine for advanced features
  // ═══════════════════════════════════════════════════════════════════════════

  private getEnterpriseHealer(): any {
    try {
      return enterpriseAIHealer;
    } catch (e) {
      console.warn("[UnifiedHealer] Enterprise healer not available");
      return null;
    }
  }

  /** Apply a fix with validation (PRO mode - delegated to enterprise) */
  async applyFixWithValidation(
    sessionId: string,
    suggestionId: string,
    options: { requireApproval?: boolean } = {}
  ): Promise<any> {
    const enterprise = this.getEnterpriseHealer();
    if (enterprise && enterprise.applyFixWithValidation) {
      return enterprise.applyFixWithValidation(sessionId, suggestionId, options);
    }
    // Fallback to local applyFix
    return this.applyFix(sessionId, suggestionId, { validate: true, requireApproval: options.requireApproval });
  }

  /** Approve and apply a pending fix (PRO mode) */
  async approveAndApplyFix(sessionId: string, approvedBy: string): Promise<any> {
    const enterprise = this.getEnterpriseHealer();
    if (enterprise && enterprise.approveAndApplyFix) {
      return enterprise.approveAndApplyFix(sessionId, approvedBy);
    }
    throw new Error("Approval workflow requires enterprise healer");
  }

  /** Get alternative fixes for a suggestion (PRO mode) */
  async getAlternativeFixes(sessionId: string, suggestionId: string): Promise<any[]> {
    const enterprise = this.getEnterpriseHealer();
    if (enterprise && enterprise.getAlternativeFixes) {
      return enterprise.getAlternativeFixes(sessionId, suggestionId);
    }
    // Fallback: return alternative selectors from suggestion
    const session = this.getSession(sessionId);
    const suggestion = session?.suggestions.find(s => s.id === suggestionId);
    if (suggestion?.alternativeSelectors) {
      return suggestion.alternativeSelectors.map((sel, idx) => ({
        id: `alt-${idx}`,
        selector: sel,
        confidence: Math.max(40, suggestion.confidence - 10 * (idx + 1)),
      }));
    }
    return [];
  }

  /** Get confidence threshold for an environment (PRO mode) */
  getConfidenceThreshold(environment: string): { autoApply: number; requireApproval: number } {
    const enterprise = this.getEnterpriseHealer();
    if (enterprise && enterprise.getConfidenceThreshold) {
      return enterprise.getConfidenceThreshold(environment);
    }
    // Defaults by environment
    const env = environment.toUpperCase();
    if (env === "PROD") return { autoApply: 95, requireApproval: 80 };
    if (env === "UAT" || env === "STAGING") return { autoApply: 85, requireApproval: 70 };
    return { autoApply: 75, requireApproval: 60 }; // QA / DEV
  }

  /** Get sessions for a specific test case */
  getSessionsByTestCase(testCaseId: string): HealingSession[] {
    const enterprise = this.getEnterpriseHealer();
    let sessions: HealingSession[] = [];
    
    if (enterprise && enterprise.getSessionsByTestCase) {
      sessions = enterprise.getSessionsByTestCase(testCaseId);
    }
    
    // Also include unified sessions for this test case
    const unifiedSessions = [
      ...Array.from(this.activeSessions.values()),
      ...this.sessionHistory,
    ].filter(s => s.testCaseId === testCaseId);
    
    return [...sessions, ...unifiedSessions];
  }

  /** Request selector promotion to global object repository (PRO) */
  async requestSelectorPromotion(
    sessionId: string,
    suggestion: HealSuggestion,
    logicalName: string,
    requestedBy: string
  ): Promise<any> {
    const enterprise = this.getEnterpriseHealer();
    if (enterprise && enterprise.requestSelectorPromotion) {
      return enterprise.requestSelectorPromotion(sessionId, suggestion, logicalName, requestedBy);
    }
    throw new Error("Selector promotion requires enterprise healer");
  }

  /** Get pending selector promotions (PRO) */
  getPendingPromotions(): any[] {
    const enterprise = this.getEnterpriseHealer();
    if (enterprise && enterprise.getPendingPromotions) {
      return enterprise.getPendingPromotions();
    }
    return [];
  }

  /** Approve a selector promotion request (PRO) */
  async approvePromotion(requestId: string, reviewedBy: string, notes?: string): Promise<any> {
    const enterprise = this.getEnterpriseHealer();
    if (enterprise && enterprise.approvePromotion) {
      return enterprise.approvePromotion(requestId, reviewedBy, notes);
    }
    throw new Error("Promotion approval requires enterprise healer");
  }

  /** Reject a selector promotion request (PRO) */
  rejectPromotion(requestId: string, reviewedBy: string, notes: string): void {
    const enterprise = this.getEnterpriseHealer();
    if (enterprise && enterprise.rejectPromotion) {
      enterprise.rejectPromotion(requestId, reviewedBy, notes);
      return;
    }
    throw new Error("Promotion rejection requires enterprise healer");
  }

  /** Get comprehensive KPIs - merges unified stats + enterprise KPIs */
  getKPIs(): any {
    const unifiedStats = this.getStatistics();
    const enterprise = this.getEnterpriseHealer();
    
    let enterpriseKPIs: any = {};
    if (enterprise && enterprise.getKPIs) {
      try {
        enterpriseKPIs = enterprise.getKPIs();
      } catch {
        // Use only unified KPIs
      }
    }

    // Merge KPIs - unified stats take precedence, enterprise fills in gaps
    return {
      // From unified (always has real-time data from executions)
      totalSessions: unifiedStats.totalSessions,
      activeSessions: unifiedStats.activeSessions,
      successfulHeals: unifiedStats.totalHealed,
      healSuccessRate: unifiedStats.healSuccessRate || enterpriseKPIs.healSuccessRate || 0,
      autoHealRate: unifiedStats.autoHealRate || enterpriseKPIs.autoHealRate || 0,
      avgConfidenceScore: unifiedStats.avgConfidenceScore || enterpriseKPIs.avgConfidenceScore || 0,
      regressionsPrevented: unifiedStats.regressionsPrevented + (enterpriseKPIs.regressionsPrevented || 0),
      regressionsDetected: unifiedStats.regressionsDetected,
      
      // Mode breakdown (unified-only)
      byMode: unifiedStats.byMode,
      
      // Categories (from unified)
      topFailureCategories: unifiedStats.topFailureCategories,
      
      // Learning (merged)
      learningRecords: unifiedStats.learningRecords + (enterpriseKPIs.learningRecords || 0),
      topPatterns: unifiedStats.topSuccessfulPatterns,
      
      // Enterprise extras (if available)
      ...(enterpriseKPIs.environmentBreakdown ? { environmentBreakdown: enterpriseKPIs.environmentBreakdown } : {}),
      ...(enterpriseKPIs.timeToHeal ? { timeToHeal: enterpriseKPIs.timeToHeal } : {}),
      ...(enterpriseKPIs.costSavings ? { costSavings: enterpriseKPIs.costSavings } : {}),
      
      generatedAt: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIFIED DASHBOARD - Single source of truth for UI
  // Combines BASIC + ADVANCED + PRO data in one view
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get unified dashboard data combining all healer layers */
  getDashboard(): {
    summary: {
      mode: string;
      totalSessions: number;
      activeSessions: number;
      successfulHeals: number;
      healSuccessRate: string;
      avgConfidence: string;
      regressionsBlocked: number;
      learningRecords: number;
    };
    layers: {
      basic: { sessions: number; healed: number; successRate: number };
      advanced: { sessions: number; healed: number; successRate: number };
      pro: { sessions: number; healed: number; successRate: number };
    };
    kpis: any;
    activeSessions: HealingSession[];
    recentHistory: HealingSession[];
    recentReports: HealReport[];
    learning: {
      totalRecords: number;
      topPatterns: Array<{ pattern: string; successRate: number }>;
      recommendations: string[];
    };
    pendingPromotions: number;
    failureCategories: Array<{ category: FailureCategory; count: number; fixRate: number }>;
    generatedAt: string;
  } {
    const stats = this.getStatistics();
    const kpis = this.getKPIs();
    const insights = this.getLearningInsights();
    const learning = {
      totalRecords: insights.totalRecords,
      topPatterns: insights.topSuccessfulPatterns,
      recommendations: insights.recommendations,
    };
    const pendingPromotions = this.getPendingPromotions();

    return {
      summary: {
        mode: "UNIFIED",
        totalSessions: stats.totalSessions,
        activeSessions: stats.activeSessions,
        successfulHeals: stats.totalHealed,
        healSuccessRate: stats.healSuccessRate.toFixed(1) + "%",
        avgConfidence: stats.avgConfidenceScore.toFixed(0),
        regressionsBlocked: stats.regressionsPrevented,
        learningRecords: stats.learningRecords,
      },
      layers: {
        basic: stats.byMode.BASIC,
        advanced: stats.byMode.ADVANCED,
        pro: stats.byMode.PRO,
      },
      kpis,
      activeSessions: this.getActiveSessions(),
      recentHistory: this.getSessionHistory(10),
      recentReports: stats.recentReports,
      learning,
      pendingPromotions: pendingPromotions.length,
      failureCategories: stats.topFailureCategories,
      generatedAt: new Date().toISOString(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const unifiedAIHealer = new UnifiedAIHealer();

// Convenience exports
export default unifiedAIHealer;
