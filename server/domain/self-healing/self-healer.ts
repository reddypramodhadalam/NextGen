/**
 * Self-Healer Engine
 * Automatically recovers from test failures by finding alternative selectors
 */

import { Keyword, KeywordExecutionResult, HealingSuggestion, SelectorFallback } from "../keyword-framework/keyword.types";
import { SelectorFallbackStrategy } from "./selector-fallback-strategy";
import { getAiClient } from "../../ai-client";
import { logger } from "../../infrastructure/logger";

interface ElementAnalysis {
  text?: string;
  ariaLabel?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  classes?: string[];
  type?: string;
  tag?: string;
  role?: string;
  parent?: string;
  visible?: boolean;
  enabled?: boolean;
}

export class SelfHealer {
  private static healingHistory: Map<string, HealingSuggestion[]> = new Map();
  private static maxHistoryPerSelector = 10;

  /**
   * Attempt to heal a failed keyword by finding alternative selectors
   */
  static async heal(
    failedKeyword: Keyword,
    error: any,
    elementContext?: ElementAnalysis,
    previousResults?: KeywordExecutionResult[]
  ): Promise<HealingSuggestion> {
    const originalSelector = failedKeyword.selector || "";

    // Step 1: Generate fallback selectors using multiple strategies
    let suggestions: SelectorFallback[] = [];

    if (elementContext) {
      suggestions.push(...SelectorFallbackStrategy.generateFallbacks(originalSelector, elementContext));
    }

    // Step 2: Add strategy-specific fallbacks
    if (elementContext?.parent) {
      const parentFallbacks = SelectorFallbackStrategy.generateParentChildFallbacks(
        originalSelector,
        elementContext.parent
      );
      suggestions.push(...parentFallbacks);
    }

    // Step 3: Try AI-based suggestion if available
    if (suggestions.length < 5) {
      try {
        const aiSuggestion = await this.getAISuggestion(failedKeyword, error, elementContext);
        if (aiSuggestion) {
          suggestions.push(aiSuggestion);
        }
      } catch (aiError) {
        console.warn("[SelfHealer] AI suggestion failed:", aiError);
      }
    }

    // Step 4: Check healing history for similar cases
    const historicalSuggestions = this.getHistoricalSuggestions(originalSelector);
    if (historicalSuggestions.length > 0) {
      const bestHistorical = historicalSuggestions[0].suggestedSelectors[0];
      if (bestHistorical) {
        suggestions.unshift(bestHistorical);
      }
    }

    // Step 5: Sort by confidence and robustness
    const scored = suggestions.map((s) => ({
      ...s,
      confidence: s.confidence || 50,
    }));
    scored.sort((a, b) => {
      const scoreA = a.confidence * 0.6 + (100 - SelectorFallbackStrategy.scoreRobustness(a.selector)) * 0.4;
      const scoreB = b.confidence * 0.6 + (100 - SelectorFallbackStrategy.scoreRobustness(b.selector)) * 0.4;
      return scoreB - scoreA;
    });

    const suggestion: HealingSuggestion = {
      originalSelector,
      suggestedSelectors: scored.slice(0, 5),
      autoApplied: scored.length > 0,
    };

    // Store in history
    this.recordSuggestion(originalSelector, suggestion);

    return suggestion;
  }

  /**
   * Get AI-based healing suggestion
   */
  private static async getAISuggestion(
    keyword: Keyword,
    error: any,
    context?: ElementAnalysis
  ): Promise<SelectorFallback | null> {
    try {
      const aiClient = await getAiClient();

      const systemPrompt = `You are a test automation expert specializing in XPath and CSS selectors.
A test automation step failed because an element could not be found with selector: "${keyword.selector}".

Suggest alternative selectors that are more robust. Consider:
- Alternative attributes (id, name, data-testid, aria-label)
- Text-based selectors
- Parent-child relationships
- CSS class combinations
- XPath expressions

Respond with a JSON object:
{
  "selector": "the most robust alternative selector",
  "strategy": "xpath|css|text|aria-label|partial|similarity",
  "confidence": 75,
  "reasoning": "why this selector should work"
}`;

      const userPrompt = `Failed selector: "${keyword.selector}"
Keyword type: ${keyword.type}
Error: ${error?.message || "Element not found"}
${context ? `Element context:\n${JSON.stringify(context, null, 2)}` : ""}`;

      const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);

      try {
        const parsed = JSON.parse(response);
        if (parsed.selector) {
          return {
            priority: 60,
            selector: parsed.selector,
            strategy: parsed.strategy || "xpath",
            confidence: parsed.confidence || 70,
          };
        }
      } catch {
        logger.warn("[SelfHealer] Failed to parse AI response");
      }
    } catch (error) {
      logger.warn("[SelfHealer] AI suggestion not available");
    }

    return null;
  }

  /**
   * Extract element analysis from DOM context
   */
  static analyzeElement(element: any): ElementAnalysis {
    return {
      text: element.textContent?.trim(),
      ariaLabel: element.getAttribute?.("aria-label"),
      placeholder: element.getAttribute?.("placeholder"),
      name: element.getAttribute?.("name"),
      id: element.getAttribute?.("id"),
      classes: element.className ? element.className.split(" ") : [],
      type: element.getAttribute?.("type"),
      tag: element.tagName?.toLowerCase(),
      role: element.getAttribute?.("role"),
      visible: element.offsetParent !== null,
      enabled: !element.disabled,
    };
  }

  /**
   * Record healing suggestion for future reference
   */
  private static recordSuggestion(originalSelector: string, suggestion: HealingSuggestion): void {
    const key = this.hashSelector(originalSelector);
    const history = this.healingHistory.get(key) || [];

    history.unshift(suggestion);
    if (history.length > this.maxHistoryPerSelector) {
      history.pop();
    }

    this.healingHistory.set(key, history);
  }

  /**
   * Get historical healing suggestions
   */
  private static getHistoricalSuggestions(selector: string): HealingSuggestion[] {
    const key = this.hashSelector(selector);
    return this.healingHistory.get(key) || [];
  }

  /**
   * Simple hash function for selector
   */
  private static hashSelector(selector: string): string {
    const normalized = selector.toLowerCase().replace(/\s+/g, " ");
    return normalized;
  }

  /**
   * Get healing statistics
   */
  static getStatistics(): {
    totalSelectors: number;
    totalSuggestions: number;
    averageSuggestionsPerSelector: number;
  } {
    let totalSuggestions = 0;
    this.healingHistory.forEach((suggestions) => {
      totalSuggestions += suggestions.length;
    });

    return {
      totalSelectors: this.healingHistory.size,
      totalSuggestions,
      averageSuggestionsPerSelector: this.healingHistory.size > 0 ? totalSuggestions / this.healingHistory.size : 0,
    };
  }

  /**
   * Clear healing history
   */
  static clearHistory(): void {
    this.healingHistory.clear();
  }

  /**
   * Export healing suggestions for training
   */
  static exportSuggestions(): Record<string, HealingSuggestion[]> {
    const exported: Record<string, HealingSuggestion[]> = {};
    this.healingHistory.forEach((suggestions, key) => {
      exported[key] = suggestions;
    });
    return exported;
  }

  /**
   * Import healing suggestions (for ML training)
   */
  static importSuggestions(data: Record<string, HealingSuggestion[]>): void {
    Object.entries(data).forEach(([key, suggestions]) => {
      this.healingHistory.set(key, suggestions.slice(0, this.maxHistoryPerSelector));
    });
  }
}
