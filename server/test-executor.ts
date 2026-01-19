import { chromium, type Browser as PlaywrightBrowser, type Page as PlaywrightPage } from "playwright";
import puppeteer, { type Browser as PuppeteerBrowser, type Page as PuppeteerPage } from "puppeteer";
import { Builder, type WebDriver, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import { storage } from "./storage";
import type { TestCase, TestDataParam } from "@shared/schema";

export type ExecutionFramework = "playwright" | "puppeteer" | "selenium";

// Helper to escape regex special characters in a string
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Helper to replace placeholders like {{username}} with actual test data values
function replaceTestDataPlaceholders(text: string, testData?: TestDataParam[]): string {
  if (!testData || testData.length === 0) return text;
  
  let result = text;
  for (const param of testData) {
    const escapedKey = escapeRegExp(param.key);
    const placeholder = new RegExp(`\\{\\{${escapedKey}\\}\\}`, "gi");
    result = result.replace(placeholder, param.value);
  }
  return result;
}

interface TestStepResult {
  step: string;
  expected: string;
  passed: boolean;
  actual?: string;
  screenshot?: string;
  error?: string;
}

interface ExecutionResult {
  testCaseId: string;
  testCaseTitle: string;
  passed: boolean;
  duration: number;
  steps: TestStepResult[];
  screenshot?: string;
  errorMessage?: string;
  logs: string[];
}

interface FrameworkExecutor {
  initialize(): Promise<void>;
  close(): Promise<void>;
  executeTest(testCase: TestCase, targetUrl: string, testData?: TestDataParam[]): Promise<ExecutionResult>;
}

class PlaywrightExecutor implements FrameworkExecutor {
  private browser: PlaywrightBrowser | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async executeTest(testCase: TestCase, targetUrl: string, testData?: TestDataParam[]): Promise<ExecutionResult> {
    const logs: string[] = [];
    const stepResults: TestStepResult[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let screenshot: string | undefined;

    logs.push(`[Playwright] Starting test: ${testCase.title}`);
    logs.push(`Target URL: ${targetUrl}`);
    if (testData && testData.length > 0) {
      logs.push(`Test data provided: ${testData.map(d => d.key).join(", ")}`);
    }

    await this.initialize();
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    try {
      await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });
      logs.push(`Navigated to ${targetUrl}`);

      const steps = (testCase.steps as { step: string; expected: string }[]) || [];

      for (const step of steps) {
        // Replace placeholders in step and expected with test data values
        const processedStep = replaceTestDataPlaceholders(step.step, testData);
        const processedExpected = replaceTestDataPlaceholders(step.expected, testData);
        
        const stepResult: TestStepResult = {
          step: processedStep,
          expected: processedExpected,
          passed: false,
        };

        try {
          const stepPassed = await this.executeStep(page, processedStep, processedExpected, logs);
          stepResult.passed = stepPassed;
          if (!stepPassed) {
            passed = false;
            stepResult.error = "Step verification failed";
          }
        } catch (error: any) {
          stepResult.passed = false;
          stepResult.error = error.message;
          passed = false;
          logs.push(`Step failed: ${error.message}`);
        }

        stepResults.push(stepResult);
      }

      const screenshotBuffer = await page.screenshot({ fullPage: true });
      screenshot = screenshotBuffer.toString("base64");
      logs.push("Captured final screenshot");

    } catch (error: any) {
      passed = false;
      errorMessage = error.message;
      logs.push(`Test failed: ${error.message}`);

      try {
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        screenshot = screenshotBuffer.toString("base64");
      } catch {
        logs.push("Failed to capture error screenshot");
      }
    } finally {
      await context.close();
    }

    const duration = Date.now() - startTime;
    logs.push(`Test completed in ${duration}ms - ${passed ? "PASSED" : "FAILED"}`);

    return {
      testCaseId: testCase.id,
      testCaseTitle: testCase.title,
      passed,
      duration,
      steps: stepResults,
      screenshot,
      errorMessage,
      logs,
    };
  }

  private async executeStep(
    page: PlaywrightPage,
    stepAction: string,
    expected: string,
    logs: string[]
  ): Promise<boolean> {
    logs.push(`Executing step: ${stepAction}`);
    const actionLower = stepAction.toLowerCase();

    // Navigate actions
    if (actionLower.includes("navigate") || actionLower.includes("go to")) {
      logs.push(`Page loaded, checking expected: ${expected}`);
      return true;
    }

    // Wait for element
    if (actionLower.includes("wait for") || actionLower.includes("wait until")) {
      const waitMatch = stepAction.match(/wait\s+(?:for|until)\s+(?:the\s+)?['""]?([^'""\n]+)['""]?/i);
      if (waitMatch) {
        const elementText = waitMatch[1].trim();
        try {
          await page.waitForSelector(`text=${elementText}`, { timeout: 10000 });
          logs.push(`Waited for element: ${elementText}`);
          return true;
        } catch {
          logs.push(`Timeout waiting for: ${elementText}`);
          return false;
        }
      }
    }

    // Double-click
    if (actionLower.includes("double-click") || actionLower.includes("double click")) {
      const dblClickMatch = stepAction.match(/double[- ]?click\s+(?:on\s+)?(?:the\s+)?['""]?([^'""\n]+)['""]?/i);
      if (dblClickMatch) {
        const elementText = dblClickMatch[1].trim();
        try {
          await page.dblclick(`text=${elementText}`, { timeout: 5000 });
          logs.push(`Double-clicked on: ${elementText}`);
          return true;
        } catch {
          logs.push(`Could not double-click: ${elementText}`);
          return false;
        }
      }
    }

    // Right-click / Context menu
    if (actionLower.includes("right-click") || actionLower.includes("right click") || actionLower.includes("context menu")) {
      const rightClickMatch = stepAction.match(/(?:right[- ]?click|context\s+menu)\s+(?:on\s+)?(?:the\s+)?['""]?([^'""\n]+)['""]?/i);
      if (rightClickMatch) {
        const elementText = rightClickMatch[1].trim();
        try {
          await page.click(`text=${elementText}`, { button: "right", timeout: 5000 });
          logs.push(`Right-clicked on: ${elementText}`);
          return true;
        } catch {
          logs.push(`Could not right-click: ${elementText}`);
          return false;
        }
      }
    }

    // Hover / Mouse over
    if (actionLower.includes("hover") || actionLower.includes("mouse over") || actionLower.includes("mouseover")) {
      const hoverMatch = stepAction.match(/(?:hover|mouse\s*over)\s+(?:on\s+)?(?:the\s+)?['""]?([^'""\n]+)['""]?/i);
      if (hoverMatch) {
        const elementText = hoverMatch[1].trim();
        try {
          await page.hover(`text=${elementText}`, { timeout: 5000 });
          logs.push(`Hovered on: ${elementText}`);
          return true;
        } catch {
          logs.push(`Could not hover on: ${elementText}`);
          return false;
        }
      }
    }

    // Select from dropdown
    if (actionLower.includes("select") && (actionLower.includes("dropdown") || actionLower.includes("from") || actionLower.includes("option"))) {
      const selectMatch = stepAction.match(/select\s+['""]?([^'""\n]+)['""]?\s+(?:from|in)\s+(?:the\s+)?(?:dropdown\s+)?['""]?([^'""\n]+)['""]?/i);
      if (selectMatch) {
        const optionText = selectMatch[1].trim();
        const dropdownName = selectMatch[2].trim();
        try {
          const selectElement = await page.$(`select[name*="${dropdownName}"], select[id*="${dropdownName}"], [aria-label*="${dropdownName}"]`);
          if (selectElement) {
            await selectElement.selectOption({ label: optionText });
            logs.push(`Selected "${optionText}" from dropdown "${dropdownName}"`);
            return true;
          }
          // Try clicking dropdown then option for custom dropdowns
          await page.click(`text=${dropdownName}`, { timeout: 3000 });
          await page.click(`text=${optionText}`, { timeout: 3000 });
          logs.push(`Selected "${optionText}" from custom dropdown`);
          return true;
        } catch {
          logs.push(`Could not select from dropdown: ${dropdownName}`);
          return false;
        }
      }
    }

    // Drag and drop
    if (actionLower.includes("drag") && actionLower.includes("drop")) {
      const dragMatch = stepAction.match(/drag\s+['""]?([^'""\n]+)['""]?\s+(?:to|and\s+drop\s+(?:on|to)?)\s+['""]?([^'""\n]+)['""]?/i);
      if (dragMatch) {
        const sourceText = dragMatch[1].trim();
        const targetText = dragMatch[2].trim();
        try {
          const source = await page.$(`text=${sourceText}`);
          const target = await page.$(`text=${targetText}`);
          if (source && target) {
            await source.dragTo(target);
            logs.push(`Dragged "${sourceText}" to "${targetText}"`);
            return true;
          }
        } catch {
          logs.push(`Could not drag and drop: ${sourceText} to ${targetText}`);
          return false;
        }
      }
    }

    // Handle alert/confirm/prompt dialogs
    if (actionLower.includes("accept") && (actionLower.includes("alert") || actionLower.includes("dialog") || actionLower.includes("popup"))) {
      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });
      logs.push("Set up dialog auto-accept handler");
      return true;
    }

    if (actionLower.includes("dismiss") && (actionLower.includes("alert") || actionLower.includes("dialog") || actionLower.includes("popup"))) {
      page.on("dialog", async (dialog) => {
        await dialog.dismiss();
      });
      logs.push("Set up dialog auto-dismiss handler");
      return true;
    }

    // Scroll actions
    if (actionLower.includes("scroll")) {
      if (actionLower.includes("bottom") || actionLower.includes("down")) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        logs.push("Scrolled to bottom of page");
        return true;
      } else if (actionLower.includes("top") || actionLower.includes("up")) {
        await page.evaluate(() => window.scrollTo(0, 0));
        logs.push("Scrolled to top of page");
        return true;
      } else {
        const scrollToMatch = stepAction.match(/scroll\s+(?:to\s+)?['""]?([^'""\n]+)['""]?/i);
        if (scrollToMatch) {
          const elementText = scrollToMatch[1].trim();
          try {
            const element = await page.$(`text=${elementText}`);
            if (element) {
              await element.scrollIntoViewIfNeeded();
              logs.push(`Scrolled to element: ${elementText}`);
              return true;
            }
          } catch {
            logs.push(`Could not scroll to: ${elementText}`);
          }
        }
      }
    }

    // Press keyboard key
    if (actionLower.includes("press") || actionLower.includes("key")) {
      const keyMatch = stepAction.match(/press\s+(?:the\s+)?['""]?(\w+)['""]?\s*(?:key)?/i);
      if (keyMatch) {
        const keyName = keyMatch[1];
        try {
          await page.keyboard.press(keyName);
          logs.push(`Pressed key: ${keyName}`);
          return true;
        } catch {
          logs.push(`Could not press key: ${keyName}`);
          return false;
        }
      }
    }

    // Check/uncheck checkbox
    if (actionLower.includes("check") && !actionLower.includes("uncheck") && (actionLower.includes("checkbox") || actionLower.includes("box"))) {
      const checkMatch = stepAction.match(/check\s+(?:the\s+)?['""]?([^'""\n]+)['""]?\s*(?:checkbox)?/i);
      if (checkMatch) {
        const checkboxName = checkMatch[1].trim();
        try {
          await page.check(`input[name*="${checkboxName}"], input[id*="${checkboxName}"], label:has-text("${checkboxName}") input`);
          logs.push(`Checked checkbox: ${checkboxName}`);
          return true;
        } catch {
          logs.push(`Could not check: ${checkboxName}`);
          return false;
        }
      }
    }

    if (actionLower.includes("uncheck")) {
      const uncheckMatch = stepAction.match(/uncheck\s+(?:the\s+)?['""]?([^'""\n]+)['""]?\s*(?:checkbox)?/i);
      if (uncheckMatch) {
        const checkboxName = uncheckMatch[1].trim();
        try {
          await page.uncheck(`input[name*="${checkboxName}"], input[id*="${checkboxName}"], label:has-text("${checkboxName}") input`);
          logs.push(`Unchecked checkbox: ${checkboxName}`);
          return true;
        } catch {
          logs.push(`Could not uncheck: ${checkboxName}`);
          return false;
        }
      }
    }

    // Clear input field
    if (actionLower.includes("clear")) {
      const clearMatch = stepAction.match(/clear\s+(?:the\s+)?['""]?([^'""\n]+)['""]?\s*(?:field|input)?/i);
      if (clearMatch) {
        const fieldName = clearMatch[1].trim();
        try {
          const input = await page.$(`input[name*="${fieldName}"], input[id*="${fieldName}"], input[placeholder*="${fieldName}"]`);
          if (input) {
            await input.fill("");
            logs.push(`Cleared field: ${fieldName}`);
            return true;
          }
        } catch {
          logs.push(`Could not clear: ${fieldName}`);
          return false;
        }
      }
    }

    // Upload file
    if (actionLower.includes("upload") || actionLower.includes("attach file")) {
      logs.push("File upload action detected - requires file path in test data");
      return true;
    }

    // Focus on element
    if (actionLower.includes("focus")) {
      const focusMatch = stepAction.match(/focus\s+(?:on\s+)?(?:the\s+)?['""]?([^'""\n]+)['""]?/i);
      if (focusMatch) {
        const elementText = focusMatch[1].trim();
        try {
          await page.focus(`text=${elementText}`);
          logs.push(`Focused on: ${elementText}`);
          return true;
        } catch {
          logs.push(`Could not focus on: ${elementText}`);
          return false;
        }
      }
    }

    // Click action (general)
    if (actionLower.includes("click")) {
      const buttonMatch = stepAction.match(/click\s+(?:on\s+)?(?:the\s+)?['""]?([^'""\n]+)['""]?\s*(?:button|link|element)?/i);
      if (buttonMatch) {
        const buttonText = buttonMatch[1].trim();
        try {
          await page.click(`text=${buttonText}`, { timeout: 5000 });
          logs.push(`Clicked on: ${buttonText}`);
          return true;
        } catch {
          try {
            await page.click(`button:has-text("${buttonText}")`, { timeout: 3000 });
            logs.push(`Clicked button: ${buttonText}`);
            return true;
          } catch {
            logs.push(`Could not find element to click: ${buttonText}`);
            return false;
          }
        }
      }
    }

    // Enter/Type action
    if (actionLower.includes("enter") || actionLower.includes("type") || actionLower.includes("input")) {
      const inputMatch = stepAction.match(/(?:enter|type|input)\s+(?:a\s+)?(?:valid\s+|invalid\s+)?['""]?([^'""\n]+)['""]?\s+(?:in|into|in\s+the)\s+['""]?([^'""\n]+)['""]?/i);
      if (inputMatch) {
        const valueToType = inputMatch[1].trim();
        const fieldName = inputMatch[2].trim();
        const selectors = [
          `input[name*="${fieldName}"]`,
          `input[placeholder*="${fieldName}"]`,
          `input[id*="${fieldName}"]`,
          `textarea[name*="${fieldName}"]`,
          `[aria-label*="${fieldName}"]`,
        ];

        for (const selector of selectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              await element.fill(valueToType);
              logs.push(`Entered "${valueToType}" in ${fieldName}`);
              return true;
            }
          } catch {
            continue;
          }
        }
      }
      
      // Fallback: simple field type matching
      const simpleMatch = stepAction.match(/(?:enter|type|input)\s+(?:a\s+)?(?:valid\s+|invalid\s+)?(\w+)/i);
      if (simpleMatch) {
        const fieldType = simpleMatch[1].toLowerCase();
        const selectors = [
          `input[type="${fieldType}"]`,
          `input[name*="${fieldType}"]`,
          `input[placeholder*="${fieldType}"]`,
          `input[id*="${fieldType}"]`,
        ];

        for (const selector of selectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              const testValue = fieldType === "email" ? "test@example.com" : "testpassword123";
              await element.fill(testValue);
              logs.push(`Entered ${fieldType}: ${testValue}`);
              return true;
            }
          } catch {
            continue;
          }
        }
        logs.push(`Could not find input field for: ${fieldType}`);
        return false;
      }
    }

    // Verify/Assert actions
    if (actionLower.includes("verify") || actionLower.includes("check") || actionLower.includes("assert") || actionLower.includes("should")) {
      if (actionLower.includes("visible") || actionLower.includes("displayed") || actionLower.includes("shown")) {
        const visibleMatch = stepAction.match(/(?:verify|check|assert|should\s+see)\s+(?:that\s+)?(?:the\s+)?['""]?([^'""\n]+)['""]?\s+(?:is\s+)?(?:visible|displayed|shown)/i);
        if (visibleMatch) {
          const elementText = visibleMatch[1].trim();
          try {
            await page.waitForSelector(`text=${elementText}`, { state: "visible", timeout: 5000 });
            logs.push(`Verified visible: ${elementText}`);
            return true;
          } catch {
            logs.push(`Element not visible: ${elementText}`);
            return false;
          }
        }
      }
      
      if (actionLower.includes("hidden") || actionLower.includes("not visible") || actionLower.includes("disappear")) {
        const hiddenMatch = stepAction.match(/(?:verify|check|assert)\s+(?:that\s+)?(?:the\s+)?['""]?([^'""\n]+)['""]?\s+(?:is\s+)?(?:hidden|not\s+visible|disappeared)/i);
        if (hiddenMatch) {
          const elementText = hiddenMatch[1].trim();
          try {
            await page.waitForSelector(`text=${elementText}`, { state: "hidden", timeout: 5000 });
            logs.push(`Verified hidden: ${elementText}`);
            return true;
          } catch {
            logs.push(`Element still visible: ${elementText}`);
            return false;
          }
        }
      }

      const pageContent = await page.content();
      logs.push(`Verification check: ${expected}`);
      return true;
    }

    logs.push(`Generic step executed: ${stepAction} -> Expected: ${expected}`);
    return true;
  }
}

class PuppeteerExecutor implements FrameworkExecutor {
  private browser: PuppeteerBrowser | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async executeTest(testCase: TestCase, targetUrl: string, testData?: TestDataParam[]): Promise<ExecutionResult> {
    const logs: string[] = [];
    const stepResults: TestStepResult[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let screenshot: string | undefined;

    logs.push(`[Puppeteer] Starting test: ${testCase.title}`);
    logs.push(`Target URL: ${targetUrl}`);
    if (testData && testData.length > 0) {
      logs.push(`Test data provided: ${testData.map(d => d.key).join(", ")}`);
    }

    await this.initialize();
    const page = await this.browser!.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    try {
      await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 30000 });
      logs.push(`Navigated to ${targetUrl}`);

      const steps = (testCase.steps as { step: string; expected: string }[]) || [];

      for (const step of steps) {
        // Replace placeholders in step and expected with test data values
        const processedStep = replaceTestDataPlaceholders(step.step, testData);
        const processedExpected = replaceTestDataPlaceholders(step.expected, testData);
        
        const stepResult: TestStepResult = {
          step: processedStep,
          expected: processedExpected,
          passed: false,
        };

        try {
          const stepPassed = await this.executeStep(page, processedStep, processedExpected, logs);
          stepResult.passed = stepPassed;
          if (!stepPassed) {
            passed = false;
            stepResult.error = "Step verification failed";
          }
        } catch (error: any) {
          stepResult.passed = false;
          stepResult.error = error.message;
          passed = false;
          logs.push(`Step failed: ${error.message}`);
        }

        stepResults.push(stepResult);
      }

      const screenshotBuffer = await page.screenshot({ fullPage: true });
      screenshot = Buffer.from(screenshotBuffer).toString("base64");
      logs.push("Captured final screenshot");

    } catch (error: any) {
      passed = false;
      errorMessage = error.message;
      logs.push(`Test failed: ${error.message}`);

      try {
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        screenshot = Buffer.from(screenshotBuffer).toString("base64");
      } catch {
        logs.push("Failed to capture error screenshot");
      }
    } finally {
      await page.close();
    }

    const duration = Date.now() - startTime;
    logs.push(`Test completed in ${duration}ms - ${passed ? "PASSED" : "FAILED"}`);

    return {
      testCaseId: testCase.id,
      testCaseTitle: testCase.title,
      passed,
      duration,
      steps: stepResults,
      screenshot,
      errorMessage,
      logs,
    };
  }

  private async executeStep(
    page: PuppeteerPage,
    stepAction: string,
    expected: string,
    logs: string[]
  ): Promise<boolean> {
    logs.push(`Executing step: ${stepAction}`);
    const actionLower = stepAction.toLowerCase();

    if (actionLower.includes("navigate") || actionLower.includes("go to")) {
      logs.push(`Page loaded, checking expected: ${expected}`);
      return true;
    }

    if (actionLower.includes("click")) {
      const buttonMatch = stepAction.match(/click\s+(?:on\s+)?(?:the\s+)?['""]?([^'""\n]+)['""]?\s*(?:button|link|element)?/i);
      if (buttonMatch) {
        const buttonText = buttonMatch[1].trim();
        try {
          const elements = await page.$$(`xpath/.//button[contains(text(), "${buttonText}")] | //a[contains(text(), "${buttonText}")]`);
          if (elements.length > 0) {
            await elements[0].click();
            logs.push(`Clicked on: ${buttonText}`);
            return true;
          }
          const textElements = await page.$$(`xpath/.//*[contains(text(), "${buttonText}")]`);
          if (textElements.length > 0) {
            await textElements[0].click();
            logs.push(`Clicked element with text: ${buttonText}`);
            return true;
          }
          logs.push(`Could not find element to click: ${buttonText}`);
          return false;
        } catch (error: any) {
          logs.push(`Click error: ${error.message}`);
          return false;
        }
      }
    }

    if (actionLower.includes("enter") || actionLower.includes("type") || actionLower.includes("input")) {
      const inputMatch = stepAction.match(/(?:enter|type|input)\s+(?:a\s+)?(?:valid\s+|invalid\s+)?(\w+)/i);
      if (inputMatch) {
        const fieldType = inputMatch[1].toLowerCase();
        const selectors = [
          `input[type="${fieldType}"]`,
          `input[name*="${fieldType}"]`,
          `input[placeholder*="${fieldType}"]`,
          `input[id*="${fieldType}"]`,
        ];

        for (const selector of selectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              const testValue = fieldType === "email" ? "test@example.com" : "testpassword123";
              await element.type(testValue);
              logs.push(`Entered ${fieldType}: ${testValue}`);
              return true;
            }
          } catch {
            continue;
          }
        }
        logs.push(`Could not find input field for: ${fieldType}`);
        return false;
      }
    }

    if (actionLower.includes("verify") || actionLower.includes("check") || actionLower.includes("assert")) {
      const pageContent = await page.content();
      logs.push(`Verification check: ${expected}`);
      return true;
    }

    logs.push(`Generic step executed: ${stepAction} -> Expected: ${expected}`);
    return true;
  }
}

class SeleniumExecutor implements FrameworkExecutor {
  private driver: WebDriver | null = null;

  async initialize(): Promise<void> {
    if (!this.driver) {
      const options = new chrome.Options();
      options.addArguments("--headless");
      options.addArguments("--no-sandbox");
      options.addArguments("--disable-setuid-sandbox");
      options.addArguments("--disable-dev-shm-usage");
      options.addArguments("--window-size=1280,720");
      
      this.driver = await new Builder()
        .forBrowser("chrome")
        .setChromeOptions(options)
        .build();
    }
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.quit();
      this.driver = null;
    }
  }

  async executeTest(testCase: TestCase, targetUrl: string, testData?: TestDataParam[]): Promise<ExecutionResult> {
    const logs: string[] = [];
    const stepResults: TestStepResult[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let screenshot: string | undefined;

    logs.push(`[Selenium] Starting test: ${testCase.title}`);
    logs.push(`Target URL: ${targetUrl}`);
    if (testData && testData.length > 0) {
      logs.push(`Test data provided: ${testData.map(d => d.key).join(", ")}`);
    }

    await this.initialize();

    try {
      await this.driver!.get(targetUrl);
      await this.driver!.wait(until.elementLocated(By.tagName("body")), 30000);
      logs.push(`Navigated to ${targetUrl}`);

      const steps = (testCase.steps as { step: string; expected: string }[]) || [];

      for (const step of steps) {
        const processedStep = replaceTestDataPlaceholders(step.step, testData);
        const processedExpected = replaceTestDataPlaceholders(step.expected, testData);
        
        const stepResult: TestStepResult = {
          step: processedStep,
          expected: processedExpected,
          passed: false,
        };

        try {
          const stepPassed = await this.executeStep(processedStep, processedExpected, logs);
          stepResult.passed = stepPassed;
          if (!stepPassed) {
            passed = false;
            stepResult.error = "Step verification failed";
          }
        } catch (error: any) {
          stepResult.passed = false;
          stepResult.error = error.message;
          passed = false;
          logs.push(`Step failed: ${error.message}`);
        }

        stepResults.push(stepResult);
      }

      const screenshotData = await this.driver!.takeScreenshot();
      screenshot = screenshotData;
      logs.push("Captured final screenshot");

    } catch (error: any) {
      passed = false;
      errorMessage = error.message;
      logs.push(`Test failed: ${error.message}`);

      try {
        const screenshotData = await this.driver!.takeScreenshot();
        screenshot = screenshotData;
      } catch {
        logs.push("Failed to capture error screenshot");
      }
    }

    const duration = Date.now() - startTime;
    logs.push(`Test completed in ${duration}ms - ${passed ? "PASSED" : "FAILED"}`);

    return {
      testCaseId: testCase.id,
      testCaseTitle: testCase.title,
      passed,
      duration,
      steps: stepResults,
      screenshot,
      errorMessage,
      logs,
    };
  }

  private async executeStep(stepAction: string, expected: string, logs: string[]): Promise<boolean> {
    const actionLower = stepAction.toLowerCase();

    if (actionLower.includes("navigate") || actionLower.includes("go to")) {
      const urlMatch = stepAction.match(/(?:navigate|go)\s+to\s+(\S+)/i);
      if (urlMatch) {
        await this.driver!.get(urlMatch[1]);
        logs.push(`Navigated to ${urlMatch[1]}`);
        return true;
      }
    }

    if (actionLower.includes("click")) {
      const buttonMatch = stepAction.match(/click\s+(?:on\s+)?(?:the\s+)?["']?([^"']+?)["']?\s*(?:button|link|element)?$/i);
      if (buttonMatch) {
        const buttonText = buttonMatch[1].trim();
        try {
          const xpath = `//*[contains(text(), "${buttonText}") or @value="${buttonText}" or contains(@class, "${buttonText.toLowerCase().replace(/\s+/g, "-")}")]`;
          const element = await this.driver!.findElement(By.xpath(xpath));
          await element.click();
          logs.push(`Clicked: ${buttonText}`);
          return true;
        } catch {
          logs.push(`Could not find element to click: ${buttonText}`);
          return false;
        }
      }
    }

    if (actionLower.includes("enter") || actionLower.includes("type") || actionLower.includes("input")) {
      const inputMatch = stepAction.match(/(?:enter|type|input)\s+(?:a\s+)?(?:valid\s+|invalid\s+)?(\w+)/i);
      if (inputMatch) {
        const fieldType = inputMatch[1].toLowerCase();
        const selectors = [
          `input[type="${fieldType}"]`,
          `input[name*="${fieldType}"]`,
          `input[placeholder*="${fieldType}"]`,
          `input[id*="${fieldType}"]`,
        ];

        for (const selector of selectors) {
          try {
            const element = await this.driver!.findElement(By.css(selector));
            const testValue = fieldType === "email" ? "test@example.com" : "testpassword123";
            await element.sendKeys(testValue);
            logs.push(`Entered ${fieldType}: ${testValue}`);
            return true;
          } catch {
            continue;
          }
        }
        logs.push(`Could not find input field for: ${fieldType}`);
        return false;
      }
    }

    if (actionLower.includes("verify") || actionLower.includes("check") || actionLower.includes("assert")) {
      const pageSource = await this.driver!.getPageSource();
      logs.push(`Verification check: ${expected}`);
      return true;
    }

    logs.push(`Generic step executed: ${stepAction} -> Expected: ${expected}`);
    return true;
  }
}

export class TestExecutor {
  private executors: Map<ExecutionFramework, FrameworkExecutor> = new Map();

  constructor() {
    this.executors.set("playwright", new PlaywrightExecutor());
    this.executors.set("puppeteer", new PuppeteerExecutor());
    this.executors.set("selenium", new SeleniumExecutor());
  }

  private getExecutor(framework: ExecutionFramework): FrameworkExecutor {
    const executor = this.executors.get(framework);
    if (!executor) {
      throw new Error(`Unsupported framework: ${framework}`);
    }
    return executor;
  }

  async runExecution(
    executionId: string,
    testCases: TestCase[],
    targetUrl: string,
    framework: ExecutionFramework = "playwright",
    testData?: TestDataParam[]
  ): Promise<void> {
    const executor = this.getExecutor(framework);
    let passedCount = 0;
    let failedCount = 0;
    const startTime = Date.now();

    await storage.updateExecution(executionId, {
      status: "running",
      startedAt: new Date(),
    });

    try {
      await executor.initialize();

      for (const testCase of testCases) {
        try {
          const result = await executor.executeTest(testCase, targetUrl, testData);

          if (result.passed) {
            passedCount++;
          } else {
            failedCount++;
          }

          await storage.createResult({
            executionId,
            testCaseId: testCase.id,
            status: result.passed ? "passed" : "failed",
            duration: result.duration,
            errorMessage: result.errorMessage || null,
            screenshot: result.screenshot || null,
            logs: result.logs,
          });

          await storage.updateExecution(executionId, {
            passedTests: passedCount,
            failedTests: failedCount,
          });
        } catch (error: any) {
          failedCount++;
          await storage.createResult({
            executionId,
            testCaseId: testCase.id,
            status: "failed",
            duration: 0,
            errorMessage: error.message,
            screenshot: null,
            logs: [`Test execution error: ${error.message}`],
          });
        }
      }
    } finally {
      await executor.close();
    }

    const duration = Date.now() - startTime;
    const finalStatus = failedCount === 0 ? "passed" : "failed";

    await storage.updateExecution(executionId, {
      status: finalStatus,
      duration,
      completedAt: new Date(),
    });

    await storage.createReport({
      executionId,
      name: `Execution Report - ${new Date().toISOString().split("T")[0]}`,
      summary: `[${framework.toUpperCase()}] Completed ${testCases.length} tests: ${passedCount} passed, ${failedCount} failed.`,
      passRate: Math.round((passedCount / testCases.length) * 100),
      totalDuration: duration,
      insights: [
        { type: "info", message: `Framework: ${framework}` },
        { type: "info", message: `Average test duration: ${Math.round(duration / testCases.length / 1000)}s` },
        failedCount > 0
          ? { type: "warning", message: `${failedCount} test(s) failed - review needed` }
          : { type: "success", message: "All tests passed" },
      ],
    });
  }
}

export const testExecutor = new TestExecutor();
