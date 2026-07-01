/**
 * ============================================================================
 * AITAS — JDE EnterpriseOne AI Object Repository (Foundation)
 * ============================================================================
 *
 * Implements the data model + core algorithms of the "AITAS Master Prompt for
 * JDE E1 Automation". This module is intentionally PURE (no DOM / no browser)
 * so it can be unit-tested and reused by BOTH:
 *   1. Script generation   (server/jde-locator-intelligence.ts)
 *   2. Live execution / self-healing (future: ai-test-executor JDE path)
 *
 * Phases implemented here:
 *   • Phase 5  — Locator candidate priority
 *   • Phase 6  — Anchor types
 *   • Phase 7  — Multi-anchor validation scoring
 *   • Phase 8  — Dynamic header → column resolution
 *   • Phase 12 — Self-heal confidence gate
 *   • Phase 13 — Safe locator-update policy
 *   • Phase 15 — AI Object Repository record shape
 *
 * Phases 1-4, 9-11, 14, 16 (live screen/frame/object discovery, lazy-load
 * scrolling, visual/OCR anchors, adaptive weight learning) require a live
 * browser harness and are layered on top of this foundation later.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// PHASE 5 — LOCATOR CANDIDATE PRIORITY
// Always prefer JDE metadata (DD item / control id) over brittle HTML ids.
// ----------------------------------------------------------------------------

export type LocatorStrategy =
  | "dd_item"
  | "control_id"
  | "name"
  | "aria_label"
  | "title"
  | "label_anchor"
  | "relative"
  | "visual_anchor"
  | "ocr"
  | "xpath";

/** Ordered best → last-resort. Index 0 is the most reliable. */
export const JDE_LOCATOR_PRIORITY: LocatorStrategy[] = [
  "dd_item",
  "control_id",
  "name",
  "aria_label",
  "title",
  "label_anchor",
  "relative",
  "visual_anchor",
  "ocr",
  "xpath",
];

export interface LocatorCandidate {
  strategy: LocatorStrategy;
  value: string;
  /** 0..1 — model/heuristic confidence in this candidate. */
  confidence: number;
}

/**
 * Sort locator candidates by (priority THEN confidence) so the executor always
 * tries the most stable strategy first. Never depend on a single locator.
 */
export function rankLocatorCandidates(candidates: LocatorCandidate[]): LocatorCandidate[] {
  return [...candidates].sort((a, b) => {
    const pa = JDE_LOCATOR_PRIORITY.indexOf(a.strategy);
    const pb = JDE_LOCATOR_PRIORITY.indexOf(b.strategy);
    if (pa !== pb) return pa - pb;
    return b.confidence - a.confidence;
  });
}

/**
 * Convert a single ranked candidate into a concrete CSS/XPath selector string
 * usable by Selenium / Playwright against the JDE HTML web client.
 */
export function candidateToSelector(c: LocatorCandidate): string {
  switch (c.strategy) {
    case "dd_item":
      // JDE data-dictionary item (e.g. AN8, DOCO) — matches id/name containing it.
      return `input[id*="${c.value}"], input[name*="${c.value}"], [data-fieldname="${c.value}"]`;
    case "control_id":
      return `[id$="_${c.value}"], [id*="${c.value}"]`;
    case "name":
      return `[name="${c.value}"]`;
    case "aria_label":
      return `[aria-label="${c.value}"]`;
    case "title":
      return `[title="${c.value}"]`;
    case "label_anchor":
      // Field that follows a visible label.
      return `//label[normalize-space()="${c.value}"]/following::input[1]`;
    case "relative":
    case "visual_anchor":
    case "ocr":
      // These require runtime context; emit a stable text anchor as a fallback.
      return `//*[contains(normalize-space(.),"${c.value}")]`;
    case "xpath":
    default:
      return c.value;
  }
}

// ----------------------------------------------------------------------------
// PHASE 6 — ANCHOR TYPES + PHASE 7 — MULTI-ANCHOR VALIDATION SCORING
// ----------------------------------------------------------------------------

export type AnchorType =
  | "application"
  | "form"
  | "frame"
  | "tab"
  | "section"
  | "label"
  | "control_type"
  | "grid_header"
  | "grid_row"
  | "neighbor"
  | "visual";

export interface Anchor {
  type: AnchorType;
  value: string;
}

/**
 * Phase 7 anchor weights. Application + Form + Frame are the strongest identity
 * signals for a JDE object; visual/neighbor are weakest.
 */
export const ANCHOR_WEIGHTS: Record<AnchorType, number> = {
  application: 25,
  form: 20,
  frame: 15,
  section: 15,
  label: 10,
  control_type: 5,
  visual: 5,
  neighbor: 5,
  tab: 10,
  grid_header: 10,
  grid_row: 10,
};

export interface AnchorScoreResult {
  /** 0..100 — matched weight / available weight, with conflict penalties. */
  score: number;
  matched: AnchorType[];
  conflicting: AnchorType[];
  missing: AnchorType[];
}

/**
 * Phase 7 — score a candidate object's anchors against what we EXPECT.
 *  • A matching anchor ADDS its weight.
 *  • A conflicting anchor (present on both sides but different) SUBTRACTS its weight.
 *  • A MISSING anchor (expected but not found) does NOT reduce the score — it is
 *    simply excluded from the denominator, so partial context never over-penalises.
 *
 * Confidence = matchedWeight / availableWeight * 100, clamped to 0..100.
 */
export function scoreAnchors(expected: Anchor[], found: Anchor[]): AnchorScoreResult {
  const foundByType = new Map<AnchorType, string>();
  for (const a of found) foundByType.set(a.type, norm(a.value));

  let availableWeight = 0;
  let matchedWeight = 0;
  const matched: AnchorType[] = [];
  const conflicting: AnchorType[] = [];
  const missing: AnchorType[] = [];

  for (const exp of expected) {
    const w = ANCHOR_WEIGHTS[exp.type] ?? 5;
    const foundVal = foundByType.get(exp.type);

    if (foundVal === undefined) {
      // Missing — excluded from denominator (no penalty).
      missing.push(exp.type);
      continue;
    }

    availableWeight += w;
    if (foundVal === norm(exp.value)) {
      matchedWeight += w;
      matched.push(exp.type);
    } else {
      // Conflict — penalise.
      matchedWeight -= w;
      conflicting.push(exp.type);
    }
  }

  if (availableWeight === 0) {
    return { score: 0, matched, conflicting, missing };
  }
  const raw = (matchedWeight / availableWeight) * 100;
  return {
    score: Math.max(0, Math.min(100, Math.round(raw))),
    matched,
    conflicting,
    missing,
  };
}

// ----------------------------------------------------------------------------
// PHASE 8 — DYNAMIC HEADER → COLUMN RESOLUTION
// Never store a column index. Resolve the live column from visible headers.
// ----------------------------------------------------------------------------

export interface GridHeaderSpec {
  header: string;
  aliases?: string[];
}

/**
 * Resolve the runtime column index for a logical header against the actually
 * visible headers. Matching order: exact → alias → normalised → similarity.
 * Returns -1 if no acceptable match (caller should self-heal / fail clearly).
 */
export function resolveColumnByHeader(
  spec: GridHeaderSpec,
  visibleHeaders: string[],
  minSimilarity = 0.7
): number {
  const target = norm(spec.header);
  const aliases = (spec.aliases || []).map(norm);

  // 1) Exact (normalised) match.
  for (let i = 0; i < visibleHeaders.length; i++) {
    if (norm(visibleHeaders[i]) === target) return i;
  }
  // 2) Alias match.
  for (let i = 0; i < visibleHeaders.length; i++) {
    if (aliases.includes(norm(visibleHeaders[i]))) return i;
  }
  // 3) Substring containment either direction.
  for (let i = 0; i < visibleHeaders.length; i++) {
    const h = norm(visibleHeaders[i]);
    if (h.includes(target) || target.includes(h)) return i;
  }
  // 4) Fuzzy similarity (Dice coefficient on bigrams).
  let best = -1;
  let bestScore = minSimilarity;
  for (let i = 0; i < visibleHeaders.length; i++) {
    const s = diceCoefficient(target, norm(visibleHeaders[i]));
    if (s >= bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

// ----------------------------------------------------------------------------
// PHASE 12 / 13 — SELF-HEAL CONFIDENCE GATE + SAFE UPDATE POLICY
// ----------------------------------------------------------------------------

export interface SelfHealDecisionInput {
  /** Multi-anchor score (0..100) of the alternate match. */
  anchorScore: number;
  /** Same JDE form as the original? */
  sameForm: boolean;
  /** Same application as the original? */
  sameApplication: boolean;
  /** Same control/object type as the original? */
  sameObjectType: boolean;
}

/** Phase 12 — only heal when identity is virtually certain. */
export function canSelfHeal(input: SelfHealDecisionInput, minConfidence = 95): boolean {
  if (!input.sameForm || !input.sameApplication || !input.sameObjectType) return false;
  return input.anchorScore >= minConfidence;
}

export interface SafeUpdatePolicy {
  updateAfterSuccesses: number; // Phase 13: don't replace after a single success.
  minimumConfidence: number;
}

export const DEFAULT_SAFE_UPDATE_POLICY: SafeUpdatePolicy = {
  updateAfterSuccesses: 2,
  minimumConfidence: 95,
};

/** Phase 13 — decide whether a healed locator may PERMANENTLY replace the old one. */
export function shouldPromoteLocator(
  consecutiveSuccesses: number,
  confidence: number,
  policy: SafeUpdatePolicy = DEFAULT_SAFE_UPDATE_POLICY
): boolean {
  return (
    consecutiveSuccesses >= policy.updateAfterSuccesses &&
    confidence >= policy.minimumConfidence
  );
}

// ----------------------------------------------------------------------------
// PHASE 15 — AI OBJECT REPOSITORY RECORD
// ----------------------------------------------------------------------------

export interface JDEObjectRecord {
  object_id: string;
  application: string;          // e.g. P4310
  form: string;                 // e.g. W4310A
  frame_path: string[];         // e.g. ["MainFrame","ContentFrame"]
  tab?: string;
  section?: string;
  object_name: string;          // e.g. SupplierNumber
  object_type: string;          // textbox | button | grid_cell | dropdown ...
  business_label?: string;
  jde_metadata: {
    dd_item?: string;
    control_id?: string;
    business_view?: string;
    grid_id?: string;
  };
  locator_candidates: LocatorCandidate[];
  anchors: Anchor[];
  visual_anchor?: { enabled: boolean; text?: string; offset_x?: number; offset_y?: number };
  self_healing?: { enabled: boolean };
  /** Phase 14 reliability tracking (updated during execution). */
  reliability?: {
    success_count: number;
    failure_count: number;
    heal_success: number;
  };
}

/** Compute a single best selector for a stored object, honouring priority. */
export function bestSelectorForObject(obj: JDEObjectRecord): string | undefined {
  if (!obj.locator_candidates?.length) return undefined;
  const ranked = rankLocatorCandidates(obj.locator_candidates);
  return candidateToSelector(ranked[0]);
}

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------

function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Sørensen–Dice coefficient over character bigrams (0..1). */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) || 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let intersection = 0;
  A.forEach((countA, bg) => {
    const countB = B.get(bg) || 0;
    intersection += Math.min(countA, countB);
  });
  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}
