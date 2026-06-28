/**
 * Knowledge Validator
 * ═══════════════════════════════════════════════════════════════════════════════
 * Validates AI-extracted knowledge BEFORE storing in the Knowledge Base.
 * Rejects hallucinated, empty, or low-quality entries.
 *
 * Rules:
 * 1. Object name must be present and non-trivial
 * 2. At least ONE of: businessProcess, fields, testPoints, validations
 * 3. Object names must look authentic (no obvious AI garbage)
 * 4. Confidence must be >= MIN_CONFIDENCE
 * 5. References (tables, objects) must exist in source text (anti-hallucination check)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { CanonicalKnowledge } from "./knowledge-structurer";
import type { ExtractionResult } from "./extractors/types";

export interface ValidationIssue {
  severity: "ERROR" | "WARNING";
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  score: number; // 0-100
  issues: ValidationIssue[];
}

export interface ValidatedKnowledge extends CanonicalKnowledge {
  validation: ValidationResult;
}

export class KnowledgeValidator {
  private readonly MIN_CONFIDENCE = 40;

  /**
   * Validate a single knowledge item against the source text.
   * Returns ValidationResult - check .isValid before saving.
   */
  validate(item: CanonicalKnowledge, sourceText?: string): ValidationResult {
    const issues: ValidationIssue[] = [];
    let score = 100;

    // RULE 1: Object name required
    if (!item.objectName || item.objectName.trim().length < 2) {
      issues.push({
        severity: "ERROR",
        field: "objectName",
        message: "Object name is missing or too short",
      });
      score -= 40;
    } else if (item.objectName === "UNKNOWN" || item.objectName === "N/A") {
      issues.push({
        severity: "ERROR",
        field: "objectName",
        message: "Object name is placeholder - AI couldn't identify a real object",
      });
      score -= 30;
    }

    // RULE 2: Must have at least one substantive fact
    const facts = item.facts || {};
    const hasContent =
      (facts.businessProcess && facts.businessProcess.length > 0) ||
      (facts.fields && facts.fields.length > 0) ||
      (facts.testPoints && facts.testPoints.length > 0) ||
      (facts.validations && facts.validations.length > 0) ||
      (facts.uiElements && facts.uiElements.length > 0) ||
      (facts.testableActions && facts.testableActions.length > 0);

    if (!hasContent) {
      issues.push({
        severity: "ERROR",
        field: "facts",
        message: "No substantive facts extracted (no process, fields, validations, or test points)",
      });
      score -= 30;
    }

    // RULE 3: Confidence threshold
    if (item.confidenceScore < this.MIN_CONFIDENCE) {
      issues.push({
        severity: "WARNING",
        field: "confidenceScore",
        message: `Low confidence (${item.confidenceScore}%) - below threshold ${this.MIN_CONFIDENCE}%`,
      });
      score -= 10;
    }

    // RULE 4: Anti-hallucination - tables and objects should appear in source
    if (sourceText) {
      const sourceLower = sourceText.toLowerCase();
      let hallucinatedRefs = 0;

      // Check tables
      if (facts.tables) {
        for (const tbl of facts.tables) {
          if (!sourceLower.includes(tbl.toLowerCase())) {
            hallucinatedRefs++;
          }
        }
      }

      // Check related objects
      if (facts.relatedObjects) {
        for (const obj of facts.relatedObjects) {
          // Be lenient - only flag if it looks like a specific code (P####, F####, etc.)
          if (/^[A-Z]\d{4,}$/.test(obj) && !sourceLower.includes(obj.toLowerCase())) {
            hallucinatedRefs++;
          }
        }
      }

      // Check primary object name
      if (item.objectName && /^[A-Z]\d{4,}$/.test(item.objectName)) {
        if (!sourceLower.includes(item.objectName.toLowerCase())) {
          issues.push({
            severity: "ERROR",
            field: "objectName",
            message: `Object "${item.objectName}" not found in source text (likely hallucinated)`,
          });
          score -= 35;
        }
      }

      if (hallucinatedRefs > 0) {
        issues.push({
          severity: "WARNING",
          field: "facts.tables/relatedObjects",
          message: `${hallucinatedRefs} reference(s) not found in source text - potential hallucination`,
        });
        score -= Math.min(20, hallucinatedRefs * 5);
      }
    }

    // RULE 5: Description quality
    if (facts.description) {
      if (facts.description.length < 10) {
        issues.push({
          severity: "WARNING",
          field: "facts.description",
          message: "Description is too short",
        });
        score -= 5;
      }
      if (facts.description.length > 500) {
        issues.push({
          severity: "WARNING",
          field: "facts.description",
          message: "Description is too long (should be 1-2 sentences)",
        });
        score -= 5;
      }
    }

    score = Math.max(0, Math.min(100, score));
    const hasErrors = issues.some((i) => i.severity === "ERROR");

    return {
      isValid: !hasErrors && score >= 50,
      score,
      issues,
    };
  }

  /**
   * Validate a batch and return only items that pass.
   */
  validateBatch(
    items: CanonicalKnowledge[],
    sourceText?: string
  ): {
    valid: ValidatedKnowledge[];
    rejected: ValidatedKnowledge[];
    summary: {
      total: number;
      valid: number;
      rejected: number;
      avgScore: number;
    };
  } {
    const valid: ValidatedKnowledge[] = [];
    const rejected: ValidatedKnowledge[] = [];

    for (const item of items) {
      const validation = this.validate(item, sourceText);
      const validated: ValidatedKnowledge = { ...item, validation };
      if (validation.isValid) valid.push(validated);
      else rejected.push(validated);
    }

    const totalScore = [...valid, ...rejected].reduce(
      (sum, v) => sum + v.validation.score,
      0
    );
    const avgScore = items.length > 0 ? Math.round(totalScore / items.length) : 0;

    return {
      valid,
      rejected,
      summary: {
        total: items.length,
        valid: valid.length,
        rejected: rejected.length,
        avgScore,
      },
    };
  }
}

export const knowledgeValidator = new KnowledgeValidator();
