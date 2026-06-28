/**
 * AI HEALER PERSISTENCE LAYER - AITAS
 * ===================================
 *
 * Both healer engines (UnifiedAIHealer and EnterpriseAIHealer) keep their
 * sessions/metrics in-memory, which means every server restart wiped the
 * AI Healer / AI Healer Pro dashboards back to zero.
 *
 * This module provides a tiny SQLite-backed store so completed healing
 * sessions survive restarts. Both engines:
 *   1. persist a normalized record whenever a session completes, and
 *   2. hydrate their in-memory history + counters from this table on startup.
 *
 * The table is intentionally engine-agnostic (an `engine` column) so a single
 * store powers both the Standard and Pro views.
 */

import { sqliteConnection } from "./db-sqlite";

export type HealEngine = "unified" | "enterprise";

export interface PersistedHealSession {
  id: string;
  engine: HealEngine;
  testCaseId: string;
  testCaseTitle: string;
  /** Unified: BASIC|ADVANCED|PRO. Enterprise: QA|UAT|STAGING|PROD. */
  mode: string;
  /** pending | applied | accepted | rejected | rolled_back */
  outcome: string;
  confidenceScore: number;
  suggestionsCount: number;
  healedSteps: number;
  failureMessage?: string | null;
  triggeredBy: string;
  executionId?: string | null;
  /** Whether the session reached a terminal/completed state. */
  completed: boolean;
  stateHistory: Array<{ state: string; timestamp: string; details?: string }>;
  startedAt: string;   // ISO
  completedAt?: string | null;
}

// ─── Table bootstrap ──────────────────────────────────────────────────────────
sqliteConnection.exec(`
  CREATE TABLE IF NOT EXISTS heal_sessions (
    id TEXT PRIMARY KEY,
    engine TEXT NOT NULL,
    test_case_id TEXT,
    test_case_title TEXT,
    mode TEXT,
    outcome TEXT,
    confidence_score REAL DEFAULT 0,
    suggestions_count INTEGER DEFAULT 0,
    healed_steps INTEGER DEFAULT 0,
    failure_message TEXT,
    triggered_by TEXT,
    execution_id TEXT,
    completed INTEGER DEFAULT 1,
    state_history TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_heal_sessions_engine ON heal_sessions(engine, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_heal_sessions_tc ON heal_sessions(test_case_id);
`);

/** Persist (insert-or-replace) a completed healing session. Best-effort. */
export function persistHealSession(rec: PersistedHealSession): void {
  try {
    sqliteConnection.prepare(`
      INSERT OR REPLACE INTO heal_sessions (
        id, engine, test_case_id, test_case_title, mode, outcome,
        confidence_score, suggestions_count, healed_steps, failure_message,
        triggered_by, execution_id, completed, state_history, started_at,
        completed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rec.id,
      rec.engine,
      rec.testCaseId ?? null,
      rec.testCaseTitle ?? null,
      rec.mode ?? null,
      rec.outcome ?? "pending",
      rec.confidenceScore ?? 0,
      rec.suggestionsCount ?? 0,
      rec.healedSteps ?? 0,
      rec.failureMessage ?? null,
      rec.triggeredBy ?? "system",
      rec.executionId ?? null,
      rec.completed ? 1 : 0,
      JSON.stringify(rec.stateHistory ?? []),
      rec.startedAt ?? new Date().toISOString(),
      rec.completedAt ?? null,
      new Date().toISOString(),
    );
  } catch (e: any) {
    console.warn(`[HealerPersistence] Failed to persist session ${rec.id}: ${e.message}`);
  }
}

/** Load all persisted sessions for an engine, newest first. */
export function loadHealSessions(engine: HealEngine): PersistedHealSession[] {
  try {
    const rows = sqliteConnection
      .prepare(`SELECT * FROM heal_sessions WHERE engine = ? ORDER BY created_at DESC`)
      .all(engine) as any[];
    return rows.map(mapRow);
  } catch (e: any) {
    console.warn(`[HealerPersistence] Failed to load sessions for ${engine}: ${e.message}`);
    return [];
  }
}

/**
 * Delete persisted sessions. Scope by engine and/or test case.
 * Returns the number of rows removed.
 */
export function clearHealSessions(engine?: HealEngine, testCaseId?: string): number {
  try {
    const clauses: string[] = [];
    const params: any[] = [];
    if (engine) { clauses.push("engine = ?"); params.push(engine); }
    if (testCaseId) { clauses.push("test_case_id = ?"); params.push(testCaseId); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const info = sqliteConnection.prepare(`DELETE FROM heal_sessions ${where}`).run(...params);
    return info.changes ?? 0;
  } catch (e: any) {
    console.warn(`[HealerPersistence] Failed to clear sessions: ${e.message}`);
    return 0;
  }
}

/** Count persisted sessions (optionally for one engine). */
export function countHealSessions(engine?: HealEngine): number {
  try {
    if (engine) {
      const r = sqliteConnection.prepare(`SELECT COUNT(*) n FROM heal_sessions WHERE engine = ?`).get(engine) as any;
      return r?.n ?? 0;
    }
    const r = sqliteConnection.prepare(`SELECT COUNT(*) n FROM heal_sessions`).get() as any;
    return r?.n ?? 0;
  } catch {
    return 0;
  }
}

function mapRow(r: any): PersistedHealSession {
  let stateHistory: PersistedHealSession["stateHistory"] = [];
  try { stateHistory = r.state_history ? JSON.parse(r.state_history) : []; } catch { /* ignore */ }
  return {
    id: r.id,
    engine: r.engine,
    testCaseId: r.test_case_id,
    testCaseTitle: r.test_case_title,
    mode: r.mode,
    outcome: r.outcome,
    confidenceScore: r.confidence_score ?? 0,
    suggestionsCount: r.suggestions_count ?? 0,
    healedSteps: r.healed_steps ?? 0,
    failureMessage: r.failure_message,
    triggeredBy: r.triggered_by,
    executionId: r.execution_id,
    completed: !!r.completed,
    stateHistory,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}
