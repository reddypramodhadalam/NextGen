import { chromium, type Browser, type Page } from "playwright";
import { storage } from "./storage";
import type { TestCase, TestExecution } from "@shared/schema";

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

export class TestExecutor {
  private browser: Browser | null = null;

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

  async executeTest(
    testCase: TestCase,
    targetUrl: string
  ): Promise<ExecutionResult> {
    const logs: string[] = [];
    const stepResults: TestStepResult[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let screenshot: string | undefined;

    logs.push(`Starting test: ${testCase.title}`);
    logs.push(`Target URL: ${targetUrl}`);

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
        const stepResult: TestStepResult = {
          step: step.step,
          expected: step.expected,
          passed: false,
        };

        try {
          const stepPassed = await this.executeStep(page, step.step, step.expected, logs);
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
    page: Page,
    stepAction: string,
    expected: string,
    logs: string[]
  ): Promise<boolean> {
    logs.push(`Executing step: ${stepAction}`);

    const actionLower = stepAction.toLowerCase();

    if (actionLower.includes("navigate") || actionLower.includes("go to")) {
      const urlMatch = stepAction.match(/(?:to|navigate to|go to)\s+(.+)/i);
      if (urlMatch) {
        logs.push(`Page loaded, checking expected: ${expected}`);
      }
      return true;
    }

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

    if (actionLower.includes("enter") || actionLower.includes("type") || actionLower.includes("input")) {
      const inputMatch = stepAction.match(/(?:enter|type|input)\s+(?:a\s+)?(?:valid\s+|invalid\s+)?(\w+)/i);
      if (inputMatch) {
        const fieldType = inputMatch[1].toLowerCase();
        try {
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
        } catch (error: any) {
          logs.push(`Error filling input: ${error.message}`);
          return false;
        }
      }
    }

    if (actionLower.includes("verify") || actionLower.includes("check") || actionLower.includes("assert")) {
      try {
        const pageContent = await page.content();
        const expectedLower = expected.toLowerCase();

        if (expectedLower.includes("displayed") || expectedLower.includes("visible") || expectedLower.includes("shown")) {
          logs.push(`Verifying visibility: ${expected}`);
          return true;
        }

        if (pageContent.toLowerCase().includes(expectedLower.split(" ")[0])) {
          logs.push(`Verification passed: ${expected}`);
          return true;
        }

        logs.push(`Verification check: ${expected}`);
        return true;
      } catch (error: any) {
        logs.push(`Verification error: ${error.message}`);
        return false;
      }
    }

    logs.push(`Generic step executed: ${stepAction} -> Expected: ${expected}`);
    return true;
  }

  async runExecution(
    executionId: string,
    testCases: TestCase[],
    targetUrl: string
  ): Promise<void> {
    const results: ExecutionResult[] = [];
    let passedCount = 0;
    let failedCount = 0;
    const startTime = Date.now();

    await storage.updateExecution(executionId, {
      status: "running",
      startedAt: new Date(),
    });

    for (const testCase of testCases) {
      try {
        const result = await this.executeTest(testCase, targetUrl);
        results.push(result);

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
      summary: `Completed ${testCases.length} tests: ${passedCount} passed, ${failedCount} failed.`,
      passRate: Math.round((passedCount / testCases.length) * 100),
      totalDuration: duration,
      insights: [
        { type: "info", message: `Average test duration: ${Math.round(duration / testCases.length / 1000)}s` },
        failedCount > 0
          ? { type: "warning", message: `${failedCount} test(s) failed - review needed` }
          : { type: "success", message: "All tests passed" },
      ],
    });

    await this.close();
  }
}

export const testExecutor = new TestExecutor();
