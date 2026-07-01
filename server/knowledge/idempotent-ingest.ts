/**
 * Idempotent Ingestion Helper
 * ═══════════════════════════════════════════════════════════════════════════════
 * Makes Knowledge Base ingestion IDEMPOTENT and RESUMABLE so that:
 *   • Uploading / crawling the SAME unchanged file again is SKIPPED (no duplicate
 *     source row, no wasted AI cost) — it reports "already available".
 *   • A CHANGED file (same identity, different checksum) UPDATES the existing
 *     record in place: old structured knowledge + vector entries are purged and
 *     the file is re-ingested, so we ENHANCE rather than duplicate.
 *   • An interrupted crawl (PENDING / FAILED files after a network glitch) can be
 *     RE-RUN: ready files are skipped, only the unfinished ones are processed.
 *
 * Identity:
 *   • SharePoint / URL sources → unique by `sourceUrl`.
 *   • File uploads             → unique by application + moduleTag + name.
 * Change detection:
 *   • SHA-256 `checksum` of the file bytes (authoritative), with byte `size` as a
 *     cheap pre-check (used by the crawler to skip re-downloading ready files).
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createHash } from "crypto";
import { knowledgeStorage } from "../knowledge-storage";
import { vectorIndex } from "./vector-index";
import type { KnowledgeSource } from "../../shared/knowledge-schema";

export type IngestDecision =
  | { action: "skip"; source: KnowledgeSource; reason: string }
  | { action: "update"; source: KnowledgeSource; reason: string }
  | { action: "resume"; source: KnowledgeSource; reason: string }
  | { action: "create"; reason: string };

export interface IngestIdentity {
  /** Unique URL for URL/SharePoint sources (preferred identity). */
  sourceUrl?: string;
  /** For uploads: application + moduleTag + name form the identity. */
  application?: string;
  moduleTag?: string;
  name?: string;
}

/** SHA-256 of a buffer (hex). The authoritative content fingerprint. */
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** A status is "in progress / incomplete" — safe to resume into. */
function isUnfinished(status?: string): boolean {
  return (
    !status ||
    status === "PENDING" ||
    status === "FAILED" ||
    status === "INGESTING" ||
    status === "CLASSIFYING" ||
    status === "EXTRACTING" ||
    status === "EMBEDDING"
  );
}

/**
 * Decide what to do with an incoming document given its identity + checksum.
 * Does NOT mutate anything except (on "update"/"resume") purging stale knowledge.
 *
 * @param checksum  SHA-256 of the incoming bytes (omit for a cheap size-only
 *                  pre-check, e.g. before downloading a SharePoint file).
 * @param size      Byte size of the incoming file (optional, used as fallback).
 */
export async function resolveIngestionTarget(
  identity: IngestIdentity,
  checksum?: string,
  size?: number
): Promise<IngestDecision> {
  const existing = await knowledgeStorage.findExistingSource({
    sourceUrl: identity.sourceUrl,
    application: identity.application,
    moduleTag: identity.moduleTag,
    name: identity.name,
  });

  if (!existing) return { action: "create", reason: "No existing source — new document" };

  const existingChecksum = (existing as any).checksum as string | undefined;
  const existingSize = (existing as any).contentSize as number | undefined;
  const ready = existing.status === "READY";

  // 1) READY + identical content → skip.
  if (ready && checksum && existingChecksum && checksum === existingChecksum) {
    return { action: "skip", source: existing, reason: "Already available (identical checksum)" };
  }
  // 1b) READY + no checksum available but same byte size → treat as unchanged
  //     (used by the crawler's cheap pre-check to avoid re-downloading).
  if (ready && !checksum && typeof size === "number" && typeof existingSize === "number" && size === existingSize) {
    return { action: "skip", source: existing, reason: `Already available (same size ${size} bytes)` };
  }
  // 2) READY + different content → update/enhance in place.
  if (ready && checksum && existingChecksum && checksum !== existingChecksum) {
    await purgeSourceKnowledge(existing.id!);
    return { action: "update", source: existing, reason: "Content changed — re-ingesting (enhance)" };
  }
  // 2b) READY but we never stored a checksum (legacy row) and now we have one →
  //     refresh it so future runs can dedup precisely. Re-ingest in place.
  if (ready && checksum && !existingChecksum) {
    await purgeSourceKnowledge(existing.id!);
    return { action: "update", source: existing, reason: "Backfilling checksum — re-ingesting once" };
  }
  // 3) Unfinished (PENDING/FAILED/…) → resume into the same record.
  if (isUnfinished(existing.status)) {
    await purgeSourceKnowledge(existing.id!); // clear any partial knowledge first
    return { action: "resume", source: existing, reason: `Resuming unfinished source (was ${existing.status})` };
  }

  // Default safety net: re-ingest in place rather than duplicate.
  await purgeSourceKnowledge(existing.id!);
  return { action: "update", source: existing, reason: "Re-ingesting existing source" };
}

/** Remove a source's structured knowledge + vector entries so it can be rebuilt cleanly. */
export async function purgeSourceKnowledge(sourceId: string): Promise<void> {
  try { await knowledgeStorage.deleteStructuredKnowledgeBySource(sourceId); } catch (e: any) {
    console.warn(`[Idempotent] Failed to purge structured knowledge for ${sourceId}: ${e.message}`);
  }
  try {
    const removed = vectorIndex.removeBySource(sourceId);
    if (removed > 0) await vectorIndex.flush();
  } catch (e: any) {
    console.warn(`[Idempotent] Failed to purge vector entries for ${sourceId}: ${e.message}`);
  }
  // Reset counters so the rebuilt count is accurate.
  try { await knowledgeStorage.updateKnowledgeSource(sourceId, { documentCount: 0 } as any); } catch {}
}

/** Persist the checksum + size onto a source after a successful (re)ingest. */
export async function recordSourceFingerprint(
  sourceId: string,
  checksum: string,
  size: number
): Promise<void> {
  try {
    await knowledgeStorage.updateKnowledgeSource(sourceId, { checksum, contentSize: size } as any);
  } catch (e: any) {
    console.warn(`[Idempotent] Failed to record fingerprint for ${sourceId}: ${e.message}`);
  }
}
