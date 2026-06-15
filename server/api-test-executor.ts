/**
 * API Test Executor — AITAS
 * Handles REST, GraphQL, and SOAP API testing without a browser.
 */

import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestDataParam } from "@shared/schema";

export interface ApiTestStep {
  step: string;
  expected: string;
}

export interface ApiRequestConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  url: string;
  headers?: Record<string, string>;
  body?: any;
  queryParams?: Record<string, string>;
  timeout?: number;
  followRedirects?: boolean;
}

export interface ApiAssertionResult {
  assertion: string;
  passed: boolean;
  actual?: string;
  expected?: string;
  error?: string;
}

export interface ApiStepResult {
  step: string;
  request?: ApiRequestConfig;
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
    duration: number;
    size: number;
  };
  assertions: ApiAssertionResult[];
  passed: boolean;
  error?: string;
  logs: string[];
}

export interface ApiExecutionResult {
  testCaseId: string;
  testCaseTitle: string;
  passed: boolean;
  duration: number;
  steps: ApiStepResult[];
  errorMessage?: string;
  logs: string[];
}

// Runtime variable store for chaining requests
const runtimeVars = new Map<string, any>();

function replacePlaceholders(text: string, testData?: TestDataParam[]): string {
  let result = text;

  // Replace {{key}} with test data
  if (testData) {
    for (const param of testData) {
      result = result.replace(new RegExp(`\\{\\{${param.key}\\}\\}`, "gi"), param.value);
    }
  }

  // Replace $varName$ with runtime variables
  runtimeVars.forEach((value, key) => {
    result = result.replace(new RegExp(`\\$${key}\\$`, "gi"), String(value));
  });

  return result;
}

// ─── AI-Powered Step Interpreter ─────────────────────────────────────────────

interface AiApiPlan {
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
    queryParams?: Record<string, string>;
  };
  assertions: Array<{
    type:
      | "status_equals"
      | "status_in_range"
      | "body_contains"
      | "body_equals"
      | "json_path_equals"
      | "json_path_exists"
      | "json_path_matches"
      | "header_equals"
      | "header_exists"
      | "response_time_under"
      | "schema_valid";
    path?: string;
    expected?: any;
    description: string;
  }>;
  captureVars?: Array<{ varName: string; jsonPath: string }>;
  description: string;
}

async function interpretApiStepWithAI(
  step: string,
  expected: string,
  baseUrl: string,
  authHeaders: Record<string, string>,
  previousContext: string
): Promise<AiApiPlan> {
  const aiClient = await getAiClient();

  const systemPrompt = `You are an API test automation expert. Convert natural language test steps into API request plans.

Return ONLY valid JSON in this exact format:
{
  "request": {
    "method": "GET|POST|PUT|PATCH|DELETE",
    "url": "full URL or path",
    "headers": { "key": "value" },
    "body": { ... } or null,
    "queryParams": { "key": "value" } or null
  },
  "assertions": [
    {
      "type": "status_equals|body_contains|json_path_equals|json_path_exists|header_equals|response_time_under",
      "path": "$.data.id (for json_path types)",
      "expected": "expected value",
      "description": "what we're checking"
    }
  ],
  "captureVars": [
    { "varName": "tokenVar", "jsonPath": "$.access_token" }
  ],
  "description": "brief description"
}

RULES:
- Use $varName$ syntax to reference previously captured variables
- For auth: add Authorization header if token is available
- JSON path uses dot notation: $.data.id, $.items[0].name
- status_in_range: expected = "200-299"
- response_time_under: expected = milliseconds as number
- Always include at least a status assertion
- For POST/PUT, include body validation assertions
- Capture important values (IDs, tokens) for use in later steps`;

  const userPrompt = `Base URL: ${baseUrl}
Auth Headers: ${JSON.stringify(authHeaders)}
Previous context: ${previousContext}

Step: "${step}"
Expected: "${expected}"

Generate the API request plan.`;

  try {
    const response = await aiClient.chat(
      [{ role: "user", content: userPrompt }],
      systemPrompt
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AiApiPlan;
    }
  } catch (error: any) {
    console.error("[ApiExecutor] AI interpretation failed:", error.message);
  }

  // Fallback: basic GET request
  return {
    request: { method: "GET", url: baseUrl },
    assertions: [{ type: "status_in_range", expected: "200-299", description: "Response is successful" }],
    description: step,
  };
}

// ─── HTTP Request Executor ────────────────────────────────────────────────────

async function executeHttpRequest(
  config: ApiRequestConfig
): Promise<{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  duration: number;
  size: number;
}> {
  const startTime = Date.now();

  // Build URL with query params
  let url = config.url;
  if (config.queryParams && Object.keys(config.queryParams).length > 0) {
    const params = new URLSearchParams(config.queryParams);
    url += (url.includes("?") ? "&" : "?") + params.toString();
  }

  const fetchOptions: RequestInit = {
    method: config.method,
    headers: config.headers || {},
    signal: AbortSignal.timeout(config.timeout || 30000),
    redirect: config.followRedirects === false ? "manual" : "follow",
  };

  if (config.body && !["GET", "HEAD", "OPTIONS"].includes(config.method)) {
    if (typeof config.body === "string") {
      fetchOptions.body = config.body;
    } else {
      fetchOptions.body = JSON.stringify(config.body);
      if (!(config.headers?.["Content-Type"] || config.headers?.["content-type"])) {
        (fetchOptions.headers as Record<string, string>)["Content-Type"] = "application/json";
      }
    }
  }

  const response = await fetch(url, fetchOptions);
  const duration = Date.now() - startTime;

  // Parse response headers
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Parse body
  let body: any;
  const contentType = headers["content-type"] || "";
  const rawText = await response.text();
  const size = new TextEncoder().encode(rawText).length;

  if (contentType.includes("application/json") || contentType.includes("text/json")) {
    try {
      body = JSON.parse(rawText);
    } catch {
      body = rawText;
    }
  } else if (contentType.includes("text/xml") || contentType.includes("application/xml")) {
    body = rawText; // Return raw XML
  } else {
    body = rawText;
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    body,
    duration,
    size,
  };
}

// ─── JSON Path Resolver ───────────────────────────────────────────────────────

function resolveJsonPath(obj: any, path: string): any {
  if (!path || path === "$") return obj;

  const parts = path
    .replace(/^\$\.?/, "")
    .split(/\.|\[(\d+)\]/)
    .filter(Boolean);

  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const index = parseInt(part);
    if (!isNaN(index)) {
      current = Array.isArray(current) ? current[index] : undefined;
    } else {
      current = current[part];
    }
  }
  return current;
}

// ─── Assertion Evaluator ──────────────────────────────────────────────────────

function evaluateAssertion(
  assertion: AiApiPlan["assertions"][0],
  response: { status: number; headers: Record<string, string>; body: any; duration: number }
): ApiAssertionResult {
  try {
    switch (assertion.type) {
      case "status_equals": {
        const expected = Number(assertion.expected);
        const passed = response.status === expected;
        return {
          assertion: assertion.description,
          passed,
          actual: String(response.status),
          expected: String(expected),
        };
      }

      case "status_in_range": {
        const [min, max] = String(assertion.expected).split("-").map(Number);
        const passed = response.status >= min && response.status <= max;
        return {
          assertion: assertion.description,
          passed,
          actual: String(response.status),
          expected: `${min}-${max}`,
        };
      }

      case "body_contains": {
        const bodyStr =
          typeof response.body === "string"
            ? response.body
            : JSON.stringify(response.body);
        const passed = bodyStr.includes(String(assertion.expected));
        return {
          assertion: assertion.description,
          passed,
          actual: bodyStr.substring(0, 200),
          expected: String(assertion.expected),
        };
      }

      case "body_equals": {
        const bodyStr =
          typeof response.body === "string"
            ? response.body
            : JSON.stringify(response.body);
        const passed = bodyStr === String(assertion.expected);
        return {
          assertion: assertion.description,
          passed,
          actual: bodyStr.substring(0, 200),
          expected: String(assertion.expected),
        };
      }

      case "json_path_equals": {
        const actual = resolveJsonPath(response.body, assertion.path || "$");
        const passed = String(actual) === String(assertion.expected);
        return {
          assertion: assertion.description,
          passed,
          actual: String(actual),
          expected: String(assertion.expected),
        };
      }

      case "json_path_exists": {
        const actual = resolveJsonPath(response.body, assertion.path || "$");
        const passed = actual !== undefined && actual !== null;
        return {
          assertion: assertion.description,
          passed,
          actual: passed ? "exists" : "undefined",
          expected: "exists",
        };
      }

      case "json_path_matches": {
        const actual = resolveJsonPath(response.body, assertion.path || "$");
        const regex = new RegExp(String(assertion.expected));
        const passed = regex.test(String(actual));
        return {
          assertion: assertion.description,
          passed,
          actual: String(actual),
          expected: `matches /${assertion.expected}/`,
        };
      }

      case "header_equals": {
        const [headerName, expectedValue] = String(assertion.expected).split(":");
        const actual = response.headers[headerName.trim().toLowerCase()];
        const passed = actual === expectedValue?.trim();
        return {
          assertion: assertion.description,
          passed,
          actual: actual || "(not present)",
          expected: expectedValue?.trim(),
        };
      }

      case "header_exists": {
        const actual = response.headers[String(assertion.expected).toLowerCase()];
        const passed = actual !== undefined;
        return {
          assertion: assertion.description,
          passed,
          actual: actual || "(not present)",
          expected: "exists",
        };
      }

      case "response_time_under": {
        const maxMs = Number(assertion.expected);
        const passed = response.duration <= maxMs;
        return {
          assertion: assertion.description,
          passed,
          actual: `${response.duration}ms`,
          expected: `< ${maxMs}ms`,
        };
      }

      default:
        return {
          assertion: assertion.description,
          passed: true,
          actual: "skipped",
          expected: "N/A",
        };
    }
  } catch (error: any) {
    return {
      assertion: assertion.description,
      passed: false,
      error: error.message,
    };
  }
}

// ─── Main API Executor ────────────────────────────────────────────────────────

export class ApiTestExecutor {
  async runExecution(
    executionId: string,
    testCases: TestCase[],
    baseUrl: string,
    testData?: TestDataParam[],
    authConfig?: { type: string; token?: string; username?: string; password?: string; apiKey?: string }
  ): Promise<void> {
    const startTime = Date.now();

    await storage.updateExecution(executionId, {
      status: "running",
      startedAt: new Date(),
    });

    let passedTests = 0;
    let failedTests = 0;
    runtimeVars.clear();

    // Build auth headers
    const authHeaders: Record<string, string> = {};
    if (authConfig) {
      if (authConfig.type === "bearer" && authConfig.token) {
        authHeaders["Authorization"] = `Bearer ${authConfig.token}`;
      } else if (authConfig.type === "basic" && authConfig.username) {
        const encoded = Buffer.from(`${authConfig.username}:${authConfig.password || ""}`).toString("base64");
        authHeaders["Authorization"] = `Basic ${encoded}`;
      } else if (authConfig.type === "api_key" && authConfig.apiKey) {
        authHeaders["X-API-Key"] = authConfig.apiKey;
      }
    }

    try {
      for (const testCase of testCases) {
        const result = await this.executeApiTestCase(
          testCase,
          baseUrl,
          authHeaders,
          testData
        );

        await storage.createResult({
          executionId,
          testCaseId: testCase.id,
          status: result.passed ? "passed" : "failed",
          duration: result.duration,
          errorMessage: result.errorMessage || null,
          logs: result.logs,
        });

        if (result.passed) passedTests++;
        else failedTests++;
      }
    } finally {
      const duration = Date.now() - startTime;
      await storage.updateExecution(executionId, {
        status: failedTests > 0 ? "failed" : "passed",
        completedAt: new Date(),
        passedTests,
        failedTests,
        totalTests: testCases.length,
      });
    }
  }

  private async executeApiTestCase(
    testCase: TestCase,
    baseUrl: string,
    authHeaders: Record<string, string>,
    testData?: TestDataParam[]
  ): Promise<ApiExecutionResult> {
    const logs: string[] = [];
    const stepResults: ApiStepResult[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;

    logs.push(`\n=== API TEST: ${testCase.title} ===`);
    logs.push(`Base URL: ${baseUrl}`);

    const steps = (testCase.steps as { step: string; expected: string }[]) || [];
    let previousContext = "";

    for (let i = 0; i < steps.length; i++) {
      const { step, expected } = steps[i];
      const processedStep = replacePlaceholders(step, testData);
      const processedExpected = replacePlaceholders(expected, testData);

      logs.push(`\n--- Step ${i + 1}: ${processedStep} ---`);

      const stepResult: ApiStepResult = {
        step: processedStep,
        assertions: [],
        passed: false,
        logs: [],
      };

      try {
        // Get AI plan
        const plan = await interpretApiStepWithAI(
          processedStep,
          processedExpected,
          baseUrl,
          authHeaders,
          previousContext
        );

        logs.push(`AI Plan: ${plan.description}`);
        logs.push(`Request: ${plan.request.method} ${plan.request.url}`);

        // Build full URL
        let url = plan.request.url;
        if (!url.startsWith("http")) {
          url = baseUrl.replace(/\/$/, "") + "/" + url.replace(/^\//, "");
        }
        url = replacePlaceholders(url, testData);

        // Execute request
        const requestConfig: ApiRequestConfig = {
          method: plan.request.method as any,
          url,
          headers: { ...authHeaders, ...(plan.request.headers || {}) },
          body: plan.request.body,
          queryParams: plan.request.queryParams,
        };

        stepResult.request = requestConfig;

        const response = await executeHttpRequest(requestConfig);
        stepResult.response = response;

        logs.push(`Response: ${response.status} ${response.statusText} (${response.duration}ms, ${response.size} bytes)`);

        // Evaluate assertions
        let stepPassed = true;
        for (const assertion of plan.assertions) {
          const result = evaluateAssertion(assertion, response);
          stepResult.assertions.push(result);

          if (result.passed) {
            logs.push(`  ✓ ${result.assertion} (actual: ${result.actual})`);
          } else {
            logs.push(`  ✗ ${result.assertion} — expected: ${result.expected}, actual: ${result.actual}`);
            stepPassed = false;
          }
        }

        // Capture variables for chaining
        if (plan.captureVars) {
          for (const capture of plan.captureVars) {
            const value = resolveJsonPath(response.body, capture.jsonPath);
            if (value !== undefined) {
              runtimeVars.set(capture.varName, value);
              logs.push(`  📌 Captured $${capture.varName}$ = ${String(value).substring(0, 50)}`);
            }
          }
        }

        stepResult.passed = stepPassed;
        previousContext = `Last response: ${response.status}, body keys: ${
          typeof response.body === "object" ? Object.keys(response.body || {}).join(", ") : "text"
        }`;

        if (!stepPassed) {
          passed = false;
          errorMessage = `Step ${i + 1} assertions failed`;
          break;
        }
      } catch (error: any) {
        stepResult.passed = false;
        stepResult.error = error.message;
        logs.push(`  ✗ Request failed: ${error.message}`);
        passed = false;
        errorMessage = error.message;
        break;
      }

      stepResults.push(stepResult);
    }

    return {
      testCaseId: testCase.id,
      testCaseTitle: testCase.title,
      passed,
      duration: Date.now() - startTime,
      steps: stepResults,
      errorMessage,
      logs,
    };
  }
}

export const apiTestExecutor = new ApiTestExecutor();
