/**
 * CI/CD Pipeline Integration Engine — AITAS Phase 7
 * GitHub Actions, Jenkins, Azure DevOps, GitLab CI webhook handlers
 * and outbound pipeline trigger support
 */

import { storage } from "./storage";
import { createHash, createHmac } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CICDProvider =
  | "github_actions"
  | "jenkins"
  | "azure_devops"
  | "gitlab_ci"
  | "bitbucket"
  | "circleci"
  | "generic";

export interface PipelineConfig {
  provider: CICDProvider;
  name: string;
  webhookUrl?: string;           // Outbound: URL to trigger pipeline
  inboundSecret?: string;        // Inbound: HMAC secret for verification
  apiToken?: string;             // For REST-based triggers
  projectId?: string;            // GitLab project ID / Azure project
  pipelineId?: string;           // Jenkins job name / Azure pipeline ID
  branch?: string;               // Default branch to trigger on
  suiteId?: string;              // Test suite to run when triggered
  environment?: string;
  triggerOn?: ("push" | "pull_request" | "tag" | "schedule" | "manual")[];
  enabled?: boolean;
}

export interface PipelineTriggerResult {
  success: boolean;
  provider: CICDProvider;
  pipelineName: string;
  triggeredAt: Date;
  runUrl?: string;
  runId?: string;
  message: string;
}

export interface InboundWebhookEvent {
  provider: CICDProvider;
  event: string;
  branch?: string;
  commit?: string;
  author?: string;
  status?: "success" | "failure" | "pending" | "running";
  pipelineUrl?: string;
  raw: any;
}

// ─── Signature Verifiers ──────────────────────────────────────────────────────

export function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  return signature === expected;
}

export function verifyGitLabToken(token: string, secret: string): boolean {
  return token === secret;
}

export function verifyJenkinsSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return signature === expected;
}

// ─── Inbound Event Parsers ────────────────────────────────────────────────────

export function parseGitHubEvent(
  event: string,
  body: any
): InboundWebhookEvent {
  const branch = body.ref?.replace("refs/heads/", "") || body.pull_request?.head?.ref;
  return {
    provider: "github_actions",
    event,
    branch,
    commit: body.after || body.pull_request?.head?.sha,
    author: body.pusher?.name || body.pull_request?.user?.login,
    status: body.workflow_run?.conclusion === "success" ? "success"
      : body.workflow_run?.conclusion === "failure" ? "failure"
      : body.workflow_run?.status === "in_progress" ? "running" : "pending",
    pipelineUrl: body.workflow_run?.html_url,
    raw: body,
  };
}

export function parseGitLabEvent(
  event: string,
  body: any
): InboundWebhookEvent {
  return {
    provider: "gitlab_ci",
    event,
    branch: body.ref?.replace("refs/heads/", "") || body.object_attributes?.ref,
    commit: body.checkout_sha || body.object_attributes?.sha,
    author: body.user_name || body.user?.name,
    status: body.object_attributes?.status === "success" ? "success"
      : body.object_attributes?.status === "failed" ? "failure"
      : body.object_attributes?.status === "running" ? "running" : "pending",
    pipelineUrl: body.object_attributes?.url,
    raw: body,
  };
}

export function parseJenkinsEvent(body: any): InboundWebhookEvent {
  return {
    provider: "jenkins",
    event: "build",
    branch: body.build?.parameters?.BRANCH || body.scm?.branch,
    commit: body.build?.scm?.commit,
    author: body.build?.culprits?.[0]?.fullName,
    status: body.build?.phase === "COMPLETED"
      ? body.build?.status === "SUCCESS" ? "success" : "failure"
      : "running",
    pipelineUrl: body.build?.full_url,
    raw: body,
  };
}

export function parseAzureDevOpsEvent(body: any): InboundWebhookEvent {
  const resource = body.resource || {};
  return {
    provider: "azure_devops",
    event: body.eventType || "build",
    branch: resource.sourceBranch?.replace("refs/heads/", ""),
    commit: resource.sourceVersion,
    author: resource.requestedFor?.displayName,
    status: resource.result === "succeeded" ? "success"
      : resource.result === "failed" ? "failure"
      : resource.status === "inProgress" ? "running" : "pending",
    pipelineUrl: resource._links?.web?.href,
    raw: body,
  };
}

// ─── Outbound Pipeline Triggers ───────────────────────────────────────────────

async function triggerGitHubActions(config: PipelineConfig): Promise<PipelineTriggerResult> {
  if (!config.webhookUrl || !config.apiToken) {
    return { success: false, provider: "github_actions", pipelineName: config.name, triggeredAt: new Date(), message: "Missing webhookUrl or apiToken" };
  }

  // GitHub: POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches
  const res = await fetch(config.webhookUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiToken}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: config.branch || "main",
      inputs: { environment: config.environment || "staging", suite_id: config.suiteId || "" },
    }),
    signal: AbortSignal.timeout(15000),
  });

  return {
    success: res.status === 204,
    provider: "github_actions",
    pipelineName: config.name,
    triggeredAt: new Date(),
    message: res.status === 204 ? "Workflow dispatched successfully" : `HTTP ${res.status}`,
  };
}

async function triggerJenkins(config: PipelineConfig): Promise<PipelineTriggerResult> {
  if (!config.webhookUrl) {
    return { success: false, provider: "jenkins", pipelineName: config.name, triggeredAt: new Date(), message: "Missing webhookUrl" };
  }

  const params = new URLSearchParams({
    token: config.apiToken || "aitas-trigger",
    BRANCH: config.branch || "main",
    ENVIRONMENT: config.environment || "staging",
    SUITE_ID: config.suiteId || "",
  });

  const url = `${config.webhookUrl}/buildWithParameters?${params}`;
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (config.apiToken) {
    headers["Authorization"] = "Basic " + Buffer.from(`aitas:${config.apiToken}`).toString("base64");
  }

  const res = await fetch(url, { method: "POST", headers, signal: AbortSignal.timeout(15000) });
  const queueUrl = res.headers.get("Location");

  return {
    success: res.status === 201,
    provider: "jenkins",
    pipelineName: config.name,
    triggeredAt: new Date(),
    runUrl: queueUrl || undefined,
    message: res.status === 201 ? "Build queued" : `HTTP ${res.status}`,
  };
}

async function triggerAzureDevOps(config: PipelineConfig): Promise<PipelineTriggerResult> {
  if (!config.webhookUrl || !config.apiToken) {
    return { success: false, provider: "azure_devops", pipelineName: config.name, triggeredAt: new Date(), message: "Missing webhookUrl or apiToken" };
  }

  const res = await fetch(`${config.webhookUrl}/runs?api-version=7.1`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(`:${config.apiToken}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      resources: { repositories: { self: { refName: `refs/heads/${config.branch || "main"}` } } },
      variables: {
        ENVIRONMENT: { value: config.environment || "staging" },
        SUITE_ID: { value: config.suiteId || "" },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  const data = await res.json().catch(() => ({}));
  return {
    success: res.status === 200,
    provider: "azure_devops",
    pipelineName: config.name,
    triggeredAt: new Date(),
    runId: data.id ? String(data.id) : undefined,
    runUrl: data._links?.web?.href,
    message: res.status === 200 ? `Run #${data.id} started` : `HTTP ${res.status}`,
  };
}

async function triggerGitLab(config: PipelineConfig): Promise<PipelineTriggerResult> {
  if (!config.webhookUrl || !config.apiToken || !config.projectId) {
    return { success: false, provider: "gitlab_ci", pipelineName: config.name, triggeredAt: new Date(), message: "Missing webhookUrl, apiToken, or projectId" };
  }

  const res = await fetch(
    `${config.webhookUrl}/api/v4/projects/${config.projectId}/trigger/pipeline`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: config.apiToken,
        ref: config.branch || "main",
        "variables[ENVIRONMENT]": config.environment || "staging",
        "variables[SUITE_ID]": config.suiteId || "",
      }).toString(),
      signal: AbortSignal.timeout(15000),
    }
  );

  const data = await res.json().catch(() => ({}));
  return {
    success: res.status === 201,
    provider: "gitlab_ci",
    pipelineName: config.name,
    triggeredAt: new Date(),
    runId: data.id ? String(data.id) : undefined,
    runUrl: data.web_url,
    message: res.status === 201 ? `Pipeline #${data.id} triggered` : `HTTP ${res.status}`,
  };
}

// ─── Generic Webhook Trigger ──────────────────────────────────────────────────

async function triggerGenericWebhook(config: PipelineConfig): Promise<PipelineTriggerResult> {
  if (!config.webhookUrl) {
    return { success: false, provider: "generic", pipelineName: config.name, triggeredAt: new Date(), message: "Missing webhookUrl" };
  }

  const payload = {
    event: "aitas_trigger",
    suite_id: config.suiteId,
    environment: config.environment || "staging",
    branch: config.branch || "main",
    triggered_at: new Date().toISOString(),
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiToken) headers["Authorization"] = `Bearer ${config.apiToken}`;
  if (config.inboundSecret) {
    headers["X-AITAS-Signature"] = createHmac("sha256", config.inboundSecret)
      .update(JSON.stringify(payload)).digest("hex");
  }

  const res = await fetch(config.webhookUrl, {
    method: "POST", headers, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  return {
    success: res.ok,
    provider: "generic",
    pipelineName: config.name,
    triggeredAt: new Date(),
    message: res.ok ? "Webhook delivered" : `HTTP ${res.status}`,
  };
}

// ─── Main CI/CD Engine ────────────────────────────────────────────────────────

export class CICDEngine {
  private configs = new Map<string, PipelineConfig>();

  /** Register a pipeline config */
  register(id: string, config: PipelineConfig): void {
    this.configs.set(id, config);
  }

  /** Trigger a pipeline by config ID */
  async trigger(configId: string): Promise<PipelineTriggerResult> {
    const config = this.configs.get(configId);
    if (!config) throw new Error(`Pipeline config ${configId} not found`);
    return this.triggerConfig(config);
  }

  /** Trigger a pipeline directly from config */
  async triggerConfig(config: PipelineConfig): Promise<PipelineTriggerResult> {
    switch (config.provider) {
      case "github_actions": return triggerGitHubActions(config);
      case "jenkins":        return triggerJenkins(config);
      case "azure_devops":   return triggerAzureDevOps(config);
      case "gitlab_ci":      return triggerGitLab(config);
      default:               return triggerGenericWebhook(config);
    }
  }

  /** Process an inbound webhook event and optionally trigger a test run */
  async processInboundEvent(
    provider: CICDProvider,
    event: string,
    body: any,
    signature?: string,
    secret?: string
  ): Promise<{ processed: boolean; testTriggered: boolean; executionId?: string; message: string }> {
    // Parse event
    let parsed: InboundWebhookEvent;
    switch (provider) {
      case "github_actions": parsed = parseGitHubEvent(event, body); break;
      case "gitlab_ci":      parsed = parseGitLabEvent(event, body); break;
      case "jenkins":        parsed = parseJenkinsEvent(body); break;
      case "azure_devops":   parsed = parseAzureDevOpsEvent(body); break;
      default:               parsed = { provider, event, raw: body };
    }

    console.log(`[CI/CD] Inbound ${provider} event: ${event}, branch: ${parsed.branch}, status: ${parsed.status}`);

    // Find matching webhook config in storage
    const webhooks = await storage.getAllCicdWebhooks();
    const matching = webhooks.find(
      (w) => w.provider === provider && w.isActive &&
        (w.triggerOn as string[] || []).includes(event.replace(".", "_"))
    );

    if (!matching || !matching.suiteId) {
      return { processed: true, testTriggered: false, message: `Event processed, no matching active webhook for ${provider}/${event}` };
    }

    // Trigger test execution
    const testCases = await storage.getTestCasesBySuite(matching.suiteId);
    if (testCases.length === 0) {
      return { processed: true, testTriggered: false, message: "No test cases in suite" };
    }

    const execution = await storage.createExecution({
      suiteId: matching.suiteId,
      targetUrl: parsed.pipelineUrl || "ci-triggered",
      framework: "playwright",
      environment: (matching.environmentId ? "staging" : "staging"),
      status: "pending",
      totalTests: testCases.length,
      passedTests: 0, failedTests: 0, skippedTests: 0,
    });

    // Update last triggered
    await storage.updateCicdWebhook(matching.id, { lastTriggered: new Date() });

    return {
      processed: true,
      testTriggered: true,
      executionId: execution.id,
      message: `Test execution ${execution.id} triggered for suite ${matching.suiteId}`,
    };
  }

  /** Get provider display info */
  getProviders(): Array<{ value: CICDProvider; label: string; icon: string; color: string; description: string }> {
    return [
      { value: "github_actions", label: "GitHub Actions",  icon: "Github",    color: "bg-gray-900 text-white",    description: "Trigger workflows via repository_dispatch or workflow_dispatch" },
      { value: "jenkins",        label: "Jenkins",         icon: "Server",    color: "bg-red-600 text-white",     description: "Trigger builds via Jenkins Remote API with token auth" },
      { value: "azure_devops",   label: "Azure DevOps",    icon: "Cloud",     color: "bg-blue-600 text-white",    description: "Trigger pipelines via Azure DevOps REST API" },
      { value: "gitlab_ci",      label: "GitLab CI",       icon: "GitMerge",  color: "bg-orange-600 text-white",  description: "Trigger pipelines via GitLab Pipeline Trigger API" },
      { value: "bitbucket",      label: "Bitbucket",       icon: "GitBranch", color: "bg-blue-500 text-white",    description: "Trigger pipelines via Bitbucket Pipelines API" },
      { value: "circleci",       label: "CircleCI",        icon: "RefreshCw", color: "bg-green-600 text-white",   description: "Trigger pipelines via CircleCI API v2" },
      { value: "generic",        label: "Generic Webhook", icon: "Webhook",   color: "bg-violet-600 text-white",  description: "Send a POST webhook to any CI/CD system" },
    ];
  }
}

export const cicdEngine = new CICDEngine();
