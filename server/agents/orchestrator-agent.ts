// ============================================================================
// AITAS Multi-Agent System — Master Orchestrator Agent
// State machine that coordinates all agents in the pipeline
// Planner → Navigator → DOM Intelligence → Action → Validation → (Healing)
// ============================================================================

import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';

import { agentBus } from './agent-bus.js';
import { memoryAgent } from './memory-agent.js';
import { domIntelligenceAgent } from './dom-intelligence-agent.js';
import { plannerAgent } from './planner-agent.js';
import { actionAgent } from './action-agent.js';
import { validationAgent } from './validation-agent.js';

import type {
  WorkflowContext,
  WorkflowStatus,
  ExecutionStep,
  SemanticDOM,
  MultiAgentSessionRequest,
  MultiAgentSessionResponse,
  OrchestratorEvent,
  StepResult,
} from './types.js';

export class OrchestratorAgent {
  private activeSessions = new Map<string, WorkflowContext>();
  private activeBrowsers = new Map<string, { browser: Browser; context: BrowserContext; page: Page }>();

  // ─── Start Session ────────────────────────────────────────────────────────

  async startSession(request: MultiAgentSessionRequest): Promise<string> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const testDataMap = new Map<string, string>();
    if (request.testData) {
      for (const [k, v] of Object.entries(request.testData)) {
        testDataMap.set(k, v);
        testDataMap.set(k.toLowerCase(), v);
      }
    }

    const ctx: WorkflowContext = {
      sessionId,
      testCaseId: request.testCaseId,
      testCaseTitle: request.testCaseTitle || 'Untitled Test',
      targetUrl: request.targetUrl,
      steps: [],
      currentStepIndex: 0,
      status: 'idle',
      startTime: new Date(),
      testData: testDataMap,
      logs: [],
      screenshots: [],
      passedSteps: 0,
      failedSteps: 0,
      healingAttempts: 0,
    };

    this.activeSessions.set(sessionId, ctx);

    // Run async without blocking
    this.runSession(sessionId, request).catch(err => {
      console.error(`[Orchestrator] Session ${sessionId} fatal error:`, err);
      this.updateStatus(ctx, 'failed');
      this.emit(ctx, 'session_failed', { error: err.message });
    });

    return sessionId;
  }

  // ─── Main Session Runner ──────────────────────────────────────────────────

  private async runSession(
    sessionId: string,
    request: MultiAgentSessionRequest
  ): Promise<void> {
    const ctx = this.activeSessions.get(sessionId)!;
    const maxRetries = request.maxRetries ?? 3;
    const captureScreenshots = request.captureScreenshots ?? true;

    this.log(ctx, `[Orchestrator] ▶ Session ${sessionId} starting`);
    this.log(ctx, `[Orchestrator] Target: ${request.targetUrl}`);
    this.log(ctx, `[Orchestrator] Steps: ${request.steps.length}`);

    // ── PHASE 1: PLANNING ─────────────────────────────────────────────────
    this.updateStatus(ctx, 'planning');
    this.emit(ctx, 'session_started', { sessionId, targetUrl: request.targetUrl });

    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      // ── PHASE 2: BROWSER LAUNCH ───────────────────────────────────────
      this.log(ctx, '[Orchestrator] Launching Playwright browser...');
      browser = await chromium.launch({
        headless: request.headless ?? true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
        ],
      });

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        locale: 'en-US',
      });

      context.setDefaultTimeout(60000);
      page = await context.newPage();

      // ── PHASE 3: NAVIGATE TO TARGET URL ──────────────────────────────
      this.updateStatus(ctx, 'navigating');
      this.log(ctx, `[Navigator] Navigating to ${request.targetUrl}...`);

      const navResult = await page.goto(request.targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      }).catch((err: any) => ({ ok: () => false, error: err.message }));

      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(500);

      this.log(ctx, `[Navigator] Page loaded: "${await page.title().catch(() => '')}" at ${page.url()}`);

      // ── PHASE 4: DOM CAPTURE ──────────────────────────────────────────
      this.updateStatus(ctx, 'capturing-dom');
      this.log(ctx, '[DOMIntelligence] Capturing accessibility tree + semantic DOM...');

      const initialDOM = await domIntelligenceAgent.capture(page);
      ctx.lastDOMSnapshot = initialDOM;

      const domSummary = domIntelligenceAgent.summarizeForAI(initialDOM);
      this.log(ctx, `[DOMIntelligence] Captured: ${initialDOM.inputs.length} inputs, ${initialDOM.buttons.length} buttons, ${initialDOM.forms.length} forms`);
      this.emit(ctx, 'dom_captured', {
        inputs: initialDOM.inputs.length,
        buttons: initialDOM.buttons.length,
        forms: initialDOM.forms.length,
        iframes: initialDOM.iframes.length,
        summary: domSummary.slice(0, 500),
      });

      // ── PHASE 5: PLANNING ─────────────────────────────────────────────
      this.log(ctx, '[Planner] Generating execution plan from steps...');

      const planResult = await plannerAgent.plan({
        rawSteps: request.steps,
        targetUrl: request.targetUrl,
        testData: request.testData,
        domSnapshot: initialDOM,
      });

      ctx.steps = planResult.steps;
      this.log(ctx, `[Planner] Plan ready: ${planResult.strategy}, ${planResult.steps.length} steps, ETA: ${Math.round(planResult.estimatedDuration / 1000)}s`);

      if (planResult.warnings.length > 0) {
        planResult.warnings.forEach(w => this.log(ctx, `[Planner] ⚠ ${w}`));
      }

      this.emit(ctx, 'planning_complete', {
        steps: ctx.steps.length,
        strategy: planResult.strategy,
        warnings: planResult.warnings,
      });

      // ── PHASE 6: STEP-BY-STEP EXECUTION ──────────────────────────────
      this.updateStatus(ctx, 'executing');

      for (let i = 0; i < ctx.steps.length; i++) {
        ctx.currentStepIndex = i;
        const step = ctx.steps[i];

        this.log(ctx, `\n[Step ${step.stepNumber}/${ctx.steps.length}] "${step.rawAction}"`);
        this.log(ctx, `[Step ${step.stepNumber}] Expected: "${step.rawExpected}"`);
        this.log(ctx, `[Step ${step.stepNumber}] Action type: ${step.parsedAction?.type} (confidence: ${step.parsedAction?.confidence}%)`);

        step.status = 'running';
        step.startedAt = new Date();
        step.retries = 0;

        this.emit(ctx, 'step_started', {
          stepNumber: step.stepNumber,
          action: step.rawAction,
          expected: step.rawExpected,
          parsedType: step.parsedAction?.type,
          confidence: step.parsedAction?.confidence,
        });

        // ── Execute with retry loop ────────────────────────────────────
        let stepResult = await this.executeStepWithRetry(
          page,
          step,
          ctx,
          maxRetries,
          captureScreenshots
        );

        step.status = stepResult.passed ? 'passed' : 'failed';
        step.completedAt = new Date();
        step.result = stepResult;

        // Screenshot capture
        if (captureScreenshots || !stepResult.passed) {
          const screenshot = await page.screenshot({ type: 'jpeg', quality: 65 }).then(b => b.toString('base64')).catch(() => null);
          if (screenshot) {
            ctx.screenshots.push({
              stepIndex: i,
              screenshot,
              label: `Step ${step.stepNumber}: ${stepResult.passed ? '✓' : '✗'} ${step.rawAction.slice(0, 80)}`,
            });
            stepResult.screenshot = screenshot;
          }
        }

        // Update counters
        if (stepResult.passed) {
          ctx.passedSteps++;
          this.log(ctx, `[Step ${step.stepNumber}] ✓ PASSED (${stepResult.duration}ms)`);
        } else {
          ctx.failedSteps++;
          this.log(ctx, `[Step ${step.stepNumber}] ✗ FAILED: ${stepResult.error}`);
        }

        this.emit(ctx, stepResult.passed ? 'step_complete' : 'step_failed', {
          stepNumber: step.stepNumber,
          passed: stepResult.passed,
          duration: stepResult.duration,
          error: stepResult.error,
          selectorUsed: stepResult.selectorUsed,
          retryCount: stepResult.retryCount,
          screenshot: captureScreenshots ? stepResult.screenshot : undefined,
        });

        // Refresh DOM snapshot every 3 steps or after failures
        if ((i + 1) % 3 === 0 || !stepResult.passed) {
          try {
            ctx.lastDOMSnapshot = await domIntelligenceAgent.capture(page);
          } catch {
            // Non-fatal
          }
        }

        // Soft stop: if > 3 consecutive failures, abort
        const recentSteps = ctx.steps.slice(Math.max(0, i - 2), i + 1);
        if (recentSteps.length >= 3 && recentSteps.every(s => s.status === 'failed')) {
          this.log(ctx, '[Orchestrator] ⚠ 3 consecutive failures detected — stopping execution');
          break;
        }
      }

      // ── PHASE 7: COMPLETION ───────────────────────────────────────────
      const totalSteps = ctx.steps.length;
      const passed = ctx.passedSteps;
      const failed = ctx.failedSteps;
      const passRate = totalSteps > 0 ? Math.round((passed / totalSteps) * 100) : 0;

      ctx.endTime = new Date();
      const duration = ctx.endTime.getTime() - ctx.startTime.getTime();
      const finalStatus: WorkflowStatus = failed > 0 ? 'failed' : 'completed';
      this.updateStatus(ctx, finalStatus);

      this.log(ctx, `\n[Orchestrator] 🏁 Session complete: ${passed}/${totalSteps} passed (${passRate}%) in ${Math.round(duration / 1000)}s`);

      // Save workflow to memory
      memoryAgent.saveWorkflow({
        sessionId,
        url: request.targetUrl,
        completedSteps: ctx.steps.filter(s => s.status === 'passed').map(s => s.stepNumber),
        failedSteps: ctx.steps.filter(s => s.status === 'failed').map(s => ({
          stepNumber: s.stepNumber,
          error: s.result?.error || 'unknown',
        })),
        selectors: Object.fromEntries(
          ctx.steps
            .filter(s => s.result?.selectorUsed)
            .map(s => [s.id, s.result!.selectorUsed!])
        ),
        timestamp: new Date(),
      });

      this.emit(ctx, 'session_complete', {
        passed,
        failed,
        total: totalSteps,
        passRate,
        duration,
        healingAttempts: ctx.healingAttempts,
      });

    } catch (err: any) {
      this.log(ctx, `[Orchestrator] Fatal error: ${err.message}`);
      this.updateStatus(ctx, 'failed');
      this.emit(ctx, 'session_failed', { error: err.message });
    } finally {
      // Always clean up browser
      try {
        if (page && !page.isClosed()) await page.close();
        if (browser) await browser.close();
      } catch { /* ignore */ }
    }
  }

  // ─── Step Execution with Retry + Healing ─────────────────────────────────

  private async executeStepWithRetry(
    page: Page,
    step: ExecutionStep,
    ctx: WorkflowContext,
    maxRetries: number,
    captureScreenshots: boolean
  ): Promise<StepResult> {
    const stepLogs: string[] = [];
    const startTime = Date.now();
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (attempt > 1) {
        this.log(ctx, `[Step ${step.stepNumber}] 🔄 Retry attempt ${attempt}/${maxRetries}...`);
        this.emit(ctx, 'healing_started', { stepNumber: step.stepNumber, attempt });

        // Re-capture DOM before retry (DOM may have changed)
        try {
          ctx.lastDOMSnapshot = await domIntelligenceAgent.capture(page);
          this.log(ctx, `[Step ${step.stepNumber}] Refreshed DOM snapshot before retry`);
        } catch { /* non-fatal */ }

        ctx.healingAttempts++;
        await page.waitForTimeout(1000 * attempt); // Progressive wait
      }

      try {
        const dom = ctx.lastDOMSnapshot!;

        // ── Execute Action ──────────────────────────────────────────
        this.updateStatus(ctx, 'executing');
        let actionSuccess = true;
        let actionError: string | undefined;
        let selectorUsed: string | undefined;
        let screenshot: string | undefined;

        if (step.parsedAction) {
          const actionResult = await actionAgent.execute(
            page,
            step.parsedAction,
            dom,
            ctx.testData,
            stepLogs
          );

          actionSuccess = actionResult.success;
          actionError = actionResult.error;
          selectorUsed = actionResult.selectorUsed;
          screenshot = actionResult.screenshot;

          stepLogs.push(...actionResult.logs.filter(l => !stepLogs.includes(l)));

          // Remember successful selector
          if (actionSuccess && selectorUsed && step.parsedAction.target) {
            memoryAgent.rememberSelector(
              step.parsedAction.target,
              page.url(),
              selectorUsed,
              true
            );
          }
        }

        // ── Validate Outcome ────────────────────────────────────────
        if (actionSuccess) {
          this.updateStatus(ctx, 'validating');
          const validationResult = await validationAgent.validate(page, step, dom, stepLogs);

          if (validationResult.passed) {
            return {
              passed: true,
              logs: stepLogs,
              duration: Date.now() - startTime,
              selectorUsed,
              screenshot,
              retryCount: attempt - 1,
              actionTaken: step.parsedAction?.type,
            };
          } else {
            lastError = validationResult.error || 'Validation failed';
            stepLogs.push(`[Validate] ✗ ${lastError}`);
          }
        } else {
          lastError = actionError || 'Action failed';
        }

        if (attempt < maxRetries) {
          this.emit(ctx, 'healing_started', { stepNumber: step.stepNumber, attempt, error: lastError });
          step.status = 'healing';
        }

      } catch (err: any) {
        lastError = err.message;
        stepLogs.push(`[Step ${step.stepNumber}] Error: ${err.message}`);
        this.log(ctx, `[Step ${step.stepNumber}] Error on attempt ${attempt}: ${err.message}`);
      }
    }

    return {
      passed: false,
      logs: stepLogs,
      error: lastError || 'Step failed after all retries',
      duration: Date.now() - startTime,
      retryCount: maxRetries - 1,
    };
  }

  // ─── Session Retrieval ────────────────────────────────────────────────────

  getSession(sessionId: string): WorkflowContext | null {
    return this.activeSessions.get(sessionId) ?? null;
  }

  getSessionResult(sessionId: string): MultiAgentSessionResponse | null {
    const ctx = this.activeSessions.get(sessionId);
    if (!ctx) return null;

    const duration = ctx.endTime
      ? ctx.endTime.getTime() - ctx.startTime.getTime()
      : Date.now() - ctx.startTime.getTime();

    return {
      sessionId,
      status: ctx.status,
      steps: ctx.steps,
      passedSteps: ctx.passedSteps,
      failedSteps: ctx.failedSteps,
      totalSteps: ctx.steps.length,
      duration,
      logs: ctx.logs.slice(-200), // Last 200 log lines
      screenshots: ctx.screenshots,
      domSnapshot: ctx.lastDOMSnapshot
        ? {
            url: ctx.lastDOMSnapshot.url,
            title: ctx.lastDOMSnapshot.title,
            inputs: ctx.lastDOMSnapshot.inputs,
            buttons: ctx.lastDOMSnapshot.buttons,
            forms: ctx.lastDOMSnapshot.forms,
            iframes: ctx.lastDOMSnapshot.iframes,
            rawElementCount: ctx.lastDOMSnapshot.rawElementCount,
          }
        : undefined,
    };
  }

  listActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  // ─── DOM Capture Only (for URL analysis) ─────────────────────────────────

  async captureDOM(url: string, headless = true): Promise<SemanticDOM> {
    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      browser = await chromium.launch({
        headless,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
      });
      context.setDefaultTimeout(30000);
      page = await context.newPage();

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);

      const dom = await domIntelligenceAgent.capture(page);
      return dom;
    } finally {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private updateStatus(ctx: WorkflowContext, status: WorkflowStatus): void {
    ctx.status = status;
  }

  private log(ctx: WorkflowContext, message: string): void {
    ctx.logs.push(message);
    console.log(message);
    // Emit as agent_log event
    this.emit(ctx, 'agent_log', { message, timestamp: new Date() });
  }

  private emit(ctx: WorkflowContext, type: OrchestratorEvent['type'], data: any): void {
    const event: OrchestratorEvent = {
      sessionId: ctx.sessionId,
      type,
      data,
      timestamp: new Date(),
    };
    agentBus.publishOrchestratorEvent(event);
  }

  getMemoryStats() {
    return memoryAgent.getStats();
  }
}

export const orchestratorAgent = new OrchestratorAgent();
