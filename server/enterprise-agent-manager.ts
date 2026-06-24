/**
 * ENTERPRISE AGENT MANAGER - AITAS
 * =================================
 * 
 * World-class agent management system with:
 * 1. Agent Groups (QA / UAT / PROD)
 * 2. Agent Trust Levels (PROD vs NON-PROD)
 * 3. Capabilities-Aware Routing
 * 4. Offline Execution Queues
 * 5. Agent Failover & Retry Strategy
 * 6. Cost-Based Execution Throttling
 * 7. Comprehensive Audit Logging
 * 8. Auto-Scaling Support
 */

import { storage } from "./storage";
import { EventEmitter } from "events";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export type AgentGroup = "QA" | "UAT" | "PROD";
export type AgentTrustLevel = "HIGH" | "MEDIUM" | "LOW";
export type AgentType = "LOCAL" | "BROWSER" | "API" | "JDE" | "SAP" | "MOBILE" | "CLOUD";
export type ExecutionCapability = "WEB" | "API" | "JDE" | "SAP" | "MOBILE" | "DATABASE";
export type FailureType = "AGENT_FAILURE" | "INFRA_FAILURE" | "TEST_FAILURE" | "ENVIRONMENT_FAILURE" | "NETWORK_FAILURE";
export type QueuedExecutionStatus = "QUEUED" | "ASSIGNED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface AgentCapabilities {
  web: boolean;
  api: boolean;
  jde: boolean;
  sap: boolean;
  mobile: boolean;
  database: boolean;
  browsers?: string[];
  platforms?: string[];
}

export interface AgentHealth {
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "OFFLINE";
  cpu?: number;
  memory?: number;
  disk?: number;
  lastHeartbeat: Date | null;
  timeSinceHeartbeat: number | null;
  secureTunnel: boolean;
  errors: string[];
}

export interface EnterpriseAgent {
  agentId: string;
  name: string;
  description?: string;
  type: AgentType;
  group: AgentGroup;
  trustLevel: AgentTrustLevel;
  capabilities: AgentCapabilities;
  environment: string;
  os?: string;
  version?: string;
  status: "ONLINE" | "OFFLINE" | "BUSY" | "MAINTENANCE";
  health: AgentHealth;
  maxConcurrentExecutions: number;
  currentExecutions: number;
  tags: string[];
  metadata: Record<string, any>;
  registeredAt: Date;
  lastSeenAt: Date | null;
}

export interface QueuedExecution {
  executionId: string;
  testCaseId: string;
  testCaseTitle: string;
  requiredCapabilities: ExecutionCapability[];
  group: AgentGroup;
  trustLevelRequired: AgentTrustLevel;
  priority: number; // Higher = more urgent
  status: QueuedExecutionStatus;
  assignedAgentId: string | null;
  attempt: number;
  maxAttempts: number;
  previousAgents: string[];
  createdAt: Date;
  assignedAt: Date | null;
  completedAt: Date | null;
  error?: string;
  failureType?: FailureType;
}

export interface ExecutionCostUnit {
  executionType: ExecutionCapability;
  costPerMinute: number;
}

export interface CostBudget {
  scope: "PROJECT" | "ENVIRONMENT" | "GLOBAL";
  scopeId: string;
  dailyBudgetUnits: number;
  usedUnits: number;
  lastResetAt: Date;
  alertThreshold: number; // Percentage
}

export interface AuditLogEntry {
  auditId: string;
  timestamp: Date;
  actorType: "USER" | "AGENT" | "SYSTEM";
  actorId: string;
  actorName?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  environment?: AgentGroup;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  details: Record<string, any>;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export interface RetryPolicy {
  failureType: FailureType;
  maxRetries: number;
  retryOnDifferentAgent: boolean;
  delayMs: number;
  exponentialBackoff: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const COST_UNITS: ExecutionCostUnit[] = [
  { executionType: "WEB", costPerMinute: 2 },
  { executionType: "API", costPerMinute: 0.2 },
  { executionType: "JDE", costPerMinute: 1 },
  { executionType: "SAP", costPerMinute: 3 },
  { executionType: "MOBILE", costPerMinute: 2.5 },
  { executionType: "DATABASE", costPerMinute: 0.5 },
];

const RETRY_POLICIES: RetryPolicy[] = [
  { failureType: "AGENT_FAILURE", maxRetries: 2, retryOnDifferentAgent: true, delayMs: 5000, exponentialBackoff: false },
  { failureType: "INFRA_FAILURE", maxRetries: 2, retryOnDifferentAgent: false, delayMs: 10000, exponentialBackoff: true },
  { failureType: "NETWORK_FAILURE", maxRetries: 3, retryOnDifferentAgent: false, delayMs: 3000, exponentialBackoff: true },
  { failureType: "ENVIRONMENT_FAILURE", maxRetries: 1, retryOnDifferentAgent: true, delayMs: 15000, exponentialBackoff: false },
  { failureType: "TEST_FAILURE", maxRetries: 0, retryOnDifferentAgent: false, delayMs: 0, exponentialBackoff: false },
];

const TRUST_LEVEL_PERMISSIONS: Record<AgentTrustLevel, { allowedGroups: AgentGroup[], allowedActions: string[] }> = {
  HIGH: { allowedGroups: ["QA", "UAT", "PROD"], allowedActions: ["READ", "WRITE", "EXECUTE", "DELETE"] },
  MEDIUM: { allowedGroups: ["QA", "UAT"], allowedActions: ["READ", "EXECUTE"] },
  LOW: { allowedGroups: ["QA"], allowedActions: ["READ"] },
};

const HEARTBEAT_THRESHOLD_MS = 60000; // 60 seconds
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private maxLogs = 10000;

  log(entry: Omit<AuditLogEntry, "auditId" | "timestamp">): AuditLogEntry {
    const auditEntry: AuditLogEntry = {
      ...entry,
      auditId: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };

    this.logs.unshift(auditEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Log to console for debugging
    const icon = entry.success ? "✅" : "❌";
    console.log(`[AUDIT] ${icon} ${entry.action} | ${entry.resourceType}:${entry.resourceId} | ${entry.actorType}:${entry.actorId}`);

    return auditEntry;
  }

  query(filters: {
    startDate?: Date;
    endDate?: Date;
    actorType?: string;
    actorId?: string;
    action?: string;
    resourceType?: string;
    environment?: AgentGroup;
    severity?: string;
    limit?: number;
  }): AuditLogEntry[] {
    let results = [...this.logs];

    if (filters.startDate) {
      results = results.filter(l => l.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      results = results.filter(l => l.timestamp <= filters.endDate!);
    }
    if (filters.actorType) {
      results = results.filter(l => l.actorType === filters.actorType);
    }
    if (filters.actorId) {
      results = results.filter(l => l.actorId === filters.actorId);
    }
    if (filters.action) {
      results = results.filter(l => l.action.includes(filters.action!));
    }
    if (filters.resourceType) {
      results = results.filter(l => l.resourceType === filters.resourceType);
    }
    if (filters.environment) {
      results = results.filter(l => l.environment === filters.environment);
    }
    if (filters.severity) {
      results = results.filter(l => l.severity === filters.severity);
    }

    return results.slice(0, filters.limit || 100);
  }

  getAll(): AuditLogEntry[] {
    return [...this.logs];
  }

  getStats(): { total: number; byAction: Record<string, number>; bySeverity: Record<string, number> } {
    const byAction: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const log of this.logs) {
      byAction[log.action] = (byAction[log.action] || 0) + 1;
      bySeverity[log.severity] = (bySeverity[log.severity] || 0) + 1;
    }

    return { total: this.logs.length, byAction, bySeverity };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION QUEUE MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

class ExecutionQueueManager extends EventEmitter {
  private queue: QueuedExecution[] = [];
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(private agentManager: EnterpriseAgentManager) {
    super();
  }

  enqueue(execution: Omit<QueuedExecution, "executionId" | "status" | "attempt" | "previousAgents" | "createdAt">): QueuedExecution {
    const queuedExecution: QueuedExecution = {
      ...execution,
      executionId: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: "QUEUED",
      attempt: 0,
      previousAgents: [],
      createdAt: new Date(),
      assignedAt: null,
      completedAt: null,
      assignedAgentId: null,
    };

    // Insert based on priority (higher priority first)
    const insertIndex = this.queue.findIndex(e => e.priority < queuedExecution.priority);
    if (insertIndex === -1) {
      this.queue.push(queuedExecution);
    } else {
      this.queue.splice(insertIndex, 0, queuedExecution);
    }

    console.log(`[Queue] Enqueued execution ${queuedExecution.executionId} for ${queuedExecution.testCaseTitle} (priority: ${queuedExecution.priority})`);
    this.emit("enqueued", queuedExecution);

    return queuedExecution;
  }

  dequeue(executionId: string): QueuedExecution | undefined {
    const index = this.queue.findIndex(e => e.executionId === executionId);
    if (index !== -1) {
      const [execution] = this.queue.splice(index, 1);
      console.log(`[Queue] Dequeued execution ${executionId}`);
      return execution;
    }
    return undefined;
  }

  getQueuedExecutions(filters?: { group?: AgentGroup; status?: QueuedExecutionStatus }): QueuedExecution[] {
    let results = [...this.queue];
    if (filters?.group) {
      results = results.filter(e => e.group === filters.group);
    }
    if (filters?.status) {
      results = results.filter(e => e.status === filters.status);
    }
    return results;
  }

  getNextForAgent(agent: EnterpriseAgent): QueuedExecution | null {
    // Find first execution that matches agent capabilities
    for (const execution of this.queue) {
      if (execution.status !== "QUEUED") continue;
      if (execution.group !== agent.group) continue;
      if (!this.agentManager.canAgentExecute(agent, execution)) continue;
      if (execution.previousAgents.includes(agent.agentId)) continue; // Avoid re-assigning to failed agent

      return execution;
    }
    return null;
  }

  assignToAgent(executionId: string, agentId: string): boolean {
    const execution = this.queue.find(e => e.executionId === executionId);
    if (execution) {
      execution.status = "ASSIGNED";
      execution.assignedAgentId = agentId;
      execution.assignedAt = new Date();
      execution.attempt++;
      console.log(`[Queue] Assigned ${executionId} to agent ${agentId} (attempt ${execution.attempt})`);
      this.emit("assigned", execution);
      return true;
    }
    return false;
  }

  markCompleted(executionId: string, success: boolean, error?: string, failureType?: FailureType): void {
    const execution = this.queue.find(e => e.executionId === executionId);
    if (execution) {
      if (success) {
        execution.status = "COMPLETED";
        execution.completedAt = new Date();
        this.emit("completed", execution);
        // Remove from queue
        this.dequeue(executionId);
      } else {
        execution.error = error;
        execution.failureType = failureType;
        
        // Check if retry is allowed
        const policy = RETRY_POLICIES.find(p => p.failureType === failureType);
        if (policy && execution.attempt < policy.maxRetries + 1) {
          // Requeue for retry
          if (execution.assignedAgentId) {
            execution.previousAgents.push(execution.assignedAgentId);
          }
          execution.status = "QUEUED";
          execution.assignedAgentId = null;
          execution.assignedAt = null;
          console.log(`[Queue] Re-queuing ${executionId} for retry (attempt ${execution.attempt}/${policy.maxRetries + 1})`);
          this.emit("retrying", execution);
        } else {
          execution.status = "FAILED";
          execution.completedAt = new Date();
          console.log(`[Queue] Execution ${executionId} failed permanently`);
          this.emit("failed", execution);
          // Remove from queue
          this.dequeue(executionId);
        }
      }
    }
  }

  getQueueLength(): number {
    return this.queue.filter(e => e.status === "QUEUED").length;
  }

  getStats(): { total: number; queued: number; assigned: number; byGroup: Record<string, number> } {
    const stats = {
      total: this.queue.length,
      queued: 0,
      assigned: 0,
      byGroup: {} as Record<string, number>,
    };

    for (const e of this.queue) {
      if (e.status === "QUEUED") stats.queued++;
      if (e.status === "ASSIGNED") stats.assigned++;
      stats.byGroup[e.group] = (stats.byGroup[e.group] || 0) + 1;
    }

    return stats;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COST MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

class CostManager {
  private budgets: Map<string, CostBudget> = new Map();

  constructor() {
    // Initialize default budgets
    this.initDefaultBudgets();
    
    // Reset budgets daily at midnight
    this.scheduleDailyReset();
  }

  private initDefaultBudgets(): void {
    const defaultBudgets: CostBudget[] = [
      { scope: "ENVIRONMENT", scopeId: "QA", dailyBudgetUnits: 1000, usedUnits: 0, lastResetAt: new Date(), alertThreshold: 80 },
      { scope: "ENVIRONMENT", scopeId: "UAT", dailyBudgetUnits: 500, usedUnits: 0, lastResetAt: new Date(), alertThreshold: 80 },
      { scope: "ENVIRONMENT", scopeId: "PROD", dailyBudgetUnits: 200, usedUnits: 0, lastResetAt: new Date(), alertThreshold: 70 },
      { scope: "GLOBAL", scopeId: "GLOBAL", dailyBudgetUnits: 2000, usedUnits: 0, lastResetAt: new Date(), alertThreshold: 85 },
    ];

    for (const budget of defaultBudgets) {
      this.budgets.set(`${budget.scope}:${budget.scopeId}`, budget);
    }
  }

  private scheduleDailyReset(): void {
    // Calculate time until midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      this.resetAllBudgets();
      // Schedule for next day
      setInterval(() => this.resetAllBudgets(), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  resetAllBudgets(): void {
    Array.from(this.budgets.entries()).forEach(([key, budget]) => {
      budget.usedUnits = 0;
      budget.lastResetAt = new Date();
      console.log(`[Cost] Reset budget for ${key}`);
    });
  }

  getCostPerMinute(capability: ExecutionCapability): number {
    const costUnit = COST_UNITS.find(c => c.executionType === capability);
    return costUnit?.costPerMinute || 1;
  }

  estimateCost(capabilities: ExecutionCapability[], estimatedDurationMinutes: number): number {
    let totalCost = 0;
    for (const cap of capabilities) {
      totalCost += this.getCostPerMinute(cap) * estimatedDurationMinutes;
    }
    return totalCost;
  }

  recordUsage(scopeId: string, units: number): void {
    // Update environment budget
    const envKey = `ENVIRONMENT:${scopeId}`;
    const envBudget = this.budgets.get(envKey);
    if (envBudget) {
      envBudget.usedUnits += units;
    }

    // Update global budget
    const globalBudget = this.budgets.get("GLOBAL:GLOBAL");
    if (globalBudget) {
      globalBudget.usedUnits += units;
    }
  }

  canExecute(scopeId: string, estimatedUnits: number): { allowed: boolean; reason?: string; throttleAction?: string } {
    const envKey = `ENVIRONMENT:${scopeId}`;
    const envBudget = this.budgets.get(envKey);
    const globalBudget = this.budgets.get("GLOBAL:GLOBAL");

    // Check environment budget
    if (envBudget) {
      if (envBudget.usedUnits + estimatedUnits > envBudget.dailyBudgetUnits) {
        return {
          allowed: false,
          reason: `${scopeId} daily budget exceeded (${envBudget.usedUnits}/${envBudget.dailyBudgetUnits} units)`,
          throttleAction: "QUEUE_OR_HIGH_RISK_ONLY",
        };
      }
      if ((envBudget.usedUnits + estimatedUnits) / envBudget.dailyBudgetUnits * 100 > envBudget.alertThreshold) {
        return {
          allowed: true,
          reason: `${scopeId} approaching budget limit (${Math.round((envBudget.usedUnits / envBudget.dailyBudgetUnits) * 100)}% used)`,
          throttleAction: "HIGH_RISK_PRIORITY",
        };
      }
    }

    // Check global budget
    if (globalBudget) {
      if (globalBudget.usedUnits + estimatedUnits > globalBudget.dailyBudgetUnits) {
        return {
          allowed: false,
          reason: `Global daily budget exceeded`,
          throttleAction: "BLOCK_ALL",
        };
      }
    }

    return { allowed: true };
  }

  getBudget(scope: string, scopeId: string): CostBudget | undefined {
    return this.budgets.get(`${scope}:${scopeId}`);
  }

  getAllBudgets(): CostBudget[] {
    return Array.from(this.budgets.values());
  }

  setBudget(scope: string, scopeId: string, dailyBudgetUnits: number, alertThreshold: number = 80): void {
    const key = `${scope}:${scopeId}`;
    const existing = this.budgets.get(key);
    this.budgets.set(key, {
      scope: scope as "PROJECT" | "ENVIRONMENT" | "GLOBAL",
      scopeId,
      dailyBudgetUnits,
      usedUnits: existing?.usedUnits || 0,
      lastResetAt: existing?.lastResetAt || new Date(),
      alertThreshold,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE AGENT MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

export class EnterpriseAgentManager extends EventEmitter {
  private agents: Map<string, EnterpriseAgent> = new Map();
  private auditLogger: AuditLogger;
  private queueManager: ExecutionQueueManager;
  private costManager: CostManager;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.auditLogger = new AuditLogger();
    this.queueManager = new ExecutionQueueManager(this);
    this.costManager = new CostManager();

    // Start health check loop
    this.startHealthCheck();

    // Listen to queue events
    this.queueManager.on("enqueued", (e) => this.emit("execution:queued", e));
    this.queueManager.on("assigned", (e) => this.emit("execution:assigned", e));
    this.queueManager.on("completed", (e) => this.emit("execution:completed", e));
    this.queueManager.on("failed", (e) => this.emit("execution:failed", e));
    this.queueManager.on("retrying", (e) => this.emit("execution:retrying", e));
  }

  // ─── AGENT REGISTRATION & MANAGEMENT ──────────────────────────────────────

  registerAgent(agent: Omit<EnterpriseAgent, "agentId" | "registeredAt" | "health" | "currentExecutions">): EnterpriseAgent {
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newAgent: EnterpriseAgent = {
      ...agent,
      agentId,
      registeredAt: new Date(),
      currentExecutions: 0,
      health: {
        status: "OFFLINE",
        lastHeartbeat: null,
        timeSinceHeartbeat: null,
        secureTunnel: false,
        errors: [],
      },
    };

    this.agents.set(agentId, newAgent);

    this.auditLogger.log({
      actorType: "SYSTEM",
      actorId: "AGENT_MANAGER",
      action: "AGENT_REGISTERED",
      resourceType: "AGENT",
      resourceId: agentId,
      resourceName: agent.name,
      environment: agent.group,
      severity: "INFO",
      details: { type: agent.type, group: agent.group, trustLevel: agent.trustLevel, capabilities: agent.capabilities },
      success: true,
    });

    console.log(`[AgentManager] Registered agent: ${agent.name} (${agentId}) in group ${agent.group}`);
    this.emit("agent:registered", newAgent);

    return newAgent;
  }

  updateAgentHealth(agentId: string, health: Partial<AgentHealth>): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.health = { ...agent.health, ...health };
      agent.lastSeenAt = new Date();
      
      // Update status based on health
      if (health.status === "HEALTHY" || health.lastHeartbeat) {
        agent.status = agent.currentExecutions > 0 ? "BUSY" : "ONLINE";
        agent.health.status = "HEALTHY";
      } else if (health.status === "UNHEALTHY" || health.status === "OFFLINE") {
        agent.status = "OFFLINE";
      }

      this.emit("agent:healthUpdated", agent);
    }
  }

  processHeartbeat(agentId: string, heartbeat: {
    cpu?: number;
    memory?: number;
    disk?: number;
    secureTunnel?: boolean;
  }): { success: boolean; nextHeartbeatIn: number } {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { success: false, nextHeartbeatIn: 0 };
    }

    this.updateAgentHealth(agentId, {
      status: "HEALTHY",
      cpu: heartbeat.cpu,
      memory: heartbeat.memory,
      disk: heartbeat.disk,
      lastHeartbeat: new Date(),
      timeSinceHeartbeat: 0,
      secureTunnel: heartbeat.secureTunnel ?? false,
      errors: [],
    });

    return { success: true, nextHeartbeatIn: HEARTBEAT_INTERVAL_MS };
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      const now = Date.now();
      
      Array.from(this.agents.entries()).forEach(([agentId, agent]) => {
        if (agent.health.lastHeartbeat) {
          const timeSince = now - agent.health.lastHeartbeat.getTime();
          agent.health.timeSinceHeartbeat = timeSince;

          if (timeSince > HEARTBEAT_THRESHOLD_MS) {
            if (agent.status !== "OFFLINE" && agent.status !== "MAINTENANCE") {
              agent.status = "OFFLINE";
              agent.health.status = "OFFLINE";
              
              this.auditLogger.log({
                actorType: "SYSTEM",
                actorId: "HEALTH_MONITOR",
                action: "AGENT_WENT_OFFLINE",
                resourceType: "AGENT",
                resourceId: agentId,
                resourceName: agent.name,
                environment: agent.group,
                severity: "WARNING",
                details: { timeSinceLastHeartbeat: timeSince, threshold: HEARTBEAT_THRESHOLD_MS },
                success: true,
              });

              this.emit("agent:offline", agent);
            }
          }
        }
      });
    }, 10000); // Check every 10 seconds
  }

  // ─── AGENT QUERYING ──────────────────────────────────────────────────────

  getAgent(agentId: string): EnterpriseAgent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): EnterpriseAgent[] {
    return Array.from(this.agents.values());
  }

  getAgentsByGroup(group: AgentGroup): EnterpriseAgent[] {
    return this.getAllAgents().filter(a => a.group === group);
  }

  getAgentsByType(type: AgentType): EnterpriseAgent[] {
    return this.getAllAgents().filter(a => a.type === type);
  }

  getOnlineAgents(group?: AgentGroup): EnterpriseAgent[] {
    let agents = this.getAllAgents().filter(a => a.status === "ONLINE" || a.status === "BUSY");
    if (group) {
      agents = agents.filter(a => a.group === group);
    }
    return agents;
  }

  getAgentStats(): {
    total: number;
    online: number;
    offline: number;
    busy: number;
    byGroup: Record<AgentGroup, { total: number; online: number }>;
    byType: Record<AgentType, number>;
  } {
    const agents = this.getAllAgents();
    const stats = {
      total: agents.length,
      online: 0,
      offline: 0,
      busy: 0,
      byGroup: {
        QA: { total: 0, online: 0 },
        UAT: { total: 0, online: 0 },
        PROD: { total: 0, online: 0 },
      },
      byType: {} as Record<AgentType, number>,
    };

    for (const agent of agents) {
      if (agent.status === "ONLINE") stats.online++;
      else if (agent.status === "OFFLINE") stats.offline++;
      else if (agent.status === "BUSY") stats.busy++;

      stats.byGroup[agent.group].total++;
      if (agent.status === "ONLINE" || agent.status === "BUSY") {
        stats.byGroup[agent.group].online++;
      }

      stats.byType[agent.type] = (stats.byType[agent.type] || 0) + 1;
    }

    return stats;
  }

  // ─── CAPABILITY & ROUTING LOGIC ──────────────────────────────────────────

  canAgentExecute(agent: EnterpriseAgent, execution: QueuedExecution): boolean {
    // Check group match
    if (agent.group !== execution.group) {
      return false;
    }

    // Check trust level
    if (!this.isTrustLevelSufficient(agent.trustLevel, execution.trustLevelRequired)) {
      return false;
    }

    // Check capabilities
    for (const cap of execution.requiredCapabilities) {
      const capKey = cap.toLowerCase() as keyof AgentCapabilities;
      if (!agent.capabilities[capKey]) {
        return false;
      }
    }

    // Check if agent is available
    if (agent.status !== "ONLINE") {
      return false;
    }

    // Check concurrent execution limit
    if (agent.currentExecutions >= agent.maxConcurrentExecutions) {
      return false;
    }

    return true;
  }

  private isTrustLevelSufficient(agentTrust: AgentTrustLevel, requiredTrust: AgentTrustLevel): boolean {
    const levels: AgentTrustLevel[] = ["LOW", "MEDIUM", "HIGH"];
    return levels.indexOf(agentTrust) >= levels.indexOf(requiredTrust);
  }

  selectBestAgent(execution: QueuedExecution): EnterpriseAgent | null {
    const eligibleAgents = this.getOnlineAgents(execution.group)
      .filter(a => this.canAgentExecute(a, execution))
      .filter(a => !execution.previousAgents.includes(a.agentId));

    if (eligibleAgents.length === 0) {
      return null;
    }

    // Sort by: least busy, highest trust, best health
    eligibleAgents.sort((a, b) => {
      // Prefer less busy
      if (a.currentExecutions !== b.currentExecutions) {
        return a.currentExecutions - b.currentExecutions;
      }
      // Prefer higher trust
      const trustOrder: AgentTrustLevel[] = ["LOW", "MEDIUM", "HIGH"];
      const trustDiff = trustOrder.indexOf(b.trustLevel) - trustOrder.indexOf(a.trustLevel);
      if (trustDiff !== 0) return trustDiff;
      // Prefer better health
      if (a.health.cpu && b.health.cpu) {
        return a.health.cpu - b.health.cpu;
      }
      return 0;
    });

    return eligibleAgents[0];
  }

  // ─── EXECUTION ORCHESTRATION ─────────────────────────────────────────────

  async executeTest(params: {
    testCaseId: string;
    testCaseTitle: string;
    group: AgentGroup;
    requiredCapabilities: ExecutionCapability[];
    priority?: number;
    estimatedDurationMinutes?: number;
    userId?: string;
  }): Promise<{ success: boolean; executionId?: string; agentId?: string; queued?: boolean; error?: string }> {
    const { testCaseId, testCaseTitle, group, requiredCapabilities, priority = 5, estimatedDurationMinutes = 5, userId } = params;

    // Determine required trust level based on group
    const trustLevelRequired: AgentTrustLevel = group === "PROD" ? "HIGH" : group === "UAT" ? "MEDIUM" : "LOW";

    // Cost check
    const estimatedCost = this.costManager.estimateCost(requiredCapabilities, estimatedDurationMinutes);
    const costCheck = this.costManager.canExecute(group, estimatedCost);
    
    if (!costCheck.allowed) {
      this.auditLogger.log({
        actorType: userId ? "USER" : "SYSTEM",
        actorId: userId || "SYSTEM",
        action: "EXECUTION_THROTTLED",
        resourceType: "TEST_CASE",
        resourceId: testCaseId,
        resourceName: testCaseTitle,
        environment: group,
        severity: "WARNING",
        details: { reason: costCheck.reason, estimatedCost, throttleAction: costCheck.throttleAction },
        success: false,
      });

      // If throttle action is HIGH_RISK_ONLY and priority is low, reject
      if (costCheck.throttleAction === "QUEUE_OR_HIGH_RISK_ONLY" && priority < 8) {
        return { success: false, error: costCheck.reason };
      }
    }

    // Find available agent
    const execution: Omit<QueuedExecution, "executionId" | "status" | "attempt" | "previousAgents" | "createdAt"> = {
      testCaseId,
      testCaseTitle,
      requiredCapabilities,
      group,
      trustLevelRequired,
      priority,
      maxAttempts: 3,
      assignedAgentId: null,
      assignedAt: null,
      completedAt: null,
    };

    const agent = this.selectBestAgent(execution as QueuedExecution);

    if (agent) {
      // Direct execution
      const queuedExecution = this.queueManager.enqueue(execution);
      this.queueManager.assignToAgent(queuedExecution.executionId, agent.agentId);
      agent.currentExecutions++;

      this.auditLogger.log({
        actorType: userId ? "USER" : "SYSTEM",
        actorId: userId || "SYSTEM",
        action: "EXECUTION_STARTED",
        resourceType: "TEST_CASE",
        resourceId: testCaseId,
        resourceName: testCaseTitle,
        environment: group,
        severity: "INFO",
        details: { agentId: agent.agentId, agentName: agent.name, capabilities: requiredCapabilities },
        success: true,
      });

      return { success: true, executionId: queuedExecution.executionId, agentId: agent.agentId, queued: false };
    } else {
      // Queue for later
      const queuedExecution = this.queueManager.enqueue(execution);

      this.auditLogger.log({
        actorType: userId ? "USER" : "SYSTEM",
        actorId: userId || "SYSTEM",
        action: "EXECUTION_QUEUED",
        resourceType: "TEST_CASE",
        resourceId: testCaseId,
        resourceName: testCaseTitle,
        environment: group,
        severity: "INFO",
        details: { reason: "No available agent", capabilities: requiredCapabilities, queuePosition: this.queueManager.getQueueLength() },
        success: true,
      });

      return { success: true, executionId: queuedExecution.executionId, queued: true };
    }
  }

  completeExecution(executionId: string, success: boolean, durationMinutes: number, error?: string, failureType?: FailureType): void {
    const execution = this.queueManager.getQueuedExecutions().find(e => e.executionId === executionId);
    if (!execution) return;

    // Record cost
    this.costManager.recordUsage(execution.group, this.costManager.estimateCost(execution.requiredCapabilities, durationMinutes));

    // Update agent
    if (execution.assignedAgentId) {
      const agent = this.agents.get(execution.assignedAgentId);
      if (agent && agent.currentExecutions > 0) {
        agent.currentExecutions--;
      }
    }

    // Mark execution complete (handles retry logic)
    this.queueManager.markCompleted(executionId, success, error, failureType);

    this.auditLogger.log({
      actorType: "AGENT",
      actorId: execution.assignedAgentId || "UNKNOWN",
      action: success ? "EXECUTION_COMPLETED" : "EXECUTION_FAILED",
      resourceType: "TEST_CASE",
      resourceId: execution.testCaseId,
      resourceName: execution.testCaseTitle,
      environment: execution.group,
      severity: success ? "INFO" : "ERROR",
      details: { 
        executionId, 
        duration: durationMinutes, 
        attempt: execution.attempt,
        error,
        failureType,
        willRetry: !success && execution.attempt < execution.maxAttempts,
      },
      success,
    });

    // Try to assign queued executions to now-available agent
    if (execution.assignedAgentId) {
      const agent = this.agents.get(execution.assignedAgentId);
      if (agent && agent.status === "ONLINE") {
        this.processQueue();
      }
    }
  }

  processQueue(): void {
    const onlineAgents = this.getOnlineAgents();
    
    for (const agent of onlineAgents) {
      if (agent.currentExecutions >= agent.maxConcurrentExecutions) continue;

      const nextExecution = this.queueManager.getNextForAgent(agent);
      if (nextExecution) {
        this.queueManager.assignToAgent(nextExecution.executionId, agent.agentId);
        agent.currentExecutions++;

        this.auditLogger.log({
          actorType: "SYSTEM",
          actorId: "QUEUE_PROCESSOR",
          action: "EXECUTION_ASSIGNED_FROM_QUEUE",
          resourceType: "TEST_CASE",
          resourceId: nextExecution.testCaseId,
          resourceName: nextExecution.testCaseTitle,
          environment: nextExecution.group,
          severity: "INFO",
          details: { executionId: nextExecution.executionId, agentId: agent.agentId },
          success: true,
        });

        this.emit("execution:assignedFromQueue", nextExecution, agent);
      }
    }
  }

  // ─── AUDIT & COMPLIANCE ──────────────────────────────────────────────────

  getAuditLogs(filters?: Parameters<AuditLogger["query"]>[0]): AuditLogEntry[] {
    return this.auditLogger.query(filters || {});
  }

  getAuditStats(): ReturnType<AuditLogger["getStats"]> {
    return this.auditLogger.getStats();
  }

  // ─── COST MANAGEMENT ─────────────────────────────────────────────────────

  getCostBudgets(): CostBudget[] {
    return this.costManager.getAllBudgets();
  }

  getCostBudget(group: AgentGroup): CostBudget | undefined {
    return this.costManager.getBudget("ENVIRONMENT", group);
  }

  setCostBudget(group: AgentGroup, dailyBudgetUnits: number, alertThreshold?: number): void {
    this.costManager.setBudget("ENVIRONMENT", group, dailyBudgetUnits, alertThreshold);
    
    this.auditLogger.log({
      actorType: "SYSTEM",
      actorId: "COST_MANAGER",
      action: "BUDGET_UPDATED",
      resourceType: "BUDGET",
      resourceId: group,
      environment: group,
      severity: "INFO",
      details: { dailyBudgetUnits, alertThreshold },
      success: true,
    });
  }

  // ─── QUEUE MANAGEMENT ────────────────────────────────────────────────────

  getQueuedExecutions(filters?: { group?: AgentGroup; status?: QueuedExecutionStatus }): QueuedExecution[] {
    return this.queueManager.getQueuedExecutions(filters);
  }

  getQueueStats(): ReturnType<ExecutionQueueManager["getStats"]> {
    return this.queueManager.getStats();
  }

  // ─── DASHBOARD DATA ──────────────────────────────────────────────────────

  getDashboardData(): {
    agents: ReturnType<EnterpriseAgentManager["getAgentStats"]>;
    queue: ReturnType<ExecutionQueueManager["getStats"]>;
    budgets: CostBudget[];
    recentAudit: AuditLogEntry[];
    retryPolicies: RetryPolicy[];
    trustLevelPermissions: typeof TRUST_LEVEL_PERMISSIONS;
  } {
    return {
      agents: this.getAgentStats(),
      queue: this.queueManager.getStats(),
      budgets: this.costManager.getAllBudgets(),
      recentAudit: this.auditLogger.query({ limit: 20 }),
      retryPolicies: RETRY_POLICIES,
      trustLevelPermissions: TRUST_LEVEL_PERMISSIONS,
    };
  }

  // ─── CLEANUP ─────────────────────────────────────────────────────────────

  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

export const enterpriseAgentManager = new EnterpriseAgentManager();
