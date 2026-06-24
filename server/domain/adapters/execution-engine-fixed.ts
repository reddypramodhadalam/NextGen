/**
 * Fixed Execution Engine
 * Handles real-world execution issues:
 * - iframe detection and switching
 * - Element detection with fallbacks
 * - Proper timeouts
 * - Session management
 * - Error recovery
 */

import { Page, Browser, chromium, Frame } from "playwright";
import { ExecutionStep } from "../execution-step";
import { TestCaseParser } from "../test-case-parser";
import { ElementInspector } from "./element-inspector";
import { SelfHealerEnhanced } from "../self-healing-enhanced";
import { logger } from "../../infrastructure/logger";

export interface ExecutionResult {
  stepNumber: number;
  action: string;
  passed: boolean;
  error?: string;
  duration: number;
  screenshot?: string;
  details?: any;
}

export class ExecutionEngineFixed {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private currentFrame: Frame | null = null;
  private results: ExecutionResult[] = [];
  private executionTimeout: NodeJS.Timeout | null = null;

  /**
   * Initialize browser with proper error handling
   */
  async initialize(): Promise<void> {
    try {
      logger.info(`[ExecutionEngine] Initializing browser...`);

      this.browser = await chromium.launch({
        headless: false,  // Set to true for production
        slowMo: 500,      // Slow down actions for reliability
      });

      const context = await this.browser.newContext();
      this.page = await context.newPage();

      // Set default timeout
      this.page.setDefaultTimeout(30000);
      this.page.setDefaultNavigationTimeout(30000);

      // Handle page crashes
      this.page.on("error", (err) => {
        logger.error(`[ExecutionEngine] Page error:`, { error: err.message });
      });

      // Handle dialogs
      this.page.on("dialog", async (dialog) => {
        logger.info(`[ExecutionEngine] Dialog: ${dialog.type()} - ${dialog.message()}`);
        await dialog.accept();
      });

      logger.info(`[ExecutionEngine] Browser initialized successfully`);
    } catch (error: any) {
      logger.error(`[ExecutionEngine] Initialization failed`, { error: error.message });
      throw error;
    }
  }

  /**
   * Execute a complete test case
   */
  async executeTestCase(steps: ExecutionStep[]): Promise<ExecutionResult[]> {
    const testStartTime = Date.now();
    this.results = [];

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        // Set timeout for individual step
        const stepTimeout = step.timeoutMs || 30000;
        const stepStartTime = Date.now();

        try {
          logger.info(`[ExecutionEngine] Executing step ${step.stepNumber}/${steps.length}: ${step.action}`);
          logger.info(`[ExecutionEngine] Description: ${step.description}`);

          const result = await this.executeStepWithTimeout(step, stepTimeout);

          const duration = Date.now() - stepStartTime;

          this.results.push({
            stepNumber: step.stepNumber,
            action: step.action,
            passed: true,
            duration,
            details: result,
          });

          logger.info(`[ExecutionEngine] ✓ Step passed (${duration}ms)`);
        } catch (error: any) {
          const duration = Date.now() - stepStartTime;

          logger.error(`[ExecutionEngine] ✗ Step failed`, {
            error: error.message,
            duration,
          });

          this.results.push({
            stepNumber: step.stepNumber,
            action: step.action,
            passed: false,
            error: error.message,
            duration,
          });

          // Try to take screenshot
          try {
            const screenshot = await this.page!.screenshot({ fullPage: true });
            const base64 = screenshot.toString("base64");
            this.results[this.results.length - 1].screenshot = base64;
          } catch (screenshotError) {
            logger.warn(`[ExecutionEngine] Failed to capture screenshot`);
          }

          // Decide whether to continue or stop
          if (step.errorHandling?.retryOnFailure) {
            logger.info(`[ExecutionEngine] Retrying step with fallback locators...`);

            for (let retry = 0; retry < (step.errorHandling.maxRetries || 2); retry++) {
              try {
                const retryStep = {
                  ...step,
                  locators: {
                    ...step.locators,
                    primary: step.errorHandling.fallbackLocators[retry] || step.locators.primary,
                  },
                };

                await this.executeStepWithTimeout(retryStep, stepTimeout);
                this.results[this.results.length - 1].passed = true;
                logger.info(`[ExecutionEngine] ✓ Retry succeeded`);
                break;
              } catch (retryError) {
                logger.warn(`[ExecutionEngine] Retry ${retry + 1} failed`);
              }
            }
          }

          // Stop on critical errors
          if (error.message.includes("session deleted") || error.message.includes("disconnected")) {
            logger.error(`[ExecutionEngine] Critical error - stopping execution`);
            break;
          }
        }

        // Check overall timeout
        const elapsedTime = Date.now() - testStartTime;
        if (elapsedTime > 600000) {  // 10 minute max
          logger.error(`[ExecutionEngine] Total execution timeout exceeded`);
          break;
        }
      }
    } finally {
      await this.cleanup();
    }

    return this.results;
  }

  /**
   * Execute single step with timeout wrapper
   */
  private async executeStepWithTimeout(step: ExecutionStep, timeout: number): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Step timeout after ${timeout}ms`));
      }, timeout);

      try {
        const result = await this.executeStep(step);
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Execute single step
   */
  private async executeStep(step: ExecutionStep): Promise<any> {
    if (!this.page) throw new Error("Browser not initialized");

    // Handle wait before step
    if (step.waitTime > 0) {
      logger.info(`[ExecutionEngine] Waiting ${step.waitTime}s before step...`);
      await this.page.waitForTimeout(step.waitTime * 1000);
    }

    switch (step.action) {
      case "navigate":
        return await this.handleNavigate(step);

      case "click":
        return await this.handleClick(step);

      case "input":
        return await this.handleInput(step);

      case "select_radio":
        return await this.handleSelectRadio(step);

      case "scroll":
        return await this.handleScroll(step);

      case "switchWindow":
        return await this.handleSwitchWindow(step);

      case "switchFrame":
        return await this.handleSwitchFrame(step);

      case "switchDefault":
        return await this.handleSwitchDefault();

      case "verify":
        return await this.handleVerify(step);

      case "wait":
        return await this.handleWait(step);

      default:
        throw new Error(`Unknown action: ${step.action}`);
    }
  }

  /**
   * HANDLE NAVIGATE
   */
  private async handleNavigate(step: ExecutionStep): Promise<void> {
    const url = step.testData || "about:blank";

    logger.info(`[ExecutionEngine] Navigating to: ${url}`);

    try {
      await this.page!.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Wait for iframe if it exists
      const iframe = await ElementInspector.waitForIframe(this.page!, 5000);
      if (iframe) {
        logger.info(`[ExecutionEngine] Iframe detected after navigation`);
        this.currentFrame = iframe;
      }

      logger.info(`[ExecutionEngine] Navigation complete`);
    } catch (error: any) {
      throw new Error(`Navigation failed: ${error.message}`);
    }
  }

  /**
   * HANDLE CLICK
   */
  private async handleClick(step: ExecutionStep): Promise<void> {
    const { primary, fallbacks } = step.locators;

    logger.info(`[ExecutionEngine] Clicking: ${step.description}`);
    logger.info(`[ExecutionEngine] Locator: ${primary}`);

    // Find element (supports iframes)
    const result = await ElementInspector.findElement(this.page!, primary);

    if (!result) {
      // Try fallbacks
      for (const fallback of fallbacks) {
        logger.info(`[ExecutionEngine] Trying fallback: ${fallback}`);
        const fallbackResult = await ElementInspector.findElement(this.page!, fallback);

        if (fallbackResult) {
          await fallbackResult.element.click({ timeout: 5000 });
          logger.info(`[ExecutionEngine] Clicked with fallback locator`);
          return;
        }
      }

      throw new Error(`Element not found: ${primary}`);
    }

    // Wait until clickable
    await ElementInspector.waitForClickable(this.page!, result.locator);

    // Click
    await result.element.click({ timeout: 5000 });

    logger.info(`[ExecutionEngine] Clicked successfully`);
  }

  /**
   * HANDLE INPUT
   */
  private async handleInput(step: ExecutionStep): Promise<void> {
    if (!step.testData) throw new Error("No test data provided");

    const { field, value } = TestCaseParser.extractFieldValue(`${step.description}=${step.testData}`);
    const locator = ElementInspector.findElement.length > 0
      ? step.locators.primary
      : TestCaseParser.getFieldLocator(field);

    logger.info(`[ExecutionEngine] Entering text: ${value.substring(0, 50)}...`);
    logger.info(`[ExecutionEngine] Field: ${field}, Locator: ${locator}`);

    const result = await ElementInspector.findElement(this.page!, locator);

    if (!result) {
      throw new Error(`Input field not found: ${locator}`);
    }

    // Clear field first (CRITICAL)
    await result.element.clear({ timeout: 5000 });
    logger.info(`[ExecutionEngine] Field cleared`);

    // Type value
    await result.element.type(value, { delay: 50 });
    logger.info(`[ExecutionEngine] Text entered`);

    // Verify value
    const actualValue = await result.element.inputValue();
    if (actualValue !== value) {
      throw new Error(`Value mismatch: expected "${value}", got "${actualValue}"`);
    }

    logger.info(`[ExecutionEngine] Value verified`);
  }

  /**
   * HANDLE SELECT RADIO
   */
  private async handleSelectRadio(step: ExecutionStep): Promise<void> {
    const radioValue = step.testData || step.value;
    if (!radioValue) throw new Error("No radio value provided");

    const locator = TestCaseParser.getRadioButtonLocator(radioValue);

    logger.info(`[ExecutionEngine] Selecting radio: ${radioValue}`);

    const result = await ElementInspector.findElement(this.page!, locator);

    if (!result) {
      throw new Error(`Radio button not found: ${locator}`);
    }

    await result.element.check({ timeout: 5000 });
    logger.info(`[ExecutionEngine] Radio button selected`);
  }

  /**
   * HANDLE SCROLL
   */
  private async handleScroll(step: ExecutionStep): Promise<void> {
    const direction = step.testData || step.value || "down";

    logger.info(`[ExecutionEngine] Scrolling: ${direction}`);

    if (direction === "down") {
      await this.page!.evaluate(() => window.scrollBy(0, window.innerHeight));
    } else if (direction === "up") {
      await this.page!.evaluate(() => window.scrollBy(0, -window.innerHeight));
    }

    // Wait for new elements
    await this.page!.waitForTimeout(1000);

    logger.info(`[ExecutionEngine] Scroll complete`);
  }

  /**
   * HANDLE SWITCH WINDOW
   */
  private async handleSwitchWindow(step: ExecutionStep): Promise<void> {
    logger.info(`[ExecutionEngine] Switching to new window...`);

    try {
      const newPage = await Promise.race([
        this.page!.context().waitForEvent("page"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("No new window")), 5000)),
      ]);

      if (newPage instanceof Page) {
        this.page = newPage as any;
        logger.info(`[ExecutionEngine] Switched to new window`);
      }
    } catch (error) {
      // Try to find existing windows
      const pages = this.page!.context().pages();
      if (pages.length > 1) {
        this.page = pages[pages.length - 1];
        logger.info(`[ExecutionEngine] Switched to existing window`);
      } else {
        throw error;
      }
    }
  }

  /**
   * HANDLE SWITCH FRAME
   */
  private async handleSwitchFrame(step: ExecutionStep): Promise<void> {
    const frameXPath = step.actionParams?.frameXPath;

    logger.info(`[ExecutionEngine] Switching to iframe: ${frameXPath}`);

    // Wait for iframe
    const iframe = await ElementInspector.waitForIframe(this.page!, 5000);

    if (iframe) {
      this.currentFrame = iframe;
      logger.info(`[ExecutionEngine] Switched to iframe`);
    } else {
      throw new Error("Iframe not found");
    }
  }

  /**
   * HANDLE SWITCH DEFAULT
   */
  private async handleSwitchDefault(): Promise<void> {
    logger.info(`[ExecutionEngine] Switching back to main content`);
    this.currentFrame = null;
  }

  /**
   * HANDLE VERIFY
   */
  private async handleVerify(step: ExecutionStep): Promise<void> {
    const expectedResult = step.expectedResult;

    logger.info(`[ExecutionEngine] Verifying: ${expectedResult}`);

    // Check if text exists on page
    const pageText = await this.page!.textContent("body");

    if (pageText?.includes(expectedResult)) {
      logger.info(`[ExecutionEngine] Verification passed`);
    } else {
      throw new Error(`Expected text not found: ${expectedResult}`);
    }
  }

  /**
   * HANDLE WAIT
   */
  private async handleWait(step: ExecutionStep): Promise<void> {
    const waitTime = parseInt(step.testData || "5") * 1000;

    logger.info(`[ExecutionEngine] Waiting ${waitTime}ms...`);

    await this.page!.waitForTimeout(waitTime);

    logger.info(`[ExecutionEngine] Wait complete`);
  }

  /**
   * CLEANUP
   */
  async cleanup(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        logger.info(`[ExecutionEngine] Browser closed`);
      }
    } catch (error: any) {
      logger.warn(`[ExecutionEngine] Cleanup error`, { error: error.message });
    }
  }
}
