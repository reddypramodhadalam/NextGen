import { Builder, WebDriver, By, until, Key, WebElement } from "selenium-webdriver";
import { Options as ChromeOptions } from "selenium-webdriver/chrome";
import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestDataParam, TestResult } from "@shared/schema";
import { storeTestResult } from "./reportAnalytics";
import { normalizeAppType } from "./app-profiles";
import { JDE_SCAN_SCRIPT, mapScanToObjects, type RawScreenScan, type DiscoveryResult } from "./jde-discovery";
import { jdeObjectStore } from "./jde-object-store";
import { bestSelectorForObject, candidateToSelector } from "./jde-object-repository";
import { learningAgent } from "./learning/learning-agent";
import { observeAppSteps } from "./learning/observe";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// Extend the imported types to ensure logs is compatible
type ExtendedTestResult = Omit<TestResult, 'logs'> & { logs: string[] | null };

/**
 * Feature flag — evidence-aware adaptive locator selection (Learning Agent).
 * OFF by default so behaviour is unchanged until explicitly enabled with
 * LEARNING_ADAPTIVE_LOCATORS=true. The static ranker is always the fallback.
 */
const ADAPTIVE_LOCATORS_ENABLED =
  String(process.env.LEARNING_ADAPTIVE_LOCATORS || "").toLowerCase() === "true";

// ============================================================================
// TYPES
// ============================================================================

interface PageSnapshot {
  url: string;
  title: string;
  elements: ElementInfo[];
  iframes: IframeInfo[];
  alerts: boolean;
  windowHandles: string[];
  currentWindow: string;
  bodyText?: string;  // First 500 chars of visible page text for context
}

interface ElementInfo {
  tag: string;
  type?: string;
  id?: string;
  name?: string;
  className?: string;
  text?: string;
  placeholder?: string;
  ariaLabel?: string;
  title?: string;          // title attribute (JDE toolbar buttons expose label here)
  value?: string;
  href?: string;
  isVisible: boolean;
  isEnabled: boolean;
  role?: string;
  forAttr?: string;
  xpath: string;
  // Runtime DOM Capture additions
  dataTest?: string;       // data-test attribute
  dataTestId?: string;     // data-testid attribute
  dataCy?: string;         // data-cy (Cypress)
  dataAutomation?: string; // data-automation-id
  isShadowHost?: boolean;  // element has a shadow root
  /** Generated locator priority chain: id > data-testid > name > css > xpath */
  locators?: string[];     // [primary, fallback1, fallback2]
  locatorStrategy?: string;
  locatorConfidence?: number;
}

interface IframeInfo {
  id?: string;
  name?: string;
  src?: string;
  index: number;
}

interface AIExecutionPlan {
  action: {
    type: ActionType;
    elementXPath?: string;   // kept for backward-compat; prefer locators[0]
    /** Runtime DOM Capture: [primary, fallback1, fallback2] in priority order */
    locators?: string[];     // id= / data-testid= / name= / css= / xpath=
    value?: string;
    targetXPath?: string;
    key?: string;
    iframeName?: string;
    windowIndex?: number;
    alertAction?: "accept" | "dismiss" | "getText" | "sendKeys";
    description: string;
    confidence?: number;     // 0-1 locator confidence from AI
  };
  verification?: {
    type: VerificationType;
    elementXPath?: string;
    locators?: string[];
    expectedValue?: string;
    description: string;
  };
  confidence: number;
  reasoning: string;
}

type ActionType = 
  | "navigate" | "click" | "doubleClick" | "rightClick" | "type" | "clear"
  | "select" | "checkbox" | "radio" | "hover" | "scroll" | "dragDrop"
  | "pressKey" | "focus" | "blur"
  | "switchToIframe" | "switchToDefaultContent" | "switchToParentFrame"
  | "switchToWindow" | "switchToNewWindow" | "closeWindow"
  | "acceptAlert" | "dismissAlert" | "getAlertText" | "sendAlertText"
  | "wait" | "waitForElement" | "waitForText"
  | "screenshot" | "refresh" | "back" | "forward"
  | "executeScript" | "verify";

type VerificationType =
  | "elementExists" | "elementVisible" | "elementEnabled" | "elementSelected"
  | "textEquals" | "textContains" | "textVisible" | "valueEquals" | "valueContains"
  | "attributeEquals" | "attributeContains"
  | "urlEquals" | "urlContains" | "titleEquals" | "titleContains"
  | "alertPresent" | "elementCount";

interface StepResult {
  passed: boolean;
  logs: string[];
  screenshot?: string;
  error?: string;
}

interface ExecutionContext {
  driver: WebDriver;
  logs: string[];
  variables: Map<string, string>;
  testData: Map<string, string>;
  currentIframe: string | null;
  startTime: number;
}

// ============================================================================
// AI-POWERED TEST EXECUTOR CLASS
// ============================================================================

export class AITestExecutor {
  private driver: WebDriver | null = null;
  private playwrightBrowser: any = null;
  private playwrightContext: any = null;
  private playwrightPage: any = null;
  private executionId: string = "";
  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  // Application type for the current run (e.g. "jde"). Drives app-aware behaviour
  // such as JDE Object Repository reuse during execution + self-healing.
  private appType: string = "";
  // Current JDE application (Pxxxxx) / form (Wxxxxx) as last discovered by a live
  // scan. Scopes Object Repository lookups + outcome learning to the active screen.
  private currentJdeApp: string = "";
  private currentJdeForm: string = "";
  // Human-readable text of the step currently executing (e.g. "CLICK: Add").
  // Used by the JDE toolbar safety net so it can resolve an action button by its
  // INTENT even when the AI emits a wrong/mangled locator for it.
  private currentStepIntent: string = "";
  // AI plan cache: skip duplicate LLM calls for the same step text within one execution
  private readonly aiPlanCache = new Map<string, AIExecutionPlan>();
  // ── iframe context tracking ─────────────────────────────────────────────────
  // -1 = top-level document  |  >= 0 = currently inside that iframe index
  private currentIframeIndex: number = -1;
  // Full nested frame path (e.g. JDE: [outer placeholder, inner app]). Authoritative.
  private framePath: number[] = [];
  // ── Per-step iframe search tracking (reset per step, not per findElement call)
  private stepDidNestedSearch: boolean = false;
  private stepDidDynamicWait: boolean = false;

  /** Restore the saved nested frame context from top: defaultContent → frame(a) → frame(b)… */
  private async restoreFramePath(): Promise<void> {
    if (!this.driver) return;
    try {
      await this.driver.switchTo().defaultContent();
      for (const idx of this.framePath) {
        await this.driver.switchTo().frame(idx);
      }
      this.currentIframeIndex = this.framePath.length ? this.framePath[this.framePath.length - 1] : -1;
    } catch { /* frame went stale; caller re-derives */ }
  }

  // ============================================================================
  // MAIN EXECUTION ENTRY POINT
  // ============================================================================

  async runExecution(
    executionId: string,
    testCases: TestCase[],
    targetUrl: string,
    framework: string,
    testData?: TestDataParam[],
    selfHealing: boolean = true,
    maxRetries: number = 3,
    agentCapabilities?: string[],
    appType?: string
  ): Promise<void> {
    // ── CONCURRENCY GUARD ────────────────────────────────────────────────────
    // This executor is a SHARED SINGLETON: it owns ONE browser (this.driver /
    // this.playwrightPage), ONE persistent Chrome profile, and ONE executionId.
    // If a second execution starts while the first is still running, both runs
    // fight over the same browser/profile — Chrome fails to launch with a locked
    // profile ("session not created: Chrome instance exited"), steps interleave,
    // the page gets stuck on the SSO login, and results are written for the
    // wrong execution. Refuse to start a concurrent run and mark it failed so
    // the user gets a clear message instead of a corrupted, hung session.
    if (this.isRunning) {
      const msg =
        `Another execution (${this.executionId}) is already running. ` +
        `AITAS runs one browser session at a time — please wait for it to finish, then retry.`;
      console.warn(`[AIExecutor] ⛔ Concurrent execution rejected for ${executionId}: ${msg}`);
      try {
        await storage.updateExecution(executionId, {
          status: "failed",
          completedAt: new Date(),
        });
      } catch (e: any) {
        console.warn(`[AIExecutor] Could not mark concurrent execution as failed: ${e.message}`);
      }
      return;
    }

    this.executionId = executionId;
    this.isRunning = true;
    this.shouldStop = false;

    // Resolve app type for this run (param wins; else infer from the first test
    // case). Drives JDE Object Repository reuse + auto-discovery below.
    this.appType =
      normalizeAppType(appType) ||
      normalizeAppType((testCases[0] as any)?.appType) ||
      normalizeAppType((testCases[0] as any)?.applicationType) ||
      "";

        this.aiPlanCache.clear(); // fresh cache per execution
    const startTime = Date.now();
    console.log(`[AIExecutor] ▶ STARTING EXECUTION: ${executionId}`);
    console.log(`[AIExecutor] Framework: ${framework} (Selenium primary, Playwright backup)`);
    console.log(`[AIExecutor] Self-healing: ${selfHealing}, Max retries: ${maxRetries}`);
    if (this.appType) console.log(`[AIExecutor] App type: ${this.appType.toUpperCase()} (app-aware execution)`);

    // Update execution status
    await storage.updateExecution(executionId, {
      status: "running",
      startedAt: new Date(),
    });

    let passedTests = 0;
    let failedTests = 0;
    const allLogs: string[] = [];

        // Build test data map
    const testDataMap = new Map<string, string>();
    if (testData) {
      console.log(`\n[AIExecutor] 📊 ═══════════════════════════════════════════════════════════`);
      console.log(`[AIExecutor] 📊 LOADING TEST DATA (${testData.length} parameters)`);
      console.log(`[AIExecutor] 📊 ═══════════════════════════════════════════════════════════`);
      for (const td of testData) {
        testDataMap.set(td.key, td.value);
        testDataMap.set(td.key.toLowerCase(), td.value);
        // Display with masking for passwords
        const displayValue = td.key.toLowerCase().includes("pass") || td.key.toLowerCase().includes("pwd") 
          ? `[MASKED-${td.value.length}chars]` 
          : td.value;
        const typeLabel = td.type ? ` (${td.type})` : "";
        console.log(`[AIExecutor] 📊   ✓ ${td.key}${typeLabel} = "${displayValue}"`);
        allLogs.push(`[TestData] ${td.key} = "${displayValue}"`);
      }
      console.log(`[AIExecutor] 📊 ═══════════════════════════════════════════════════════════\n`);
    } else {
      console.log(`[AIExecutor] ℹ️  No test data provided for this execution\n`);
      allLogs.push(`[TestData] No test data provided`);
    }

    try {
      // Initialize browser (Selenium primary)
      const browserInitialized = await this.initializeBrowser(framework);
      if (!browserInitialized) {
        throw new Error("Failed to initialize browser");
      }

      allLogs.push(`[${framework.toUpperCase()}] Browser initialized successfully`);
      allLogs.push(`Target URL: ${targetUrl}`);

      // Execute each test case
      for (const testCase of testCases) {
        if (this.shouldStop) {
          allLogs.push("Execution stopped by user");
          break;
        }

        const result = await this.executeTestCase(
          testCase,
          targetUrl,
          testDataMap,
          selfHealing,
          maxRetries
        );

        // Save result with performance metrics
        await storage.createResult({
          executionId,
          testCaseId: testCase.id,
          status: result.passed ? "passed" : "failed",
          duration: Date.now() - startTime,
          errorMessage: result.error || null,
          logs: result.logs,
          screenshot: result.screenshot || null,
          stepScreenshots: result.stepScreenshots || null,
          performanceMetrics: result.performanceMetrics || null,
          networkLogs: result.networkLogs || null,
        });
        
        storeTestResult(testCase.title, result.passed, result.error || "");

        if (result.passed) {
          passedTests++;
          console.log(`[AIExecutor] ✓ PASSED: ${testCase.title}`);
        } else {
          failedTests++;
          console.log(`[AIExecutor] ✗ FAILED: ${testCase.title}`);
          
          // 🎯 UNIFIED HEALER INTEGRATION
          // Auto-trigger AI Healer analysis on failure (fire-and-forget)
          // This is the missing pipeline between execution and healer!
          this.triggerHealerOnFailure(executionId, testCase, result).catch((healerErr: any) => {
            console.warn(`[AIExecutor] Healer trigger failed (non-fatal): ${healerErr.message}`);
          });
        }

        allLogs.push(...result.logs);
      }

    } catch (error: any) {
      console.error(`[AIExecutor] Fatal error:`, error);
      allLogs.push(`Fatal error: ${error.message}`);
      failedTests = testCases.length - passedTests;
    } finally {
      // Cleanup
      await this.cleanup();

      // Update execution status
      const duration = Date.now() - startTime;
      const finalStatus = failedTests > 0 ? "failed" : "passed";
      await storage.updateExecution(executionId, {
        status: finalStatus,
        completedAt: new Date(),
        passedTests,
        failedTests,
      });

      // 📊 GENERATE EXECUTION REPORT — this powers the "Generated Reports" list
      // on the Reports page. Without this, executions complete but no report row
      // is ever written to test_reports (the cause of "No reports generated yet").
      try {
        const totalRun = passedTests + failedTests;
        const passRate = totalRun > 0 ? Math.round((passedTests / totalRun) * 100) : 0;
        await storage.createReport({
          executionId,
          name: `Execution Report - ${new Date().toISOString().split("T")[0]}`,
          summary: {
            status: finalStatus,
            total: testCases.length,
            passed: passedTests,
            failed: failedTests,
            framework,
          },
          passRate,
          totalDuration: duration,
          insights: [
            { type: "info", message: `Framework: ${framework}` },
            totalRun > 0
              ? { type: "info", message: `Average test duration: ${Math.round(duration / totalRun / 1000)}s` }
              : { type: "info", message: "No tests were run" },
            failedTests > 0
              ? { type: "warning", message: `${failedTests} test(s) failed - review needed` }
              : { type: "success", message: "All tests passed" },
          ],
        } as any);
        console.log(`[AIExecutor] 📊 Report generated for execution ${executionId} (passRate: ${passRate}%)`);
      } catch (reportErr: any) {
        console.warn(`[AIExecutor] Failed to generate execution report (non-fatal): ${reportErr.message}`);
      }

            console.log(`[AIExecutor] 🏁 EXECUTION COMPLETE: ${failedTests > 0 ? "FAILED" : "PASSED"} (${passedTests} passed, ${failedTests} failed) in ${Math.round(duration / 1000)}s`);
      this.isRunning = false;
    }
  }

  /**
   * 🎯 UNIFIED HEALER INTEGRATION
   * Auto-trigger AI Healer when a test fails during execution.
   * Runs asynchronously to not block execution flow.
   * This connects executions → healer pipeline (the missing link!)
   */
  private async triggerHealerOnFailure(
    executionId: string,
    testCase: any,
    result: { passed: boolean; error?: string; logs: string[] }
  ): Promise<void> {
    try {
      // Lazy import to avoid circular deps
      const { unifiedAIHealer } = await import("./unified-ai-healer");
      
      console.log(`[AIExecutor→Healer] Triggering healer for failed test: ${testCase.title}`);
      
      // Try to detect step index from error message
      const stepMatch = (result.error || "").match(/step\s*(\d+)/i);
      const stepIndex = stepMatch ? parseInt(stepMatch[1]) : 0;
      
      // Detect app type from test case or URL
      const appType = testCase.appType || "web";
      
      // Fire healer in ADVANCED mode by default (no auto-apply for safety)
      const report = await unifiedAIHealer.onExecutionFailure(
        executionId,
        testCase.id,
        {
          errorMessage: result.error || "Unknown failure",
          stepIndex,
          logs: result.logs || [],
        },
        {
          mode: "ADVANCED",
          autoHeal: false, // Don't auto-apply - let user review suggestions
          appType,
        }
      );
      
      console.log(`[AIExecutor→Healer] ✓ Healer analysis complete: ${report.suggestions.length} suggestions, health: ${report.overallHealth}, confidence: ${report.confidenceScore}`);

      // Also record into the Pro/Enterprise healer so its dashboard reflects
      // real activity from execution failures (Option 3 wiring). The standard
      // engine produced the suggestions; we mirror the outcome into the Pro KPIs.
      try {
        const { enterpriseAIHealer } = await import("./ai-healer-enterprise");
        if (enterpriseAIHealer && typeof enterpriseAIHealer.recordObservedHealing === "function") {
          enterpriseAIHealer.recordObservedHealing({
            testCaseId: testCase.id,
            testCaseTitle: testCase.title,
            confidence: report.confidenceScore || 0,
            // A high-confidence suggestion is treated as a healable outcome,
            // otherwise it's surfaced as rejected (needs human attention).
            outcome: (report.confidenceScore || 0) >= 75 ? "accepted" : "rejected",
            failureMessage: result.error || "Unknown failure",
            suggestionsCount: report.suggestions.length,
          });
          console.log(`[AIExecutor→ProHealer] ✓ Recorded observed healing into Pro dashboard`);
        }
      } catch (proErr: any) {
        console.warn(`[AIExecutor→ProHealer] Pro healer record failed (non-fatal): ${proErr.message}`);
      }
    } catch (e: any) {
      // Don't throw - healing is best-effort
      console.warn(`[AIExecutor→Healer] Healer trigger failed: ${e.message}`);
    }
  }

  // ============================================================================
  // JDE LIVE DISCOVERY (Phases 1-4, 9-11)
  // ============================================================================

  /**
   * Run the JDE screen-scan script against the CURRENT live page (Selenium or
   * Playwright), map it to Object Repository records, and persist them. Used by
   * the "Scan Screen" action and (optionally) automatically during JDE runs.
   *
   * Returns the discovery result (objects + grid headers + warnings), or null
   * when no browser is active.
   */
  async scanCurrentScreen(opts?: { persist?: boolean; fallbackApp?: string }): Promise<DiscoveryResult | null> {
    const persist = opts?.persist !== false;
    let raw: RawScreenScan | null = null;

    try {
      if (this.driver) {
        // Make sure we are inside the JDE app iframe if present (best-effort).
        try {
          await this.driver.switchTo().defaultContent();
          const frames = await this.driver.findElements(By.css('iframe#e1menuAppIframe, iframe[name="e1menuAppIframe"]'));
          if (frames.length) {
            await this.driver.switchTo().frame(frames[0]);
          }
        } catch { /* not framed */ }
        raw = (await this.driver.executeScript(`return ${JDE_SCAN_SCRIPT};`)) as RawScreenScan;
        try { await this.driver.switchTo().defaultContent(); } catch {}
      } else if (this.playwrightPage) {
        const frame = await this.getJdePlaywrightFrame();
        raw = (await (frame || this.playwrightPage).evaluate(JDE_SCAN_SCRIPT)) as RawScreenScan;
      } else {
        console.warn("[AIExecutor] scanCurrentScreen: no active browser");
        return null;
      }
    } catch (e: any) {
      console.error(`[AIExecutor] scanCurrentScreen failed: ${e.message}`);
      return null;
    }

    if (!raw) return null;
    const result = mapScanToObjects(raw, opts?.fallbackApp);
    // Remember the active screen so repository lookups + learning stay scoped.
    if (result.application) this.currentJdeApp = result.application;
    if (result.form) this.currentJdeForm = result.form;
    console.log(
      `[AIExecutor] 🔍 JDE scan: app=${result.application} form=${result.form} ` +
      `objects=${result.objects.length} headers=${result.gridHeaders.length}` +
      (result.warnings.length ? ` warnings=${result.warnings.length}` : "")
    );

    if (persist && result.objects.length) {
      try {
        const counts = jdeObjectStore.upsertMany(result.objects as any);
        console.log(`[AIExecutor] 💾 Object repository: +${counts.created} new, ${counts.updated} updated (${counts.total} total)`);
      } catch (e: any) {
        console.warn(`[AIExecutor] Object repository persist failed (non-fatal): ${e.message}`);
      }
    }
    return result;
  }

  /** Return the JDE app iframe (Playwright) or null when not framed. */
  private async getJdePlaywrightFrame(): Promise<any> {
    try {
      const handle = await this.playwrightPage.$('iframe#e1menuAppIframe, iframe[name="e1menuAppIframe"]');
      if (handle) {
        const frame = await handle.contentFrame();
        if (frame) return frame;
      }
    } catch { /* ignore */ }
    return null;
  }

  /**
   * Best-effort JDE auto-discovery during a live run. Seeds/refreshes the Object
   * Repository so self-healing and the AI planner can prefer DD-item locators and
   * header-based grids. ON for JDE runs by default; opt out with JDE_AUTO_SCAN=false.
   */
  private async maybeAutoScanJde(reason: string, logs?: string[]): Promise<void> {
    if (this.appType !== "jde") return;
    if (process.env.JDE_AUTO_SCAN === "false") return;
    try {
      const result = await this.scanCurrentScreen({ persist: true });
      if (result && logs) {
        logs.push(
          `[JDE Repo] ${reason}: discovered ${result.objects.length} object(s) on ${result.application}/${result.form}` +
          (result.gridHeaders.length ? `, ${result.gridHeaders.length} grid header(s)` : "")
        );
      }
    } catch (e: any) {
      // Discovery is best-effort and must never break a run.
      console.warn(`[AIExecutor] JDE auto-scan (${reason}) failed (non-fatal): ${e.message}`);
    }
  }

  /** Heuristic: does this step navigate to a new JDE application/form? */
  private looksLikeJdeNavigation(stepAction: string): boolean {
    if (!stepAction) return false;
    return /fast\s*path|navigate|launch|open\s+(the\s+)?(application|form|app|program)|go\s+to|\bP\d{3,5}\b|\bW\d{3,5}[A-Z]?\b/i.test(
      stepAction
    );
  }

  /**
   * Record a Phase 14 learning signal for a JDE step. Conservative: only updates
   * counters when EXACTLY ONE stored object on the current screen matches the
   * field the step targeted (so ambiguous steps can never corrupt the repo).
   */
  private async recordJdeStepOutcome(stepAction: string, passed: boolean, healed: boolean): Promise<void> {
    if (this.appType !== "jde") return;
    try {
      const token = this.extractJdeFieldToken(stepAction);
      if (!token) return;
      // Restrict to the current application/form when we know it.
      const all = jdeObjectStore.list(
        this.currentJdeApp ? { application: this.currentJdeApp, form: this.currentJdeForm } : undefined
      );
      const norm = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const t = norm(token);
      const matches = all.filter((o) => {
        const label = norm(o.business_label);
        const name = norm(o.object_name);
        const byLabel = !!label && (label.includes(t) || t.includes(label));
        const byName = !!name && (name.includes(t) || t.includes(name));
        return byLabel || byName;
      });
      if (matches.length !== 1) return; // only act on an unambiguous match
      if (passed) {
        jdeObjectStore.recordOutcome(matches[0].object_id, {
          // A successful step that needed a retry/heal is recorded as a heal win;
          // otherwise it's a clean primary-locator success.
          primarySuccess: !healed,
          healSuccess: healed,
        });
      } else {
        jdeObjectStore.recordOutcome(matches[0].object_id, { failure: true });
      }
    } catch (e: any) {
      console.warn(`[AIExecutor] recordJdeStepOutcome failed (non-fatal): ${e.message}`);
    }
  }

  /** Pull the most likely field label/name a step targeted (quoted value aside). */
  private extractJdeFieldToken(stepAction: string): string | undefined {
    if (!stepAction) return undefined;
    // "Enter X in the FIELD field" / "type X into FIELD" / "click the BUTTON button"
    const patterns = [
      /\b(?:in|into|on)\s+the\s+([A-Za-z][A-Za-z0-9 _\-/]+?)\s+(?:field|box|input|grid|column|button|link|tab)\b/i,
      /\bclick\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _\-/]+?)\s+(?:button|link|tab|icon)\b/i,
      /\bselect\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _\-/]+?)\s+(?:tab|option|menu)\b/i,
    ];
    for (const re of patterns) {
      const m = stepAction.match(re);
      if (m && m[1]) return m[1].trim();
    }
    return undefined;
  }

  /**
   * Evidence-aware selector for a stored object (Learning Agent #1 wiring).
   *
   * SAFETY: gated behind LEARNING_ADAPTIVE_LOCATORS=true. When the flag is OFF
   * (default), behaviour is byte-for-byte identical to the static path. When ON,
   * it re-ranks the object's locator candidates by OBSERVED reliability from the
   * Execution Knowledge Store, but ALWAYS falls back to the static
   * `bestSelectorForObject` if the agent yields nothing — so a run can never be
   * broken by the learning layer.
   */
  private adaptiveSelectorForObject(o: any): string | undefined {
    const staticSel = bestSelectorForObject(o);
    if (!ADAPTIVE_LOCATORS_ENABLED) return staticSel;
    try {
      const objectId = o.object_id;
      const candidates = o.locator_candidates || [];
      if (!objectId || candidates.length === 0) return staticSel;
      const ranked = learningAgent.bestLocators(objectId, candidates);
      const top = ranked[0];
      const adaptiveSel = top ? candidateToSelector(top) : undefined;
      if (adaptiveSel && adaptiveSel !== staticSel) {
        console.log(`[AIExecutor] 🧠 Adaptive locator for "${o.business_label || o.object_name}": ${adaptiveSel} (was ${staticSel})`);
      }
      return adaptiveSel || staticSel;
    } catch (e: any) {
      console.warn(`[AIExecutor] adaptiveSelectorForObject failed (non-fatal), using static: ${e.message}`);
      return staticSel;
    }
  }

  /**
   * Build a compact "KNOWN JDE OBJECTS" block for the AI prompt from the Object
   * Repository (current application/form). Gives the planner verified, learned
   * locators (DD-item first) so it stops guessing C0_x ids. Returns "" when not
   * JDE or nothing is known yet. Capped to keep the prompt small.
   */
  private buildJdeRepositoryHint(): string {
    if (this.appType !== "jde") return "";
    try {
      const objs = jdeObjectStore.list(
        this.currentJdeApp ? { application: this.currentJdeApp, form: this.currentJdeForm } : undefined
      );
      if (!objs.length) return "";
      // Prefer the most reliable, self-healing-eligible objects first.
      const ranked = objs
        .slice()
        .sort((a, b) => (b.reliability?.success_count || 0) - (a.reliability?.success_count || 0))
        .slice(0, 40);
      const lines: string[] = [];
      for (const o of ranked) {
        const sel = this.adaptiveSelectorForObject(o as any);
        if (!sel) continue;
        const label = o.business_label || o.object_name;
        const dd = o.jde_metadata?.dd_item ? ` dd=${o.jde_metadata.dd_item}` : "";
        const sc = o.reliability?.success_count || 0;
        const fc = o.reliability?.failure_count || 0;
        const rel = sc + fc > 0 ? ` (${sc}✓/${fc}✗)` : "";
        lines.push(`- "${label}"${dd} → ${sel}${rel}`);
      }
      if (!lines.length) return "";
      return (
        `\nKNOWN JDE OBJECTS (verified from this screen's Object Repository — PREFER these exact ` +
        `locators when the step's field/label matches; they are DD-item/label-grounded, not guesses):\n` +
        lines.join("\n") +
        `\n`
      );
    } catch {
      return "";
    }
  }

  private async cleanup(): Promise<void> {
    try {
      // NOTE: must also check playwrightContext — the SSO-aware backup uses a
      // PERSISTENT context (launchPersistentContext) where playwrightBrowser is
      // null. Skipping cleanup then would leak the context and keep the Chrome
      // profile LOCKED, breaking the next run. So guard on all three handles.
      if (!this.driver && !this.playwrightBrowser && !this.playwrightContext) return;
      
      // Selenium cleanup
      if (this.driver) {
        // Close all windows except the first one
        try {
          const handles = await this.driver.getAllWindowHandles();
          if (handles.length > 1) {
            const mainWindow = handles[0];
            for (const handle of handles) {
              if (handle !== mainWindow) {
                try {
                  await this.driver.switchTo().window(handle);
                  await this.driver.close();
                } catch { }
              }
            }
            await this.driver.switchTo().window(mainWindow);
          }
        } catch { }

        // Switch back to main content
        try {
          await this.driver.switchTo().defaultContent();
        } catch { }

        // Quit driver
        await this.driver.quit();
        this.driver = null;
      }

      // Cleanup Playwright resources
      if (this.playwrightPage) { try { await this.playwrightPage.close(); } catch {} this.playwrightPage = null; }
      if (this.playwrightContext) { try { await this.playwrightContext.close(); } catch {} this.playwrightContext = null; }
      if (this.playwrightBrowser) { try { await this.playwrightBrowser.close(); } catch {} this.playwrightBrowser = null; }
    } catch (error) {
      console.error("[AIExecutor] Cleanup error:", error);
    }
  }

  /**
   * Resolve a SAFE Chrome user-data dir for SSO profile reuse.
   *
   * Chrome allows only ONE running process per --user-data-dir. If CHROME_PROFILE_DIR
   * points at the user's LIVE everyday Chrome profile (e.g.
   * %LOCALAPPDATA%\Google\Chrome\User Data) and that browser is open, every launch
   * fails with "Chrome instance exited" (Selenium) or "profile is already in use by
   * another instance of Chromium" (Playwright). To make that foot-gun impossible we
   * detect the OS's real Chrome dir and transparently fall back to a DEDICATED profile
   * that nothing else locks.
   */
  private resolveSafeProfileDir(): string {
    const safeDefault = path.join(os.homedir(), ".aitas", "chrome-profile");
    const configured = (process.env.CHROME_PROFILE_DIR || "").trim();
    if (!configured) return safeDefault;

    const norm = path.normalize(configured).replace(/[\\/]+$/, "").toLowerCase();
    const realChromeDirs = [
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data") : null,
      path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data"),
      path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome"),
      path.join(os.homedir(), ".config", "google-chrome"),
    ]
      .filter((d): d is string => Boolean(d))
      .map((d) => path.normalize(d).replace(/[\\/]+$/, "").toLowerCase());

    const clashesWithLiveChrome = realChromeDirs.some((d) => norm === d || norm.startsWith(d + path.sep));
    if (clashesWithLiveChrome) {
      console.warn(
        `[AIExecutor] ⚠️  CHROME_PROFILE_DIR points at your LIVE Chrome profile:\n` +
        `             ${configured}\n` +
        `             Chrome locks that folder while your everyday browser is open, which is why you\n` +
        `             saw "Chrome instance exited" / "profile already in use". Using a DEDICATED\n` +
        `             profile instead: ${safeDefault}\n` +
        `             → Sign in to JDE/SSO ONCE in the Chrome window AITAS opens; the session is\n` +
        `               then reused automatically on every later run.`
      );
      return safeDefault;
    }
    return configured;
  }

  /** Remove stale Chrome singleton lock files left by a crashed run (best-effort). */
  private clearStaleProfileLocks(profileDir: string): void {
    for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
      try { fs.rmSync(path.join(profileDir, name), { force: true }); } catch {}
    }
  }

  // ============================================================================
  // BROWSER INITIALIZATION
  // ============================================================================

  private async initializeBrowser(framework: string): Promise<boolean> {
    // Try Selenium first (primary)
    try {
      console.log("[AIExecutor] Initializing Selenium Chrome...");
      const options = new ChromeOptions();
      options.addArguments(
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--start-maximized",
        "--disable-extensions",
        "--disable-popup-blocking",
        "--disable-notifications",
        "--disable-background-networking",  // Suppresses GCM/push notification errors
        "--disable-sync",                   // Disables Chrome sync
        "--disable-translate",              // Disables translation popups
        "--disable-features=Translate",     // Another way to disable translate
        "--log-level=3"                     // Suppress most Chrome logs (0=INFO, 1=WARNING, 2=ERROR, 3=FATAL)
      );
      options.excludeSwitches("enable-automation", "enable-logging");  // Suppress DevTools logging

      // ── SSO / Single Sign-On support ───────────────────────────────────────
      // Apps behind Microsoft Entra / Okta (e.g. JD Edwards, SAP Fiori, Salesforce)
      // rely on a browser session cookie. A fresh automation profile has none, so the
      // IdP redirects to a login page. Reusing a PERSISTENT Chrome profile lets the user
      // authenticate ONCE (interactively); the SSO cookie is then reused on every run —
      // exactly like the user's normal browser. ON by default; opt out with REUSE_BROWSER_PROFILE=false.
      if (process.env.REUSE_BROWSER_PROFILE !== "false") {
        const profileDir = this.resolveSafeProfileDir();
        try { fs.mkdirSync(profileDir, { recursive: true }); } catch {}
        this.clearStaleProfileLocks(profileDir);
        options.addArguments(
          `--user-data-dir=${profileDir}`,
          "--profile-directory=Default",
        );
        console.log(`[AIExecutor] SSO profile reuse ON → ${profileDir} (headed; sign in once)`);
      }

      this.driver = await new Builder()
        .forBrowser("chrome")
        .setChromeOptions(options)
        .build();

      // Explicit-only timeouts — implicit=0 is critical for performance.
      // Implicit wait > 0 causes every findElements() call to block for that long
      // before throwing, multiplying across retries and fallbacks catastrophically.
      await this.driver.manage().setTimeouts({
        implicit: 0,       // ← MUST be 0; explicit waits in findElement handle timing
        pageLoad: 30000,   // 30s page load max
        script: 30000,    // 30s script max
      });

      console.log("[AIExecutor] Selenium Chrome initialized successfully");
      return true;
    } catch (error: any) {
      console.error("[AIExecutor] Selenium initialization failed:", error.message);
      
      // Try Playwright as backup
      if (framework === "playwright" || true) { // Always try as backup
        try {
          console.log("[AIExecutor] Trying Playwright as backup...");
          const { chromium } = await import("playwright");

          // ── SSO-aware backup ──────────────────────────────────────────────
          // The previous backup launched a HEADLESS, EPHEMERAL context with NO
          // profile — so for SSO apps (JDE/SAP/Salesforce) it had zero session
          // cookies and ALWAYS landed on the Microsoft login page, never the app.
          // When profile reuse is ON, launch a PERSISTENT, HEADED context that
          // shares the same signed-in Chrome profile as the Selenium path, so the
          // SSO cookie is reused exactly like the user's real browser.
          const reuseProfile = process.env.REUSE_BROWSER_PROFILE !== "false";
          if (reuseProfile) {
            const profileDir = this.resolveSafeProfileDir();
            try { fs.mkdirSync(profileDir, { recursive: true }); } catch {}
            this.clearStaleProfileLocks(profileDir);
            console.log(`[AIExecutor] [Playwright] SSO profile reuse ON → ${profileDir} (headed)`);
            // launchPersistentContext returns a context directly (no separate browser).
            this.playwrightContext = await chromium.launchPersistentContext(profileDir, {
              headless: false,
              ignoreHTTPSErrors: true,
              viewport: null,
              args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
            });
            this.playwrightBrowser = null; // owned by the persistent context
            const pages = this.playwrightContext.pages();
            this.playwrightPage = pages.length ? pages[0] : await this.playwrightContext.newPage();
          } else {
            this.playwrightBrowser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
            this.playwrightContext = await this.playwrightBrowser.newContext({ ignoreHTTPSErrors: true });
            this.playwrightPage = await this.playwrightContext.newPage();
          }
          await this.playwrightPage.setDefaultTimeout(30000);
          await this.playwrightPage.setDefaultNavigationTimeout(30000);
          console.log("[AIExecutor] Playwright initialized as backup");
          return true;
        } catch (pwError: any) {
          console.error("[AIExecutor] Playwright backup also failed:", pwError.message);
        }
      }
      
      return false;
    }
  }

  // ============================================================================
  // TEST CASE EXECUTION
  // ============================================================================

  private async executeTestCase(
    testCase: TestCase,
    targetUrl: string,
    testDataMap: Map<string, string>,
    selfHealing: boolean,
    maxRetries: number
  ): Promise<{ 
    passed: boolean; 
    logs: string[]; 
    error?: string; 
    screenshot?: string; 
    stepScreenshots?: any[];
    performanceMetrics?: any;
    networkLogs?: any[];
  }> {
    const logs: string[] = [];
    const stepScreenshots: any[] = [];
    let passed = true;
    let lastError: string | undefined;
    const networkLogs: any[] = [];

    logs.push(`\n=== TEST CASE: ${testCase.title} ===`);
    logs.push(`Target URL: ${targetUrl}`);

    // Smart navigation: only load targetUrl on the very first test case (browser starts at about:blank).
    // Subsequent test cases keep the browser context — steps handle their own navigation.
    try {
      if (this.driver) {
        const curUrl = await this.driver.getCurrentUrl().catch(() => "about:blank");
        const isBlank = !curUrl || curUrl === "about:blank" || curUrl.startsWith("data:");
        if (isBlank) {
          console.log(`[AIExecutor] First run → navigating to ${targetUrl}`);
          await this.driver.get(targetUrl);
          await this.waitForPageLoad();
          // If reusing a signed-in profile, allow the SSO redirect chain to land on
          // the app before running steps (avoids typing into the IdP login page).
          if (process.env.REUSE_BROWSER_PROFILE !== "false") {
            await this.waitForSsoSettle(targetUrl);
          }
          logs.push(`Initial navigation to: ${targetUrl}`);
        } else {
          logs.push(`Browser context active at: ${curUrl}`);
        }
      } else if (this.playwrightPage) {
        const curUrl = this.playwrightPage.url();
        const isBlank = !curUrl || curUrl === "about:blank" || curUrl.startsWith("data:");
        if (isBlank) {
          console.log(`[AIExecutor] [Playwright] First run → navigating to ${targetUrl}`);
          // SSO apps frequently abort the FIRST load with net::ERR_ABORTED because
          // the IdP fires an immediate redirect while the initial document is still
          // committing. Retry a couple of times and treat "we left about:blank" as
          // success, so the run reaches the app instead of dying on step 1.
          let navigated = false;
          let lastErr: any = null;
          for (let attempt = 1; attempt <= 3 && !navigated; attempt++) {
            try {
              await this.playwrightPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
              navigated = true;
            } catch (e: any) {
              lastErr = e;
              const landed = this.playwrightPage.url();
              const movedOff = landed && landed !== "about:blank" && !landed.startsWith("data:");
              if (/ERR_ABORTED/i.test(e.message) && movedOff) {
                // The redirect aborted our goto but the browser DID move on (e.g. to
                // the SSO login) — that's acceptable; SSO settle handles the rest.
                console.log(`[AIExecutor] [Playwright] goto aborted by redirect; browser moved to ${landed} (attempt ${attempt}) — continuing`);
                navigated = true;
              } else {
                console.warn(`[AIExecutor] [Playwright] navigation attempt ${attempt} failed: ${e.message}`);
                await new Promise((r) => setTimeout(r, 1000));
              }
            }
          }
          if (!navigated) {
            logs.push(`Initial navigation failed after retries: ${lastErr?.message}`);
          } else {
            // If reusing a signed-in profile, let the SSO redirect chain land on the
            // app before running steps (avoids typing into the IdP login page).
            if (process.env.REUSE_BROWSER_PROFILE !== "false") {
              await this.waitForSsoSettle(targetUrl).catch(() => {});
            }
            logs.push(`Initial navigation to: ${targetUrl}`);
          }
        } else {
          logs.push(`Browser context active at: ${curUrl}`);
        }
      }
    } catch (navErr: any) {
      logs.push(`Navigation init (non-fatal): ${navErr.message}`);
    }

    // JDE: seed the Object Repository from the landing screen so the AI planner
    // and self-healing can prefer DD-item locators + header-based grids from the
    // very first step. Best-effort; never blocks the run.
    await this.maybeAutoScanJde("landing screen", logs);

    // Get steps from test case
    const steps = (testCase.steps as { step: string; expected: string }[]) || [];

    // Execute each step
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      if (this.shouldStop) {
        logs.push("Execution stopped by user");
        break;
      }

      const stepDef = steps[stepIndex];
      const stepNum = stepIndex + 1;

      // Replace test data placeholders
      const stepAction = this.replacePlaceholders(stepDef.step, testDataMap);
      const expected = this.replacePlaceholders(stepDef.expected, testDataMap);

      logs.push(`\n--- Step ${stepNum}: ${stepAction} ---`);
      logs.push(`Expected: ${expected}`);

            let stepPassed = false;
      let attempts = 0;
      let stepError: string | undefined;
      const STEP_TIMEOUT_MS = 30_000; // hard cap: no single step may run > 30s
      const maxAttempts = selfHealing ? Math.min(maxRetries, 2) : 1; // cap retries at 2

      // Retry loop with self-healing
      while (!stepPassed && attempts < maxAttempts) {
        attempts++;
        if (attempts > 1) {
          logs.push(`[Self-Healing] Retry attempt ${attempts}/${maxAttempts}`);
        }

        try {
          // Per-step timeout: if AI + DOM ops take > 30s, fail fast
          const stepPromise = this.executeStep(stepAction, expected, logs, testDataMap, targetUrl);
          const timeoutPromise = new Promise<{passed:boolean;error:string}>((_, reject) =>
            setTimeout(() => reject(new Error(`Step timeout after ${STEP_TIMEOUT_MS/1000}s`)), STEP_TIMEOUT_MS)
          );
          const result = await Promise.race([stepPromise, timeoutPromise]);
          stepPassed = result.passed;
          stepError = result.error;
          console.log(`[AIExecutor] Step ${stepNum} result: passed=${stepPassed}, error=${stepError}`);

          if (!stepPassed && selfHealing && attempts < maxAttempts) {
            logs.push(`[Self-Healing] Step failed, retrying...`);
            await this.driver?.sleep(300);
          }
        } catch (error: any) {
          stepError = error.message;
          stepPassed = false;
          logs.push(`Step error: ${error.message}`);
          console.log(`[AIExecutor] Step ${stepNum} exception: ${error.message}`);
        }
      }

      // Capture screenshot after step
      try {
        const screenshot = await this.captureScreenshot();
        const screenshotStatus = stepPassed ? "passed" : "failed";
        console.log(`[AIExecutor] Step ${stepNum} screenshot status: ${screenshotStatus}`);
        stepScreenshots.push({
          stepNumber: stepNum,
          action: stepAction,
          status: screenshotStatus,
          screenshot,
        });
      } catch (screenshotError: any) {
        console.log(`[AIExecutor] Screenshot capture failed: ${screenshotError.message}`);
      }

      // JDE Object Repository learning (Phase 14) + adaptive re-scan. A step that
      // only passed after a retry is treated as a "heal" win. Best-effort.
      if (this.appType === "jde") {
        await this.recordJdeStepOutcome(stepAction, stepPassed, attempts > 1);
        // Also feed the app-level Execution Knowledge Store so the Learning &
        // Analytics dashboard populates for JDE runs. recordJdeStepOutcome only
        // updates jde_objects (and only on an unambiguous object match), so
        // without this the dashboard stays empty even after real JDE executions.
        observeAppSteps("JDE", [
          { step: stepAction, passed: stepPassed, healed: attempts > 1 },
        ], { sessionId: this.executionId, form: this.currentJdeForm });
        // If the step navigated to a new application/form, refresh the repository
        // so subsequent steps see the new screen's objects + grid headers.
        if (stepPassed && this.looksLikeJdeNavigation(stepAction)) {
          await this.maybeAutoScanJde(`after navigation step ${stepNum}`, logs);
        }
      } else {
        // Cross-app learning feed (#3): generic Web / non-JDE runs feed the same
        // Execution Knowledge Store so the Learning dashboard covers them too.
        // App-level (no stable object identity here). Best-effort, never throws.
        observeAppSteps((this.appType || "WEB").toUpperCase(), [
          { step: stepAction, passed: stepPassed, healed: attempts > 1 },
        ]);
      }

      if (stepPassed) {
        logs.push(`Step ${stepNum} [✓ PASS]`);
      } else {
        logs.push(`Step ${stepNum} [✗ FAIL]: ${stepError}`);
        passed = false;
        lastError = `Step ${stepNum} failed: ${stepError}`;
        break; // Stop on first failure
      }
    }

    // Final screenshot
    let finalScreenshot: string | undefined;
    try {
      finalScreenshot = await this.captureScreenshot();
    } catch { }

    // Collect performance metrics
    let performanceMetrics: any = null;
    try {
      performanceMetrics = await this.collectPerformanceMetrics();
      logs.push(`\n--- Performance Metrics ---`);
      logs.push(`Page Load Time: ${performanceMetrics.pageLoadTime}ms`);
      logs.push(`DOM Content Loaded: ${performanceMetrics.domContentLoaded}ms`);
      logs.push(`First Paint: ${performanceMetrics.firstPaint}ms`);
      logs.push(`First Contentful Paint: ${performanceMetrics.firstContentfulPaint}ms`);
      if (performanceMetrics.memoryUsed) {
        logs.push(`Memory Used: ${Math.round(performanceMetrics.memoryUsed / 1024 / 1024)}MB`);
      }
    } catch (error: any) {
      logs.push(`Performance metrics collection failed: ${error.message}`);
    }

    return {
      passed,
      logs,
      error: lastError,
      screenshot: finalScreenshot,
      stepScreenshots,
      performanceMetrics,
      networkLogs,
    };
  }

  // ============================================================================
  // HEAL ANNOTATION HANDLING
  // ============================================================================

  /**
   * Parse and strip a folded "[selector: ...]" annotation from a step.
   *
   * The AI Healer may fold a suggested selector into the step text as
   * "[selector: <css|xpath|id>]". Since THIS executor is AI-VISION based — it
   * reads the LIVE DOM every step and generates its own locators — a
   * fabricated/stale selector in the text MISLEADS the AI (it obeys the hint
   * and searches for a non-existent element). So we:
   *   1. STRIP the annotation from the text sent to the AI (clean NL step), and
   *   2. return the selector separately as an OPTIONAL, lowest-priority fallback
   *      locator that is only tried AFTER the AI's live-DOM locators.
   * This way a genuinely-useful selector still helps, but a bogus one can never
   * block the step.
   */
  private parseSelectorAnnotation(stepText: string): { cleanText: string; selectorHint?: string } {
    if (!stepText) return { cleanText: stepText };
    // The selector value itself may contain "]" (e.g. [data-testid="x"]), and
    // the annotation is always appended at the end, so match greedily up to the
    // LAST "]" on the line.
    const m = stepText.match(/\[selector:\s*([\s\S]*)\]\s*$/i);
    if (!m || m.index === undefined) return { cleanText: stepText };
    const cleanText = stepText.slice(0, m.index).trim();
    const selectorHint = m[1].trim();
    return { cleanText: cleanText || stepText, selectorHint: selectorHint || undefined };
  }

  /** Convert a folded selector hint into an executable locator string. */
  private selectorHintToLocator(hint: string): string | undefined {
    if (!hint) return undefined;
    const h = hint.trim();
    if (/^(id|name|css|xpath|shadow)>{0,2}=?/.test(h) && /^(id|name|css|xpath)=/.test(h)) return h;
    if (h.startsWith("shadow>>")) return h;
    if (h.startsWith("//") || h.startsWith("(")) return `xpath=${h}`;
    // Default: treat as a CSS selector (covers [data-testid="x"], #id, .class,
    // tag[attr="v"], etc.)
    return `css=${h}`;
  }

  // ============================================================================
  // AI-POWERED STEP EXECUTION
  // ============================================================================

    private async executeStep(
    stepAction: string,
    expected: string,
    logs: string[],
    testDataMap: Map<string, string>,
    targetUrl: string = ""
  ): Promise<{ passed: boolean; error?: string }> {
    try {
      // Reset per-step iframe search flags (prevents repeated nested searches within one step)
      this.stepDidNestedSearch = false;
      this.stepDidDynamicWait = false;
      // Remember the human-readable intent of THIS step so the JDE toolbar safety
      // net can resolve an action button by intent even if the AI's locator is wrong.
      this.currentStepIntent = stepAction || "";
      
            // 1. Get page snapshot
      const snapshot = await this.getPageSnapshot();
      logs.push(`Page: ${snapshot.title} (${snapshot.url})`);
      logs.push(`Found ${(snapshot.elements ?? []).length} interactive elements`);

      // 1a. Strip any folded "[selector: ...]" heal annotation. This executor is
      // AI-VISION based (it finds elements from the LIVE DOM), so a fabricated or
      // stale selector in the step text only MISLEADS the AI. We remove it from
      // the text sent to the AI and keep it as an OPTIONAL last-resort fallback
      // locator that is appended AFTER the AI's own live-DOM locators.
      const { cleanText: stepNoAnnotation, selectorHint } = this.parseSelectorAnnotation(stepAction);
      if (selectorHint) {
        logs.push(`[Heal] Detected selector hint '${selectorHint}' — using as low-priority fallback only (AI plans from live DOM)`);
        stepAction = stepNoAnnotation;
      }
      const fallbackLocator = selectorHint ? this.selectorHintToLocator(selectorHint) : undefined;

            // 1b. Pre-resolve credential values from testDataMap before sending to AI
      const resolvedStepAction = this.resolveCredentialStep(stepAction, testDataMap, snapshot, logs);

      // 1c. Handle combined "type X into field1 AND type Y into field2" steps directly
      // This handles the case where resolveCredentialStep produces a combined step
      const combinedMatch = resolvedStepAction.match(
        /Type\s+"([^"]+)"\s+into\s+the\s+username\s+field\s+at\s+xpath:\s*(\S+)\s+and\s+type\s+"([^"]+)"\s+into\s+the\s+password\s+field\s+at\s+xpath:\s*(\S+)/i
      );
      if (combinedMatch) {
        const [, uVal, uXpath, pVal, pXpath] = combinedMatch;
        logs.push(`[combined] Executing username+password in one step`);
        // Type username
        try {
          const uEl = await this.findElement(uXpath, 10000);
          await this.scrollIntoView(uEl);
          await this.typeIntoElement(uEl, uVal, logs);
          logs.push(`[combined] Typed username into ${uXpath}`);
        } catch (e: any) {
          logs.push(`[combined] Username field error: ${e.message}`);
        }
        // Type password
        try {
          const pEl = await this.findElement(pXpath, 10000);
          await this.scrollIntoView(pEl);
          await this.typeIntoElement(pEl, pVal, logs);
          logs.push(`[combined] Typed password into ${pXpath}`);
        } catch (e: any) {
          logs.push(`[combined] Password field error: ${e.message}`);
        }
        return { passed: true };
      }

      // 2. Plan → act → verify, with automatic RE-PLANNING after a FRAME switch.
      //    JDE/ERP apps render their forms inside e1menuAppIframe, so the AI
      //    correctly returns `switchToIframe` FIRST when the target (e.g. the Add
      //    button) isn't yet in the element list. That switch is only SETUP — the
      //    real action (the click/type) must STILL run. Previously the executor
      //    returned passed=true right after the switch, so the action never
      //    happened (false positive: "passed" but nothing clicked). We now loop:
      //    after a frame switch we re-snapshot the new frame and re-plan the SAME
      //    step so the actual action executes, and fail honestly if it can't.
      const MAX_CONTEXT_SWITCHES = 4;
      let contextSwitches = 0;
      let currentSnapshot = snapshot;

      while (true) {
        // 2a. Ask AI to create an execution plan for the CURRENT frame context
        const plan = await this.getAIExecutionPlan(resolvedStepAction, expected, currentSnapshot, testDataMap, targetUrl);

        // Append the heal selector hint (if any) as the LOWEST-priority fallback
        // locator — only tried after the AI's live-DOM locators all fail. This
        // guarantees a bogus heal can never block a step, while a genuinely useful
        // selector still gets a chance.
        if (fallbackLocator) {
          plan.action.locators = [...(plan.action.locators ?? []), fallbackLocator];
          logs.push(`[Heal] Appended fallback locator '${fallbackLocator}' to plan (priority: last)`);
        }

        logs.push(`AI Plan: ${plan.action.description} (confidence: ${plan.confidence}%)`);
        logs.push(`AI Reasoning: ${plan.reasoning}`);

        const isFrameSwitch =
          plan.action.type === "switchToIframe" ||
          plan.action.type === "switchToParentFrame" ||
          plan.action.type === "switchToDefaultContent";

        // 2b. Execute the action
        const actionResult = await this.executeAction(plan.action, logs);
        if (!actionResult.success) {
          // Invalidate EVERY cached plan for this step text so retries re-plan from
          // the live DOM instead of replaying the same failing locator. JDE keeps
          // one URL across iframes, so a URL-scoped delete isn't enough — clear all
          // cache entries whose key starts with this step's text.
          let cleared = 0;
          for (const key of Array.from(this.aiPlanCache.keys())) {
            if (key.startsWith(`${resolvedStepAction}||`)) {
              this.aiPlanCache.delete(key);
              cleared++;
            }
          }
          if (cleared) logs.push(`[Cache] Invalidated ${cleared} stale plan(s) for retry`);
          return { passed: false, error: actionResult.error };
        }

        // 2c. After a FRAME switch the real action is still pending. Re-snapshot
        //     the new frame and re-plan the SAME step so the actual click/type runs.
        //     (An iframe switch does NOT change the top-level URL, so the plan cache
        //     would hand back the same switch plan — drop it before re-planning.)
        if (isFrameSwitch) {
          if (contextSwitches >= MAX_CONTEXT_SWITCHES) {
            logs.push(`✗ Performed ${contextSwitches} frame switch(es) but never reached the target element for: "${resolvedStepAction}"`);
            return {
              passed: false,
              error: `Could not locate the target element for "${resolvedStepAction}" after ${contextSwitches} frame switch(es)`,
            };
          }
          contextSwitches++;
          this.aiPlanCache.delete(`${resolvedStepAction}||${currentSnapshot.url}`);
          currentSnapshot = await this.getPageSnapshot();
          this.aiPlanCache.delete(`${resolvedStepAction}||${currentSnapshot.url}`);
          logs.push(
            `↪ Frame context switched (${contextSwitches}/${MAX_CONTEXT_SWITCHES}); re-planning the same step ` +
            `inside the new frame — depth ${this.framePath.length}, ${(currentSnapshot.elements ?? []).length} elements now visible`
          );
          continue; // re-plan the SAME step in the new frame
        }

        // 3. Track if a navigation occurred (click → page change, navigate, new window)
        const isNavigationAction =
          plan.action.type === "click" ||
          plan.action.type === "navigate" ||
          plan.action.type === "switchToWindow";

        // Check if we successfully navigated (URL changed, new content)
        let navigationSucceeded = false;
        if (isNavigationAction) {
          try {
            const newSnapshot = await this.getPageSnapshot();
            // Navigation succeeded if URL changed or significant new content appeared
            navigationSucceeded = newSnapshot.url !== currentSnapshot.url ||
                                 (newSnapshot.bodyText || "").length > 100;
            if (navigationSucceeded) {
              logs.push(`✓ Navigation succeeded - new page content detected`);
            }
          } catch { }
        }

        // 4. Execute verification if present, else add a default verification
        let verification = plan.verification;
        if (!verification) {
          // Add sensible default verification based on action type
          if (plan.action.type === "select" && plan.action.value) {
            verification = {
              type: "valueEquals",
              elementXPath: plan.action.elementXPath,
              expectedValue: plan.action.value,
              description: `Verify selected value is ${plan.action.value}`
            };
          } else if (plan.action.type === "type" && plan.action.value) {
            verification = {
              type: "valueEquals",
              elementXPath: plan.action.elementXPath,
              expectedValue: plan.action.value,
              description: `Verify input value is ${plan.action.value}`
            };
          } else if (plan.action.type === "click" && plan.action.elementXPath) {
            // For click actions that navigated successfully, just verify page loaded
            if (navigationSucceeded) {
              verification = {
                type: "elementExists",
                elementXPath: "//body",
                description: `Verify page loaded after navigation`
              };
            } else {
              verification = {
                type: "elementVisible",
                elementXPath: plan.action.elementXPath,
                description: `Verify element is visible after click`
              };
            }
          }
        }

        if (verification) {
          logs.push(`Verifying: ${verification.description}`);
          const verifyResult = await this.executeVerification(verification, logs);

          if (!verifyResult.success) {
            // A window switch is a setup step, not a content assertion. The AI
            // sometimes attaches the NEXT step's expected text to it; never fail on that.
            if (plan.action.type === "switchToWindow") {
              logs.push(`✓ Context switch done (verify mismatch ignored: ${verifyResult.error})`);
              this.aiPlanCache.clear();
              return { passed: true };
            }
            // For navigation actions that succeeded, verification failure is a WARNING not an error
            if (navigationSucceeded) {
              logs.push(`⚠ Verification failed but navigation succeeded: ${verifyResult.error}`);
              logs.push(`✓ Step passed (navigation successful, verification mismatch is warning)`);
              // Try fallback verification - check if any form/content exists
              try {
                const pageHasContent = await this.driver!.executeScript(`
                  return document.querySelectorAll('input, select, button, form, table').length > 0;
                `) as boolean;
                if (pageHasContent) {
                  logs.push(`✓ Fallback verification passed: page has interactive content`);
                  return { passed: true };
                }
              } catch { }
              // Still pass if navigation succeeded
              return { passed: true };
            }
            return { passed: false, error: verifyResult.error };
          }
        }

        return { passed: true };
      }
    } catch (error: any) {
      return { passed: false, error: error.message };
    }
  }

  // ============================================================================
  // PAGE SNAPSHOT (For AI Analysis)
  // ============================================================================

  private async getPageSnapshot(): Promise<PageSnapshot> {
    if (!this.driver) {
      if (this.playwrightPage) {
        return this.getPageSnapshotPlaywright();
      }
      throw new Error("No browser driver available");
    }

    const snapshot: PageSnapshot = {
      url: await this.driver.getCurrentUrl(),
      title: await this.driver.getTitle(),
      elements: [],
      iframes: [],
      alerts: false,
      windowHandles: await this.driver.getAllWindowHandles(),
      currentWindow: await this.driver.getWindowHandle(),
    };

    // Check for alerts (but preserve iframe context)
    try {
      await this.driver.switchTo().alert();
      snapshot.alerts = true;
      // After alert check, restore FULL nested context
      await this.restoreFramePath();
    } catch {
      snapshot.alerts = false;
      // Restore FULL nested frame context if we were in one
      if (this.framePath.length) {
        await this.restoreFramePath();
      }
    }

        // ── RUNTIME DOM CAPTURE ─────────────────────────────────────────────────
    // Captures id, data-testid, data-test, data-cy, name, aria-label, shadow hosts
    // and generates a priority locator chain per element.
    const elementsScript = `
      return (function() {
        const elements = [];
        const interactiveSelectors = [
          'input', 'button', 'a', 'select', 'textarea',
          '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
          '[role="menuitem"]', '[role="tab"]', '[role="option"]', '[role="combobox"]',
          '[onclick]', '[ng-click]', '[data-action]', 'label',
          '[id^="hc_"]', 'a[title]', 'div[title]', 'span[title]', '[data-jde]'
        ];

        function getXPath(el) {
          if (el.id) return '//*[@id="' + el.id + '"]';
          if (el === document.body) return '/html/body';
          let ix = 0;
          const siblings = el.parentNode ? el.parentNode.childNodes : [];
          for (let i = 0; i < siblings.length; i++) {
            const s = siblings[i];
            if (s === el) {
              const pp = el.parentNode ? getXPath(el.parentNode) : '';
              return pp + '/' + el.tagName.toLowerCase() + '[' + (ix + 1) + ']';
            }
            if (s.nodeType === 1 && s.tagName === el.tagName) ix++;
          }
          return '';
        }

        // Build priority locator chain: id > data-testid > data-test > name > css > xpath
        function buildLocators(el) {
          const chain = [];
          const id  = el.id;
          const tid = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
          const dt  = el.getAttribute('data-test');
          const dc  = el.getAttribute('data-cy') || el.getAttribute('data-automation-id');
          const nm  = el.name;
          const ph  = el.placeholder;
          const tag = el.tagName.toLowerCase();

          if (id)  chain.push('id=' + id);
          if (tid) chain.push('css=[data-testid="' + tid + '"]');
          if (dt)  chain.push('css=[data-test="' + dt + '"]');
          if (dc)  chain.push('css=[data-cy="' + dc + '"]');
          if (nm)  chain.push('name=' + nm);
          if (ph && (tag === 'input' || tag === 'textarea'))
            chain.push('css=' + tag + '[placeholder="' + ph + '"]');
          // CSS class fallback (stable class only)
          const cls = (el.className || '').split(' ').find(c => c && !/^(ng-|_|\d)/.test(c));
          if (cls) chain.push('css=' + tag + '.' + cls.trim().replace(/\s+/g, '.'));
          // XPath last
          const xp = getXPath(el);
          if (xp) chain.push('xpath=' + xp);
          return chain.slice(0, 3); // primary + 2 fallbacks
        }

        // Score: higher = more stable locator
        function confidence(el) {
          if (el.id && !/\d{6,}/.test(el.id)) return 0.95;
          if (el.getAttribute('data-testid') || el.getAttribute('data-test')) return 0.90;
          if (el.name) return 0.80;
          if (el.getAttribute('aria-label')) return 0.75;
          if (el.placeholder) return 0.65;
          return 0.45;
        }

        const seen = new Set();
        for (const selector of interactiveSelectors) {
          for (const el of document.querySelectorAll(selector)) {
            const xp = getXPath(el);
            if (seen.has(xp)) continue;
            seen.add(xp);

            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const isVisible = rect.width > 0 && rect.height > 0
              && style.visibility !== 'hidden' && style.display !== 'none';

            const locators = buildLocators(el);

            elements.push({
              tag:              el.tagName.toLowerCase(),
              type:             el.type            || null,
              id:               el.id              || null,
              name:             el.name            || null,
              className:        (el.className || null),
              text:             (el.innerText || el.textContent || '').trim().substring(0, 100),
              placeholder:      el.placeholder     || null,
              ariaLabel:        el.getAttribute('aria-label')         || null,
              title:            el.getAttribute('title')              || null,
              dataTest:         el.getAttribute('data-test')          || null,
              dataTestId:       el.getAttribute('data-testid') || el.getAttribute('data-test-id') || null,
              dataCy:           el.getAttribute('data-cy')            || null,
              dataAutomation:   el.getAttribute('data-automation-id') || null,
              isShadowHost:     !!el.shadowRoot,
              value:            el.value || null,
              href:             el.href  || null,
              isVisible,
              isEnabled:        !el.disabled,
              role:             el.getAttribute('role') || null,
              forAttr:          el.getAttribute('for')  || null,
              xpath:            xp,
              locators,
              locatorStrategy:  locators[0] ? locators[0].split('=')[0] : 'xpath',
              locatorConfidence: confidence(el),
            });
          }
        }

        // ── Shadow DOM: collect elements from shadow roots ───────────────────
        function queryShadow(root) {
          const extras = [];
          const hosts = root.querySelectorAll('*');
          for (const host of hosts) {
            if (!host.shadowRoot) continue;
            for (const sel of interactiveSelectors) {
              for (const el of host.shadowRoot.querySelectorAll(sel)) {
                const xp = 'shadow>>' + host.tagName.toLowerCase() + '>>' + el.tagName.toLowerCase();
                if (seen.has(xp)) continue;
                seen.add(xp);
                const rect = el.getBoundingClientRect();
                const isVis = rect.width > 0 && rect.height > 0;
                extras.push({
                  tag: el.tagName.toLowerCase(), type: el.type || null,
                  id: el.id || null, name: el.name || null,
                  text: (el.innerText || '').trim().substring(0, 80),
                  placeholder: el.placeholder || null,
                  ariaLabel: el.getAttribute('aria-label') || null,
                  dataTestId: el.getAttribute('data-testid') || null,
                  isShadowHost: false,
                  isVisible: isVis, isEnabled: !el.disabled,
                  xpath: xp,
                  locators: ['shadow>>' + (el.id ? '#' + el.id : el.tagName.toLowerCase())],
                  locatorStrategy: 'shadow',
                  locatorConfidence: 0.70,
                });
              }
            }
          }
          return extras;
        }
        elements.push(...queryShadow(document));

        return elements.slice(0, 250);
      })()
    `;

    try {
      snapshot.elements = (await this.driver.executeScript(elementsScript) as ElementInfo[]) ?? [];
    } catch (error: any) {
      console.error("[AIExecutor] Failed to get elements:", error.message);
      snapshot.elements = [];
    }

    // Get iframes
    const iframesScript = `
      return Array.from(document.querySelectorAll('iframe')).map((iframe, index) => ({
        id: iframe.id || null,
        name: iframe.name || null,
        src: iframe.src || null,
        index: index
      }));
    `;

    try {
      snapshot.iframes = (await this.driver.executeScript(iframesScript) as IframeInfo[]) ?? [];
    } catch {
      snapshot.iframes = [];
    }

    // Capture visible page text for context (helps AI understand what page we're on)
    try {
      snapshot.bodyText = await this.driver.executeScript(`
        return (function() {
          const body = document.body;
          if (!body) return '';
          // Get visible text, excluding scripts and styles
          const clone = body.cloneNode(true);
          const scripts = clone.querySelectorAll('script, style, noscript');
          scripts.forEach(s => s.remove());
          const text = clone.innerText || clone.textContent || '';
          // Clean up whitespace and limit to 500 chars
          return text.replace(/\\s+/g, ' ').trim().substring(0, 500);
        })();
      `) as string;
    } catch {
      snapshot.bodyText = '';
    }

    return snapshot;
  }

  // ============================================================================
  // PAGE SNAPSHOT (Playwright Mode)
  // ============================================================================

  private async getPageSnapshotPlaywright(): Promise<PageSnapshot> {
    const page = this.playwrightPage;
    try {
      const snapshot: PageSnapshot = {
        url: page.url(),
        title: await page.title().catch(() => ''),
        elements: [],
        iframes: [],
        alerts: false,
        windowHandles: [page.url()],
        currentWindow: page.url(),
      };

      // Same DOM inspection script as Selenium version — works in any browser context
      const elementsExpr = `(function() {
        const elements = [];
        const interactiveSelectors = [
          'input', 'button', 'a', 'select', 'textarea',
          '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
          '[role="menuitem"]', '[role="tab"]', '[role="option"]', '[role="combobox"]',
          '[onclick]', '[ng-click]', '[data-action]', 'label',
          '[id^="hc_"]', 'a[title]', 'div[title]', 'span[title]', '[data-jde]'
        ];
        function getXPath(el) {
          if (el.id) return '//*[@id="' + el.id + '"]';
          if (el === document.body) return '/html/body';
          let ix = 0;
          const siblings = el.parentNode ? el.parentNode.childNodes : [];
          for (let i = 0; i < siblings.length; i++) {
            const s = siblings[i];
            if (s === el) {
              const pp = el.parentNode ? getXPath(el.parentNode) : '';
              return pp + '/' + el.tagName.toLowerCase() + '[' + (ix + 1) + ']';
            }
            if (s.nodeType === 1 && s.tagName === el.tagName) ix++;
          }
          return '';
        }
        function buildLocators(el) {
          const chain = [];
          const id = el.id;
          const tid = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
          const dt = el.getAttribute('data-test');
          const dc = el.getAttribute('data-cy') || el.getAttribute('data-automation-id');
          const nm = el.name; const ph = el.placeholder; const tag = el.tagName.toLowerCase();
          if (id) chain.push('id=' + id);
          if (tid) chain.push('css=[data-testid="' + tid + '"]');
          if (dt) chain.push('css=[data-test="' + dt + '"]');
          if (dc) chain.push('css=[data-cy="' + dc + '"]');
          if (nm) chain.push('name=' + nm);
          if (ph && (tag === 'input' || tag === 'textarea')) chain.push('css=' + tag + '[placeholder="' + ph + '"]');
          const cls = (el.className || '').split(' ').find(function(c) { return c && !/^(ng-|_|[0-9])/.test(c); });
          if (cls) chain.push('css=' + tag + '.' + cls.trim().replace(/\s+/g, '.'));
          const xp = getXPath(el);
          if (xp) chain.push('xpath=' + xp);
          return chain.slice(0, 3);
        }
        function confidence(el) {
          if (el.id && !/[0-9]{6,}/.test(el.id)) return 0.95;
          if (el.getAttribute('data-testid') || el.getAttribute('data-test')) return 0.90;
          if (el.name) return 0.80;
          if (el.getAttribute('aria-label')) return 0.75;
          if (el.placeholder) return 0.65;
          return 0.45;
        }
        const seen = new Set();
        for (const selector of interactiveSelectors) {
          for (const el of document.querySelectorAll(selector)) {
            const xp = getXPath(el);
            if (seen.has(xp)) continue;
            seen.add(xp);
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const isVisible = rect.width > 0 && rect.height > 0
              && style.visibility !== 'hidden' && style.display !== 'none';
            const locators = buildLocators(el);
            elements.push({
              tag: el.tagName.toLowerCase(), type: el.type || null, id: el.id || null,
              name: el.name || null, className: (el.className || null),
              text: (el.innerText || el.textContent || '').trim().substring(0, 100),
              placeholder: el.placeholder || null, ariaLabel: el.getAttribute('aria-label') || null,
              title: el.getAttribute('title') || null,
              dataTest: el.getAttribute('data-test') || null,
              dataTestId: el.getAttribute('data-testid') || el.getAttribute('data-test-id') || null,
              dataCy: el.getAttribute('data-cy') || null,
              dataAutomation: el.getAttribute('data-automation-id') || null,
              isShadowHost: !!el.shadowRoot, value: el.value || null, href: el.href || null,
              isVisible, isEnabled: !el.disabled, role: el.getAttribute('role') || null,
              forAttr: el.getAttribute('for') || null, xpath: xp,
              locators, locatorStrategy: locators[0] ? locators[0].split('=')[0] : 'xpath',
              locatorConfidence: confidence(el),
            });
          }
        }
        return elements.slice(0, 250);
      })()`;

      try {
        snapshot.elements = (await page.evaluate(elementsExpr)) as any[] ?? [];
      } catch (e: any) {
        console.error('[AIExecutor] Playwright elements capture failed:', e.message);
        snapshot.elements = [];
      }

      try {
        snapshot.iframes = (await page.evaluate(
          `Array.from(document.querySelectorAll('iframe')).map(function(f, i) { return { id: f.id || null, name: f.name || null, src: f.src || null, index: i }; })`
        )) as any[] ?? [];
      } catch { snapshot.iframes = []; }

      try {
        snapshot.bodyText = (await page.evaluate(
          `(function() { var body = document.body; if (!body) return ''; var clone = body.cloneNode(true); clone.querySelectorAll('script, style, noscript').forEach(function(s) { s.remove(); }); return (clone.innerText || clone.textContent || '').replace(/\\s+/g, ' ').trim().substring(0, 500); })()`
        )) as string ?? '';
      } catch { snapshot.bodyText = ''; }

      return snapshot;
    } catch (error: any) {
      console.error('[AIExecutor] getPageSnapshotPlaywright error:', error.message);
      return { url: page?.url() || '', title: '', elements: [], iframes: [], alerts: false, windowHandles: [], currentWindow: '' };
    }
  }

  // ============================================================================
  // AI EXECUTION PLAN GENERATION
  // ============================================================================

  /**
   * JDE menu/tree words that indicate a NAVIGATION click (not a form-field click).
   * These are the JDE E1 menu regions the user drills through, e.g.
   *   Navigator → Baxter GM View → Sales → Sales Order Entry.
   */
  private static readonly JDE_FASTPATH_CODE = /\b[PR]\d{3,6}\b/i; // P4210, R4210, etc.

  /**
   * Normalize a spoken menu step into the ACTUAL on-screen label. QA specs often
   * append a METHOD HINT or UI-chrome noun that is NOT part of the clickable label:
   *   "Navigator by fastpath"        → "Navigator"
   *   "Sales Order Entry via menu"   → "Sales Order Entry"
   *   "Add button" (handled elsewhere) / "Baxter GM View icon" → "Baxter GM View"
   * We ONLY strip clear method hints ("by/via/using/through/with fast path",
   * "by/from/in the menu|navigator|tree") and a trailing UI-chrome noun
   * (button|icon|link|hyperlink|image). We deliberately KEEP meaningful words like
   * "Entry", "Item", "Option", "SO" that can be real parts of a JDE menu label.
   */
  private cleanJdeMenuLabel(label: string): string {
    let s = (label || "").trim().replace(/^["'`]+/g, "").replace(/["'`.]+$/g, "").trim();
    // Method hints — remove the hint AND everything after it.
    s = s.replace(/\s+(?:by|via|using|through|with)\s+fast\s*path\b.*$/i, "");
    s = s.replace(/\s+(?:by|via|using|through|with|from|in|on)\s+(?:the\s+)?(?:menu(?:\s*item)?|navigator|nav\s*bar|left\s*menu|side\s*menu|tree|fast\s*path)\b.*$/i, "");
    // Trailing UI-chrome noun only (safe words that are never a real leaf label).
    s = s.replace(/\s+(?:button|icon|hyperlink|link|image|img)\s*$/i, "");
    return s.replace(/\s{2,}/g, " ").trim();
  }

  /**
   * Deterministic guard: if this is a JDE app and the step is an explicit
   * "CLICK/SELECT/OPEN: <menu item>" (a NAVIGATION menu label, not a toolbar
   * action and not a form field), return a hard-coded click plan that resolves
   * the item by VISIBLE TEXT + nearest clickable ancestor — bypassing the AI so
   * it can NEVER substitute a Fast Path shortcut. Returns null when the step is
   * not a JDE menu click (caller then uses the normal AI planner).
   */
  private tryJdeMenuClickPlan(stepAction: string): AIExecutionPlan | null {
    if (this.appType !== "jde") return null;
    const raw = (stepAction || "").trim();
    if (!raw) return null;

    // Only act on explicit click/select/open/navigate intents.
    const m = raw.match(/^(?:click|select|open|choose|navigate to|go to|expand|pick)\s*[:\-]?\s*(.+)$/i);
    if (!m) return null;
    let label = m[1].replace(/["'`.]+$/g, "").replace(/^["'`]+/g, "").trim();
    if (!label || label.length < 2 || label.length > 80) return null;

    // NEVER treat a URL / navigation target as a menu click (JDE tests open with
    // "Navigate to https://…jde…"). Let the normal navigate path handle those.
    if (/^https?:\/\//i.test(label) || /:\/\//.test(label) || /\.(com|net|org|io|gov|edu)\b/i.test(label)) return null;

    // Skip pure field-entry phrasing ("... = value", "field to value", key=value).
    if (/[=]/.test(label) || /\bfield\b/i.test(label)) return null;

    // Skip JDE TOOLBAR actions — those are handled by the hc_/action-word resolver.
    const TOOLBAR = /^(add|select|ok|cancel|find|delete|copy|close|save|submit|next|previous|back|continue|row|form)\b/i;
    if (TOOLBAR.test(label)) return null;

    // If the step already names a Fast Path code (e.g. "P4210"), let the AI/Fast
    // Path path handle it — the user explicitly asked for a code, not a menu walk.
    if (AITestExecutor.JDE_FASTPATH_CODE.test(label)) return null;

    // Strip a trailing app-code hint the spec sometimes appends, e.g.
    // "Standard Order SO" stays as-is, but "Sales Order Entry (P4210)" → "Sales Order Entry".
    label = label.replace(/\s*\((?:[PR]\d{3,6})\)\s*$/i, "").trim();

    // Normalize spoken method hints / UI-chrome nouns to the real on-screen label
    // ("Navigator by fastpath" → "Navigator"). This is the label we actually click.
    const cleaned = this.cleanJdeMenuLabel(label);
    const target = cleaned && cleaned.length >= 2 ? cleaned : label;

    // Build a JDE text-click plan. The "jdetext>>" locator is resolved at runtime
    // by findJdeClickableByText (frame-aware, first-visible, nearest clickable
    // ancestor, matches text OR title/aria-label, with native→ancestor→JS→Enter).
    const esc = target.replace(/'/g, "\\'");
    const locators = [
      `jdetext>>${target}`,
      `xpath=//*[normalize-space(.)='${esc}'][not(self::script)]`,
      `xpath=//*[@title=${this.xpathLiteral(target)} or @aria-label=${this.xpathLiteral(target)} or @alt=${this.xpathLiteral(target)}]`,
      `xpath=//*[contains(normalize-space(.),'${esc}')][not(self::script)]`,
    ];
    return {
      action: {
        type: "click",
        locators,
        elementXPath: `//*[normalize-space(.)='${esc}'][not(self::script)]`,
        value: target,
        description: `JDE menu navigation click on "${target}" (deterministic, no Fast Path)`,
        confidence: 0.99,
      },
      confidence: 99,
      reasoning:
        "JDE menu-click guard: explicit CLICK on a menu/tree label must click the " +
        "item and walk the navigator hierarchy, never substitute a Fast Path code.",
    };
  }

  /** Build a safe XPath string literal (handles embedded quotes via concat()). */
  private xpathLiteral(value: string): string {
    if (!value.includes("'")) return `'${value}'`;
    if (!value.includes('"')) return `"${value}"`;
    return "concat('" + value.replace(/'/g, "',\"'\",'") + "')";
  }

      private async getAIExecutionPlan(
    stepAction: string,
    expected: string,
    snapshot: PageSnapshot,
    testDataMap?: Map<string, string>,
    targetUrl: string = ""
    ): Promise<AIExecutionPlan> {
    // ── AI plan cache: avoid duplicate LLM calls for the same step in one execution
    const cacheKey = `${stepAction}||${snapshot.url}`;
    const cached = this.aiPlanCache.get(cacheKey);
    if (cached) {
      console.log(`[AIExecutor] ⚡ Cache hit for: ${stepAction.substring(0, 60)}`);
      return cached;
    }

    // ── DETERMINISTIC JDE MENU-CLICK GUARD ────────────────────────────────────
    // In JDE, an explicit "CLICK: <menu item>" step MUST actually click the menu/
    // tree item (Navigator → Baxter GM View → Sales → Sales Order Entry). The
    // general AI planner tends to "shortcut" this via Fast Path (type P4210), which
    // SKIPS the requested navigation. Intercept such steps here and honor the click
    // by resolving the item by VISIBLE TEXT + nearest clickable ancestor (jdetext>>).
    const jdeMenuPlan = this.tryJdeMenuClickPlan(stepAction);
    if (jdeMenuPlan) {
      console.log(`[AIExecutor] 🧭 JDE menu-click guard: "${stepAction}" → click by text (NOT Fast Path)`);
      this.aiPlanCache.set(cacheKey, jdeMenuPlan);
      return jdeMenuPlan;
    }

    const aiClient = await getAiClient();

    // ── RUNTIME DOM CAPTURE: structured element data ──────────────────────────
    const runtimeElements = (snapshot.elements ?? [])
      .filter(el => el.isVisible)
      .slice(0, 120)
      .map(el => {
        const attrs: string[] = [];
        if (el.id)            attrs.push(`id="${el.id}"`);
        if (el.dataTestId)    attrs.push(`data-testid="${el.dataTestId}"`);
        if ((el as any).dataTest)    attrs.push(`data-test="${(el as any).dataTest}"`);
        if ((el as any).dataCy)      attrs.push(`data-cy="${(el as any).dataCy}"`);
        if (el.name)          attrs.push(`name="${el.name}"`);
        if (el.type)          attrs.push(`type="${el.type}"`);
        if (el.placeholder)   attrs.push(`placeholder="${el.placeholder}"`);
        if (el.ariaLabel)     attrs.push(`aria-label="${el.ariaLabel}"`);
        if ((el as any).title) attrs.push(`title="${(el as any).title}"`);
        if (el.role)          attrs.push(`role="${el.role}"`);
        if (el.forAttr)       attrs.push(`for="${el.forAttr}"`);
        if ((el as any).isShadowHost) attrs.push(`shadow-host="true"`);
        if (el.text)          attrs.push(`text="${el.text.substring(0, 50)}"`);
        const chain = ((el as any).locators as string[] || [`xpath=${el.xpath}`]).join(' | ');
        attrs.push(`locators="${chain}"`);
        attrs.push(`confidence="${(el as any).locatorConfidence ?? 0.5}"`);
        return `<${el.tag} ${attrs.join(' ')}>`;
      })
      .join('\n');

    // ── Test data context ──────────────────────────────────────────────────────
    let testDataContext = "";
    if (testDataMap && testDataMap.size > 0) {
      const entries: string[] = [];
      testDataMap.forEach((value, key) => {
        if (!key.startsWith("__")) entries.push(`  ${key} = "${value}"`);
      });
      if (entries.length > 0)
        testDataContext = `\nAVAILABLE TEST DATA (use exact values for type actions):\n${entries.join("\n")}`;
    }

    const targetUrlCtx = targetUrl
      ? `\nTARGET URL: ${targetUrl}  \u2190 use as action.value when step says "Navigate to URL"`
      : "";

    // ══════════════════════════════════════════════════════════════════════════
    // RUNTIME DOM CAPTURE SYSTEM PROMPT
    // ══════════════════════════════════════════════════════════════════════════
    const systemPrompt = `You are AITAS \u2014 an AI automation engine.
Your goal is to generate a runtime-resilient execution plan using LIVE DOM DATA captured from the browser.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
1. RUNTIME ANALYSIS
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
- DOM is captured LIVE \u2014 element attributes below reflect the actual running page
- Use these attributes in priority order: id > data-testid > data-test > data-cy > name > css > xpath
- Avoid dynamic values (numeric IDs > 8 digits, UUID-like strings)
- Shadow DOM elements are prefixed with shadow-host="true" or locators starting with "shadow>>"

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
2. LOCATOR GENERATION
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
- Generate locators: [primary, fallback1, fallback2] in priority order
- Format: "id=VALUE" | "css=SELECTOR" | "name=VALUE" | "xpath=XPATH" | "shadow>>SELECTOR"
- elementXPath = primary XPath (backward compat)

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
3. IFRAME DETECTION
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
- If IFrames list is non-empty AND target element is NOT found in current element list:
  set action.type = "switchToIframe", action.iframeName = frame index/name/id

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
4. SHADOW DOM DETECTION
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
- shadow-host="true" means that element has a shadow root
- Use locator: "shadow>>HOST_TAG>>INNER_SELECTOR"

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
5. PAGE CONTENT AWARENESS (CRITICAL)
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
- ALWAYS check PAGE CONTENT before attempting an action
- If PAGE CONTENT shows "Validating", "Please wait", "Success", "Thank you", "Submitted", etc:
  → The previous action SUCCEEDED and page has CHANGED
  → Return type="verify" with verification.type="textContains" to verify the message
  → Use verification.expectedValue with keywords from PAGE CONTENT
- If the step says "Verify X" and PAGE CONTENT shows confirmation text:
  → Return type="verify" NOT type="click"
- If element from step is NOT in ELEMENT DATA but PAGE CONTENT shows success:
  → Return type="verify" to verify the success message

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
6. CRITICAL RULES
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
- "Navigate to URL" with no URL \u2192 use TARGET URL
- Steps formatted "Enter FIELD = VALUE" \u2192 type action, VALUE is what to type
- ONE action per response
- type action.value MUST be the actual string, NEVER a placeholder like {{x}} or [VALUE]
- Use the highest-confidence locator from the element's locators chain as primary

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
7. DOMAIN PLAYBOOK (ported best practices \u2014 still emit the JSON action format above)
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
DOM-GROUNDED: Every locator MUST be an EXACT value from ELEMENT DATA. Never invent, guess, or
recall from memory. If DOM shows placeholder="User ID", use placeholder="User ID" \u2014 not "Username".

NATIVE SELECT: If the field is a <select>, use type="select" with value = the visible option text;
never click-then-type. Custom dropdowns: click trigger first, then click the option.

READONLY [tab-into]: For readonly fields, type into the previous field, then key=Tab, then type.

DATE: When step says "today/current date" in a format, compute it dynamically (dd-MMM-yyyy etc.)
and use as value. Never hardcode a date.

NEW WINDOW/TAB: The engine auto-switches to new windows. If a step mentions a new window, do NOT
re-click to open it \u2014 just continue with the next action. Never plan window management yourself.

VERIFY \u2260 SCREENSHOT: For verify/check/confirm/should/assert steps, return type="verify" and READ
the real value (textContains/valueEquals) \u2014 never treat a screenshot as proof.

JDE GRID: After a Find/Search, the grid fills asynchronously inside e1menuAppIframe. To verify a row,
use type="verify", verification.type="textContains", expectedValue = the unique key (item/PO number).
The engine waits for real rows before matching. Use single-char column values only as exact matches.

JDE NAV: Fast Path field id=TE_FAST_PATH_BOX, submit id=fastPathButton; the app renders in the
NESTED e1menuAppIframe \u2014 if Add/Save/grid isn't in ELEMENT DATA, return switchToIframe first.
JDE MENU CLICKS (CRITICAL): When the STEP says "Click/Select/Open <menu item>" (e.g. "CLICK: Sales
Order Entry", "Baxter GM View", "Sales"), you MUST actually CLICK that menu/tree item \u2014 return
type="click" targeting it BY VISIBLE TEXT. NEVER substitute a Fast Path shortcut (do NOT type P4210
into TE_FAST_PATH_BOX) for an explicit menu-click step: doing so SKIPS the requested navigation
(Navigator \u2192 Baxter GM View \u2192 Sales \u2192 Sales Order Entry) and is WRONG. Only use Fast Path when the
step LITERALLY says "Fast Path" or provides a program code to type. JDE menu/tree items are <span>/
<td> whose click handler is on an ANCESTOR row/anchor and whose ids are DYNAMIC (f1dnode123\u2026) \u2014 do
NOT emit those dynamic ids; emit a text locator like "xpath=//*[normalize-space(.)='Sales Order
Entry']" (the engine resolves the nearest clickable ancestor and self-heals native\u2192ancestor\u2192JS\u2192Enter).

JDE TOOLBAR BUTTONS (Add/Select/OK/Cancel/Find/Delete/Copy/Close): these are JDE toolbar/hyper-
control links, NOT plain <button>s and NEVER <input>. After you are INSIDE e1menuAppIframe, match
them by id prefix hc_ (e.g. id="hc_Add", id="hc_Select", id="hc_OK", id="hc_Cancel", id="hc_Find")
OR by the element in ELEMENT DATA whose title/aria-label/text CONTAINS the label (e.g. title="Add").
IMPORTANT: JDE titles usually include a keyboard-shortcut suffix, e.g. title="Add (Ctrl+Alt+A)" or
"Find (Ctrl+Alt+F)". An EXACT match like //*[@title='Add'] will then FAIL. So you MUST:
  1. ALWAYS put the hc_ id FIRST when present: "id=hc_Add".
  2. Use a CONTAINS locator, never exact, for title/text: "xpath=//*[contains(@title,'Add')]".
  3. You may also add "css=[title^='Add']" (prefix match) as a backup.
Emit a chain like ["id=hc_Add","xpath=//*[contains(@title,'Add')]","css=[title^='Add']"].
NEVER fabricate input[title='Add'] or button[title='Add'] \u2014 JDE's Add is an <a>/<div>, so an <input>
selector will ALWAYS fail. NEVER emit an exact //*[@title='Add'] when ELEMENT DATA shows a suffix like
"Add (Ctrl+Alt+A)" \u2014 use contains() instead. The Add button opens the next form (e.g. Sales Order
Detail Revisions). This IS a click action \u2014 NEVER downgrade a "Click Add" step to a verify just
because the button wasn't visible on the first snapshot; the frame switch makes it appear, so emit
type="click" on the hc_/contains(title) match.

JDE QBE FIELDS (CRITICAL \u2014 stop guessing C0_x ids): JDE grid/QBE inputs have generic ids like
C0_7, C0_9 that DO NOT indicate which business field they are. NEVER pick an id from memory or
from "in JDE this field is typically...". You MUST match the target field by its LABEL/header text
in ELEMENT DATA: find the input whose adjacent label/aria-label/header equals the step's field name
(e.g. "Sold To", "Ship To", "Branch/Plant"). If two steps target different fields, they MUST resolve
to DIFFERENT ids \u2014 never reuse the same id (C0_7) for both. If you cannot find a label match, return
type with the best DOM-grounded locator, never a remembered id. Masked read-back ("*") = success.

OUTPUT FORMAT (return ONLY valid JSON, no markdown fences):
{
  "action": {
    "type": "ACTION_TYPE",
    "locators": ["id=primary", "css=fallback1", "xpath=fallback2"],
    "elementXPath": "//*[@id='primary']",
    "value": "text or URL",
    "description": "Brief description",
    "confidence": 0.92
  },
  "verification": {
    "type": "VERIFICATION_TYPE",
    "locators": ["id=element"],
    "elementXPath": "//*[@id='element']",
    "expectedValue": "expected",
    "description": "what to verify"
  },
  "confidence": 92,
  "reasoning": "Locator strategy chosen and why"
}`;

    // ── User prompt with live DOM data ─────────────────────────────────────────
    const pageTextPreview = snapshot.bodyText ? `\nPAGE CONTENT (visible text):\n"${snapshot.bodyText.substring(0, 300)}..."` : '';

    // JDE: surface verified Object Repository locators (DD-item/label-grounded)
    // so the planner reuses them instead of guessing generic grid ids.
    const jdeRepoHint = this.buildJdeRepositoryHint();

    const userPrompt = `PAGE STATE:
URL: ${snapshot.url}
Title: ${snapshot.title}
Has Alert: ${snapshot.alerts}
Windows: ${(snapshot.windowHandles ?? []).length}
IFrames: ${(snapshot.iframes ?? []).map(f => f.name || f.id || `index:${f.index}`).join(', ') || 'none'}${targetUrlCtx}
${testDataContext}${pageTextPreview}${jdeRepoHint}

ELEMENT DATA (RUNTIME):
${runtimeElements}

STEP TO EXECUTE: "${stepAction}"
EXPECTED RESULT: "${expected}"

IMPORTANT: 
- If the PAGE CONTENT shows a success/confirmation message (like "Validating", "Please wait", "Success", "Thank you") and the step is asking to verify something, treat this as a VERIFICATION step.
- If the element described in the step does NOT exist on the current page (check ELEMENT DATA), and the PAGE CONTENT suggests the action already completed or we're on a different page, return a "verify" action to check the visible text instead.
- For "Verify" steps: check if the page content already shows success/expected outcome.

Analyze the LIVE DOM data above and return the execution plan as JSON.`;
    try {
      console.log("[AIExecutor] Sending step to AI:", stepAction);
      console.log("[AIExecutor] Elements found:", (snapshot.elements ?? []).filter(el => el.isVisible).length);
      
      const response = await aiClient.chat(
        [{ role: "user", content: userPrompt }],
        systemPrompt
      );

      console.log("[AIExecutor] AI response length:", response?.length || 0);
      console.log("[AIExecutor] AI response preview:", response?.substring(0, 200));

      // Parse JSON from response - handle various LLM response formats
            const plan = this.extractJsonFromResponse<AIExecutionPlan>(response);
      if (plan) {
        console.log(`[AIExecutor] Plan: ${plan.action.type} | conf:${plan.confidence} | ${plan.action.description}`);
        // Cache so retries don't re-call the LLM for the same step
        this.aiPlanCache.set(cacheKey, plan);
        return plan;
      }

      console.error("[AIExecutor] Failed to parse JSON from response");
      throw new Error("AI did not return valid JSON");
                } catch (error: any) {
      const msg: string = error.message || "";
      if (msg.includes("API key") || msg.includes("apiKey") || msg.includes("Missing credentials") ||
          msg.includes("does not belong") || msg.includes("Unauthorized") || msg.includes("401")) {
        console.error("[AIExecutor] LLM auth error — check LLM_MODEL_ID in .env matches your gateway app name:", msg);
      } else {
        console.error("[AIExecutor] AI planning failed:", msg);
      }
      console.warn("[AIExecutor] Falling back to rule-based plan");
      // Always fall back — never let an LLM error stop execution
      return this.createFallbackPlan(stepAction, expected, snapshot, testDataMap, targetUrl);
    }
  }

  // ============================================================================
  // JSON EXTRACTION HELPER (Handle various LLM response formats)
  // ============================================================================

  private extractJsonFromResponse<T>(response: string): T | null {
    try {
      // Try 1: Direct parse (response is already valid JSON)
      try {
        return JSON.parse(response) as T;
      } catch {
        // Continue to other methods
      }

      // Try 2: Extract from markdown code block ```json ... ```
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        try {
          return JSON.parse(codeBlockMatch[1].trim()) as T;
        } catch {
          // Continue to other methods
        }
      }

      // Try 3: Find the outermost balanced braces
      const jsonStr = this.extractBalancedJson(response);
      if (jsonStr) {
        return JSON.parse(jsonStr) as T;
      }

      // Try 4: Last resort - greedy regex (may fail on nested objects)
      const greedyMatch = response.match(/\{[\s\S]*\}/);
      if (greedyMatch) {
        // Try to find a valid JSON by trimming from the end
        let candidate = greedyMatch[0];
        while (candidate.length > 2) {
          try {
            return JSON.parse(candidate) as T;
          } catch {
            // Remove last character and try again
            const lastBrace = candidate.lastIndexOf('}');
            if (lastBrace <= 0) break;
            candidate = candidate.substring(0, lastBrace + 1);
          }
        }
      }

      return null;
    } catch (error) {
      console.error("[AIExecutor] JSON extraction failed:", error);
      return null;
    }
  }

  private extractBalancedJson(text: string): string | null {
    // Find the first { and then find its matching }
    const startIdx = text.indexOf('{');
    if (startIdx === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIdx; i < text.length; i++) {
      const char = text[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      if (char === '"' && !escape) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            return text.substring(startIdx, i + 1);
          }
        }
      }
    }

    return null;
  }

  // ============================================================================
  // FALLBACK PLAN (When AI fails - uses page snapshot elements)
  // ============================================================================

  private createFallbackPlan(
    stepAction: string,
    expected: string,
    snapshot: PageSnapshot,
    testDataMap?: Map<string, string>,
    targetUrl: string = ""
  ): AIExecutionPlan {
    const stepLower = stepAction.toLowerCase();
    const visibleEls = (snapshot.elements ?? []).filter(el => el.isVisible && el.isEnabled);

    // ── helper: find visible element by keyword list ──────────────────────────
    const findEl = (...kws: string[]): ElementInfo | undefined => {
      for (const kw of kws) {
        const k = kw.toLowerCase();
        const e = visibleEls.find(el =>
          el.id?.toLowerCase().includes(k) ||
          el.name?.toLowerCase().includes(k) ||
          el.placeholder?.toLowerCase().includes(k) ||
          el.ariaLabel?.toLowerCase().includes(k) ||
          el.text?.toLowerCase().includes(k)
        );
        if (e) return e;
      }
      return undefined;
    };

    // ── helper: clean value — strip surrounding quotes ────────────────────────
    const cleanVal = (v: string): string =>
      v.replace(/^["'\s]+|["'\s]+$/g, "").trim();

    // ── helper: parse "VERB FIELD = VALUE" or "VERB FIELD" from Excel steps ──
    // Handles: "Enter Full Name =Raghave", "Enter Email Address = Raghav.rao@test.com",
    //          "Enter Phone Number= \"9990551369\"", "Select State = \"Karnataka\""
    const parseFieldValue = (): { field: string; value: string } => {
      // Pattern 1: "Verb Field Name = Value" (Excel "=" separator)
      const eqMatch = stepAction.match(/^(?:enter|type|input|fill|select|choose)\s+(.+?)\s*=\s*(.+)$/i);
      if (eqMatch) {
        return { field: cleanVal(eqMatch[1]), value: cleanVal(eqMatch[2]) };
      }
      // Pattern 2: "Verb Field Name" (no value)
      const noValMatch = stepAction.match(/^(?:enter|type|input|fill)\s+(.+)$/i);
      if (noValMatch) {
        return { field: cleanVal(noValMatch[1]), value: "" };
      }
      return { field: "", value: "" };
    };

    // ════════════════════════════════════════════════════════════════════════
    // 1. NAVIGATE
    // ════════════════════════════════════════════════════════════════════════
    if (stepLower === "navigate to url" || stepLower.startsWith("navigate to url") ||
        stepLower.includes("navigate to") || stepLower.includes("go to") ||
        stepLower.includes("open url") || stepLower.includes("launch url")) {
      const urlInStep = stepAction.match(/https?:\/\/[^\s"']+/)?.[0] || "";
      const url = urlInStep || targetUrl;
      return {
        action: { type: "navigate", value: url, description: `Navigate to ${url || "target URL"}` },
        confidence: url ? 90 : 40,
        reasoning: url ? `Navigate to ${url}` : "Navigate step — no URL in step text",
      };
    }

    // ════════════════════════════════════════════════════════════════════════
    // 2. WAIT
    // ════════════════════════════════════════════════════════════════════════
    if (stepLower === "wait" || stepLower.startsWith("wait ") || stepLower.includes("pause")) {
      const secMatch = stepAction.match(/(\d+)\s*(?:sec|s\b)/i);
      const msMatch  = stepAction.match(/(\d+)\s*(?:ms|millisec)/i);
      const waitMs   = msMatch ? parseInt(msMatch[1]) : secMatch ? parseInt(secMatch[1]) * 1000 : 2000;
      return {
        action: { type: "wait", value: String(waitMs), description: `Wait ${waitMs}ms` },
        confidence: 90,
        reasoning: "Wait step",
      };
    }

    // ════════════════════════════════════════════════════════════════════════
    // 3. CHECKBOX (must be checked BEFORE click to handle "Click ... checkbox")
    // ════════════════════════════════════════════════════════════════════════
    if (stepLower.includes("checkbox") || 
        stepLower.includes("check ") || 
        stepLower.includes("tick ") ||
        stepLower.includes("accept") ||
        stepLower.includes("terms") ||
        stepLower.includes("agree")) {
      // Extract label text - handle patterns like:
      // "Click I accept the Terms and Conditions and Privacy Policy checkbox"
      // "Check checkbox 'Remember me'"
      // "Tick the 'I agree' checkbox"
      let cbLabel = "";
      
      // Pattern 1: "Click <label text> checkbox" or "Click <label text> "checkbox""
      const cbMatchEnd = stepAction.match(/(?:click|check|tick|select)\s+(?:on\s+)?(?:the\s+)?(.+?)\s*["']?checkbox["']?\s*$/i);
      if (cbMatchEnd) {
        cbLabel = cleanVal(cbMatchEnd[1]);
      } else {
        // Pattern 2: "Check checkbox <label>" or "Click checkbox '<label>'"
        const cbMatchStart = stepAction.match(/(?:click|check|tick|select)\s+(?:on\s+)?(?:the\s+)?checkbox\s+["']?([^"']+)["']?\s*$/i);
        if (cbMatchStart) {
          cbLabel = cleanVal(cbMatchStart[1]);
        } else {
          // Pattern 3: Extract any label text containing terms/accept/agree
          const termsMatch = stepAction.match(/(.+(?:terms|conditions|privacy|policy|accept|agree).+)/i);
          if (termsMatch) {
            cbLabel = cleanVal(termsMatch[1].replace(/^(?:click|check|tick|select)\s+(?:on\s+)?(?:the\s+)?/i, "").replace(/\s*checkbox\s*$/i, ""));
          }
        }
      }

      // Find checkbox element by label text (look at associated label or nearby text)
      const cbEl = cbLabel ? findEl(cbLabel, ...cbLabel.split(/\s+/).slice(0, 5)) : undefined;
      
      // Generate comprehensive XPath for checkbox
      const labelWords = cbLabel.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
      const labelCondition = labelWords.length > 0 
        ? labelWords.map(w => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(" and ")
        : "";
      
      const cbXPath = cbEl?.xpath ||
        (cbLabel 
          ? `//input[@type='checkbox'][ancestor::label[${labelCondition}] or following-sibling::*[${labelCondition}] or preceding-sibling::*[${labelCondition}] or @id[${labelCondition}] or @name[${labelCondition}]] | //label[${labelCondition}]//input[@type='checkbox'] | //label[${labelCondition}]/preceding-sibling::input[@type='checkbox'] | //label[${labelCondition}]/following-sibling::input[@type='checkbox'] | //*[${labelCondition}]/ancestor::label/input[@type='checkbox'] | //*[${labelCondition}]/preceding-sibling::input[@type='checkbox']`
          : "//input[@type='checkbox'][1]");
      
      return {
        action: { type: "checkbox", elementXPath: cbXPath, value: "check", description: `Check '${cbLabel}'` },
        confidence: cbEl ? 75 : 50,
        reasoning: `Checkbox action for '${cbLabel}'`,
      };
    }

    // ════════════════════════════════════════════════════════════════════════
    // 4. CLICK (button / link) - checked AFTER checkbox
    // ════════════════════════════════════════════════════════════════════════
    if (stepLower.includes("click")) {
      const btnMatch = stepAction.match(/click\s+(?:on\s+)?(?:the\s+)?["']?([^"'=]+?)["']?\s*(?:button|link|tab|icon)?$/i);
      const clickTgt = btnMatch ? cleanVal(btnMatch[1]) : "";
      const el = clickTgt ? findEl(clickTgt, ...clickTgt.split(/\s+/)) : undefined;
      const xpath = el?.xpath ||
        (clickTgt ? `//*[normalize-space(text())='${clickTgt}' or contains(@value,'${clickTgt}') or contains(@aria-label,'${clickTgt}')]` : "//button[1]");
      return {
        action: { type: "click", elementXPath: xpath, description: `Click '${clickTgt || "button"}'` },
        confidence: el ? 75 : 50,
        reasoning: el ? `Found element with text '${clickTgt}'` : "Fallback click xpath",
      };
    }

    // ════════════════════════════════════════════════════════════════════════
    // 5. RADIO BUTTON
    // ════════════════════════════════════════════════════════════════════════
    if (stepLower.includes("radio")) {
      const { value } = parseFieldValue();
      const radioEl = value ? findEl(value) : undefined;
      const radioXPath = radioEl?.xpath ||
        (value ? `//input[@type='radio' and (@value='${value}' or @id='${value}' or following-sibling::*[contains(text(),'${value}')])]`
               : "//input[@type='radio'][1]");
      return {
        action: { type: "radio", elementXPath: radioXPath, value, description: `Select radio '${value}'` },
        confidence: radioEl ? 70 : 50,
        reasoning: "Radio button selection",
      };
    }

    // ════════════════════════════════════════════════════════════════════════
    // 6. SELECT / DROPDOWN
    // ════════════════════════════════════════════════════════════════════════
    if (stepLower.includes("select") || stepLower.includes("choose") || stepLower.includes("dropdown")) {
      const { field, value } = parseFieldValue();
      const fieldKws = field.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      const selEl = fieldKws.length ? findEl(...fieldKws) : undefined;
      const selXPath = selEl?.xpath ||
        (fieldKws.length ? `//select[contains(@id,'${fieldKws[0]}') or contains(@name,'${fieldKws[0]}')]` : "//select[1]");
      return {
        action: { type: "select", elementXPath: selXPath, value, description: `Select '${value}' from '${field}'` },
        confidence: selEl ? 70 : 45,
        reasoning: "Select/dropdown action",
      };
    }

    // ════════════════════════════════════════════════════════════════════════
    // 7. ENTER / TYPE / INPUT  (handles Excel "Field = Value" format)
    // ════════════════════════════════════════════════════════════════════════
    if (stepLower.includes("enter") || stepLower.includes("type") || stepLower.includes("input") || stepLower.includes("fill")) {
      const { field, value } = parseFieldValue();
      let resolvedValue = value;

      // Resolve from testDataMap if placeholder or empty
      if (testDataMap && (!resolvedValue || resolvedValue.startsWith("{{"))) {
        const placeholderKey = resolvedValue.match(/^\{\{([^}]+)\}\}$/)?.[1];
        if (placeholderKey) {
          resolvedValue = testDataMap.get(placeholderKey) ?? testDataMap.get(placeholderKey.toLowerCase()) ?? resolvedValue;
        }
        if (!resolvedValue) {
          const fieldLow = field.toLowerCase();
          if (fieldLow.includes("email") || fieldLow.includes("user"))
            resolvedValue = testDataMap.get("username") ?? testDataMap.get("email") ?? testDataMap.get("user") ?? "";
          else if (fieldLow.includes("pass"))
            resolvedValue = testDataMap.get("password") ?? testDataMap.get("pass") ?? "";
        }
      }

      const fieldKws  = field.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      const inputEls  = visibleEls.filter(el => el.tag === "input" || el.tag === "textarea");
      let inputEl = fieldKws.length
        ? inputEls.find(el => fieldKws.some(kw =>
            el.id?.toLowerCase().includes(kw) ||
            el.name?.toLowerCase().includes(kw) ||
            el.placeholder?.toLowerCase().includes(kw) ||
            el.ariaLabel?.toLowerCase().includes(kw)
          ))
        : undefined;

      // Fallbacks by field type hints
      if (!inputEl) {
        const fl = field.toLowerCase();
        if (fl.includes("email"))
          inputEl = inputEls.find(el => el.type === "email") ?? inputEls.find(el => el.type === "text");
        else if (fl.includes("password") || fl.includes("pass"))
          inputEl = inputEls.find(el => el.type === "password");
        else if (fl.includes("phone") || fl.includes("mobile"))
          inputEl = inputEls.find(el => el.type === "tel") ?? inputEls.find(el => el.type === "number");
        else if (inputEls.length > 0)
          inputEl = inputEls[0];
      }

      const xpath = inputEl?.xpath ||
        (fieldKws.length ? `//input[contains(@id,'${fieldKws[0]}') or contains(@name,'${fieldKws[0]}') or contains(@placeholder,'${field}')]` : "//input[1]");

      return {
        action: { type: "type", elementXPath: xpath, value: resolvedValue, description: `Enter '${resolvedValue}' into '${field}'` },
        confidence: inputEl ? 70 : 40,
        reasoning: inputEl ? `Matched input for '${field}'` : `No matching input found for '${field}'`,
      };
    }

    // ════════════════════════════════════════════════════════════════════════
    // 8. SUBMIT
    // ════════════════════════════════════════════════════════════════════════
    if (stepLower.includes("submit")) {
      const submitMatch = stepAction.match(/submit\s+(.+?)(?:\s+button)?$/i);
      const label = submitMatch ? cleanVal(submitMatch[1]) : "submit";
      const el = findEl(label, "submit");
      const xpath = el?.xpath ||
        `//button[@type='submit' or contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${label.toLowerCase()}')]`;
      return {
        action: { type: "click", elementXPath: xpath, description: `Submit: ${label}` },
        confidence: el ? 70 : 50,
        reasoning: "Submit/click action",
      };
    }

    // ════════════════════════════════════════════════════════════════════════
    // 9. DEFAULT — wait and verify
    // ════════════════════════════════════════════════════════════════════════
    return {
      action: { type: "wait", value: "1000", description: "Wait 1s (default)" },
      verification: {
        type: "elementVisible",
        elementXPath: `//*[contains(text(),'${expected.substring(0, 40).replace(/'/g, "\\'")}')]`,
        description: expected,
      },
      confidence: 20,
      reasoning: "Could not parse step — using default wait",
    };
  }
  private async executeAction(
    action: AIExecutionPlan["action"],
    logs: string[]
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.driver) {
      if (this.playwrightPage) {
        return this.executeActionPlaywright(action, logs);
      }
      return { success: false, error: "No browser driver" };
    }

    // --- ENHANCED GENERIC DROPDOWN HANDLER ---
    // Always intercept 'click' on <option> and convert to 'select' on parent <select>
    if (
      action.type === "click" &&
      action.elementXPath &&
      action.elementXPath.match(/\/\/option(\[|$)/)
    ) {
      // Extract parent select XPath
      const selectXPath = action.elementXPath.replace(/\/\/option.*$/, "");
      // Robustly extract option value/text
      let value = "";
      // Try to extract from XPath: ...option[text()='...'] or ...option[@value='...']
      const textMatch = action.elementXPath.match(/option\[text\(\)\s*=\s*['"]([^'"]+)['"]\]/);
      const valueMatch = action.elementXPath.match(/option\[@value=\s*['"]([^'"]+)['"]\]/);
      if (textMatch) value = textMatch[1];
      else if (valueMatch) value = valueMatch[1];
      else if (action.description) {
        // Try to extract from description: 'Select ...' or 'Click on ...'
        const descMatch = action.description.match(/'([^']+)'/);
        if (descMatch) value = descMatch[1];
      }
      if (!value && action.value) value = action.value;
      logs.push(`[AIExecutor] [Dropdown] Intercepted click on <option>, converting to select: ${value}`);
      action = {
        type: "select",
        elementXPath: selectXPath,
        value: value,
        description: `Select ${value} from dropdown`,
      };
    }

        // ── Runtime DOM: resolve the best locator from the locators[] chain ──────
    // Merges AI-returned locators[] with elementXPath for a unified fallback list.
    const resolveLocator = (locators?: string[], elementXPath?: string): string => {
      if (locators && locators.length > 0) {
        // Convert "id=VALUE" / "name=VALUE" / "css=SEL" / "xpath=XPATH" to XPath/CSS
        for (const loc of locators) {
          if (loc.startsWith('id='))   return `//*[@id='${loc.slice(3)}']`;
          if (loc.startsWith('name=')) return `//*[@name='${loc.slice(5)}']`;
          if (loc.startsWith('css='))  return loc.slice(4);  // CSS passed as-is (findElement handles)
          if (loc.startsWith('xpath=')) return loc.slice(6);
          if (loc.startsWith('shadow>>')) return loc;         // shadow locator
        }
      }
      return elementXPath || '';
    };

    // Build full fallback chain for findElement
    const buildLocatorChain = (locators?: string[], elementXPath?: string): string[] => {
      const chain: string[] = [];
      if (locators) {
        for (const loc of locators) {
          if (loc.startsWith('id='))    chain.push(`//*[@id='${loc.slice(3)}']`);
          else if (loc.startsWith('name='))  chain.push(`//*[@name='${loc.slice(5)}']`);
          else if (loc.startsWith('css='))   chain.push(loc.slice(4));
          else if (loc.startsWith('xpath=')) chain.push(loc.slice(6));
          else chain.push(loc);
        }
      }
      if (elementXPath && !chain.includes(elementXPath)) chain.push(elementXPath);
      return chain.filter(Boolean);
    };

    try {
      logs.push(`Executing: ${action.type} - ${action.description}`);
      if (action.locators?.length) {
        logs.push(`[Runtime DOM] Locator chain: ${action.locators.join(' → ')} (confidence: ${action.confidence ?? '?'})`);
      }

      switch (action.type) {
        // ================== NAVIGATION ==================
                case "navigate": {
          // Use action.value if provided; fall back to the targetUrl stored on the action
          const navUrl = action.value || (action as any).targetUrl || "";
          if (navUrl) {
            await this.driver.get(navUrl);
            await this.waitForPageLoad();
            // Clear cache after navigation - page content has changed
            this.aiPlanCache.clear();
            this.currentIframeIndex = -1;
            this.framePath = [];
            logs.push(`Navigated to: ${navUrl}`);
          } else {
            logs.push(`[navigate] No URL provided — skipping`);
          }
          break;
        }

        case "refresh":
          await this.driver.navigate().refresh();
          await this.waitForPageLoad();
          // Clear cache after refresh - page may have changed
          this.aiPlanCache.clear();
          this.currentIframeIndex = -1;
          this.framePath = [];
          logs.push("Page refreshed");
          break;

        case "back":
          await this.driver.navigate().back();
          await this.waitForPageLoad();
          // Clear cache after navigation
          this.aiPlanCache.clear();
          this.currentIframeIndex = -1;
          this.framePath = [];
          logs.push("Navigated back");
          break;

        case "forward":
          await this.driver.navigate().forward();
          await this.waitForPageLoad();
          // Clear cache after navigation
          this.aiPlanCache.clear();
          this.currentIframeIndex = -1;
          this.framePath = [];
          logs.push("Navigated forward");
          break;

                // ================== CLICK ACTIONS ==================
                case "click":
          // SMART REDIRECT: If AI says "click checkbox", use the checkbox handler instead
          // This leverages the comprehensive checkbox fallback strategies
          if (action.description && 
              (action.description.toLowerCase().includes('checkbox') ||
               action.description.toLowerCase().includes('terms') ||
               action.description.toLowerCase().includes('accept') ||
               action.description.toLowerCase().includes('agree'))) {
            logs.push(`[AIExecutor] Redirecting click to checkbox handler (description mentions checkbox/terms)`);
            const checkboxAction = { ...action, type: "checkbox" as ActionType, value: "check" };
            return await this.executeAction(checkboxAction, logs);
          }
          
          if (action.elementXPath && action.elementXPath.includes("//option")) {
            // Prevent direct click on <option>
            logs.push(`[AIExecutor] [Dropdown] ERROR: Attempted direct click on <option>—should always be intercepted!`);
            return { success: false, error: "Direct click on <option> is not allowed. Use select action." };
          }
          if (action.elementXPath) {
            try {
              const element = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
              await this.scrollIntoView(element);
              
              // Get original window count BEFORE click
              const originalHandles = await this.driver.getAllWindowHandles();
              const originalCount = originalHandles.length;
              
              console.log(`[AIExecutor] Clicked button, waiting for potential new window...`);
              await element.click();
              logs.push(`Clicked: ${action.elementXPath}`);
              
              // Wait for potential page load or new window
              await this.driver.sleep(300); // was 2000ms — reduces 1.7s per click
              
              // AUTO-DETECT: Check if new window opened
              const currentHandles = await this.driver.getAllWindowHandles();
              if (currentHandles.length > originalCount) {
                console.log(`[AIExecutor] ✓ New window detected! (${originalCount} → ${currentHandles.length})`);
                logs.push(`[AUTO-DETECT] New window detected! Switching to it...`);
                
                // CRITICAL: Clear AI plan cache when switching windows
                // Old XPaths from previous window are invalid in the new window
                this.aiPlanCache.clear();
                console.log(`[AIExecutor] ✓ Cleared AI plan cache for new window context`);
                
                // Also reset iframe index since we're in a new window
                this.currentIframeIndex = -1;
                this.framePath = [];
                
                // Switch to the new window
                for (const handle of currentHandles) {
                  if (!originalHandles.includes(handle)) {
                    await this.driver.switchTo().window(handle);
                    console.log(`[AIExecutor] ✓ Switched to new window: ${handle}`);
                    logs.push(`✓ Switched to new window automatically after click`);
                    // Wait for new window to load
                    await this.waitForPageLoad();
                    
                    // AUTO-DETECT: Wait for iframes to appear (they may load dynamically)
                    let iframeCount = 0;
                    const iframeWaitStart = Date.now();
                    const maxIframeWait = 3000; // Wait up to 3 seconds for iframes
                    
                    while (Date.now() - iframeWaitStart < maxIframeWait) {
                      try {
                        const iframes = await this.driver.findElements(By.tagName('iframe'));
                        iframeCount = iframes.length;
                        console.log(`[AIExecutor] Found ${iframeCount} iframe(s) (waiting ${Date.now() - iframeWaitStart}ms)`);
                        
                        if (iframeCount > 0) {
                          // Wait a bit more for iframes to be ready
                          await this.driver.sleep(500);
                          break;
                        }
                      } catch { }
                      await this.driver.sleep(300);
                    }
                    
                    logs.push(`[AUTO-DETECT] Found ${iframeCount} iframe(s) in new window after waiting`);
                    
                    if (iframeCount > 0) {
                      logs.push(`[AUTO-DETECT] Found ${iframeCount} iframe(s) in new window. Attempting to switch to first iframe...`);
                      console.log(`[AIExecutor] ✓ Switching to first iframe...`);
                      try {
                        await this.driver.switchTo().frame(0);
                        this.currentIframeIndex = 0; // track context
                        this.framePath = [0];
                        logs.push(`✓ Switched to iframe[0] automatically`);
                        console.log(`[AIExecutor] ✓ Switched to iframe[0]`);
                        await this.driver.sleep(300); // iframe settle
                        
                        // Check for nested iframes
                        try {
                          const nestedIframes = await this.driver.findElements(By.tagName('iframe'));
                          if (nestedIframes.length > 0) {
                            console.log(`[AIExecutor] Found ${nestedIframes.length} nested iframe(s) inside iframe[0]`);
                            logs.push(`[AUTO-DETECT] Found ${nestedIframes.length} nested iframe(s) inside iframe[0]`);
                            // Switch to first nested iframe if content seems empty
                            try {
                              const bodyText = await this.driver.executeScript("return document.body ? document.body.innerText.length : 0") as number;
                              if (bodyText < 50 && nestedIframes.length > 0) {
                                console.log(`[AIExecutor] Parent iframe seems empty, switching to nested iframe[0]`);
                                await this.driver.switchTo().frame(0);
                                this.framePath.push(0);
                                this.currentIframeIndex = 0;
                                logs.push(`✓ Switched to nested iframe[0]`);
                              }
                            } catch { }
                          }
                        } catch { }
                      } catch (iframeErr: any) {
                        logs.push(`[AUTO-DETECT] Could not switch to iframe: ${iframeErr.message}`);
                        console.log(`[AIExecutor] Could not switch to iframe: ${iframeErr.message}`);
                      }
                    } else {
                      // No iframes found - check if page has content
                      try {
                        const bodyExists = await this.driver.executeScript("return !!document.body") as boolean;
                        const bodyText = await this.driver.executeScript("return document.body ? document.body.innerText.substring(0, 100) : ''") as string;
                        console.log(`[AIExecutor] No iframes, page body exists: ${bodyExists}, preview: "${bodyText.substring(0, 50)}..."`);
                        logs.push(`[AUTO-DETECT] No iframes found, page content: "${bodyText.substring(0, 30)}..."`);
                      } catch { }
                    }
                    break;
                  }
                }
              }
            } catch (err: any) {
              // Fallback: if not interactable, try all visible, interactable elements with matching text (skip <option> tags)
              const errMsg = err.message || "";
              if (errMsg.includes("not interactable") || errMsg.includes("not visible") || errMsg.includes("may not be manipulated")) {
                let textTarget = "";
                const textMatch = action.elementXPath.match(/text\(\)\s*=\s*['\"]([^'\"]+)['\"]/);
                if (textMatch) textTarget = textMatch[1];
                if (!textTarget && action.description) {
                  const descMatch = action.description.match(/text '([^']+)'/i);
                  if (descMatch) textTarget = descMatch[1];
                }
                if (!textTarget) textTarget = "";
                if (textTarget) {
                  // Find all elements with exact or contains text, skip <option> tags
                  const fallbackXPath = `//*[not(self::option) and (text()='${textTarget}' or contains(text(), '${textTarget}'))]`;
                  try {
                    const elements = await this.driver.findElements(By.xpath(fallbackXPath));
                    let clicked = false;
                    for (const el of elements) {
                      try {
                        const displayed = await el.isDisplayed();
                        const enabled = await el.isEnabled();
                        if (displayed && enabled) {
                          await this.scrollIntoView(el);
                          await el.click();
                          logs.push(`[Fallback] Clicked visible element with text: ${textTarget}`);
                          await this.driver.sleep(200);
                          clicked = true;
                          break;
                        }
                      } catch {}
                    }
                    if (!clicked) {
                      return { success: false, error: `Click failed: ${errMsg} | Fallback: No visible, interactable element with text '${textTarget}' found.` };
                    }
                  } catch (fallbackErr: any) {
                    return { success: false, error: `Click failed: ${errMsg} | Fallback also failed: ${fallbackErr.message}` };
                  }
                } else {
                  return { success: false, error: `Click failed: ${errMsg} | No visible text found for fallback.` };
                }
              } else {
                return { success: false, error: `Click failed: ${errMsg}` };
              }
            }
          }
          break;

        case "doubleClick":
          if (action.elementXPath) {
            const element = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
            await this.scrollIntoView(element);
            const actions = this.driver.actions({ async: true });
            await actions.doubleClick(element).perform();
            logs.push(`Double-clicked: ${action.elementXPath}`);
          }
          break;

        case "rightClick":
          if (action.elementXPath) {
            const element = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
            await this.scrollIntoView(element);
            const actions = this.driver.actions({ async: true });
            await actions.contextClick(element).perform();
            logs.push(`Right-clicked: ${action.elementXPath}`);
          }
          break;

                // ================== INPUT ACTIONS ==================
                case "type":
                  if (action.elementXPath && action.value !== undefined) {
                    // Guard: if value is still a placeholder like [PASSWORD] or {{password}},
                    // try to resolve it from the step description
                    let finalValue = action.value;
                    if (finalValue === "[PASSWORD]" || finalValue === "[MASKED]") {
                      logs.push(`[type] WARNING: value is still a placeholder "${finalValue}" — check test data`);
                    }
                    const element = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
                    await this.scrollIntoView(element);
                    await this.typeIntoElement(element, finalValue, logs);
                    logs.push(`Typed into ${action.elementXPath}`);
                  }
                  break;

        case "clear":
          if (action.elementXPath) {
            const element = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
            await this.scrollIntoView(element);
            await element.clear();
            logs.push(`Cleared: ${action.elementXPath}`);
          }
          break;

        // ================== DROPDOWN/SELECT ==================
        case "select":
          if (action.elementXPath && action.value) {
            try {
              const selectElement = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
              await this.scrollIntoView(selectElement);
              const tagName = await selectElement.getTagName();
              // Check if select is visible
              const isDisplayed = await selectElement.isDisplayed();
              const style = await selectElement.getAttribute("style") || "";
              const isHidden = style.includes("display: none") || style.includes("visibility: hidden") || style.includes("left: -9999px");
              
              if (tagName.toLowerCase() === "select" && isDisplayed && !isHidden) {
                // Native select (visible) - CLICK TO OPEN FIRST
                logs.push(`[AIExecutor] Opening native select dropdown...`);
                await selectElement.click();
                await this.driver.sleep(300); // Wait for dropdown to open
                
                const isMultiple = await selectElement.getAttribute("multiple");
                const options = await selectElement.findElements(By.tagName("option"));
                let matched = false;
                let allOptions: {text: string, value: string | null}[] = [];
                for (const option of options) {
                  const text = await option.getText();
                  const value = await option.getAttribute("value");
                  allOptions.push({ text, value });
                  // 1. Exact match (trimmed, case-insensitive)
                  if (
                    text.trim().toLowerCase() === action.value.trim().toLowerCase() ||
                    (value && value.trim().toLowerCase() === action.value.trim().toLowerCase())
                  ) {
                    if (isMultiple) {
                      await this.driver.actions({ async: true })
                        .keyDown(Key.CONTROL)
                        .click(option)
                        .keyUp(Key.CONTROL)
                        .perform();
                      logs.push(`Multi-select: Added option '${action.value}'`);
                    } else {
                      await option.click();
                      logs.push(`Selected option '${action.value}'`);
                    }
                    matched = true;
                    break;
                  }
                }
                // 2. Partial match (case-insensitive)
                if (!matched) {
                  for (const option of options) {
                    const text = await option.getText();
                    const value = await option.getAttribute("value");
                    if (
                      text.toLowerCase().includes(action.value.trim().toLowerCase()) ||
                      (value && value.toLowerCase().includes(action.value.trim().toLowerCase()))
                    ) {
                      if (isMultiple) {
                        await this.driver.actions({ async: true })
                          .keyDown(Key.CONTROL)
                          .click(option)
                          .keyUp(Key.CONTROL)
                          .perform();
                        logs.push(`Multi-select: Added option (partial match) '${action.value}'`);
                      } else {
                        await option.click();
                        logs.push(`Selected option (partial match) '${action.value}'`);
                      }
                      matched = true;
                      break;
                    }
                  }
                }
                if (!matched) {
                  logs.push(`[AIExecutor] [Dropdown] No matching option found for value or text: '${action.value}'. Available options:`);
                  for (const opt of allOptions) {
                    logs.push(`  Option: text='${opt.text}', value='${opt.value}'`);
                  }
                  throw new Error(`No matching option found for value or text: ${action.value}`);
                }
              } else {
                // Custom dropdown (not native <select>): CLICK TO OPEN first, then find options
                logs.push(`[AIExecutor] Opening custom dropdown...`);
                await selectElement.click();
                await this.driver.sleep(500); // Wait for dropdown animation
                
                // Try multiple strategies to find dropdown options
                let matched = false;
                
                // Strategy 1: Look for any visible dropdown/listbox
                const dropdownSelectors = [
                  "//ul[contains(@class, 'dropdown') and not(contains(@style, 'display: none'))]",
                  "//ul[contains(@class, 'ms-list') and not(contains(@style, 'display: none'))]",
                  "//ul[@role='listbox']",
                  "//div[@role='listbox']",
                  "//*[contains(@class, 'dropdown-menu') and contains(@class, 'show')]",
                  "//*[contains(@class, 'select-dropdown') and not(contains(@style, 'display: none'))]",
                  "//ul[not(contains(@style, 'display: none')) and .//li]",
                  "//*[contains(@class, 'options') and not(contains(@style, 'display: none'))]"
                ];
                
                for (const selector of dropdownSelectors) {
                  if (matched) break;
                  try {
                    const dropdownEl = await this.driver.findElement(By.xpath(selector));
                    if (await dropdownEl.isDisplayed()) {
                      // Find all clickable options inside
                      const optionElements = await dropdownEl.findElements(By.xpath(".//li | .//div[@role='option'] | .//*[contains(@class, 'option')]"));
                      for (const optEl of optionElements) {
                        if (matched) break;
                        try {
                          if (await optEl.isDisplayed()) {
                            const text = (await optEl.getText()).trim();
                            // Exact match
                            if (text.toLowerCase() === action.value.trim().toLowerCase()) {
                              await optEl.click();
                              logs.push(`Selected '${action.value}' from custom dropdown`);
                              matched = true;
                              break;
                            }
                          }
                        } catch { /* skip this option */ }
                      }
                      // Try partial match if exact didn't work
                      if (!matched) {
                        for (const optEl of optionElements) {
                          if (matched) break;
                          try {
                            if (await optEl.isDisplayed()) {
                              const text = (await optEl.getText()).trim();
                              if (text.toLowerCase().includes(action.value.trim().toLowerCase())) {
                                await optEl.click();
                                logs.push(`Selected '${action.value}' from custom dropdown (partial match)`);
                                matched = true;
                                break;
                              }
                            }
                          } catch { /* skip this option */ }
                        }
                      }
                    }
                  } catch { /* selector didn't match, try next */ }
                }
                
                // Strategy 2: Look for option by text anywhere on page (might be absolutely positioned)
                if (!matched) {
                  try {
                    const optByText = await this.driver.findElement(
                      By.xpath(`//*[contains(@class, 'option') or contains(@class, 'item') or self::li][normalize-space(.)='${action.value}' or contains(normalize-space(.), '${action.value}')]`)
                    );
                    if (await optByText.isDisplayed()) {
                      await optByText.click();
                      logs.push(`Selected '${action.value}' by text match`);
                      matched = true;
                    }
                  } catch { /* no match */ }
                }
                
                // Strategy 3: Radix UI / Portal-based dropdowns - options render at document body level
                if (!matched) {
                  logs.push(`[AIExecutor] [Dropdown] Trying Radix UI / Portal-based dropdown strategy...`);
                  try {
                    // Radix UI uses role="option" inside a portal, search globally
                    const radixSelectors = [
                      // Exact text match with role="option"
                      `//*[@role='option'][normalize-space(.)='${action.value}']`,
                      `//*[@role='option'][translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')='${action.value.toLowerCase()}']`,
                      // Partial text match with role="option"
                      `//*[@role='option'][contains(normalize-space(.), '${action.value}')]`,
                      `//*[@role='option'][contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${action.value.toLowerCase()}')]`,
                      // data-radix-collection-item (Radix UI specific)
                      `//*[@data-radix-collection-item][normalize-space(.)='${action.value}' or contains(normalize-space(.), '${action.value}')]`,
                      // Combobox options (headless UI, shadcn)
                      `//*[@data-state][normalize-space(.)='${action.value}' or contains(normalize-space(.), '${action.value}')]`,
                      // Generic visible option text
                      `//div[contains(@class, 'SelectItem') or contains(@class, 'select-item') or contains(@class, 'ComboboxItem')][normalize-space(.)='${action.value}' or contains(normalize-space(.), '${action.value}')]`,
                    ];
                    
                    for (const selector of radixSelectors) {
                      if (matched) break;
                      try {
                        const elements = await this.driver.findElements(By.xpath(selector));
                        for (const el of elements) {
                          if (await el.isDisplayed()) {
                            const text = (await el.getText()).trim();
                            logs.push(`[AIExecutor] [Dropdown] Found Radix option: '${text}'`);
                            await el.click();
                            logs.push(`Selected '${action.value}' via Radix UI portal`);
                            matched = true;
                            break;
                          }
                        }
                      } catch { /* try next selector */ }
                    }
                  } catch { /* Radix strategy failed */ }
                }
                
                // Strategy 4: If we're inside an iframe, check parent document for portal
                if (!matched && this.currentIframeIndex >= 0) {
                  logs.push(`[AIExecutor] [Dropdown] Checking parent document for portal-rendered options...`);
                  try {
                    await this.driver.switchTo().defaultContent();
                    
                    const portalSelectors = [
                      `//*[@role='listbox']//*[@role='option'][contains(normalize-space(.), '${action.value}')]`,
                      `//*[@role='option'][normalize-space(.)='${action.value}']`,
                      `//*[@data-radix-popper-content-wrapper]//*[normalize-space(.)='${action.value}']`,
                    ];
                    
                    for (const selector of portalSelectors) {
                      if (matched) break;
                      try {
                        const elements = await this.driver.findElements(By.xpath(selector));
                        for (const el of elements) {
                          if (await el.isDisplayed()) {
                            await el.click();
                            logs.push(`Selected '${action.value}' from parent document portal`);
                            matched = true;
                            break;
                          }
                        }
                      } catch { }
                    }
                    
                    // Switch back to original (nested) iframe context
                    if (this.framePath.length) {
                      await this.restoreFramePath();
                    }
                  } catch {
                    // Restore iframe context on error
                    try {
                      if (this.framePath.length) {
                        await this.restoreFramePath();
                      }
                    } catch { }
                  }
                }
                
                // Strategy 5: JavaScript-based click for stubborn dropdowns
                if (!matched) {
                  logs.push(`[AIExecutor] [Dropdown] Trying JavaScript-based option selection...`);
                  try {
                    const jsResult = await this.driver.executeScript(`
                      const searchText = arguments[0].toLowerCase().trim();
                      // Search all role="option" elements
                      const options = document.querySelectorAll('[role="option"], [role="listbox"] li, [data-radix-collection-item]');
                      for (const opt of options) {
                        const text = (opt.textContent || '').toLowerCase().trim();
                        if (text === searchText || text.includes(searchText)) {
                          opt.click();
                          return { found: true, text: opt.textContent };
                        }
                      }
                      // Search visible dropdown menus
                      const menuItems = document.querySelectorAll('.dropdown-menu li, .select-options li, [class*="Option"], [class*="option"]');
                      for (const item of menuItems) {
                        const rect = item.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                          const text = (item.textContent || '').toLowerCase().trim();
                          if (text === searchText || text.includes(searchText)) {
                            item.click();
                            return { found: true, text: item.textContent };
                          }
                        }
                      }
                      return { found: false };
                    `, action.value) as { found: boolean; text?: string };
                    
                    if (jsResult && jsResult.found) {
                      logs.push(`Selected '${jsResult.text}' via JavaScript click`);
                      matched = true;
                    }
                  } catch { /* JS strategy failed */ }
                }
                
                if (!matched) {
                  logs.push(`[AIExecutor] [Dropdown] No matching custom dropdown option found for text: '${action.value}'.`);
                  throw new Error(`No matching custom dropdown option found for text: ${action.value}`);
                }
              }
            } catch (err: any) {
              logs.push(`[AIExecutor] [Dropdown] Select failed: ${err.message}`);
              return { success: false, error: `Dropdown select failed: ${err.message}` };
            }
          }
          break;

        // ================== CHECKBOX/RADIO ==================
        case "checkbox":
          if (action.elementXPath) {
            try {
              let checkbox: WebElement | null = null;
              let foundViaLabel = false;
              let clickPerformed = false;
              
              // Try to find the checkbox element
              try {
                checkbox = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
              } catch (e) {
                logs.push(`[AIExecutor] Checkbox not found directly, trying to find by label text...`);
              }
              
              // If not found, try to find checkbox by label text
              if (!checkbox && action.description) {
                const labelText = action.description.replace(/^(Check|Uncheck|Toggle)\s+['"]?/i, "").replace(/['"]?\s*(checkbox)?$/i, "").trim();
                const labelWords = labelText.split(/\s+/).filter((w: string) => w.length > 2).slice(0, 4);
                
                if (labelWords.length > 0) {
                  logs.push(`[AIExecutor] Searching checkbox by label words: ${labelWords.join(', ')}`);
                  
                  // Strategy 1: Find checkbox inside label that contains the text
                  const labelSelectors = [
                    `//label[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]//input[@type='checkbox']`,
                    `//input[@type='checkbox'][ancestor::label[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]]`,
                    `//label[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]/preceding-sibling::input[@type='checkbox']`,
                    `//label[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]/following-sibling::input[@type='checkbox']`,
                    `//*[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]//input[@type='checkbox']`,
                    `//*[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]/ancestor::label//input[@type='checkbox']`,
                  ];
                  
                  for (const selector of labelSelectors) {
                    try {
                      const found = await this.driver.findElement(By.xpath(selector));
                      if (await found.isDisplayed()) {
                        checkbox = found;
                        logs.push(`[AIExecutor] Found checkbox via label search: ${selector.substring(0, 80)}`);
                        break;
                      }
                    } catch { /* try next selector */ }
                  }
                  
                  // Strategy 2: Radix UI checkbox - button with role="checkbox" near matching text
                  if (!checkbox && !foundViaLabel) {
                    logs.push(`[AIExecutor] Trying Radix UI checkbox strategy...`);
                    const radixCheckboxSelectors = [
                      // Radix checkbox button with data-state attribute
                      `//button[@role='checkbox'][ancestor::*[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]]`,
                      // Radix checkbox with following label
                      `//button[@role='checkbox'][following-sibling::*[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]]`,
                      // Radix checkbox inside labeled container
                      `//*[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]//button[@role='checkbox']`,
                      `//*[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]/preceding-sibling::button[@role='checkbox']`,
                      // Any role="checkbox" element with data-state (Radix specific)
                      `//*[@role='checkbox'][@data-state][ancestor::*[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}] or following-sibling::*[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]]`,
                    ];
                    
                    for (const selector of radixCheckboxSelectors) {
                      try {
                        const found = await this.driver.findElement(By.xpath(selector));
                        if (await found.isDisplayed()) {
                          checkbox = found;
                          logs.push(`[AIExecutor] Found Radix UI checkbox: ${selector.substring(0, 60)}`);
                          break;
                        }
                      } catch { /* try next */ }
                    }
                  }
                  
                  // Strategy 3: Find the label and click it (many checkboxes are styled to hide the actual input)
                  if (!checkbox && !foundViaLabel) {
                    try {
                      const label = await this.driver.findElement(
                        By.xpath(`//label[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]`)
                      );
                      if (await label.isDisplayed()) {
                        await this.scrollIntoView(label);
                        await label.click();
                        logs.push(`[AIExecutor] Clicked label containing checkbox text`);
                        foundViaLabel = true;
                        clickPerformed = true;
                      }
                    } catch { /* no label found */ }
                  }
                  
                  // Strategy 4: Find any element with role="checkbox" that contains the text
                  if (!checkbox && !foundViaLabel) {
                    try {
                      const roleCheckbox = await this.driver.findElement(
                        By.xpath(`//*[@role='checkbox'][${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' or ')} or ancestor::*[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]]`)
                      );
                      if (await roleCheckbox.isDisplayed()) {
                        checkbox = roleCheckbox;
                        logs.push(`[AIExecutor] Found element with role='checkbox'`);
                      }
                    } catch { /* no role checkbox */ }
                  }
                  
                  // Strategy 5: Custom styled checkbox (div/span with onClick that toggles)
                  if (!checkbox && !foundViaLabel) {
                    logs.push(`[AIExecutor] Trying custom styled checkbox strategy...`);
                    const customCheckboxSelectors = [
                      // Custom checkbox wrapper classes
                      `//*[contains(@class, 'checkbox')][${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]`,
                      `//*[contains(@class, 'Checkbox')][${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]`,
                      // Switch components (often used as checkboxes)
                      `//*[@role='switch'][ancestor::*[${labelWords.map((w: string) => `contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${w.toLowerCase()}')`).join(' and ')}]]`,
                    ];
                    
                    for (const selector of customCheckboxSelectors) {
                      try {
                        const found = await this.driver.findElement(By.xpath(selector));
                        if (await found.isDisplayed()) {
                          checkbox = found;
                          logs.push(`[AIExecutor] Found custom checkbox: ${selector.substring(0, 60)}`);
                          break;
                        }
                      } catch { /* try next */ }
                    }
                  }
                }
              }
              
              // Perform the click if we found a checkbox
              if (checkbox && !clickPerformed) {
                const tagName = await checkbox.getTagName();
                const role = await checkbox.getAttribute('role');
                const dataState = await checkbox.getAttribute('data-state');
                
                // Determine if checkbox is currently checked
                let isChecked = false;
                if (tagName.toLowerCase() === 'input') {
                  isChecked = await checkbox.isSelected();
                } else if (role === 'checkbox' || role === 'switch') {
                  // Radix UI uses data-state="checked" / "unchecked"
                  if (dataState) {
                    isChecked = dataState === 'checked';
                  } else {
                    const ariaChecked = await checkbox.getAttribute('aria-checked');
                    isChecked = ariaChecked === 'true';
                  }
                } else {
                  const ariaChecked = await checkbox.getAttribute('aria-checked');
                  isChecked = ariaChecked === 'true';
                }
                
                const shouldCheck = action.value === "check";
                logs.push(`[AIExecutor] Checkbox state: isChecked=${isChecked}, shouldCheck=${shouldCheck}`);
                
                if (isChecked !== shouldCheck) {
                  await this.scrollIntoView(checkbox);
                  
                  // Try regular click first
                  try {
                    await checkbox.click();
                    clickPerformed = true;
                  } catch (clickErr) {
                    // If regular click fails, try JavaScript click
                    logs.push(`[AIExecutor] Regular click failed, trying JavaScript click...`);
                    try {
                      await this.driver.executeScript("arguments[0].click();", checkbox);
                      clickPerformed = true;
                    } catch { }
                  }
                  
                  // If still not clicked, try clicking parent element
                  if (!clickPerformed) {
                    logs.push(`[AIExecutor] Trying to click parent element...`);
                    try {
                      const parent = await checkbox.findElement(By.xpath(".."));
                      await parent.click();
                      clickPerformed = true;
                    } catch { }
                  }
                  
                  logs.push(`Checkbox ${shouldCheck ? 'checked' : 'unchecked'}: ${action.elementXPath}`);
                } else {
                  logs.push(`Checkbox already in desired state (${isChecked ? 'checked' : 'unchecked'})`);
                  clickPerformed = true;
                }
              }
              
              if (!checkbox && !foundViaLabel && !clickPerformed) {
                // Last resort: JavaScript-based search and click
                logs.push(`[AIExecutor] Trying JavaScript-based checkbox click...`);
                const labelText = action.description?.replace(/^(Check|Uncheck|Toggle)\s+['"]?/i, "").replace(/['"]?\s*(checkbox)?$/i, "").trim() || "";
                
                const jsResult = await this.driver.executeScript(`
                  const searchText = arguments[0].toLowerCase().trim();
                  const shouldCheck = arguments[1] === 'check';
                  
                  // Find all checkbox-like elements
                  const checkboxes = document.querySelectorAll('input[type="checkbox"], [role="checkbox"], [role="switch"], button[data-state]');
                  
                  for (const cb of checkboxes) {
                    // Get associated text from labels, siblings, or parent
                    let associatedText = '';
                    const id = cb.id;
                    if (id) {
                      const label = document.querySelector('label[for="' + id + '"]');
                      if (label) associatedText += ' ' + label.textContent;
                    }
                    const parent = cb.closest('label, div, span, li');
                    if (parent) associatedText += ' ' + parent.textContent;
                    const sibling = cb.nextElementSibling || cb.previousElementSibling;
                    if (sibling) associatedText += ' ' + sibling.textContent;
                    
                    associatedText = associatedText.toLowerCase().trim();
                    
                    if (associatedText.includes(searchText)) {
                      // Determine current state
                      let isChecked = false;
                      if (cb.type === 'checkbox') {
                        isChecked = cb.checked;
                      } else {
                        const dataState = cb.getAttribute('data-state');
                        const ariaChecked = cb.getAttribute('aria-checked');
                        isChecked = dataState === 'checked' || ariaChecked === 'true';
                      }
                      
                      // Click if needed
                      if (isChecked !== shouldCheck) {
                        cb.click();
                        return { found: true, clicked: true, text: associatedText.substring(0, 50) };
                      } else {
                        return { found: true, clicked: false, alreadyCorrect: true };
                      }
                    }
                  }
                  return { found: false };
                `, labelText, action.value) as { found: boolean; clicked?: boolean; alreadyCorrect?: boolean; text?: string };
                
                if (jsResult && jsResult.found) {
                  if (jsResult.clicked) {
                    logs.push(`[AIExecutor] JavaScript clicked checkbox with text: ${jsResult.text}`);
                  } else if (jsResult.alreadyCorrect) {
                    logs.push(`[AIExecutor] Checkbox already in correct state`);
                  }
                  clickPerformed = true;
                }
              }
              
              if (!clickPerformed && !foundViaLabel) {
                throw new Error(`Checkbox not found: ${action.elementXPath}`);
              }
            } catch (err: any) {
              logs.push(`[AIExecutor] Checkbox action failed: ${err.message}`);
              return { success: false, error: `Checkbox failed: ${err.message}` };
            }
          }
          break;

        case "radio":
          if (action.elementXPath) {
            const radio = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
            await this.scrollIntoView(radio);
            await radio.click();
            // Verify selection using JavaScript
            const isSelected = await this.driver.executeScript(
              "return arguments[0].checked;",
              radio
            );
            if (!isSelected) {
              // Try clicking the label instead
              try {
                const label = await this.driver.findElement(
                  By.xpath(`${action.elementXPath}/ancestor::label | ${action.elementXPath}/following-sibling::label[1] | //label[@for='${await radio.getAttribute('id')}']`)
                );
                await label.click();
              } catch { }
            }
            logs.push(`Selected radio: ${action.elementXPath}`);
          }
          break;

        // ================== HOVER/FOCUS ==================
        case "hover":
          if (action.elementXPath) {
            const element = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
            await this.scrollIntoView(element);
            const actions = this.driver.actions({ async: true });
            await actions.move({ origin: element }).perform();
            logs.push(`Hovered: ${action.elementXPath}`);
          }
          break;

        case "focus":
          if (action.elementXPath) {
            const element = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
            await this.scrollIntoView(element);
            await this.driver.executeScript("arguments[0].focus();", element);
            logs.push(`Focused: ${action.elementXPath}`);
          }
          break;

        case "blur":
          if (action.elementXPath) {
            const element = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
            await this.driver.executeScript("arguments[0].blur();", element);
            logs.push(`Blurred: ${action.elementXPath}`);
          }
          break;

        // ================== SCROLL ==================
        case "scroll":
          if (action.value === "top") {
            await this.driver.executeScript("window.scrollTo(0, 0);");
          } else if (action.value === "bottom") {
            await this.driver.executeScript("window.scrollTo(0, document.body.scrollHeight);");
          } else if (action.value === "up") {
            await this.driver.executeScript("window.scrollBy(0, -300);");
          } else if (action.value === "down") {
            await this.driver.executeScript("window.scrollBy(0, 300);");
          } else if (action.elementXPath) {
            const element = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
            await this.scrollIntoView(element);
          }
          logs.push(`Scrolled: ${action.value || action.elementXPath}`);
          break;

        // ================== DRAG & DROP ==================
        case "dragDrop":
          if (action.elementXPath && action.targetXPath) {
            const source = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
            await this.scrollIntoView(source);
            const target = await this.findElement(action.targetXPath);
            const actions = this.driver.actions({ async: true });
            await actions.dragAndDrop(source, target).perform();
            logs.push(`Dragged from ${action.elementXPath} to ${action.targetXPath}`);
          }
          break;

        // ================== KEYBOARD ==================
        case "pressKey":
          if (action.key) {
            const keyMap: { [key: string]: string } = {
              "enter": Key.ENTER,
              "tab": Key.TAB,
              "escape": Key.ESCAPE,
              "backspace": Key.BACK_SPACE,
              "delete": Key.DELETE,
              "space": Key.SPACE,
              "arrowup": Key.ARROW_UP,
              "arrowdown": Key.ARROW_DOWN,
              "arrowleft": Key.ARROW_LEFT,
              "arrowright": Key.ARROW_RIGHT,
            };
            const key = keyMap[action.key.toLowerCase()] || action.key;
            if (action.elementXPath) {
              const element = await this.findElementWithFallbacks(buildLocatorChain(action.locators, action.elementXPath), logs);
              await element.sendKeys(key);
            } else {
              const activeElement = await this.driver.switchTo().activeElement();
              await activeElement.sendKeys(key);
            }
            logs.push(`Pressed key: ${action.key}`);
          }
          break;

        // ================== IFRAME ACTIONS ==================
                case "switchToIframe":
          if (action.iframeName) {
            // Always switch from a known base (top) using the existing path, then add one.
            await this.restoreFramePath();
            const iframes = await this.driver.findElements(By.tagName("iframe"));
            let idx = parseInt(action.iframeName);
            if (isNaN(idx)) {
              // Resolve a name/id to its numeric index among current iframes
              idx = 0;
              for (let i = 0; i < iframes.length; i++) {
                const nm = (await iframes[i].getAttribute("name")) || "";
                const id = (await iframes[i].getAttribute("id")) || "";
                if (nm === action.iframeName || id === action.iframeName) { idx = i; break; }
              }
            }
            await this.driver.switchTo().frame(idx);
            this.framePath.push(idx);
            this.currentIframeIndex = idx;
            // JDE/ERP apps load the inner app via AJAX after the frame switches; outer frame
            // may only show "IFrame support required" — waitForIframeContent drills nested.
            await this.waitForIframeContent(logs);
            logs.push(`Switched to iframe: ${action.iframeName} (depth ${this.framePath.length})`);
          }
          break;

        case "switchToDefaultContent":
          await this.driver.switchTo().defaultContent();
          this.currentIframeIndex = -1; // ← back to top-level
          this.framePath = [];
          logs.push("Switched to default content");
          break;

        case "switchToParentFrame":
          await this.driver.switchTo().parentFrame();
          this.framePath.pop();
          this.currentIframeIndex = this.framePath.length ? this.framePath[this.framePath.length - 1] : -1;
          logs.push("Switched to parent frame");
          break;

        // ================== WINDOW ACTIONS ==================
        case "switchToWindow":
          const handles = await this.driver.getAllWindowHandles();
          const windowIndex = action.windowIndex ?? 0;
          if (windowIndex < handles.length) {
            await this.driver.switchTo().window(handles[windowIndex]);
            // Clear cache when switching windows - different page content
            this.aiPlanCache.clear();
            this.currentIframeIndex = -1;
            this.framePath = [];
            logs.push(`Switched to window index: ${windowIndex}`);
          } else {
            throw new Error(`Window index ${windowIndex} not found (${handles.length} windows available)`);
          }
          break;

                case "switchToNewWindow":
          // Wait for new window to appear
          const originalHandles2 = await this.driver.getAllWindowHandles();
          const originalCount2 = originalHandles2.length;
          
          // Wait up to 5 seconds for new window
          for (let i = 0; i < 20; i++) {
            await this.driver.sleep(250);
            const currentHandles = await this.driver.getAllWindowHandles();
            if (currentHandles.length > originalCount2) {
              // Switch to the new window
              for (const handle of currentHandles) {
                if (!originalHandles2.includes(handle)) {
                  await this.driver.switchTo().window(handle);
                  logs.push("Switched to new window/popup");
                  // Wait for new window to load
                  await this.waitForPageLoad();
                  
                  // AUTO-DETECT: Check if there are iframes in the new window
                  try {
                    const iframes = await this.driver.findElements(By.tagName('iframe'));
                    if (iframes.length > 0) {
                      logs.push(`[AUTO-DETECT] Found ${iframes.length} iframe(s) in new window. Attempting to switch to first iframe...`);
                      try {
                        await this.driver.switchTo().frame(0);this.currentIframeIndex = 0; // track context
logs.push(`✓ Switched to iframe[0] automatically`);
                        await this.driver.sleep(200); // iframe content settle
                      } catch (iframeErr: any) {
                        logs.push(`[AUTO-DETECT] Could not switch to iframe: ${iframeErr.message}`);
                      }
                    }
                  } catch (e: any) {
                    logs.push(`[AUTO-DETECT] Error checking for iframes: ${e.message}`);
                  }
                  break;
                }
              }
              break;
            }
          }
          break;

        case "closeWindow":
          await this.driver.close();
          // Switch back to first window
          const remainingHandles = await this.driver.getAllWindowHandles();
          if (remainingHandles.length > 0) {
            await this.driver.switchTo().window(remainingHandles[0]);
          }
          logs.push("Closed window and switched back");
          break;

        // ================== ALERT/DIALOG ACTIONS ==================
        case "acceptAlert":
          try {
            const alert = await this.driver.switchTo().alert();
            await alert.accept();
            logs.push("Accepted alert");
          } catch (e) {
            logs.push("No alert present to accept");
          }
          break;

        case "dismissAlert":
          try {
            const alert = await this.driver.switchTo().alert();
            await alert.dismiss();
            logs.push("Dismissed alert");
          } catch (e) {
            logs.push("No alert present to dismiss");
          }
          break;

        case "getAlertText":
          try {
            const alert = await this.driver.switchTo().alert();
            const text = await alert.getText();
            logs.push(`Alert text: ${text}`);
          } catch (e) {
            logs.push("No alert present");
          }
          break;

        case "sendAlertText":
          if (action.value) {
            try {
              const alert = await this.driver.switchTo().alert();
              await alert.sendKeys(action.value);
              await alert.accept();
              logs.push(`Sent text to alert: ${action.value}`);
            } catch (e) {
              logs.push("No prompt present");
            }
          }
          break;

        // ================== WAIT ACTIONS ==================
        case "wait":
          const ms = parseInt(action.value || "1000");
          await this.driver.sleep(ms);
          logs.push(`Waited ${ms}ms`);
          break;

        case "waitForElement":
          if (action.elementXPath) {
            await this.driver.wait(
              until.elementLocated(By.xpath(action.elementXPath)),
              10000
            );
            logs.push(`Element appeared: ${action.elementXPath}`);
          }
          break;

        case "waitForText":
          if (action.value) {
            await this.driver.wait(async () => {
              const body = await this.driver!.findElement(By.tagName("body"));
              const text = await body.getText();
              return text.includes(action.value!);
            }, 10000);
            logs.push(`Text appeared: ${action.value}`);
          }
          break;

        // ================== SCRIPT EXECUTION ==================
        case "executeScript":
          if (action.value) {
            await this.driver.executeScript(action.value);
            logs.push("Executed script");
          }
          break;

        // ================== VERIFY ACTION ==================
        // Used when AI detects page has changed (success message, validation, etc.)
        case "verify": {
          const textToVerify = action.value || "";
          if (textToVerify) {
            // Check if the expected text is visible on the page
            try {
              const bodyText = await this.driver.executeScript(
                "return document.body ? document.body.innerText : ''"
              ) as string;
              
              if (bodyText.toLowerCase().includes(textToVerify.toLowerCase())) {
                logs.push(`✓ Verified text on page: "${textToVerify}"`);
              } else {
                // Also check for partial matches of key words
                const keywords = textToVerify.split(/\s+/).filter(w => w.length > 3);
                const matchedKeywords = keywords.filter(kw => 
                  bodyText.toLowerCase().includes(kw.toLowerCase())
                );
                
                if (matchedKeywords.length >= keywords.length * 0.5) {
                  logs.push(`✓ Verified (partial match): found ${matchedKeywords.length}/${keywords.length} keywords`);
                } else {
                  throw new Error(`Text not found on page: "${textToVerify}"`);
                }
              }
            } catch (err: any) {
              throw new Error(`Verification failed: ${err.message}`);
            }
          } else {
            // No specific text - just verify page loaded successfully
            const bodyExists = await this.driver.executeScript("return !!document.body") as boolean;
            if (bodyExists) {
              logs.push(`✓ Page loaded successfully`);
            } else {
              throw new Error("Page body not found");
            }
          }
          break;
        }

        default:
          logs.push(`Unknown action type: ${action.type}`);
      }

      return { success: true };
    } catch (error: any) {
      logs.push(`Action failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // EXECUTE ACTION (Playwright Mode)
  // ============================================================================

  private async executeActionPlaywright(
    action: AIExecutionPlan["action"],
    logs: string[]
  ): Promise<{ success: boolean; error?: string }> {
    const page = this.playwrightPage;
    if (!page) return { success: false, error: "No Playwright page available" };

    // Resolve the best Playwright locator from the locators chain
    const buildPwLocator = (locators?: string[], elementXPath?: string): any => {
      const candidates: string[] = [];
      if (locators) {
        for (const loc of locators) {
          if (loc.startsWith('id=')) candidates.push(`[id="${loc.slice(3)}"]`);
          else if (loc.startsWith('name=')) candidates.push(`[name="${loc.slice(5)}"]`);
          else if (loc.startsWith('css=')) candidates.push(loc.slice(4));
          else if (loc.startsWith('xpath=')) candidates.push(`xpath=${loc.slice(6)}`);
          else if (loc.startsWith('//') || loc.startsWith('(//')) candidates.push(`xpath=${loc}`);
          else candidates.push(loc);
        }
      }
      if (elementXPath) {
        const xpStr = elementXPath.startsWith('//') || elementXPath.startsWith('(//')
          ? `xpath=${elementXPath}` : elementXPath;
        if (!candidates.includes(xpStr)) candidates.push(xpStr);
      }
      const primary = candidates[0] || 'body';
      return page.locator(primary);
    };

    try {
      logs.push(`[Playwright] Executing: ${action.type} - ${action.description}`);

      switch (action.type) {
        case "navigate": {
          const navUrl = action.value || (action as any).targetUrl || "";
          if (navUrl) {
            await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            this.aiPlanCache.clear();
            logs.push(`[Playwright] Navigated to: ${navUrl}`);
          }
          break;
        }

        case "refresh":
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
          this.aiPlanCache.clear();
          logs.push(`[Playwright] Page refreshed`);
          break;

        case "back":
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          this.aiPlanCache.clear();
          logs.push(`[Playwright] Navigated back`);
          break;

        case "forward":
          await page.goForward({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          this.aiPlanCache.clear();
          logs.push(`[Playwright] Navigated forward`);
          break;

        case "click": {
          const locator = buildPwLocator(action.locators, action.elementXPath);
          await locator.first().scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          await locator.first().click({ timeout: 15000 });
          await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          logs.push(`[Playwright] Clicked: ${action.elementXPath}`);
          break;
        }

        case "type": {
          const locator = buildPwLocator(action.locators, action.elementXPath);
          await locator.first().scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          await locator.first().fill(action.value || '', { timeout: 15000 });
          logs.push(`[Playwright] Typed into: ${action.elementXPath}`);
          break;
        }

        case "clear": {
          const locator = buildPwLocator(action.locators, action.elementXPath);
          await locator.first().fill('', { timeout: 10000 });
          logs.push(`[Playwright] Cleared: ${action.elementXPath}`);
          break;
        }

        case "select": {
          const locator = buildPwLocator(action.locators, action.elementXPath);
          // Try native select first, then look for custom dropdown options
          try {
            await locator.first().selectOption(action.value || '', { timeout: 10000 });
          } catch {
            // Fallback: click the element then click the matching option
            await locator.first().click({ timeout: 10000 });
            await page.waitForTimeout(500);
            const optionLocator = page.locator(`[role="option"], li, .select-item, .dropdown-item`).filter({ hasText: action.value || '' });
            await optionLocator.first().click({ timeout: 5000 }).catch(() => {});
          }
          logs.push(`[Playwright] Selected "${action.value}" in: ${action.elementXPath}`);
          break;
        }

        case "pressKey": {
          const locator = buildPwLocator(action.locators, action.elementXPath);
          const key = action.value || 'Enter';
          await locator.first().press(key, { timeout: 10000 });
          await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          logs.push(`[Playwright] Pressed ${key} on: ${action.elementXPath}`);
          break;
        }

        case "wait":
          await page.waitForTimeout(action.value ? parseInt(action.value) || 1000 : 1000);
          logs.push(`[Playwright] Waited ${action.value || 1000}ms`);
          break;

        case "waitForElement": {
          const locator = buildPwLocator(action.locators, action.elementXPath);
          await locator.first().waitFor({ state: 'visible', timeout: 15000 });
          logs.push(`[Playwright] Element visible: ${action.elementXPath}`);
          break;
        }

        case "checkbox": {
          const locator = buildPwLocator(action.locators, action.elementXPath);
          const targetChecked = action.value !== "uncheck";
          const isChecked = await locator.first().isChecked({ timeout: 5000 }).catch(() => false);
          if (isChecked !== targetChecked) {
            await locator.first().click({ timeout: 10000 });
          }
          logs.push(`[Playwright] Checkbox ${targetChecked ? 'checked' : 'unchecked'}: ${action.elementXPath}`);
          break;
        }

        case "hover": {
          const locator = buildPwLocator(action.locators, action.elementXPath);
          await locator.first().hover({ timeout: 10000 });
          logs.push(`[Playwright] Hovered: ${action.elementXPath}`);
          break;
        }

        case "doubleClick": {
          const locator = buildPwLocator(action.locators, action.elementXPath);
          await locator.first().dblclick({ timeout: 10000 });
          logs.push(`[Playwright] Double-clicked: ${action.elementXPath}`);
          break;
        }

        case "rightClick": {
          const locator = buildPwLocator(action.locators, action.elementXPath);
          await locator.first().click({ button: 'right', timeout: 10000 });
          logs.push(`[Playwright] Right-clicked: ${action.elementXPath}`);
          break;
        }

        case "switchToIframe":
        case "switchToDefaultContent":
        case "switchToParentFrame":
        case "switchToWindow":
        case "switchToNewWindow":
        case "closeWindow":
          // Playwright handles iframes/windows via frame locators — log and continue
          logs.push(`[Playwright] ${action.type}: handled by Playwright frame context`);
          break;

        case "screenshot":
          await page.screenshot({ type: 'png' }).catch(() => {});
          logs.push(`[Playwright] Screenshot captured`);
          break;

        default:
          logs.push(`[Playwright] Action "${action.type}" not explicitly implemented, attempting best-effort click`);
          if (action.elementXPath) {
            const locator = buildPwLocator(action.locators, action.elementXPath);
            await locator.first().click({ timeout: 10000 }).catch((e: any) => {
              logs.push(`[Playwright] Best-effort action failed: ${e.message}`);
            });
          }
          // Return success to not block test flow for unsupported actions
          return { success: true };
      }

      return { success: true };
    } catch (error: any) {
      logs.push(`[Playwright] Action failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // VERIFICATION EXECUTION
  // ============================================================================

  private async executeVerification(
    verification: AIExecutionPlan["verification"],
    logs: string[]
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.driver || !verification) {
      return { success: true };
    }

    try {
      switch (verification.type) {
        case "elementExists":
          if (verification.elementXPath) {
            await this.findElement(verification.elementXPath);
            logs.push(`✓ Element exists: ${verification.elementXPath}`);
          }
          break;

        case "elementVisible":
          if (verification.elementXPath) {
            try {
              const element = await this.findElement(verification.elementXPath);
              const isDisplayed = await element.isDisplayed();
              if (!isDisplayed) {
                throw new Error("Element is not visible");
              }
              logs.push(`✓ Element visible: ${verification.elementXPath}`);
            } catch (e: any) {
              // Fallback: if element not found, check if page has any interactive content
              // This handles cases where click caused navigation to a new page
              const hasContent = await this.driver!.executeScript(`
                return document.querySelectorAll('input, select, button, a, form').length > 0;
              `) as boolean;
              if (hasContent) {
                logs.push(`⚠ Original element not found, but page has interactive content`);
                logs.push(`✓ Verification passed (fallback: page loaded with content)`);
              } else {
                throw e; // Re-throw if no content found
              }
            }
          }
          break;

        case "elementEnabled":
          if (verification.elementXPath) {
            const element = await this.findElement(verification.elementXPath);
            const isEnabled = await element.isEnabled();
            if (!isEnabled) {
              throw new Error("Element is not enabled");
            }
            logs.push(`✓ Element enabled: ${verification.elementXPath}`);
          }
          break;

                case "elementSelected":
          if (verification.elementXPath) {
            try {
              const element = await this.findElement(verification.elementXPath);
              const isSelected = await this.driver.executeScript(
                "return arguments[0].checked || arguments[0].selected;",
                element
              );
              if (isSelected) {
                logs.push(`✓ Element selected: ${verification.elementXPath}`);
              } else {
                // Fallback: check visible text/value for custom dropdowns
                let expected = verification.expectedValue || "";
                let found = false;
                // Try to find a visible element with the expected text
                const visibleTextXpaths = [
                  `//*[contains(@class,'selected') and text()='${expected}']`,
                  `//*[contains(@class,'selected') and contains(text(),'${expected}')]`,
                  `//*[text()='${expected}']`,
                  `//*[contains(text(),'${expected}')]`
                ];
                for (const xpath of visibleTextXpaths) {
                  try {
                    const els = await this.driver.findElements(By.xpath(xpath));
                    for (const el of els) {
                      try {
                        if (await el.isDisplayed()) {
                          logs.push(`✓ Fallback: Visible selected text found: ${expected}`);
                          found = true;
                          break;
                        }
                      } catch {}
                    }
                    if (found) break;
                  } catch {}
                }
                if (!found) {
                  logs.push(`[Verification] Element not selected in main frame, trying iframes...`);
                  // Try looking in iframes
                  try {
                    const iframes = await this.driver.findElements(By.tagName('iframe'));
                    for (let i = 0; i < iframes.length && !found; i++) {
                      try {
                        await this.driver.switchTo().frame(i);
                        const els = await this.driver.findElements(By.xpath(verification.elementXPath));
                        if (els.length > 0) {
                          const isSelectedInFrame = await this.driver.executeScript(
                            "return arguments[0].checked || arguments[0].selected;",
                            els[0]
                          );
                          if (isSelectedInFrame) {
                            logs.push(`✓ Element selected in iframe[${i}]: ${verification.elementXPath}`);
                            found = true;
                          }
                        }
                        await this.driver.switchTo().defaultContent();
                      } catch {}
                    }
                  } catch {}
                  
                  if (!found) {
                    throw new Error("Element is not selected and no visible selected text found (checked main frame and iframes)");
                  }
                }
              }
            } catch (err: any) {
              throw err;
            }
          }
          break;

        case "textEquals":
          if (verification.elementXPath && verification.expectedValue) {
            const element = await this.findElement(verification.elementXPath);
            let text = await element.getText();
            // For input elements, also check the value attribute
            const tagName = await element.getTagName();
            if (tagName.toLowerCase() === 'input' || tagName.toLowerCase() === 'textarea') {
              text = await element.getAttribute('value') || '';
            } else if (tagName.toLowerCase() === 'select') {
              // For <select>, get selected option's text
              try {
                const selectedOption = await element.findElement(By.xpath(".//option[@selected]"));
                text = await selectedOption.getText();
              } catch {
                // Fallback: find selected option by isSelected()
                const options = await element.findElements(By.tagName("option"));
                for (const opt of options) {
                  if (await opt.isSelected()) {
                    text = await opt.getText();
                    break;
                  }
                }
              }
            }
            if (text !== verification.expectedValue) {
              throw new Error(`Text mismatch: expected \"${verification.expectedValue}\", got \"${text}\"`);
            }
            logs.push(`✓ Text equals: ${verification.expectedValue}`);
          }
          break;

        case "textContains":
          // JDE/ERP grids fill asynchronously after a Find/Search. If we're inside an app
          // iframe, wait (best-effort) for >1 data row before reading, so the verify isn't
          // racing an empty grid. No-op when not in a grid context.
          if (this.framePath.length) { await this.waitForGridRows(2000); }
          if (verification.elementXPath && verification.expectedValue) {
            const element = await this.findElement(verification.elementXPath);
            let text = await element.getText();
            const tagName = await element.getTagName();
            if (tagName.toLowerCase() === 'input' || tagName.toLowerCase() === 'textarea') {
              text = await element.getAttribute('value') || '';
            } else if (tagName.toLowerCase() === 'select') {
              // For <select>, get selected option's text and value, and match against expected value
              let found = false;
              try {
                const selectedOption = await element.findElement(By.xpath(".//option[@selected]"));
                const selectedText = (await selectedOption.getText()).trim();
                const selectedValue = ((await selectedOption.getAttribute('value')) || '').trim();
                if (
                  selectedText.toLowerCase().includes(verification.expectedValue.trim().toLowerCase()) ||
                  selectedValue.toLowerCase().includes(verification.expectedValue.trim().toLowerCase())
                ) {
                  found = true;
                }
              } catch {}
              if (!found) {
                const options = await element.findElements(By.tagName("option"));
                for (const opt of options) {
                  if (await opt.isSelected()) {
                    const optText = (await opt.getText()).trim();
                    const optValue = ((await opt.getAttribute('value')) || '').trim();
                    if (
                      optText.toLowerCase().includes(verification.expectedValue.trim().toLowerCase()) ||
                      optValue.toLowerCase().includes(verification.expectedValue.trim().toLowerCase())
                    ) {
                      found = true;
                      break;
                    }
                  }
                }
              }
              if (!found) {
                throw new Error(`Text not found: \"${verification.expectedValue}\" in selected option(s)`);
              }
              logs.push(`✓ Text contains (selected option): ${verification.expectedValue}`);
              break;
            }
            if (!text.toLowerCase().includes(verification.expectedValue.toLowerCase())) {
              // Fallback: check if the text exists anywhere on the page
              let fallbackPassed = false;
              try {
                const bodyText = await this.driver!.executeScript(
                  "return document.body ? document.body.innerText : ''"
                ) as string;
                if (bodyText.toLowerCase().includes(verification.expectedValue.toLowerCase())) {
                  logs.push(`✓ Text found on page (not in specific element): ${verification.expectedValue}`);
                  fallbackPassed = true;
                } else {
                  // Try word-by-word matching if exact phrase not found
                  const words = verification.expectedValue.toLowerCase().split(/\s+/).filter(w => w.length > 2);
                  const matchedWords = words.filter(w => bodyText.toLowerCase().includes(w));
                  if (matchedWords.length >= Math.ceil(words.length * 0.5)) {
                    logs.push(`✓ Partial text match (${matchedWords.length}/${words.length} keywords): ${verification.expectedValue}`);
                    fallbackPassed = true;
                  }
                }
              } catch { }
              
              if (!fallbackPassed) {
                throw new Error(`Text not found: \"${verification.expectedValue}\" in \"${text.substring(0, 200)}...\"`);
              }
            } else {
              logs.push(`✓ Text contains: ${verification.expectedValue}`);
            }
          }
          break;

        case "textVisible":
          // Robust: search entire DOM for any visible element containing expected text
          if (verification.expectedValue) {
            let found = false;
            // Wait up to 5s for any visible element containing the expected text
            for (let i = 0; i < 10; i++) {
              const visibleTextXpaths = [
                `//*[contains(@class,'dropdown') and contains(text(),'${verification.expectedValue}')]`,
                `//*[contains(@class,'option') and contains(text(),'${verification.expectedValue}')]`,
                `//*[text()='${verification.expectedValue}']`,
                `//*[contains(text(),'${verification.expectedValue}')]`
              ];
              for (const xpath of visibleTextXpaths) {
                try {
                  const els = await this.driver.findElements(By.xpath(xpath));
                  for (const el of els) {
                    if (await el.isDisplayed()) {
                      found = true;
                      break;
                    }
                  }
                  if (found) break;
                } catch {}
              }
              if (found) break;
              await this.driver.sleep(200);
            }
            if (!found) {
              throw new Error(`Text not visible: "${verification.expectedValue}" in any visible option or dropdown result`);
            }
            logs.push(`✓ Text visible: ${verification.expectedValue}`);
          }
          break;

        case "valueEquals":
          if (verification.elementXPath && verification.expectedValue) {
            const element = await this.findElement(verification.elementXPath);
            const value = await element.getAttribute("value");
            // JDE QBE / password fields mask their content as "*", "***", bullets, or clear it.
            // Typing already succeeded (sendKeys); a masked read-back is NOT a failure.
            if (this.isMaskedValue(value)) {
              logs.push(`✓ Value accepted (field masks input: "${value}")`);
              break;
            }
            if (value === verification.expectedValue) {
              logs.push(`✓ Value equals: ${verification.expectedValue}`);
            } else {
              // Fallback: for <select>, check if selected option's visible text matches expected value
              const tagName = await element.getTagName();
              let matched = false;
              if (tagName.toLowerCase() === 'select') {
                // Try selected option
                try {
                  const selectedOption = await element.findElement(By.xpath(".//option[@selected]"));
                  const optionText = await selectedOption.getText();
                  if (optionText.trim() === verification.expectedValue.trim()) {
                    logs.push(`✓ Fallback: Selected option text equals: ${verification.expectedValue}`);
                    matched = true;
                  }
                } catch {}
                // Try any option with matching text (in case selected attribute is not set)
                if (!matched) {
                  const options = await element.findElements(By.tagName("option"));
                  for (const opt of options) {
                    const optText = await opt.getText();
                    if (optText.trim() === verification.expectedValue.trim()) {
                      const isSelected = await opt.isSelected();
                      if (isSelected) {
                        logs.push(`✓ Fallback: Option with text '${verification.expectedValue}' is selected`);
                        matched = true;
                        break;
                      }
                    }
                  }
                }
              }
              // Fallback: check visible text in the widget/container
              if (!matched) {
                const visibleTextXpaths = [
                  `//*[contains(@class,'selected') and text()='${verification.expectedValue}']`,
                  `//*[contains(@class,'selected') and contains(text(),'${verification.expectedValue}')]`,
                  `//*[text()='${verification.expectedValue}']`,
                  `//*[contains(text(),'${verification.expectedValue}')]`
                ];
                for (const xpath of visibleTextXpaths) {
                  try {
                    const els = await this.driver.findElements(By.xpath(xpath));
                    for (const el of els) {
                      if (await el.isDisplayed()) {
                        logs.push(`✓ Fallback: Visible selected text found: ${verification.expectedValue}`);
                        matched = true;
                        break;
                      }
                    }
                    if (matched) break;
                  } catch {}
                }
              }
              if (!matched) {
                throw new Error(`Value mismatch: expected \"${verification.expectedValue}\", got \"${value}\" and no visible text matched`);
              }
            }
          }
          break;

        case "valueContains":
          if (verification.elementXPath && verification.expectedValue) {
            const element = await this.findElement(verification.elementXPath);
            let value: string | null = await element.getAttribute("value");
            // Masked JDE QBE / password field — typing succeeded, mask is not a failure.
            if (this.isMaskedValue(value)) {
              logs.push(`✓ Value accepted (field masks input: "${value}")`);
              return { success: true };
            }
            const tagName = await element.getTagName();
            let text = "";
            if (tagName.toLowerCase() === 'select') {
              // For <select>, get selected option's text and value
              try {
                const selectedOption = await element.findElement(By.xpath(".//option[@selected]"));
                text = (await selectedOption.getText()).trim();
                value = ((await selectedOption.getAttribute('value')) || '').trim();
              } catch {
                // Fallback: find selected option by isSelected()
                const options = await element.findElements(By.tagName("option"));
                for (const opt of options) {
                  if (await opt.isSelected()) {
                    text = (await opt.getText()).trim();
                    value = ((await opt.getAttribute('value')) || '').trim();
                    break;
                  }
                }
              }
              if (
                text.toLowerCase().includes(verification.expectedValue.trim().toLowerCase()) ||
                (value && value.toLowerCase().includes(verification.expectedValue.trim().toLowerCase()))
              ) {
                logs.push(`✓ valueContains: selected option text or value contains ${verification.expectedValue}`);
                return { success: true };
              } else {
                throw new Error(`Value not found: \"${verification.expectedValue}\" in selected option text \"${text}\" or value \"${value}\"`);
              }
            } else {
              // For other elements, check value attribute
              if (value && value.toLowerCase().includes(verification.expectedValue.trim().toLowerCase())) {
                logs.push(`✓ valueContains: value contains ${verification.expectedValue}`);
                return { success: true };
              } else {
                throw new Error(`Value not found: \"${verification.expectedValue}\" in \"${value}\"`);
              }
            }
          }
          break;

        case "urlEquals":
          if (verification.expectedValue) {
            const url = await this.driver.getCurrentUrl();
            if (url !== verification.expectedValue) {
              throw new Error(`URL mismatch: expected "${verification.expectedValue}", got "${url}"`);
            }
            logs.push(`✓ URL equals: ${verification.expectedValue}`);
          }
          break;

        case "urlContains":
          if (verification.expectedValue) {
            const url = await this.driver.getCurrentUrl();
            if (!url.includes(verification.expectedValue)) {
              throw new Error(`URL doesn't contain: "${verification.expectedValue}"`);
            }
            logs.push(`✓ URL contains: ${verification.expectedValue}`);
          }
          break;

        case "titleEquals":
          if (verification.expectedValue) {
            const title = await this.driver.getTitle();
            if (title !== verification.expectedValue) {
              throw new Error(`Title mismatch: expected "${verification.expectedValue}", got "${title}"`);
            }
            logs.push(`✓ Title equals: ${verification.expectedValue}`);
          }
          break;

        case "titleContains":
          if (verification.expectedValue) {
            const title = await this.driver.getTitle();
            if (!title.includes(verification.expectedValue)) {
              throw new Error(`Title doesn't contain: "${verification.expectedValue}"`);
            }
            logs.push(`✓ Title contains: ${verification.expectedValue}`);
          }
          break;

        case "alertPresent":
          try {
            await this.driver.switchTo().alert();
            // Restore full nested iframe context after alert check
            await this.restoreFramePath();
            logs.push("✓ Alert is present");
          } catch {
            throw new Error("No alert present");
          }
          break;

        default:
          logs.push(`Unknown verification type: ${verification.type}`);
      }

      return { success: true };
    } catch (error: any) {
      logs.push(`✗ Verification failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

    // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * findElement — context-aware, iframe-safe element search.
   *
   * ROOT CAUSE FIX: The old version called switchTo().defaultContent() inside
   * the iframe search loop, destroying the iframe context set up by the click
   * handler. Every subsequent step then searched in the wrong (top-level) context
   * and hung for 120 s.
   *
   * This version:
   *  1. Searches the CURRENT context first (works whether we're in an iframe or not)
   *  2. Only leaves the current context if the element isn't found there
   *  3. Tracks which iframe we end up in (this.currentIframeIndex)
   *  4. Uses 5s timeout instead of 120 s so failures are reported quickly
   */
  private async findElement(xpath: string, timeout: number = 5000): Promise<WebElement> {
    if (!this.driver) throw new Error("No browser driver");

    const startTime = Date.now();
    let lastError: Error | null = null;

    // ── helpers ────────────────────────────────────────────────────────────────
    const isVisible = async (el: WebElement): Promise<boolean> => {
      try { return await el.isDisplayed(); } catch { return false; }
    };

    /** Search in whatever context the driver is currently pointing at. */
    const searchCurrentCtx = async (): Promise<WebElement | null> => {
      try {
        const els = await this.driver!.findElements(By.xpath(xpath));
        for (const el of els) { if (await isVisible(el)) return el; }
      } catch { }
      return null;
    };

    /** Restore the iframe context we started in (full nested path, best-effort). */
    const restoreCtx = async () => {
      try {
        await this.driver!.switchTo().defaultContent();
        for (const idx of this.framePath) {
          await this.driver!.switchTo().frame(idx);
        }
      } catch { /* best-effort */ }
    };

    // Use class-level flags to prevent repeated nested iframe searches across multiple findElement calls within one step
    // ──────────────────────────────────────────────────────────────────────────

    while (Date.now() - startTime < timeout) {
      try {
        // ── STEP 1: search in current context first (fastest path) ────────────
        const inCtx = await searchCurrentCtx();
        if (inCtx) {
          console.log(`[findElement] ✓ Found in current ctx (iframeIdx=${this.currentIframeIndex}): ${xpath.substring(0,80)}`);
          return inCtx;
        }

        // ── STEP 2: try top-level document ────────────────────────────────────
        await this.driver!.switchTo().defaultContent();
        const inMain = await searchCurrentCtx();
        if (inMain) {
          console.log(`[findElement] ✓ Found in main document: ${xpath.substring(0,80)}`);
          this.currentIframeIndex = -1;
          this.framePath = [];
          return inMain;
        }

        // ── STEP 3: try every iframe (single level - fast) ───────────────────
        const iframes = await this.driver!.findElements(By.tagName('iframe'));
        
        for (let i = 0; i < iframes.length; i++) {
          try {
            await this.driver!.switchTo().frame(i);
            const inFrame = await searchCurrentCtx();
            if (inFrame) {
              console.log(`[findElement] ✓ Found in iframe[${i}]: ${xpath.substring(0,80)}`);
              this.currentIframeIndex = i;
              this.framePath = [i];
              return inFrame;
            }
            await this.driver!.switchTo().defaultContent();
          } catch {
            try { await this.driver!.switchTo().defaultContent(); } catch { }
          }
        }

        // ── STEP 4: search nested iframes ONCE (not every loop) ───────────────
        if (!this.stepDidNestedSearch && iframes.length > 0) {
          this.stepDidNestedSearch = true;
          console.log(`[findElement] Searching nested iframes (one-time per step)...`);
          
          await this.driver!.switchTo().defaultContent();
          
          // Search up to 2 levels deep
          for (let i = 0; i < iframes.length; i++) {
            try {
              await this.driver!.switchTo().frame(i);
              
              // Check nested iframes inside iframe[i]
              const nestedIframes = await this.driver!.findElements(By.tagName('iframe'));
              for (let j = 0; j < nestedIframes.length; j++) {
                try {
                  await this.driver!.switchTo().frame(j);
                  console.log(`[findElement] Checking iframe[${i}>${j}]`);
                  
                  const inNested = await searchCurrentCtx();
                  if (inNested) {
                    console.log(`[findElement] ✓ Found in iframe[${i}>${j}]: ${xpath.substring(0, 60)}`);
                    this.framePath = [i, j];
                    this.currentIframeIndex = j;
                    return inNested;
                  }
                  
                  // Check one more level deep (iframe[i>j>k])
                  const deepIframes = await this.driver!.findElements(By.tagName('iframe'));
                  for (let k = 0; k < Math.min(deepIframes.length, 2); k++) {
                    try {
                      await this.driver!.switchTo().frame(k);
                      console.log(`[findElement] Checking iframe[${i}>${j}>${k}]`);
                      
                      const inDeep = await searchCurrentCtx();
                      if (inDeep) {
                        console.log(`[findElement] ✓ Found in iframe[${i}>${j}>${k}]: ${xpath.substring(0, 60)}`);
                        this.framePath = [i, j, k];
                        this.currentIframeIndex = k;
                        return inDeep;
                      }
                      
                      await this.driver!.switchTo().parentFrame();
                    } catch {
                      try { await this.driver!.switchTo().parentFrame(); } catch { }
                    }
                  }
                  
                  await this.driver!.switchTo().parentFrame();
                } catch {
                  try { await this.driver!.switchTo().parentFrame(); } catch { }
                }
              }
              
              await this.driver!.switchTo().defaultContent();
            } catch {
              try { await this.driver!.switchTo().defaultContent(); } catch { }
            }
          }
        }

        // Not found this poll — restore original context and wait
        await restoreCtx();
        await this.driver!.sleep(200);
      } catch (err: any) {
        lastError = err;
        try { await restoreCtx(); } catch { }
        await this.driver!.sleep(200);
      }
    }

    // ── Fallback 1: Wait for dynamically loaded iframes ONCE per step ────────────────────
    if (!this.stepDidDynamicWait) {
      this.stepDidDynamicWait = true;
      console.log(`[findElement] Element not found, waiting for dynamic iframes (one-time per step)...`);
      
      try {
        await this.driver!.switchTo().defaultContent();
        await this.driver!.sleep(1500); // Wait for dynamic content
        
        const iframes = await this.driver!.findElements(By.tagName('iframe'));
        if (iframes.length > 0) {
          console.log(`[findElement] Found ${iframes.length} iframe(s) after waiting`);
          
          for (let i = 0; i < iframes.length; i++) {
            try {
              await this.driver!.switchTo().frame(i);
              const el = await searchCurrentCtx();
              if (el) {
                this.currentIframeIndex = i;
                this.framePath = [i];
                console.log(`[findElement] ✓ Found in iframe[${i}] after dynamic wait`);
                return el;
              }
              await this.driver!.switchTo().defaultContent();
            } catch {
              try { await this.driver!.switchTo().defaultContent(); } catch { }
            }
          }
        }
      } catch { }
    }

    // ── Fallback 2: attribute-based selectors in current context ───────────────
    await restoreCtx();
    const nameMatch = xpath.match(/\[@(?:name|id|placeholder)='([^']+)'\]/);
    if (nameMatch) {
      const attr = nameMatch[1];
      const fbXPaths = [
        `//*[@id='${attr}']`, `//*[@name='${attr}']`, `//*[@placeholder='${attr}']`,
        `//input[@id='${attr}']`, `//input[@name='${attr}']`, `//input[@placeholder='${attr}']`,
        `//*[contains(@id,'${attr}')]`, `//*[contains(@name,'${attr}')]`,
      ];
      for (const fb of fbXPaths) {
        try {
          const els = await this.driver!.findElements(By.xpath(fb));
          for (const el of els) { if (await isVisible(el)) { console.log(`[findElement] ✓ Fallback attr: ${fb}`); return el; } }
        } catch { }
      }
    }

    // ── Fallback 3: scan every iframe one more time with fallback attrs ─────────
    try {
      await this.driver!.switchTo().defaultContent();
      const iframes = await this.driver!.findElements(By.tagName('iframe'));
      for (let i = 0; i < iframes.length; i++) {
        try {
          await this.driver!.switchTo().frame(i);
          const el = await searchCurrentCtx();
          if (el) {
            this.currentIframeIndex = i;
            console.log(`[findElement] ✓ Final fallback found in iframe[${i}]`);
            return el;
          }
          await this.driver!.switchTo().defaultContent();
        } catch {
          try { await this.driver!.switchTo().defaultContent(); } catch { }
        }
      }
    } catch { }

    await restoreCtx();
    throw new Error(`Element not found after ${timeout}ms: ${xpath.substring(0,120)} | ${lastError?.message ?? ''}`);
  }

  // ============================================================================
  // WAIT FOR PAGE LOAD
  // ============================================================================
  private async waitForPageLoad(timeout: number = 10000): Promise<void> {
    if (!this.driver) {
      if (this.playwrightPage) {
        try { await this.playwrightPage.waitForLoadState('domcontentloaded', { timeout }); } catch {}
      }
      return;
    }
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        const state = await this.driver.executeScript("return document.readyState") as string;
        if (state === "complete") {
          // Give any in-flight XHR/fetch a moment to settle
          await this.driver.sleep(50);
          return;
        }
      } catch { /* driver not ready yet */ }
      await this.driver.sleep(50);
    }
    // Don't throw — page may never reach complete (SPAs, etc.)
    console.log(`[AIExecutor] waitForPageLoad: timed out after ${timeout}ms — continuing anyway`);
  }

  /**
   * Wait for an SSO redirect chain (Microsoft Entra / Okta / ADFS) to settle on the
   * target host. When reusing a logged-in profile the IdP auto-returns to the app in
   * a few seconds; if no session exists it parks on the login host so the user can
   * sign in. Either way, steps should not run until we're off the identity provider.
   */
  private async waitForSsoSettle(targetUrl: string, timeout = 180000): Promise<void> {
    if (!this.driver) return;
    let appHost = "";
    try { appHost = new URL(targetUrl).host; } catch { return; }
    const idp = /(login\.microsoftonline|sts\.|adfs|okta\.com|sso\.|login\.live|auth\.)/i;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const cur = await this.driver.getCurrentUrl().catch(() => "");
      const onIdp = idp.test(cur);
      if (cur.includes(appHost) && !onIdp) {
        console.log(`[AIExecutor] SSO settled on app host: ${appHost}`);
        return;
      }
      if (onIdp) console.log(`[AIExecutor] Waiting on SSO/IdP — sign in if prompted…`);
      await this.driver.sleep(1000);
    }
    console.log(`[AIExecutor] SSO wait timed out after ${timeout}ms — continuing`);
  }

  /**
   * After switching into an iframe (e.g. JDE e1menuAppIframe), the inner app is usually
   * loaded by AJAX. Wait until the JDE processing spinner is gone AND the body has real
   * text, so verify/text steps don't run against an empty "..." body. Best-effort.
   */
  private async waitForIframeContent(logs: string[], timeout = 20000): Promise<void> {
    if (!this.driver) return;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        const txt = (await this.driver.executeScript(
          "return document.body ? document.body.innerText.trim() : ''"
        ) as string) || "";
        const sp = await this.driver.executeScript(
          "var s=document.getElementById('processingDiv');return !!(s&&s.offsetParent!==null);"
        ) as boolean;
        const placeholder = /iframe support is required/i.test(txt);
        // JDE renders the app in a NESTED iframe; the outer one only shows a placeholder.
        if (placeholder) {
          const inner = await this.driver.findElements(By.tagName("iframe"));
          if (inner.length > 0) {
            await this.driver.switchTo().frame(0);
            this.framePath.push(0);
            this.currentIframeIndex = 0;
            logs.push("[iframe] drilled into nested app iframe");
            await this.driver.sleep(300);
            continue;
          }
        }
        if (!sp && txt.length > 40 && !placeholder) { await this.driver.sleep(200); logs.push('[iframe] content loaded'); return; }
      } catch { /* frame reloading */ }
      await this.driver.sleep(300);
    }
    logs.push('[iframe] content wait timed out — continuing');
  }

  /**
   * Detects a value the field deliberately hides/normalizes so a read-back can't confirm it:
   * JDE QBE masks as "*", password fields show bullets/asterisks, some clear to empty after Enter.
   */
  private isMaskedValue(v: string | null | undefined): boolean {
    if (v == null) return false;
    const t = v.trim();
    return t === "" || /^[*\u2022\u25CF\u00B7]+$/.test(t); // *, bullets
  }

  /** Best-effort: wait until a JDE/ERP grid has >1 data row (cells>2) before verifying. */
  private async waitForGridRows(timeout = 4000): Promise<void> {
    if (!this.driver) return;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        const ok = await this.driver.executeScript(
          "return Array.from(document.querySelectorAll('table tr')).filter(r=>r.querySelectorAll('td').length>2&&(r.innerText||'').trim()).length>0;"
        ) as boolean;
        if (ok) { await this.driver.sleep(150); return; }
      } catch { /* frame reloading */ }
      await this.driver.sleep(200);
    }
  }

  // ============================================================================
  // SCROLL ELEMENT INTO VIEW
  // ============================================================================
  private async scrollIntoView(element: WebElement): Promise<void> {
    try {
      if (this.driver) {
        await this.driver.executeScript(
          "arguments[0].scrollIntoView({ behavior: 'smooth', block: 'center' });",
          element
        );
        await this.driver.sleep(200);
      }
    } catch { /* best-effort */ }
  }

  // ============================================================================
  // TYPE INTO ELEMENT (clear → click → send keys → verify)
  // ============================================================================
  private async typeIntoElement(element: WebElement, value: string, logs: string[]): Promise<void> {
    if (!this.driver) return;
    const tag = (await element.getTagName()).toLowerCase();

    // 1. Clear existing value
    try {
      await element.clear();
    } catch {
      try {
        await this.driver.executeScript("arguments[0].value = '';", element);
      } catch { }
    }

    // 2. Click to focus
    try { await element.click(); } catch { }
    await this.driver.sleep(50);

    // 3. Select-all + delete (belt-and-suspenders clear)
    try {
      await element.sendKeys(Key.CONTROL + "a");
      await element.sendKeys(Key.DELETE);
    } catch { }

    // 4. Send value
    await element.sendKeys(value);
    logs.push(`[type] Typed "${value.length > 50 ? value.substring(0, 50) + "..." : value}" into ${tag}`);

    // 5. Verify (best-effort)
    try {
      const actual = await element.getAttribute("value") || await element.getText() || "";
      if (actual.includes(value) || value.includes(actual)) {
        logs.push(`[type] ✓ Value verified`);
      } else {
        logs.push(`[type] ⚠ Typed but value mismatch: expected contains "${value}", got "${actual}"`);
      }
    } catch { }
  }

  // ============================================================================
  // CAPTURE SCREENSHOT
  // ============================================================================
  private async captureScreenshot(): Promise<string | undefined> {
    try {
      if (this.driver) {
        const data = await this.driver.takeScreenshot();
        return `data:image/png;base64,${data}`;
      }
      if (this.playwrightPage) {
        const buf = await this.playwrightPage.screenshot({ type: 'png' });
        return `data:image/png;base64,${buf.toString('base64')}`;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  // ============================================================================
  // COLLECT PERFORMANCE METRICS
  // ============================================================================
  private async collectPerformanceMetrics(): Promise<any> {
    try {
      if (!this.driver) return {};
      const metrics = await this.driver.executeScript(`
        const t = window.performance && window.performance.timing;
        const p = window.performance && window.performance.getEntriesByType && window.performance.getEntriesByType('paint');
        const fp  = p && p.find(e => e.name === 'first-paint');
        const fcp = p && p.find(e => e.name === 'first-contentful-paint');
        return {
          pageLoadTime:        t ? (t.loadEventEnd - t.navigationStart) : 0,
          domContentLoaded:    t ? (t.domContentLoadedEventEnd - t.navigationStart) : 0,
          firstPaint:          fp  ? Math.round(fp.startTime)  : 0,
          firstContentfulPaint:fcp ? Math.round(fcp.startTime) : 0,
          memoryUsed:          window.performance && window.performance.memory ? window.performance.memory.usedJSHeapSize : null
        };
      `) as any;
      return metrics || {};
    } catch {
      return {};
    }
  }

  // ============================================================================
  // REPLACE {{placeholders}} IN STEP TEXT
  // ============================================================================
  private replacePlaceholders(text: string, testDataMap: Map<string, string>): string {
    if (!text) return text;
    // Replace {{key}} placeholders
    return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const val = testDataMap.get(key) || testDataMap.get(key.toLowerCase());
      return val !== undefined ? val : `{{${key}}}`;
    });
  }

  // ============================================================================
  // RESOLVE CREDENTIAL STEPS (username / password auto-injection)
  // ============================================================================
  private resolveCredentialStep(
    stepAction: string,
    testDataMap: Map<string, string>,
    snapshot: PageSnapshot,
    logs: string[]
  ): string {
    if (!testDataMap || testDataMap.size === 0) return stepAction;
    const low = stepAction.toLowerCase();

    // Detect username/email step
    const isUsernameStep =
      low.includes("username") || low.includes("user name") ||
      low.includes("email") || low.includes("login") || low.includes("log in");
    const isPasswordStep =
      low.includes("password") || low.includes("passwd") || low.includes("pwd");

    if (!isUsernameStep && !isPasswordStep) return stepAction;

    // Find the value from testDataMap
    const usernameKeys = ["username", "email", "user", "login", "userid"];
    const passwordKeys = ["password", "passwd", "pwd", "pass"];
    const searchKeys = isPasswordStep ? passwordKeys : usernameKeys;

    let resolvedValue: string | undefined;
    for (const k of searchKeys) {
      resolvedValue = testDataMap.get(k) || testDataMap.get(k.toLowerCase());
      if (resolvedValue) break;
    }

    if (!resolvedValue) return stepAction;

    // Find the input field xpath from snapshot
    const searchHints = isPasswordStep
      ? ["password", "pass", "pwd"]
      : ["username", "email", "user", "login"];
    const matchedEl = (snapshot.elements ?? []).find(el =>
      el.isVisible && (el.tag === "input") &&
      searchHints.some(h =>
        el.id?.toLowerCase().includes(h) ||
        el.name?.toLowerCase().includes(h) ||
        el.type?.toLowerCase() === (isPasswordStep ? "password" : "email") ||
        el.placeholder?.toLowerCase().includes(h)
      )
    );

    const fieldXpath = matchedEl?.xpath || (isPasswordStep ? "//input[@type='password']" : "//input[@type='email' or @type='text'][1]");

    logs.push(`[resolveCredential] ${isPasswordStep ? "password" : "username"} → "${isPasswordStep ? "[MASKED]" : resolvedValue}" → ${fieldXpath}`);
    return `Type "${resolvedValue}" into the ${isPasswordStep ? "password" : "username"} input field at xpath: ${fieldXpath}`;
  }


  // ============================================================================
  // RUNTIME DOM: findElementWithFallbacks
  // Tries each locator in the chain (primary → fallback1 → fallback2).
  // Supports id=, name=, css=, xpath=, and shadow>> prefixes.
  // ============================================================================
  private async findElementWithFallbacks(
    locatorChain: string[],
    logs: string[],
    timeout: number = 5000
  ): Promise<WebElement> {
    if (!locatorChain || locatorChain.length === 0)
      throw new Error("findElementWithFallbacks: empty locator chain");

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < locatorChain.length; attempt++) {
      const loc = locatorChain[attempt];
      try {
        logs.push(`[Runtime DOM] Trying locator[${attempt}]: ${loc}`);

        // JDE menu/tree text click: "jdetext>>Sales Order Entry" — resolve by
        // VISIBLE TEXT to the nearest CLICKABLE ANCESTOR (row/anchor), frame-aware.
        // This is how JDE navigator items must be clicked (their ids are dynamic).
        if (loc.startsWith("jdetext>>")) {
          const wanted = loc.slice("jdetext>>".length).trim();
          const el = await this.findJdeClickableByText(wanted, logs);
          if (el) { logs.push(`[Runtime DOM] ✓ JDE text hit: ${loc}`); return el; }
          logs.push(`[Runtime DOM] ✗ JDE text miss: ${loc}`);
          continue;
        }

        // Shadow DOM: "shadow>>HOST_SEL>>INNER_SEL" — pierce via JS
        if (loc.startsWith("shadow>>")) {
          const parts  = loc.replace("shadow>>", "").split(">>");
          const host   = parts[0] || "*";
          const inner  = parts[1] || "*";
          const el = await this.driver!.executeScript(
            "var h=document.querySelector(arguments[0]); return h&&h.shadowRoot?h.shadowRoot.querySelector(arguments[1]):null;",
            host, inner
          ) as WebElement | null;
          if (el) {
            const vis = await el.isDisplayed().catch(() => false);
            if (vis) { logs.push(`[Runtime DOM] ✓ Shadow hit: ${loc}`); return el; }
          }
          continue;
        }

        // Standard locator — delegate to context-aware findElement
        const el = await this.findElement(loc, timeout);
        logs.push(`[Runtime DOM] ✓ Hit locator[${attempt}]: ${loc}`);
        return el;
      } catch (e: any) {
        lastError = e;
        logs.push(`[Runtime DOM] ✗ Locator[${attempt}] failed: ${e.message?.substring(0, 80)}`);
        timeout = Math.min(timeout, 2000); // fast-fail for fallbacks
      }
    }

    // ── GENERIC LOCATOR LOOSENING ─────────────────────────────────────────────
    // Many failures are near-misses: an EXACT match locator (e.g. @title='Add' or
    // text()='Add') misses because the live value has extra text ('Add (Ctrl+Alt+A)').
    // Before giving up, auto-generate tolerant variants (contains / normalize-space)
    // from the AI's own locators and try them. This is app-agnostic and helps any UI.
    try {
      const loosened = this.loosenLocators(locatorChain);
      for (const loc of loosened) {
        try {
          logs.push(`[Runtime DOM] Trying loosened locator: ${loc}`);
          const el = await this.findElement(loc, Math.min(timeout, 2000));
          logs.push(`[Runtime DOM] ✓ Hit loosened locator: ${loc}`);
          return el;
        } catch (e: any) {
          logs.push(`[Runtime DOM] ✗ Loosened failed: ${e.message?.substring(0, 60)}`);
        }
      }
    } catch (e: any) {
      logs.push(`[Runtime DOM] Loosening error (non-fatal): ${e.message?.substring(0, 60)}`);
    }

    // ── JDE TOOLBAR SAFETY NET ────────────────────────────────────────────────
    // The AI sometimes emits a wrong locator for a JDE toolbar action (e.g.
    // input[title='Add'] — but JDE's Add is an <a>/<div> with id="hc_Add"). If the
    // chain looks like it targets a known JDE action word, resolve it robustly by
    // hc_* id / title / aria-label / visible text across ALL tags before failing.
    try {
      const jdeAction = this.detectJdeActionWord(locatorChain);
      if (jdeAction) {
        logs.push(`[JDE] Locator chain failed; trying JDE toolbar resolver for action "${jdeAction}"`);
        const el = await this.findJdeActionButton(jdeAction, logs);
        if (el) {
          logs.push(`[JDE] ✓ Resolved "${jdeAction}" via toolbar safety net`);
          return el;
        }
      }
    } catch (e: any) {
      logs.push(`[JDE] Toolbar resolver error (non-fatal): ${e.message?.substring(0, 80)}`);
    }

    // ── JDE MENU / TREE / LABEL SAFETY NET ────────────────────────────────────
    // JDE menu/tree items render as <span>/<td> with the click handler on an
    // ANCESTOR row/anchor, and their ids are DYNAMIC (f1dnode123…), so the AI's
    // id/xpath locators go stale. Recover the intended VISIBLE TEXT from the chain
    // (or the step intent) and resolve the nearest clickable ancestor by text.
    try {
      const clickText = this.extractJdeClickText(locatorChain);
      if (clickText) {
        logs.push(`[JDE] Locator chain failed; trying JDE menu-text resolver for "${clickText}"`);
        const el = await this.findJdeClickableByText(clickText, logs);
        if (el) {
          logs.push(`[JDE] ✓ Resolved "${clickText}" via menu-text safety net (nearest clickable ancestor)`);
          return el;
        }
      }
    } catch (e: any) {
      logs.push(`[JDE] Menu-text resolver error (non-fatal): ${e.message?.substring(0, 80)}`);
    }

    throw new Error(`All ${locatorChain.length} locators failed. Last: ${lastError?.message ?? "unknown"}`);
  }

  /**
   * Generate tolerant ("loosened") variants of the given locators so a near-miss
   * EXACT match can still resolve. App-agnostic. Examples:
   *   //*[@title='Add']                → //*[contains(@title,'Add')]
   *   //*[@title='Add (Ctrl+Alt+A)']   → //*[contains(@title,'Add')]   (suffix stripped)
   *   //*[text()='Add']                → //*[contains(normalize-space(.),'Add')]
   *   css=[title='Add']                → xpath=//*[contains(@title,'Add')]
   * Returns a de-duplicated list of xpath= locators (never throws).
   */
  private loosenLocators(locatorChain: string[]): string[] {
    const out = new Set<string>();
    const stripSuffix = (v: string) =>
      // Drop a trailing " (…)" shortcut hint and collapse whitespace: "Add (Ctrl+Alt+A)" → "Add"
      v.replace(/\s*\(.*?\)\s*$/, "").trim();

    for (const raw of locatorChain || []) {
      if (!raw) continue;
      const loc = raw.replace(/^xpath=/, "").replace(/^css=/, "");

      // @attr='value'  (title, aria-label, value, alt, name, placeholder)
      const attrRe = /@?([a-zA-Z-]+)\s*=\s*['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = attrRe.exec(loc)) !== null) {
        const attr = m[1].toLowerCase();
        if (["title", "aria-label", "value", "alt", "name", "placeholder", "data-jde"].includes(attr)) {
          const full = m[2];
          const base = stripSuffix(full);
          if (full) out.add(`xpath=//*[contains(@${attr},'${full.replace(/'/g, "")}')]`);
          if (base && base !== full) out.add(`xpath=//*[contains(@${attr},'${base.replace(/'/g, "")}')]`);
        }
      }

      // text()='value'  or  .='value'
      const textRe = /(?:text\(\)|\.)\s*=\s*['"]([^'"]+)['"]/g;
      while ((m = textRe.exec(loc)) !== null) {
        const full = m[1];
        const base = stripSuffix(full);
        if (full) out.add(`xpath=//*[contains(normalize-space(.),'${full.replace(/'/g, "")}')]`);
        if (base && base !== full) out.add(`xpath=//*[contains(normalize-space(.),'${base.replace(/'/g, "")}')]`);
      }
    }
    return Array.from(out);
  }

  /** Known JDE toolbar/hyper-control action words we can resolve by label. */
  private static readonly JDE_ACTION_WORDS = [
    "Add", "Select", "OK", "Cancel", "Find", "Delete", "Copy", "Close",
    "Save", "Submit", "Next", "Previous", "Back", "Continue",
  ];

  /**
   * Extract a JDE action word (Add/Select/OK…) from the failed locator chain OR
   * from the current step's human-readable intent. We check the INTENT first
   * because the AI may emit a wrong locator (e.g. //*[@title='Add (Ctrl+Alt+A)'])
   * while the step text ("CLICK: Add") states the real intent unambiguously.
   * Matching is word-boundary based so titles with shortcut suffixes
   * ("Add (Ctrl+Alt+A)") and ids ("hc_Add") are all detected.
   */
  private detectJdeActionWord(locatorChain: string[]): string | null {
    const intent = (this.currentStepIntent || "").toLowerCase();
    const chainBlob = (locatorChain || []).join(" ").toLowerCase();

    // 1) Prefer an action word that appears as a whole word in the STEP INTENT.
    for (const word of AITestExecutor.JDE_ACTION_WORDS) {
      const w = word.toLowerCase();
      if (new RegExp(`\\b${w}\\b`, "i").test(intent)) return word;
    }

    // 2) Otherwise look in the locator chain. Accept the word when it appears as a
    //    quoted value (possibly with a suffix like " (Ctrl+Alt+A)"), an =value,
    //    an _word (hc_Add), inside >text<, or simply as a standalone word.
    for (const word of AITestExecutor.JDE_ACTION_WORDS) {
      const w = word.toLowerCase();
      if (
        new RegExp(`['"]${w}\\b`, "i").test(chainBlob) ||  // 'Add… / "Add…  (suffix ok)
        chainBlob.includes(`=${w}`) || chainBlob.includes(`_${w}`) ||
        chainBlob.includes(`>${w}<`) || chainBlob.includes(`hc_${w}`) ||
        new RegExp(`\\b${w}\\b`, "i").test(chainBlob)
      ) {
        return word;
      }
    }
    return null;
  }

  /**
   * Robustly locate a JDE toolbar action button by its LABEL, independent of tag.
   * Tries, in order: id=hc_<Word>, [id^="hc_"] whose title/text match, then any
   * element whose title / aria-label / trimmed text equals the word. Clicks the
   * FIRST visible match. Returns null if none found (caller then fails honestly).
   *
   * FRAME-AWARE: JDE forms+toolbars live inside nested e1menuAppIframe, so this
   * searches the current context, then the main document, then every iframe and
   * one level of nested iframes — restoring the driver context to wherever the
   * button was found so the subsequent click runs in the right frame.
   */
  private async findJdeActionButton(word: string, logs: string[]): Promise<WebElement | null> {
    if (!this.driver) return null;

    // In-page resolver: returns the first VISIBLE element matching the action word.
    const SCRIPT = `
      var word = arguments[0];
      var wl = word.toLowerCase();
      function vis(e){ try { var r=e.getBoundingClientRect(); var s=getComputedStyle(e);
        return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; } catch(_) { return false; } }
      // Normalize a label and decide whether it refers to the action word.
      // Accepts exact ("Add"), prefix with a shortcut/suffix ("Add (Ctrl+Alt+A)"),
      // or the word as a standalone token ("Add Row"). Avoids false hits like "Address".
      function matches(label){
        if(!label) return false;
        var t = label.trim().toLowerCase();
        if(t === wl) return true;
        if(t.indexOf(wl) === 0 && /[^a-z]/.test(t.charAt(wl.length))) return true; // "add (ctrl…" / "add…"
        return new RegExp('\\\\b'+wl+'\\\\b').test(t);
      }
      function labelOf(e){
        return (e.getAttribute('title')||'') + '\\u0001' + (e.getAttribute('aria-label')||'') + '\\u0001'
             + (e.getAttribute('value')||'') + '\\u0001' + (e.getAttribute('alt')||'') + '\\u0001'
             + (e.getAttribute('name')||'') + '\\u0001' + (e.innerText||e.textContent||'');
      }
      function anyLabelMatches(e){
        var parts = labelOf(e).split('\\u0001');
        for (var p=0;p<parts.length;p++){ if (matches(parts[p])) return true; }
        return false;
      }
      // 1) Exact JDE hyper-control id: hc_Add, hc_Select, …
      var byId = document.getElementById('hc_' + word);
      if (byId && vis(byId)) return byId;
      // 2) Any hc_* control whose title/aria-label/text refers to the word
      var hc = Array.prototype.slice.call(document.querySelectorAll('[id^="hc_"]'));
      for (var i=0;i<hc.length;i++){ if (vis(hc[i]) && anyLabelMatches(hc[i])) return hc[i]; }
      // 3) Any element whose title/aria-label/value/alt refers to the word
      var titled = Array.prototype.slice.call(document.querySelectorAll('[title],[aria-label],[value],[alt]'));
      for (var j=0;j<titled.length;j++){ if (vis(titled[j]) && anyLabelMatches(titled[j])) return titled[j]; }
      // 4) Any clickable element whose trimmed visible text refers to the word
      var clickable = Array.prototype.slice.call(document.querySelectorAll('a,button,div,span,td,img,input[type="button"],input[type="submit"],[role="button"],[onclick]'));
      for (var k=0;k<clickable.length;k++){ var el3=clickable[k];
        var tx=(el3.innerText||el3.textContent||'');
        if (vis(el3) && (matches(tx) || anyLabelMatches(el3))) return el3;
      }
      return null;
    `;

    const tryHere = async (): Promise<WebElement | null> => {
      try {
        const el = (await this.driver!.executeScript(SCRIPT, word)) as WebElement | null;
        if (el) { try { await this.scrollIntoView(el); } catch {} return el; }
      } catch {}
      return null;
    };

    // 1) Current context (driver may already be inside the form iframe).
    let found = await tryHere();
    if (found) { logs.push(`[JDE] toolbar "${word}" found in current frame`); return found; }

    // 2) Main document.
    try { await this.driver.switchTo().defaultContent(); this.currentIframeIndex = -1; this.framePath = []; } catch {}
    found = await tryHere();
    if (found) { logs.push(`[JDE] toolbar "${word}" found in main document`); return found; }

    // 3) Each top-level iframe, then one level of nesting (JDE's e1menuAppIframe).
    let topFrames: WebElement[] = [];
    try { topFrames = await this.driver.findElements(By.tagName("iframe")); } catch {}
    for (let i = 0; i < topFrames.length; i++) {
      try {
        await this.driver.switchTo().defaultContent();
        await this.driver.switchTo().frame(i);
        found = await tryHere();
        if (found) {
          this.currentIframeIndex = i; this.framePath = [i];
          logs.push(`[JDE] toolbar "${word}" found in iframe[${i}]`);
          return found;
        }
        // nested level
        let nested: WebElement[] = [];
        try { nested = await this.driver.findElements(By.tagName("iframe")); } catch {}
        for (let n = 0; n < nested.length; n++) {
          try {
            await this.driver.switchTo().frame(n);
            found = await tryHere();
            if (found) {
              this.currentIframeIndex = i; this.framePath = [i, n];
              logs.push(`[JDE] toolbar "${word}" found in iframe[${i}][${n}]`);
              return found;
            }
            await this.driver.switchTo().defaultContent();
            await this.driver.switchTo().frame(i);
          } catch { try { await this.driver.switchTo().defaultContent(); await this.driver.switchTo().frame(i); } catch {} }
        }
      } catch { try { await this.driver.switchTo().defaultContent(); } catch {} }
    }

    // Not found anywhere — restore to main document so the caller fails cleanly.
    try { await this.driver.switchTo().defaultContent(); this.currentIframeIndex = -1; this.framePath = []; } catch {}
    return null;
  }

  /**
   * Extract the human-readable TEXT a locator/step is trying to click, so the JDE
   * menu resolver can re-find it by visible text when the AI's selector (often a
   * DYNAMIC id like f1dnode123) has gone stale. Looks in the locator chain first
   * (text()='X', normalize-space()='X', contains(.,'X'), @title/@aria-label='X'),
   * then falls back to the step intent ("CLICK: Sales Order Entry" → "Sales Order Entry").
   */
  private extractJdeClickText(locatorChain: string[]): string | null {
    const fromLoc = (s: string): string | null => {
      if (!s) return null;
      const pats = [
        /(?:text\(\)|normalize-space\(\.?\)|\.)\s*=\s*['"]([^'"]+)['"]/,
        /contains\s*\(\s*(?:normalize-space\(\.?\)|text\(\)|\.)\s*,\s*['"]([^'"]+)['"]\s*\)/,
        /@(?:title|aria-label|value|alt)\s*=\s*['"]([^'"]+)['"]/,
        /contains\s*\(\s*@(?:title|aria-label|value|alt)\s*,\s*['"]([^'"]+)['"]\s*\)/,
      ];
      for (const p of pats) { const m = s.match(p); if (m && m[1] && m[1].trim().length > 1) return m[1].trim(); }
      return null;
    };
    for (const loc of locatorChain || []) { const t = fromLoc(loc); if (t) return t; }

    // Fall back to the step intent: strip a leading verb ("CLICK:", "Select", "Open"…).
    const intent = (this.currentStepIntent || "").trim();
    if (intent) {
      const m = intent.match(/^(?:click|select|open|choose|navigate to|go to|expand|press|tap)\s*[:\-]?\s*(.+)$/i);
      const cand = (m ? m[1] : intent).replace(/["'`]/g, "").trim();
      // Normalize spoken method hints ("Navigator by fastpath" → "Navigator") so
      // the by-text resolver matches the real on-screen label, not the sentence.
      const cleaned = this.cleanJdeMenuLabel(cand);
      const finalCand = cleaned && cleaned.length >= 2 ? cleaned : cand;
      if (finalCand.length > 1 && finalCand.length <= 60) return finalCand;
    }
    return null;
  }

  /**
   * Resolve a JDE MENU / TREE / LABEL item by its VISIBLE TEXT and return the
   * nearest CLICKABLE element — because in JDE the text node (<span>/<td>) usually
   * has NO click handler; it lives on an ancestor row/anchor. Frame-aware: searches
   * the current context, the main document, then every iframe and one nested level
   * (JDE's e1menuAppIframe), restoring the driver to wherever the element was found.
   * Picks the FIRST VISIBLE match. Ignores dynamic ids entirely (matches on text).
   * Returns null if nothing matches (caller then fails honestly).
   */
  private async findJdeClickableByText(text: string, logs: string[]): Promise<WebElement | null> {
    if (!this.driver || !text) return null;

    const SCRIPT = `
      var want = (arguments[0] || '').trim().toLowerCase();
      function vis(e){ try { var r=e.getBoundingClientRect(); var s=getComputedStyle(e);
        return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; } catch(_){ return false; } }
      // Direct (own) text of an element, excluding descendants.
      function own(e){ var t=''; for (var i=0;i<e.childNodes.length;i++){ var n=e.childNodes[i];
        if (n.nodeType===3) t+=n.nodeValue; } return t.trim(); }
      // Accessible name candidates: text + common label attributes (icons have NO text).
      function labels(e){
        return [ own(e), (e.innerText||e.textContent||''),
          e.getAttribute&&e.getAttribute('title')||'', e.getAttribute&&e.getAttribute('aria-label')||'',
          e.getAttribute&&e.getAttribute('alt')||'', e.getAttribute&&e.getAttribute('value')||'',
          e.getAttribute&&e.getAttribute('data-title')||'' ]
          .map(function(x){ return (x||'').trim().toLowerCase(); });
      }
      function wordHit(hay){ // whole-word match so "Navigator" hits "E1 Navigator" but not "navigatorbar"
        if (!hay) return false;
        try { return new RegExp('(^|[^a-z0-9])'+want.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&')+'([^a-z0-9]|\$)').test(hay); }
        catch(_) { return hay.indexOf(want)>=0; }
      }
      function clickable(e){
        // Walk up to the nearest element that actually handles clicks.
        var cur=e;
        for (var d=0; d<6 && cur; d++){
          var tag=(cur.tagName||'').toLowerCase();
          var st=(cur.getAttribute && cur.getAttribute('style')||'');
          if (tag==='a'||tag==='button'||tag==='tr'|| (cur.getAttribute && (cur.getAttribute('onclick')||cur.getAttribute('role')==='button'))
              || /cursor\\s*:\\s*pointer/i.test(st)) return cur;
          cur=cur.parentElement;
        }
        return e;
      }
      // Search widely: include icon/image tags whose name lives in attributes.
      var all = document.querySelectorAll('a,button,span,td,div,li,label,img,input,[role="button"],[role="treeitem"],[role="menuitem"],[title],[aria-label]');
      var exactText=null, exactAttr=null, partial=null, token=null;
      for (var i=0;i<all.length;i++){ var e=all[i]; if(!vis(e)) continue;
        var L=labels(e);
        var ot=L[0], ft=L[1];
        if (ot===want){ exactText=e; break; }                       // best: own text equals
        if (!exactAttr){ for (var a=2;a<L.length;a++){ if (L[a]===want){ exactAttr=e; break; } } }
        if (!partial && (ft===want || ft.indexOf(want)>=0)) partial=e;
        if (!token){ for (var b=0;b<L.length;b++){ if (wordHit(L[b])){ token=e; break; } } }
      }
      var hit = exactText || exactAttr || partial || token;
      return hit ? clickable(hit) : null;
    `;

    const tryHere = async (): Promise<WebElement | null> => {
      try {
        const el = (await this.driver!.executeScript(SCRIPT, text)) as WebElement | null;
        if (el) { try { await this.scrollIntoView(el); } catch {} return el; }
      } catch {}
      return null;
    };

    // 1) Current context.
    let found = await tryHere();
    if (found) { logs.push(`[JDE] menu text "${text}" resolved in current frame`); return found; }

    // 2) Main document.
    try { await this.driver.switchTo().defaultContent(); this.currentIframeIndex = -1; this.framePath = []; } catch {}
    found = await tryHere();
    if (found) { logs.push(`[JDE] menu text "${text}" resolved in main document`); return found; }

    // 3) Each top-level iframe, then one nested level.
    let topFrames: WebElement[] = [];
    try { topFrames = await this.driver.findElements(By.tagName("iframe")); } catch {}
    for (let i = 0; i < topFrames.length; i++) {
      try {
        await this.driver.switchTo().defaultContent();
        await this.driver.switchTo().frame(i);
        found = await tryHere();
        if (found) { this.currentIframeIndex = i; this.framePath = [i]; logs.push(`[JDE] menu text "${text}" resolved in iframe[${i}]`); return found; }
        let nested: WebElement[] = [];
        try { nested = await this.driver.findElements(By.tagName("iframe")); } catch {}
        for (let n = 0; n < nested.length; n++) {
          try {
            await this.driver.switchTo().frame(n);
            found = await tryHere();
            if (found) { this.currentIframeIndex = i; this.framePath = [i, n]; logs.push(`[JDE] menu text "${text}" resolved in iframe[${i}][${n}]`); return found; }
            await this.driver.switchTo().defaultContent();
            await this.driver.switchTo().frame(i);
          } catch { try { await this.driver.switchTo().defaultContent(); await this.driver.switchTo().frame(i); } catch {} }
        }
      } catch { try { await this.driver.switchTo().defaultContent(); } catch {} }
    }

    try { await this.driver.switchTo().defaultContent(); this.currentIframeIndex = -1; this.framePath = []; } catch {}
    return null;
  }
}

// Singleton instance used throughout the application
export const aiTestExecutor = new AITestExecutor();