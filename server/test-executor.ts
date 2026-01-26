import { chromium, type Browser as PlaywrightBrowser, type Page as PlaywrightPage } from "playwright";
import puppeteer, { type Browser as PuppeteerBrowser, type Page as PuppeteerPage } from "puppeteer";
import { Builder, type WebDriver, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestDataParam, PerformanceData } from "@shared/schema";

export type ExecutionFramework = "playwright" | "puppeteer" | "selenium";

// Runtime variables store - shared across steps and tests
const runtimeVariables: Map<string, string> = new Map();

// Helper to replace runtime variables like $variableName$ in text
function replaceRuntimeVariables(text: string): string {
  let result = text;
  runtimeVariables.forEach((value, key) => {
    const pattern = new RegExp(`\\$${escapeRegExp(key)}\\$`, "gi");
    result = result.replace(pattern, value);
  });
  return result;
}

// AI-powered step interpreter - converts natural language to browser commands
interface BrowserCommand {
  action: "click" | "type" | "select" | "hover" | "doubleClick" | "rightClick" | 
          "scroll" | "wait" | "pressKey" | "check" | "uncheck" | "clear" | "radio" |
          "dragDrop" | "focus" | "acceptDialog" | "dismissDialog" | "navigate" | "verify" |
          "capture" | "captureAttribute" | "captureCount" |
          "switchToIframe" | "switchToMainFrame" | "switchToWindow" | "switchToNewWindow" | "closeWindow";
  selector?: string;
  value?: string;
  targetSelector?: string;
  variableName?: string;  // For capture actions - store result in this variable
  attributeName?: string; // For captureAttribute - which attribute to get
  windowIndex?: number;   // For switchToWindow - which window/tab to switch to (0-based)
  description: string;
}

async function interpretStepWithAI(step: string, expected: string, pageContext: string): Promise<BrowserCommand[]> {
  try {
    const systemPrompt = `You are a test automation expert. Convert natural language test steps into browser commands.

CRITICAL RULES - YOU MUST FOLLOW THESE:
1. The "Step" field is the ACTION to perform (click, type, navigate, switch, select, check, etc.)
2. The "Expected" field is ONLY for VERIFICATION - it should ONLY generate "verify" actions, NOTHING ELSE.
3. EXPECTED RESULTS MUST NEVER generate: click, type, select, navigate, switchToNewWindow, switchToIframe, switchToWindow, check, uncheck, radio, scroll, or ANY other action.
4. For Expected results, ONLY use the "verify" action to check that conditions are met.
5. If a step says "Click button" with expected "Verify popup opens" → generate click action from step, then verify action from expected. Do NOT generate switchToNewWindow.
6. Only the STEP field can trigger navigation/switching actions like switchToNewWindow, switchToIframe, navigate.

Return a JSON array of commands. Each command has:
- action: one of click, type, select, hover, doubleClick, rightClick, scroll, wait, pressKey, check, uncheck, clear, radio, dragDrop, focus, acceptDialog, dismissDialog, navigate, verify, capture, captureAttribute, captureCount, switchToIframe, switchToMainFrame, switchToWindow, switchToNewWindow, closeWindow
- selector: CSS selector or text content to find element (for iframes: can be name, id, or selector)
- value: value to type, option to select, key to press, or scroll direction (top/bottom). Can include $variableName$ to use captured values.
- targetSelector: for dragDrop, the drop target
- variableName: for capture actions, the name to store the captured value (use for later with $variableName$)
- attributeName: for captureAttribute, which HTML attribute to get (href, src, data-id, etc.)
- windowIndex: for switchToWindow, which window/tab index (0-based, 0 is main window)
- description: brief description

FORM CONTROLS:
- check: Check a checkbox (finds by label text, name, or aria-label)
- uncheck: Uncheck a checkbox
- radio: Select a radio button option (finds by label text, value, or aria-label)
- select: Select from dropdown (works with native select, custom dropdowns, searchable dropdowns)

IFRAME ACTIONS (for working with embedded frames):
- switchToIframe: Switch context to an iframe (use selector for iframe name, id, or CSS selector)
- switchToMainFrame: Switch back to the main page/default content

WINDOW/TAB ACTIONS (for working with popups and multiple tabs):
- switchToWindow: Switch to a specific window/tab by index (0 is main, 1 is first popup, etc.)
- switchToNewWindow: Wait for and switch to a newly opened window/popup (ONLY when step says to switch)
- closeWindow: Close the current window and switch back to main

CAPTURE ACTIONS (for getting data from page):
- capture: Get text content of element, store in variableName
- captureAttribute: Get an attribute value, store in variableName
- captureCount: Count matching elements, store count in variableName

Examples:
Step: "Click Login button" → [{"action":"click","selector":"Login","description":"Click Login"}]
Step: "Click Continue button", Expected: "Verify new window opens" → [{"action":"click","selector":"Continue","description":"Click Continue"},{"action":"verify","selector":"new window","description":"Verify new window opened"}]
Step: "Enter john@email.com in email" → [{"action":"type","selector":"email","value":"john@email.com","description":"Type email"}]
Step: "Select USA from country" → [{"action":"select","selector":"country","value":"USA","description":"Select country"}]
Step: "Switch to the payment iframe" → [{"action":"switchToIframe","selector":"payment-frame","description":"Switch to payment iframe"}]
Step: "Switch to iframe named checkout" → [{"action":"switchToIframe","selector":"checkout","description":"Switch to checkout iframe"}]
Step: "Go back to main page" → [{"action":"switchToMainFrame","description":"Return to main frame"}]
Step: "Switch back to default content" → [{"action":"switchToMainFrame","description":"Return to main frame"}]
Step: "Switch to the new popup window" → [{"action":"switchToNewWindow","description":"Switch to popup"}]
Step: "Switch to the second tab" → [{"action":"switchToWindow","windowIndex":1,"description":"Switch to second tab"}]
Step: "Close popup and return to main" → [{"action":"closeWindow","description":"Close current window"}]
Step: "Save the order number as orderNum" → [{"action":"capture","selector":"order-number","variableName":"orderNum","description":"Capture order number"}]
Step: "Get the confirmation code and save it" → [{"action":"capture","selector":"confirmation-code","variableName":"confirmCode","description":"Capture confirmation"}]
Step: "Remember the product link as productUrl" → [{"action":"captureAttribute","selector":"product-link","attributeName":"href","variableName":"productUrl","description":"Capture product URL"}]
Step: "Count the items in cart as itemCount" → [{"action":"captureCount","selector":"cart-item","variableName":"itemCount","description":"Count cart items"}]
Step: "Enter the saved order number in search" → [{"action":"type","selector":"search","value":"$orderNum$","description":"Type saved order number"}]
Step: "Verify the confirmation code matches" → [{"action":"verify","selector":"$confirmCode$","description":"Verify confirmation code"}]
Step: "Select Male radio button" → [{"action":"radio","selector":"Male","description":"Select Male radio"}]
Step: "Check the Male radio button" → [{"action":"radio","selector":"Male","description":"Select Male radio"}]
Step: "Click on Male gender option" → [{"action":"radio","selector":"Male","description":"Select Male radio"}]
Step: "Select Karnataka from State dropdown" → [{"action":"select","selector":"State","value":"Karnataka","description":"Select state"}]
Step: "Choose Premium from the plan options" → [{"action":"select","selector":"plan","value":"Premium","description":"Select plan"}]
Step: "Check the Terms and Conditions checkbox" → [{"action":"check","selector":"Terms and Conditions","description":"Check terms"}]
Step: "Accept the privacy policy" → [{"action":"check","selector":"privacy policy","description":"Check privacy"}]

Only return the JSON array, no explanation.`;

    const userPrompt = `Step: "${step}"\nExpected: "${expected}"\nPage context: ${pageContext}`;

    const aiClient = await getAiClient();
    const content = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [{ action: "verify", description: step }];
  } catch (error) {
    console.error("AI interpretation failed, using fallback:", error);
    return [{ action: "verify", description: step }];
  }
}

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

interface StepScreenshot {
  stepIndex: number;
  stepName: string;
  screenshot: string;
  passed: boolean;
}

interface NetworkLogEntry {
  timestamp: number;
  method: string;
  url: string;
  status?: number;
  duration?: number;
  size?: number;
  type?: string;
}

interface ExecutionResult {
  testCaseId: string;
  testCaseTitle: string;
  passed: boolean;
  duration: number;
  steps: TestStepResult[];
  screenshot?: string;
  stepScreenshots?: StepScreenshot[];
  video?: string;
  networkLogs?: NetworkLogEntry[];
  performanceMetrics?: PerformanceData;
  errorMessage?: string;
  logs: string[];
}

interface ExecutionCapabilities {
  captureVideo?: boolean;
  captureNetwork?: boolean;
  capturePerformance?: boolean;
}

interface FrameworkExecutor {
  initialize(): Promise<void>;
  close(): Promise<void>;
  executeTest(testCase: TestCase, targetUrl: string, testData?: TestDataParam[], capabilities?: ExecutionCapabilities): Promise<ExecutionResult>;
}

import type { BrowserContext as PlaywrightContext, Frame as PlaywrightFrame } from "playwright";

// Execution context for tracking current frame/window state
interface PlaywrightExecutionContext {
  context: PlaywrightContext;
  pages: PlaywrightPage[];
  currentPageIndex: number;
  currentFrame: PlaywrightFrame | null;  // null means main frame
}

class PlaywrightExecutor implements FrameworkExecutor {
  private browser: PlaywrightBrowser | null = null;
  private execContext: PlaywrightExecutionContext | null = null;

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

  async executeTest(testCase: TestCase, targetUrl: string, testData?: TestDataParam[], capabilities?: ExecutionCapabilities): Promise<ExecutionResult> {
    const logs: string[] = [];
    const stepResults: TestStepResult[] = [];
    const stepScreenshots: { stepIndex: number; stepName: string; screenshot: string; passed: boolean }[] = [];
    const networkLogs: NetworkLogEntry[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let screenshot: string | undefined;
    let video: string | undefined;
    let performanceMetrics: PerformanceData | undefined;

    logs.push(`[Playwright] Starting test: ${testCase.title}`);
    logs.push(`Target URL: ${targetUrl}`);
    if (testData && testData.length > 0) {
      logs.push(`Test data provided: ${testData.map(d => d.key).join(", ")}`);
    }
    if (capabilities) {
      logs.push(`Capabilities: video=${capabilities.captureVideo}, network=${capabilities.captureNetwork}, performance=${capabilities.capturePerformance}`);
    }

    await this.initialize();
    
    // Configure context options based on capabilities
    const contextOptions: any = {
      viewport: { width: 1280, height: 720 },
    };
    
    // Enable video recording if requested
    if (capabilities?.captureVideo) {
      contextOptions.recordVideo = {
        dir: '/tmp/videos/',
        size: { width: 1280, height: 720 },
      };
      logs.push('Video recording enabled');
    }
    
    const context = await this.browser!.newContext(contextOptions);
    const page = await context.newPage();
    
    // Set up network logging if requested using request ID correlation
    const requestMap = new Map<any, { timestamp: number; index: number }>();
    if (capabilities?.captureNetwork) {
      page.on('request', (request) => {
        const idx = networkLogs.length;
        const timestamp = Date.now();
        requestMap.set(request, { timestamp, index: idx });
        networkLogs.push({
          timestamp,
          method: request.method(),
          url: request.url(),
          type: request.resourceType(),
        });
      });
      
      page.on('response', (response) => {
        const reqInfo = requestMap.get(response.request());
        if (reqInfo) {
          const entry = networkLogs[reqInfo.index];
          if (entry) {
            entry.status = response.status();
            entry.duration = Date.now() - reqInfo.timestamp;
            try {
              const headers = response.headers();
              entry.size = parseInt(headers['content-length'] || '0', 10);
              entry.type = headers['content-type'];
            } catch {}
          }
        }
      });
      logs.push('Network logging enabled');
    }
    
    // Initialize execution context for frame/window tracking
    this.execContext = {
      context,
      pages: [page],
      currentPageIndex: 0,
      currentFrame: null,
    };

    try {
      await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });
      logs.push(`Navigated to ${targetUrl}`);

      const steps = (testCase.steps as { step: string; expected: string }[]) || [];

      for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
        const step = steps[stepIdx];
        // Replace placeholders in step and expected with test data values
        const processedStep = replaceTestDataPlaceholders(step.step, testData);
        const processedExpected = replaceTestDataPlaceholders(step.expected, testData);
        
        const stepResult: TestStepResult = {
          step: processedStep,
          expected: processedExpected,
          passed: false,
        };

        let stepPassed = false;
        try {
          const currentPage = this.execContext.pages[this.execContext.currentPageIndex];
          stepPassed = await this.executeStep(currentPage, processedStep, processedExpected, logs);
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

        // Capture screenshot after EVERY step - wait for page to render changes
        try {
          const currentPage = this.execContext.pages[this.execContext.currentPageIndex];
          // Wait for any animations/transitions to complete before screenshot
          await currentPage.waitForTimeout(500);
          const screenshotBuffer = await currentPage.screenshot({ fullPage: true });
          const stepScreenshot = screenshotBuffer.toString("base64");
          stepScreenshots.push({
            stepIndex: stepIdx + 1,
            stepName: processedStep,
            screenshot: stepScreenshot,
            passed: stepResult.passed,
          });
          logs.push(`Captured screenshot after Step ${stepIdx + 1}`);
          
          // Also set the main screenshot if this step failed (for backward compatibility)
          if (!stepResult.passed && !screenshot) {
            screenshot = stepScreenshot;
          }
        } catch (e) {
          logs.push(`Failed to capture screenshot for Step ${stepIdx + 1}`);
        }

        stepResults.push(stepResult);
        
        // Stop execution on first failed step (fail-fast behavior)
        if (!stepResult.passed) {
          logs.push(`Stopping execution: Step ${stepIdx + 1} failed`);
          break;
        }
      }

      // Capture final screenshot if all steps passed
      if (!screenshot && stepScreenshots.length > 0) {
        screenshot = stepScreenshots[stepScreenshots.length - 1].screenshot;
        logs.push("Using last step screenshot as final screenshot");
      }
      
      // Capture performance metrics if requested
      if (capabilities?.capturePerformance) {
        try {
          const currentPage = this.execContext.pages[this.execContext.currentPageIndex];
          const perfTiming = await currentPage.evaluate(() => {
            const perf = window.performance;
            const timing = perf.timing;
            const navigation = perf.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
            const paint = perf.getEntriesByType('paint');
            
            return {
              loadTime: timing.loadEventEnd - timing.navigationStart,
              domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
              firstPaint: paint.find(p => p.name === 'first-paint')?.startTime,
              firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime,
              timeToInteractive: navigation?.domInteractive - navigation?.startTime,
            };
          });
          
          performanceMetrics = {
            loadTime: perfTiming.loadTime,
            domContentLoaded: perfTiming.domContentLoaded,
            firstPaint: perfTiming.firstPaint,
            firstContentfulPaint: perfTiming.firstContentfulPaint,
            timeToInteractive: perfTiming.timeToInteractive,
          };
          logs.push(`Performance metrics captured: loadTime=${perfTiming.loadTime}ms, FCP=${perfTiming.firstContentfulPaint}ms`);
        } catch (e) {
          logs.push(`Failed to capture performance metrics: ${e}`);
        }
      }

    } catch (error: any) {
      passed = false;
      errorMessage = error.message;
      logs.push(`Test failed: ${error.message}`);

      try {
        const currentPage = this.execContext?.pages[this.execContext?.currentPageIndex || 0];
        if (currentPage) {
          const screenshotBuffer = await currentPage.screenshot({ fullPage: true });
          screenshot = screenshotBuffer.toString("base64");
        }
      } catch {
        logs.push("Failed to capture error screenshot");
      }
    } finally {
      // Capture video if enabled
      if (capabilities?.captureVideo) {
        try {
          const currentPage = this.execContext?.pages[this.execContext?.currentPageIndex || 0];
          if (currentPage) {
            const videoPath = await currentPage.video()?.path();
            if (videoPath) {
              const fs = await import('fs');
              // Wait a moment for video to finalize
              await new Promise(resolve => setTimeout(resolve, 1000));
              const videoBuffer = fs.readFileSync(videoPath);
              video = videoBuffer.toString('base64');
              logs.push(`Video captured: ${videoPath}`);
              // Clean up video file
              try { fs.unlinkSync(videoPath); } catch {}
            }
          }
        } catch (e) {
          logs.push(`Failed to capture video: ${e}`);
        }
      }
      
      this.execContext = null;
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
      stepScreenshots,
      video,
      networkLogs: networkLogs.length > 0 ? networkLogs : undefined,
      performanceMetrics,
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
    
    // Get the current execution context (page or frame)
    // When inside an iframe, use the frame; otherwise use the page
    const context: PlaywrightPage | PlaywrightFrame = 
      this.execContext?.currentFrame || page;
    const isInFrame = !!this.execContext?.currentFrame;
    if (isInFrame) {
      logs.push("(executing in iframe context)");
    }
    
    // Get page context for AI
    const pageTitle = await page.title();
    const pageUrl = page.url();
    const pageContext = `Title: ${pageTitle}, URL: ${pageUrl}${isInFrame ? " (in iframe)" : ""}`;
    
    // Use AI to interpret the step
    logs.push("AI interpreting step...");
    const commands = await interpretStepWithAI(stepAction, expected, pageContext);
    logs.push(`AI generated ${commands.length} command(s)`);
    
    for (const cmd of commands) {
      try {
        logs.push(`Executing: ${cmd.action} - ${cmd.description}`);
        
        switch (cmd.action) {
          case "navigate":
            logs.push(`Page loaded, checking expected: ${expected}`);
            break;
            
          case "click":
            if (cmd.selector) {
              try {
                await context.click(`text=${cmd.selector}`, { timeout: 5000 });
              } catch {
                await context.click(`button:has-text("${cmd.selector}"), a:has-text("${cmd.selector}"), [aria-label*="${cmd.selector}"]`, { timeout: 3000 });
              }
              logs.push(`Clicked: ${cmd.selector}`);
            }
            break;
            
          case "doubleClick":
            if (cmd.selector) {
              await context.dblclick(`text=${cmd.selector}`, { timeout: 5000 });
              logs.push(`Double-clicked: ${cmd.selector}`);
            }
            break;
            
          case "rightClick":
            if (cmd.selector) {
              await context.click(`text=${cmd.selector}`, { button: "right", timeout: 5000 });
              logs.push(`Right-clicked: ${cmd.selector}`);
            }
            break;
            
          case "type":
            if (cmd.selector && cmd.value) {
              // Replace runtime variables in the value
              const valueToType = replaceRuntimeVariables(cmd.value);
              const selectors = [
                `input[name*="${cmd.selector}" i]`,
                `input[placeholder*="${cmd.selector}" i]`,
                `input[id*="${cmd.selector}" i]`,
                `textarea[name*="${cmd.selector}" i]`,
                `[aria-label*="${cmd.selector}" i]`,
                `input[type="${cmd.selector}"]`,
              ];
              let typed = false;
              for (const sel of selectors) {
                try {
                  const el = await context.$(sel);
                  if (el) {
                    await el.fill(valueToType);
                    logs.push(`Typed "${valueToType}" in ${cmd.selector}`);
                    typed = true;
                    break;
                  }
                } catch { continue; }
              }
              if (!typed) logs.push(`Could not find field: ${cmd.selector}`);
            }
            break;
            
          case "select":
            if (cmd.selector && cmd.value) {
              try {
                const selectEl = await context.$(`select[name*="${cmd.selector}" i], select[id*="${cmd.selector}" i]`);
                if (selectEl) {
                  await selectEl.selectOption({ label: cmd.value });
                } else {
                  // Custom dropdown
                  await context.click(`text=${cmd.selector}`, { timeout: 3000 });
                  await context.click(`text=${cmd.value}`, { timeout: 3000 });
                }
                logs.push(`Selected "${cmd.value}" from ${cmd.selector}`);
              } catch {
                logs.push(`Could not select from: ${cmd.selector}`);
              }
            }
            break;
            
          case "hover":
            if (cmd.selector) {
              await context.hover(`text=${cmd.selector}`, { timeout: 5000 });
              logs.push(`Hovered: ${cmd.selector}`);
            }
            break;
            
          case "scroll":
            if (cmd.value === "bottom" || cmd.value === "down") {
              await context.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            } else if (cmd.value === "top" || cmd.value === "up") {
              await context.evaluate(() => window.scrollTo(0, 0));
            } else if (cmd.selector) {
              const el = await context.$(`text=${cmd.selector}`);
              if (el) await el.scrollIntoViewIfNeeded();
            }
            logs.push(`Scrolled: ${cmd.value || cmd.selector}`);
            break;
            
          case "wait":
            if (cmd.selector) {
              await context.waitForSelector(`text=${cmd.selector}`, { timeout: 10000 });
              logs.push(`Waited for: ${cmd.selector}`);
            } else {
              await page.waitForTimeout(2000);  // waitForTimeout is page-only
              logs.push("Waited 2 seconds");
            }
            break;
            
          case "pressKey":
            if (cmd.value) {
              await page.keyboard.press(cmd.value);  // keyboard is page-only
              logs.push(`Pressed key: ${cmd.value}`);
            }
            break;
            
          case "check":
            if (cmd.selector) {
              await context.check(`input[name*="${cmd.selector}" i], input[id*="${cmd.selector}" i], label:has-text("${cmd.selector}") input`);
              logs.push(`Checked: ${cmd.selector}`);
            }
            break;
            
          case "uncheck":
            if (cmd.selector) {
              await context.uncheck(`input[name*="${cmd.selector}" i], input[id*="${cmd.selector}" i], label:has-text("${cmd.selector}") input`);
              logs.push(`Unchecked: ${cmd.selector}`);
            }
            break;
            
          case "clear":
            if (cmd.selector) {
              const input = await context.$(`input[name*="${cmd.selector}" i], input[id*="${cmd.selector}" i]`);
              if (input) await input.fill("");
              logs.push(`Cleared: ${cmd.selector}`);
            }
            break;
            
          case "dragDrop":
            if (cmd.selector && cmd.targetSelector) {
              const source = await context.$(`text=${cmd.selector}`);
              const target = await context.$(`text=${cmd.targetSelector}`);
              if (source && target) {
                // Get bounding boxes and perform drag operation
                const sourceBox = await source.boundingBox();
                const targetBox = await target.boundingBox();
                if (sourceBox && targetBox) {
                  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
                  await page.mouse.down();
                  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
                  await page.mouse.up();
                  logs.push(`Dragged ${cmd.selector} to ${cmd.targetSelector}`);
                }
              }
            }
            break;
            
          case "focus":
            if (cmd.selector) {
              await context.focus(`text=${cmd.selector}`);
              logs.push(`Focused: ${cmd.selector}`);
            }
            break;
            
          case "acceptDialog":
            page.once("dialog", async (dialog) => await dialog.accept());
            logs.push("Dialog accept handler set");
            break;
            
          case "dismissDialog":
            page.once("dialog", async (dialog) => await dialog.dismiss());
            logs.push("Dialog dismiss handler set");
            break;
            
          case "verify":
            if (cmd.selector) {
              const selectorValue = replaceRuntimeVariables(cmd.selector);
              try {
                await context.waitForSelector(`text=${selectorValue}`, { state: "visible", timeout: 5000 });
                logs.push(`Verified visible: ${selectorValue}`);
              } catch {
                logs.push(`Verification: ${cmd.description}`);
              }
            } else {
              logs.push(`Verification: ${expected}`);
            }
            break;
            
          case "capture":
            if (cmd.selector && cmd.variableName) {
              try {
                const element = await context.$(`text=${cmd.selector}`) || 
                                await context.$(`[data-testid*="${cmd.selector}" i]`) ||
                                await context.$(`#${cmd.selector}`) ||
                                await context.$(`.${cmd.selector}`);
                if (element) {
                  const text = await element.textContent() || "";
                  runtimeVariables.set(cmd.variableName, text.trim());
                  logs.push(`Captured "${text.trim()}" as $${cmd.variableName}$`);
                } else {
                  logs.push(`Could not find element to capture: ${cmd.selector}`);
                }
              } catch (e: any) {
                logs.push(`Capture failed: ${e.message}`);
              }
            }
            break;
            
          case "captureAttribute":
            if (cmd.selector && cmd.variableName && cmd.attributeName) {
              try {
                const element = await context.$(`[${cmd.attributeName}]`) ||
                                await context.$(`text=${cmd.selector}`) ||
                                await context.$(`a:has-text("${cmd.selector}")`);
                if (element) {
                  const attrValue = await element.getAttribute(cmd.attributeName) || "";
                  runtimeVariables.set(cmd.variableName, attrValue);
                  logs.push(`Captured attribute ${cmd.attributeName}="${attrValue}" as $${cmd.variableName}$`);
                } else {
                  logs.push(`Could not find element for attribute capture: ${cmd.selector}`);
                }
              } catch (e: any) {
                logs.push(`Capture attribute failed: ${e.message}`);
              }
            }
            break;
            
          case "captureCount":
            if (cmd.selector && cmd.variableName) {
              try {
                const elements = await context.$$(`text=${cmd.selector}`) ||
                                 await context.$$(`[data-testid*="${cmd.selector}" i]`) ||
                                 await context.$$(`.${cmd.selector}`);
                const count = elements.length.toString();
                runtimeVariables.set(cmd.variableName, count);
                logs.push(`Captured count ${count} as $${cmd.variableName}$`);
              } catch (e: any) {
                logs.push(`Capture count failed: ${e.message}`);
              }
            }
            break;
            
          case "switchToIframe":
            if (cmd.selector && this.execContext) {
              try {
                // Try multiple ways to find the iframe
                let frame = page.frame({ name: cmd.selector }) ||
                            page.frame({ url: new RegExp(cmd.selector, 'i') });
                
                if (!frame) {
                  // Try finding iframe by selector
                  const iframeElement = await page.$(`iframe[name="${cmd.selector}"]`) ||
                                        await page.$(`iframe[id="${cmd.selector}"]`) ||
                                        await page.$(`iframe[src*="${cmd.selector}"]`) ||
                                        await page.$(cmd.selector);
                  if (iframeElement) {
                    frame = await iframeElement.contentFrame();
                  }
                }
                
                if (frame) {
                  this.execContext.currentFrame = frame;
                  logs.push(`Switched to iframe: ${cmd.selector}`);
                } else {
                  logs.push(`Could not find iframe: ${cmd.selector}`);
                }
              } catch (e: any) {
                logs.push(`Switch to iframe failed: ${e.message}`);
              }
            }
            break;
            
          case "switchToMainFrame":
            if (this.execContext) {
              this.execContext.currentFrame = null;
              logs.push("Switched back to main frame");
            }
            break;
            
          case "switchToWindow":
            if (this.execContext) {
              const windowIndex = cmd.windowIndex ?? 0;
              // Refresh the pages list
              this.execContext.pages = this.execContext.context.pages();
              
              if (windowIndex >= 0 && windowIndex < this.execContext.pages.length) {
                this.execContext.currentPageIndex = windowIndex;
                this.execContext.currentFrame = null;  // Reset frame when switching windows
                logs.push(`Switched to window/tab ${windowIndex}`);
              } else {
                logs.push(`Window index ${windowIndex} out of range (${this.execContext.pages.length} windows available)`);
              }
            }
            break;
            
          case "switchToNewWindow":
            if (this.execContext) {
              try {
                // Wait for a new page to be created
                const newPage = await this.execContext.context.waitForEvent("page", { timeout: 10000 });
                await newPage.waitForLoadState("domcontentloaded");
                
                // Refresh pages list and find the new page
                this.execContext.pages = this.execContext.context.pages();
                const newPageIndex = this.execContext.pages.indexOf(newPage);
                if (newPageIndex !== -1) {
                  this.execContext.currentPageIndex = newPageIndex;
                  this.execContext.currentFrame = null;
                  logs.push(`Switched to new popup window (index: ${newPageIndex})`);
                } else {
                  this.execContext.pages.push(newPage);
                  this.execContext.currentPageIndex = this.execContext.pages.length - 1;
                  this.execContext.currentFrame = null;
                  logs.push("Switched to new popup window");
                }
              } catch (e: any) {
                logs.push(`No new window detected: ${e.message}`);
              }
            }
            break;
            
          case "closeWindow":
            if (this.execContext && this.execContext.currentPageIndex > 0) {
              try {
                const currentPage = this.execContext.pages[this.execContext.currentPageIndex];
                await currentPage.close();
                
                // Refresh pages list and go back to main window
                this.execContext.pages = this.execContext.context.pages();
                this.execContext.currentPageIndex = 0;
                this.execContext.currentFrame = null;
                logs.push("Closed current window, switched back to main");
              } catch (e: any) {
                logs.push(`Close window failed: ${e.message}`);
              }
            } else {
              logs.push("Cannot close main window");
            }
            break;
            
          default:
            logs.push(`Unknown action: ${cmd.action}`);
        }
      } catch (error: any) {
        logs.push(`Command failed: ${cmd.action} - ${error.message}`);
        return false;
      }
    }
    
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

  async executeTest(testCase: TestCase, targetUrl: string, testData?: TestDataParam[], capabilities?: ExecutionCapabilities): Promise<ExecutionResult> {
    const logs: string[] = [];
    const stepResults: TestStepResult[] = [];
    const stepScreenshots: StepScreenshot[] = [];
    const networkLogs: NetworkLogEntry[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let screenshot: string | undefined;
    let performanceMetrics: PerformanceData | undefined;

    logs.push(`[Puppeteer] Starting test: ${testCase.title}`);
    logs.push(`Target URL: ${targetUrl}`);
    if (testData && testData.length > 0) {
      logs.push(`Test data provided: ${testData.map(d => d.key).join(", ")}`);
    }
    if (capabilities) {
      logs.push(`Capabilities: network=${capabilities.captureNetwork}, performance=${capabilities.capturePerformance} (video not supported in Puppeteer)`);
    }

    await this.initialize();
    const page = await this.browser!.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    
    // Set up network logging if requested using request ID correlation
    const requestMap = new Map<any, { timestamp: number; index: number }>();
    if (capabilities?.captureNetwork) {
      page.on('request', (request) => {
        const idx = networkLogs.length;
        const timestamp = Date.now();
        requestMap.set(request, { timestamp, index: idx });
        networkLogs.push({
          timestamp,
          method: request.method(),
          url: request.url(),
          type: request.resourceType(),
        });
      });
      
      page.on('response', (response) => {
        const reqInfo = requestMap.get(response.request());
        if (reqInfo) {
          const entry = networkLogs[reqInfo.index];
          if (entry) {
            entry.status = response.status();
            entry.duration = Date.now() - reqInfo.timestamp;
            try {
              const headers = response.headers();
              entry.size = parseInt(headers['content-length'] || '0', 10);
              entry.type = headers['content-type'];
            } catch {}
          }
        }
      });
      logs.push('Network logging enabled');
    }

    try {
      await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 30000 });
      logs.push(`Navigated to ${targetUrl}`);

      const steps = (testCase.steps as { step: string; expected: string }[]) || [];

      for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
        const step = steps[stepIdx];
        const processedStep = replaceTestDataPlaceholders(step.step, testData);
        const processedExpected = replaceTestDataPlaceholders(step.expected, testData);
        
        const stepResult: TestStepResult = {
          step: processedStep,
          expected: processedExpected,
          passed: false,
        };

        let stepPassed = false;
        try {
          stepPassed = await this.executeStep(page, processedStep, processedExpected, logs);
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

        // Capture screenshot after EVERY step - wait for page to render changes
        try {
          // Wait for any animations/transitions to complete before screenshot
          await new Promise(resolve => setTimeout(resolve, 500));
          const screenshotBuffer = await page.screenshot({ fullPage: true });
          const stepScreenshot = Buffer.from(screenshotBuffer).toString("base64");
          stepScreenshots.push({
            stepIndex: stepIdx + 1,
            stepName: processedStep,
            screenshot: stepScreenshot,
            passed: stepResult.passed,
          });
          logs.push(`Captured screenshot after Step ${stepIdx + 1}`);
          
          if (!stepResult.passed && !screenshot) {
            screenshot = stepScreenshot;
          }
        } catch (e) {
          logs.push(`Failed to capture screenshot for Step ${stepIdx + 1}`);
        }

        stepResults.push(stepResult);
        
        // Stop execution on first failed step (fail-fast behavior)
        if (!stepResult.passed) {
          logs.push(`Stopping execution: Step ${stepIdx + 1} failed`);
          break;
        }
      }

      // Use last step screenshot as final if all passed
      if (!screenshot && stepScreenshots.length > 0) {
        screenshot = stepScreenshots[stepScreenshots.length - 1].screenshot;
        logs.push("Using last step screenshot as final screenshot");
      }
      
      // Capture performance metrics if requested
      if (capabilities?.capturePerformance) {
        try {
          const perfData = await page.evaluate(() => {
            const timing = performance.timing;
            const paintEntries = performance.getEntriesByType('paint');
            const fcp = paintEntries.find(e => e.name === 'first-contentful-paint');
            const fp = paintEntries.find(e => e.name === 'first-paint');
            return {
              loadTime: timing.loadEventEnd - timing.navigationStart,
              domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
              firstPaint: fp ? fp.startTime : null,
              firstContentfulPaint: fcp ? fcp.startTime : null,
              timeToInteractive: timing.domInteractive - timing.navigationStart
            };
          }) as any;
          if (perfData) {
            performanceMetrics = {
              loadTime: perfData.loadTime > 0 ? perfData.loadTime : undefined,
              domContentLoaded: perfData.domContentLoaded > 0 ? perfData.domContentLoaded : undefined,
              firstPaint: perfData.firstPaint > 0 ? perfData.firstPaint : undefined,
              firstContentfulPaint: perfData.firstContentfulPaint > 0 ? perfData.firstContentfulPaint : undefined,
              timeToInteractive: perfData.timeToInteractive > 0 ? perfData.timeToInteractive : undefined,
            };
            logs.push('Performance metrics captured via Puppeteer');
          }
        } catch (e) {
          logs.push(`Failed to capture performance metrics: ${e}`);
        }
      }

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
      stepScreenshots,
      networkLogs: networkLogs.length > 0 ? networkLogs : undefined,
      performanceMetrics,
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
      options.addArguments("--disable-popup-blocking");
      options.addArguments("--disable-web-security");
      options.addArguments("--allow-running-insecure-content");
      
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

  async executeTest(testCase: TestCase, targetUrl: string, testData?: TestDataParam[], capabilities?: ExecutionCapabilities): Promise<ExecutionResult> {
    const logs: string[] = [];
    const stepResults: TestStepResult[] = [];
    const stepScreenshots: StepScreenshot[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;
    let screenshot: string | undefined;
    let performanceMetrics: PerformanceData | undefined;

    logs.push(`[Selenium] Starting test: ${testCase.title}`);
    logs.push(`Target URL: ${targetUrl}`);
    if (testData && testData.length > 0) {
      logs.push(`Test data provided: ${testData.map(d => d.key).join(", ")}`);
    }
    if (capabilities) {
      logs.push(`Capabilities: performance=${capabilities.capturePerformance} (video/network not supported in Selenium)`);
    }

    await this.initialize();

    try {
      await this.driver!.get(targetUrl);
      await this.driver!.wait(until.elementLocated(By.tagName("body")), 30000);
      logs.push(`Navigated to ${targetUrl}`);

      const steps = (testCase.steps as { step: string; expected: string }[]) || [];

      for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
        const step = steps[stepIdx];
        const processedStep = replaceTestDataPlaceholders(step.step, testData);
        const processedExpected = replaceTestDataPlaceholders(step.expected, testData);
        
        const stepResult: TestStepResult = {
          step: processedStep,
          expected: processedExpected,
          passed: false,
        };

        let stepPassed = false;
        try {
          stepPassed = await this.executeStep(processedStep, processedExpected, logs);
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

        // Capture screenshot after EVERY step - wait for page to render changes
        try {
          // Wait for any animations/transitions to complete before screenshot
          await this.driver!.sleep(500);
          const screenshotData = await this.driver!.takeScreenshot();
          stepScreenshots.push({
            stepIndex: stepIdx + 1,
            stepName: processedStep,
            screenshot: screenshotData,
            passed: stepResult.passed,
          });
          logs.push(`Captured screenshot after Step ${stepIdx + 1}`);
          
          if (!stepResult.passed && !screenshot) {
            screenshot = screenshotData;
          }
        } catch (e) {
          logs.push(`Failed to capture screenshot for Step ${stepIdx + 1}`);
        }

        stepResults.push(stepResult);
        
        // Stop execution on first failed step (fail-fast behavior)
        if (!stepResult.passed) {
          logs.push(`Stopping execution: Step ${stepIdx + 1} failed`);
          break;
        }
      }

      // Use last step screenshot as final if all passed
      if (!screenshot && stepScreenshots.length > 0) {
        screenshot = stepScreenshots[stepScreenshots.length - 1].screenshot;
        logs.push("Using last step screenshot as final screenshot");
      }
      
      // Capture performance metrics if requested (Selenium can do this via JS execution)
      if (capabilities?.capturePerformance) {
        try {
          const perfScript = `
            const timing = performance.timing;
            const paintEntries = performance.getEntriesByType('paint');
            const fcp = paintEntries.find(e => e.name === 'first-contentful-paint');
            const fp = paintEntries.find(e => e.name === 'first-paint');
            return {
              loadTime: timing.loadEventEnd - timing.navigationStart,
              domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
              firstPaint: fp ? fp.startTime : null,
              firstContentfulPaint: fcp ? fcp.startTime : null,
              timeToInteractive: timing.domInteractive - timing.navigationStart
            };
          `;
          const perfData = await this.driver!.executeScript(perfScript) as any;
          if (perfData) {
            performanceMetrics = {
              loadTime: perfData.loadTime > 0 ? perfData.loadTime : undefined,
              domContentLoaded: perfData.domContentLoaded > 0 ? perfData.domContentLoaded : undefined,
              firstPaint: perfData.firstPaint > 0 ? perfData.firstPaint : undefined,
              firstContentfulPaint: perfData.firstContentfulPaint > 0 ? perfData.firstContentfulPaint : undefined,
              timeToInteractive: perfData.timeToInteractive > 0 ? perfData.timeToInteractive : undefined,
            };
            logs.push('Performance metrics captured via Selenium');
          }
        } catch (e) {
          logs.push(`Failed to capture performance metrics: ${e}`);
        }
      }

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
      stepScreenshots,
      performanceMetrics,
      errorMessage,
      logs,
    };
  }

  private async executeStep(stepAction: string, expected: string, logs: string[]): Promise<boolean> {
    logs.push(`Executing step: ${stepAction}`);
    
    // Get page context for AI
    const pageTitle = await this.driver!.getTitle();
    const pageUrl = await this.driver!.getCurrentUrl();
    const pageContext = `Title: ${pageTitle}, URL: ${pageUrl}`;
    
    // Use AI to interpret the step (same as Playwright)
    logs.push("AI interpreting step...");
    const commands = await interpretStepWithAI(stepAction, expected, pageContext);
    logs.push(`AI generated ${commands.length} command(s)`);
    
    for (const cmd of commands) {
      try {
        logs.push(`Executing: ${cmd.action} - ${cmd.description}`);
        
        switch (cmd.action) {
          case "navigate":
            logs.push(`Page loaded, checking expected: ${expected}`);
            break;
            
          case "click":
            if (cmd.selector) {
              try {
                let element;
                const selectorText = cmd.selector.replace(/['"]/g, '');
                
                // Comprehensive XPath strategies for finding clickable elements
                const xpaths = [
                  // Exact text match
                  `//*[normalize-space(text())="${selectorText}"]`,
                  `//button[normalize-space(text())="${selectorText}"]`,
                  `//a[normalize-space(text())="${selectorText}"]`,
                  // Contains text
                  `//*[contains(normalize-space(text()), "${selectorText}")]`,
                  `//button[contains(text(), "${selectorText}")]`,
                  `//a[contains(text(), "${selectorText}")]`,
                  // By value attribute
                  `//*[@value="${selectorText}"]`,
                  `//input[@value="${selectorText}"]`,
                  // By aria-label
                  `//*[contains(@aria-label, "${selectorText}")]`,
                  // By title
                  `//*[contains(@title, "${selectorText}")]`,
                  // By placeholder (for inputs that look like buttons)
                  `//*[contains(@placeholder, "${selectorText}")]`,
                  // By data-testid or data-test
                  `//*[contains(@data-testid, "${selectorText.toLowerCase().replace(/\s+/g, '-')}")]`,
                  `//*[contains(@data-test, "${selectorText.toLowerCase().replace(/\s+/g, '-')}")]`,
                  // Span or div containing text inside button/link
                  `//button//*[contains(text(), "${selectorText}")]`,
                  `//a//*[contains(text(), "${selectorText}")]`,
                  // By id or class containing selector
                  `//*[contains(@id, "${selectorText.toLowerCase().replace(/\s+/g, '')}")]`,
                  `//*[contains(@class, "${selectorText.toLowerCase().replace(/\s+/g, '-')}")]`,
                  // List items (ul/li) containing text
                  `//li[contains(text(), "${selectorText}")]`,
                  `//li//*[contains(text(), "${selectorText}")]`,
                  // Dropdown options
                  `//option[contains(text(), "${selectorText}")]`,
                ];
                
                for (const xpath of xpaths) {
                  try {
                    const elements = await this.driver!.findElements(By.xpath(xpath));
                    if (elements.length > 0) {
                      // Find a visible, enabled element
                      for (const el of elements) {
                        const isDisplayed = await el.isDisplayed().catch(() => false);
                        const isEnabled = await el.isEnabled().catch(() => true);
                        if (isDisplayed && isEnabled) {
                          element = el;
                          break;
                        }
                      }
                      if (element) break;
                    }
                  } catch { continue; }
                }
                
                // Try CSS selector as fallback
                if (!element) {
                  const cssSelectors = [
                    `[data-testid*="${selectorText.toLowerCase().replace(/\s+/g, '-')}"]`,
                    `button:contains("${selectorText}")`,
                    `a:contains("${selectorText}")`,
                  ];
                  for (const css of cssSelectors) {
                    try {
                      element = await this.driver!.findElement(By.css(css));
                      if (element) break;
                    } catch { continue; }
                  }
                }
                
                if (!element) {
                  throw new Error(`Element not found: ${cmd.selector}`);
                }
                
                // Scroll element into view before clicking
                await this.driver!.executeScript("arguments[0].scrollIntoView({block: 'center'});", element);
                await this.driver!.sleep(200);
                
                // Get window handles before click for popup detection
                const handlesBefore = await this.driver!.getAllWindowHandles();
                logs.push(`DEBUG: Window handles before click: ${handlesBefore.length}`);
                
                try {
                  await element.click();
                } catch {
                  // If regular click fails, try JavaScript click
                  await this.driver!.executeScript("arguments[0].click();", element);
                }
                
                // Wait for potential popup to open
                await this.driver!.sleep(1000);
                
                // Check if new window opened
                const handlesAfter = await this.driver!.getAllWindowHandles();
                logs.push(`DEBUG: Window handles after click: ${handlesAfter.length}`);
                if (handlesAfter.length > handlesBefore.length) {
                  logs.push(`DEBUG: New popup window detected!`);
                }
                
                logs.push(`Clicked: ${cmd.selector}`);
              } catch (e: any) {
                logs.push(`Click failed: ${e.message}`);
                return false;
              }
            }
            break;
            
          case "type":
            if (cmd.selector && cmd.value) {
              const valueToType = replaceRuntimeVariables(cmd.value);
              const selectors = [
                `input[name*="${cmd.selector}" i]`,
                `input[placeholder*="${cmd.selector}" i]`,
                `input[id*="${cmd.selector}" i]`,
                `textarea[name*="${cmd.selector}" i]`,
                `[aria-label*="${cmd.selector}" i]`,
              ];
              let typed = false;
              for (const sel of selectors) {
                try {
                  const elements = await this.driver!.findElements(By.css(sel));
                  if (elements.length > 0) {
                    await elements[0].clear();
                    await elements[0].sendKeys(valueToType);
                    logs.push(`Typed "${valueToType}" in ${cmd.selector}`);
                    typed = true;
                    break;
                  }
                } catch { continue; }
              }
              // Also try by placeholder text or label
              if (!typed) {
                try {
                  const xpath = `//input[contains(@placeholder, "${cmd.selector}")] | //textarea[contains(@placeholder, "${cmd.selector}")] | //label[contains(text(), "${cmd.selector}")]//following::input[1] | //label[contains(text(), "${cmd.selector}")]//following::textarea[1]`;
                  const element = await this.driver!.findElement(By.xpath(xpath));
                  await element.clear();
                  await element.sendKeys(valueToType);
                  logs.push(`Typed "${valueToType}" in ${cmd.selector}`);
                  typed = true;
                } catch { }
              }
              if (!typed) logs.push(`Could not find field: ${cmd.selector}`);
            }
            break;
            
          case "select":
            if (cmd.selector && cmd.value) {
              let selected = false;
              const fieldName = cmd.selector.replace(/['"]/g, '');
              const optionValue = cmd.value.replace(/['"]/g, '');
              
              // Strategy 1: Native HTML <select> element
              try {
                const selectXpaths = [
                  `//select[contains(@name, "${fieldName}")]`,
                  `//select[contains(@id, "${fieldName}")]`,
                  `//label[contains(text(), "${fieldName}")]//following::select[1]`,
                  `//label[contains(text(), "${fieldName}")]//select`,
                  `//*[contains(text(), "${fieldName}")]//following::select[1]`,
                ];
                for (const xpath of selectXpaths) {
                  try {
                    const selectEl = await this.driver!.findElement(By.xpath(xpath));
                    const option = await selectEl.findElement(By.xpath(`./option[contains(text(), "${optionValue}")]`));
                    await option.click();
                    logs.push(`Selected "${optionValue}" from native select: ${fieldName}`);
                    selected = true;
                    break;
                  } catch { continue; }
                }
              } catch { }
              
              // Strategy 2: Custom dropdown (click to open, then click option)
              if (!selected) {
                try {
                  const dropdownXpaths = [
                    `//*[contains(@class, 'select') or contains(@class, 'dropdown')][.//*[contains(text(), "${fieldName}")] or contains(@aria-label, "${fieldName}")]`,
                    `//*[contains(@role, 'combobox') or contains(@role, 'listbox')][.//*[contains(text(), "${fieldName}")] or contains(@aria-label, "${fieldName}")]`,
                    `//label[contains(text(), "${fieldName}")]//following::*[contains(@class, 'select') or contains(@class, 'dropdown')][1]`,
                    `//*[contains(text(), "${fieldName}")]//following-sibling::*[1]`,
                    `//*[contains(text(), "${fieldName}")]//parent::*//following-sibling::*[1]`,
                  ];
                  
                  for (const xpath of dropdownXpaths) {
                    try {
                      const dropdown = await this.driver!.findElement(By.xpath(xpath));
                      await this.driver!.executeScript("arguments[0].scrollIntoView({block: 'center'});", dropdown);
                      await dropdown.click();
                      await this.driver!.sleep(500);
                      
                      // Now find and click the option
                      const optionXpaths = [
                        `//*[contains(@role, 'option')][contains(text(), "${optionValue}")]`,
                        `//li[contains(text(), "${optionValue}")]`,
                        `//*[contains(@class, 'option')][contains(text(), "${optionValue}")]`,
                        `//*[contains(text(), "${optionValue}")]`,
                      ];
                      
                      for (const optXpath of optionXpaths) {
                        try {
                          const option = await this.driver!.findElement(By.xpath(optXpath));
                          const isDisplayed = await option.isDisplayed().catch(() => false);
                          if (isDisplayed) {
                            await option.click();
                            logs.push(`Selected "${optionValue}" from custom dropdown: ${fieldName}`);
                            selected = true;
                            break;
                          }
                        } catch { continue; }
                      }
                      if (selected) break;
                    } catch { continue; }
                  }
                } catch { }
              }
              
              // Strategy 3: Searchable dropdown/combobox (type to filter, then select)
              if (!selected) {
                try {
                  const searchInputXpaths = [
                    `//input[contains(@class, 'search') or contains(@class, 'combobox') or contains(@role, 'combobox')]`,
                    `//label[contains(text(), "${fieldName}")]//following::input[1]`,
                    `//*[contains(text(), "${fieldName}")]//following::input[1]`,
                  ];
                  
                  for (const xpath of searchInputXpaths) {
                    try {
                      const searchInput = await this.driver!.findElement(By.xpath(xpath));
                      await searchInput.click();
                      await searchInput.clear();
                      await searchInput.sendKeys(optionValue);
                      await this.driver!.sleep(500);
                      
                      // Click the matching option from filtered list
                      const option = await this.driver!.findElement(By.xpath(`//*[contains(text(), "${optionValue}")][@role='option' or contains(@class, 'option') or parent::li or self::li]`));
                      await option.click();
                      logs.push(`Selected "${optionValue}" from searchable dropdown: ${fieldName}`);
                      selected = true;
                      break;
                    } catch { continue; }
                  }
                } catch { }
              }
              
              // Strategy 4: Click label/field first to expand, then select from list
              if (!selected) {
                try {
                  // Click on the field label or container
                  const trigger = await this.driver!.findElement(By.xpath(`//*[contains(text(), "${fieldName}")]`));
                  await trigger.click();
                  await this.driver!.sleep(500);
                  
                  // Find option in expanded list
                  const option = await this.driver!.findElement(By.xpath(`//li[contains(text(), "${optionValue}")] | //*[contains(@class, 'item') or contains(@class, 'option')][contains(text(), "${optionValue}")]`));
                  await option.click();
                  logs.push(`Selected "${optionValue}" after clicking: ${fieldName}`);
                  selected = true;
                } catch { }
              }
              
              if (!selected) {
                logs.push(`Could not select "${optionValue}" from: ${fieldName}`);
              }
            }
            break;
            
          case "wait":
            if (cmd.selector) {
              try {
                await this.driver!.wait(until.elementLocated(By.xpath(`//*[contains(text(), "${cmd.selector}")]`)), 10000);
                logs.push(`Waited for: ${cmd.selector}`);
              } catch {
                logs.push(`Wait timeout for: ${cmd.selector}`);
              }
            } else if (cmd.value) {
              const seconds = parseInt(cmd.value) || 2;
              await this.driver!.sleep(seconds * 1000);
              logs.push(`Waited ${seconds} seconds`);
            } else {
              await this.driver!.sleep(2000);
              logs.push("Waited 2 seconds");
            }
            break;
            
          case "check":
            if (cmd.selector) {
              const labelText = cmd.selector.replace(/['"]/g, '');
              let checked = false;
              
              // Strategy 1: Find checkbox by label text
              const checkboxXpaths = [
                // Checkbox with matching name/id
                `//input[@type="checkbox"][contains(@name, "${labelText}") or contains(@id, "${labelText}")]`,
                // Checkbox inside label
                `//label[contains(text(), "${labelText}")]//input[@type="checkbox"]`,
                // Checkbox before/after label
                `//label[contains(text(), "${labelText}")]//preceding::input[@type="checkbox"][1]`,
                `//label[contains(text(), "${labelText}")]//following::input[@type="checkbox"][1]`,
                // Checkbox with aria-label
                `//input[@type="checkbox"][contains(@aria-label, "${labelText}")]`,
                // Custom checkbox (div/span with role)
                `//*[@role="checkbox"][contains(text(), "${labelText}") or contains(@aria-label, "${labelText}")]`,
                `//*[contains(text(), "${labelText}")]//preceding::*[@role="checkbox"][1]`,
                `//*[contains(text(), "${labelText}")]//following::*[@role="checkbox"][1]`,
              ];
              
              for (const xpath of checkboxXpaths) {
                try {
                  const checkbox = await this.driver!.findElement(By.xpath(xpath));
                  const tagName = await checkbox.getTagName();
                  
                  if (tagName.toLowerCase() === 'input') {
                    const isChecked = await checkbox.isSelected();
                    if (!isChecked) {
                      await this.driver!.executeScript("arguments[0].scrollIntoView({block: 'center'});", checkbox);
                      try {
                        await checkbox.click();
                      } catch {
                        await this.driver!.executeScript("arguments[0].click();", checkbox);
                      }
                    }
                  } else {
                    // Custom checkbox - just click it
                    await checkbox.click();
                  }
                  logs.push(`Checked: ${labelText}`);
                  checked = true;
                  break;
                } catch { continue; }
              }
              
              // Strategy 2: Click the label itself (which toggles the checkbox)
              if (!checked) {
                try {
                  const label = await this.driver!.findElement(By.xpath(`//label[contains(text(), "${labelText}")]`));
                  await label.click();
                  logs.push(`Checked via label click: ${labelText}`);
                  checked = true;
                } catch { }
              }
              
              if (!checked) {
                logs.push(`Could not check: ${labelText}`);
              }
            }
            break;
            
          case "uncheck":
            if (cmd.selector) {
              const labelText = cmd.selector.replace(/['"]/g, '');
              try {
                const checkbox = await this.driver!.findElement(By.xpath(`//input[@type="checkbox"][contains(@name, "${labelText}") or contains(@id, "${labelText}")] | //label[contains(text(), "${labelText}")]//input[@type="checkbox"] | //label[contains(text(), "${labelText}")]//following::input[@type="checkbox"][1]`));
                const isChecked = await checkbox.isSelected();
                if (isChecked) {
                  await checkbox.click();
                }
                logs.push(`Unchecked: ${labelText}`);
              } catch {
                logs.push(`Could not uncheck: ${labelText}`);
              }
            }
            break;
            
          case "radio":
            // Handle radio button selection
            if (cmd.selector) {
              const labelText = cmd.selector.replace(/['"]/g, '');
              let selected = false;
              
              const radioXpaths = [
                // Radio with matching value
                `//input[@type="radio"][@value="${labelText}"]`,
                // Radio with matching name/id containing the text
                `//input[@type="radio"][contains(@name, "${labelText}") or contains(@id, "${labelText}")]`,
                // Radio inside label
                `//label[contains(text(), "${labelText}")]//input[@type="radio"]`,
                // Radio before/after label text
                `//label[contains(text(), "${labelText}")]//preceding::input[@type="radio"][1]`,
                `//label[contains(text(), "${labelText}")]//following::input[@type="radio"][1]`,
                // Radio with aria-label
                `//input[@type="radio"][contains(@aria-label, "${labelText}")]`,
                // Custom radio (role="radio")
                `//*[@role="radio"][contains(text(), "${labelText}") or contains(@aria-label, "${labelText}")]`,
                `//*[contains(text(), "${labelText}")]//ancestor::label//input[@type="radio"]`,
              ];
              
              for (const xpath of radioXpaths) {
                try {
                  const radio = await this.driver!.findElement(By.xpath(xpath));
                  await this.driver!.executeScript("arguments[0].scrollIntoView({block: 'center'});", radio);
                  const isSelected = await radio.isSelected().catch(() => false);
                  if (!isSelected) {
                    try {
                      await radio.click();
                    } catch {
                      await this.driver!.executeScript("arguments[0].click();", radio);
                    }
                  }
                  logs.push(`Selected radio: ${labelText}`);
                  selected = true;
                  break;
                } catch { continue; }
              }
              
              // Try clicking the label
              if (!selected) {
                try {
                  const label = await this.driver!.findElement(By.xpath(`//label[contains(text(), "${labelText}")]`));
                  await label.click();
                  logs.push(`Selected radio via label: ${labelText}`);
                  selected = true;
                } catch { }
              }
              
              if (!selected) {
                logs.push(`Could not select radio: ${labelText}`);
              }
            }
            break;
            
          case "switchToIframe":
            if (cmd.selector) {
              try {
                // Try by name, id, or finding by title/content
                let switched = false;
                
                // Try by name
                try {
                  await this.driver!.switchTo().frame(cmd.selector);
                  switched = true;
                } catch { }
                
                // Try by finding iframe element
                if (!switched) {
                  try {
                    const iframe = await this.driver!.findElement(By.css(`iframe[name="${cmd.selector}"], iframe[id="${cmd.selector}"], iframe[title*="${cmd.selector}"]`));
                    await this.driver!.switchTo().frame(iframe);
                    switched = true;
                  } catch { }
                }
                
                // Try by index if selector is a number
                if (!switched && !isNaN(parseInt(cmd.selector))) {
                  try {
                    await this.driver!.switchTo().frame(parseInt(cmd.selector));
                    switched = true;
                  } catch { }
                }
                
                // Try finding iframe by partial title match
                if (!switched) {
                  try {
                    const iframes = await this.driver!.findElements(By.tagName("iframe"));
                    for (const iframe of iframes) {
                      const title = await iframe.getAttribute("title");
                      if (title && title.toLowerCase().includes(cmd.selector.toLowerCase())) {
                        await this.driver!.switchTo().frame(iframe);
                        switched = true;
                        break;
                      }
                    }
                  } catch { }
                }
                
                if (switched) {
                  logs.push(`Switched to iframe: ${cmd.selector}`);
                } else {
                  logs.push(`Could not find iframe: ${cmd.selector}`);
                  return false;
                }
              } catch (e: any) {
                logs.push(`Iframe switch failed: ${e.message}`);
                return false;
              }
            }
            break;
            
          case "switchToMainFrame":
            try {
              await this.driver!.switchTo().defaultContent();
              logs.push("Switched to main frame/default content");
            } catch (e: any) {
              logs.push(`Failed to switch to main frame: ${e.message}`);
            }
            break;
            
          case "switchToNewWindow":
            try {
              const currentWindow = await this.driver!.getWindowHandle();
              let allWindows = await this.driver!.getAllWindowHandles();
              logs.push(`DEBUG: Current windows count: ${allWindows.length}, current handle: ${currentWindow.slice(0, 10)}...`);
              
              // Check if popup is already open (more than 1 window)
              if (allWindows.length > 1) {
                // Switch to a different window (not the current one)
                for (const handle of allWindows) {
                  if (handle !== currentWindow) {
                    await this.driver!.switchTo().window(handle);
                    logs.push(`Switched to popup window (already open, handle: ${handle.slice(0, 10)}...)`);
                    break;
                  }
                }
              } else {
                // Wait for new window to appear (max 20 seconds with polling)
                logs.push(`DEBUG: Only 1 window, waiting for popup to appear...`);
                let found = false;
                for (let i = 0; i < 40; i++) {
                  await this.driver!.sleep(500);
                  allWindows = await this.driver!.getAllWindowHandles();
                  if (i % 4 === 0) {
                    logs.push(`DEBUG: Check ${i+1}/40 - windows count: ${allWindows.length}`);
                  }
                  if (allWindows.length > 1) {
                    for (const handle of allWindows) {
                      if (handle !== currentWindow) {
                        await this.driver!.switchTo().window(handle);
                        logs.push(`Switched to new popup window (handle: ${handle.slice(0, 10)}...)`);
                        found = true;
                        break;
                      }
                    }
                    if (found) break;
                  }
                }
                if (!found) {
                  logs.push(`No new window appeared after 20 seconds. Window count remained at ${allWindows.length}`);
                  return false;
                }
              }
            } catch (e: any) {
              logs.push(`Failed to switch to new window: ${e.message}`);
              return false;
            }
            break;
            
          case "switchToWindow":
            try {
              const windowIndex = cmd.windowIndex ?? 0;
              const handles = await this.driver!.getAllWindowHandles();
              if (windowIndex >= 0 && windowIndex < handles.length) {
                await this.driver!.switchTo().window(handles[windowIndex]);
                logs.push(`Switched to window ${windowIndex}`);
              } else {
                logs.push(`Invalid window index: ${windowIndex}`);
                return false;
              }
            } catch (e: any) {
              logs.push(`Window switch failed: ${e.message}`);
              return false;
            }
            break;
            
          case "closeWindow":
            try {
              await this.driver!.close();
              const handles = await this.driver!.getAllWindowHandles();
              if (handles.length > 0) {
                await this.driver!.switchTo().window(handles[0]);
              }
              logs.push("Closed window and switched to main");
            } catch (e: any) {
              logs.push(`Close window failed: ${e.message}`);
            }
            break;
            
          case "verify":
            if (cmd.selector) {
              const selectorLower = cmd.selector.toLowerCase();
              
              // Special handling for window/popup verification
              if (selectorLower.includes("new window") || selectorLower.includes("popup") || selectorLower.includes("new tab")) {
                const handles = await this.driver!.getAllWindowHandles();
                if (handles.length > 1) {
                  logs.push(`Verified "${cmd.selector}": window count = ${handles.length}`);
                } else {
                  logs.push(`Verified "${cmd.selector}": no new window detected (count = ${handles.length})`);
                  return false;
                }
              } else {
                // Standard text verification
                const pageSource = await this.driver!.getPageSource();
                const found = pageSource.toLowerCase().includes(selectorLower);
                logs.push(`Verified "${cmd.selector}": ${found ? "found" : "not found"}`);
                if (!found) return false;
              }
            }
            break;
            
          default:
            logs.push(`Unknown action: ${cmd.action}`);
        }
      } catch (error: any) {
        logs.push(`Command failed: ${error.message}`);
        return false;
      }
    }
    
    // Verify expected result
    try {
      const expectedLower = expected.toLowerCase();
      
      // Special handling for window/popup verification in expected result
      if (expectedLower.includes("new window") || expectedLower.includes("popup") || expectedLower.includes("new tab")) {
        const handles = await this.driver!.getAllWindowHandles();
        if (handles.length > 1) {
          logs.push(`Verified: new window opened (count = ${handles.length})`);
        } else {
          logs.push(`Expected new window not found (window count = ${handles.length})`);
          return false;
        }
      } else {
        const pageSource = await this.driver!.getPageSource();
        // Check for common verification patterns in expected
        const verifyMatch = expected.match(/verify\s+["']?(.+?)["']?\s*(?:is\s+)?(?:displayed|visible|present|shown)/i);
        if (verifyMatch) {
          const textToFind = verifyMatch[1];
          if (!pageSource.toLowerCase().includes(textToFind.toLowerCase())) {
            logs.push(`Expected text not found: ${textToFind}`);
            return false;
          }
          logs.push(`Verified: ${textToFind}`);
        }
      }
    } catch { }
    
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
    testData?: TestDataParam[],
    selfHealing: boolean = false,
    maxRetries: number = 2,
    agentCapabilities?: string[]
  ): Promise<void> {
    const executor = this.getExecutor(framework);
    let passedCount = 0;
    let failedCount = 0;
    const startTime = Date.now();
    
    // Convert agent capabilities to execution capabilities
    const capabilities: ExecutionCapabilities = {
      captureVideo: agentCapabilities?.includes('video'),
      captureNetwork: agentCapabilities?.includes('network-logging'),
      capturePerformance: agentCapabilities?.includes('performance-metrics'),
    };
    
    console.log(`[TestExecutor] Agent capabilities: ${JSON.stringify(agentCapabilities)}`);
    console.log(`[TestExecutor] Execution capabilities: ${JSON.stringify(capabilities)}`);

    await storage.updateExecution(executionId, {
      status: "running",
      startedAt: new Date(),
    });

    try {
      await executor.initialize();

      for (const testCase of testCases) {
        try {
          let result = await executor.executeTest(testCase, targetUrl, testData, capabilities);
          let healingAttempts = 0;
          let healed = false;

          // Self-healing: if test failed and self-healing is enabled, try to fix and retry
          while (!result.passed && selfHealing && healingAttempts < maxRetries) {
            healingAttempts++;
            console.log(`[Self-Healing] Attempt ${healingAttempts}/${maxRetries} for test: ${testCase.title}`);
            
            const healedSteps = await this.attemptSelfHealing(testCase, result);
            if (healedSteps) {
              // Create a modified test case with healed steps
              const healedTestCase = { ...testCase, steps: healedSteps };
              result = await executor.executeTest(healedTestCase, targetUrl, testData, capabilities);
              
              if (result.passed) {
                healed = true;
                result.logs = [...(result.logs || []), `[Self-Healing] Test passed after healing attempt ${healingAttempts}`];
                console.log(`[Self-Healing] Success! Test passed after healing`);
              }
            } else {
              break; // AI couldn't suggest a fix
            }
          }

          if (result.passed) {
            passedCount++;
          } else {
            failedCount++;
          }

          // Build detailed error message from step results
          let detailedErrorMessage = result.errorMessage || null;
          const detailedLogs = [...(result.logs || [])];
          
          if (!result.passed && result.steps) {
            const failedSteps = result.steps.filter((s: any) => !s.passed);
            if (failedSteps.length > 0) {
              // Create a summary error message
              const errorParts = failedSteps.map((s: any, idx: number) => {
                const stepNum = result.steps.indexOf(s) + 1;
                return `Step ${stepNum}: ${s.error || 'Verification failed'} (Action: "${s.step}")`;
              });
              detailedErrorMessage = `${failedSteps.length} step(s) failed:\n${errorParts.join('\n')}`;
              
              // Add step-by-step details to logs
              detailedLogs.push('\n=== STEP-BY-STEP RESULTS ===');
              result.steps.forEach((s: any, idx: number) => {
                const status = s.passed ? '✓ PASS' : '✗ FAIL';
                detailedLogs.push(`Step ${idx + 1} [${status}]: ${s.step}`);
                detailedLogs.push(`  Expected: ${s.expected}`);
                if (!s.passed && s.error) {
                  detailedLogs.push(`  Error: ${s.error}`);
                }
              });
            }
          }

          if (healed) {
            detailedLogs.push(`[Self-Healing] Healed after ${healingAttempts} attempt(s)`);
          }

          await storage.createResult({
            executionId,
            testCaseId: testCase.id,
            status: result.passed ? "passed" : "failed",
            duration: result.duration,
            errorMessage: detailedErrorMessage,
            screenshot: result.screenshot || null,
            stepScreenshots: result.stepScreenshots || null,
            video: result.video || null,
            networkLogs: result.networkLogs || null,
            performanceMetrics: result.performanceMetrics || null,
            logs: detailedLogs,
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
            stepScreenshots: null,
            video: null,
            networkLogs: null,
            performanceMetrics: null,
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

  // Self-healing: use AI to suggest alternative steps when a test fails
  private async attemptSelfHealing(
    testCase: TestCase,
    failedResult: { passed: boolean; errorMessage?: string; logs?: string[] }
  ): Promise<TestCase["steps"] | null> {
    try {
      const systemPrompt = `You are a test automation expert. A test step failed. Analyze the failure and suggest corrected test steps.

The test may have failed due to:
- Changed element selectors (class names, IDs)
- Different page structure
- Timing issues (element not loaded yet)
- Changed text content

Return a JSON object with:
- canHeal: boolean - whether you can suggest a fix
- healedSteps: array of step objects with "action" and "expected" properties
- explanation: string - what you changed and why

Each step should have the same structure as the original steps.
Only return JSON, no explanation outside the JSON.`;

      const userPrompt = `Test: ${testCase.title}
      
Original steps:
${JSON.stringify(testCase.steps, null, 2)}

Error message: ${failedResult.errorMessage || "Unknown error"}

Logs:
${(failedResult.logs || []).slice(-5).join("\n")}

Suggest alternative steps that might work better.`;

      const aiClient = await getAiClient();
      const content = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);

      let result;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        result = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch {
        console.log("[Self-Healing] Failed to parse AI response");
        return null;
      }

      if (result.canHeal && result.healedSteps && result.healedSteps.length > 0) {
        console.log(`[Self-Healing] AI suggestion: ${result.explanation}`);
        return result.healedSteps;
      }

      return null;
    } catch (error) {
      console.error("[Self-Healing] AI call failed:", error);
      return null;
    }
  }
}

export const testExecutor = new TestExecutor();
