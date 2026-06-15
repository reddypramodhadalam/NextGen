/**
 * AI-Powered NLP Parser for Test Cases - AITAS
 * Converts unstructured test steps into standardized, machine-actionable format
 * Uses OpenAI/Azure OpenAI for intelligent interpretation
 */

import { getAiClient } from "./ai-client";
import { StandardTestCase } from "./test-case-validation";

// ================================================================================
// TYPES
// ================================================================================

export interface ParsedStep {
  stepNumber: number;
  action: string;
  target?: string;
  input?: string;
  expectedResult: string;
  confidence: number;
  reasoning?: string;
}

export interface NLPParseResult {
  success: boolean;
  parsedSteps: ParsedStep[];
  errors: string[];
  warnings: string[];
  originalSteps: string[];
}

export interface ElementLocator {
  strategy: "css" | "xpath" | "id" | "name" | "class" | "aria-label";
  value: string;
  description: string;
}

// ================================================================================
// ACTION MAPPER
// ================================================================================

const ACTION_MAPPING: Record<string, string> = {
  // Navigation
  "navigate": "Navigate", "go to": "Navigate", "visit": "Navigate", "goto": "Navigate",
  "open": "Navigate", "launch": "Navigate", "load": "Navigate",

  // Clicking
  "click": "Click", "tap": "Click", "press": "Click", "select": "Click",

  // Input
  "enter": "Enter", "type": "Enter", "input": "Enter", "fill": "Enter",
  "clear": "Clear", "delete": "Clear",

  // Selection
  "select": "Select", "choose": "Select", "pick": "Select", "dropdown": "Select",

  // Verification
  "verify": "Verify", "check": "Verify", "assert": "Assert", "validate": "Verify",
  "confirm": "Verify", "ensure": "Verify",

  // UI Interaction
  "wait": "Wait", "pause": "Wait", "hold": "Wait",
  "scroll": "Scroll", "swipe": "Scroll", "slide": "Scroll",
  "hover": "Hover", "mouseover": "Hover",
  "double click": "DoubleClick", "double-click": "DoubleClick", "dblclick": "DoubleClick",
  "right click": "RightClick", "right-click": "RightClick",

  // Mobile
  "swipe": "Swipe", "tap": "Tap", "long press": "LongPress", "long-press": "LongPress",

  // File Operations
  "upload": "Upload", "attach": "Upload",
  "download": "Download",

  // Form Actions
  "submit": "Submit", "send": "Submit",
  "close": "Close", "dismiss": "Close", "cancel": "Close",
  "accept": "Accept", "ok": "Accept",

  // Assertions
  "checktext": "CheckText", "check text": "CheckText",
  "checkelement": "CheckElement", "check element": "CheckElement",
  "capture": "Capture", "screenshot": "Capture",
};

const VALID_ACTIONS = [
  "Navigate", "Click", "Enter", "Select", "Verify", "Wait", "Scroll",
  "Hover", "DoubleClick", "RightClick", "Swipe", "Tap", "LongPress",
  "Clear", "Submit", "Upload", "Download", "Close", "Accept", "Dismiss",
  "Assert", "CheckText", "CheckElement", "Capture"
];

// ================================================================================
// AI-POWERED NLP PARSER
// ================================================================================

export class TestCaseNLPParser {
  /**
   * Parse unstructured test steps into structured format using AI
   */
  static async parseStepsWithAI(steps: string[]): Promise<NLPParseResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const parsedSteps: ParsedStep[] = [];

    try {
      const aiClient = await getAiClient();

      // Prepare the prompt
      const stepsText = steps.map((s, i) => `${i + 1}. ${s}`).join("\n");

      const systemPrompt = `You are an expert QA automation engineer. Your task is to parse test steps and convert them into a standardized, machine-actionable JSON format.

For each step, extract:
1. Action: One of these keywords: Navigate, Click, Enter, Select, Verify, Wait, Scroll, Hover, DoubleClick, RightClick, Swipe, Tap, LongPress, Clear, Submit, Upload, Download, Close, Accept, Dismiss, Assert, CheckText, CheckElement, Capture
2. Target: UI element identifier (CSS selector, XPath, element name, aria-label, or ID)
3. Input: Value to enter or additional parameter
4. ExpectedResult: What should happen after this action

Rules:
- Be specific with target selectors (use CSS when possible, XPath when needed)
- For "Navigate" actions, use the URL as input
- For "Enter" actions, the input field target is the target
- Keep expected results concise but complete
- Estimate confidence (0.0-1.0) based on clarity of the original step
- Warn if a critical element is missing (like target for Click)

Return ONLY valid JSON array, no explanation.`;

      const userPrompt = `Parse these test steps:\n\n${stepsText}

Return JSON array with this structure:
[
  {
    "stepNumber": 1,
    "action": "Navigate",
    "target": null,
    "input": "https://example.com",
    "expectedResult": "Page loads successfully",
    "confidence": 0.95,
    "reasoning": "Clear URL provided"
  }
]`;

      const response = await aiClient.chat(
        [{ role: "user", content: userPrompt }],
        systemPrompt
      );

      // Parse JSON response
      let parsed: ParsedStep[];
      try {
        // Extract JSON from response (may contain extra text)
        const jsonMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (!jsonMatch) throw new Error("No JSON array found in response");
        
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseError: any) {
        errors.push(`Failed to parse AI response: ${parseError.message}`);
        return { success: false, parsedSteps: [], errors, warnings, originalSteps: steps };
      }

      // Validate and enrich parsed steps
      for (const step of parsed) {
        // Validate action
        if (!VALID_ACTIONS.includes(step.action)) {
          warnings.push(`Step ${step.stepNumber}: Unknown action "${step.action}", attempting to map...`);
          // Try to find a close match
          const lowerAction = step.action.toLowerCase();
          let foundAction = false;
          for (const [key, val] of Object.entries(ACTION_MAPPING)) {
            if (lowerAction.includes(key)) {
              step.action = val;
              foundAction = true;
              break;
            }
          }
          if (!foundAction) {
            errors.push(`Step ${step.stepNumber}: Cannot determine valid action from "${step.action}"`);
            continue;
          }
        }

        // Check for missing critical fields
        if (["Click", "Enter", "Select", "Hover", "DoubleClick"].includes(step.action) && !step.target) {
          warnings.push(`Step ${step.stepNumber}: ${step.action} action missing target element`);
        }

        if (!step.expectedResult) {
          errors.push(`Step ${step.stepNumber}: Missing expected result`);
          continue;
        }

        parsedSteps.push(step);
      }

      return {
        success: errors.length === 0,
        parsedSteps,
        errors,
        warnings,
        originalSteps: steps,
      };
    } catch (error: any) {
      return {
        success: false,
        parsedSteps: [],
        errors: [error.message || "Unknown error during NLP parsing"],
        warnings,
        originalSteps: steps,
      };
    }
  }

  /**
   * Parse steps without AI (fallback, rule-based)
   */
  static parseStepsRuleBased(steps: string[]): NLPParseResult {
    const parsedSteps: ParsedStep[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    steps.forEach((step, index) => {
      const stepNumber = index + 1;
      const stepLower = step.toLowerCase().trim();

      // Try to detect action
      let action = "Verify"; // Default
      let confidence = 0.5;
      let target: string | undefined;
      let input: string | undefined;
      let expectedResult = "Step completes successfully";

      // 1. Extract action keyword
      for (const [keyword, detectedAction] of Object.entries(ACTION_MAPPING)) {
        if (stepLower.includes(keyword)) {
          action = detectedAction;
          confidence = 0.7;
          break;
        }
      }

      // 2. Try to extract target (common patterns)
      const targetPatterns = [
        /on\s+(?:the\s+)?["]?([^"]+)["]?\s+(?:button|field|element|link)/i,
        /(?:button|field|element|link)\s+(?:named\s+)?["]?([^"]+)["]?/i,
        /["]([^"]+)["](?:\s+(?:button|field|element))?/,
      ];

      for (const pattern of targetPatterns) {
        const match = step.match(pattern);
        if (match) {
          target = match[1];
          break;
        }
      }

      // 3. For Enter actions, try to extract input value
      if (action === "Enter") {
        const inputPattern = /enter\s+(?:the\s+)?["]?([^"]+)["]?/i;
        const match = step.match(inputPattern);
        if (match) {
          input = match[1];
        }
      }

      // 4. For Navigation, try to extract URL
      if (action === "Navigate") {
        const urlPattern = /(https?:\/\/[^\s]+)/;
        const match = step.match(urlPattern);
        if (match) {
          input = match[1];
        }
      }

      // 5. Expected result is usually after "should" or "verify"
      const expectedPattern = /(?:should|verify|expect)\s+([^.]+)/i;
      const expectedMatch = step.match(expectedPattern);
      if (expectedMatch) {
        expectedResult = expectedMatch[1].trim();
      } else {
        expectedResult = step; // Use whole step as expected
      }

      // Add warnings if critical info missing
      if (["Click", "Enter", "Select"].includes(action) && !target) {
        warnings.push(`Step ${stepNumber}: ${action} action detected but target element unclear`);
        confidence -= 0.2;
      }

      parsedSteps.push({
        stepNumber,
        action,
        target,
        input,
        expectedResult,
        confidence: Math.max(0.3, Math.min(1.0, confidence)),
        reasoning: "Rule-based parsing (AI not available)",
      });
    });

    return {
      success: errors.length === 0,
      parsedSteps,
      errors,
      warnings,
      originalSteps: steps,
    };
  }

  /**
   * Extract element locators from step text using heuristics
   */
  static extractElementLocators(stepText: string): ElementLocator[] {
    const locators: ElementLocator[] = [];

    // CSS Selector patterns
    const cssPatterns = [
      /button\[(?:class|id)=['"]([^'"]+)['"]\]/g,
      /input\[(?:type|name|id|class)=['"]([^'"]+)['"]\]/g,
      /[.#]([a-zA-Z0-9_-]+)/g, // Class and ID shortcuts
    ];

    // XPath patterns
    const xpathPatterns = [
      /\/\/\*?\[contains.*?\]/g,
      /\/\w+\[.*?\]/g,
    ];

    // Simple element references
    const elementPatterns = [
      /"([^"]+)"\s+(?:button|link|field|element)/gi,
      /on\s+(?:the\s+)?["]?([^"]+)["]?(?:\s+button|\s+link)?/gi,
    ];

    // Extract CSS selectors
    cssPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(stepText)) !== null) {
        locators.push({
          strategy: "css",
          value: match[1],
          description: stepText.substring(Math.max(0, match.index - 20), match.index + 20).trim(),
        });
      }
    });

    // Extract XPath
    xpathPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(stepText)) !== null) {
        locators.push({
          strategy: "xpath",
          value: match[0],
          description: stepText.substring(Math.max(0, match.index - 20), match.index + 20).trim(),
        });
      }
    });

    // Extract generic element names
    elementPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(stepText)) !== null) {
        locators.push({
          strategy: "name",
          value: match[1],
          description: stepText.substring(Math.max(0, match.index - 20), match.index + 20).trim(),
        });
      }
    });

    return locators;
  }

  /**
   * Extract test data placeholders from steps
   */
  static extractPlaceholders(steps: ParsedStep[]): string[] {
    const placeholders = new Set<string>();
    const placeholderRegex = /\{\{\s*(\w+)\s*\}\}/g;

    steps.forEach(step => {
      [step.target, step.input, step.expectedResult].forEach(field => {
        if (field) {
          let match;
          while ((match = placeholderRegex.exec(field)) !== null) {
            placeholders.add(match[1]);
          }
        }
      });
    });

    return Array.from(placeholders);
  }
}

// ================================================================================
// BATCH PARSING
// ================================================================================

export interface BatchParseRequest {
  testCases: Array<{
    testCaseId?: string;
    testSteps: string[];
    [key: string]: any;
  }>;
  useAI?: boolean;
}

export interface BatchParseResult {
  totalCases: number;
  successfulCases: number;
  failedCases: number;
  results: Array<{
    testCaseId: string;
    parseResult: NLPParseResult;
  }>;
}

export class BatchTestCaseParser {
  static async parseBatch(request: BatchParseRequest): Promise<BatchParseResult> {
    const results = [];
    const useAI = request.useAI !== false;

    for (const tc of request.testCases) {
      const testCaseId = tc.testCaseId || `TC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      let parseResult: NLPParseResult;
      if (useAI) {
        try {
          parseResult = await TestCaseNLPParser.parseStepsWithAI(tc.testSteps);
        } catch {
          // Fallback to rule-based if AI fails
          parseResult = TestCaseNLPParser.parseStepsRuleBased(tc.testSteps);
        }
      } else {
        parseResult = TestCaseNLPParser.parseStepsRuleBased(tc.testSteps);
      }

      results.push({
        testCaseId,
        parseResult,
      });
    }

    const successfulCases = results.filter(r => r.parseResult.success).length;

    return {
      totalCases: request.testCases.length,
      successfulCases,
      failedCases: request.testCases.length - successfulCases,
      results,
    };
  }
}
