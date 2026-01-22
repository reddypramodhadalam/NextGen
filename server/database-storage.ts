import { db } from "./db";
import { eq, and } from "drizzle-orm";
import {
  testSuites,
  testCases,
  testAgents,
  testExecutions,
  testResults,
  generatedScripts,
  testReports,
  requirements,
  platformSettings,
  environments,
  testDataPools,
  visualBaselines,
  visualComparisons,
  performanceMetrics,
  apiMocks,
  cicdWebhooks,
  roles,
  userRoles,
  mobileDevices,
  projects,
  teamMemberships,
} from "@shared/schema";
import type {
  User,
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
  Project,
  InsertProject,
  TeamMembership,
  InsertTeamMembership,
} from "@shared/schema";
import type { IStorage } from "./storage";
import { randomUUID } from "crypto";

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    return undefined;
  }

  // Test Suites
  async getAllTestSuites(): Promise<TestSuite[]> {
    return await db.select().from(testSuites);
  }

  async getTestSuite(id: string): Promise<TestSuite | undefined> {
    const [suite] = await db.select().from(testSuites).where(eq(testSuites.id, id));
    return suite;
  }

  async createTestSuite(suite: InsertTestSuite): Promise<TestSuite> {
    const id = randomUUID();
    const now = new Date();
    const [created] = await db.insert(testSuites).values({
      ...suite,
      id,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return created;
  }

  async updateTestSuite(id: string, suite: Partial<InsertTestSuite>): Promise<TestSuite | undefined> {
    const [updated] = await db.update(testSuites)
      .set({ ...suite, updatedAt: new Date() })
      .where(eq(testSuites.id, id))
      .returning();
    return updated;
  }

  async deleteTestSuite(id: string): Promise<void> {
    await db.delete(testSuites).where(eq(testSuites.id, id));
  }

  // Test Cases
  async getAllTestCases(): Promise<TestCase[]> {
    return await db.select().from(testCases);
  }

  async getTestCase(id: string): Promise<TestCase | undefined> {
    const [tc] = await db.select().from(testCases).where(eq(testCases.id, id));
    return tc;
  }

  async getTestCasesBySuite(suiteId: string): Promise<TestCase[]> {
    return await db.select().from(testCases).where(eq(testCases.suiteId, suiteId));
  }

  async createTestCase(tc: InsertTestCase): Promise<TestCase> {
    const id = randomUUID();
    const now = new Date();
    const [created] = await db.insert(testCases).values({
      ...tc,
      id,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return created;
  }

  async updateTestCase(id: string, tc: Partial<InsertTestCase>): Promise<TestCase | undefined> {
    const [updated] = await db.update(testCases)
      .set({ ...tc, updatedAt: new Date() })
      .where(eq(testCases.id, id))
      .returning();
    return updated;
  }

  async deleteTestCase(id: string): Promise<void> {
    await db.delete(testCases).where(eq(testCases.id, id));
  }

  // Test Agents
  async getAllAgents(): Promise<TestAgent[]> {
    return await db.select().from(testAgents);
  }

  async getAgent(id: string): Promise<TestAgent | undefined> {
    const [agent] = await db.select().from(testAgents).where(eq(testAgents.id, id));
    return agent;
  }

  async createAgent(agent: InsertTestAgent): Promise<TestAgent> {
    const id = randomUUID();
    const now = new Date();
    const [created] = await db.insert(testAgents).values({
      ...agent,
      id,
      createdAt: now,
    }).returning();
    return created;
  }

  async updateAgent(id: string, agent: Partial<InsertTestAgent>): Promise<TestAgent | undefined> {
    const [updated] = await db.update(testAgents)
      .set(agent)
      .where(eq(testAgents.id, id))
      .returning();
    return updated;
  }

  async deleteAgent(id: string): Promise<void> {
    await db.delete(testAgents).where(eq(testAgents.id, id));
  }

  // Test Executions
  async getAllExecutions(): Promise<TestExecution[]> {
    return await db.select().from(testExecutions);
  }

  async getExecution(id: string): Promise<TestExecution | undefined> {
    const [exec] = await db.select().from(testExecutions).where(eq(testExecutions.id, id));
    return exec;
  }

  async createExecution(exec: InsertTestExecution): Promise<TestExecution> {
    const id = randomUUID();
    const [created] = await db.insert(testExecutions).values({
      ...exec,
      id,
      startedAt: new Date(),
    }).returning();
    return created;
  }

  async updateExecution(id: string, exec: Partial<TestExecution>): Promise<TestExecution | undefined> {
    const [updated] = await db.update(testExecutions)
      .set(exec)
      .where(eq(testExecutions.id, id))
      .returning();
    return updated;
  }

  async deleteExecution(id: string): Promise<void> {
    await db.delete(testExecutions).where(eq(testExecutions.id, id));
  }

  // Test Results
  async getResultsByExecution(executionId: string): Promise<TestResult[]> {
    return await db.select().from(testResults).where(eq(testResults.executionId, executionId));
  }

  async createResult(result: InsertTestResult): Promise<TestResult> {
    const id = randomUUID();
    const [created] = await db.insert(testResults).values({
      ...result,
      id,
      createdAt: new Date(),
    }).returning();
    return created;
  }

  async updateResult(id: string, result: Partial<TestResult>): Promise<TestResult | undefined> {
    const [updated] = await db.update(testResults)
      .set(result)
      .where(eq(testResults.id, id))
      .returning();
    return updated;
  }

  // Generated Scripts
  async getAllScripts(): Promise<GeneratedScript[]> {
    return await db.select().from(generatedScripts);
  }

  async getScript(id: string): Promise<GeneratedScript | undefined> {
    const [script] = await db.select().from(generatedScripts).where(eq(generatedScripts.id, id));
    return script;
  }

  async createScript(script: InsertGeneratedScript): Promise<GeneratedScript> {
    const id = randomUUID();
    const [created] = await db.insert(generatedScripts).values({
      ...script,
      id,
      createdAt: new Date(),
    }).returning();
    return created;
  }

  async deleteScript(id: string): Promise<void> {
    await db.delete(generatedScripts).where(eq(generatedScripts.id, id));
  }

  async getScriptsByTestCase(testCaseId: string): Promise<GeneratedScript[]> {
    return await db.select().from(generatedScripts).where(eq(generatedScripts.testCaseId, testCaseId));
  }

  // Test Reports
  async getAllReports(): Promise<TestReport[]> {
    return await db.select().from(testReports);
  }

  async getReport(id: string): Promise<TestReport | undefined> {
    const [report] = await db.select().from(testReports).where(eq(testReports.id, id));
    return report;
  }

  async createReport(report: InsertTestReport): Promise<TestReport> {
    const id = randomUUID();
    const [created] = await db.insert(testReports).values({
      ...report,
      id,
      createdAt: new Date(),
    }).returning();
    return created;
  }

  async deleteReport(id: string): Promise<void> {
    await db.delete(testReports).where(eq(testReports.id, id));
  }

  // Requirements
  async getAllRequirements(): Promise<Requirement[]> {
    return await db.select().from(requirements);
  }

  async getRequirement(id: string): Promise<Requirement | undefined> {
    const [req] = await db.select().from(requirements).where(eq(requirements.id, id));
    return req;
  }

  async createRequirement(req: InsertRequirement): Promise<Requirement> {
    const id = randomUUID();
    const [created] = await db.insert(requirements).values({
      ...req,
      id,
      createdAt: new Date(),
    }).returning();
    return created;
  }

  async updateRequirement(id: string, req: Partial<InsertRequirement>): Promise<Requirement | undefined> {
    const [updated] = await db.update(requirements)
      .set(req)
      .where(eq(requirements.id, id))
      .returning();
    return updated;
  }

  async deleteRequirement(id: string): Promise<void> {
    await db.delete(requirements).where(eq(requirements.id, id));
  }

  // Platform Settings
  async getAllSettings(): Promise<PlatformSetting[]> {
    return await db.select().from(platformSettings);
  }

  async getSetting(category: string, key: string): Promise<PlatformSetting | undefined> {
    const [setting] = await db.select().from(platformSettings)
      .where(and(eq(platformSettings.category, category), eq(platformSettings.key, key)));
    return setting;
  }

  async upsertSetting(setting: InsertPlatformSetting): Promise<PlatformSetting> {
    const existing = await this.getSetting(setting.category, setting.key);
    if (existing) {
      const [updated] = await db.update(platformSettings)
        .set({ value: setting.value, valueJson: setting.valueJson, updatedAt: new Date() })
        .where(eq(platformSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(platformSettings).values({
      ...setting,
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async getSettingsByCategory(category: string): Promise<PlatformSetting[]> {
    return await db.select().from(platformSettings).where(eq(platformSettings.category, category));
  }

  async deleteSetting(id: string): Promise<void> {
    await db.delete(platformSettings).where(eq(platformSettings.id, id));
  }

  // Environments
  async getAllEnvironments(): Promise<Environment[]> {
    return await db.select().from(environments);
  }

  async getEnvironment(id: string): Promise<Environment | undefined> {
    const [env] = await db.select().from(environments).where(eq(environments.id, id));
    return env;
  }

  async getDefaultEnvironment(): Promise<Environment | undefined> {
    const [env] = await db.select().from(environments).where(eq(environments.isDefault, true));
    return env;
  }

  async createEnvironment(env: InsertEnvironment): Promise<Environment> {
    const id = randomUUID();
    if (env.isDefault) {
      await db.update(environments).set({ isDefault: false }).where(eq(environments.isDefault, true));
    }
    const [created] = await db.insert(environments).values({
      ...env,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updateEnvironment(id: string, env: Partial<InsertEnvironment>): Promise<Environment | undefined> {
    if (env.isDefault) {
      await db.update(environments).set({ isDefault: false }).where(eq(environments.isDefault, true));
    }
    const [updated] = await db.update(environments)
      .set({ ...env, updatedAt: new Date() })
      .where(eq(environments.id, id))
      .returning();
    return updated;
  }

  async deleteEnvironment(id: string): Promise<void> {
    await db.delete(environments).where(eq(environments.id, id));
  }

  async getEnvironmentByName(name: string): Promise<Environment | undefined> {
    const [env] = await db.select().from(environments).where(eq(environments.name, name));
    return env;
  }

  // Test Data Pools
  async getAllTestDataPools(): Promise<TestDataPool[]> {
    return await db.select().from(testDataPools);
  }

  async getTestDataPool(id: string): Promise<TestDataPool | undefined> {
    const [pool] = await db.select().from(testDataPools).where(eq(testDataPools.id, id));
    return pool;
  }

  async createTestDataPool(pool: InsertTestDataPool): Promise<TestDataPool> {
    const id = randomUUID();
    const [created] = await db.insert(testDataPools).values({
      ...pool,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updateTestDataPool(id: string, pool: Partial<InsertTestDataPool>): Promise<TestDataPool | undefined> {
    const [updated] = await db.update(testDataPools)
      .set({ ...pool, updatedAt: new Date() })
      .where(eq(testDataPools.id, id))
      .returning();
    return updated;
  }

  async deleteTestDataPool(id: string): Promise<void> {
    await db.delete(testDataPools).where(eq(testDataPools.id, id));
  }

  // Visual Baselines
  async getAllVisualBaselines(): Promise<VisualBaseline[]> {
    return await db.select().from(visualBaselines);
  }

  async getVisualBaseline(id: string): Promise<VisualBaseline | undefined> {
    const [baseline] = await db.select().from(visualBaselines).where(eq(visualBaselines.id, id));
    return baseline;
  }

  async createVisualBaseline(baseline: InsertVisualBaseline): Promise<VisualBaseline> {
    const id = randomUUID();
    const [created] = await db.insert(visualBaselines).values({
      ...baseline,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updateVisualBaseline(id: string, baseline: Partial<InsertVisualBaseline>): Promise<VisualBaseline | undefined> {
    const [updated] = await db.update(visualBaselines)
      .set({ ...baseline, updatedAt: new Date() })
      .where(eq(visualBaselines.id, id))
      .returning();
    return updated;
  }

  async deleteVisualBaseline(id: string): Promise<void> {
    await db.delete(visualBaselines).where(eq(visualBaselines.id, id));
  }

  async getVisualBaselinesByTestCase(testCaseId: string): Promise<VisualBaseline[]> {
    return await db.select().from(visualBaselines).where(eq(visualBaselines.testCaseId, testCaseId));
  }

  // Visual Comparisons
  async getAllVisualComparisons(): Promise<VisualComparison[]> {
    return await db.select().from(visualComparisons);
  }

  async getVisualComparison(id: string): Promise<VisualComparison | undefined> {
    const [comp] = await db.select().from(visualComparisons).where(eq(visualComparisons.id, id));
    return comp;
  }

  async createVisualComparison(comp: InsertVisualComparison): Promise<VisualComparison> {
    const id = randomUUID();
    const [created] = await db.insert(visualComparisons).values({
      ...comp,
      id,
      createdAt: new Date(),
    }).returning();
    return created;
  }

  async getVisualComparisonsByExecution(executionId: string): Promise<VisualComparison[]> {
    return await db.select().from(visualComparisons).where(eq(visualComparisons.executionId, executionId));
  }

  // Performance Metrics
  async getAllPerformanceMetrics(): Promise<PerformanceMetric[]> {
    return await db.select().from(performanceMetrics);
  }

  async getPerformanceMetric(id: string): Promise<PerformanceMetric | undefined> {
    const [metric] = await db.select().from(performanceMetrics).where(eq(performanceMetrics.id, id));
    return metric;
  }

  async createPerformanceMetric(metric: InsertPerformanceMetric): Promise<PerformanceMetric> {
    const id = randomUUID();
    const [created] = await db.insert(performanceMetrics).values({
      ...metric,
      id,
      createdAt: new Date(),
    }).returning();
    return created;
  }

  async getPerformanceMetricsByExecution(executionId: string): Promise<PerformanceMetric[]> {
    return await db.select().from(performanceMetrics).where(eq(performanceMetrics.executionId, executionId));
  }

  // API Mocks
  async getAllApiMocks(): Promise<ApiMock[]> {
    return await db.select().from(apiMocks);
  }

  async getApiMock(id: string): Promise<ApiMock | undefined> {
    const [mock] = await db.select().from(apiMocks).where(eq(apiMocks.id, id));
    return mock;
  }

  async createApiMock(mock: InsertApiMock): Promise<ApiMock> {
    const id = randomUUID();
    const [created] = await db.insert(apiMocks).values({
      ...mock,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updateApiMock(id: string, mock: Partial<InsertApiMock>): Promise<ApiMock | undefined> {
    const [updated] = await db.update(apiMocks)
      .set({ ...mock, updatedAt: new Date() })
      .where(eq(apiMocks.id, id))
      .returning();
    return updated;
  }

  async deleteApiMock(id: string): Promise<void> {
    await db.delete(apiMocks).where(eq(apiMocks.id, id));
  }

  async getActiveApiMocks(): Promise<ApiMock[]> {
    return await db.select().from(apiMocks).where(eq(apiMocks.isActive, true));
  }

  // CICD Webhooks
  async getAllCicdWebhooks(): Promise<CicdWebhook[]> {
    return await db.select().from(cicdWebhooks);
  }

  async getCicdWebhook(id: string): Promise<CicdWebhook | undefined> {
    const [webhook] = await db.select().from(cicdWebhooks).where(eq(cicdWebhooks.id, id));
    return webhook;
  }

  async getCicdWebhookByToken(token: string): Promise<CicdWebhook | undefined> {
    const [webhook] = await db.select().from(cicdWebhooks).where(eq(cicdWebhooks.secretToken, token));
    return webhook;
  }

  async createCicdWebhook(webhook: InsertCicdWebhook): Promise<CicdWebhook> {
    const id = randomUUID();
    const [created] = await db.insert(cicdWebhooks).values({
      ...webhook,
      id,
      createdAt: new Date(),
    }).returning();
    return created;
  }

  async updateCicdWebhook(id: string, webhook: Partial<InsertCicdWebhook>): Promise<CicdWebhook | undefined> {
    const [updated] = await db.update(cicdWebhooks)
      .set(webhook)
      .where(eq(cicdWebhooks.id, id))
      .returning();
    return updated;
  }

  async deleteCicdWebhook(id: string): Promise<void> {
    await db.delete(cicdWebhooks).where(eq(cicdWebhooks.id, id));
  }

  // Roles
  async getAllRoles(): Promise<Role[]> {
    return await db.select().from(roles);
  }

  async getRole(id: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role;
  }

  async createRole(role: InsertRole): Promise<Role> {
    const id = randomUUID();
    const [created] = await db.insert(roles).values({
      ...role,
      id,
      createdAt: new Date(),
    }).returning();
    return created;
  }

  async updateRole(id: string, role: Partial<InsertRole>): Promise<Role | undefined> {
    const [updated] = await db.update(roles)
      .set(role)
      .where(eq(roles.id, id))
      .returning();
    return updated;
  }

  async deleteRole(id: string): Promise<void> {
    await db.delete(roles).where(eq(roles.id, id));
  }

  async getRoleByName(name: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.name, name));
    return role;
  }

  // User Roles
  async getUserRoles(userId: string): Promise<UserRole[]> {
    return await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  }

  async assignRole(userRole: InsertUserRole): Promise<UserRole> {
    const id = randomUUID();
    const [created] = await db.insert(userRoles).values({
      ...userRole,
      id,
      assignedAt: new Date(),
    }).returning();
    return created;
  }

  async removeRole(userId: string, roleId: string): Promise<void> {
    await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  }

  async assignUserRole(userRole: InsertUserRole): Promise<UserRole> {
    const id = randomUUID();
    const [created] = await db.insert(userRoles).values({
      id,
      userId: userRole.userId,
      roleId: userRole.roleId,
      assignedAt: new Date(),
    }).returning();
    return created;
  }

  async removeUserRole(userId: string, roleId: string): Promise<void> {
    await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  }

  // Mobile Devices
  async getAllMobileDevices(): Promise<MobileDevice[]> {
    return await db.select().from(mobileDevices);
  }

  async getMobileDevice(id: string): Promise<MobileDevice | undefined> {
    const [device] = await db.select().from(mobileDevices).where(eq(mobileDevices.id, id));
    return device;
  }

  async createMobileDevice(device: InsertMobileDevice): Promise<MobileDevice> {
    const id = randomUUID();
    const [created] = await db.insert(mobileDevices).values({
      ...device,
      id,
      createdAt: new Date(),
    }).returning();
    return created;
  }

  async updateMobileDevice(id: string, device: Partial<InsertMobileDevice>): Promise<MobileDevice | undefined> {
    const [updated] = await db.update(mobileDevices)
      .set(device)
      .where(eq(mobileDevices.id, id))
      .returning();
    return updated;
  }

  async deleteMobileDevice(id: string): Promise<void> {
    await db.delete(mobileDevices).where(eq(mobileDevices.id, id));
  }

  // Projects
  async getAllProjects(): Promise<Project[]> {
    return await db.select().from(projects);
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjectsByOwner(ownerId: string): Promise<Project[]> {
    return await db.select().from(projects).where(eq(projects.ownerId, ownerId));
  }

  async createProject(project: InsertProject): Promise<Project> {
    const id = randomUUID();
    const [created] = await db.insert(projects).values({
      ...project,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db.update(projects)
      .set({ ...project, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }

  async deleteProject(id: string): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  // Team Memberships
  async getTeamMembershipsByProject(projectId: string): Promise<TeamMembership[]> {
    return await db.select().from(teamMemberships).where(eq(teamMemberships.projectId, projectId));
  }

  async getTeamMembershipsByUser(userId: string): Promise<TeamMembership[]> {
    return await db.select().from(teamMemberships).where(eq(teamMemberships.userId, userId));
  }

  async createTeamMembership(membership: InsertTeamMembership): Promise<TeamMembership> {
    const id = randomUUID();
    const [created] = await db.insert(teamMemberships).values({
      ...membership,
      id,
      joinedAt: new Date(),
    }).returning();
    return created;
  }

  async updateTeamMembership(id: string, membership: Partial<InsertTeamMembership>): Promise<TeamMembership | undefined> {
    const [updated] = await db.update(teamMemberships)
      .set(membership)
      .where(eq(teamMemberships.id, id))
      .returning();
    return updated;
  }

  async deleteTeamMembership(id: string): Promise<void> {
    await db.delete(teamMemberships).where(eq(teamMemberships.id, id));
  }

  async getProjectsForUser(userId: string): Promise<Project[]> {
    const memberships = await db.select().from(teamMemberships).where(eq(teamMemberships.userId, userId));
    const memberProjectIds = memberships.map(m => m.projectId);
    const ownedProjects = await db.select().from(projects).where(eq(projects.ownerId, userId));
    
    if (memberProjectIds.length === 0) {
      return ownedProjects;
    }
    
    const memberProjects = await Promise.all(
      memberProjectIds.map(async (projectId) => {
        const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
        return project;
      })
    );
    
    const allProjects = [...ownedProjects];
    for (const project of memberProjects) {
      if (project && !allProjects.find(p => p.id === project.id)) {
        allProjects.push(project);
      }
    }
    return allProjects;
  }

  async getProjectMembers(projectId: string): Promise<TeamMembership[]> {
    return await db.select().from(teamMemberships).where(eq(teamMemberships.projectId, projectId));
  }

  async getUserProjectMembership(userId: string, projectId: string): Promise<TeamMembership | undefined> {
    const [membership] = await db.select().from(teamMemberships)
      .where(and(eq(teamMemberships.userId, userId), eq(teamMemberships.projectId, projectId)));
    return membership;
  }
}

export const databaseStorage = new DatabaseStorage();
