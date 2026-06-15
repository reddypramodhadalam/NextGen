/**
 * Mobile Executor — AITAS Phase 4
 * Handles iOS (XCUITest) and Android (UIAutomator2) via Appium
 * Single executor handles both platforms with platform-specific strategies
 */

import { Builder, WebDriver, By, until, Key } from "selenium-webdriver";
import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestDataParam } from "@shared/schema";
import { sendExecutionNotifications } from "./notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MobilePlatform = "ios" | "android";

export interface MobileConfig {
  platform: MobilePlatform;
  appiumUrl?: string;           // Default: http://127.0.0.1:4723
  deviceName: string;           // e.g. "iPhone 14" or "Pixel 7"
  platformVersion: string;      // e.g. "17.0" or "13"
  // App config
  appPath?: string;             // Path to .ipa or .apk
  bundleId?: string;            // iOS bundle ID e.g. com.company.app
  appPackage?: string;          // Android package e.g. com.company.app
  appActivity?: string;         // Android activity e.g. .MainActivity
  // Options
  udid?: string;                // Real device UDID
  isRealDevice?: boolean;
  noReset?: boolean;            // Don't reset app state between sessions
  autoGrantPermissions?: boolean;
  orientation?: "PORTRAIT" | "LANDSCAPE";
  implicitWait?: number;
}

interface MobileCommand {
  action: "tap" | "type" | "clear" | "swipe" | "scroll" | "verify" |
          "wait" | "press_key" | "get_text" | "long_press" | "pinch" |
          "zoom" | "rotate" | "shake" | "screenshot" | "back" |
          "home" | "switch_context" | "accept_alert" | "dismiss_alert" |
          "scroll_to" | "drag_drop";
  // Locators
  accessibilityId?: string;     // Best: accessibility id
  resourceId?: string;          // Android: resource-id
  xpath?: string;               // XPath
  iosClassChain?: string;       // iOS class chain
  iosPredicate?: string;        // iOS predicate string
  text?: string;                // Find by text
  className?: string;           // Class name
  // Action params
  value?: string;
  direction?: "up" | "down" | "left" | "right";
  distance?: number;            // Swipe distance 0-1
  duration?: number;            // ms for long press / swipe
  startX?: number; startY?: number;
  endX?: number; endY?: number;
  context?: string;             // NATIVE_APP or WEBVIEW_xxx
  captureAs?: string;
  description: string;
}

// ─── AI Step Interpreter ──────────────────────────────────────────────────────

async function interpretMobileStep(
  step: string,
  expected: string,
  platform: MobilePlatform,
  screenContext: string
): Promise<MobileCommand[]> {
  const aiClient = await getAiClient();

  const isIOS = platform === "ios";

  const systemPrompt = `You are a mobile test automation expert using Appium for ${isIOS ? "iOS (XCUITest)" : "Android (UIAutomator2)"}.

Return ONLY a JSON array of commands:
[{
  "action": "tap|type|clear|swipe|scroll|verify|wait|press_key|get_text|long_press|back|home|accept_alert|dismiss_alert|scroll_to",
  ${isIOS ? `"accessibilityId": "loginButton",
  "iosClassChain": "**/XCUIElementTypeButton[\`label == 'Login'\`]",
  "iosPredicate": "type == 'XCUIElementTypeButton' AND label == 'Login'",` : `"accessibilityId": "loginButton",
  "resourceId": "com.app.package:id/loginButton",`}
  "xpath": "//XCUIElementTypeButton[@name='Login']",
  "text": "Login",
  "className": "${isIOS ? "XCUIElementTypeButton" : "android.widget.Button"}",
  "value": "text to type",
  "direction": "up|down|left|right",
  "distance": 0.5,
  "duration": 1000,
  "captureAs": "variableName",
  "description": "what this does"
}]

${isIOS ? `iOS RULES:
1. Best locator: accessibilityId (set via accessibilityIdentifier in Xcode)
2. iOS class chain: **/XCUIElementTypeButton[\`label == 'Login'\`]
3. iOS predicate: type == 'XCUIElementTypeButton' AND label == 'Login'
4. Element types: XCUIElementTypeButton, XCUIElementTypeTextField, XCUIElementTypeSecureTextField,
   XCUIElementTypeStaticText, XCUIElementTypeCell, XCUIElementTypeTable, XCUIElementTypeNavigationBar
5. Swipe: use direction + distance (0.0-1.0)
6. Keyboard: use press_key with key name (Return, Delete, etc.)
7. Alerts: use accept_alert or dismiss_alert
8. Tab bar: XCUIElementTypeTabBar > XCUIElementTypeButton[@name='Tab Name']` : `ANDROID RULES:
1. Best locator: resourceId (com.package:id/elementId)
2. Second: accessibilityId (content-desc attribute)
3. UIAutomator2: use xpath with android.widget.* class names
4. Element types: android.widget.Button, android.widget.EditText, android.widget.TextView,
   android.widget.CheckBox, android.widget.RadioButton, android.widget.Spinner, android.widget.ListView
5. Swipe: use direction + distance (0.0-1.0)
6. Back button: use back action
7. Permissions: auto-granted via capabilities
8. RecyclerView items: //android.widget.TextView[@text='Item Text']`}

COMMON PATTERNS:
- Login button: accessibilityId="loginButton" or text="Log In"
- Username field: accessibilityId="usernameField" or resourceId="com.app:id/username"
- Password field: accessibilityId="passwordField" or className="${isIOS ? "XCUIElementTypeSecureTextField" : "android.widget.EditText"}[@password='true']"
- Scroll down: swipe with direction="up" (swipe up = scroll down)
- Pull to refresh: swipe with direction="down" from top

Only return the JSON array.`;

  const userPrompt = `Platform: ${platform.toUpperCase()}
Screen: ${screenContext}
Step: "${step}"
Expected: "${expected}"`;

  try {
    const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as MobileCommand[];
  } catch (e: any) {
    console.error("[Mobile Executor] AI interpretation failed:", e.message);
  }
  return [{ action: "verify", description: step }];
}

// ─── Locator Builder ──────────────────────────────────────────────────────────

function buildMobileLocator(cmd: MobileCommand, platform: MobilePlatform): By {
  if (cmd.accessibilityId) return By.css(`[accessibility id="${cmd.accessibilityId}"]`);
  if (cmd.resourceId && platform === "android") return By.id(cmd.resourceId);
  if (cmd.xpath) return By.xpath(cmd.xpath);
  if (cmd.text) return By.xpath(`//*[@text="${cmd.text}" or @label="${cmd.text}" or @name="${cmd.text}"]`);
  if (cmd.className) return By.className(cmd.className);
  throw new Error(`No locator for: ${cmd.description}`);
}

// ─── Main Mobile Executor ─────────────────────────────────────────────────────

export class MobileExecutor {
  private driver: WebDriver | null = null;
  private capturedVars = new Map<string, any>();

  async runExecution(
    executionId: string,
    testCases: TestCase[],
    config: MobileConfig,
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
      allLogs.push(`[Mobile] Appium session started for ${config.platform} — ${config.deviceName}`);

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
      allLogs.push(`[Mobile] Fatal error: ${error.message}`);
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
          executionId,
          suiteName: suite?.name || `${config.platform === "ios" ? "iOS" : "Android"} Tests`,
          status: finalStatus, totalTests: testCases.length,
          passedTests, failedTests, duration,
          environment: execution.environment || "production",
          targetUrl: config.bundleId || config.appPackage || config.appPath || "mobile",
        });
      }
    }
  }

  private async initDriver(config: MobileConfig): Promise<void> {
    const appiumUrl = config.appiumUrl || "http://127.0.0.1:4723";
    const isIOS = config.platform === "ios";

    const capabilities: Record<string, any> = {
      "platformName": isIOS ? "iOS" : "Android",
      "deviceName": config.deviceName,
      "platformVersion": config.platformVersion,
      "automationName": isIOS ? "XCUITest" : "UIAutomator2",
      "noReset": config.noReset ?? false,
      "newCommandTimeout": 300,
    };

    if (config.appPath) capabilities["app"] = config.appPath;
    if (config.udid) capabilities["udid"] = config.udid;

    if (isIOS) {
      if (config.bundleId) capabilities["bundleId"] = config.bundleId;
      capabilities["wdaLocalPort"] = 8100;
      capabilities["useNewWDA"] = false;
    } else {
      if (config.appPackage) capabilities["appPackage"] = config.appPackage;
      if (config.appActivity) capabilities["appActivity"] = config.appActivity;
      capabilities["autoGrantPermissions"] = config.autoGrantPermissions ?? true;
      capabilities["skipDeviceInitialization"] = true;
    }

    if (config.orientation) capabilities["orientation"] = config.orientation;

    this.driver = await new Builder()
      .usingServer(appiumUrl)
      .withCapabilities(capabilities)
      .build();

    await this.driver.manage().setTimeouts({
      implicit: config.implicitWait || 10000,
    });
  }

  private async executeTestCase(
    testCase: TestCase,
    config: MobileConfig,
    tdMap: Map<string, string>,
    globalLogs: string[]
  ): Promise<{ passed: boolean; duration: number; errorMessage?: string; screenshot?: string; logs: string[] }> {
    const logs: string[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let screenshot: string | undefined;

    logs.push(`\n=== MOBILE TEST [${config.platform.toUpperCase()}]: ${testCase.title} ===`);
    const steps = (testCase.steps as { step: string; expected: string }[]) || [];

    for (let i = 0; i < steps.length; i++) {
      const { step, expected } = steps[i];
      const processedStep = this.replacePlaceholders(step, tdMap);
      const processedExpected = this.replacePlaceholders(expected, tdMap);
      logs.push(`\n--- Step ${i + 1}: ${processedStep} ---`);

      try {
        const pageSource = await this.driver!.getPageSource().catch(() => "").then((s) => s.substring(0, 200));
        const commands = await interpretMobileStep(processedStep, processedExpected, config.platform, pageSource);

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

  private async executeCommand(cmd: MobileCommand, config: MobileConfig, logs: string[]): Promise<void> {
    if (!this.driver) throw new Error("No driver");
    logs.push(`  → ${cmd.action}: ${cmd.description}`);

    switch (cmd.action) {
      case "tap": {
        const locator = buildMobileLocator(cmd, config.platform);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        await el.click();
        await this.driver.sleep(500);
        break;
      }

      case "type": {
        const locator = buildMobileLocator(cmd, config.platform);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        const value = this.replaceCapturedVars(cmd.value || "");
        await el.clear();
        await el.sendKeys(value);
        logs.push(`    Typed: "${value}"`);
        break;
      }

      case "clear": {
        const locator = buildMobileLocator(cmd, config.platform);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        await el.clear();
        break;
      }

      case "verify": {
        const locator = buildMobileLocator(cmd, config.platform);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        if (cmd.value) {
          const text = await el.getText() || await el.getAttribute("label") || await el.getAttribute("value") || "";
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
        const locator = buildMobileLocator(cmd, config.platform);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        const text = await el.getText() || "";
        if (cmd.captureAs) {
          this.capturedVars.set(cmd.captureAs, text.trim());
          logs.push(`    Captured $${cmd.captureAs}$ = "${text.trim()}"`);
        }
        break;
      }

      case "swipe": {
        const { direction = "up", distance = 0.5 } = cmd;
        const size = await this.driver.manage().window().getSize();
        const w = size.width;
        const h = size.height;

        let startX = w / 2, startY = h / 2, endX = w / 2, endY = h / 2;
        const swipeDist = distance * (direction === "up" || direction === "down" ? h : w);

        if (direction === "up") { startY = h * 0.7; endY = h * 0.7 - swipeDist; }
        else if (direction === "down") { startY = h * 0.3; endY = h * 0.3 + swipeDist; }
        else if (direction === "left") { startX = w * 0.8; endX = w * 0.8 - swipeDist; }
        else if (direction === "right") { startX = w * 0.2; endX = w * 0.2 + swipeDist; }

        await this.driver.executeScript("mobile: swipe", {
          direction, startX, startY, endX, endY,
          duration: cmd.duration || 800,
        });
        await this.driver.sleep(500);
        break;
      }

      case "scroll": {
        await this.driver.executeScript("mobile: scroll", {
          direction: cmd.direction || "down",
          distance: cmd.distance || 0.5,
        });
        break;
      }

      case "scroll_to": {
        if (cmd.text) {
          if (config.platform === "android") {
            await this.driver.executeScript(
              `new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().text("${cmd.text}"))`
            );
          } else {
            // iOS: swipe until element found
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                const el = await this.driver.findElement(By.xpath(`//*[@label="${cmd.text}" or @name="${cmd.text}"]`));
                if (el) break;
              } catch {
                await this.driver.executeScript("mobile: swipe", { direction: "up" });
                await this.driver.sleep(500);
              }
            }
          }
        }
        break;
      }

      case "long_press": {
        const locator = buildMobileLocator(cmd, config.platform);
        const el = await this.driver.wait(until.elementLocated(locator), 15000);
        await this.driver.executeScript("mobile: longClick", {
          element: el,
          duration: cmd.duration || 2000,
        });
        break;
      }

      case "press_key": {
        if (config.platform === "android") {
          const keyCodeMap: Record<string, number> = {
            Back: 4, Home: 3, Enter: 66, Delete: 67, Tab: 61,
          };
          const keyCode = keyCodeMap[cmd.value || "Back"] || 4;
          await this.driver.executeScript("mobile: pressKey", { keycode: keyCode });
        } else {
          const active = await this.driver.switchTo().activeElement();
          await active.sendKeys(cmd.value === "Return" ? Key.ENTER : Key.BACK_SPACE);
        }
        break;
      }

      case "back": {
        if (config.platform === "android") {
          await this.driver.executeScript("mobile: pressKey", { keycode: 4 });
        } else {
          // iOS: tap Back button in navigation bar
          try {
            const backBtn = await this.driver.findElement(
              By.xpath("//XCUIElementTypeNavigationBar//XCUIElementTypeButton[1]")
            );
            await backBtn.click();
          } catch {
            await this.driver.executeScript("mobile: pressButton", { name: "back" });
          }
        }
        break;
      }

      case "home": {
        if (config.platform === "android") {
          await this.driver.executeScript("mobile: pressKey", { keycode: 3 });
        } else {
          await this.driver.executeScript("mobile: pressButton", { name: "home" });
        }
        break;
      }

      case "accept_alert": {
        try {
          const alert = await this.driver.switchTo().alert();
          await alert.accept();
        } catch {
          // Try native alert button
          const okBtn = await this.driver.findElement(
            By.xpath("//XCUIElementTypeButton[@name='OK' or @name='Allow' or @name='Continue']")
          );
          await okBtn.click();
        }
        break;
      }

      case "dismiss_alert": {
        try {
          const alert = await this.driver.switchTo().alert();
          await alert.dismiss();
        } catch {
          const cancelBtn = await this.driver.findElement(
            By.xpath("//XCUIElementTypeButton[@name='Cancel' or @name='Deny' or @name='Don\\'t Allow']")
          );
          await cancelBtn.click();
        }
        break;
      }

      case "switch_context": {
        const contexts = await this.driver.executeScript("mobile: getContexts") as string[];
        const target = cmd.context || "NATIVE_APP";
        const ctx = contexts.find((c) => c.includes(target)) || target;
        await this.driver.executeScript(`mobile: setContext`, { name: ctx });
        logs.push(`    Switched to context: ${ctx}`);
        break;
      }

      case "wait": {
        if (cmd.accessibilityId || cmd.resourceId || cmd.xpath || cmd.text || cmd.className) {
          const locator = buildMobileLocator(cmd, config.platform);
          await this.driver.wait(until.elementLocated(locator), 30000);
        } else {
          await this.driver.sleep(parseInt(cmd.value || "2000"));
        }
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

export const mobileExecutor = new MobileExecutor();
