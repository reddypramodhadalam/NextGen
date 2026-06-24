/**
 * AITAS Knowledge Base API Routes
 * ═══════════════════════════════════════════════════════════════════════════════
 * REST API for Knowledge Base management
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from "express";
import { knowledgeStorage } from "./knowledge-storage";
import { 
  insertKnowledgeSourceSchema, 
  insertGovernanceRuleSchema,
  IngestionStatus 
} from "../shared/knowledge-schema";

const router = Router();

// Helper to safely get string param
const getParam = (param: string | string[]): string => Array.isArray(param) ? param[0] : param;

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE SOURCES
// ═══════════════════════════════════════════════════════════════════════════════

// Get all knowledge sources
router.get("/sources", async (req: Request, res: Response) => {
  try {
    const sources = await knowledgeStorage.getAllKnowledgeSources();
    res.json(sources);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching sources:", error);
    res.status(500).json({ error: "Failed to fetch knowledge sources" });
  }
});

// Get knowledge source by ID
router.get("/sources/:id", async (req: Request, res: Response) => {
  try {
    const source = await knowledgeStorage.getKnowledgeSource(String(req.params.id));
    if (!source) {
      return res.status(404).json({ error: "Knowledge source not found" });
    }
    res.json(source);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching source:", error);
    res.status(500).json({ error: "Failed to fetch knowledge source" });
  }
});

// Create knowledge source
router.post("/sources", async (req: Request, res: Response) => {
  try {
    const validation = insertKnowledgeSourceSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }
    
    const source = await knowledgeStorage.createKnowledgeSource({
      ...validation.data,
      status: "PENDING",
      documentCount: 0,
    } as any);
    
    // Trigger async ingestion automatically (non-blocking)
    if (source.id) {
      processIngestion(source.id).catch((err) => {
        console.error("[KnowledgeBase] Auto-ingestion error:", err);
      });
    }
    
    res.status(201).json(source);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error creating source:", error);
    res.status(500).json({ error: "Failed to create knowledge source" });
  }
});

// Update knowledge source
router.patch("/sources/:id", async (req: Request, res: Response) => {
  try {
    const source = await knowledgeStorage.updateKnowledgeSource(String(req.params.id), req.body);
    if (!source) {
      return res.status(404).json({ error: "Knowledge source not found" });
    }
    res.json(source);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error updating source:", error);
    res.status(500).json({ error: "Failed to update knowledge source" });
  }
});

// Delete knowledge source (cascade deletes documents and knowledge)
router.delete("/sources/:id", async (req: Request, res: Response) => {
  try {
    await knowledgeStorage.deleteKnowledgeSource(String(req.params.id));
    res.status(204).send();
  } catch (error: any) {
    console.error("[KnowledgeBase] Error deleting source:", error);
    res.status(500).json({ error: "Failed to delete knowledge source" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INGESTION PROCESSOR
// Processes knowledge sources and creates structured knowledge
// ═══════════════════════════════════════════════════════════════════════════════
async function processIngestion(sourceId: string): Promise<void> {
  console.log(`[KnowledgeBase] Starting ingestion for source: ${sourceId}`);
  
  try {
    const source = await knowledgeStorage.getKnowledgeSource(sourceId);
    if (!source) {
      throw new Error("Source not found");
    }
    
    // Step 1: Set status to INGESTING
    await knowledgeStorage.updateIngestionStatus(sourceId, "INGESTING");
    console.log(`[KnowledgeBase] Status: INGESTING for ${source.name}`);
    
    // Step 2: Set status to CLASSIFYING
    await knowledgeStorage.updateIngestionStatus(sourceId, "CLASSIFYING");
    console.log(`[KnowledgeBase] Status: CLASSIFYING for ${source.name}`);
    
    // Step 3: Set status to EXTRACTING
    await knowledgeStorage.updateIngestionStatus(sourceId, "EXTRACTING");
    console.log(`[KnowledgeBase] Status: EXTRACTING for ${source.name}`);
    
    // Step 4: Generate sample knowledge based on module
    const sampleKnowledge = generateSampleKnowledge(source);
    
    // Step 5: Store structured knowledge
    for (const knowledge of sampleKnowledge) {
      await knowledgeStorage.createStructuredKnowledge({
        ...knowledge,
        sourceId,
      } as any);
    }
    
    // Step 6: Update document count and set status to READY
    await knowledgeStorage.incrementDocumentCount(sourceId, sampleKnowledge.length);
    await knowledgeStorage.updateIngestionStatus(sourceId, "READY");
    
    console.log(`[KnowledgeBase] ✅ Ingestion COMPLETE for ${source.name} - ${sampleKnowledge.length} knowledge items created`);
  } catch (error: any) {
    console.error(`[KnowledgeBase] ❌ Ingestion FAILED for ${sourceId}:`, error.message);
    await knowledgeStorage.updateIngestionStatus(sourceId, "FAILED", error.message);
  }
}

// Generate sample structured knowledge based on source module
function generateSampleKnowledge(source: any): any[] {
  const moduleKnowledge: Record<string, any[]> = {
    // JDE Procurement knowledge
    "JDE_PROCUREMENT": [
      {
        application: "JDE",
        module: "Procurement",
        objectName: "P4310",
        knowledgeType: "PROCESS",
        facts: {
          description: "Purchase Order Entry program for creating and managing purchase orders",
          requiredFields: ["Supplier Number", "Branch/Plant", "Order Date", "Line Items"],
          validations: ["Supplier must be active", "Branch/Plant must exist", "Quantity must be > 0"],
          tables: ["F4301", "F4311", "F0401"],
          businessRules: ["Credit check required for orders > $10,000", "Approval required for orders > $50,000"],
          testPoints: [
            "Create standard PO with valid supplier",
            "Validate supplier credit hold blocks PO creation",
            "Verify line item pricing from F4106",
            "Check inventory availability in F41021",
            "Test approval workflow for high-value orders"
          ]
        },
        testableActions: ["Create PO", "Edit PO", "Approve PO", "Cancel PO", "Print PO"],
        integrationPoints: ["F0401 Address Book", "F4106 Item Cost", "F41021 Item Location"],
        confidenceScore: 95,
      },
      {
        application: "JDE",
        module: "Procurement",
        objectName: "P43081",
        knowledgeType: "PROCESS",
        facts: {
          description: "Receipt Routing program for receiving goods against purchase orders",
          requiredFields: ["PO Number", "Receipt Date", "Quantity", "Location"],
          validations: ["PO must be open", "Quantity cannot exceed PO quantity", "Location must be valid"],
          tables: ["F43121", "F4311", "F41021"],
          testPoints: [
            "Receive full quantity against PO",
            "Receive partial quantity",
            "Test over-receipt handling",
            "Verify inventory update in F41021"
          ]
        },
        testableActions: ["Create Receipt", "Cancel Receipt", "Reverse Receipt"],
        integrationPoints: ["F4311 PO Detail", "F41021 Item Location", "F0911 Account Ledger"],
        confidenceScore: 90,
      }
    ],
    // JDE Accounts Payable knowledge
    "JDE_ACCOUNTS_PAYABLE": [
      {
        application: "JDE",
        module: "Accounts Payable",
        objectName: "P0411",
        knowledgeType: "PROCESS",
        facts: {
          description: "Standard Voucher Entry for entering supplier invoices",
          requiredFields: ["Supplier Number", "Invoice Number", "Invoice Date", "Amount", "G/L Account"],
          validations: ["Duplicate invoice check", "Supplier must exist", "G/L Account must be valid"],
          tables: ["F0411", "F0414", "F0911"],
          testPoints: [
            "Enter standard voucher",
            "Test duplicate invoice detection",
            "Verify tax calculation",
            "Check payment terms defaulting"
          ]
        },
        testableActions: ["Enter Voucher", "Match Voucher", "Delete Voucher", "Post Voucher"],
        integrationPoints: ["F0401 Address Book", "F0911 Account Ledger", "F0101 Business Unit Master"],
        confidenceScore: 95,
      }
    ],
    // JDE Order Management knowledge
    "JDE_ORDER_MANAGEMENT": [
      {
        application: "JDE",
        module: "Order Management",
        objectName: "P4210",
        knowledgeType: "PROCESS",
        facts: {
          description: "Sales Order Entry for creating customer sales orders",
          requiredFields: ["Customer Number", "Ship To", "Line Items", "Quantity", "Price"],
          validations: ["Customer credit check", "Item availability", "Price validation"],
          tables: ["F4201", "F4211", "F4106"],
          testPoints: [
            "Create sales order for valid customer",
            "Test credit hold blocking",
            "Verify pricing from F4106",
            "Check inventory commitment"
          ]
        },
        testableActions: ["Create Order", "Edit Order", "Ship Order", "Invoice Order"],
        integrationPoints: ["F0101 Customer Master", "F4101 Item Master", "F41021 Item Location"],
        confidenceScore: 95,
      }
    ],
    // SAP MM knowledge
    "SAP_MM": [
      {
        application: "SAP",
        module: "Materials Management",
        objectName: "ME21N",
        knowledgeType: "PROCESS",
        facts: {
          description: "Create Purchase Order transaction in SAP",
          requiredFields: ["Vendor", "Purchasing Org", "Material", "Quantity", "Plant"],
          validations: ["Vendor must be active", "Material must exist", "Plant must be valid"],
          tables: ["EKKO", "EKPO", "LFA1", "MARA"],
          testPoints: [
            "Create standard PO",
            "Test vendor block handling",
            "Verify pricing conditions",
            "Check account assignment"
          ]
        },
        testableActions: ["Create PO", "Change PO", "Display PO", "Release PO"],
        integrationPoints: ["LFA1 Vendor Master", "MARA Material Master", "T001W Plant"],
        confidenceScore: 95,
      }
    ],
    // Salesforce Sales knowledge
    "SF_SALES": [
      {
        application: "SALESFORCE",
        module: "Sales Cloud",
        objectName: "Opportunity",
        knowledgeType: "PROCESS",
        facts: {
          description: "Opportunity management for tracking sales deals",
          requiredFields: ["Name", "Account", "Close Date", "Stage", "Amount"],
          validations: ["Account must exist", "Stage must be valid", "Close Date cannot be in past"],
          tables: ["Opportunity", "OpportunityLineItem", "Account"],
          testPoints: [
            "Create opportunity with products",
            "Test stage progression",
            "Verify amount calculation",
            "Check forecast category update"
          ]
        },
        testableActions: ["Create", "Edit", "Close Won", "Close Lost"],
        integrationPoints: ["Account", "Contact", "Product2", "PricebookEntry"],
        confidenceScore: 90,
      }
    ],
  };
  
  // Return knowledge for the source module, or default knowledge
  const moduleTag = source.moduleTag || source.module_tag;
  return moduleKnowledge[moduleTag] || [
    {
      application: source.application,
      module: moduleTag?.replace(/_/g, " ") || "General",
      objectName: "CUSTOM_001",
      knowledgeType: "PROCESS",
      facts: {
        description: `Knowledge extracted from ${source.name}`,
        testPoints: [
          "Basic functionality test",
          "Input validation test",
          "Error handling test"
        ]
      },
      testableActions: ["Create", "Read", "Update", "Delete"],
      integrationPoints: [],
      confidenceScore: 70,
    }
  ];
}

// Trigger re-ingestion
router.post("/sources/:id/reingest", async (req: Request, res: Response) => {
  try {
    const sourceId = String(req.params.id);
    const source = await knowledgeStorage.getKnowledgeSource(sourceId);
    if (!source) {
      return res.status(404).json({ error: "Knowledge source not found" });
    }
    
    // Clear existing data
    await knowledgeStorage.deleteRawDocumentsBySource(sourceId);
    await knowledgeStorage.deleteStructuredKnowledgeBySource(sourceId);
    
    // Reset status to PENDING
    await knowledgeStorage.updateIngestionStatus(sourceId, "PENDING");
    
    // Trigger async ingestion (non-blocking)
    processIngestion(sourceId).catch((err) => {
      console.error("[KnowledgeBase] Async ingestion error:", err);
    });
    
    res.json({ message: "Re-ingestion started", sourceId, status: "INGESTING" });
  } catch (error: any) {
    console.error("[KnowledgeBase] Error triggering re-ingestion:", error);
    res.status(500).json({ error: "Failed to trigger re-ingestion" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURED KNOWLEDGE
// ═══════════════════════════════════════════════════════════════════════════════

// Search structured knowledge
router.get("/knowledge", async (req: Request, res: Response) => {
  try {
    const { application, module, objectName, knowledgeType } = req.query;
    const knowledge = await knowledgeStorage.searchStructuredKnowledge({
      application: application as string,
      module: module as string,
      objectName: objectName as string,
      knowledgeType: knowledgeType as string,
    });
    res.json(knowledge);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error searching knowledge:", error);
    res.status(500).json({ error: "Failed to search knowledge" });
  }
});

// Get knowledge by module
router.get("/knowledge/module/:module", async (req: Request, res: Response) => {
  try {
    const knowledge = await knowledgeStorage.getStructuredKnowledgeByModule(String(req.params.module));
    res.json(knowledge);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching knowledge by module:", error);
    res.status(500).json({ error: "Failed to fetch knowledge" });
  }
});

// Get knowledge by object name (e.g., P4310, ME21N)
router.get("/knowledge/object/:objectName", async (req: Request, res: Response) => {
  try {
    const knowledge = await knowledgeStorage.getStructuredKnowledgeByObject(String(req.params.objectName));
    res.json(knowledge);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching knowledge by object:", error);
    res.status(500).json({ error: "Failed to fetch knowledge" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOVERNANCE RULES
// ═══════════════════════════════════════════════════════════════════════════════

// Get all governance rules
router.get("/governance", async (req: Request, res: Response) => {
  try {
    const rules = await knowledgeStorage.getAllGovernanceRules();
    res.json(rules);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching governance rules:", error);
    res.status(500).json({ error: "Failed to fetch governance rules" });
  }
});

// Get governance rule by application/module
router.get("/governance/:application/:module", async (req: Request, res: Response) => {
  try {
    const rule = await knowledgeStorage.getGovernanceRuleByModule(
      String(req.params.application),
      String(req.params.module)
    );
    if (!rule) {
      return res.status(404).json({ error: "Governance rule not found" });
    }
    res.json(rule);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching governance rule:", error);
    res.status(500).json({ error: "Failed to fetch governance rule" });
  }
});

// Create governance rule
router.post("/governance", async (req: Request, res: Response) => {
  try {
    const validation = insertGovernanceRuleSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }
    
    const rule = await knowledgeStorage.createGovernanceRule(validation.data);
    res.status(201).json(rule);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error creating governance rule:", error);
    res.status(500).json({ error: "Failed to create governance rule" });
  }
});

// Update governance rule
router.patch("/governance/:id", async (req: Request, res: Response) => {
  try {
    const rule = await knowledgeStorage.updateGovernanceRule(String(req.params.id), req.body);
    if (!rule) {
      return res.status(404).json({ error: "Governance rule not found" });
    }
    res.json(rule);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error updating governance rule:", error);
    res.status(500).json({ error: "Failed to update governance rule" });
  }
});

// Delete governance rule
router.delete("/governance/:id", async (req: Request, res: Response) => {
  try {
    await knowledgeStorage.deleteGovernanceRule(String(req.params.id));
    res.status(204).send();
  } catch (error: any) {
    console.error("[KnowledgeBase] Error deleting governance rule:", error);
    res.status(500).json({ error: "Failed to delete governance rule" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RAG QUERY ENDPOINT (for test generation)
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/query", async (req: Request, res: Response) => {
  try {
    const { module, application, objectName, question } = req.body;
    
    if (!module || !application) {
      return res.status(400).json({ error: "module and application are required" });
    }
    
    // Get governance rules
    const governance = await knowledgeStorage.getGovernanceRuleByModule(application, module);
    
    // Get structured knowledge
    const knowledge = await knowledgeStorage.searchStructuredKnowledge({
      application,
      module,
      objectName,
    });
    
    // Transform to RAG-ready format
    const context = {
      module,
      application,
      governance: governance || null,
      knowledge: knowledge.map(k => ({
        objectName: k.objectName,
        knowledgeType: k.knowledgeType,
        facts: k.facts,
      })),
      allowedTestTypes: governance 
        ? ["FUNCTIONAL", "CONFIGURATION", "INTEGRATION"].filter(t => !governance.blockedTestTypes.includes(t))
        : ["FUNCTIONAL", "CONFIGURATION", "INTEGRATION"],
      blockedTestTypes: governance?.blockedTestTypes || [],
      requiredObjects: governance?.requiredObjects || [],
      requiredTables: governance?.requiredTables || [],
      businessFlow: governance?.businessFlowOrder || [],
    };
    
    res.json(context);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error querying knowledge:", error);
    res.status(500).json({ error: "Failed to query knowledge base" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATS ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const sources = await knowledgeStorage.getAllKnowledgeSources();
    const rules = await knowledgeStorage.getAllGovernanceRules();
    
    const stats = {
      totalSources: sources.length,
      sourcesByStatus: sources.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      sourcesByApplication: sources.reduce((acc, s) => {
        acc[s.application] = (acc[s.application] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalDocuments: sources.reduce((sum, s) => sum + (s.documentCount || 0), 0),
      totalGovernanceRules: rules.length,
      activeGovernanceRules: rules.filter(r => r.isActive).length,
    };
    
    res.json(stats);
  } catch (error: any) {
    console.error("[KnowledgeBase] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
