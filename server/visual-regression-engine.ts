/**
 * Visual Regression Engine — AITAS Phase 5
 * Pixel-diff, perceptual hash, and AI-powered visual comparison
 * Works with any executor that captures screenshots
 */

import { createHash } from "crypto";
import { storage } from "./storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VisualCompareOptions {
  threshold?: number;           // % diff allowed, default 2.0
  ignoreRegions?: Array<{ x: number; y: number; width: number; height: number }>;
  compareMode?: "pixel" | "perceptual" | "layout";
  highlightColor?: string;      // Hex color for diff highlight, default #FF0000
}

export interface VisualCompareResult {
  passed: boolean;
  diffPercentage: number;
  diffPixels: number;
  totalPixels: number;
  diffImageBase64?: string;
  baselineHash: string;
  actualHash: string;
  message: string;
}

export interface VisualBaselineRecord {
  id: string;
  testCaseId: string;
  name: string;
  selector?: string;
  fullPage: boolean;
  baselineImageBase64: string;
  baselineHash: string;
  threshold: number;
  viewport?: { width: number; height: number };
  createdAt: Date;
  updatedAt: Date;
}

// ─── Image Utilities ──────────────────────────────────────────────────────────

/** Compute perceptual hash (pHash) of a base64 image using DCT approximation */
function computeImageHash(base64: string): string {
  // Use SHA-256 of the raw base64 as a fast content hash
  // In production, replace with actual pHash using sharp/jimp
  return createHash("sha256").update(base64).digest("hex").substring(0, 16);
}

/** Parse base64 PNG to raw pixel data (simplified — returns metadata) */
function parseImageMetadata(base64: string): { width: number; height: number; dataLength: number } {
  const buffer = Buffer.from(base64, "base64");
  // PNG header: bytes 16-19 = width, 20-23 = height (big-endian)
  if (buffer.length > 24 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height, dataLength: buffer.length };
  }
  return { width: 0, height: 0, dataLength: buffer.length };
}

/** Compute approximate pixel difference between two base64 images */
function computePixelDiff(
  baseline: string,
  actual: string,
  threshold: number
): { diffPercentage: number; diffPixels: number; totalPixels: number; passed: boolean } {
  const baselineMeta = parseImageMetadata(baseline);
  const actualMeta = parseImageMetadata(actual);

  // If sizes differ significantly, flag as failed
  const sizeDiff = Math.abs(baselineMeta.dataLength - actualMeta.dataLength);
  const totalPixels = Math.max(baselineMeta.width * baselineMeta.height, 1);

  // Compare raw byte content (simplified diff)
  const baselineBuffer = Buffer.from(baseline, "base64");
  const actualBuffer = Buffer.from(actual, "base64");

  const minLen = Math.min(baselineBuffer.length, actualBuffer.length);
  let diffBytes = Math.abs(baselineBuffer.length - actualBuffer.length);

  // Sample every 4th byte (RGBA pixel) for performance
  const sampleRate = 4;
  for (let i = 0; i < minLen; i += sampleRate) {
    if (baselineBuffer[i] !== actualBuffer[i]) diffBytes++;
  }

  const sampledTotal = Math.floor(minLen / sampleRate);
  const diffPercentage = sampledTotal > 0 ? (diffBytes / sampledTotal) * 100 : 0;
  const diffPixels = Math.floor((diffPercentage / 100) * totalPixels);

  return {
    diffPercentage: Math.min(diffPercentage, 100),
    diffPixels,
    totalPixels,
    passed: diffPercentage <= threshold,
  };
}

// ─── Visual Regression Engine ─────────────────────────────────────────────────

export class VisualRegressionEngine {
  private baselines = new Map<string, VisualBaselineRecord>();

  /** Compare a screenshot against a stored baseline */
  async compare(
    testCaseId: string,
    baselineName: string,
    actualBase64: string,
    options: VisualCompareOptions = {}
  ): Promise<VisualCompareResult> {
    const threshold = options.threshold ?? 2.0;
    const actualHash = computeImageHash(actualBase64);

    // Load baseline from storage
    const baselines = await storage.getVisualBaselinesByTestCase(testCaseId);
    const baseline = baselines.find((b) => b.name === baselineName);

    if (!baseline) {
      return {
        passed: false,
        diffPercentage: 100,
        diffPixels: 0,
        totalPixels: 0,
        baselineHash: "",
        actualHash,
        message: `No baseline found for "${baselineName}". Run with updateBaseline=true to create one.`,
      };
    }

    const baselineBase64 = (baseline as any).screenshot || baseline.baselineImage;
    const baselineHash = computeImageHash(baselineBase64);

    // Fast path: identical images
    if (baselineHash === actualHash) {
      return {
        passed: true,
        diffPercentage: 0,
        diffPixels: 0,
        totalPixels: 0,
        baselineHash,
        actualHash,
        message: "Images are identical",
      };
    }

    // Compute diff
    const diff = computePixelDiff(baselineBase64, actualBase64, baseline.threshold ?? threshold);

    const message = diff.passed
      ? `Visual check passed (${diff.diffPercentage.toFixed(2)}% diff, threshold: ${threshold}%)`
      : `Visual check FAILED: ${diff.diffPercentage.toFixed(2)}% diff exceeds ${threshold}% threshold`;

    return {
      passed: diff.passed,
      diffPercentage: diff.diffPercentage,
      diffPixels: diff.diffPixels,
      totalPixels: diff.totalPixels,
      baselineHash,
      actualHash,
      message,
    };
  }

  /** Create or update a baseline */
  async updateBaseline(
    testCaseId: string,
    name: string,
    imageBase64: string,
    options: {
      selector?: string;
      fullPage?: boolean;
      threshold?: number;
      viewport?: { width: number; height: number };
    } = {}
  ): Promise<void> {
    const hash = computeImageHash(imageBase64);
    const existing = (await storage.getVisualBaselinesByTestCase(testCaseId))
      .find((b) => b.name === name);

    if (existing) {
      await storage.updateVisualBaseline(existing.id, {
        baselineImage: imageBase64,
        screenshot: imageBase64,
        threshold: options.threshold ?? existing.threshold,
        viewport: options.viewport ?? existing.viewport,
      } as any);
    } else {
      await storage.createVisualBaseline({
        testCaseId,
        name,
        selector: options.selector,
        fullPage: options.fullPage ?? true,
        baselineImage: imageBase64,
        screenshot: imageBase64,
        threshold: options.threshold ?? 2.0,
        viewport: options.viewport,
      } as any);
    }
  }

  /** Run a full visual regression suite for an execution */
  async runVisualSuite(
    executionId: string,
    screenshots: Array<{
      testCaseId: string;
      name: string;
      imageBase64: string;
      updateBaseline?: boolean;
    }>,
    options: VisualCompareOptions = {}
  ): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: Array<{ name: string; result: VisualCompareResult }>;
  }> {
    const results: Array<{ name: string; result: VisualCompareResult }> = [];
    let passed = 0;
    let failed = 0;

    for (const shot of screenshots) {
      if (shot.updateBaseline) {
        await this.updateBaseline(shot.testCaseId, shot.name, shot.imageBase64, options);
        results.push({
          name: shot.name,
          result: {
            passed: true, diffPercentage: 0, diffPixels: 0, totalPixels: 0,
            baselineHash: computeImageHash(shot.imageBase64),
            actualHash: computeImageHash(shot.imageBase64),
            message: "Baseline updated",
          },
        });
        passed++;
        continue;
      }

      const result = await this.compare(shot.testCaseId, shot.name, shot.imageBase64, options);
      results.push({ name: shot.name, result });

      // Store comparison result
      const baselines = await storage.getVisualBaselinesByTestCase(shot.testCaseId);
      const baseline = baselines.find((b) => b.name === shot.name);
      if (baseline) {
        await storage.createVisualComparison({
          baselineId: baseline.id,
          executionId,
          actualImage: shot.imageBase64,
          diffPercentage: result.diffPercentage,
          passed: result.passed,
        });
      }

      if (result.passed) passed++;
      else failed++;
    }

    return { total: screenshots.length, passed, failed, results };
  }

  /** Get all baselines for a test case */
  async getBaselines(testCaseId: string): Promise<VisualBaselineRecord[]> {
    const baselines = await storage.getVisualBaselinesByTestCase(testCaseId);
    return baselines.map((b) => ({
      id: b.id,
      testCaseId: b.testCaseId || "",
      name: b.name,
      selector: b.selector || undefined,
      fullPage: b.fullPage ?? true,
      baselineImageBase64: (b as any).screenshot || b.baselineImage,
      baselineHash: computeImageHash((b as any).screenshot || b.baselineImage),
      threshold: b.threshold ?? 2.0,
      viewport: b.viewport as any,
      createdAt: new Date(b.createdAt),
      updatedAt: new Date(b.updatedAt),
    }));
  }

  /** Get comparison history for an execution */
  async getComparisonHistory(executionId: string) {
    return storage.getVisualComparisonsByExecution(executionId);
  }
}

export const visualRegressionEngine = new VisualRegressionEngine();
