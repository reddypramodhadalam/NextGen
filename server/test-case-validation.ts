/**
 * Test Case Validation Engine - AITAS
 * Ensures all uploaded test cases follow the standardized structure
 * Provides comprehensive validation with detailed error reporting
 */

import { z } from "zod";

// ================================================================================
// STANDARD TEST CASE SCHEMA
// ================================================================================

export const standardTestCaseSchema = z.object({
  // Identification
  testCaseId: z.string().min(3, "Test Case ID must be at least 3 characters (e.g., TC_001)").regex(/^[A-Z0-9_-]+$/, "Test Case ID must contain only uppercase letters, numbers, hyphens, and underscores"),
  
  // Metadata
  module: z.string().min(1, "Module/Feature name is required"),
  testScenario: z.string().min(1, "Test scenario description is required"),
  
  // Description & Details
  testCaseDescription: z.string().min(1, "Test case description is required"),
  preconditions: z.string().optional().nullable(),
  targetUrl: z.string().optional().nullable(),
  
  // Steps - Critical for automation
  testSteps: z.array(z.object({
    stepNumber: z.number().int().positive("Step number must be positive"),
    action: z.enum(["Navigate", "Click", "Enter", "Select", "Verify", "Wait", "Scroll", "Hover", "DoubleClick", "RightClick", "Swipe", "Tap", "LongPress", "Clear", "Submit", "Upload", "Download", "Close", "Accept", "Dismiss", "Assert", "CheckText", "CheckElement", "Capture"], {
      errorMap: () => ({ message: "Action must be one of: Navigate, Click, Enter, Select, Verify, Wait, Scroll, Hover, DoubleClick, RightClick, Swipe, Tap, LongPress, Clear, Submit, Upload, Download, Close, Accept, Dismiss, Assert, CheckText, CheckElement, Capture" })
    }),
    target: z.string().optional().nullable().describe("UI element identifier (CSS selector, XPath, or element name)"),
    input: z.string().optional().nullable().describe("Value to input (for Enter action) or additional parameters"),
    expectedResult: z.string().min(1, "Expected result is required for each step"),
  })).min(1, "At least one test step is required"),
  
  // Test Data
  testData: z.array(z.object({
    key: z.string().min(1, "Parameter key is required"),
    value: z.string(),
    dataType: z.enum(["text", "number", "email", "url", "password", "date", "boolean", "json"], {
      errorMap: () => ({ message: "Data type must be: text, number, email, url, password, date, boolean, or json" })
    }).optional(),
  })).optional().default([]),
  
  // Priority & Status
  priority: z.enum(["low", "medium", "high", "critical"], {
    errorMap: () => ({ message: "Priority must be: low, medium, high, or critical" })
  }).optional().default("medium"),
  
  automation: z.enum(["yes", "no"]).optional().describe("Should this test case be automated?"),
  
  // Categorization
  tags: z.array(z.string()).optional().default([]).describe("e.g., ['smoke', 'regression', 'ui', 'api']"),
  
  // Author Information
  createdBy: z.string().optional(),
  createdDate: z.string().datetime().optional(),
  
  // Additional metadata
  estimatedTime: z.number().optional().describe("Estimated execution time in seconds"),
  attachments: z.array(z.object({
    name: z.string(),
    type: z.string(),
    url: z.string().url(),
  })).optional().default([]),
});

export type StandardTestCase = z.infer<typeof standardTestCaseSchema>;

// ================================================================================
// PARTIAL SCHEMA FOR FLEXIBILITY (backward compatibility)
// ================================================================================

export const partialTestCaseSchema = standardTestCaseSchema.partial().extend({
  title: z.string().optional(), // For backward compatibility with existing system
  description: z.string().optional(),
  steps: z.array(z.object({
    step: z.string(),
    expected: z.string(),
  })).optional(),
});

// ================================================================================
// VALIDATION ENGINE
// ================================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  normalizedTestCase?: Partial<StandardTestCase>;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: "critical" | "error";
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

/**
 * Comprehensive validation engine for test cases
 */
export class TestCaseValidator {
  /**
   * Validate a single test case against the standard schema
   */
  static validate(testCase: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let normalizedTestCase: Partial<StandardTestCase> = {};

    // 1. Parse with strict schema
    try {
      const parsed = standardTestCaseSchema.parse(testCase);
      normalizedTestCase = parsed;
    } catch (zodError: any) {
      // Handle Zod validation errors
      if (zodError.errors && Array.isArray(zodError.errors)) {
        for (const err of zodError.errors) {
          const path = err.path.join(".");
          errors.push({
            field: path || "root",
            message: err.message,
            code: "VALIDATION_ERROR",
            severity: "error",
          });
        }
      }
    }

    // 2. Additional business logic validations
    if (!testCase.testCaseId) {
      errors.push({
        field: "testCaseId",
        message: "Test Case ID is required (e.g., TC_001, TC_LOGIN_001)",
        code: "MISSING_TEST_CASE_ID",
        severity: "critical",
      });
    }

    // 3. Validate test steps structure
    if (!testCase.testSteps || !Array.isArray(testCase.testSteps) || testCase.testSteps.length === 0) {
      errors.push({
        field: "testSteps",
        message: "At least one test step with proper structure is required",
        code: "MISSING_TEST_STEPS",
        severity: "critical",
      });
    } else {
      // Validate each step
      testCase.testSteps.forEach((step: any, index: number) => {
        if (!step.action) {
          errors.push({
            field: `testSteps[${index}].action`,
            message: `Step ${index + 1}: Action keyword is required (Navigate, Click, Enter, Select, Verify, etc.)`,
            code: "INVALID_STEP_ACTION",
            severity: "error",
          });
        }

        if (!step.expectedResult) {
          errors.push({
            field: `testSteps[${index}].expectedResult`,
            message: `Step ${index + 1}: Expected result is required`,
            code: "MISSING_EXPECTED_RESULT",
            severity: "error",
          });
        }

        // Warning: if Click/Enter without target
        if (["Click", "Enter", "Select", "Hover"].includes(step.action) && !step.target) {
          warnings.push({
            field: `testSteps[${index}].target`,
            message: `Step ${index + 1}: ${step.action} action typically requires a target element`,
            code: "MISSING_STEP_TARGET",
          });
        }
      });
    }

    // 4. Check for placeholder usage in steps
    if (testCase.testSteps && Array.isArray(testCase.testSteps)) {
      testCase.testSteps.forEach((step: any, index: number) => {
        const stepText = JSON.stringify(step);
        const placeholders = (stepText.match(/\{\{\s*\w+\s*\}\}/g) || []);
        
        placeholders.forEach(placeholder => {
          warnings.push({
            field: `testSteps[${index}]`,
            message: `Found placeholder ${placeholder} - ensure it's defined in Test Data`,
            code: "PLACEHOLDER_DETECTED",
          });
        });
      });
    }

    // 5. Ensure URL is valid if provided
    if (testCase.targetUrl) {
      try {
        new URL(testCase.targetUrl);
      } catch {
        errors.push({
          field: "targetUrl",
          message: `Invalid URL format: ${testCase.targetUrl}`,
          code: "INVALID_URL",
          severity: "error",
        });
      }
    }

    return {
      isValid: errors.filter(e => e.severity === "critical").length === 0 && errors.filter(e => e.severity === "error").length === 0,
      errors,
      warnings,
      normalizedTestCase: Object.keys(normalizedTestCase).length > 0 ? normalizedTestCase : undefined,
    };
  }

  /**
   * Validate multiple test cases and provide batch report
   */
  static validateBatch(testCases: any[]): {
    totalCases: number;
    validCases: number;
    invalidCases: number;
    results: Array<{ index: number; testCaseId?: string; validation: ValidationResult }>;
  } {
    const results = testCases.map((tc, index) => ({
      index,
      testCaseId: tc.testCaseId || tc.title || `Unknown_${index}`,
      validation: this.validate(tc),
    }));

    return {
      totalCases: testCases.length,
      validCases: results.filter(r => r.validation.isValid).length,
      invalidCases: results.filter(r => !r.validation.isValid).length,
      results,
    };
  }

  /**
   * Auto-correct common issues in test cases
   */
  static autoCorrect(testCase: any): Partial<StandardTestCase> {
    const corrected: any = { ...testCase };

    // 1. Normalize testCaseId
    if (corrected.title && !corrected.testCaseId) {
      corrected.testCaseId = corrected.title
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_")
        .substring(0, 50);
    }

    // 2. Auto-detect action keywords from step descriptions
    if (corrected.testSteps && Array.isArray(corrected.testSteps)) {
      corrected.testSteps = corrected.testSteps.map((step: any) => {
        if (!step.action && step.step) {
          const stepText = step.step.toLowerCase();
          const actionKeywords: Record<string, string> = {
            navigate: "Navigate", go: "Navigate", goto: "Navigate", visit: "Navigate",
            click: "Click", select: "Select", tap: "Tap",
            enter: "Enter", type: "Enter", input: "Enter", fill: "Enter",
            verify: "Verify", check: "Verify", assert: "Assert",
            wait: "Wait", pause: "Wait",
            hover: "Hover", mouseover: "Hover",
            scroll: "Scroll",
          };

          for (const [keyword, action] of Object.entries(actionKeywords)) {
            if (stepText.includes(keyword)) {
              step.action = action;
              break;
            }
          }
        }
        return step;
      });
    }

    // 3. Default priority to 'medium' if missing
    if (!corrected.priority) {
      corrected.priority = "medium";
    }

    // 4. Ensure testCaseDescription exists
    if (!corrected.testCaseDescription && corrected.description) {
      corrected.testCaseDescription = corrected.description;
    }

    return corrected;
  }
}

// ================================================================================
// STANDARD TEMPLATE (for documentation/export)
// ================================================================================

export const STANDARD_TEST_CASE_TEMPLATE: Partial<StandardTestCase> = {
  testCaseId: "TC_FEATURE_001",
  module: "Login",
  testScenario: "User login with valid credentials",
  testCaseDescription: "Verify that a user can successfully login with correct username and password",
  preconditions: "User account exists, User is on login page",
  targetUrl: "https://app.example.com/login",
  
  testSteps: [
    {
      stepNumber: 1,
      action: "Navigate",
      target: undefined,
      input: "https://app.example.com/login",
      expectedResult: "Login page is displayed with username and password fields visible",
    },
    {
      stepNumber: 2,
      action: "Enter",
      target: "input[name='username']",
      input: "{{username}}",
      expectedResult: "Username is entered in the username field",
    },
    {
      stepNumber: 3,
      action: "Enter",
      target: "input[name='password']",
      input: "{{password}}",
      expectedResult: "Password is entered in the password field",
    },
    {
      stepNumber: 4,
      action: "Click",
      target: "button[type='submit']",
      input: undefined,
      expectedResult: "Login button is clicked",
    },
    {
      stepNumber: 5,
      action: "Verify",
      target: "div.dashboard",
      input: undefined,
      expectedResult: "User is redirected to dashboard, session is created",
    },
  ],
  
  testData: [
    { key: "username", value: "testuser@example.com", dataType: "email" },
    { key: "password", value: "SecurePassword123", dataType: "password" },
  ],
  
  priority: "high",
  automation: "yes",
  tags: ["smoke", "login", "critical"],
  estimatedTime: 45,
};

export const EXCEL_COLUMN_MAPPING = {
  // Required columns
  "Test Case ID": "testCaseId",
  "TC_ID": "testCaseId",
  "ID": "testCaseId",
  
  "Module": "module",
  "Feature": "module",
  
  "Test Scenario": "testScenario",
  "Scenario": "testScenario",
  
  "Test Case Description": "testCaseDescription",
  "Description": "testCaseDescription",
  
  // Optional columns
  "Preconditions": "preconditions",
  "Pre-conditions": "preconditions",
  
  "Target URL": "targetUrl",
  "URL": "targetUrl",
  
  // Steps (complex - usually expanded)
  "Test Steps": "testSteps",
  "Steps": "testSteps",
  
  "Expected Result": "expectedResult",
  "Expected": "expectedResult",
  
  // Metadata
  "Priority": "priority",
  "Automation": "automation",
  "Tags": "tags",
  "Estimated Time": "estimatedTime",
  
  "Created By": "createdBy",
  "Created Date": "createdDate",
};
