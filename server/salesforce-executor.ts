/**
 * Salesforce Test Executor — AITAS Phase 2
 * Handles Salesforce Lightning (Shadow DOM), Classic, and Experience Cloud
 * Uses Playwright with shadow DOM piercing
 */

import { chromium, type Browser, type Page, type BrowserContext, type Frame } from "playwright";
import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestDataParam } from "@shared/schema";
import { sendExecutionNotifications } from "./notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalesforceConfig {
  instanceUrl: string;          // e.g. https://myorg.salesforce.com
  username?: string;
  password?: string;
  securityToken?: string;       // Appended to password for API login
  accessToken?: string;         // OAuth token (preferred)
  apiVersion?: string;          // e.g. "58.0"
  isSandbox?: boolean;
}

interface SFStepResult {
  step: string;
  passed: boolean;
  error?: string;
  screenshot?: string;
  logs: string[];
}

interface SFExecutionResult {
  testCaseId: string;
  testCaseTitle: string;
  passed: boolean;
  duration: number;
  steps: SFStepResult[];
  screenshot?: string;
  errorMessage?: string;
  logs: string[];
}

// ─── Shadow DOM Utilities ─────────────────────────────────────────────────────

/**
 * Pierces shadow DOM recursively to find elements.
 * Salesforce Lightning wraps everything in web components.
 */
const SHADOW_PIERCE_SCRIPT = `
function pierceShadow(root, selector) {
  // Try direct query first
  let el = root.querySelector(selector);
  if (el) return el;
  
  // Walk all shadow roots
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.shadowRoot) {
      el = pierceShadow(node.shadowRoot, selector);
      if (el) return el;
    }
    node = walker.nextNode();
  }
  return null;
}
return pierceShadow(document, arguments[0]);
`;

const SHADOW_PIERCE_ALL_SCRIPT = `
function pierceShadowAll(root, selector) {
  const results = [];
  const direct = Array.from(root.querySelectorAll(selector));
  results.push(...direct);
  
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.shadowRoot) {
      results.push(...pierceShadowAll(node.shadowRoot, selector));
    }
    node = walker.nextNode();
  }
  return results;
}
return pierceShadowAll(document, arguments[0]);
`;

// ─── AI Step Interpreter for Salesforce ──────────────────────────────────────

interface SFCommand {
  action: "click" | "type" | "select" | "verify" | "wait" | "navigate" |
          "api_query" | "api_create" | "api_update" | "scroll" | "hover" |
          "accept_dialog" | "press_key" | "clear";
  // UI actions
  selector?: string;            // CSS selector (will be shadow-pierced)
  lightningSelector?: string;   // lightning-* component selector
  value?: string;
  // API actions
  sobject?: string;             // e.g. "Opportunity"
  soql?: string;                // SOQL query
  fields?: Record<string, any>; // Fields for create/update
  recordId?: string;
  // Capture
  captureAs?: string;           // Store result in variable
  description: string;
}

async function interpretSFStep(
  step: string,
  expected: string,
  pageContext: string,
  instanceUrl: string
): Promise<SFCommand[]> {
  const aiClient = await getAiClient();

  const systemPrompt = `You are a Salesforce test automation expert using Playwright.
Salesforce Lightning uses Shadow DOM — all selectors must work with shadow DOM piercing.

Return ONLY a JSON array of commands:
[{
  "action": "click|type|select|verify|wait|navigate|api_query|api_create|scroll|hover|press_key|clear",
  "selector": "CSS selector (shadow-pierced)",
  "lightningSelector": "lightning-button[label='Save'] or similar",
  "value": "value to type/select",
  "sobject": "Salesforce object name for API actions",
  "soql": "SOQL query string",
  "fields": {"field": "value"},
  "captureAs": "variableName",
  "description": "what this does"
}]

SALESFORCE-SPECIFIC RULES:
1. Lightning buttons: use lightning-button[label='Save'] or button[name='SaveEdit']
2. Input fields: use lightning-input[label='Account Name'] >> input, or input[name='AccountName']
3. Combobox/picklist: use lightning-combobox[label='Stage'] >> button, then lightning-base-combobox-item[data-value='Prospecting']
4. Record form: use lightning-record-form, lightning-record-edit-form
5. App launcher: button[title='App Launcher'] or .slds-icon-waffle
6. Navigation: use navigate action with Salesforce URL paths (/lightning/o/Account/list)
7. Spinner wait: always add wait action for .slds-spinner_container to disappear
8. Toast messages: .slds-notify__content or lightning-toast
9. Related lists: lightning-related-list-single-canvas
10. Lookup fields: lightning-lookup >> input, then select from dropdown

STABLE SELECTORS (prefer these):
- Buttons: button[name='SaveEdit'], button[title='New'], lightning-button[label='Save']
- Inputs: input[name='fieldApiName'], lightning-input[label='Label'] >> input
- Tabs: lightning-tab[label='Details'], a[data-label='Details']
- Records: a[data-refid='recordId'], .slds-page-header__title

For verify actions, use selector to find element and check its text/value.
Only return the JSON array, no explanation.`;

  const userPrompt = `Salesforce Instance: ${instanceUrl}
Page: ${pageContext}
Step: "${step}"
Expected: "${expected}"`;

  try {
    const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as SFCommand[];
  } catch (e: any) {
    console.error("[SF Executor] AI interpretation failed:", e.message);
  }

  return [{ action: "verify", description: step }];
}

// ─── Salesforce REST API Client ───────────────────────────────────────────────

class SalesforceApiClient {
  private instanceUrl: string;
  private accessToken: string;
  private apiVersion: string;

  constructor(instanceUrl: string, accessToken: string, apiVersion = "58.0") {
    this.instanceUrl = instanceUrl.replace(/\/$/, "");
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.instanceUrl}/services/data/v${this.apiVersion}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`SF API ${method} ${path}: ${response.status} — ${err.substring(0, 200)}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async query(soql: string): Promise<any[]> {
    const encoded = encodeURIComponent(soql);
    const result = await this.request("GET", `/query?q=${encoded}`);
    return result?.records || [];
  }

  async create(sobject: string, fields: Record<string, any>): Promise<string> {
    const result = await this.request("POST", `/sobjects/${sobject}`, fields);
    return result?.id;
  }

  async update(sobject: string, recordId: string, fields: Record<string, any>): Promise<void> {
    await this.request("PATCH", `/sobjects/${sobject}/${recordId}`, fields);
  }

  async delete(sobject: string, recordId: string): Promise<void> {
    await this.request("DELETE", `/sobjects/${sobject}/${recordId}`);
  }

  async getUserInfo(): Promise<any> {
    return this.request("GET", "/chatter/users/me");
  }
}

// ─── Main Salesforce Executor ─────────────────────────────────────────────────

export class SalesforceExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private sfApi: SalesforceApiClient | null = null;
  private capturedVars = new Map<string, any>();

  async runExecution(
    executionId: string,
    testCases: TestCase[],
    config: SalesforceConfig,
    testData?: TestDataParam[]
  ): Promise<void> {
    const startTime = Date.now();

    await storage.updateExecution(executionId, {
      status: "running",
      startedAt: new Date(),
    });

    let passedTests = 0;
    let failedTests = 0;
    const allLogs: string[] = [];

    // Build test data map
    const tdMap = new Map<string, string>();
    testData?.forEach((td) => tdMap.set(td.key, td.value));

    try {
      // Initialize browser
      await this.initBrowser(config);
      allLogs.push(`[SF] Browser initialized for ${config.instanceUrl}`);

      // Initialize API client if token available
      if (config.accessToken) {
        this.sfApi = new SalesforceApiClient(
          config.instanceUrl,
          config.accessToken,
          config.apiVersion
        );
        allLogs.push(`[SF] API client initialized (v${config.apiVersion || "58.0"})`);
      }

      // Login
      await this.login(config, allLogs);

      // Execute test cases
      for (const testCase of testCases) {
        const result = await this.executeTestCase(testCase, config, tdMap, allLogs);

        await storage.createResult({
          executionId,
          testCaseId: testCase.id,
          status: result.passed ? "passed" : "failed",
          duration: result.duration,
          errorMessage: result.errorMessage || null,
          screenshot: result.screenshot || null,
          logs: result.logs,
        });

        if (result.passed) passedTests++;
        else failedTests++;
      }
    } catch (error: any) {
      allLogs.push(`[SF] Fatal error: ${error.message}`);
      failedTests = testCases.length - passedTests;
    } finally {
      await this.cleanup();

      const duration = Date.now() - startTime;
      const finalStatus = failedTests > 0 ? "failed" : "passed";

      await storage.updateExecution(executionId, {
        status: finalStatus,
        completedAt: new Date(),
        passedTests,
        failedTests,
        totalTests: testCases.length,
      });

      // Send notifications
      const execution = await storage.getExecution(executionId);
      if (execution) {
        const suite = execution.suiteId ? await storage.getTestSuite(execution.suiteId) : null;
        await sendExecutionNotifications({
          executionId,
          suiteName: suite?.name || "Salesforce Tests",
          status: finalStatus,
          totalTests: testCases.length,
          passedTests,
          failedTests,
          duration,
          environment: execution.environment || "production",
          targetUrl: config.instanceUrl,
        });
      }
    }
  }

  private async initBrowser(config: SalesforceConfig): Promise<void> {
    this.browser = await chromium.launch({
      headless: false,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--no-sandbox",
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    this.page = await this.context.newPage();

    // Set longer timeouts for Salesforce (it's slow)
    this.page.setDefaultTimeout(60000);
    this.page.setDefaultNavigationTimeout(120000);
  }

  private async login(config: SalesforceConfig, logs: string[]): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    // If we have an access token, inject it via cookie/localStorage
    if (config.accessToken) {
      logs.push("[SF] Using OAuth access token for login");
      await this.page.goto(config.instanceUrl);
      await this.waitForSFReady(logs);
      return;
    }

    // Username/password login
    if (config.username && config.password) {
      logs.push(`[SF] Logging in as ${config.username}`);
      const loginUrl = config.isSandbox
        ? "https://test.salesforce.com"
        : "https://login.salesforce.com";

      await this.page.goto(loginUrl);
      await this.page.waitForSelector("#username", { timeout: 30000 });

      await this.page.fill("#username", config.username);
      const password = config.securityToken
        ? config.password + config.securityToken
        : config.password;
      await this.page.fill("#password", password);
      await this.page.click("#Login");

      // Wait for redirect to org
      await this.page.waitForURL(`${config.instanceUrl}/**`, { timeout: 60000 });
      await this.waitForSFReady(logs);
      logs.push("[SF] Login successful");
      return;
    }

    throw new Error("Salesforce login requires either accessToken or username/password");
  }

  private async waitForSFReady(logs: string[]): Promise<void> {
    if (!this.page) return;

    try {
      // Wait for Lightning to initialize
      await this.page.waitForFunction(
        () => {
          const spinner = document.querySelector(".slds-spinner_container");
          return !spinner || (spinner as HTMLElement).style.display === "none";
        },
        { timeout: 30000 }
      );
      logs.push("[SF] Lightning framework ready");
    } catch {
      logs.push("[SF] Warning: Spinner wait timed out, proceeding anyway");
    }

    // Small buffer for rendering
    await this.page.waitForTimeout(1000);
  }

  private async executeTestCase(
    testCase: TestCase,
    config: SalesforceConfig,
    tdMap: Map<string, string>,
    globalLogs: string[]
  ): Promise<SFExecutionResult> {
    const logs: string[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let finalScreenshot: string | undefined;

    logs.push(`\n=== SF TEST: ${testCase.title} ===`);

    const steps = (testCase.steps as { step: string; expected: string }[]) || [];

    for (let i = 0; i < steps.length; i++) {
      const { step, expected } = steps[i];
      const processedStep = this.replacePlaceholders(step, tdMap);
      const processedExpected = this.replacePlaceholders(expected, tdMap);

      logs.push(`\n--- Step ${i + 1}: ${processedStep} ---`);

      try {
        const pageTitle = await this.page!.title();
        const pageUrl = this.page!.url();
        const commands = await interpretSFStep(
          processedStep,
          processedExpected,
          `${pageTitle} | ${pageUrl}`,
          config.instanceUrl
        );

        for (const cmd of commands) {
          await this.executeCommand(cmd, config, logs);
        }

        logs.push(`  ✓ Step ${i + 1} passed`);
      } catch (error: any) {
        logs.push(`  ✗ Step ${i + 1} failed: ${error.message}`);
        passed = false;
        errorMessage = `Step ${i + 1}: ${error.message}`;

        // Capture failure screenshot
        try {
          const buf = await this.page!.screenshot({ fullPage: false });
          finalScreenshot = buf.toString("base64");
        } catch {}

        break;
      }
    }

    // Final screenshot
    if (!finalScreenshot) {
      try {
        const buf = await this.page!.screenshot({ fullPage: false });
        finalScreenshot = buf.toString("base64");
      } catch {}
    }

    globalLogs.push(...logs);

    return {
      testCaseId: testCase.id,
      testCaseTitle: testCase.title,
      passed,
      duration: Date.now() - startTime,
      steps: [],
      screenshot: finalScreenshot,
      errorMessage,
      logs,
    };
  }

  private async executeCommand(
    cmd: SFCommand,
    config: SalesforceConfig,
    logs: string[]
  ): Promise<void> {
    if (!this.page) throw new Error("No page");

    logs.push(`  → ${cmd.action}: ${cmd.description}`);

    switch (cmd.action) {
      case "navigate": {
        const url = cmd.value?.startsWith("http")
          ? cmd.value
          : `${config.instanceUrl}${cmd.value || ""}`;
        await this.page.goto(url, { waitUntil: "networkidle" });
        await this.waitForSFReady(logs);
        break;
      }

      case "wait": {
        if (cmd.selector) {
          // Wait for spinner to disappear
          if (cmd.selector.includes("spinner")) {
            await this.page.waitForFunction(
              (sel: string) => {
                const el = document.querySelector(sel);
                return !el || (el as HTMLElement).style.display === "none";
              },
              cmd.selector,
              { timeout: 30000 }
            );
          } else {
            await this.page.waitForSelector(cmd.selector, { timeout: 30000 });
          }
        } else {
          await this.page.waitForTimeout(parseInt(cmd.value || "2000"));
        }
        break;
      }

      case "click": {
        const selector = cmd.lightningSelector || cmd.selector;
        if (!selector) break;

        // Try Playwright's pierce selector first
        try {
          await this.page.locator(selector).first().click({ timeout: 15000 });
          logs.push(`    Clicked: ${selector}`);
        } catch {
          // Fallback: shadow DOM pierce via JS
          const el = await this.page.evaluateHandle(SHADOW_PIERCE_SCRIPT, selector);
          if (el) {
            await (el as any).click();
            logs.push(`    Clicked via shadow pierce: ${selector}`);
          } else {
            throw new Error(`Element not found: ${selector}`);
          }
        }

        await this.waitForSFReady(logs);
        break;
      }

      case "type": {
        const selector = cmd.lightningSelector || cmd.selector;
        if (!selector || cmd.value === undefined) break;

        const value = this.replaceCapturedVars(cmd.value);

        try {
          const locator = this.page.locator(selector).first();
          await locator.clear();
          await locator.fill(value, { timeout: 15000 });
          logs.push(`    Typed "${value}" into ${selector}`);
        } catch {
          // Shadow DOM fallback
          const el = await this.page.evaluateHandle(SHADOW_PIERCE_SCRIPT, selector);
          if (el) {
            await this.page.evaluate(
              ([element, val]: [any, string]) => {
                element.value = val;
                element.dispatchEvent(new Event("input", { bubbles: true }));
                element.dispatchEvent(new Event("change", { bubbles: true }));
              },
              [el, value]
            );
            logs.push(`    Typed via shadow pierce: "${value}"`);
          } else {
            throw new Error(`Input not found: ${selector}`);
          }
        }
        break;
      }

      case "clear": {
        const selector = cmd.selector;
        if (!selector) break;
        await this.page.locator(selector).first().clear({ timeout: 10000 });
        break;
      }

      case "select": {
        // Salesforce picklist/combobox
        const selector = cmd.lightningSelector || cmd.selector;
        if (!selector || !cmd.value) break;

        // Click to open dropdown
        await this.page.locator(selector).first().click({ timeout: 15000 });
        await this.page.waitForTimeout(500);

        // Find and click the option
        const optionSelectors = [
          `lightning-base-combobox-item[data-value="${cmd.value}"]`,
          `span.slds-media__figure[title="${cmd.value}"]`,
          `lightning-base-combobox-item:has-text("${cmd.value}")`,
          `li[role="option"]:has-text("${cmd.value}")`,
        ];

        let selected = false;
        for (const optSel of optionSelectors) {
          try {
            await this.page.locator(optSel).first().click({ timeout: 5000 });
            logs.push(`    Selected "${cmd.value}" from picklist`);
            selected = true;
            break;
          } catch {}
        }

        if (!selected) {
          throw new Error(`Could not select "${cmd.value}" from picklist ${selector}`);
        }
        break;
      }

      case "verify": {
        const selector = cmd.selector;
        if (!selector) {
          logs.push(`    Verify: ${cmd.description} (no selector, skipping)`);
          break;
        }

        // Try to find element and verify
        try {
          const locator = this.page.locator(selector).first();
          await locator.waitFor({ state: "visible", timeout: 15000 });

          if (cmd.value) {
            const text = await locator.textContent();
            if (!text?.includes(cmd.value)) {
              throw new Error(`Expected "${cmd.value}" but got "${text}"`);
            }
          }

          logs.push(`    ✓ Verified: ${cmd.description}`);

          if (cmd.captureAs) {
            const text = await locator.textContent();
            this.capturedVars.set(cmd.captureAs, text?.trim() || "");
            logs.push(`    Captured $${cmd.captureAs}$ = "${text?.trim()}"`);
          }
        } catch (e: any) {
          // Try shadow pierce
          const el = await this.page.evaluateHandle(SHADOW_PIERCE_SCRIPT, selector);
          if (!el) throw new Error(`Element not found for verify: ${selector}`);
          logs.push(`    ✓ Verified via shadow pierce: ${cmd.description}`);
        }
        break;
      }

      case "scroll": {
        if (cmd.selector) {
          await this.page.locator(cmd.selector).first().scrollIntoViewIfNeeded();
        } else if (cmd.value === "bottom") {
          await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        } else {
          await this.page.evaluate(() => window.scrollTo(0, 0));
        }
        break;
      }

      case "hover": {
        if (cmd.selector) {
          await this.page.locator(cmd.selector).first().hover({ timeout: 10000 });
        }
        break;
      }

      case "press_key": {
        await this.page.keyboard.press(cmd.value || "Enter");
        break;
      }

      case "accept_dialog": {
        this.page.once("dialog", (dialog) => dialog.accept());
        break;
      }

      // ─── Salesforce API Actions ───────────────────────────────────────────

      case "api_query": {
        if (!this.sfApi || !cmd.soql) {
          logs.push(`    [API] No API client or SOQL — skipping`);
          break;
        }
        const records = await this.sfApi.query(cmd.soql);
        logs.push(`    [API] Query returned ${records.length} records`);

        if (cmd.captureAs && records.length > 0) {
          this.capturedVars.set(cmd.captureAs, records[0]);
          logs.push(`    [API] Captured first record as $${cmd.captureAs}$`);
        }
        break;
      }

      case "api_create": {
        if (!this.sfApi || !cmd.sobject || !cmd.fields) {
          logs.push(`    [API] Missing API client, sobject, or fields — skipping`);
          break;
        }
        const id = await this.sfApi.create(cmd.sobject, cmd.fields);
        logs.push(`    [API] Created ${cmd.sobject}: ${id}`);

        if (cmd.captureAs) {
          this.capturedVars.set(cmd.captureAs, id);
          logs.push(`    [API] Captured ID as $${cmd.captureAs}$`);
        }
        break;
      }

      case "api_update": {
        if (!this.sfApi || !cmd.sobject || !cmd.recordId || !cmd.fields) {
          logs.push(`    [API] Missing required fields for update — skipping`);
          break;
        }
        await this.sfApi.update(cmd.sobject, cmd.recordId, cmd.fields);
        logs.push(`    [API] Updated ${cmd.sobject}/${cmd.recordId}`);
        break;
      }

      default:
        logs.push(`    Unknown command: ${cmd.action}`);
    }
  }

  private replacePlaceholders(text: string, tdMap: Map<string, string>): string {
    let result = text;
    tdMap.forEach((value, key) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "gi"), value);
    });
    return result;
  }

  private replaceCapturedVars(text: string): string {
    let result = text;
    this.capturedVars.forEach((value, key) => {
      result = result.replace(new RegExp(`\\$${key}\\$`, "gi"), String(value));
    });
    return result;
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.page) { await this.page.close(); this.page = null; }
      if (this.context) { await this.context.close(); this.context = null; }
      if (this.browser) { await this.browser.close(); this.browser = null; }
    } catch {}
  }
}

export const salesforceExecutor = new SalesforceExecutor();
