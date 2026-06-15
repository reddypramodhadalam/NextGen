import { Builder, WebDriver, By, until, Key, WebElement } from "selenium-webdriver";
import { Options as ChromeOptions } from "selenium-webdriver/chrome";
import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestDataParam, TestResult } from "@shared/schema";
import { storeTestResult } from "./reportAnalytics";

// Extend the imported types to ensure logs is compatible
type ExtendedTestResult = Omit<TestResult, 'logs'> & { logs: string[] | null };

// ============================================================================
// TYPES
// ============================================================================

interface PageSnapshot {
  url: string;
  title: string;
  elements: ElementInfo[];
  iframes: IframeInfo[];
  alerts: boolean;
  windowHandles: string[];
  currentWindow: string;
}

interface ElementInfo {
  tag: string;
  type?: string;
  id?: string;
  name?: string;
  className?: string;
  text?: string;
  placeholder?: string;
  ariaLabel?: string;
  value?: string;
  href?: string;
  isVisible: boolean;
  isEnabled: boolean;
  role?: string;
  forAttr?: string; // for labels
  xpath: string;
}

interface IframeInfo {
  id?: string;
  name?: string;
  src?: string;
  index: number;
}

interface AIExecutionPlan {
  action: {
    type: ActionType;
    elementXPath?: string;
    value?: string;
    targetXPath?: string; // for drag-drop
    key?: string; // for keyboard
    iframeName?: string; // for iframe switching
    windowIndex?: number; // for window switching
    alertAction?: "accept" | "dismiss" | "getText" | "sendKeys";
    description: string;
  };
  verification?: {
    type: VerificationType;
    elementXPath?: string;
    expectedValue?: string;
    description: string;
  };
  confidence: number;
  reasoning: string;
}

type ActionType = 
  | "navigate" | "click" | "doubleClick" | "rightClick" | "type" | "clear"
  | "select" | "checkbox" | "radio" | "hover" | "scroll" | "dragDrop"
  | "pressKey" | "focus" | "blur"
  | "switchToIframe" | "switchToDefaultContent" | "switchToParentFrame"
  | "switchToWindow" | "switchToNewWindow" | "closeWindow"
  | "acceptAlert" | "dismissAlert" | "getAlertText" | "sendAlertText"
  | "wait" | "waitForElement" | "waitForText"
  | "screenshot" | "refresh" | "back" | "forward"
  | "executeScript";

type VerificationType =
  | "elementExists" | "elementVisible" | "elementEnabled" | "elementSelected"
  | "textEquals" | "textContains" | "textVisible" | "valueEquals" | "valueContains"
  | "attributeEquals" | "attributeContains"
  | "urlEquals" | "urlContains" | "titleEquals" | "titleContains"
  | "alertPresent" | "elementCount";

interface StepResult {
  passed: boolean;
  logs: string[];
  screenshot?: string;
  error?: string;
}

interface ExecutionContext {
  driver: WebDriver;
  logs: string[];
  variables: Map<string, string>;
  testData: Map<string, string>;
  currentIframe: string | null;
  startTime: number;
}

// ============================================================================
// AI-POWERED TEST EXECUTOR CLASS
// ============================================================================

export class AITestExecutor {
  private driver: WebDriver | null = null;
  private playwrightBrowser: any = null;
  private executionId: string = "";
  private isRunning: boolean = false;
  private shouldStop: boolean = false;

  // ============================================================================
  // MAIN EXECUTION ENTRY POINT
  // ============================================================================

  async runExecution(
    executionId: string,
    testCases: TestCase[],
    targetUrl: string,
    framework: string,
    testData?: TestDataParam[],
    selfHealing: boolean = true,
    maxRetries: number = 3,
    agentCapabilities?: string[]
  ): Promise<void> {
    this.executionId = executionId;
    this.isRunning = true;
    this.shouldStop = false;

    const startTime = Date.now();
    console.log(`[AIExecutor] ▶ STARTING EXECUTION: ${executionId}`);
    console.log(`[AIExecutor] Framework: ${framework} (Selenium primary, Playwright backup)`);
    console.log(`[AIExecutor] Self-healing: ${selfHealing}, Max retries: ${maxRetries}`);

    // Update execution status
    await storage.updateExecution(executionId, {
      status: "running",
      startedAt: new Date(),
    });

    let passedTests = 0;
    let failedTests = 0;
    const allLogs: string[] = [];

        // Build test data map
    const testDataMap = new Map<string, string>();
    if (testData) {
      console.log(`\n[AIExecutor] 📊 ═══════════════════════════════════════════════════════════`);
      console.log(`[AIExecutor] 📊 LOADING TEST DATA (${testData.length} parameters)`);
      console.log(`[AIExecutor] 📊 ═══════════════════════════════════════════════════════════`);
      for (const td of testData) {
        testDataMap.set(td.key, td.value);
        testDataMap.set(td.key.toLowerCase(), td.value);
        // Display with masking for passwords
        const displayValue = td.key.toLowerCase().includes("pass") || td.key.toLowerCase().includes("pwd") 
          ? `[MASKED-${td.value.length}chars]` 
          : td.value;
        const typeLabel = td.type ? ` (${td.type})` : "";
        console.log(`[AIExecutor] 📊   ✓ ${td.key}${typeLabel} = "${displayValue}"`);
        allLogs.push(`[TestData] ${td.key} = "${displayValue}"`);
      }
      console.log(`[AIExecutor] 📊 ═══════════════════════════════════════════════════════════\n`);
    } else {
      console.log(`[AIExecutor] ℹ️  No test data provided for this execution\n`);
      allLogs.push(`[TestData] No test data provided`);
    }

    try {
      // Initialize browser (Selenium primary)
      const browserInitialized = await this.initializeBrowser(framework);
      if (!browserInitialized) {
        throw new Error("Failed to initialize browser");
      }

      allLogs.push(`[${framework.toUpperCase()}] Browser initialized successfully`);
      allLogs.push(`Target URL: ${targetUrl}`);

      // Execute each test case
      for (const testCase of testCases) {
        if (this.shouldStop) {
          allLogs.push("Execution stopped by user");
          break;
        }

        const result = await this.executeTestCase(
          testCase,
          targetUrl,
          testDataMap,
          selfHealing,
          maxRetries
        );

        // Save result with performance metrics
        await storage.createResult({
          executionId,
          testCaseId: testCase.id,
          status: result.passed ? "passed" : "failed",
          duration: Date.now() - startTime,
          errorMessage: result.error || null,
          logs: result.logs,
          screenshot: result.screenshot || null,
          stepScreenshots: result.stepScreenshots || null,
          performanceMetrics: result.performanceMetrics || null,
          networkLogs: result.networkLogs || null,
        });
        
        storeTestResult(testCase.title, result.passed, result.error || "");

        if (result.passed) {
          passedTests++;
          console.log(`[AIExecutor] ✓ PASSED: ${testCase.title}`);
        } else {
          failedTests++;
          console.log(`[AIExecutor] ✗ FAILED: ${testCase.title}`);
        }

        allLogs.push(...result.logs);
      }

    } catch (error: any) {
      console.error(`[AIExecutor] Fatal error:`, error);
      allLogs.push(`Fatal error: ${error.message}`);
      failedTests = testCases.length - passedTests;
    } finally {
      // Cleanup
      await this.cleanup();

      // Update execution status
      const duration = Date.now() - startTime;
      await storage.updateExecution(executionId, {
        status: failedTests > 0 ? "failed" : "passed",
        completedAt: new Date(),
        passedTests,
        failedTests,
      });

      console.log(`[AIExecutor] 🏁 EXECUTION COMPLETE: ${failedTests > 0 ? "FAILED" : "PASSED"} (${passedTests} passed, ${failedTests} failed) in ${Math.round(duration / 1000)}s`);
      this.isRunning = false;
    }
  }

  // ============================================================================
  // BROWSER INITIALIZATION
  // ============================================================================

  private async initializeBrowser(framework: string): Promise<boolean> {
    // Try Selenium first (primary)
    try {
      console.log("[AIExecutor] Initializing Selenium Chrome...");
      const options = new ChromeOptions();
      options.addArguments(
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--start-maximized",
        "--disable-extensions",
        "--disable-popup-blocking",
        "--disable-notifications",
        "--disable-background-networking",  // Suppresses GCM/push notification errors
        "--disable-sync",                   // Disables Chrome sync
        "--disable-translate",              // Disables translation popups
        "--disable-features=Translate",     // Another way to disable translate
        "--log-level=3"                     // Suppress most Chrome logs (0=INFO, 1=WARNING, 2=ERROR, 3=FATAL)
      );
      options.excludeSwitches("enable-automation", "enable-logging");  // Suppress DevTools logging

      this.driver = await new Builder()
        .forBrowser("chrome")
        .setChromeOptions(options)
        .build();

      // Set timeouts (120 seconds for slow-loading applications)
      await this.driver.manage().setTimeouts({
        implicit: 10000,
        pageLoad: 120000,
        script: 120000,
      });

      console.log("[AIExecutor] Selenium Chrome initialized successfully");
      return true;
    } catch (error: any) {
      console.error("[AIExecutor] Selenium initialization failed:", error.message);
      
      // Try Playwright as backup
      if (framework === "playwright" || true) { // Always try as backup
        try {
          console.log("[AIExecutor] Trying Playwright as backup...");
          const { chromium } = await import("playwright");
          this.playwrightBrowser = await chromium.launch({ headless: false });
          console.log("[AIExecutor] Playwright initialized as backup");
          return true;
        } catch (pwError: any) {
          console.error("[AIExecutor] Playwright backup also failed:", pwError.message);
        }
      }
      
      return false;
    }
  }

  // ============================================================================
  // TEST CASE EXECUTION
  // ============================================================================

  private async executeTestCase(
    testCase: TestCase,
    targetUrl: string,
    testDataMap: Map<string, string>,
    selfHealing: boolean,
    maxRetries: number
  ): Promise<{ 
    passed: boolean; 
    logs: string[]; 
    error?: string; 
    screenshot?: string; 
    stepScreenshots?: any[];
    performanceMetrics?: any;
    networkLogs?: any[];
  }> {
    const logs: string[] = [];
    const stepScreenshots: any[] = [];
    let passed = true;
    let lastError: string | undefined;
    const networkLogs: any[] = [];

    logs.push(`\n=== TEST CASE: ${testCase.title} ===`);
    logs.push(`Target URL: ${targetUrl}`);

    // Navigate to target URL first
    try {
      if (this.driver) {
        await this.driver.get(targetUrl);
        // Dynamic wait for page to be fully loaded
        await this.waitForPageLoad();
      }
      logs.push(`Navigated to: ${targetUrl}`);
    } catch (error: any) {
      logs.push(`Failed to navigate: ${error.message}`);
      return { passed: false, logs, error: error.message };
    }

    // Get steps from test case
    const steps = (testCase.steps as { step: string; expected: string }[]) || [];

    // Execute each step
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      if (this.shouldStop) {
        logs.push("Execution stopped by user");
        break;
      }

      const stepDef = steps[stepIndex];
      const stepNum = stepIndex + 1;

      // Replace test data placeholders
      const stepAction = this.replacePlaceholders(stepDef.step, testDataMap);
      const expected = this.replacePlaceholders(stepDef.expected, testDataMap);

      logs.push(`\n--- Step ${stepNum}: ${stepAction} ---`);
      logs.push(`Expected: ${expected}`);

      let stepPassed = false;
      let attempts = 0;
      let stepError: string | undefined;

      // Retry loop with self-healing
      while (!stepPassed && attempts < (selfHealing ? maxRetries : 1)) {
        attempts++;
        if (attempts > 1) {
          logs.push(`[Self-Healing] Retry attempt ${attempts}/${maxRetries}`);
        }

        try {
          const result = await this.executeStep(stepAction, expected, logs, testDataMap);
          stepPassed = result.passed;
          stepError = result.error;
          console.log(`[AIExecutor] Step ${stepNum} result: passed=${stepPassed}, error=${stepError}`);

          if (!stepPassed && selfHealing && attempts < maxRetries) {
            logs.push(`[Self-Healing] Step failed, will retry with fresh page analysis...`);
            await this.driver?.sleep(1000);
          }
        } catch (error: any) {
          stepError = error.message;
          stepPassed = false;
          logs.push(`Step error: ${error.message}`);
          console.log(`[AIExecutor] Step ${stepNum} exception: ${error.message}`);
        }
      }

      // Capture screenshot after step
      try {
        const screenshot = await this.captureScreenshot();
        const screenshotStatus = stepPassed ? "passed" : "failed";
        console.log(`[AIExecutor] Step ${stepNum} screenshot status: ${screenshotStatus}`);
        stepScreenshots.push({
          stepNumber: stepNum,
          action: stepAction,
          status: screenshotStatus,
          screenshot,
        });
      } catch (screenshotError: any) {
        console.log(`[AIExecutor] Screenshot capture failed: ${screenshotError.message}`);
      }

      if (stepPassed) {
        logs.push(`Step ${stepNum} [✓ PASS]`);
      } else {
        logs.push(`Step ${stepNum} [✗ FAIL]: ${stepError}`);
        passed = false;
        lastError = `Step ${stepNum} failed: ${stepError}`;
        break; // Stop on first failure
      }
    }

    // Final screenshot
    let finalScreenshot: string | undefined;
    try {
      finalScreenshot = await this.captureScreenshot();
    } catch { }

    // Collect performance metrics
    let performanceMetrics: any = null;
    try {
      performanceMetrics = await this.collectPerformanceMetrics();
      logs.push(`\n--- Performance Metrics ---`);
      logs.push(`Page Load Time: ${performanceMetrics.pageLoadTime}ms`);
      logs.push(`DOM Content Loaded: ${performanceMetrics.domContentLoaded}ms`);
      logs.push(`First Paint: ${performanceMetrics.firstPaint}ms`);
      logs.push(`First Contentful Paint: ${performanceMetrics.firstContentfulPaint}ms`);
      if (performanceMetrics.memoryUsed) {
        logs.push(`Memory Used: ${Math.round(performanceMetrics.memoryUsed / 1024 / 1024)}MB`);
      }
    } catch (error: any) {
      logs.push(`Performance metrics collection failed: ${error.message}`);
    }

    return {
      passed,
      logs,
      error: lastError,
      screenshot: finalScreenshot,
      stepScreenshots,
      performanceMetrics,
      networkLogs,
    };
  }

  // ============================================================================
  // AI-POWERED STEP EXECUTION
  // ============================================================================

  private async executeStep(
    stepAction: string,
    expected: string,
    logs: string[],
    testDataMap: Map<string, string>
  ): Promise<{ passed: boolean; error?: string }> {
    try {
            // 1. Get page snapshot
      const snapshot = await this.getPageSnapshot();
      logs.push(`Page: ${snapshot.title} (${snapshot.url})`);
      logs.push(`Found ${snapshot.elements.length} interactive elements`);

            // 1b. Pre-resolve credential values from testDataMap before sending to AI
      const resolvedStepAction = this.resolveCredentialStep(stepAction, testDataMap, snapshot, logs);

      // 1c. Handle combined "type X into field1 AND type Y into field2" steps directly
      // This handles the case where resolveCredentialStep produces a combined step
      const combinedMatch = resolvedStepAction.match(
        /Type\s+"([^"]+)"\s+into\s+the\s+username\s+field\s+at\s+xpath:\s*(\S+)\s+and\s+type\s+"([^"]+)"\s+into\s+the\s+password\s+field\s+at\s+xpath:\s*(\S+)/i
      );
      if (combinedMatch) {
        const [, uVal, uXpath, pVal, pXpath] = combinedMatch;
        logs.push(`[combined] Executing username+password in one step`);
        // Type username
        try {
          const uEl = await this.findElement(uXpath, 10000);
          await this.scrollIntoView(uEl);
          await this.typeIntoElement(uEl, uVal, logs);
          logs.push(`[combined] Typed username into ${uXpath}`);
        } catch (e: any) {
          logs.push(`[combined] Username field error: ${e.message}`);
        }
        // Type password
        try {
          const pEl = await this.findElement(pXpath, 10000);
          await this.scrollIntoView(pEl);
          await this.typeIntoElement(pEl, pVal, logs);
          logs.push(`[combined] Typed password into ${pXpath}`);
        } catch (e: any) {
          logs.push(`[combined] Password field error: ${e.message}`);
        }
        return { passed: true };
      }

      // 2. Ask AI to create execution plan
            const plan = await this.getAIExecutionPlan(resolvedStepAction, expected, snapshot, testDataMap);

      logs.push(`AI Plan: ${plan.action.description} (confidence: ${plan.confidence}%)`);
      logs.push(`AI Reasoning: ${plan.reasoning}`);

      // 3. Execute the action
      const actionResult = await this.executeAction(plan.action, logs);
      if (!actionResult.success) {
        return { passed: false, error: actionResult.error };
      }

      // 4. Execute verification if present, else add a default verification
      let verification = plan.verification;
      if (!verification) {
        // Add sensible default verification based on action type
        if (plan.action.type === "select" && plan.action.value) {
          verification = {
            type: "valueEquals",
            elementXPath: plan.action.elementXPath,
            expectedValue: plan.action.value,
            description: `Verify selected value is ${plan.action.value}`
          };
        } else if (plan.action.type === "type" && plan.action.value) {
          verification = {
            type: "valueEquals",
            elementXPath: plan.action.elementXPath,
            expectedValue: plan.action.value,
            description: `Verify input value is ${plan.action.value}`
          };
        } else if (plan.action.type === "click" && plan.action.elementXPath) {
          // For click, try to verify element is enabled/visible (or add custom logic as needed)
          verification = {
            type: "elementVisible",
            elementXPath: plan.action.elementXPath,
            description: `Verify element is visible after click`
          };
        }
      }
      if (verification) {
        logs.push(`Verifying: ${verification.description}`);
        const verifyResult = await this.executeVerification(verification, logs);
        if (!verifyResult.success) {
          return { passed: false, error: verifyResult.error };
        }
      }

      return { passed: true };
    } catch (error: any) {
      return { passed: false, error: error.message };
    }
  }

  // ============================================================================
  // PAGE SNAPSHOT (For AI Analysis)
  // ============================================================================

  private async getPageSnapshot(): Promise<PageSnapshot> {
    if (!this.driver) {
      throw new Error("No browser driver available");
    }

    const snapshot: PageSnapshot = {
      url: await this.driver.getCurrentUrl(),
      title: await this.driver.getTitle(),
      elements: [],
      iframes: [],
      alerts: false,
      windowHandles: await this.driver.getAllWindowHandles(),
      currentWindow: await this.driver.getWindowHandle(),
    };

    // Check for alerts
    try {
      await this.driver.switchTo().alert();
      snapshot.alerts = true;
      await this.driver.switchTo().defaultContent();
    } catch {
      snapshot.alerts = false;
    }

    // Get interactive elements using JavaScript for better performance
    const elementsScript = `
      const elements = [];
      const interactiveSelectors = [
        'input', 'button', 'a', 'select', 'textarea', 
        '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
        '[role="menuitem"]', '[role="tab"]', '[role="option"]', '[role="combobox"]',
        '[onclick]', '[ng-click]', '[data-action]', 'label'
      ];
      
      function getXPath(element) {
        if (element.id) return '//*[@id="' + element.id + '"]';
        if (element === document.body) return '/html/body';
        
        let ix = 0;
        const siblings = element.parentNode ? element.parentNode.childNodes : [];
        for (let i = 0; i < siblings.length; i++) {
          const sibling = siblings[i];
          if (sibling === element) {
            const parentPath = element.parentNode ? getXPath(element.parentNode) : '';
            return parentPath + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
          }
          if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
          }
        }
        return '';
      }
      
      const seen = new Set();
      for (const selector of interactiveSelectors) {
        for (const el of document.querySelectorAll(selector)) {
          const xpath = getXPath(el);
          if (seen.has(xpath)) continue;
          seen.add(xpath);
          
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 && 
                           window.getComputedStyle(el).visibility !== 'hidden' &&
                           window.getComputedStyle(el).display !== 'none';
          
          elements.push({
            tag: el.tagName.toLowerCase(),
            type: el.type || null,
            id: el.id || null,
            name: el.name || null,
            className: el.className || null,
            text: (el.innerText || el.textContent || '').trim().substring(0, 100),
            placeholder: el.placeholder || null,
            ariaLabel: el.getAttribute('aria-label') || null,
            value: el.value || null,
            href: el.href || null,
            isVisible: isVisible,
            isEnabled: !el.disabled,
            role: el.getAttribute('role') || null,
            forAttr: el.getAttribute('for') || null,
            xpath: xpath
          });
        }
      }
      return elements.slice(0, 200); // Limit to 200 elements
    `;

    try {
      snapshot.elements = await this.driver.executeScript(elementsScript) as ElementInfo[];
    } catch (error: any) {
      console.error("[AIExecutor] Failed to get elements:", error.message);
      snapshot.elements = [];
    }

    // Get iframes
    const iframesScript = `
      return Array.from(document.querySelectorAll('iframe')).map((iframe, index) => ({
        id: iframe.id || null,
        name: iframe.name || null,
        src: iframe.src || null,
        index: index
      }));
    `;

    try {
      snapshot.iframes = await this.driver.executeScript(iframesScript) as IframeInfo[];
    } catch {
      snapshot.iframes = [];
    }

    return snapshot;
  }

  // ============================================================================
  // AI EXECUTION PLAN GENERATION
  // ============================================================================

    private async getAIExecutionPlan(
    stepAction: string,
    expected: string,
    snapshot: PageSnapshot,
    testDataMap?: Map<string, string>
  ): Promise<AIExecutionPlan> {
    const aiClient = await getAiClient();

    // Build a concise element summary for AI
    const elementSummary = snapshot.elements
      .filter(el => el.isVisible)
      .slice(0, 100) // Limit for token efficiency
      .map(el => {
        const parts = [];
        parts.push(`<${el.tag}`);
        if (el.type) parts.push(`type="${el.type}"`);
        if (el.id) parts.push(`id="${el.id}"`);
        if (el.name) parts.push(`name="${el.name}"`);
        if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
        if (el.ariaLabel) parts.push(`aria-label="${el.ariaLabel}"`);
        if (el.role) parts.push(`role="${el.role}"`);
        if (el.forAttr) parts.push(`for="${el.forAttr}"`);
        if (el.text) parts.push(`text="${el.text.substring(0, 50)}"`);
        parts.push(`xpath="${el.xpath}"`);
        return parts.join(' ') + '>';
      })
      .join('\n');

    const systemPrompt = `You are a test automation expert. Analyze the page and create an execution plan for the test step.

AVAILABLE ACTIONS:
- navigate: Go to URL (value = url)
- click: Click element (for buttons, links, etc. - NOT for typing into fields)
- doubleClick: Double-click element
- rightClick: Right-click element
- type: Type text into input/textarea (elementXPath = input field, value = text to type). This automatically clicks/focuses the field first.
- clear: Clear input field
- select: Select dropdown option (value = option text)
- checkbox: Toggle checkbox (value = "check" or "uncheck")
- radio: Select radio button
- hover: Hover over element
- scroll: Scroll (value = "up", "down", "top", "bottom", or element xpath)
- dragDrop: Drag and drop (targetXPath = drop target)
- pressKey: Press keyboard key (key = "Enter", "Tab", "Escape", etc.)
- focus: Focus element
- switchToIframe: Switch to iframe (iframeName = name/id/index)
- switchToDefaultContent: Switch back to main page
- switchToParentFrame: Switch to parent frame
- switchToWindow: Switch window (windowIndex = 0 for main, 1 for first popup, etc.)
- switchToNewWindow: Wait for and switch to new popup
- closeWindow: Close current window
- acceptAlert: Accept alert/confirm dialog
- dismissAlert: Dismiss alert/confirm dialog
- getAlertText: Get alert text
- sendAlertText: Type into prompt dialog (value = text)
- wait: Wait milliseconds (value = milliseconds)
- waitForElement: Wait for element to appear
- waitForText: Wait for text to appear (value = text)
- refresh: Refresh page
- back: Go back
- forward: Go forward

VERIFICATION TYPES:
- elementExists: Element is in DOM
- elementVisible: Element is visible
- elementEnabled: Element is enabled
- elementSelected: Checkbox/radio is selected
- textEquals: Element text equals value
- textContains: Element text contains value
- textVisible: Element text is visible
- valueEquals: Input value equals
- valueContains: Input value contains
- urlEquals: Current URL equals
- urlContains: Current URL contains
- titleEquals: Page title equals
- titleContains: Page title contains
- alertPresent: Alert dialog is present

CRITICAL RULES:
1. Use the EXACT xpath from the page elements when possible — prefer id-based xpaths like //*[@id='username']
2. For labels with "for" attribute, use the input with matching id
3. For dropdowns, identify if native <select> or custom dropdown
4. For checkboxes/radios, find the actual input element, not just the label
5. If element not found in list, provide a robust xpath: //input[@type='text'][1] or //input[@name='username']
6. Consider iframes - if element might be in iframe, switch first
7. Handle alerts if present before other actions
8. For "type/enter/input X into Y" steps: action type MUST be "type", value MUST be X, elementXPath MUST be the input field
9. ONE action per step
10. ALWAYS set action.value to the ACTUAL string to type — never leave it empty for type actions
11. If AVAILABLE TEST DATA contains username/password/email, use those EXACT values in action.value
12. For a step like 'Type "admin@test.com" into the username input field at xpath: //input[@id="user"]':
    - action.type = "type"
    - action.elementXPath = "//input[@id='user']"
    - action.value = "admin@test.com"
13. For password steps, action.value MUST be the actual password string from test data
14. NEVER use placeholder text like "[PASSWORD]" or "{{password}}" as action.value — use the real value
15. IF YOU SEE MULTIPLE ACTIONS NEEDED (e.g., click button that opens new form):
    - ONLY return ONE action
    - If clicking a button will open a new window/form, return TWO actions as an array OR generate 2 separate execution plans
    - Example: If "Click Get Started" opens new window, verify that needs switchToNewWindow AFTER
    - Current limitation: ONE action per response, so if new window opens, just click and let next step verify in new window

Return ONLY valid JSON in this format:
{
  "action": {
    "type": "ACTION_TYPE",
    "elementXPath": "//*[@id='example']",
    "value": "optional value",
    "description": "Brief description"
  },
  "verification": {
    "type": "VERIFICATION_TYPE",
    "elementXPath": "//*[@id='example']",
    "expectedValue": "expected value",
    "description": "Brief description"
  },
  "confidence": 85,
  "reasoning": "Why this plan was chosen"
}`;

        // Build test data context for AI — pass ACTUAL values (not masked) so AI can use them
        let testDataContext = "";
        if (testDataMap && testDataMap.size > 0) {
          const entries: string[] = [];
          testDataMap.forEach((value, key) => {
            // Skip internal keys
            if (key.startsWith("__")) return;
            entries.push(`  ${key} = "${value}"`);
          });
          if (entries.length > 0) {
            testDataContext = `\n\nAVAILABLE TEST DATA — use these EXACT values when the step requires typing into fields:\n${entries.join("\n")}`;
          }
        }

    const userPrompt = `PAGE STATE:
URL: ${snapshot.url}
Title: ${snapshot.title}
Has Alert: ${snapshot.alerts}
Windows: ${snapshot.windowHandles.length}
IFrames: ${snapshot.iframes.map(f => f.name || f.id || `index:${f.index}`).join(', ') || 'none'}

INTERACTIVE ELEMENTS:
${elementSummary}${testDataContext}

STEP TO EXECUTE: "${stepAction}"
EXPECTED RESULT: "${expected}"

IMPORTANT: 
- If the step says "enter username" or "enter credentials" and you have test data with key "username", use that value in action.value.
- If the step says "enter password" and you have test data with key "password", use that value in action.value.
- Always put the ACTUAL VALUE to type in action.value for type actions, not a placeholder.
- Create the verification based on the EXPECTED RESULT above, not assumptions about what might appear.
Analyze and return the execution plan as JSON.`;

    try {
      console.log("[AIExecutor] Sending step to AI:", stepAction);
      console.log("[AIExecutor] Elements found:", snapshot.elements.filter(el => el.isVisible).length);
      
      const response = await aiClient.chat(
        [{ role: "user", content: userPrompt }],
        systemPrompt
      );

      console.log("[AIExecutor] AI response length:", response?.length || 0);
      console.log("[AIExecutor] AI response preview:", response?.substring(0, 200));

      // Parse JSON from response - handle various LLM response formats
      const plan = this.extractJsonFromResponse<AIExecutionPlan>(response);
      if (plan) {
        console.log("[AIExecutor] Parsed plan:", JSON.stringify(plan, null, 2));
        return plan;
      }

      console.error("[AIExecutor] Failed to parse JSON from response");
      throw new Error("AI did not return valid JSON");
                } catch (error: any) {
      const msg: string = error.message || "";
      if (msg.includes("API key") || msg.includes("apiKey") || msg.includes("Missing credentials") ||
          msg.includes("does not belong") || msg.includes("Unauthorized") || msg.includes("401")) {
        console.error("[AIExecutor] LLM auth error — check LLM_MODEL_ID in .env matches your gateway app name:", msg);
      } else {
        console.error("[AIExecutor] AI planning failed:", msg);
      }
      console.warn("[AIExecutor] Falling back to rule-based plan");
      // Always fall back — never let an LLM error stop execution
      return this.createFallbackPlan(stepAction, expected, snapshot, testDataMap);
    }
  }

  // ============================================================================
  // JSON EXTRACTION HELPER (Handle various LLM response formats)
  // ============================================================================

  private extractJsonFromResponse<T>(response: string): T | null {
    try {
      // Try 1: Direct parse (response is already valid JSON)
      try {
        return JSON.parse(response) as T;
      } catch {
        // Continue to other methods
      }

      // Try 2: Extract from markdown code block ```json ... ```
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        try {
          return JSON.parse(codeBlockMatch[1].trim()) as T;
        } catch {
          // Continue to other methods
        }
      }

      // Try 3: Find the outermost balanced braces
      const jsonStr = this.extractBalancedJson(response);
      if (jsonStr) {
        return JSON.parse(jsonStr) as T;
      }

      // Try 4: Last resort - greedy regex (may fail on nested objects)
      const greedyMatch = response.match(/\{[\s\S]*\}/);
      if (greedyMatch) {
        // Try to find a valid JSON by trimming from the end
        let candidate = greedyMatch[0];
        while (candidate.length > 2) {
          try {
            return JSON.parse(candidate) as T;
          } catch {
            // Remove last character and try again
            const lastBrace = candidate.lastIndexOf('}');
            if (lastBrace <= 0) break;
            candidate = candidate.substring(0, lastBrace + 1);
          }
        }
      }

      return null;
    } catch (error) {
      console.error("[AIExecutor] JSON extraction failed:", error);
      return null;
    }
  }

  private extractBalancedJson(text: string): string | null {
    // Find the first { and then find its matching }
    const startIdx = text.indexOf('{');
    if (startIdx === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIdx; i < text.length; i++) {
      const char = text[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      if (char === '"' && !escape) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            return text.substring(startIdx, i + 1);
          }
        }
      }
    }

    return null;
  }

  // ============================================================================
  // FALLBACK PLAN (When AI fails - uses page snapshot elements)
  // ============================================================================

  private createFallbackPlan(stepAction: string, expected: string, snapshot: PageSnapshot, testDataMap?: Map<string, string>): AIExecutionPlan {
    const stepLower = stepAction.toLowerCase();
    const visibleElements = snapshot.elements.filter(el => el.isVisible && el.isEnabled);

    // Helper to find element by matching keywords
    const findElement = (...keywords: string[]): ElementInfo | undefined => {
      for (const keyword of keywords) {
        const found = visibleElements.find(el => 
          el.id?.toLowerCase().includes(keyword) ||
          el.name?.toLowerCase().includes(keyword) ||
          el.placeholder?.toLowerCase().includes(keyword) ||
          el.ariaLabel?.toLowerCase().includes(keyword) ||
          el.text?.toLowerCase().includes(keyword)
        );
        if (found) return found;
      }
      return undefined;
    };

    // Basic pattern matching for common actions
    if (stepLower.includes("navigate") || stepLower.includes("go to") || stepLower.includes("open")) {
      const urlMatch = stepAction.match(/https?:\/\/[^\s]+/);
      return {
        action: {
          type: "navigate",
          value: urlMatch ? urlMatch[0] : "",
          description: "Navigate to URL",
        },
        confidence: 50,
        reasoning: "Fallback: detected navigation keywords",
      };
    }

    if (stepLower.includes("click")) {
      // Extract what to click from step text
      const textMatch = stepAction.match(/click\s+(?:on\s+)?(?:the\s+)?["']?([^"']+?)["']?(?:\s+button|\s+link|\s+in\s+the\s+dropdown\s+list)?$/i);
      const clickTarget = textMatch ? textMatch[1].trim() : '';
      let element: ElementInfo | undefined = undefined;
      if (clickTarget) {
        // Try to find exact visible element with matching text
        element = visibleElements.find(el => el.text === clickTarget);
        // If not found, try contains (case-insensitive)
        if (!element) {
          element = visibleElements.find(el => el.text?.toLowerCase() === clickTarget.toLowerCase());
        }
        if (!element) {
          element = visibleElements.find(el => el.text?.toLowerCase().includes(clickTarget.toLowerCase()));
        }
      }
      // Fallback to keyword search
      if (!element && clickTarget) {
        element = findElement(clickTarget, ...clickTarget.split(/\s+/));
      }
      // If still not found, use generic XPath for visible element with exact/contains text
      let elementXPath = element?.xpath;
      if (!elementXPath && clickTarget) {
        // Prefer exact text match, then contains
        elementXPath = `//*[text()='${clickTarget}'] | //*[contains(text(), '${clickTarget}')]`;
      }
      return {
        action: {
          type: "click",
          elementXPath: elementXPath || `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "${clickTarget.toLowerCase()}")]`,
          description: element ? `Click ${element.tag} (${element.id || element.text || 'element'})` : `Click element with text '${clickTarget}'`,
        },
        confidence: element ? 70 : 50,
        reasoning: element ? `Fallback: found visible element with matching text` : "Fallback: detected click keyword, using generic text-based XPath",
      };
    }

        if (stepLower.includes("enter") || stepLower.includes("type") || stepLower.includes("input")) {
      // Parse: "enter VALUE in FIELD" or "type VALUE into FIELD"
      const match = stepAction.match(/(?:enter|type|input)\s+["']?(.+?)["']?\s+(?:in|into|for)\s+["']?(.+?)["']?$/i);
      let value = match ? match[1] : "";
      const fieldName = match ? match[2].toLowerCase() : "";

      // Resolve value from testDataMap if it looks like a placeholder or keyword
      if (testDataMap && testDataMap.size > 0) {
        // If value is a placeholder like {{username}}, resolve it
        const placeholderMatch = value.match(/^\{\{([^}]+)\}\}$/);
        if (placeholderMatch) {
          const key = placeholderMatch[1].trim();
          value = testDataMap.get(key) ?? testDataMap.get(key.toLowerCase()) ?? value;
        }
        // If value is empty or generic, try to infer from field name
        if (!value || value === "credentials" || value === "the credentials") {
          if (fieldName.includes("user") || fieldName.includes("email") || fieldName.includes("login")) {
            value = testDataMap.get("username") ?? testDataMap.get("email") ?? testDataMap.get("user") ?? value;
          } else if (fieldName.includes("password") || fieldName.includes("pass")) {
            value = testDataMap.get("password") ?? testDataMap.get("pass") ?? value;
          }
        }
        // Also check if the step itself mentions a known testData key
        if (!value) {
          testDataMap.forEach((tdValue, tdKey) => {
            if (stepLower.includes(tdKey.toLowerCase()) && !value) {
              value = tdValue;
            }
          });
        }
      }
      
      // Try to find input element from page snapshot
      const inputElements = visibleElements.filter(el => 
        el.tag === 'input' || el.tag === 'textarea'
      );
      
      // Match by field name keywords
      const fieldKeywords = fieldName.split(/\s+/).filter(w => w.length > 2);
      let element = inputElements.find(el => 
        fieldKeywords.some(kw => 
          el.id?.toLowerCase().includes(kw) ||
          el.name?.toLowerCase().includes(kw) ||
          el.placeholder?.toLowerCase().includes(kw) ||
          el.ariaLabel?.toLowerCase().includes(kw)
        )
      );
      
      // If not found, try the visible input elements
      if (!element && inputElements.length > 0) {
        // For "user id" type fields, look for common patterns
        if (fieldName.includes("user") || fieldName.includes("username") || fieldName.includes("login")) {
          element = inputElements.find(el => 
            el.type === 'text' || el.type === 'email' || !el.type
          );
        } else if (fieldName.includes("password")) {
          element = inputElements.find(el => el.type === 'password');
        }
      }
      
      return {
        action: {
          type: "type",
          elementXPath: element?.xpath || `//input[contains(@id, "${fieldKeywords[0] || 'input'}") or contains(@name, "${fieldKeywords[0] || 'input'}")]`,
          value: value,
          description: element ? `Type into ${element.tag}#${element.id || element.name || 'input'}` : "Type into field",
        },
        confidence: element ? 70 : 40,
        reasoning: element ? `Fallback: found input element in page snapshot (${element.xpath})` : "Fallback: detected type/enter keyword, no matching input found",
      };
    }

    // Default: verify action
    return {
      action: {
        type: "waitForElement",
        elementXPath: "//*",
        description: "Wait for page",
      },
      verification: {
        type: "elementVisible",
        elementXPath: `//*[contains(text(), "${expected.substring(0, 50)}")]`,
        description: "Brief description",
      },
      confidence: 20,
      reasoning: "Fallback: could not parse step, using generic wait",
    };
  }

  // ============================================================================
  // ACTION EXECUTION
  // ============================================================================

  private async executeAction(
    action: AIExecutionPlan["action"],
    logs: string[]
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.driver) {
      return { success: false, error: "No browser driver" };
    }

    // --- ENHANCED GENERIC DROPDOWN HANDLER ---
    // Always intercept 'click' on <option> and convert to 'select' on parent <select>
    if (
      action.type === "click" &&
      action.elementXPath &&
      action.elementXPath.match(/\/\/option(\[|$)/)
    ) {
      // Extract parent select XPath
      const selectXPath = action.elementXPath.replace(/\/\/option.*$/, "");
      // Robustly extract option value/text
      let value = "";
      // Try to extract from XPath: ...option[text()='...'] or ...option[@value='...']
      const textMatch = action.elementXPath.match(/option\[text\(\)\s*=\s*['"]([^'"]+)['"]\]/);
      const valueMatch = action.elementXPath.match(/option\[@value=\s*['"]([^'"]+)['"]\]/);
      if (textMatch) value = textMatch[1];
      else if (valueMatch) value = valueMatch[1];
      else if (action.description) {
        // Try to extract from description: 'Select ...' or 'Click on ...'
        const descMatch = action.description.match(/'([^']+)'/);
        if (descMatch) value = descMatch[1];
      }
      if (!value && action.value) value = action.value;
      logs.push(`[AIExecutor] [Dropdown] Intercepted click on <option>, converting to select: ${value}`);
      action = {
        type: "select",
        elementXPath: selectXPath,
        value: value,
        description: `Select ${value} from dropdown`,
      };
    }

    try {
      logs.push(`Executing: ${action.type} - ${action.description}`);

      switch (action.type) {
        // ================== NAVIGATION ==================
        case "navigate":
          if (action.value) {
            await this.driver.get(action.value);
            await this.waitForPageLoad();
            logs.push(`Navigated to: ${action.value}`);
          }
          break;

        case "refresh":
          await this.driver.navigate().refresh();
          await this.waitForPageLoad();
          logs.push("Page refreshed");
          break;

        case "back":
          await this.driver.navigate().back();
          await this.waitForPageLoad();
          logs.push("Navigated back");
          break;

        case "forward":
          await this.driver.navigate().forward();
          await this.waitForPageLoad();
          logs.push("Navigated forward");
          break;

        // ================== CLICK ACTIONS ==================
                case "click":
          if (action.elementXPath && action.elementXPath.includes("//option")) {
            // Prevent direct click on <option>
            logs.push(`[AIExecutor] [Dropdown] ERROR: Attempted direct click on <option>—should always be intercepted!`);
            return { success: false, error: "Direct click on <option> is not allowed. Use select action." };
          }
          if (action.elementXPath) {
            try {
              const element = await this.findElement(action.elementXPath);
              await this.scrollIntoView(element);
              
              // Get original window count BEFORE click
              const originalHandles = await this.driver.getAllWindowHandles();
              const originalCount = originalHandles.length;
              
              await element.click();
              logs.push(`Clicked: ${action.elementXPath}`);
              
              // Wait for potential page load or new window
              await this.driver.sleep(1000);
              
                            // AUTO-DETECT: Check if new window opened
              const currentHandles = await this.driver.getAllWindowHandles();
              if (currentHandles.length > originalCount) {
                logs.push(`[AUTO-DETECT] New window detected! Switching to it...`);
                // Switch to the new window
                for (const handle of currentHandles) {
                  if (!originalHandles.includes(handle)) {
                    await this.driver.switchTo().window(handle);
                    logs.push(`✓ Switched to new window automatically after click`);
                    // Wait for new window to load
                    await this.waitForPageLoad();
                    
                    // AUTO-DETECT: Check if there are iframes in the new window
                    try {
                      const iframes = await this.driver.findElements(By.tagName('iframe'));
                      if (iframes.length > 0) {
                        logs.push(`[AUTO-DETECT] Found ${iframes.length} iframe(s) in new window. Attempting to switch to first iframe...`);
                        try {
                          await this.driver.switchTo().frame(0);
                          logs.push(`✓ Switched to iframe[0] automatically`);
                          await this.driver.sleep(500); // Wait for iframe content to load
                        } catch (iframeErr: any) {
                          logs.push(`[AUTO-DETECT] Could not switch to iframe: ${iframeErr.message}`);
                        }
                      }
                    } catch (e: any) {
                      logs.push(`[AUTO-DETECT] Error checking for iframes: ${e.message}`);
                    }
                    break;
                  }
                }
              }
            } catch (err: any) {
              // Fallback: if not interactable, try all visible, interactable elements with matching text (skip <option> tags)
              const errMsg = err.message || "";
              if (errMsg.includes("not interactable") || errMsg.includes("not visible") || errMsg.includes("may not be manipulated")) {
                let textTarget = "";
                const textMatch = action.elementXPath.match(/text\(\)\s*=\s*['\"]([^'\"]+)['\"]/);
                if (textMatch) textTarget = textMatch[1];
                if (!textTarget && action.description) {
                  const descMatch = action.description.match(/text '([^']+)'/i);
                  if (descMatch) textTarget = descMatch[1];
                }
                if (!textTarget) textTarget = "";
                if (textTarget) {
                  // Find all elements with exact or contains text, skip <option> tags
                  const fallbackXPath = `//*[not(self::option) and (text()='${textTarget}' or contains(text(), '${textTarget}'))]`;
                  try {
                    const elements = await this.driver.findElements(By.xpath(fallbackXPath));
                    let clicked = false;
                    for (const el of elements) {
                      try {
                        const displayed = await el.isDisplayed();
                        const enabled = await el.isEnabled();
                        if (displayed && enabled) {
                          await this.scrollIntoView(el);
                          await el.click();
                          logs.push(`[Fallback] Clicked visible element with text: ${textTarget}`);
                          await this.driver.sleep(1000);
                          clicked = true;
                          break;
                        }
                      } catch {}
                    }
                    if (!clicked) {
                      return { success: false, error: `Click failed: ${errMsg} | Fallback: No visible, interactable element with text '${textTarget}' found.` };
                    }
                  } catch (fallbackErr: any) {
                    return { success: false, error: `Click failed: ${errMsg} | Fallback also failed: ${fallbackErr.message}` };
                  }
                } else {
                  return { success: false, error: `Click failed: ${errMsg} | No visible text found for fallback.` };
                }
              } else {
                return { success: false, error: `Click failed: ${errMsg}` };
              }
            }
          }
          break;

        case "doubleClick":
          if (action.elementXPath) {
            const element = await this.findElement(action.elementXPath);
            await this.scrollIntoView(element);
            const actions = this.driver.actions({ async: true });
            await actions.doubleClick(element).perform();
            logs.push(`Double-clicked: ${action.elementXPath}`);
          }
          break;

        case "rightClick":
          if (action.elementXPath) {
            const element = await this.findElement(action.elementXPath);
            await this.scrollIntoView(element);
            const actions = this.driver.actions({ async: true });
            await actions.contextClick(element).perform();
            logs.push(`Right-clicked: ${action.elementXPath}`);
          }
          break;

                // ================== INPUT ACTIONS ==================
                case "type":
                  if (action.elementXPath && action.value !== undefined) {
                    // Guard: if value is still a placeholder like [PASSWORD] or {{password}},
                    // try to resolve it from the step description
                    let finalValue = action.value;
                    if (finalValue === "[PASSWORD]" || finalValue === "[MASKED]") {
                      logs.push(`[type] WARNING: value is still a placeholder "${finalValue}" — check test data`);
                    }
                    const element = await this.findElement(action.elementXPath);
                    await this.scrollIntoView(element);
                    await this.typeIntoElement(element, finalValue, logs);
                    logs.push(`Typed into ${action.elementXPath}`);
                  }
                  break;

        case "clear":
          if (action.elementXPath) {
            const element = await this.findElement(action.elementXPath);
            await this.scrollIntoView(element);
            await element.clear();
            logs.push(`Cleared: ${action.elementXPath}`);
          }
          break;

        // ================== DROPDOWN/SELECT ==================
        case "select":
          if (action.elementXPath && action.value) {
            try {
              const selectElement = await this.findElement(action.elementXPath);
              await this.scrollIntoView(selectElement);
              const tagName = await selectElement.getTagName();
              // Check if select is visible
              const isDisplayed = await selectElement.isDisplayed();
              const style = await selectElement.getAttribute("style") || "";
              const isHidden = style.includes("display: none") || style.includes("visibility: hidden") || style.includes("left: -9999px");
              if (tagName.toLowerCase() === "select" && isDisplayed && !isHidden) {
                // Native select (visible)
                const isMultiple = await selectElement.getAttribute("multiple");
                const options = await selectElement.findElements(By.tagName("option"));
                let matched = false;
                let allOptions: {text: string, value: string}[] = [];
                for (const option of options) {
                  const text = await option.getText();
                  const value = await option.getAttribute("value");
                  allOptions.push({ text, value });
                  // 1. Exact match (trimmed, case-insensitive)
                  if (
                    text.trim().toLowerCase() === action.value.trim().toLowerCase() ||
                    value.trim().toLowerCase() === action.value.trim().toLowerCase()
                  ) {
                    if (isMultiple) {
                      await this.driver.actions({ async: true })
                        .keyDown(Key.CONTROL)
                        .click(option)
                        .keyUp(Key.CONTROL)
                        .perform();
                      logs.push(`Multi-select: Added option '${action.value}'`);
                    } else {
                      await option.click();
                      logs.push(`Selected option '${action.value}'`);
                    }
                    matched = true;
                    break;
                  }
                }
                // 2. Partial match (case-insensitive)
                if (!matched) {
                  for (const option of options) {
                    const text = await option.getText();
                    const value = await option.getAttribute("value");
                    if (
                      text.toLowerCase().includes(action.value.trim().toLowerCase()) ||
                      value.toLowerCase().includes(action.value.trim().toLowerCase())
                    ) {
                      if (isMultiple) {
                        await this.driver.actions({ async: true })
                          .keyDown(Key.CONTROL)
                          .click(option)
                          .keyUp(Key.CONTROL)
                          .perform();
                        logs.push(`Multi-select: Added option (partial match) '${action.value}'`);
                      } else {
                        await option.click();
                        logs.push(`Selected option (partial match) '${action.value}'`);
                      }
                      matched = true;
                      break;
                    }
                  }
                }
                if (!matched) {
                  logs.push(`[AIExecutor] [Dropdown] No matching option found for value or text: '${action.value}'. Available options:`);
                  for (const opt of allOptions) {
                    logs.push(`  Option: text='${opt.text}', value='${opt.value}'`);
                  }
                  throw new Error(`No matching option found for value or text: ${action.value}`);
                }
              } else {
                // Custom dropdown: find visible <ul> and <li> options
                // Find the nearest visible ul.ms-list (or similar)
                let ulElement;
                try {
                  ulElement = await this.driver.findElement(By.xpath("//ul[contains(@class, 'ms-list') and not(contains(@style, 'display: none'))]"));
                } catch {
                  // Fallback: find any visible ul near the select
                  ulElement = await this.driver.findElement(By.xpath("//ul[not(contains(@style, 'display: none'))]"));
                }
                const liOptions = await ulElement.findElements(By.xpath(".//li[contains(@class, 'ms-elem-selectable')]"));
                let matched = false;
                for (const li of liOptions) {
                  if (await li.isDisplayed()) {
                    const span = await li.findElement(By.xpath(".//span"));
                    const text = (await span.getText()).trim();
                    // Match by visible text (case-insensitive)
                    if (text.toLowerCase() === action.value.trim().toLowerCase()) {
                      await span.click();
                      logs.push(`Selected '${action.value}' from custom dropdown (by text)`);
                      matched = true;
                      break;
                    }
                  }
                }
                if (!matched) {
                  // Try partial match
                  for (const li of liOptions) {
                    if (await li.isDisplayed()) {
                      const span = await li.findElement(By.xpath(".//span"));
                      const text = (await span.getText()).trim();
                      if (text.toLowerCase().includes(action.value.trim().toLowerCase())) {
                        await span.click();
                        logs.push(`Selected '${action.value}' from custom dropdown (partial text match)`);
                        matched = true;
                        break;
                      }
                    }
                  }
                }
                if (!matched) {
                  logs.push(`[AIExecutor] [Dropdown] No matching custom dropdown option found for text: '${action.value}'.`);
                  throw new Error(`No matching custom dropdown option found for text: ${action.value}`);
                }
              }
            } catch (err: any) {
              logs.push(`[AIExecutor] [Dropdown] Select failed: ${err.message}`);
              return { success: false, error: `Dropdown select failed: ${err.message}` };
            }
          }
          break;

        // ================== CHECKBOX/RADIO ==================
        case "checkbox":
          if (action.elementXPath) {
            const checkbox = await this.findElement(action.elementXPath);
            const isChecked = await checkbox.isSelected();
            const shouldCheck = action.value === "check";
            if (isChecked !== shouldCheck) {
              await this.scrollIntoView(checkbox);
              await checkbox.click();
            }
            logs.push(`Checkbox ${shouldCheck ? 'checked' : 'unchecked'}: ${action.elementXPath}`);
          }
          break;

        case "radio":
          if (action.elementXPath) {
            const radio = await this.findElement(action.elementXPath);
            await this.scrollIntoView(radio);
            await radio.click();
            // Verify selection using JavaScript
            const isSelected = await this.driver.executeScript(
              "return arguments[0].checked;",
              radio
            );
            if (!isSelected) {
              // Try clicking the label instead
              try {
                const label = await this.driver.findElement(
                  By.xpath(`${action.elementXPath}/ancestor::label | ${action.elementXPath}/following-sibling::label[1] | //label[@for='${await radio.getAttribute('id')}']`)
                );
                await label.click();
              } catch { }
            }
            logs.push(`Selected radio: ${action.elementXPath}`);
          }
          break;

        // ================== HOVER/FOCUS ==================
        case "hover":
          if (action.elementXPath) {
            const element = await this.findElement(action.elementXPath);
            await this.scrollIntoView(element);
            const actions = this.driver.actions({ async: true });
            await actions.move({ origin: element }).perform();
            logs.push(`Hovered: ${action.elementXPath}`);
          }
          break;

        case "focus":
          if (action.elementXPath) {
            const element = await this.findElement(action.elementXPath);
            await this.scrollIntoView(element);
            await this.driver.executeScript("arguments[0].focus();", element);
            logs.push(`Focused: ${action.elementXPath}`);
          }
          break;

        case "blur":
          if (action.elementXPath) {
            const element = await this.findElement(action.elementXPath);
            await this.driver.executeScript("arguments[0].blur();", element);
            logs.push(`Blurred: ${action.elementXPath}`);
          }
          break;

        // ================== SCROLL ==================
        case "scroll":
          if (action.value === "top") {
            await this.driver.executeScript("window.scrollTo(0, 0);");
          } else if (action.value === "bottom") {
            await this.driver.executeScript("window.scrollTo(0, document.body.scrollHeight);");
          } else if (action.value === "up") {
            await this.driver.executeScript("window.scrollBy(0, -300);");
          } else if (action.value === "down") {
            await this.driver.executeScript("window.scrollBy(0, 300);");
          } else if (action.elementXPath) {
            const element = await this.findElement(action.elementXPath);
            await this.scrollIntoView(element);
          }
          logs.push(`Scrolled: ${action.value || action.elementXPath}`);
          break;

        // ================== DRAG & DROP ==================
        case "dragDrop":
          if (action.elementXPath && action.targetXPath) {
            const source = await this.findElement(action.elementXPath);
            await this.scrollIntoView(source);
            const target = await this.findElement(action.targetXPath);
            const actions = this.driver.actions({ async: true });
            await actions.dragAndDrop(source, target).perform();
            logs.push(`Dragged from ${action.elementXPath} to ${action.targetXPath}`);
          }
          break;

        // ================== KEYBOARD ==================
        case "pressKey":
          if (action.key) {
            const keyMap: { [key: string]: string } = {
              "enter": Key.ENTER,
              "tab": Key.TAB,
              "escape": Key.ESCAPE,
              "backspace": Key.BACK_SPACE,
              "delete": Key.DELETE,
              "space": Key.SPACE,
              "arrowup": Key.ARROW_UP,
              "arrowdown": Key.ARROW_DOWN,
              "arrowleft": Key.ARROW_LEFT,
              "arrowright": Key.ARROW_RIGHT,
            };
            const key = keyMap[action.key.toLowerCase()] || action.key;
            if (action.elementXPath) {
              const element = await this.findElement(action.elementXPath);
              await element.sendKeys(key);
            } else {
              const activeElement = await this.driver.switchTo().activeElement();
              await activeElement.sendKeys(key);
            }
            logs.push(`Pressed key: ${action.key}`);
          }
          break;

        // ================== IFRAME ACTIONS ==================
        case "switchToIframe":
          if (action.iframeName) {
            try {
              // Try by name/id first
              await this.driver.switchTo().frame(action.iframeName);
            } catch {
              // Try by index
              const index = parseInt(action.iframeName);
              if (!isNaN(index)) {
                await this.driver.switchTo().frame(index);
              } else {
                // Try by xpath
                const iframe = await this.findElement(`//iframe[@name='${action.iframeName}' or @id='${action.iframeName}']`);
                await this.driver.switchTo().frame(iframe);
              }
            }
            logs.push(`Switched to iframe: ${action.iframeName}`);
          }
          break;

        case "switchToDefaultContent":
          await this.driver.switchTo().defaultContent();
          logs.push("Switched to default content");
          break;

        case "switchToParentFrame":
          await this.driver.switchTo().parentFrame();
          logs.push("Switched to parent frame");
          break;

        // ================== WINDOW ACTIONS ==================
        case "switchToWindow":
          const handles = await this.driver.getAllWindowHandles();
          const windowIndex = action.windowIndex ?? 0;
          if (windowIndex < handles.length) {
            await this.driver.switchTo().window(handles[windowIndex]);
            logs.push(`Switched to window index: ${windowIndex}`);
          } else {
            throw new Error(`Window index ${windowIndex} not found (${handles.length} windows available)`);
          }
          break;

                case "switchToNewWindow":
          // Wait for new window to appear
          const originalHandles2 = await this.driver.getAllWindowHandles();
          const originalCount2 = originalHandles2.length;
          
          // Wait up to 10 seconds for new window
          for (let i = 0; i < 20; i++) {
            await this.driver.sleep(500);
            const currentHandles = await this.driver.getAllWindowHandles();
            if (currentHandles.length > originalCount2) {
              // Switch to the new window
              for (const handle of currentHandles) {
                if (!originalHandles2.includes(handle)) {
                  await this.driver.switchTo().window(handle);
                  logs.push("Switched to new window/popup");
                  // Wait for new window to load
                  await this.waitForPageLoad();
                  
                  // AUTO-DETECT: Check if there are iframes in the new window
                  try {
                    const iframes = await this.driver.findElements(By.tagName('iframe'));
                    if (iframes.length > 0) {
                      logs.push(`[AUTO-DETECT] Found ${iframes.length} iframe(s) in new window. Attempting to switch to first iframe...`);
                      try {
                        await this.driver.switchTo().frame(0);
                        logs.push(`✓ Switched to iframe[0] automatically`);
                        await this.driver.sleep(500); // Wait for iframe content to load
                      } catch (iframeErr: any) {
                        logs.push(`[AUTO-DETECT] Could not switch to iframe: ${iframeErr.message}`);
                      }
                    }
                  } catch (e: any) {
                    logs.push(`[AUTO-DETECT] Error checking for iframes: ${e.message}`);
                  }
                  break;
                }
              }
              break;
            }
          }
          break;

        case "closeWindow":
          await this.driver.close();
          // Switch back to first window
          const remainingHandles = await this.driver.getAllWindowHandles();
          if (remainingHandles.length > 0) {
            await this.driver.switchTo().window(remainingHandles[0]);
          }
          logs.push("Closed window and switched back");
          break;

        // ================== ALERT/DIALOG ACTIONS ==================
        case "acceptAlert":
          try {
            const alert = await this.driver.switchTo().alert();
            await alert.accept();
            logs.push("Accepted alert");
          } catch (e) {
            logs.push("No alert present to accept");
          }
          break;

        case "dismissAlert":
          try {
            const alert = await this.driver.switchTo().alert();
            await alert.dismiss();
            logs.push("Dismissed alert");
          } catch (e) {
            logs.push("No alert present to dismiss");
          }
          break;

        case "getAlertText":
          try {
            const alert = await this.driver.switchTo().alert();
            const text = await alert.getText();
            logs.push(`Alert text: ${text}`);
          } catch (e) {
            logs.push("No alert present");
          }
          break;

        case "sendAlertText":
          if (action.value) {
            try {
              const alert = await this.driver.switchTo().alert();
              await alert.sendKeys(action.value);
              await alert.accept();
              logs.push(`Sent text to alert: ${action.value}`);
            } catch (e) {
              logs.push("No prompt present");
            }
          }
          break;

        // ================== WAIT ACTIONS ==================
        case "wait":
          const ms = parseInt(action.value || "1000");
          await this.driver.sleep(ms);
          logs.push(`Waited ${ms}ms`);
          break;

        case "waitForElement":
          if (action.elementXPath) {
            await this.driver.wait(
              until.elementLocated(By.xpath(action.elementXPath)),
              10000
            );
            logs.push(`Element appeared: ${action.elementXPath}`);
          }
          break;

        case "waitForText":
          if (action.value) {
            await this.driver.wait(async () => {
              const body = await this.driver!.findElement(By.tagName("body"));
              const text = await body.getText();
              return text.includes(action.value!);
            }, 10000);
            logs.push(`Text appeared: ${action.value}`);
          }
          break;

        // ================== SCRIPT EXECUTION ==================
        case "executeScript":
          if (action.value) {
            await this.driver.executeScript(action.value);
            logs.push("Executed script");
          }
          break;

        default:
          logs.push(`Unknown action type: ${action.type}`);
      }

      return { success: true };
    } catch (error: any) {
      logs.push(`Action failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // VERIFICATION EXECUTION
  // ============================================================================

  private async executeVerification(
    verification: AIExecutionPlan["verification"],
    logs: string[]
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.driver || !verification) {
      return { success: true };
    }

    try {
      switch (verification.type) {
        case "elementExists":
          if (verification.elementXPath) {
            await this.findElement(verification.elementXPath);
            logs.push(`✓ Element exists: ${verification.elementXPath}`);
          }
          break;

        case "elementVisible":
          if (verification.elementXPath) {
            const element = await this.findElement(verification.elementXPath);
            const isDisplayed = await element.isDisplayed();
            if (!isDisplayed) {
              throw new Error("Element is not visible");
            }
            logs.push(`✓ Element visible: ${verification.elementXPath}`);
          }
          break;

        case "elementEnabled":
          if (verification.elementXPath) {
            const element = await this.findElement(verification.elementXPath);
            const isEnabled = await element.isEnabled();
            if (!isEnabled) {
              throw new Error("Element is not enabled");
            }
            logs.push(`✓ Element enabled: ${verification.elementXPath}`);
          }
          break;

                case "elementSelected":
          if (verification.elementXPath) {
            try {
              const element = await this.findElement(verification.elementXPath);
              const isSelected = await this.driver.executeScript(
                "return arguments[0].checked || arguments[0].selected;",
                element
              );
              if (isSelected) {
                logs.push(`✓ Element selected: ${verification.elementXPath}`);
              } else {
                // Fallback: check visible text/value for custom dropdowns
                let expected = verification.expectedValue || "";
                let found = false;
                // Try to find a visible element with the expected text
                const visibleTextXpaths = [
                  `//*[contains(@class,'selected') and text()='${expected}']`,
                  `//*[contains(@class,'selected') and contains(text(),'${expected}')]`,
                  `//*[text()='${expected}']`,
                  `//*[contains(text(),'${expected}')]`
                ];
                for (const xpath of visibleTextXpaths) {
                  try {
                    const els = await this.driver.findElements(By.xpath(xpath));
                    for (const el of els) {
                      try {
                        if (await el.isDisplayed()) {
                          logs.push(`✓ Fallback: Visible selected text found: ${expected}`);
                          found = true;
                          break;
                        }
                      } catch {}
                    }
                    if (found) break;
                  } catch {}
                }
                if (!found) {
                  logs.push(`[Verification] Element not selected in main frame, trying iframes...`);
                  // Try looking in iframes
                  try {
                    const iframes = await this.driver.findElements(By.tagName('iframe'));
                    for (let i = 0; i < iframes.length && !found; i++) {
                      try {
                        await this.driver.switchTo().frame(i);
                        const els = await this.driver.findElements(By.xpath(verification.elementXPath));
                        if (els.length > 0) {
                          const isSelectedInFrame = await this.driver.executeScript(
                            "return arguments[0].checked || arguments[0].selected;",
                            els[0]
                          );
                          if (isSelectedInFrame) {
                            logs.push(`✓ Element selected in iframe[${i}]: ${verification.elementXPath}`);
                            found = true;
                          }
                        }
                        await this.driver.switchTo().defaultContent();
                      } catch {}
                    }
                  } catch {}
                  
                  if (!found) {
                    throw new Error("Element is not selected and no visible selected text found (checked main frame and iframes)");
                  }
                }
              }
            } catch (err: any) {
              throw err;
            }
          }
          break;

        case "textEquals":
          if (verification.elementXPath && verification.expectedValue) {
            const element = await this.findElement(verification.elementXPath);
            let text = await element.getText();
            // For input elements, also check the value attribute
            const tagName = await element.getTagName();
            if (tagName.toLowerCase() === 'input' || tagName.toLowerCase() === 'textarea') {
              text = await element.getAttribute('value') || '';
            } else if (tagName.toLowerCase() === 'select') {
              // For <select>, get selected option's text
              try {
                const selectedOption = await element.findElement(By.xpath(".//option[@selected]"));
                text = await selectedOption.getText();
              } catch {
                // Fallback: find selected option by isSelected()
                const options = await element.findElements(By.tagName("option"));
                for (const opt of options) {
                  if (await opt.isSelected()) {
                    text = await opt.getText();
                    break;
                  }
                }
              }
            }
            if (text !== verification.expectedValue) {
              throw new Error(`Text mismatch: expected \"${verification.expectedValue}\", got \"${text}\"`);
            }
            logs.push(`✓ Text equals: ${verification.expectedValue}`);
          }
          break;

        case "textContains":
          if (verification.elementXPath && verification.expectedValue) {
            const element = await this.findElement(verification.elementXPath);
            let text = await element.getText();
            const tagName = await element.getTagName();
            if (tagName.toLowerCase() === 'input' || tagName.toLowerCase() === 'textarea') {
              text = await element.getAttribute('value') || '';
            } else if (tagName.toLowerCase() === 'select') {
              // For <select>, get selected option's text and value, and match against expected value
              let found = false;
              try {
                const selectedOption = await element.findElement(By.xpath(".//option[@selected]"));
                const selectedText = (await selectedOption.getText()).trim();
                const selectedValue = (await selectedOption.getAttribute('value')).trim();
                if (
                  selectedText.toLowerCase().includes(verification.expectedValue.trim().toLowerCase()) ||
                  selectedValue.toLowerCase().includes(verification.expectedValue.trim().toLowerCase())
                ) {
                  found = true;
                }
              } catch {}
              if (!found) {
                const options = await element.findElements(By.tagName("option"));
                for (const opt of options) {
                  if (await opt.isSelected()) {
                    const optText = (await opt.getText()).trim();
                    const optValue = (await opt.getAttribute('value')).trim();
                    if (
                      optText.toLowerCase().includes(verification.expectedValue.trim().toLowerCase()) ||
                      optValue.toLowerCase().includes(verification.expectedValue.trim().toLowerCase())
                    ) {
                      found = true;
                      break;
                    }
                  }
                }
              }
              if (!found) {
                throw new Error(`Text not found: \"${verification.expectedValue}\" in selected option(s)`);
              }
              logs.push(`✓ Text contains (selected option): ${verification.expectedValue}`);
              break;
            }
            if (!text.toLowerCase().includes(verification.expectedValue.toLowerCase())) {
              throw new Error(`Text not found: \"${verification.expectedValue}\" in \"${text}\"`);
            }
            logs.push(`✓ Text contains: ${verification.expectedValue}`);
          }
          break;

        case "textVisible":
          // Robust: search entire DOM for any visible element containing expected text
          if (verification.expectedValue) {
            let found = false;
            // Wait up to 5s for any visible element containing the expected text
            for (let i = 0; i < 10; i++) {
              const visibleTextXpaths = [
                `//*[contains(@class,'dropdown') and contains(text(),'${verification.expectedValue}')]`,
                `//*[contains(@class,'option') and contains(text(),'${verification.expectedValue}')]`,
                `//*[text()='${verification.expectedValue}']`,
                `//*[contains(text(),'${verification.expectedValue}')]`
              ];
              for (const xpath of visibleTextXpaths) {
                try {
                  const els = await this.driver.findElements(By.xpath(xpath));
                  for (const el of els) {
                    if (await el.isDisplayed()) {
                      found = true;
                      break;
                    }
                  }
                  if (found) break;
                } catch {}
              }
              if (found) break;
              await this.driver.sleep(500);
            }
            if (!found) {
              throw new Error(`Text not visible: "${verification.expectedValue}" in any visible option or dropdown result`);
            }
            logs.push(`✓ Text visible: ${verification.expectedValue}`);
          }
          break;

        case "valueEquals":
          if (verification.elementXPath && verification.expectedValue) {
            const element = await this.findElement(verification.elementXPath);
            const value = await element.getAttribute("value");
            if (value === verification.expectedValue) {
              logs.push(`✓ Value equals: ${verification.expectedValue}`);
            } else {
              // Fallback: for <select>, check if selected option's visible text matches expected value
              const tagName = await element.getTagName();
              let matched = false;
              if (tagName.toLowerCase() === 'select') {
                // Try selected option
                try {
                  const selectedOption = await element.findElement(By.xpath(".//option[@selected]"));
                  const optionText = await selectedOption.getText();
                  if (optionText.trim() === verification.expectedValue.trim()) {
                    logs.push(`✓ Fallback: Selected option text equals: ${verification.expectedValue}`);
                    matched = true;
                  }
                } catch {}
                // Try any option with matching text (in case selected attribute is not set)
                if (!matched) {
                  const options = await element.findElements(By.tagName("option"));
                  for (const opt of options) {
                    const optText = await opt.getText();
                    if (optText.trim() === verification.expectedValue.trim()) {
                      const isSelected = await opt.isSelected();
                      if (isSelected) {
                        logs.push(`✓ Fallback: Option with text '${verification.expectedValue}' is selected`);
                        matched = true;
                        break;
                      }
                    }
                  }
                }
              }
              // Fallback: check visible text in the widget/container
              if (!matched) {
                const visibleTextXpaths = [
                  `//*[contains(@class,'selected') and text()='${verification.expectedValue}']`,
                  `//*[contains(@class,'selected') and contains(text(),'${verification.expectedValue}')]`,
                  `//*[text()='${verification.expectedValue}']`,
                  `//*[contains(text(),'${verification.expectedValue}')]`
                ];
                for (const xpath of visibleTextXpaths) {
                  try {
                    const els = await this.driver.findElements(By.xpath(xpath));
                    for (const el of els) {
                      if (await el.isDisplayed()) {
                        logs.push(`✓ Fallback: Visible selected text found: ${verification.expectedValue}`);
                        matched = true;
                        break;
                      }
                    }
                    if (matched) break;
                  } catch {}
                }
              }
              if (!matched) {
                throw new Error(`Value mismatch: expected \"${verification.expectedValue}\", got \"${value}\" and no visible text matched`);
              }
            }
          }
          break;

        case "valueContains":
          if (verification.elementXPath && verification.expectedValue) {
            const element = await this.findElement(verification.elementXPath);
            let value = await element.getAttribute("value");
            const tagName = await element.getTagName();
            let text = "";
            if (tagName.toLowerCase() === 'select') {
              // For <select>, get selected option's text and value
              try {
                const selectedOption = await element.findElement(By.xpath(".//option[@selected]"));
                text = (await selectedOption.getText()).trim();
                value = (await selectedOption.getAttribute('value')).trim();
              } catch {
                // Fallback: find selected option by isSelected()
                const options = await element.findElements(By.tagName("option"));
                for (const opt of options) {
                  if (await opt.isSelected()) {
                    text = (await opt.getText()).trim();
                    value = (await opt.getAttribute('value')).trim();
                    break;
                  }
                }
              }
              if (
                text.toLowerCase().includes(verification.expectedValue.trim().toLowerCase()) ||
                value.toLowerCase().includes(verification.expectedValue.trim().toLowerCase())
              ) {
                logs.push(`✓ valueContains: selected option text or value contains ${verification.expectedValue}`);
                return { success: true };
              } else {
                throw new Error(`Value not found: \"${verification.expectedValue}\" in selected option text \"${text}\" or value \"${value}\"`);
              }
            } else {
              // For other elements, check value attribute
              if (value && value.toLowerCase().includes(verification.expectedValue.trim().toLowerCase())) {
                logs.push(`✓ valueContains: value contains ${verification.expectedValue}`);
                return { success: true };
              } else {
                throw new Error(`Value not found: \"${verification.expectedValue}\" in \"${value}\"`);
              }
            }
          }
          break;

        case "urlEquals":
          if (verification.expectedValue) {
            const url = await this.driver.getCurrentUrl();
            if (url !== verification.expectedValue) {
              throw new Error(`URL mismatch: expected "${verification.expectedValue}", got "${url}"`);
            }
            logs.push(`✓ URL equals: ${verification.expectedValue}`);
          }
          break;

        case "urlContains":
          if (verification.expectedValue) {
            const url = await this.driver.getCurrentUrl();
            if (!url.includes(verification.expectedValue)) {
              throw new Error(`URL doesn't contain: "${verification.expectedValue}"`);
            }
            logs.push(`✓ URL contains: ${verification.expectedValue}`);
          }
          break;

        case "titleEquals":
          if (verification.expectedValue) {
            const title = await this.driver.getTitle();
            if (title !== verification.expectedValue) {
              throw new Error(`Title mismatch: expected "${verification.expectedValue}", got "${title}"`);
            }
            logs.push(`✓ Title equals: ${verification.expectedValue}`);
          }
          break;

        case "titleContains":
          if (verification.expectedValue) {
            const title = await this.driver.getTitle();
            if (!title.includes(verification.expectedValue)) {
              throw new Error(`Title doesn't contain: "${verification.expectedValue}"`);
            }
            logs.push(`✓ Title contains: ${verification.expectedValue}`);
          }
          break;

        case "alertPresent":
          try {
            await this.driver.switchTo().alert();
            await this.driver.switchTo().defaultContent();
            logs.push("✓ Alert is present");
          } catch {
            throw new Error("No alert present");
          }
          break;

        default:
          logs.push(`Unknown verification type: ${verification.type}`);
      }

      return { success: true };
    } catch (error: any) {
      logs.push(`✗ Verification failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async findElement(xpath: string, timeout: number = 120000): Promise<WebElement> {
    if (!this.driver) {
      throw new Error("No browser driver");
    }

    // Wait for element to be present with configurable timeout (default 120s for slow apps)
    await this.driver.wait(until.elementLocated(By.xpath(xpath)), timeout);
    return this.driver.findElement(By.xpath(xpath));
  }

  /**
   * Dynamic wait for page to be fully loaded.
   * Waits until document.readyState is 'complete' and no pending AJAX requests.
   * Maximum wait: 120 seconds. Proceeds immediately when page is ready.
   */
  private async waitForPageLoad(timeout: number = 120000): Promise<void> {
    if (!this.driver) return;

    const startTime = Date.now();
    
    // Wait for document ready state
    await this.driver.wait(async () => {
      const readyState = await this.driver!.executeScript('return document.readyState');
      return readyState === 'complete';
    }, timeout, 'Page did not finish loading');

    // Additional check: wait for any pending jQuery/Angular/React requests
    try {
      const elapsed = Date.now() - startTime;
      const remainingTimeout = Math.max(timeout - elapsed, 5000);
      
      await this.driver.wait(async () => {
        const isReady = await this.driver!.executeScript(`
          // Check jQuery AJAX
          if (typeof jQuery !== 'undefined' && jQuery.active > 0) return false;
          
          // Check Angular (1.x)
          if (typeof angular !== 'undefined') {
            var injector = angular.element(document.body).injector();
            if (injector) {
              var $http = injector.get('$http');
              if ($http.pendingRequests && $http.pendingRequests.length > 0) return false;
            }
          }
          
          // Check for any fetch/XHR in progress (basic check)
          return true;
        `);
        return isReady;
      }, remainingTimeout);
    } catch {
      // If framework detection fails, just proceed - the page is at least document.readyState=complete
    }
    
    // Small buffer for any final rendering
    await this.driver.sleep(500);
  }

  private async scrollIntoView(element: WebElement): Promise<void> {
    if (this.driver) {
      await this.driver.executeScript(
        "arguments[0].scrollIntoView({block: 'center', behavior: 'smooth'});",
        element
      );
      await this.driver.sleep(300);
    }
  }

    private replacePlaceholders(text: string, testData: Map<string, string>): string {
    if (!text) return text;
    let result = text;
    // Replace {{key}} placeholders
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    let match;
    // Reset lastIndex since we reuse the regex
    placeholderRegex.lastIndex = 0;
    const original = text;
    while ((match = placeholderRegex.exec(original)) !== null) {
      const key = match[1].trim();
      const value = testData.get(key) ?? testData.get(key.toLowerCase()) ?? testData.get(key.toUpperCase());
      if (value !== undefined) {
        result = result.split(match[0]).join(value);
      }
    }
    return result;
  }

  /**
   * Pre-resolves credential/test-data values in a step action string.
   * Handles both {{placeholder}} syntax AND natural language like:
   *   "Enter username" → "Enter admin@example.com in the username field"
   *   "Enter password" → "Enter secretPass123 in the password field"
   *   "Enter valid credentials" → "Enter admin@example.com in the username field"
   *   "Type the password" → "Type secretPass123 into the password field"
   *
   * This runs BEFORE the AI sees the step, so the AI always gets concrete values.
   */
        private resolveCredentialStep(
      stepAction: string,
      testDataMap: Map<string, string>,
      snapshot: PageSnapshot,
      logs: string[]
    ): string {
      if (!stepAction || typeof stepAction !== 'string') {
        logs.push(`[resolve] Invalid stepAction received - not a string`);
        return '';
      }
      if (!testDataMap || testDataMap.size === 0) {
        logs.push(`[resolve] No test data available - cannot resolve placeholders`);
        return stepAction;
      }

      console.log(`\n[AIExecutor] 🔍 ═══════════════════════════════════════════════════════════`);
      console.log(`[AIExecutor] 🔍 RESOLVING CREDENTIAL STEP`);
      console.log(`[AIExecutor] 🔍 ─────────────────────────────────────────────────────────────`);
      console.log(`[AIExecutor] 🔍 Original step: "${stepAction}"`);
      console.log(`[AIExecutor] 🔍 Test data keys available: [${Array.from(testDataMap.keys()).slice(0, 10).join(", ")}${testDataMap.size > 10 ? `... +${testDataMap.size - 10}` : ""}]`);

      // Step 1: Replace {{placeholder}} tokens with actual values
      let resolved = stepAction;
      const placeholderRegex = /\{\{([^}]+)\}\}/g;
      let match;
      placeholderRegex.lastIndex = 0;
      const original = resolved;
      const foundPlaceholders: Array<{key: string, found: boolean}> = [];
    
      while ((match = placeholderRegex.exec(original)) !== null) {
        const key = match[1].trim();
        const value = testDataMap.get(key) ?? testDataMap.get(key.toLowerCase()) ?? testDataMap.get(key.toUpperCase());
        const displayValue = key.toLowerCase().includes("pass") ? "[MASKED]" : value;
      
        if (value !== undefined) {
          resolved = resolved.split(match[0]).join(value);
          console.log(`[AIExecutor] 🔍   ✓ Resolved {{${key}}} → "${displayValue}"`);
          logs.push(`[resolve] {{${key}}} → "${displayValue}"`);
          foundPlaceholders.push({key, found: true});
        } else {
          console.log(`[AIExecutor] 🔍   ✗ Placeholder {{${key}}} NOT found in test data`);
          logs.push(`[resolve] {{${key}}} → NOT FOUND in test data`);
          foundPlaceholders.push({key, found: false});
        }
      }

    // Step 2: Gather credential values from testDataMap
    const username = testDataMap.get("username") ?? testDataMap.get("email") ??
                     testDataMap.get("user") ?? testDataMap.get("login") ??
                     testDataMap.get("userid") ?? testDataMap.get("user_id");
    const password = testDataMap.get("password") ?? testDataMap.get("pass") ??
                     testDataMap.get("pwd") ?? testDataMap.get("passwd");

    // Step 3: Find actual input fields from the live page snapshot
    const visibleInputs = snapshot.elements.filter(el =>
      el.tag === "input" && el.isVisible && el.isEnabled
    );
    const usernameField = visibleInputs.find(el =>
      el.type !== "password" &&
      (el.id?.toLowerCase().match(/user|email|login|name|account|uid/) ||
       el.name?.toLowerCase().match(/user|email|login|name|account|uid/) ||
       el.placeholder?.toLowerCase().match(/user|email|login|name|account/) ||
       el.ariaLabel?.toLowerCase().match(/user|email|login|name|account/))
    ) ?? visibleInputs.find(el => el.type === "text" || el.type === "email" || !el.type);

    const passwordField = visibleInputs.find(el => el.type === "password");

    const lower = resolved.toLowerCase();

        // Pattern: "enter username" / "type username" / "input username" / "fill username"
    const isUsernameStep = resolved && (
      /(?:enter|type|input|fill|provide|put)\s+(?:the\s+|your\s+|a\s+|valid\s+)?(?:user\s*name|username|email|user\s*id|login\s*id|login\s*name|account\s*name|user)(?:\s+field|\s+here|\s+below)?\s*$/i.test(resolved) ||
      /(?:enter|type|input|fill)\s+(?:valid\s+)?(?:user\s*name|username|email)\s+(?:in|into|on|at)\s+/i.test(resolved) ||
      /(?:in|into|on)\s+(?:the\s+)?(?:user\s*name|username|email|login)\s+(?:field|box|input)/i.test(resolved)
    );

    // Pattern: "enter password" / "type password"
    const isPasswordStep = resolved && (
      /(?:enter|type|input|fill|provide|put)\s+(?:the\s+|your\s+|a\s+|valid\s+)?(?:password|pass\s*word|pass|pwd|secret)(?:\s+field|\s+here|\s+below)?\s*$/i.test(resolved) ||
      /(?:enter|type|input|fill)\s+(?:valid\s+)?(?:password|pass)\s+(?:in|into|on|at)\s+/i.test(resolved) ||
      /(?:in|into|on)\s+(?:the\s+)?(?:password|pass)\s+(?:field|box|input)/i.test(resolved)
    );

    // Pattern: "enter credentials" / "log in" / "sign in" / "login with"
    const isCredentialsStep = resolved && (
      /(?:enter|type|input|fill|provide|use)\s+(?:valid\s+|the\s+|your\s+)?credentials/i.test(resolved) ||
      /(?:log\s*in|sign\s*in|login|signin)\s+(?:with\s+)?(?:valid\s+|the\s+|your\s+)?(?:credentials|details|info)?/i.test(resolved) ||
      /(?:authenticate|submit\s+login|click\s+login\s+button)/i.test(resolved)
    );

        // Step 4: Detect and inject credentials
    console.log(`[AIExecutor] 🔍 ─────────────────────────────────────────────────────────────`);
    console.log(`[AIExecutor] 🔍 PATTERN DETECTION:`);
    console.log(`[AIExecutor] 🔍   isUsernameStep: ${isUsernameStep}, found: ${!!username}`);
    console.log(`[AIExecutor] 🔍   isPasswordStep: ${isPasswordStep}, found: ${!!password}`);
    console.log(`[AIExecutor] 🔍   isCredentialsStep: ${isCredentialsStep}`);
    console.log(`[AIExecutor] 🔍   usernameField xpath: ${usernameField?.xpath ?? "NOT FOUND"}`);
    console.log(`[AIExecutor] 🔍   passwordField xpath: ${passwordField?.xpath ?? "NOT FOUND"}`);
    
    if (isUsernameStep && username) {
      const xpath = usernameField?.xpath ?? "//input[@type='text' or @type='email' or not(@type)][1]";
      resolved = `Type "${username}" into the username input field at xpath: ${xpath}`;
      console.log(`[AIExecutor] 🔍 ✓ Username injection: "${username}" → ${xpath}`);
      logs.push(`[resolve] Username injection: "${username}" → ${xpath}`);
    } else if (isPasswordStep && password) {
      const xpath = passwordField?.xpath ?? "//input[@type='password'][1]";
      resolved = `Type "${password}" into the password input field at xpath: ${xpath}`;
      console.log(`[AIExecutor] 🔍 ✓ Password injection: [MASKED] → ${xpath}`);
      logs.push(`[resolve] Password injection: [MASKED] → ${xpath}`);
    } else if (isCredentialsStep && username && password) {
      // For a combined credentials step, focus on username first
      const uxpath = usernameField?.xpath ?? "//input[@type='text' or @type='email'][1]";
      const pxpath = passwordField?.xpath ?? "//input[@type='password'][1]";
      resolved = `Type "${username}" into the username field at xpath: ${uxpath} and type "${password}" into the password field at xpath: ${pxpath}`;
      console.log(`[AIExecutor] 🔍 ✓ Combined credentials injection:`);
      console.log(`[AIExecutor] 🔍   Username: "${username}" → ${uxpath}`);
      console.log(`[AIExecutor] 🔍   Password: [MASKED] → ${pxpath}`);
      logs.push(`[resolve] Combined credentials: username+password injected`);
    }

    console.log(`[AIExecutor] 🔍 ─────────────────────────────────────────────────────────────`);
    if (resolved !== stepAction) {
      console.log(`[AIExecutor] 🔍 FINAL RESOLVED STEP:`);
      console.log(`[AIExecutor] 🔍   "${stepAction}"`);
      console.log(`[AIExecutor] 🔍   ↓↓↓`);
      console.log(`[AIExecutor] 🔍   "${resolved}"`);
      console.log(`[AIExecutor] 🔍 ═══════════════════════════════════════════════════════════\n`);
      logs.push(`[resolve] Step resolved: test data injected`);
    } else {
      console.log(`[AIExecutor] 🔍 NO CHANGES - Step already contains concrete values\n`);
    }
    return resolved;
  }

  /**
   * Robust typing that works with React/Angular/Vue controlled inputs.
   * Strategy:
   *   1. Click to focus
   *   2. Select-all + Delete to clear
   *   3. sendKeys for the value
   *   4. If value still empty, use JS nativeInputValueSetter trick (React)
   *   5. Dispatch input + change events so framework state updates
   */
    private async typeIntoElement(element: WebElement, value: string, logs: string[]): Promise<void> {
      if (!this.driver) return;

      const inputType = (await element.getAttribute("type") || "").toLowerCase();
      const isPasswordField = inputType === "password";
      const elementId = (await element.getAttribute("id")) || (await element.getAttribute("name")) || "unknown";
      const displayValue = isPasswordField ? `[PASSWORD-${value.length}chars]` : value;
    
            logs.push(`Typing into ${elementId}: ${displayValue}`);
    }

    private async captureScreenshot(): Promise<string> {
      if (!this.driver) return '';
      const screenshot = await this.driver.takeScreenshot();
      return screenshot.toString('base64');
    }

    private async collectPerformanceMetrics(): Promise<any> {
      if (!this.driver) return null;
      return await this.driver.executeScript(`
        const perfTiming = performance.timing;
        const perfNav = performance.navigation;
        return {
          pageLoadTime: perfTiming.loadEventEnd - perfTiming.navigationStart,
          domContentLoaded: perfTiming.domContentLoadedEventEnd - perfTiming.navigationStart,
          firstPaint: perfTiming.responseEnd - perfTiming.navigationStart,
          timeToFirstByte: perfTiming.responseStart - perfTiming.navigationStart,
          memoryUsed: performance.memory?.usedJSHeapSize || 0
        };
      `);
    }

    private async cleanup(): Promise<void> {
      if (this.driver) {
        try {
          await this.driver.quit();
          this.driver = null;
        } catch (e) {
          console.error('[AIExecutor] Cleanup error:', e);
        }
      }
      if (this.playwrightBrowser) {
        try {
          await this.playwrightBrowser.close();
          this.playwrightBrowser = null;
        } catch (e) {
          console.error('[AIExecutor] Playwright cleanup error:', e);
        }
      }
    }
  }

  // Export as singleton instance for use in other modules
  export const aiTestExecutor = new AITestExecutor();
  export default AITestExecutor;
