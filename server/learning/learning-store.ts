/**
 * ============================================================================
 * AITAS — Learning & Memory Store (persistence)
 * ============================================================================
 *
 * Realizes the "What Needs Enhancement" section of the AITAS Agentic vision:
 *   1. Repository Versioning      → `locator_versions`      (append-only history)
 *   2. Execution Knowledge Store  → `learning_observations` (append-only events)
 *   3. Anchor Statistics          → `anchor_stats`          (rolling counters)
 *
 * This is the *memory backbone* that the Learning Agent (Agent 11) reads to
 * re-rank locators by OBSERVED reliability and to detect drifting objects.
 *
 * Design rules (matching the existing `jde-object-store.ts`):
 *   • Self-contained: owns its own tables, created idempotently on import.
 *   • Uses the SAME better-sqlite3 connection as the rest of the app.
 *   • PURE persistence — no browser, no AI calls. The "brain" lives in
 *     `learning-agent.ts`. This file just stores and queries facts.
 *   • Additive only: it NEVER mutates `jde_objects` or any execution path.
 * ============================================================================
 */

import { sqliteConnection } from "../db-sqlite";
import { randomUUID } from "crypto";

// ----------------------------------------------------------------------------
// Schema — created once on module load (idempotent).
// ----------------------------------------------------------------------------
sqliteConnection.exec(`
  CREATE TABLE IF NOT EXISTS learning_observations (
    id               TEXT PRIMARY KEY,
    object_id        TEXT,            -- FK to jde_objects.object_id (nullable for non-JDE)
    application      TEXT,
    form             TEXT,
    object_name      TEXT,
    event_type       TEXT NOT NULL,   -- locator_success | locator_failure | heal_success | heal_failure | anchor_match | grid_header_change
    locator_strategy TEXT,            -- dd_item | control_id | xpath | ...
    locator_value    TEXT,
    anchor_type      TEXT,            -- label | form | frame | grid_header | ...
    anchor_value     TEXT,
    confidence       REAL,            -- 0..1
    duration_ms      INTEGER,
    healed           INTEGER DEFAULT 0,
    recovery_method  TEXT,            -- anchor_search | visual_match | loosened_locator | safety_net | ...
    session_id       TEXT,
    details          TEXT,            -- JSON freeform
    created_at       INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_obs_object   ON learning_observations (object_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_obs_app      ON learning_observations (application, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_obs_event    ON learning_observations (event_type, created_at DESC);

  CREATE TABLE IF NOT EXISTS locator_versions (
    id               TEXT PRIMARY KEY,
    object_id        TEXT NOT NULL,
    application      TEXT,
    form             TEXT,
    object_name      TEXT,
    version          INTEGER NOT NULL,   -- incrementing per object
    locator_strategy TEXT,
    locator_value    TEXT,
    previous_value   TEXT,
    change_reason    TEXT,               -- initial | heal_promotion | manual | rediscovery
    confidence       REAL,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_ver_object ON locator_versions (object_id, version DESC);

  CREATE TABLE IF NOT EXISTS anchor_stats (
    id               TEXT PRIMARY KEY,
    object_id        TEXT,
    application      TEXT,
    anchor_type      TEXT NOT NULL,
    anchor_value     TEXT,
    success_count    INTEGER DEFAULT 0,
    failure_count    INTEGER DEFAULT 0,
    last_used_at     INTEGER,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_anchor_identity
    ON anchor_stats (object_id, anchor_type, anchor_value);
  CREATE INDEX IF NOT EXISTS idx_anchor_app ON anchor_stats (application);
`);
console.log("[LearningStore] ✅ learning tables ready (observations, locator_versions, anchor_stats)");

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function safeParse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try { return JSON.parse(text) as T; } catch { return fallback; }
}

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type ObservationEvent =
  | "locator_success"
  | "locator_failure"
  | "heal_success"
  | "heal_failure"
  | "anchor_match"
  | "grid_header_change";

export interface ObservationInput {
  objectId?: string;
  application?: string;
  form?: string;
  objectName?: string;
  eventType: ObservationEvent;
  locatorStrategy?: string;
  locatorValue?: string;
  anchorType?: string;
  anchorValue?: string;
  /** 0..1 */
  confidence?: number;
  durationMs?: number;
  healed?: boolean;
  recoveryMethod?: string;
  sessionId?: string;
  details?: Record<string, unknown>;
}

export interface Observation extends ObservationInput {
  id: string;
  createdAt: number;
}

export interface LocatorVersion {
  id: string;
  objectId: string;
  application?: string;
  form?: string;
  objectName?: string;
  version: number;
  locatorStrategy?: string;
  locatorValue?: string;
  previousValue?: string;
  changeReason?: string;
  confidence?: number;
  createdAt: number;
}

export interface AnchorStat {
  id: string;
  objectId?: string;
  application?: string;
  anchorType: string;
  anchorValue?: string;
  successCount: number;
  failureCount: number;
  /** Derived: successCount / (successCount + failureCount), 0 when no data. */
  reliability: number;
  lastUsedAt?: number;
}

// ----------------------------------------------------------------------------
// Store
// ----------------------------------------------------------------------------

class LearningStore {
  // ─── Observations (Execution Knowledge Store) ─────────────────────────────

  /** Append a single execution observation. Best-effort, never throws. */
  recordObservation(input: ObservationInput): Observation | null {
    try {
      const id = randomUUID();
      const createdAt = now();
      sqliteConnection
        .prepare(`
          INSERT INTO learning_observations (
            id, object_id, application, form, object_name, event_type,
            locator_strategy, locator_value, anchor_type, anchor_value,
            confidence, duration_ms, healed, recovery_method, session_id,
            details, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          input.objectId ?? null,
          input.application ?? null,
          input.form ?? null,
          input.objectName ?? null,
          input.eventType,
          input.locatorStrategy ?? null,
          input.locatorValue ?? null,
          input.anchorType ?? null,
          input.anchorValue ?? null,
          typeof input.confidence === "number" ? input.confidence : null,
          typeof input.durationMs === "number" ? input.durationMs : null,
          input.healed ? 1 : 0,
          input.recoveryMethod ?? null,
          input.sessionId ?? null,
          input.details ? JSON.stringify(input.details) : null,
          createdAt
        );
      return { ...input, id, createdAt };
    } catch (e: any) {
      console.warn(`[LearningStore] recordObservation failed: ${e.message}`);
      return null;
    }
  }

  /** Recent observations for an object (newest first). */
  observationsForObject(objectId: string, limit = 50): Observation[] {
    const rows = sqliteConnection
      .prepare("SELECT * FROM learning_observations WHERE object_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(objectId, limit) as any[];
    return rows.map(rowToObservation);
  }

  /** Recent observations across an application (newest first). */
  recentObservations(application?: string, limit = 100): Observation[] {
    const rows = application
      ? sqliteConnection
          .prepare("SELECT * FROM learning_observations WHERE application = ? ORDER BY created_at DESC LIMIT ?")
          .all(application.trim(), limit) as any[]
      : sqliteConnection
          .prepare("SELECT * FROM learning_observations ORDER BY created_at DESC LIMIT ?")
          .all(limit) as any[];
    return rows.map(rowToObservation);
  }

  /**
   * Per-locator-strategy reliability for an object, computed from the event log.
   * Returns a map of `strategy::value` → {success, failure, reliability}.
   */
  locatorReliability(objectId: string): Record<string, { success: number; failure: number; reliability: number }> {
    const rows = sqliteConnection
      .prepare(`
        SELECT locator_strategy AS s, locator_value AS v,
               SUM(CASE WHEN event_type IN ('locator_success','heal_success') THEN 1 ELSE 0 END) AS success,
               SUM(CASE WHEN event_type IN ('locator_failure','heal_failure') THEN 1 ELSE 0 END) AS failure
        FROM learning_observations
        WHERE object_id = ? AND locator_strategy IS NOT NULL
        GROUP BY locator_strategy, locator_value
      `)
      .all(objectId) as any[];
    const out: Record<string, { success: number; failure: number; reliability: number }> = {};
    for (const r of rows) {
      const total = (r.success || 0) + (r.failure || 0);
      out[`${r.s}::${r.v ?? ""}`] = {
        success: r.success || 0,
        failure: r.failure || 0,
        reliability: total > 0 ? (r.success || 0) / total : 0,
      };
    }
    return out;
  }

  // ─── Locator Versions (Repository Versioning) ─────────────────────────────

  /** Append a new locator version for an object. Auto-increments the version. */
  recordLocatorVersion(input: {
    objectId: string;
    application?: string;
    form?: string;
    objectName?: string;
    locatorStrategy?: string;
    locatorValue?: string;
    previousValue?: string;
    changeReason?: string;
    confidence?: number;
  }): LocatorVersion | null {
    try {
      const last = sqliteConnection
        .prepare("SELECT MAX(version) AS v FROM locator_versions WHERE object_id = ?")
        .get(input.objectId) as any;
      const version = (last?.v || 0) + 1;
      const id = randomUUID();
      const createdAt = now();
      sqliteConnection
        .prepare(`
          INSERT INTO locator_versions (
            id, object_id, application, form, object_name, version,
            locator_strategy, locator_value, previous_value, change_reason,
            confidence, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          input.objectId,
          input.application ?? null,
          input.form ?? null,
          input.objectName ?? null,
          version,
          input.locatorStrategy ?? null,
          input.locatorValue ?? null,
          input.previousValue ?? null,
          input.changeReason ?? "manual",
          typeof input.confidence === "number" ? input.confidence : null,
          createdAt
        );
      return {
        id,
        objectId: input.objectId,
        application: input.application,
        form: input.form,
        objectName: input.objectName,
        version,
        locatorStrategy: input.locatorStrategy,
        locatorValue: input.locatorValue,
        previousValue: input.previousValue,
        changeReason: input.changeReason ?? "manual",
        confidence: input.confidence,
        createdAt,
      };
    } catch (e: any) {
      console.warn(`[LearningStore] recordLocatorVersion failed: ${e.message}`);
      return null;
    }
  }

  /** Full version history for an object (newest first). */
  versionsForObject(objectId: string): LocatorVersion[] {
    const rows = sqliteConnection
      .prepare("SELECT * FROM locator_versions WHERE object_id = ? ORDER BY version DESC")
      .all(objectId) as any[];
    return rows.map(rowToVersion);
  }

  // ─── Anchor Statistics ────────────────────────────────────────────────────

  /** Increment success/failure counters for an (object, anchor) pair. */
  recordAnchorOutcome(input: {
    objectId?: string;
    application?: string;
    anchorType: string;
    anchorValue?: string;
    success: boolean;
  }): void {
    try {
      const existing = sqliteConnection
        .prepare(`
          SELECT id, success_count, failure_count FROM anchor_stats
          WHERE object_id IS ? AND anchor_type = ? AND anchor_value IS ?
        `)
        .get(input.objectId ?? null, input.anchorType, input.anchorValue ?? null) as any;

      if (existing) {
        const success = (existing.success_count || 0) + (input.success ? 1 : 0);
        const failure = (existing.failure_count || 0) + (input.success ? 0 : 1);
        sqliteConnection
          .prepare("UPDATE anchor_stats SET success_count=?, failure_count=?, last_used_at=?, updated_at=? WHERE id=?")
          .run(success, failure, now(), now(), existing.id);
      } else {
        sqliteConnection
          .prepare(`
            INSERT INTO anchor_stats (
              id, object_id, application, anchor_type, anchor_value,
              success_count, failure_count, last_used_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            randomUUID(),
            input.objectId ?? null,
            input.application ?? null,
            input.anchorType,
            input.anchorValue ?? null,
            input.success ? 1 : 0,
            input.success ? 0 : 1,
            now(),
            now(),
            now()
          );
      }
    } catch (e: any) {
      console.warn(`[LearningStore] recordAnchorOutcome failed: ${e.message}`);
    }
  }

  /** Anchor stats for an object, ranked by reliability then volume. */
  anchorsForObject(objectId: string): AnchorStat[] {
    const rows = sqliteConnection
      .prepare("SELECT * FROM anchor_stats WHERE object_id = ?")
      .all(objectId) as any[];
    return rows.map(rowToAnchorStat).sort((a, b) => b.reliability - a.reliability);
  }

  /** Top anchors across an application (the "which anchor types are most reliable" leaderboard). */
  anchorLeaderboard(application?: string, limit = 20): AnchorStat[] {
    const rows = application
      ? sqliteConnection.prepare("SELECT * FROM anchor_stats WHERE application = ?").all(application.trim()) as any[]
      : sqliteConnection.prepare("SELECT * FROM anchor_stats").all() as any[];
    return rows
      .map(rowToAnchorStat)
      .filter((a) => a.successCount + a.failureCount >= 1)
      .sort((a, b) => b.reliability - a.reliability || (b.successCount + b.failureCount) - (a.successCount + a.failureCount))
      .slice(0, limit);
  }

  // ─── Aggregate analytics (dashboard) ──────────────────────────────────────

  /** High-level counters for the Learning dashboard. */
  summary(application?: string): {
    totalObservations: number;
    successes: number;
    failures: number;
    heals: number;
    locatorVersions: number;
    trackedAnchors: number;
    healRate: number;
    successRate: number;
  } {
    const appFilter = application ? "WHERE application = ?" : "";
    const params = application ? [application.trim()] : [];

    const obs = sqliteConnection
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN event_type IN ('locator_success','heal_success') THEN 1 ELSE 0 END) AS successes,
          SUM(CASE WHEN event_type IN ('locator_failure','heal_failure') THEN 1 ELSE 0 END) AS failures,
          SUM(CASE WHEN event_type = 'heal_success' THEN 1 ELSE 0 END) AS heals
        FROM learning_observations ${appFilter}
      `)
      .get(...params) as any;

    const versions = sqliteConnection
      .prepare(`SELECT COUNT(*) AS c FROM locator_versions ${appFilter}`)
      .get(...params) as any;
    const anchors = sqliteConnection
      .prepare(`SELECT COUNT(*) AS c FROM anchor_stats ${appFilter}`)
      .get(...params) as any;

    const total = obs?.total || 0;
    const successes = obs?.successes || 0;
    const failures = obs?.failures || 0;
    const heals = obs?.heals || 0;
    const resolved = successes + failures;

    return {
      totalObservations: total,
      successes,
      failures,
      heals,
      locatorVersions: versions?.c || 0,
      trackedAnchors: anchors?.c || 0,
      healRate: resolved > 0 ? heals / resolved : 0,
      successRate: resolved > 0 ? successes / resolved : 0,
    };
  }

  /** Objects with the worst recent reliability (drift candidates). */
  flakiestObjects(application?: string, limit = 10): Array<{
    objectId: string;
    objectName?: string;
    application?: string;
    form?: string;
    success: number;
    failure: number;
    heals: number;
    reliability: number;
  }> {
    const appFilter = application ? "AND application = ?" : "";
    const params = application ? [application.trim(), limit] : [limit];
    const rows = sqliteConnection
      .prepare(`
        SELECT object_id, object_name, application, form,
          SUM(CASE WHEN event_type IN ('locator_success','heal_success') THEN 1 ELSE 0 END) AS success,
          SUM(CASE WHEN event_type IN ('locator_failure','heal_failure') THEN 1 ELSE 0 END) AS failure,
          SUM(CASE WHEN event_type = 'heal_success' THEN 1 ELSE 0 END) AS heals
        FROM learning_observations
        WHERE object_id IS NOT NULL ${appFilter}
        GROUP BY object_id
        HAVING (success + failure) >= 1
        ORDER BY (CAST(failure AS REAL) / (success + failure)) DESC, failure DESC
        LIMIT ?
      `)
      .all(...params) as any[];
    return rows.map((r) => {
      const total = (r.success || 0) + (r.failure || 0);
      return {
        objectId: r.object_id,
        objectName: r.object_name || undefined,
        application: r.application || undefined,
        form: r.form || undefined,
        success: r.success || 0,
        failure: r.failure || 0,
        heals: r.heals || 0,
        reliability: total > 0 ? (r.success || 0) / total : 0,
      };
    });
  }

  /** Wipe learning data (optionally per application). Returns rows removed. */
  clear(application?: string): number {
    if (application) {
      const a = application.trim();
      const c1 = sqliteConnection.prepare("DELETE FROM learning_observations WHERE application = ?").run(a).changes;
      const c2 = sqliteConnection.prepare("DELETE FROM locator_versions WHERE application = ?").run(a).changes;
      const c3 = sqliteConnection.prepare("DELETE FROM anchor_stats WHERE application = ?").run(a).changes;
      return c1 + c2 + c3;
    }
    const c1 = sqliteConnection.prepare("DELETE FROM learning_observations").run().changes;
    const c2 = sqliteConnection.prepare("DELETE FROM locator_versions").run().changes;
    const c3 = sqliteConnection.prepare("DELETE FROM anchor_stats").run().changes;
    return c1 + c2 + c3;
  }
}

// ----------------------------------------------------------------------------
// Row mappers
// ----------------------------------------------------------------------------

function rowToObservation(r: any): Observation {
  return {
    id: r.id,
    objectId: r.object_id || undefined,
    application: r.application || undefined,
    form: r.form || undefined,
    objectName: r.object_name || undefined,
    eventType: r.event_type,
    locatorStrategy: r.locator_strategy || undefined,
    locatorValue: r.locator_value || undefined,
    anchorType: r.anchor_type || undefined,
    anchorValue: r.anchor_value || undefined,
    confidence: typeof r.confidence === "number" ? r.confidence : undefined,
    durationMs: typeof r.duration_ms === "number" ? r.duration_ms : undefined,
    healed: !!r.healed,
    recoveryMethod: r.recovery_method || undefined,
    sessionId: r.session_id || undefined,
    details: safeParse(r.details, undefined),
    createdAt: r.created_at,
  };
}

function rowToVersion(r: any): LocatorVersion {
  return {
    id: r.id,
    objectId: r.object_id,
    application: r.application || undefined,
    form: r.form || undefined,
    objectName: r.object_name || undefined,
    version: r.version,
    locatorStrategy: r.locator_strategy || undefined,
    locatorValue: r.locator_value || undefined,
    previousValue: r.previous_value || undefined,
    changeReason: r.change_reason || undefined,
    confidence: typeof r.confidence === "number" ? r.confidence : undefined,
    createdAt: r.created_at,
  };
}

function rowToAnchorStat(r: any): AnchorStat {
  const success = r.success_count || 0;
  const failure = r.failure_count || 0;
  const total = success + failure;
  return {
    id: r.id,
    objectId: r.object_id || undefined,
    application: r.application || undefined,
    anchorType: r.anchor_type,
    anchorValue: r.anchor_value || undefined,
    successCount: success,
    failureCount: failure,
    reliability: total > 0 ? success / total : 0,
    lastUsedAt: r.last_used_at || undefined,
  };
}

export const learningStore = new LearningStore();
