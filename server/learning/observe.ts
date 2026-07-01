/**
 * ============================================================================
 * AITAS — Cross-App Observation Feed (Learning Agent #3 wiring)
 * ============================================================================
 *
 * A one-line, app-agnostic helper so NON-JDE executors (SAP, Salesforce, Web,
 * …) can feed the Execution Knowledge Store without each one re-implementing
 * the mapping. The store is app-agnostic — `application` is just a column — so
 * these observations power the same dashboard (per-application success/heal
 * rates, recent activity) as the JDE path.
 *
 * Design rules:
 *   • Best-effort & non-throwing — a learning failure must NEVER break a run.
 *   • These executors expose step results as `{ step/action, passed }` with no
 *     stable object identity, so we record APP-LEVEL outcomes (no objectId).
 *     That still yields meaningful success/failure/heal analytics per app.
 * ============================================================================
 */

import { learningStore } from "./learning-store";

export interface GenericStepResult {
  /** Human-readable step/action text (field name varies by executor). */
  step?: string;
  action?: string;
  passed: boolean;
  /** Optional selector the executor used, if available. */
  selector?: string;
  /** Optional: was this step recovered via self-healing? */
  healed?: boolean;
}

/**
 * Record a batch of step outcomes for one test case under an application.
 * Returns the number of observations written (0 on any failure).
 */
export function observeAppSteps(
  application: string,
  steps: GenericStepResult[] | undefined,
  opts?: { sessionId?: string; form?: string }
): number {
  if (!application || !Array.isArray(steps) || steps.length === 0) return 0;
  let written = 0;
  try {
    for (const s of steps) {
      const label = (s.step || s.action || "").trim() || undefined;
      const healed = !!s.healed;
      const eventType = s.passed
        ? (healed ? "heal_success" : "locator_success")
        : "locator_failure";
      const ok = learningStore.recordObservation({
        application,
        form: opts?.form,
        objectName: label,
        eventType,
        locatorValue: s.selector,
        healed,
        sessionId: opts?.sessionId,
      });
      if (ok) written++;
    }
  } catch (e: any) {
    console.warn(`[Learning] observeAppSteps(${application}) failed (non-fatal): ${e.message}`);
  }
  return written;
}
