/**
 * DOM Handler - Handles iframe, Shadow DOM, and Window switching
 * Detects and manages complex DOM structures
 */

export interface DOMContext {
  isInsideIframe: boolean;
  iframeXPath?: string;
  isShadowDOM: boolean;
  shadowHost?: string;
  hasMultipleWindows: boolean;
  windowHandle?: string;
}

export class DOMHandler {
  /**
   * Detect if element is inside an iframe
   */
  static detectIframe(elementLocator: string): DOMContext {
    // Common iframe indicators in test apps
    const iframePatterns = [
      "//iframe",
      "[id*='frame']",
      "[class*='frame']",
      "iframe",
      "Frame",
      "contentFrame",
      "reportFrame",
    ];

    const hasIframeIndicator = iframePatterns.some(
      (pattern) => elementLocator.includes(pattern)
    );

    // Try to infer iframe from element structure
    const inferredIframe = this.inferIframeFromContext(elementLocator);

    return {
      isInsideIframe: hasIframeIndicator || !!inferredIframe,
      iframeXPath: inferredIframe || "//iframe[1]",
      isShadowDOM: false,
      hasMultipleWindows: false,
    };
  }

  /**
   * Detect if element is inside Shadow DOM
   */
  static detectShadowDOM(elementLocator: string): DOMContext {
    const shadowPatterns = [
      "::shadow",
      "shadow",
      "#shadow-root",
      "host",
      "slot",
    ];

    const hasShadowIndicator = shadowPatterns.some(
      (pattern) => elementLocator.includes(pattern)
    );

    return {
      isInsideIframe: false,
      isShadowDOM: hasShadowIndicator,
      shadowHost: this.extractShadowHost(elementLocator),
      hasMultipleWindows: false,
    };
  }

  /**
   * Detect if action will open new window
   */
  static detectNewWindow(action: string, description: string): boolean {
    const newWindowTriggers = [
      "open new",
      "new tab",
      "new window",
      "report",
      "_blank",
      "window.open",
      "open profile",
      "external",
    ];

    const combined = `${action} ${description}`.toLowerCase();
    return newWindowTriggers.some((trigger) => combined.includes(trigger));
  }

  /**
   * Infer iframe from element context
   */
  private static inferIframeFromContext(elementLocator: string): string | null {
    // Common iframe patterns in enterprise apps
    if (elementLocator.includes("contentFrame")) {
      return "//iframe[@id='contentFrame']";
    }

    if (elementLocator.includes("reportFrame")) {
      return "//iframe[@id='reportFrame']";
    }

    if (elementLocator.includes("previewFrame")) {
      return "//iframe[@id='previewFrame']";
    }

    // For FAS system specifically
    if (elementLocator.includes("escalation")) {
      return "//iframe[contains(@name, 'escalation')]";
    }

    if (elementLocator.includes("form") && elementLocator.length > 50) {
      return "//iframe[@id='formFrame'] | //iframe[@class='formFrame']";
    }

    return null;
  }

  /**
   * Extract shadow DOM host
   */
  private static extractShadowHost(locator: string): string {
    const hostMatch = locator.match(/host[=:\s]+['"]?([^'"]+)['"]?/i);
    if (hostMatch) {
      return hostMatch[1];
    }

    // Try to extract from shadow syntax
    if (locator.includes("::shadow")) {
      const parts = locator.split("::shadow");
      return parts[0] || "#app";
    }

    return "#app";
  }

  /**
   * Generate iframe switching code
   */
  static generateIframeSwitchCode(iframeXPath: string): string {
    return `
// Switch to iframe
WebElement frameElement = driver.findElement(By.xpath("${iframeXPath}"));
driver.switchTo().frame(frameElement);
    `.trim();
  }

  /**
   * Generate iframe switch back code
   */
  static generateIframeSwitchBackCode(): string {
    return `
// Switch back to default content
driver.switchTo().defaultContent();
    `.trim();
  }

  /**
   * Generate window switch code
   */
  static generateWindowSwitchCode(): string {
    return `
// Get all window handles
Set<String> windowHandles = driver.getWindowHandles();

// Get the latest (newest) window
String latestWindow = windowHandles.stream()
  .reduce((first, second) -> second)
  .orElse(null);

// Switch to the latest window
if (latestWindow != null) {
  driver.switchTo().window(latestWindow);
}
    `.trim();
  }

  /**
   * Generate shadow DOM access code
   */
  static generateShadowDOMAccessCode(
    hostLocator: string,
    innerLocator: string
  ): string {
    return `
// Access element inside shadow DOM
JavascriptExecutor js = (JavascriptExecutor) driver;

// Get shadow host
WebElement shadowHost = driver.findElement(By.xpath("${hostLocator}"));

// Access shadow root
WebElement shadowRoot = (WebElement) js.executeScript(
  "return arguments[0].shadowRoot", 
  shadowHost
);

// Find element inside shadow DOM
WebElement element = shadowRoot.findElement(By.xpath("${innerLocator}"));
    `.trim();
  }

  /**
   * Create comprehensive DOM context from step
   */
  static analyzeDOMContext(
    action: string,
    description: string,
    locator: string
  ): DOMContext {
    const iframeContext = this.detectIframe(locator);
    const shadowContext = this.detectShadowDOM(locator);
    const windowContext = {
      hasMultipleWindows: this.detectNewWindow(action, description),
    };

    return {
      ...iframeContext,
      ...shadowContext,
      ...windowContext,
    };
  }

  /**
   * Generate step sequence for handling complex DOM
   */
  static generateDOMHandlingSteps(
    context: DOMContext,
    primaryAction: string
  ): string[] {
    const steps: string[] = [];

    // Step 1: Switch to iframe if needed
    if (context.isInsideIframe && context.iframeXPath) {
      steps.push(`switchFrame(${context.iframeXPath})`);
    }

    // Step 2: Handle shadow DOM if needed
    if (context.isShadowDOM && context.shadowHost) {
      steps.push(`accessShadowDOM(${context.shadowHost})`);
    }

    // Step 3: Handle window switch if needed
    if (context.hasMultipleWindows) {
      steps.push(`switchWindow()`);
    }

    // Step 4: Perform actual action
    steps.push(primaryAction);

    // Step 5: Switch back if iframe was used
    if (context.isInsideIframe) {
      steps.push(`switchDefault()`);
    }

    return steps;
  }
}
