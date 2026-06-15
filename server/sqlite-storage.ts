// @ts-nocheck
/**
 * SQLite Database Storage Implementation
 * Uses OneDrive path for persistent storage
 * 
 * NOTE: Type checking disabled to bridge SQLite schema with PostgreSQL-defined types
 */

import { sqliteConnection } from "./db-sqlite";
import { randomUUID } from "crypto";

// Initialize database tables
function initializeTables() {
  console.log("[SQLite] Initializing database tables...");
  
  sqliteConnection.exec(`
    -- Users & Authentication
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role_id TEXT,
      is_active INTEGER DEFAULT 1,
      last_login INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      permissions TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
      assigned_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Projects & Teams
        CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      slug TEXT,
      owner_id TEXT,
      is_active INTEGER DEFAULT 1,
      settings TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS team_memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      role_id TEXT,
      is_owner INTEGER DEFAULT 0,
      joined_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Test Management
    CREATE TABLE IF NOT EXISTS test_suites (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY,
      suite_id TEXT REFERENCES test_suites(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      preconditions TEXT,
      target_url TEXT,
      steps TEXT,
      priority TEXT DEFAULT 'medium',
      tags TEXT,
      status TEXT DEFAULT 'active',
      generated_by_ai INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER
    );

    -- Test Execution
    CREATE TABLE IF NOT EXISTS test_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'browser',
      status TEXT DEFAULT 'offline',
      capabilities TEXT,
      last_heartbeat INTEGER,
      configuration TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS test_executions (
      id TEXT PRIMARY KEY,
      suite_id TEXT REFERENCES test_suites(id) ON DELETE CASCADE,
      agent_id TEXT REFERENCES test_agents(id),
      status TEXT DEFAULT 'pending',
      environment TEXT DEFAULT 'staging',
      target_url TEXT,
      framework TEXT DEFAULT 'playwright',
      test_data TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      total_tests INTEGER DEFAULT 0,
      passed_tests INTEGER DEFAULT 0,
      failed_tests INTEGER DEFAULT 0,
      skipped_tests INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS test_results (
      id TEXT PRIMARY KEY,
      execution_id TEXT REFERENCES test_executions(id) ON DELETE CASCADE,
      test_case_id TEXT REFERENCES test_cases(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending',
      duration INTEGER,
      error_message TEXT,
      screenshot TEXT,
      step_screenshots TEXT,
      video TEXT,
      network_logs TEXT,
      performance_metrics TEXT,
      logs TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Reports
    CREATE TABLE IF NOT EXISTS test_reports (
      id TEXT PRIMARY KEY,
      execution_id TEXT REFERENCES test_executions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'execution',
      format TEXT DEFAULT 'html',
      content TEXT,
      summary TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Generated Scripts
    CREATE TABLE IF NOT EXISTS generated_scripts (
      id TEXT PRIMARY KEY,
      test_case_id TEXT REFERENCES test_cases(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      framework TEXT NOT NULL,
      language TEXT DEFAULT 'typescript',
      code TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Requirements
    CREATE TABLE IF NOT EXISTS requirements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'active',
      source TEXT,
      test_coverage INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER
    );

    -- Settings
    CREATE TABLE IF NOT EXISTS platform_settings (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER,
      UNIQUE(category, key)
    );

    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      base_url TEXT NOT NULL,
      variables TEXT,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS test_data_pools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      data TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER
    );

    -- Visual Testing
    CREATE TABLE IF NOT EXISTS visual_baselines (
      id TEXT PRIMARY KEY,
      test_case_id TEXT REFERENCES test_cases(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      screenshot TEXT NOT NULL,
      viewport TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS visual_comparisons (
      id TEXT PRIMARY KEY,
      baseline_id TEXT REFERENCES visual_baselines(id) ON DELETE CASCADE,
      execution_id TEXT REFERENCES test_executions(id) ON DELETE CASCADE,
      screenshot TEXT NOT NULL,
      diff_image TEXT,
      match_percentage REAL,
      status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Performance
    CREATE TABLE IF NOT EXISTS performance_metrics (
      id TEXT PRIMARY KEY,
      execution_id TEXT REFERENCES test_executions(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      load_time INTEGER,
      ttfb INTEGER,
      fcp INTEGER,
      lcp INTEGER,
      cls REAL,
      fid INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- API Mocking
    CREATE TABLE IF NOT EXISTS api_mocks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      method TEXT DEFAULT 'GET',
      url_pattern TEXT NOT NULL,
      response_status INTEGER DEFAULT 200,
      response_body TEXT,
      response_headers TEXT,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- CI/CD
    CREATE TABLE IF NOT EXISTS cicd_webhooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT DEFAULT 'github',
      suite_id TEXT REFERENCES test_suites(id) ON DELETE CASCADE,
      secret TEXT,
      is_active INTEGER DEFAULT 1,
      last_triggered INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Mobile Devices
    CREATE TABLE IF NOT EXISTS mobile_devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      version TEXT,
      udid TEXT,
      status TEXT DEFAULT 'available',
      capabilities TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  
  console.log("[SQLite] Database tables initialized successfully");

  // ─── Migrations ──────────────────────────────────────────────────────────────
  // Drop FK constraint on projects.owner_id by recreating the table if needed
  try {
    const tableInfo = sqliteConnection.prepare("PRAGMA table_info(projects)").all() as any[];
    const hasSlug = tableInfo.some((col: any) => col.name === "slug");
    if (!hasSlug) {
      console.log("[SQLite] Migrating projects table (adding slug, removing FK)...");
      sqliteConnection.exec(`
        CREATE TABLE IF NOT EXISTS projects_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          slug TEXT,
          owner_id TEXT,
          is_active INTEGER DEFAULT 1,
          settings TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER
        );
        INSERT OR IGNORE INTO projects_new (id, name, description, owner_id, is_active, created_at, updated_at)
          SELECT id, name, description, owner_id, is_active, created_at, updated_at FROM projects;
        DROP TABLE projects;
        ALTER TABLE projects_new RENAME TO projects;
      `);
      console.log("[SQLite] Projects table migrated successfully");
    }
  } catch (migErr: any) {
    console.warn("[SQLite] Migration warning:", migErr.message);
  }
}

// Initialize tables on module load
initializeTables();

// Helper to convert unix timestamp to Date
function toDate(ts: number | null): Date | null {
  return ts ? new Date(ts * 1000) : null;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

// ============================================================================
// SQLITE STORAGE IMPLEMENTATION
// ============================================================================

export class SQLiteStorage implements IStorage {
  
  // ==================== USERS ====================
  
  async getUser(id: string): Promise<User | undefined> {
    const row = sqliteConnection.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      roleId: row.role_id,
      isActive: row.is_active === 1,
      lastLogin: toDate(row.last_login),
      createdAt: new Date(row.created_at * 1000),
      updatedAt: toDate(row.updated_at),
    };
  }

  async getAllUsers(): Promise<User[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as any[];
    return rows.map(r => ({
      id: r.id, email: r.email, name: r.name,
      roleId: r.role_id, isActive: r.is_active === 1,
      lastLogin: toDate(r.last_login),
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    }));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const row = sqliteConnection.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!row) return undefined;
    return this.getUser(row.id);
  }

  async createUser(userData: any): Promise<User> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO users (id, email, password, name, role_id, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(id, userData.email, userData.password, userData.name, userData.roleId || null, now());
    return this.getUser(id) as Promise<User>;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    
    if (data.name !== undefined) { fields.push("name = ?"); vals.push(data.name); }
    if (data.email !== undefined) { fields.push("email = ?"); vals.push(data.email); }
    if ((data as any).password !== undefined) { fields.push("password = ?"); vals.push((data as any).password); }
    if (data.roleId !== undefined) { fields.push("role_id = ?"); vals.push(data.roleId); }
    if (data.isActive !== undefined) { fields.push("is_active = ?"); vals.push(data.isActive ? 1 : 0); }
    if (data.lastLogin !== undefined) { fields.push("last_login = ?"); vals.push(Math.floor(data.lastLogin.getTime() / 1000)); }
    
    if (fields.length === 0) return this.getUser(id);
    fields.push("updated_at = ?"); vals.push(now());
    vals.push(id);
    
    sqliteConnection.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getUser(id);
  }

  // ==================== TEST SUITES ====================

  async getAllTestSuites(): Promise<TestSuite[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM test_suites ORDER BY created_at DESC").all() as any[];
    return rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      description: r.description,
      tags: r.tags ? JSON.parse(r.tags) : null,
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    }));
  }

  async getTestSuite(id: string): Promise<TestSuite | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM test_suites WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      description: r.description,
      tags: r.tags ? JSON.parse(r.tags) : null,
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    };
  }

  async createTestSuite(suite: InsertTestSuite): Promise<TestSuite> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO test_suites (id, project_id, name, description, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, suite.projectId || null, suite.name, suite.description || null, suite.tags ? JSON.stringify(suite.tags) : null, now());
    return this.getTestSuite(id) as Promise<TestSuite>;
  }

  async updateTestSuite(id: string, suite: Partial<InsertTestSuite>): Promise<TestSuite | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (suite.name !== undefined) { fields.push("name = ?"); vals.push(suite.name); }
    if (suite.description !== undefined) { fields.push("description = ?"); vals.push(suite.description); }
    if (suite.tags !== undefined) { fields.push("tags = ?"); vals.push(JSON.stringify(suite.tags)); }
    if (suite.projectId !== undefined) { fields.push("project_id = ?"); vals.push(suite.projectId); }
    if (fields.length === 0) return this.getTestSuite(id);
    fields.push("updated_at = ?"); vals.push(now());
    vals.push(id);
    sqliteConnection.prepare(`UPDATE test_suites SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getTestSuite(id);
  }

  async deleteTestSuite(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM test_suites WHERE id = ?").run(id);
  }

  // ==================== TEST CASES ====================

  async getAllTestCases(): Promise<TestCase[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM test_cases ORDER BY created_at DESC").all() as any[];
    return rows.map(r => this.mapTestCase(r));
  }

  async getTestCasesBySuite(suiteId: string): Promise<TestCase[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM test_cases WHERE suite_id = ? ORDER BY created_at DESC").all(suiteId) as any[];
    return rows.map(r => this.mapTestCase(r));
  }

  async getTestCase(id: string): Promise<TestCase | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM test_cases WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return this.mapTestCase(r);
  }

  private mapTestCase(r: any): TestCase {
    return {
      id: r.id,
      suiteId: r.suite_id,
      title: r.title,
      description: r.description,
      preconditions: r.preconditions,
      targetUrl: r.target_url,
      steps: r.steps ? JSON.parse(r.steps) : null,
      priority: r.priority,
      tags: r.tags ? JSON.parse(r.tags) : null,
      status: r.status,
      generatedByAi: r.generated_by_ai === 1,
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    };
  }

  async createTestCase(tc: InsertTestCase): Promise<TestCase> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO test_cases (id, suite_id, title, description, preconditions, target_url, steps, priority, tags, status, generated_by_ai, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tc.suiteId, tc.title, tc.description || null, tc.preconditions || null, tc.targetUrl || null,
      tc.steps ? JSON.stringify(tc.steps) : null, tc.priority || 'medium',
      tc.tags ? JSON.stringify(tc.tags) : null, tc.status || 'active', tc.generatedByAi ? 1 : 0, now()
    );
    return this.getTestCase(id) as Promise<TestCase>;
  }

  async updateTestCase(id: string, tc: Partial<InsertTestCase>): Promise<TestCase | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (tc.title !== undefined) { fields.push("title = ?"); vals.push(tc.title); }
    if (tc.description !== undefined) { fields.push("description = ?"); vals.push(tc.description); }
    if (tc.preconditions !== undefined) { fields.push("preconditions = ?"); vals.push(tc.preconditions); }
    if (tc.targetUrl !== undefined) { fields.push("target_url = ?"); vals.push(tc.targetUrl); }
    if (tc.steps !== undefined) { fields.push("steps = ?"); vals.push(JSON.stringify(tc.steps)); }
    if (tc.priority !== undefined) { fields.push("priority = ?"); vals.push(tc.priority); }
    if (tc.tags !== undefined) { fields.push("tags = ?"); vals.push(JSON.stringify(tc.tags)); }
    if (tc.status !== undefined) { fields.push("status = ?"); vals.push(tc.status); }
    if (tc.generatedByAi !== undefined) { fields.push("generated_by_ai = ?"); vals.push(tc.generatedByAi ? 1 : 0); }
    if (fields.length === 0) return this.getTestCase(id);
    fields.push("updated_at = ?"); vals.push(now());
    vals.push(id);
    sqliteConnection.prepare(`UPDATE test_cases SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getTestCase(id);
  }

  async deleteTestCase(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM test_cases WHERE id = ?").run(id);
  }

  // ==================== TEST AGENTS ====================

  async getAllAgents(): Promise<TestAgent[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM test_agents ORDER BY created_at DESC").all() as any[];
    return rows.map(r => this.mapAgent(r));
  }

  async getAgent(id: string): Promise<TestAgent | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM test_agents WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return this.mapAgent(r);
  }

  private mapAgent(r: any): TestAgent {
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      capabilities: r.capabilities ? JSON.parse(r.capabilities) : null,
      lastHeartbeat: toDate(r.last_heartbeat),
      configuration: r.configuration ? JSON.parse(r.configuration) : null,
      createdAt: new Date(r.created_at * 1000),
    };
  }

  async createAgent(agent: InsertTestAgent): Promise<TestAgent> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO test_agents (id, name, type, status, capabilities, configuration, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, agent.name, agent.type || 'browser', agent.status || 'offline',
      agent.capabilities ? JSON.stringify(agent.capabilities) : null,
      agent.configuration ? JSON.stringify(agent.configuration) : null, now());
    return this.getAgent(id) as Promise<TestAgent>;
  }

  async updateAgent(id: string, agent: Partial<InsertTestAgent>): Promise<TestAgent | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (agent.name !== undefined) { fields.push("name = ?"); vals.push(agent.name); }
    if (agent.type !== undefined) { fields.push("type = ?"); vals.push(agent.type); }
    if (agent.status !== undefined) { fields.push("status = ?"); vals.push(agent.status); }
    if (agent.capabilities !== undefined) { fields.push("capabilities = ?"); vals.push(JSON.stringify(agent.capabilities)); }
    if (agent.configuration !== undefined) { fields.push("configuration = ?"); vals.push(JSON.stringify(agent.configuration)); }
    if ((agent as any).lastHeartbeat !== undefined) { fields.push("last_heartbeat = ?"); vals.push(Math.floor((agent as any).lastHeartbeat.getTime() / 1000)); }
    if (fields.length === 0) return this.getAgent(id);
    vals.push(id);
    sqliteConnection.prepare(`UPDATE test_agents SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getAgent(id);
  }

  async deleteAgent(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM test_agents WHERE id = ?").run(id);
  }

  // ==================== TEST EXECUTIONS ====================

  async getAllExecutions(): Promise<TestExecution[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM test_executions ORDER BY created_at DESC").all() as any[];
    return rows.map(r => this.mapExecution(r));
  }

  async getExecution(id: string): Promise<TestExecution | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM test_executions WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return this.mapExecution(r);
  }

  private mapExecution(r: any): TestExecution {
    return {
      id: r.id,
      suiteId: r.suite_id,
      agentId: r.agent_id,
      status: r.status,
      environment: r.environment,
      targetUrl: r.target_url,
      framework: r.framework,
      testData: r.test_data ? JSON.parse(r.test_data) : null,
      startedAt: toDate(r.started_at),
      completedAt: toDate(r.completed_at),
      totalTests: r.total_tests,
      passedTests: r.passed_tests,
      failedTests: r.failed_tests,
      skippedTests: r.skipped_tests,
      createdAt: new Date(r.created_at * 1000),
    };
  }

  async createExecution(exec: InsertTestExecution): Promise<TestExecution> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO test_executions (id, suite_id, agent_id, status, environment, target_url, framework, test_data, total_tests, passed_tests, failed_tests, skipped_tests, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, exec.suiteId, exec.agentId || null, exec.status || 'pending', exec.environment || 'staging',
      exec.targetUrl || null, exec.framework || 'playwright', exec.testData ? JSON.stringify(exec.testData) : null,
      exec.totalTests || 0, exec.passedTests || 0, exec.failedTests || 0, exec.skippedTests || 0, now());
    return this.getExecution(id) as Promise<TestExecution>;
  }

  async updateExecution(id: string, exec: Partial<TestExecution>): Promise<TestExecution | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (exec.status !== undefined) { fields.push("status = ?"); vals.push(exec.status); }
    if (exec.startedAt !== undefined) { fields.push("started_at = ?"); vals.push(exec.startedAt ? Math.floor(exec.startedAt.getTime() / 1000) : null); }
    if (exec.completedAt !== undefined) { fields.push("completed_at = ?"); vals.push(exec.completedAt ? Math.floor(exec.completedAt.getTime() / 1000) : null); }
    if (exec.totalTests !== undefined) { fields.push("total_tests = ?"); vals.push(exec.totalTests); }
    if (exec.passedTests !== undefined) { fields.push("passed_tests = ?"); vals.push(exec.passedTests); }
    if (exec.failedTests !== undefined) { fields.push("failed_tests = ?"); vals.push(exec.failedTests); }
    if (exec.skippedTests !== undefined) { fields.push("skipped_tests = ?"); vals.push(exec.skippedTests); }
    if (exec.testData !== undefined) { fields.push("test_data = ?"); vals.push(JSON.stringify(exec.testData)); }
    if (fields.length === 0) return this.getExecution(id);
    vals.push(id);
    sqliteConnection.prepare(`UPDATE test_executions SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getExecution(id);
  }

  async deleteExecution(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM test_executions WHERE id = ?").run(id);
  }

  // ==================== TEST RESULTS ====================

  async getResultsByExecution(executionId: string): Promise<TestResult[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM test_results WHERE execution_id = ? ORDER BY created_at").all(executionId) as any[];
    return rows.map(r => this.mapResult(r));
  }

  private mapResult(r: any): TestResult {
    return {
      id: r.id,
      executionId: r.execution_id,
      testCaseId: r.test_case_id,
      status: r.status,
      duration: r.duration,
      errorMessage: r.error_message,
      screenshot: r.screenshot,
      stepScreenshots: r.step_screenshots ? JSON.parse(r.step_screenshots) : null,
      video: r.video,
      networkLogs: r.network_logs ? JSON.parse(r.network_logs) : null,
      performanceMetrics: r.performance_metrics ? JSON.parse(r.performance_metrics) : null,
      logs: r.logs ? JSON.parse(r.logs) : null,
      createdAt: new Date(r.created_at * 1000),
    };
  }

  async createResult(result: InsertTestResult): Promise<TestResult> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO test_results (id, execution_id, test_case_id, status, duration, error_message, screenshot, step_screenshots, video, network_logs, performance_metrics, logs, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, result.executionId, result.testCaseId, result.status || 'pending', result.duration || null,
      result.errorMessage || null, result.screenshot || null,
      result.stepScreenshots ? JSON.stringify(result.stepScreenshots) : null,
      result.video || null, result.networkLogs ? JSON.stringify(result.networkLogs) : null,
      result.performanceMetrics ? JSON.stringify(result.performanceMetrics) : null,
      result.logs ? JSON.stringify(result.logs) : null, now());
    const row = sqliteConnection.prepare("SELECT * FROM test_results WHERE id = ?").get(id) as any;
    return this.mapResult(row);
  }

  // ==================== GENERATED SCRIPTS ====================

  async getAllScripts(): Promise<GeneratedScript[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM generated_scripts ORDER BY created_at DESC").all() as any[];
    return rows.map(r => ({
      id: r.id,
      testCaseId: r.test_case_id,
      name: r.name,
      framework: r.framework,
      language: r.language,
      code: r.code,
      createdAt: new Date(r.created_at * 1000),
    }));
  }

  async getScript(id: string): Promise<GeneratedScript | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM generated_scripts WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      testCaseId: r.test_case_id,
      name: r.name,
      framework: r.framework,
      language: r.language,
      code: r.code,
      createdAt: new Date(r.created_at * 1000),
    };
  }

  async getScriptsByTestCase(testCaseId: string): Promise<GeneratedScript[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM generated_scripts WHERE test_case_id = ?").all(testCaseId) as any[];
    return rows.map(r => ({
      id: r.id,
      testCaseId: r.test_case_id,
      name: r.name,
      framework: r.framework,
      language: r.language,
      code: r.code,
      createdAt: new Date(r.created_at * 1000),
    }));
  }

  async createScript(script: InsertGeneratedScript): Promise<GeneratedScript> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO generated_scripts (id, test_case_id, name, framework, language, code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, script.testCaseId, script.name, script.framework, script.language || 'typescript', script.code, now());
    return this.getScript(id) as Promise<GeneratedScript>;
  }

  // ==================== TEST REPORTS ====================

  async getAllReports(): Promise<TestReport[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM test_reports ORDER BY created_at DESC").all() as any[];
    return rows.map(r => ({
      id: r.id,
      executionId: r.execution_id,
      name: r.name,
      type: r.type,
      format: r.format,
      content: r.content,
      summary: r.summary ? JSON.parse(r.summary) : null,
      createdAt: new Date(r.created_at * 1000),
    }));
  }

  async getReport(id: string): Promise<TestReport | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM test_reports WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      executionId: r.execution_id,
      name: r.name,
      type: r.type,
      format: r.format,
      content: r.content,
      summary: r.summary ? JSON.parse(r.summary) : null,
      createdAt: new Date(r.created_at * 1000),
    };
  }

  async createReport(report: InsertTestReport): Promise<TestReport> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO test_reports (id, execution_id, name, type, format, content, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, report.executionId, report.name, report.type || 'execution', report.format || 'html',
      report.content || null, report.summary ? JSON.stringify(report.summary) : null, now());
    return this.getReport(id) as Promise<TestReport>;
  }

  // ==================== REQUIREMENTS ====================

  async getAllRequirements(): Promise<Requirement[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM requirements ORDER BY created_at DESC").all() as any[];
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      priority: r.priority,
      status: r.status,
      source: r.source,
      testCoverage: r.test_coverage,
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    }));
  }

  async getRequirement(id: string): Promise<Requirement | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM requirements WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      priority: r.priority,
      status: r.status,
      source: r.source,
      testCoverage: r.test_coverage,
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    };
  }

  async createRequirement(req: InsertRequirement): Promise<Requirement> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO requirements (id, title, description, priority, status, source, test_coverage, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.title, req.description || null, req.priority || 'medium', req.status || 'active',
      req.source || null, req.testCoverage || 0, now());
    return this.getRequirement(id) as Promise<Requirement>;
  }

  async updateRequirement(id: string, req: Partial<Requirement>): Promise<Requirement | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (req.title !== undefined) { fields.push("title = ?"); vals.push(req.title); }
    if (req.description !== undefined) { fields.push("description = ?"); vals.push(req.description); }
    if (req.priority !== undefined) { fields.push("priority = ?"); vals.push(req.priority); }
    if (req.status !== undefined) { fields.push("status = ?"); vals.push(req.status); }
    if (req.source !== undefined) { fields.push("source = ?"); vals.push(req.source); }
    if (req.testCoverage !== undefined) { fields.push("test_coverage = ?"); vals.push(req.testCoverage); }
    if (fields.length === 0) return this.getRequirement(id);
    fields.push("updated_at = ?"); vals.push(now());
    vals.push(id);
    sqliteConnection.prepare(`UPDATE requirements SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getRequirement(id);
  }

  // ==================== PLATFORM SETTINGS ====================

  async getAllSettings(): Promise<PlatformSetting[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM platform_settings").all() as any[];
    return rows.map(r => ({
      id: r.id,
      category: r.category,
      key: r.key,
      value: r.value,
      description: r.description,
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    }));
  }

  async getSettingsByCategory(category: string): Promise<PlatformSetting[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM platform_settings WHERE category = ?").all(category) as any[];
    return rows.map(r => ({
      id: r.id,
      category: r.category,
      key: r.key,
      value: r.value,
      description: r.description,
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    }));
  }

  async getSetting(category: string, key: string): Promise<PlatformSetting | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM platform_settings WHERE category = ? AND key = ?").get(category, key) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      category: r.category,
      key: r.key,
      value: r.value,
      description: r.description,
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    };
  }

  async upsertSetting(setting: InsertPlatformSetting): Promise<PlatformSetting> {
    const existing = await this.getSetting(setting.category, setting.key);
    if (existing) {
      sqliteConnection.prepare(`
        UPDATE platform_settings SET value = ?, description = ?, updated_at = ? WHERE id = ?
      `).run(setting.value || null, setting.description || null, now(), existing.id);
      return this.getSetting(setting.category, setting.key) as Promise<PlatformSetting>;
    } else {
      const id = randomUUID();
      sqliteConnection.prepare(`
        INSERT INTO platform_settings (id, category, key, value, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, setting.category, setting.key, setting.value || null, setting.description || null, now());
      return this.getSetting(setting.category, setting.key) as Promise<PlatformSetting>;
    }
  }

  async deleteSetting(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM platform_settings WHERE id = ?").run(id);
  }

  // ==================== ENVIRONMENTS ====================

  async getAllEnvironments(): Promise<Environment[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM environments").all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      baseUrl: r.base_url,
      variables: r.variables ? JSON.parse(r.variables) : null,
      isDefault: r.is_default === 1,
      createdAt: new Date(r.created_at * 1000),
    }));
  }

  async getEnvironment(id: string): Promise<Environment | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM environments WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      name: r.name,
      baseUrl: r.base_url,
      variables: r.variables ? JSON.parse(r.variables) : null,
      isDefault: r.is_default === 1,
      createdAt: new Date(r.created_at * 1000),
    };
  }

  async getEnvironmentByName(name: string): Promise<Environment | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM environments WHERE name = ?").get(name) as any;
    if (!r) return undefined;
    return this.getEnvironment(r.id);
  }

  async createEnvironment(env: InsertEnvironment): Promise<Environment> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO environments (id, name, base_url, variables, is_default, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, env.name, env.baseUrl, env.variables ? JSON.stringify(env.variables) : null, env.isDefault ? 1 : 0, now());
    return this.getEnvironment(id) as Promise<Environment>;
  }

  async updateEnvironment(id: string, env: Partial<InsertEnvironment>): Promise<Environment | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (env.name !== undefined) { fields.push("name = ?"); vals.push(env.name); }
    if (env.baseUrl !== undefined) { fields.push("base_url = ?"); vals.push(env.baseUrl); }
    if (env.variables !== undefined) { fields.push("variables = ?"); vals.push(JSON.stringify(env.variables)); }
    if (env.isDefault !== undefined) { fields.push("is_default = ?"); vals.push(env.isDefault ? 1 : 0); }
    if (fields.length === 0) return this.getEnvironment(id);
    vals.push(id);
    sqliteConnection.prepare(`UPDATE environments SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getEnvironment(id);
  }

  async deleteEnvironment(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM environments WHERE id = ?").run(id);
  }

  // ==================== TEST DATA POOLS ====================

  async getAllTestDataPools(): Promise<TestDataPool[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM test_data_pools").all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      data: r.data ? JSON.parse(r.data) : null,
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    }));
  }

  async getTestDataPool(id: string): Promise<TestDataPool | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM test_data_pools WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      data: r.data ? JSON.parse(r.data) : null,
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    };
  }

  async createTestDataPool(pool: InsertTestDataPool): Promise<TestDataPool> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO test_data_pools (id, name, description, data, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, pool.name, pool.description || null, pool.data ? JSON.stringify(pool.data) : null, now());
    return this.getTestDataPool(id) as Promise<TestDataPool>;
  }

  async updateTestDataPool(id: string, pool: Partial<InsertTestDataPool>): Promise<TestDataPool | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (pool.name !== undefined) { fields.push("name = ?"); vals.push(pool.name); }
    if (pool.description !== undefined) { fields.push("description = ?"); vals.push(pool.description); }
    if (pool.data !== undefined) { fields.push("data = ?"); vals.push(JSON.stringify(pool.data)); }
    if (fields.length === 0) return this.getTestDataPool(id);
    fields.push("updated_at = ?"); vals.push(now());
    vals.push(id);
    sqliteConnection.prepare(`UPDATE test_data_pools SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getTestDataPool(id);
  }

  async deleteTestDataPool(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM test_data_pools WHERE id = ?").run(id);
  }

  // ==================== VISUAL BASELINES ====================

  async getAllVisualBaselines(): Promise<VisualBaseline[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM visual_baselines").all() as any[];
    return rows.map(r => ({
      id: r.id,
      testCaseId: r.test_case_id,
      name: r.name,
      screenshot: r.screenshot,
      viewport: r.viewport,
      createdAt: new Date(r.created_at * 1000),
    }));
  }

  async getVisualBaseline(id: string): Promise<VisualBaseline | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM visual_baselines WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      testCaseId: r.test_case_id,
      name: r.name,
      screenshot: r.screenshot,
      viewport: r.viewport,
      createdAt: new Date(r.created_at * 1000),
    };
  }

  async getVisualBaselinesByTestCase(testCaseId: string): Promise<VisualBaseline[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM visual_baselines WHERE test_case_id = ?").all(testCaseId) as any[];
    return rows.map(r => ({
      id: r.id,
      testCaseId: r.test_case_id,
      name: r.name,
      screenshot: r.screenshot,
      viewport: r.viewport,
      createdAt: new Date(r.created_at * 1000),
    }));
  }

  async createVisualBaseline(baseline: InsertVisualBaseline): Promise<VisualBaseline> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO visual_baselines (id, test_case_id, name, screenshot, viewport, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, baseline.testCaseId, baseline.name, baseline.screenshot, baseline.viewport || null, now());
    return this.getVisualBaseline(id) as Promise<VisualBaseline>;
  }

  async updateVisualBaseline(id: string, baseline: Partial<InsertVisualBaseline>): Promise<VisualBaseline | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (baseline.name !== undefined) { fields.push("name = ?"); vals.push(baseline.name); }
    if (baseline.screenshot !== undefined) { fields.push("screenshot = ?"); vals.push(baseline.screenshot); }
    if (baseline.viewport !== undefined) { fields.push("viewport = ?"); vals.push(baseline.viewport); }
    if (fields.length === 0) return this.getVisualBaseline(id);
    vals.push(id);
    sqliteConnection.prepare(`UPDATE visual_baselines SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getVisualBaseline(id);
  }

  async deleteVisualBaseline(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM visual_baselines WHERE id = ?").run(id);
  }

  // ==================== VISUAL COMPARISONS ====================

  async getVisualComparisonsByExecution(executionId: string): Promise<VisualComparison[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM visual_comparisons WHERE execution_id = ?").all(executionId) as any[];
    return rows.map(r => ({
      id: r.id,
      baselineId: r.baseline_id,
      executionId: r.execution_id,
      screenshot: r.screenshot,
      diffImage: r.diff_image,
      matchPercentage: r.match_percentage,
      status: r.status,
      createdAt: new Date(r.created_at * 1000),
    }));
  }

  async createVisualComparison(comparison: InsertVisualComparison): Promise<VisualComparison> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO visual_comparisons (id, baseline_id, execution_id, screenshot, diff_image, match_percentage, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, comparison.baselineId, comparison.executionId, comparison.screenshot,
      comparison.diffImage || null, comparison.matchPercentage || null, comparison.status || 'pending', now());
    const r = sqliteConnection.prepare("SELECT * FROM visual_comparisons WHERE id = ?").get(id) as any;
    return {
      id: r.id,
      baselineId: r.baseline_id,
      executionId: r.execution_id,
      screenshot: r.screenshot,
      diffImage: r.diff_image,
      matchPercentage: r.match_percentage,
      status: r.status,
      createdAt: new Date(r.created_at * 1000),
    };
  }

  // ==================== PERFORMANCE METRICS ====================

  async getPerformanceMetricsByExecution(executionId: string): Promise<PerformanceMetric[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM performance_metrics WHERE execution_id = ?").all(executionId) as any[];
    return rows.map(r => ({
      id: r.id,
      executionId: r.execution_id,
      url: r.url,
      loadTime: r.load_time,
      ttfb: r.ttfb,
      fcp: r.fcp,
      lcp: r.lcp,
      cls: r.cls,
      fid: r.fid,
      createdAt: new Date(r.created_at * 1000),
    }));
  }

  async createPerformanceMetric(metric: InsertPerformanceMetric): Promise<PerformanceMetric> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO performance_metrics (id, execution_id, url, load_time, ttfb, fcp, lcp, cls, fid, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, metric.executionId, metric.url, metric.loadTime || null, metric.ttfb || null,
      metric.fcp || null, metric.lcp || null, metric.cls || null, metric.fid || null, now());
    const r = sqliteConnection.prepare("SELECT * FROM performance_metrics WHERE id = ?").get(id) as any;
    return {
      id: r.id,
      executionId: r.execution_id,
      url: r.url,
      loadTime: r.load_time,
      ttfb: r.ttfb,
      fcp: r.fcp,
      lcp: r.lcp,
      cls: r.cls,
      fid: r.fid,
      createdAt: new Date(r.created_at * 1000),
    };
  }

  // ==================== API MOCKS ====================

  async getAllApiMocks(): Promise<ApiMock[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM api_mocks").all() as any[];
    return rows.map(r => this.mapApiMock(r));
  }

  async getApiMock(id: string): Promise<ApiMock | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM api_mocks WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return this.mapApiMock(r);
  }

  async getActiveApiMocks(): Promise<ApiMock[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM api_mocks WHERE is_active = 1").all() as any[];
    return rows.map(r => this.mapApiMock(r));
  }

  private mapApiMock(r: any): ApiMock {
    return {
      id: r.id,
      name: r.name,
      method: r.method,
      urlPattern: r.url_pattern,
      responseStatus: r.response_status,
      responseBody: r.response_body,
      responseHeaders: r.response_headers ? JSON.parse(r.response_headers) : null,
      isActive: r.is_active === 1,
      createdAt: new Date(r.created_at * 1000),
    };
  }

  async createApiMock(mock: InsertApiMock): Promise<ApiMock> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO api_mocks (id, name, method, url_pattern, response_status, response_body, response_headers, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, mock.name, mock.method || 'GET', mock.urlPattern, mock.responseStatus || 200,
      mock.responseBody || null, mock.responseHeaders ? JSON.stringify(mock.responseHeaders) : null,
      mock.isActive !== false ? 1 : 0, now());
    return this.getApiMock(id) as Promise<ApiMock>;
  }

  async updateApiMock(id: string, mock: Partial<InsertApiMock>): Promise<ApiMock | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (mock.name !== undefined) { fields.push("name = ?"); vals.push(mock.name); }
    if (mock.method !== undefined) { fields.push("method = ?"); vals.push(mock.method); }
    if (mock.urlPattern !== undefined) { fields.push("url_pattern = ?"); vals.push(mock.urlPattern); }
    if (mock.responseStatus !== undefined) { fields.push("response_status = ?"); vals.push(mock.responseStatus); }
    if (mock.responseBody !== undefined) { fields.push("response_body = ?"); vals.push(mock.responseBody); }
    if (mock.responseHeaders !== undefined) { fields.push("response_headers = ?"); vals.push(JSON.stringify(mock.responseHeaders)); }
    if (mock.isActive !== undefined) { fields.push("is_active = ?"); vals.push(mock.isActive ? 1 : 0); }
    if (fields.length === 0) return this.getApiMock(id);
    vals.push(id);
    sqliteConnection.prepare(`UPDATE api_mocks SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getApiMock(id);
  }

  async deleteApiMock(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM api_mocks WHERE id = ?").run(id);
  }

  // ==================== CI/CD WEBHOOKS ====================

  async getAllCicdWebhooks(): Promise<CicdWebhook[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM cicd_webhooks").all() as any[];
    return rows.map(r => this.mapWebhook(r));
  }

  async getCicdWebhook(id: string): Promise<CicdWebhook | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM cicd_webhooks WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return this.mapWebhook(r);
  }

  private mapWebhook(r: any): CicdWebhook {
    return {
      id: r.id,
      name: r.name,
      provider: r.provider,
      suiteId: r.suite_id,
      secret: r.secret,
      isActive: r.is_active === 1,
      lastTriggered: toDate(r.last_triggered),
      createdAt: new Date(r.created_at * 1000),
    };
  }

  async createCicdWebhook(webhook: InsertCicdWebhook): Promise<CicdWebhook> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO cicd_webhooks (id, name, provider, suite_id, secret, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, webhook.name, webhook.provider || 'github', webhook.suiteId || null,
      webhook.secret || null, webhook.isActive !== false ? 1 : 0, now());
    return this.getCicdWebhook(id) as Promise<CicdWebhook>;
  }

  async updateCicdWebhook(id: string, webhook: Partial<CicdWebhook>): Promise<CicdWebhook | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (webhook.name !== undefined) { fields.push("name = ?"); vals.push(webhook.name); }
    if (webhook.provider !== undefined) { fields.push("provider = ?"); vals.push(webhook.provider); }
    if (webhook.suiteId !== undefined) { fields.push("suite_id = ?"); vals.push(webhook.suiteId); }
    if (webhook.secret !== undefined) { fields.push("secret = ?"); vals.push(webhook.secret); }
    if (webhook.isActive !== undefined) { fields.push("is_active = ?"); vals.push(webhook.isActive ? 1 : 0); }
    if (webhook.lastTriggered !== undefined) { fields.push("last_triggered = ?"); vals.push(webhook.lastTriggered ? Math.floor(webhook.lastTriggered.getTime() / 1000) : null); }
    if (fields.length === 0) return this.getCicdWebhook(id);
    vals.push(id);
    sqliteConnection.prepare(`UPDATE cicd_webhooks SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getCicdWebhook(id);
  }

  async deleteCicdWebhook(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM cicd_webhooks WHERE id = ?").run(id);
  }

  // ==================== ROLES ====================

  async getAllRoles(): Promise<Role[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM roles ORDER BY name").all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions ? JSON.parse(r.permissions) : null,
      createdAt: new Date(r.created_at * 1000),
    }));
  }

  async getRole(id: string): Promise<Role | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM roles WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions ? JSON.parse(r.permissions) : null,
      createdAt: new Date(r.created_at * 1000),
    };
  }

  async getRoleByName(name: string): Promise<Role | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM roles WHERE name = ?").get(name) as any;
    if (!r) return undefined;
    return this.getRole(r.id);
  }

  async createRole(role: InsertRole): Promise<Role> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO roles (id, name, description, permissions, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, role.name, role.description || null, role.permissions ? JSON.stringify(role.permissions) : null, now());
    return this.getRole(id) as Promise<Role>;
  }

  async updateRole(id: string, role: Partial<InsertRole>): Promise<Role | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (role.name !== undefined) { fields.push("name = ?"); vals.push(role.name); }
    if (role.description !== undefined) { fields.push("description = ?"); vals.push(role.description); }
    if (role.permissions !== undefined) { fields.push("permissions = ?"); vals.push(JSON.stringify(role.permissions)); }
    if (fields.length === 0) return this.getRole(id);
    vals.push(id);
    sqliteConnection.prepare(`UPDATE roles SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getRole(id);
  }

  async deleteRole(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM roles WHERE id = ?").run(id);
  }

  // ==================== USER ROLES ====================

  async getUserRoles(userId: string): Promise<UserRole[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM user_roles WHERE user_id = ?").all(userId) as any[];
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      roleId: r.role_id,
      assignedAt: new Date(r.assigned_at * 1000),
    }));
  }

  async assignUserRole(userRole: InsertUserRole): Promise<UserRole> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO user_roles (id, user_id, role_id, assigned_at)
      VALUES (?, ?, ?, ?)
    `).run(id, userRole.userId, userRole.roleId, now());
    const r = sqliteConnection.prepare("SELECT * FROM user_roles WHERE id = ?").get(id) as any;
    return {
      id: r.id,
      userId: r.user_id,
      roleId: r.role_id,
      assignedAt: new Date(r.assigned_at * 1000),
    };
  }

  async removeUserRole(userId: string, roleId: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM user_roles WHERE user_id = ? AND role_id = ?").run(userId, roleId);
  }

  // ==================== MOBILE DEVICES ====================

  async getAllMobileDevices(): Promise<MobileDevice[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM mobile_devices").all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      platform: r.platform,
      version: r.version,
      udid: r.udid,
      status: r.status,
      capabilities: r.capabilities ? JSON.parse(r.capabilities) : null,
      createdAt: new Date(r.created_at * 1000),
    }));
  }

  async getMobileDevice(id: string): Promise<MobileDevice | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM mobile_devices WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      name: r.name,
      platform: r.platform,
      version: r.version,
      udid: r.udid,
      status: r.status,
      capabilities: r.capabilities ? JSON.parse(r.capabilities) : null,
      createdAt: new Date(r.created_at * 1000),
    };
  }

  async createMobileDevice(device: InsertMobileDevice): Promise<MobileDevice> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO mobile_devices (id, name, platform, version, udid, status, capabilities, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, device.name, device.platform, device.version || null, device.udid || null,
      device.status || 'available', device.capabilities ? JSON.stringify(device.capabilities) : null, now());
    return this.getMobileDevice(id) as Promise<MobileDevice>;
  }

  async updateMobileDevice(id: string, device: Partial<InsertMobileDevice>): Promise<MobileDevice | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (device.name !== undefined) { fields.push("name = ?"); vals.push(device.name); }
    if (device.platform !== undefined) { fields.push("platform = ?"); vals.push(device.platform); }
    if (device.version !== undefined) { fields.push("version = ?"); vals.push(device.version); }
    if (device.udid !== undefined) { fields.push("udid = ?"); vals.push(device.udid); }
    if (device.status !== undefined) { fields.push("status = ?"); vals.push(device.status); }
    if (device.capabilities !== undefined) { fields.push("capabilities = ?"); vals.push(JSON.stringify(device.capabilities)); }
    if (fields.length === 0) return this.getMobileDevice(id);
    vals.push(id);
    sqliteConnection.prepare(`UPDATE mobile_devices SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getMobileDevice(id);
  }

  async deleteMobileDevice(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM mobile_devices WHERE id = ?").run(id);
  }

  // ==================== PROJECTS ====================

    async getAllProjects(): Promise<Project[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as any[];
    return rows.map(r => ({
      id: r.id, name: r.name, description: r.description,
      slug: r.slug, ownerId: r.owner_id, isActive: r.is_active === 1,
      settings: r.settings ? JSON.parse(r.settings) : null,
      createdAt: new Date(r.created_at * 1000), updatedAt: toDate(r.updated_at),
    }));
  }

    async getProject(id: string): Promise<Project | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      slug: r.slug,
      ownerId: r.owner_id,
      isActive: r.is_active === 1,
      settings: r.settings ? JSON.parse(r.settings) : null,
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    };
  }

  async getProjectsForUser(userId: string): Promise<Project[]> {
    // Projects where user is owner or team member
    const rows = sqliteConnection.prepare(`
      SELECT DISTINCT p.* FROM projects p
      LEFT JOIN team_memberships tm ON p.id = tm.project_id
      WHERE p.owner_id = ? OR tm.user_id = ?
      ORDER BY p.created_at DESC
    `).all(userId, userId) as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      ownerId: r.owner_id,
      isActive: r.is_active === 1,
      createdAt: new Date(r.created_at * 1000),
      updatedAt: toDate(r.updated_at),
    }));
  }

    async createProject(project: InsertProject): Promise<Project> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO projects (id, name, description, slug, owner_id, settings, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(id, project.name, project.description || null, (project as any).slug || null,
      project.ownerId || null, (project as any).settings ? JSON.stringify((project as any).settings) : null, now());
    return this.getProject(id) as Promise<Project>;
  }

  async updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (project.name !== undefined) { fields.push("name = ?"); vals.push(project.name); }
    if (project.description !== undefined) { fields.push("description = ?"); vals.push(project.description); }
    if (project.ownerId !== undefined) { fields.push("owner_id = ?"); vals.push(project.ownerId); }
    if ((project as any).isActive !== undefined) { fields.push("is_active = ?"); vals.push((project as any).isActive ? 1 : 0); }
    if (fields.length === 0) return this.getProject(id);
    fields.push("updated_at = ?"); vals.push(now());
    vals.push(id);
    sqliteConnection.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.getProject(id);
  }

  async deleteProject(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  // ==================== TEAM MEMBERSHIPS ====================

  async getProjectMembers(projectId: string): Promise<TeamMembership[]> {
    const rows = sqliteConnection.prepare("SELECT * FROM team_memberships WHERE project_id = ?").all(projectId) as any[];
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      projectId: r.project_id,
      roleId: r.role_id,
      isOwner: r.is_owner === 1,
      joinedAt: new Date(r.joined_at * 1000),
    }));
  }

  async getUserProjectMembership(userId: string, projectId: string): Promise<TeamMembership | undefined> {
    const r = sqliteConnection.prepare("SELECT * FROM team_memberships WHERE user_id = ? AND project_id = ?").get(userId, projectId) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      userId: r.user_id,
      projectId: r.project_id,
      roleId: r.role_id,
      isOwner: r.is_owner === 1,
      joinedAt: new Date(r.joined_at * 1000),
    };
  }

  async createTeamMembership(membership: InsertTeamMembership): Promise<TeamMembership> {
    const id = randomUUID();
    sqliteConnection.prepare(`
      INSERT INTO team_memberships (id, user_id, project_id, role_id, is_owner, joined_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, membership.userId, membership.projectId, membership.roleId || null, membership.isOwner ? 1 : 0, now());
    const r = sqliteConnection.prepare("SELECT * FROM team_memberships WHERE id = ?").get(id) as any;
    return {
      id: r.id,
      userId: r.user_id,
      projectId: r.project_id,
      roleId: r.role_id,
      isOwner: r.is_owner === 1,
      joinedAt: new Date(r.joined_at * 1000),
    };
  }

  async updateTeamMembership(id: string, membership: Partial<InsertTeamMembership>): Promise<TeamMembership | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    if (membership.roleId !== undefined) { fields.push("role_id = ?"); vals.push(membership.roleId); }
    if (membership.isOwner !== undefined) { fields.push("is_owner = ?"); vals.push(membership.isOwner ? 1 : 0); }
    if (fields.length === 0) {
      const r = sqliteConnection.prepare("SELECT * FROM team_memberships WHERE id = ?").get(id) as any;
      if (!r) return undefined;
      return {
        id: r.id,
        userId: r.user_id,
        projectId: r.project_id,
        roleId: r.role_id,
        isOwner: r.is_owner === 1,
        joinedAt: new Date(r.joined_at * 1000),
      };
    }
    vals.push(id);
    sqliteConnection.prepare(`UPDATE team_memberships SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    const r = sqliteConnection.prepare("SELECT * FROM team_memberships WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      userId: r.user_id,
      projectId: r.project_id,
      roleId: r.role_id,
      isOwner: r.is_owner === 1,
      joinedAt: new Date(r.joined_at * 1000),
    };
  }

  async deleteTeamMembership(id: string): Promise<void> {
    sqliteConnection.prepare("DELETE FROM team_memberships WHERE id = ?").run(id);
  }
}

// Export singleton instance
export const sqliteStorage = new SQLiteStorage();
