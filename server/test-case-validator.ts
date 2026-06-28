/**
 * Test Case Validator
 * Validates AI-generated test cases against world-class standards
 * 
 * Quality checks:
 * - All steps are atomic (one action each)
 * - All selectors are valid (CSS-first, no vague references)
 * - All expected results observable
 * - All 10 coverage categories present
 * - No duplicate scenarios
 * - Confidence scores justified
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number;
  details?: {
    atomicityScore: number;
    selectorScore: number;
    coverageScore: number;
    observabilityScore: number;
    duplicateScore: number;
  };
}

export class TestCaseValidator {
  /**
   * Validate test case generation output
   */
  static validate(testCasesOutput: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 100;

    const details = {
      atomicityScore: 100,
      selectorScore: 100,
      coverageScore: 100,
      observabilityScore: 100,
      duplicateScore: 100,
    };

    // ===== STRUCTURAL VALIDATION =====
    if (!testCasesOutput) {
      errors.push("Output is empty or null");
      return { isValid: false, errors, warnings, score: 0, details };
    }

    if (!Array.isArray(testCasesOutput.testCases)) {
      errors.push("Root must have 'testCases' array");
      return { isValid: false, errors, warnings, score: 0, details };
    }

    const testCases = testCasesOutput.testCases;

    if (testCases.length === 0) {
      errors.push("No test cases generated");
      score -= 50;
    }

    // ===== PER-TEST-CASE VALIDATION =====
    const seenScenarios = new Set<string>();

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];

      // Validate testCaseId format
      if (!tc.testCaseId) {
        errors.push(`Test case ${i + 1}: missing testCaseId`);
        score -= 10;
      } else if (!tc.testCaseId.match(/^TC-\d+$/)) {
        warnings.push(`Test case ${i + 1}: unusual testCaseId format: ${tc.testCaseId}`);
        score -= 2;
      }

      // Validate title
      if (!tc.title) {
        errors.push(`Test case ${i + 1}: missing title`);
        score -= 10;
      } else if (tc.title.length > 150) {
        warnings.push(`Test case ${i + 1}: title too long (${tc.title.length} chars)`);
        score -= 3;
      }

      // Check for duplicates
      const scenario = `${tc.testType}|${tc.title}|${tc.description}`.toLowerCase();
      if (seenScenarios.has(scenario)) {
        errors.push(`Test case ${i + 1}: appears to be duplicate of earlier test`);
        details.duplicateScore -= 15;
        score -= 15;
      }
      seenScenarios.add(scenario);

      // ===== ATOMIC STEP VALIDATION =====
      if (!Array.isArray(tc.steps)) {
        errors.push(`Test case ${i + 1}: steps is not an array`);
        details.atomicityScore -= 20;
        score -= 20;
        continue;
      }

      if (tc.steps.length === 0) {
        errors.push(`Test case ${i + 1}: no steps defined`);
        details.atomicityScore -= 20;
        score -= 20;
        continue;
      }

      for (let j = 0; j < tc.steps.length; j++) {
        const step = tc.steps[j];

        // Steps arrive in two valid shapes:
        //   • selector-based { action, target, expected } — automation-ready
        //   • narrative      { step, expected }           — detailed functional
        //     business flow (the knowledge-driven format users ask for, e.g.
        //     "Navigate to Contract Management and click Create Contract").
        // Only selector-based steps get action/target validation; narrative
        // steps are validated for a meaningful instruction + observable result.
        const hasAction =
          typeof step.action === "string" && step.action.trim().length > 0;
        const instructionText =
          (typeof step.step === "string" && step.step.trim()) ||
          (typeof step.action === "string" && step.action.trim()) ||
          "";

        // Check if step combines multiple actions
        if (!this.isAtomicStep(step)) {
          errors.push(
            `Test case ${i + 1}, Step ${j + 1}: non-atomic step detected - "${step.action}" combines multiple actions`
          );
          details.atomicityScore -= 10;
          score -= 10;
        }

        if (hasAction) {
          // ===== SELECTOR-BASED STEP VALIDATION =====
          // Validate action is in allowed list
          const validActions = [
            "navigate",
            "click",
            "enter",
            "fillInput",
            "select",
            "verify",
            "wait",
            "scroll",
            "hover",
            "screenshot",
            "switchWindow",
            "acceptAlert",
            "fillForm",
            "logout",
          ];

          if (!validActions.includes(step.action)) {
            warnings.push(
              `Test case ${i + 1}, Step ${j + 1}: action "${step.action}" not in standard list`
            );
            score -= 3;
          }

          // ===== SELECTOR VALIDATION =====
          // Actions that don't require a target selector
          const noTargetActions = ["logout", "screenshot", "acceptAlert", "switchWindow", "wait"];

          if (!step.target && !noTargetActions.includes(step.action)) {
            errors.push(`Test case ${i + 1}, Step ${j + 1}: missing target (selector or URL)`);
            details.selectorScore -= 15;
            score -= 15;
          }

          if (step.target) {
            const selectorValidation = this.validateSelector(step.target);
            if (!selectorValidation.isValid) {
              errors.push(
                `Test case ${i + 1}, Step ${j + 1}: invalid selector format - "${step.target}". ${selectorValidation.reason}`
              );
              details.selectorScore -= 10;
              score -= 10;
            }

            if (selectorValidation.warnings && selectorValidation.warnings.length > 0) {
              selectorValidation.warnings.forEach((w) => {
                warnings.push(`Test case ${i + 1}, Step ${j + 1}: ${w}`);
              });
              details.selectorScore -= 2;
              score -= 2;
            }

            // Check for vague selectors - but allow specific patterns
            const isSpecificSelector =
              step.target.includes("[") ||      // Has attribute selector
              step.target.includes("#") ||       // Has ID selector
              step.target.includes(".") ||       // Has class selector
              step.target.startsWith("//") ||    // XPath
              step.target.startsWith("http") ||  // URL
              step.target.startsWith("/") ||     // Path
              step.target.includes("data-") ||   // Data attribute
              step.target.includes(":has-text"); // Playwright selector

            if (
              !isSpecificSelector &&
              (step.target.includes("the ") ||
               /^(button|field|element|input|link)$/i.test(step.target.trim()))
            ) {
              warnings.push(
                `Test case ${i + 1}, Step ${j + 1}: selector may be too vague - "${step.target}"`
              );
              details.selectorScore -= 3;
              score -= 3;
            }
          }
        } else {
          // ===== NARRATIVE STEP VALIDATION =====
          // Detailed functional steps don't carry CSS selectors — validate that
          // the instruction is present and substantive instead.
          if (!instructionText) {
            errors.push(`Test case ${i + 1}, Step ${j + 1}: missing step instruction`);
            details.atomicityScore -= 10;
            score -= 10;
          } else if (instructionText.length < 8) {
            warnings.push(
              `Test case ${i + 1}, Step ${j + 1}: step instruction too short - "${instructionText}"`
            );
            score -= 2;
          }
        }

        // ===== EXPECTED RESULT VALIDATION (both shapes) =====
        if (!step.expected) {
          errors.push(`Test case ${i + 1}, Step ${j + 1}: missing expected result`);
          details.observabilityScore -= 15;
          score -= 15;
        } else if (step.expected.length > 200) {
          warnings.push(
            `Test case ${i + 1}, Step ${j + 1}: expected result too long`
          );
          score -= 2;
        } else if (this.isVagueExpectation(step.expected)) {
          errors.push(
            `Test case ${i + 1}, Step ${j + 1}: expected result too vague - "${step.expected}". Expected results must be specific and observable.`
          );
          details.observabilityScore -= 10;
          score -= 10;
        }
      }

      // ===== CONFIDENCE SCORE VALIDATION =====
      if (tc.confidenceScore !== undefined) {
        if (tc.confidenceScore < 0 || tc.confidenceScore > 100) {
          warnings.push(`Test case ${i + 1}: confidence score out of range: ${tc.confidenceScore}`);
          score -= 5;
        }

        // Check if confidence score is justified
        const stepCount = tc.steps?.length || 0;
        const hasSpecificSelectors = tc.steps?.some((s: any) =>
          s.target && s.target.includes("[") && s.target.length > 10
        );
        // Narrative (knowledge-driven) steps carry no CSS selectors by design —
        // don't penalise their confidence for lacking them.
        const isNarrativeSuite = tc.steps?.every(
          (s: any) => !s.action && (typeof s.step === "string")
        );

        if (tc.confidenceScore >= 90 && !hasSpecificSelectors && !isNarrativeSuite) {
          warnings.push(
            `Test case ${i + 1}: high confidence score (${tc.confidenceScore}) but lacks specific selectors`
          );
          score -= 5;
        }
      }
    }

    // ===== COVERAGE VALIDATION =====
    const coverageSummary = testCasesOutput.coverageSummary || {};
    const byType = coverageSummary.byType || {};

    const requiredCategories = [
      "functional",
      "regression",
      "smoke",
      "negative",
      "boundary",
      "security",
      "accessibility",
      "performance",
    ];

    const missingCategories: string[] = [];
    for (const category of requiredCategories) {
      if (!byType[category] || byType[category] === 0) {
        missingCategories.push(category);
        details.coverageScore -= 12;
        score -= 12;
      }
    }

    if (missingCategories.length > 0) {
      errors.push(`Missing test coverage for: ${missingCategories.join(", ")}`);
    }

    // ===== OVERALL VALIDATION SUMMARY =====
    const hasAllCategories = missingCategories.length === 0;
    const noDuplicates = seenScenarios.size === testCases.length;

    const qualityGates = {
      hasAllCategories,
      noDuplicates,
      allSelectorsValid: details.selectorScore >= 80,
      allStepsAtomic: details.atomicityScore >= 80,
      errorHandlingIncluded: (byType.negative || 0) > 0,
    };

    // Normalize scores
    Object.keys(details).forEach((key) => {
      details[key as keyof typeof details] = Math.max(0, details[key as keyof typeof details]);
    });

    score = Math.max(0, Math.min(100, score));

    return {
      isValid: errors.length === 0 && hasAllCategories && noDuplicates,
      errors,
      warnings,
      score,
      details,
    };
  }

  /**
   * Check if step is atomic (single action)
   */
  private static isAtomicStep(step: any): boolean {
    // If step or action is missing, consider it atomic (other validation will catch missing fields)
    if (!step || !step.action) return true;

    // Keywords that indicate multiple actions combined
    const multiActionPatterns = [
      /\s+and then\s+/i,
      /\s+also\s+/i,
      /\s+then\s+/i,
      /\s+plus\s+/i,
      /\s+afterwards\s+/i,
      /first\s+\w+\s+then\s+/i,
      /both\s+\w+\s+and\s+\w+/i,
    ];

    const fullText = `${step.action} ${step.expected || ""} ${step.target || ""}`;

    for (const pattern of multiActionPatterns) {
      if (pattern.test(fullText)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate selector format
   */
  private static validateSelector(target: string): {
    isValid: boolean;
    reason?: string;
    warnings?: string[];
  } {
    if (!target) return { isValid: false, reason: "Target is empty" };

    const warnings: string[] = [];

    // Valid selector patterns
    const validPatterns = [
      // CSS selectors
      {
        pattern: /^[a-z0-9\[\]='"~^$*|:.#\-\s(),]+$/i,
        type: "CSS selector",
      },
      // XPath
      { pattern: /^\/\//, type: "XPath" },
      // URL/Path
      { pattern: /^https?:\/\//, type: "HTTP URL" },
      { pattern: /^\/[a-z0-9\-/_]*$/, type: "Path" },
      // Playwright selectors
      { pattern: /^button:has-text/, type: "Playwright text selector" },
      { pattern: /^text=/, type: "Playwright text locator" },
      // Data attributes
      { pattern: /data-[a-z\-]+/, type: "Data attribute" },
    ];

    let foundValid = false;
    for (const vp of validPatterns) {
      if (vp.pattern.test(target)) {
        foundValid = true;
        break;
      }
    }

    if (!foundValid) {
      return {
        isValid: false,
        reason: `Selector format not recognized: "${target}". Use CSS selectors, XPath, URLs, or Playwright selectors.`,
      };
    }

    // Check for common issues
    if (target.includes("{{") && target.includes("}}")) {
      // Parameterized selector - acceptable
    }

    if (target.length > 500) {
      warnings.push("Selector is very long - might be overly specific");
    }

    if (target.startsWith("//") && target.includes("[contains")) {
      warnings.push(
        "XPath with contains() can be fragile - consider CSS selector instead"
      );
    }

    if (target.includes("ng-") || target.includes("react-")) {
      warnings.push(
        "Selector uses framework-specific attributes - might break on framework updates"
      );
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Check if expected result is vague/non-observable
   */
  private static isVagueExpectation(expected: string): boolean {
    if (!expected) return true;

    const vaguePatterns = [
      /^(test passes|it works|success)$/i,
      /^(element|page|form|button|field|input) (appears|shows|displays|works)$/i,
      /^(works|done|complete|finished)$/i,
      /^verify .* (is|has) (visible|displayed|shown)$/i,
    ];

    const lower = expected.toLowerCase();

    // Check if it's very short and generic
    if (expected.length < 5) return true;

    // Check for vague patterns
    for (const pattern of vaguePatterns) {
      if (pattern.test(expected)) {
        return true;
      }
    }

    // Must include what specifically to verify or what to observe
    if (!expected.includes("'") && !expected.includes('"') && !expected.includes("message") && !expected.includes("error") && !expected.includes("alert") && !expected.includes("displayed")) {
      // Generic pattern without specific text/element
      if (lower.length < 20 && lower.split(" ").length < 4) {
        return true;
      }
    }

    return false;
  }
}
