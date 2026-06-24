import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Import and re-export auth schema (users and sessions tables)
import { users, sessions } from "./models/auth";
export { users, sessions };
export type { User, UpsertUser } from "./models/auth";

// Test Suites
export const testSuites = pgTable("test_suites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTestSuiteSchema = createInsertSchema(testSuites).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTestSuite = z.infer<typeof insertTestSuiteSchema>;
export type TestSuite = typeof testSuites.$inferSelect;

// Test Cases
export const testCases = pgTable("test_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  suiteId: varchar("suite_id").references(() => testSuites.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  preconditions: text("preconditions"),
  targetUrl: text("target_url"), // URL to test against
  steps: jsonb("steps").$type<{ step: string; expected: string }[]>(),
  priority: text("priority").default("medium"), // low, medium, high, critical
  status: text("status").default("active"), // active, deprecated, draft
  tags: text("tags").array(),
  generatedByAI: boolean("generated_by_ai").default(false),
  order: integer("order").default(0), // Execution order within suite (0 = first, 1 = second, etc.)
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTestCaseSchema = createInsertSchema(testCases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  order: true,  // Order is auto-assigned, not from user input
});

export type InsertTestCase = z.infer<typeof insertTestCaseSchema>;
export type TestCase = typeof testCases.$inferSelect;

// Test Agents
export const testAgents = pgTable("test_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(), // browser, api, mobile
  status: text("status").default("offline"), // online, offline, busy, running
  capabilities: text("capabilities").array(),
  // Autonomous agent settings
  isAutonomous: boolean("is_autonomous").default(false), // Enable autonomous mode
  targetUrl: text("target_url"), // Default URL to test
  suiteId: varchar("suite_id").references(() => testSuites.id), // Suite to run
  scheduleInterval: integer("schedule_interval"), // Run every N minutes (null = continuous)
  maxRetries: integer("max_retries").default(3), // Self-healing retries
  selfHealingEnabled: boolean("self_healing_enabled").default(true), // AI self-healing
  notifyOnFailure: boolean("notify_on_failure").default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastHeartbeat: timestamp("last_heartbeat"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTestAgentSchema = createInsertSchema(testAgents).omit({
  id: true,
  lastHeartbeat: true,
  lastRunAt: true,
  nextRunAt: true,
  createdAt: true,
});

export type InsertTestAgent = z.infer<typeof insertTestAgentSchema>;
export type TestAgent = typeof testAgents.$inferSelect;

// Test Data type for parameterized testing
export type TestDataParam = {
  key: string;
  value: string;
  type: "text" | "password" | "email" | "url" | "number";
  description?: string;
};

// Test Executions
export const testExecutions = pgTable("test_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  suiteId: varchar("suite_id").references(() => testSuites.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id").references(() => testAgents.id),
  targetUrl: text("target_url"), // URL being tested
  framework: text("framework").default("playwright"), // playwright, puppeteer, selenium
  testData: jsonb("test_data").$type<TestDataParam[]>(), // User-supplied test data parameters
  status: text("status").default("pending"), // pending, running, passed, failed, cancelled
  environment: text("environment").default("staging"), // development, staging, production
  totalTests: integer("total_tests").default(0),
  passedTests: integer("passed_tests").default(0),
  failedTests: integer("failed_tests").default(0),
  skippedTests: integer("skipped_tests").default(0),
  duration: integer("duration"), // in milliseconds
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTestExecutionSchema = createInsertSchema(testExecutions).omit({
  id: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
});

export type InsertTestExecution = z.infer<typeof insertTestExecutionSchema>;
export type TestExecution = typeof testExecutions.$inferSelect;

// Step screenshot interface for type safety
export interface StepScreenshot {
  stepIndex: number;
  stepName: string;
  screenshot: string;
  passed: boolean;
}

// Test Results (individual test case results within an execution)
// Network log entry interface
export interface NetworkLogEntry {
  timestamp: number;
  method: string;
  url: string;
  status?: number;
  duration?: number;
  size?: number;
  type?: string;
}

// Performance metrics interface  
export interface PerformanceData {
  loadTime?: number;
  domContentLoaded?: number;
  firstPaint?: number;
  firstContentfulPaint?: number;
  largestContentfulPaint?: number;
  timeToInteractive?: number;
  totalBlockingTime?: number;
  cumulativeLayoutShift?: number;
  memoryUsed?: number;
  memoryTotal?: number;
}

export const testResults = pgTable("test_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  executionId: varchar("execution_id").references(() => testExecutions.id, { onDelete: "cascade" }),
  testCaseId: varchar("test_case_id").references(() => testCases.id, { onDelete: "cascade" }),
  status: text("status").default("pending"), // pending, running, passed, failed, skipped
  duration: integer("duration"), // in milliseconds
  errorMessage: text("error_message"),
  screenshot: text("screenshot"), // base64 or URL - final/failure screenshot
  stepScreenshots: jsonb("step_screenshots").$type<StepScreenshot[]>(), // screenshot at each step
  video: text("video"), // base64 encoded video or URL
  networkLogs: jsonb("network_logs").$type<NetworkLogEntry[]>(), // network request logs
  performanceMetrics: jsonb("performance_metrics").$type<PerformanceData>(), // performance data
  logs: jsonb("logs").$type<string[]>(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTestResultSchema = createInsertSchema(testResults).omit({
  id: true,
  createdAt: true,
});

export type InsertTestResult = z.infer<typeof insertTestResultSchema>;
export type TestResult = typeof testResults.$inferSelect;

// Generated Scripts
export const generatedScripts = pgTable("generated_scripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testCaseId: varchar("test_case_id").references(() => testCases.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  framework: text("framework").notNull(), // playwright, cypress, selenium, puppeteer
  language: text("language").notNull(), // typescript, javascript, python, java
  code: text("code").notNull(),
  version: integer("version").default(1),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertGeneratedScriptSchema = createInsertSchema(generatedScripts).omit({
  id: true,
  version: true,
  createdAt: true,
});

export type InsertGeneratedScript = z.infer<typeof insertGeneratedScriptSchema>;
export type GeneratedScript = typeof generatedScripts.$inferSelect;

// Test Reports
export const testReports = pgTable("test_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  executionId: varchar("execution_id").references(() => testExecutions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  summary: text("summary"),
  passRate: integer("pass_rate"), // percentage
  totalDuration: integer("total_duration"), // in milliseconds
  insights: jsonb("insights").$type<{ type: string; message: string }[]>(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTestReportSchema = createInsertSchema(testReports).omit({
  id: true,
  createdAt: true,
});

export type InsertTestReport = z.infer<typeof insertTestReportSchema>;
export type TestReport = typeof testReports.$inferSelect;

// Requirements (for AI test generation)
export const requirements = pgTable("requirements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  acceptanceCriteria: text("acceptance_criteria").array(),
  status: text("status").default("pending"), // pending, processed, archived
  generatedTestCount: integer("generated_test_count").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertRequirementSchema = createInsertSchema(requirements).omit({
  id: true,
  generatedTestCount: true,
  createdAt: true,
});

export type InsertRequirement = z.infer<typeof insertRequirementSchema>;
export type Requirement = typeof requirements.$inferSelect;

// ========================================
// REAL-WORLD ENTERPRISE ENHANCEMENTS
// ========================================

// Platform Settings (persisted)
export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(), // notifications, execution, reporting, security
  key: text("key").notNull(),
  value: text("value"),
  valueJson: jsonb("value_json"),
  description: text("description"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPlatformSettingSchema = createInsertSchema(platformSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;
export type PlatformSetting = typeof platformSettings.$inferSelect;

// Environments (multi-environment support)
export const environments = pgTable("environments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // development, staging, production
  displayName: text("display_name").notNull(),
  baseUrl: text("base_url").notNull(),
  variables: jsonb("variables").$type<Record<string, string>>(),
  headers: jsonb("headers").$type<Record<string, string>>(),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertEnvironmentSchema = createInsertSchema(environments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEnvironment = z.infer<typeof insertEnvironmentSchema>;
export type Environment = typeof environments.$inferSelect;

// Test Data Pools (reusable test data management)
export const testDataPools = pgTable("test_data_pools", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  dataType: text("data_type").notNull(), // user, product, payment, address, custom
  data: jsonb("data").$type<Record<string, any>[]>().notNull(),
  isShared: boolean("is_shared").default(true),
  autoCleanup: boolean("auto_cleanup").default(false),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTestDataPoolSchema = createInsertSchema(testDataPools).omit({
  id: true,
  usageCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTestDataPool = z.infer<typeof insertTestDataPoolSchema>;
export type TestDataPool = typeof testDataPools.$inferSelect;

// Visual Baselines (visual regression testing)
export const visualBaselines = pgTable("visual_baselines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testCaseId: varchar("test_case_id").references(() => testCases.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  selector: text("selector"), // CSS selector for element comparison
  fullPage: boolean("full_page").default(true),
  baselineImage: text("baseline_image").notNull(), // base64 encoded
  threshold: integer("threshold").default(5), // percentage difference allowed
  environmentId: varchar("environment_id").references(() => environments.id),
  viewport: jsonb("viewport").$type<{ width: number; height: number }>(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertVisualBaselineSchema = createInsertSchema(visualBaselines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVisualBaseline = z.infer<typeof insertVisualBaselineSchema>;
export type VisualBaseline = typeof visualBaselines.$inferSelect;

// Visual Comparison Results
export const visualComparisons = pgTable("visual_comparisons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  baselineId: varchar("baseline_id").references(() => visualBaselines.id, { onDelete: "cascade" }),
  executionId: varchar("execution_id").references(() => testExecutions.id, { onDelete: "cascade" }),
  actualImage: text("actual_image").notNull(), // base64 encoded
  diffImage: text("diff_image"), // base64 encoded difference
  diffPercentage: integer("diff_percentage").default(0),
  passed: boolean("passed").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertVisualComparisonSchema = createInsertSchema(visualComparisons).omit({
  id: true,
  createdAt: true,
});

export type InsertVisualComparison = z.infer<typeof insertVisualComparisonSchema>;
export type VisualComparison = typeof visualComparisons.$inferSelect;

// Performance Metrics
export const performanceMetrics = pgTable("performance_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  executionId: varchar("execution_id").references(() => testExecutions.id, { onDelete: "cascade" }),
  testCaseId: varchar("test_case_id").references(() => testCases.id, { onDelete: "cascade" }),
  url: text("url"),
  // Core Web Vitals
  lcp: integer("lcp"), // Largest Contentful Paint (ms)
  fid: integer("fid"), // First Input Delay (ms)
  cls: integer("cls"), // Cumulative Layout Shift (x1000 for precision)
  fcp: integer("fcp"), // First Contentful Paint (ms)
  ttfb: integer("ttfb"), // Time to First Byte (ms)
  // Resource metrics
  domLoadTime: integer("dom_load_time"),
  pageLoadTime: integer("page_load_time"),
  resourceCount: integer("resource_count"),
  totalResourceSize: integer("total_resource_size"), // bytes
  // Memory
  jsHeapSize: integer("js_heap_size"), // bytes
  // Network
  requestCount: integer("request_count"),
  transferSize: integer("transfer_size"), // bytes
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPerformanceMetricSchema = createInsertSchema(performanceMetrics).omit({
  id: true,
  createdAt: true,
});

export type InsertPerformanceMetric = z.infer<typeof insertPerformanceMetricSchema>;
export type PerformanceMetric = typeof performanceMetrics.$inferSelect;

// API Mocks (service virtualization)
export const apiMocks = pgTable("api_mocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  method: text("method").notNull(), // GET, POST, PUT, DELETE, PATCH
  urlPattern: text("url_pattern").notNull(), // regex pattern to match
  requestHeaders: jsonb("request_headers").$type<Record<string, string>>(),
  requestBody: jsonb("request_body"),
  responseStatus: integer("response_status").default(200),
  responseHeaders: jsonb("response_headers").$type<Record<string, string>>(),
  responseBody: jsonb("response_body"),
  delay: integer("delay").default(0), // simulated delay in ms
  isActive: boolean("is_active").default(true),
  priority: integer("priority").default(0), // higher priority mocks matched first
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertApiMockSchema = createInsertSchema(apiMocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertApiMock = z.infer<typeof insertApiMockSchema>;
export type ApiMock = typeof apiMocks.$inferSelect;

// CI/CD Webhooks
export const cicdWebhooks = pgTable("cicd_webhooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  provider: text("provider").notNull(), // github, gitlab, jenkins, azure-devops, custom
  webhookUrl: text("webhook_url"),
  secretToken: text("secret_token"),
  suiteId: varchar("suite_id").references(() => testSuites.id, { onDelete: "cascade" }),
  environmentId: varchar("environment_id").references(() => environments.id),
  triggerOn: text("trigger_on").array(), // push, pull_request, tag, manual
  isActive: boolean("is_active").default(true),
  lastTriggered: timestamp("last_triggered"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCicdWebhookSchema = createInsertSchema(cicdWebhooks).omit({
  id: true,
  lastTriggered: true,
  createdAt: true,
});

export type InsertCicdWebhook = z.infer<typeof insertCicdWebhookSchema>;
export type CicdWebhook = typeof cicdWebhooks.$inferSelect;

// Roles (RBAC)
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  permissions: text("permissions").array().notNull(), // view, create, edit, delete, execute, admin
  isSystem: boolean("is_system").default(false), // system roles cannot be deleted
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  isSystem: true,
  createdAt: true,
});

export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

// User Roles (many-to-many)
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  roleId: varchar("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  assignedAt: timestamp("assigned_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  assignedAt: true,
});

export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;

// Mobile Device Configurations (Appium)
export const mobileDevices = pgTable("mobile_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  platform: text("platform").notNull(), // ios, android
  platformVersion: text("platform_version"),
  deviceName: text("device_name").notNull(),
  udid: text("udid"), // Unique device identifier
  appPath: text("app_path"), // Path to .app or .apk
  appPackage: text("app_package"), // Android package name
  appActivity: text("app_activity"), // Android activity
  bundleId: text("bundle_id"), // iOS bundle ID
  automationName: text("automation_name").default("XCUITest"), // XCUITest, UiAutomator2
  isReal: boolean("is_real").default(false), // real device vs simulator
  isAvailable: boolean("is_available").default(true),
  capabilities: jsonb("capabilities").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMobileDeviceSchema = createInsertSchema(mobileDevices).omit({
  id: true,
  createdAt: true,
});

export type InsertMobileDevice = z.infer<typeof insertMobileDeviceSchema>;
export type MobileDevice = typeof mobileDevices.$inferSelect;

// ========================================
// MULTI-PROJECT & TEAM SUPPORT
// ========================================

// Projects (multi-project support)
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(), // URL-friendly identifier
  ownerId: varchar("owner_id").references(() => users.id, { onDelete: "set null" }), // Project owner
  isActive: boolean("is_active").default(true),
  settings: jsonb("settings").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// Team Memberships (linking users to projects with roles)
export const teamMemberships = pgTable("team_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  roleId: varchar("role_id").references(() => roles.id, { onDelete: "set null" }), // Per-project role
  isOwner: boolean("is_owner").default(false), // Project owner flag
  joinedAt: timestamp("joined_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTeamMembershipSchema = createInsertSchema(teamMemberships).omit({
  id: true,
  joinedAt: true,
});

export type InsertTeamMembership = z.infer<typeof insertTeamMembershipSchema>;
export type TeamMembership = typeof teamMemberships.$inferSelect;
