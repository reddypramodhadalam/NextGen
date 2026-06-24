/**
 * Keyword Interpreter
 * Converts natural language test steps into structured keywords
 * Uses both regex patterns and AI (optional)
 */

import { Keyword, KeywordType } from "./keyword.types";
import { getAiClient } from "../../ai-client";
import { logger } from "../../infrastructure/logger";

export class KeywordInterpreter {
  private static patterns: Map<RegExp, KeywordType> = new Map();

  static {
    KeywordInterpreter.initializePatterns();
  }

  private static initializePatterns(): void {
    // Navigation patterns
    this.patterns.set(/^navigate\s+to\s+(.+?)(?:\s+url)?$/i, KeywordType.NAVIGATE);
    this.patterns.set(/^go\s+to\s+(.+)$/i, KeywordType.NAVIGATE);
    this.patterns.set(/^open\s+(.+)$/i, KeywordType.NAVIGATE);
    this.patterns.set(/^visit\s+(.+)$/i, KeywordType.NAVIGATE);

    // Click patterns
    this.patterns.set(/^click\s+(?:on\s+)?(?:the\s+)?(.+)$/i, KeywordType.CLICK);
    this.patterns.set(/^click\s+(?:the\s+)?(.+?)\s+button$/i, KeywordType.CLICK);
    this.patterns.set(/^press\s+(?:the\s+)?(.+)$/i, KeywordType.CLICK);
    this.patterns.set(/^tap\s+(?:on\s+)?(.+)$/i, KeywordType.CLICK);

    // Type patterns
    this.patterns.set(/^(?:enter|type|fill)\s+(.+?)\s+(?:in|into|on)\s+(?:the\s+)?(.+)$/i, KeywordType.TYPE);
    this.patterns.set(/^(?:enter|type|fill)\s+(.+?)\s+(?:field|input|textbox)?$/i, KeywordType.TYPE);
    this.patterns.set(/^input\s+(.+?)\s+into\s+(.+)$/i, KeywordType.TYPE);

    // Clear patterns
    this.patterns.set(/^clear\s+(?:the\s+)?(.+)(?:\s+field)?$/i, KeywordType.CLEAR);

    // Select patterns
    this.patterns.set(/^select\s+(.+?)\s+from\s+(?:the\s+)?(.+)(?:\s+dropdown)?$/i, KeywordType.SELECT);
    this.patterns.set(/^choose\s+(.+?)\s+from\s+(.+)$/i, KeywordType.SELECT);

    // Verify patterns
    this.patterns.set(/^verify\s+(?:that\s+)?(.+?)\s+(?:is\s+)?(?:displayed|visible|shown)$/i, KeywordType.VERIFY_VISIBLE);
    this.patterns.set(/^(?:verify|check|assert)\s+(?:that\s+)?(.+?)\s+(?:is\s+)?(?:displayed|shown|visible)$/i, KeywordType.VERIFY_VISIBLE);
    this.patterns.set(/^(?:verify|check|assert|expect)\s+(?:that\s+)?(.+)$/i, KeywordType.VERIFY);
    this.patterns.set(/^(?:verify|check|assert)\s+(.+?)\s+(?:is\s+)?not\s+(?:visible|displayed)$/i, KeywordType.VERIFY_NOT_VISIBLE);
    this.patterns.set(/^(?:verify|check|assert)\s+(.+?)\s+(?:is\s+)?enabled$/i, KeywordType.VERIFY_ENABLED);
    this.patterns.set(/^(?:verify|check|assert)\s+(.+?)\s+(?:is\s+)?disabled$/i, KeywordType.VERIFY_DISABLED);

    // Wait patterns
    this.patterns.set(/^wait\s+(?:for\s+)?(.+?)(?:\s+to\s+(?:appear|be\s+visible))?(?:\s+for\s+(\d+)\s+(?:seconds|ms))?$/i, KeywordType.WAIT_FOR_ELEMENT);
    this.patterns.set(/^wait\s+(\d+)\s+(?:second|sec|ms|millisecond)s?$/i, KeywordType.WAIT);

    // Hover patterns
    this.patterns.set(/^hover\s+(?:over|on)\s+(?:the\s+)?(.+)$/i, KeywordType.HOVER);
    this.patterns.set(/^move\s+(?:mouse\s+)?to\s+(.+)$/i, KeywordType.HOVER);

    // Scroll patterns
    this.patterns.set(/^scroll\s+(?:to\s+)?(?:the\s+)?(.+)$/i, KeywordType.SCROLL);
    this.patterns.set(/^scroll\s+(?:down|up)(?:\s+to\s+(.+))?$/i, KeywordType.SCROLL);

    // Extract patterns
    this.patterns.set(/^extract\s+(?:the\s+)?(?:text|content)\s+from\s+(.+)$/i, KeywordType.EXTRACT_TEXT);
    this.patterns.set(/^get\s+(?:the\s+)?(?:text|content)\s+(?:from\s+)?(.+)$/i, KeywordType.EXTRACT_TEXT);

    // API patterns
    this.patterns.set(/^(?:call|make|send)\s+(?:api\s+)?request\s+(?:to\s+)?(.+)$/i, KeywordType.API_REQUEST);
    this.patterns.set(/^api\s+(.+)$/i, KeywordType.API_REQUEST);

    // SQL patterns
    this.patterns.set(/^execute\s+(?:sql\s+)?query\s+(.+)$/i, KeywordType.EXECUTE_SQL);
    this.patterns.set(/^run\s+sql\s+(.+)$/i, KeywordType.EXECUTE_SQL);

    // Upload patterns
    this.patterns.set(/^upload\s+(.+?)\s+to\s+(.+)$/i, KeywordType.UPLOAD_FILE);
    this.patterns.set(/^attach\s+(?:file\s+)?(.+)(?:\s+to\s+(.+))?$/i, KeywordType.UPLOAD_FILE);
  }

  /**
   * Interpret a test step (free text) into keywords
   * Uses regex patterns first, falls back to AI if available
   */
  static async interpret(step: string, testCaseContext?: { appType?: string; platform?: string }): Promise<Keyword[]> {
    // Try regex patterns first (fast path)
    const keywords = this.interpretWithRegex(step);
    if (keywords.length > 0) {
      return keywords;
    }

    // Fall back to AI if configured
    try {
      const aiClient = await getAiClient();
      if (aiClient) {
        return await this.interpretWithAI(step, testCaseContext);
      }
    } catch (error) {
      console.warn("[KeywordInterpreter] AI not available, using fallback");
    }

    // Ultimate fallback: generic keyword
    return [
      {
        id: `keyword_${Date.now()}`,
        type: KeywordType.VERIFY,
        expected: step,
      },
    ];
  }

  /**
   * Interpret using regex patterns
   */
  private static interpretWithRegex(step: string): Keyword[] {
    for (const [pattern, keywordType] of this.patterns) {
      const match = step.match(pattern);
      if (match) {
        return this.extractKeywordsFromMatch(keywordType, step, match);
      }
    }
    return [];
  }

  /**
   * Extract keywords from regex match groups
   */
  private static extractKeywordsFromMatch(keywordType: KeywordType, step: string, match: RegExpMatchArray): Keyword[] {
    const keyword: Keyword = {
      id: `keyword_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: keywordType,
    };

    switch (keywordType) {
      case KeywordType.NAVIGATE:
        keyword.value = match[1];
        break;

      case KeywordType.CLICK:
        keyword.selector = this.normalizeSelector(match[1]);
        break;

      case KeywordType.TYPE:
        keyword.value = match[1];
        keyword.selector = match[2] ? this.normalizeSelector(match[2]) : undefined;
        break;

      case KeywordType.SELECT:
        keyword.value = match[1];
        keyword.selector = match[2] ? this.normalizeSelector(match[2]) : undefined;
        break;

      case KeywordType.VERIFY:
      case KeywordType.VERIFY_VISIBLE:
      case KeywordType.VERIFY_ENABLED:
      case KeywordType.VERIFY_DISABLED:
        keyword.expected = match[1];
        break;

      case KeywordType.VERIFY_NOT_VISIBLE:
        keyword.selector = this.normalizeSelector(match[1]);
        break;

      case KeywordType.WAIT_FOR_ELEMENT:
        keyword.selector = this.normalizeSelector(match[1]);
        keyword.timeout = match[2] ? parseInt(match[2]) * 1000 : 5000;
        break;

      case KeywordType.WAIT:
        keyword.timeout = parseInt(match[1]) * 1000;
        break;

      case KeywordType.HOVER:
        keyword.selector = this.normalizeSelector(match[1]);
        break;

      case KeywordType.SCROLL:
        keyword.selector = this.normalizeSelector(match[1] || "body");
        break;

      case KeywordType.EXTRACT_TEXT:
        keyword.selector = this.normalizeSelector(match[1]);
        break;

      case KeywordType.API_REQUEST:
        keyword.value = match[1];
        break;

      case KeywordType.EXECUTE_SQL:
        keyword.value = match[1];
        break;

      case KeywordType.UPLOAD_FILE:
        keyword.value = match[1];
        keyword.selector = match[2] ? this.normalizeSelector(match[2]) : undefined;
        break;

      default:
        keyword.expected = step;
    }

    return [keyword];
  }

  /**
   * Interpret using AI (Claude/GPT)
   */
  private static async interpretWithAI(
    step: string,
    context?: { appType?: string; platform?: string }
  ): Promise<Keyword[]> {
    try {
      const aiClient = await getAiClient();

      const systemPrompt = `You are a test automation expert. Convert a natural language test step into structured keywords.

Available keyword types:
NAVIGATE, CLICK, TYPE, CLEAR, SELECT, HOVER, SCROLL, UPLOAD_FILE,
VERIFY, VERIFY_NOT, VERIFY_VISIBLE, VERIFY_NOT_VISIBLE, VERIFY_ENABLED, VERIFY_DISABLED,
WAIT, WAIT_FOR_ELEMENT, WAIT_FOR_NAVIGATION,
EXTRACT_TEXT, EXTRACT_ATTRIBUTE, GET_COUNT,
IF_VISIBLE, IF_EXISTS,
EXECUTE_SQL, VERIFY_DB,
API_REQUEST, API_VERIFY,
REPEAT, BREAK, CONTINUE

Respond with valid JSON array of keywords:
[{
  "type": "KEYWORD_TYPE",
  "selector": "xpath or css selector (if applicable)",
  "value": "value for TYPE, SELECT, NAVIGATE (if applicable)",
  "expected": "expected result for VERIFY (if applicable)",
  "timeout": 5000
}]

Only output JSON, no explanation.`;

      const userPrompt = `Convert to keywords: "${step}"
${context?.appType ? `\nApplication Type: ${context.appType}` : ""}
${context?.platform ? `\nPlatform: ${context.platform}` : ""}`;

      const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);

      try {
        const parsed = JSON.parse(response);
        const keywords: Keyword[] = Array.isArray(parsed) ? parsed : [parsed];
        return keywords.map((k, i) => ({
          id: `keyword_${Date.now()}_${i}`,
          ...k,
        }));
      } catch {
        logger.warn("[KeywordInterpreter] Failed to parse AI response", { response });
        return [];
      }
    } catch (error) {
      logger.error("[KeywordInterpreter] AI interpretation failed", { error });
      throw error;
    }
  }

  /**
   * Normalize selector text to XPath/CSS format
   */
  private static normalizeSelector(text: string): string {
    if (!text) return "";

    // If already looks like xpath or css, return as-is
    if (text.startsWith("/") || text.startsWith("./") || text.startsWith("[")) {
      return text;
    }
    if (text.includes(":") || text.includes("::") || text.includes("#") || text.includes(".")) {
      return text;
    }

    // Try to make it a reasonable xpath
    // Examples: "email field" -> "//*[contains(@placeholder, 'email')]"
    // "Submit button" -> "//button[contains(text(), 'Submit')]"

    const parts = text.toLowerCase().split(" ");
    const lastPart = parts[parts.length - 1];

    // Detect element type from last word
    if (lastPart === "button" || lastPart === "btn") {
      const label = parts.slice(0, -1).join(" ");
      return `//*[self::button or self::input[@type='button']][contains(., '${label}')]`;
    }
    if (lastPart === "field" || lastPart === "input" || lastPart === "textbox") {
      const label = parts.slice(0, -1).join(" ");
      return `//*[self::input or self::textarea][contains(@placeholder, '${label}')] | //*[self::input or self::textarea][preceding-sibling::label[contains(text(), '${label}')]]`;
    }
    if (lastPart === "link") {
      const label = parts.slice(0, -1).join(" ");
      return `//a[contains(text(), '${label}')]`;
    }

    // Generic: treat as text selector
    return `//*[contains(text(), '${text}')]`;
  }

  /**
   * Batch interpret multiple steps
   */
  static async interpretBatch(steps: string[], context?: { appType?: string; platform?: string }): Promise<Keyword[][]> {
    return Promise.all(steps.map((step) => this.interpret(step, context)));
  }

  /**
   * Get interpreted keywords as a readable summary
   */
  static summarize(keywords: Keyword[]): string {
    return keywords
      .map((k) => {
        const parts = [k.type];
        if (k.selector) parts.push(`on "${k.selector}"`);
        if (k.value) parts.push(`with "${k.value}"`);
        if (k.expected) parts.push(`expect "${k.expected}"`);
        return parts.join(" ");
      })
      .join(" → ");
  }
}
