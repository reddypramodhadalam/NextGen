// ============================================================================
// AITAS Multi-Agent System — Type Definitions
// World-class AI-powered test automation agents
// ============================================================================

export type AgentRole =
  | 'orchestrator'
  | 'planner'
  | 'navigator'
  | 'dom-intelligence'
  | 'action'
  | 'memory'
  | 'validation';

export type AgentStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'failed';

export type WorkflowStatus =
  | 'idle'
  | 'planning'
  | 'navigating'
  | 'capturing-dom'
  | 'executing'
  | 'validating'
  | 'healing'
  | 'completed'
  | 'failed';

// ─── DOM Intelligence Types ───────────────────────────────────────────────────

export interface DOMElement {
  role: string;
  name?: string;
  selector: string;        // Best CSS selector
  xpath?: string;          // XPath fallback
  id?: string;
  type?: string;
  placeholder?: string;
  value?: string;
  href?: string;
  ariaLabel?: string;
  textContent?: string;
  isVisible: boolean;
  isEnabled: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface FormDOM {
  id?: string;
  name?: string;
  selector: string;
  action?: string;
  method?: string;
  fields: DOMElement[];
  submitButton?: DOMElement;
}

export interface TableDOM {
  selector: string;
  headers: string[];
  rowCount: number;
}

export interface IframeDOM {
  id?: string;
  name?: string;
  src?: string;
  selector: string;
  index: number;
}

export interface SemanticDOM {
  url: string;
  title: string;
  inputs: DOMElement[];
  buttons: DOMElement[];
  links: DOMElement[];
  forms: FormDOM[];
  dropdowns: DOMElement[];
  checkboxes: DOMElement[];
  radios: DOMElement[];
  tables: TableDOM[];
  iframes: IframeDOM[];
  modals: DOMElement[];
  hasAlert: boolean;
  windowCount: number;
  accessibilityTree: AccessibilityNode | null;
  rawElementCount: number;
  capturedAt: Date;
}

export interface AccessibilityNode {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  keyshortcuts?: string;
  roledescription?: string;
  valuetext?: string;
  disabled?: boolean;
  expanded?: boolean;
  focused?: boolean;
  modal?: boolean;
  multiline?: boolean;
  multiselectable?: boolean;
  readonly?: boolean;
  required?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  pressed?: boolean | 'mixed';
  level?: number;
  valuemin?: number;
  valuemax?: number;
  autocomplete?: string;
  haspopup?: string;
  invalid?: string;
  orientation?: string;
  children?: AccessibilityNode[];
}

// ─── Execution Types ──────────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'healing';

export type ActionType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'hover'
  | 'scroll'
  | 'press'
  | 'wait'
  | 'waitForText'
  | 'waitForElement'
  | 'switchIframe'
  | 'exitIframe'
  | 'switchWindow'
  | 'acceptAlert'
  | 'dismissAlert'
  | 'upload'
  | 'screenshot'
  | 'verify';

export interface ParsedAction {
  type: ActionType;
  target?: string;          // Human-readable element description
  value?: string;           // Value to type/select
  selector?: string;        // CSS selector hint
  xpath?: string;           // XPath hint
  role?: string;            // Accessibility role
  name?: string;            // Accessibility name
  url?: string;             // For navigate
  key?: string;             // For press
  expected?: string;        // For verify
  confidence: number;       // 0–100
  reasoning: string;
}

export interface StepResult {
  passed: boolean;
  screenshot?: string;
  logs: string[];
  error?: string;
  duration: number;
  domSnapshot?: Partial<SemanticDOM>;
  actionTaken?: string;
  selectorUsed?: string;
  retryCount: number;
}

export interface ExecutionStep {
  id: string;
  stepNumber: number;
  rawAction: string;        // Original text from test case
  rawExpected: string;
  parsedAction?: ParsedAction;
  status: StepStatus;
  result?: StepResult;
  retries: number;
  maxRetries: number;
  startedAt?: Date;
  completedAt?: Date;
}

// ─── Planner Types ────────────────────────────────────────────────────────────

export interface PlannerInput {
  goal?: string;
  rawSteps: { step: string; expected: string }[];
  targetUrl: string;
  appContext?: string;
  testData?: Record<string, string>;
  domSnapshot?: Partial<SemanticDOM>;
}

export interface PlannerOutput {
  steps: ExecutionStep[];
  strategy: string;
  warnings: string[];
  estimatedDuration: number;
}

// ─── Memory Types ─────────────────────────────────────────────────────────────

export interface SelectorMemory {
  description: string;     // e.g. "Login button"
  url: string;
  selectors: string[];     // Ordered by success rate
  successRate: number;
  hits: number;
  lastSeen: Date;
}

export interface PageStateMemory {
  url: string;
  title: string;
  snapshot: Partial<SemanticDOM>;
  timestamp: Date;
}

export interface WorkflowMemory {
  sessionId: string;
  url: string;
  completedSteps: number[];
  failedSteps: { stepNumber: number; error: string }[];
  selectors: Record<string, string>;  // stepId → successful selector
  timestamp: Date;
}

// ─── Validation Types ─────────────────────────────────────────────────────────

export type VerificationType =
  | 'url_contains'
  | 'url_equals'
  | 'text_visible'
  | 'text_contains'
  | 'element_visible'
  | 'element_enabled'
  | 'element_selected'
  | 'value_equals'
  | 'title_contains'
  | 'alert_present'
  | 'page_changed'
  | 'element_count';

export interface ValidationSpec {
  type: VerificationType;
  target?: string;
  expectedValue?: string;
  selector?: string;
  description: string;
}

export interface ValidationResult {
  passed: boolean;
  spec: ValidationSpec;
  actual?: string;
  screenshot?: string;
  error?: string;
}

// ─── Agent Message Bus ────────────────────────────────────────────────────────

export interface AgentMessage {
  id: string;
  from: AgentRole;
  to: AgentRole | 'broadcast';
  type: string;
  payload: any;
  timestamp: Date;
  correlationId?: string;
  sessionId?: string;
}

// ─── Workflow Context ─────────────────────────────────────────────────────────

export interface WorkflowContext {
  sessionId: string;
  executionId?: string;
  testCaseId?: string;
  testCaseTitle: string;
  targetUrl: string;
  steps: ExecutionStep[];
  currentStepIndex: number;
  status: WorkflowStatus;
  startTime: Date;
  endTime?: Date;
  testData: Map<string, string>;
  logs: string[];
  screenshots: { stepIndex: number; screenshot: string; label: string }[];
  lastDOMSnapshot?: SemanticDOM;
  passedSteps: number;
  failedSteps: number;
  healingAttempts: number;
}

// ─── Orchestrator Events ──────────────────────────────────────────────────────

export interface OrchestratorEvent {
  sessionId: string;
  type:
    | 'session_started'
    | 'planning_complete'
    | 'step_started'
    | 'step_complete'
    | 'step_failed'
    | 'dom_captured'
    | 'healing_started'
    | 'healing_complete'
    | 'session_complete'
    | 'session_failed'
    | 'agent_log';
  data: any;
  timestamp: Date;
}

// ─── Session / API ────────────────────────────────────────────────────────────

export interface MultiAgentSessionRequest {
  targetUrl: string;
  testCaseId?: string;
  testCaseTitle?: string;
  steps: { step: string; expected: string }[];
  testData?: Record<string, string>;
  maxRetries?: number;
  captureScreenshots?: boolean;
  headless?: boolean;
}

export interface MultiAgentSessionResponse {
  sessionId: string;
  status: WorkflowStatus;
  steps: ExecutionStep[];
  passedSteps: number;
  failedSteps: number;
  totalSteps: number;
  duration: number;
  logs: string[];
  screenshots: { stepIndex: number; screenshot: string; label: string }[];
  domSnapshot?: Partial<SemanticDOM>;
  error?: string;
}
