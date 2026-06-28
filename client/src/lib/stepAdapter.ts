/**
 * Step Adapter
 * ---------------------------------------------------------------------------
 * The database persists test-case steps in the lightweight, execution-ready
 * shape `{ step: string; expected: string }` (see `shared/schema.ts`).
 *
 * The rich Step Editor UI (`StepEditor` / `useStepManagement`) works with a
 * structured shape `{ stepId, action, target, value, expected, description }`
 * so it can show the detected ACTION, TARGET and VALUE for every step.
 *
 * Historically there was NO conversion layer between the two, so every step
 * loaded into the editor had `action`/`target`/`value` === undefined and the
 * UI rendered "UNKNOWN" / "—" for all of them. This module is that missing
 * bridge: it deterministically parses the human-readable step text into the
 * structured editor shape (mirroring the server's `classifyActionType` +
 * `extractTargetValue`) and converts it back for persistence.
 *
 * Design principles:
 *  - The human-readable `step` text remains the single source of truth for
 *    execution (the AI step-interpreter reads it). We never lose it.
 *  - `action` / `target` / `value` are DERIVED hints kept in sync with the
 *    text so the collapsed step card and the editor chips always agree.
 * ---------------------------------------------------------------------------
 */

import type { TestStep as EditorStep } from "@/components/StepEditor";

/** The shape persisted in the database (`testCases.steps`). */
export interface StorageStep {
  step: string;
  expected: string;
}

/**
 * Canonical editor actions. These MUST stay aligned with `ALLOWED_ACTIONS`
 * in `StepEditor.tsx` so the parsed action is always selectable in the
 * action dropdown.
 */
export const EDITOR_ACTIONS = [
  "navigate",
  "click",
  "enter",
  "fillInput",
  "select",
  "verify",
  "wait",
  "scroll",
  "hover",
  "screenshot",
  "switchWindow",
  "acceptAlert",
  "fillForm",
  "logout",
] as const;

export type EditorAction = (typeof EDITOR_ACTIONS)[number];

/**
 * Ordered keyword → action map. Longer / more specific phrases come first so
 * "double click" wins over "click", "log out" over "out", etc. Mirrors the
 * server-side ACTION_KEYWORD_MAP but normalised to the editor's action set.
 */
const ACTION_KEYWORDS: Array<[RegExp, EditorAction]> = [
  // Logout (check before generic click/navigate)
  [/\b(log\s?out|sign\s?out)\b/i, "logout"],
  // Navigation
  [/\b(navigate|go to|goto|visit|launch|open the url|load the page)\b/i, "navigate"],
  // Window / tab switching
  [/\b(switch to|switch window|new tab|new window|switch back)\b/i, "switchWindow"],
  // Alerts / dialogs
  [/\b(accept (the )?(alert|dialog|popup)|dismiss (the )?(alert|dialog|popup)|confirm dialog)\b/i, "acceptAlert"],
  // Screenshot / capture
  [/\b(screenshot|capture (the )?screen|take a picture)\b/i, "screenshot"],
  // Selection (dropdowns)
  [/\b(select|choose|pick|dropdown)\b/i, "select"],
  // Input
  [/\b(enter|input|type|fill in|fill|set the|write)\b/i, "enter"],
  // Hover
  [/\b(hover|mouse over)\b/i, "hover"],
  // Scroll
  [/\b(scroll)\b/i, "scroll"],
  // Wait
  [/\b(wait|pause|delay|sleep)\b/i, "wait"],
  // Verify / assert (before click so "verify button" isn't a click)
  [/\b(verify|validate|assert|confirm that|ensure|should|expect|check that)\b/i, "verify"],
  // Click (broadest interactive verb, kept late)
  [/\b(click|press|tap|double click|right click|push the button)\b/i, "click"],
];

/**
 * Detect the editor action for a piece of step text. Always returns a valid
 * editor action (defaults to "verify", matching the server's safe fallback),
 * so the UI never shows "UNKNOWN".
 */
export function detectAction(text: string | undefined | null): EditorAction {
  if (!text || typeof text !== "string") return "verify";
  const normalized = text.toLowerCase().trim();
  for (const [pattern, action] of ACTION_KEYWORDS) {
    if (pattern.test(normalized)) return action;
  }
  return "verify";
}

/**
 * Known action words that may appear as a leading "VERB:" / "VERB =" prefix in
 * importer-formatted steps (e.g. "INPUT: Full Name = Raghave"). Used to safely
 * strip that prefix before parsing the target/value so the editor shows clean
 * TARGET and VALUE chips instead of "Field = Value" lumped into the target.
 */
const ACTION_PREFIX_WORDS = new Set([
  "navigate", "goto", "go to", "open", "visit", "launch",
  "click", "press", "tap", "double click", "doubleclick", "right click", "rightclick",
  "input", "enter", "type", "fill", "fillinput", "fill in", "set", "write",
  "select", "choose", "pick", "dropdown",
  "verify", "validate", "assert", "check", "confirm", "ensure",
  "wait", "pause", "delay", "sleep",
  "hover", "scroll", "screenshot", "capture",
  "login", "logout", "switch", "accept", "dismiss",
]);

function isActionPrefixWord(word: string): boolean {
  return ACTION_PREFIX_WORDS.has(word.toLowerCase().trim());
}

/** Remove surrounding straight/smart quotes (and stray edge quotes) + trim. */
function stripQuotes(s: string): string {
  return s
    .trim()
    .replace(/^[\s'"\u2018\u2019\u201C\u201D]+/, "")
    .replace(/[\s'"\u2018\u2019\u201C\u201D]+$/, "")
    .trim();
}

/** Normalise a target/value label: strip quotes, collapse whitespace. */
function cleanLabel(s: string): string {
  return stripQuotes(s).replace(/\s+/g, " ").trim();
}

// Multiword + single action verbs, longest first, for natural-language stripping.
const ACTION_PREFIX_REGEX =
  /^\s*(navigate to|go to|switch to|fill in|log\s?out|sign\s?out|double click|right click|click on|goto|navigate|open|visit|launch|click|press|tap|input|enter|type|fillinput|fill|set|write|select|choose|pick|verify|validate|assert|check|confirm|ensure|wait|pause|delay|sleep|hover|scroll|screenshot|capture|login|logout|switch|accept|dismiss)\b\s*[:=]?\s*(.*)$/i;

/**
 * Strip a leading action prefix from a step so the remaining text is just the
 * target/value payload. Handles both importer format ("INPUT: Full Name = X",
 * "CLICK = Submit") and natural language ("Enter X into Y", "Click the Z").
 * Only strips when the leading token is a known action verb, so genuine
 * "Field = Value" steps are left intact.
 */
function stripActionPrefix(clean: string): string {
  // Case A — importer "VERB: rest" / "VERB = rest" where VERB is a SINGLE
  // token (e.g. "INPUT:", "CLICK ="). Restricted to one word so URLs such as
  // "https://host" are never split on their scheme colon.
  const delim = clean.match(/^\s*([A-Za-z]+)\s*[:=]\s*(.+)$/);
  if (delim && isActionPrefixWord(delim[1])) {
    return delim[2].trim();
  }
  // Case B — natural language "VERB rest" (optionally "VERB: rest").
  const nl = clean.match(ACTION_PREFIX_REGEX);
  if (nl && nl[2] && nl[2].trim()) {
    return nl[2].trim();
  }
  return clean;
}

/**
 * Extract a best-effort `{ target, value }` pair from step text. Mirrors the
 * server's `extractTargetValue` patterns. Always returns a non-empty target
 * (falls back to the whole text) so step validation (which requires a target)
 * passes for parsed steps.
 */
export function extractTargetValue(text: string | undefined | null): {
  target: string;
  value: string;
} {
  if (!text || typeof text !== "string") return { target: "", value: "" };
  const clean = text.trim();

  // 0) Remove a leading action prefix + an optional "the"/"on" article so the
  //    body is just the payload (field/value/label).
  let body = stripActionPrefix(clean).replace(/^(?:on\s+|the\s+)+/i, "").trim();
  if (!body) body = clean;

  // 1) "Field = Value" — the importer's key/value separator (equals). Skip when
  //    the body is just a bare URL (no spaces, contains "://").
  let m = body.match(/^(.+?)\s*=\s*(.+)$/);
  if (m && !/^\S*:\/\//.test(body)) {
    return { target: cleanLabel(m[1]), value: stripQuotes(m[2]) };
  }

  // 2) "Value in/into Field" (e.g. 'Enter "John" into the First Name field',
  //    "123456 in the Pincode field"). Run before the quote pattern so the
  //    field (not the quoted value) becomes the target.
  m = body.match(/^['"\u2018\u2019\u201C\u201D]?(.+?)['"\u2018\u2019\u201C\u201D]?\s+(?:in|into)\s+(?:the\s+)?(.+)$/i);
  if (m) return { target: cleanLabel(m[2]), value: stripQuotes(m[1]) };

  // 3) "Value from Field" (dropdown selection).
  m = body.match(/^['"\u2018\u2019\u201C\u201D]?(.+?)['"\u2018\u2019\u201C\u201D]?\s+from\s+(?:the\s+)?(.+)$/i);
  if (m) return { target: cleanLabel(m[2]), value: stripQuotes(m[1]) };

  // 4) "Field : Value" — spaced colon only, so URLs like http:// stay intact.
  m = body.match(/^(.+?)\s+:\s+(.+)$/);
  if (m) return { target: cleanLabel(m[1]), value: stripQuotes(m[2]) };

  // 5) Leading quoted label → the quoted text (plus any trailing noun) is the
  //    target, e.g. '"I accept Terms" checkbox' or '"Submit" button'.
  m = body.match(/^['"\u2018\u2019\u201C\u201D]([^'"\u2018\u2019\u201C\u201D]+)['"\u2018\u2019\u201C\u201D]\s*(.*)$/);
  if (m) {
    return { target: cleanLabel(`${m[1]} ${m[2] || ""}`), value: "" };
  }

  // 6) "Wait N seconds" — only when the step is actually a wait.
  m = body.match(/^(?:for\s+)?(\d+)\s*(?:seconds?|secs?|ms|milliseconds?)?\b/i);
  if (/^\s*wait\b/i.test(clean) && m) {
    return { target: "timeout", value: m[1] };
  }

  // 7) Fallback: the remaining text is the target.
  return { target: cleanLabel(body) || clean, value: "" };
}

/**
 * Reconstruct a readable step instruction from structured fields. Used when a
 * brand-new step is created via the "Add Step" dialog (which collects action /
 * target / value) so the persisted `step` text stays human-readable and
 * execution-ready.
 */
export function reconstructStepText(
  action: string | undefined,
  target: string | undefined,
  value: string | undefined,
  fallback = ""
): string {
  const a = (action || "").toLowerCase();
  const t = (target || "").trim();
  const v = (value || "").trim();

  switch (a) {
    case "navigate":
      return `Navigate to ${v || t}`.trim();
    case "enter":
    case "fillInput":
      if (v && t) return `Enter "${v}" in ${t}`;
      if (t) return `Enter value in ${t}`;
      return fallback || "Enter value";
    case "select":
      if (v && t) return `Select ${v} from ${t}`;
      if (t) return `Select ${t}`;
      return fallback || "Select option";
    case "click":
      return t ? `Click ${t}` : fallback || "Click element";
    case "verify":
      return t ? `Verify ${t}` : fallback || "Verify result";
    case "hover":
      return t ? `Hover over ${t}` : fallback || "Hover";
    case "wait":
      return v ? `Wait for ${v} seconds` : t ? `Wait for ${t}` : fallback || "Wait";
    case "scroll":
      return t ? `Scroll to ${t}` : "Scroll the page";
    case "screenshot":
      return t ? `Capture screenshot of ${t}` : "Capture screenshot";
    case "switchwindow":
      return t ? `Switch to ${t}` : "Switch to new window";
    case "acceptalert":
      return "Accept the alert/dialog";
    case "logout":
      return "Log out of the application";
    case "fillform":
      return t ? `Fill the ${t} form` : "Fill the form";
    default:
      // Generic: "<Action> <target> <value>"
      return [action, t, v].filter(Boolean).join(" ").trim() || fallback;
  }
}

/**
 * Convert a single persisted step `{ step, expected }` into the rich editor
 * shape, parsing the action / target / value from the human-readable text.
 */
export function toEditorStep(raw: any, index: number): EditorStep {
  // Tolerate already-structured steps, bare strings, and legacy shapes.
  const stepText: string =
    (typeof raw === "string" ? raw : raw?.step ?? raw?.description ?? raw?.action ?? "") || "";
  const expected: string =
    (typeof raw === "string" ? "" : raw?.expected ?? raw?.expectedResult ?? "") ||
    "Step completes successfully";

  // Prefer any explicitly-stored structured hints, else parse from text.
  const parsedAction = detectAction(stepText);
  const parsed = extractTargetValue(stepText);

  const action = (raw && typeof raw === "object" && raw.action && raw.action !== "unknown")
    ? String(raw.action)
    : parsedAction;
  const target = (raw && typeof raw === "object" && raw.target) ? String(raw.target) : parsed.target;
  const value = (raw && typeof raw === "object" && raw.value != null) ? String(raw.value) : parsed.value;

  return {
    stepId: index + 1,
    action,
    target,
    value,
    expected,
    description: stepText, // human-readable instruction (source of truth)
    timeoutMs: (raw && typeof raw === "object" && raw.timeoutMs) || undefined,
    waitEnabled: (raw && typeof raw === "object" && raw.waitEnabled) || false,
    retries: (raw && typeof raw === "object" && raw.retries) || 1,
  };
}

/** Convert a list of persisted steps into editor steps. */
export function toEditorSteps(rawSteps: any): EditorStep[] {
  if (!Array.isArray(rawSteps)) return [];
  return rawSteps.map((s, i) => toEditorStep(s, i));
}

/**
 * Convert a single editor step back to the persisted `{ step, expected }`
 * shape. The `description` (instruction) is the canonical text; if it is
 * missing we reconstruct it from the structured fields so nothing is lost.
 */
export function toStorageStep(step: Partial<EditorStep>): StorageStep {
  const instruction =
    (step.description && step.description.trim()) ||
    reconstructStepText(step.action, step.target, step.value, "");
  return {
    step: instruction || "Step",
    expected: (step.expected && String(step.expected).trim()) || "Step completes successfully",
  };
}

/** Convert a list of editor steps back to persisted steps. */
export function toStorageSteps(steps: Array<Partial<EditorStep>>): StorageStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.map(toStorageStep);
}
