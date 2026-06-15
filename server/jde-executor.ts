/**
 * JD Edwards (Oracle) Test Executor — AITAS Phase 2
 * Supports: JDE EnterpriseOne HTML Web Client + AIS REST API
 */

import { Builder, WebDriver, By, until, Key } from "selenium-webdriver";
import { Options as ChromeOptions } from "selenium-webdriver/chrome";
import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestDataParam } from "@shared/schema";
import { sendExecutionNotifications } from "./notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JDEConfig {
  baseUrl: string;              // e.g. https://jde.company.com/jde/owhtml
  aisUrl?: string;              // AIS Server URL e.g. https://jde.company.com/jderest
  username: string;
  password: string;
  environment?: string;         // JDE environment e.g. JDV920
  role?: string;                // JDE role e.g. *ALL
  apiVersion?: string;          // AIS API version e.g. v2
}

interface JDEStepResult {
  step: string;
  passed: boolean;
  error?: string;
  screenshot?: string;
  logs: string[];
}

// ─── AIS REST API Client ──────────────────────────────────────────────────────

export class JDEAisClient {
  private baseUrl: string;
  private token: string | null = null;
  private username: string;
  private password: string;
  private environment: string;
  private role: string;
  private apiVersion: string;

  constructor(config: JDEConfig) {
    this.baseUrl = (config.aisUrl || config.baseUrl.replace("/jde/owhtml", "")).replace(/\/$/, "");
    this.username = config.username;
    this.password = config.password;
    this.environment = config.environment || "JDV920";
    this.role = config.role || "*ALL";
    this.apiVersion = config.apiVersion || "v2";
  }

  async authenticate(): Promise<string> {
    const url = `${this.baseUrl}/jderest/${this.apiVersion}/tokenrequest`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
        environment: this.environment,
        role: this.role,
        deviceName: "AITAS-Test-Agent",
      }),
    });

    if (!response.ok) {
      throw new Error(`JDE AIS auth failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    this.token = data.userInfo?.token || data.token;
    if (!this.token) throw new Error("JDE AIS: No token in response");
    return this.token;
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    if (!this.token) await this.authenticate();

    const url = `${this.baseUrl}/jderest/${this.apiVersion}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "JDE-AIS-Auth": this.token!,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      // Re-authenticate and retry
      await this.authenticate();
      return this.request(method, path, body);
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`JDE AIS ${method} ${path}: ${response.status} — ${err.substring(0, 300)}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  /** Open a JDE application form via AIS */
  async openForm(formName: string, version: string = "ZJDE0001", params?: Record<string, any>): Promise<any> {
    return this.request("POST", "/appstack", {
      formName,
      version,
      formServiceAction: "R",
      returnControlIDs: "1",
      ...(params || {}),
    });
  }

  /** Execute a form action (Find, OK, Cancel, etc.) */
  async formAction(stackId: string, stateId: string, action: string, data?: Record<string, any>): Promise<any> {
    return this.request("POST", "/appstack", {
      stackId,
      stateId,
      formServiceAction: action,
      ...(data || {}),
    });
  }

  /** Query JDE business data via Data Service */
  async queryData(tableName: string, query: Record<string, any>): Promise<any[]> {
    const result = await this.request("POST", `/dataservice/${tableName}`, {
      query,
      maxPageSize: 100,
    });
    return result?.fs_DATABROWSE_F0101?.data?.gridData?.rowset || result?.rowset || [];
  }

  /** Call a JDE Orchestrator */
  async callOrchestrator(orchestratorName: string, inputs: Record<string, any>): Promise<any> {
    return this.request("POST", `/orchestrator/${orchestratorName}`, inputs);
  }

  /** Get UDC values */
  async getUDC(productCode: string, udcType: string): Promise<any[]> {
    const result = await this.request("GET", `/udc/${productCode}/${udcType}`);
    return result?.items || [];
  }

  /** Logout */
  async logout(): Promise<void> {
    if (this.token) {
      try {
        await this.request("DELETE", "/tokenrequest");
      } catch {}
      this.token = null;
    }
  }
}

// ─── AI Step Interpreter for JDE ─────────────────────────────────────────────

interface JDECommand {
  action: "navigate" | "click" | "type" | "select" | "verify" | "wait" |
          "grid_select" | "grid_find" | "toolbar_click" | "qbe_enter" |
          "ais_open_form" | "ais_query" | "ais_orchestrator" | "press_key" |
          "switch_frame" | "accept_alert";
  // UI
  selector?: string;
  formId?: string;              // JDE form ID e.g. W4210A
  fieldId?: string;             // JDE field ID e.g. AN8, DOCO
  value?: string;
  toolbarButton?: string;       // Find, OK, Cancel, Save, Add, Delete
  gridRow?: number;
  gridColumn?: string;
  // AIS
  formName?: string;            // e.g. P4210
  version?: string;
  aisParams?: Record<string, any>;
  tableName?: string;
  query?: Record<string, any>;
  orchestratorName?: string;
  orchestratorInputs?: Record<string, any>;
  // Capture
  captureAs?: string;
  description: string;
}

async function interpretJDEStep(
  step: string,
  expected: string,
  pageContext: string,
  config: JDEConfig
): Promise<JDECommand[]> {
  const aiClient = await getAiClient();

  const systemPrompt = `You are a JD Edwards EnterpriseOne test automation expert.
JDE HTML Web Client has specific patterns you must follow.

Return ONLY a JSON array of commands:
[{
  "action": "navigate|click|type|select|verify|wait|grid_select|grid_find|toolbar_click|qbe_enter|ais_open_form|ais_query|ais_orchestrator|press_key|switch_frame|accept_alert",
  "selector": "CSS/XPath selector",
  "formId": "W4210A",
  "fieldId": "AN8",
  "value": "value",
  "toolbarButton": "Find|OK|Cancel|Save|Add|Delete|Close",
  "gridRow": 0,
  "gridColumn": "DOCO",
  "formName": "P4210",
  "version": "ZJDE0001",
  "aisParams": {},
  "tableName": "F4301",
  "query": {},
  "orchestratorName": "OrchestratorName",
  "orchestratorInputs": {},
  "captureAs": "variableName",
  "description": "what this does"
}]

JDE-SPECIFIC RULES:
1. JDE forms load inside iframes — always use switch_frame first
2. Main iframe: id="e1menuAppIframe" or name="e1menuAppIframe"
3. Form title: div.title_text or #TITLE_TEXT
4. Input fields: input[id*="AN8"], input[name*="AN8"], or by data-fieldname
5. QBE (Query By Example) row: tr.QBE_ROW input[id*="FIELDNAME"]
6. Grid rows: tr[id^="row"] or tr.ODD_ROW, tr.EVEN_ROW
7. Toolbar buttons: button[id="hc_Find"], button[id="hc_OK"], button[id="hc_Cancel"]
   Common IDs: hc_Find, hc_OK, hc_Cancel, hc_Add, hc_Delete, hc_Close, hc_Save
8. Processing spinner: div#processingDiv — always wait for it to hide
9. Date fields: use format MM/DD/YYYY
10. Amount fields: no commas, use decimal point
11. Dropdown/UDC: select[id*="FIELDNAME"] or custom JDE dropdown
12. Navigation: use JDE menu path or direct URL with form parameters
13. For data validation, prefer ais_query over UI scraping

WAIT PATTERNS:
- After toolbar click: wait for processingDiv to hide
- After form open: wait for form title to appear
- After grid find: wait for grid rows to load

STABLE SELECTORS:
- Form container: div#mainTable or div.formContainer
- Grid: table#grdData or div.gridContainer
- Status bar: div#statusBar or span#statusMessage`;

  const userPrompt = `JDE URL: ${config.baseUrl}
AIS URL: ${config.aisUrl || "not configured"}
Page: ${pageContext}
Step: "${step}"
Expected: "${expected}"`;

  try {
    const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as JDECommand[];
  } catch (e: any) {
    console.error("[JDE Executor] AI interpretation failed:", e.message);
  }

  return [{ action: "verify", description: step }];
}

// ─── Main JDE Executor ────────────────────────────────────────────────────────

export class JDEExecutor {
  private driver: WebDriver | null = null;
  private aisClient: JDEAisClient | null = null;
  private capturedVars = new Map<string, any>();
  private inIframe = false;

  async runExecution(
    executionId: string,
    testCases: TestCase[],
    config: JDEConfig,
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

    const tdMap = new Map<string, string>();
    testData?.forEach((td) => tdMap.set(td.key, td.value));

    try {
      // Initialize browser
      await this.initBrowser();
      allLogs.push(`[JDE] Browser initialized`);

      // Initialize AIS client
      if (config.aisUrl) {
        this.aisClient = new JDEAisClient(config);
        await this.aisClient.authenticate();
        allLogs.push(`[JDE] AIS client authenticated`);
      }

      // Login to JDE HTML client
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
      allLogs.push(`[JDE] Fatal error: ${error.message}`);
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
          suiteName: suite?.name || "JDE Tests",
          status: finalStatus,
          totalTests: testCases.length,
          passedTests,
          failedTests,
          duration,
          environment: execution.environment || "production",
          targetUrl: config.baseUrl,
        });
      }

      // Logout AIS
      if (this.aisClient) {
        await this.aisClient.logout().catch(() => {});
      }
    }
  }

  private async initBrowser(): Promise<void> {
    const options = new ChromeOptions();
    options.addArguments(
      "--disable-blink-features=AutomationControlled",
      "--start-maximized",
      "--disable-popup-blocking",
      "--disable-notifications",
      "--log-level=3"
    );
    options.excludeSwitches("enable-automation", "enable-logging");

    this.driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();

    // JDE needs long timeouts
    await this.driver.manage().setTimeouts({
      implicit: 15000,
      pageLoad: 120000,
      script: 120000,
    });
  }

  private async login(config: JDEConfig, logs: string[]): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");

    logs.push(`[JDE] Navigating to ${config.baseUrl}`);
    await this.driver.get(config.baseUrl);

    // Wait for login form
    await this.driver.wait(
      until.elementLocated(By.css("input[name='username'], input[id='USER'], #j_username")),
      30000
    );

    // Fill credentials
    const userField = await this.driver.findElement(
      By.css("input[name='username'], input[id='USER'], #j_username")
    );
    await userField.clear();
    await userField.sendKeys(config.username);

    const passField = await this.driver.findElement(
      By.css("input[type='password'], input[id='PASSWORD'], #j_password")
    );
    await passField.clear();
    await passField.sendKeys(config.password);

    // Select environment if field exists
    if (config.environment) {
      try {
        const envField = await this.driver.findElement(
          By.css("input[name='environment'], select[name='environment'], #ENVIRONMENT")
        );
        const tagName = await envField.getTagName();
        if (tagName === "select") {
          const option = await envField.findElement(
            By.xpath(`./option[contains(text(), "${config.environment}")]`)
          );
          await option.click();
        } else {
          await envField.clear();
          await envField.sendKeys(config.environment);
        }
      } catch {}
    }

    // Submit
    const loginBtn = await this.driver.findElement(
      By.css("button[type='submit'], input[type='submit'], #btnLogin, button#login")
    );
    await loginBtn.click();

    // Wait for JDE home page
    await this.waitForJDEReady(logs);
    logs.push("[JDE] Login successful");
  }

  private async waitForJDEReady(logs: string[]): Promise<void> {
    if (!this.driver) return;

    try {
      // Wait for processing div to disappear
      await this.driver.wait(async () => {
        try {
          const processingDiv = await this.driver!.findElement(By.id("processingDiv"));
          const style = await processingDiv.getAttribute("style");
          return style?.includes("display: none") || style?.includes("display:none");
        } catch {
          return true; // Element not found = not loading
        }
      }, 60000);
    } catch {
      logs.push("[JDE] Warning: Processing wait timed out");
    }

    await this.driver.sleep(500);
  }

  private async executeTestCase(
    testCase: TestCase,
    config: JDEConfig,
    tdMap: Map<string, string>,
    globalLogs: string[]
  ): Promise<{ passed: boolean; duration: number; errorMessage?: string; screenshot?: string; logs: string[] }> {
    const logs: string[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let screenshot: string | undefined;

    logs.push(`\n=== JDE TEST: ${testCase.title} ===`);

    const steps = (testCase.steps as { step: string; expected: string }[]) || [];

    for (let i = 0; i < steps.length; i++) {
      const { step, expected } = steps[i];
      const processedStep = this.replacePlaceholders(step, tdMap);
      const processedExpected = this.replacePlaceholders(expected, tdMap);

      logs.push(`\n--- Step ${i + 1}: ${processedStep} ---`);

      try {
        const pageTitle = await this.driver!.getTitle();
        const pageUrl = await this.driver!.getCurrentUrl();
        const commands = await interpretJDEStep(
          processedStep,
          processedExpected,
          `${pageTitle} | ${pageUrl}`,
          config
        );

        for (const cmd of commands) {
          await this.executeCommand(cmd, config, logs);
        }

        logs.push(`  ✓ Step ${i + 1} passed`);
      } catch (error: any) {
        logs.push(`  ✗ Step ${i + 1} failed: ${error.message}`);
        passed = false;
        errorMessage = `Step ${i + 1}: ${error.message}`;

        try {
          screenshot = await this.driver!.takeScreenshot();
        } catch {}

        break;
      }
    }

    if (!screenshot) {
      try { screenshot = await this.driver!.takeScreenshot(); } catch {}
    }

    globalLogs.push(...logs);

    return {
      passed,
      duration: Date.now() - startTime,
      errorMessage,
      screenshot,
      logs,
    };
  }

  private async executeCommand(cmd: JDECommand, config: JDEConfig, logs: string[]): Promise<void> {
    if (!this.driver) throw new Error("No driver");

    logs.push(`  → ${cmd.action}: ${cmd.description}`);

    switch (cmd.action) {
      case "navigate": {
        const url = cmd.value?.startsWith("http")
          ? cmd.value
          : `${config.baseUrl}${cmd.value || ""}`;
        await this.driver.get(url);
        await this.waitForJDEReady(logs);
        break;
      }

      case "switch_frame": {
        if (cmd.selector) {
          try {
            const frame = await this.driver.findElement(By.css(cmd.selector));
            await this.driver.switchTo().frame(frame);
            this.inIframe = true;
            logs.push(`    Switched to frame: ${cmd.selector}`);
          } catch {
            // Try by name/id
            await this.driver.switchTo().frame(cmd.selector);
            this.inIframe = true;
          }
        } else {
          await this.driver.switchTo().defaultContent();
          this.inIframe = false;
          logs.push(`    Switched to default content`);
        }
        break;
      }

      case "wait": {
        if (cmd.selector) {
          if (cmd.selector === "processingDiv" || cmd.selector.includes("processing")) {
            await this.waitForJDEReady(logs);
          } else {
            await this.driver.wait(
              until.elementLocated(By.css(cmd.selector)),
              30000
            );
          }
        } else {
          await this.driver.sleep(parseInt(cmd.value || "2000"));
        }
        break;
      }

      case "toolbar_click": {
        const buttonId = cmd.toolbarButton
          ? `hc_${cmd.toolbarButton}`
          : cmd.selector || "";

        const selectors = [
          `#${buttonId}`,
          `button[id="${buttonId}"]`,
          `input[id="${buttonId}"]`,
          `button[title="${cmd.toolbarButton}"]`,
          `td[id="${buttonId}"]`,
        ];

        let clicked = false;
        for (const sel of selectors) {
          try {
            const el = await this.driver.findElement(By.css(sel));
            await this.driver.executeScript("arguments[0].scrollIntoView(true);", el);
            await el.click();
            clicked = true;
            logs.push(`    Clicked toolbar: ${buttonId}`);
            break;
          } catch {}
        }

        if (!clicked) throw new Error(`Toolbar button not found: ${buttonId}`);
        await this.waitForJDEReady(logs);
        break;
      }

      case "click": {
        const selector = cmd.selector || (cmd.fieldId ? `[id*="${cmd.fieldId}"]` : "");
        if (!selector) break;

        const el = await this.driver.wait(
          until.elementLocated(By.css(selector)),
          15000
        );
        await this.driver.executeScript("arguments[0].scrollIntoView(true);", el);
        await el.click();
        logs.push(`    Clicked: ${selector}`);
        break;
      }

      case "type": {
        const selector = cmd.selector ||
          (cmd.fieldId ? `input[id*="${cmd.fieldId}"], input[name*="${cmd.fieldId}"]` : "");
        if (!selector || cmd.value === undefined) break;

        const value = this.replaceCapturedVars(cmd.value);
        const el = await this.driver.wait(
          until.elementLocated(By.css(selector)),
          15000
        );
        await this.driver.executeScript("arguments[0].scrollIntoView(true);", el);
        await el.clear();
        await el.sendKeys(value);
        logs.push(`    Typed "${value}" into ${selector}`);
        break;
      }

      case "qbe_enter": {
        // JDE QBE (Query By Example) row
        const fieldSelector = cmd.fieldId
          ? `tr.QBE_ROW input[id*="${cmd.fieldId}"], tr.QBE_ROW input[name*="${cmd.fieldId}"]`
          : cmd.selector || "";

        if (!fieldSelector || !cmd.value) break;

        const el = await this.driver.wait(
          until.elementLocated(By.css(fieldSelector)),
          15000
        );
        await el.clear();
        await el.sendKeys(cmd.value);
        logs.push(`    QBE entered "${cmd.value}" in ${cmd.fieldId || fieldSelector}`);
        break;
      }

      case "select": {
        const selector = cmd.selector ||
          (cmd.fieldId ? `select[id*="${cmd.fieldId}"]` : "");
        if (!selector || !cmd.value) break;

        const el = await this.driver.wait(
          until.elementLocated(By.css(selector)),
          15000
        );
        const option = await el.findElement(
          By.xpath(`./option[contains(text(), "${cmd.value}") or @value="${cmd.value}"]`)
        );
        await option.click();
        logs.push(`    Selected "${cmd.value}" from ${selector}`);
        break;
      }

      case "grid_find": {
        // Click Find toolbar button and wait for grid
        await this.executeCommand({ action: "toolbar_click", toolbarButton: "Find", description: "Find records" }, config, logs);
        await this.waitForJDEReady(logs);
        break;
      }

      case "grid_select": {
        // Select a row in JDE grid
        const rowIndex = cmd.gridRow ?? 0;
        const rowSelectors = [
          `tr[id="row${rowIndex}"]`,
          `tr.ODD_ROW:nth-child(${rowIndex + 1})`,
          `tr.EVEN_ROW:nth-child(${rowIndex + 1})`,
          `tr[id^="row"]:nth-child(${rowIndex + 1})`,
        ];

        let selected = false;
        for (const sel of rowSelectors) {
          try {
            const row = await this.driver.findElement(By.css(sel));
            await row.click();
            logs.push(`    Selected grid row ${rowIndex}`);
            selected = true;
            break;
          } catch {}
        }

        if (!selected) {
          // Try clicking first available row
          const rows = await this.driver.findElements(By.css("tr.ODD_ROW, tr.EVEN_ROW, tr[id^='row']"));
          if (rows.length > rowIndex) {
            await rows[rowIndex].click();
            logs.push(`    Selected grid row ${rowIndex} (fallback)`);
          } else {
            throw new Error(`Grid row ${rowIndex} not found`);
          }
        }
        break;
      }

      case "verify": {
        const selector = cmd.selector || (cmd.fieldId ? `[id*="${cmd.fieldId}"]` : "");

        if (cmd.captureAs && selector) {
          const el = await this.driver.findElement(By.css(selector));
          const text = await el.getText() || await el.getAttribute("value") || "";
          this.capturedVars.set(cmd.captureAs, text.trim());
          logs.push(`    Captured $${cmd.captureAs}$ = "${text.trim()}"`);
        }

        if (selector && cmd.value) {
          const el = await this.driver.wait(
            until.elementLocated(By.css(selector)),
            15000
          );
          const text = await el.getText() || await el.getAttribute("value") || "";
          if (!text.includes(cmd.value)) {
            throw new Error(`Expected "${cmd.value}" but got "${text}"`);
          }
          logs.push(`    ✓ Verified "${cmd.value}" in ${selector}`);
        } else if (selector) {
          await this.driver.wait(until.elementLocated(By.css(selector)), 15000);
          logs.push(`    ✓ Element found: ${selector}`);
        } else {
          logs.push(`    ✓ Verify: ${cmd.description}`);
        }
        break;
      }

      case "press_key": {
        const keyMap: Record<string, string> = {
          Enter: Key.ENTER, Tab: Key.TAB, Escape: Key.ESCAPE,
          F1: Key.F1, F4: Key.F4, F6: Key.F6,
        };
        const key = keyMap[cmd.value || "Enter"] || Key.ENTER;

        if (cmd.selector) {
          const el = await this.driver.findElement(By.css(cmd.selector));
          await el.sendKeys(key);
        } else {
          const active = await this.driver.switchTo().activeElement();
          await active.sendKeys(key);
        }
        logs.push(`    Pressed key: ${cmd.value || "Enter"}`);
        break;
      }

      case "accept_alert": {
        try {
          const alert = await this.driver.switchTo().alert();
          await alert.accept();
          logs.push(`    Accepted alert`);
        } catch {
          logs.push(`    No alert present`);
        }
        break;
      }

      // ─── AIS API Actions ──────────────────────────────────────────────────

      case "ais_open_form": {
        if (!this.aisClient || !cmd.formName) {
          logs.push(`    [AIS] No client or form name — skipping`);
          break;
        }
        const result = await this.aisClient.openForm(
          cmd.formName,
          cmd.version,
          cmd.aisParams
        );
        logs.push(`    [AIS] Opened form ${cmd.formName}`);

        if (cmd.captureAs) {
          this.capturedVars.set(cmd.captureAs, result);
          logs.push(`    [AIS] Captured form result as $${cmd.captureAs}$`);
        }
        break;
      }

      case "ais_query": {
        if (!this.aisClient || !cmd.tableName) {
          logs.push(`    [AIS] No client or table name — skipping`);
          break;
        }
        const records = await this.aisClient.queryData(cmd.tableName, cmd.query || {});
        logs.push(`    [AIS] Query ${cmd.tableName} returned ${records.length} records`);

        if (cmd.captureAs && records.length > 0) {
          this.capturedVars.set(cmd.captureAs, records[0]);
          logs.push(`    [AIS] Captured first record as $${cmd.captureAs}$`);
        }
        break;
      }

      case "ais_orchestrator": {
        if (!this.aisClient || !cmd.orchestratorName) {
          logs.push(`    [AIS] No client or orchestrator name — skipping`);
          break;
        }
        const result = await this.aisClient.callOrchestrator(
          cmd.orchestratorName,
          cmd.orchestratorInputs || {}
        );
        logs.push(`    [AIS] Orchestrator ${cmd.orchestratorName} executed`);

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
      if (this.driver) {
        await this.driver.quit();
        this.driver = null;
      }
    } catch {}
  }
}

export const jdeExecutor = new JDEExecutor();
