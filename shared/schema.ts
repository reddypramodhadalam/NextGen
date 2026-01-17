import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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
  steps: jsonb("steps").$type<{ step: string; expected: string }[]>(),
  priority: text("priority").default("medium"), // low, medium, high, critical
  status: text("status").default("active"), // active, deprecated, draft
  tags: text("tags").array(),
  generatedByAI: boolean("generated_by_ai").default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTestCaseSchema = createInsertSchema(testCases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTestCase = z.infer<typeof insertTestCaseSchema>;
export type TestCase = typeof testCases.$inferSelect;

// Test Agents
export const testAgents = pgTable("test_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(), // browser, api, mobile
  status: text("status").default("offline"), // online, offline, busy
  capabilities: text("capabilities").array(),
  lastHeartbeat: timestamp("last_heartbeat"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTestAgentSchema = createInsertSchema(testAgents).omit({
  id: true,
  lastHeartbeat: true,
  createdAt: true,
});

export type InsertTestAgent = z.infer<typeof insertTestAgentSchema>;
export type TestAgent = typeof testAgents.$inferSelect;

// Test Executions
export const testExecutions = pgTable("test_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  suiteId: varchar("suite_id").references(() => testSuites.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id").references(() => testAgents.id),
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

// Test Results (individual test case results within an execution)
export const testResults = pgTable("test_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  executionId: varchar("execution_id").references(() => testExecutions.id, { onDelete: "cascade" }),
  testCaseId: varchar("test_case_id").references(() => testCases.id, { onDelete: "cascade" }),
  status: text("status").default("pending"), // pending, running, passed, failed, skipped
  duration: integer("duration"), // in milliseconds
  errorMessage: text("error_message"),
  screenshot: text("screenshot"), // base64 or URL
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
