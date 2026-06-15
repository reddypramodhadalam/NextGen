/**
 * Test Coverage Matrix — AITAS Phase 7
 * Maps requirements → test cases → executions → pass/fail
 * Computes coverage gaps and risk scores
 */

import { storage } from "./storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoverageCell {
  requirementId: string;
  requirementTitle: string;
  testCaseId: string;
  testCaseTitle: string;
  status: "covered" | "partial" | "uncovered" | "failing";
  lastRunStatus?: "passed" | "failed" | "skipped" | "pending";
  lastRunAt?: Date;
  executionCount: number;
  passRate: number;           // 0-100
  riskScore: number;          // 0-100 (higher = more risky)
}

export interface CoverageStats {
  totalRequirements: number;
  coveredRequirements: number;
  uncoveredRequirements: number;
  totalTestCases: number;
  activeTestCases: number;
  coveragePercent: number;
  passRate: number;
  riskScore: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, { total: number; covered: number; passing: number }>;
}

export interface CoverageMatrix {
  requirements: Array<{
    id: string;
    title: string;
    status: string;
    priority?: string;
    testCases: CoverageCell[];
    coverageStatus: "covered" | "partial" | "uncovered";
    passRate: number;
    riskScore: number;
  }>;
  orphanTestCases: Array<{ id: string; title: string; lastStatus?: string }>;
  stats: CoverageStats;
  generatedAt: Date;
}

// ─── Risk Score Calculator ────────────────────────────────────────────────────

function computeRiskScore(params: {
  hasTests: boolean;
  passRate: number;
  executionCount: number;
  priority?: string;
  daysSinceLastRun?: number;
}): number {
  let risk = 0;

  // No tests = maximum risk
  if (!params.hasTests) return 100;

  // Low pass rate increases risk
  risk += (100 - params.passRate) * 0.4;

  // Never run = high risk
  if (params.executionCount === 0) risk += 30;
  else if (params.executionCount < 3) risk += 15;

  // Priority multiplier
  if (params.priority === "critical") risk *= 1.5;
  else if (params.priority === "high") risk *= 1.2;
  else if (params.priority === "low") risk *= 0.7;

  // Stale tests (not run recently)
  if (params.daysSinceLastRun !== undefined) {
    if (params.daysSinceLastRun > 30) risk += 20;
    else if (params.daysSinceLastRun > 7) risk += 10;
  }

  return Math.min(Math.round(risk), 100);
}

// ─── Main Coverage Engine ─────────────────────────────────────────────────────

export class CoverageMatrixEngine {

  async buildMatrix(suiteId?: string): Promise<CoverageMatrix> {
    const [requirements, allTestCases, allExecutions] = await Promise.all([
      storage.getAllRequirements(),
      suiteId ? storage.getTestCasesBySuite(suiteId) : storage.getAllTestCases(),
      storage.getAllExecutions(),
    ]);

    // Build execution result map: testCaseId → latest results
    const resultMap = new Map<string, { status: string; runAt: Date; count: number; passCount: number }>();

    for (const exec of allExecutions.slice(0, 50)) {
      const results = await storage.getResultsByExecution(exec.id);
      for (const result of results) {
        if (!result.testCaseId) continue;
        const existing = resultMap.get(result.testCaseId);
        const runAt = new Date(result.createdAt);
        if (!existing || runAt > existing.runAt) {
          resultMap.set(result.testCaseId, {
            status: result.status,
            runAt,
            count: (existing?.count || 0) + 1,
            passCount: (existing?.passCount || 0) + (result.status === "passed" ? 1 : 0),
          });
        } else {
          existing.count++;
          if (result.status === "passed") existing.passCount++;
        }
      }
    }

    // Build test case lookup by title keywords (simple matching)
    const testCasesByKeyword = new Map<string, typeof allTestCases[0][]>();
    for (const tc of allTestCases) {
      const words = tc.title.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3) {
          const arr = testCasesByKeyword.get(word) || [];
          arr.push(tc);
          testCasesByKeyword.set(word, arr);
        }
      }
    }

    // Map requirements to test cases
    const coveredTestCaseIds = new Set<string>();
    const matrixRows: CoverageMatrix["requirements"] = [];

    for (const req of requirements) {
      // Find test cases that match this requirement
      // Match by: tags, title keywords, or explicit requirement ID in test case
      const matchedTCs = allTestCases.filter((tc) => {
        const tcTags = (tc.tags as string[]) || [];
        const reqWords = req.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        const tcTitle = tc.title.toLowerCase();
        return (
          tcTags.includes(req.id) ||
          tcTags.some((t) => req.title.toLowerCase().includes(t.toLowerCase())) ||
          reqWords.some((w) => tcTitle.includes(w))
        );
      });

      const cells: CoverageCell[] = matchedTCs.map((tc) => {
        coveredTestCaseIds.add(tc.id);
        const runData = resultMap.get(tc.id);
        const passRate = runData && runData.count > 0
          ? Math.round((runData.passCount / runData.count) * 100) : 0;
        const daysSince = runData
          ? Math.floor((Date.now() - runData.runAt.getTime()) / 86400000) : undefined;

        const cellStatus: CoverageCell["status"] =
          !runData ? "covered"
          : runData.status === "passed" ? "covered"
          : runData.status === "failed" ? "failing"
          : "partial";

        return {
          requirementId: req.id,
          requirementTitle: req.title,
          testCaseId: tc.id,
          testCaseTitle: tc.title,
          status: cellStatus,
          lastRunStatus: runData?.status as any,
          lastRunAt: runData?.runAt,
          executionCount: runData?.count || 0,
          passRate,
          riskScore: computeRiskScore({
            hasTests: true,
            passRate,
            executionCount: runData?.count || 0,
            priority: (tc as any).priority,
            daysSinceLastRun: daysSince,
          }),
        };
      });

      const avgPassRate = cells.length > 0
        ? Math.round(cells.reduce((s, c) => s + c.passRate, 0) / cells.length) : 0;
      const avgRisk = cells.length > 0
        ? Math.round(cells.reduce((s, c) => s + c.riskScore, 0) / cells.length)
        : computeRiskScore({ hasTests: false, passRate: 0, executionCount: 0 });

      const coverageStatus: "covered" | "partial" | "uncovered" =
        cells.length === 0 ? "uncovered"
        : cells.every((c) => c.status === "covered") ? "covered"
        : "partial";

      matrixRows.push({
        id: req.id,
        title: req.title,
        status: req.status,
        priority: (req as any).priority,
        testCases: cells,
        coverageStatus,
        passRate: avgPassRate,
        riskScore: avgRisk,
      });
    }

    // Orphan test cases (not linked to any requirement)
    const orphans = allTestCases
      .filter((tc) => !coveredTestCaseIds.has(tc.id))
      .map((tc) => ({
        id: tc.id,
        title: tc.title,
        lastStatus: resultMap.get(tc.id)?.status,
      }));

    // Compute stats
    const covered = matrixRows.filter((r) => r.coverageStatus === "covered").length;
    const partial = matrixRows.filter((r) => r.coverageStatus === "partial").length;
    const uncovered = matrixRows.filter((r) => r.coverageStatus === "uncovered").length;
    const allCells = matrixRows.flatMap((r) => r.testCases);
    const overallPassRate = allCells.length > 0
      ? Math.round(allCells.reduce((s, c) => s + c.passRate, 0) / allCells.length) : 0;
    const overallRisk = matrixRows.length > 0
      ? Math.round(matrixRows.reduce((s, r) => s + r.riskScore, 0) / matrixRows.length) : 0;

    const byPriority: CoverageStats["byPriority"] = {};
    for (const tc of allTestCases) {
      const p = (tc as any).priority || "medium";
      if (!byPriority[p]) byPriority[p] = { total: 0, covered: 0, passing: 0 };
      byPriority[p].total++;
      if (coveredTestCaseIds.has(tc.id)) byPriority[p].covered++;
      const run = resultMap.get(tc.id);
      if (run?.status === "passed") byPriority[p].passing++;
    }

    const stats: CoverageStats = {
      totalRequirements: requirements.length,
      coveredRequirements: covered + partial,
      uncoveredRequirements: uncovered,
      totalTestCases: allTestCases.length,
      activeTestCases: allTestCases.filter((tc) => (tc as any).status === "active").length,
      coveragePercent: requirements.length > 0
        ? Math.round(((covered + partial) / requirements.length) * 100) : 0,
      passRate: overallPassRate,
      riskScore: overallRisk,
      byStatus: { covered, partial, uncovered, failing: allCells.filter((c) => c.status === "failing").length },
      byPriority,
    };

    return { requirements: matrixRows, orphanTestCases: orphans, stats, generatedAt: new Date() };
  }

  /** Get coverage for a single requirement */
  async getRequirementCoverage(requirementId: string): Promise<{
    requirement: any;
    testCases: CoverageCell[];
    coverageStatus: string;
    passRate: number;
    riskScore: number;
  }> {
    const matrix = await this.buildMatrix();
    const row = matrix.requirements.find((r) => r.id === requirementId);
    if (!row) throw new Error(`Requirement ${requirementId} not found`);
    return row;
  }
}

export const coverageMatrix = new CoverageMatrixEngine();
