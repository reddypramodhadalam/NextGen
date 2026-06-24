/**
 * Keyword Library
 * Centralized repository of all supported keywords
 * Provides metadata, validation, and default implementations
 */

import { KeywordType, KeywordLibraryEntry } from "./keyword.types";

export class KeywordLibrary {
  private static entries: Map<KeywordType, KeywordLibraryEntry> = new Map();

  static {
    KeywordLibrary.initializeLibrary();
  }

  private static initializeLibrary(): void {
    // Navigation Keywords
    this.register({
      keyword: KeywordType.NAVIGATE,
      supportedPlatforms: ["web", "mobile", "sap"],
      description: "Navigate to a URL",
      examples: [
        {
          input: { id: "nav1", type: KeywordType.NAVIGATE, value: "https://example.com" },
          expectedOutput: { statusCode: 200 },
        },
      ],
      requiredParameters: ["value"],
      optionalParameters: ["timeout"],
    });

    // Click Keywords
    this.register({
      keyword: KeywordType.CLICK,
      supportedPlatforms: ["web", "mobile", "desktop", "sap"],
      description: "Click an element",
      examples: [
        {
          input: { id: "click1", type: KeywordType.CLICK, selector: "button[name='Submit']" },
          expectedOutput: { elementClicked: true },
        },
      ],
      requiredParameters: ["selector"],
      optionalParameters: ["timeout", "retryCount"],
    });

    // Type Keywords
    this.register({
      keyword: KeywordType.TYPE,
      supportedPlatforms: ["web", "mobile", "desktop"],
      description: "Type text into an input field",
      examples: [
        {
          input: {
            id: "type1",
            type: KeywordType.TYPE,
            selector: "input[name='email']",
            value: "user@example.com",
          },
          expectedOutput: { textEntered: "user@example.com" },
        },
      ],
      requiredParameters: ["selector", "value"],
      optionalParameters: ["timeout", "retryCount", "clearFirst"],
    });

    // Verify Keywords
    this.register({
      keyword: KeywordType.VERIFY,
      supportedPlatforms: ["web", "mobile", "desktop", "api", "sap"],
      description: "Verify text/element exists on page",
      examples: [
        {
          input: {
            id: "verify1",
            type: KeywordType.VERIFY,
            expected: "Login successful",
          },
          expectedOutput: { verified: true },
        },
      ],
      requiredParameters: ["expected"],
      optionalParameters: ["selector", "timeout"],
    });

    // Wait Keywords
    this.register({
      keyword: KeywordType.WAIT_FOR_ELEMENT,
      supportedPlatforms: ["web", "mobile", "desktop"],
      description: "Wait for an element to appear",
      examples: [
        {
          input: {
            id: "wait1",
            type: KeywordType.WAIT_FOR_ELEMENT,
            selector: ".loading-spinner",
            timeout: 5000,
          },
          expectedOutput: { elementAppeared: true },
        },
      ],
      requiredParameters: ["selector"],
      optionalParameters: ["timeout", "state"],
    });

    // Extract Keywords
    this.register({
      keyword: KeywordType.EXTRACT_TEXT,
      supportedPlatforms: ["web", "mobile", "desktop", "api"],
      description: "Extract text content from an element",
      examples: [
        {
          input: {
            id: "extract1",
            type: KeywordType.EXTRACT_TEXT,
            selector: ".confirmation-message",
          },
          expectedOutput: { text: "Order confirmed" },
        },
      ],
      requiredParameters: ["selector"],
      optionalParameters: ["timeout"],
    });

    // API Keywords
    this.register({
      keyword: KeywordType.API_REQUEST,
      supportedPlatforms: ["api"],
      description: "Make an HTTP request",
      examples: [
        {
          input: {
            id: "api1",
            type: KeywordType.API_REQUEST,
            value: '{"method": "GET", "url": "/api/users"}',
          },
          expectedOutput: { statusCode: 200, body: {} },
        },
      ],
      requiredParameters: ["value"],
      optionalParameters: ["timeout"],
    });

    // Select Keywords
    this.register({
      keyword: KeywordType.SELECT,
      supportedPlatforms: ["web", "mobile", "desktop"],
      description: "Select an option from dropdown",
      examples: [
        {
          input: {
            id: "select1",
            type: KeywordType.SELECT,
            selector: "select[name='country']",
            value: "USA",
          },
          expectedOutput: { optionSelected: "USA" },
        },
      ],
      requiredParameters: ["selector", "value"],
      optionalParameters: ["timeout"],
    });

    // Hover Keywords
    this.register({
      keyword: KeywordType.HOVER,
      supportedPlatforms: ["web", "desktop"],
      description: "Hover over an element",
      examples: [
        {
          input: {
            id: "hover1",
            type: KeywordType.HOVER,
            selector: ".menu-item",
          },
          expectedOutput: { hovered: true },
        },
      ],
      requiredParameters: ["selector"],
      optionalParameters: ["timeout"],
    });

    // Scroll Keywords
    this.register({
      keyword: KeywordType.SCROLL,
      supportedPlatforms: ["web", "mobile"],
      description: "Scroll to an element",
      examples: [
        {
          input: {
            id: "scroll1",
            type: KeywordType.SCROLL,
            selector: ".bottom-section",
          },
          expectedOutput: { scrolled: true },
        },
      ],
      requiredParameters: ["selector"],
      optionalParameters: ["timeout"],
    });

    // Verify Visible Keywords
    this.register({
      keyword: KeywordType.VERIFY_VISIBLE,
      supportedPlatforms: ["web", "mobile", "desktop"],
      description: "Verify an element is visible",
      examples: [
        {
          input: {
            id: "visible1",
            type: KeywordType.VERIFY_VISIBLE,
            selector: ".success-message",
          },
          expectedOutput: { isVisible: true },
        },
      ],
      requiredParameters: ["selector"],
      optionalParameters: ["timeout"],
    });

    // Execute SQL Keywords
    this.register({
      keyword: KeywordType.EXECUTE_SQL,
      supportedPlatforms: ["api"],
      description: "Execute SQL query against backend database",
      examples: [
        {
          input: {
            id: "sql1",
            type: KeywordType.EXECUTE_SQL,
            value: "SELECT COUNT(*) FROM users WHERE active=1",
          },
          expectedOutput: { rows: [{ count: 42 }] },
        },
      ],
      requiredParameters: ["value"],
      optionalParameters: [],
    });

    // If Visible Keywords (Conditional)
    this.register({
      keyword: KeywordType.IF_VISIBLE,
      supportedPlatforms: ["web", "mobile", "desktop"],
      description: "Conditionally execute based on element visibility",
      examples: [
        {
          input: {
            id: "if1",
            type: KeywordType.IF_VISIBLE,
            selector: ".logout-button",
            value: "CLICK",
          },
          expectedOutput: { conditionMet: true, executed: true },
        },
      ],
      requiredParameters: ["selector", "value"],
      optionalParameters: ["timeout"],
    });
  }

  private static register(entry: KeywordLibraryEntry): void {
    this.entries.set(entry.keyword, entry);
  }

  /**
   * Get keyword metadata
   */
  static getKeyword(type: KeywordType): KeywordLibraryEntry | undefined {
    return this.entries.get(type);
  }

  /**
   * Get all supported keywords
   */
  static getAllKeywords(): KeywordLibraryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get keywords for a specific platform
   */
  static getKeywordsByPlatform(platform: string): KeywordLibraryEntry[] {
    return Array.from(this.entries.values()).filter((entry) =>
      entry.supportedPlatforms.includes(platform)
    );
  }

  /**
   * Validate a keyword
   */
  static validate(type: KeywordType, params: Record<string, any>): { valid: boolean; errors: string[] } {
    const entry = this.entries.get(type);
    if (!entry) {
      return { valid: false, errors: [`Unknown keyword type: ${type}`] };
    }

    const errors: string[] = [];

    // Check required parameters
    for (const required of entry.requiredParameters) {
      if (!(required in params) || params[required] === null || params[required] === undefined) {
        errors.push(`Missing required parameter: ${required}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get all keyword types
   */
  static getAllKeywordTypes(): KeywordType[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Check if platform supports keyword
   */
  static isKeywordSupportedByPlatform(type: KeywordType, platform: string): boolean {
    const entry = this.entries.get(type);
    return entry ? entry.supportedPlatforms.includes(platform) : false;
  }
}
