/**
 * ============================================================================
 * AITAS — Learning Agent (Agent 11 of the Agentic vision)
 * ============================================================================
 *
 * The "brain" of the Learning & Memory layer. It does NOT touch the browser or
 * the live executor — it reads the append-only Execution Knowledge Store
 * (`learning-store.ts`) and produces:
 *
 *   1. Adaptive locator re-ranking
 *        Static priority (dd_item > control_id > … > xpath) is the PRIOR.
 *        Observed reliability (success/failure history) is the EVIDENCE.
 *        Final score = blend(prior, evidence) so a "low-priority" locator that
 *        keeps working in YOUR environment can overtake a "high-priority" one
 *        that keeps failing — without ever discarding the safe default.
 *
 *   2. Object health / drift insights
 *        Flaky objects, low-reliability anchors, version churn.
 *
 *   3. Plain-language learning insights for the dashboard.
 *
 * Safety: this is ADDITIVE and ADVISORY. The executor can consult it, but the
 * existing static ranking (`rankLocatorCandidates`) remains the guaranteed
 * fallback. Nothing here can break a run.
 * ============================================================================
 */

import {
  JDE_LOCATOR_PRIORITY,
  type LocatorCandidate,
  type LocatorStrategy,
} from "../jde-object-repository";
import { learningStore, type AnchorStat, type LocatorVersion } from "./learning-store";

// How strongly observed evidence is allowed to move a locator vs. its static
// priority. 0 = ignore evidence (pure static), 1 = ignore priority (pure
// evidence). 0.5 is a balanced blend that still respects the safe default.
const EVIDENCE_WEIGHT = 0.5;

// Below this many observations we trust the static prior more (cold start).
const MIN_CONFIDENT_SAMPLES = 3;

export interface RankedLocator extends LocatorCandidate {
  /** Static-priority score in 0..1 (1 = best strategy). */
  priorScore: number;
  /** Observed reliability in 0..1 (success / (success+failure)). */
  evidenceScore: number;
  /** Number of recorded outcomes backing the evidence score. */
  samples: number;
  /** Final blended score used for ordering (0..1). */
  finalScore: number;
}

export interface ObjectInsight {
  objectId: string;
  objectName?: string;
  application?: string;
  form?: string;
  reliability: number;
  success: number;
  failure: number;
  heals: number;
  /** "healthy" | "watch" | "flaky" | "unknown" */
  health: "healthy" | "watch" | "flaky" | "unknown";
  recommendation: string;
}

class LearningAgent {
  // ─── Adaptive locator re-ranking ──────────────────────────────────────────

  /**
   * Re-rank an object's locator candidates by blending static priority with
   * observed reliability from the Execution Knowledge Store.
   *
   * @param objectId   the jde_objects.object_id (drives the evidence lookup)
   * @param candidates the object's stored LocatorCandidate[]
   */
  rankWithEvidence(objectId: string, candidates: LocatorCandidate[]): RankedLocator[] {
    const evidence = learningStore.locatorReliability(objectId);
    const maxPriorityIdx = Math.max(1, JDE_LOCATOR_PRIORITY.length - 1);

    const ranked: RankedLocator[] = candidates.map((c) => {
      // Prior: invert the priority index → 0..1 (best strategy = 1).
      const idx = JDE_LOCATOR_PRIORITY.indexOf(c.strategy);
      const priorScore = idx === -1 ? 0 : 1 - idx / maxPriorityIdx;

      // Evidence: look up this exact strategy::value outcome history.
      const stat = evidence[`${c.strategy}::${c.value}`];
      const samples = stat ? stat.success + stat.failure : 0;
      const evidenceScore = stat ? stat.reliability : 0;

      // Cold-start damping: with few samples, lean on the prior.
      const trust = samples >= MIN_CONFIDENT_SAMPLES
        ? EVIDENCE_WEIGHT
        : EVIDENCE_WEIGHT * (samples / MIN_CONFIDENT_SAMPLES);

      // When there is zero evidence, fall back fully to the prior (+ the
      // candidate's own static confidence as a gentle tie-breaker).
      const baseline = priorScore * 0.85 + (c.confidence ?? 0) * 0.15;
      const finalScore = samples === 0
        ? baseline
        : (1 - trust) * baseline + trust * evidenceScore;

      return { ...c, priorScore, evidenceScore, samples, finalScore };
    });

    ranked.sort((a, b) => b.finalScore - a.finalScore);
    return ranked;
  }

  /**
   * Convenience: returns just the ordered LocatorCandidate[] (evidence-aware),
   * a drop-in alternative to the static `rankLocatorCandidates`. Falls back to
   * the input order if anything goes wrong — never throws into the executor.
   */
  bestLocators(objectId: string, candidates: LocatorCandidate[]): LocatorCandidate[] {
    try {
      return this.rankWithEvidence(objectId, candidates).map(({ strategy, value, confidence }) => ({
        strategy,
        value,
        confidence,
      }));
    } catch {
      return candidates;
    }
  }

  // ─── Anchor intelligence ──────────────────────────────────────────────────

  /** Which anchor types are actually most reliable for this object. */
  reliableAnchors(objectId: string): AnchorStat[] {
    return learningStore.anchorsForObject(objectId).filter((a) => a.successCount + a.failureCount > 0);
  }

  // ─── Object health / drift ────────────────────────────────────────────────

  private classifyHealth(reliability: number, samples: number): ObjectInsight["health"] {
    if (samples < 2) return "unknown";
    if (reliability >= 0.9) return "healthy";
    if (reliability >= 0.6) return "watch";
    return "flaky";
  }

  /** Top drift candidates with plain-language recommendations. */
  objectInsights(application?: string, limit = 10): ObjectInsight[] {
    const flakiest = learningStore.flakiestObjects(application, limit);
    return flakiest.map((o) => {
      const samples = o.success + o.failure;
      const health = this.classifyHealth(o.reliability, samples);
      let recommendation: string;
      if (health === "flaky") {
        recommendation = o.heals > 0
          ? `Frequently failing but self-healing is recovering it (${o.heals} heals). Consider promoting the healed locator to primary.`
          : `Failing often with no successful heals. Re-discover this object's locators/anchors.`;
      } else if (health === "watch") {
        recommendation = `Intermittent failures. Monitor; add a stronger anchor (form/frame) to disambiguate.`;
      } else if (health === "healthy") {
        recommendation = `Stable. No action needed.`;
      } else {
        recommendation = `Not enough data yet. Keep executing to build reliability history.`;
      }
      return {
        objectId: o.objectId,
        objectName: o.objectName,
        application: o.application,
        form: o.form,
        reliability: o.reliability,
        success: o.success,
        failure: o.failure,
        heals: o.heals,
        health,
        recommendation,
      };
    });
  }

  /** Version history (drop-through to the store, exposed for the dashboard). */
  versionHistory(objectId: string): LocatorVersion[] {
    return learningStore.versionsForObject(objectId);
  }

  // ─── Dashboard insights (plain language) ──────────────────────────────────

  /** Aggregate, human-readable learning insights for the UI. */
  insights(application?: string): {
    summary: ReturnType<typeof learningStore.summary>;
    anchorLeaderboard: AnchorStat[];
    driftObjects: ObjectInsight[];
    headlines: string[];
  } {
    const summary = learningStore.summary(application);
    const anchorLeaderboard = learningStore.anchorLeaderboard(application, 10);
    const driftObjects = this.objectInsights(application, 10);

    const headlines: string[] = [];
    if (summary.totalObservations === 0) {
      headlines.push("No execution history yet — run some tests to start learning.");
    } else {
      headlines.push(
        `Observed ${summary.totalObservations} locator outcomes — ${(summary.successRate * 100).toFixed(0)}% first-try success.`
      );
      if (summary.heals > 0) {
        headlines.push(
          `Self-healing recovered ${summary.heals} step(s) (${(summary.healRate * 100).toFixed(0)}% of resolved attempts).`
        );
      }
      const topAnchor = anchorLeaderboard[0];
      if (topAnchor) {
        headlines.push(
          `Most reliable anchor type: "${topAnchor.anchorType}" (${(topAnchor.reliability * 100).toFixed(0)}% over ${topAnchor.successCount + topAnchor.failureCount} uses).`
        );
      }
      const flaky = driftObjects.find((d) => d.health === "flaky");
      if (flaky) {
        headlines.push(
          `⚠ "${flaky.objectName ?? flaky.objectId}" is drifting (${(flaky.reliability * 100).toFixed(0)}% reliable) — ${flaky.recommendation}`
        );
      }
    }

    return { summary, anchorLeaderboard, driftObjects, headlines };
  }
}

export const learningAgent = new LearningAgent();
