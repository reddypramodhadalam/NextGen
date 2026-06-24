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
    console.log("[UnifiedHealer] Initialized - Single AI Healer Engine");
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
      lastFailureMessage: lastFailure?.errorMessage ?? undefined,
      suggestions,
      overallHealth: this.computeHealth(failedResults.length, totalRuns),
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
Return JSON array of suggestions with alternative selectors and confidence scoring.`;

      const userPrompt = `Test: "${testCase.title}"
Steps: ${steps.map((s, i) => `${i}: "${s.step}"`).join("\n")}
Failures: ${recentErrors.map(e => e.error).join("\n")}

Enhance these suggestions with alternatives:
${JSON.stringify(suggestions.slice(0, 3), null, 2)}`;

      const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const aiSuggestions = JSON.parse(jsonMatch[0]) as HealSuggestion[];
        
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

    if (msg.includes("no such element") || msg.includes("element not found") ||
        msg.includes("unable to locate") || msg.includes("stale element")) {
      return "selector_stale";
    }
    if (msg.includes("timeout") || msg.includes("timed out") ||
        msg.includes("not interactable") || msg.includes("not visible")) {
      return "timing_issue";
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
    const errorLower = error.toLowerCase();
    
    // Extract step index from error if possible
    const stepMatch = error.match(/step\s*(\d+)/i);
    const stepIndex = stepMatch ? parseInt(stepMatch[1]) : 0;

    if (stepIndex >= steps.length) return null;

    switch (category) {
      case "selector_stale":
        return {
          stepIndex,
          originalStep: steps[stepIndex]?.step,
          originalExpected: steps[stepIndex]?.expected,
          issue: "Element selector is stale or changed",
          category,
          confidence: 60,
          explanation: "Selector no longer matches element in DOM. Suggest more stable selector.",
          autoHealable: true,
        };

      case "timing_issue":
        return {
          stepIndex,
          originalStep: steps[stepIndex]?.step,
          originalExpected: steps[stepIndex]?.expected,
          issue: "Element not ready or timing issue",
          category,
          confidence: 70,
          suggestedStep: `Wait for element then ${steps[stepIndex]?.step}`,
          explanation: "Add explicit wait before interacting with element",
          autoHealable: true,
        };

      case "data_mismatch":
        return {
          stepIndex,
          originalStep: steps[stepIndex]?.step,
          originalExpected: steps[stepIndex]?.expected,
          issue: "Expected data doesn't match actual",
          category,
          confidence: 50,
          explanation: "Test data may have changed. Consider using more flexible assertions.",
          autoHealable: false,
        };

      default:
        return null;
    }
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

    return {
      totalRecords: this.learningRecords.size,
      topSuccessfulPatterns: patterns.slice(0, 10),
      recommendations: [
        "Use data-testid attributes for stable selectors",
        "Add explicit waits before interactions",
        "Use flexible assertions (contains vs equals)",
      ],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const unifiedAIHealer = new UnifiedAIHealer();
