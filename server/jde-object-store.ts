/**
 * ============================================================================
 * AITAS — JDE Object Repository STORE (persistence)
 * ============================================================================
 *
 * Persists discovered JDE objects (locators + anchors + metadata) across runs
 * so the executor and self-healer can reuse and IMPROVE them over time
 * (Phase 13 safe-promotion, Phase 14 adaptive reliability).
 *
 * Self-contained: owns its own table (created on import) so it does not have to
 * touch the giant @ts-nocheck storage file. Uses the SAME better-sqlite3
 * connection as the rest of the app.
 * ============================================================================
 */

import { sqliteConnection } from "./db-sqlite";
import { randomUUID } from "crypto";
import {
  type JDEObjectRecord,
  type Anchor,
  type LocatorCandidate,
  scoreAnchors,
  shouldPromoteLocator,
  rankLocatorCandidates,
  candidateToSelector,
} from "./jde-object-repository";
// Learning & Memory layer (additive, best-effort — never affects execution).
import { learningStore } from "./learning/learning-store";

// ----------------------------------------------------------------------------
// Schema — created once on module load (idempotent).
// ----------------------------------------------------------------------------
sqliteConnection.exec(`
  CREATE TABLE IF NOT EXISTS jde_objects (
    object_id          TEXT PRIMARY KEY,
    application        TEXT NOT NULL,
    form               TEXT,
    frame_path         TEXT,            -- JSON string[]
    tab                TEXT,
    section            TEXT,
    object_name        TEXT NOT NULL,
    object_type        TEXT,
    business_label     TEXT,
    jde_metadata       TEXT,            -- JSON
    locator_candidates TEXT,            -- JSON LocatorCandidate[]
    anchors            TEXT,            -- JSON Anchor[]
    visual_anchor      TEXT,            -- JSON
    self_healing       INTEGER DEFAULT 1,
    success_count      INTEGER DEFAULT 0,
    failure_count      INTEGER DEFAULT 0,
    heal_success       INTEGER DEFAULT 0,
    consecutive_heal_successes INTEGER DEFAULT 0,
    source_url         TEXT,
    created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_jde_objects_identity
    ON jde_objects (application, form, object_name);
  CREATE INDEX IF NOT EXISTS idx_jde_objects_app ON jde_objects (application);
`);
console.log("[JDEObjectStore] ✅ jde_objects table ready");

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function rowToRecord(r: any): StoredJDEObject {
  return {
    object_id: r.object_id,
    application: r.application,
    form: r.form || "",
    frame_path: safeParse(r.frame_path, []),
    tab: r.tab || undefined,
    section: r.section || undefined,
    object_name: r.object_name,
    object_type: r.object_type || "unknown",
    business_label: r.business_label || undefined,
    jde_metadata: safeParse(r.jde_metadata, {}),
    locator_candidates: safeParse(r.locator_candidates, []),
    anchors: safeParse(r.anchors, []),
    visual_anchor: safeParse(r.visual_anchor, undefined),
    self_healing: { enabled: !!r.self_healing },
    reliability: {
      success_count: r.success_count || 0,
      failure_count: r.failure_count || 0,
      heal_success: r.heal_success || 0,
    },
    consecutive_heal_successes: r.consecutive_heal_successes || 0,
    source_url: r.source_url || undefined,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function safeParse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try { return JSON.parse(text) as T; } catch { return fallback; }
}

export interface StoredJDEObject extends JDEObjectRecord {
  consecutive_heal_successes?: number;
  source_url?: string;
  created_at?: number;
  updated_at?: number;
}

export interface UpsertResult {
  object: StoredJDEObject;
  created: boolean;
}

export interface ReliabilityOutcome {
  /** Did the object's primary locator work directly? */
  primarySuccess?: boolean;
  /** Did a heal (alternate locator) succeed? */
  healSuccess?: boolean;
  /** Outright failure (nothing matched)? */
  failure?: boolean;
  /** The locator that succeeded during a heal — candidate for promotion. */
  healedLocator?: LocatorCandidate;
  /** Confidence (0..100) of the healed match for Phase 13 gating. */
  healConfidence?: number;
}

class JDEObjectStore {
  /** Insert or update an object by (application, form, object_name). */
  upsert(obj: Partial<StoredJDEObject> & { application: string; object_name: string }): UpsertResult {
    const application = (obj.application || "").trim();
    const form = (obj.form || "").trim();
    const objectName = (obj.object_name || "").trim();

    const existing = sqliteConnection
      .prepare("SELECT * FROM jde_objects WHERE application = ? AND form = ? AND object_name = ?")
      .get(application, form, objectName) as any;

    const ts = now();
    if (existing) {
      // Merge: prefer new non-empty fields, keep reliability counters.
      const merged = {
        frame_path: JSON.stringify(obj.frame_path ?? safeParse(existing.frame_path, [])),
        tab: obj.tab ?? existing.tab,
        section: obj.section ?? existing.section,
        object_type: obj.object_type ?? existing.object_type,
        business_label: obj.business_label ?? existing.business_label,
        jde_metadata: JSON.stringify(obj.jde_metadata ?? safeParse(existing.jde_metadata, {})),
        locator_candidates: JSON.stringify(
          mergeLocators(safeParse(existing.locator_candidates, []), obj.locator_candidates || [])
        ),
        anchors: JSON.stringify(obj.anchors ?? safeParse(existing.anchors, [])),
        visual_anchor: obj.visual_anchor ? JSON.stringify(obj.visual_anchor) : existing.visual_anchor,
        source_url: obj.source_url ?? existing.source_url,
        updated_at: ts,
      };
      sqliteConnection
        .prepare(`UPDATE jde_objects SET frame_path=?, tab=?, section=?, object_type=?, business_label=?,
                  jde_metadata=?, locator_candidates=?, anchors=?, visual_anchor=?, source_url=?, updated_at=?
                  WHERE object_id=?`)
        .run(
          merged.frame_path, merged.tab, merged.section, merged.object_type, merged.business_label,
          merged.jde_metadata, merged.locator_candidates, merged.anchors, merged.visual_anchor,
          merged.source_url, merged.updated_at, existing.object_id
        );
      const updated = sqliteConnection.prepare("SELECT * FROM jde_objects WHERE object_id = ?").get(existing.object_id);
      return { object: rowToRecord(updated), created: false };
    }

    const id = obj.object_id || `OBJ_${randomUUID().slice(0, 8)}`;
    sqliteConnection
      .prepare(`INSERT INTO jde_objects
        (object_id, application, form, frame_path, tab, section, object_name, object_type,
         business_label, jde_metadata, locator_candidates, anchors, visual_anchor, self_healing,
         source_url, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        id, application, form, JSON.stringify(obj.frame_path || []), obj.tab || null, obj.section || null,
        objectName, obj.object_type || "unknown", obj.business_label || null,
        JSON.stringify(obj.jde_metadata || {}), JSON.stringify(obj.locator_candidates || []),
        JSON.stringify(obj.anchors || []), obj.visual_anchor ? JSON.stringify(obj.visual_anchor) : null,
        obj.self_healing?.enabled === false ? 0 : 1, obj.source_url || null, now(), now()
      );
    const created = sqliteConnection.prepare("SELECT * FROM jde_objects WHERE object_id = ?").get(id);
    // Repository Versioning — seed v1 with the initial primary locator.
    try {
      const primary = rankLocatorCandidates(obj.locator_candidates || [])[0];
      if (primary) {
        learningStore.recordLocatorVersion({
          objectId: id,
          application,
          form,
          objectName,
          locatorStrategy: primary.strategy,
          locatorValue: primary.value,
          changeReason: "initial",
          confidence: primary.confidence,
        });
      }
    } catch { /* best-effort */ }
    return { object: rowToRecord(created), created: true };
  }

  /** Bulk upsert (used by the discovery harness). Returns counts. */
  upsertMany(objects: Array<Partial<StoredJDEObject> & { application: string; object_name: string }>): {
    created: number; updated: number; total: number;
  } {
    let created = 0, updated = 0;
    const tx = sqliteConnection.transaction((items: any[]) => {
      for (const it of items) {
        const r = this.upsert(it);
        if (r.created) created++; else updated++;
      }
    });
    tx(objects);
    return { created, updated, total: objects.length };
  }

  getById(objectId: string): StoredJDEObject | null {
    const r = sqliteConnection.prepare("SELECT * FROM jde_objects WHERE object_id = ?").get(objectId);
    return r ? rowToRecord(r) : null;
  }

  /** List objects, optionally filtered by application and/or form. */
  list(filter?: { application?: string; form?: string }): StoredJDEObject[] {
    let sql = "SELECT * FROM jde_objects";
    const where: string[] = [];
    const params: any[] = [];
    if (filter?.application) { where.push("application = ?"); params.push(filter.application.trim()); }
    if (filter?.form) { where.push("form = ?"); params.push(filter.form.trim()); }
    if (where.length) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY application, form, object_name";
    const rows = sqliteConnection.prepare(sql).all(...params) as any[];
    return rows.map(rowToRecord);
  }

  /**
   * Find the best stored object for a desired field, given live screen anchors.
   * Uses Phase 7 multi-anchor scoring; returns the highest-scoring match above
   * `minScore`, with its best-ranked selector.
   */
  findBestMatch(
    desired: { objectName?: string; businessLabel?: string; ddItem?: string },
    liveAnchors: Anchor[],
    minScore = 60
  ): { object: StoredJDEObject; score: number; selector?: string } | null {
    const appAnchor = liveAnchors.find((a) => a.type === "application")?.value;
    const candidates = this.list(appAnchor ? { application: appAnchor } : undefined);

    let best: { object: StoredJDEObject; score: number } | null = null;
    for (const obj of candidates) {
      // Quick identity filters.
      if (desired.ddItem && obj.jde_metadata?.dd_item &&
          obj.jde_metadata.dd_item.toLowerCase() !== desired.ddItem.toLowerCase()) continue;
      if (desired.objectName && norm(obj.object_name) !== norm(desired.objectName) &&
          desired.businessLabel && norm(obj.business_label || "") !== norm(desired.businessLabel)) {
        // Neither name nor label matches — skip.
        if (!obj.object_name.toLowerCase().includes((desired.objectName || "").toLowerCase())) continue;
      }
      const { score } = scoreAnchors(obj.anchors || [], liveAnchors);
      if (!best || score > best.score) best = { object: obj, score };
    }
    if (!best || best.score < minScore) return null;
    const ranked = rankLocatorCandidates(best.object.locator_candidates || []);
    const selector = ranked[0] ? candidateToSelector(ranked[0]) : undefined;
    return { object: best.object, score: best.score, selector };
  }

  /**
   * Phase 14 — record an execution outcome to update reliability counters, and
   * Phase 13 — promote a healed locator to primary after enough confident wins.
   */
  recordOutcome(objectId: string, outcome: ReliabilityOutcome): StoredJDEObject | null {
    const existing = sqliteConnection.prepare("SELECT * FROM jde_objects WHERE object_id = ?").get(objectId) as any;
    if (!existing) return null;

    let success = existing.success_count || 0;
    let failure = existing.failure_count || 0;
    let heal = existing.heal_success || 0;
    let consec = existing.consecutive_heal_successes || 0;

    if (outcome.primarySuccess) { success++; consec = 0; }
    if (outcome.failure) { failure++; consec = 0; }
    if (outcome.healSuccess) {
      heal++;
      consec++;
    }

    let locatorCandidates: LocatorCandidate[] = safeParse(existing.locator_candidates, []);

    // Phase 13 — promote the healed locator to the front when it has proven
    // itself across enough consecutive, high-confidence heals.
    if (
      outcome.healSuccess &&
      outcome.healedLocator &&
      typeof outcome.healConfidence === "number" &&
      shouldPromoteLocator(consec, outcome.healConfidence)
    ) {
      const previousPrimary = locatorCandidates[0];
      locatorCandidates = promoteLocator(locatorCandidates, outcome.healedLocator);
      consec = 0; // reset after promotion
      console.log(`[JDEObjectStore] ⬆ Promoted healed locator for ${existing.object_name} (${existing.application}/${existing.form})`);
      // Repository Versioning — record the locator change as a new version.
      try {
        learningStore.recordLocatorVersion({
          objectId,
          application: existing.application,
          form: existing.form,
          objectName: existing.object_name,
          locatorStrategy: outcome.healedLocator.strategy,
          locatorValue: outcome.healedLocator.value,
          previousValue: previousPrimary ? `${previousPrimary.strategy}=${previousPrimary.value}` : undefined,
          changeReason: "heal_promotion",
          confidence: outcome.healConfidence / 100,
        });
      } catch { /* best-effort */ }
    }

    // ── Learning & Memory feed (best-effort, append-only). Records this outcome
    //    in the Execution Knowledge Store so the Learning Agent can re-rank
    //    locators by OBSERVED reliability. Never affects execution.
    try {
      const ev = outcome.primarySuccess
        ? "locator_success"
        : outcome.healSuccess
          ? "heal_success"
          : outcome.failure
            ? "locator_failure"
            : null;
      if (ev) {
        const loc = outcome.healedLocator;
        learningStore.recordObservation({
          objectId,
          application: existing.application,
          form: existing.form,
          objectName: existing.object_name,
          eventType: ev,
          locatorStrategy: loc?.strategy,
          locatorValue: loc?.value,
          confidence: typeof outcome.healConfidence === "number" ? outcome.healConfidence / 100 : undefined,
          healed: !!outcome.healSuccess,
        });
      }
    } catch { /* best-effort */ }

    sqliteConnection
      .prepare(`UPDATE jde_objects SET success_count=?, failure_count=?, heal_success=?,
                consecutive_heal_successes=?, locator_candidates=?, updated_at=? WHERE object_id=?`)
      .run(success, failure, heal, consec, JSON.stringify(locatorCandidates), now(), objectId);

    const updated = sqliteConnection.prepare("SELECT * FROM jde_objects WHERE object_id = ?").get(objectId);
    return rowToRecord(updated);
  }

  /** Aggregate stats for dashboards (Phase 14 visibility). */
  stats(application?: string): {
    total: number;
    byApplication: Record<string, number>;
    reliability: { success: number; failure: number; heal: number };
  } {
    const objs = this.list(application ? { application } : undefined);
    const byApplication: Record<string, number> = {};
    let success = 0, failure = 0, heal = 0;
    for (const o of objs) {
      byApplication[o.application] = (byApplication[o.application] || 0) + 1;
      success += o.reliability?.success_count || 0;
      failure += o.reliability?.failure_count || 0;
      heal += o.reliability?.heal_success || 0;
    }
    return { total: objs.length, byApplication, reliability: { success, failure, heal } };
  }

  deleteById(objectId: string): boolean {
    const info = sqliteConnection.prepare("DELETE FROM jde_objects WHERE object_id = ?").run(objectId);
    return info.changes > 0;
  }

  clear(application?: string): number {
    if (application) {
      return sqliteConnection.prepare("DELETE FROM jde_objects WHERE application = ?").run(application.trim()).changes;
    }
    return sqliteConnection.prepare("DELETE FROM jde_objects").run().changes;
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Merge new locator candidates into existing, de-duping by strategy+value. */
function mergeLocators(existing: LocatorCandidate[], incoming: LocatorCandidate[]): LocatorCandidate[] {
  const seen = new Set(existing.map((c) => `${c.strategy}::${c.value}`));
  const merged = [...existing];
  for (const c of incoming) {
    const key = `${c.strategy}::${c.value}`;
    if (!seen.has(key)) { merged.push(c); seen.add(key); }
  }
  return merged;
}

/** Move a healed locator to the FRONT (becomes the new primary). */
function promoteLocator(candidates: LocatorCandidate[], healed: LocatorCandidate): LocatorCandidate[] {
  const filtered = candidates.filter((c) => !(c.strategy === healed.strategy && c.value === healed.value));
  return [{ ...healed, confidence: Math.max(healed.confidence, 0.97) }, ...filtered];
}

export const jdeObjectStore = new JDEObjectStore();
