/**
 * Governance Enforcement Middleware
 * ─────────────────────────────────────────────────────────────────────────────
 * The blocking layer. In VALIDATED mode, these middlewares short-circuit
 * dangerous operations on un-reviewed AI content and write an audit entry
 * for the attempted bypass.
 */

import type { Request, Response, NextFunction } from "express";
import { sqliteConnection } from "../db-sqlite";
import { auditLog, getGovernanceMode, isReviewStillValid } from "./rules-engine";

function extractActor(req: Request): { id?: string; email?: string; role?: string; ip?: string; ua?: string } {
  const u: any = (req as any).user || {};
  return {
    id: u.id || u.userId,
    email: u.email,
    role: u.role || u.roleName,
    ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip,
    ua: req.headers["user-agent"],
  };
}

function loadTestCase(id: string): any | null {
  try {
    return sqliteConnection.prepare("SELECT * FROM test_cases WHERE id = ?").get(id);
  } catch { return null; }
}

/**
 * Resolves a suiteId (or null/undefined) to the list of test case IDs that
 * the execution will actually run. Mirrors the storage.getTestCasesBySuite /
 * getAllTestCases logic used by the execution endpoints.
 */
export function resolveTestCaseIdsForExecution(suiteId?: string | null): string[] {
  try {
    if (suiteId) {
      const rows = sqliteConnection
        .prepare("SELECT id FROM test_cases WHERE suite_id = ?")
        .all(suiteId) as Array<{ id: string }>;
      return rows.map((r) => r.id);
    }
    // No suiteId → executes ALL test cases. Gate them all.
    const rows = sqliteConnection
      .prepare("SELECT id FROM test_cases")
      .all() as Array<{ id: string }>;
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

/**
 * Blocks an operation if ANY referenced test case is AI-generated but not APPROVED.
 * `extractIds` tells the middleware where to look for test case IDs in the request.
 */
export function requireApprovedTestCases(
  extractIds: (req: Request) => string[],
  options: { operationName: string } = { operationName: "operation" },
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const mode = getGovernanceMode();
    if (!mode.requireHumanReview) return next();

    const ids = (extractIds(req) || []).filter(Boolean);
    if (ids.length === 0) return next();

    const blockers: Array<{ id: string; title?: string; reason: string }> = [];
    for (const id of ids) {
      const tc = loadTestCase(id);
      if (!tc) continue;
      const isAi = tc.generated_by_ai === 1 || tc.generated_by_ai === true;
      const status = tc.review_status || "NOT_REQUIRED";
      // Manually authored content is always fine.
      if (!isAi && status === "NOT_REQUIRED") continue;
      // Approved content is fine, BUT only if the hash still matches (no edits since approval)
      if (status === "APPROVED") {
        if (!isReviewStillValid(tc)) {
          blockers.push({ id, title: tc.title, reason: "Content edited after approval - re-review required" });
        }
        continue;
      }
      blockers.push({
        id,
        title: tc.title,
        reason: status === "REJECTED"
          ? "Test case was rejected by reviewer"
          : status === "PENDING"
          ? "Awaiting additional approvers"
          : "AI-generated test case not yet reviewed",
      });
    }

    if (blockers.length === 0) return next();

    const actor = extractActor(req);
    auditLog.record({
      eventType: "EXECUTION_BLOCKED_NO_REVIEW",
      severity: "WARNING",
      resourceType: "TEST_CASE",
      resourceId: blockers[0].id,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      payload: {
        operation: options.operationName,
        blockerCount: blockers.length,
        blockers,
      },
      ipAddress: actor.ip,
      userAgent: actor.ua,
    });

    return res.status(409).json({
      error: "REVIEW_REQUIRED",
      message: `Cannot ${options.operationName} - ${blockers.length} test case(s) require human review.`,
      systemType: mode.systemType,
      blockers,
      remediation: {
        step: "Open the test case(s), review the AI-generated content, and approve via the Human Review dialog.",
        endpoint: "POST /api/governance/reviews",
      },
    });
  };
}

/**
 * Blocks AI Healer fix-application if the system is VALIDATED and the request
 * is asking for auto-apply (without a separate approval flow).
 */
export function blockAutoApplyAiFix(req: Request, res: Response, next: NextFunction) {
  const mode = getGovernanceMode();
  if (mode.allowAutoApplyAiFixes) return next();

  const wantsAuto = req.body?.autoHeal === true || req.body?.autoApply === true;
  if (!wantsAuto) return next();

  const actor = extractActor(req);
  auditLog.record({
    eventType: "REVIEW_BYPASS_ATTEMPTED",
    severity: "CRITICAL",
    resourceType: "HEAL_SUGGESTION",
    resourceId: req.body?.testCaseId || req.body?.suggestionId,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    payload: { route: req.originalUrl, body: redact(req.body) },
    ipAddress: actor.ip,
    userAgent: actor.ua,
  });

  return res.status(403).json({
    error: "AUTO_APPLY_NOT_PERMITTED",
    message: "Auto-apply of AI fixes is not permitted in a VALIDATED system. Submit the fix for human approval instead.",
    systemType: mode.systemType,
    remediation: "Remove autoHeal/autoApply flag, then approve via POST /api/governance/reviews.",
  });
}

/**
 * Blocks evidence upload to AQM unless an evidence_reviews row attests all three:
 *   - attested_no_sensitive_data = 1
 *   - attested_correctness        = 1
 *   - attested_matches_step       = 1
 */
export function requireEvidenceReview(extractEvidenceId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    const mode = getGovernanceMode();
    if (!mode.requireEvidenceReview) return next();

    const evidenceId = extractEvidenceId(req);
    if (!evidenceId) {
      return res.status(400).json({ error: "MISSING_EVIDENCE_ID" });
    }
    try {
      const ev = sqliteConnection
        .prepare("SELECT * FROM evidence_reviews WHERE id = ?")
        .get(evidenceId) as any;
      if (!ev) return res.status(404).json({ error: "EVIDENCE_NOT_FOUND" });
      const allAttested =
        ev.attested_no_sensitive_data === 1 &&
        ev.attested_correctness === 1 &&
        ev.attested_matches_step === 1;
      if (!allAttested) {
        const actor = extractActor(req);
        auditLog.record({
          eventType: "REVIEW_BYPASS_ATTEMPTED",
          severity: "WARNING",
          resourceType: "EVIDENCE",
          resourceId: evidenceId,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          payload: { route: req.originalUrl, attestations: {
            noSensitiveData: ev.attested_no_sensitive_data,
            correctness: ev.attested_correctness,
            matchesStep: ev.attested_matches_step,
          }},
          ipAddress: actor.ip,
          userAgent: actor.ua,
        });
        return res.status(409).json({
          error: "EVIDENCE_REVIEW_INCOMPLETE",
          message: "All three attestations are required before AQM upload.",
          missing: {
            noSensitiveData: ev.attested_no_sensitive_data !== 1,
            correctness: ev.attested_correctness !== 1,
            matchesStep: ev.attested_matches_step !== 1,
          },
        });
      }
      return next();
    } catch (e: any) {
      return res.status(500).json({ error: "EVIDENCE_CHECK_FAILED", detail: e.message });
    }
  };
}

function redact(body: any): any {
  if (!body || typeof body !== "object") return body;
  const copy: any = {};
  for (const [k, v] of Object.entries(body)) {
    if (/password|token|secret|key/i.test(k)) copy[k] = "[REDACTED]";
    else copy[k] = v;
  }
  return copy;
}
