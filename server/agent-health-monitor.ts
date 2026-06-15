/**
 * Agent Health Monitor
 * Periodically checks agent heartbeat status and marks offline agents
 */

import { storage } from "./storage";

const HEARTBEAT_TIMEOUT_MS = 60000; // 60 seconds
const CHECK_INTERVAL_MS = 30000; // 30 seconds
const HEARTBEAT_WARNING_THRESHOLD_MS = 45000; // 45 seconds

interface AgentHealthStatus {
  agentId: string;
  agentName: string;
  isHealthy: boolean;
  lastHeartbeat: Date | null;
  timeSinceLastHeartbeat: number | null;
  wasMarkedOffline: boolean;
}

class AgentHealthMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private previousStatus: Map<string, boolean> = new Map(); // agentId -> wasHealthy

  /**
   * Start the health monitoring service
   */
  public start() {
    if (this.intervalId) {
      console.warn("[AgentHealthMonitor] Already running");
      return;
    }

    console.log("[AgentHealthMonitor] Starting agent health monitoring service");

    this.intervalId = setInterval(() => {
      this.checkAgentHealth().catch((error) => {
        console.error("[AgentHealthMonitor] Error during health check:", error);
      });
    }, CHECK_INTERVAL_MS);

    // Run immediately on start
    this.checkAgentHealth().catch((error) => {
      console.error("[AgentHealthMonitor] Error during initial health check:", error);
    });
  }

  /**
   * Stop the health monitoring service
   */
  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[AgentHealthMonitor] Stopped");
    }
  }

  /**
   * Check health of all agents
   */
  private async checkAgentHealth(): Promise<void> {
    try {
      const agents = await storage.getAllAgents();

      for (const agent of agents) {
        const lastHeartbeat = agent.lastHeartbeat ? new Date(agent.lastHeartbeat) : null;
        const timeSinceLastHeartbeat = lastHeartbeat ? Date.now() - lastHeartbeat.getTime() : null;
        const isHealthy = timeSinceLastHeartbeat ? timeSinceLastHeartbeat < HEARTBEAT_TIMEOUT_MS : false;

        const wasHealthy = this.previousStatus.get(agent.id);
        const healthChanged = wasHealthy !== undefined && wasHealthy !== isHealthy;

        // Log status changes
        if (healthChanged) {
          if (isHealthy) {
            console.log(`[AgentHealthMonitor] Agent came online: ${agent.name}`);
            // Agent came back online - no action needed, next heartbeat will set status to online
          } else {
            console.warn(
              `[AgentHealthMonitor] Agent went offline: ${agent.name} (last heartbeat: ${
                lastHeartbeat ? lastHeartbeat.toISOString() : "never"
              })`
            );
            // Mark agent as offline
            if (agent.status !== "offline") {
              await storage.updateAgent(agent.id, { status: "offline" });
            }
          }
        }

        // Warn if approaching timeout
        if (
          isHealthy &&
          timeSinceLastHeartbeat &&
          timeSinceLastHeartbeat > HEARTBEAT_WARNING_THRESHOLD_MS
        ) {
          const secondsLeft = Math.floor((HEARTBEAT_TIMEOUT_MS - timeSinceLastHeartbeat) / 1000);
          console.warn(
            `[AgentHealthMonitor] Agent nearing timeout: ${agent.name} (${secondsLeft}s until offline)`
          );
        }

        this.previousStatus.set(agent.id, isHealthy);
      }
    } catch (error) {
      console.error("[AgentHealthMonitor] Failed to check agent health:", error);
    }
  }

  /**
   * Get current health status of all agents
   */
  public async getHealthStatus(): Promise<AgentHealthStatus[]> {
    try {
      const agents = await storage.getAllAgents();

      return agents.map((agent) => {
        const lastHeartbeat = agent.lastHeartbeat ? new Date(agent.lastHeartbeat) : null;
        const timeSinceLastHeartbeat = lastHeartbeat ? Date.now() - lastHeartbeat.getTime() : null;
        const isHealthy = timeSinceLastHeartbeat ? timeSinceLastHeartbeat < HEARTBEAT_TIMEOUT_MS : false;
        const wasMarkedOffline = agent.status === "offline";

        return {
          agentId: agent.id,
          agentName: agent.name,
          isHealthy,
          lastHeartbeat,
          timeSinceLastHeartbeat,
          wasMarkedOffline,
        };
      });
    } catch (error) {
      console.error("[AgentHealthMonitor] Error getting health status:", error);
      return [];
    }
  }

  /**
   * Get health status for a specific agent
   */
  public async getAgentHealth(agentId: string): Promise<AgentHealthStatus | null> {
    try {
      const agent = await storage.getAgent(agentId);
      if (!agent) return null;

      const lastHeartbeat = agent.lastHeartbeat ? new Date(agent.lastHeartbeat) : null;
      const timeSinceLastHeartbeat = lastHeartbeat ? Date.now() - lastHeartbeat.getTime() : null;
      const isHealthy = timeSinceLastHeartbeat ? timeSinceLastHeartbeat < HEARTBEAT_TIMEOUT_MS : false;
      const wasMarkedOffline = agent.status === "offline";

      return {
        agentId: agent.id,
        agentName: agent.name,
        isHealthy,
        lastHeartbeat,
        timeSinceLastHeartbeat,
        wasMarkedOffline,
      };
    } catch (error) {
      console.error("[AgentHealthMonitor] Error getting agent health:", error);
      return null;
    }
  }
}

// Export singleton instance
export const agentHealthMonitor = new AgentHealthMonitor();
