/**
 * AITAS — Learning & Analytics API Routes
 * ═══════════════════════════════════════════════════════════════════════════════
 * Exposes the Learning & Memory layer (Agent 11) over REST:
 *   • GET  /api/learning/insights              → dashboard headlines + summary
 *   • GET  /api/learning/summary               → raw counters
 *   • GET  /api/learning/anchors               → anchor reliability leaderboard
 *   • GET  /api/learning/drift                 → flaky / drifting objects
 *   • GET  /api/learning/objects/:id/locators  → evidence-aware locator ranking
 *   • GET  /api/learning/objects/:id/versions  → repository version history
 *   • GET  /api/learning/objects/:id/anchors   → per-object anchor stats
 *   • GET  /api/learning/objects/:id/observations → recent execution events
 *   • POST /api/learning/observations          → record an outcome (used by
 *                                                non-JDE executors / tests)
 *   • DELETE /api/learning                     → clear (optionally ?application=)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from "express";
import { learningStore, type ObservationEvent } from "./learning/learning-store";
import { learningAgent } from "./learning/learning-agent";
import { jdeObjectStore } from "./jde-object-store";

const router = Router();

const getStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** Express 5 types route params as string | string[]; normalize to a string. */
const getParam = (p: string | string[]): string => (Array.isArray(p) ? p[0] : p);

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get("/insights", (req: Request, res: Response) => {
  try {
    const application = getStr(req.query.application);
    res.json(learningAgent.insights(application));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/summary", (req: Request, res: Response) => {
  try {
    res.json(learningStore.summary(getStr(req.query.application)));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/anchors", (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 20;
    res.json(learningStore.anchorLeaderboard(getStr(req.query.application), limit));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/drift", (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 10;
    res.json(learningAgent.objectInsights(getStr(req.query.application), limit));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/observations", (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 100;
    res.json(learningStore.recentObservations(getStr(req.query.application), limit));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Per-object intelligence ────────────────────────────────────────────────────

router.get("/objects/:id/locators", (req: Request, res: Response) => {
  try {
    const obj = jdeObjectStore.getById(getParam(req.params.id));
    if (!obj) return res.status(404).json({ error: "Object not found" });
    const ranked = learningAgent.rankWithEvidence(obj.object_id!, obj.locator_candidates || []);
    res.json({
      objectId: obj.object_id,
      objectName: obj.object_name,
      application: obj.application,
      form: obj.form,
      ranked,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/objects/:id/versions", (req: Request, res: Response) => {
  try {
    res.json(learningAgent.versionHistory(getParam(req.params.id)));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/objects/:id/anchors", (req: Request, res: Response) => {
  try {
    res.json(learningAgent.reliableAnchors(getParam(req.params.id)));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/objects/:id/observations", (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 50;
    res.json(learningStore.observationsForObject(getParam(req.params.id), limit));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Manual observation ingestion (non-JDE executors, tests, integrations) ──────

const VALID_EVENTS: ObservationEvent[] = [
  "locator_success",
  "locator_failure",
  "heal_success",
  "heal_failure",
  "anchor_match",
  "grid_header_change",
];

router.post("/observations", (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (!body.eventType || !VALID_EVENTS.includes(body.eventType)) {
      return res.status(400).json({
        error: `eventType is required and must be one of: ${VALID_EVENTS.join(", ")}`,
      });
    }
    const saved = learningStore.recordObservation({
      objectId: body.objectId,
      application: body.application,
      form: body.form,
      objectName: body.objectName,
      eventType: body.eventType,
      locatorStrategy: body.locatorStrategy,
      locatorValue: body.locatorValue,
      anchorType: body.anchorType,
      anchorValue: body.anchorValue,
      confidence: body.confidence,
      durationMs: body.durationMs,
      healed: body.healed,
      recoveryMethod: body.recoveryMethod,
      sessionId: body.sessionId,
      details: body.details,
    });
    // Keep anchor stats in sync when an anchor outcome is reported.
    if (body.anchorType) {
      learningStore.recordAnchorOutcome({
        objectId: body.objectId,
        application: body.application,
        anchorType: body.anchorType,
        anchorValue: body.anchorValue,
        success: body.eventType !== "locator_failure" && body.eventType !== "heal_failure",
      });
    }
    res.status(201).json({ recorded: !!saved, observation: saved });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin ──────────────────────────────────────────────────────────────────────

router.delete("/", (req: Request, res: Response) => {
  try {
    const removed = learningStore.clear(getStr(req.query.application));
    res.json({ cleared: true, rowsRemoved: removed });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
