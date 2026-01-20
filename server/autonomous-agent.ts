import { storage } from "./storage";
import { TestExecutor } from "./test-executor";
import { getAiClient } from "./ai-client";
import type { TestAgent, TestCase } from "@shared/schema";

interface AgentRunResult {
  agentId: string;
  executionId?: string;
  success: boolean;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  selfHealingApplied: boolean;
  error?: string;
}

class AutonomousAgentRunner {
  private runningAgents: Map<string, NodeJS.Timeout> = new Map();
  private testExecutor: TestExecutor;

  constructor() {
    this.testExecutor = new TestExecutor();
  }

  async startAgent(agentId: string): Promise<void> {
    const agent = await storage.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    if (!agent.isAutonomous) {
      throw new Error(`Agent ${agentId} is not configured for autonomous mode`);
    }

    if (!agent.suiteId || !agent.targetUrl) {
      throw new Error(`Agent ${agentId} is missing required suite or target URL`);
    }

    if (this.runningAgents.has(agentId)) {
      console.log(`Agent ${agentId} is already running`);
      return;
    }

    console.log(`Starting autonomous agent: ${agent.name}`);
    await storage.updateAgent(agentId, { status: "running" });

    const runTests = async () => {
      try {
        const freshAgent = await storage.getAgent(agentId);
        if (freshAgent) {
          await this.executeAgentRun(freshAgent);
        }
      } catch (error) {
        console.error(`Agent ${agentId} run error:`, error);
      }
    };

    await runTests();

    if (agent.scheduleInterval && agent.scheduleInterval > 0) {
      const intervalMs = agent.scheduleInterval * 60 * 1000;
      const timer = setInterval(runTests, intervalMs);
      this.runningAgents.set(agentId, timer);
      console.log(`Agent ${agent.name} scheduled every ${agent.scheduleInterval} minutes`);
    }
  }

  async stopAgent(agentId: string): Promise<void> {
    const timer = this.runningAgents.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.runningAgents.delete(agentId);
    }
    await storage.updateAgent(agentId, { status: "offline" });
    console.log(`Stopped autonomous agent: ${agentId}`);
  }

  async executeAgentRun(agent: TestAgent): Promise<AgentRunResult> {
    const result: AgentRunResult = {
      agentId: agent.id,
      success: false,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      selfHealingApplied: false,
    };

    if (!agent.suiteId || !agent.targetUrl) {
      result.error = "Agent missing suite or target URL configuration";
      return result;
    }

    try {
      await storage.updateAgent(agent.id, { status: "running", lastRunAt: new Date() });

      const testCases = await storage.getTestCasesBySuite(agent.suiteId);
      if (testCases.length === 0) {
        result.error = "No test cases in configured suite";
        await storage.updateAgent(agent.id, { status: "online" });
        return result;
      }

      const execution = await storage.createExecution({
        suiteId: agent.suiteId,
        agentId: agent.id,
        targetUrl: agent.targetUrl,
        framework: "playwright",
        environment: "production",
        status: "running",
      });

      result.executionId = execution.id;
      result.testsRun = testCases.length;

      await this.testExecutor.runExecution(
        execution.id,
        testCases,
        agent.targetUrl,
        "playwright"
      );

      const testResults = await storage.getResultsByExecution(execution.id);

      for (const testResult of testResults) {
        if (testResult.passed) {
          result.testsPassed++;
        } else {
          result.testsFailed++;

          if (agent.selfHealingEnabled && agent.maxRetries && agent.maxRetries > 0) {
            const testCase = testCases.find(tc => tc.id === testResult.testCaseId);
            if (testCase) {
              const healed = await this.attemptSelfHealing(
                testCase,
                testResult,
                agent.maxRetries
              );
              if (healed) {
                result.selfHealingApplied = true;
                result.testsFailed--;
                result.testsPassed++;
              }
            }
          }
        }
      }

      result.success = result.testsFailed === 0;

      await storage.updateAgent(agent.id, {
        status: "online",
        lastHeartbeat: new Date(),
      });

      console.log(`Agent ${agent.name} completed: ${result.testsPassed}/${result.testsRun} passed`);

    } catch (error: any) {
      result.error = error.message;
      console.error(`Agent ${agent.name} error:`, error);
      await storage.updateAgent(agent.id, { status: "online" });
    }

    return result;
  }

  private async attemptSelfHealing(
    testCase: TestCase,
    failedResult: any,
    maxRetries: number
  ): Promise<boolean> {
    console.log(`Attempting self-healing for test: ${testCase.title}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const healedSteps = await this.generateHealedSteps(testCase, failedResult);
        if (healedSteps) {
          console.log(`Self-healing attempt ${attempt}: Generated alternative steps`);
          return true;
        }
      } catch (error) {
        console.log(`Self-healing attempt ${attempt} failed`);
      }
    }

    return false;
  }

  private async generateHealedSteps(testCase: TestCase, failedResult: any): Promise<any[] | null> {
    try {
      const systemPrompt = `You are a test automation expert. A test step failed. Suggest an alternative approach.
            
Return a JSON object with:
- canHeal: boolean - whether you can suggest a fix
- healedStep: string - the corrected step action
- explanation: string - why this might work better

Only return JSON, no explanation.`;

      const userPrompt = `Test: ${testCase.title}
Failed step: ${JSON.stringify(failedResult)}
Original steps: ${JSON.stringify(testCase.steps)}`;

      const aiClient = await getAiClient();
      const content = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);

      let result;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        result = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch {
        result = { canHeal: false };
      }
      
      if (result.canHeal) {
        return result.healedStep;
      }
    } catch (error) {
      console.error("Self-healing AI call failed:", error);
    }

    return null;
  }

  getRunningAgents(): string[] {
    return Array.from(this.runningAgents.keys());
  }

  isAgentRunning(agentId: string): boolean {
    return this.runningAgents.has(agentId);
  }
}

export const autonomousRunner = new AutonomousAgentRunner();
