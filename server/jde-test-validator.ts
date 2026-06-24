/**
 * ============================================================================
 * JDE TEST CASE VALIDATOR - AITAS Enterprise
 * ============================================================================
 * 
 * Step 8 of the JDE Test Generation Pipeline:
 * - Post-generation validation
 * - Blocks UI hallucination (click, input, navigate, selectors)
 * - Validates JDE completeness
 * - Ensures proper JDE terminology
 * 
 * This is the SAFETY NET that prevents bad test cases from being delivered.
 */

import { JDEDocumentClassification, JDEModule, getModuleGovernanceRules } from "./jde-document-classifier";

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface JDETestValidationResult {
  isValid: boolean;
  score: number;                          // 0-100
  passedChecks: string[];
  failedChecks: ValidationFailure[];
  warnings: ValidationWarning[];
  regenerateRequired: boolean;
  corrections: SuggestedCorrection[];
}

export interface ValidationFailure {
  checkId: string;
  severity: "critical" | "major" | "minor";
  message: string;
  affectedTestCases: string[];            // Test case IDs
  suggestion: string;
}

export interface ValidationWarning {
  checkId: string;
  message: string;
  affectedTestCases: string[];
}

export interface SuggestedCorrection {
  testCaseId: string;
  stepNumber: number;
  originalStep: string;
  correctedStep: string;
  reason: string;
}

export interface JDETestCase {
  testCaseId: string;
  title: string;
  objective?: string;
  testType: string;
  steps: Array<{
    stepNumber?: number;
    action?: string;
    step?: string;
    jdeAction?: string;
    expected?: string;
    expectedResult?: string;
  }>;
  preconditions?: string[];
  expectedResults?: string[];
  tablesToValidate?: Array<{
    tableName: string;
    validationQuery?: string;
    expectedResult?: string;
  }>;
  jdeObject?: string;
  module?: string;
  priority?: string;
}

// ============================================================================
// UI HALLUCINATION DETECTION
// ============================================================================

/**
 * UI-related terms that indicate hallucination in JDE functional tests
 * These should NOT appear in functional/business test cases
 */
const UI_HALLUCINATION_PATTERNS = [
  // Generic UI actions
  /\b(click|clicked|clicking)\s+(on\s+)?(the\s+)?button/gi,
  /\b(click|clicked|clicking)\s+(on\s+)?(the\s+)?link/gi,
  /\bfill\s+(in\s+)?(the\s+)?input/gi,
  /\benter\s+text\s+in\s+field/gi,
  /\btype\s+in\s+(the\s+)?text\s*box/gi,
  /\bselect\s+from\s+(the\s+)?dropdown/gi,
  /\bcheck\s+(the\s+)?checkbox/gi,
  /\buncheck\s+(the\s+)?checkbox/gi,
  /\btoggle\s+(the\s+)?switch/gi,
  
  // Navigation actions that are too generic
  /\bnavigate\s+to\s+URL/gi,
  /\bopen\s+(the\s+)?browser/gi,
  /\bgo\s+to\s+http/gi,
  /\bvisit\s+(the\s+)?(web\s+)?page/gi,
  /\brefresh\s+(the\s+)?page/gi,
  /\bscroll\s+(up|down|to)/gi,
  
  // Selectors and locators
  /\bdata-testid/gi,
  /\bxpath/gi,
  /\bcss\s+selector/gi,
  /\bid=["']/gi,
  /\bclass=["']/gi,
  /\b\.css\b/gi,
  /\bfindElement/gi,
  /\bgetElementBy/gi,
  /\bquerySelector/gi,
  
  // Web-specific actions
  /\bwait\s+for\s+(element|page|load)/gi,
  /\bhover\s+(over|on)/gi,
  /\bdrag\s+and\s+drop/gi,
  /\bright-click/gi,
  /\bdouble-click/gi,
  /\bmouseover/gi,
  
  // Framework-specific
  /\bplaywright\b/gi,
  /\bselenium\b/gi,
  /\bcypress\b/gi,
  /\bpuppeteer\b/gi,
  /\bwebdriver\b/gi,
];

/**
 * Valid JDE action patterns - these ARE acceptable
 */
const VALID_JDE_ACTION_PATTERNS = [
  /\blaunch\s+P\d{4,5}/gi,              // Launch P4210
  /\bopen\s+P\d{4,5}/gi,                // Open P4310
  /\baccess\s+P\d{4,5}/gi,              // Access P0411
  /\bnavigate\s+to\s+P\d{4,5}/gi,       // Navigate to P4210
  /\brun\s+R\d{4,5}/gi,                 // Run R42800
  /\bsubmit\s+R\d{4,5}/gi,              // Submit R04500
  /\bexecute\s+R\d{4,5}/gi,             // Execute R42800
  /\benter\s+(supplier|customer|item|order|invoice)/gi,  // Enter supplier number
  /\bselect\s+version/gi,               // Select version
  /\bvalidate\s+F\d{4,6}/gi,            // Validate F4211
  /\bquery\s+F\d{4,6}/gi,               // Query F0911
  /\bverify\s+(record|entry|status)/gi, // Verify record exists
  /\bsave\s+(order|PO|voucher|entry)/gi, // Save the order
  /\bapprove\s+(order|PO|voucher)/gi,   // Approve the PO
  /\btoolbar\s+(Find|OK|Cancel|Add|Delete)/gi, // Toolbar actions
  /\bQBE\s+(field|search)/gi,           // QBE actions
  /\bprocessing\s+option/gi,            // Processing options
];

/**
 * Check if a step contains UI hallucination
 */
function detectUIHallucination(stepText: string): {
  hasHallucination: boolean;
  matches: string[];
} {
  const matches: string[] = [];
  
  for (const pattern of UI_HALLUCINATION_PATTERNS) {
    const match = stepText.match(pattern);
    if (match) {
      matches.push(match[0]);
    }
  }
  
  // Check if it's actually a valid JDE action (false positive check)
  for (const validPattern of VALID_JDE_ACTION_PATTERNS) {
    if (validPattern.test(stepText)) {
      // This is a valid JDE action, remove from matches
      return { hasHallucination: false, matches: [] };
    }
  }
  
  return {
    hasHallucination: matches.length > 0,
    matches
  };
}

// ============================================================================
// JDE COMPLETENESS VALIDATION
// ============================================================================

/**
 * Check if test cases reference required JDE programs for the module
 */
function validateJDECompleteness(
  testCases: JDETestCase[],
  classification: JDEDocumentClassification
): {
  programsCovered: string[];
  programsMissing: string[];
  tablesCovered: string[];
  tablesMissing: string[];
  isComplete: boolean;
} {
  const governance = getModuleGovernanceRules(classification.jde_module);
  
  // Extract all programs and tables mentioned in test cases
  const allTestText = testCases.map(tc => {
    const stepsText = tc.steps?.map(s => `${s.action || s.step || ''} ${s.expected || s.expectedResult || ''}`).join(' ') || '';
    const tablesText = tc.tablesToValidate?.map(t => t.tableName).join(' ') || '';
    return `${tc.title} ${tc.objective || ''} ${stepsText} ${tablesText}`;
  }).join(' ');
  
  const mentionedPrograms = Array.from(new Set((allTestText.match(/P\d{4,5}[A-Z]?/gi) || []).map(p => p.toUpperCase())));
  const mentionedTables = Array.from(new Set((allTestText.match(/F\d{4,6}/gi) || []).map(t => t.toUpperCase())));
  
  // Compare against requirements
  const programsCovered = governance.required_programs.filter(p => mentionedPrograms.includes(p));
  const programsMissing = governance.required_programs.filter(p => !mentionedPrograms.includes(p));
  const tablesCovered = governance.required_tables.filter(t => mentionedTables.includes(t));
  const tablesMissing = governance.required_tables.filter(t => !mentionedTables.includes(t));
  
  const isComplete = programsMissing.length === 0 || governance.required_programs.length === 0;
  
  return {
    programsCovered,
    programsMissing,
    tablesCovered,
    tablesMissing,
    isComplete
  };
}

/**
 * Check if test cases use proper JDE terminology
 */
function validateJDETerminology(testCases: JDETestCase[]): {
  correctTerms: string[];
  incorrectTerms: Array<{ found: string; suggested: string; location: string }>;
} {
  const termMappings: Record<string, string> = {
    'purchase order form': 'P4310 - Purchase Order Entry',
    'sales order screen': 'P4210 - Sales Order Entry',
    'po entry': 'P4310 - Purchase Order Entry',
    'so entry': 'P4210 - Sales Order Entry',
    'vendor': 'Supplier',
    'vendor number': 'Supplier Number (AN8)',
    'customer form': 'P01012 - Address Book Revisions',
    'invoice form': 'P0411 - Voucher Entry',
    'gl entry': 'P09101 - Journal Entry',
    'save button': 'OK toolbar button',
    'search button': 'Find toolbar button',
    'submit': 'Submit batch job',
  };
  
  const correctTerms: string[] = [];
  const incorrectTerms: Array<{ found: string; suggested: string; location: string }> = [];
  
  for (const tc of testCases) {
    const allText = [
      tc.title,
      tc.objective,
      ...(tc.steps?.map(s => s.action || s.step || '') || [])
    ].join(' ').toLowerCase();
    
    for (const [incorrect, correct] of Object.entries(termMappings)) {
      if (allText.includes(incorrect.toLowerCase())) {
        incorrectTerms.push({
          found: incorrect,
          suggested: correct,
          location: tc.testCaseId
        });
      }
    }
    
    // Check for correct JDE terms
    if (/P\d{4,5}/i.test(allText)) correctTerms.push('JDE Program IDs');
    if (/F\d{4,6}/i.test(allText)) correctTerms.push('JDE Table Names');
    if (/R\d{4,5}/i.test(allText)) correctTerms.push('JDE Report Names');
  }
  
  return {
    correctTerms: Array.from(new Set(correctTerms)),
    incorrectTerms
  };
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate generated JDE test cases
 */
export function validateJDETestCases(
  testCases: JDETestCase[],
  classification: JDEDocumentClassification
): JDETestValidationResult {
  const passedChecks: string[] = [];
  const failedChecks: ValidationFailure[] = [];
  const warnings: ValidationWarning[] = [];
  const corrections: SuggestedCorrection[] = [];
  
  // =========================================================================
  // CHECK 1: UI Hallucination Detection (CRITICAL)
  // =========================================================================
  const hallucinatingTestCases: string[] = [];
  
  for (const tc of testCases) {
    for (let i = 0; i < (tc.steps?.length || 0); i++) {
      const step = tc.steps[i];
      const stepText = step.action || step.step || '';
      const detection = detectUIHallucination(stepText);
      
      if (detection.hasHallucination) {
        hallucinatingTestCases.push(tc.testCaseId);
        
        // Suggest correction
        let correctedStep = stepText;
        for (const match of detection.matches) {
          if (match.toLowerCase().includes('click')) {
            correctedStep = stepText.replace(/click\s+(on\s+)?(the\s+)?button/gi, 'Select the toolbar option');
          }
          if (match.toLowerCase().includes('input')) {
            correctedStep = stepText.replace(/fill\s+(in\s+)?(the\s+)?input/gi, 'Enter value in field');
          }
        }
        
        corrections.push({
          testCaseId: tc.testCaseId,
          stepNumber: step.stepNumber || (i + 1),
          originalStep: stepText,
          correctedStep,
          reason: `UI-specific action detected: "${detection.matches.join(', ')}". Use JDE-native terminology.`
        });
      }
    }
  }
  
  if (hallucinatingTestCases.length > 0) {
    failedChecks.push({
      checkId: "UI_HALLUCINATION",
      severity: "critical",
      message: `UI automation steps detected in ${hallucinatingTestCases.length} test case(s). JDE functional tests should use application-level actions, not UI automation.`,
      affectedTestCases: Array.from(new Set(hallucinatingTestCases)),
      suggestion: "Replace UI actions (click, input, navigate) with JDE application actions (Launch P4210, Enter supplier, Select version)"
    });
  } else {
    passedChecks.push("UI_HALLUCINATION: No UI automation hallucination detected");
  }
  
  // =========================================================================
  // CHECK 2: JDE Program Coverage
  // =========================================================================
  const completeness = validateJDECompleteness(testCases, classification);
  
  if (completeness.programsMissing.length > 0) {
    warnings.push({
      checkId: "PROGRAM_COVERAGE",
      message: `Missing coverage for required programs: ${completeness.programsMissing.join(', ')}`,
      affectedTestCases: []
    });
  } else if (completeness.programsCovered.length > 0) {
    passedChecks.push(`PROGRAM_COVERAGE: All required programs covered (${completeness.programsCovered.join(', ')})`);
  }
  
  // =========================================================================
  // CHECK 3: Table Validation
  // =========================================================================
  const hasTableValidation = testCases.some(tc => tc.tablesToValidate && tc.tablesToValidate.length > 0);
  
  if (!hasTableValidation) {
    warnings.push({
      checkId: "TABLE_VALIDATION",
      message: "No table-level validation included. Consider adding F-table verifications for data accuracy.",
      affectedTestCases: []
    });
  } else {
    passedChecks.push("TABLE_VALIDATION: Table validation included");
  }
  
  // =========================================================================
  // CHECK 4: JDE Terminology
  // =========================================================================
  const terminology = validateJDETerminology(testCases);
  
  if (terminology.incorrectTerms.length > 0) {
    warnings.push({
      checkId: "JDE_TERMINOLOGY",
      message: `Found ${terminology.incorrectTerms.length} terms that could use JDE-specific terminology`,
      affectedTestCases: terminology.incorrectTerms.map(t => t.location)
    });
  }
  if (terminology.correctTerms.length > 0) {
    passedChecks.push(`JDE_TERMINOLOGY: Uses correct JDE terms (${terminology.correctTerms.join(', ')})`);
  }
  
  // =========================================================================
  // CHECK 5: Test Case Structure
  // =========================================================================
  const structureIssues: string[] = [];
  
  for (const tc of testCases) {
    if (!tc.steps || tc.steps.length === 0) {
      structureIssues.push(tc.testCaseId);
    }
    if (!tc.preconditions || tc.preconditions.length === 0) {
      warnings.push({
        checkId: "MISSING_PRECONDITIONS",
        message: `Test case ${tc.testCaseId} has no preconditions defined`,
        affectedTestCases: [tc.testCaseId]
      });
    }
  }
  
  if (structureIssues.length > 0) {
    failedChecks.push({
      checkId: "TEST_STRUCTURE",
      severity: "major",
      message: `${structureIssues.length} test case(s) have no steps defined`,
      affectedTestCases: structureIssues,
      suggestion: "Each test case must have at least one executable step"
    });
  } else {
    passedChecks.push("TEST_STRUCTURE: All test cases have steps");
  }
  
  // =========================================================================
  // CHECK 6: Document Type Appropriateness
  // =========================================================================
  if (classification.document_type === "JDE_IMPLEMENTATION_GUIDE" && !classification.supports_ui_automation) {
    // Check if any test case claims to be UI automation
    const uiTestCases = testCases.filter(tc => 
      tc.testType?.toLowerCase().includes('ui') || 
      tc.testType?.toLowerCase().includes('automation')
    );
    
    if (uiTestCases.length > 0) {
      failedChecks.push({
        checkId: "INAPPROPRIATE_TEST_TYPE",
        severity: "critical",
        message: "UI automation test cases generated from an implementation guide. Implementation guides do not contain UI specifications.",
        affectedTestCases: uiTestCases.map(tc => tc.testCaseId),
        suggestion: "Change test type to 'functional' or 'configuration'. Implementation guides support business/functional testing only."
      });
    }
  }
  
  // =========================================================================
  // CALCULATE FINAL SCORE
  // =========================================================================
  const criticalFailures = failedChecks.filter(f => f.severity === "critical").length;
  const majorFailures = failedChecks.filter(f => f.severity === "major").length;
  const minorFailures = failedChecks.filter(f => f.severity === "minor").length;
  
  let score = 100;
  score -= criticalFailures * 30;
  score -= majorFailures * 15;
  score -= minorFailures * 5;
  score -= warnings.length * 2;
  score = Math.max(0, score);
  
  const isValid = criticalFailures === 0;
  const regenerateRequired = criticalFailures > 0;
  
  return {
    isValid,
    score,
    passedChecks,
    failedChecks,
    warnings,
    regenerateRequired,
    corrections
  };
}

/**
 * Auto-correct test cases by applying suggested corrections
 */
export function autoCorrectTestCases(
  testCases: JDETestCase[],
  corrections: SuggestedCorrection[]
): JDETestCase[] {
  const corrected = JSON.parse(JSON.stringify(testCases)) as JDETestCase[];
  
  for (const correction of corrections) {
    const tc = corrected.find(t => t.testCaseId === correction.testCaseId);
    if (tc && tc.steps) {
      const step = tc.steps.find(s => (s.stepNumber || 0) === correction.stepNumber);
      if (step) {
        if (step.action) {
          step.action = correction.correctedStep;
        } else if (step.step) {
          step.step = correction.correctedStep;
        }
      }
    }
  }
  
  return corrected;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  validateJDETestCases,
  autoCorrectTestCases,
  detectUIHallucination
};
