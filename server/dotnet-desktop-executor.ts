/**
 * .NET Desktop Executor — AITAS Phase 4
 * Handles WinForms, WPF, MAUI, and legacy .NET desktop apps
 * Uses WinAppDriver (Microsoft) via WebDriver protocol
 */

import { Builder, WebDriver, By, until, Key } from "selenium-webdriver";
import { Options as ChromeOptions } from "selenium-webdriver/chrome";
import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestDataParam } from "@shared/schema";
import { sendExecutionNotifications } from "./notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DotNetDesktopConfig {
  appPath: string;              // Full path to .exe e.g. C:\Apps\MyApp.exe
  appArguments?: string;        // Command-line arguments
  winAppDriverUrl?: string;     // Default: http://127.0.0.1:4723
  appWorkingDir?: string;       // Working directory for the app
  appTopLevelWindow?: string;   // Window handle if app already running
  implicitWait?: number;        // ms, default 10000
  launchDelay?: number;         // ms to wait after launch, default 3000
}

interface WinCommand {
  action: "click" | "type" | "clear" | "select" | "verify" | "wait" |
          "double_click" | "right_click" | "press_key" | "get_text" |
          "check" | "uncheck" | "scroll" | "hover" | "close_dialog" |
          "switch_window" | "maximize" | "screenshot";
  // Locator strategies (in priority order)
  automationId?: string;        // AutomationId (most stable)
  name?: string;                // Name/AccessibleName
  className?: string;           // ClassName e.g. Button, TextBox
  xpath?: string;               // XPath in UI Automation tree
  // Action params
  value?: string;
  key?: string;                 // Key name for press_key
  captureAs?: string;
  description: string;
}

// ─── AI Step Interpreter ──────────────────────────────────────────────────────

async function interpretDotNetStep(
  step: string,
  expected: string,
  windowTitle: string
): Promise<WinCommand[]> {
  const aiClient = await getAiClient();

  const systemPrompt = `You are a .NET desktop test automation expert using WinAppDriver.
WinAppDriver uses Windows UI Automation (UIA) to interact with WinForms/WPF apps.

Return ONLY a JSON array of commands:
[{
  "action": "click|type|clear|select|verify|wait|double_click|right_click|press_key|get_text|check|uncheck|scroll|hover|close_dialog|switch_window|maximize",
  "automationId": "btnSave",
  "name": "Save",
  "className": "Button",
  "xpath": "//Button[@Name='Save']",
  "value": "text to type or expected text",
  "key": "Enter|Tab|Escape|F1-F12|Delete|BackSpace",
  "captureAs": "variableName",
  "description": "what this does"
}]

WINAPPDRIVER RULES:
1. Best locator: automationId (set in WinForms as Name property, in WPF as AutomationProperties.AutomationId)
2. Second best: name (visible text/label of the control)
3. className: standard .NET control types:
   - WinForms: Button, TextBox, ComboBox, DataGridView, TabControl, CheckBox, RadioButton, ListBox
   - WPF: Button, TextBox, ComboBox, DataGrid, TabItem, CheckBox, RadioButton, ListBox
4. XPath in UIA tree: //Button[@AutomationId='btnSave'] or //Edit[@Name='Username']
5. For DataGridView/DataGrid rows: //DataItem[@Name='row text']
6. For menu items: //MenuItem[@Name='File']/MenuItem[@Name='Save']
7. For tab pages: //TabItem[@Name='Details']
8. For dialogs: //Window[@Name='Confirm'] then interact with its children
9. Keyboard shortcuts: use press_key with key name
10. After clicking buttons that open dialogs: add wait for new window

STABLE PATTERNS:
- Save button: automationId="btnSave" or name="Save" or className="Button" + name="Save"
- Text input: automationId="txtUsername" or className="Edit"
- Dropdown: automationId="cboStatus" or className="ComboBox"
- Grid row: xpath="//DataItem[contains(@Name,'search text')]"
- Message box OK: name="OK" + className="Button"
- Close dialog: name="Cancel" or press_key Escape

Only return the JSON array.`;

  const userPrompt = `Window: "${windowTitle}"
Step: "${step}"
Expected: "${expected}"`;

  try {
    const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as WinCommand[];
  } catch (e: any) {
    console.error("[.NET Executor] AI interpretation failed:", e.message);
  }
  return [{ action: "verify", description: step }];
}

// ─── WinAppDriver Session Builder ─────────────────────────────────────────────

function buildLocator(cmd: WinCommand): By {
  if (cmd.automationId) return By.css(`[AutomationId="${cmd.automationId}"]`);
  if (cmd.xpath) return By.xpath(cmd.xpath);
  if (cmd.name && cmd.className) return By.xpath(`//${cmd.className}[@Name="${cmd.name}"]`);
  if (cmd.name) return By.name(cmd.name);
  if (cmd.className) return By.className(cmd.className);
  throw new Error(`No locator provided for command: ${cmd.description}`);
}

// ─── Main .NET Desktop Executor ───────────────────────────────────────────────

export class DotNetDesktopExecutor {
  private driver: WebDriver | null = null;
  private capturedVars = new Map<string, any>();

  async runExecution(
    executionId: string,
    testCases: TestCase[],
    config: DotNetDesktopConfig,
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
      await this.initDriver(config);
      allLogs.push(`[.NET] WinAppDriver session started for ${config.appPath}`);

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
      allLogs.push(`[.NET] Fatal error: ${error.message}`);
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
          executionId, suiteName: suite?.name || ".NET Desktop Tests",
          status: finalStatus, totalTests: testCases.length,
          passedTests, failedTests, duration,
          environment: execution.environment || "production",
          targetUrl: config.appPath,
        });
      }
    }
  }

  private async initDriver(config: DotNetDesktopConfig): Promise<void> {
    const winAppDriverUrl = config.winAppDriverUrl || "http://127.0.0.1:4723";

    const capabilities: Record<string, any> = {
      "app": config.appPath,
      "platformName": "Windows",
      "deviceName": "WindowsPC",
    };

    if (config.appArguments) capabilities["appArguments"] = config.appArguments;
    if (config.appWorkingDir) capabilities["appWorkingDir"] = config.appWorkingDir;
    if (config.appTopLevelWindow) {
      capabilities["app"] = "Root";
      capabilities["appTopLevelWindow"] = config.appTopLevelWindow;
    }

    // Build driver using WinAppDriver endpoint
    this.driver = await new Builder()
      .usingServer(winAppDriverUrl)
      .withCapabilities(capabilities)
      .build();

    await this.driver.manage().setTimeouts({
      implicit: config.implicitWait || 10000,
    });

    // Wait for app to launch
    await this.driver.sleep(config.launchDelay || 3000);
  }

  private async executeTestCase(
    testCase: TestCase,
    config: DotNetDesktopConfig,
    tdMap: Map<string, string>,
    globalLogs: string[]
  ): Promise<{ passed: boolean; duration: number; errorMessage?: string; screenshot?: string; logs: string[] }> {
    const logs: string[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let screenshot: string | undefined;

    logs.push(`\n=== .NET TEST: ${testCase.title} ===`);
    const steps = (testCase.steps as { step: string; expected: string }[]) || [];

    for (let i = 0; i < steps.length; i++) {
      const { step, expected } = steps[i];
      const processedStep = this.replacePlaceholders(step, tdMap);
      const processedExpected = this.replacePlaceholders(expected, tdMap);
      logs.push(`\n--- Step ${i + 1}: ${processedStep} ---`);

      try {
        const windowTitle = await this.driver!.getTitle().catch(() => "Unknown Window");
        const commands = await interpretDotNetStep(processedStep, processedExpected, windowTitle);

        for (const cmd of commands) {
          await this.executeCommand(cmd, logs);
        }
        logs.push(`  ✓ Step ${i + 1} passed`);
      } catch (error: any) {
        logs.push(`  ✗ Step ${i + 1} failed: ${error.message}`);
        passed = false;
        errorMessage = `Step ${i + 1}: ${error.message}`;
        try { screenshot = await this.driver!.takeScreenshot(); } catch {}
        break;
      }
    }

    if (!screenshot) {
      try { screenshot = await this.driver!.takeScreenshot(); } catch {}
    }

    globalLogs.push(...logs);
    return { passed, duration: Date.now() - startTime, errorMessage, screenshot, logs };
  }

  private async executeCommand(cmd: WinCommand, logs: string[]): Promise<void> {
    if (!this.driver) throw new Error("No driver");
    logs.push(`  → ${cmd.action}: ${cmd.description}`);

    switch (cmd.action) {
      case "click": {
        const locator = buildLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        await el.click();
        await this.driver.sleep(300);
        break;
      }

      case "double_click": {
        const locator = buildLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        const actions = this.driver.actions({ async: true });
        await actions.doubleClick(el).perform();
        break;
      }

      case "right_click": {
        const locator = buildLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        const actions = this.driver.actions({ async: true });
        await actions.contextClick(el).perform();
        break;
      }

      case "type": {
        const locator = buildLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        const value = this.replaceCapturedVars(cmd.value || "");
        await el.clear();
        await el.sendKeys(value);
        logs.push(`    Typed: "${value}"`);
        break;
      }

      case "clear": {
        const locator = buildLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        await el.clear();
        break;
      }

      case "select": {
        // For ComboBox — click to open then select item
        const locator = buildLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        await el.click();
        await this.driver.sleep(500);
        // Find the list item
        const itemLocator = By.xpath(`//ListItem[@Name="${cmd.value}"]`);
        const item = await this.driver.wait(until.elementLocated(itemLocator), 5000);
        await item.click();
        logs.push(`    Selected: "${cmd.value}"`);
        break;
      }

      case "check": {
        const locator = buildLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        const checked = await el.getAttribute("Toggle.ToggleState");
        if (checked !== "1") await el.click();
        break;
      }

      case "uncheck": {
        const locator = buildLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        const checked = await el.getAttribute("Toggle.ToggleState");
        if (checked === "1") await el.click();
        break;
      }

      case "verify": {
        const locator = buildLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        if (cmd.value) {
          const text = await el.getText() || await el.getAttribute("Value.Value") || "";
          if (!text.includes(cmd.value)) {
            throw new Error(`Expected "${cmd.value}" but got "${text}"`);
          }
        }
        if (cmd.captureAs) {
          const text = await el.getText() || await el.getAttribute("Value.Value") || "";
          this.capturedVars.set(cmd.captureAs, text.trim());
          logs.push(`    Captured $${cmd.captureAs}$ = "${text.trim()}"`);
        }
        logs.push(`    ✓ Verified: ${cmd.description}`);
        break;
      }

      case "get_text": {
        const locator = buildLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        const text = await el.getText() || await el.getAttribute("Value.Value") || "";
        if (cmd.captureAs) {
          this.capturedVars.set(cmd.captureAs, text.trim());
          logs.push(`    Captured $${cmd.captureAs}$ = "${text.trim()}"`);
        }
        break;
      }

      case "press_key": {
        const keyMap: Record<string, string> = {
          Enter: Key.ENTER, Tab: Key.TAB, Escape: Key.ESCAPE,
          Delete: Key.DELETE, BackSpace: Key.BACK_SPACE,
          F1: Key.F1, F2: Key.F2, F3: Key.F3, F4: Key.F4,
          F5: Key.F5, F6: Key.F6, F7: Key.F7, F8: Key.F8,
          F9: Key.F9, F10: Key.F10, F11: Key.F11, F12: Key.F12,
        };
        const key = keyMap[cmd.key || "Enter"] || Key.ENTER;
        const active = await this.driver.switchTo().activeElement();
        await active.sendKeys(key);
        break;
      }

      case "wait": {
        if (cmd.automationId || cmd.name || cmd.className || cmd.xpath) {
          const locator = buildLocator(cmd);
          await this.driver.wait(until.elementLocated(locator), 30000);
        } else {
          await this.driver.sleep(parseInt(cmd.value || "2000"));
        }
        break;
      }

      case "close_dialog": {
        // Press Escape or click Cancel/Close
        try {
          const cancelBtn = await this.driver.findElement(
            By.xpath("//Button[@Name='Cancel' or @Name='Close' or @Name='No']")
          );
          await cancelBtn.click();
        } catch {
          const active = await this.driver.switchTo().activeElement();
          await active.sendKeys(Key.ESCAPE);
        }
        break;
      }

      case "maximize": {
        await this.driver.manage().window().maximize();
        break;
      }

      case "screenshot": {
        const shot = await this.driver.takeScreenshot();
        if (cmd.captureAs) this.capturedVars.set(cmd.captureAs, shot);
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
      if (this.driver) { await this.driver.quit(); this.driver = null; }
    } catch {}
  }
}

export const dotNetDesktopExecutor = new DotNetDesktopExecutor();
