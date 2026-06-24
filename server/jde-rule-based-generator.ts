/**
 * ============================================================================
 * JDE RULE-BASED TEST GENERATOR - AITAS Enterprise
 * ============================================================================
 * 
 * Generates JDE-specific test cases when AI is unavailable
 * Uses the JDE Knowledge Base to create accurate functional test cases
 * 
 * CRITICAL: This generator produces FUNCTIONAL tests, NOT UI automation tests
 * - Uses JDE program names (P4310, P4210)
 * - Uses JDE field IDs (AN8, DOCO, MCU)
 * - Includes table validation (F4311, F0911)
 * - NO click/input/navigate UI actions
 */

import { 
  JDE_OBJECT_KNOWLEDGE, 
  JDE_MODULES, 
  JDE_TEST_TEMPLATES,
  JDEObjectDefinition,
  JDETestCaseTemplate,
  getJDEObjectKnowledge,
  getTestTemplates
} from "./jde-knowledge-base";

import {
  JDEDocumentClassification,
  JDEModule,
  getModuleGovernanceRules
} from "./jde-document-classifier";

// ============================================================================
// TYPES
// ============================================================================

export interface JDERuleBasedTestCase {
  testCaseId: string;
  title: string;
  module: string;
  jdeObject: string;
  testType: "Functional" | "Negative" | "Integration" | "DataValidation" | "Regression" | "EndToEnd" | "Configuration";
  objective: string;
  preconditions: string[];
  steps: Array<{
    stepNumber: number;
    action: string;
    jdeAction?: string;
    fieldId?: string;
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
// JDE TEST CASE TEMPLATES BY MODULE
// ============================================================================

const JDE_FUNCTIONAL_TEMPLATES: Record<string, JDERuleBasedTestCase[]> = {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PROCUREMENT MODULE TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════
  "PROCUREMENT": [
    {
      testCaseId: "PROC_TC_001",
      title: "Create Standard Purchase Order",
      module: "Procurement",
      jdeObject: "P4310",
      testType: "Functional",
      objective: "Verify standard purchase order creation with valid supplier and items",
      preconditions: [
        "User has access to P4310 - Purchase Order Entry",
        "Supplier exists in F0101 with valid payment terms",
        "Item exists in F4101 with valid branch/plant setup",
        "Processing option for approval routing is configured"
      ],
      steps: [
        { stepNumber: 1, action: "Launch P4310 - Purchase Order Entry", jdeAction: "navigate", expected: "PO Entry header form opens" },
        { stepNumber: 2, action: "Select version ZJDE0001", jdeAction: "select_version", value: "ZJDE0001", expected: "Version loads with configured defaults" },
        { stepNumber: 3, action: "Enter supplier number in Address Number field", fieldId: "AN8", value: "{{SupplierNumber}}", expected: "Supplier name and address auto-populate" },
        { stepNumber: 4, action: "Tab to Branch/Plant field", fieldId: "MCU", expected: "Branch/Plant field becomes active" },
        { stepNumber: 5, action: "Enter branch/plant", fieldId: "MCU", value: "{{BranchPlant}}", expected: "Branch/Plant accepted, currency defaults" },
        { stepNumber: 6, action: "Select OK from toolbar to proceed to detail", jdeAction: "toolbar_click:OK", expected: "Detail entry grid opens" },
        { stepNumber: 7, action: "Enter item number in first detail line", fieldId: "LITM", value: "{{ItemNumber}}", expected: "Item description, UOM, and default price populate" },
        { stepNumber: 8, action: "Enter quantity ordered", fieldId: "UORG", value: "{{Quantity}}", expected: "Quantity accepted, extended amount calculates" },
        { stepNumber: 9, action: "Enter unit price (if overriding default)", fieldId: "PRRC", value: "{{UnitPrice}}", expected: "Price override accepted if within authorization limit" },
        { stepNumber: 10, action: "Tab to save line and enter additional lines as needed", expected: "Line saves, cursor moves to next line" },
        { stepNumber: 11, action: "Select OK from toolbar to save PO", jdeAction: "toolbar_click:OK", expected: "PO saved, PO number generated and displayed" },
        { stepNumber: 12, action: "Record generated PO number", jdeAction: "capture", fieldId: "DOCO", expected: "PO number captured for validation" }
      ],
      expectedResults: [
        "Purchase order created with system-generated number",
        "PO status set to appropriate value based on approval workflow",
        "Header record created in F4301",
        "Detail record(s) created in F4311",
        "Commitment created in F0911 if configured"
      ],
      tablesToValidate: [
        { tableName: "F4301", validationQuery: "WHERE PHDOCO = {{PONumber}} AND PHKCOO = '{{Company}}'", expectedResult: "Header record exists with correct supplier, branch" },
        { tableName: "F4311", validationQuery: "WHERE PDDOCO = {{PONumber}}", expectedResult: "Detail records exist with correct items and quantities" },
        { tableName: "F0911", validationQuery: "WHERE GLKCO = 'PO' AND GLDOC = {{PONumber}}", expectedResult: "Commitment GL entries created if enabled" }
      ],
      integrationValidation: [
        "Approval workflow triggered if PO exceeds limits",
        "Budget validation passed if budget checking enabled"
      ],
      postConditions: ["PO available for approval/receipt processing"],
      priority: "Critical",
      estimatedDuration: "10 minutes"
    },
    {
      testCaseId: "PROC_TC_002",
      title: "Receive Goods Against Purchase Order",
      module: "Procurement",
      jdeObject: "P4312",
      testType: "Functional",
      objective: "Verify receipt of goods against an existing purchase order",
      preconditions: [
        "Purchase order exists in F4301/F4311 with open lines",
        "PO status allows receipts",
        "User has access to P4312 - PO Receipts"
      ],
      steps: [
        { stepNumber: 1, action: "Launch P4312 - PO Receipts", jdeAction: "navigate", expected: "Receipt inquiry form opens" },
        { stepNumber: 2, action: "Enter PO number in QBE row", fieldId: "DOCO", value: "{{PONumber}}", expected: "QBE filter applied" },
        { stepNumber: 3, action: "Select Find from toolbar", jdeAction: "toolbar_click:Find", expected: "PO lines display in grid" },
        { stepNumber: 4, action: "Select line(s) to receive", jdeAction: "grid_select", expected: "Lines highlighted for receipt" },
        { stepNumber: 5, action: "Select Row menu > Receive", jdeAction: "row_menu:Receive", expected: "Receipt detail form opens" },
        { stepNumber: 6, action: "Enter receipt quantity", fieldId: "UREC", value: "{{ReceiptQty}}", expected: "Receipt quantity accepted within tolerance" },
        { stepNumber: 7, action: "Enter receipt location", fieldId: "LOCN", value: "{{Location}}", expected: "Location validated against F4100" },
        { stepNumber: 8, action: "Select OK to process receipt", jdeAction: "toolbar_click:OK", expected: "Receipt processed, receipt number generated" }
      ],
      expectedResults: [
        "Receipt record created in F43121",
        "PO line open quantity reduced",
        "Inventory increased in F41021",
        "Receipt GL entries created in F0911"
      ],
      tablesToValidate: [
        { tableName: "F43121", validationQuery: "WHERE PRDOCO = {{PONumber}}", expectedResult: "Receipt record exists with correct quantities" },
        { tableName: "F4311", validationQuery: "WHERE PDDOCO = {{PONumber}}", expectedResult: "Open quantity (UOPN) reduced by receipt amount" },
        { tableName: "F41021", validationQuery: "WHERE LIITM = '{{ItemNumber}}' AND LIMCU = '{{BranchPlant}}'", expectedResult: "On-hand quantity increased" }
      ],
      integrationValidation: [
        "Inventory balance updated correctly",
        "GL entries for inventory and accrual are balanced"
      ],
      postConditions: ["Receipt available for voucher matching"],
      priority: "Critical",
      estimatedDuration: "8 minutes"
    },
    {
      testCaseId: "PROC_TC_003",
      title: "Three-Way Match Voucher Entry",
      module: "Procurement",
      jdeObject: "P0411",
      testType: "Integration",
      objective: "Verify voucher creation with three-way match to PO and receipt",
      preconditions: [
        "Purchase order exists with received lines",
        "Receipt exists in F43121",
        "Processing option RequireMatch = Y"
      ],
      steps: [
        { stepNumber: 1, action: "Launch P0411 - Voucher Entry", jdeAction: "navigate", expected: "Voucher entry form opens" },
        { stepNumber: 2, action: "Enter supplier number", fieldId: "AN8", value: "{{SupplierNumber}}", expected: "Supplier name populates" },
        { stepNumber: 3, action: "Enter invoice number", fieldId: "VINV", value: "{{InvoiceNumber}}", expected: "Invoice number accepted (duplicate check passed)" },
        { stepNumber: 4, action: "Enter invoice date", fieldId: "DIVJ", value: "{{InvoiceDate}}", expected: "Date accepted, due date calculates" },
        { stepNumber: 5, action: "Enter gross amount", fieldId: "AG", value: "{{GrossAmount}}", expected: "Amount accepted" },
        { stepNumber: 6, action: "Select Match from Row menu", jdeAction: "row_menu:Match", expected: "Match application opens" },
        { stepNumber: 7, action: "Select PO/Receipt lines to match", jdeAction: "grid_select", expected: "Lines selected for matching" },
        { stepNumber: 8, action: "Verify match amounts within tolerance", expected: "Match amounts display, no tolerance errors" },
        { stepNumber: 9, action: "Select OK to complete match", jdeAction: "toolbar_click:OK", expected: "Match completed" },
        { stepNumber: 10, action: "Select OK to save voucher", jdeAction: "toolbar_click:OK", expected: "Voucher saved, voucher number assigned" }
      ],
      expectedResults: [
        "Voucher created in F0411",
        "Pay items created in F0414",
        "GL entries created in F0911",
        "Match records created"
      ],
      tablesToValidate: [
        { tableName: "F0411", validationQuery: "WHERE RPVINV = '{{InvoiceNumber}}'", expectedResult: "Voucher record exists with correct amounts" },
        { tableName: "F0911", validationQuery: "WHERE GLICU = '{{VoucherBatch}}'", expectedResult: "GL entries exist and balance" }
      ],
      integrationValidation: [
        "Debits equal credits in F0911",
        "AP liability posted correctly",
        "Accrual reversed"
      ],
      postConditions: ["Voucher ready for payment processing"],
      priority: "Critical",
      estimatedDuration: "12 minutes"
    },
    {
      testCaseId: "PROC_TC_004",
      title: "Purchase Order Budget Validation",
      module: "Procurement",
      jdeObject: "P4310",
      testType: "Negative",
      objective: "Verify PO entry fails when budget is exceeded",
      preconditions: [
        "Budget checking is enabled in processing options",
        "Budget exists for account but available amount is less than PO value"
      ],
      steps: [
        { stepNumber: 1, action: "Launch P4310 - Purchase Order Entry", jdeAction: "navigate", expected: "PO Entry form opens" },
        { stepNumber: 2, action: "Enter valid supplier", fieldId: "AN8", value: "{{SupplierNumber}}", expected: "Supplier accepted" },
        { stepNumber: 3, action: "Enter branch/plant", fieldId: "MCU", value: "{{BranchPlant}}", expected: "Branch accepted" },
        { stepNumber: 4, action: "Proceed to detail entry", jdeAction: "toolbar_click:OK", expected: "Detail form opens" },
        { stepNumber: 5, action: "Enter item with account that exceeds budget", fieldId: "LITM", value: "{{ItemNumber}}", expected: "Item accepted" },
        { stepNumber: 6, action: "Enter quantity that causes budget overrun", fieldId: "UORG", value: "{{LargeQuantity}}", expected: "Extended amount calculated" },
        { stepNumber: 7, action: "Attempt to save PO", jdeAction: "toolbar_click:OK", expected: "Budget error message displayed" }
      ],
      expectedResults: [
        "Error message: 'Budget exceeded for account {{Account}}'",
        "PO is NOT saved",
        "User returned to edit form to correct"
      ],
      tablesToValidate: [
        { tableName: "F4301", validationQuery: "WHERE PHAN8 = {{SupplierNumber}} AND PHDRQJ = {{TodayJulian}}", expectedResult: "No new PO created" }
      ],
      integrationValidation: [],
      postConditions: ["User must reduce quantity or get budget override"],
      priority: "High",
      estimatedDuration: "5 minutes"
    },
    {
      testCaseId: "PROC_TC_005",
      title: "Purchase Order Over-Receipt Tolerance",
      module: "Procurement",
      jdeObject: "P4312",
      testType: "Negative",
      objective: "Verify receipt is blocked when over-receipt exceeds tolerance",
      preconditions: [
        "PO exists with ordered quantity",
        "Over-receipt tolerance set to 5%",
        "User attempts to receive > 5% over ordered quantity"
      ],
      steps: [
        { stepNumber: 1, action: "Launch P4312 - PO Receipts", jdeAction: "navigate", expected: "Receipt form opens" },
        { stepNumber: 2, action: "Find PO with ordered quantity 100", fieldId: "DOCO", value: "{{PONumber}}", expected: "PO line displays" },
        { stepNumber: 3, action: "Select line for receipt", jdeAction: "grid_select", expected: "Line selected" },
        { stepNumber: 4, action: "Enter receipt quantity 110 (10% over)", fieldId: "UREC", value: "110", expected: "Quantity entered" },
        { stepNumber: 5, action: "Attempt to save receipt", jdeAction: "toolbar_click:OK", expected: "Over-receipt tolerance error displayed" }
      ],
      expectedResults: [
        "Error: 'Receipt quantity exceeds tolerance'",
        "Receipt NOT processed",
        "User must reduce quantity to within tolerance"
      ],
      tablesToValidate: [
        { tableName: "F43121", validationQuery: "WHERE PRDOCO = {{PONumber}} AND PRUREC > 105", expectedResult: "No over-receipt record created" }
      ],
      integrationValidation: [],
      postConditions: [],
      priority: "High",
      estimatedDuration: "5 minutes"
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // ORDER MANAGEMENT MODULE TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════
  "ORDER_MANAGEMENT": [
    {
      testCaseId: "OM_TC_001",
      title: "Create Standard Sales Order",
      module: "Order Management",
      jdeObject: "P4210",
      testType: "Functional",
      objective: "Verify sales order creation with credit check and inventory commitment",
      preconditions: [
        "Customer exists in F0101 with valid credit limit",
        "Item exists in F4101 with available inventory",
        "Processing option CreditCheck = Y",
        "User has access to P4210"
      ],
      steps: [
        { stepNumber: 1, action: "Launch P4210 - Sales Order Entry", jdeAction: "navigate", expected: "SO Entry header form opens" },
        { stepNumber: 2, action: "Select version ZJDE0001", jdeAction: "select_version", value: "ZJDE0001", expected: "Version loads" },
        { stepNumber: 3, action: "Enter customer number (sold-to)", fieldId: "AN8", value: "{{CustomerNumber}}", expected: "Customer name and addresses populate" },
        { stepNumber: 4, action: "Verify ship-to address defaulted", fieldId: "SHAN", expected: "Ship-to defaults from customer master" },
        { stepNumber: 5, action: "Enter branch/plant", fieldId: "MCU", value: "{{BranchPlant}}", expected: "Branch accepted" },
        { stepNumber: 6, action: "Proceed to detail entry", jdeAction: "toolbar_click:OK", expected: "Detail grid opens" },
        { stepNumber: 7, action: "Enter item number", fieldId: "LITM", value: "{{ItemNumber}}", expected: "Item description and price populate" },
        { stepNumber: 8, action: "Enter quantity", fieldId: "UORG", value: "{{Quantity}}", expected: "Quantity accepted, availability checked" },
        { stepNumber: 9, action: "Verify price from base price file", fieldId: "UPRC", expected: "Price displays from F4106 or customer pricing" },
        { stepNumber: 10, action: "Save order", jdeAction: "toolbar_click:OK", expected: "Order saved, credit check passed" },
        { stepNumber: 11, action: "Record order number", jdeAction: "capture", fieldId: "DOCO", expected: "Order number captured" }
      ],
      expectedResults: [
        "Sales order created with system-generated number",
        "Status 520 (Entered) or per order activity rules",
        "Credit limit NOT exceeded",
        "Inventory committed (soft commit)"
      ],
      tablesToValidate: [
        { tableName: "F4201", validationQuery: "WHERE SHDOCO = {{OrderNumber}}", expectedResult: "Header record exists with customer, status" },
        { tableName: "F4211", validationQuery: "WHERE SDDOCO = {{OrderNumber}}", expectedResult: "Detail records with items and quantities" },
        { tableName: "F41021", validationQuery: "WHERE LIITM = '{{ItemNumber}}'", expectedResult: "Committed quantity increased" }
      ],
      integrationValidation: [
        "Credit utilization updated",
        "Inventory commitment recorded"
      ],
      postConditions: ["Order ready for pick/ship processing"],
      priority: "Critical",
      estimatedDuration: "10 minutes"
    },
    {
      testCaseId: "OM_TC_002",
      title: "Credit Limit Exceeded - Order Hold",
      module: "Order Management",
      jdeObject: "P4210",
      testType: "Negative",
      objective: "Verify order is placed on hold when credit limit exceeded",
      preconditions: [
        "Customer has credit limit of $10,000",
        "Current open AR + this order > $10,000",
        "Processing option CreditCheck = Y, Action = Hold"
      ],
      steps: [
        { stepNumber: 1, action: "Launch P4210 - Sales Order Entry", jdeAction: "navigate", expected: "Form opens" },
        { stepNumber: 2, action: "Enter customer with limited credit", fieldId: "AN8", value: "{{LowCreditCustomer}}", expected: "Customer loaded" },
        { stepNumber: 3, action: "Enter item and large quantity", fieldId: "UORG", value: "1000", expected: "Order value exceeds credit" },
        { stepNumber: 4, action: "Attempt to save order", jdeAction: "toolbar_click:OK", expected: "Credit warning displayed" }
      ],
      expectedResults: [
        "Warning: 'Credit limit exceeded'",
        "Order placed on credit hold (status 580 or per config)",
        "Order NOT eligible for shipment until released"
      ],
      tablesToValidate: [
        { tableName: "F4201", validationQuery: "WHERE SHDOCO = {{OrderNumber}}", expectedResult: "Order exists with hold status" },
        { tableName: "F42119", validationQuery: "WHERE OEDOCO = {{OrderNumber}} AND OEHCOD = 'CH'", expectedResult: "Credit hold code recorded" }
      ],
      integrationValidation: [],
      postConditions: ["Order requires credit release before shipping"],
      priority: "High",
      estimatedDuration: "5 minutes"
    },
    {
      testCaseId: "OM_TC_003",
      title: "Sales Update - Invoice Creation",
      module: "Order Management",
      jdeObject: "R42800",
      testType: "Integration",
      objective: "Verify Sales Update creates AR invoice and GL entries",
      preconditions: [
        "Sales order exists with shipped status (560)",
        "R42800 configured for final mode"
      ],
      steps: [
        { stepNumber: 1, action: "Submit R42800 in proof mode", jdeAction: "submit_report", value: "Mode=1", expected: "Report runs without errors" },
        { stepNumber: 2, action: "Review proof report output", jdeAction: "view_report", expected: "Orders to process are listed" },
        { stepNumber: 3, action: "Submit R42800 in final mode", jdeAction: "submit_report", value: "Mode=2", expected: "Report completes successfully" },
        { stepNumber: 4, action: "Verify order status updated", jdeAction: "query", expected: "Status = 580 (Invoiced)" },
        { stepNumber: 5, action: "Verify AR invoice created", jdeAction: "query_table", expected: "Invoice exists in F03B11" },
        { stepNumber: 6, action: "Verify GL entries created", jdeAction: "query_table", expected: "F0911 entries exist" },
        { stepNumber: 7, action: "Verify GL entries balance", jdeAction: "validation", expected: "Debits = Credits" }
      ],
      expectedResults: [
        "Order status updated to 580 (Invoiced)",
        "AR invoice created in F03B11",
        "Revenue recognized in F0911",
        "COGS recorded",
        "Inventory relieved in F41021"
      ],
      tablesToValidate: [
        { tableName: "F4211", validationQuery: "WHERE SDDOCO = {{OrderNumber}} AND SDNXTR = '580'", expectedResult: "Status updated to invoiced" },
        { tableName: "F03B11", validationQuery: "WHERE RPDOCO = {{OrderNumber}}", expectedResult: "AR invoice created" },
        { tableName: "F0911", validationQuery: "WHERE GLDOC = {{OrderNumber}} AND GLKCO = 'SO'", expectedResult: "GL entries exist and balance" }
      ],
      integrationValidation: [
        "Total debits = total credits",
        "Revenue = order amount",
        "COGS = item cost * quantity",
        "Inventory reduced correctly"
      ],
      postConditions: ["Invoice ready for customer payment"],
      priority: "Critical",
      estimatedDuration: "15 minutes"
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNTS PAYABLE MODULE TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════
  "ACCOUNTS_PAYABLE": [
    {
      testCaseId: "AP_TC_001",
      title: "Standard Voucher Entry",
      module: "Accounts Payable",
      jdeObject: "P0411",
      testType: "Functional",
      objective: "Verify voucher entry with GL distribution",
      preconditions: [
        "Supplier exists in F0101 with valid payment terms",
        "GL account exists and is active",
        "User has P0411 access"
      ],
      steps: [
        { stepNumber: 1, action: "Launch P0411 - Voucher Entry", jdeAction: "navigate", expected: "Voucher entry form opens" },
        { stepNumber: 2, action: "Enter supplier number", fieldId: "AN8", value: "{{SupplierNumber}}", expected: "Supplier name and terms populate" },
        { stepNumber: 3, action: "Enter invoice number", fieldId: "VINV", value: "{{InvoiceNumber}}", expected: "Invoice accepted, not duplicate" },
        { stepNumber: 4, action: "Enter invoice date", fieldId: "DIVJ", value: "{{InvoiceDate}}", expected: "Date accepted, due date calculates" },
        { stepNumber: 5, action: "Enter gross amount", fieldId: "AG", value: "{{GrossAmount}}", expected: "Amount accepted" },
        { stepNumber: 6, action: "Enter GL distribution account", fieldId: "ANI", value: "{{ExpenseAccount}}", expected: "Account validated" },
        { stepNumber: 7, action: "Enter distribution amount", fieldId: "AA", value: "{{GrossAmount}}", expected: "Distribution equals gross" },
        { stepNumber: 8, action: "Save voucher", jdeAction: "toolbar_click:OK", expected: "Voucher saved with voucher number" }
      ],
      expectedResults: [
        "Voucher created in F0411",
        "Pay items created in F0414",
        "GL entries posted to F0911"
      ],
      tablesToValidate: [
        { tableName: "F0411", validationQuery: "WHERE RPAN8 = {{SupplierNumber}} AND RPVINV = '{{InvoiceNumber}}'", expectedResult: "Voucher record exists" },
        { tableName: "F0911", validationQuery: "WHERE GLDOC = {{VoucherNumber}}", expectedResult: "GL entries balance" }
      ],
      integrationValidation: [
        "AP liability = gross amount",
        "Expense = gross amount",
        "Debits = Credits"
      ],
      postConditions: ["Voucher ready for payment"],
      priority: "Critical",
      estimatedDuration: "8 minutes"
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNTS RECEIVABLE MODULE TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════
  "ACCOUNTS_RECEIVABLE": [
    {
      testCaseId: "AR_TC_001",
      title: "Receipt Entry and Application",
      module: "Accounts Receivable",
      jdeObject: "P03B2002",
      testType: "Functional",
      objective: "Verify receipt entry and application to open invoice",
      preconditions: [
        "Open invoice exists in F03B11",
        "Bank account is set up",
        "User has P03B2002 access"
      ],
      steps: [
        { stepNumber: 1, action: "Launch P03B2002 - Receipt Entry", jdeAction: "navigate", expected: "Receipt entry form opens" },
        { stepNumber: 2, action: "Enter customer number", fieldId: "AN8", value: "{{CustomerNumber}}", expected: "Customer name populates" },
        { stepNumber: 3, action: "Enter receipt amount", fieldId: "CKAM", value: "{{ReceiptAmount}}", expected: "Amount accepted" },
        { stepNumber: 4, action: "Enter bank account", fieldId: "GLBA", value: "{{BankAccount}}", expected: "Bank account validated" },
        { stepNumber: 5, action: "Select invoice to apply", jdeAction: "grid_select", expected: "Invoice selected" },
        { stepNumber: 6, action: "Apply payment to invoice", fieldId: "PAAP", value: "{{ReceiptAmount}}", expected: "Application amount accepted" },
        { stepNumber: 7, action: "Save receipt", jdeAction: "toolbar_click:OK", expected: "Receipt saved" }
      ],
      expectedResults: [
        "Receipt created in F03B13",
        "Application created in F03B14",
        "Invoice balance reduced",
        "GL entries for cash debit, AR credit"
      ],
      tablesToValidate: [
        { tableName: "F03B13", validationQuery: "WHERE RYAN8 = {{CustomerNumber}}", expectedResult: "Receipt record exists" },
        { tableName: "F03B14", validationQuery: "WHERE RPDOC = {{InvoiceNumber}}", expectedResult: "Application record exists" },
        { tableName: "F0911", validationQuery: "WHERE GLDOC = {{ReceiptNumber}}", expectedResult: "GL entries balance" }
      ],
      integrationValidation: [
        "Cash debit = receipt amount",
        "AR credit = receipt amount",
        "Invoice open amount = original - payment"
      ],
      postConditions: ["Receipt ready for deposit"],
      priority: "Critical",
      estimatedDuration: "10 minutes"
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL LEDGER MODULE TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════
  "GENERAL_LEDGER": [
    {
      testCaseId: "GL_TC_001",
      title: "Create Balanced Journal Entry",
      module: "General Ledger",
      jdeObject: "P09101",
      testType: "Functional",
      objective: "Verify journal entry creation with balanced debits and credits",
      preconditions: [
        "GL accounts exist and are active",
        "Fiscal period is open",
        "User has P09101 access"
      ],
      steps: [
        { stepNumber: 1, action: "Launch P09101 - Journal Entry", jdeAction: "navigate", expected: "Journal entry form opens" },
        { stepNumber: 2, action: "Enter company", fieldId: "KCO", value: "{{Company}}", expected: "Company accepted" },
        { stepNumber: 3, action: "Enter ledger type", fieldId: "LT", value: "AA", expected: "Ledger type accepted" },
        { stepNumber: 4, action: "Enter debit account", fieldId: "ANI", value: "{{DebitAccount}}", expected: "Account validated" },
        { stepNumber: 5, action: "Enter debit amount", fieldId: "AA", value: "{{Amount}}", expected: "Debit amount entered" },
        { stepNumber: 6, action: "Add new line for credit", jdeAction: "add_line", expected: "New line created" },
        { stepNumber: 7, action: "Enter credit account", fieldId: "ANI", value: "{{CreditAccount}}", expected: "Account validated" },
        { stepNumber: 8, action: "Enter credit amount (negative)", fieldId: "AA", value: "-{{Amount}}", expected: "Credit amount entered" },
        { stepNumber: 9, action: "Save journal entry", jdeAction: "toolbar_click:OK", expected: "JE saved if balanced" }
      ],
      expectedResults: [
        "Journal entry created in F0911",
        "Batch created with balanced status",
        "Debits equal credits"
      ],
      tablesToValidate: [
        { tableName: "F0911", validationQuery: "WHERE GLICU = {{BatchNumber}}", expectedResult: "JE records exist" },
        { tableName: "F0911", validationQuery: "SELECT SUM(GLAA) FROM F0911 WHERE GLICU = {{BatchNumber}}", expectedResult: "Sum = 0 (balanced)" }
      ],
      integrationValidation: [
        "Batch is in balanced status",
        "Ready for posting"
      ],
      postConditions: ["JE ready for posting"],
      priority: "Critical",
      estimatedDuration: "8 minutes"
    },
    {
      testCaseId: "GL_TC_002",
      title: "Reject Unbalanced Journal Entry",
      module: "General Ledger",
      jdeObject: "P09101",
      testType: "Negative",
      objective: "Verify unbalanced journal entry is rejected",
      preconditions: [
        "Processing option RequireBalance = Y"
      ],
      steps: [
        { stepNumber: 1, action: "Launch P09101 - Journal Entry", jdeAction: "navigate", expected: "Form opens" },
        { stepNumber: 2, action: "Enter debit of $1000", fieldId: "AA", value: "1000", expected: "Debit entered" },
        { stepNumber: 3, action: "Enter credit of $500", fieldId: "AA", value: "-500", expected: "Credit entered" },
        { stepNumber: 4, action: "Attempt to save", jdeAction: "toolbar_click:OK", expected: "Balance error displayed" }
      ],
      expectedResults: [
        "Error: 'Entry out of balance by $500'",
        "JE NOT saved",
        "User must correct before saving"
      ],
      tablesToValidate: [],
      integrationValidation: [],
      postConditions: [],
      priority: "High",
      estimatedDuration: "3 minutes"
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // INVENTORY MODULE TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════
  "INVENTORY": [
    {
      testCaseId: "INV_TC_001",
      title: "Inventory Issue Transaction",
      module: "Inventory",
      jdeObject: "P4111",
      testType: "Functional",
      objective: "Verify inventory issue reduces on-hand quantity",
      preconditions: [
        "Item exists with available inventory",
        "User has P4111 access"
      ],
      steps: [
        { stepNumber: 1, action: "Launch P4111 - Inventory Issues", jdeAction: "navigate", expected: "Issue entry form opens" },
        { stepNumber: 2, action: "Enter item number", fieldId: "ITM", value: "{{ItemNumber}}", expected: "Item validated" },
        { stepNumber: 3, action: "Enter branch/plant", fieldId: "MCU", value: "{{BranchPlant}}", expected: "Branch accepted" },
        { stepNumber: 4, action: "Enter quantity to issue", fieldId: "TRQT", value: "{{Quantity}}", expected: "Quantity accepted" },
        { stepNumber: 5, action: "Enter G/L date", fieldId: "DGL", value: "{{GLDate}}", expected: "Date accepted" },
        { stepNumber: 6, action: "Save issue transaction", jdeAction: "toolbar_click:OK", expected: "Issue processed" }
      ],
      expectedResults: [
        "Issue transaction created in F4111",
        "On-hand quantity reduced in F41021",
        "GL entries created for inventory relief"
      ],
      tablesToValidate: [
        { tableName: "F4111", validationQuery: "WHERE ILITM = '{{ItemNumber}}' AND ILTRQT < 0", expectedResult: "Issue transaction exists" },
        { tableName: "F41021", validationQuery: "WHERE LIITM = '{{ItemNumber}}'", expectedResult: "On-hand reduced by issue quantity" }
      ],
      integrationValidation: [
        "GL entries balance",
        "Inventory asset credit = issue value"
      ],
      postConditions: [],
      priority: "High",
      estimatedDuration: "5 minutes"
    }
  ],

  // Default for unknown modules
  "UNKNOWN": [],
  "MULTIPLE": []
};

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate JDE-specific test cases using rule-based templates
 */
export function generateJDERuleBasedTests(
  title: string,
  description: string,
  classification: JDEDocumentClassification,
  extractedObjects: string[] = []
): {
  testCases: JDERuleBasedTestCase[];
  generatedBy: string;
  jdeObjects: string[];
  coverageSummary: any;
} {
  const testCases: JDERuleBasedTestCase[] = [];
  let moduleKey = classification.jde_module;
  
  // ═══════════════════════════════════════════════════════════════════════
  // FALLBACK MODULE DETECTION FROM TITLE/DESCRIPTION
  // If classification returned UNKNOWN, try to infer from text
  // ═══════════════════════════════════════════════════════════════════════
  if (moduleKey === "UNKNOWN" || moduleKey === "MULTIPLE") {
    const combinedText = (title + " " + description).toLowerCase();
    
    if (/procurement|purchasing|purchase\s+order|supplier|vendor|p43\d{2}|f43\d{2}/i.test(combinedText)) {
      moduleKey = "PROCUREMENT";
    } else if (/sales|order\s+management|customer\s+order|p42\d{2}|f42\d{2}/i.test(combinedText)) {
      moduleKey = "ORDER_MANAGEMENT";
    } else if (/accounts\s+payable|voucher|ap|payment|p04\d{2}|f04\d{2}/i.test(combinedText)) {
      moduleKey = "ACCOUNTS_PAYABLE";
    } else if (/accounts\s+receivable|ar|receipt|invoice|p03b\d{2}|f03b\d{2}/i.test(combinedText)) {
      moduleKey = "ACCOUNTS_RECEIVABLE";
    } else if (/general\s+ledger|gl|journal|p09\d{2}|f09\d{2}/i.test(combinedText)) {
      moduleKey = "GENERAL_LEDGER";
    } else if (/inventory|stock|warehouse|item|p41\d{2}|f41\d{2}/i.test(combinedText)) {
      moduleKey = "INVENTORY";
    } else {
      // Default to PROCUREMENT as it's the most common
      moduleKey = "PROCUREMENT";
    }
    console.log(`[JDE-RULE-GEN] Module fallback: ${classification.jde_module} -> ${moduleKey}`);
  }
  
  // Get base templates for the module
  const moduleTemplates = JDE_FUNCTIONAL_TEMPLATES[moduleKey] || [];
  
  console.log(`[JDE-RULE-GEN] Module: ${moduleKey}, Templates found: ${moduleTemplates.length}`);
  
  // Add module-specific templates
  testCases.push(...moduleTemplates.map((tc, idx) => ({
    ...tc,
    testCaseId: `${moduleKey}_TC_${String(idx + 1).padStart(3, '0')}`
  })));
  
  // Add templates for any detected JDE objects
  for (const objId of extractedObjects) {
    const templates = getTestTemplates(objId);
    for (const template of templates) {
      // Avoid duplicates
      if (!testCases.some(tc => tc.testCaseId === template.testCaseId)) {
        // Convert JDETestCaseTemplate to JDERuleBasedTestCase format
        const convertedCase: JDERuleBasedTestCase = {
          testCaseId: template.testCaseId,
          title: `${template.jdeObject} - ${template.objective.substring(0, 50)}`,
          module: template.module,
          jdeObject: template.jdeObject,
          testType: template.testType as JDERuleBasedTestCase["testType"],
          objective: template.objective,
          preconditions: template.preconditions,
          steps: template.testSteps.map(s => ({
            stepNumber: s.stepNumber,
            action: s.action,
            jdeAction: s.jdeAction,
            fieldId: s.fieldId,
            value: s.value,
            expected: s.expected
          })),
          expectedResults: template.expectedResults,
          tablesToValidate: template.tablesToValidate,
          integrationValidation: template.integrationValidation,
          postConditions: template.postConditions,
          priority: template.priority,
          estimatedDuration: template.estimatedDuration
        };
        testCases.push(convertedCase);
      }
    }
  }
  
  // Add configuration test cases if document supports it
  if (classification.supports_configuration_testing) {
    testCases.push({
      testCaseId: `${moduleKey}_CFG_001`,
      title: "Verify Processing Option Configuration",
      module: classification.jde_module.replace(/_/g, ' '),
      jdeObject: extractedObjects[0] || "P0000",
      testType: "Configuration",
      objective: "Validate processing option settings match business requirements",
      preconditions: [
        "Access to Object Management Workbench (OMW)",
        "Knowledge of required processing option values"
      ],
      steps: [
        { stepNumber: 1, action: "Navigate to Object Management Workbench", expected: "OMW opens" },
        { stepNumber: 2, action: "Locate application version", expected: "Version found" },
        { stepNumber: 3, action: "Review processing options", expected: "Options displayed" },
        { stepNumber: 4, action: "Verify each option matches specification", expected: "All options as expected" },
        { stepNumber: 5, action: "Document any variances", expected: "Variances recorded" }
      ],
      expectedResults: [
        "All processing options match specification",
        "No unauthorized changes detected"
      ],
      tablesToValidate: [],
      integrationValidation: [],
      postConditions: [],
      priority: "Medium",
      estimatedDuration: "15 minutes"
    });
  }
  
  // Add data validation test cases
  if (classification.supports_data_validation && classification.detected_tables.length > 0) {
    testCases.push({
      testCaseId: `${moduleKey}_DV_001`,
      title: "Validate Table Data Integrity",
      module: classification.jde_module.replace(/_/g, ' '),
      jdeObject: classification.detected_tables[0] || "F0000",
      testType: "DataValidation",
      objective: `Verify data integrity in ${classification.detected_tables.slice(0, 3).join(', ')}`,
      preconditions: [
        "SQL query access to JDE tables",
        "Test data has been created through functional tests"
      ],
      steps: [
        { stepNumber: 1, action: "Execute validation queries", expected: "Queries complete" },
        { stepNumber: 2, action: "Verify foreign key relationships", expected: "All FKs valid" },
        { stepNumber: 3, action: "Check for orphaned records", expected: "No orphans found" },
        { stepNumber: 4, action: "Validate calculated fields", expected: "Calculations correct" },
        { stepNumber: 5, action: "Verify status field consistency", expected: "Statuses valid" }
      ],
      expectedResults: [
        "All data relationships are valid",
        "No orphaned records",
        "Calculated fields are accurate"
      ],
      tablesToValidate: classification.detected_tables.slice(0, 5).map(t => ({
        tableName: t,
        validationQuery: `SELECT COUNT(*) FROM ${t}`,
        expectedResult: "Records exist with valid data"
      })),
      integrationValidation: [],
      postConditions: [],
      priority: "Medium",
      estimatedDuration: "20 minutes"
    });
  }
  
  // Build coverage summary
  const coverageSummary = {
    totalTestCases: testCases.length,
    byType: testCases.reduce((acc, tc) => {
      acc[tc.testType] = (acc[tc.testType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    objectsCovered: Array.from(new Set(testCases.map(tc => tc.jdeObject))),
    tablesCovered: Array.from(new Set(testCases.flatMap(tc => tc.tablesToValidate.map(t => t.tableName)))),
    modulesCovered: Array.from(new Set(testCases.map(tc => tc.module)))
  };
  
  // ═══════════════════════════════════════════════════════════════════════
  // FALLBACK: If no test cases generated, create basic JDE test cases
  // This ensures we NEVER return empty results
  // ═══════════════════════════════════════════════════════════════════════
  if (testCases.length === 0) {
    console.log("[JDE-RULE-GEN] No templates found, generating basic JDE test cases");
    
    // Extract any program/table references from title/description
    const programMatches = (title + " " + description).match(/P\d{4,5}[A-Z]?/gi) || [];
    const tableMatches = (title + " " + description).match(/F\d{4,6}/gi) || [];
    const primaryProgram = programMatches[0]?.toUpperCase() || "P0000";
    const primaryTable = tableMatches[0]?.toUpperCase() || "F0000";
    
    testCases.push(
      {
        testCaseId: "JDE_TC_001",
        title: `${title} - Primary Functionality Test`,
        module: moduleKey.replace(/_/g, ' '),
        jdeObject: primaryProgram,
        testType: "Functional",
        objective: `Verify primary functionality for ${title}`,
        preconditions: [
          `User has access to ${primaryProgram}`,
          "Required master data exists",
          "System is in a testable state"
        ],
        steps: [
          { stepNumber: 1, action: `Launch ${primaryProgram}`, jdeAction: "navigate", expected: "Application opens successfully" },
          { stepNumber: 2, action: "Select appropriate version", jdeAction: "select_version", expected: "Version loads with configured defaults" },
          { stepNumber: 3, action: "Enter required header fields", jdeAction: "data_entry", expected: "Fields accept valid data" },
          { stepNumber: 4, action: "Enter required detail fields", jdeAction: "data_entry", expected: "Detail data accepted" },
          { stepNumber: 5, action: "Save the transaction", jdeAction: "toolbar_click:OK", expected: "Transaction saved successfully" },
          { stepNumber: 6, action: "Verify transaction recorded", jdeAction: "query", expected: "Record exists in database" }
        ],
        expectedResults: [
          "Transaction completed successfully",
          `Record created in ${primaryTable}`,
          "All validations passed"
        ],
        tablesToValidate: [
          { tableName: primaryTable, validationQuery: `SELECT * FROM ${primaryTable} WHERE ...`, expectedResult: "Record exists" }
        ],
        integrationValidation: [],
        postConditions: ["Transaction available for subsequent processing"],
        priority: "High",
        estimatedDuration: "10 minutes"
      },
      {
        testCaseId: "JDE_TC_002",
        title: `${title} - Negative Test - Invalid Data`,
        module: moduleKey.replace(/_/g, ' '),
        jdeObject: primaryProgram,
        testType: "Negative",
        objective: `Verify error handling for ${title}`,
        preconditions: [
          `User has access to ${primaryProgram}`,
          "Test will use invalid data values"
        ],
        steps: [
          { stepNumber: 1, action: `Launch ${primaryProgram}`, jdeAction: "navigate", expected: "Application opens" },
          { stepNumber: 2, action: "Enter invalid/blank required fields", jdeAction: "data_entry", expected: "Field validation triggered" },
          { stepNumber: 3, action: "Attempt to save", jdeAction: "toolbar_click:OK", expected: "Error message displayed" },
          { stepNumber: 4, action: "Verify error message clarity", jdeAction: "verify", expected: "Error clearly identifies the issue" }
        ],
        expectedResults: [
          "System prevents invalid data submission",
          "Clear error message displayed",
          "No partial record created"
        ],
        tablesToValidate: [
          { tableName: primaryTable, validationQuery: `SELECT * FROM ${primaryTable}`, expectedResult: "No invalid record exists" }
        ],
        integrationValidation: [],
        postConditions: [],
        priority: "High",
        estimatedDuration: "5 minutes"
      },
      {
        testCaseId: "JDE_TC_003",
        title: `${title} - Data Validation`,
        module: moduleKey.replace(/_/g, ' '),
        jdeObject: primaryTable,
        testType: "DataValidation",
        objective: `Verify data integrity for ${title}`,
        preconditions: [
          "Transactions have been processed",
          "SQL access to JDE tables available"
        ],
        steps: [
          { stepNumber: 1, action: `Query ${primaryTable} for test transactions`, jdeAction: "query_table", expected: "Records retrieved" },
          { stepNumber: 2, action: "Verify field values match input", jdeAction: "validation", expected: "All values correct" },
          { stepNumber: 3, action: "Check status field values", jdeAction: "validation", expected: "Status codes valid" },
          { stepNumber: 4, action: "Verify audit trail fields populated", jdeAction: "validation", expected: "USID, PID, UPMJ, UPMT populated" }
        ],
        expectedResults: [
          "All data values match expected",
          "Audit fields correctly populated",
          "No data corruption detected"
        ],
        tablesToValidate: [
          { tableName: primaryTable, validationQuery: `SELECT * FROM ${primaryTable}`, expectedResult: "Data integrity verified" }
        ],
        integrationValidation: [],
        postConditions: [],
        priority: "Medium",
        estimatedDuration: "15 minutes"
      }
    );
    
    console.log("[JDE-RULE-GEN] Generated " + testCases.length + " fallback JDE test cases");
  }
  
  return {
    testCases,
    generatedBy: "jde-rule-based",
    jdeObjects: extractedObjects,
    coverageSummary
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateJDERuleBasedTests,
  JDE_FUNCTIONAL_TEMPLATES
};
