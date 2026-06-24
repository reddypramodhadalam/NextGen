/**
 * ============================================================================
 * JDE DOCUMENT CLASSIFIER - AITAS Enterprise
 * ============================================================================
 * 
 * Step 1-2 of the JDE Test Generation Pipeline:
 * - Classifies uploaded JDE documents
 * - Determines supported test types
 * - Blocks inappropriate test generation (e.g., UI automation from impl guides)
 * 
 * This is CRITICAL for preventing bad test case generation.
 */

// ============================================================================
// DOCUMENT CLASSIFICATION TYPES
// ============================================================================

export type JDEDocumentType = 
  | "JDE_IMPLEMENTATION_GUIDE"
  | "JDE_CONFIGURATION_MANUAL"
  | "JDE_FUNCTIONAL_SPECIFICATION"
  | "JDE_TECHNICAL_DESIGN"
  | "JDE_USER_GUIDE"
  | "JDE_PROCESS_DOCUMENT"
  | "JDE_TEST_SPECIFICATION"
  | "UNKNOWN";

export type JDEModule = 
  | "PROCUREMENT"
  | "ORDER_MANAGEMENT"
  | "ACCOUNTS_PAYABLE"
  | "ACCOUNTS_RECEIVABLE"
  | "GENERAL_LEDGER"
  | "INVENTORY"
  | "MANUFACTURING"
  | "FIXED_ASSETS"
  | "PAYROLL"
  | "ADDRESS_BOOK"
  | "MULTIPLE"
  | "UNKNOWN";

export interface JDEDocumentClassification {
  document_type: JDEDocumentType;
  jde_module: JDEModule;
  jde_release: string;
  
  // Test type support flags
  supports_ui_automation: boolean;
  supports_functional_testing: boolean;
  supports_configuration_testing: boolean;
  supports_integration_testing: boolean;
  supports_data_validation: boolean;
  
  // Detected content indicators
  detected_programs: string[];        // P4310, P4210, etc.
  detected_reports: string[];         // R42800, R04500, etc.
  detected_tables: string[];          // F4311, F0911, etc.
  detected_udcs: string[];            // UDC codes
  detected_aais: boolean;             // AAI references found
  detected_processing_options: boolean;
  detected_business_flows: boolean;
  detected_ui_selectors: boolean;     // Critical: if true, may support UI automation
  detected_urls: boolean;             // URLs indicate potential web testing
  
  // Confidence
  confidence_score: number;           // 0-100
  classification_reasoning: string;
}

export interface TestTypeDecision {
  allowed_test_types: TestType[];
  blocked_test_types: TestType[];
  blocking_reasons: Record<string, string>;
  override_allowed: boolean;
}

export type TestType = 
  | "functional"
  | "configuration"
  | "integration"
  | "data_validation"
  | "negative"
  | "end_to_end"
  | "ui_automation"
  | "regression";

// ============================================================================
// DOCUMENT CLASSIFICATION SIGNALS
// ============================================================================

interface ClassificationSignal {
  pattern: RegExp;
  weight: number;
  indicates: {
    documentType?: JDEDocumentType;
    module?: JDEModule;
    feature?: keyof JDEDocumentClassification;
  };
}

const CLASSIFICATION_SIGNALS: ClassificationSignal[] = [
  // Document type signals
  { pattern: /implementation\s+guide/gi, weight: 10, indicates: { documentType: "JDE_IMPLEMENTATION_GUIDE" } },
  { pattern: /configuration\s+manual/gi, weight: 10, indicates: { documentType: "JDE_CONFIGURATION_MANUAL" } },
  { pattern: /functional\s+specification/gi, weight: 10, indicates: { documentType: "JDE_FUNCTIONAL_SPECIFICATION" } },
  { pattern: /technical\s+design/gi, weight: 10, indicates: { documentType: "JDE_TECHNICAL_DESIGN" } },
  { pattern: /user\s+guide/gi, weight: 10, indicates: { documentType: "JDE_USER_GUIDE" } },
  { pattern: /test\s+(plan|specification|cases)/gi, weight: 10, indicates: { documentType: "JDE_TEST_SPECIFICATION" } },
  { pattern: /business\s+process/gi, weight: 8, indicates: { documentType: "JDE_PROCESS_DOCUMENT" } },
  
  // Module signals
  { pattern: /procurement|purchasing|supplier|P43\d{2}|F43\d{2}/gi, weight: 8, indicates: { module: "PROCUREMENT" } },
  { pattern: /sales\s+order|order\s+management|P42\d{2}|F42\d{2}/gi, weight: 8, indicates: { module: "ORDER_MANAGEMENT" } },
  { pattern: /accounts\s+payable|voucher|payment|P04\d{2}|F04\d{2}/gi, weight: 8, indicates: { module: "ACCOUNTS_PAYABLE" } },
  { pattern: /accounts\s+receivable|invoice|receipt|P03B\d{2}|F03B\d{2}/gi, weight: 8, indicates: { module: "ACCOUNTS_RECEIVABLE" } },
  { pattern: /general\s+ledger|journal|G\/L|P09\d{2}|F09\d{2}/gi, weight: 8, indicates: { module: "GENERAL_LEDGER" } },
  { pattern: /inventory|stock|warehouse|P41\d{2}|F41\d{2}/gi, weight: 8, indicates: { module: "INVENTORY" } },
  { pattern: /manufacturing|production|work\s+order|P48\d{2}/gi, weight: 8, indicates: { module: "MANUFACTURING" } },
  { pattern: /fixed\s+asset|depreciation|P12\d{2}|F12\d{2}/gi, weight: 8, indicates: { module: "FIXED_ASSETS" } },
  { pattern: /payroll|employee|P07\d{2}|F07\d{2}/gi, weight: 8, indicates: { module: "PAYROLL" } },
  { pattern: /address\s+book|customer|supplier\s+master|P01\d{2}|F01\d{2}/gi, weight: 8, indicates: { module: "ADDRESS_BOOK" } },
  
  // UI automation blockers (implementation guides typically have these)
  { pattern: /AAI|automatic\s+accounting\s+instruction/gi, weight: 5, indicates: { feature: "detected_aais" } },
  { pattern: /processing\s+option/gi, weight: 5, indicates: { feature: "detected_processing_options" } },
  { pattern: /UDC|user\s+defined\s+code/gi, weight: 3, indicates: { feature: "detected_udcs" } },
  
  // UI automation enablers (test specs or UI guides may have these)
  { pattern: /click|button|input\s+field|text\s+box|dropdown|checkbox/gi, weight: -5, indicates: { feature: "detected_ui_selectors" } },
  { pattern: /http[s]?:\/\/|localhost|\.jde\.|web\s+client/gi, weight: -3, indicates: { feature: "detected_urls" } },
  { pattern: /selector|xpath|css\s+class|data-testid|id=["']/gi, weight: -10, indicates: { feature: "detected_ui_selectors" } },
];

// ============================================================================
// CLASSIFICATION FUNCTIONS
// ============================================================================

/**
 * Classify a JDE document based on its content
 */
export function classifyJDEDocument(text: string): JDEDocumentClassification {
  const normalizedText = text.toLowerCase();
  
  // Extract JDE objects
  const programs = Array.from(new Set((text.match(/P\d{4,5}[A-Z]?/gi) || []).map(p => p.toUpperCase())));
  const reports = Array.from(new Set((text.match(/R\d{4,5}[A-Z]?/gi) || []).map(r => r.toUpperCase())));
  const tables = Array.from(new Set((text.match(/F\d{4,6}/gi) || []).map(t => t.toUpperCase())));
  
  // Count signal matches
  const signalCounts: Record<string, number> = {};
  const moduleVotes: Record<string, number> = {};
  const docTypeVotes: Record<string, number> = {};
  
  let detected_aais = false;
  let detected_processing_options = false;
  let detected_ui_selectors = false;
  let detected_urls = false;
  let detected_business_flows = false;
  
  // Analyze signals
  for (const signal of CLASSIFICATION_SIGNALS) {
    const matches = text.match(signal.pattern);
    if (matches) {
      const count = matches.length;
      
      if (signal.indicates.module) {
        moduleVotes[signal.indicates.module] = (moduleVotes[signal.indicates.module] || 0) + (count * signal.weight);
      }
      if (signal.indicates.documentType) {
        docTypeVotes[signal.indicates.documentType] = (docTypeVotes[signal.indicates.documentType] || 0) + (count * signal.weight);
      }
      if (signal.indicates.feature === "detected_aais") detected_aais = true;
      if (signal.indicates.feature === "detected_processing_options") detected_processing_options = true;
      if (signal.indicates.feature === "detected_ui_selectors") detected_ui_selectors = count > 3; // Need multiple matches
      if (signal.indicates.feature === "detected_urls") detected_urls = true;
    }
  }
  
  // Check for business flow indicators
  detected_business_flows = /procure.to.pay|order.to.cash|quote.to.cash|hire.to.retire|record.to.report/gi.test(text);
  
  // Determine document type
  let document_type: JDEDocumentType = "UNKNOWN";
  let maxDocTypeVotes = 0;
  for (const [docType, votes] of Object.entries(docTypeVotes)) {
    if (votes > maxDocTypeVotes) {
      maxDocTypeVotes = votes;
      document_type = docType as JDEDocumentType;
    }
  }
  
  // Determine module
  let jde_module: JDEModule = "UNKNOWN";
  let maxModuleVotes = 0;
  const moduleHits = Object.entries(moduleVotes).filter(([_, v]) => v > 0);
  if (moduleHits.length > 1) {
    jde_module = "MULTIPLE";
  } else {
    for (const [module, votes] of Object.entries(moduleVotes)) {
      if (votes > maxModuleVotes) {
        maxModuleVotes = votes;
        jde_module = module as JDEModule;
      }
    }
  }
  
  // Extract UDCs
  const detected_udcs = Array.from(new Set((text.match(/UDC\s+\d{2}\/\w+|code\s+\d{2}\/\w+/gi) || [])));
  
  // Detect JDE release
  let jde_release = "E1 9.2"; // Default assumption
  const releaseMatch = text.match(/(?:JD\s*Edwards|E1|EnterpriseOne)\s*(\d+\.?\d*)/i);
  if (releaseMatch) {
    jde_release = `E1 ${releaseMatch[1]}`;
  }
  
  // Determine test type support
  // KEY LOGIC: Implementation guides should NOT support UI automation
  const isImplementationOrConfig = 
    document_type === "JDE_IMPLEMENTATION_GUIDE" || 
    document_type === "JDE_CONFIGURATION_MANUAL" ||
    document_type === "JDE_PROCESS_DOCUMENT";
  
  const hasUIContent = detected_ui_selectors && detected_urls;
  
  const supports_ui_automation = !isImplementationOrConfig && hasUIContent;
  const supports_functional_testing = programs.length > 0 || detected_business_flows;
  const supports_configuration_testing = detected_aais || detected_processing_options || detected_udcs.length > 0;
  const supports_integration_testing = tables.length > 2 || detected_business_flows;
  const supports_data_validation = tables.length > 0;
  
  // Calculate confidence
  let confidence_score = 50;
  if (programs.length > 0) confidence_score += 15;
  if (tables.length > 0) confidence_score += 10;
  if (detected_aais || detected_processing_options) confidence_score += 10;
  if (document_type !== "UNKNOWN") confidence_score += 10;
  if (jde_module !== "UNKNOWN") confidence_score += 5;
  confidence_score = Math.min(100, confidence_score);
  
  // Build reasoning
  const reasoningParts: string[] = [];
  if (document_type !== "UNKNOWN") {
    reasoningParts.push(`Document type: ${document_type.replace(/_/g, ' ')}`);
  }
  if (programs.length > 0) {
    reasoningParts.push(`Found ${programs.length} JDE programs (${programs.slice(0, 3).join(', ')}...)`);
  }
  if (detected_aais) {
    reasoningParts.push("Contains AAI references (configuration content)");
  }
  if (!supports_ui_automation && isImplementationOrConfig) {
    reasoningParts.push("Implementation/configuration guide - UI automation not applicable");
  }
  
  return {
    document_type,
    jde_module,
    jde_release,
    supports_ui_automation,
    supports_functional_testing,
    supports_configuration_testing,
    supports_integration_testing,
    supports_data_validation,
    detected_programs: programs,
    detected_reports: reports,
    detected_tables: tables,
    detected_udcs: detected_udcs,
    detected_aais,
    detected_processing_options,
    detected_business_flows,
    detected_ui_selectors,
    detected_urls,
    confidence_score,
    classification_reasoning: reasoningParts.join(". ") || "Unable to determine document characteristics"
  };
}

/**
 * Determine which test types are allowed based on document classification
 */
export function resolveTestTypes(classification: JDEDocumentClassification): TestTypeDecision {
  const allowed: TestType[] = [];
  const blocked: TestType[] = [];
  const blocking_reasons: Record<string, string> = {};
  
  // Functional testing - almost always allowed if programs detected
  if (classification.supports_functional_testing) {
    allowed.push("functional");
    allowed.push("negative");
    allowed.push("end_to_end");
    allowed.push("regression");
  } else {
    blocked.push("functional");
    blocking_reasons["functional"] = "No JDE programs detected in document";
  }
  
  // Configuration testing
  if (classification.supports_configuration_testing) {
    allowed.push("configuration");
  } else {
    blocked.push("configuration");
    blocking_reasons["configuration"] = "No configuration elements (AAIs, UDCs, processing options) detected";
  }
  
  // Integration testing
  if (classification.supports_integration_testing) {
    allowed.push("integration");
  } else {
    blocked.push("integration");
    blocking_reasons["integration"] = "Insufficient integration touchpoints detected";
  }
  
  // Data validation
  if (classification.supports_data_validation) {
    allowed.push("data_validation");
  } else {
    blocked.push("data_validation");
    blocking_reasons["data_validation"] = "No JDE tables detected for validation";
  }
  
  // UI automation - CRITICAL: Block for implementation/config guides
  if (classification.supports_ui_automation) {
    allowed.push("ui_automation");
  } else {
    blocked.push("ui_automation");
    blocking_reasons["ui_automation"] = 
      classification.document_type === "JDE_IMPLEMENTATION_GUIDE" 
        ? "Implementation guides describe business processes, not UI automation specifications. Use functional testing instead."
        : classification.document_type === "JDE_CONFIGURATION_MANUAL"
        ? "Configuration manuals describe system setup, not UI interactions. Use configuration testing instead."
        : "Document does not contain UI automation specifications (no selectors, URLs, or UI element references)";
  }
  
  return {
    allowed_test_types: allowed,
    blocked_test_types: blocked,
    blocking_reasons,
    override_allowed: false // Never allow override for safety
  };
}

/**
 * Get module-specific governance rules
 */
export function getModuleGovernanceRules(module: JDEModule): {
  required_programs: string[];
  required_tables: string[];
  required_validations: string[];
} {
  const rules: Record<JDEModule, { required_programs: string[]; required_tables: string[]; required_validations: string[] }> = {
    PROCUREMENT: {
      required_programs: ["P4310", "P4312", "P4314"],
      required_tables: ["F4301", "F4311", "F43121"],
      required_validations: ["Supplier validation", "Budget check", "Approval workflow", "Three-way match"]
    },
    ORDER_MANAGEMENT: {
      required_programs: ["P4210", "P4205"],
      required_tables: ["F4201", "F4211", "F4006"],
      required_validations: ["Credit check", "Inventory availability", "Price validation", "Customer validation"]
    },
    ACCOUNTS_PAYABLE: {
      required_programs: ["P0411", "P04105"],
      required_tables: ["F0411", "F0414", "F0911"],
      required_validations: ["Three-way match", "Duplicate invoice check", "G/L account validation", "Tax calculation"]
    },
    ACCOUNTS_RECEIVABLE: {
      required_programs: ["P03B11", "P03B2002"],
      required_tables: ["F03B11", "F03B13", "F03B14", "F0911"],
      required_validations: ["Customer validation", "Invoice matching", "Payment application", "G/L entries"]
    },
    GENERAL_LEDGER: {
      required_programs: ["P09101", "P09200"],
      required_tables: ["F0911", "F0902"],
      required_validations: ["Balanced entries", "Account validation", "Fiscal period check", "Company validation"]
    },
    INVENTORY: {
      required_programs: ["P4111", "P4112", "P41001"],
      required_tables: ["F4111", "F41021", "F4101"],
      required_validations: ["Quantity validation", "Location validation", "Lot control", "Negative inventory check"]
    },
    MANUFACTURING: {
      required_programs: ["P48013", "P31111"],
      required_tables: ["F4801", "F3111", "F3112"],
      required_validations: ["BOM validation", "Routing validation", "Component availability"]
    },
    FIXED_ASSETS: {
      required_programs: ["P1201", "P12115"],
      required_tables: ["F1201", "F1202"],
      required_validations: ["Asset validation", "Depreciation calculation", "Book validation"]
    },
    PAYROLL: {
      required_programs: ["P07210", "P07136"],
      required_tables: ["F06116", "F07210"],
      required_validations: ["Employee validation", "Tax calculation", "Deduction validation"]
    },
    ADDRESS_BOOK: {
      required_programs: ["P01012", "P0401"],
      required_tables: ["F0101", "F0111", "F0115"],
      required_validations: ["Address number uniqueness", "Search type validation", "Tax ID format"]
    },
    MULTIPLE: {
      required_programs: [],
      required_tables: ["F0911"],
      required_validations: ["G/L entries balance", "Audit trail"]
    },
    UNKNOWN: {
      required_programs: [],
      required_tables: [],
      required_validations: []
    }
  };
  
  return rules[module] || rules.UNKNOWN;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  classifyJDEDocument,
  resolveTestTypes,
  getModuleGovernanceRules
};
