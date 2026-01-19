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
      lastHeartbeat: null,
      createdAt: now,
    };
    this.agents.set(id, testAgent);
    return testAgent;
  }

  async updateAgent(id: string, agent: Partial<InsertTestAgent>): Promise<TestAgent | undefined> {
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
}

export const storage = new MemStorage();
