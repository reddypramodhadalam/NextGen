/**
 * AITAS Knowledge Base Storage
 * ═══════════════════════════════════════════════════════════════════════════════
 * Database operations for Knowledge Base entities
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { 
  KnowledgeSource, 
  RawDocument, 
  DocumentClassification,
  StructuredKnowledge,
  GovernanceRule,
  IngestionStatus,
} from "../shared/knowledge-schema";

export interface IKnowledgeStorage {
  // Knowledge Sources
  createKnowledgeSource(source: Omit<KnowledgeSource, 'id' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeSource>;
  getKnowledgeSource(id: string): Promise<KnowledgeSource | null>;
  getAllKnowledgeSources(): Promise<KnowledgeSource[]>;
  getKnowledgeSourcesByModule(module: string): Promise<KnowledgeSource[]>;
  updateKnowledgeSource(id: string, updates: Partial<KnowledgeSource>): Promise<KnowledgeSource | null>;
  deleteKnowledgeSource(id: string): Promise<void>;
  /** Find an existing source for idempotent ingestion (by URL, or app+module+name). */
  findExistingSource(query: { sourceUrl?: string; application?: string; moduleTag?: string; name?: string }): Promise<KnowledgeSource | null>;
  
  // Raw Documents
  createRawDocument(doc: Omit<RawDocument, 'id' | 'createdAt'>): Promise<RawDocument>;
  getRawDocument(id: string): Promise<RawDocument | null>;
  getRawDocumentsBySource(sourceId: string): Promise<RawDocument[]>;
  deleteRawDocumentsBySource(sourceId: string): Promise<void>;
  
  // Document Classifications
  createDocumentClassification(classification: Omit<DocumentClassification, 'id' | 'createdAt'>): Promise<DocumentClassification>;
  getDocumentClassification(documentId: string): Promise<DocumentClassification | null>;
  
  // Structured Knowledge (MOST IMPORTANT)
  createStructuredKnowledge(knowledge: Omit<StructuredKnowledge, 'id' | 'createdAt' | 'updatedAt'>): Promise<StructuredKnowledge>;
  getStructuredKnowledge(id: string): Promise<StructuredKnowledge | null>;
  getStructuredKnowledgeByModule(module: string): Promise<StructuredKnowledge[]>;
  getStructuredKnowledgeByObject(objectName: string): Promise<StructuredKnowledge[]>;
  searchStructuredKnowledge(query: {
    application?: string;
    module?: string;
    objectName?: string;
    knowledgeType?: string;
  }): Promise<StructuredKnowledge[]>;
  deleteStructuredKnowledgeBySource(sourceId: string): Promise<void>;
  
  // Governance Rules
  createGovernanceRule(rule: Omit<GovernanceRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<GovernanceRule>;
  getGovernanceRule(id: string): Promise<GovernanceRule | null>;
  getGovernanceRuleByModule(application: string, module: string): Promise<GovernanceRule | null>;
  getAllGovernanceRules(): Promise<GovernanceRule[]>;
  updateGovernanceRule(id: string, updates: Partial<GovernanceRule>): Promise<GovernanceRule | null>;
  deleteGovernanceRule(id: string): Promise<void>;
  
  // Ingestion Status Updates
  updateIngestionStatus(sourceId: string, status: keyof typeof IngestionStatus, errorMessage?: string): Promise<void>;
  incrementDocumentCount(sourceId: string, count: number): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SQLITE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";

export class SQLiteKnowledgeStorage implements IKnowledgeStorage {
  private db: Database.Database;
  
  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(process.cwd(), "aitas-knowledge.db");
    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.initializeTables();
  }
  
  private initializeTables(): void {
    // Knowledge Sources
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_url TEXT NOT NULL,
        module_tag TEXT NOT NULL,
        application TEXT NOT NULL,
        auth_type TEXT DEFAULT 'NONE',
        auth_credentials TEXT,
        status TEXT DEFAULT 'PENDING',
        last_ingested TEXT,
        document_count INTEGER DEFAULT 0,
        error_message TEXT,
        checksum TEXT,
        content_size INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Safe migration for pre-existing DBs that lack the idempotency columns.
    for (const [col, ddl] of [
      ["checksum", "ALTER TABLE knowledge_sources ADD COLUMN checksum TEXT"],
      ["content_size", "ALTER TABLE knowledge_sources ADD COLUMN content_size INTEGER"],
    ] as const) {
      const has = (this.db.prepare(`PRAGMA table_info(knowledge_sources)`).all() as any[])
        .some((c) => c.name === col);
      if (!has) {
        try { this.db.exec(ddl); console.log(`[KnowledgeStorage] Migrated: added ${col} column`); } catch {}
      }
    }
    
    // Raw Documents
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS raw_documents (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL,
        source_url TEXT,
        checksum TEXT NOT NULL,
        word_count INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE
      )
    `);
    
    // Document Classifications
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS document_classifications (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL UNIQUE,
        application TEXT NOT NULL,
        module TEXT NOT NULL,
        document_type TEXT NOT NULL,
        supports_ui_automation INTEGER NOT NULL,
        supports_functional_testing INTEGER NOT NULL,
        supports_configuration_testing INTEGER NOT NULL,
        supports_integration_testing INTEGER NOT NULL,
        detected_objects TEXT NOT NULL,
        detected_tables TEXT NOT NULL,
        confidence_score REAL NOT NULL,
        classification_reasoning TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (document_id) REFERENCES raw_documents(id) ON DELETE CASCADE
      )
    `);
    
    // Structured Knowledge (THE AUTHORITATIVE TABLE)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS structured_knowledge (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        document_id TEXT,
        application TEXT NOT NULL,
        module TEXT NOT NULL,
        object_name TEXT NOT NULL,
        knowledge_type TEXT NOT NULL,
        facts TEXT NOT NULL,
        is_authoritative INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sk_module ON structured_knowledge(module);
      CREATE INDEX IF NOT EXISTS idx_sk_object ON structured_knowledge(object_name);
      CREATE INDEX IF NOT EXISTS idx_sk_app_module ON structured_knowledge(application, module);
    `);
    
    // Governance Rules
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS governance_rules (
        id TEXT PRIMARY KEY,
        application TEXT NOT NULL,
        module TEXT NOT NULL,
        required_objects TEXT NOT NULL,
        required_tables TEXT NOT NULL,
        required_validations TEXT NOT NULL,
        blocked_test_types TEXT NOT NULL,
        blocked_patterns TEXT NOT NULL,
        business_flow_order TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(application, module)
      )
    `);
    
    // Seed default governance rules
    this.seedGovernanceRules();
  }
  
  private seedGovernanceRules(): void {
    const existingRules = this.db.prepare("SELECT COUNT(*) as count FROM governance_rules").get() as { count: number };
    if (existingRules.count > 0) return;
    
    const defaultRules: Omit<GovernanceRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        application: "JDE",
        module: "PROCUREMENT",
        requiredObjects: ["P4310", "P4312", "P4314"],
        requiredTables: ["F4311", "F43121", "F0411", "F0911"],
        requiredValidations: ["PO approval workflow", "Budget validation", "Supplier validation"],
        blockedTestTypes: ["UI_AUTOMATION"],
        blockedPatterns: ["click", "navigate", "input", "button", "url", "xpath", "css selector"],
        businessFlowOrder: ["Create PO", "Approve PO", "Receive Goods", "Create Voucher", "Post to GL"],
        isActive: true,
      },
      {
        application: "JDE",
        module: "ORDER_MANAGEMENT",
        requiredObjects: ["P4210", "P4205", "R42800"],
        requiredTables: ["F4201", "F4211", "F42119"],
        requiredValidations: ["Credit check", "Inventory availability", "Pricing validation"],
        blockedTestTypes: ["UI_AUTOMATION"],
        blockedPatterns: ["click", "navigate", "input", "button", "url"],
        businessFlowOrder: ["Enter Order", "Check Inventory", "Confirm Shipment", "Invoice"],
        isActive: true,
      },
      {
        application: "JDE",
        module: "ACCOUNTS_PAYABLE",
        requiredObjects: ["P0411", "P04105", "R04570"],
        requiredTables: ["F0411", "F0414", "F0911"],
        requiredValidations: ["Voucher matching", "Payment terms", "GL distribution"],
        blockedTestTypes: ["UI_AUTOMATION"],
        blockedPatterns: ["click", "navigate", "input", "button", "url"],
        businessFlowOrder: ["Create Voucher", "Match Voucher", "Approve Voucher", "Process Payment"],
        isActive: true,
      },
      {
        application: "JDE",
        module: "ACCOUNTS_RECEIVABLE",
        requiredObjects: ["P03B11", "P03B2002", "R03B525"],
        requiredTables: ["F03B11", "F03B14", "F0911"],
        requiredValidations: ["Invoice generation", "Payment application", "Credit memo processing"],
        blockedTestTypes: ["UI_AUTOMATION"],
        blockedPatterns: ["click", "navigate", "input", "button", "url"],
        businessFlowOrder: ["Generate Invoice", "Apply Receipt", "Process Adjustments"],
        isActive: true,
      },
      {
        application: "JDE",
        module: "GENERAL_LEDGER",
        requiredObjects: ["P0901", "P09101", "R09801"],
        requiredTables: ["F0901", "F0902", "F0911", "F0006"],
        requiredValidations: ["Account balance", "Intercompany", "Period close"],
        blockedTestTypes: ["UI_AUTOMATION"],
        blockedPatterns: ["click", "navigate", "input", "button", "url"],
        businessFlowOrder: ["Journal Entry", "Post Batch", "Review Balances", "Close Period"],
        isActive: true,
      },
      {
        application: "JDE",
        module: "INVENTORY",
        requiredObjects: ["P4111", "P41026", "R41543"],
        requiredTables: ["F4111", "F41021", "F4102"],
        requiredValidations: ["Quantity on hand", "Location validation", "Lot control"],
        blockedTestTypes: ["UI_AUTOMATION"],
        blockedPatterns: ["click", "navigate", "input", "button", "url"],
        businessFlowOrder: ["Issue Inventory", "Transfer", "Adjust Quantities", "Cycle Count"],
        isActive: true,
      },
      {
        application: "SAP",
        module: "MM",
        requiredObjects: ["ME21N", "ME51N", "MIGO", "MIRO"],
        requiredTables: ["EKKO", "EKPO", "MSEG", "RBKP"],
        requiredValidations: ["Vendor validation", "Material availability", "Price verification"],
        blockedTestTypes: ["UI_AUTOMATION"],
        blockedPatterns: ["click", "navigate", "input", "button", "url"],
        businessFlowOrder: ["Create PR", "Create PO", "Goods Receipt", "Invoice Verification"],
        isActive: true,
      },
      {
        application: "SAP",
        module: "SD",
        requiredObjects: ["VA01", "VL01N", "VF01"],
        requiredTables: ["VBAK", "VBAP", "LIKP", "VBRK"],
        requiredValidations: ["Customer credit", "Availability check", "Pricing determination"],
        blockedTestTypes: ["UI_AUTOMATION"],
        blockedPatterns: ["click", "navigate", "input", "button", "url"],
        businessFlowOrder: ["Create Order", "Delivery", "Billing", "Accounting"],
        isActive: true,
      },
      {
        application: "SALESFORCE",
        module: "SALES",
        requiredObjects: ["Opportunity", "Account", "Quote", "Order"],
        requiredTables: [],
        requiredValidations: ["Opportunity stage", "Quote approval", "Contract generation"],
        blockedTestTypes: ["UI_AUTOMATION"],
        blockedPatterns: ["click", "navigate", "input", "button", "url"],
        businessFlowOrder: ["Create Lead", "Convert Lead", "Create Opportunity", "Generate Quote", "Close Won"],
        isActive: true,
      },
    ];
    
    const stmt = this.db.prepare(`
      INSERT INTO governance_rules (id, application, module, required_objects, required_tables, 
        required_validations, blocked_test_types, blocked_patterns, business_flow_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const rule of defaultRules) {
      stmt.run(
        uuidv4(),
        rule.application,
        rule.module,
        JSON.stringify(rule.requiredObjects),
        JSON.stringify(rule.requiredTables),
        JSON.stringify(rule.requiredValidations),
        JSON.stringify(rule.blockedTestTypes),
        JSON.stringify(rule.blockedPatterns),
        JSON.stringify(rule.businessFlowOrder),
        rule.isActive ? 1 : 0
      );
    }
    
    console.log("[KnowledgeStorage] Seeded default governance rules");
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // KNOWLEDGE SOURCES
  // ═══════════════════════════════════════════════════════════════════════════
  
  async createKnowledgeSource(source: Omit<KnowledgeSource, 'id' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeSource> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    this.db.prepare(`
      INSERT INTO knowledge_sources (id, name, source_type, source_url, module_tag, application, 
        auth_type, auth_credentials, status, checksum, content_size, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      source.name,
      source.sourceType,
      source.sourceUrl,
      source.moduleTag,
      source.application,
      source.authType || "NONE",
      source.authCredentials ? JSON.stringify(source.authCredentials) : null,
      "PENDING",
      (source as any).checksum ?? null,
      (source as any).contentSize ?? null,
      now,
      now
    );
    
    return this.getKnowledgeSource(id) as Promise<KnowledgeSource>;
  }
  
  async getKnowledgeSource(id: string): Promise<KnowledgeSource | null> {
    const row = this.db.prepare("SELECT * FROM knowledge_sources WHERE id = ?").get(id) as any;
    if (!row) return null;
    return this.mapKnowledgeSource(row);
  }
  
  async getAllKnowledgeSources(): Promise<KnowledgeSource[]> {
    const rows = this.db.prepare("SELECT * FROM knowledge_sources ORDER BY created_at DESC").all() as any[];
    return rows.map(r => this.mapKnowledgeSource(r));
  }
  
  async getKnowledgeSourcesByModule(module: string): Promise<KnowledgeSource[]> {
    const rows = this.db.prepare("SELECT * FROM knowledge_sources WHERE module_tag = ?").all(module) as any[];
    return rows.map(r => this.mapKnowledgeSource(r));
  }
  
  async updateKnowledgeSource(id: string, updates: Partial<KnowledgeSource>): Promise<KnowledgeSource | null> {
    const existing = await this.getKnowledgeSource(id);
    if (!existing) return null;
    
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
    if (updates.sourceType !== undefined) { fields.push("source_type = ?"); values.push(updates.sourceType); }
    if (updates.sourceUrl !== undefined) { fields.push("source_url = ?"); values.push(updates.sourceUrl); }
    if (updates.moduleTag !== undefined) { fields.push("module_tag = ?"); values.push(updates.moduleTag); }
    if (updates.application !== undefined) { fields.push("application = ?"); values.push(updates.application); }
    if (updates.authType !== undefined) { fields.push("auth_type = ?"); values.push(updates.authType); }
    if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
    if (updates.errorMessage !== undefined) { fields.push("error_message = ?"); values.push(updates.errorMessage); }
    if (updates.lastIngested !== undefined) { fields.push("last_ingested = ?"); values.push(updates.lastIngested?.toISOString()); }
    if (updates.documentCount !== undefined) { fields.push("document_count = ?"); values.push(updates.documentCount); }
    if ((updates as any).checksum !== undefined) { fields.push("checksum = ?"); values.push((updates as any).checksum); }
    if ((updates as any).contentSize !== undefined) { fields.push("content_size = ?"); values.push((updates as any).contentSize); }
    
    if (fields.length === 0) return existing;
    
    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);
    
    this.db.prepare(`UPDATE knowledge_sources SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.getKnowledgeSource(id);
  }
  
  async deleteKnowledgeSource(id: string): Promise<void> {
    this.db.prepare("DELETE FROM knowledge_sources WHERE id = ?").run(id);
  }

  /**
   * Find an existing source for idempotent ingestion.
   * Priority 1: exact source_url match (SharePoint files / URLs are unique by URL).
   * Priority 2: same application + module_tag + name (re-uploaded file).
   * Returns the most recently updated match, or null.
   */
  async findExistingSource(query: { sourceUrl?: string; application?: string; moduleTag?: string; name?: string }): Promise<KnowledgeSource | null> {
    if (query.sourceUrl) {
      const row = this.db
        .prepare("SELECT * FROM knowledge_sources WHERE source_url = ? ORDER BY updated_at DESC LIMIT 1")
        .get(query.sourceUrl) as any;
      if (row) return this.mapKnowledgeSource(row);
    }
    if (query.name && query.application && query.moduleTag) {
      const row = this.db
        .prepare(
          "SELECT * FROM knowledge_sources WHERE name = ? AND application = ? AND module_tag = ? ORDER BY updated_at DESC LIMIT 1"
        )
        .get(query.name, query.application, query.moduleTag) as any;
      if (row) return this.mapKnowledgeSource(row);
    }
    return null;
  }
  
  private mapKnowledgeSource(row: any): KnowledgeSource {
    return {
      id: row.id,
      name: row.name,
      sourceType: row.source_type,
      sourceUrl: row.source_url,
      moduleTag: row.module_tag,
      application: row.application,
      authType: row.auth_type,
      authCredentials: row.auth_credentials ? JSON.parse(row.auth_credentials) : undefined,
      status: row.status,
      lastIngested: row.last_ingested ? new Date(row.last_ingested) : undefined,
      documentCount: row.document_count || 0,
      errorMessage: row.error_message,
      checksum: row.checksum || undefined,
      contentSize: row.content_size ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RAW DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  async createRawDocument(doc: Omit<RawDocument, 'id' | 'createdAt'>): Promise<RawDocument> {
    const id = uuidv4();
    
    this.db.prepare(`
      INSERT INTO raw_documents (id, source_id, title, content, content_type, source_url, checksum, word_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, doc.sourceId, doc.title, doc.content, doc.contentType, doc.sourceUrl, doc.checksum, doc.wordCount);
    
    return this.getRawDocument(id) as Promise<RawDocument>;
  }
  
  async getRawDocument(id: string): Promise<RawDocument | null> {
    const row = this.db.prepare("SELECT * FROM raw_documents WHERE id = ?").get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      sourceId: row.source_id,
      title: row.title,
      content: row.content,
      contentType: row.content_type,
      sourceUrl: row.source_url,
      checksum: row.checksum,
      wordCount: row.word_count,
      createdAt: new Date(row.created_at),
    };
  }
  
  async getRawDocumentsBySource(sourceId: string): Promise<RawDocument[]> {
    const rows = this.db.prepare("SELECT * FROM raw_documents WHERE source_id = ?").all(sourceId) as any[];
    return rows.map(row => ({
      id: row.id,
      sourceId: row.source_id,
      title: row.title,
      content: row.content,
      contentType: row.content_type,
      sourceUrl: row.source_url,
      checksum: row.checksum,
      wordCount: row.word_count,
      createdAt: new Date(row.created_at),
    }));
  }
  
  async deleteRawDocumentsBySource(sourceId: string): Promise<void> {
    this.db.prepare("DELETE FROM raw_documents WHERE source_id = ?").run(sourceId);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT CLASSIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  async createDocumentClassification(classification: Omit<DocumentClassification, 'id' | 'createdAt'>): Promise<DocumentClassification> {
    const id = uuidv4();
    
    this.db.prepare(`
      INSERT INTO document_classifications (id, document_id, application, module, document_type,
        supports_ui_automation, supports_functional_testing, supports_configuration_testing,
        supports_integration_testing, detected_objects, detected_tables, confidence_score, classification_reasoning)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      classification.documentId,
      classification.application,
      classification.module,
      classification.documentType,
      classification.supportsUIAutomation ? 1 : 0,
      classification.supportsFunctionalTesting ? 1 : 0,
      classification.supportsConfigurationTesting ? 1 : 0,
      classification.supportsIntegrationTesting ? 1 : 0,
      JSON.stringify(classification.detectedObjects),
      JSON.stringify(classification.detectedTables),
      classification.confidenceScore,
      classification.classificationReasoning
    );
    
    return this.getDocumentClassification(classification.documentId) as Promise<DocumentClassification>;
  }
  
  async getDocumentClassification(documentId: string): Promise<DocumentClassification | null> {
    const row = this.db.prepare("SELECT * FROM document_classifications WHERE document_id = ?").get(documentId) as any;
    if (!row) return null;
    return {
      id: row.id,
      documentId: row.document_id,
      application: row.application,
      module: row.module,
      documentType: row.document_type,
      supportsUIAutomation: row.supports_ui_automation === 1,
      supportsFunctionalTesting: row.supports_functional_testing === 1,
      supportsConfigurationTesting: row.supports_configuration_testing === 1,
      supportsIntegrationTesting: row.supports_integration_testing === 1,
      detectedObjects: JSON.parse(row.detected_objects),
      detectedTables: JSON.parse(row.detected_tables),
      confidenceScore: row.confidence_score,
      classificationReasoning: row.classification_reasoning,
      createdAt: new Date(row.created_at),
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STRUCTURED KNOWLEDGE (MOST IMPORTANT)
  // ═══════════════════════════════════════════════════════════════════════════
  
  async createStructuredKnowledge(knowledge: Omit<StructuredKnowledge, 'id' | 'createdAt' | 'updatedAt'>): Promise<StructuredKnowledge> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    this.db.prepare(`
      INSERT INTO structured_knowledge (id, source_id, document_id, application, module, 
        object_name, knowledge_type, facts, is_authoritative, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      knowledge.sourceId,
      knowledge.documentId,
      knowledge.application,
      knowledge.module,
      knowledge.objectName,
      knowledge.knowledgeType,
      JSON.stringify(knowledge.facts),
      knowledge.isAuthoritative ? 1 : 0,
      now,
      now
    );
    
    return this.getStructuredKnowledge(id) as Promise<StructuredKnowledge>;
  }
  
  async getStructuredKnowledge(id: string): Promise<StructuredKnowledge | null> {
    const row = this.db.prepare("SELECT * FROM structured_knowledge WHERE id = ?").get(id) as any;
    if (!row) return null;
    return this.mapStructuredKnowledge(row);
  }
  
  async getStructuredKnowledgeByModule(module: string): Promise<StructuredKnowledge[]> {
    const rows = this.db.prepare("SELECT * FROM structured_knowledge WHERE module = ?").all(module) as any[];
    return rows.map(r => this.mapStructuredKnowledge(r));
  }
  
  async getStructuredKnowledgeByObject(objectName: string): Promise<StructuredKnowledge[]> {
    const rows = this.db.prepare("SELECT * FROM structured_knowledge WHERE object_name = ?").all(objectName) as any[];
    return rows.map(r => this.mapStructuredKnowledge(r));
  }
  
  async searchStructuredKnowledge(query: {
    application?: string;
    module?: string;
    objectName?: string;
    knowledgeType?: string;
  }): Promise<StructuredKnowledge[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    
    if (query.application) { conditions.push("application = ?"); values.push(query.application); }
    if (query.module) { conditions.push("module = ?"); values.push(query.module); }
    if (query.objectName) { conditions.push("object_name = ?"); values.push(query.objectName); }
    if (query.knowledgeType) { conditions.push("knowledge_type = ?"); values.push(query.knowledgeType); }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT * FROM structured_knowledge ${whereClause}`).all(...values) as any[];
    return rows.map(r => this.mapStructuredKnowledge(r));
  }
  
  async deleteStructuredKnowledgeBySource(sourceId: string): Promise<void> {
    this.db.prepare("DELETE FROM structured_knowledge WHERE source_id = ?").run(sourceId);
  }
  
  private mapStructuredKnowledge(row: any): StructuredKnowledge {
    return {
      id: row.id,
      sourceId: row.source_id,
      documentId: row.document_id,
      application: row.application,
      module: row.module,
      objectName: row.object_name,
      knowledgeType: row.knowledge_type,
      facts: JSON.parse(row.facts),
      isAuthoritative: row.is_authoritative === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GOVERNANCE RULES
  // ═══════════════════════════════════════════════════════════════════════════
  
  async createGovernanceRule(rule: Omit<GovernanceRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<GovernanceRule> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    this.db.prepare(`
      INSERT INTO governance_rules (id, application, module, required_objects, required_tables,
        required_validations, blocked_test_types, blocked_patterns, business_flow_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      rule.application,
      rule.module,
      JSON.stringify(rule.requiredObjects),
      JSON.stringify(rule.requiredTables),
      JSON.stringify(rule.requiredValidations),
      JSON.stringify(rule.blockedTestTypes),
      JSON.stringify(rule.blockedPatterns),
      JSON.stringify(rule.businessFlowOrder),
      rule.isActive ? 1 : 0,
      now,
      now
    );
    
    return this.getGovernanceRule(id) as Promise<GovernanceRule>;
  }
  
  async getGovernanceRule(id: string): Promise<GovernanceRule | null> {
    const row = this.db.prepare("SELECT * FROM governance_rules WHERE id = ?").get(id) as any;
    if (!row) return null;
    return this.mapGovernanceRule(row);
  }
  
  async getGovernanceRuleByModule(application: string, module: string): Promise<GovernanceRule | null> {
    const row = this.db.prepare("SELECT * FROM governance_rules WHERE application = ? AND module = ?").get(application, module) as any;
    if (!row) return null;
    return this.mapGovernanceRule(row);
  }
  
  async getAllGovernanceRules(): Promise<GovernanceRule[]> {
    const rows = this.db.prepare("SELECT * FROM governance_rules ORDER BY application, module").all() as any[];
    return rows.map(r => this.mapGovernanceRule(r));
  }
  
  async updateGovernanceRule(id: string, updates: Partial<GovernanceRule>): Promise<GovernanceRule | null> {
    const existing = await this.getGovernanceRule(id);
    if (!existing) return null;
    
    const merged = { ...existing, ...updates };
    
    this.db.prepare(`
      UPDATE governance_rules SET
        required_objects = ?,
        required_tables = ?,
        required_validations = ?,
        blocked_test_types = ?,
        blocked_patterns = ?,
        business_flow_order = ?,
        is_active = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(merged.requiredObjects),
      JSON.stringify(merged.requiredTables),
      JSON.stringify(merged.requiredValidations),
      JSON.stringify(merged.blockedTestTypes),
      JSON.stringify(merged.blockedPatterns),
      JSON.stringify(merged.businessFlowOrder),
      merged.isActive ? 1 : 0,
      new Date().toISOString(),
      id
    );
    
    return this.getGovernanceRule(id);
  }
  
  async deleteGovernanceRule(id: string): Promise<void> {
    this.db.prepare("DELETE FROM governance_rules WHERE id = ?").run(id);
  }
  
  private mapGovernanceRule(row: any): GovernanceRule {
    return {
      id: row.id,
      application: row.application,
      module: row.module,
      requiredObjects: JSON.parse(row.required_objects),
      requiredTables: JSON.parse(row.required_tables),
      requiredValidations: JSON.parse(row.required_validations),
      blockedTestTypes: JSON.parse(row.blocked_test_types),
      blockedPatterns: JSON.parse(row.blocked_patterns),
      businessFlowOrder: JSON.parse(row.business_flow_order),
      isActive: row.is_active === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  async updateIngestionStatus(sourceId: string, status: keyof typeof IngestionStatus, errorMessage?: string): Promise<void> {
    this.db.prepare(`
      UPDATE knowledge_sources SET status = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(status, errorMessage || null, new Date().toISOString(), sourceId);
  }
  
  async incrementDocumentCount(sourceId: string, count: number): Promise<void> {
    this.db.prepare(`
      UPDATE knowledge_sources SET document_count = document_count + ?, last_ingested = ?, updated_at = ?
      WHERE id = ?
    `).run(count, new Date().toISOString(), new Date().toISOString(), sourceId);
  }
}

// Export singleton instance
export const knowledgeStorage = new SQLiteKnowledgeStorage();
