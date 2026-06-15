// ============================================================================
// AITAS Multi-Agent System — Navigator Agent
// Manages Playwright browser lifecycle, page navigation, and context switching
// ============================================================================

import { chromium, Browser, BrowserContext, Page } from 'playwright';

export interface NavigatorConfig {
  headless?: boolean;
  timeout?: number;
  viewport?: { width: number; height: number };
  userAgent?: string;
  locale?: string;
  timezone?: string;
}

export interface NavigationResult {
  success: boolean;
  url: string;
  title: string;
  statusCode?: number;
  loadTime: number;
  error?: string;
}

export class NavigatorAgent {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: NavigatorConfig;
  private popupPages: Page[] = [];
  private iframeStack: string[] = []; // Track iframe nesting

  constructor(config: NavigatorConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      timeout: config.timeout ?? 60000,
      viewport: config.viewport ?? { width: 1280, height: 720 },
      userAgent: config.userAgent,
      locale: config.locale ?? 'en-US',
      timezone: config.timezone ?? 'America/New_York',
    };
  }

  // ─── Browser Lifecycle ────────────────────────────────────────────────────

  /**
   * Launch browser and create context
   */
  async launch(): Promise<void> {
    console.log('[Navigator] Launching Playwright browser...');

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
      locale: this.config.locale,
      timezoneId: this.config.timezone,
      permissions: ['geolocation', 'notifications'],
      ignoreHTTPSErrors: true,
    });

    // Set default timeouts
    this.context.setDefaultTimeout(this.config.timeout!);
    this.context.setDefaultNavigationTimeout(this.config.timeout!);

    this.page = await this.context.newPage();

    // Track popups
    this.context.on('page', (newPage) => {
      console.log('[Navigator] New page/popup detected');
      this.popupPages.push(newPage);
    });

    console.log('[Navigator] Browser launched successfully');
  }

  /**
   * Navigate to a URL and wait for page to be ready
   */
  async navigateTo(url: string): Promise<NavigationResult> {
    if (!this.page) throw new Error('[Navigator] Browser not initialized. Call launch() first.');

    const start = Date.now();
    console.log(`[Navigator] Navigating to: ${url}`);

    try {
      const response = await this.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      // Wait for network to settle
      await this.waitForPageReady();

      const title = await this.page.title().catch(() => '');
      const currentUrl = this.page.url();
      const loadTime = Date.now() - start;

      console.log(`[Navigator] Navigated in ${loadTime}ms: "${title}"`);

      return {
        success: true,
        url: currentUrl,
        title,
        statusCode: response?.status(),
        loadTime,
      };
    } catch (err: any) {
      return {
        success: false,
        url,
        title: '',
        error: err.message,
        loadTime: Date.now() - start,
      };
    }
  }

  /**
   * Wait for page to be fully interactive
   */
  async waitForPageReady(timeout = 30000): Promise<void> {
    if (!this.page) return;

    try {
      // Wait for DOM content to load
      await this.page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});

      // Wait for network to be idle (but don't fail if it takes too long)
      await this.page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 10000) })
        .catch(() => { /* Best effort */ });

      // Short buffer for React/Angular hydration
      await this.page.waitForTimeout(300);
    } catch {
      // Don't throw — proceed even if network isn't idle
    }
  }

  // ─── Page Context Getters ─────────────────────────────────────────────────

  getPage(): Page {
    if (!this.page) throw new Error('[Navigator] No active page. Call launch() first.');
    return this.page;
  }

  getContext(): BrowserContext {
    if (!this.context) throw new Error('[Navigator] No active context');
    return this.context;
  }

  getCurrentUrl(): string {
    return this.page?.url() ?? '';
  }

  async getTitle(): Promise<string> {
    return (await this.page?.title()) ?? '';
  }

  // ─── Window / Tab Management ──────────────────────────────────────────────

  /**
   * Switch to a new popup window that appeared
   */
  async switchToNewWindow(timeoutMs = 10000): Promise<boolean> {
    if (!this.context) return false;

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const pages = this.context.pages();
      if (pages.length > (this.popupPages.length === 0 ? 1 : this.popupPages.length)) {
        // New window appeared
        const newPage = pages[pages.length - 1];
        await newPage.waitForLoadState('domcontentloaded').catch(() => {});
        this.page = newPage;
        console.log(`[Navigator] Switched to new window: ${newPage.url()}`);
        return true;
      }
      await this.page?.waitForTimeout(300);
    }
    return false;
  }

  /**
   * Switch to main/first window
   */
  async switchToMainWindow(): Promise<void> {
    if (!this.context) return;
    const pages = this.context.pages();
    if (pages.length > 0) {
      this.page = pages[0];
      await this.page.bringToFront();
      console.log('[Navigator] Switched to main window');
    }
  }

  /**
   * Close current window and switch back to first
   */
  async closeCurrentWindow(): Promise<void> {
    if (!this.context || !this.page) return;
    const pages = this.context.pages();
    if (pages.length > 1) {
      await this.page.close();
      this.page = pages[0];
      await this.page.bringToFront();
      console.log('[Navigator] Closed window, back to main');
    }
  }

  // ─── Iframe Management ────────────────────────────────────────────────────

  /**
   * Switch to an iframe by name, id, title, or index
   */
  async switchToIframe(identifier: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Try by name attribute
      let frame = this.page.frame({ name: identifier });

      // Try by URL substring
      if (!frame) {
        frame = this.page.frames().find(f => f.url().includes(identifier)) ?? null;
      }

      // Try by index if numeric
      const idx = parseInt(identifier);
      if (!frame && !isNaN(idx)) {
        const frames = this.page.frames();
        frame = frames[idx + 1] ?? null; // +1 because first frame is main page
      }

      // Try by title/content
      if (!frame) {
        for (const f of this.page.frames()) {
          const title = await f.title().catch(() => '');
          if (title.toLowerCase().includes(identifier.toLowerCase())) {
            frame = f;
            break;
          }
        }
      }

      if (frame) {
        // We don't actually "switch" the page object — Playwright handles frames inline
        this.iframeStack.push(identifier);
        console.log(`[Navigator] Switched to iframe: ${identifier}`);
        return true;
      }

      console.warn(`[Navigator] Could not find iframe: ${identifier}`);
      return false;
    } catch (err: any) {
      console.warn(`[Navigator] Iframe switch failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Get the current frame (main page or iframe)
   */
  getFrame(iframeName?: string): any {
    if (!this.page) throw new Error('[Navigator] No active page');
    if (!iframeName && this.iframeStack.length === 0) {
      return this.page;
    }
    const name = iframeName ?? this.iframeStack[this.iframeStack.length - 1];
    const frame = this.page.frame({ name }) ??
      this.page.frames().find(f => f.url().includes(name));
    return frame ?? this.page;
  }

  /**
   * Exit iframe and return to main page
   */
  exitIframe(): void {
    if (this.iframeStack.length > 0) {
      const exited = this.iframeStack.pop();
      console.log(`[Navigator] Exited iframe: ${exited}`);
    }
  }

  // ─── Alert Handling ───────────────────────────────────────────────────────

  /**
   * Set up alert handler (call before navigation that might trigger alert)
   */
  setupAlertHandler(action: 'accept' | 'dismiss', promptText?: string): void {
    if (!this.page) return;
    this.page.once('dialog', async (dialog) => {
      console.log(`[Navigator] Alert detected: "${dialog.message().slice(0, 100)}"`);
      if (action === 'accept') {
        await dialog.accept(promptText);
      } else {
        await dialog.dismiss();
      }
    });
  }

  // ─── Screenshot ───────────────────────────────────────────────────────────

  async screenshot(fullPage = false): Promise<string | null> {
    if (!this.page) return null;
    try {
      const buffer = await this.page.screenshot({
        fullPage,
        type: 'jpeg',
        quality: 70,
      });
      return buffer.toString('base64');
    } catch {
      return null;
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
      this.page = null;
      this.context = null;
      this.browser = null;
      this.popupPages = [];
      this.iframeStack = [];
      console.log('[Navigator] Browser closed cleanly');
    } catch (err: any) {
      console.warn(`[Navigator] Close error: ${err.message}`);
    }
  }

  isLaunched(): boolean {
    return this.browser !== null && !this.page?.isClosed();
  }
}
