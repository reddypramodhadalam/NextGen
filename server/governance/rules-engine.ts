/**
 * Governance / Human-In-The-Loop Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 * Central rule engine for regulated-enterprise (GxP / SOX / ISO) compliance.
 *
 * Architecture
 * ────────────
 *   1. SystemType is a platform setting (VALIDATED | NON_VALIDATED).
 *   2. Every AI-generated artifact (test case, healing fix, evidence) has a
 *      `reviewStatus` and only APPROVED artifacts can be executed/exported.
 *   3. ALL governance-relevant events go through `auditLog.record(...)`.
 *   4. Every approval writes BOTH a reviewRecord row AND an audit log entry.
 *
 * Why is everything routed through this single file?
 *   - Auditors want ONE place to point at and say "this is the control".
 *   - Future feature flags MUST NOT bypass this; the rule engine is the
 *     single source of truth.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createHash, randomUUID } from "crypto";
import { sqliteConnection } from "../db-sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// 1. SYSTEM CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export type SystemType = "VALIDATED" | "NON_VALIDATED";

export type ReviewStatus =
  | "NOT_REQUIRED"  // Manually authored - no AI involvement
  | "DRAFT"         // AI-generated, awaiting human review
  | "PENDING"       // Submitted for approval
  | "APPROVED"      // Reviewer signed off
  | "REJECTED"      // Reviewer rejected
  | "SUPERSEDED";   // A newer reviewed version exists

export type ResourceType = "TEST_CASE" | "HEAL_SUGGESTION" | "EVIDENCE" | "EXECUTION" | "SETTINGS";

export type AuditEventType =
  | "AI_TEST_CASE_GENERATED"
  | "AI_TEST_CASE_EDITED"
  | "HUMAN_REVIEW_SUBMITTED"
  | "HUMAN_REVIEW_APPROVED"
  | "HUMAN_REVIEW_REJECTED"
  | "AI_HEALER_FIX_PROPOSED"
  | "AI_HEALER_FIX_APPLIED"
  | "EVIDENCE_REVIEWED"
  | "EVIDENCE_UPLOADED_TO_AQM"
  | "EXECUTION_BLOCKED_NO_REVIEW"
  | "SYSTEM_TYPE_CHANGED"
  | "REVIEW_BYPASS_DENIED"
  | "REVIEW_BYPASS_ATTEMPTED";

const SETTING_KEY_SYSTEM_TYPE = "system.classification";
const SETTING_KEY_REQUIRE_COMMENT = "governance.require_comment_on_approval";
const SETTING_KEY_MIN_APPROVERS = "governance.min_approvers";

// In-memory cache - refreshed every 30s so settings changes pick up fast
let cache: { systemType: SystemType; requireComment: boolean; minApprovers: number; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

function readSetting(key: string): string | null {
  try {
    const row = sqliteConnection
      .prepare("SELECT value FROM platform_settings WHERE key = ? ORDER BY updated_at DESC LIMIT 1")
      .get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function loadConfig() {
  if (cache && cache.expiresAt > Date.now()) return cache;
  const systemType: SystemType = (readSetting(SETTING_KEY_SYSTEM_TYPE) as SystemType) || "NON_VALIDATED";
  const requireComment = readSetting(SETTING_KEY_REQUIRE_COMMENT) === "true";
  const minApprovers = parseInt(readSetting(SETTING_KEY_MIN_APPROVERS) || "1", 10);
  cache = { systemType, requireComment, minApprovers, expiresAt: Date.now() + CACHE_TTL_MS };
  return cache;
}

export function invalidateGovernanceCache() {
  cache = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CENTRAL RULE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface GovernanceMode {
  systemType: SystemType;
  requireHumanReview: boolean;       // Block exports/executions on un-reviewed AI content
  allowAutoApplyAiFixes: boolean;    // AI healer can auto-apply fixes
  requireEvidenceReview: boolean;    // Screenshots/logs must be attested before AQM upload
  requireApprovalComment: boolean;   // Approver must type a comment
  minApprovers: number;              // Minimum number of distinct approvers
  enforceImmutableAudit: boolean;    // Audit log rows can never be deleted
}

export function getGovernanceMode(): GovernanceMode {
  const cfg = loadConfig();
  const isValidated = cfg.systemType === "VALIDATED";
  return {
    systemType: cfg.systemType,
    requireHumanReview: isValidated,
    allowAutoApplyAiFixes: !isValidated,
    requireEvidenceReview: isValidated,
    requireApprovalComment: isValidated || cfg.requireComment,
    minApprovers: isValidated ? Math.max(cfg.minApprovers, 1) : 1,
    enforceImmutableAudit: true, // Always - even in NON_VALIDATED we never delete audit rows
  };
}

export function setSystemType(newType: SystemType, actor: { id?: string; email?: string }): void {
  const old = getGovernanceMode().systemType;
  try {
    // Upsert
    const existing = sqliteConnection
      .prepare("SELECT id FROM platform_settings WHERE key = ? LIMIT 1")
      .get(SETTING_KEY_SYSTEM_TYPE) as { id?: string } | undefined;
    if (existing?.id) {
      sqliteConnection
        .prepare("UPDATE platform_settings SET value = ?, updated_at = (unixepoch()) WHERE id = ?")
        .run(newType, existing.id);
    } else {
      sqliteConnection
        .prepare(`INSERT INTO platform_settings (id, category, key, value, description, updated_at)
                  VALUES (?, ?, ?, ?, ?, (unixepoch()))`)
        .run(randomUUID(), "governance", SETTING_KEY_SYSTEM_TYPE, newType, "System classification: VALIDATED | NON_VALIDATED");
    }
    invalidateGovernanceCache();
    auditLog.record({
      eventType: "SYSTEM_TYPE_CHANGED",
      severity: old !== newType ? "CRITICAL" : "INFO",
      resourceType: "SETTINGS",
      resourceId: SETTING_KEY_SYSTEM_TYPE,
      actorId: actor.id,
      actorEmail: actor.email,
      payload: { from: old, to: newType },
    });
  } catch (e: any) {
    console.error("[Governance] Failed to set system type:", e.message);
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CONTENT HASHING (tamper evidence)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a stable SHA-256 hash of a test case's reviewable content.
 * If a single character of steps/title/preconditions changes, the hash changes,
 * so any approval signed against the OLD hash becomes invalid.
 */
export function computeTestCaseHash(tc: {
  title?: string;
  description?: string;
  preconditions?: string;
  steps?: any;
  targetUrl?: string;
}): string {
  const canonical = JSON.stringify({
    title: tc.title || "",
    description: tc.description || "",
    preconditions: tc.preconditions || "",
    targetUrl: tc.targetUrl || "",
    steps: Array.isArray(tc.steps) ? tc.steps.map((s: any) => ({
      step: s.step || s.action || "",
      expected: s.expected || s.expectedResult || "",
      target: s.target || "",
      value: s.value || "",
    })) : [],
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function computeContentHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Returns true if the test case's CURRENT content still matches the hash that
 * was signed at review time. If false, the approval is invalidated and a new
 * review must be performed.
 *
 * Accepts either a normalized API row (camelCase + parsed steps) OR a raw
 * SQLite row (snake_case + steps-as-JSON-string). Both must produce the same
 * hash as the one written by review-service.ts at approval time.
 */
export function isReviewStillValid(tc: any): boolean {
  const storedHash = tc?.contentHash ?? tc?.content_hash;
  const status = tc?.reviewStatus ?? tc?.review_status;
  if (!storedHash) return false;
  if (status !== "APPROVED") return false;

  // Normalize raw SQLite row to the same shape review-service.ts hashFor() uses.
  const rawSteps = tc.steps;
  const steps = typeof rawSteps === "string"
    ? (() => { try { return JSON.parse(rawSteps); } catch { return []; } })()
    : rawSteps;
  const currentHash = computeTestCaseHash({
    title: tc.title,
    description: tc.description,
    preconditions: tc.preconditions,
    steps,
    targetUrl: tc.targetUrl ?? tc.target_url,
  });
  return currentHash === storedHash;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AUDIT LOG (append-only)
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditLogInput {
  eventType: AuditEventType;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  resourceType: ResourceType;
  resourceId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  payload?: Record<string, any>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

class AuditLog {
  /**
   * Appends an immutable event to the governance audit log.
   * Signature is SHA-256 of (eventType + resourceId + actorId + timestamp + payload).
   */
  record(input: AuditLogInput): { id: string; signature: string } {
    const id = randomUUID();
    const ts = Math.floor(Date.now() / 1000);
    const mode = getGovernanceMode();
    const payloadJson = JSON.stringify(input.payload || {});

    const sigInput = [
      input.eventType,
      input.resourceType,
      input.resourceId || "",
      input.actorId || "",
      ts.toString(),
      payloadJson,
    ].join("|");
    const signature = createHash("sha256").update(sigInput).digest("hex");

    try {
      sqliteConnection
        .prepare(`
          INSERT INTO governance_audit_log
            (id, event_type, severity, resource_type, resource_id,
             actor_id, actor_email, actor_role, system_type,
             payload, ip_address, user_agent, signature, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          input.eventType,
          input.severity || "INFO",
          input.resourceType,
          input.resourceId || null,
          input.actorId || null,
          input.actorEmail || null,
          input.actorRole || null,
          mode.systemType,
          payloadJson,
          input.ipAddress || null,
          input.userAgent || null,
          signature,
          ts,
        );
    } catch (e: any) {
      // NEVER throw from audit logging - it would break the calling operation.
      // But always console.error so it shows up in container logs / Splunk.
      console.error("[GovernanceAudit] FAILED to record event:", input.eventType, e.message);
    }

    return { id, signature };
  }

  /**
   * Query the audit log. Read-only - this method has no UPDATE/DELETE counterpart.
   */
  query(filter: {
    resourceType?: ResourceType;
    resourceId?: string;
    actorId?: string;
    eventType?: AuditEventType;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  } = {}): any[] {
    const wh: string[] = [];
    const params: any[] = [];
    if (filter.resourceType) { wh.push("resource_type = ?"); params.push(filter.resourceType); }
    if (filter.resourceId) { wh.push("resource_id = ?"); params.push(filter.resourceId); }
    if (filter.actorId) { wh.push("actor_id = ?"); params.push(filter.actorId); }
    if (filter.eventType) { wh.push("event_type = ?"); params.push(filter.eventType); }
    if (filter.startTime) { wh.push("created_at >= ?"); params.push(Math.floor(filter.startTime.getTime() / 1000)); }
    if (filter.endTime) { wh.push("created_at <= ?"); params.push(Math.floor(filter.endTime.getTime() / 1000)); }
    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
    const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 1000) : 200;
    try {
      const rows = sqliteConnection
        .prepare(`SELECT * FROM governance_audit_log ${where} ORDER BY created_at DESC LIMIT ?`)
        .all(...params, limit) as any[];
      // Map snake_case DB columns to the camelCase shape the API/UI expects.
      return rows.map(r => ({
        id: r.id,
        eventType: r.event_type,
        severity: r.severity || "INFO",
        resourceType: r.resource_type ?? undefined,
        resourceId: r.resource_id ?? undefined,
        actorId: r.actor_id ?? undefined,
        actorEmail: r.actor_email ?? undefined,
        actorRole: r.actor_role ?? undefined,
        systemType: r.system_type ?? undefined,
        ipAddress: r.ip_address ?? undefined,
        userAgent: r.user_agent ?? undefined,
        signature: r.signature ?? undefined,
        payload: r.payload ? safeJsonParse(r.payload) : null,
        createdAt: r.created_at ? new Date(r.created_at * 1000).toISOString() : null,
      }));
    } catch (e: any) {
      console.warn("[GovernanceAudit] Query failed:", e.message);
      return [];
    }
  }

  /**
   * Verify a signature - returns true if the row's signature matches a fresh
   * recomputation of (eventType + resourceId + actorId + timestamp + payload).
   * Auditors call this when investigating; tampering breaks the signature.
   */
  verifySignature(row: any): boolean {
    if (!row?.signature) return false;
    const payloadJson = typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload || {});
    const sigInput = [
      row.event_type || row.eventType,
      row.resource_type || row.resourceType,
      row.resource_id || row.resourceId || "",
      row.actor_id || row.actorId || "",
      String(row.created_at || Math.floor(new Date(row.createdAt).getTime() / 1000)),
      payloadJson,
    ].join("|");
    const expected = createHash("sha256").update(sigInput).digest("hex");
    return expected === row.signature;
  }
}

export const auditLog = new AuditLog();

function safeJsonParse(s: string): any {
  try { return JSON.parse(s); } catch { return s; }
}
