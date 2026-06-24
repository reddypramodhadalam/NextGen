/**
 * AITAS Knowledge Base Schema
 * ═══════════════════════════════════════════════════════════════════════════════
 * Foundation for enterprise AI test case generation with RAG
 * Supports: JDE, SAP, Salesforce, and custom applications
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════════
// ENUMS & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const SourceTypes = {
  GITHUB: "GITHUB",
  BITBUCKET: "BITBUCKET",
  ORACLE_DOCS: "ORACLE_DOCS",
  SAP_DOCS: "SAP_DOCS",
  SALESFORCE_DOCS: "SALESFORCE_DOCS",
  SHAREPOINT: "SHAREPOINT",
  JIRA: "JIRA",
  CONFLUENCE: "CONFLUENCE",
  CUSTOM_URL: "CUSTOM_URL",
  FILE_UPLOAD: "FILE_UPLOAD",
} as const;

export const ApplicationTypes = {
  JDE: "JDE",
  SAP: "SAP",
  SALESFORCE: "SALESFORCE",
  CUSTOM: "CUSTOM",
} as const;

export const ModuleTags = {
  // JDE Modules
  JDE_PROCUREMENT: "JDE_PROCUREMENT",
  JDE_ORDER_MANAGEMENT: "JDE_ORDER_MANAGEMENT",
  JDE_ACCOUNTS_PAYABLE: "JDE_ACCOUNTS_PAYABLE",
  JDE_ACCOUNTS_RECEIVABLE: "JDE_ACCOUNTS_RECEIVABLE",
  JDE_GENERAL_LEDGER: "JDE_GENERAL_LEDGER",
  JDE_INVENTORY: "JDE_INVENTORY",
  JDE_FIXED_ASSETS: "JDE_FIXED_ASSETS",
  JDE_MANUFACTURING: "JDE_MANUFACTURING",
  // SAP Modules
  SAP_MM: "SAP_MM",
  SAP_SD: "SAP_SD",
  SAP_FI: "SAP_FI",
  SAP_CO: "SAP_CO",
  SAP_PP: "SAP_PP",
  SAP_HR: "SAP_HR",
  // Salesforce
  SF_SALES: "SF_SALES",
  SF_SERVICE: "SF_SERVICE",
  SF_MARKETING: "SF_MARKETING",
  SF_CPQ: "SF_CPQ",
} as const;

export const IngestionStatus = {
  PENDING: "PENDING",
  INGESTING: "INGESTING",
  CLASSIFYING: "CLASSIFYING",
  EXTRACTING: "EXTRACTING",
  EMBEDDING: "EMBEDDING",
  READY: "READY",
  FAILED: "FAILED",
} as const;

export const KnowledgeTypes = {
  PROCESS: "PROCESS",
  CONFIGURATION: "CONFIGURATION",
  INTEGRATION: "INTEGRATION",
  TABLE_SCHEMA: "TABLE_SCHEMA",
  BUSINESS_RULE: "BUSINESS_RULE",
  WORKFLOW: "WORKFLOW",
  REPORT: "REPORT",
} as const;

export const AuthTypes = {
  NONE: "NONE",
  OAUTH: "OAUTH",
  TOKEN: "TOKEN",
  BASIC: "BASIC",
  API_KEY: "API_KEY",
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

// Knowledge Source - Where knowledge comes from
export const knowledgeSourceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required"),
  sourceType: z.enum(Object.values(SourceTypes) as [string, ...string[]]),
  sourceUrl: z.string().url("Valid URL required"),
  moduleTag: z.enum(Object.values(ModuleTags) as [string, ...string[]]),
  application: z.enum(Object.values(ApplicationTypes) as [string, ...string[]]),
  authType: z.enum(Object.values(AuthTypes) as [string, ...string[]]).default("NONE"),
  authCredentials: z.record(z.string()).optional(), // Encrypted storage
  status: z.enum(Object.values(IngestionStatus) as [string, ...string[]]).default("PENDING"),
  lastIngested: z.date().optional(),
  documentCount: z.number().default(0),
  errorMessage: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

// Raw Document - Unprocessed content
export const rawDocumentSchema = z.object({
  id: z.string().uuid().optional(),
  sourceId: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  contentType: z.enum(["HTML", "PDF", "MARKDOWN", "TEXT", "JSON"]),
  sourceUrl: z.string().optional(),
  checksum: z.string(), // For deduplication
  wordCount: z.number(),
  createdAt: z.date().optional(),
});

// Document Classification - Non-AI rule-based classification result
export const documentClassificationSchema = z.object({
  id: z.string().uuid().optional(),
  documentId: z.string().uuid(),
  application: z.enum(Object.values(ApplicationTypes) as [string, ...string[]]),
  module: z.string(),
  documentType: z.string(), // IMPLEMENTATION_GUIDE, TECHNICAL_SPEC, USER_MANUAL, etc.
  supportsUIAutomation: z.boolean(),
  supportsFunctionalTesting: z.boolean(),
  supportsConfigurationTesting: z.boolean(),
  supportsIntegrationTesting: z.boolean(),
  detectedObjects: z.array(z.string()), // P4310, ME21N, Opportunity, etc.
  detectedTables: z.array(z.string()), // F4311, EKKO, etc.
  confidenceScore: z.number().min(0).max(100),
  classificationReasoning: z.string(),
  createdAt: z.date().optional(),
});

// Structured Knowledge - AI-extracted facts (THE MOST IMPORTANT TABLE)
export const structuredKnowledgeSchema = z.object({
  id: z.string().uuid().optional(),
  sourceId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  application: z.enum(Object.values(ApplicationTypes) as [string, ...string[]]),
  module: z.string(),
  objectName: z.string(), // P4310, ME21N, Opportunity
  knowledgeType: z.enum(Object.values(KnowledgeTypes) as [string, ...string[]]),
  facts: z.object({
    description: z.string().optional(),
    businessProcess: z.array(z.string()).optional(),
    relatedObjects: z.array(z.string()).optional(),
    tables: z.array(z.string()).optional(),
    fields: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
      dataType: z.string().optional(),
    })).optional(),
    configurations: z.array(z.string()).optional(),
    prerequisites: z.array(z.string()).optional(),
    integrations: z.array(z.string()).optional(),
    validations: z.array(z.string()).optional(),
  }),
  isAuthoritative: z.boolean().default(true), // Structured knowledge is authoritative
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

// Vector Embedding - For RAG retrieval
export const vectorEmbeddingSchema = z.object({
  id: z.string().uuid().optional(),
  sourceId: z.string().uuid(),
  knowledgeId: z.string().uuid().optional(), // Link to structured_knowledge
  chunkText: z.string(),
  embedding: z.array(z.number()), // Vector array
  metadata: z.object({
    application: z.string(),
    module: z.string(),
    objectName: z.string().optional(),
    knowledgeType: z.string(),
    sourceUrl: z.string().optional(),
  }),
  createdAt: z.date().optional(),
});

// Governance Rules - Module-specific requirements
export const governanceRuleSchema = z.object({
  id: z.string().uuid().optional(),
  application: z.enum(Object.values(ApplicationTypes) as [string, ...string[]]),
  module: z.string(),
  requiredObjects: z.array(z.string()), // Must include these in test cases
  requiredTables: z.array(z.string()),
  requiredValidations: z.array(z.string()),
  blockedTestTypes: z.array(z.string()),
  blockedPatterns: z.array(z.string()), // UI patterns to block
  businessFlowOrder: z.array(z.string()), // Expected flow sequence
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPESCRIPT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type SourceType = keyof typeof SourceTypes;
export type ApplicationType = keyof typeof ApplicationTypes;
export type ModuleTag = keyof typeof ModuleTags;
export type IngestionStatusType = keyof typeof IngestionStatus;
export type KnowledgeType = keyof typeof KnowledgeTypes;
export type AuthType = keyof typeof AuthTypes;

export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
export type RawDocument = z.infer<typeof rawDocumentSchema>;
export type DocumentClassification = z.infer<typeof documentClassificationSchema>;
export type StructuredKnowledge = z.infer<typeof structuredKnowledgeSchema>;
export type VectorEmbedding = z.infer<typeof vectorEmbeddingSchema>;
export type GovernanceRule = z.infer<typeof governanceRuleSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// INSERT SCHEMAS (for API validation)
// ═══════════════════════════════════════════════════════════════════════════════

export const insertKnowledgeSourceSchema = knowledgeSourceSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  status: true,
  lastIngested: true,
  documentCount: true,
  errorMessage: true,
});

export const insertStructuredKnowledgeSchema = structuredKnowledgeSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGovernanceRuleSchema = governanceRuleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ═══════════════════════════════════════════════════════════════════════════════
// RAG QUERY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RAGQuery {
  question: string;
  module: string;
  application: ApplicationType;
  testType?: string;
  maxResults?: number;
}

export interface RAGResult {
  content: string;
  metadata: {
    application: string;
    module: string;
    objectName?: string;
    knowledgeType: string;
    sourceUrl?: string;
  };
  score: number;
}

export interface TestGenerationContext {
  module: string;
  application: ApplicationType;
  testType: string;
  retrievedKnowledge: RAGResult[];
  governanceRules: GovernanceRule;
  allowedTestTypes: string[];
  blockedTestTypes: string[];
}
