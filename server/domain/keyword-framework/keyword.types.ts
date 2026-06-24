/**
 * Keyword Framework Types
 * Defines the structure for keyword-driven test automation
 */

export enum KeywordType {
  // Navigation
  NAVIGATE = "NAVIGATE",
  
  // Interaction
  CLICK = "CLICK",
  TYPE = "TYPE",
  CLEAR = "CLEAR",
  SELECT = "SELECT",
  HOVER = "HOVER",
  DRAG_DROP = "DRAG_DROP",
  SCROLL = "SCROLL",
  UPLOAD_FILE = "UPLOAD_FILE",
  
  // Verification
  VERIFY = "VERIFY",
  VERIFY_NOT = "VERIFY_NOT",
  VERIFY_VISIBLE = "VERIFY_VISIBLE",
  VERIFY_NOT_VISIBLE = "VERIFY_NOT_VISIBLE",
  VERIFY_ENABLED = "VERIFY_ENABLED",
  VERIFY_DISABLED = "VERIFY_DISABLED",
  
  // Wait
  WAIT = "WAIT",
  WAIT_FOR_ELEMENT = "WAIT_FOR_ELEMENT",
  WAIT_FOR_NAVIGATION = "WAIT_FOR_NAVIGATION",
  
  // Extract
  EXTRACT_TEXT = "EXTRACT_TEXT",
  EXTRACT_ATTRIBUTE = "EXTRACT_ATTRIBUTE",
  GET_COUNT = "GET_COUNT",
  
  // Conditional
  IF_VISIBLE = "IF_VISIBLE",
  IF_EXISTS = "IF_EXISTS",
  
  // Database
  EXECUTE_SQL = "EXECUTE_SQL",
  VERIFY_DB = "VERIFY_DB",
  
  // API
  API_REQUEST = "API_REQUEST",
  API_VERIFY = "API_VERIFY",
  
  // Control Flow
  REPEAT = "REPEAT",
  BREAK = "BREAK",
  CONTINUE = "CONTINUE",
}

export interface Keyword {
  id: string;
  type: KeywordType;
  selector?: string; // XPath, CSS, or object repository key
  value?: string; // For TYPE, SELECT, etc.
  expected?: string; // For VERIFY
  timeout?: number; // ms
  retryCount?: number;
  metadata?: Record<string, any>;
}

export interface KeywordExecutionResult {
  keyword: Keyword;
  success: boolean;
  duration: number; // ms
  result?: any; // For EXTRACT_* keywords
  error?: {
    message: string;
    code: string;
    details?: any;
  };
  healed?: boolean; // Was self-healing applied?
  healingStrategy?: string; // Which fallback strategy worked
  screenshot?: string; // base64
  timestamp: Date;
}

export interface KeywordContext {
  executionId: string;
  testCaseId: string;
  stepIndex: number;
  variables: Map<string, any>;
  previousResults: KeywordExecutionResult[];
  sessionData?: {
    cookies?: any;
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
  };
  metadata?: {
    platform: string;
    browser?: string;
    device?: string;
  };
}

export interface SelectorFallback {
  priority: number;
  selector: string;
  strategy: "xpath" | "css" | "text" | "aria-label" | "partial" | "similarity";
  confidence?: number; // 0-100, for AI-based suggestions
}

export interface HealingSuggestion {
  originalSelector: string;
  suggestedSelectors: SelectorFallback[];
  aiAdvice?: string;
  autoApplied?: boolean;
}

export interface KeywordLibraryEntry {
  keyword: KeywordType;
  supportedPlatforms: string[]; // "web", "mobile", "desktop", "api", "sap"
  description: string;
  examples: Array<{
    input: Keyword;
    expectedOutput: any;
  }>;
  requiredParameters: string[];
  optionalParameters: string[];
}
