// ============================================================================
// KNOWLEDGE-DRIVEN TEST GENERATOR
// ----------------------------------------------------------------------------
// Builds DETAILED, FUNCTIONAL test cases (narrative "step + expected" pairs)
// directly from the structured knowledge ingested into the Knowledge Base —
// business process flows, fields, validations, prerequisites and test points.
//
// This is the deterministic safety-net used by /api/generate-tests when the AI
// path is unavailable or its JSON could not be salvaged. Unlike the generic
// rule-based generator (which emits `https://your-app.com` + `input[aria-label]`
// boilerplate), every step here is grounded in the uploaded document, so the
// output reads like a real work-instruction-derived test case:
//
//   Step:     Navigate to Contract Management and click "Create Contract"
//   Expected: The Create Contract form opens with all mandatory fields visible
//
// ============================================================================

export interface KnowledgeFacts {
  description?: string;
  businessProcess?: string[];
  relatedObjects?: string[];
  tables?: string[];
  fields?: Array<{ name: string; description?: string; dataType?: string }>;
  configurations?: string[];
  prerequisites?: string[];
  integrations?: string[];
  validations?: string[];
  testableActions?: string[];
  testPoints?: string[];
  uiElements?: Array<{ type: string; text: string }>;
}

export interface KnowledgeItem {
  application: string;
  module: string;
  objectName: string;
  knowledgeType: string;
  score: number;
  facts: KnowledgeFacts;
}

interface NarrativeStep {
  step: string;
  expected: string;
}

interface GeneratedCase {
  testCaseId: string;
  title: string;
  description: string;
  preconditions: string;
  steps: NarrativeStep[];
  priority: string;
  testType: string;
  reasoning: string;
  confidenceScore: number;
  knowledgeRefs: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generic ingestion placeholders that should not surface verbatim in steps. */
const GENERIC_APP_VALUES = new Set([
  "CUSTOM", "GENERAL", "GENERAL_PROCESS", "GENERAL_FUNCTIONAL", "GENERAL_OTHER",
  "UNKNOWN", "OTHER", "",
]);
const GENERIC_MODULE_VALUES = new Set([
  "GENERAL", "FUNCTIONAL", "PROCESS", "OTHER", "UNCATEGORIZED", "UNKNOWN", "",
]);

/**
 * Resolve a human-friendly application label: prefer the user-supplied app name,
 * fall back to the knowledge value, and suppress generic ingestion placeholders
 * (e.g. "CUSTOM") so steps read "Log in to the application" not "Log in to CUSTOM".
 */
function appLabel(item: KnowledgeItem, override?: string): string {
  if (override && override.trim()) return override.trim();
  const v = (item.application || "").trim();
  if (!v || GENERIC_APP_VALUES.has(v.toUpperCase())) return "the application";
  return v;
}

/**
 * Resolve a human-friendly module label. Suppresses generic placeholders like
 * "FUNCTIONAL" / "General" by falling back to the object name or a neutral noun.
 */
function moduleLabel(item: KnowledgeItem, override?: string): string {
  if (override && override.trim()) return override.trim();
  const v = (item.module || "").trim();
  if (!v || GENERIC_MODULE_VALUES.has(v.toUpperCase())) {
    const obj = humanize(item.objectName);
    return obj && obj !== "The Feature" ? obj : "the relevant";
  }
  return v;
}

function humanize(objectName: string): string {
  if (!objectName) return "the feature";
  return objectName
    .replace(/_/g, " ")
    .replace(/\b([A-Z]{2,})\b/g, (m) => m) // keep acronyms
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function fieldNames(facts: KnowledgeFacts, max = 12): string[] {
  return (facts.fields || [])
    .map((f) => (typeof f === "string" ? f : f?.name))
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .slice(0, max);
}

/** Build precondition text from prerequisites + prior knowledge. */
function buildPreconditions(facts: KnowledgeFacts): string {
  const pre = (facts.prerequisites || []).filter(Boolean);
  if (pre.length > 0) return pre.join("; ");
  return "User is authenticated and has the required role/permissions for this module";
}

// ── Per-test-type step builders ───────────────────────────────────────────────

/** Resolved, display-ready labels passed to every step builder. */
interface LabelCtx {
  app: string;
  module: string;
}

/**
 * FUNCTIONAL — walks the documented business process end to end, enters every
 * known field, then asserts each documented validation/test point.
 */
function buildFunctionalSteps(item: KnowledgeItem, lc: LabelCtx): NarrativeStep[] {
  const f = item.facts;
  const obj = humanize(item.objectName);
  const steps: NarrativeStep[] = [];

  steps.push({
    step: `Log in to ${lc.app} and open the ${lc.module} module`,
    expected: `The ${lc.module} module loads successfully and the user has access to ${obj}`,
  });

  const process = (f.businessProcess || []).filter(Boolean);
  if (process.length > 0) {
    for (const p of process) {
      steps.push({
        step: p,
        expected: `"${p}" completes successfully with no error, and the system advances to the next stage of the ${obj} flow`,
      });
    }
  } else {
    steps.push({
      step: `Initiate the ${obj} process`,
      expected: `The ${obj} screen opens with all mandatory fields and actions available`,
    });
  }

  const names = fieldNames(f);
  if (names.length > 0) {
    for (const name of names) {
      steps.push({
        step: `Enter a valid value for "${name}"`,
        expected: `"${name}" accepts the value and no validation error is shown`,
      });
    }
  }

  for (const v of (f.validations || []).filter(Boolean).slice(0, 8)) {
    steps.push({
      step: `Verify the business rule: ${v}`,
      expected: `The system enforces "${v}" as documented`,
    });
  }

  const actions = (f.testableActions || []).filter(Boolean);
  if (actions.length > 0) {
    steps.push({
      step: `Submit the ${obj} by performing: ${actions.join(", ")}`,
      expected: `The ${obj} is saved/processed successfully and a confirmation is displayed`,
    });
  } else {
    steps.push({
      step: `Save / submit the ${obj}`,
      expected: `The record is persisted and a success confirmation is displayed to the user`,
    });
  }

  if (f.relatedObjects?.length) {
    steps.push({
      step: `Confirm downstream impact on related objects: ${f.relatedObjects.join(", ")}`,
      expected: `Related records (${f.relatedObjects.join(", ")}) reflect the change consistently`,
    });
  }
  if (f.tables?.length) {
    steps.push({
      step: `Confirm the data is committed to the underlying tables: ${f.tables.join(", ")}`,
      expected: `The new/updated record is present in ${f.tables.join(", ")} with the correct values`,
    });
  }

  return steps;
}

/**
 * NEGATIVE — submit with each mandatory field missing and violate each
 * documented validation rule.
 */
function buildNegativeSteps(item: KnowledgeItem, lc: LabelCtx): NarrativeStep[] {
  const f = item.facts;
  const obj = humanize(item.objectName);
  const steps: NarrativeStep[] = [];

  steps.push({
    step: `Open the ${obj} screen in the ${lc.module} module`,
    expected: `The ${obj} form is displayed with empty/default fields`,
  });

  const names = fieldNames(f, 6);
  if (names.length > 0) {
    for (const name of names) {
      steps.push({
        step: `Leave "${name}" blank (or enter an invalid value) and attempt to submit`,
        expected: `Submission is blocked and a clear validation message is shown for "${name}"`,
      });
    }
  } else {
    steps.push({
      step: `Submit the ${obj} with mandatory fields left blank`,
      expected: `The system blocks submission and lists every missing mandatory field`,
    });
  }

  for (const v of (f.validations || []).filter(Boolean).slice(0, 6)) {
    steps.push({
      step: `Attempt to violate the rule "${v}"`,
      expected: `The system rejects the action and surfaces a meaningful error for "${v}"`,
    });
  }

  steps.push({
    step: `Confirm no partial/invalid ${obj} record was created`,
    expected: `No record is persisted; data integrity is preserved after the failed attempts`,
  });

  return steps;
}

/**
 * BOUNDARY — exercise min/max/edge values on documented fields.
 */
function buildBoundarySteps(item: KnowledgeItem, _lc: LabelCtx): NarrativeStep[] {
  const f = item.facts;
  const obj = humanize(item.objectName);
  const steps: NarrativeStep[] = [];

  steps.push({
    step: `Open the ${obj} screen for boundary-value testing`,
    expected: `The ${obj} form is ready for input`,
  });

  const names = fieldNames(f, 8);
  if (names.length > 0) {
    for (const name of names) {
      steps.push({
        step: `Enter minimum, maximum and just-out-of-range values for "${name}"`,
        expected: `In-range values for "${name}" are accepted; out-of-range values are rejected with a boundary validation message`,
      });
    }
  } else {
    steps.push({
      step: `Apply minimum, maximum and out-of-range values across all numeric/length-limited fields`,
      expected: `Boundary values are handled per spec — accepted at the limits and rejected beyond them`,
    });
  }

  steps.push({
    step: `Submit the ${obj} using exact-limit values`,
    expected: `The ${obj} is accepted at the documented boundaries without truncation or overflow`,
  });

  return steps;
}

/**
 * SMOKE — quick reachability + happy-path of the documented core action.
 */
function buildSmokeSteps(item: KnowledgeItem, lc: LabelCtx): NarrativeStep[] {
  const f = item.facts;
  const obj = humanize(item.objectName);
  const action = (f.testableActions || [])[0] || `create a ${obj}`;
  return [
    {
      step: `Open the ${lc.module} module`,
      expected: `The ${lc.module} module loads without errors`,
    },
    {
      step: `Navigate to the ${obj} screen`,
      expected: `The ${obj} screen is reachable and renders its primary fields and actions`,
    },
    {
      step: `Perform the core action: ${action}`,
      expected: `The core ${obj} action completes successfully on the happy path`,
    },
  ];
}

/**
 * E2E — chain the full documented business process plus downstream checks.
 */
function buildE2ESteps(item: KnowledgeItem, _lc: LabelCtx): NarrativeStep[] {
  const f = item.facts;
  const obj = humanize(item.objectName);
  const steps: NarrativeStep[] = [];

  for (const pre of (f.prerequisites || []).filter(Boolean)) {
    steps.push({
      step: `Ensure prerequisite is met: ${pre}`,
      expected: `Prerequisite "${pre}" is satisfied before starting the ${obj} flow`,
    });
  }

  const process = (f.businessProcess || []).filter(Boolean);
  const flow = process.length ? process : [`Execute the ${obj} process end to end`];
  for (const p of flow) {
    steps.push({
      step: p,
      expected: `"${p}" succeeds and the end-to-end ${obj} journey continues without manual workarounds`,
    });
  }

  for (const integ of (f.integrations || []).filter(Boolean)) {
    steps.push({
      step: `Verify integration hand-off: ${integ}`,
      expected: `Data flows correctly across the "${integ}" integration boundary`,
    });
  }

  steps.push({
    step: `Validate the final state of the ${obj} and all related records`,
    expected: `The complete ${obj} transaction is reflected consistently across UI, related objects and persistence`,
  });

  return steps;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface KnowledgeGenOptions {
  title: string;
  description?: string;
  /** Test depth label drives roughly how many cases to emit. */
  targetCount?: number;
  /** Limit which test types to emit (smoke/negative/boundary/etc). */
  testTypes?: string[];
  includeE2E?: boolean;
  /** Optional human-friendly overrides from Architect Context. */
  appName?: string;
  moduleName?: string;
}

/**
 * True when there is enough structured knowledge to build grounded test cases.
 */
export function hasUsableKnowledge(items: KnowledgeItem[]): boolean {
  if (!items || items.length === 0) return false;
  return items.some((it) => {
    const f = it.facts || {};
    return (
      (f.businessProcess && f.businessProcess.length > 0) ||
      (f.fields && f.fields.length > 0) ||
      (f.validations && f.validations.length > 0) ||
      (f.testPoints && f.testPoints.length > 0) ||
      (f.testableActions && f.testableActions.length > 0) ||
      (f.description && f.description.length > 30)
    );
  });
}

/**
 * Generate detailed functional test cases from retrieved structured knowledge.
 */
export function generateKnowledgeDrivenTests(
  knowledge: KnowledgeItem[],
  opts: KnowledgeGenOptions
): { testCases: any[]; generatedBy: string; coverageSummary: any } {
  // Strongest knowledge first.
  const items = [...knowledge]
    .filter((k) => k && k.facts)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  const targetCount = opts.targetCount ?? 25;
  const requestedTypes =
    opts.testTypes && opts.testTypes.length > 0
      ? opts.testTypes.map((t) => t.toLowerCase())
      : ["functional", "negative", "boundary", "smoke"];

  const builders: Record<string, (it: KnowledgeItem, lc: LabelCtx) => NarrativeStep[]> = {
    functional: buildFunctionalSteps,
    negative: buildNegativeSteps,
    boundary: buildBoundarySteps,
    smoke: buildSmokeSteps,
    e2e: buildE2ESteps,
  };

  // Plan the type sequence: every item gets a functional case first, then we
  // round-robin the remaining requested types until we reach the target count.
  const types = requestedTypes.filter((t) => builders[t]);
  if (opts.includeE2E && !types.includes("e2e")) types.push("e2e");
  if (!types.includes("functional")) types.unshift("functional");

  const cases: GeneratedCase[] = [];
  let caseNum = 0;

  outer: for (const type of types) {
    for (const item of items) {
      const builder = builders[type] || buildFunctionalSteps;
      const lc: LabelCtx = {
        app: appLabel(item, opts.appName),
        module: moduleLabel(item, opts.moduleName),
      };
      const steps = builder(item, lc);
      if (!steps || steps.length === 0) continue;

      caseNum++;
      const obj = humanize(item.objectName);
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      const priority =
        type === "functional" || type === "e2e"
          ? "high"
          : type === "smoke"
          ? "medium"
          : "high";

      cases.push({
        testCaseId: `TC-${caseNum}`,
        title: `${obj} - ${typeLabel} (TC-${String(caseNum).padStart(3, "0")})`,
        description:
          item.facts.description ||
          `${typeLabel} test for ${obj} derived from ${item.application}/${item.module} knowledge`,
        preconditions: buildPreconditions(item.facts),
        steps,
        priority,
        testType: type === "e2e" ? "e2e" : type,
        reasoning: `Grounded in uploaded knowledge "${item.objectName}" (${item.application}/${item.module}); validates the documented ${type} behaviour with real business flow and expected results.`,
        confidenceScore: Math.min(95, 80 + Math.round((item.score || 0) * 10)),
        knowledgeRefs: [item.objectName],
      });

      if (cases.length >= targetCount) break outer;
    }
  }

  const coverageSummary = buildCoverageSummary(cases);
  return { testCases: cases, generatedBy: "knowledge-rule-based", coverageSummary };
}

function buildCoverageSummary(testCases: GeneratedCase[]): any {
  const byType: Record<string, number> = {
    functional: 0, negative: 0, boundary: 0, security: 0, smoke: 0,
    regression: 0, e2e: 0, integration: 0, accessibility: 0, performance: 0,
    api: 0, usability: 0,
  };
  const areas = new Set<string>();
  for (const tc of testCases) {
    const t = (tc.testType || "functional").toLowerCase();
    if (byType.hasOwnProperty(t)) byType[t]++;
    else byType["functional"]++;
    if (tc.knowledgeRefs?.[0]) areas.add(tc.knowledgeRefs[0]);
  }
  return {
    totalTestCases: testCases.length,
    byType,
    coverageAreas: Array.from(areas).slice(0, 12),
    gapAreas: [],
    source: "knowledge-base",
  };
}
