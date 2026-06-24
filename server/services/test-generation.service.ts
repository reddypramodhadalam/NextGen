/**
 * Test Generation Service
 * Generates comprehensive test cases using AI and rule-based strategies
 */

import { getAiClient } from "../ai-client";
import { KeywordLibrary } from "../domain/keyword-framework";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";

export interface GeneratedTestCase {
  title: string;
  description: string;
  preconditions?: string;
  priority: "low" | "medium" | "high" | "critical";
  tags: string[];
  steps: Array<{
    step: string;
    expected: string;
  }>;
}

export class TestGenerationService {
  /**
   * Generate comprehensive test cases from requirement
   */
  static async generateTestCases(
    title: string,
    description: string,
    appType?: string,
    appHints?: string
  ): Promise<{
    testCases: GeneratedTestCase[];
    generatedBy: "ai" | "rule-based";
    statistics: { coverage: number; complexity: number };
  }> {
    try {
      // Try AI generation first
      const aiTestCases = await this.generateWithAI(title, description, appType, appHints);
      if (aiTestCases && aiTestCases.length > 0) {
        return {
          testCases: aiTestCases,
          generatedBy: "ai",
          statistics: {
            coverage: Math.min(100, aiTestCases.length * 15), // Rough estimate
            complexity: this.calculateComplexity(aiTestCases),
          },
        };
      }
    } catch (error) {
      logger.warn(`[TestGenerationService] AI generation failed, falling back to rule-based`, { error });
    }

    // Fall back to rule-based generation
    const ruleBasedTestCases = this.generateWithRules(title, description, appType);

    return {
      testCases: ruleBasedTestCases,
      generatedBy: "rule-based",
      statistics: {
        coverage: Math.min(100, ruleBasedTestCases.length * 15),
        complexity: this.calculateComplexity(ruleBasedTestCases),
      },
    };
  }

  /**
   * Generate test cases using AI
   */
  private static async generateWithAI(
    title: string,
    description: string,
    appType?: string,
    appHints?: string
  ): Promise<GeneratedTestCase[] | null> {
    try {
      const aiClient = await getAiClient();

      const appContext = appType && appType !== "web" ? `\n\nApplication Type: ${appType}\n${appHints || ""}` : "";

      const systemPrompt = `You are a QA expert that generates comprehensive test cases from requirements.
Generate test cases that cover:
- Happy path (positive flows)
- Negative scenarios (invalid inputs, errors)
- Edge cases (boundaries, special characters)
- Security (SQL injection, XSS, auth bypass)
- Performance (load, data size)
- Concurrent access patterns
- Business rule validation
- UI/Accessibility (for web apps)

For each test case, provide clear steps and expected results suitable for automation.

Respond with ONLY valid JSON array:
[{
  "title": "Test case title",
  "description": "What this test verifies",
  "preconditions": "Any setup required",
  "priority": "low|medium|high|critical",
  "tags": ["tag1", "tag2"],
  "steps": [
    {"step": "Action", "expected": "Expected result"}
  ]
}]

Generate 8-15 comprehensive test cases covering different scenarios.`;

      const userPrompt = `Generate test cases for: ${title}
Description: ${description}${appContext}`;

      const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);

      const parsed = JSON.parse(response);
      const testCases: GeneratedTestCase[] = Array.isArray(parsed) ? parsed : [parsed];

      logger.info(`[TestGenerationService] AI generated ${testCases.length} test cases`, { title });
      return testCases;
    } catch (error: any) {
      logger.error(`[TestGenerationService] AI generation failed`, { error: error.message });
      return null;
    }
  }

  /**
   * Generate test cases using rule-based strategies
   */
  private static generateWithRules(title: string, description: string, appType?: string): GeneratedTestCase[] {
    const testCases: GeneratedTestCase[] = [];
    const lower = description.toLowerCase();

    // Detect features
    const hasLogin = lower.includes("login") || lower.includes("sign in");
    const hasForm = lower.includes("form") || lower.includes("submit");
    const hasSearch = lower.includes("search");
    const hasCreate = lower.includes("create") || lower.includes("add");
    const hasDelete = lower.includes("delete") || lower.includes("remove");
    const hasEdit = lower.includes("edit") || lower.includes("update");

    // 1. Happy Path
    testCases.push({
      title: `${title} - Happy Path`,
      description: `Verify primary success flow: ${description.substring(0, 100)}`,
      priority: "high",
      tags: ["smoke", "happy-path"],
      preconditions: hasLogin ? "User is logged in" : "User has access to the feature",
      steps: this.generateHappyPathSteps(title, hasLogin, hasForm, hasCreate),
    });

    // 2. Negative/Validation
    testCases.push({
      title: `${title} - Validation & Error Handling`,
      description: "Verify system handles invalid inputs gracefully",
      priority: "high",
      tags: ["validation", "error-handling"],
      preconditions: "User is on the relevant page",
      steps: this.generateValidationSteps(title),
    });

    // 3. Edge Cases
    testCases.push({
      title: `${title} - Edge Cases`,
      description: "Verify system handles boundary conditions",
      priority: "medium",
      tags: ["edge-case", "boundary"],
      preconditions: "User has permissions to perform action",
      steps: this.generateEdgeCaseSteps(title),
    });

    // 4. Feature-specific tests
    if (hasSearch) {
      testCases.push({
        title: `${title} - Search Functionality`,
        description: "Verify search returns correct results",
        priority: "high",
        tags: ["search", "filtering"],
        preconditions: "Data exists in system",
        steps: [
          { step: "Search for a known item with exact name", expected: "Item appears in results" },
          { step: "Search with partial text match", expected: "Results include items matching the partial text" },
          { step: "Search with empty query", expected: "All items are shown or helpful message displayed" },
          { step: "Search with special characters", expected: "Special characters are handled safely" },
        ],
      });
    }

    if (hasDelete) {
      testCases.push({
        title: `${title} - Delete Operations`,
        description: "Verify delete functionality and data integrity",
        priority: "critical",
        tags: ["delete", "destructive"],
        preconditions: "Item exists and user has delete permissions",
        steps: [
          { step: "Attempt to delete an existing item", expected: "Confirmation dialog appears" },
          { step: "Confirm deletion", expected: "Item is removed and list is updated" },
          { step: "Verify item no longer exists in database", expected: "Item permanently deleted" },
          { step: "Attempt to delete already-deleted item", expected: "Appropriate error shown" },
        ],
      });
    }

    if (hasEdit) {
      testCases.push({
        title: `${title} - Edit/Update Operations`,
        description: "Verify edit functionality preserves data integrity",
        priority: "high",
        tags: ["edit", "update"],
        preconditions: "Item exists and is editable",
        steps: [
          { step: "Open item for editing", expected: "Form populated with current data" },
          { step: "Modify fields and save", expected: "Changes are saved and reflected in list" },
          { step: "Edit with invalid data", expected: "Validation errors prevent save" },
          { step: "Verify concurrent edits handled correctly", expected: "Last save wins or conflict detected" },
        ],
      });
    }

    // 5. Security
    if (hasLogin || hasForm) {
      testCases.push({
        title: `${title} - Security`,
        description: "Verify security controls are in place",
        priority: "critical",
        tags: ["security"],
        preconditions: "User account exists",
        steps: [
          { step: "Attempt SQL injection in input fields", expected: "Input is sanitized, normal error shown" },
          { step: "Attempt XSS with script tags", expected: "Script is escaped or removed" },
          { step: "Access feature without authentication", expected: "Access denied or redirected to login" },
          { step: "Access another user's data via ID manipulation", expected: "403 Forbidden returned" },
        ],
      });
    }

    // 6. Performance
    if (hasSearch || hasCreate) {
      testCases.push({
        title: `${title} - Performance`,
        description: "Verify feature performs under load",
        priority: "medium",
        tags: ["performance", "load"],
        preconditions: "System is stable",
        steps: [
          { step: "Perform action with minimal data", expected: "Response time < 1 second" },
          { step: "Perform action with large dataset", expected: "Response time < 3 seconds" },
          { step: "Perform action multiple times rapidly", expected: "No degradation or errors" },
          { step: "Monitor resource usage during test", expected: "CPU/Memory remain within acceptable limits" },
        ],
      });
    }

    // 7. UI/Accessibility (for web)
    if (appType === "web" || !appType) {
      testCases.push({
        title: `${title} - UI & Accessibility`,
        description: "Verify UI is accessible and responsive",
        priority: "medium",
        tags: ["ui", "accessibility"],
        preconditions: "User is on the page",
        steps: [
          { step: "Load page and verify all elements render", expected: "Page loads within 3 seconds" },
          { step: "Resize window to mobile viewport", expected: "Layout remains functional" },
          { step: "Tab through all interactive elements", expected: "All elements accessible via keyboard" },
          { step: "Verify color contrast for readability", expected: "Text is legible for low-vision users" },
        ],
      });
    }

    // 8. Concurrency/Race Conditions
    if (hasEdit || hasDelete) {
      testCases.push({
        title: `${title} - Concurrent Access`,
        description: "Verify system handles concurrent operations safely",
        priority: "medium",
        tags: ["concurrency", "race-condition"],
        preconditions: "Multiple users have access",
        steps: [
          { step: "User A and B simultaneously edit same item", expected: "Conflict detected or last save wins" },
          { step: "User A and B simultaneously delete same item", expected: "Second delete shows item not found" },
          { step: "Verify data integrity after concurrent operations", expected: "No corruption or data loss" },
        ],
      });
    }

    return testCases;
  }

  private static generateHappyPathSteps(title: string, hasLogin: boolean, hasForm: boolean, hasCreate: boolean): Array<{
    step: string;
    expected: string;
  }> {
    const steps: Array<{ step: string; expected: string }> = [];

    if (hasLogin) {
      steps.push(
        { step: "Navigate to login page", expected: "Login form is displayed" },
        { step: "Enter valid credentials", expected: "Credentials accepted" },
        { step: "Click Sign In button", expected: "Redirected to dashboard" }
      );
    }

    if (hasForm || hasCreate) {
      steps.push(
        { step: `Navigate to ${title}`, expected: "Page loads successfully" },
        { step: "Fill in all required fields with valid data", expected: "Fields accept input" },
        { step: "Submit form/Create item", expected: "Success message shown" }
      );
    } else {
      steps.push(
        { step: `Perform ${title}`, expected: "Action completes successfully" },
        { step: "Verify results display correctly", expected: "Expected outcome shown" }
      );
    }

    return steps;
  }

  private static generateValidationSteps(title: string): Array<{ step: string; expected: string }> {
    return [
      { step: "Leave required fields empty", expected: "Validation errors shown for all required fields" },
      { step: "Enter invalid data format (e.g., text in number field)", expected: "Field-level error displayed" },
      { step: "Enter data exceeding max length", expected: "Error about max length shown" },
      { step: "Attempt to submit without required data", expected: "Submit is prevented and errors shown" },
    ];
  }

  private static generateEdgeCaseSteps(title: string): Array<{ step: string; expected: string }> {
    return [
      { step: "Test with minimum boundary values", expected: "Accepted and processed correctly" },
      { step: "Test with maximum boundary values", expected: "Accepted and processed correctly" },
      { step: "Test with special characters (!, @, #, $, %, etc.)", expected: "Characters handled safely" },
      { step: "Test with Unicode/emoji characters", expected: "Unicode supported without errors" },
      { step: "Test with very long input (1000+ characters)", expected: "Handled gracefully without crash" },
    ];
  }

  private static calculateComplexity(testCases: GeneratedTestCase[]): number {
    // Calculate based on number of test cases and steps
    const totalSteps = testCases.reduce((sum, tc) => sum + tc.steps.length, 0);
    return Math.min(100, Math.round((totalSteps / 20) * 100));
  }

  /**
   * Save generated test cases to a suite
   */
  static async saveGeneratedTestCases(suiteId: string, testCases: GeneratedTestCase[]): Promise<void> {
    for (const tc of testCases) {
      await storage.createTestCase({
        suiteId,
        title: tc.title,
        description: tc.description,
        preconditions: tc.preconditions,
        steps: tc.steps,
        priority: tc.priority,
        tags: tc.tags,
        status: "active",
        generatedByAI: true,
      });
    }

    logger.info(`[TestGenerationService] Saved ${testCases.length} test cases to suite`, { suiteId });
  }
}
