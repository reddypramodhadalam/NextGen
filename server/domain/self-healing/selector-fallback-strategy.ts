/**
 * Selector Fallback Strategy
 * Implements multi-strategy fallback for element location
 * Used when primary selector fails
 */

import { SelectorFallback } from "../keyword-framework/keyword.types";

export class SelectorFallbackStrategy {
  /**
   * Generate fallback selectors for a failed element
   * Tries different strategies in order of likelihood
   */
  static generateFallbacks(
    primarySelector: string,
    elementContext?: {
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
    }
  ): SelectorFallback[] {
    const fallbacks: SelectorFallback[] = [];
    const priority = { current: 100 };

    // Strategy 1: Exact ID (if available)
    if (elementContext?.id) {
      fallbacks.push({
        priority: priority.current,
        selector: `#${elementContext.id}`,
        strategy: "xpath",
        confidence: 95,
      });
      priority.current -= 10;
    }

    // Strategy 2: By name attribute
    if (elementContext?.name) {
      fallbacks.push({
        priority: priority.current,
        selector: `//*[@name='${elementContext.name}']`,
        strategy: "xpath",
        confidence: 90,
      });
      priority.current -= 10;
    }

    // Strategy 3: By data-testid (common in modern apps)
    if (elementContext?.classes?.some((c) => c.includes("testid"))) {
      const testIdClass = elementContext.classes.find((c) => c.includes("testid"));
      fallbacks.push({
        priority: priority.current,
        selector: `//*[@data-testid='${testIdClass}']`,
        strategy: "xpath",
        confidence: 85,
      });
      priority.current -= 10;
    }

    // Strategy 4: By aria-label
    if (elementContext?.ariaLabel) {
      fallbacks.push({
        priority: priority.current,
        selector: `//*[@aria-label='${elementContext.ariaLabel}']`,
        strategy: "xpath",
        confidence: 85,
      });
      priority.current -= 10;
    }

    // Strategy 5: By placeholder
    if (elementContext?.placeholder) {
      fallbacks.push({
        priority: priority.current,
        selector: `//*[@placeholder='${elementContext.placeholder}']`,
        strategy: "xpath",
        confidence: 80,
      });
      priority.current -= 10;
    }

    // Strategy 6: By text (for buttons, links, labels)
    if (elementContext?.text) {
      fallbacks.push({
        priority: priority.current,
        selector: `//*[contains(text(), '${elementContext.text}')]`,
        strategy: "text",
        confidence: 75,
      });
      priority.current -= 10;

      // Partial text match
      fallbacks.push({
        priority: priority.current,
        selector: `//*[contains(text(), '${elementContext.text.substring(0, Math.floor(elementContext.text.length / 2))}')]`,
        strategy: "partial",
        confidence: 70,
      });
      priority.current -= 10;
    }

    // Strategy 7: By role and text (accessibility)
    if (elementContext?.role && elementContext?.text) {
      fallbacks.push({
        priority: priority.current,
        selector: `//*[@role='${elementContext.role}' and contains(text(), '${elementContext.text}')]`,
        strategy: "xpath",
        confidence: 78,
      });
      priority.current -= 10;
    }

    // Strategy 8: By tag and class combination
    if (elementContext?.tag && elementContext?.classes?.length) {
      const classSelector = elementContext.classes.join(".");
      fallbacks.push({
        priority: priority.current,
        selector: `${elementContext.tag}.${classSelector}`,
        strategy: "css",
        confidence: 72,
      });
      priority.current -= 10;

      // By tag and first class only
      if (elementContext.classes.length > 0) {
        fallbacks.push({
          priority: priority.current,
          selector: `${elementContext.tag}.${elementContext.classes[0]}`,
          strategy: "css",
          confidence: 65,
        });
        priority.current -= 10;
      }
    }

    // Strategy 9: By tag and type (for inputs)
    if (elementContext?.tag === "input" && elementContext?.type) {
      fallbacks.push({
        priority: priority.current,
        selector: `input[type='${elementContext.type}']`,
        strategy: "css",
        confidence: 70,
      });
      priority.current -= 10;
    }

    // Strategy 10: By tag alone (last resort for specific elements)
    if (elementContext?.tag) {
      fallbacks.push({
        priority: priority.current,
        selector: elementContext.tag,
        strategy: "css",
        confidence: 40,
      });
      priority.current -= 10;
    }

    return fallbacks.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Generate parent-child based fallback
   * Useful when child selector changed but parent is stable
   */
  static generateParentChildFallbacks(
    primarySelector: string,
    parentSelector?: string,
    elementIndex?: number
  ): SelectorFallback[] {
    const fallbacks: SelectorFallback[] = [];

    if (!parentSelector) return fallbacks;

    const index = elementIndex ?? 0;

    // Strategy 1: Parent + nth-child
    fallbacks.push({
      priority: 80,
      selector: `${parentSelector} > :nth-child(${index + 1})`,
      strategy: "xpath",
      confidence: 75,
    });

    // Strategy 2: Parent + descendant
    fallbacks.push({
      priority: 75,
      selector: `${parentSelector} descendant::*[${index}]`,
      strategy: "xpath",
      confidence: 70,
    });

    // Strategy 3: Parent + first child of type
    fallbacks.push({
      priority: 70,
      selector: `${parentSelector} > *:first-of-type`,
      strategy: "css",
      confidence: 65,
    });

    return fallbacks;
  }

  /**
   * Generate sibling-based fallback
   * When element moved but siblings are stable
   */
  static generateSiblingFallbacks(
    primarySelector: string,
    siblingSelector?: string,
    position?: "before" | "after"
  ): SelectorFallback[] {
    const fallbacks: SelectorFallback[] = [];

    if (!siblingSelector) return fallbacks;

    if (position === "after") {
      fallbacks.push({
        priority: 70,
        selector: `${siblingSelector}/following-sibling::*[1]`,
        strategy: "xpath",
        confidence: 70,
      });

      fallbacks.push({
        priority: 65,
        selector: `${siblingSelector} + *`,
        strategy: "css",
        confidence: 65,
      });
    } else {
      fallbacks.push({
        priority: 70,
        selector: `${siblingSelector}/preceding-sibling::*[1]`,
        strategy: "xpath",
        confidence: 70,
      });

      fallbacks.push({
        priority: 65,
        selector: `${siblingSelector} - *`,
        strategy: "css",
        confidence: 65,
      });
    }

    return fallbacks;
  }

  /**
   * Generate partial text match fallbacks
   * For dynamic content
   */
  static generatePartialMatchFallbacks(text: string): SelectorFallback[] {
    const fallbacks: SelectorFallback[] = [];

    // Full text
    fallbacks.push({
      priority: 90,
      selector: `//*[text()='${text}']`,
      strategy: "text",
      confidence: 95,
    });

    // Contains full text
    fallbacks.push({
      priority: 85,
      selector: `//*[contains(text(), '${text}')]`,
      strategy: "text",
      confidence: 85,
    });

    // Starts with
    fallbacks.push({
      priority: 80,
      selector: `//*[starts-with(text(), '${text}')]`,
      strategy: "xpath",
      confidence: 80,
    });

    // Split and search for parts
    const parts = text.split(" ");
    for (let i = 0; i < parts.length; i++) {
      const part = parts.slice(0, i + 1).join(" ");
      if (part.length > 5) {
        fallbacks.push({
          priority: 75 - i * 5,
          selector: `//*[contains(text(), '${part}')]`,
          strategy: "partial",
          confidence: Math.max(60, 75 - i * 5),
        });
      }
    }

    // Normalized text (remove extra spaces)
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized !== text) {
      fallbacks.push({
        priority: 70,
        selector: `//*[contains(translate(text(), ' ', ''), '${normalized.replace(/ /g, '')}')]`,
        strategy: "text",
        confidence: 70,
      });
    }

    return fallbacks;
  }

  /**
   * Generate CSS class-based fallbacks
   */
  static generateClassFallbacks(classes: string[]): SelectorFallback[] {
    const fallbacks: SelectorFallback[] = [];

    if (classes.length === 0) return fallbacks;

    // Each class individually
    classes.forEach((cls, index) => {
      fallbacks.push({
        priority: 80 - index * 5,
        selector: `.${cls}`,
        strategy: "css",
        confidence: Math.max(50, 80 - index * 5),
      });
    });

    // All classes together
    if (classes.length > 1) {
      fallbacks.push({
        priority: 85,
        selector: `.${classes.join(".")}`,
        strategy: "css",
        confidence: 80,
      });
    }

    return fallbacks;
  }

  /**
   * Score selector robustness
   * Lower score = more robust to changes
   */
  static scoreRobustness(selector: string): number {
    let score = 0;

    // Penalize for specificity (changes more often)
    if (selector.includes("[")) score += 5;
    if (selector.includes(".")) score += 2;
    if (selector.includes("#")) score += 1; // ID rarely changes
    if (selector.includes("nth-")) score += 10; // Very fragile
    if (selector.includes(":contains")) score += 8; // Text-based, fragile
    if (selector.includes("following-sibling")) score += 6; // DOM structure dependent
    if (selector.includes("preceding-sibling")) score += 6;

    return score;
  }

  /**
   * Suggest most robust selector
   */
  static suggestMostRobust(fallbacks: SelectorFallback[]): SelectorFallback | null {
    if (fallbacks.length === 0) return null;

    // Combine confidence score with robustness
    const scored = fallbacks.map((f) => ({
      ...f,
      robustness: 100 - this.scoreRobustness(f.selector),
      combinedScore: ((f.confidence || 50) + (100 - this.scoreRobustness(f.selector))) / 2,
    }));

    scored.sort((a, b) => b.combinedScore - a.combinedScore);
    return scored[0];
  }
}
