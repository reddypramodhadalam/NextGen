/**
 * Playwright Adapter
 * Concrete implementation for web browser automation using Playwright
 */

import { Browser, BrowserContext, Page, chromium, firefox, webkit } from "playwright";
import { BaseExecutionAdapter, ExecutionContext, AdapterCapability, ExecutionStats } from "./adapter.interface";
import { Keyword, KeywordExecutionResult, KeywordType } from "../keyword-framework";
import { SelfHealer } from "../self-healing";
import { logger } from "../../infrastructure/logger";

export class PlaywrightAdapter extends BaseExecutionAdapter {
  platform: "web" = "web";
  framework: string = "playwright";

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
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

      logger.info(`[PlaywrightAdapter] Initializing ${browserType} browser`, { executionId: context.executionId });

      // Select browser
      switch (browserType) {
        case "firefox":
          this.browser = await firefox.launch({ headless: true });
          break;
        case "webkit":
          this.browser = await webkit.launch({ headless: true });
          break;
        case "chromium":
        default:
          this.browser = await chromium.launch({ headless: true });
          break;
      }

      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();

      // Set default timeout
      this.page.setDefaultTimeout(30000);
      this.page.setDefaultNavigationTimeout(30000);

      logger.info(`[PlaywrightAdapter] Browser initialized`, { executionId: context.executionId });
    } catch (error: any) {
      logger.error(`[PlaywrightAdapter] Initialization failed`, { error: error.message });
      throw error;
    }
  }

  /**
   * Execute a single keyword
   */
  async executeKeyword(keyword: Keyword, context: ExecutionContext): Promise<KeywordExecutionResult> {
    const startTime = Date.now();
    this.stats.totalKeywords++;

    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }

      let result: any;

      switch (keyword.type) {
        case KeywordType.NAVIGATE:
          result = await this.handleNavigate(keyword, context);
          break;

        case KeywordType.CLICK:
          result = await this.handleClick(keyword, context);
          break;

        case KeywordType.TYPE:
          result = await this.handleType(keyword, context);
          break;

        case KeywordType.SELECT:
          result = await this.handleSelect(keyword, context);
          break;

        case KeywordType.VERIFY:
        case KeywordType.VERIFY_VISIBLE:
          result = await this.handleVerify(keyword, context);
          break;

        case KeywordType.WAIT_FOR_ELEMENT:
          result = await this.handleWaitForElement(keyword, context);
          break;

        case KeywordType.EXTRACT_TEXT:
          result = await this.handleExtractText(keyword, context);
          break;

        case KeywordType.HOVER:
          result = await this.handleHover(keyword, context);
          break;

        case KeywordType.SCROLL:
          result = await this.handleScroll(keyword, context);
          break;

        default:
          throw new Error(`Unsupported keyword type: ${keyword.type}`);
      }

      const duration = Date.now() - startTime;
      this.stats.successfulKeywords++;
      this.stats.totalDuration += duration;
      this.stats.avgKeywordDuration = this.stats.totalDuration / this.stats.successfulKeywords;

      return {
        keyword,
        success: true,
        duration,
        result,
        timestamp: new Date(),
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.stats.failedKeywords++;

      logger.warn(`[PlaywrightAdapter] Keyword failed`, {
        keyword: keyword.type,
        error: error.message,
      });

      return {
        keyword,
        success: false,
        duration,
        error: {
          message: error?.message || "Unknown error",
          code: "KEYWORD_EXECUTION_FAILED",
          details: error,
        },
        timestamp: new Date(),
      };
    }
  }

  /**
   * Handle NAVIGATE keyword
   */
  private async handleNavigate(keyword: Keyword, context: ExecutionContext): Promise<void> {
    const url = keyword.value || context.targetUrl;
    if (!url) throw new Error("No URL provided");

    await this.page!.goto(url, { waitUntil: "networkidle" });
  }

  /**
   * Handle CLICK keyword with self-healing
   */
  private async handleClick(keyword: Keyword, context: ExecutionContext): Promise<void> {
    if (!keyword.selector) throw new Error("No selector provided");

    try {
      await this.page!.locator(keyword.selector).click({
        timeout: keyword.timeout || 5000,
      });
    } catch (error: any) {
      // Try self-healing
      if (context.selfHealing) {
        logger.warn(`[PlaywrightAdapter] Click failed, attempting self-heal`, {
          selector: keyword.selector,
        });

        const suggestion = await SelfHealer.heal(keyword, error);
        if (suggestion.suggestedSelectors.length > 0) {
          const bestSelector = suggestion.suggestedSelectors[0];
          await this.page!.locator(bestSelector.selector).click({
            timeout: keyword.timeout || 5000,
          });
          this.stats.healedKeywords++;
          return;
        }
      }

      throw error;
    }
  }

  /**
   * Handle TYPE keyword
   */
  private async handleType(keyword: Keyword, context: ExecutionContext): Promise<void> {
    if (!keyword.selector || !keyword.value) throw new Error("Selector and value required");

    const locator = this.page!.locator(keyword.selector);
    await locator.fill(keyword.value, { timeout: keyword.timeout || 5000 });
  }

  /**
   * Handle SELECT keyword
   */
  private async handleSelect(keyword: Keyword, context: ExecutionContext): Promise<void> {
    if (!keyword.selector || !keyword.value) throw new Error("Selector and value required");

    await this.page!.selectOption(keyword.selector, keyword.value, {
      timeout: keyword.timeout || 5000,
    });
  }

  /**
   * Handle VERIFY keyword
   */
  private async handleVerify(keyword: Keyword, context: ExecutionContext): Promise<void> {
    if (!keyword.expected) throw new Error("Expected value required");

    const timeout = keyword.timeout || 5000;

    if (keyword.selector) {
      // Verify in specific element
      const locator = this.page!.locator(keyword.selector);
      await locator.waitFor({ state: "visible", timeout });
      const text = await locator.textContent();

      if (!text?.includes(keyword.expected)) {
        throw new Error(`Expected "${keyword.expected}" not found in element`);
      }
    } else {
      // Verify anywhere on page
      const locator = this.page!.getByText(keyword.expected);
      await locator.waitFor({ state: "visible", timeout });
    }
  }

  /**
   * Handle WAIT_FOR_ELEMENT keyword
   */
  private async handleWaitForElement(keyword: Keyword, context: ExecutionContext): Promise<void> {
    if (!keyword.selector) throw new Error("Selector required");

    const timeout = keyword.timeout || 5000;
    await this.page!.locator(keyword.selector).waitFor({ state: "visible", timeout });
  }

  /**
   * Handle EXTRACT_TEXT keyword
   */
  private async handleExtractText(keyword: Keyword, context: ExecutionContext): Promise<string> {
    if (!keyword.selector) throw new Error("Selector required");

    const text = await this.page!.locator(keyword.selector).textContent();
    if (!text) {
      throw new Error("No text found in element");
    }

    // Store in context variables for future use
    context.variables.set(`extracted_${keyword.id}`, text);
    return text;
  }

  /**
   * Handle HOVER keyword
   */
  private async handleHover(keyword: Keyword, context: ExecutionContext): Promise<void> {
    if (!keyword.selector) throw new Error("Selector required");

    await this.page!.locator(keyword.selector).hover({ timeout: keyword.timeout || 5000 });
  }

  /**
   * Handle SCROLL keyword
   */
  private async handleScroll(keyword: Keyword, context: ExecutionContext): Promise<void> {
    if (keyword.selector) {
      // Scroll to element
      await this.page!.locator(keyword.selector).scrollIntoViewIfNeeded();
    } else {
      // Scroll down
      await this.page!.evaluate(() => window.scrollBy(0, window.innerHeight));
    }
  }

  /**
   * Cleanup browser
   */
  async cleanup(): Promise<void> {
    try {
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
      logger.info(`[PlaywrightAdapter] Browser closed`);
    } catch (error: any) {
      logger.warn(`[PlaywrightAdapter] Cleanup error`, { error: error.message });
    }
  }

  /**
   * Check if ready
   */
  async isReady(): Promise<boolean> {
    return this.page !== null && !this.page.isClosed();
  }

  /**
   * Get capabilities
   */
  getCapabilities(): AdapterCapability[] {
    return [
      { keyword: "NAVIGATE", supported: true },
      { keyword: "CLICK", supported: true },
      { keyword: "TYPE", supported: true },
      { keyword: "SELECT", supported: true },
      { keyword: "VERIFY", supported: true },
      { keyword: "VERIFY_VISIBLE", supported: true },
      { keyword: "WAIT_FOR_ELEMENT", supported: true },
      { keyword: "EXTRACT_TEXT", supported: true },
      { keyword: "HOVER", supported: true },
      { keyword: "SCROLL", supported: true },
      { keyword: "SCREENSHOT", supported: true },
      { keyword: "API_REQUEST", supported: false, notes: "Use API adapter" },
    ];
  }

  /**
   * Get statistics
   */
  getStats(): ExecutionStats {
    return this.stats;
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(): Promise<string> {
    if (!this.page) throw new Error("Browser not initialized");

    const buffer = await this.page.screenshot({ fullPage: true });
    return buffer.toString("base64");
  }

  /**
   * Get page source
   */
  async getPageSource(): Promise<string> {
    if (!this.page) throw new Error("Browser not initialized");

    return await this.page.content();
  }

  /**
   * Get current URL
   */
  async getCurrentUrl(): Promise<string> {
    if (!this.page) throw new Error("Browser not initialized");

    return this.page.url();
  }

  /**
   * Get console logs
   */
  async getConsoleLogs(): Promise<Array<{ level: string; message: string }>> {
    // This would require listeners setup during initialization
    return [];
  }
}
