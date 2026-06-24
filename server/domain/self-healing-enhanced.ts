/**
 * Enhanced Self-Healing Engine
 * Intelligent recovery from broken locators and failures
 */

export interface HealingStrategy {
  selector: string;
  strategy: string;
  confidence: number;
  rationale: string;
}

export interface HealingSuggestion {
  suggestedSelectors: HealingStrategy[];
  recommendedAction: string;
  learnings: string[];
}

export class SelfHealerEnhanced {
  private static failureHistory: Map<string, number> = new Map();
  private static successHistory: Map<string, number> = new Map();
  private static domSnapshots: Map<string, string> = new Map();

  /**
   * Analyze failure and suggest healing strategies
   */
  static analyze(
    originalSelector: string,
    errorMessage: string,
    domSnapshot: string
  ): HealingSuggestion {
    const strategies: HealingStrategy[] = [];

    console.log(`[SelfHealer] Analyzing failure for selector: ${originalSelector}`);
    console.log(`[SelfHealer] Error: ${errorMessage}`);

    // Strategy 1: Try parent elements
    strategies.push(this.suggestParentSelector(originalSelector));

    // Strategy 2: Try by text content
    strategies.push(this.suggestByTextSelector(originalSelector, errorMessage));

    // Strategy 3: Try by aria-label
    strategies.push(this.suggestByAriaLabel(originalSelector));

    // Strategy 4: Try by data-test attribute
    strategies.push(this.suggestByDataTest(originalSelector));

    // Strategy 5: Try by class name
    strategies.push(this.suggestByClass(originalSelector));

    // Strategy 6: Try alternative xpath
    strategies.push(this.suggestAlternativeXPath(originalSelector));

    // Filter and sort by confidence
    const validStrategies = strategies
      .filter((s) => s.selector && s.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);  // Top 3

    // Log learnings
    this.recordAttempt(originalSelector, false);

    const learnings = this.generateLearnings(originalSelector, validStrategies);

    return {
      suggestedSelectors: validStrategies,
      recommendedAction: validStrategies.length > 0 ? "retry" : "manual_investigation",
      learnings,
    };
  }

  /**
   * Suggest parent element selector
   */
  private static suggestParentSelector(originalSelector: string): HealingStrategy {
    // If xpath, try parent
    if (originalSelector.startsWith("//")) {
      const parentXPath = originalSelector.includes("/button")
        ? originalSelector.replace("/button", "/div/button")
        : originalSelector + "/..";

      return {
        selector: parentXPath,
        strategy: "parent_navigation",
        confidence: 60,
        rationale: "Element might have moved, trying parent structure",
      };
    }

    return { selector: "", strategy: "", confidence: 0, rationale: "" };
  }

  /**
   * Suggest selector by text content
   */
  private static suggestByTextSelector(originalSelector: string, errorMessage: string): HealingStrategy {
    // Extract button text if available
    const textMatch = originalSelector.match(/contains\(text\(\),\s*['"](.*?)['"]\)/);

    if (textMatch) {
      const text = textMatch[1];
      const newSelector = `//*[contains(text(), '${text}')]`;

      return {
        selector: newSelector,
        strategy: "text_search",
        confidence: 75,
        rationale: `Found element by text content: "${text}"`,
      };
    }

    return { selector: "", strategy: "", confidence: 0, rationale: "" };
  }

  /**
   * Suggest selector by aria-label
   */
  private static suggestByAriaLabel(originalSelector: string): HealingStrategy {
    // Extract potential aria-label
    const labelMatch = originalSelector.match(/(?:title|aria-label|name)[=:\s]+['"]?([^'"]+)['"]?/i);

    if (labelMatch) {
      const label = labelMatch[1];
      const newSelector = `//*[@aria-label='${label}']`;

      return {
        selector: newSelector,
        strategy: "aria_label",
        confidence: 80,
        rationale: `Using aria-label: "${label}"`,
      };
    }

    return { selector: "", strategy: "", confidence: 0, rationale: "" };
  }

  /**
   * Suggest selector by data-test attribute
   */
  private static suggestByDataTest(originalSelector: string): HealingStrategy {
    // Try data-test as universal attribute
    const testIdMatch = originalSelector.match(/id[=:\s]*['"]?([a-zA-Z0-9_-]+)['"]?/i);

    if (testIdMatch) {
      const testId = testIdMatch[1];
      const newSelector = `//*[@data-test='${testId}']`;

      return {
        selector: newSelector,
        strategy: "data_test",
        confidence: 85,
        rationale: "Using data-test attribute for stability",
      };
    }

    return { selector: "", strategy: "", confidence: 0, rationale: "" };
  }

  /**
   * Suggest selector by class name
   */
  private static suggestByClass(originalSelector: string): HealingStrategy {
    const classMatch = originalSelector.match(/class[=:\s]*['"]?([a-zA-Z0-9_-]+)['"]?/i);

    if (classMatch) {
      const className = classMatch[1];
      const newSelector = `//*[@class='${className}']`;

      return {
        selector: newSelector,
        strategy: "class_match",
        confidence: 65,
        rationale: `Using class name: "${className}"`,
      };
    }

    return { selector: "", strategy: "", confidence: 0, rationale: "" };
  }

  /**
   * Suggest alternative xpath
   */
  private static suggestAlternativeXPath(originalSelector: string): HealingStrategy {
    // Convert CSS to XPath
    if (!originalSelector.startsWith("//")) {
      const xpathVersion = this.cssToXPath(originalSelector);

      return {
        selector: xpathVersion,
        strategy: "css_to_xpath",
        confidence: 70,
        rationale: "Converted CSS selector to XPath for better compatibility",
      };
    }

    // Try with following-sibling or preceding-sibling
    const siblingXPath = originalSelector.replace(/(\/)([^\/]+)$/, "$1following-sibling::$2[1]");

    return {
      selector: siblingXPath,
      strategy: "sibling_navigation",
      confidence: 55,
      rationale: "Trying sibling elements",
    };
  }

  /**
   * Convert CSS to XPath
   */
  private static cssToXPath(css: string): string {
    // Simple CSS to XPath conversion
    if (css.startsWith(".")) {
      return `//*[@class='${css.substring(1)}']`;
    }

    if (css.startsWith("#")) {
      return `//*[@id='${css.substring(1)}']`;
    }

    // Element selector
    const tagMatch = css.match(/^([a-z]+)/i);
    if (tagMatch) {
      return `//${tagMatch[1]}`;
    }

    return css;
  }

  /**
   * Record attempt for learning
   */
  private static recordAttempt(selector: string, success: boolean): void {
    if (success) {
      this.successHistory.set(selector, (this.successHistory.get(selector) || 0) + 1);
    } else {
      this.failureHistory.set(selector, (this.failureHistory.get(selector) || 0) + 1);
    }
  }

  /**
   * Generate learnings from healing attempts
   */
  private static generateLearnings(selector: string, strategies: HealingStrategy[]): string[] {
    const learnings: string[] = [];

    // Track what failed
    const failureCount = this.failureHistory.get(selector) || 0;
    if (failureCount > 2) {
      learnings.push(`This selector has failed ${failureCount} times. Consider using more stable identifier.`);
    }

    // Track successful strategies
    strategies.forEach((strategy) => {
      if (strategy.confidence > 70) {
        learnings.push(`High confidence strategy available: ${strategy.strategy}`);
      }
    });

    // Suggest permanent fix
    if (strategies.length > 0 && strategies[0].confidence > 80) {
      learnings.push(`Recommend updating to: ${strategies[0].selector}`);
    }

    return learnings;
  }

  /**
   * Learn from successful execution
   */
  static recordSuccess(selector: string, strategy: HealingStrategy): void {
    console.log(`[SelfHealer] Recording success for strategy: ${strategy.strategy}`);
    this.recordAttempt(selector, true);

    // Store successful selectors for future reference
    this.successHistory.set(strategy.selector, (this.successHistory.get(strategy.selector) || 0) + 1);
  }

  /**
   * Get best selector from history
   */
  static getBestSelector(baseSelector: string): string {
    // If this selector has high success rate, use it
    const successCount = this.successHistory.get(baseSelector) || 0;
    const failureCount = this.failureHistory.get(baseSelector) || 0;

    if (successCount > failureCount + 2) {
      console.log(`[SelfHealer] Using proven selector: ${baseSelector}`);
      return baseSelector;
    }

    // Find best alternative
    let bestSelector = baseSelector;
    let bestScore = failureCount;

    this.successHistory.forEach((count, selector) => {
      const failCount = this.failureHistory.get(selector) || 0;
      const score = count - failCount;

      if (score > bestScore) {
        bestScore = score;
        bestSelector = selector;
      }
    });

    return bestSelector;
  }

  /**
   * Generate comprehensive healing report
   */
  static generateReport(): {
    totalAttempts: number;
    successRate: number;
    failedSelectors: string[];
    provenSelectors: string[];
    recommendations: string[];
  } {
    const totalSuccess = Array.from(this.successHistory.values()).reduce((a, b) => a + b, 0);
    const totalFailure = Array.from(this.failureHistory.values()).reduce((a, b) => a + b, 0);
    const totalAttempts = totalSuccess + totalFailure;
    const successRate = totalAttempts > 0 ? (totalSuccess / totalAttempts) * 100 : 0;

    const failedSelectors: string[] = [];
    const provenSelectors: string[] = [];
    const recommendations: string[] = [];

    // Analyze each selector
    this.failureHistory.forEach((failCount, selector) => {
      if (failCount > 3) {
        failedSelectors.push(selector);
        recommendations.push(`Update selector: ${selector} (failed ${failCount} times)`);
      }
    });

    this.successHistory.forEach((successCount, selector) => {
      if (successCount > 5) {
        provenSelectors.push(selector);
      }
    });

    if (successRate < 80) {
      recommendations.push("Consider using more stable locator strategies (id, data-test, aria-label)");
    }

    if (failedSelectors.length > provenSelectors.length) {
      recommendations.push("High failure rate detected. Recommend selector audit.");
    }

    return {
      totalAttempts,
      successRate: Math.round(successRate),
      failedSelectors,
      provenSelectors,
      recommendations,
    };
  }

  /**
   * Reset learning data
   */
  static reset(): void {
    this.failureHistory.clear();
    this.successHistory.clear();
    this.domSnapshots.clear();
    console.log(`[SelfHealer] Learning data reset`);
  }

  /**
   * Export learning data
   */
  static exportLearnings(): {
    successHistory: Record<string, number>;
    failureHistory: Record<string, number>;
  } {
    return {
      successHistory: Object.fromEntries(this.successHistory),
      failureHistory: Object.fromEntries(this.failureHistory),
    };
  }

  /**
   * Import learning data
   */
  static importLearnings(data: {
    successHistory: Record<string, number>;
    failureHistory: Record<string, number>;
  }): void {
    this.successHistory = new Map(Object.entries(data.successHistory));
    this.failureHistory = new Map(Object.entries(data.failureHistory));
    console.log(`[SelfHealer] Learning data imported`);
  }
}
