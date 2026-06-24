/**
 * Enhanced Execution Step
 * Supports all action types: click, input, hover, drag-drop, right-click, key press, iframe, window, shadow, validation
 */

export type ActionType =
  | "navigate"      // Navigate to URL
  | "click"         // Click element
  | "input"         // Enter text (with auto-clear)
  | "hover"         // Hover over element
  | "dragDrop"      // Drag and drop
  | "rightClick"    // Right-click context menu
  | "doubleClick"   // Double-click
  | "keyPress"      // Press keys (ENTER, TAB, etc)
  | "select"        // Select from dropdown
  | "switchFrame"   // Switch to iframe
  | "switchDefault" // Switch back from iframe
  | "switchWindow"  // Switch to new window
  | "shadow"        // Access shadow DOM
  | "hover"         // Hover action
  | "verify"        // Verify element/text
  | "wait"          // Wait for condition
  | "screenshot"    // Take screenshot
  | "alert"         // Handle alert
  | "scroll"        // Scroll element
  | "clearField";   // Clear input field

export type WaitCondition =
  | "visible"       // Element visible
  | "clickable"     // Element clickable
  | "enabled"       // Element enabled
  | "selected"      // Element selected
  | "present"       // Element present in DOM
  | "textPresent"   // Text present
  | "textChanges"   // Text changes
  | "invisible"     // Element invisible
  | "staleness";    // Element becomes stale

export interface ExecutionStep {
  stepNumber: number;
  action: ActionType;
  description: string;
  
  // Locator strategy - supports multiple fallbacks
  locators: {
    primary: string;
    fallbacks: string[];
    strategy: string;     // id | data-test | name | css | xpath
    confidence: number;   // 0-100
  };

  // Input data
  testData?: string | null;
  
  // Expected result for validation
  expectedResult: string;
  
  // Wait strategy
  wait: {
    enabled: boolean;
    timeout: number;      // milliseconds
    condition: WaitCondition;
    pollInterval: number; // milliseconds
  };

  // Input handling
  input?: {
    clearFirst: boolean;  // Clear field before sending keys
    slowType: boolean;    // Type slowly (for better reliability)
    typeDelay: number;    // Delay between keystrokes
  };

  // Action-specific parameters
  actionParams?: {
    // For keyPress
    keys?: string[];      // Keys to press (e.g., ['ENTER', 'TAB'])
    
    // For drag-drop
    dragSource?: string;
    dropTarget?: string;
    
    // For select
    selectValue?: string;
    selectText?: string;
    
    // For scroll
    scrollAmount?: number;
    
    // For shadow DOM
    shadowHost?: string;
    shadowSelector?: string;
    
    // For iframe
    frameIndex?: number;
    frameXPath?: string;
  };

  // POST-ACTION VALIDATION
  validation?: {
    enabled: boolean;
    type: "text" | "element" | "url" | "attribute";
    value: string;
    timeout?: number;
  };

  // Error handling & self-healing
  errorHandling?: {
    retryOnFailure: boolean;
    maxRetries: number;
    fallbackLocators: string[];  // Additional fallbacks
    recoveryActions?: ActionType[];  // Actions to take on failure
  };

  // DOM context
  domContext?: {
    isInsideIframe: boolean;
    isShadowDOM: boolean;
    hasMultipleWindows: boolean;
  };

  // Execution metadata
  waitTime: number;        // Wait before step (in seconds)
  timeoutMs: number;       // Step timeout (in ms)
  screenshot: boolean;     // Capture screenshot after step
  timestamp?: Date;
  duration?: number;       // Execution duration (ms)
}

export class ExecutionStepFactory {
  /**
   * Create a click step with full robustness
   */
  static createClickStep(
    stepNumber: number,
    description: string,
    locators: { primary: string; fallbacks: string[]; strategy: string; confidence: number },
    expectedResult: string
  ): ExecutionStep {
    return {
      stepNumber,
      action: "click",
      description,
      locators,
      expectedResult,
      wait: {
        enabled: true,
        timeout: 10000,
        condition: "clickable",  // Wait until clickable, not just visible
        pollInterval: 500,
      },
      errorHandling: {
        retryOnFailure: true,
        maxRetries: 3,
        fallbackLocators: locators.fallbacks,
        recoveryActions: ["screenshot"],
      },
      waitTime: 1,
      timeoutMs: 15000,
      screenshot: false,
    };
  }

  /**
   * Create an input step with auto-clearing
   */
  static createInputStep(
    stepNumber: number,
    description: string,
    locators: { primary: string; fallbacks: string[]; strategy: string; confidence: number },
    testData: string,
    expectedResult: string
  ): ExecutionStep {
    return {
      stepNumber,
      action: "input",
      description,
      locators,
      testData,
      expectedResult,
      wait: {
        enabled: true,
        timeout: 10000,
        condition: "clickable",  // Must be clickable before input
        pollInterval: 500,
      },
      input: {
        clearFirst: true,        // CRITICAL: Clear field first
        slowType: false,
        typeDelay: 50,
      },
      validation: {
        enabled: true,
        type: "attribute",
        value: testData,         // Verify text was actually entered
      },
      errorHandling: {
        retryOnFailure: true,
        maxRetries: 3,
        fallbackLocators: locators.fallbacks,
      },
      waitTime: 1,
      timeoutMs: 15000,
      screenshot: false,
    };
  }

  /**
   * Create an iframe switching step
   */
  static createIframeStep(
    stepNumber: number,
    iframeXPath: string
  ): ExecutionStep {
    return {
      stepNumber,
      action: "switchFrame",
      description: `Switch to iframe: ${iframeXPath}`,
      locators: {
        primary: iframeXPath,
        fallbacks: ["//iframe[1]"],
        strategy: "xpath",
        confidence: 85,
      },
      expectedResult: "Successfully switched to iframe",
      actionParams: {
        frameXPath: iframeXPath,
      },
      wait: {
        enabled: true,
        timeout: 5000,
        condition: "present",
        pollInterval: 500,
      },
      waitTime: 0,
      timeoutMs: 8000,
      screenshot: false,
    };
  }

  /**
   * Create an iframe switch-back step
   */
  static createDefaultContentStep(stepNumber: number): ExecutionStep {
    return {
      stepNumber,
      action: "switchDefault",
      description: "Switch back to default content",
      locators: {
        primary: "defaultContent",
        fallbacks: [],
        strategy: "special",
        confidence: 100,
      },
      expectedResult: "Successfully switched to default content",
      wait: {
        enabled: false,
        timeout: 1000,
        condition: "present",
        pollInterval: 100,
      },
      waitTime: 0,
      timeoutMs: 2000,
      screenshot: false,
    };
  }

  /**
   * Create a window switching step
   */
  static createWindowSwitchStep(stepNumber: number): ExecutionStep {
    return {
      stepNumber,
      action: "switchWindow",
      description: "Switch to new window/tab",
      locators: {
        primary: "newWindow",
        fallbacks: [],
        strategy: "special",
        confidence: 100,
      },
      expectedResult: "Successfully switched to new window",
      wait: {
        enabled: true,
        timeout: 5000,
        condition: "present",
        pollInterval: 500,
      },
      actionParams: {
        frameIndex: 1,  // Switch to second window
      },
      waitTime: 2,  // Wait a bit for window to fully load
      timeoutMs: 10000,
      screenshot: false,
    };
  }

  /**
   * Create a hover step
   */
  static createHoverStep(
    stepNumber: number,
    description: string,
    locators: { primary: string; fallbacks: string[]; strategy: string; confidence: number },
    expectedResult: string
  ): ExecutionStep {
    return {
      stepNumber,
      action: "hover",
      description,
      locators,
      expectedResult,
      wait: {
        enabled: true,
        timeout: 10000,
        condition: "visible",
        pollInterval: 500,
      },
      errorHandling: {
        retryOnFailure: true,
        maxRetries: 2,
        fallbackLocators: locators.fallbacks,
      },
      waitTime: 1,
      timeoutMs: 12000,
      screenshot: false,
    };
  }

  /**
   * Create a verification step
   */
  static createVerifyStep(
    stepNumber: number,
    description: string,
    expectedResult: string,
    validationType: "text" | "element" | "url" = "element"
  ): ExecutionStep {
    return {
      stepNumber,
      action: "verify",
      description,
      locators: {
        primary: "",
        fallbacks: [],
        strategy: "verification",
        confidence: 100,
      },
      expectedResult,
      validation: {
        enabled: true,
        type: validationType,
        value: expectedResult,
        timeout: 10000,
      },
      wait: {
        enabled: true,
        timeout: 10000,
        condition: validationType === "url" ? "textPresent" : "visible",
        pollInterval: 500,
      },
      waitTime: 0,
      timeoutMs: 12000,
      screenshot: true,  // Always screenshot on verification
    };
  }
}
