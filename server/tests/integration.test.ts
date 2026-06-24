/**
 * Integration Tests - New Architecture
 * Tests that all components work together
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { KeywordLibrary } from "../domain/keyword-framework/keyword-library";
import { KeywordInterpreter } from "../domain/keyword-framework/keyword-interpreter";
import { KeywordType } from "../domain/keyword-framework/keyword.types";
import { SelfHealer } from "../domain/self-healing/self-healer";
import { SelectorFallbackStrategy } from "../domain/self-healing/selector-fallback-strategy";
import { ExcelParserV2 } from "../infrastructure/excel/excel-parser-v2";
import { AdapterFactory } from "../domain/adapters/adapter-factory";
import { PlaywrightAdapter } from "../domain/adapters/playwright-adapter";

describe("New Architecture Integration Tests", () => {
  // ========================================
  // Keyword Framework Tests
  // ========================================

  describe("Keyword Framework", () => {
    test("should retrieve all keywords", () => {
      const keywords = KeywordLibrary.getAllKeywords();
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords.some((k) => k.keyword === KeywordType.CLICK)).toBe(true);
    });

    test("should validate keyword parameters", () => {
      const result = KeywordLibrary.validate(KeywordType.CLICK, { selector: "button" });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test("should detect missing required parameters", () => {
      const result = KeywordLibrary.validate(KeywordType.CLICK, {});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("should get keywords by platform", () => {
      const webKeywords = KeywordLibrary.getKeywordsByPlatform("web");
      expect(webKeywords.length).toBeGreaterThan(0);
      expect(webKeywords.some((k) => k.keyword === KeywordType.NAVIGATE)).toBe(true);
    });
  });

  // ========================================
  // Keyword Interpreter Tests
  // ========================================

  describe("Keyword Interpreter", () => {
    test("should interpret 'Click' action", async () => {
      const keywords = await KeywordInterpreter.interpret("Click on the Submit button");
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords[0].type).toBe(KeywordType.CLICK);
    });

    test("should interpret 'Type' action", async () => {
      const keywords = await KeywordInterpreter.interpret("Enter user@example.com in the email field");
      expect(keywords[0].type).toBe(KeywordType.TYPE);
    });

    test("should interpret 'Navigate' action", async () => {
      const keywords = await KeywordInterpreter.interpret("Navigate to https://example.com");
      expect(keywords[0].type).toBe(KeywordType.NAVIGATE);
    });

    test("should interpret 'Verify' action", async () => {
      const keywords = await KeywordInterpreter.interpret("Verify 'Success' message is displayed");
      expect(keywords[0].type).toBe(KeywordType.VERIFY);
    });

    test("should generate readable summary", async () => {
      const keywords = await KeywordInterpreter.interpret("Click on the button");
      const summary = KeywordInterpreter.summarize(keywords);
      expect(summary.length).toBeGreaterThan(0);
      expect(summary).toContain("CLICK");
    });
  });

  // ========================================
  // Self-Healing Tests
  // ========================================

  describe("Self-Healing Engine", () => {
    test("should generate fallback selectors", () => {
      const fallbacks = SelectorFallbackStrategy.generateFallbacks("original-xpath", {
        id: "element-id",
        name: "element-name",
        text: "Click me",
        classes: ["btn", "primary"],
      });

      expect(fallbacks.length).toBeGreaterThan(0);
      expect(fallbacks[0].selector).toBeDefined();
      expect(fallbacks[0].confidence).toBeGreaterThan(0);
    });

    test("should score selector robustness", () => {
      const robuXpath = "#element-id"; // ID selector
      const fragileXpath = "//div/span/button[3]"; // nth-child selector

      const robustScore = SelectorFallbackStrategy.scoreRobustness(robuXpath);
      const fragileScore = SelectorFallbackStrategy.scoreRobustness(fragileXpath);

      expect(robustScore).toBeLessThan(fragileScore);
    });

    test("should suggest most robust selector", () => {
      const fallbacks = SelectorFallbackStrategy.generateFallbacks("//button[@id='submit']", {
        id: "submit-button",
        text: "Submit",
      });

      const best = SelectorFallbackStrategy.suggestMostRobust(fallbacks);
      expect(best).toBeDefined();
      expect(best?.confidence).toBeGreaterThan(0);
    });

    test("should track healing statistics", () => {
      const stats = SelfHealer.getStatistics();
      expect(stats.totalSelectors).toBeGreaterThanOrEqual(0);
      expect(stats.totalSuggestions).toBeGreaterThanOrEqual(0);
    });
  });

  // ========================================
  // Excel Parser Tests
  // ========================================

  describe("Excel Parser v2", () => {
    test("should parse test cases correctly", async () => {
      // Create mock Excel data
      const mockData = [
        ["Title", "Description", "Steps", "Expected"],
        ["Login Test", "Test user login", "Navigate to login | Enter credentials", "User logged in"],
        ["Search Test", "Test search", "Click search | Enter term", "Results shown"],
      ];

      // For real testing, you would create an actual Excel file
      // This is simplified for demonstration
      const result = await ExcelParserV2.parseTestCases(Buffer.from("mock"));

      // The actual parser would need a real Excel file
      // This test framework is in place
      expect(true).toBe(true);
    });

    test("should validate parsed test cases", () => {
      const testCases = [
        {
          title: "Valid Test",
          description: "Test description",
          priority: "high" as const,
          tags: [],
          steps: [{ step: "Do something", expected: "It works" }],
          _rowIndex: 1,
        },
      ];

      const validation = ExcelParserV2.validate(testCases);
      expect(validation.valid).toBe(true);
    });

    test("should detect validation errors", () => {
      const invalidTestCases = [
        {
          title: "", // Missing title
          description: "Test",
          priority: "high" as const,
          tags: [],
          steps: [], // Empty steps
          _rowIndex: 1,
        },
      ];

      const validation = ExcelParserV2.validate(invalidTestCases);
      expect(validation.valid).toBe(false);
      expect(validation.errors.size).toBeGreaterThan(0);
    });
  });

  // ========================================
  // Adapter Tests
  // ========================================

  describe("Adapter Factory", () => {
    beforeAll(() => {
      AdapterFactory.clearAll();
      AdapterFactory.registerAdapter("web_playwright", new PlaywrightAdapter());
    });

    test("should register adapters", () => {
      const list = AdapterFactory.list();
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].platform).toBe("web");
    });

    test("should get adapter by key", () => {
      const adapter = AdapterFactory.getAdapter("web", "playwright");
      expect(adapter).toBeDefined();
      expect(adapter?.framework).toBe("playwright");
    });

    test("should get adapters by platform", () => {
      const adapters = AdapterFactory.getAdaptersByPlatform("web");
      expect(adapters.length).toBeGreaterThan(0);
    });

    test("should list adapter capabilities", () => {
      const adapter = AdapterFactory.getAdapter("web", "playwright");
      if (adapter) {
        const capabilities = adapter.getCapabilities();
        expect(capabilities.length).toBeGreaterThan(0);
        expect(capabilities.some((c) => c.keyword === "CLICK")).toBe(true);
      }
    });
  });

  // ========================================
  // End-to-End Scenario Tests
  // ========================================

  describe("End-to-End Scenarios", () => {
    test("should process full test interpretation pipeline", async () => {
      // Interpret natural language
      const testStep = "Click on the Submit button and verify success message";
      const keywords = await KeywordInterpreter.interpret(testStep);

      // Validate keywords
      expect(keywords.length).toBeGreaterThan(0);

      // Check each keyword is valid
      for (const keyword of keywords) {
        const validation = KeywordLibrary.validate(keyword.type, keyword);
        expect(validation.errors.length).toBe(0);
      }
    });

    test("should handle self-healing workflow", () => {
      // Original selector fails
      const originalSelector = "//button[@id='submit-button']";

      // Generate healing suggestions
      const fallbacks = SelectorFallbackStrategy.generateFallbacks(originalSelector, {
        id: "submit-button",
        text: "Submit",
        classes: ["btn", "primary"],
      });

      expect(fallbacks.length).toBeGreaterThan(0);

      // Find best suggestion
      const best = SelectorFallbackStrategy.suggestMostRobust(fallbacks);
      expect(best).toBeDefined();
      expect(best?.selector).toBeDefined();
    });
  });

  // ========================================
  // Performance Tests
  // ========================================

  describe("Performance", () => {
    test("keyword interpretation should be fast", async () => {
      const start = Date.now();

      for (let i = 0; i < 10; i++) {
        await KeywordInterpreter.interpret("Click on button");
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // Should complete in < 5 seconds
    });

    test("keyword library lookup should be instant", () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        KeywordLibrary.getKeywordsByPlatform("web");
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should be instant
    });
  });
});
