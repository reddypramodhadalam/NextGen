/**
 * Audit Log Engine — AITAS Phase 8
 * Tracks all user actions, system events, and security events
 */

import { storage } from "./storage";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditAction =
  | "user.login" | "user.logout" | "user.created" | "user.updated" | "user.deleted"
  | "user.password_changed" | "user.role_assigned" | "user.role_removed"
  | "role.created" | "role.updated" | "role.deleted"
  | "test_suite.created" | "test_suite.updated" | "test_suite.deleted"
  | "test_case.created" | "test_case.updated" | "test_case.deleted"
  | "execution.started" | "execution.completed" | "execution.cancelled"
  | "settings.updated" | "cicd.triggered" | "agent.created" | "agent.deleted"
  | "data_factory.generated" | "visual.baseline_updated" | "healer.applied"
  | "system.startup" | "system.error" | "security.failed_login" | "security.unauthorized";

export type AuditSeverity = "info" | "warning" | "error" | "critical";

export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: AuditAction;
  severity: AuditSeverity;
  userId?: string;
  userEmail?: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

// ─── In-Memory Audit Store (ring buffer, last 1000 entries) ──────────────────

const MAX_ENTRIES = 1000;
const auditLog: AuditEntry[] = [];

export function logAudit(entry: Omit<AuditEntry, "id" | "timestamp">): void {
  const full: AuditEntry = {
    id: randomUUID(),
    timestamp: new Date(),
    ...entry,
  };
  auditLog.unshift(full);
  if (auditLog.length > MAX_ENTRIES) auditLog.pop();

  // Log to console for critical/error events
  if (entry.severity === "critical" || entry.severity === "error") {
    console.error(`[Audit] ${entry.action} by ${entry.userEmail || "system"}: ${entry.errorMessage || "OK"}`);
  }
}

export function getAuditLog(filters?: {
  action?: AuditAction;
  userId?: string;
  severity?: AuditSeverity;
  resourceType?: string;
  since?: Date;
  limit?: number;
}): AuditEntry[] {
  let entries = [...auditLog];

  if (filters?.action) entries = entries.filter((e) => e.action === filters.action);
  if (filters?.userId) entries = entries.filter((e) => e.userId === filters.userId);
  if (filters?.severity) entries = entries.filter((e) => e.severity === filters.severity);
  if (filters?.resourceType) entries = entries.filter((e) => e.resourceType === filters.resourceType);
  if (filters?.since) entries = entries.filter((e) => e.timestamp >= filters.since!);

  return entries.slice(0, filters?.limit || 100);
}

export function getAuditStats(): {
  total: number;
  byAction: Record<string, number>;
  bySeverity: Record<string, number>;
  recentErrors: AuditEntry[];
  topUsers: Array<{ userId: string; email: string; count: number }>;
} {
  const byAction: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const userCounts: Record<string, { email: string; count: number }> = {};

  for (const entry of auditLog) {
    byAction[entry.action] = (byAction[entry.action] || 0) + 1;
    bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
    if (entry.userId) {
      if (!userCounts[entry.userId]) userCounts[entry.userId] = { email: entry.userEmail || "", count: 0 };
      userCounts[entry.userId].count++;
    }
  }

  const topUsers = Object.entries(userCounts)
    .map(([userId, data]) => ({ userId, email: data.email, count: data.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const recentErrors = auditLog
    .filter((e) => e.severity === "error" || e.severity === "critical")
    .slice(0, 10);

  return { total: auditLog.length, byAction, bySeverity, recentErrors, topUsers };
}

// Seed startup event
logAudit({ action: "system.startup", severity: "info", success: true, details: { version: "1.0.0" } });
