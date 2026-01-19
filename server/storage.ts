import { randomUUID } from "crypto";
import type {
  User,
  InsertUser,
  TestSuite,
  InsertTestSuite,
  TestCase,
  InsertTestCase,
  TestAgent,
  InsertTestAgent,
  TestExecution,
  InsertTestExecution,
  TestResult,
  InsertTestResult,
  GeneratedScript,
  InsertGeneratedScript,
  TestReport,
  InsertTestReport,
  Requirement,
  InsertRequirement,
  PlatformSetting,
  InsertPlatformSetting,
  Environment,
  InsertEnvironment,
  TestDataPool,
  InsertTestDataPool,
  VisualBaseline,
  InsertVisualBaseline,
  VisualComparison,
  InsertVisualComparison,
  PerformanceMetric,
  InsertPerformanceMetric,
  ApiMock,
  InsertApiMock,
  CicdWebhook,
  InsertCicdWebhook,
  Role,
  InsertRole,
  UserRole,
  InsertUserRole,
  MobileDevice,
  InsertMobileDevice,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Test Suites
  getAllTestSuites(): Promise<TestSuite[]>;
  getTestSuite(id: string): Promise<TestSuite | undefined>;
  createTestSuite(suite: InsertTestSuite): Promise<TestSuite>;
  updateTestSuite(id: string, suite: Partial<InsertTestSuite>): Promise<TestSuite | undefined>;
  deleteTestSuite(id: string): Promise<void>;

  // Test Cases
  getAllTestCases(): Promise<TestCase[]>;
  getTestCasesBySuite(suiteId: string): Promise<TestCase[]>;
  getTestCase(id: string): Promise<TestCase | undefined>;
  createTestCase(testCase: InsertTestCase): Promise<TestCase>;
  updateTestCase(id: string, testCase: Partial<InsertTestCase>): Promise<TestCase | undefined>;
  deleteTestCase(id: string): Promise<void>;

  // Test Agents
  getAllAgents(): Promise<TestAgent[]>;
  getAgent(id: string): Promise<TestAgent | undefined>;
  createAgent(agent: InsertTestAgent): Promise<TestAgent>;
  updateAgent(id: string, agent: Partial<InsertTestAgent>): Promise<TestAgent | undefined>;
  deleteAgent(id: string): Promise<void>;

  // Test Executions
  getAllExecutions(): Promise<TestExecution[]>;
  getExecution(id: string): Promise<TestExecution | undefined>;
  createExecution(execution: InsertTestExecution): Promise<TestExecution>;
  updateExecution(id: string, execution: Partial<TestExecution>): Promise<TestExecution | undefined>;

  // Test Results
  getResultsByExecution(executionId: string): Promise<TestResult[]>;
  createResult(result: InsertTestResult): Promise<TestResult>;

  // Generated Scripts
  getAllScripts(): Promise<GeneratedScript[]>;
  getScript(id: string): Promise<GeneratedScript | undefined>;
  getScriptsByTestCase(testCaseId: string): Promise<GeneratedScript[]>;
  createScript(script: InsertGeneratedScript): Promise<GeneratedScript>;

  // Test Reports
  getAllReports(): Promise<TestReport[]>;
  getReport(id: string): Promise<TestReport | undefined>;
  createReport(report: InsertTestReport): Promise<TestReport>;

  // Requirements
  getAllRequirements(): Promise<Requirement[]>;
  getRequirement(id: string): Promise<Requirement | undefined>;
  createRequirement(requirement: InsertRequirement): Promise<Requirement>;
  updateRequirement(id: string, requirement: Partial<Requirement>): Promise<Requirement | undefined>;

  // Platform Settings
  getAllSettings(): Promise<PlatformSetting[]>;
  getSettingsByCategory(category: string): Promise<PlatformSetting[]>;
  getSetting(category: string, key: string): Promise<PlatformSetting | undefined>;
  upsertSetting(setting: InsertPlatformSetting): Promise<PlatformSetting>;
  deleteSetting(id: string): Promise<void>;

  // Environments
  getAllEnvironments(): Promise<Environment[]>;
  getEnvironment(id: string): Promise<Environment | undefined>;
  getEnvironmentByName(name: string): Promise<Environment | undefined>;
  createEnvironment(env: InsertEnvironment): Promise<Environment>;
  updateEnvironment(id: string, env: Partial<InsertEnvironment>): Promise<Environment | undefined>;
  deleteEnvironment(id: string): Promise<void>;

  // Test Data Pools
  getAllTestDataPools(): Promise<TestDataPool[]>;
  getTestDataPool(id: string): Promise<TestDataPool | undefined>;
  createTestDataPool(pool: InsertTestDataPool): Promise<TestDataPool>;
  updateTestDataPool(id: string, pool: Partial<InsertTestDataPool>): Promise<TestDataPool | undefined>;
  deleteTestDataPool(id: string): Promise<void>;

  // Visual Baselines
  getAllVisualBaselines(): Promise<VisualBaseline[]>;
  getVisualBaseline(id: string): Promise<VisualBaseline | undefined>;
  getVisualBaselinesByTestCase(testCaseId: string): Promise<VisualBaseline[]>;
  createVisualBaseline(baseline: InsertVisualBaseline): Promise<VisualBaseline>;
  updateVisualBaseline(id: string, baseline: Partial<InsertVisualBaseline>): Promise<VisualBaseline | undefined>;
  deleteVisualBaseline(id: string): Promise<void>;

  // Visual Comparisons
  getVisualComparisonsByExecution(executionId: string): Promise<VisualComparison[]>;
  createVisualComparison(comparison: InsertVisualComparison): Promise<VisualComparison>;

  // Performance Metrics
  getPerformanceMetricsByExecution(executionId: string): Promise<PerformanceMetric[]>;
  createPerformanceMetric(metric: InsertPerformanceMetric): Promise<PerformanceMetric>;

  // API Mocks
  getAllApiMocks(): Promise<ApiMock[]>;
  getApiMock(id: string): Promise<ApiMock | undefined>;
  getActiveApiMocks(): Promise<ApiMock[]>;
  createApiMock(mock: InsertApiMock): Promise<ApiMock>;
  updateApiMock(id: string, mock: Partial<InsertApiMock>): Promise<ApiMock | undefined>;
  deleteApiMock(id: string): Promise<void>;

  // CI/CD Webhooks
  getAllCicdWebhooks(): Promise<CicdWebhook[]>;
  getCicdWebhook(id: string): Promise<CicdWebhook | undefined>;
  createCicdWebhook(webhook: InsertCicdWebhook): Promise<CicdWebhook>;
  updateCicdWebhook(id: string, webhook: Partial<CicdWebhook>): Promise<CicdWebhook | undefined>;
  deleteCicdWebhook(id: string): Promise<void>;

  // Roles (RBAC)
  getAllRoles(): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  getRoleByName(name: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(id: string, role: Partial<InsertRole>): Promise<Role | undefined>;
  deleteRole(id: string): Promise<void>;

  // User Roles
  getUserRoles(userId: string): Promise<UserRole[]>;
  assignUserRole(userRole: InsertUserRole): Promise<UserRole>;
  removeUserRole(userId: string, roleId: string): Promise<void>;

  // Mobile Devices
  getAllMobileDevices(): Promise<MobileDevice[]>;
  getMobileDevice(id: string): Promise<MobileDevice | undefined>;
  createMobileDevice(device: InsertMobileDevice): Promise<MobileDevice>;
  updateMobileDevice(id: string, device: Partial<InsertMobileDevice>): Promise<MobileDevice | undefined>;
  deleteMobileDevice(id: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private testSuites: Map<string, TestSuite> = new Map();
  private testCases: Map<string, TestCase> = new Map();
  private agents: Map<string, TestAgent> = new Map();
  private executions: Map<string, TestExecution> = new Map();
  private results: Map<string, TestResult> = new Map();
  private scripts: Map<string, GeneratedScript> = new Map();
  private reports: Map<string, TestReport> = new Map();
  private requirements: Map<string, Requirement> = new Map();
  private settings: Map<string, PlatformSetting> = new Map();
  private environments: Map<string, Environment> = new Map();
  private testDataPools: Map<string, TestDataPool> = new Map();
  private visualBaselines: Map<string, VisualBaseline> = new Map();
  private visualComparisons: Map<string, VisualComparison> = new Map();
  private performanceMetrics: Map<string, PerformanceMetric> = new Map();
  private apiMocks: Map<string, ApiMock> = new Map();
  private cicdWebhooks: Map<string, CicdWebhook> = new Map();
  private roles: Map<string, Role> = new Map();
  private userRoles: Map<string, UserRole> = new Map();
  private mobileDevices: Map<string, MobileDevice> = new Map();

  constructor() {
    // Seed with sample agents for demo
    this.seedData();
  }

  private seedData() {
    const now = new Date();

    // Sample agents
    const agent1: TestAgent = {
      id: randomUUID(),
      name: "Chrome Browser Agent",
      description: "Headless Chrome for UI testing",
      type: "browser",
      status: "online",
      capabilities: ["screenshot", "video", "network-logging"],
      isAutonomous: false,
      targetUrl: null,
      suiteId: null,
      scheduleInterval: null,
      maxRetries: 3,
      selfHealingEnabled: true,
      notifyOnFailure: true,
      lastRunAt: null,
      nextRunAt: null,
      lastHeartbeat: now,
      createdAt: now,
    };
    const agent2: TestAgent = {
      id: randomUUID(),
      name: "API Test Agent",
      description: "REST/GraphQL API testing agent",
      type: "api",
      status: "online",
      capabilities: ["performance-metrics", "network-logging"],
      isAutonomous: false,
      targetUrl: null,
      suiteId: null,
      scheduleInterval: null,
      maxRetries: 3,
      selfHealingEnabled: true,
      notifyOnFailure: true,
      lastRunAt: null,
      nextRunAt: null,
      lastHeartbeat: now,
      createdAt: now,
    };
    const agent3: TestAgent = {
      id: randomUUID(),
      name: "Mobile Agent",
      description: "iOS/Android app testing",
      type: "mobile",
      status: "offline",
      capabilities: ["screenshot", "video"],
      isAutonomous: false,
      targetUrl: null,
      suiteId: null,
      scheduleInterval: null,
      maxRetries: 3,
      selfHealingEnabled: true,
      notifyOnFailure: true,
      lastRunAt: null,
      nextRunAt: null,
      lastHeartbeat: null,
      createdAt: now,
    };
    this.agents.set(agent1.id, agent1);
    this.agents.set(agent2.id, agent2);
    this.agents.set(agent3.id, agent3);

    // Sample test suite
    const suite1: TestSuite = {
      id: randomUUID(),
      name: "Authentication Tests",
      description: "User login, registration, and session management tests",
      tags: ["auth", "security"],
      createdAt: now,
      updatedAt: now,
    };
    this.testSuites.set(suite1.id, suite1);

    // Sample test cases
    const tc1: TestCase = {
      id: randomUUID(),
      suiteId: suite1.id,
      title: "User can log in with valid credentials",
      description: "Verify that users can log in with correct email and password",
      preconditions: "User account exists in the system",
      targetUrl: null,
      steps: [
        { step: "Navigate to login page", expected: "Login form is displayed" },
        { step: "Enter valid email", expected: "Email field accepts input" },
        { step: "Enter valid password", expected: "Password field accepts input" },
        { step: "Click submit button", expected: "User is redirected to dashboard" },
      ],
      priority: "high",
      status: "active",
      tags: ["login", "smoke"],
      generatedByAI: true,
      createdAt: now,
      updatedAt: now,
    };
    const tc2: TestCase = {
      id: randomUUID(),
      suiteId: suite1.id,
      title: "Error message shown for invalid credentials",
      description: "Verify error handling for incorrect login attempts",
      preconditions: null,
      targetUrl: null,
      steps: [
        { step: "Navigate to login page", expected: "Login form is displayed" },
        { step: "Enter invalid email", expected: "Email field accepts input" },
        { step: "Enter any password", expected: "Password field accepts input" },
        { step: "Click submit button", expected: "Error message is displayed" },
      ],
      priority: "medium",
      status: "active",
      tags: ["login", "error-handling"],
      generatedByAI: true,
      createdAt: now,
      updatedAt: now,
    };
    this.testCases.set(tc1.id, tc1);
    this.testCases.set(tc2.id, tc2);
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Test Suites
  async getAllTestSuites(): Promise<TestSuite[]> {
    return Array.from(this.testSuites.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getTestSuite(id: string): Promise<TestSuite | undefined> {
    return this.testSuites.get(id);
  }

  async createTestSuite(suite: InsertTestSuite): Promise<TestSuite> {
    const id = randomUUID();
    const now = new Date();
    const testSuite: TestSuite = {
      id,
      name: suite.name,
      description: suite.description || null,
      tags: suite.tags || null,
      createdAt: now,
      updatedAt: now,
    };
    this.testSuites.set(id, testSuite);
    return testSuite;
  }

  async updateTestSuite(id: string, suite: Partial<InsertTestSuite>): Promise<TestSuite | undefined> {
    const existing = this.testSuites.get(id);
    if (!existing) return undefined;
    const updated: TestSuite = { ...existing, ...suite, updatedAt: new Date() };
    this.testSuites.set(id, updated);
    return updated;
  }

  async deleteTestSuite(id: string): Promise<void> {
    this.testSuites.delete(id);
    // Also delete associated test cases
    for (const [tcId, tc] of this.testCases) {
      if (tc.suiteId === id) {
        this.testCases.delete(tcId);
      }
    }
  }

  // Test Cases
  async getAllTestCases(): Promise<TestCase[]> {
    return Array.from(this.testCases.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getTestCasesBySuite(suiteId: string): Promise<TestCase[]> {
    return Array.from(this.testCases.values()).filter((tc) => tc.suiteId === suiteId);
  }

  async getTestCase(id: string): Promise<TestCase | undefined> {
    return this.testCases.get(id);
  }

  async createTestCase(testCase: InsertTestCase): Promise<TestCase> {
    const id = randomUUID();
    const now = new Date();
    const tc: TestCase = {
      id,
      suiteId: testCase.suiteId || null,
      title: testCase.title,
      description: testCase.description || null,
      preconditions: testCase.preconditions || null,
      targetUrl: testCase.targetUrl || null,
      steps: testCase.steps || null,
      priority: testCase.priority || "medium",
      status: testCase.status || "active",
      tags: testCase.tags || null,
      generatedByAI: testCase.generatedByAI || false,
      createdAt: now,
      updatedAt: now,
    };
    this.testCases.set(id, tc);
    return tc;
  }

  async updateTestCase(id: string, testCase: Partial<InsertTestCase>): Promise<TestCase | undefined> {
    const existing = this.testCases.get(id);
    if (!existing) return undefined;
    const updated: TestCase = { ...existing, ...testCase, updatedAt: new Date() };
    this.testCases.set(id, updated);
    return updated;
  }

  async deleteTestCase(id: string): Promise<void> {
    this.testCases.delete(id);
  }

  // Agents
  async getAllAgents(): Promise<TestAgent[]> {
    return Array.from(this.agents.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getAgent(id: string): Promise<TestAgent | undefined> {
    return this.agents.get(id);
  }

  async createAgent(agent: InsertTestAgent): Promise<TestAgent> {
    const id = randomUUID();
    const now = new Date();
    const testAgent: TestAgent = {
      id,
      name: agent.name,
      description: agent.description || null,
      type: agent.type,
      status: agent.status || "offline",
      capabilities: agent.capabilities || null,
      isAutonomous: agent.isAutonomous || false,
      targetUrl: agent.targetUrl || null,
      suiteId: agent.suiteId || null,
      scheduleInterval: agent.scheduleInterval || null,
      maxRetries: agent.maxRetries ?? 3,
      selfHealingEnabled: agent.selfHealingEnabled ?? true,
      notifyOnFailure: agent.notifyOnFailure ?? true,
      lastRunAt: null,
      nextRunAt: null,
      lastHeartbeat: null,
      createdAt: now,
    };
    this.agents.set(id, testAgent);
    return testAgent;
  }

  async updateAgent(id: string, agent: Partial<TestAgent>): Promise<TestAgent | undefined> {
    const existing = this.agents.get(id);
    if (!existing) return undefined;
    const updated: TestAgent = { ...existing, ...agent };
    this.agents.set(id, updated);
    return updated;
  }

  async deleteAgent(id: string): Promise<void> {
    this.agents.delete(id);
  }

  // Executions
  async getAllExecutions(): Promise<TestExecution[]> {
    return Array.from(this.executions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getExecution(id: string): Promise<TestExecution | undefined> {
    return this.executions.get(id);
  }

  async createExecution(execution: InsertTestExecution): Promise<TestExecution> {
    const id = randomUUID();
    const now = new Date();
    const exec: TestExecution = {
      id,
      suiteId: execution.suiteId || null,
      agentId: execution.agentId || null,
      targetUrl: execution.targetUrl || null,
      framework: execution.framework || "playwright",
      testData: execution.testData || null,
      status: execution.status || "pending",
      environment: execution.environment || "staging",
      totalTests: execution.totalTests || 0,
      passedTests: execution.passedTests || 0,
      failedTests: execution.failedTests || 0,
      skippedTests: execution.skippedTests || 0,
      duration: execution.duration || null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
    };
    this.executions.set(id, exec);
    return exec;
  }

  async updateExecution(id: string, execution: Partial<TestExecution>): Promise<TestExecution | undefined> {
    const existing = this.executions.get(id);
    if (!existing) return undefined;
    const updated: TestExecution = { ...existing, ...execution };
    this.executions.set(id, updated);
    return updated;
  }

  // Results
  async getResultsByExecution(executionId: string): Promise<TestResult[]> {
    return Array.from(this.results.values()).filter((r) => r.executionId === executionId);
  }

  async createResult(result: InsertTestResult): Promise<TestResult> {
    const id = randomUUID();
    const now = new Date();
    const res: TestResult = {
      id,
      executionId: result.executionId || null,
      testCaseId: result.testCaseId || null,
      status: result.status || "pending",
      duration: result.duration || null,
      errorMessage: result.errorMessage || null,
      screenshot: result.screenshot || null,
      logs: result.logs || null,
      createdAt: now,
    };
    this.results.set(id, res);
    return res;
  }

  // Scripts
  async getAllScripts(): Promise<GeneratedScript[]> {
    return Array.from(this.scripts.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getScript(id: string): Promise<GeneratedScript | undefined> {
    return this.scripts.get(id);
  }

  async getScriptsByTestCase(testCaseId: string): Promise<GeneratedScript[]> {
    return Array.from(this.scripts.values()).filter((s) => s.testCaseId === testCaseId);
  }

  async createScript(script: InsertGeneratedScript): Promise<GeneratedScript> {
    const id = randomUUID();
    const now = new Date();
    const gen: GeneratedScript = {
      id,
      testCaseId: script.testCaseId || null,
      name: script.name,
      framework: script.framework,
      language: script.language,
      code: script.code,
      version: 1,
      createdAt: now,
    };
    this.scripts.set(id, gen);
    return gen;
  }

  // Reports
  async getAllReports(): Promise<TestReport[]> {
    return Array.from(this.reports.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getReport(id: string): Promise<TestReport | undefined> {
    return this.reports.get(id);
  }

  async createReport(report: InsertTestReport): Promise<TestReport> {
    const id = randomUUID();
    const now = new Date();
    const rep: TestReport = {
      id,
      executionId: report.executionId || null,
      name: report.name,
      summary: report.summary || null,
      passRate: report.passRate || null,
      totalDuration: report.totalDuration || null,
      insights: report.insights || null,
      createdAt: now,
    };
    this.reports.set(id, rep);
    return rep;
  }

  // Requirements
  async getAllRequirements(): Promise<Requirement[]> {
    return Array.from(this.requirements.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getRequirement(id: string): Promise<Requirement | undefined> {
    return this.requirements.get(id);
  }

  async createRequirement(requirement: InsertRequirement): Promise<Requirement> {
    const id = randomUUID();
    const now = new Date();
    const req: Requirement = {
      id,
      title: requirement.title,
      description: requirement.description,
      acceptanceCriteria: requirement.acceptanceCriteria || null,
      status: requirement.status || "pending",
      generatedTestCount: 0,
      createdAt: now,
    };
    this.requirements.set(id, req);
    return req;
  }

  async updateRequirement(id: string, requirement: Partial<Requirement>): Promise<Requirement | undefined> {
    const existing = this.requirements.get(id);
    if (!existing) return undefined;
    const updated: Requirement = { ...existing, ...requirement };
    this.requirements.set(id, updated);
    return updated;
  }

  // Platform Settings
  async getAllSettings(): Promise<PlatformSetting[]> {
    return Array.from(this.settings.values());
  }

  async getSettingsByCategory(category: string): Promise<PlatformSetting[]> {
    return Array.from(this.settings.values()).filter(s => s.category === category);
  }

  async getSetting(category: string, key: string): Promise<PlatformSetting | undefined> {
    return Array.from(this.settings.values()).find(s => s.category === category && s.key === key);
  }

  async upsertSetting(setting: InsertPlatformSetting): Promise<PlatformSetting> {
    const existing = await this.getSetting(setting.category, setting.key);
    const now = new Date();
    if (existing) {
      const updated: PlatformSetting = { ...existing, ...setting, updatedAt: now };
      this.settings.set(existing.id, updated);
      return updated;
    }
    const id = randomUUID();
    const newSetting: PlatformSetting = {
      id,
      category: setting.category,
      key: setting.key,
      value: setting.value || null,
      valueJson: setting.valueJson || null,
      description: setting.description || null,
      updatedAt: now,
    };
    this.settings.set(id, newSetting);
    return newSetting;
  }

  async deleteSetting(id: string): Promise<void> {
    this.settings.delete(id);
  }

  // Environments
  async getAllEnvironments(): Promise<Environment[]> {
    return Array.from(this.environments.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getEnvironment(id: string): Promise<Environment | undefined> {
    return this.environments.get(id);
  }

  async getEnvironmentByName(name: string): Promise<Environment | undefined> {
    return Array.from(this.environments.values()).find(e => e.name === name);
  }

  async createEnvironment(env: InsertEnvironment): Promise<Environment> {
    const id = randomUUID();
    const now = new Date();
    const environment: Environment = {
      id,
      name: env.name,
      displayName: env.displayName,
      baseUrl: env.baseUrl,
      variables: env.variables || null,
      headers: env.headers || null,
      isDefault: env.isDefault || false,
      isActive: env.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.environments.set(id, environment);
    return environment;
  }

  async updateEnvironment(id: string, env: Partial<InsertEnvironment>): Promise<Environment | undefined> {
    const existing = this.environments.get(id);
    if (!existing) return undefined;
    const updated: Environment = { ...existing, ...env, updatedAt: new Date() };
    this.environments.set(id, updated);
    return updated;
  }

  async deleteEnvironment(id: string): Promise<void> {
    this.environments.delete(id);
  }

  // Test Data Pools
  async getAllTestDataPools(): Promise<TestDataPool[]> {
    return Array.from(this.testDataPools.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getTestDataPool(id: string): Promise<TestDataPool | undefined> {
    return this.testDataPools.get(id);
  }

  async createTestDataPool(pool: InsertTestDataPool): Promise<TestDataPool> {
    const id = randomUUID();
    const now = new Date();
    const dataPool: TestDataPool = {
      id,
      name: pool.name,
      description: pool.description || null,
      dataType: pool.dataType,
      data: pool.data,
      isShared: pool.isShared ?? true,
      autoCleanup: pool.autoCleanup ?? false,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.testDataPools.set(id, dataPool);
    return dataPool;
  }

  async updateTestDataPool(id: string, pool: Partial<InsertTestDataPool>): Promise<TestDataPool | undefined> {
    const existing = this.testDataPools.get(id);
    if (!existing) return undefined;
    const updated: TestDataPool = { ...existing, ...pool, updatedAt: new Date() };
    this.testDataPools.set(id, updated);
    return updated;
  }

  async deleteTestDataPool(id: string): Promise<void> {
    this.testDataPools.delete(id);
  }

  // Visual Baselines
  async getAllVisualBaselines(): Promise<VisualBaseline[]> {
    return Array.from(this.visualBaselines.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getVisualBaseline(id: string): Promise<VisualBaseline | undefined> {
    return this.visualBaselines.get(id);
  }

  async getVisualBaselinesByTestCase(testCaseId: string): Promise<VisualBaseline[]> {
    return Array.from(this.visualBaselines.values()).filter(b => b.testCaseId === testCaseId);
  }

  async createVisualBaseline(baseline: InsertVisualBaseline): Promise<VisualBaseline> {
    const id = randomUUID();
    const now = new Date();
    const vb: VisualBaseline = {
      id,
      testCaseId: baseline.testCaseId || null,
      name: baseline.name,
      selector: baseline.selector || null,
      fullPage: baseline.fullPage ?? true,
      baselineImage: baseline.baselineImage,
      threshold: baseline.threshold ?? 5,
      environmentId: baseline.environmentId || null,
      viewport: baseline.viewport || null,
      createdAt: now,
      updatedAt: now,
    };
    this.visualBaselines.set(id, vb);
    return vb;
  }

  async updateVisualBaseline(id: string, baseline: Partial<InsertVisualBaseline>): Promise<VisualBaseline | undefined> {
    const existing = this.visualBaselines.get(id);
    if (!existing) return undefined;
    const updated: VisualBaseline = { ...existing, ...baseline, updatedAt: new Date() };
    this.visualBaselines.set(id, updated);
    return updated;
  }

  async deleteVisualBaseline(id: string): Promise<void> {
    this.visualBaselines.delete(id);
  }

  // Visual Comparisons
  async getVisualComparisonsByExecution(executionId: string): Promise<VisualComparison[]> {
    return Array.from(this.visualComparisons.values()).filter(c => c.executionId === executionId);
  }

  async createVisualComparison(comparison: InsertVisualComparison): Promise<VisualComparison> {
    const id = randomUUID();
    const now = new Date();
    const vc: VisualComparison = {
      id,
      baselineId: comparison.baselineId || null,
      executionId: comparison.executionId || null,
      actualImage: comparison.actualImage,
      diffImage: comparison.diffImage || null,
      diffPercentage: comparison.diffPercentage ?? 0,
      passed: comparison.passed ?? true,
      createdAt: now,
    };
    this.visualComparisons.set(id, vc);
    return vc;
  }

  // Performance Metrics
  async getPerformanceMetricsByExecution(executionId: string): Promise<PerformanceMetric[]> {
    return Array.from(this.performanceMetrics.values()).filter(m => m.executionId === executionId);
  }

  async createPerformanceMetric(metric: InsertPerformanceMetric): Promise<PerformanceMetric> {
    const id = randomUUID();
    const now = new Date();
    const pm: PerformanceMetric = {
      id,
      executionId: metric.executionId || null,
      testCaseId: metric.testCaseId || null,
      url: metric.url || null,
      lcp: metric.lcp || null,
      fid: metric.fid || null,
      cls: metric.cls || null,
      fcp: metric.fcp || null,
      ttfb: metric.ttfb || null,
      domLoadTime: metric.domLoadTime || null,
      pageLoadTime: metric.pageLoadTime || null,
      resourceCount: metric.resourceCount || null,
      totalResourceSize: metric.totalResourceSize || null,
      jsHeapSize: metric.jsHeapSize || null,
      requestCount: metric.requestCount || null,
      transferSize: metric.transferSize || null,
      createdAt: now,
    };
    this.performanceMetrics.set(id, pm);
    return pm;
  }

  // API Mocks
  async getAllApiMocks(): Promise<ApiMock[]> {
    return Array.from(this.apiMocks.values()).sort((a, b) => b.priority - a.priority);
  }

  async getApiMock(id: string): Promise<ApiMock | undefined> {
    return this.apiMocks.get(id);
  }

  async getActiveApiMocks(): Promise<ApiMock[]> {
    return Array.from(this.apiMocks.values())
      .filter(m => m.isActive)
      .sort((a, b) => b.priority - a.priority);
  }

  async createApiMock(mock: InsertApiMock): Promise<ApiMock> {
    const id = randomUUID();
    const now = new Date();
    const am: ApiMock = {
      id,
      name: mock.name,
      description: mock.description || null,
      method: mock.method,
      urlPattern: mock.urlPattern,
      requestHeaders: mock.requestHeaders || null,
      requestBody: mock.requestBody || null,
      responseStatus: mock.responseStatus ?? 200,
      responseHeaders: mock.responseHeaders || null,
      responseBody: mock.responseBody || null,
      delay: mock.delay ?? 0,
      isActive: mock.isActive ?? true,
      priority: mock.priority ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.apiMocks.set(id, am);
    return am;
  }

  async updateApiMock(id: string, mock: Partial<InsertApiMock>): Promise<ApiMock | undefined> {
    const existing = this.apiMocks.get(id);
    if (!existing) return undefined;
    const updated: ApiMock = { ...existing, ...mock, updatedAt: new Date() };
    this.apiMocks.set(id, updated);
    return updated;
  }

  async deleteApiMock(id: string): Promise<void> {
    this.apiMocks.delete(id);
  }

  // CI/CD Webhooks
  async getAllCicdWebhooks(): Promise<CicdWebhook[]> {
    return Array.from(this.cicdWebhooks.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getCicdWebhook(id: string): Promise<CicdWebhook | undefined> {
    return this.cicdWebhooks.get(id);
  }

  async createCicdWebhook(webhook: InsertCicdWebhook): Promise<CicdWebhook> {
    const id = randomUUID();
    const now = new Date();
    const wh: CicdWebhook = {
      id,
      name: webhook.name,
      provider: webhook.provider,
      webhookUrl: webhook.webhookUrl || null,
      secretToken: webhook.secretToken || null,
      suiteId: webhook.suiteId || null,
      environmentId: webhook.environmentId || null,
      triggerOn: webhook.triggerOn || null,
      isActive: webhook.isActive ?? true,
      lastTriggered: null,
      createdAt: now,
    };
    this.cicdWebhooks.set(id, wh);
    return wh;
  }

  async updateCicdWebhook(id: string, webhook: Partial<CicdWebhook>): Promise<CicdWebhook | undefined> {
    const existing = this.cicdWebhooks.get(id);
    if (!existing) return undefined;
    const updated: CicdWebhook = { ...existing, ...webhook };
    this.cicdWebhooks.set(id, updated);
    return updated;
  }

  async deleteCicdWebhook(id: string): Promise<void> {
    this.cicdWebhooks.delete(id);
  }

  // Roles (RBAC)
  async getAllRoles(): Promise<Role[]> {
    return Array.from(this.roles.values());
  }

  async getRole(id: string): Promise<Role | undefined> {
    return this.roles.get(id);
  }

  async getRoleByName(name: string): Promise<Role | undefined> {
    return Array.from(this.roles.values()).find(r => r.name === name);
  }

  async createRole(role: InsertRole): Promise<Role> {
    const id = randomUUID();
    const now = new Date();
    const r: Role = {
      id,
      name: role.name,
      displayName: role.displayName,
      description: role.description || null,
      permissions: role.permissions,
      isSystem: false,
      createdAt: now,
    };
    this.roles.set(id, r);
    return r;
  }

  async updateRole(id: string, role: Partial<InsertRole>): Promise<Role | undefined> {
    const existing = this.roles.get(id);
    if (!existing || existing.isSystem) return undefined;
    const updated: Role = { ...existing, ...role };
    this.roles.set(id, updated);
    return updated;
  }

  async deleteRole(id: string): Promise<void> {
    const role = this.roles.get(id);
    if (role && !role.isSystem) {
      this.roles.delete(id);
    }
  }

  // User Roles
  async getUserRoles(userId: string): Promise<UserRole[]> {
    return Array.from(this.userRoles.values()).filter(ur => ur.userId === userId);
  }

  async assignUserRole(userRole: InsertUserRole): Promise<UserRole> {
    const id = randomUUID();
    const now = new Date();
    const ur: UserRole = {
      id,
      userId: userRole.userId,
      roleId: userRole.roleId,
      assignedAt: now,
    };
    this.userRoles.set(id, ur);
    return ur;
  }

  async removeUserRole(userId: string, roleId: string): Promise<void> {
    for (const [id, ur] of this.userRoles) {
      if (ur.userId === userId && ur.roleId === roleId) {
        this.userRoles.delete(id);
        break;
      }
    }
  }

  // Mobile Devices
  async getAllMobileDevices(): Promise<MobileDevice[]> {
    return Array.from(this.mobileDevices.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getMobileDevice(id: string): Promise<MobileDevice | undefined> {
    return this.mobileDevices.get(id);
  }

  async createMobileDevice(device: InsertMobileDevice): Promise<MobileDevice> {
    const id = randomUUID();
    const now = new Date();
    const md: MobileDevice = {
      id,
      name: device.name,
      platform: device.platform,
      platformVersion: device.platformVersion || null,
      deviceName: device.deviceName,
      udid: device.udid || null,
      appPath: device.appPath || null,
      appPackage: device.appPackage || null,
      appActivity: device.appActivity || null,
      bundleId: device.bundleId || null,
      automationName: device.automationName || "XCUITest",
      isReal: device.isReal ?? false,
      isAvailable: device.isAvailable ?? true,
      capabilities: device.capabilities || null,
      createdAt: now,
    };
    this.mobileDevices.set(id, md);
    return md;
  }

  async updateMobileDevice(id: string, device: Partial<InsertMobileDevice>): Promise<MobileDevice | undefined> {
    const existing = this.mobileDevices.get(id);
    if (!existing) return undefined;
    const updated: MobileDevice = { ...existing, ...device };
    this.mobileDevices.set(id, updated);
    return updated;
  }

  async deleteMobileDevice(id: string): Promise<void> {
    this.mobileDevices.delete(id);
  }
}

export const storage = new MemStorage();
