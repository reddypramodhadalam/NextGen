/**
 * Universal Test-Case Normalizer
 * ─────────────────────────────────────────────────────────────────────────────
 * LLMs are inconsistent about field names. One run returns `title`, the next
 * returns `testCaseName`; one returns `steps`, the next `testSteps`; a step's
 * text might be under `step`, `action`, `description`, `actionDescription`, or
 * `instruction`, and its expectation under `expected`, `expectedResult`,
 * `expectedOutcome`, or `result`.
 *
 * When the raw AI JSON was passed straight through to the UI, any unrecognised
 * field name surfaced as `undefined` — producing the infamous
 *   "Test Case 1 … Execute undefined"
 * rows.
 *
 * This module maps EVERY common variant onto one canonical shape so the client
 * always receives clean, executable data — no matter how the model phrased it.
 *
 * It is intentionally defensive: it never throws, always returns a non-empty
 * step list, and synthesises sensible text when a field is genuinely missing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface NormalizedStep {
  step: string;
  expected: string;
  /** Preserved automation hints when the model supplied them. */
  testData?: string | null;
  elementLocator?: string | null;
  waitTime?: number;
}

export interface NormalizedTestCase {
  testCaseId: string;
  title: string;
  description: string;
  preconditions: string;
  steps: NormalizedStep[];
  priority: "critical" | "high" | "medium" | "low";
  testType: string;
  confidenceScore: number;
  riskLevel: "high" | "medium" | "low";
  automationSuitable: boolean;
  reasoning: string;
  /** Any extra fields (jdeMetadata, tablesToValidate, …) are preserved as-is. */
  [key: string]: any;
}

/** Pick the first non-empty string value among a list of candidate keys. */
function pick(obj: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

/** Pick the first array value among candidate keys. */
function pickArray(obj: any, keys: string[]): any[] | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (Array.isArray(v) && v.length > 0) return v;
  }
  return undefined;
}

/** Join a value that may be a string, an array, or undefined into a clean string. */
function joinMaybe(value: any, sep = "; "): string {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : v?.description || v?.text || JSON.stringify(v)))
      .filter(Boolean)
      .join(sep);
  }
  if (typeof value === "string") return value.trim();
  return "";
}

const PRIORITY_MAP: Record<string, NormalizedTestCase["priority"]> = {
  critical: "critical",
  crit: "critical",
  p0: "critical",
  high: "high",
  p1: "high",
  major: "high",
  medium: "medium",
  med: "medium",
  normal: "medium",
  p2: "medium",
  low: "low",
  minor: "low",
  p3: "low",
};

function normalizePriority(raw: any): NormalizedTestCase["priority"] {
  const key = String(raw || "").trim().toLowerCase();
  return PRIORITY_MAP[key] || "medium";
}

/**
 * Normalize a single step object (or bare string) into { step, expected }.
 * Handles JDE-style steps too: { action, jdeAction, fieldId, value, expected }.
 */
function normalizeStep(raw: any, index: number): NormalizedStep | null {
  // Bare string step
  if (typeof raw === "string") {
    const text = raw.trim();
    return text ? { step: text, expected: "Step completes successfully" } : null;
  }
  if (!raw || typeof raw !== "object") return null;

  // ── Build the action text from every known variant ───────────────────────
  let stepText =
    pick(raw, [
      "step",
      "action",
      "actionDescription",
      "instruction",
      "stepDescription",
      "description",
      "detail",
      "text",
      "name",
    ]) || "";

  // JDE enrichment: append field id / value / jde action when present and not
  // already part of the text.
  const fieldId = pick(raw, ["fieldId", "field", "field_id"]);
  const value = pick(raw, ["value", "testData", "data", "inputData", "input"]);
  const jdeAction = pick(raw, ["jdeAction", "jde_action"]);

  if (fieldId && !stepText.includes(fieldId)) stepText += ` [${fieldId}]`;
  if (value && !stepText.includes(value)) stepText += `: ${value}`;
  if (jdeAction && jdeAction !== stepText && !stepText.includes(jdeAction)) {
    stepText += ` (${jdeAction})`;
  }

  // Last resort so we NEVER emit "undefined".
  if (!stepText.trim()) {
    const num = raw.stepNumber || raw.step_number || index + 1;
    stepText = `Step ${num}`;
  }

  const expected =
    pick(raw, [
      "expected",
      "expectedResult",
      "expected_result",
      "expectedOutcome",
      "expected_outcome",
      "result",
      "validation",
      "assertion",
      "verify",
    ]) || "Step completes successfully";

  const out: NormalizedStep = { step: stepText.trim(), expected };

  // Preserve automation hints when present.
  const locator = pick(raw, ["elementLocator", "locator", "selector", "xpath"]);
  if (locator) out.elementLocator = locator;
  if (value) out.testData = value;
  const wait = raw.waitTime ?? raw.wait ?? raw.wait_time;
  if (typeof wait === "number") out.waitTime = wait;

  return out;
}

/**
 * Normalize a single raw test case (whatever shape the model used) into the
 * canonical {@link NormalizedTestCase}.
 */
export function normalizeTestCase(raw: any, index: number): NormalizedTestCase {
  const safe = raw && typeof raw === "object" ? raw : {};

  const testCaseId =
    pick(safe, ["testCaseId", "test_case_id", "id", "tcId", "tc_id", "caseId"]) ||
    `TC_${String(index + 1).padStart(3, "0")}`;

  const title =
    pick(safe, [
      "title",
      "testCaseName",
      "test_case_name",
      "name",
      "testCaseTitle",
      "scenario",
      "scenarioName",
      "summary",
    ]) || `Test Case ${index + 1}`;

  // Description: prefer explicit description, then objective/goal/purpose.
  let description =
    pick(safe, [
      "description",
      "objective",
      "goal",
      "purpose",
      "desc",
      "intent",
      "overview",
    ]) || "";

  // Fold any expectedResults array into the description for visibility.
  const expectedResults = safe.expectedResults || safe.expected_results;
  if (expectedResults) {
    const txt = joinMaybe(expectedResults);
    if (txt) description += (description ? "\n\n" : "") + `Expected Results:\n${txt}`;
  }

  const preconditions = joinMaybe(
    safe.preconditions ?? safe.precondition ?? safe.prerequisites ?? safe.setup
  );

  // ── Steps: find the array under any known key, normalize each entry ───────
  const rawSteps =
    pickArray(safe, ["steps", "testSteps", "test_steps", "stepList", "steps_list", "actions"]) ||
    [];
  let steps = rawSteps
    .map((s: any, i: number) => normalizeStep(s, i))
    .filter((s): s is NormalizedStep => s !== null);

  // NEVER return an empty step list — synthesise one from the description/title.
  if (steps.length === 0) {
    steps = [
      {
        step: description ? `Execute: ${description.split("\n")[0]}` : `Execute "${title}"`,
        expected: "Test case completes successfully",
      },
    ];
  }

  const testType = (
    pick(safe, ["testType", "test_type", "type", "category", "testCategory"]) || "functional"
  )
    .toString()
    .toLowerCase();

  const confidenceRaw = safe.confidenceScore ?? safe.confidence ?? safe.confidence_score;
  const confidenceScore =
    typeof confidenceRaw === "number"
      ? confidenceRaw
      : typeof confidenceRaw === "string" && confidenceRaw.trim()
        ? parseInt(confidenceRaw, 10) || 85
        : 85;

  const priority = normalizePriority(safe.priority ?? safe.severity);

  const riskLevel =
    pick(safe, ["riskLevel", "risk_level", "risk"])?.toLowerCase() ||
    (priority === "critical" ? "high" : priority === "high" ? "medium" : "low");

  const automationSuitable =
    typeof safe.automationSuitable === "boolean"
      ? safe.automationSuitable
      : testType === "functional" || testType === "smoke" || testType === "regression";

  const reasoning = pick(safe, ["reasoning", "rationale", "businessRule", "why", "notes"]) || "";

  // Preserve any extra metadata the generators attach (jdeMetadata, etc.) while
  // guaranteeing the canonical fields win.
  return {
    ...safe,
    testCaseId,
    title,
    description,
    preconditions,
    steps,
    priority,
    testType,
    confidenceScore,
    riskLevel: riskLevel as NormalizedTestCase["riskLevel"],
    automationSuitable,
    reasoning,
  };
}

/**
 * Normalize an array of raw test cases. Safe against null/non-array input.
 */
export function normalizeTestCases(rawCases: any): NormalizedTestCase[] {
  if (!Array.isArray(rawCases)) return [];
  return rawCases.map((tc, i) => normalizeTestCase(tc, i));
}
