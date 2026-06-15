/**
 * SAP Fiori / Web GUI Test Executor — AITAS Phase 3
 * Handles SAP Fiori Launchpad, SAP Web GUI, SAP BTP apps
 * Uses Playwright with UI5 component awareness
 */

import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestDataParam } from "@shared/schema";
import { sendExecutionNotifications } from "./notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SAPFioriConfig {
  baseUrl: string;              // e.g. https://mycompany.hana.ondemand.com/sap/bc/ui5_ui5/ui2/ushell/shells/abap/FioriLaunchpad.html
  username?: string;
  password?: string;
  client?: string;              // SAP client number e.g. "100"
  language?: string;            // e.g. "EN"
  accessToken?: string;         // OAuth token for BTP
  samlEnabled?: boolean;
  odataBaseUrl?: string;        // e.g. /sap/opu/odata/sap/
}

interface SAPCommand {
  action: "navigate" | "click" | "type" | "select" | "verify" | "wait" |
          "open_app" | "press_key" | "scroll" | "hover" | "accept_dialog" |
          "odata_query" | "odata_create" | "odata_update" | "ui5_action";
  selector?: string;
  ui5Id?: string;               // sap.ui.getCore().byId() ID
  ui5Selector?: string;         // UI5 control type e.g. sap.m.Button
  value?: string;
  appId?: string;               // Fiori app ID e.g. "F0001"
  tileTitle?: string;           // Fiori tile title
  odataService?: string;        // OData service name
  odataEntity?: string;         // Entity set name
  odataFilter?: string;         // $filter expression
  odataPayload?: Record<string, any>;
  captureAs?: string;
  description: string;
}

// ─── SAP OData Client ─────────────────────────────────────────────────────────

class SAPODataClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private csrfToken: string | null = null;

  constructor(baseUrl: string, username?: string, password?: string, accessToken?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.headers = { "Accept": "application/json", "Content-Type": "application/json" };

    if (accessToken) {
      this.headers["Authorization"] = `Bearer ${accessToken}`;
    } else if (username && password) {
      const encoded = Buffer.from(`${username}:${password}`).toString("base64");
      this.headers["Authorization"] = `Basic ${encoded}`;
    }
  }

  private async fetchCsrfToken(service: string): Promise<void> {
    const url = `${this.baseUrl}/${service}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { ...this.headers, "X-CSRF-Token": "Fetch" },
    });
    this.csrfToken = response.headers.get("x-csrf-token") || null;
  }

  async query(service: string, entity: string, filter?: string, select?: string): Promise<any[]> {
    let url = `${this.baseUrl}/${service}/${entity}?$format=json`;
    if (filter) url += `&$filter=${encodeURIComponent(filter)}`;
    if (select) url += `&$select=${encodeURIComponent(select)}`;

    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) throw new Error(`OData query failed: ${response.status}`);
    const data = await response.json();
    return data?.d?.results || data?.value || [];
  }

  async create(service: string, entity: string, payload: Record<string, any>): Promise<any> {
    await this.fetchCsrfToken(service);
    const url = `${this.baseUrl}/${service}/${entity}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { ...this.headers, ...(this.csrfToken ? { "X-CSRF-Token": this.csrfToken } : {}) },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`OData create failed: ${response.status}`);
    const data = await response.json();
    return data?.d || data;
  }

  async update(service: string, entity: string, key: string, payload: Record<string, any>): Promise<void> {
    await this.fetchCsrfToken(service);
    const url = `${this.baseUrl}/${service}/${entity}(${key})`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: { ...this.headers, ...(this.csrfToken ? { "X-CSRF-Token": this.csrfToken } : {}) },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`OData update failed: ${response.status}`);
  }
}

// ─── AI Step Interpreter for SAP Fiori ───────────────────────────────────────

async function interpretSAPFioriStep(
  step: string,
  expected: string,
  pageContext: string,
  config: SAPFioriConfig
): Promise<SAPCommand[]> {
  const aiClient = await getAiClient();

  const systemPrompt = `You are a SAP Fiori test automation expert using Playwright.
SAP Fiori uses SAPUI5 framework with specific patterns.

Return ONLY a JSON array of commands:
[{
  "action": "navigate|click|type|select|verify|wait|open_app|press_key|scroll|odata_query|odata_create|ui5_action",
  "selector": "CSS selector",
  "ui5Id": "UI5 control ID for sap.ui.getCore().byId()",
  "ui5Selector": "sap.m.Button or similar",
  "value": "value to type/select",
  "appId": "Fiori app ID",
  "tileTitle": "Tile title on Launchpad",
  "odataService": "MM_PUR_PO_MAINT_V2_SRV",
  "odataEntity": "C_PurchaseOrderTP",
  "odataFilter": "PurchaseOrder eq '4500000001'",
  "odataPayload": {},
  "captureAs": "variableName",
  "description": "what this does"
}]

SAP FIORI RULES:
1. Fiori Launchpad tiles: .sapUshellTile[title="App Name"] or [data-help-id="appId"]
2. UI5 buttons: button.sapMBtn[title="Save"], .sapMBtnContent:has-text("Save")
3. Input fields: input.sapMInputBaseInner, .sapMInput input[id*="fieldId"]
4. Select/ComboBox: .sapMSelect select, .sapMComboBox input
5. Table rows: .sapMListItem, .sapUiTableRow
6. Dialog: .sapMDialog, .sapMPopover
7. Busy indicator: .sapUiLocalBusyIndicator — wait for it to disappear
8. Navigation: use navigate action with Fiori hash e.g. #PurchaseOrder-manage
9. Shell header: .sapUshellShellHeadItm, .sapUshellAppTitle
10. Form fields: .sapUiFormElement label + .sapUiFormElementField
11. Date picker: .sapMDatePicker input
12. Message toast: .sapMMessageToast
13. Error messages: .sapMMessageItem, .sapMMsgStrip

WAIT PATTERNS:
- After navigation: wait for .sapUshellAppTitle or page title
- After button click: wait for busy indicator to disappear
- After form submit: wait for success toast or navigation

STABLE SELECTORS (prefer these):
- Save button: button[title="Save"], .sapMBtnContent:has-text("Save")
- Back button: button[title="Back"], .sapMNavButton
- Search field: .sapMSearchField input
- Filter bar: .sapUiCompFilterBar
- Smart table: .sapUiCompSmartTable

For OData validation, use odata_query instead of UI scraping.
Only return the JSON array.`;

  const userPrompt = `SAP Fiori URL: ${config.baseUrl}
OData Base: ${config.odataBaseUrl || "/sap/opu/odata/sap/"}
Page: ${pageContext}
Step: "${step}"
Expected: "${expected}"`;

  try {
    const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as SAPCommand[];
  } catch (e: any) {
    console.error("[SAP Fiori] AI interpretation failed:", e.message);
  }
  return [{ action: "verify", description: step }];
}

// ─── Main SAP Fiori Executor ──────────────────────────────────────────────────

export class SAPFioriExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private odataClient: SAPODataClient | null = null;
  private capturedVars = new Map<string, any>();

  async runExecution(
    executionId: string,
    testCases: TestCase[],
    config: SAPFioriConfig,
    testData?: TestDataParam[]
  ): Promise<void> {
    const startTime = Date.now();
    await storage.updateExecution(executionId, { status: "running", startedAt: new Date() });

    let passedTests = 0;
    let failedTests = 0;
    const allLogs: string[] = [];
    const tdMap = new Map<string, string>();
    testData?.forEach((td) => tdMap.set(td.key, td.value));

    try {
      await this.initBrowser(config);
      allLogs.push(`[SAP Fiori] Browser initialized for ${config.baseUrl}`);

      if (config.odataBaseUrl) {
        this.odataClient = new SAPODataClient(
          config.baseUrl + config.odataBaseUrl,
          config.username,
          config.password,
          config.accessToken
        );
        allLogs.push(`[SAP Fiori] OData client initialized`);
      }

      await this.login(config, allLogs);

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
      allLogs.push(`[SAP Fiori] Fatal error: ${error.message}`);
      failedTests = testCases.length - passedTests;
    } finally {
      await this.cleanup();
      const duration = Date.now() - startTime;
      const finalStatus = failedTests > 0 ? "failed" : "passed";
      await storage.updateExecution(executionId, {
        status: finalStatus, completedAt: new Date(),
        passedTests, failedTests, totalTests: testCases.length,
      });
      const execution = await storage.getExecution(executionId);
      if (execution) {
        const suite = execution.suiteId ? await storage.getTestSuite(execution.suiteId) : null;
        await sendExecutionNotifications({
          executionId, suiteName: suite?.name || "SAP Fiori Tests",
          status: finalStatus, totalTests: testCases.length,
          passedTests, failedTests, duration,
          environment: execution.environment || "production",
          targetUrl: config.baseUrl,
        });
      }
    }
  }

  private async initBrowser(config: SAPFioriConfig): Promise<void> {
    this.browser = await chromium.launch({
      headless: false,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-web-security"],
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(60000);
    this.page.setDefaultNavigationTimeout(120000);
  }

  private async login(config: SAPFioriConfig, logs: string[]): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    logs.push(`[SAP Fiori] Navigating to ${config.baseUrl}`);
    await this.page.goto(config.baseUrl, { waitUntil: "networkidle" });

    // Check if login form is present
    const hasLoginForm = await this.page.locator("#USERNAME_FIELD, input[name='j_username'], #logonuidfield").count() > 0;

    if (hasLoginForm && config.username && config.password) {
      logs.push(`[SAP Fiori] Logging in as ${config.username}`);

      // SAP Fiori login form
      const userSelectors = ["#USERNAME_FIELD input", "#logonuidfield", "input[name='j_username']", "input[id*='user']"];
      for (const sel of userSelectors) {
        try {
          await this.page.fill(sel, config.username, { timeout: 5000 });
          break;
        } catch {}
      }

      const passSelectors = ["#PASSWORD_FIELD input", "#logonpassfield", "input[name='j_password']", "input[type='password']"];
      for (const sel of passSelectors) {
        try {
          await this.page.fill(sel, config.password, { timeout: 5000 });
          break;
        } catch {}
      }

      // Submit
      const submitSelectors = ["#LOGIN_LINK", "button[type='submit']", "input[type='submit']", "#logOnFormSubmit"];
      for (const sel of submitSelectors) {
        try {
          await this.page.click(sel, { timeout: 5000 });
          break;
        } catch {}
      }

      await this.waitForUI5Ready(logs);
      logs.push("[SAP Fiori] Login successful");
    } else {
      await this.waitForUI5Ready(logs);
      logs.push("[SAP Fiori] Already authenticated or no login required");
    }
  }

  private async waitForUI5Ready(logs: string[]): Promise<void> {
    if (!this.page) return;
    try {
      // Wait for UI5 to initialize
      await this.page.waitForFunction(
        () => {
          const sap = (window as any).sap;
          return sap && sap.ui && sap.ui.getCore && sap.ui.getCore().isInitialized();
        },
        { timeout: 30000 }
      );
      logs.push("[SAP Fiori] UI5 framework initialized");
    } catch {
      logs.push("[SAP Fiori] Warning: UI5 init wait timed out");
    }

    // Wait for busy indicator
    try {
      await this.page.waitForFunction(
        () => !document.querySelector(".sapUiLocalBusyIndicator"),
        { timeout: 15000 }
      );
    } catch {}

    await this.page.waitForTimeout(800);
  }

  private async executeTestCase(
    testCase: TestCase,
    config: SAPFioriConfig,
    tdMap: Map<string, string>,
    globalLogs: string[]
  ): Promise<{ passed: boolean; duration: number; errorMessage?: string; screenshot?: string; logs: string[] }> {
    const logs: string[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let screenshot: string | undefined;

    logs.push(`\n=== SAP FIORI TEST: ${testCase.title} ===`);
    const steps = (testCase.steps as { step: string; expected: string }[]) || [];

    for (let i = 0; i < steps.length; i++) {
      const { step, expected } = steps[i];
      const processedStep = this.replacePlaceholders(step, tdMap);
      const processedExpected = this.replacePlaceholders(expected, tdMap);
      logs.push(`\n--- Step ${i + 1}: ${processedStep} ---`);

      try {
        const pageTitle = await this.page!.title();
        const pageUrl = this.page!.url();
        const commands = await interpretSAPFioriStep(processedStep, processedExpected, `${pageTitle} | ${pageUrl}`, config);

        for (const cmd of commands) {
          await this.executeCommand(cmd, config, logs);
        }
        logs.push(`  ✓ Step ${i + 1} passed`);
      } catch (error: any) {
        logs.push(`  ✗ Step ${i + 1} failed: ${error.message}`);
        passed = false;
        errorMessage = `Step ${i + 1}: ${error.message}`;
        try { screenshot = (await this.page!.screenshot()).toString("base64"); } catch {}
        break;
      }
    }

    if (!screenshot) {
      try { screenshot = (await this.page!.screenshot()).toString("base64"); } catch {}
    }

    globalLogs.push(...logs);
    return { passed, duration: Date.now() - startTime, errorMessage, screenshot, logs };
  }

  private async executeCommand(cmd: SAPCommand, config: SAPFioriConfig, logs: string[]): Promise<void> {
    if (!this.page) throw new Error("No page");
    logs.push(`  → ${cmd.action}: ${cmd.description}`);

    switch (cmd.action) {
      case "navigate": {
        const url = cmd.value?.startsWith("http") ? cmd.value : `${config.baseUrl}${cmd.value || ""}`;
        await this.page.goto(url, { waitUntil: "networkidle" });
        await this.waitForUI5Ready(logs);
        break;
      }

      case "open_app": {
        // Open Fiori app by tile title or app ID
        const tileSelector = cmd.tileTitle
          ? `.sapUshellTile[title="${cmd.tileTitle}"], .sapUshellTileInner:has-text("${cmd.tileTitle}")`
          : cmd.appId
          ? `[data-help-id="${cmd.appId}"], [data-sap-ui*="${cmd.appId}"]`
          : null;

        if (tileSelector) {
          await this.page.locator(tileSelector).first().click({ timeout: 15000 });
          await this.waitForUI5Ready(logs);
          logs.push(`    Opened app: ${cmd.tileTitle || cmd.appId}`);
        }
        break;
      }

      case "wait": {
        if (cmd.selector) {
          if (cmd.selector.includes("BusyIndicator") || cmd.selector.includes("busy")) {
            await this.page.waitForFunction(
              () => !document.querySelector(".sapUiLocalBusyIndicator, .sapUiBlockLayer"),
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
        const selector = cmd.selector || (cmd.ui5Id ? `[id="${cmd.ui5Id}"]` : "");
        if (!selector) break;

        try {
          await this.page.locator(selector).first().click({ timeout: 15000 });
        } catch {
          // Try UI5 JS click
          if (cmd.ui5Id) {
            await this.page.evaluate((id: string) => {
              const ctrl = (window as any).sap?.ui?.getCore()?.byId(id);
              if (ctrl && ctrl.firePress) ctrl.firePress();
              else if (ctrl && ctrl.fireSelect) ctrl.fireSelect();
            }, cmd.ui5Id);
          } else {
            throw new Error(`Element not found: ${selector}`);
          }
        }
        await this.waitForUI5Ready(logs);
        break;
      }

      case "type": {
        const selector = cmd.selector || (cmd.ui5Id ? `[id="${cmd.ui5Id}"] input` : "");
        if (!selector || cmd.value === undefined) break;
        const value = this.replaceCapturedVars(cmd.value);

        try {
          await this.page.locator(selector).first().fill(value, { timeout: 15000 });
        } catch {
          if (cmd.ui5Id) {
            await this.page.evaluate(([id, val]: [string, string]) => {
              const ctrl = (window as any).sap?.ui?.getCore()?.byId(id);
              if (ctrl && ctrl.setValue) ctrl.setValue(val);
            }, [cmd.ui5Id, value]);
          }
        }
        logs.push(`    Typed "${value}"`);
        break;
      }

      case "select": {
        const selector = cmd.selector || (cmd.ui5Id ? `[id="${cmd.ui5Id}"]` : "");
        if (!selector || !cmd.value) break;

        try {
          // Try native select
          await this.page.selectOption(selector, { label: cmd.value }, { timeout: 5000 });
        } catch {
          // Try UI5 ComboBox
          if (cmd.ui5Id) {
            await this.page.evaluate(([id, val]: [string, string]) => {
              const ctrl = (window as any).sap?.ui?.getCore()?.byId(id);
              if (ctrl && ctrl.setSelectedKey) ctrl.setSelectedKey(val);
              else if (ctrl && ctrl.setValue) ctrl.setValue(val);
            }, [cmd.ui5Id, cmd.value]);
          } else {
            // Click to open dropdown then select
            await this.page.locator(selector).first().click({ timeout: 10000 });
            await this.page.waitForTimeout(500);
            await this.page.locator(`.sapMSelectList li:has-text("${cmd.value}"), .sapMComboBoxItem:has-text("${cmd.value}")`).first().click({ timeout: 10000 });
          }
        }
        logs.push(`    Selected "${cmd.value}"`);
        break;
      }

      case "verify": {
        const selector = cmd.selector || (cmd.ui5Id ? `[id="${cmd.ui5Id}"]` : "");
        if (selector) {
          const locator = this.page.locator(selector).first();
          await locator.waitFor({ state: "visible", timeout: 15000 });
          if (cmd.value) {
            const text = await locator.textContent() || await locator.inputValue().catch(() => "");
            if (!text.includes(cmd.value)) throw new Error(`Expected "${cmd.value}" but got "${text}"`);
          }
          if (cmd.captureAs) {
            const text = await locator.textContent() || await locator.inputValue().catch(() => "");
            this.capturedVars.set(cmd.captureAs, text.trim());
            logs.push(`    Captured $${cmd.captureAs}$ = "${text.trim()}"`);
          }
        }
        logs.push(`    ✓ Verified: ${cmd.description}`);
        break;
      }

      case "scroll": {
        if (cmd.selector) await this.page.locator(cmd.selector).first().scrollIntoViewIfNeeded();
        else await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        break;
      }

      case "press_key": {
        await this.page.keyboard.press(cmd.value || "Enter");
        break;
      }

      case "accept_dialog": {
        this.page.once("dialog", (d) => d.accept());
        break;
      }

      case "ui5_action": {
        if (cmd.ui5Id && cmd.value) {
          await this.page.evaluate(([id, action]: [string, string]) => {
            const ctrl = (window as any).sap?.ui?.getCore()?.byId(id);
            if (ctrl && (ctrl as any)[action]) (ctrl as any)[action]();
          }, [cmd.ui5Id, cmd.value]);
          logs.push(`    UI5 action ${cmd.value} on ${cmd.ui5Id}`);
        }
        break;
      }

      case "odata_query": {
        if (!this.odataClient || !cmd.odataService || !cmd.odataEntity) {
          logs.push(`    [OData] Missing client or service config — skipping`);
          break;
        }
        const records = await this.odataClient.query(cmd.odataService, cmd.odataEntity, cmd.odataFilter);
        logs.push(`    [OData] Query returned ${records.length} records`);
        if (cmd.captureAs && records.length > 0) {
          this.capturedVars.set(cmd.captureAs, records[0]);
          logs.push(`    [OData] Captured first record as $${cmd.captureAs}$`);
        }
        break;
      }

      case "odata_create": {
        if (!this.odataClient || !cmd.odataService || !cmd.odataEntity || !cmd.odataPayload) {
          logs.push(`    [OData] Missing required fields — skipping`);
          break;
        }
        const result = await this.odataClient.create(cmd.odataService, cmd.odataEntity, cmd.odataPayload);
        logs.push(`    [OData] Created record in ${cmd.odataEntity}`);
        if (cmd.captureAs) {
          this.capturedVars.set(cmd.captureAs, result);
        }
        break;
      }

      default:
        logs.push(`    Unknown command: ${cmd.action}`);
    }
  }

  private replacePlaceholders(text: string, tdMap: Map<string, string>): string {
    let result = text;
    tdMap.forEach((v, k) => { result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "gi"), v); });
    return result;
  }

  private replaceCapturedVars(text: string): string {
    let result = text;
    this.capturedVars.forEach((v, k) => { result = result.replace(new RegExp(`\\$${k}\\$`, "gi"), String(v)); });
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

export const sapFioriExecutor = new SAPFioriExecutor();
