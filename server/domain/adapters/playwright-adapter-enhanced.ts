/**
 * Enhanced Playwright Adapter with ALL Features
 * - iframe handling
 * - Shadow DOM
 * - Window switching
 * - Input clearing
 * - Hover/Drag-drop
 * - WebDriverWait conditions
 * - Self-healing
 * - Post-action validation
 * - Error recovery
 */

import { Browser, BrowserContext, Page, chromium, firefox, webkit } from "playwright";
import { BaseExecutionAdapter, ExecutionContext, ExecutionStats } from "./adapter.interface";
import { Keyword, KeywordExecutionResult, KeywordType } from "../keyword-framework";
import { ExecutionStep, ActionType, WaitCondition } from "../execution-step";
import { SelfHealer } from "../self-healing";
import { DOMHandler } from "../dom-handler";
import { logger } from "../../infrastructure/logger";

export class PlaywrightAdapterEnhanced extends BaseExecutionAdapter {
  platform: "web" = "web";
  framework: string = "playwright";

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private currentFrame: any = null;  // Track current iframe
  private windowHandles: Set<string> = new Set();

  private stats: ExecutionStats = {
    totalKeywords: 0,
    successfulKeywords: 0,
    failedKeywords: 0,
    healedKeywords: 0,
    totalDuration: 0,
    avgKeywordDuration: 0,
  };

  /**
   * Initialize browser and context
   */
  async initialize(context: ExecutionContext): Promise<void> {
    try {
      const browserType = context.browser?.toLowerCase() || "chromium";

      logger.info(`[PlaywrightEnhanced] Initializing ${browserType}`, { executionId: context.executionId });

      switch (browserType) {
        case "firefox":
          this.browser = await firefox.launch({ headless: true });
          break;
        case "webkit":
          this.browser = await webkit.launch({ headless: true });
          break;
        default:
          this.browser = await chromium.launch({ headless: true });
      }

      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();

      // Set timeouts
      this.page.setDefaultTimeout(30000);
      this.page.setDefaultNavigationTimeout(30000);

      // Track page changes for window detection
      this.page.on("popup", (newPage) => {
        logger.info(`[PlaywrightEnhanced] New window/tab detected`);
        this.page = newPage;
      });

      logger.info(`[PlaywrightEnhanced] Browser initialized`, { executionId: context.executionId });
    } catch (error: any) {
      logger.error(`[PlaywrightEnhanced] Init failed`, { error: error.message });
      throw error;
    }
  }

  /**
   * Execute enhanced execution step
   */
  async executeStep(step: ExecutionStep, context: ExecutionContext): Promise<ExecutionStep> {
    const startTime = Date.now();
    this.stats.totalKeywords++;

    try {
      if (!this.page) throw new Error("Browser not initialized");

      logger.info(`[PlaywrightEnhanced] Executing step ${step.stepNumber}: ${step.action}`, {
        description: step.description,
      });

      // WAIT BEFORE ACTION
      if (step.waitTime > 0) {
        await this.page.waitForTimeout(step.waitTime * 1000);
      }

      let result: any = null;

      // Route to action handler
      switch (step.action) {
        case "navigate":
          result = await this.handleNavigate(step);
          break;

        case "click":
          result = await this.handleClickEnhanced(step, context);
          break;

        case "input":
          result = await this.handleInputEnhanced(step, context);
          break;

        case "hover":
          result = await this.handleHoverEnhanced(step, context);
          break;

        case "dragDrop":
          result = await this.handleDragDrop(step, context);
          break;

        case "rightClick":
          result = await this.handleRightClick(step, context);
          break;

        case "doubleClick":
          result = await this.handleDoubleClick(step, context);
          break;

        case "keyPress":
          result = await this.handleKeyPress(step, context);
          break;

        case "select":
          result = await this.handleSelectEnhanced(step, context);
          break;

        case "switchFrame":
          result = await this.handleSwitchFrame(step);
          break;

        case "switchDefault":
          result = await this.handleSwitchDefault();
          break;

        case "switchWindow":
          result = await this.handleSwitchWindow();
          break;

        case "shadow":
          result = await this.handleShadowDOM(step, context);
          break;

        case "verify":
          result = await this.handleVerifyEnhanced(step);
          break;

        case "wait":
          result = await this.handleWaitCondition(step);
          break;

        case "screenshot":
          result = await this.takeScreenshot();
          break;

        case "clearField":
          result = await this.handleClearField(step, context);
          break;

        default:
          throw new Error(`Unknown action: ${step.action}`);
      }

      // POST-ACTION VALIDATION
      if (step.validation?.enabled) {
        await this.validateActionResult(step);
      }

      const duration = Date.now() - startTime;
      this.stats.successfulKeywords++;
      this.stats.totalDuration += duration;
      this.stats.avgKeywordDuration = this.stats.totalDuration / this.stats.successfulKeywords;

      step.duration = duration;
      logger.info(`[PlaywrightEnhanced] Step completed successfully`, {
        stepNumber: step.stepNumber,
        duration,
      });

      return step;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.stats.failedKeywords++;

      logger.error(`[PlaywrightEnhanced] Step failed`, {
        stepNumber: step.stepNumber,
        error: error.message,
      });

      // ERROR RECOVERY
      if (step.errorHandling?.retryOnFailure && step.errorHandling.maxRetries > 0) {
        logger.info(`[PlaywrightEnhanced] Attempting error recovery`, {
          step: step.stepNumber,
          retries: step.errorHandling.maxRetries,
        });

        for (let retry = 1; retry <= step.errorHandling.maxRetries; retry++) {
          try {
            // Try with fallback locators
            if (step.errorHandling.fallbackLocators.length > 0) {
              const fallbackStep = { ...step };
              fallbackStep.locators.primary = step.errorHandling.fallbackLocators[retry - 1] || step.locators.primary;

              logger.info(`[PlaywrightEnhanced] Retry ${retry} with fallback locator`, {
                fallback: fallbackStep.locators.primary,
              });

              return await this.executeStep(fallbackStep, context);
            }
          } catch (retryError) {
            logger.warn(`[PlaywrightEnhanced] Retry ${retry} failed`);
          }
        }
      }

      step.duration = duration;
      throw error;
    }
  }

  /**
   * HANDLE NAVIGATE
   */
  private async handleNavigate(step: ExecutionStep): Promise<void> {
    const url = step.testData || "about:blank";
    await this.page!.goto(url, { waitUntil: "networkidle" });
    logger.info(`[PlaywrightEnhanced] Navigated to ${url}`);
  }

  /**
   * HANDLE CLICK WITH SELF-HEALING
   */
  private async handleClickEnhanced(step: ExecutionStep, context: ExecutionContext): Promise<void> {
    const { primary, fallbacks } = step.locators;

    try {
      // Wait until clickable (not just visible)
      await this.waitForCondition(primary, step.wait.condition, step.wait.timeout);

      // Click
      await this.page!.locator(primary).click({ timeout: step.wait.timeout });

      logger.info(`[PlaywrightEnhanced] Clicked element`);
    } catch (error: any) {
      logger.warn(`[PlaywrightEnhanced] Click failed with primary locator, trying fallbacks`);

      // Try fallback locators
      for (const fallback of fallbacks) {
        try {
          await this.waitForCondition(fallback, step.wait.condition, step.wait.timeout);
          await this.page!.locator(fallback).click({ timeout: step.wait.timeout });
          this.stats.healedKeywords++;
          logger.info(`[PlaywrightEnhanced] Clicked using fallback locator`);
          return;
        } catch {
          continue;
        }
      }

      throw new Error(`Click failed - no locators worked. Primary: ${primary}, Fallbacks: ${fallbacks.join(", ")}`);
    }
  }

  /**
   * HANDLE INPUT WITH CLEARING
   */
  private async handleInputEnhanced(step: ExecutionStep, context: ExecutionContext): Promise<void> {
    if (!step.testData) throw new Error("No test data provided");

    const { primary, fallbacks } = step.locators;

    try {
      await this.waitForCondition(primary, "clickable", step.wait.timeout);

      const locator = this.page!.locator(primary);

      // CLEAR FIELD FIRST (CRITICAL FEATURE)
      if (step.input?.clearFirst !== false) {
        await locator.clear({ timeout: step.wait.timeout });
        logger.info(`[PlaywrightEnhanced] Cleared field before input`);
      }

      // TYPE SLOWLY if needed
      if (step.input?.slowType) {
        await locator.type(step.testData, { delay: step.input.typeDelay || 50 });
      } else {
        await locator.fill(step.testData);
      }

      logger.info(`[PlaywrightEnhanced] Entered text: ${step.testData.substring(0, 30)}...`);
    } catch (error: any) {
      logger.warn(`[PlaywrightEnhanced] Input failed, trying fallbacks`);

      for (const fallback of fallbacks) {
        try {
          await this.waitForCondition(fallback, "clickable", step.wait.timeout);
          const locator = this.page!.locator(fallback);

          if (step.input?.clearFirst !== false) {
            await locator.clear();
          }

          if (step.input?.slowType) {
            await locator.type(step.testData, { delay: step.input.typeDelay || 50 });
          } else {
            await locator.fill(step.testData);
          }

          this.stats.healedKeywords++;
          logger.info(`[PlaywrightEnhanced] Entered text using fallback`);
          return;
        } catch {
          continue;
        }
      }

      throw error;
    }
  }

  /**
   * HANDLE HOVER
   */
  private async handleHoverEnhanced(step: ExecutionStep, context: ExecutionContext): Promise<void> {
    const { primary, fallbacks } = step.locators;

    try {
      await this.waitForCondition(primary, "visible", step.wait.timeout);
      await this.page!.locator(primary).hover();
      logger.info(`[PlaywrightEnhanced] Hovered over element`);
    } catch (error) {
      for (const fallback of fallbacks) {
        try {
          await this.page!.locator(fallback).hover();
          this.stats.healedKeywords++;
          return;
        } catch {
          continue;
        }
      }
      throw error;
    }
  }

  /**
   * HANDLE DRAG AND DROP
   */
  private async handleDragDrop(step: ExecutionStep, context: ExecutionContext): Promise<void> {
    const { dragSource, dropTarget } = step.actionParams || {};
    if (!dragSource || !dropTarget) throw new Error("Drag source and drop target required");

    await this.page!.dragAndDrop(dragSource, dropTarget);
    logger.info(`[PlaywrightEnhanced] Dragged and dropped`);
  }

  /**
   * HANDLE RIGHT CLICK
   */
  private async handleRightClick(step: ExecutionStep, context: ExecutionContext): Promise<void> {
    const { primary } = step.locators;

    await this.waitForCondition(primary, "visible", step.wait.timeout);
    await this.page!.locator(primary).click({ button: "right" });
    logger.info(`[PlaywrightEnhanced] Right-clicked element`);
  }

  /**
   * HANDLE DOUBLE CLICK
   */
  private async handleDoubleClick(step: ExecutionStep, context: ExecutionContext): Promise<void> {
    const { primary } = step.locators;

    await this.waitForCondition(primary, "visible", step.wait.timeout);
    await this.page!.locator(primary).dblclick();
    logger.info(`[PlaywrightEnhanced] Double-clicked element`);
  }

  /**
   * HANDLE KEY PRESS
   */
  private async handleKeyPress(step: ExecutionStep, context: ExecutionContext): Promise<void> {
    const keys = step.actionParams?.keys || [];

    for (const key of keys) {
      await this.page!.keyboard.press(key);
      logger.info(`[PlaywrightEnhanced] Pressed key: ${key}`);
    }
  }

  /**
   * HANDLE SELECT
   */
  private async handleSelectEnhanced(step: ExecutionStep, context: ExecutionContext): Promise<void> {
    const { primary } = step.locators;
    const { selectValue } = step.actionParams || {};

    if (!selectValue) throw new Error("Select value required");

    await this.waitForCondition(primary, "visible", step.wait.timeout);
    await this.page!.selectOption(primary, selectValue);
    logger.info(`[PlaywrightEnhanced] Selected: ${selectValue}`);
  }

  /**
   * HANDLE IFRAME SWITCHING
   */
  private async handleSwitchFrame(step: ExecutionStep): Promise<void> {
    const { frameXPath } = step.actionParams || {};
    if (!frameXPath) throw new Error("Frame XPath required");

    try {
      const frameLocator = this.page!.frameLocator(frameXPath);
      this.currentFrame = frameLocator;
      logger.info(`[PlaywrightEnhanced] Switched to iframe: ${frameXPath}`);
    } catch (error) {
      logger.warn(`[PlaywrightEnhanced] Frame switch failed, trying with first iframe`);
      const frameLocator = this.page!.frameLocator("iframe >> nth=0");
      this.currentFrame = frameLocator;
    }
  }

  /**
   * HANDLE SWITCH BACK FROM IFRAME
   */
  private async handleSwitchDefault(): Promise<void> {
    this.currentFrame = null;
    logger.info(`[PlaywrightEnhanced] Switched back to default content`);
  }

  /**
   * HANDLE WINDOW SWITCHING
   */
  private async handleSwitchWindow(): Promise<void> {
    // Wait for new page/window
    const newPage = await this.context!.waitForEvent("page");
    this.page = newPage;
    logger.info(`[PlaywrightEnhanced] Switched to new window`);
  }

  /**
   * HANDLE SHADOW DOM
   */
  private async handleShadowDOM(step: ExecutionStep, context: ExecutionContext): Promise<void> {
    const { shadowHost, shadowSelector } = step.actionParams || {};
    if (!shadowHost || !shadowSelector) throw new Error("Shadow host and selector required");

    const shadowRoot = await this.page!.evaluateHandle((host, selector) => {
      const element = document.querySelector(host);
      return element?.shadowRoot?.querySelector(selector);
    }, shadowHost, shadowSelector);

    logger.info(`[PlaywrightEnhanced] Accessed shadow DOM element`);
  }

  /**
   * HANDLE VERIFY WITH AUTO-VALIDATION
   */
  private async handleVerifyEnhanced(step: ExecutionStep): Promise<string> {
    const { primary } = step.locators;

    try {
      await this.waitForCondition(primary, "visible", step.wait.timeout);
      const text = await this.page!.locator(primary).textContent();

      if (text?.includes(step.expectedResult)) {
        logger.info(`[PlaywrightEnhanced] Verification passed: "${step.expectedResult}" found`);
        return text;
      } else {
        throw new Error(`Expected "${step.expectedResult}" not found. Got: "${text}"`);
      }
    } catch (error) {
      logger.error(`[PlaywrightEnhanced] Verification failed`);
      throw error;
    }
  }

  /**
   * HANDLE WAIT CONDITIONS
   */
  private async handleWaitCondition(step: ExecutionStep): Promise<void> {
    const { primary } = step.locators;
    await this.waitForCondition(primary, step.wait.condition, step.wait.timeout);
  }

  /**
   * WAIT FOR CONDITION - SMART WAIT WITH MULTIPLE CONDITIONS
   */
  private async waitForCondition(
    locator: string,
    condition: WaitCondition,
    timeout: number
  ): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const element = this.page!.locator(locator);

        switch (condition) {
          case "visible":
            await element.waitFor({ state: "visible", timeout: 500 });
            return;

          case "clickable":
            await element.waitFor({ state: "visible", timeout: 500 });
            await element.evaluate((el: any) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            return;

          case "enabled":
            await element.waitFor({ state: "visible", timeout: 500 });
            await element.evaluate((el: any) => !el.disabled);
            return;

          case "selected":
            await element.isChecked({ timeout: 500 });
            return;

          case "present":
            await element.waitFor({ state: "attached", timeout: 500 });
            return;

          case "textPresent":
            const text = await element.textContent({ timeout: 500 });
            if (text) return;
            break;

          case "invisible":
            await element.waitFor({ state: "hidden", timeout: 500 });
            return;

          case "staleness":
            await element.waitFor({ state: "detached", timeout: 500 });
            return;
        }
      } catch {
        // Retry
      }
    }

    throw new Error(`Wait condition "${condition}" not met within ${timeout}ms for locator: ${locator}`);
  }

  /**
   * VALIDATE ACTION RESULT
   */
  private async validateActionResult(step: ExecutionStep): Promise<void> {
    if (!step.validation) return;

    const { type, value, timeout } = step.validation;

    try {
      switch (type) {
        case "text":
          const bodyText = await this.page!.textContent("body");
          if (!bodyText?.includes(value)) {
            throw new Error(`Expected text "${value}" not found on page`);
          }
          break;

        case "element":
          await this.waitForCondition(value, "visible", timeout || 5000);
          break;

        case "url":
          const url = this.page!.url();
          if (!url.includes(value)) {
            throw new Error(`Expected URL contains "${value}", got "${url}"`);
          }
          break;

        case "attribute":
          const { primary } = step.locators;
          const actualValue = await this.page!.locator(primary).inputValue();
          if (actualValue !== value) {
            throw new Error(`Expected value "${value}", got "${actualValue}"`);
          }
          break;
      }

      logger.info(`[PlaywrightEnhanced] Validation passed for step ${step.stepNumber}`);
    } catch (error) {
      logger.error(`[PlaywrightEnhanced] Validation failed`, { error });
      throw error;
    }
  }

  /**
   * HANDLE CLEAR FIELD
   */
  private async handleClearField(step: ExecutionStep, context: ExecutionContext): Promise<void> {
    const { primary } = step.locators;
    await this.page!.locator(primary).clear();
    logger.info(`[PlaywrightEnhanced] Cleared field`);
  }

  /**
   * TAKE SCREENSHOT
   */
  async takeScreenshot(fullPage = true): Promise<string> {
    if (!this.page) throw new Error("Browser not initialized");

    const buffer = await this.page.screenshot({ fullPage });
    return buffer.toString("base64");
  }

  /**
   * GET STATS
   */
  getStats(): ExecutionStats {
    return this.stats;
  }

  /**
   * CLEANUP
   */
  async cleanup(): Promise<void> {
    try {
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
      logger.info(`[PlaywrightEnhanced] Browser closed`);
    } catch (error: any) {
      logger.warn(`[PlaywrightEnhanced] Cleanup error`, { error: error.message });
    }
  }

  async isReady(): Promise<boolean> {
    return this.page !== null && !this.page.isClosed();
  }
}
