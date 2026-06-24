/**
 * Locator Generator - Creates multiple stable locators for elements
 * Priority: id → data-test → name → css → xpath
 */

export interface LocatorSet {
  primary: string;        // Best locator
  fallbacks: string[];    // 2-3 fallback locators
  strategy: string;       // Strategy used (id/css/xpath/etc)
  confidence: number;     // 0-100 confidence score
}

export class LocatorGenerator {
  /**
   * Generate multiple locators from a description
   * Priority: id → data-test → name → css → xpath
   */
  static generateLocators(elementDescription: string): LocatorSet {
    const desc = elementDescription.toLowerCase().trim();

    // Strategy 1: ID-based
    const idLocator = this.extractIdLocator(desc);
    if (idLocator) {
      return {
        primary: idLocator,
        fallbacks: [
          this.generateCSSLocator(desc),
          this.generateXPathLocator(desc),
        ].filter(Boolean) as string[],
        strategy: "id",
        confidence: 95,
      };
    }

    // Strategy 2: Data-test attribute
    const dataTestLocator = this.extractDataTestLocator(desc);
    if (dataTestLocator) {
      return {
        primary: dataTestLocator,
        fallbacks: [
          this.generateCSSLocator(desc),
          this.generateXPathLocator(desc),
        ].filter(Boolean) as string[],
        strategy: "data-test",
        confidence: 90,
      };
    }

    // Strategy 3: Name attribute
    const nameLocator = this.extractNameLocator(desc);
    if (nameLocator) {
      return {
        primary: nameLocator,
        fallbacks: [
          this.generateCSSLocator(desc),
          this.generateXPathLocator(desc),
        ].filter(Boolean) as string[],
        strategy: "name",
        confidence: 80,
      };
    }

    // Strategy 4: CSS selector
    const cssLocator = this.generateCSSLocator(desc);
    if (cssLocator) {
      return {
        primary: cssLocator,
        fallbacks: [
          this.generateXPathLocator(desc),
          this.generateXPathByText(desc),
        ].filter(Boolean) as string[],
        strategy: "css",
        confidence: 70,
      };
    }

    // Strategy 5: XPath (last resort)
    const xpathLocator = this.generateXPathLocator(desc);
    return {
      primary: xpathLocator,
      fallbacks: [
        this.generateXPathByText(desc),
        `//button[contains(text(), '${this.extractButtonText(desc)}')]`,
      ].filter(Boolean) as string[],
      strategy: "xpath",
      confidence: 50,
    };
  }

  /**
   * Extract ID-based locator
   */
  private static extractIdLocator(desc: string): string | null {
    const idMatch = desc.match(/id[=:\s]+['"]?([a-zA-Z0-9_-]+)['"]?/i);
    if (idMatch) {
      return `//*[@id='${idMatch[1]}']`;
    }

    const hashMatch = desc.match(/#([a-zA-Z0-9_-]+)/);
    if (hashMatch) {
      return `//*[@id='${hashMatch[1]}']`;
    }

    return null;
  }

  /**
   * Extract data-test attribute locator
   */
  private static extractDataTestLocator(desc: string): string | null {
    const dataTestMatch = desc.match(/data-test[=:\s]+['"]?([a-zA-Z0-9_-]+)['"]?/i);
    if (dataTestMatch) {
      return `//*[@data-test='${dataTestMatch[1]}']`;
    }

    const ariaMatch = desc.match(/aria-label[=:\s]+['"]?([^'"]+)['"]?/i);
    if (ariaMatch) {
      return `//*[@aria-label='${ariaMatch[1]}']`;
    }

    return null;
  }

  /**
   * Extract name attribute locator
   */
  private static extractNameLocator(desc: string): string | null {
    const nameMatch = desc.match(/name[=:\s]+['"]?([a-zA-Z0-9_-]+)['"]?/i);
    if (nameMatch) {
      return `//input[@name='${nameMatch[1]}'] | //select[@name='${nameMatch[1]}'] | //textarea[@name='${nameMatch[1]}']`;
    }

    return null;
  }

  /**
   * Generate CSS selector
   */
  private static generateCSSLocator(desc: string): string | null {
    // Look for button text
    const buttonMatch = desc.match(/button.*?['"]?([^'"]+)['"]?/i);
    if (buttonMatch) {
      const text = buttonMatch[1].trim();
      return `button:has-text("${text}")`;
    }

    // Look for input with placeholder
    const placeholderMatch = desc.match(/placeholder[=:\s]+['"]?([^'"]+)['"]?/i);
    if (placeholderMatch) {
      return `input[placeholder="${placeholderMatch[1]}"]`;
    }

    // Look for class
    const classMatch = desc.match(/class[=:\s]+['"]?([a-zA-Z0-9_-]+)['"]?/i);
    if (classMatch) {
      return `.${classMatch[1]}`;
    }

    return null;
  }

  /**
   * Generate XPath by element type and text
   */
  private static generateXPathLocator(desc: string): string {
    // Button by contains text
    const buttonMatch = desc.match(/(?:click|button)\s+['"]?([^'"]+)['"]?/i);
    if (buttonMatch) {
      const text = buttonMatch[1].trim();
      return `//button[contains(text(), '${text}')]`;
    }

    // Input by placeholder
    const placeholderMatch = desc.match(/(?:enter|input)\s+(['"]?)([^'"]+)\1/i);
    if (placeholderMatch) {
      const placeholder = placeholderMatch[2];
      return `//input[@placeholder='${placeholder}']`;
    }

    // Label by text
    const labelMatch = desc.match(/label.*?['"]?([^'"]+)['"]?/i);
    if (labelMatch) {
      return `//label[contains(text(), '${labelMatch[1]}')]`;
    }

    return `//div[contains(text(), '${desc.substring(0, 30)}')]`;
  }

  /**
   * Generate XPath by text content
   */
  private static generateXPathByText(desc: string): string {
    const textMatch = desc.match(/['"]?([^'"]+)['"]?/);
    if (textMatch) {
      return `//*[contains(text(), '${textMatch[1].substring(0, 20)}')]`;
    }
    return "";
  }

  /**
   * Extract button text from description
   */
  private static extractButtonText(desc: string): string {
    const match = desc.match(/(?:click|button)\s+['"]?([^'"]+)['"]?/i);
    return match ? match[1].substring(0, 30) : "button";
  }

  /**
   * Validate if locator is stable (no random IDs/classes)
   */
  static isStableLocator(locator: string): boolean {
    const unstablePatterns = [
      /id-\d{10,}/i,        // Random numeric IDs
      /class-\d{10,}/i,     // Random classes
      /[a-z0-9]{32,}/,      // Hash-like strings
      /uuid/i,              // UUID-based
      /random/i,            // Random prefix
      /temp/i,              // Temporary
    ];

    return !unstablePatterns.some((pattern) => pattern.test(locator));
  }

  /**
   * Suggest best locator from alternatives
   */
  static selectBestLocator(locators: string[]): string {
    return locators.sort((a, b) => {
      // Prioritize shorter, simpler locators
      if (a.length !== b.length) return a.length - b.length;

      // Prioritize ID
      if (a.includes("@id")) return -1;
      if (b.includes("@id")) return 1;

      // Prioritize data-test
      if (a.includes("data-test")) return -1;
      if (b.includes("data-test")) return 1;

      return 0;
    })[0];
  }
}
