/**
 * SQLite Schema for AITAS
 * Compatible with better-sqlite3 and drizzle-orm
 */

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Helper to generate UUID
const generateUUID = () => crypto.randomUUID();

// ============================================================================
// USERS & AUTHENTICATION
// ============================================================================

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  roleId: text("role_id"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  lastLogin: integer("last_login", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  name: text("name").notNull().unique(),
  description: text("description"),
  permissions: text("permissions", { mode: "json" }).$type<string[]>(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ============================================================================
// PROJECTS & TEAMS
// ============================================================================

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: text("owner_id").references(() => users.id),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const teamMemberships = sqliteTable("team_memberships", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  role: text("role").default("member"), // owner, admin, member, viewer
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ============================================================================
// TEST MANAGEMENT
// ============================================================================

export const testSuites = sqliteTable("test_suites", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const testCases = sqliteTable("test_cases", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  suiteId: text("suite_id").references(() => testSuites.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  preconditions: text("preconditions"),
  targetUrl: text("target_url"),
  steps: text("steps", { mode: "json" }).$type<{ step: string; expected: string }[]>(),
  priority: text("priority").default("medium"),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  status: text("status").default("active"),
  generatedByAI: integer("generated_by_ai", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ============================================================================
// TEST EXECUTION
// ============================================================================

export const testAgents = sqliteTable("test_agents", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  name: text("name").notNull(),
  type: text("type").default("browser"),
  status: text("status").default("offline"),
  capabilities: text("capabilities", { mode: "json" }).$type<string[]>(),
  lastHeartbeat: integer("last_heartbeat", { mode: "timestamp" }),
  configuration: text("configuration", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export const testExecutions = sqliteTable("test_executions", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  suiteId: text("suite_id").references(() => testSuites.id, { onDelete: "cascade" }),
  agentId: text("agent_id").references(() => testAgents.id),
  status: text("status").default("pending"),
  environment: text("environment").default("staging"),
  targetUrl: text("target_url"),
  framework: text("framework").default("playwright"),
  testData: text("test_data", { mode: "json" }).$type<{ key: string; value: string }[]>(),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  totalTests: integer("total_tests").default(0),
  passedTests: integer("passed_tests").default(0),
  failedTests: integer("failed_tests").default(0),
  skippedTests: integer("skipped_tests").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// Step screenshot type
export interface StepScreenshot {
  stepNumber: number;
  action: string;
  status: "passed" | "failed" | "skipped";
  screenshot?: string;
  timestamp?: string;
}

// Network log entry type
export interface NetworkLogEntry {
  url: string;
  method: string;
  status: number;
  duration?: number;
  timestamp?: string;
}

// Performance data type
export interface PerformanceData {
  loadTime?: number;
  domContentLoaded?: number;
  firstContentfulPaint?: number;
  timeToInteractive?: number;
  totalBlockingTime?: number;
}

export const testResults = sqliteTable("test_results", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  executionId: text("execution_id").references(() => testExecutions.id, { onDelete: "cascade" }),
  testCaseId: text("test_case_id").references(() => testCases.id, { onDelete: "cascade" }),
  status: text("status").default("pending"),
  duration: integer("duration"),
  errorMessage: text("error_message"),
  screenshot: text("screenshot"),
  stepScreenshots: text("step_screenshots", { mode: "json" }).$type<StepScreenshot[]>(),
  video: text("video"),
  networkLogs: text("network_logs", { mode: "json" }).$type<NetworkLogEntry[]>(),
  performanceMetrics: text("performance_metrics", { mode: "json" }).$type<PerformanceData>(),
  logs: text("logs", { mode: "json" }).$type<string[]>(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ============================================================================
// REPORTS
// ============================================================================

export const testReports = sqliteTable("test_reports", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  executionId: text("execution_id").references(() => testExecutions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").default("execution"),
  format: text("format").default("html"),
  content: text("content"),
  summary: text("summary", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ============================================================================
// GENERATED SCRIPTS
// ============================================================================

export const generatedScripts = sqliteTable("generated_scripts", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  testCaseId: text("test_case_id").references(() => testCases.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  framework: text("framework").notNull(),
  language: text("language").default("typescript"),
  code: text("code").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ============================================================================
// SETTINGS & CONFIGURATION
// ============================================================================

export const platformSettings = sqliteTable("platform_settings", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  category: text("category").notNull(),
  key: text("key").notNull(),
  value: text("value"),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const environments = sqliteTable("environments", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  variables: text("variables", { mode: "json" }),
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export const testDataPools = sqliteTable("test_data_pools", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  name: text("name").notNull(),
  description: text("description"),
  data: text("data", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ============================================================================
// VISUAL TESTING
// ============================================================================

export const visualBaselines = sqliteTable("visual_baselines", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  testCaseId: text("test_case_id").references(() => testCases.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  screenshot: text("screenshot").notNull(),
  viewport: text("viewport", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export const visualComparisons = sqliteTable("visual_comparisons", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  baselineId: text("baseline_id").references(() => visualBaselines.id, { onDelete: "cascade" }),
  executionId: text("execution_id").references(() => testExecutions.id, { onDelete: "cascade" }),
  screenshot: text("screenshot").notNull(),
  diffImage: text("diff_image"),
  matchPercentage: real("match_percentage"),
  status: text("status").default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ============================================================================
// PERFORMANCE
// ============================================================================

export const performanceMetrics = sqliteTable("performance_metrics", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  executionId: text("execution_id").references(() => testExecutions.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  loadTime: integer("load_time"),
  ttfb: integer("ttfb"),
  fcp: integer("fcp"),
  lcp: integer("lcp"),
  cls: real("cls"),
  fid: integer("fid"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ============================================================================
// API MOCKING
// ============================================================================

export const apiMocks = sqliteTable("api_mocks", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  name: text("name").notNull(),
  method: text("method").default("GET"),
  urlPattern: text("url_pattern").notNull(),
  responseStatus: integer("response_status").default(200),
  responseBody: text("response_body"),
  responseHeaders: text("response_headers", { mode: "json" }),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ============================================================================
// CI/CD INTEGRATION
// ============================================================================

export const cicdWebhooks = sqliteTable("cicd_webhooks", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  name: text("name").notNull(),
  provider: text("provider").default("github"),
  suiteId: text("suite_id").references(() => testSuites.id, { onDelete: "cascade" }),
  secret: text("secret"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  lastTriggered: integer("last_triggered", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ============================================================================
// MOBILE DEVICES
// ============================================================================

export const mobileDevices = sqliteTable("mobile_devices", {
  id: text("id").primaryKey().$defaultFn(generateUUID),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  version: text("version"),
  udid: text("udid"),
  status: text("status").default("available"),
  capabilities: text("capabilities", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

// ============================================================================
// ZOD SCHEMAS FOR VALIDATION
// ============================================================================

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertRoleSchema = createInsertSchema(roles).omit({ id: true, createdAt: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
export const insertTeamMembershipSchema = createInsertSchema(teamMemberships).omit({ id: true, createdAt: true });
export const insertTestSuiteSchema = createInsertSchema(testSuites).omit({ id: true, createdAt: true });
export const insertTestCaseSchema = createInsertSchema(testCases).omit({ id: true, createdAt: true });
export const insertTestAgentSchema = createInsertSchema(testAgents).omit({ id: true, createdAt: true });
export const insertTestExecutionSchema = createInsertSchema(testExecutions).omit({ id: true, createdAt: true });
export const insertTestResultSchema = createInsertSchema(testResults).omit({ id: true, createdAt: true });
export const insertTestReportSchema = createInsertSchema(testReports).omit({ id: true, createdAt: true });
export const insertGeneratedScriptSchema = createInsertSchema(generatedScripts).omit({ id: true, createdAt: true });
export const insertPlatformSettingSchema = createInsertSchema(platformSettings).omit({ id: true, createdAt: true });
export const insertEnvironmentSchema = createInsertSchema(environments).omit({ id: true, createdAt: true });
export const insertTestDataPoolSchema = createInsertSchema(testDataPools).omit({ id: true, createdAt: true });
export const insertVisualBaselineSchema = createInsertSchema(visualBaselines).omit({ id: true, createdAt: true });
export const insertVisualComparisonSchema = createInsertSchema(visualComparisons).omit({ id: true, createdAt: true });
export const insertPerformanceMetricSchema = createInsertSchema(performanceMetrics).omit({ id: true, createdAt: true });
export const insertApiMockSchema = createInsertSchema(apiMocks).omit({ id: true, createdAt: true });
export const insertCicdWebhookSchema = createInsertSchema(cicdWebhooks).omit({ id: true, createdAt: true });
export const insertMobileDeviceSchema = createInsertSchema(mobileDevices).omit({ id: true, createdAt: true });

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type TeamMembership = typeof teamMemberships.$inferSelect;
export type InsertTeamMembership = z.infer<typeof insertTeamMembershipSchema>;
export type TestSuite = typeof testSuites.$inferSelect;
export type InsertTestSuite = z.infer<typeof insertTestSuiteSchema>;
export type TestCase = typeof testCases.$inferSelect;
export type InsertTestCase = z.infer<typeof insertTestCaseSchema>;
export type TestAgent = typeof testAgents.$inferSelect;
export type InsertTestAgent = z.infer<typeof insertTestAgentSchema>;
export type TestExecution = typeof testExecutions.$inferSelect;
export type InsertTestExecution = z.infer<typeof insertTestExecutionSchema>;
export type TestResult = typeof testResults.$inferSelect;
export type InsertTestResult = z.infer<typeof insertTestResultSchema>;
export type TestReport = typeof testReports.$inferSelect;
export type InsertTestReport = z.infer<typeof insertTestReportSchema>;
export type GeneratedScript = typeof generatedScripts.$inferSelect;
export type InsertGeneratedScript = z.infer<typeof insertGeneratedScriptSchema>;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;
export type Environment = typeof environments.$inferSelect;
export type InsertEnvironment = z.infer<typeof insertEnvironmentSchema>;
export type TestDataPool = typeof testDataPools.$inferSelect;
export type InsertTestDataPool = z.infer<typeof insertTestDataPoolSchema>;
export type VisualBaseline = typeof visualBaselines.$inferSelect;
export type InsertVisualBaseline = z.infer<typeof insertVisualBaselineSchema>;
export type VisualComparison = typeof visualComparisons.$inferSelect;
export type InsertVisualComparison = z.infer<typeof insertVisualComparisonSchema>;
export type PerformanceMetric = typeof performanceMetrics.$inferSelect;
export type InsertPerformanceMetric = z.infer<typeof insertPerformanceMetricSchema>;
export type ApiMock = typeof apiMocks.$inferSelect;
export type InsertApiMock = z.infer<typeof insertApiMockSchema>;
export type CicdWebhook = typeof cicdWebhooks.$inferSelect;
export type InsertCicdWebhook = z.infer<typeof insertCicdWebhookSchema>;
export type MobileDevice = typeof mobileDevices.$inferSelect;
export type InsertMobileDevice = z.infer<typeof insertMobileDeviceSchema>;

// Test data param type (for execution)
export interface TestDataParam {
  key: string;
  value: string;
}
