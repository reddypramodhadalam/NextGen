/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENTERPRISE COVERAGE ANALYTICS ENGINE — AITAS
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Multi-dimensional coverage tracking for enterprise systems:
 * - Requirement Coverage (BR-001 → TC-01)
 * - Process Coverage (Procure-to-Pay, Order-to-Cash)
 * - Application Object Coverage (P4310, ME21N)
 * - Table/Data Coverage (F4311, EKKO)
 * - API Endpoint Coverage (POST /api/escalations)
 * - Negative/Boundary Coverage
 * 
 * Supports: JDE, SAP, Salesforce, Web, API, Mobile
 */

// @ts-nocheck
import { storage } from "./storage";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export type CoverageType = 
  | "REQUIREMENT" 
  | "PROCESS" 
  | "OBJECT" 
  | "TABLE" 
  | "API" 
  | "NEGATIVE"
  | "INTEGRATION"
  | "SECURITY"
  | "PERFORMANCE";

export type ApplicationType = 
  | "JDE" 
  | "SAP" 
  | "SALESFORCE" 
  | "WEB" 
  | "API" 
  | "MOBILE"
  | "DESKTOP";

export interface CoverageMetric {
  id: string;
  testCaseId: string;
  coverageType: CoverageType;
  coverageKey: string;           // P4310, F4311, /api/escalations, etc.
  applicationKey?: string;       // Additional context (table.column, method+endpoint)
  covered: boolean;
  lastTestedAt?: Date;
  passCount: number;
  failCount: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessDefinition {
  processId: string;
  name: string;                  // "Procure to Pay", "Order to Cash"
  applicationType: ApplicationType;
  steps: ProcessStep[];
  requiredObjects: string[];     // P4310, P4312, P4314 for JDE
  requiredTables: string[];      // F4311, F43121, F0911
  requiredAPIs?: string[];
}

export interface ProcessStep {
  stepId: string;
  name: string;
  order: number;
  requiredObjects: string[];
  requiredTables: string[];
  isOptional?: boolean;
  testCaseIds?: string[];
}

export interface CoverageGap {
  gapId: string;
  coverageType: CoverageType;
  missingKey: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  suggestedAction: string;
  relatedObjects?: string[];
}

export interface CoverageDashboard {
  summary: {
    overallCoverage: number;
    requirementCoverage: number;
    processCoverage: number;
    objectCoverage: number;
    tableCoverage: number;
    apiCoverage: number;
    negativeCoverage: number;
  };
  byApplication: Record<ApplicationType, {
    coverage: number;
    tested: number;
    total: number;
    passRate: number;
  }>;
  gaps: CoverageGap[];
  riskAreas: {
    key: string;
    type: CoverageType;
    riskScore: number;
    reason: string;
  }[];
  trends: {
    date: string;
    coverage: number;
    passRate: number;
  }[];
  generatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COVERAGE EXTRACTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

// JDE Object Patterns
const JDE_PATTERNS = {
  programs: /\b(P\d{4,5}[A-Z]?)\b/gi,         // P4310, P42101, P0411
  reports: /\b(R\d{4,5}[A-Z]?)\b/gi,          // R42800, R0911
  tables: /\b(F\d{4,5}[A-Z]?)\b/gi,           // F4311, F43121, F0911
  businessFunctions: /\b(B\d{6,7})\b/gi,       // B3400300
  mediaObjects: /\b(GT\d{4,5}[A-Z]?)\b/gi,    // GT4311
};

// SAP Object Patterns
const SAP_PATTERNS = {
  transactions: /\b([A-Z]{2,4}\d{2,3}[A-Z]?)\b/gi,  // ME21N, VA01, FB50, MM60
  tables: /\b([A-Z]{4,5})\b/gi,                      // EKKO, EKPO, VBAK, MSEG
  bapis: /\bBAPI_[A-Z_]+\b/gi,                      // BAPI_PO_CREATE
  reports: /\b(Z[A-Z_]+|Y[A-Z_]+)\b/gi,             // ZREPORT_001
  functions: /\b([A-Z]+_[A-Z_]+)\b/gi,              // RFC functions
};

// API Patterns
const API_PATTERNS = {
  endpoints: /\b(GET|POST|PUT|PATCH|DELETE)\s+([\/][^\s]+)/gi,
  paths: /\/api\/[a-z0-9\-_\/]+/gi,
  methods: /(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/gi,
};

// Salesforce Patterns
const SF_PATTERNS = {
  objects: /\b(Account|Contact|Opportunity|Lead|Case|Campaign|Order|Quote|Contract|Task|Event|User)\b/gi,
  customObjects: /\b([A-Z][a-zA-Z0-9]+__c)\b/g,
  flows: /\b(Flow_[A-Za-z0-9_]+)\b/gi,
  apex: /\b([A-Z][a-zA-Z0-9]+Controller|[A-Z][a-zA-Z0-9]+Handler|[A-Z][a-zA-Z0-9]+Service)\b/g,
};

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWN ENTERPRISE PROCESSES
// ═══════════════════════════════════════════════════════════════════════════════

const JDE_PROCESSES: ProcessDefinition[] = [
  {
    processId: "JDE_P2P",
    name: "Procure to Pay",
    applicationType: "JDE",
    requiredObjects: ["P4310", "P4311", "P4312", "P4314", "P0411", "P0413"],
    requiredTables: ["F4311", "F43121", "F4301", "F0411", "F0413", "F0911"],
    steps: [
      { stepId: "P2P_01", name: "Create Requisition", order: 1, requiredObjects: ["P43101"], requiredTables: ["F4301"] },
      { stepId: "P2P_02", name: "Create Purchase Order", order: 2, requiredObjects: ["P4310"], requiredTables: ["F4311", "F43121"] },
      { stepId: "P2P_03", name: "Receive Goods", order: 3, requiredObjects: ["P4312"], requiredTables: ["F43121", "F4111"] },
      { stepId: "P2P_04", name: "Match Voucher", order: 4, requiredObjects: ["P4314"], requiredTables: ["F43121", "F0411"] },
      { stepId: "P2P_05", name: "Create Voucher", order: 5, requiredObjects: ["P0411"], requiredTables: ["F0411", "F0414"] },
      { stepId: "P2P_06", name: "Post Payment", order: 6, requiredObjects: ["P0413"], requiredTables: ["F0413", "F0911"] },
    ],
  },
  {
    processId: "JDE_O2C",
    name: "Order to Cash",
    applicationType: "JDE",
    requiredObjects: ["P4210", "P4205", "P42101", "P03B11"],
    requiredTables: ["F4211", "F4201", "F42119", "F03B11", "F0911"],
    steps: [
      { stepId: "O2C_01", name: "Enter Sales Order", order: 1, requiredObjects: ["P4210", "P42101"], requiredTables: ["F4211", "F4201"] },
      { stepId: "O2C_02", name: "Ship Confirm", order: 2, requiredObjects: ["P4205"], requiredTables: ["F4211", "F42119"] },
      { stepId: "O2C_03", name: "Invoice Generation", order: 3, requiredObjects: ["R42565"], requiredTables: ["F4211", "F03B11"] },
      { stepId: "O2C_04", name: "Receive Payment", order: 4, requiredObjects: ["P03B102"], requiredTables: ["F03B11", "F0911"] },
    ],
  },
];

const SAP_PROCESSES: ProcessDefinition[] = [
  {
    processId: "SAP_P2P",
    name: "Procure to Pay",
    applicationType: "SAP",
    requiredObjects: ["ME21N", "ME22N", "ME23N", "MIGO", "MIRO", "F-53"],
    requiredTables: ["EKKO", "EKPO", "EBAN", "MSEG", "BSEG", "RBKP"],
    steps: [
      { stepId: "SAP_P2P_01", name: "Create Purchase Requisition", order: 1, requiredObjects: ["ME51N"], requiredTables: ["EBAN"] },
      { stepId: "SAP_P2P_02", name: "Create Purchase Order", order: 2, requiredObjects: ["ME21N"], requiredTables: ["EKKO", "EKPO"] },
      { stepId: "SAP_P2P_03", name: "Goods Receipt", order: 3, requiredObjects: ["MIGO"], requiredTables: ["MSEG", "MKPF"] },
      { stepId: "SAP_P2P_04", name: "Invoice Verification", order: 4, requiredObjects: ["MIRO"], requiredTables: ["RBKP", "RSEG"] },
      { stepId: "SAP_P2P_05", name: "Payment Processing", order: 5, requiredObjects: ["F-53", "F110"], requiredTables: ["BSEG", "BKPF"] },
    ],
  },
  {
    processId: "SAP_O2C",
    name: "Order to Cash",
    applicationType: "SAP",
    requiredObjects: ["VA01", "VA02", "VA03", "VL01N", "VF01", "F-28"],
    requiredTables: ["VBAK", "VBAP", "LIKP", "LIPS", "VBRK", "BSEG"],
    steps: [
      { stepId: "SAP_O2C_01", name: "Create Sales Order", order: 1, requiredObjects: ["VA01"], requiredTables: ["VBAK", "VBAP"] },
      { stepId: "SAP_O2C_02", name: "Delivery Creation", order: 2, requiredObjects: ["VL01N"], requiredTables: ["LIKP", "LIPS"] },
      { stepId: "SAP_O2C_03", name: "Goods Issue", order: 3, requiredObjects: ["VL02N"], requiredTables: ["MSEG", "MKPF"] },
      { stepId: "SAP_O2C_04", name: "Billing", order: 4, requiredObjects: ["VF01"], requiredTables: ["VBRK", "VBRP"] },
      { stepId: "SAP_O2C_05", name: "Payment Receipt", order: 5, requiredObjects: ["F-28"], requiredTables: ["BSEG", "BKPF"] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COVERAGE EXTRACTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class CoverageExtractor {
  
  /**
   * Extract all coverage keys from a test case
   */
  static extractCoverageKeys(testCase: any): CoverageMetric[] {
    const metrics: CoverageMetric[] = [];
    const now = new Date();
    
    // Combine all text content for analysis
    const textContent = [
      testCase.title || "",
      testCase.description || "",
      testCase.preconditions || "",
      JSON.stringify(testCase.steps || []),
      JSON.stringify(testCase.tags || []),
    ].join(" ");
    
    // Detect application type
    const appType = this.detectApplicationType(textContent);
    
    // Extract based on application type
    switch (appType) {
      case "JDE":
        metrics.push(...this.extractJDECoverage(testCase, textContent, now));
        break;
      case "SAP":
        metrics.push(...this.extractSAPCoverage(testCase, textContent, now));
        break;
      case "SALESFORCE":
        metrics.push(...this.extractSalesforceCoverage(testCase, textContent, now));
        break;
      default:
        metrics.push(...this.extractWebAPICoverage(testCase, textContent, now));
    }
    
    // Extract API endpoints
    metrics.push(...this.extractAPICoverage(testCase, textContent, now));
    
    // Detect negative test coverage
    if (this.isNegativeTest(textContent)) {
      metrics.push({
        id: `COV_NEG_${testCase.id}_${Date.now()}`,
        testCaseId: testCase.id,
        coverageType: "NEGATIVE",
        coverageKey: this.extractNegativeTestType(textContent),
        covered: true,
        passCount: 0,
        failCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    
    return metrics;
  }
  
  /**
   * Detect which enterprise application type the test is for
   */
  static detectApplicationType(text: string): ApplicationType {
    const upper = text.toUpperCase();
    
    // JDE detection
    if (/\b(P\d{4,5}|F\d{4,5}|R\d{4,5}|JDE|ENTERPRISEONE|E1|ORACLE.*JD|WORLD)\b/.test(upper)) {
      return "JDE";
    }
    
    // SAP detection
    if (/\b(SAP|FIORI|S\/4|S4HANA|HANA|TCODE|T-CODE|BAPI|RFC|EKKO|VBAK|ME21N|VA01|FB50)\b/.test(upper)) {
      return "SAP";
    }
    
    // Salesforce detection
    if (/\b(SALESFORCE|SFDC|LIGHTNING|APEX|VISUALFORCE|__C|OPPORTUNITY|LEAD|CAMPAIGN)\b/.test(upper)) {
      return "SALESFORCE";
    }
    
    // Mobile detection
    if (/\b(IOS|ANDROID|MOBILE|SWIPE|TAP|APP STORE|PLAY STORE|NATIVE APP)\b/.test(upper)) {
      return "MOBILE";
    }
    
    // API detection
    if (/\b(REST|GRAPHQL|GRPC|SOAP|WSDL|ENDPOINT|API|HTTP|JSON|XML)\b/.test(upper)) {
      return "API";
    }
    
    return "WEB";
  }
  
  /**
   * Extract JDE-specific coverage
   */
  private static extractJDECoverage(testCase: any, text: string, now: Date): CoverageMetric[] {
    const metrics: CoverageMetric[] = [];
    const seen = new Set<string>();
    
    // Extract programs (P objects)
    const programs = text.match(JDE_PATTERNS.programs) || [];
    for (const prog of programs) {
      const key = `OBJECT:${prog.toUpperCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        metrics.push({
          id: `COV_OBJ_${testCase.id}_${prog}_${Date.now()}`,
          testCaseId: testCase.id,
          coverageType: "OBJECT",
          coverageKey: prog.toUpperCase(),
          applicationKey: "JDE_PROGRAM",
          covered: true,
          passCount: 0,
          failCount: 0,
          metadata: { applicationType: "JDE", objectType: "program" },
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    
    // Extract reports (R objects)
    const reports = text.match(JDE_PATTERNS.reports) || [];
    for (const rpt of reports) {
      const key = `OBJECT:${rpt.toUpperCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        metrics.push({
          id: `COV_OBJ_${testCase.id}_${rpt}_${Date.now()}`,
          testCaseId: testCase.id,
          coverageType: "OBJECT",
          coverageKey: rpt.toUpperCase(),
          applicationKey: "JDE_REPORT",
          covered: true,
          passCount: 0,
          failCount: 0,
          metadata: { applicationType: "JDE", objectType: "report" },
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    
    // Extract tables (F objects)
    const tables = text.match(JDE_PATTERNS.tables) || [];
    for (const tbl of tables) {
      const key = `TABLE:${tbl.toUpperCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        metrics.push({
          id: `COV_TBL_${testCase.id}_${tbl}_${Date.now()}`,
          testCaseId: testCase.id,
          coverageType: "TABLE",
          coverageKey: tbl.toUpperCase(),
          applicationKey: "JDE_TABLE",
          covered: true,
          passCount: 0,
          failCount: 0,
          metadata: { applicationType: "JDE", objectType: "table" },
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    
    return metrics;
  }
  
  /**
   * Extract SAP-specific coverage
   */
  private static extractSAPCoverage(testCase: any, text: string, now: Date): CoverageMetric[] {
    const metrics: CoverageMetric[] = [];
    const seen = new Set<string>();
    
    // Extract transactions
    const tcodes = text.match(SAP_PATTERNS.transactions) || [];
    for (const tcode of tcodes) {
      if (tcode.length >= 3 && tcode.length <= 6) {
        const key = `OBJECT:${tcode.toUpperCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          metrics.push({
            id: `COV_OBJ_${testCase.id}_${tcode}_${Date.now()}`,
            testCaseId: testCase.id,
            coverageType: "OBJECT",
            coverageKey: tcode.toUpperCase(),
            applicationKey: "SAP_TCODE",
            covered: true,
            passCount: 0,
            failCount: 0,
            metadata: { applicationType: "SAP", objectType: "transaction" },
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }
    
    // Extract SAP tables (4-5 letter uppercase)
    const knownSAPTables = ["EKKO", "EKPO", "EBAN", "VBAK", "VBAP", "LIKP", "LIPS", "MSEG", "MKPF", "BKPF", "BSEG", "MARA", "MARC", "MARD"];
    for (const tbl of knownSAPTables) {
      if (text.toUpperCase().includes(tbl)) {
        const key = `TABLE:${tbl}`;
        if (!seen.has(key)) {
          seen.add(key);
          metrics.push({
            id: `COV_TBL_${testCase.id}_${tbl}_${Date.now()}`,
            testCaseId: testCase.id,
            coverageType: "TABLE",
            coverageKey: tbl,
            applicationKey: "SAP_TABLE",
            covered: true,
            passCount: 0,
            failCount: 0,
            metadata: { applicationType: "SAP", objectType: "table" },
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }
    
    // Extract BAPIs
    const bapis = text.match(SAP_PATTERNS.bapis) || [];
    for (const bapi of bapis) {
      const key = `API:${bapi.toUpperCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        metrics.push({
          id: `COV_API_${testCase.id}_${bapi}_${Date.now()}`,
          testCaseId: testCase.id,
          coverageType: "API",
          coverageKey: bapi.toUpperCase(),
          applicationKey: "SAP_BAPI",
          covered: true,
          passCount: 0,
          failCount: 0,
          metadata: { applicationType: "SAP", objectType: "bapi" },
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    
    return metrics;
  }
  
  /**
   * Extract Salesforce-specific coverage
   */
  private static extractSalesforceCoverage(testCase: any, text: string, now: Date): CoverageMetric[] {
    const metrics: CoverageMetric[] = [];
    const seen = new Set<string>();
    
    // Extract standard objects
    const objects = text.match(SF_PATTERNS.objects) || [];
    for (const obj of objects) {
      const key = `OBJECT:${obj}`;
      if (!seen.has(key)) {
        seen.add(key);
        metrics.push({
          id: `COV_OBJ_${testCase.id}_${obj}_${Date.now()}`,
          testCaseId: testCase.id,
          coverageType: "OBJECT",
          coverageKey: obj,
          applicationKey: "SF_OBJECT",
          covered: true,
          passCount: 0,
          failCount: 0,
          metadata: { applicationType: "SALESFORCE", objectType: "standard" },
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    
    // Extract custom objects
    const customObjects = text.match(SF_PATTERNS.customObjects) || [];
    for (const obj of customObjects) {
      const key = `OBJECT:${obj}`;
      if (!seen.has(key)) {
        seen.add(key);
        metrics.push({
          id: `COV_OBJ_${testCase.id}_${obj}_${Date.now()}`,
          testCaseId: testCase.id,
          coverageType: "OBJECT",
          coverageKey: obj,
          applicationKey: "SF_CUSTOM_OBJECT",
          covered: true,
          passCount: 0,
          failCount: 0,
          metadata: { applicationType: "SALESFORCE", objectType: "custom" },
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    
    return metrics;
  }
  
  /**
   * Extract Web/API coverage
   */
  private static extractWebAPICoverage(testCase: any, text: string, now: Date): CoverageMetric[] {
    const metrics: CoverageMetric[] = [];
    const seen = new Set<string>();
    
    // Extract URL paths
    const paths = text.match(API_PATTERNS.paths) || [];
    for (const path of paths) {
      const key = `API:${path}`;
      if (!seen.has(key)) {
        seen.add(key);
        metrics.push({
          id: `COV_API_${testCase.id}_${path.replace(/\//g, "_")}_${Date.now()}`,
          testCaseId: testCase.id,
          coverageType: "API",
          coverageKey: path,
          applicationKey: "REST_ENDPOINT",
          covered: true,
          passCount: 0,
          failCount: 0,
          metadata: { applicationType: "WEB", objectType: "endpoint" },
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    
    return metrics;
  }
  
  /**
   * Extract API coverage (for all app types)
   */
  private static extractAPICoverage(testCase: any, text: string, now: Date): CoverageMetric[] {
    const metrics: CoverageMetric[] = [];
    const seen = new Set<string>();
    
    // Extract method + endpoint combinations
    const methodEndpoints = text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+([\/][^\s,;]+)/gi);
    for (const match of methodEndpoints) {
      const method = match[1].toUpperCase();
      const endpoint = match[2];
      const key = `API:${method}:${endpoint}`;
      if (!seen.has(key)) {
        seen.add(key);
        metrics.push({
          id: `COV_API_${testCase.id}_${method}_${endpoint.replace(/\//g, "_")}_${Date.now()}`,
          testCaseId: testCase.id,
          coverageType: "API",
          coverageKey: `${method} ${endpoint}`,
          applicationKey: `${method}_ENDPOINT`,
          covered: true,
          passCount: 0,
          failCount: 0,
          metadata: { method, endpoint },
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    
    return metrics;
  }
  
  /**
   * Check if test is a negative test
   */
  private static isNegativeTest(text: string): boolean {
    const negativePatterns = [
      /\b(invalid|error|fail|reject|negative|boundary|edge|exception|null|empty|overflow|underflow|malformed)\b/i,
      /\b(unauthorized|forbidden|401|403|404|500|4\d\d|5\d\d)\b/i,
      /\b(should not|must not|cannot|doesn't|won't|can't)\b/i,
      /\b(missing|incomplete|incorrect|wrong|bad|malicious)\b/i,
    ];
    return negativePatterns.some(p => p.test(text));
  }
  
  /**
   * Extract the type of negative test
   */
  private static extractNegativeTestType(text: string): string {
    if (/\b(boundary|edge|min|max|overflow|underflow)\b/i.test(text)) return "BOUNDARY";
    if (/\b(null|empty|blank|missing)\b/i.test(text)) return "NULL_EMPTY";
    if (/\b(invalid|incorrect|wrong|bad|malformed)\b/i.test(text)) return "INVALID_INPUT";
    if (/\b(unauthorized|forbidden|401|403)\b/i.test(text)) return "AUTH_ERROR";
    if (/\b(404|not found)\b/i.test(text)) return "NOT_FOUND";
    if (/\b(500|server error|exception)\b/i.test(text)) return "SERVER_ERROR";
    if (/\b(timeout|slow|performance)\b/i.test(text)) return "TIMEOUT";
    return "GENERAL_NEGATIVE";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COVERAGE ANALYTICS ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class EnterpriseCoverageAnalytics {
  private coverageMetrics: Map<string, CoverageMetric[]> = new Map();
  private knownObjects: Map<ApplicationType, Set<string>> = new Map();
  
  constructor() {
    // Initialize known objects from process definitions
    this.initializeKnownObjects();
  }
  
  private initializeKnownObjects(): void {
    // JDE Objects
    const jdeObjects = new Set<string>();
    for (const process of JDE_PROCESSES) {
      process.requiredObjects.forEach(o => jdeObjects.add(o));
      process.requiredTables.forEach(t => jdeObjects.add(t));
      process.steps.forEach(s => {
        s.requiredObjects.forEach(o => jdeObjects.add(o));
        s.requiredTables.forEach(t => jdeObjects.add(t));
      });
    }
    this.knownObjects.set("JDE", jdeObjects);
    
    // SAP Objects
    const sapObjects = new Set<string>();
    for (const process of SAP_PROCESSES) {
      process.requiredObjects.forEach(o => sapObjects.add(o));
      process.requiredTables.forEach(t => sapObjects.add(t));
      process.steps.forEach(s => {
        s.requiredObjects.forEach(o => sapObjects.add(o));
        s.requiredTables.forEach(t => sapObjects.add(t));
      });
    }
    this.knownObjects.set("SAP", sapObjects);
  }
  
  /**
   * Process a test case and extract coverage metrics
   */
  async processTestCase(testCase: any): Promise<CoverageMetric[]> {
    const metrics = CoverageExtractor.extractCoverageKeys(testCase);
    
    // Store metrics
    this.coverageMetrics.set(testCase.id, metrics);
    
    return metrics;
  }
  
  /**
   * Process all test cases and build coverage map
   */
  async processAllTestCases(): Promise<void> {
    const testCases = await storage.getAllTestCases();
    console.log(`[Coverage] Processing ${testCases.length} test cases...`);
    
    for (const tc of testCases) {
      await this.processTestCase(tc);
    }
    
    console.log(`[Coverage] Extracted coverage for ${this.coverageMetrics.size} test cases`);
  }
  
  /**
   * Calculate process coverage for a specific process
   */
  calculateProcessCoverage(processId: string): {
    coverage: number;
    coveredSteps: string[];
    uncoveredSteps: string[];
    details: { stepId: string; name: string; covered: boolean; testCaseIds: string[] }[];
  } {
    const process = [...JDE_PROCESSES, ...SAP_PROCESSES].find(p => p.processId === processId);
    if (!process) {
      return { coverage: 0, coveredSteps: [], uncoveredSteps: [], details: [] };
    }
    
    // Get all covered objects across all test cases
    const allCoveredObjects = new Set<string>();
    for (const [_, metrics] of this.coverageMetrics) {
      for (const m of metrics) {
        if (m.coverageType === "OBJECT" || m.coverageType === "TABLE") {
          allCoveredObjects.add(m.coverageKey);
        }
      }
    }
    
    const details: { stepId: string; name: string; covered: boolean; testCaseIds: string[] }[] = [];
    const coveredSteps: string[] = [];
    const uncoveredSteps: string[] = [];
    
    for (const step of process.steps) {
      // Check if all required objects for this step are covered
      const allObjectsCovered = step.requiredObjects.every(obj => allCoveredObjects.has(obj));
      const allTablesCovered = step.requiredTables.every(tbl => allCoveredObjects.has(tbl));
      const isCovered = allObjectsCovered && allTablesCovered;
      
      // Find test cases that cover this step
      const coveringTestCases: string[] = [];
      for (const [tcId, metrics] of this.coverageMetrics) {
        const tcObjects = new Set(metrics.filter(m => m.coverageType === "OBJECT" || m.coverageType === "TABLE").map(m => m.coverageKey));
        if (step.requiredObjects.some(obj => tcObjects.has(obj))) {
          coveringTestCases.push(tcId);
        }
      }
      
      details.push({
        stepId: step.stepId,
        name: step.name,
        covered: isCovered,
        testCaseIds: coveringTestCases,
      });
      
      if (isCovered) {
        coveredSteps.push(step.stepId);
      } else {
        uncoveredSteps.push(step.stepId);
      }
    }
    
    const coverage = process.steps.length > 0 
      ? Math.round((coveredSteps.length / process.steps.length) * 100)
      : 0;
    
    return { coverage, coveredSteps, uncoveredSteps, details };
  }
  
  /**
   * Calculate object coverage for an application type
   */
  calculateObjectCoverage(appType: ApplicationType): {
    coverage: number;
    tested: number;
    total: number;
    passRate: number;
    coveredObjects: string[];
    uncoveredObjects: string[];
  } {
    const knownObjects = this.knownObjects.get(appType) || new Set();
    const coveredObjects = new Set<string>();
    
    for (const [_, metrics] of this.coverageMetrics) {
      for (const m of metrics) {
        if (m.metadata?.applicationType === appType && m.coverageType === "OBJECT") {
          coveredObjects.add(m.coverageKey);
        }
      }
    }
    
    const tested = coveredObjects.size;
    const total = knownObjects.size || tested; // If no known objects, use tested count
    const coverage = total > 0 ? Math.round((tested / total) * 100) : 0;
    
    return {
      coverage,
      tested,
      total,
      passRate: 0, // Would be calculated from execution results
      coveredObjects: Array.from(coveredObjects),
      uncoveredObjects: Array.from(knownObjects).filter(o => !coveredObjects.has(o)),
    };
  }
  
  /**
   * Identify coverage gaps
   */
  identifyGaps(): CoverageGap[] {
    const gaps: CoverageGap[] = [];
    
    // Check each known process
    for (const process of [...JDE_PROCESSES, ...SAP_PROCESSES]) {
      const processCoverage = this.calculateProcessCoverage(process.processId);
      
      for (const step of processCoverage.details) {
        if (!step.covered) {
          gaps.push({
            gapId: `GAP_${process.processId}_${step.stepId}`,
            coverageType: "PROCESS",
            missingKey: step.name,
            description: `Process step "${step.name}" in ${process.name} is not covered by any test`,
            severity: process.steps.findIndex(s => s.stepId === step.stepId) < 2 ? "critical" : "high",
            suggestedAction: `Create test case for ${step.name} covering objects: ${process.steps.find(s => s.stepId === step.stepId)?.requiredObjects.join(", ")}`,
            relatedObjects: process.steps.find(s => s.stepId === step.stepId)?.requiredObjects,
          });
        }
      }
    }
    
    // Check for missing negative tests
    let hasNegativeTests = false;
    for (const [_, metrics] of this.coverageMetrics) {
      if (metrics.some(m => m.coverageType === "NEGATIVE")) {
        hasNegativeTests = true;
        break;
      }
    }
    
    if (!hasNegativeTests && this.coverageMetrics.size > 0) {
      gaps.push({
        gapId: "GAP_NO_NEGATIVE_TESTS",
        coverageType: "NEGATIVE",
        missingKey: "NEGATIVE_TESTS",
        description: "No negative/boundary test cases found in the test suite",
        severity: "high",
        suggestedAction: "Add test cases for invalid inputs, boundary conditions, and error scenarios",
      });
    }
    
    return gaps;
  }
  
  /**
   * Build complete coverage dashboard
   */
  async buildDashboard(): Promise<CoverageDashboard> {
    await this.processAllTestCases();
    
    // Calculate coverage by type
    let totalObjects = 0;
    let coveredObjects = 0;
    let totalTables = 0;
    let coveredTables = 0;
    let totalAPIs = 0;
    let coveredAPIs = 0;
    let negativeTests = 0;
    
    for (const [_, metrics] of this.coverageMetrics) {
      for (const m of metrics) {
        switch (m.coverageType) {
          case "OBJECT":
            totalObjects++;
            if (m.covered) coveredObjects++;
            break;
          case "TABLE":
            totalTables++;
            if (m.covered) coveredTables++;
            break;
          case "API":
            totalAPIs++;
            if (m.covered) coveredAPIs++;
            break;
          case "NEGATIVE":
            negativeTests++;
            break;
        }
      }
    }
    
    // Calculate process coverage across all processes
    const allProcesses = [...JDE_PROCESSES, ...SAP_PROCESSES];
    let totalProcessSteps = 0;
    let coveredProcessSteps = 0;
    
    for (const process of allProcesses) {
      const coverage = this.calculateProcessCoverage(process.processId);
      totalProcessSteps += process.steps.length;
      coveredProcessSteps += coverage.coveredSteps.length;
    }
    
    // Get requirement coverage from existing matrix
    let requirementCoverage = 0;
    try {
      const { coverageMatrix } = await import("./coverage-matrix");
      const matrix = await coverageMatrix.buildMatrix();
      requirementCoverage = matrix.stats.coveragePercent;
    } catch (e) {
      console.error("[Coverage] Could not get requirement coverage:", e);
    }
    
    // Calculate by application type
    const byApplication: CoverageDashboard["byApplication"] = {
      JDE: this.calculateObjectCoverage("JDE"),
      SAP: this.calculateObjectCoverage("SAP"),
      SALESFORCE: this.calculateObjectCoverage("SALESFORCE"),
      WEB: this.calculateObjectCoverage("WEB"),
      API: this.calculateObjectCoverage("API"),
      MOBILE: this.calculateObjectCoverage("MOBILE"),
      DESKTOP: this.calculateObjectCoverage("DESKTOP"),
    };
    
    // Identify gaps
    const gaps = this.identifyGaps();
    
    // Calculate risk areas
    const riskAreas = gaps
      .filter(g => g.severity === "critical" || g.severity === "high")
      .map(g => ({
        key: g.missingKey,
        type: g.coverageType,
        riskScore: g.severity === "critical" ? 90 : 70,
        reason: g.description,
      }));
    
    // Calculate overall metrics
    const objectCoverage = totalObjects > 0 ? Math.round((coveredObjects / totalObjects) * 100) : 0;
    const tableCoverage = totalTables > 0 ? Math.round((coveredTables / totalTables) * 100) : 0;
    const apiCoverage = totalAPIs > 0 ? Math.round((coveredAPIs / totalAPIs) * 100) : 0;
    const processCoverage = totalProcessSteps > 0 ? Math.round((coveredProcessSteps / totalProcessSteps) * 100) : 0;
    const negativeCoverage = negativeTests > 0 ? 100 : 0; // Binary for now
    
    const overallCoverage = Math.round(
      (requirementCoverage * 0.25) +
      (processCoverage * 0.25) +
      (objectCoverage * 0.20) +
      (tableCoverage * 0.15) +
      (apiCoverage * 0.10) +
      (negativeCoverage * 0.05)
    );
    
    return {
      summary: {
        overallCoverage,
        requirementCoverage,
        processCoverage,
        objectCoverage,
        tableCoverage,
        apiCoverage,
        negativeCoverage,
      },
      byApplication,
      gaps,
      riskAreas,
      trends: [], // Would be populated from historical data
      generatedAt: new Date(),
    };
  }
  
  /**
   * Get coverage for a specific test case
   */
  getTestCaseCoverage(testCaseId: string): CoverageMetric[] {
    return this.coverageMetrics.get(testCaseId) || [];
  }
}

// Export singleton instance
export const enterpriseCoverageAnalytics = new EnterpriseCoverageAnalytics();
