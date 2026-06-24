/**
 * ============================================================================
 * JDE EDWARDS KNOWLEDGE BASE - AITAS Enterprise Test Generation
 * ============================================================================
 * 
 * This module provides:
 * 1. JDE Object Ontology (Applications, Reports, Tables)
 * 2. Standard Behavior Definitions
 * 3. Test Case Templates
 * 4. Document Structuring Schemas
 * 5. AI Prompts for JDE-specific test generation
 * 
 * Usage:
 * - When appType = "jde" is selected, this knowledge base is injected
 * - Document parsing extracts JDE-specific elements
 * - Test generation uses JDE templates and validation rules
 */

// ============================================================================
// JDE OBJECT ONTOLOGY - Core Knowledge
// ============================================================================

export interface JDEObjectDefinition {
  objectId: string;                 // P4210, R42800, F4211
  objectType: "Application" | "Report" | "Table" | "UDC" | "Orchestrator";
  name: string;
  module: string;
  description: string;
  tables: string[];
  relatedObjects: string[];
  standardValidations: string[];
  standardBehavior: string[];
  processingOptions: JDEProcessingOption[];
  testPoints: string[];             // Key areas to test
  commonVersions: string[];
}

export interface JDEProcessingOption {
  optionId: string;
  description: string;
  possibleValues: string[];
  defaultValue: string;
  impact: string;
}

/**
 * JDE OBJECT KNOWLEDGE BASE
 * Comprehensive definitions for common JDE applications, reports, and tables
 */
export const JDE_OBJECT_KNOWLEDGE: Record<string, JDEObjectDefinition> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // ORDER MANAGEMENT MODULE
  // ═══════════════════════════════════════════════════════════════════════════
  
  "P4210": {
    objectId: "P4210",
    objectType: "Application",
    name: "Sales Order Entry",
    module: "Order Management",
    description: "Primary application for creating and managing sales orders",
    tables: ["F4201", "F4211", "F4101", "F0101", "F4006"],
    relatedObjects: ["R42800", "P4205", "P42101", "R42565", "P4210H"],
    standardValidations: [
      "Credit check validation (F03012)",
      "Item availability check (F41021)",
      "Base price retrieval (F4106)",
      "Customer address validation",
      "Ship-to address validation",
      "Branch/Plant validation",
      "Item branch/plant validation",
      "Unit of measure conversion"
    ],
    standardBehavior: [
      "Creates header record in F4201",
      "Creates detail records in F4211",
      "Performs soft commit on exit",
      "Calculates taxes based on tax rate/area",
      "Applies customer pricing rules",
      "Checks item availability by branch"
    ],
    processingOptions: [
      { optionId: "CreditCheck", description: "Enable credit check", possibleValues: ["Y", "N", "1", "2"], defaultValue: "Y", impact: "Blocks order if credit exceeded" },
      { optionId: "CommitInventory", description: "Commit inventory on order", possibleValues: ["1", "2", "3"], defaultValue: "1", impact: "Controls when inventory is committed" },
      { optionId: "PrintPickSlip", description: "Auto print pick slip", possibleValues: ["Y", "N"], defaultValue: "N", impact: "Triggers R42520" },
      { optionId: "PriceEffectiveDate", description: "Price effective date rule", possibleValues: ["1", "2", "3"], defaultValue: "1", impact: "Determines which price to use" }
    ],
    testPoints: [
      "Order creation happy path",
      "Credit limit exceeded scenario",
      "Item not available scenario",
      "Invalid customer number",
      "Invalid item number",
      "Price override functionality",
      "Quantity backorder handling",
      "Multiple line item entry",
      "Order cancellation",
      "Order modification"
    ],
    commonVersions: ["ZJDE0001", "ZJDE0002", "XJDE0001"]
  },
  
  "P4205": {
    objectId: "P4205",
    objectType: "Application",
    name: "Customer Ledger Inquiry",
    module: "Order Management",
    description: "View customer order history and open orders",
    tables: ["F4201", "F4211", "F0101"],
    relatedObjects: ["P4210", "P42101"],
    standardValidations: [
      "Customer number validation",
      "Security by company/branch"
    ],
    standardBehavior: [
      "Read-only inquiry application",
      "Shows open orders and order history",
      "Drill-down to order detail"
    ],
    processingOptions: [],
    testPoints: [
      "Search by customer",
      "Search by order number",
      "Filter by status",
      "Drill-down functionality"
    ],
    commonVersions: ["ZJDE0001"]
  },

  "P42101": {
    objectId: "P42101",
    objectType: "Application",
    name: "Sales Order Speed Entry",
    module: "Order Management",
    description: "Fast entry of sales orders with minimal screens",
    tables: ["F4201", "F4211"],
    relatedObjects: ["P4210", "R42800"],
    standardValidations: [
      "Same as P4210 validations",
      "Template-based entry validation"
    ],
    standardBehavior: [
      "Single-screen order entry",
      "Uses customer templates",
      "Faster performance than P4210"
    ],
    processingOptions: [
      { optionId: "Template", description: "Default template", possibleValues: ["Various"], defaultValue: "", impact: "Pre-fills order fields" }
    ],
    testPoints: [
      "Template-based order creation",
      "Field defaulting behavior",
      "Validation errors display"
    ],
    commonVersions: ["ZJDE0001"]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCUREMENT MODULE
  // ═══════════════════════════════════════════════════════════════════════════
  
  "P4310": {
    objectId: "P4310",
    objectType: "Application",
    name: "Purchase Order Entry",
    module: "Procurement",
    description: "Create and manage purchase orders",
    tables: ["F4301", "F4311", "F0101", "F4101"],
    relatedObjects: ["P4312", "R43500", "P4314", "R04500"],
    standardValidations: [
      "Supplier validation (F0101)",
      "Item validation (F4101)",
      "Branch/Plant validation",
      "Authorization limits check",
      "Budget validation (if enabled)",
      "Contract pricing validation"
    ],
    standardBehavior: [
      "Creates header in F4301",
      "Creates detail in F4311",
      "Triggers approval workflow if configured",
      "Calculates landed costs",
      "Creates commitments in F0911"
    ],
    processingOptions: [
      { optionId: "ApprovalRequired", description: "Require approval", possibleValues: ["Y", "N"], defaultValue: "Y", impact: "Routes to approval workflow" },
      { optionId: "BudgetCheck", description: "Check budget", possibleValues: ["Y", "N"], defaultValue: "N", impact: "Validates against budget" },
      { optionId: "AutoReceipt", description: "Auto create receipt", possibleValues: ["Y", "N"], defaultValue: "N", impact: "Creates receipt on PO close" }
    ],
    testPoints: [
      "PO creation happy path",
      "Supplier validation errors",
      "Approval routing",
      "Budget exceeded scenario",
      "Price override with authorization",
      "Multiple line items",
      "PO modification",
      "PO cancellation"
    ],
    commonVersions: ["ZJDE0001", "ZJDE0002"]
  },

  "P4312": {
    objectId: "P4312",
    objectType: "Application",
    name: "PO Receipts",
    module: "Procurement",
    description: "Record receipt of goods against purchase orders",
    tables: ["F4311", "F43121", "F4101", "F41021"],
    relatedObjects: ["P4310", "P4314", "R43500"],
    standardValidations: [
      "PO line validation",
      "Quantity tolerance check",
      "Location validation"
    ],
    standardBehavior: [
      "Updates F4311 received quantity",
      "Creates receipt record in F43121",
      "Updates inventory in F41021",
      "Creates GL entries"
    ],
    processingOptions: [
      { optionId: "OverReceiptTolerance", description: "Allow over-receipt %", possibleValues: ["0-100"], defaultValue: "0", impact: "Blocks if exceeded" }
    ],
    testPoints: [
      "Full receipt of PO",
      "Partial receipt",
      "Over-receipt scenario",
      "Location entry",
      "Receipt reversal"
    ],
    commonVersions: ["ZJDE0001"]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNTS PAYABLE MODULE
  // ═══════════════════════════════════════════════════════════════════════════
  
  "P0411": {
    objectId: "P0411",
    objectType: "Application",
    name: "Voucher Entry",
    module: "Accounts Payable",
    description: "Enter and manage supplier vouchers/invoices",
    tables: ["F0411", "F0414", "F0911"],
    relatedObjects: ["P0413", "R04500", "P04105"],
    standardValidations: [
      "Supplier validation",
      "Invoice number duplicate check",
      "G/L account validation",
      "Tax calculation",
      "Payment terms validation",
      "Three-way match (PO/Receipt/Invoice)"
    ],
    standardBehavior: [
      "Creates voucher in F0411",
      "Creates pay items in F0414",
      "Creates GL entries in F0911",
      "Calculates due date based on terms"
    ],
    processingOptions: [
      { optionId: "RequireMatch", description: "Require 3-way match", possibleValues: ["Y", "N"], defaultValue: "Y", impact: "Blocks payment if no match" },
      { optionId: "AutoTax", description: "Calculate tax automatically", possibleValues: ["Y", "N"], defaultValue: "Y", impact: "Computes tax on entry" }
    ],
    testPoints: [
      "Standard voucher entry",
      "Multi-line voucher",
      "Tax calculation verification",
      "Three-way match scenarios",
      "Tolerance violations",
      "Voucher modification",
      "Voucher void"
    ],
    commonVersions: ["ZJDE0001"]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNTS RECEIVABLE MODULE
  // ═══════════════════════════════════════════════════════════════════════════
  
  "P03B11": {
    objectId: "P03B11",
    objectType: "Application",
    name: "Customer Ledger Inquiry",
    module: "Accounts Receivable",
    description: "View and manage customer invoices and payments",
    tables: ["F03B11", "F03B14", "F0101"],
    relatedObjects: ["P03B2002", "R03B525", "R03B311"],
    standardValidations: [
      "Customer validation",
      "Invoice status validation"
    ],
    standardBehavior: [
      "Displays open invoices",
      "Shows payment history",
      "Allows drill-down to invoice detail"
    ],
    processingOptions: [],
    testPoints: [
      "Invoice inquiry",
      "Payment history review",
      "Aging display",
      "Drill-down to detail"
    ],
    commonVersions: ["ZJDE0001"]
  },

  "P03B2002": {
    objectId: "P03B2002",
    objectType: "Application",
    name: "Receipt Entry",
    module: "Accounts Receivable",
    description: "Enter customer payments against invoices",
    tables: ["F03B13", "F03B14", "F0911"],
    relatedObjects: ["P03B11", "R03B551"],
    standardValidations: [
      "Customer validation",
      "Bank account validation",
      "Invoice match validation"
    ],
    standardBehavior: [
      "Creates receipt record",
      "Applies to open invoices",
      "Creates GL entries",
      "Updates customer balance"
    ],
    processingOptions: [
      { optionId: "AutoApply", description: "Auto-apply to invoices", possibleValues: ["Y", "N"], defaultValue: "N", impact: "Automatically matches payments" }
    ],
    testPoints: [
      "Full payment of invoice",
      "Partial payment",
      "Over-payment handling",
      "Multiple invoice payment",
      "Unapplied receipt"
    ],
    commonVersions: ["ZJDE0001"]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INVENTORY MANAGEMENT MODULE
  // ═══════════════════════════════════════════════════════════════════════════
  
  "P4111": {
    objectId: "P4111",
    objectType: "Application",
    name: "Inventory Issues",
    module: "Inventory Management",
    description: "Issue inventory from stock",
    tables: ["F4111", "F41021", "F4101"],
    relatedObjects: ["P4112", "P41001"],
    standardValidations: [
      "Item branch validation",
      "Quantity available check",
      "Location validation",
      "Lot validation"
    ],
    standardBehavior: [
      "Reduces inventory quantity",
      "Creates issue transaction",
      "Updates item ledger",
      "Creates GL entries"
    ],
    processingOptions: [
      { optionId: "NegativeInventory", description: "Allow negative inventory", possibleValues: ["Y", "N"], defaultValue: "N", impact: "Blocks if insufficient qty" }
    ],
    testPoints: [
      "Standard issue",
      "Issue from specific location",
      "Issue from lot",
      "Insufficient quantity",
      "Issue reversal"
    ],
    commonVersions: ["ZJDE0001"]
  },

  "P4112": {
    objectId: "P4112",
    objectType: "Application",
    name: "Inventory Adjustments",
    module: "Inventory Management",
    description: "Adjust inventory quantities",
    tables: ["F4111", "F41021"],
    relatedObjects: ["P4111", "P41001"],
    standardValidations: [
      "Item branch validation",
      "Reason code validation",
      "Authorization level check"
    ],
    standardBehavior: [
      "Adjusts inventory quantity",
      "Creates adjustment transaction",
      "Creates GL entries"
    ],
    processingOptions: [],
    testPoints: [
      "Positive adjustment",
      "Negative adjustment",
      "Adjustment with reason code",
      "Lot/Location adjustment"
    ],
    commonVersions: ["ZJDE0001"]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDRESS BOOK
  // ═══════════════════════════════════════════════════════════════════════════
  
  "P01012": {
    objectId: "P01012",
    objectType: "Application",
    name: "Address Book Revisions",
    module: "Foundation",
    description: "Maintain customer, supplier, and entity records",
    tables: ["F0101", "F0111", "F0115", "F0116", "F0401"],
    relatedObjects: ["P0401", "P03013"],
    standardValidations: [
      "Address number uniqueness",
      "Search type validation",
      "Tax ID validation",
      "Phone/Email format validation"
    ],
    standardBehavior: [
      "Creates/updates address book record",
      "Maintains who's who records",
      "Maintains phone/electronic addresses"
    ],
    processingOptions: [
      { optionId: "AutoNumber", description: "Auto-assign address number", possibleValues: ["Y", "N"], defaultValue: "Y", impact: "Uses next number from NNS" }
    ],
    testPoints: [
      "Create new address record",
      "Add alternate addresses",
      "Add contacts (who's who)",
      "Add phone numbers",
      "Search type assignment",
      "Record modification"
    ],
    commonVersions: ["ZJDE0001"]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL LEDGER
  // ═══════════════════════════════════════════════════════════════════════════
  
  "P09101": {
    objectId: "P09101",
    objectType: "Application",
    name: "Journal Entry",
    module: "General Ledger",
    description: "Create manual journal entries",
    tables: ["F0911", "F0902"],
    relatedObjects: ["P09200", "R09801"],
    standardValidations: [
      "Account validation",
      "Balance validation (debits = credits)",
      "Fiscal period validation",
      "Company validation"
    ],
    standardBehavior: [
      "Creates journal entries in F0911",
      "Validates batch balancing",
      "Posts to account balances"
    ],
    processingOptions: [
      { optionId: "RequireBalance", description: "Require balanced entries", possibleValues: ["Y", "N"], defaultValue: "Y", impact: "Blocks unbalanced entries" }
    ],
    testPoints: [
      "Create balanced JE",
      "Unbalanced entry rejection",
      "Multi-company entry",
      "Reversing entry",
      "JE approval workflow"
    ],
    commonVersions: ["ZJDE0001"]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMON REPORTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  "R42800": {
    objectId: "R42800",
    objectType: "Report",
    name: "Sales Update",
    module: "Order Management",
    description: "Updates sales orders and creates GL/inventory entries",
    tables: ["F4211", "F4201", "F0911", "F41021", "F03B11"],
    relatedObjects: ["P4210", "P4205"],
    standardValidations: [
      "Order status validation",
      "Inventory availability",
      "GL account setup"
    ],
    standardBehavior: [
      "Updates order status",
      "Creates invoice in F03B11",
      "Creates GL entries in F0911",
      "Updates inventory in F41021",
      "Prints invoice if configured"
    ],
    processingOptions: [
      { optionId: "Mode", description: "Processing mode", possibleValues: ["1=Proof", "2=Final"], defaultValue: "1", impact: "Proof mode doesn't commit" },
      { optionId: "PrintInvoice", description: "Print invoice", possibleValues: ["Y", "N"], defaultValue: "Y", impact: "Generates invoice document" }
    ],
    testPoints: [
      "Proof mode validation",
      "Final mode processing",
      "GL entry verification",
      "Invoice creation verification",
      "Inventory update verification",
      "Error handling"
    ],
    commonVersions: ["XJDE0001"]
  },

  "R04500": {
    objectId: "R04500",
    objectType: "Report",
    name: "A/P Auto Payment",
    module: "Accounts Payable",
    description: "Generate automatic supplier payments",
    tables: ["F0411", "F0413", "F0911"],
    relatedObjects: ["P0411", "P04573"],
    standardValidations: [
      "Payment due date",
      "Bank account availability",
      "Supplier payment status"
    ],
    standardBehavior: [
      "Selects vouchers for payment",
      "Creates payment records",
      "Creates GL entries",
      "Generates payment documents"
    ],
    processingOptions: [
      { optionId: "PaymentMethod", description: "Payment method", possibleValues: ["C=Check", "D=Draft", "E=EFT"], defaultValue: "C", impact: "Determines payment type" }
    ],
    testPoints: [
      "Payment selection",
      "Payment generation",
      "Bank file creation",
      "GL verification",
      "Void/reissue"
    ],
    commonVersions: ["XJDE0001"]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMON TABLES (for validation reference)
  // ═══════════════════════════════════════════════════════════════════════════
  
  "F4201": {
    objectId: "F4201",
    objectType: "Table",
    name: "Sales Order Header",
    module: "Order Management",
    description: "Contains sales order header information",
    tables: [],
    relatedObjects: ["F4211", "P4210"],
    standardValidations: [],
    standardBehavior: [
      "One record per sales order",
      "Links to F4211 detail records",
      "Contains customer, branch, dates"
    ],
    processingOptions: [],
    testPoints: [
      "Header field accuracy",
      "Status field updates",
      "Customer info accuracy"
    ],
    commonVersions: []
  },

  "F4211": {
    objectId: "F4211",
    objectType: "Table",
    name: "Sales Order Detail",
    module: "Order Management",
    description: "Contains sales order line items",
    tables: [],
    relatedObjects: ["F4201", "P4210"],
    standardValidations: [],
    standardBehavior: [
      "Multiple records per order",
      "Contains item, qty, price",
      "Links to header via DOCO"
    ],
    processingOptions: [],
    testPoints: [
      "Line item accuracy",
      "Quantity calculations",
      "Price calculations",
      "Status updates"
    ],
    commonVersions: []
  },

  "F0911": {
    objectId: "F0911",
    objectType: "Table",
    name: "Account Ledger",
    module: "General Ledger",
    description: "Transaction-level GL entries",
    tables: [],
    relatedObjects: ["F0902", "P09101"],
    standardValidations: [],
    standardBehavior: [
      "Stores all GL transactions",
      "Links to source documents",
      "Supports audit trail"
    ],
    processingOptions: [],
    testPoints: [
      "Entry accuracy",
      "Debit/Credit balance",
      "Document linkage"
    ],
    commonVersions: []
  }
};

// ============================================================================
// JDE MODULE DEFINITIONS
// ============================================================================

export interface JDEModuleDefinition {
  moduleId: string;
  name: string;
  description: string;
  applications: string[];
  reports: string[];
  tables: string[];
  integrationPoints: string[];
  commonFlows: JDEBusinessFlow[];
}

export interface JDEBusinessFlow {
  flowId: string;
  flowName: string;
  steps: string[];
  validations: string[];
  tablesImpacted: string[];
}

export const JDE_MODULES: Record<string, JDEModuleDefinition> = {
  "OM": {
    moduleId: "OM",
    name: "Order Management",
    description: "Sales order processing, pricing, shipping",
    applications: ["P4210", "P4205", "P42101", "P4210H", "P4215"],
    reports: ["R42800", "R42565", "R42520", "R42700"],
    tables: ["F4201", "F4211", "F4006", "F42119"],
    integrationPoints: ["Inventory", "Accounts Receivable", "Shipping", "Pricing"],
    commonFlows: [
      {
        flowId: "OM_FLOW_001",
        flowName: "Order to Cash",
        steps: [
          "Create Sales Order (P4210)",
          "Confirm Order",
          "Pick/Ship (R42520)",
          "Sales Update (R42800)",
          "Invoice Customer (P03B11)",
          "Receive Payment (P03B2002)"
        ],
        validations: ["Credit check", "Inventory availability", "Price validation"],
        tablesImpacted: ["F4201", "F4211", "F03B11", "F0911"]
      }
    ]
  },
  
  "PROC": {
    moduleId: "PROC",
    name: "Procurement",
    description: "Purchase order processing, receipts, supplier management",
    applications: ["P4310", "P4312", "P4314", "P43211"],
    reports: ["R43500", "R43501"],
    tables: ["F4301", "F4311", "F43121"],
    integrationPoints: ["Inventory", "Accounts Payable", "General Ledger"],
    commonFlows: [
      {
        flowId: "PROC_FLOW_001",
        flowName: "Procure to Pay",
        steps: [
          "Create Purchase Order (P4310)",
          "Approve PO (Workflow)",
          "Receive Goods (P4312)",
          "Enter Voucher (P0411)",
          "Process Payment (R04500)"
        ],
        validations: ["Supplier validation", "Budget check", "3-way match"],
        tablesImpacted: ["F4301", "F4311", "F43121", "F0411", "F0911"]
      }
    ]
  },

  "AP": {
    moduleId: "AP",
    name: "Accounts Payable",
    description: "Voucher processing, payments, supplier ledger",
    applications: ["P0411", "P04105", "P04573"],
    reports: ["R04500", "R04110"],
    tables: ["F0411", "F0414", "F0413"],
    integrationPoints: ["General Ledger", "Procurement", "Bank"],
    commonFlows: []
  },

  "AR": {
    moduleId: "AR",
    name: "Accounts Receivable",
    description: "Customer invoices, receipts, customer ledger",
    applications: ["P03B11", "P03B2002", "P03B103"],
    reports: ["R03B525", "R03B311"],
    tables: ["F03B11", "F03B13", "F03B14"],
    integrationPoints: ["General Ledger", "Order Management", "Bank"],
    commonFlows: []
  },

  "INV": {
    moduleId: "INV",
    name: "Inventory Management",
    description: "Inventory transactions, adjustments, inquiries",
    applications: ["P4111", "P4112", "P41001", "P41026"],
    reports: ["R41543", "R41540"],
    tables: ["F4111", "F41021", "F4101"],
    integrationPoints: ["Order Management", "Procurement", "Manufacturing"],
    commonFlows: []
  },

  "GL": {
    moduleId: "GL",
    name: "General Ledger",
    description: "Journal entries, account balances, financial reporting",
    applications: ["P09101", "P09200", "P0901"],
    reports: ["R09801", "R09420"],
    tables: ["F0911", "F0902", "F0006"],
    integrationPoints: ["All subledgers"],
    commonFlows: []
  }
};

// ============================================================================
// DOCUMENT STRUCTURING SCHEMA
// ============================================================================

export interface JDEStructuredDocument {
  documentMetadata: {
    documentId: string;
    applicationType: "JDE_EDWARDS";
    jdeRelease: string;
    module: string;
    documentType: string;
    sourceFormat: string;
    extractedOn: string;
  };
  processDefinition: {
    processId: string;
    processName: string;
    businessObjective: string;
    processSteps: string[];
  };
  jdeObjects: Array<{
    objectName: string;
    objectType: "Application" | "Report" | "Table";
    version: string;
    processingOptions: Array<{
      optionName: string;
      value: string;
    }>;
    tables: string[];
    standardBehavior: string[];
    customBehavior: string[];
  }>;
  businessRules: Array<{
    ruleId: string;
    description: string;
    ruleType: "Validation" | "Calculation" | "Workflow" | "Integration";
    triggerPoint: string;
    errorMessage: string;
  }>;
  integrations: Array<{
    integrationId: string;
    direction: "Inbound" | "Outbound" | "Bidirectional";
    trigger: string;
    targetSystem: string;
    failureHandling: string;
  }>;
  testScope: {
    includeStandard: boolean;
    includeCustom: boolean;
    includeRegression: boolean;
    includeNegative: boolean;
    includeIntegration: boolean;
    includeDataValidation: boolean;
  };
  extractedFields: Record<string, any>;
}

// ============================================================================
// TEST CASE TEMPLATES
// ============================================================================

export interface JDETestCaseTemplate {
  testCaseId: string;
  module: string;
  jdeObject: string;
  testType: "Functional" | "Negative" | "Integration" | "DataValidation" | "Regression" | "EndToEnd";
  objective: string;
  preconditions: string[];
  testSteps: Array<{
    stepNumber: number;
    action: string;
    jdeAction?: string;     // JDE-specific action (e.g., "toolbar_click:Find")
    fieldId?: string;        // JDE field ID
    value?: string;
    expected: string;
  }>;
  expectedResults: string[];
  tablesToValidate: Array<{
    tableName: string;
    validationQuery: string;
    expectedResult: string;
  }>;
  integrationValidation: string[];
  postConditions: string[];
  priority: "Critical" | "High" | "Medium" | "Low";
  estimatedDuration: string;
}

// ============================================================================
// PREBUILT TEST CASE TEMPLATES FOR COMMON SCENARIOS
// ============================================================================

export const JDE_TEST_TEMPLATES: Record<string, JDETestCaseTemplate[]> = {
  "P4210": [
    {
      testCaseId: "OM_P4210_TC_001",
      module: "Order Management",
      jdeObject: "P4210",
      testType: "Functional",
      objective: "Verify standard sales order creation flow",
      preconditions: [
        "Customer exists in F0101 with valid credit limit",
        "Item exists in F4101 with available inventory",
        "Processing option Credit Check = Y",
        "User has access to P4210"
      ],
      testSteps: [
        { stepNumber: 1, action: "Navigate to P4210", jdeAction: "navigate", expected: "Sales Order Entry form opens" },
        { stepNumber: 2, action: "Select version ZJDE0001", jdeAction: "select_version", value: "ZJDE0001", expected: "Version loaded" },
        { stepNumber: 3, action: "Enter customer number", fieldId: "AN8", value: "{{CustomerNumber}}", expected: "Customer name auto-populates" },
        { stepNumber: 4, action: "Tab to Branch/Plant", fieldId: "MCU", expected: "Branch/Plant field is active" },
        { stepNumber: 5, action: "Enter branch/plant", fieldId: "MCU", value: "{{BranchPlant}}", expected: "Branch accepted" },
        { stepNumber: 6, action: "Click OK to go to detail", jdeAction: "toolbar_click:OK", expected: "Detail entry screen opens" },
        { stepNumber: 7, action: "Enter item number", fieldId: "LITM", value: "{{ItemNumber}}", expected: "Item description auto-populates" },
        { stepNumber: 8, action: "Enter quantity", fieldId: "UORG", value: "{{Quantity}}", expected: "Quantity accepted" },
        { stepNumber: 9, action: "Click OK to save", jdeAction: "toolbar_click:OK", expected: "Order saved, order number generated" },
        { stepNumber: 10, action: "Record order number", jdeAction: "capture", fieldId: "DOCO", expected: "Order number captured for validation" }
      ],
      expectedResults: [
        "Sales order created successfully",
        "Order number generated",
        "Status is '520' (entered)",
        "Customer credit not exceeded"
      ],
      tablesToValidate: [
        { tableName: "F4201", validationQuery: "WHERE SHDOCO = {{OrderNumber}}", expectedResult: "Header record exists" },
        { tableName: "F4211", validationQuery: "WHERE SDDOCO = {{OrderNumber}}", expectedResult: "Detail record(s) exist" }
      ],
      integrationValidation: [],
      postConditions: ["Order available for further processing"],
      priority: "Critical",
      estimatedDuration: "5 minutes"
    },
    {
      testCaseId: "OM_P4210_TC_002",
      module: "Order Management",
      jdeObject: "P4210",
      testType: "Negative",
      objective: "Verify credit limit exceeded blocks order",
      preconditions: [
        "Customer exists with credit limit less than order value",
        "Processing option Credit Check = Y"
      ],
      testSteps: [
        { stepNumber: 1, action: "Navigate to P4210", jdeAction: "navigate", expected: "Form opens" },
        { stepNumber: 2, action: "Enter customer with low credit limit", fieldId: "AN8", value: "{{LowCreditCustomer}}", expected: "Customer loaded" },
        { stepNumber: 3, action: "Enter large quantity order", fieldId: "UORG", value: "10000", expected: "Quantity entered" },
        { stepNumber: 4, action: "Click OK to save", jdeAction: "toolbar_click:OK", expected: "Credit limit error displayed" }
      ],
      expectedResults: [
        "Error message: Credit limit exceeded",
        "Order is NOT saved",
        "User returned to edit screen"
      ],
      tablesToValidate: [
        { tableName: "F4201", validationQuery: "WHERE SHAN8 = {{LowCreditCustomer}} AND SHDRQJ = {{TodayJulian}}", expectedResult: "No new order created" }
      ],
      integrationValidation: [],
      postConditions: [],
      priority: "High",
      estimatedDuration: "3 minutes"
    },
    {
      testCaseId: "OM_P4210_TC_003",
      module: "Order Management",
      jdeObject: "P4210",
      testType: "Negative",
      objective: "Verify item availability check",
      preconditions: [
        "Item has zero or insufficient inventory",
        "Processing option Backorder = N"
      ],
      testSteps: [
        { stepNumber: 1, action: "Navigate to P4210", jdeAction: "navigate", expected: "Form opens" },
        { stepNumber: 2, action: "Enter valid customer", fieldId: "AN8", value: "{{CustomerNumber}}", expected: "Customer loaded" },
        { stepNumber: 3, action: "Enter item with no inventory", fieldId: "LITM", value: "{{ZeroStockItem}}", expected: "Item loaded" },
        { stepNumber: 4, action: "Enter quantity exceeding available", fieldId: "UORG", value: "1000", expected: "Quantity entered" },
        { stepNumber: 5, action: "Click OK to save", jdeAction: "toolbar_click:OK", expected: "Availability error or backorder created" }
      ],
      expectedResults: [
        "System displays availability warning",
        "Order placed on backorder OR error displayed based on configuration"
      ],
      tablesToValidate: [
        { tableName: "F4211", validationQuery: "WHERE SDSOBK > 0", expectedResult: "Backorder quantity populated if allowed" }
      ],
      integrationValidation: [],
      postConditions: [],
      priority: "High",
      estimatedDuration: "3 minutes"
    }
  ],

  "P4310": [
    {
      testCaseId: "PROC_P4310_TC_001",
      module: "Procurement",
      jdeObject: "P4310",
      testType: "Functional",
      objective: "Verify standard purchase order creation",
      preconditions: [
        "Supplier exists in F0101",
        "Item exists in F4101",
        "User has PO creation authorization"
      ],
      testSteps: [
        { stepNumber: 1, action: "Navigate to P4310", jdeAction: "navigate", expected: "PO Entry form opens" },
        { stepNumber: 2, action: "Enter supplier number", fieldId: "AN8", value: "{{SupplierNumber}}", expected: "Supplier name auto-populates" },
        { stepNumber: 3, action: "Enter branch/plant", fieldId: "MCU", value: "{{BranchPlant}}", expected: "Branch accepted" },
        { stepNumber: 4, action: "Click OK to go to detail", jdeAction: "toolbar_click:OK", expected: "Detail screen opens" },
        { stepNumber: 5, action: "Enter item number", fieldId: "LITM", value: "{{ItemNumber}}", expected: "Item description populates" },
        { stepNumber: 6, action: "Enter quantity", fieldId: "UORG", value: "{{Quantity}}", expected: "Quantity accepted" },
        { stepNumber: 7, action: "Enter unit price", fieldId: "PRRC", value: "{{UnitPrice}}", expected: "Price accepted" },
        { stepNumber: 8, action: "Click OK to save", jdeAction: "toolbar_click:OK", expected: "PO saved, PO number generated" }
      ],
      expectedResults: [
        "Purchase order created successfully",
        "PO number generated",
        "Status is appropriate for workflow"
      ],
      tablesToValidate: [
        { tableName: "F4301", validationQuery: "WHERE PHDOCO = {{PONumber}}", expectedResult: "Header record exists" },
        { tableName: "F4311", validationQuery: "WHERE PDDOCO = {{PONumber}}", expectedResult: "Detail record(s) exist" }
      ],
      integrationValidation: [],
      postConditions: ["PO available for approval/receipt"],
      priority: "Critical",
      estimatedDuration: "5 minutes"
    }
  ],

  "P0411": [
    {
      testCaseId: "AP_P0411_TC_001",
      module: "Accounts Payable",
      jdeObject: "P0411",
      testType: "Functional",
      objective: "Verify voucher entry with three-way match",
      preconditions: [
        "PO exists and is received (F43121)",
        "Supplier exists",
        "Processing option Require Match = Y"
      ],
      testSteps: [
        { stepNumber: 1, action: "Navigate to P0411", jdeAction: "navigate", expected: "Voucher Entry form opens" },
        { stepNumber: 2, action: "Enter supplier number", fieldId: "AN8", value: "{{SupplierNumber}}", expected: "Supplier loaded" },
        { stepNumber: 3, action: "Enter invoice number", fieldId: "VINV", value: "{{InvoiceNumber}}", expected: "Invoice number accepted" },
        { stepNumber: 4, action: "Enter invoice date", fieldId: "DIVJ", value: "{{InvoiceDate}}", expected: "Date accepted" },
        { stepNumber: 5, action: "Enter gross amount", fieldId: "AG", value: "{{GrossAmount}}", expected: "Amount accepted" },
        { stepNumber: 6, action: "Click Match button", jdeAction: "toolbar_click:Match", expected: "Match screen opens" },
        { stepNumber: 7, action: "Select PO/Receipt to match", jdeAction: "grid_select", expected: "Items selected" },
        { stepNumber: 8, action: "Click OK to save", jdeAction: "toolbar_click:OK", expected: "Voucher saved" }
      ],
      expectedResults: [
        "Voucher created successfully",
        "Match successful",
        "GL entries created"
      ],
      tablesToValidate: [
        { tableName: "F0411", validationQuery: "WHERE RPVINV = '{{InvoiceNumber}}'", expectedResult: "Voucher record exists" },
        { tableName: "F0911", validationQuery: "WHERE GLICU = '{{VoucherBatch}}'", expectedResult: "GL entries exist" }
      ],
      integrationValidation: ["GL entries balance", "Match records created"],
      postConditions: ["Voucher ready for payment"],
      priority: "Critical",
      estimatedDuration: "7 minutes"
    }
  ],

  "R42800": [
    {
      testCaseId: "OM_R42800_TC_001",
      module: "Order Management",
      jdeObject: "R42800",
      testType: "Integration",
      objective: "Verify Sales Update creates GL and AR entries",
      preconditions: [
        "Sales order exists with status 560 (shipped)",
        "R42800 batch job configured"
      ],
      testSteps: [
        { stepNumber: 1, action: "Submit R42800 in proof mode", jdeAction: "submit_report", value: "Mode=1", expected: "Report completes successfully" },
        { stepNumber: 2, action: "Review proof report", jdeAction: "view_report", expected: "Report shows orders to process" },
        { stepNumber: 3, action: "Submit R42800 in final mode", jdeAction: "submit_report", value: "Mode=2", expected: "Report completes" },
        { stepNumber: 4, action: "Verify order status updated", jdeAction: "query_table", expected: "Status = 580 (invoiced)" },
        { stepNumber: 5, action: "Verify AR invoice created", jdeAction: "query_table", expected: "F03B11 record exists" },
        { stepNumber: 6, action: "Verify GL entries", jdeAction: "query_table", expected: "F0911 entries exist and balance" }
      ],
      expectedResults: [
        "Sales order updated to invoiced status",
        "AR invoice created in F03B11",
        "GL entries created and balanced",
        "Inventory updated in F41021"
      ],
      tablesToValidate: [
        { tableName: "F4211", validationQuery: "WHERE SDDOCO = {{OrderNumber}} AND SDNXTR = '580'", expectedResult: "Status updated" },
        { tableName: "F03B11", validationQuery: "WHERE RPDOCO = {{OrderNumber}}", expectedResult: "Invoice created" },
        { tableName: "F0911", validationQuery: "WHERE GLKCO = 'OM' AND GLDOC = {{OrderNumber}}", expectedResult: "GL entries exist" }
      ],
      integrationValidation: ["Debits = Credits", "COGS posted", "Revenue posted", "Inventory reduced"],
      postConditions: ["Invoice ready for collection"],
      priority: "Critical",
      estimatedDuration: "10 minutes"
    }
  ]
};

// ============================================================================
// AI PROMPTS FOR JDE-SPECIFIC GENERATION
// ============================================================================

/**
 * Layer 1: Document Structuring AI Prompt
 * Converts raw document text into structured JDE JSON
 */
export const JDE_DOCUMENT_STRUCTURING_PROMPT = `You are an Oracle JD Edwards EnterpriseOne functional analyst and expert.

OBJECTIVE:
Analyze the provided document and extract ONLY factual information about JDE processes, objects, and requirements.

CRITICAL RULES:
1. Do NOT invent or assume missing data - use "UNKNOWN" if information is not present
2. Use official Oracle JDE terminology (P = Application, R = Report, F = Table, N = NER)
3. Identify standard JDE behavior vs custom/configured behavior
4. Extract all JDE object references (P4210, R42800, F4211, etc.)
5. Identify processing option configurations
6. Extract business rules and validations
7. Note integration points with other systems or modules

EXTRACTION TARGETS:
1. JDE OBJECTS:
   - Applications (Pxxxxx)
   - Reports (Rxxxxx)
   - Tables (Fxxxxx)
   - Versions mentioned

2. PROCESSING OPTIONS:
   - Credit check settings
   - Approval settings
   - Default values

3. BUSINESS RULES:
   - Validation rules
   - Calculation rules
   - Workflow triggers

4. INTEGRATIONS:
   - External systems
   - Data flows
   - API calls

5. CUSTOMIZATIONS:
   - Custom fields
   - Custom logic
   - Configuration changes from standard

OUTPUT FORMAT (JSON):
{
  "documentMetadata": {
    "documentId": "extracted or generated ID",
    "applicationType": "JDE_EDWARDS",
    "jdeRelease": "9.2 or version found",
    "module": "Order Management|Procurement|etc",
    "documentType": "Functional Specification|Design|etc",
    "extractedOn": "ISO date"
  },
  "processDefinition": {
    "processId": "generated ID",
    "processName": "extracted process name",
    "businessObjective": "what this process achieves",
    "processSteps": ["step1", "step2"]
  },
  "jdeObjects": [{
    "objectName": "P4210",
    "objectType": "Application",
    "version": "ZJDE0001",
    "processingOptions": [{"optionName": "CreditCheck", "value": "Y"}],
    "tables": ["F4201", "F4211"],
    "standardBehavior": ["Creates order header"],
    "customBehavior": ["Custom credit validation added"]
  }],
  "businessRules": [{
    "ruleId": "BR_001",
    "description": "Credit check required",
    "ruleType": "Validation",
    "triggerPoint": "Order Save",
    "errorMessage": "Credit limit exceeded"
  }],
  "integrations": [{
    "integrationId": "INT_001",
    "direction": "Outbound",
    "trigger": "Order Confirmation",
    "targetSystem": "WMS",
    "failureHandling": "Retry 3 times"
  }],
  "extractedFields": {
    "keyFields": [],
    "mandatoryFields": [],
    "calculatedFields": []
  }
}

IMPORTANT: Return ONLY valid JSON. No explanations or markdown.`;

/**
 * Layer 2: Test Case Generation AI Prompt
 * Generates detailed test cases from structured JDE JSON
 */
export const JDE_TEST_GENERATION_PROMPT = `You are a senior Oracle JD Edwards QA lead with 15+ years of experience.

OBJECTIVE:
Generate comprehensive, enterprise-grade test cases for JDE Edwards applications based on the provided structured specification.

CRITICAL RULES:
1. Follow Oracle JDE execution flow and terminology
2. Use actual JDE field IDs (AN8, DOCO, MCU, LITM, etc.)
3. Use actual JDE form IDs (W4210A, W4310A, etc.)
4. Reference JDE toolbar actions (Find, OK, Cancel, Save, Add, Delete)
5. Include QBE (Query By Example) steps where appropriate
6. ALWAYS validate data in tables (F4201, F4211, F0911, etc.)
7. Generate SEPARATE test cases for each scenario - do not summarize
8. Include both standard and custom validation tests
9. Test processing options explicitly

TEST CASE STRUCTURE:
Each test case MUST include:
- Clear objective
- Complete preconditions
- Step-by-step actions (not summaries)
- Expected results per step
- Table validation queries
- Post-conditions

TEST CATEGORIES TO COVER:
1. HAPPY PATH: Standard flow, all validations pass
2. FIELD VALIDATION: Each mandatory field, data types, lengths
3. BUSINESS RULES: Each custom rule, edge cases
4. NEGATIVE CASES: Invalid data, missing required data, errors
5. INTEGRATION CASES: External system calls, data flows
6. DATA VALIDATION: Table-level verification (F4201, F4211, F0911, etc.)
7. SECURITY: Role-based access, authorization limits

JDE-SPECIFIC REQUIREMENTS:
- When testing P4210 → always test credit validation if enabled
- When testing P4310 → always test approval workflow if configured
- When testing R42800 → always verify GL entries balance
- When testing any form → include iframe switching
- When testing any save → include F0911 GL validation

OUTPUT FORMAT (JSON):
{
  "testCases": [{
    "testCaseId": "MODULE_OBJ_TYPE_001",
    "module": "Order Management",
    "jdeObject": "P4210",
    "testType": "Functional|Negative|Integration|DataValidation",
    "objective": "What this test validates",
    "preconditions": ["Condition 1", "Condition 2"],
    "testSteps": [{
      "stepNumber": 1,
      "action": "Human-readable action",
      "jdeAction": "navigate|click|type|toolbar_click|qbe_enter|etc",
      "fieldId": "AN8",
      "value": "4242",
      "expected": "What should happen"
    }],
    "expectedResults": ["Result 1", "Result 2"],
    "tablesToValidate": [{
      "tableName": "F4201",
      "validationQuery": "WHERE SHDOCO = {{OrderNumber}}",
      "expectedResult": "Record exists with correct status"
    }],
    "integrationValidation": ["GL entries balance"],
    "postConditions": ["Order available for processing"],
    "priority": "Critical|High|Medium|Low",
    "estimatedDuration": "5 minutes"
  }],
  "coverageSummary": {
    "totalTestCases": 0,
    "byType": {},
    "objectsCovered": [],
    "tablesCovered": []
  }
}

IMPORTANT: 
- Generate 20-40 test cases for comprehensive coverage
- Each step must be atomic and executable
- Do NOT use placeholders like "..." or "etc"
- Return ONLY valid JSON`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get JDE object knowledge by object ID
 */
export function getJDEObjectKnowledge(objectId: string): JDEObjectDefinition | undefined {
  return JDE_OBJECT_KNOWLEDGE[objectId.toUpperCase()];
}

/**
 * Get all objects for a module
 */
export function getModuleObjects(moduleId: string): JDEObjectDefinition[] {
  const module = JDE_MODULES[moduleId];
  if (!module) return [];
  
  const objects: JDEObjectDefinition[] = [];
  [...module.applications, ...module.reports].forEach(objId => {
    const obj = JDE_OBJECT_KNOWLEDGE[objId];
    if (obj) objects.push(obj);
  });
  return objects;
}

/**
 * Get test templates for an object
 */
export function getTestTemplates(objectId: string): JDETestCaseTemplate[] {
  return JDE_TEST_TEMPLATES[objectId.toUpperCase()] || [];
}

/**
 * Extract JDE objects from document text
 */
export function extractJDEObjectsFromText(text: string): string[] {
  const patterns = [
    /P\d{4,5}[A-Z]?/gi,  // Applications (P4210, P4310Z)
    /R\d{4,5}[A-Z]?/gi,  // Reports (R42800)
    /F\d{4,6}/gi,        // Tables (F4201, F41021)
    /N\d{4,5}/gi,        // NERs (N4210001)
  ];
  
  const found = new Set<string>();
  patterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(m => found.add(m.toUpperCase()));
  });
  
  return Array.from(found);
}

/**
 * Get enforcement rules for a JDE object
 * These rules ensure test cases always include critical validations
 */
export function getEnforcementRules(objectId: string): string[] {
  const rules: Record<string, string[]> = {
    "P4210": [
      "MUST test credit validation if processing option enabled",
      "MUST validate F4201 and F4211 after order creation",
      "MUST test item availability check",
      "MUST include customer address validation"
    ],
    "P4310": [
      "MUST test approval workflow routing",
      "MUST test budget validation if enabled",
      "MUST validate F4301 and F4311 after PO creation"
    ],
    "P0411": [
      "MUST test three-way match if configured",
      "MUST validate F0911 GL entries",
      "MUST test duplicate invoice check"
    ],
    "R42800": [
      "MUST verify proof mode before final",
      "MUST validate F03B11 invoice creation",
      "MUST verify F0911 GL entries balance (debits = credits)",
      "MUST verify F41021 inventory update"
    ],
    "P4312": [
      "MUST test over-receipt tolerance",
      "MUST validate F41021 inventory update",
      "MUST validate F43121 receipt record"
    ]
  };
  
  return rules[objectId.toUpperCase()] || [];
}

/**
 * Build JDE-aware system prompt based on detected objects
 * @param extractedObjects - Array of JDE object IDs (P4210, P4310, etc.)
 * @param additionalKnowledge - Optional additional knowledge text
 */
export function buildJDESystemPrompt(
  extractedObjects: string[],
  additionalKnowledge?: string
): string {
  const knowledgeBlocks: string[] = [];
  
  // Add object-specific knowledge
  extractedObjects.forEach(objId => {
    const obj = JDE_OBJECT_KNOWLEDGE[objId.toUpperCase()];
    if (obj) {
      knowledgeBlocks.push(`
JDE OBJECT: ${obj.objectId} - ${obj.name}
Type: ${obj.objectType}
Module: ${obj.module}
Tables: ${obj.tables.join(", ")}
Standard Validations: ${obj.standardValidations.join("; ")}
Key Test Points: ${obj.testPoints.join("; ")}
`);
    }
  });

  // Add enforcement rules
  const allRules = extractedObjects.flatMap(objId => getEnforcementRules(objId));
  
  return `
${JDE_TEST_GENERATION_PROMPT}

═══════════════════════════════════════════════════════════════════════════════
INJECTED JDE KNOWLEDGE (Use this to ensure accuracy)
═══════════════════════════════════════════════════════════════════════════════
${knowledgeBlocks.join("\n")}

${additionalKnowledge ? `
═══════════════════════════════════════════════════════════════════════════════
ADDITIONAL CONTEXT
═══════════════════════════════════════════════════════════════════════════════
${additionalKnowledge}
` : ""}

═══════════════════════════════════════════════════════════════════════════════
MANDATORY ENFORCEMENT RULES
═══════════════════════════════════════════════════════════════════════════════
${allRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

═══════════════════════════════════════════════════════════════════════════════
Apply this knowledge. Generate test cases that match JDE execution patterns.
`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  JDE_OBJECT_KNOWLEDGE,
  JDE_MODULES,
  JDE_TEST_TEMPLATES,
  JDE_DOCUMENT_STRUCTURING_PROMPT,
  JDE_TEST_GENERATION_PROMPT,
  getJDEObjectKnowledge,
  getModuleObjects,
  getTestTemplates,
  extractJDEObjectsFromText,
  getEnforcementRules,
  buildJDESystemPrompt
};
