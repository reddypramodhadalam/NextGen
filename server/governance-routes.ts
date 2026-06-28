// @ts-nocheck
/**
 * Governance HTTP Routes
 * ─────────────────────────────────────────────────────────────────────────────
 * Public surface for the regulated-enterprise governance system.
 *
 *   GET    /api/governance/mode                  - current mode + flags
 *   PUT    /api/governance/system-type           - flip VALIDATED <-> NON_VALIDATED
 *   POST   /api/governance/reviews               - submit a single review decision
 *   POST   /api/governance/reviews/bulk          - approve/reject many at once
 *   GET    /api/governance/reviews/:type/:id     - review history for a resource
 *   GET    /api/governance/audit                 - query the immutable audit log
 *   GET    /api/governance/audit/verify/:id      - verify a row's signature
 *   GET    /api/governance/stats                 - dashboard counters
 *
 *   POST   /api/governance/evidence              - register a piece of evidence
 *   PUT    /api/governance/evidence/:id/attest   - attest correctness, no-PHI, matches-step
 *   POST   /api/governance/evidence/:id/upload   - mark uploaded-to-AQM (requires attestations)
 *   GET    /api/governance/evidence/:id          - get evidence + review status
 */

import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { sqliteConnection } from "./db-sqlite";
import {
  auditLog,
  computeContentHash,
  getGovernanceMode,
  invalidateGovernanceCache,
  setSystemType,
  type ResourceType,
  type SystemType,
} from "./governance/rules-engine";
import { reviewService, type ReviewDecision } from "./governance/review-service";

const router = Router();

function actor(req: Request) {
  const u: any = (req as any).user || {};
  return {
    id: u.id || u.userId || "anonymous",
    name: u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.name,
    email: u.email,
    role: u.role || u.roleName,
    ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MODE & SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/mode", (_req: Request, res: Response) => {
  try {
    const mode = getGovernanceMode();
    res.json({
      ...mode,
      description:
        mode.systemType === "VALIDATED"
          ? "VALIDATED system: Human review is mandatory for all AI-generated content. Auto-apply of AI fixes is blocked. Evidence must be attested before AQM upload."
          : "NON_VALIDATED system: AI suggestions are allowed without mandatory review. Audit trail still captured for all events.",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/system-type", (req: Request, res: Response) => {
  try {
    const { systemType } = req.body || {};
    if (!systemType || !["VALIDATED", "NON_VALIDATED"].includes(systemType)) {
      return res.status(400).json({ error: "systemType must be VALIDATED or NON_VALIDATED" });
    }
    const me = actor(req);
    setSystemType(systemType as SystemType, { id: me.id, email: me.email });
    invalidateGovernanceCache();
    res.json({
      ok: true,
      systemType,
      mode: getGovernanceMode(),
      message: `System classification set to ${systemType}`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. REVIEW WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────

router.post("/reviews", (req: Request, res: Response) => {
  try {
    const { resourceType, resourceId, decision, comment } = req.body || {};
    if (!resourceType || !resourceId || !decision) {
      return res.status(400).json({ error: "resourceType, resourceId, and decision are required" });
    }
    if (!["APPROVED", "REJECTED", "NEEDS_CHANGES"].includes(decision)) {
      return res.status(400).json({ error: "decision must be APPROVED | REJECTED | NEEDS_CHANGES" });
    }
    const me = actor(req);
    const result = reviewService.submit({
      resourceType: resourceType as ResourceType,
      resourceId,
      decision: decision as ReviewDecision,
      comment,
      reviewer: { id: me.id, name: me.name, email: me.email, role: me.role },
      ipAddress: me.ip,
    });
    if (!result.ok) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/reviews/bulk", (req: Request, res: Response) => {
  try {
    const { items, decision, comment } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }
    if (!["APPROVED", "REJECTED", "NEEDS_CHANGES"].includes(decision)) {
      return res.status(400).json({ error: "decision must be APPROVED | REJECTED | NEEDS_CHANGES" });
    }
    const me = actor(req);
    const result = reviewService.submitBulk(
      items,
      decision as ReviewDecision,
      comment,
      { id: me.id, name: me.name, email: me.email, role: me.role },
      me.ip,
    );
    res.status(201).json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/reviews/:resourceType/:resourceId", (req: Request, res: Response) => {
  try {
    const history = reviewService.history(
      req.params.resourceType as ResourceType,
      req.params.resourceId,
    );
    res.json({ count: history.length, history });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────

router.get("/audit", (req: Request, res: Response) => {
  try {
    const { resourceType, resourceId, actorId, eventType, startTime, endTime, limit } = req.query;
    const rows = auditLog.query({
      resourceType: resourceType as ResourceType | undefined,
      resourceId: resourceId as string | undefined,
      actorId: actorId as string | undefined,
      eventType: eventType as any,
      startTime: startTime ? new Date(String(startTime)) : undefined,
      endTime: endTime ? new Date(String(endTime)) : undefined,
      limit: limit ? parseInt(String(limit), 10) : 200,
    });
    res.json({ count: rows.length, rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/audit/verify/:id", (req: Request, res: Response) => {
  try {
    const row = sqliteConnection
      .prepare("SELECT * FROM governance_audit_log WHERE id = ?")
      .get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: "Audit row not found" });
    const valid = auditLog.verifySignature(row);
    res.json({
      id: row.id,
      eventType: row.event_type,
      signatureValid: valid,
      message: valid
        ? "Signature verified - row has not been tampered with."
        : "SIGNATURE MISMATCH - this row may have been altered after insert.",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DASHBOARD STATS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/stats", (_req: Request, res: Response) => {
  try {
    const mode = getGovernanceMode();
    const tcByStatus = sqliteConnection
      .prepare(`SELECT review_status AS status, COUNT(*) AS n
                  FROM test_cases
                 WHERE generated_by_ai = 1
                 GROUP BY review_status`)
      .all() as Array<{ status: string; n: number }>;
    const eventsLast24h = sqliteConnection
      .prepare(`SELECT event_type AS type, COUNT(*) AS n
                  FROM governance_audit_log
                 WHERE created_at > (unixepoch() - 86400)
                 GROUP BY event_type`)
      .all() as Array<{ type: string; n: number }>;
    const recentDenials = sqliteConnection
      .prepare(`SELECT * FROM governance_audit_log
                 WHERE event_type IN ('EXECUTION_BLOCKED_NO_REVIEW',
                                      'REVIEW_BYPASS_ATTEMPTED',
                                      'REVIEW_BYPASS_DENIED')
                 ORDER BY created_at DESC
                 LIMIT 10`)
      .all() as any[];
    const reviewVelocity = sqliteConnection
      .prepare(`SELECT COUNT(*) AS approvalsLast7d
                  FROM review_records
                 WHERE decision = 'APPROVED'
                   AND created_at > (unixepoch() - 604800)`)
      .get() as { approvalsLast7d: number };
    const evidenceStats = sqliteConnection
      .prepare(`SELECT
                  COUNT(*) AS total,
                  SUM(CASE WHEN uploaded_to_aqm = 1 THEN 1 ELSE 0 END) AS uploaded,
                  SUM(CASE WHEN attested_no_sensitive_data = 1
                            AND attested_correctness = 1
                            AND attested_matches_step = 1 THEN 1 ELSE 0 END) AS fullyAttested
                  FROM evidence_reviews`)
      .get() as any;

    res.json({
      mode,
      testCasesByReviewStatus: Object.fromEntries(tcByStatus.map(r => [r.status, r.n])),
      eventsLast24Hours: Object.fromEntries(eventsLast24h.map(r => [r.type, r.n])),
      reviewVelocity,
      evidence: evidenceStats,
      recentDenials: recentDenials.map(r => ({
        id: r.id,
        eventType: r.event_type,
        resourceId: r.resource_id,
        actorEmail: r.actor_email,
        at: new Date(r.created_at * 1000).toISOString(),
        payload: r.payload ? safeJson(r.payload) : null,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. EVIDENCE REVIEW (screenshots / logs before AQM upload)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/evidence", (req: Request, res: Response) => {
  try {
    const { evidenceType, evidenceUri, executionId, testCaseId, stepIndex, contentHash } = req.body || {};
    if (!evidenceType || !evidenceUri) {
      return res.status(400).json({ error: "evidenceType and evidenceUri are required" });
    }
    const id = randomUUID();
    const hash = contentHash || computeContentHash(evidenceUri);
    sqliteConnection
      .prepare(`
        INSERT INTO evidence_reviews
          (id, evidence_type, evidence_uri, content_hash,
           execution_id, test_case_id, step_index,
           attested_no_sensitive_data, attested_correctness, attested_matches_step,
           uploaded_to_aqm, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, (unixepoch()))
      `)
      .run(id, evidenceType, evidenceUri, hash, executionId || null, testCaseId || null, stepIndex ?? null);
    res.status(201).json({ id, contentHash: hash });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/evidence/:id/attest", (req: Request, res: Response) => {
  try {
    const { attestedNoSensitiveData, attestedCorrectness, attestedMatchesStep, comment } = req.body || {};
    const me = actor(req);
    const ev = sqliteConnection
      .prepare("SELECT * FROM evidence_reviews WHERE id = ?")
      .get(req.params.id) as any;
    if (!ev) return res.status(404).json({ error: "Evidence not found" });

    sqliteConnection
      .prepare(`
        UPDATE evidence_reviews
           SET attested_no_sensitive_data = ?,
               attested_correctness       = ?,
               attested_matches_step      = ?,
               reviewer_id                = ?,
               reviewer_email             = ?,
               reviewed_at                = (unixepoch()),
               comment                    = COALESCE(?, comment)
         WHERE id = ?
      `)
      .run(
        attestedNoSensitiveData ? 1 : 0,
        attestedCorrectness ? 1 : 0,
        attestedMatchesStep ? 1 : 0,
        me.id,
        me.email || null,
        comment || null,
        req.params.id,
      );

    auditLog.record({
      eventType: "EVIDENCE_REVIEWED",
      severity: "INFO",
      resourceType: "EVIDENCE",
      resourceId: req.params.id,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
      payload: { attestedNoSensitiveData, attestedCorrectness, attestedMatchesStep, comment },
      ipAddress: me.ip,
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/evidence/:id/upload", (req: Request, res: Response) => {
  try {
    const mode = getGovernanceMode();
    const ev = sqliteConnection
      .prepare("SELECT * FROM evidence_reviews WHERE id = ?")
      .get(req.params.id) as any;
    if (!ev) return res.status(404).json({ error: "Evidence not found" });

    if (mode.requireEvidenceReview) {
      const allAttested =
        ev.attested_no_sensitive_data === 1 &&
        ev.attested_correctness === 1 &&
        ev.attested_matches_step === 1;
      if (!allAttested) {
        const me = actor(req);
        auditLog.record({
          eventType: "REVIEW_BYPASS_ATTEMPTED",
          severity: "WARNING",
          resourceType: "EVIDENCE",
          resourceId: req.params.id,
          actorId: me.id,
          actorEmail: me.email,
          payload: { attempted: "AQM upload before attestation" },
          ipAddress: me.ip,
        });
        return res.status(409).json({
          error: "ATTESTATION_INCOMPLETE",
          missing: {
            noSensitiveData: ev.attested_no_sensitive_data !== 1,
            correctness: ev.attested_correctness !== 1,
            matchesStep: ev.attested_matches_step !== 1,
          },
        });
      }
    }

    const aqmRef = req.body?.aqmReference || `AQM-${Date.now()}`;
    sqliteConnection
      .prepare(`UPDATE evidence_reviews
                   SET uploaded_to_aqm = 1, aqm_uploaded_at = (unixepoch()), aqm_reference = ?
                 WHERE id = ?`)
      .run(aqmRef, req.params.id);

    const me = actor(req);
    auditLog.record({
      eventType: "EVIDENCE_UPLOADED_TO_AQM",
      severity: "INFO",
      resourceType: "EVIDENCE",
      resourceId: req.params.id,
      actorId: me.id,
      actorEmail: me.email,
      payload: { aqmReference: aqmRef },
      ipAddress: me.ip,
    });

    res.json({ ok: true, aqmReference: aqmRef });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/evidence/:id", (req: Request, res: Response) => {
  try {
    const ev = sqliteConnection
      .prepare("SELECT * FROM evidence_reviews WHERE id = ?")
      .get(req.params.id) as any;
    if (!ev) return res.status(404).json({ error: "Evidence not found" });
    res.json({
      ...ev,
      attestedNoSensitiveData: ev.attested_no_sensitive_data === 1,
      attestedCorrectness: ev.attested_correctness === 1,
      attestedMatchesStep: ev.attested_matches_step === 1,
      uploadedToAqm: ev.uploaded_to_aqm === 1,
      reviewedAt: ev.reviewed_at ? new Date(ev.reviewed_at * 1000).toISOString() : null,
      aqmUploadedAt: ev.aqm_uploaded_at ? new Date(ev.aqm_uploaded_at * 1000).toISOString() : null,
      createdAt: ev.created_at ? new Date(ev.created_at * 1000).toISOString() : null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

function safeJson(s: any): any {
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return s; }
}

export default router;
