/**
 * AITAS Canonical Test Case Engine
 * ================================
 * Enterprise-grade test case normalization, validation, and automation code generation.
 * 
 * This module implements the complete pipeline:
 * 1. Canonical Test Case Schema (THE source of truth)
 * 2. Multi-format Parser (Excel, CSV, JSON)
 * 3. Structural Validators (hard gates)
 * 4. Object Repository (selectors/endpoints)
 * 5. Code Generators (Playwright, Cypress, Selenium, Puppeteer)
 * 
 * Design Philosophy:
 * - Uploaded test cases are DATA, not PROMPTS
 * - Normalize → Validate → Execute → Enhance with AI
 */

import { z } from "zod";

// ================================================================================
// SECTION 1: CANONICAL TEST CASE SCHEMA (NON-NEGOTIABLE)
// Everything (Excel, CSV, Jira, AI-generated) must convert into this format
// ================================================================================

/**
 * All valid action types for test steps
 * These are the ONLY actions the system will accept
 */
export const ActionTypes = [
  // Navigation
  "NAVIGATE",
  "NEWTAB",
  "NEWWINDOW",
  "SWITCHWINDOW",
  "CLOSE",
  "BACK",
  "FORWARD",
  "REFRESH",
  
  // Input Actions
  "INPUT",
  "CLEAR",
  "UPLOAD",
  
  // Click Actions
  "CLICK",
  "DOUBLECLICK",
  "RIGHTCLICK",
  "HOVER",
  
  // Selection Actions
  "SELECT",
  "CHECKBOX",
  "RADIOBUTTON",
  
  // Verification Actions
  "VERIFY",
  "ASSERT",
  "CHECKTEXT",
  "CHECKELEMENT",
  "CAPTURE",
  
  // Wait Actions
  "WAIT",
  "WAITFORELEMENT",
  "WAITFORTEXT",
  
  // Scroll Actions
  "SCROLLDOWN",
  "SCROLLUP",
  "SCROLLTO",
  
  // Keyboard Actions
  "PRESS",
  "TYPE",
  
  // Alert/Dialog Actions
  "ACCEPT",
  "DISMISS",
  
  // API Actions
  "API_CALL",
  "API_GET",
  "API_POST",
  "API_PUT",
  "API_DELETE",
  
  // Mobile-specific
  "SWIPE",
  "TAP",
  "LONGPRESS",
  
  // Data Actions
  "EXTRACT",
  "STORE",
  "SUBMIT",
] as const;

export type ActionType = typeof ActionTypes[number];

/**
 * Application types supported by AITAS
 */
export type ApplicationType = "WEB" | "API" | "MOBILE" | "DESKTOP" | "JDE" | "SAP" | "SALESFORCE";

/**
 * Test types for categorization
 */
export type TestType = "UI_FUNCTIONAL" | "API_FUNCTIONAL" | "E2E" | "INTEGRATION" | "SMOKE" | "REGRESSION" | "PERFORMANCE" | "SECURITY";

/**
 * Canonical Test Step Schema
 * Each step is atomic and automation-friendly
 */
export const CanonicalTestStepSchema = z.object({
  stepNumber: z.number().int().positive("Step number must be positive"),
  actionType: z.enum(ActionTypes as readonly [string, ...string[]], {
    errorMap: () => ({ message: `Action must be one of: ${ActionTypes.join(", ")}` })
  }),
  target: z.string().optional().describe("Element identifier, field name, or endpoint"),
  value: z.string().optional().describe("Input value, URL, or payload"),
  expectedResult: z.string().min(1, "Expected result is required"),
  
  // Optional metadata for advanced scenarios
  timeout: z.number().optional().describe("Step timeout in ms"),
  screenshot: z.boolean().optional().describe("Capture screenshot after this step"),
  continueOnError: z.boolean().optional().describe("Continue execution if step fails"),
  
  // API-specific fields
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional(),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
  statusCode: z.number().optional(),
});

export type CanonicalTestStep = z.infer<typeof CanonicalTestStepSchema>;

/**
 * Canonical Test Case Schema - THE source of truth
 * All test cases must conform to this structure
 */
export const CanonicalTestCaseSchema = z.object({
  // Identification
  testCaseId: z.string()
    .min(3, "Test Case ID must be at least 3 characters")
    .regex(/^[A-Z0-9_-]+$/i, "Test Case ID must contain only letters, numbers, hyphens, and underscores"),
  title: z.string().min(1, "Title is required"),
  
  // Application Context
  application: z.enum(["WEB", "API", "MOBILE", "DESKTOP", "JDE", "SAP", "SALESFORCE"]).default("WEB"),
  testType: z.enum(["UI_FUNCTIONAL", "API_FUNCTIONAL", "E2E", "INTEGRATION", "SMOKE", "REGRESSION", "PERFORMANCE", "SECURITY"]).default("UI_FUNCTIONAL"),
  module: z.string().optional().describe("Application module or feature area"),
  
  // Test Details
  description: z.string().optional(),
  preconditions: z.array(z.string()).default([]),
  steps: z.array(CanonicalTestStepSchema).min(1, "At least one step is required"),
  postconditions: z.array(z.string()).default([]),
  
  // Test Data
  testData: z.array(z.object({
    key: z.string(),
    value: z.string(),
    type: z.enum(["text", "number", "email", "url", "password", "date", "boolean", "json"]).default("text"),
  })).default([]),
  
  // Priority & Status
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  automationStatus: z.enum(["manual", "automated", "partial"]).default("manual"),
  
  // Metadata
  metadata: z.object({
    source: z.enum(["UPLOAD", "AI", "MANUAL", "JIRA", "API"]).default("UPLOAD"),
    originalFile: z.string().optional(),
    environment: z.string().optional(),
    browser: z.string().optional(),
    createdBy: z.string().optional(),
    createdAt: z.string().optional(),
    lastModified: z.string().optional(),
  }).default({ source: "UPLOAD" }),
  
  // Tags for filtering
  tags: z.array(z.string()).default([]),
  
  // Execution hints
  estimatedDuration: z.number().optional().describe("Estimated execution time in seconds"),
  retryCount: z.number().default(0),
});

export type CanonicalTestCase = z.infer<typeof CanonicalTestCaseSchema>;

// ================================================================================
// SECTION 2: VALIDATORS (SYSTEM GUARDRAILS)
// ================================================================================

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: "critical" | "error" | "warning";
  rowIndex?: number;
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  normalizedTestCase?: CanonicalTestCase;
  score: number; // 0-100
}

/**
 * Comprehensive validator for canonical test cases
 */
export function validateCanonicalTestCase(testCase: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let score = 100;

  // 1. HARD FAIL: Steps must exist
  if (!testCase.steps || !Array.isArray(testCase.steps) || testCase.steps.length === 0) {
    errors.push({
      field: "steps",
      message: "Test case must have at least one step",
      code: "MISSING_STEPS",
      severity: "critical",
      suggestion: "Add at least one step with actionType, target, and expectedResult"
    });
    score -= 50;
  } else {
    // 2. Validate each step
    testCase.steps.forEach((step: any, index: number) => {
      // HARD FAIL: Action type required
      if (!step.actionType) {
        errors.push({
          field: `steps[${index}].actionType`,
          message: `Step ${index + 1} is missing action type`,
          code: "MISSING_ACTION_TYPE",
          severity: "critical",
          rowIndex: index,
          suggestion: `Add actionType (e.g., "NAVIGATE", "CLICK", "INPUT", "VERIFY")`
        });
        score -= 10;
      } else if (!ActionTypes.includes(step.actionType)) {
        errors.push({
          field: `steps[${index}].actionType`,
          message: `Step ${index + 1} has invalid action type: ${step.actionType}`,
          code: "INVALID_ACTION_TYPE",
          severity: "error",
          rowIndex: index,
          suggestion: `Valid actions: ${ActionTypes.slice(0, 10).join(", ")}...`
        });
        score -= 5;
      }

      // HARD FAIL: Expected result required
      if (!step.expectedResult) {
        errors.push({
          field: `steps[${index}].expectedResult`,
          message: `Step ${index + 1} is missing expected result`,
          code: "MISSING_EXPECTED_RESULT",
          severity: "critical",
          rowIndex: index,
          suggestion: "Add expectedResult describing what should happen"
        });
        score -= 10;
      }

      // WARNING: Input actions without target
      if (["CLICK", "INPUT", "SELECT", "CHECKBOX", "RADIOBUTTON"].includes(step.actionType) && !step.target) {
        warnings.push({
          field: `steps[${index}].target`,
          message: `Step ${index + 1}: ${step.actionType} action typically requires a target element`,
          code: "MISSING_TARGET",
          severity: "warning",
          rowIndex: index,
          suggestion: "Add target element identifier (CSS selector, XPath, or element name)"
        });
        score -= 3;
      }

      // WARNING: INPUT action without value
      if (step.actionType === "INPUT" && !step.value) {
        warnings.push({
          field: `steps[${index}].value`,
          message: `Step ${index + 1}: INPUT action without value - will input empty string`,
          code: "MISSING_INPUT_VALUE",
          severity: "warning",
          rowIndex: index
        });
        score -= 2;
      }
    });

    // 3. Step order validator - auto-fix non-sequential
    const stepNumbers = testCase.steps.map((s: any) => s.stepNumber);
    const isSequential = stepNumbers.every((n: number, i: number) => n === i + 1);
    if (!isSequential) {
      warnings.push({
        field: "steps",
        message: "Step numbers are not sequential - will be auto-corrected",
        code: "NON_SEQUENTIAL_STEPS",
        severity: "warning",
        suggestion: "Steps will be renumbered 1, 2, 3..."
      });
      score -= 1;
    }

    // 4. Execution readiness validator
    const hasNavigate = testCase.steps.some((s: any) => s.actionType === "NAVIGATE");
    if (testCase.testType === "UI_FUNCTIONAL" && !hasNavigate) {
      warnings.push({
        field: "steps",
        message: "UI test has no NAVIGATE step - no entry point detected",
        code: "MISSING_ENTRY_POINT",
        severity: "warning",
        suggestion: "Consider adding a NAVIGATE step as the first step to set the starting URL"
      });
      score -= 5;
    }
  }

  // 5. Validate test case ID
  if (!testCase.testCaseId) {
    errors.push({
      field: "testCaseId",
      message: "Test Case ID is required",
      code: "MISSING_ID",
      severity: "critical",
      suggestion: "Add a unique test case ID (e.g., TC_LOGIN_001)"
    });
    score -= 10;
  }

  // 6. Validate title
  if (!testCase.title) {
    errors.push({
      field: "title",
      message: "Test case title is required",
      code: "MISSING_TITLE",
      severity: "error",
      suggestion: "Add a descriptive title for the test case"
    });
    score -= 5;
  }

  // Normalize test case if valid enough
  let normalizedTestCase: CanonicalTestCase | undefined;
  if (errors.filter(e => e.severity === "critical").length === 0) {
    try {
      // Auto-fix step numbers
      const fixedSteps = (testCase.steps || []).map((step: any, index: number) => ({
        ...step,
        stepNumber: index + 1,
      }));

      normalizedTestCase = CanonicalTestCaseSchema.parse({
        ...testCase,
        steps: fixedSteps,
        testCaseId: testCase.testCaseId || `TC_${Date.now()}`,
        title: testCase.title || "Untitled Test Case",
      });
    } catch (zodError: any) {
      // Schema validation failed
      if (zodError.errors) {
        zodError.errors.forEach((err: any) => {
          errors.push({
            field: err.path.join("."),
            message: err.message,
            code: "SCHEMA_VALIDATION_ERROR",
            severity: "error"
          });
        });
      }
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    isValid: errors.filter(e => e.severity === "critical").length === 0,
    errors,
    warnings,
    normalizedTestCase,
    score
  };
}

// ================================================================================
// SECTION 3: EXCEL/CSV PARSER - INTELLIGENT COLUMN MAPPING
// ================================================================================

/**
 * Action keyword mapping for step classification
 * This is RULE-BASED, not AI - deterministic behavior
 */
const ACTION_KEYWORD_MAP: Record<string, ActionType> = {
  // Navigation keywords
  "navigate": "NAVIGATE",
  "go to": "NAVIGATE",
  "open": "NAVIGATE",
  "launch": "NAVIGATE",
  "visit": "NAVIGATE",
  "url": "NAVIGATE",
  
  // Input keywords
  "enter": "INPUT",
  "input": "INPUT",
  "type": "INPUT",
  "fill": "INPUT",
  "set": "INPUT",
  "write": "INPUT",
  
  // Click keywords
  "click": "CLICK",
  "press": "CLICK",
  "tap": "TAP",
  "double click": "DOUBLECLICK",
  "right click": "RIGHTCLICK",
  
  // Selection keywords
  "select": "SELECT",
  "choose": "SELECT",
  "pick": "SELECT",
  "dropdown": "SELECT",
  "check checkbox": "CHECKBOX",
  "uncheck": "CHECKBOX",
  "tick": "CHECKBOX",
  "untick": "CHECKBOX",
  "radio": "RADIOBUTTON",
  
  // Verification keywords
  "verify": "VERIFY",
  "validate": "VERIFY",
  "assert": "ASSERT",
  "confirm": "VERIFY",
  "check": "VERIFY",
  "ensure": "VERIFY",
  "should": "VERIFY",
  "expect": "VERIFY",
  
  // Wait keywords
  "wait": "WAIT",
  "pause": "WAIT",
  "delay": "WAIT",
  "sleep": "WAIT",
  
  // Scroll keywords
  "scroll": "SCROLLDOWN",
  "scroll down": "SCROLLDOWN",
  "scroll up": "SCROLLUP",
  
  // Upload keywords
  "upload": "UPLOAD",
  "attach": "UPLOAD",
  "browse": "UPLOAD",
  
  // Window keywords
  "switch": "SWITCHWINDOW",
  "new tab": "NEWTAB",
  "new window": "NEWWINDOW",
  "close": "CLOSE",
  
  // Alert keywords
  "accept": "ACCEPT",
  "dismiss": "DISMISS",
  "ok": "ACCEPT",
  "cancel": "DISMISS",
  
  // API keywords
  "api": "API_CALL",
  "get": "API_GET",
  "post": "API_POST",
  "put": "API_PUT",
  "delete": "API_DELETE",
  
  // Capture
  "screenshot": "CAPTURE",
  "capture": "CAPTURE",
};

/**
 * Classify step text into action type
 */
export function classifyActionType(stepText: string): ActionType {
  const lower = stepText.toLowerCase().trim();
  
  // Check each keyword
  for (const [keyword, actionType] of Object.entries(ACTION_KEYWORD_MAP)) {
    if (lower.startsWith(keyword) || lower.includes(keyword + " ")) {
      return actionType;
    }
  }
  
  // Default to VERIFY if no match (safe fallback)
  return "VERIFY";
}

/**
 * Extract target and value from step text
 * Handles patterns like:
 * - "Enter User ID = BPLMTest002"
 * - "Click Login button"
 * - "Navigate to https://example.com"
 */
export function extractTargetValue(stepText: string): { target: string; value?: string } {
  const text = stepText.trim();
  
  // Pattern 1: "Field = Value" or "Field: Value"
  const equalsMatch = text.match(/^(?:enter|input|type|set|fill)\s+(.+?)\s*[=:]\s*(.+)$/i);
  if (equalsMatch) {
    return { target: equalsMatch[1].trim(), value: equalsMatch[2].trim() };
  }
  
  // Pattern 2: "Navigate to URL"
  const navigateMatch = text.match(/^(?:navigate|go|open|visit|launch)\s+(?:to\s+)?(.+)$/i);
  if (navigateMatch) {
    return { target: "URL", value: navigateMatch[1].trim() };
  }
  
  // Pattern 3: "Click/Select/Verify Element"
  const actionMatch = text.match(/^(?:click|select|verify|check|choose|hover)\s+(?:on\s+)?(?:the\s+)?(.+)$/i);
  if (actionMatch) {
    return { target: actionMatch[1].trim() };
  }
  
  // Pattern 4: "Wait for X seconds"
  const waitMatch = text.match(/^wait\s+(?:for\s+)?(\d+)\s*(?:seconds?|ms)?$/i);
  if (waitMatch) {
    return { target: "timeout", value: waitMatch[1] };
  }
  
  // Pattern 5: Generic extraction - take everything after first verb
  const words = text.split(/\s+/);
  if (words.length > 1) {
    // Skip the first word (verb) and use the rest as target
    const targetPart = words.slice(1).join(" ");
    // Check if there's an "=" or ":" for value
    if (targetPart.includes("=") || targetPart.includes(":")) {
      const [t, v] = targetPart.split(/[=:]/).map(s => s.trim());
      return { target: t, value: v };
    }
    return { target: targetPart };
  }
  
  // Fallback: use whole text as target
  return { target: text };
}

/**
 * Detect if a row is a scenario/section header (not a step)
 */
export function isScenarioHeader(row: any, headers: string[]): boolean {
  const title = String(row[headers.indexOf("title")] || row[0] || "").trim();
  const step = String(row[headers.indexOf("step")] || row[1] || "").trim();
  const expected = String(row[headers.indexOf("expected")] || row[2] || "").trim();
  
  // Header if: has title but NO step AND NO expected
  if (title && !step && !expected) {
    return true;
  }
  
  // Header if: step doesn't start with a verb
  if (step) {
    const firstWord = step.split(/\s+/)[0].toLowerCase();
    const verbs = Object.keys(ACTION_KEYWORD_MAP);
    const startsWithVerb = verbs.some(v => firstWord.startsWith(v) || v.startsWith(firstWord));
    if (!startsWithVerb && title) {
      return true;
    }
  }
  
  return false;
}

export interface ParsedExcelResult {
  testCases: CanonicalTestCase[];
  errors: ValidationError[];
  warnings: ValidationError[];
  metadata: {
    fileName: string;
    totalRows: number;
    parsedScenarios: number;
    totalSteps: number;
  };
}

/**
 * Parse Excel file buffer into canonical test cases
 */
export function parseExcelToCanonical(
  rows: any[][],
  fileName: string
): ParsedExcelResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const testCases: CanonicalTestCase[] = [];
  
  if (rows.length < 2) {
    errors.push({
      field: "file",
      message: "Excel file has no data rows",
      code: "EMPTY_FILE",
      severity: "critical"
    });
    return { testCases: [], errors, warnings, metadata: { fileName, totalRows: 0, parsedScenarios: 0, totalSteps: 0 } };
  }
  
  // Detect headers (case-insensitive)
  const rawHeaders = rows[0].map((h: any) => String(h).toLowerCase().trim());
  const headerMap = {
    title: rawHeaders.findIndex(h => h.includes("title") || h.includes("scenario") || h.includes("name") || h.includes("test")),
    step: rawHeaders.findIndex(h => h.includes("step") || h.includes("action")),
    expected: rawHeaders.findIndex(h => h.includes("expected") || h.includes("result")),
    precondition: rawHeaders.findIndex(h => h.includes("precond") || h.includes("prerequisite")),
    priority: rawHeaders.findIndex(h => h.includes("priority")),
    module: rawHeaders.findIndex(h => h.includes("module") || h.includes("feature")),
    testData: rawHeaders.findIndex(h => h.includes("data") || h.includes("input")),
  };
  
  let currentScenario = "";
  let currentSteps: CanonicalTestStep[] = [];
  let currentPreconditions: string[] = [];
  let currentModule = "";
  let currentPriority: "low" | "medium" | "high" | "critical" = "medium";
  let stepCounter = 1;
  let scenarioCounter = 0;
  let totalSteps = 0;
  
  const flushScenario = () => {
    if (currentScenario && currentSteps.length > 0) {
      scenarioCounter++;
      const testCaseId = `TC_${currentScenario.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase().substring(0, 30)}_${String(scenarioCounter).padStart(3, "0")}`;
      
      testCases.push({
        testCaseId,
        title: currentScenario,
        application: "WEB",
        testType: "UI_FUNCTIONAL",
        module: currentModule || undefined,
        preconditions: currentPreconditions,
        steps: currentSteps,
        postconditions: [],
        testData: [],
        priority: currentPriority,
        automationStatus: "manual",
        retryCount: 0,
        metadata: {
          source: "UPLOAD",
          originalFile: fileName,
        },
        tags: [],
      });
      
      totalSteps += currentSteps.length;
    }
    currentSteps = [];
    currentPreconditions = [];
    stepCounter = 1;
  };
  
  // Process each row
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c: any) => !c || String(c).trim() === "")) {
      continue; // Skip empty rows
    }
    
    const title = headerMap.title >= 0 ? String(row[headerMap.title] || "").trim() : "";
    const stepText = headerMap.step >= 0 ? String(row[headerMap.step] || "").trim() : "";
    const expectedText = headerMap.expected >= 0 ? String(row[headerMap.expected] || "").trim() : "";
    const precondText = headerMap.precondition >= 0 ? String(row[headerMap.precondition] || "").trim() : "";
    const moduleText = headerMap.module >= 0 ? String(row[headerMap.module] || "").trim() : "";
    const priorityText = headerMap.priority >= 0 ? String(row[headerMap.priority] || "medium").trim().toLowerCase() : "medium";
    
    // Check if this is a scenario header
    if (title && !stepText) {
      // Flush previous scenario
      flushScenario();
      
      // Start new scenario
      currentScenario = title;
      currentModule = moduleText || currentModule;
      currentPriority = ["low", "medium", "high", "critical"].includes(priorityText) 
        ? priorityText as "low" | "medium" | "high" | "critical" 
        : "medium";
      
      if (precondText) {
        currentPreconditions = precondText.split(/[;\n]/).map(p => p.trim()).filter(Boolean);
      }
      
      continue;
    }
    
    // This is a step row
    if (stepText) {
      const actionType = classifyActionType(stepText);
      const { target, value } = extractTargetValue(stepText);
      
      const step: CanonicalTestStep = {
        stepNumber: stepCounter++,
        actionType,
        target: target || undefined,
        value: value || undefined,
        expectedResult: expectedText || "Step completes successfully",
      };
      
      currentSteps.push(step);
      
      // If no scenario defined yet, create one from first step
      if (!currentScenario && title) {
        currentScenario = title;
      } else if (!currentScenario) {
        currentScenario = `Test Scenario ${scenarioCounter + 1}`;
      }
      
      // Warning if no expected result
      if (!expectedText) {
        warnings.push({
          field: `row[${i}].expected`,
          message: `Row ${i + 1} is missing expected result`,
          code: "MISSING_EXPECTED",
          severity: "warning",
          rowIndex: i
        });
      }
    }
  }
  
  // Flush final scenario
  flushScenario();
  
  return {
    testCases,
    errors,
    warnings,
    metadata: {
      fileName,
      totalRows: rows.length - 1,
      parsedScenarios: testCases.length,
      totalSteps
    }
  };
}

// ================================================================================
// SECTION 4: OBJECT REPOSITORY (SELECTOR MANAGEMENT)
// ================================================================================

export interface SelectorEntry {
  logicalName: string;
  css?: string;
  xpath?: string;
  id?: string;
  name?: string;
  testId?: string;
  role?: string;
  text?: string;
  placeholder?: string;
}

/**
 * Object Repository - decouples test logic from UI details
 * In production, this would be loaded from database
 */
export class ObjectRepository {
  private selectors: Map<string, SelectorEntry> = new Map();
  
  constructor() {
    // Initialize with common selectors
    this.addDefaults();
  }
  
  private addDefaults() {
    // Common login elements
    this.add("User ID", { css: "#userId, #username, [name='username'], [name='userId']" });
    this.add("Username", { css: "#username, [name='username'], [type='text'][name*='user']" });
    this.add("Password", { css: "#password, [name='password'], [type='password']" });
    this.add("Login button", { css: "#loginBtn, [type='submit'], button:has-text('Login'), button:has-text('Sign In')" });
    this.add("Submit button", { css: "[type='submit'], button:has-text('Submit')" });
    
    // Common form elements
    this.add("Email", { css: "[type='email'], [name='email'], #email" });
    this.add("First Name", { css: "[name='firstName'], #firstName" });
    this.add("Last Name", { css: "[name='lastName'], #lastName" });
    
    // Common navigation
    this.add("Dashboard", { css: "#dashboard, [href='/dashboard'], a:has-text('Dashboard')" });
    this.add("Home", { css: "[href='/'], a:has-text('Home')" });
    this.add("Settings", { css: "[href='/settings'], a:has-text('Settings')" });
  }
  
  add(logicalName: string, selector: Omit<SelectorEntry, "logicalName">) {
    this.selectors.set(logicalName.toLowerCase(), { logicalName, ...selector });
  }
  
  get(logicalName: string): SelectorEntry | undefined {
    return this.selectors.get(logicalName.toLowerCase());
  }
  
  resolve(target: string): string {
    const entry = this.get(target);
    if (entry) {
      // Priority: testId > id > css > xpath > name
      if (entry.testId) return `[data-testid="${entry.testId}"]`;
      if (entry.id) return `#${entry.id}`;
      if (entry.css) return entry.css;
      if (entry.xpath) return entry.xpath;
      if (entry.name) return `[name="${entry.name}"]`;
    }
    
    // If not found, return as-is (might be a raw selector)
    return target;
  }
  
  // Add from JSON config
  loadFromConfig(config: Record<string, SelectorEntry>) {
    for (const [name, entry] of Object.entries(config)) {
      this.add(name, entry);
    }
  }
}

// Singleton instance
export const objectRepository = new ObjectRepository();

// ================================================================================
// SECTION 5: CODE GENERATORS (PLAYWRIGHT, CYPRESS, SELENIUM, PUPPETEER)
// ================================================================================

export interface GeneratorOptions {
  framework: "playwright" | "cypress" | "selenium" | "puppeteer";
  language: "typescript" | "javascript" | "python" | "java" | "csharp";
  includeComments?: boolean;
  useObjectRepository?: boolean;
  baseUrl?: string;
}

/**
 * Generate Playwright code from canonical test case
 */
export function generatePlaywrightCode(tc: CanonicalTestCase, options: Partial<GeneratorOptions> = {}): string {
  const { includeComments = true, useObjectRepository = true } = options;
  
  let code = "";
  
  // Imports
  code += `import { test, expect } from '@playwright/test';\n\n`;
  
  // Test block
  code += `test('${escapeString(tc.title)}', async ({ page }) => {\n`;
  
  // Preconditions as comments
  if (includeComments && tc.preconditions.length > 0) {
    code += `  // Preconditions:\n`;
    tc.preconditions.forEach(pre => {
      code += `  // - ${pre}\n`;
    });
    code += `\n`;
  }
  
  // Generate steps
  for (const step of tc.steps) {
    if (includeComments) {
      code += `  // Step ${step.stepNumber}: ${step.expectedResult}\n`;
    }
    
    const selector = useObjectRepository ? objectRepository.resolve(step.target || "") : step.target;
    
    switch (step.actionType) {
      case "NAVIGATE":
        code += `  await page.goto('${escapeString(step.value || "")}');\n`;
        break;
      
      case "INPUT":
      case "TYPE":
        code += `  await page.fill('${selector}', '${escapeString(step.value || "")}');\n`;
        break;
      
      case "CLICK":
        code += `  await page.click('${selector}');\n`;
        break;
      
      case "DOUBLECLICK":
        code += `  await page.dblclick('${selector}');\n`;
        break;
      
      case "RIGHTCLICK":
        code += `  await page.click('${selector}', { button: 'right' });\n`;
        break;
      
      case "HOVER":
        code += `  await page.hover('${selector}');\n`;
        break;
      
      case "SELECT":
        code += `  await page.selectOption('${selector}', '${escapeString(step.value || "")}');\n`;
        break;
      
      case "CHECKBOX":
        if (step.value === "false" || step.value === "uncheck") {
          code += `  await page.uncheck('${selector}');\n`;
        } else {
          code += `  await page.check('${selector}');\n`;
        }
        break;
      
      case "VERIFY":
      case "ASSERT":
        code += `  await expect(page.locator('${selector}')).toBeVisible();\n`;
        break;
      
      case "CHECKTEXT":
        code += `  await expect(page.locator('${selector}')).toContainText('${escapeString(step.value || "")}');\n`;
        break;
      
      case "WAIT":
        code += `  await page.waitForTimeout(${parseInt(step.value || "1000")});\n`;
        break;
      
      case "WAITFORELEMENT":
        code += `  await page.waitForSelector('${selector}');\n`;
        break;
      
      case "CAPTURE":
        code += `  await page.screenshot({ path: 'screenshot_step_${step.stepNumber}.png' });\n`;
        break;
      
      case "CLEAR":
        code += `  await page.fill('${selector}', '');\n`;
        break;
      
      case "UPLOAD":
        code += `  await page.setInputFiles('${selector}', '${escapeString(step.value || "")}');\n`;
        break;
      
      case "PRESS":
        code += `  await page.keyboard.press('${escapeString(step.value || "Enter")}');\n`;
        break;
      
      case "SCROLLDOWN":
        code += `  await page.evaluate(() => window.scrollBy(0, 500));\n`;
        break;
      
      case "SCROLLUP":
        code += `  await page.evaluate(() => window.scrollBy(0, -500));\n`;
        break;
      
      case "ACCEPT":
        code += `  page.on('dialog', dialog => dialog.accept());\n`;
        break;
      
      case "DISMISS":
        code += `  page.on('dialog', dialog => dialog.dismiss());\n`;
        break;
      
      case "NEWTAB":
        code += `  const [newPage] = await Promise.all([page.waitForEvent('popup'), page.click('${selector}')]);\n`;
        break;
      
      default:
        code += `  // TODO: Implement ${step.actionType} for ${step.target}\n`;
    }
  }
  
  code += `});\n`;
  
  return code;
}

/**
 * Generate Cypress code from canonical test case
 */
export function generateCypressCode(tc: CanonicalTestCase, options: Partial<GeneratorOptions> = {}): string {
  const { includeComments = true, useObjectRepository = true } = options;
  
  let code = "";
  
  // Test block
  code += `describe('${escapeString(tc.module || tc.title)}', () => {\n`;
  code += `  it('${escapeString(tc.title)}', () => {\n`;
  
  // Generate steps
  for (const step of tc.steps) {
    if (includeComments) {
      code += `    // Step ${step.stepNumber}: ${step.expectedResult}\n`;
    }
    
    const selector = useObjectRepository ? objectRepository.resolve(step.target || "") : step.target;
    
    switch (step.actionType) {
      case "NAVIGATE":
        code += `    cy.visit('${escapeString(step.value || "")}');\n`;
        break;
      
      case "INPUT":
      case "TYPE":
        code += `    cy.get('${selector}').type('${escapeString(step.value || "")}');\n`;
        break;
      
      case "CLICK":
        code += `    cy.get('${selector}').click();\n`;
        break;
      
      case "DOUBLECLICK":
        code += `    cy.get('${selector}').dblclick();\n`;
        break;
      
      case "RIGHTCLICK":
        code += `    cy.get('${selector}').rightclick();\n`;
        break;
      
      case "HOVER":
        code += `    cy.get('${selector}').trigger('mouseover');\n`;
        break;
      
      case "SELECT":
        code += `    cy.get('${selector}').select('${escapeString(step.value || "")}');\n`;
        break;
      
      case "CHECKBOX":
        if (step.value === "false" || step.value === "uncheck") {
          code += `    cy.get('${selector}').uncheck();\n`;
        } else {
          code += `    cy.get('${selector}').check();\n`;
        }
        break;
      
      case "VERIFY":
      case "ASSERT":
        code += `    cy.get('${selector}').should('be.visible');\n`;
        break;
      
      case "CHECKTEXT":
        code += `    cy.get('${selector}').should('contain', '${escapeString(step.value || "")}');\n`;
        break;
      
      case "WAIT":
        code += `    cy.wait(${parseInt(step.value || "1000")});\n`;
        break;
      
      case "CLEAR":
        code += `    cy.get('${selector}').clear();\n`;
        break;
      
      case "UPLOAD":
        code += `    cy.get('${selector}').attachFile('${escapeString(step.value || "")}');\n`;
        break;
      
      case "SCROLLDOWN":
        code += `    cy.scrollTo('bottom');\n`;
        break;
      
      case "SCROLLUP":
        code += `    cy.scrollTo('top');\n`;
        break;
      
      default:
        code += `    // TODO: Implement ${step.actionType} for ${step.target}\n`;
    }
  }
  
  code += `  });\n`;
  code += `});\n`;
  
  return code;
}

/**
 * Generate Selenium code from canonical test case
 */
export function generateSeleniumCode(tc: CanonicalTestCase, options: Partial<GeneratorOptions> = {}): string {
  const { language = "typescript", includeComments = true, useObjectRepository = true } = options;
  
  if (language === "python") {
    return generateSeleniumPython(tc, { ...options, includeComments, useObjectRepository });
  }
  
  if (language === "java") {
    return generateSeleniumJava(tc, { ...options, includeComments, useObjectRepository });
  }
  
  // TypeScript/JavaScript
  let code = "";
  
  code += `import { Builder, By, until } from 'selenium-webdriver';\n\n`;
  code += `async function ${camelCase(tc.title)}() {\n`;
  code += `  const driver = await new Builder().forBrowser('chrome').build();\n\n`;
  code += `  try {\n`;
  
  for (const step of tc.steps) {
    if (includeComments) {
      code += `    // Step ${step.stepNumber}: ${step.expectedResult}\n`;
    }
    
    const selector = useObjectRepository ? objectRepository.resolve(step.target || "") : step.target;
    
    switch (step.actionType) {
      case "NAVIGATE":
        code += `    await driver.get('${escapeString(step.value || "")}');\n`;
        break;
      
      case "INPUT":
      case "TYPE":
        code += `    await driver.findElement(By.css('${selector}')).sendKeys('${escapeString(step.value || "")}');\n`;
        break;
      
      case "CLICK":
        code += `    await driver.findElement(By.css('${selector}')).click();\n`;
        break;
      
      case "SELECT":
        code += `    const select = await driver.findElement(By.css('${selector}'));\n`;
        code += `    await select.findElement(By.css(\`option[value="${escapeString(step.value || "")}"]\`)).click();\n`;
        break;
      
      case "VERIFY":
        code += `    await driver.wait(until.elementLocated(By.css('${selector}')), 10000);\n`;
        break;
      
      case "WAIT":
        code += `    await driver.sleep(${parseInt(step.value || "1000")});\n`;
        break;
      
      case "CLEAR":
        code += `    await driver.findElement(By.css('${selector}')).clear();\n`;
        break;
      
      default:
        code += `    // TODO: Implement ${step.actionType} for ${step.target}\n`;
    }
  }
  
  code += `  } finally {\n`;
  code += `    await driver.quit();\n`;
  code += `  }\n`;
  code += `}\n\n`;
  code += `${camelCase(tc.title)}();\n`;
  
  return code;
}

function generateSeleniumPython(tc: CanonicalTestCase, options: Partial<GeneratorOptions>): string {
  const { includeComments = true, useObjectRepository = true } = options;
  
  let code = "";
  code += `from selenium import webdriver\n`;
  code += `from selenium.webdriver.common.by import By\n`;
  code += `from selenium.webdriver.support.ui import WebDriverWait\n`;
  code += `from selenium.webdriver.support import expected_conditions as EC\n`;
  code += `import time\n\n`;
  
  code += `def ${snakeCase(tc.title)}():\n`;
  code += `    driver = webdriver.Chrome()\n\n`;
  code += `    try:\n`;
  
  for (const step of tc.steps) {
    if (includeComments) {
      code += `        # Step ${step.stepNumber}: ${step.expectedResult}\n`;
    }
    
    const selector = useObjectRepository ? objectRepository.resolve(step.target || "") : step.target;
    
    switch (step.actionType) {
      case "NAVIGATE":
        code += `        driver.get("${escapeString(step.value || "")}")\n`;
        break;
      
      case "INPUT":
      case "TYPE":
        code += `        driver.find_element(By.CSS_SELECTOR, "${selector}").send_keys("${escapeString(step.value || "")}")\n`;
        break;
      
      case "CLICK":
        code += `        driver.find_element(By.CSS_SELECTOR, "${selector}").click()\n`;
        break;
      
      case "VERIFY":
        code += `        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.CSS_SELECTOR, "${selector}")))\n`;
        break;
      
      case "WAIT":
        code += `        time.sleep(${parseInt(step.value || "1000") / 1000})\n`;
        break;
      
      case "CLEAR":
        code += `        driver.find_element(By.CSS_SELECTOR, "${selector}").clear()\n`;
        break;
      
      default:
        code += `        # TODO: Implement ${step.actionType} for ${step.target}\n`;
    }
  }
  
  code += `    finally:\n`;
  code += `        driver.quit()\n\n`;
  code += `if __name__ == "__main__":\n`;
  code += `    ${snakeCase(tc.title)}()\n`;
  
  return code;
}

function generateSeleniumJava(tc: CanonicalTestCase, options: Partial<GeneratorOptions>): string {
  const { includeComments = true, useObjectRepository = true } = options;
  
  let code = "";
  code += `import org.openqa.selenium.By;\n`;
  code += `import org.openqa.selenium.WebDriver;\n`;
  code += `import org.openqa.selenium.chrome.ChromeDriver;\n`;
  code += `import org.openqa.selenium.support.ui.WebDriverWait;\n`;
  code += `import org.openqa.selenium.support.ui.ExpectedConditions;\n\n`;
  
  code += `public class ${pascalCase(tc.title)}Test {\n`;
  code += `    public static void main(String[] args) {\n`;
  code += `        WebDriver driver = new ChromeDriver();\n\n`;
  code += `        try {\n`;
  
  for (const step of tc.steps) {
    if (includeComments) {
      code += `            // Step ${step.stepNumber}: ${step.expectedResult}\n`;
    }
    
    const selector = useObjectRepository ? objectRepository.resolve(step.target || "") : step.target;
    
    switch (step.actionType) {
      case "NAVIGATE":
        code += `            driver.get("${escapeString(step.value || "")}");\n`;
        break;
      
      case "INPUT":
      case "TYPE":
        code += `            driver.findElement(By.cssSelector("${selector}")).sendKeys("${escapeString(step.value || "")}");\n`;
        break;
      
      case "CLICK":
        code += `            driver.findElement(By.cssSelector("${selector}")).click();\n`;
        break;
      
      case "VERIFY":
        code += `            new WebDriverWait(driver, 10).until(ExpectedConditions.presenceOfElementLocated(By.cssSelector("${selector}")));\n`;
        break;
      
      case "WAIT":
        code += `            Thread.sleep(${parseInt(step.value || "1000")});\n`;
        break;
      
      default:
        code += `            // TODO: Implement ${step.actionType} for ${step.target}\n`;
    }
  }
  
  code += `        } catch (Exception e) {\n`;
  code += `            e.printStackTrace();\n`;
  code += `        } finally {\n`;
  code += `            driver.quit();\n`;
  code += `        }\n`;
  code += `    }\n`;
  code += `}\n`;
  
  return code;
}

/**
 * Generate Puppeteer code from canonical test case
 */
export function generatePuppeteerCode(tc: CanonicalTestCase, options: Partial<GeneratorOptions> = {}): string {
  const { includeComments = true, useObjectRepository = true } = options;
  
  let code = "";
  
  code += `const puppeteer = require('puppeteer');\n\n`;
  code += `async function ${camelCase(tc.title)}() {\n`;
  code += `  const browser = await puppeteer.launch({ headless: false });\n`;
  code += `  const page = await browser.newPage();\n\n`;
  code += `  try {\n`;
  
  for (const step of tc.steps) {
    if (includeComments) {
      code += `    // Step ${step.stepNumber}: ${step.expectedResult}\n`;
    }
    
    const selector = useObjectRepository ? objectRepository.resolve(step.target || "") : step.target;
    
    switch (step.actionType) {
      case "NAVIGATE":
        code += `    await page.goto('${escapeString(step.value || "")}');\n`;
        break;
      
      case "INPUT":
      case "TYPE":
        code += `    await page.type('${selector}', '${escapeString(step.value || "")}');\n`;
        break;
      
      case "CLICK":
        code += `    await page.click('${selector}');\n`;
        break;
      
      case "SELECT":
        code += `    await page.select('${selector}', '${escapeString(step.value || "")}');\n`;
        break;
      
      case "VERIFY":
        code += `    await page.waitForSelector('${selector}');\n`;
        break;
      
      case "WAIT":
        code += `    await page.waitForTimeout(${parseInt(step.value || "1000")});\n`;
        break;
      
      case "CLEAR":
        code += `    await page.$eval('${selector}', el => el.value = '');\n`;
        break;
      
      case "CAPTURE":
        code += `    await page.screenshot({ path: 'screenshot_step_${step.stepNumber}.png' });\n`;
        break;
      
      default:
        code += `    // TODO: Implement ${step.actionType} for ${step.target}\n`;
    }
  }
  
  code += `  } finally {\n`;
  code += `    await browser.close();\n`;
  code += `  }\n`;
  code += `}\n\n`;
  code += `${camelCase(tc.title)}();\n`;
  
  return code;
}

/**
 * Universal code generator
 */
export function generateAutomationCode(
  testCase: CanonicalTestCase,
  options: GeneratorOptions
): string {
  switch (options.framework) {
    case "playwright":
      return generatePlaywrightCode(testCase, options);
    case "cypress":
      return generateCypressCode(testCase, options);
    case "selenium":
      return generateSeleniumCode(testCase, options);
    case "puppeteer":
      return generatePuppeteerCode(testCase, options);
    default:
      throw new Error(`Unsupported framework: ${options.framework}`);
  }
}

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

function escapeString(str: string): string {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function camelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^./, m => m.toLowerCase())
    .replace(/[^a-zA-Z0-9]/g, "");
}

function pascalCase(str: string): string {
  const camel = camelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function snakeCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/^_|_$/g, "");
}
