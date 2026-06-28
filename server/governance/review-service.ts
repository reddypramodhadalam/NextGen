/**
 * Review Service
 * ─────────────────────────────────────────────────────────────────────────────
 * The single entry point through which all human approval/rejection actions
 * flow. Writes BOTH a review record AND an audit log entry. Updates the
 * test_cases.review_status field atomically.
 */

import { createHash, randomUUID } from "crypto";
import { sqliteConnection } from "../db-sqlite";
import {
  auditLog,
  computeTestCaseHash,
  getGovernanceMode,
  type ResourceType,
  type ReviewStatus,
} from "./rules-engine";

export type ReviewDecision = "APPROVED" | "REJECTED" | "NEEDS_CHANGES";

export interface ReviewSubmitInput {
  resourceType: ResourceType;
  resourceId: string;
  decision: ReviewDecision;
  comment?: string;
  reviewer: {
    id: string;
    name?: string;
    email?: string;
    role?: string;
  };
  ipAddress?: string;
}

export interface ReviewSubmitResult {
  ok: boolean;
  reviewId?: string;
  signature?: string;
  newStatus?: ReviewStatus;
  message?: string;
  error?: string;
}

class ReviewService {
  /**
   * Submit a review decision. Performs validation, persists the record,
   * updates the artifact's review_status, and writes the audit entry.
   */
  submit(input: ReviewSubmitInput): ReviewSubmitResult {
    const mode = getGovernanceMode();

    // ── 1. Validation ────────────────────────────────────────────────────────
    if (!input.reviewer?.id) {
      return { ok: false, error: "Reviewer identity is required" };
    }
    if (input.decision === "REJECTED" && !input.comment?.trim()) {
      return { ok: false, error: "A comment is required when rejecting a review" };
    }
    if (mode.requireApprovalComment && !input.comment?.trim()) {
      return { ok: false, error: "A comment is required (governance policy)" };
    }

    // ── 2. Load the resource and compute its current content hash ────────────
    const resource = this.loadResource(input.resourceType, input.resourceId);
    if (!resource) {
      return { ok: false, error: `Resource not found: ${input.resourceType}/${input.resourceId}` };
    }

    const contentHash = this.hashFor(input.resourceType, resource);

    // ── 3. Prevent self-approval if minApprovers > 1 ─────────────────────────
    // (The same reviewer can't be counted twice toward the minimum.)
    if (mode.minApprovers > 1 && input.decision === "APPROVED") {
      const priorApprovers = sqliteConnection
        .prepare(`SELECT COUNT(DISTINCT reviewer_id) AS n FROM review_records
                   WHERE resource_id = ? AND decision = 'APPROVED'
                     AND content_hash_at_review = ?`)
        .get(input.resourceId, contentHash) as { n: number };
      const alreadyApprovedByMe = sqliteConnection
        .prepare(`SELECT id FROM review_records
                   WHERE resource_id = ? AND reviewer_id = ?
                     AND decision = 'APPROVED' AND content_hash_at_review = ?
                   LIMIT 1`)
        .get(input.resourceId, input.reviewer.id, contentHash);
      if (alreadyApprovedByMe) {
        return { ok: false, error: "You have already approved this version" };
      }
      // Will become final-approved only when count >= minApprovers
      const _futureCount = (priorApprovers.n || 0) + 1;
      // Stored below; status update happens after insert.
      // (kept here so it's obvious the multi-approver flow is supported)
    }

    // ── 4. Build the signed review record ────────────────────────────────────
    const reviewId = randomUUID();
    const ts = Math.floor(Date.now() / 1000);
    const sigInput = [
      input.resourceId,
      input.reviewer.id,
      input.decision,
      contentHash,
      String(ts),
    ].join("|");
    const signature = createHash("sha256").update(sigInput).digest("hex");

    try {
      sqliteConnection
        .prepare(`
          INSERT INTO review_records
            (id, resource_type, resource_id, resource_version,
             decision, reviewer_id, reviewer_name, reviewer_email, reviewer_role,
             comment, content_hash_at_review, signature, ip_address,
             system_type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          reviewId,
          input.resourceType,
          input.resourceId,
          (resource.review_version ?? 0) + 1,
          input.decision,
          input.reviewer.id,
          input.reviewer.name || null,
          input.reviewer.email || null,
          input.reviewer.role || null,
          input.comment || null,
          contentHash,
          signature,
          input.ipAddress || null,
          mode.systemType,
          ts,
        );
    } catch (e: any) {
      return { ok: false, error: `Failed to record review: ${e.message}` };
    }

    // ── 5. Compute the resource's new aggregate status ───────────────────────
    let newStatus: ReviewStatus = "DRAFT";
    if (input.decision === "REJECTED") {
      newStatus = "REJECTED";
    } else if (input.decision === "NEEDS_CHANGES") {
      newStatus = "DRAFT"; // back to draft for edits
    } else if (input.decision === "APPROVED") {
      const distinctApprovers = sqliteConnection
        .prepare(`SELECT COUNT(DISTINCT reviewer_id) AS n FROM review_records
                   WHERE resource_id = ? AND decision = 'APPROVED'
                     AND content_hash_at_review = ?`)
        .get(input.resourceId, contentHash) as { n: number };
      newStatus = (distinctApprovers.n || 0) >= mode.minApprovers ? "APPROVED" : "PENDING";
    }

    // ── 6. Update the artifact's review_status atomically ────────────────────
    this.applyStatusToResource(
      input.resourceType,
      input.resourceId,
      newStatus,
      input.reviewer,
      contentHash,
      input.comment,
    );

    // ── 7. Audit log ─────────────────────────────────────────────────────────
    auditLog.record({
      eventType:
        input.decision === "APPROVED"
          ? "HUMAN_REVIEW_APPROVED"
          : input.decision === "REJECTED"
          ? "HUMAN_REVIEW_REJECTED"
          : "HUMAN_REVIEW_SUBMITTED",
      severity: input.decision === "REJECTED" ? "WARNING" : "INFO",
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      actorId: input.reviewer.id,
      actorEmail: input.reviewer.email,
      actorRole: input.reviewer.role,
      payload: {
        decision: input.decision,
        comment: input.comment,
        contentHash,
        reviewId,
        newStatus,
        signature,
      },
      ipAddress: input.ipAddress,
    });

    return {
      ok: true,
      reviewId,
      signature,
      newStatus,
      message: `Review recorded: ${input.decision} (status now ${newStatus})`,
    };
  }

  /**
   * Bulk approval - useful for "approve all visible test cases" from generator UI.
   * Each test case still gets an independent review_record + audit entry.
   */
  submitBulk(
    items: Array<{ resourceType: ResourceType; resourceId: string }>,
    decision: ReviewDecision,
    comment: string | undefined,
    reviewer: ReviewSubmitInput["reviewer"],
    ipAddress?: string,
  ): { ok: number; failed: number; results: ReviewSubmitResult[] } {
    const results: ReviewSubmitResult[] = [];
    let ok = 0;
    let failed = 0;
    for (const it of items) {
      const r = this.submit({ ...it, decision, comment, reviewer, ipAddress });
      results.push(r);
      if (r.ok) ok++;
      else failed++;
    }
    return { ok, failed, results };
  }

  /**
   * Returns the full review history for a resource (newest first).
   * Auditors will call this constantly.
   */
  history(resourceType: ResourceType, resourceId: string): any[] {
    try {
      const rows = sqliteConnection
        .prepare(`SELECT * FROM review_records
                   WHERE resource_type = ? AND resource_id = ?
                   ORDER BY created_at DESC`)
        .all(resourceType, resourceId) as any[];
      return rows.map(r => ({
        ...r,
        createdAt: r.created_at ? new Date(r.created_at * 1000) : null,
      }));
    } catch {
      return [];
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────────

  private loadResource(resourceType: ResourceType, resourceId: string): any | null {
    if (resourceType === "TEST_CASE") {
      try {
        return sqliteConnection
          .prepare("SELECT * FROM test_cases WHERE id = ?")
          .get(resourceId);
      } catch { return null; }
    }
    if (resourceType === "EVIDENCE") {
      try {
        return sqliteConnection
          .prepare("SELECT * FROM evidence_reviews WHERE id = ?")
          .get(resourceId);
      } catch { return null; }
    }
    // HEAL_SUGGESTION lives in-memory in the healer, not in DB - we just trust the caller.
    return { id: resourceId };
  }

  private hashFor(resourceType: ResourceType, resource: any): string {
    if (resourceType === "TEST_CASE") {
      // Parse steps if stored as JSON string in SQLite
      const steps = typeof resource.steps === "string" ? safeJson(resource.steps) : resource.steps;
      return computeTestCaseHash({
        title: resource.title,
        description: resource.description,
        preconditions: resource.preconditions,
        steps,
        targetUrl: resource.target_url || resource.targetUrl,
      });
    }
    if (resourceType === "EVIDENCE") {
      return resource.content_hash || resource.contentHash || "";
    }
    // For heal suggestions etc, we hash the resource id as a placeholder
    return createHash("sha256").update(String(resource.id || "")).digest("hex");
  }

  private applyStatusToResource(
    resourceType: ResourceType,
    resourceId: string,
    newStatus: ReviewStatus,
    reviewer: ReviewSubmitInput["reviewer"],
    contentHash: string,
    comment?: string,
  ): void {
    if (resourceType !== "TEST_CASE") return;
    try {
      const mode = getGovernanceMode();
      sqliteConnection
        .prepare(`
          UPDATE test_cases
             SET review_status         = ?,
                 reviewed_by           = ?,
                 reviewed_at           = (unixepoch()),
                 review_comment        = COALESCE(?, review_comment),
                 review_version        = COALESCE(review_version, 0) + 1,
                 content_hash          = ?,
                 system_type_at_review = ?,
                 updated_at            = (unixepoch())
           WHERE id = ?
        `)
        .run(
          newStatus,
          reviewer.id,
          comment || null,
          contentHash,
          mode.systemType,
          resourceId,
        );
    } catch (e: any) {
      console.error("[ReviewService] Failed to update test case status:", e.message);
    }
  }
}

export const reviewService = new ReviewService();

function safeJson(s: any): any {
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return []; }
}
