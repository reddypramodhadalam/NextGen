/**
 * ENTERPRISE EXECUTION ROUTER - AITAS
 * =====================================
 * 
 * This module bridges the gap between:
 * 1. Test execution requests (/api/executions)
 * 2. Enterprise Agent Manager (capability-based routing)
 * 3. Specialized executors (JDE, SAP, Salesforce, Mobile, etc.)
 * 
 * KEY RESPONSIBILITIES:
 * - Auto-register default agents on startup
 * - Route executions to appropriate agents based on capabilities
 * - Fall back to local execution when no Enterprise Agent available
 * - Track execution metrics for routing optimization
 * 
 * INTEGRATION FLOW:
 * 1. Execution request comes in → detectRequiredCapabilities()
 * 2. If capabilities need Enterprise Agent → routeToEnterpriseAgent()
 * 3. If Enterprise Agent available → executeViaAgent()
 * 4. If no agent available → fallbackToLocalExecution()
 */

import { 
  enterpriseAgentManager, 
  AgentGroup, 
  AgentType,
  ExecutionCapability,
  EnterpriseAgent,
  AgentCapabilities
} from "./enterprise-agent-manager";
import { aiTestExecutor } from "./ai-test-executor";
import { jdeExecutor, type JDEConfig } from "./jde-executor";
import { storage } from "./storage";
import type { TestCase, TestDataParam } from "@shared/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExecutionRequest {
  executionId: string;
  testCases: TestCase[];
  targetUrl: string;
  framework: string;
  testData?: TestDataParam[];
  selfHealing?: boolean;
  maxRetries?: number;
  environment?: string;
  agentId?: string;
  // Enterprise routing hints
  forceEnterpriseAgent?: boolean;
  preferredAgentType?: AgentType;
  requiredCapabilities?: ExecutionCapability[];
}

export interface ExecutionRouteResult {
  routedTo: "ENTERPRISE_AGENT" | "LOCAL_EXECUTOR" | "QUEUED";
  agentId?: string;
  agentName?: string;
  executorType: string;
  capabilities: ExecutionCapability[];
  reason: string;
}

export interface CapabilityDetectionResult {
  capabilities: ExecutionCapability[];
  detectedPatterns: string[];
  recommendedAgentType: AgentType;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPABILITY DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze test cases to detect required execution capabilities.
 * This determines whether we need a specialized Enterprise Agent.
 */
export function detectRequiredCapabilities(testCases: TestCase[], targetUrl: string): CapabilityDetectionResult {
  const capabilities = new Set<ExecutionCapability>();
  const detectedPatterns: string[] = [];
  let confidence = 0.5;

  // Analyze all test case content
  const allContent = testCases.map(tc => {
    const steps = (tc.steps as any[]) || [];
    return [
      tc.title,
      tc.description,
      tc.tags?.join(" "),
      ...steps.map(s => `${s.step || ""} ${s.expected || ""}`)
    ].join(" ").toLowerCase();
  }).join(" ");

  // JDE Detection
  const jdePatterns = [
    /\bjde\b/i, /jd edwards/i, /\be1\b/i, /\bp[0-9]{5,6}\b/i,  // P41001, P4210
    /\bf[0-9]{4,6}\b/i, // F4101, F4211
    /world software/i, /orchestrator/i, /business function/i,
    /address book/i, /sales order entry/i, /purchase order/i,
    /work order/i, /general ledger/i
  ];
  if (jdePatterns.some(p => p.test(allContent))) {
    capabilities.add("JDE");
    detectedPatterns.push("JDE patterns detected");
    confidence = Math.max(confidence, 0.85);
  }

  // SAP Detection
  const sapPatterns = [
    /\bsap\b/i, /s\/4hana/i, /fiori/i, /\btcode\b/i, /transaction code/i,
    /\bme21n\b/i, /\bva01\b/i, /\bmm01\b/i, /\bfb01\b/i,  // Common TCode patterns
    /\bbapi\b/i, /\brfc\b/i, /abap/i, /dynpro/i,
    /sap gui/i, /sapgui/i, /business partner/i, /material master/i
  ];
  if (sapPatterns.some(p => p.test(allContent))) {
    capabilities.add("SAP");
    detectedPatterns.push("SAP patterns detected");
    confidence = Math.max(confidence, 0.85);
  }

  // API Detection
  const apiPatterns = [
    /\bapi\b/i, /\brest\b/i, /\bgraphql\b/i, /\bsoap\b/i,
    /http (get|post|put|delete|patch)/i, /endpoint/i,
    /json response/i, /api call/i, /web service/i,
    /bearer token/i, /oauth/i, /api key/i
  ];
  if (apiPatterns.some(p => p.test(allContent))) {
    capabilities.add("API");
    detectedPatterns.push("API patterns detected");
    confidence = Math.max(confidence, 0.75);
  }

  // Mobile Detection
  const mobilePatterns = [
    /\bmobile\b/i, /\bios\b/i, /\bandroid\b/i, /\bappium\b/i,
    /tap on/i, /swipe/i, /native app/i, /mobile app/i,
    /device/i, /emulator/i, /simulator/i
  ];
  if (mobilePatterns.some(p => p.test(allContent))) {
    capabilities.add("MOBILE");
    detectedPatterns.push("Mobile patterns detected");
    confidence = Math.max(confidence, 0.80);
  }

  // Database Detection
  const dbPatterns = [
    /\bdatabase\b/i, /\bsql\b/i, /\bquery\b/i, /\binsert\b/i,
    /\bupdate\b/i, /\bdelete\b/i, /\bselect\b/i,
    /table verification/i, /data validation/i, /db check/i
  ];
  if (dbPatterns.some(p => p.test(allContent))) {
    capabilities.add("DATABASE");
    detectedPatterns.push("Database patterns detected");
    confidence = Math.max(confidence, 0.70);
  }

  // Web is always needed for UI tests
  const webPatterns = [
    /click/i, /type/i, /enter/i, /navigate/i, /button/i,
    /field/i, /input/i, /form/i, /page/i, /browser/i,
    /url/i, /verify/i, /checkbox/i, /dropdown/i
  ];
  if (webPatterns.some(p => p.test(allContent)) || targetUrl) {
    capabilities.add("WEB");
    if (!detectedPatterns.includes("Web patterns detected")) {
      detectedPatterns.push("Web patterns detected");
    }
  }

  // Determine recommended agent type
  let recommendedAgentType: AgentType = "BROWSER";
  if (capabilities.has("JDE")) recommendedAgentType = "JDE";
  else if (capabilities.has("SAP")) recommendedAgentType = "SAP";
  else if (capabilities.has("API")) recommendedAgentType = "API";
  else if (capabilities.has("MOBILE")) recommendedAgentType = "MOBILE";
  else if (capabilities.size > 2) recommendedAgentType = "CLOUD"; // Multi-capability

  return {
    capabilities: Array.from(capabilities),
    detectedPatterns,
    recommendedAgentType,
    confidence
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

export class EnterpriseExecutionRouter {
  private static instance: EnterpriseExecutionRouter;
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): EnterpriseExecutionRouter {
    if (!EnterpriseExecutionRouter.instance) {
      EnterpriseExecutionRouter.instance = new EnterpriseExecutionRouter();
    }
    return EnterpriseExecutionRouter.instance;
  }

  /**
   * Initialize the router and register default agents
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log("[EnterpriseRouter] Initializing Enterprise Execution Router...");

    // Register default agents
    await this.registerDefaultAgents();

    this.initialized = true;
    console.log("[EnterpriseRouter] ✓ Enterprise Execution Router initialized");
  }

  /**
   * Register default agents for each environment and capability
   */
  private async registerDefaultAgents(): Promise<void> {
    const existingAgents = enterpriseAgentManager.getAllAgents();
    
    if (existingAgents.length > 0) {
      console.log(`[EnterpriseRouter] ${existingAgents.length} agents already registered`);
      return;
    }

    console.log("[EnterpriseRouter] Registering default Enterprise Agents...");

    // Default agent configurations
    const defaultAgents: Array<{
      name: string;
      description: string;
      type: AgentType;
      group: AgentGroup;
      capabilities: AgentCapabilities;
    }> = [
      // QA Environment Agents
      {
        name: "QA Enterprise Agent",
        description: "Full-capability agent for QA environment",
        type: "CLOUD",
        group: "QA",
        capabilities: { web: true, api: true, jde: true, sap: true, mobile: false, database: true }
      },
      {
        name: "QA Browser Agent",
        description: "Web UI automation agent for QA",
        type: "BROWSER",
        group: "QA",
        capabilities: { web: true, api: false, jde: false, sap: false, mobile: false, database: false }
      },
      {
        name: "QA API Agent",
        description: "API testing agent for QA",
        type: "API",
        group: "QA",
        capabilities: { web: false, api: true, jde: false, sap: false, mobile: false, database: true }
      },

      // UAT Environment Agents
      {
        name: "UAT Enterprise Agent",
        description: "Full-capability agent for UAT environment",
        type: "CLOUD",
        group: "UAT",
        capabilities: { web: true, api: true, jde: true, sap: true, mobile: true, database: true }
      },
      {
        name: "UAT JDE Agent",
        description: "JD Edwards execution agent for UAT",
        type: "JDE",
        group: "UAT",
        capabilities: { web: true, api: false, jde: true, sap: false, mobile: false, database: true }
      },
      {
        name: "UAT SAP Agent",
        description: "SAP execution agent for UAT",
        type: "SAP",
        group: "UAT",
        capabilities: { web: true, api: true, jde: false, sap: true, mobile: false, database: true }
      },

      // PROD Environment Agents
      {
        name: "PROD Enterprise Agent",
        description: "High-trust agent for Production (read-only operations)",
        type: "CLOUD",
        group: "PROD",
        capabilities: { web: true, api: true, jde: true, sap: true, mobile: false, database: false }
      },
    ];

    for (const agentConfig of defaultAgents) {
      const agent = enterpriseAgentManager.registerAgent({
        name: agentConfig.name,
        description: agentConfig.description,
        type: agentConfig.type,
        group: agentConfig.group,
        trustLevel: agentConfig.group === "PROD" ? "HIGH" : agentConfig.group === "UAT" ? "MEDIUM" : "LOW",
        capabilities: agentConfig.capabilities,
        environment: agentConfig.group,
        tags: [agentConfig.type.toLowerCase(), agentConfig.group.toLowerCase()],
        metadata: { autoRegistered: true, registeredAt: new Date().toISOString() },
        status: "ONLINE", // Start as online for local agents
        maxConcurrentExecutions: 5,
        lastSeenAt: new Date(),
      });

      // Simulate heartbeat to mark as online
      enterpriseAgentManager.processHeartbeat(agent.agentId, {
        cpu: 25,
        memory: 40,
        disk: 60,
        secureTunnel: true
      });

      console.log(`[EnterpriseRouter] ✓ Registered: ${agentConfig.name} (${agentConfig.type}/${agentConfig.group})`);
    }

    console.log(`[EnterpriseRouter] ✓ Registered ${defaultAgents.length} default Enterprise Agents`);
  }

  /**
   * Route an execution request to the appropriate agent or executor
   */
  async routeExecution(request: ExecutionRequest): Promise<ExecutionRouteResult> {
    await this.initialize();

    const { testCases, targetUrl, environment = "QA" } = request;

    // Step 1: Detect required capabilities
    const detection = detectRequiredCapabilities(testCases, targetUrl);
    console.log(`[EnterpriseRouter] Detected capabilities: ${detection.capabilities.join(", ")}`);
    console.log(`[EnterpriseRouter] Recommended agent type: ${detection.recommendedAgentType}`);

    // Step 2: Determine if Enterprise Agent is required
    const needsEnterpriseAgent = this.requiresEnterpriseAgent(detection.capabilities, request);

    if (!needsEnterpriseAgent) {
      console.log("[EnterpriseRouter] Using local executor (no Enterprise Agent required)");
      return {
        routedTo: "LOCAL_EXECUTOR",
        executorType: "aiTestExecutor",
        capabilities: detection.capabilities,
        reason: "Standard web execution - local executor sufficient"
      };
    }

    // Step 3: Find suitable Enterprise Agent
    const group = this.mapEnvironmentToGroup(environment);
    const agent = this.findSuitableAgent(detection.capabilities, group, request.preferredAgentType);

    if (agent) {
      console.log(`[EnterpriseRouter] Routing to Enterprise Agent: ${agent.name} (${agent.agentId})`);
      return {
        routedTo: "ENTERPRISE_AGENT",
        agentId: agent.agentId,
        agentName: agent.name,
        executorType: this.getExecutorTypeForAgent(agent),
        capabilities: detection.capabilities,
        reason: `Routed to ${agent.name} for ${detection.capabilities.join("/")} execution`
      };
    }

    // Step 4: Queue or fallback
    if (request.forceEnterpriseAgent) {
      console.log("[EnterpriseRouter] Queuing execution (no available Enterprise Agent)");
      return {
        routedTo: "QUEUED",
        executorType: this.getExecutorTypeForCapabilities(detection.capabilities),
        capabilities: detection.capabilities,
        reason: "No available Enterprise Agent - execution queued"
      };
    }

    // Step 5: Fallback to local execution
    console.log("[EnterpriseRouter] Falling back to local executor (no Enterprise Agent available)");
    // Report the executor we will ACTUALLY run. For JDE without form-login creds (SSO),
    // executeLocally() drives via aiTestExecutor, so don't mislabel it as jdeExecutor.
    const jdeFormLoginAvailable =
      detection.capabilities.includes("JDE") && this.buildJdeConfigFromEnv(targetUrl) !== null;
    const localExecutorType = jdeFormLoginAvailable
      ? this.getExecutorTypeForCapabilities(detection.capabilities)
      : detection.capabilities.includes("JDE")
        ? "aiTestExecutor"
        : this.getExecutorTypeForCapabilities(detection.capabilities);
    const localReason = detection.capabilities.includes("JDE") && !jdeFormLoginAvailable
      ? "JDE via SSO/DOM (persistent Chrome profile) - local AI executor"
      : "Enterprise Agent not available - using local executor";
    return {
      routedTo: "LOCAL_EXECUTOR",
      executorType: localExecutorType,
      capabilities: detection.capabilities,
      reason: localReason
    };
  }

  /**
   * Execute tests via the routed path
   */
  async executeWithRouting(request: ExecutionRequest): Promise<void> {
    const routeResult = await this.routeExecution(request);

    console.log(`[EnterpriseRouter] Execution route: ${routeResult.routedTo}`);
    console.log(`[EnterpriseRouter] Executor: ${routeResult.executorType}`);
    console.log(`[EnterpriseRouter] Reason: ${routeResult.reason}`);

    // Update execution record with routing info
    await storage.updateExecution(request.executionId, {
      // @ts-ignore - adding custom fields for routing metadata
      routingInfo: {
        routedTo: routeResult.routedTo,
        agentId: routeResult.agentId,
        agentName: routeResult.agentName,
        executorType: routeResult.executorType,
        capabilities: routeResult.capabilities,
        routedAt: new Date().toISOString()
      }
    });

    if (routeResult.routedTo === "ENTERPRISE_AGENT" && routeResult.agentId) {
      // Execute via Enterprise Agent
      await this.executeViaEnterpriseAgent(request, routeResult);
    } else if (routeResult.routedTo === "QUEUED") {
      // Queue for later execution
      await this.queueExecution(request, routeResult);
    } else {
      // Execute locally
      await this.executeLocally(request, routeResult);
    }
  }

  /**
   * Execute via Enterprise Agent
   */
  private async executeViaEnterpriseAgent(
    request: ExecutionRequest, 
    routeResult: ExecutionRouteResult
  ): Promise<void> {
    const { testCases, targetUrl, framework, testData, selfHealing, maxRetries, executionId } = request;

    // Register with Enterprise Agent Manager for tracking
    const group = this.mapEnvironmentToGroup(request.environment || "QA");
    await enterpriseAgentManager.executeTest({
      testCaseId: executionId,
      testCaseTitle: testCases[0]?.title || "Test Execution",
      group,
      requiredCapabilities: routeResult.capabilities,
      priority: 5
    });

    // Execute using appropriate executor based on capabilities
    const executor = this.getExecutorForCapabilities(routeResult.capabilities);

    console.log(`[EnterpriseRouter] Executing via Enterprise Agent using ${executor} executor`);

    // Dispatch JDE to the dedicated executor when classic form-login creds exist;
    // otherwise (SSO) fall through to the AI/DOM executor — see executeLocally() for rationale.
    const isJde = routeResult.capabilities.includes("JDE");
    const jdeConfig = isJde ? this.buildJdeConfigFromEnv(targetUrl) : null;
    if (isJde && jdeConfig) {
      console.log(`[EnterpriseRouter] Dispatching to jdeExecutor (JDE form-login + AIS)`);
      await jdeExecutor.runExecution(executionId, testCases, jdeConfig, testData);
      return;
    }
    if (isJde) {
      console.log(
        `[EnterpriseRouter] JDE SSO/DOM mode — no JDE_USERNAME/JDE_PASSWORD set, ` +
        `driving via aiTestExecutor with the persistent Chrome profile`
      );
    }

    await aiTestExecutor.runExecution(
      executionId,
      testCases,
      targetUrl,
      framework,
      testData,
      selfHealing ?? true,
      maxRetries ?? 3,
      routeResult.capabilities.map(c => c.toLowerCase()),
      isJde ? "jde" : undefined
    );
  }

  /**
   * Queue execution for later
   */
  private async queueExecution(
    request: ExecutionRequest,
    routeResult: ExecutionRouteResult
  ): Promise<void> {
    const group = this.mapEnvironmentToGroup(request.environment || "QA");
    
    await enterpriseAgentManager.executeTest({
      testCaseId: request.executionId,
      testCaseTitle: request.testCases[0]?.title || "Queued Execution",
      group,
      requiredCapabilities: routeResult.capabilities,
      priority: 5
    });

    await storage.updateExecution(request.executionId, {
      status: "pending",
      // @ts-ignore
      queuedAt: new Date().toISOString()
    });

    console.log(`[EnterpriseRouter] Execution ${request.executionId} queued for Enterprise Agent`);
  }

  /**
   * Execute locally (fallback)
   *
   * IMPORTANT: For JDE we have TWO valid local paths:
   *  1. Dedicated jdeExecutor — only when JDE form-login credentials (username/password)
   *     are configured. It performs classic JDE password login + AIS REST.
   *  2. aiTestExecutor in "SSO/DOM mode" — when JDE is fronted by SSO (Entra/Okta) there is
   *     NO password field, so jdeExecutor.login() would hang. The AI executor reuses the
   *     persistent Chrome profile (REUSE_BROWSER_PROFILE) and drives JDE via the DOM.
   * We pick the path honestly and log exactly what runs (no more "says jde, runs ai" mismatch).
   */
  private async executeLocally(
    request: ExecutionRequest,
    routeResult: ExecutionRouteResult
  ): Promise<void> {
    const { testCases, targetUrl, framework, testData, selfHealing, maxRetries, executionId } = request;

    const isJde = routeResult.capabilities.includes("JDE");
    const jdeConfig = isJde ? this.buildJdeConfigFromEnv(targetUrl) : null;

    if (isJde && jdeConfig) {
      // Path 1: dedicated JDE executor (password form-login + AIS)
      console.log(`[EnterpriseRouter] Executing locally with jdeExecutor (JDE form-login + AIS)`);
      await jdeExecutor.runExecution(executionId, testCases, jdeConfig, testData);
      return;
    }

    if (isJde) {
      // Path 2: JDE behind SSO — no credentials means form-login is impossible.
      // Drive JDE through the AI/DOM executor which reuses the persistent SSO profile.
      console.log(
        `[EnterpriseRouter] Executing locally with aiTestExecutor (JDE SSO/DOM mode — ` +
        `no JDE_USERNAME/JDE_PASSWORD set, using persistent Chrome profile for SSO)`
      );
    } else {
      console.log(`[EnterpriseRouter] Executing locally with aiTestExecutor`);
    }

    await aiTestExecutor.runExecution(
      executionId,
      testCases,
      targetUrl,
      framework,
      testData,
      selfHealing ?? true,
      maxRetries ?? 3,
      routeResult.capabilities.map(c => c.toLowerCase()),
      isJde ? "jde" : undefined
    );
  }

  /**
   * Build a JDEConfig from environment variables for classic (non-SSO) JDE form login.
   * Returns null when username/password are not BOTH present — in that case the caller
   * must fall back to SSO/DOM execution via aiTestExecutor (jdeExecutor.login would hang
   * waiting for a password field that SSO never renders).
   */
  private buildJdeConfigFromEnv(targetUrl: string): JDEConfig | null {
    const username = process.env.JDE_USERNAME?.trim();
    const password = process.env.JDE_PASSWORD?.trim();
    if (!username || !password) return null; // SSO or unconfigured → use aiTestExecutor

    return {
      baseUrl: process.env.JDE_BASE_URL?.trim() || targetUrl,
      aisUrl: process.env.JDE_AIS_URL?.trim() || undefined,
      username,
      password,
      environment: process.env.JDE_ENVIRONMENT?.trim() || undefined,
      role: process.env.JDE_ROLE?.trim() || undefined,
      apiVersion: process.env.JDE_API_VERSION?.trim() || undefined,
    };
  }

  // ─── HELPER METHODS ──────────────────────────────────────────────────────

  private requiresEnterpriseAgent(capabilities: ExecutionCapability[], request: ExecutionRequest): boolean {
    // Force Enterprise Agent if requested
    if (request.forceEnterpriseAgent) return true;

    // Enterprise Agent required for non-standard capabilities
    const enterpriseCapabilities: ExecutionCapability[] = ["JDE", "SAP", "MOBILE", "DATABASE"];
    return capabilities.some(c => enterpriseCapabilities.includes(c));
  }

  private mapEnvironmentToGroup(environment: string): AgentGroup {
    const env = environment.toUpperCase();
    if (env === "PRODUCTION" || env === "PROD") return "PROD";
    if (env === "UAT" || env === "STAGING") return "UAT";
    return "QA";
  }

  private findSuitableAgent(
    capabilities: ExecutionCapability[], 
    group: AgentGroup,
    preferredType?: AgentType
  ): EnterpriseAgent | null {
    const agents = enterpriseAgentManager.getOnlineAgents(group);

    // Filter by capabilities
    const capableAgents = agents.filter(agent => {
      return capabilities.every(cap => {
        const capKey = cap.toLowerCase() as keyof AgentCapabilities;
        return agent.capabilities[capKey] === true;
      });
    });

    if (capableAgents.length === 0) return null;

    // Prefer specific type if requested
    if (preferredType) {
      const preferred = capableAgents.find(a => a.type === preferredType);
      if (preferred) return preferred;
    }

    // Sort by: least busy, highest trust
    capableAgents.sort((a, b) => {
      if (a.currentExecutions !== b.currentExecutions) {
        return a.currentExecutions - b.currentExecutions;
      }
      const trustOrder = ["LOW", "MEDIUM", "HIGH"];
      return trustOrder.indexOf(b.trustLevel) - trustOrder.indexOf(a.trustLevel);
    });

    return capableAgents[0];
  }

  private getExecutorTypeForAgent(agent: EnterpriseAgent): string {
    switch (agent.type) {
      case "JDE": return "jdeExecutor";
      case "SAP": return "sapFioriExecutor";
      case "API": return "apiExecutor";
      case "MOBILE": return "mobileExecutor";
      default: return "aiTestExecutor";
    }
  }

  private getExecutorTypeForCapabilities(capabilities: ExecutionCapability[]): string {
    if (capabilities.includes("JDE")) return "jdeExecutor";
    if (capabilities.includes("SAP")) return "sapFioriExecutor";
    if (capabilities.includes("API")) return "apiExecutor";
    if (capabilities.includes("MOBILE")) return "mobileExecutor";
    return "aiTestExecutor";
  }

  private getExecutorForCapabilities(capabilities: ExecutionCapability[]): string {
    if (capabilities.includes("JDE")) return "JDE";
    if (capabilities.includes("SAP")) return "SAP";
    if (capabilities.includes("API")) return "API";
    if (capabilities.includes("MOBILE")) return "Mobile";
    return "AI/Web";
  }

  // ─── PUBLIC API FOR STATUS ───────────────────────────────────────────────

  getStatus(): {
    initialized: boolean;
    agentCount: number;
    onlineAgents: number;
    agentsByGroup: Record<AgentGroup, number>;
    agentsByType: Record<AgentType, number>;
  } {
    const stats = enterpriseAgentManager.getAgentStats();
    return {
      initialized: this.initialized,
      agentCount: stats.total,
      onlineAgents: stats.online + stats.busy,
      agentsByGroup: {
        QA: stats.byGroup.QA.total,
        UAT: stats.byGroup.UAT.total,
        PROD: stats.byGroup.PROD.total
      },
      agentsByType: stats.byType as Record<AgentType, number>
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const enterpriseExecutionRouter = EnterpriseExecutionRouter.getInstance();

// Auto-initialize on import
enterpriseExecutionRouter.initialize().catch(err => {
  console.error("[EnterpriseRouter] Failed to initialize:", err);
});
