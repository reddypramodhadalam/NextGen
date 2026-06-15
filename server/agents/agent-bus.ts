// ============================================================================
// AITAS Multi-Agent System — Agent Event Bus
// Pub/Sub message bus for inter-agent communication
// ============================================================================

import { EventEmitter } from 'events';
import type { AgentMessage, OrchestratorEvent } from './types.js';

type EventHandler<T = any> = (payload: T) => void | Promise<void>;

class AgentEventBus extends EventEmitter {
  private static instance: AgentEventBus;
  private messageLog: AgentMessage[] = [];
  private maxLogSize = 1000;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  static getInstance(): AgentEventBus {
    if (!AgentEventBus.instance) {
      AgentEventBus.instance = new AgentEventBus();
    }
    return AgentEventBus.instance;
  }

  // Publish an event to all subscribers
  publish(event: string, payload: any, sessionId?: string): void {
    const message: AgentMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from: 'orchestrator',
      to: 'broadcast',
      type: event,
      payload,
      timestamp: new Date(),
      sessionId,
    };

    // Log message
    this.messageLog.push(message);
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog.shift();
    }

    this.emit(event, payload);
  }

  // Publish a typed orchestrator event (for SSE streaming)
  publishOrchestratorEvent(event: OrchestratorEvent): void {
    this.emit(`session:${event.sessionId}`, event);
    this.emit('orchestrator:event', event);
  }

  // Subscribe to an event
  subscribe<T>(event: string, handler: EventHandler<T>): () => void {
    this.on(event, handler);
    return () => this.off(event, handler);
  }

  // Subscribe to all events for a specific session
  subscribeToSession(
    sessionId: string,
    handler: EventHandler<OrchestratorEvent>
  ): () => void {
    const eventName = `session:${sessionId}`;
    this.on(eventName, handler);
    return () => this.off(eventName, handler);
  }

  // Request-response pattern (agent-to-agent RPC)
  async request<TReq, TRes>(
    event: string,
    payload: TReq,
    timeoutMs = 60000
  ): Promise<TRes> {
    return new Promise((resolve, reject) => {
      const responseEvent = `${event}:res:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const timer = setTimeout(() => {
        this.removeAllListeners(responseEvent);
        reject(new Error(`[AgentBus] Request timeout: ${event} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.once(responseEvent, (result: TRes) => {
        clearTimeout(timer);
        resolve(result);
      });

      this.emit(event, { ...payload, _responseEvent: responseEvent });
    });
  }

  // Get recent messages (for debugging)
  getRecentMessages(limit = 50): AgentMessage[] {
    return this.messageLog.slice(-limit);
  }

  // Clear logs
  clearLogs(): void {
    this.messageLog = [];
  }
}

export const agentBus = AgentEventBus.getInstance();
