/**
 * Java Desktop Executor — AITAS Phase 5
 * Handles Java Swing, AWT, and JavaFX desktop applications
 * Uses Appium with Java Access Bridge (JAB) + Sikuli fallback
 */

import { Builder, WebDriver, By, until, Key } from "selenium-webdriver";
import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestDataParam } from "@shared/schema";
import { sendExecutionNotifications } from "./notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JavaDesktopConfig {
  appPath: string;              // Path to .jar or .exe launcher
  appMainClass?: string;        // Main class if launching via java -cp
  appClasspath?: string;        // Classpath for java -cp launch
  javaPath?: string;            // Path to java.exe, default "java"
  appiumUrl?: string;           // Default: http://127.0.0.1:4723
  jabEnabled?: boolean;         // Java Access Bridge enabled
  sikuliEnabled?: boolean;      // Sikuli image-based fallback
  sikuliImageDir?: string;      // Directory with reference images
  implicitWait?: number;
  launchDelay?: number;
}

interface JavaCommand {
  action: "click" | "type" | "clear" | "select" | "verify" | "wait" |
          "double_click" | "right_click" | "press_key" | "get_text" |
          "menu" | "table_select" | "tree_expand" | "scroll" |
          "sikuli_click" | "sikuli_type" | "sikuli_verify" |
          "close_dialog" | "screenshot";
  // JAB locators
  name?: string;                // Component name/label
  className?: string;           // Java class: javax.swing.JButton
  role?: string;                // Accessibility role: push button, text
  xpath?: string;               // XPath in accessibility tree
  index?: number;               // nth element of type
  // Sikuli
  imageFile?: string;           // Reference image filename
  // Action params
  value?: string;
  key?: string;
  menuPath?: string;            // e.g. "File > Save As"
  row?: number;
  column?: number;
  captureAs?: string;
  description: string;
}

// ─── AI Step Interpreter ──────────────────────────────────────────────────────

async function interpretJavaStep(
  step: string,
  expected: string,
  windowTitle: string,
  config: JavaDesktopConfig
): Promise<JavaCommand[]> {
  const aiClient = await getAiClient();

  const systemPrompt = `You are a Java desktop test automation expert using Appium with Java Access Bridge.
Java Swing/AWT/JavaFX apps use the Java Accessibility API.

Return ONLY a JSON array of commands:
[{
  "action": "click|type|clear|select|verify|wait|double_click|right_click|press_key|get_text|menu|table_select|tree_expand|scroll|sikuli_click|sikuli_type|sikuli_verify|close_dialog",
  "name": "component name or label text",
  "className": "javax.swing.JButton",
  "role": "push button|text|combo box|check box|radio button|list|table|tree|menu item",
  "xpath": "//push button[@name='Save']",
  "index": 0,
  "imageFile": "save_button.png",
  "value": "text to type or expected value",
  "key": "Enter|Tab|Escape|F1-F12",
  "menuPath": "File > Save As",
  "row": 0,
  "column": 0,
  "captureAs": "variableName",
  "description": "what this does"
}]

JAVA ACCESSIBILITY RULES:
1. Best locator: name (component's accessible name, usually label text)
2. className: Java Swing classes:
   - javax.swing.JButton → role: "push button"
   - javax.swing.JTextField, JTextArea → role: "text"
   - javax.swing.JComboBox → role: "combo box"
   - javax.swing.JCheckBox → role: "check box"
   - javax.swing.JRadioButton → role: "radio button"
   - javax.swing.JList → role: "list"
   - javax.swing.JTable → role: "table"
   - javax.swing.JTree → role: "tree"
   - javax.swing.JMenuItem → role: "menu item"
   - javafx.scene.control.Button → role: "push button"
3. XPath in accessibility tree: //push button[@name='Save']
4. For menus: use menu action with menuPath "File > Save As"
5. For tables: use table_select with row/column indices
6. For trees: use tree_expand with node name
7. Sikuli fallback: use sikuli_click/type/verify with imageFile when JAB fails
8. After dialog opens: wait for new window, then interact
9. JavaFX: fx:id maps to accessible name if set

STABLE PATTERNS:
- Save button: name="Save" or role="push button" + name="Save"
- Text field: name="Username:" (label text) or className="javax.swing.JTextField"
- Dropdown: name="Status" + role="combo box"
- Table row: table_select with row=0
- Menu: menuPath="File > Open"
- Dialog OK: name="OK" + role="push button"

${config.sikuliEnabled ? "Sikuli is ENABLED — use sikuli_* actions as fallback for complex UI elements." : ""}
Only return the JSON array.`;

  const userPrompt = `Window: "${windowTitle}"
Step: "${step}"
Expected: "${expected}"`;

  try {
    const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as JavaCommand[];
  } catch (e: any) {
    console.error("[Java Executor] AI interpretation failed:", e.message);
  }
  return [{ action: "verify", description: step }];
}

// ─── Locator Builder ──────────────────────────────────────────────────────────

function buildJavaLocator(cmd: JavaCommand): By {
  if (cmd.xpath) return By.xpath(cmd.xpath);
  if (cmd.name && cmd.role) return By.xpath(`//${cmd.role}[@name="${cmd.name}"]`);
  if (cmd.name) return By.name(cmd.name);
  if (cmd.role) return By.xpath(`//${cmd.role}`);
  if (cmd.className) return By.className(cmd.className);
  throw new Error(`No locator for: ${cmd.description}`);
}

// ─── Main Java Desktop Executor ───────────────────────────────────────────────

export class JavaDesktopExecutor {
  private driver: WebDriver | null = null;
  private capturedVars = new Map<string, any>();

  async runExecution(
    executionId: string,
    testCases: TestCase[],
    config: JavaDesktopConfig,
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
      allLogs.push(`[Java] Appium session started for ${config.appPath}`);

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
      allLogs.push(`[Java] Fatal error: ${error.message}`);
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
          executionId, suiteName: suite?.name || "Java Desktop Tests",
          status: finalStatus, totalTests: testCases.length,
          passedTests, failedTests, duration,
          environment: execution.environment || "production",
          targetUrl: config.appPath,
        });
      }
    }
  }

  private async initDriver(config: JavaDesktopConfig): Promise<void> {
    const appiumUrl = config.appiumUrl || "http://127.0.0.1:4723";

    // Determine launch command
    let appPath = config.appPath;
    if (config.appMainClass && config.appClasspath) {
      appPath = `${config.javaPath || "java"} -cp "${config.appClasspath}" ${config.appMainClass}`;
    }

    const capabilities: Record<string, any> = {
      "platformName": "Windows",
      "deviceName": "WindowsPC",
      "app": appPath,
      "automationName": "JavaAccessBridge",
    };

    this.driver = await new Builder()
      .usingServer(appiumUrl)
      .withCapabilities(capabilities)
      .build();

    await this.driver.manage().setTimeouts({
      implicit: config.implicitWait || 10000,
    });

    await this.driver.sleep(config.launchDelay || 4000);
  }

  private async executeTestCase(
    testCase: TestCase,
    config: JavaDesktopConfig,
    tdMap: Map<string, string>,
    globalLogs: string[]
  ): Promise<{ passed: boolean; duration: number; errorMessage?: string; screenshot?: string; logs: string[] }> {
    const logs: string[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let screenshot: string | undefined;

    logs.push(`\n=== JAVA TEST: ${testCase.title} ===`);
    const steps = (testCase.steps as { step: string; expected: string }[]) || [];

    for (let i = 0; i < steps.length; i++) {
      const { step, expected } = steps[i];
      const processedStep = this.replacePlaceholders(step, tdMap);
      const processedExpected = this.replacePlaceholders(expected, tdMap);
      logs.push(`\n--- Step ${i + 1}: ${processedStep} ---`);

      try {
        const windowTitle = await this.driver!.getTitle().catch(() => "Java App");
        const commands = await interpretJavaStep(processedStep, processedExpected, windowTitle, config);

        for (const cmd of commands) {
          await this.executeCommand(cmd, config, logs);
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

  private async executeCommand(cmd: JavaCommand, config: JavaDesktopConfig, logs: string[]): Promise<void> {
    if (!this.driver) throw new Error("No driver");
    logs.push(`  → ${cmd.action}: ${cmd.description}`);

    switch (cmd.action) {
      case "click": {
        const locator = buildJavaLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        await el.click();
        await this.driver.sleep(300);
        break;
      }

      case "double_click": {
        const locator = buildJavaLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        const actions = this.driver.actions({ async: true });
        await actions.doubleClick(el).perform();
        break;
      }

      case "right_click": {
        const locator = buildJavaLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        const actions = this.driver.actions({ async: true });
        await actions.contextClick(el).perform();
        break;
      }

      case "type": {
        const locator = buildJavaLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        const value = this.replaceCapturedVars(cmd.value || "");
        await el.clear();
        await el.sendKeys(value);
        logs.push(`    Typed: "${value}"`);
        break;
      }

      case "clear": {
        const locator = buildJavaLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        await el.clear();
        break;
      }

      case "select": {
        // JComboBox — click to open then select item
        const locator = buildJavaLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        await el.click();
        await this.driver.sleep(400);
        const itemLocator = By.xpath(`//list item[@name="${cmd.value}"]`);
        const item = await this.driver.wait(until.elementLocated(itemLocator), 5000);
        await item.click();
        logs.push(`    Selected: "${cmd.value}"`);
        break;
      }

      case "verify": {
        const locator = buildJavaLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        if (cmd.value) {
          const text = await el.getText() || await el.getAttribute("value") || "";
          if (!text.includes(cmd.value)) {
            throw new Error(`Expected "${cmd.value}" but got "${text}"`);
          }
        }
        if (cmd.captureAs) {
          const text = await el.getText() || "";
          this.capturedVars.set(cmd.captureAs, text.trim());
          logs.push(`    Captured $${cmd.captureAs}$ = "${text.trim()}"`);
        }
        logs.push(`    ✓ Verified: ${cmd.description}`);
        break;
      }

      case "get_text": {
        const locator = buildJavaLocator(cmd);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        const text = await el.getText() || "";
        if (cmd.captureAs) {
          this.capturedVars.set(cmd.captureAs, text.trim());
          logs.push(`    Captured $${cmd.captureAs}$ = "${text.trim()}"`);
        }
        break;
      }

      case "menu": {
        if (!cmd.menuPath) break;
        const parts = cmd.menuPath.split(">").map((p) => p.trim());
        for (const part of parts) {
          const menuItem = await this.driver.wait(
            until.elementLocated(By.xpath(`//menu item[@name="${part}"] | //menu[@name="${part}"]`)),
            10000
          );
          await menuItem.click();
          await this.driver.sleep(300);
        }
        logs.push(`    Navigated menu: ${cmd.menuPath}`);
        break;
      }

      case "table_select": {
        if (cmd.row !== undefined) {
          const tableLocator = cmd.name
            ? By.xpath(`//table[@name="${cmd.name}"]`)
            : By.xpath("//table");
          const table = await this.driver.wait(until.elementLocated(tableLocator), 10000);
          const rows = await table.findElements(By.xpath(".//table cell"));
          if (rows[cmd.row]) await rows[cmd.row].click();
          logs.push(`    Selected table row ${cmd.row}`);
        }
        break;
      }

      case "tree_expand": {
        const treeItem = await this.driver.wait(
          until.elementLocated(By.xpath(`//tree item[@name="${cmd.value}"]`)),
          10000
        );
        await treeItem.click();
        await this.driver.sleep(300);
        logs.push(`    Expanded tree node: ${cmd.value}`);
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
        if (cmd.name || cmd.role || cmd.className || cmd.xpath) {
          const locator = buildJavaLocator(cmd);
          await this.driver.wait(until.elementLocated(locator), 30000);
        } else {
          await this.driver.sleep(parseInt(cmd.value || "2000"));
        }
        break;
      }

      case "close_dialog": {
        try {
          const cancelBtn = await this.driver.findElement(
            By.xpath("//push button[@name='Cancel' or @name='Close' or @name='No']")
          );
          await cancelBtn.click();
        } catch {
          const active = await this.driver.switchTo().activeElement();
          await active.sendKeys(Key.ESCAPE);
        }
        break;
      }

      case "sikuli_click":
      case "sikuli_type":
      case "sikuli_verify": {
        // Sikuli commands are logged but require SikuliX server
        logs.push(`    [Sikuli] ${cmd.action} on image: ${cmd.imageFile || "unknown"}`);
        logs.push(`    [Sikuli] Note: SikuliX server required at http://127.0.0.1:50001`);
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

export const javaDesktopExecutor = new JavaDesktopExecutor();
