/**
 * GraphQL & SOAP Deep Testing Engine — AITAS Phase 6
 * Full introspection, schema validation, WSDL parsing, WS-Security
 */

import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestDataParam } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GraphQLConfig {
  endpoint: string;
  headers?: Record<string, string>;
  authToken?: string;
  introspect?: boolean;
}

export interface SOAPConfig {
  wsdlUrl?: string;
  endpoint: string;
  headers?: Record<string, string>;
  username?: string;
  password?: string;
  wsSecurityEnabled?: boolean;
  soapVersion?: "1.1" | "1.2";
}

export interface GraphQLOperation {
  type: "query" | "mutation" | "subscription";
  name: string;
  document: string;
  variables?: Record<string, any>;
  expectedFields?: string[];
  expectedErrors?: boolean;
}

export interface SOAPOperation {
  action: string;
  soapAction?: string;
  body: string;
  expectedXPath?: string;
  expectedValue?: string;
}

export interface DeepTestResult {
  operationName: string;
  passed: boolean;
  duration: number;
  request: any;
  response: any;
  assertions: Array<{ name: string; passed: boolean; actual?: string; expected?: string }>;
  errors?: string[];
  logs: string[];
}

// ─── GraphQL Introspection ────────────────────────────────────────────────────

const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      name kind
      fields { name type { name kind ofType { name kind } } }
      inputFields { name type { name kind ofType { name kind } } }
    }
  }
}`;

async function introspectSchema(config: GraphQLConfig): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers || {}),
  };
  if (config.authToken) headers["Authorization"] = `Bearer ${config.authToken}`;

  const res = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  return data?.data?.__schema || null;
}

// ─── AI GraphQL Plan Generator ────────────────────────────────────────────────

async function generateGraphQLPlan(
  step: string,
  expected: string,
  endpoint: string,
  schema: any
): Promise<GraphQLOperation[]> {
  const aiClient = await getAiClient();

  const schemaHint = schema
    ? `Available types: ${schema.types?.filter((t: any) => !t.name.startsWith("__")).map((t: any) => t.name).slice(0, 20).join(", ")}`
    : "Schema not available";

  const systemPrompt = `You are a GraphQL testing expert. Generate test operations from natural language steps.

Return ONLY a JSON array:
[{
  "type": "query|mutation|subscription",
  "name": "OperationName",
  "document": "query GetUser($id: ID!) { user(id: $id) { id name email } }",
  "variables": { "id": "1" },
  "expectedFields": ["user.id", "user.name"],
  "expectedErrors": false
}]

RULES:
1. Always use named operations
2. Include all required variables
3. expectedFields: dot-notation paths to verify in response
4. expectedErrors: true if testing error cases
5. For mutations: include input variables
6. Test both happy path and error cases
7. Use fragments for reusable field sets
8. ${schemaHint}

Only return the JSON array.`;

  const userPrompt = `Endpoint: ${endpoint}\nStep: "${step}"\nExpected: "${expected}"`;

  try {
    const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]) as GraphQLOperation[];
  } catch (e: any) {
    console.error("[GraphQL] AI plan failed:", e.message);
  }
  return [];
}

// ─── GraphQL Executor ─────────────────────────────────────────────────────────

async function executeGraphQLOperation(
  op: GraphQLOperation,
  config: GraphQLConfig
): Promise<DeepTestResult> {
  const logs: string[] = [];
  const startTime = Date.now();
  const assertions: DeepTestResult["assertions"] = [];
  let passed = true;

  logs.push(`[GraphQL] ${op.type.toUpperCase()} ${op.name}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers || {}),
  };
  if (config.authToken) headers["Authorization"] = `Bearer ${config.authToken}`;

  const body = JSON.stringify({ query: op.document, variables: op.variables || {}, operationName: op.name });

  let responseData: any = null;
  let responseStatus = 0;

  try {
    const res = await fetch(config.endpoint, {
      method: "POST", headers, body,
      signal: AbortSignal.timeout(30000),
    });
    responseStatus = res.status;
    responseData = await res.json();
    logs.push(`  Status: ${responseStatus}`);

    // Assert HTTP status
    const httpOk = responseStatus >= 200 && responseStatus < 300;
    assertions.push({ name: "HTTP 2xx", passed: httpOk, actual: String(responseStatus), expected: "2xx" });
    if (!httpOk) passed = false;

    // Assert no unexpected errors
    const hasErrors = !!(responseData?.errors?.length);
    if (!op.expectedErrors && hasErrors) {
      assertions.push({
        name: "No GraphQL errors",
        passed: false,
        actual: responseData.errors.map((e: any) => e.message).join("; "),
        expected: "No errors",
      });
      passed = false;
    } else if (op.expectedErrors && !hasErrors) {
      assertions.push({ name: "Expected errors present", passed: false, actual: "No errors", expected: "Errors" });
      passed = false;
    } else {
      assertions.push({ name: op.expectedErrors ? "Expected errors present" : "No GraphQL errors", passed: true });
    }

    // Assert expected fields
    if (op.expectedFields && responseData?.data) {
      for (const fieldPath of op.expectedFields) {
        const parts = fieldPath.split(".");
        let val: any = responseData.data;
        for (const p of parts) val = val?.[p];
        const fieldExists = val !== undefined && val !== null;
        assertions.push({
          name: `Field ${fieldPath} exists`,
          passed: fieldExists,
          actual: fieldExists ? String(val).substring(0, 50) : "undefined",
          expected: "exists",
        });
        if (!fieldExists) passed = false;
      }
    }

    logs.push(`  Assertions: ${assertions.filter((a) => a.passed).length}/${assertions.length} passed`);
  } catch (err: any) {
    logs.push(`  Error: ${err.message}`);
    passed = false;
    assertions.push({ name: "Request succeeded", passed: false, actual: err.message, expected: "success" });
  }

  return {
    operationName: op.name,
    passed,
    duration: Date.now() - startTime,
    request: { query: op.document, variables: op.variables },
    response: responseData,
    assertions,
    logs,
  };
}

// ─── SOAP Envelope Builder ────────────────────────────────────────────────────

function buildSOAPEnvelope(body: string, config: SOAPConfig): string {
  const ns = config.soapVersion === "1.2"
    ? "http://www.w3.org/2003/05/soap-envelope"
    : "http://schemas.xmlsoap.org/soap/envelope/";

  let securityHeader = "";
  if (config.wsSecurityEnabled && config.username) {
    const ts = new Date().toISOString();
    securityHeader = `
  <soapenv:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${config.username}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${config.password || ""}</wsse:Password>
        <wsu:Created xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${ts}</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="${ns}">${securityHeader}
  <soapenv:Body>
    ${body}
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ─── XPath Evaluator (simple) ─────────────────────────────────────────────────

function evaluateXPathSimple(xml: string, xpath: string): string | null {
  // Simple tag extraction: //TagName or //ns:TagName
  const tagMatch = xpath.match(/\/\/(?:\w+:)?(\w+)(?:\[.*?\])?$/);
  if (!tagMatch) return null;
  const tag = tagMatch[1];
  const regex = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)<`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

// ─── AI SOAP Plan Generator ───────────────────────────────────────────────────

async function generateSOAPPlan(
  step: string,
  expected: string,
  config: SOAPConfig
): Promise<SOAPOperation[]> {
  const aiClient = await getAiClient();

  const systemPrompt = `You are a SOAP web service testing expert. Generate SOAP operations from natural language.

Return ONLY a JSON array:
[{
  "action": "operation description",
  "soapAction": "http://service.example.com/GetUser",
  "body": "<GetUser xmlns=\\"http://service.example.com/\\"><UserId>1</UserId></GetUser>",
  "expectedXPath": "//GetUserResult/Name",
  "expectedValue": "John Doe"
}]

RULES:
1. body: the SOAP body content (without envelope — it will be wrapped)
2. soapAction: the SOAPAction HTTP header value
3. expectedXPath: XPath to extract from response
4. expectedValue: expected text content at that XPath
5. Use proper XML namespaces
6. For WS-Security: credentials are handled automatically
7. Test both success and fault responses

Only return the JSON array.`;

  const userPrompt = `Endpoint: ${config.endpoint}\nWSDL: ${config.wsdlUrl || "not provided"}\nStep: "${step}"\nExpected: "${expected}"`;

  try {
    const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]) as SOAPOperation[];
  } catch (e: any) {
    console.error("[SOAP] AI plan failed:", e.message);
  }
  return [];
}

// ─── SOAP Executor ────────────────────────────────────────────────────────────

async function executeSOAPOperation(
  op: SOAPOperation,
  config: SOAPConfig
): Promise<DeepTestResult> {
  const logs: string[] = [];
  const startTime = Date.now();
  const assertions: DeepTestResult["assertions"] = [];
  let passed = true;

  logs.push(`[SOAP] ${op.action}`);

  const envelope = buildSOAPEnvelope(op.body, config);
  const contentType = config.soapVersion === "1.2"
    ? "application/soap+xml; charset=utf-8"
    : "text/xml; charset=utf-8";

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    ...(config.headers || {}),
  };
  if (op.soapAction) headers["SOAPAction"] = `"${op.soapAction}"`;

  let responseText = "";
  let responseStatus = 0;

  try {
    const res = await fetch(config.endpoint, {
      method: "POST", headers, body: envelope,
      signal: AbortSignal.timeout(60000),
    });
    responseStatus = res.status;
    responseText = await res.text();
    logs.push(`  Status: ${responseStatus}, Size: ${responseText.length} bytes`);

    // Assert HTTP status
    const httpOk = responseStatus >= 200 && responseStatus < 300;
    assertions.push({ name: "HTTP 2xx", passed: httpOk, actual: String(responseStatus), expected: "2xx" });
    if (!httpOk) passed = false;

    // Assert no SOAP fault
    const hasFault = responseText.includes("<faultcode>") || responseText.includes("<soap:Fault>") || responseText.includes("<env:Fault>");
    if (hasFault) {
      const faultMatch = responseText.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/i);
      const faultMsg = faultMatch ? faultMatch[1] : "SOAP Fault";
      assertions.push({ name: "No SOAP fault", passed: false, actual: faultMsg, expected: "No fault" });
      passed = false;
    } else {
      assertions.push({ name: "No SOAP fault", passed: true });
    }

    // Assert XPath value
    if (op.expectedXPath) {
      const actual = evaluateXPathSimple(responseText, op.expectedXPath);
      if (op.expectedValue) {
        const xpathPassed = actual !== null && actual.includes(op.expectedValue);
        assertions.push({
          name: `XPath ${op.expectedXPath}`,
          passed: xpathPassed,
          actual: actual || "not found",
          expected: op.expectedValue,
        });
        if (!xpathPassed) passed = false;
      } else {
        assertions.push({ name: `XPath ${op.expectedXPath} exists`, passed: actual !== null, actual: actual || "not found", expected: "exists" });
        if (actual === null) passed = false;
      }
    }

    logs.push(`  Assertions: ${assertions.filter((a) => a.passed).length}/${assertions.length} passed`);
  } catch (err: any) {
    logs.push(`  Error: ${err.message}`);
    passed = false;
    assertions.push({ name: "Request succeeded", passed: false, actual: err.message, expected: "success" });
  }

  return {
    operationName: op.action,
    passed,
    duration: Date.now() - startTime,
    request: { envelope, soapAction: op.soapAction },
    response: responseText,
    assertions,
    logs,
  };
}

// ─── Main Deep API Executor ───────────────────────────────────────────────────

export class DeepAPIExecutor {
  private graphqlSchema: any = null;

  async runGraphQLExecution(
    executionId: string,
    testCases: TestCase[],
    config: GraphQLConfig,
    testData?: TestDataParam[]
  ): Promise<void> {
    const startTime = Date.now();
    await storage.updateExecution(executionId, { status: "running", startedAt: new Date() });

    let passedTests = 0;
    let failedTests = 0;
    const allLogs: string[] = [];

    try {
      // Introspect schema if enabled
      if (config.introspect !== false) {
        try {
          this.graphqlSchema = await introspectSchema(config);
          allLogs.push(`[GraphQL] Schema introspected: ${this.graphqlSchema?.types?.length || 0} types`);
        } catch (e: any) {
          allLogs.push(`[GraphQL] Introspection failed (continuing): ${e.message}`);
        }
      }

      for (const testCase of testCases) {
        const steps = (testCase.steps as { step: string; expected: string }[]) || [];
        const stepLogs: string[] = [];
        let tcPassed = true;
        let tcError: string | undefined;
        const tcStart = Date.now();

        for (const { step, expected } of steps) {
          const ops = await generateGraphQLPlan(step, expected, config.endpoint, this.graphqlSchema);
          for (const op of ops) {
            const result = await executeGraphQLOperation(op, config);
            stepLogs.push(...result.logs);
            if (!result.passed) { tcPassed = false; tcError = `${op.name} failed`; }
          }
        }

        await storage.createResult({
          executionId, testCaseId: testCase.id,
          status: tcPassed ? "passed" : "failed",
          duration: Date.now() - tcStart,
          errorMessage: tcError || null,
          logs: stepLogs,
        });
        if (tcPassed) passedTests++; else failedTests++;
        allLogs.push(...stepLogs);
      }
    } catch (err: any) {
      allLogs.push(`[GraphQL] Fatal: ${err.message}`);
      failedTests = testCases.length - passedTests;
    } finally {
      await storage.updateExecution(executionId, {
        status: failedTests > 0 ? "failed" : "passed",
        completedAt: new Date(), passedTests, failedTests, totalTests: testCases.length,
      });
    }
  }

  async runSOAPExecution(
    executionId: string,
    testCases: TestCase[],
    config: SOAPConfig,
    testData?: TestDataParam[]
  ): Promise<void> {
    const startTime = Date.now();
    await storage.updateExecution(executionId, { status: "running", startedAt: new Date() });

    let passedTests = 0;
    let failedTests = 0;
    const allLogs: string[] = [];

    try {
      for (const testCase of testCases) {
        const steps = (testCase.steps as { step: string; expected: string }[]) || [];
        const stepLogs: string[] = [];
        let tcPassed = true;
        let tcError: string | undefined;
        const tcStart = Date.now();

        for (const { step, expected } of steps) {
          const ops = await generateSOAPPlan(step, expected, config);
          for (const op of ops) {
            const result = await executeSOAPOperation(op, config);
            stepLogs.push(...result.logs);
            if (!result.passed) { tcPassed = false; tcError = `${op.action} failed`; }
          }
        }

        await storage.createResult({
          executionId, testCaseId: testCase.id,
          status: tcPassed ? "passed" : "failed",
          duration: Date.now() - tcStart,
          errorMessage: tcError || null,
          logs: stepLogs,
        });
        if (tcPassed) passedTests++; else failedTests++;
        allLogs.push(...stepLogs);
      }
    } catch (err: any) {
      allLogs.push(`[SOAP] Fatal: ${err.message}`);
      failedTests = testCases.length - passedTests;
    } finally {
      await storage.updateExecution(executionId, {
        status: failedTests > 0 ? "failed" : "passed",
        completedAt: new Date(), passedTests, failedTests, totalTests: testCases.length,
      });
    }
  }

  /** Introspect a GraphQL schema and return type info */
  async introspectGraphQL(endpoint: string, authToken?: string): Promise<any> {
    return introspectSchema({ endpoint, authToken });
  }

  /** Parse WSDL and return operations list */
  async parseWSDL(wsdlUrl: string): Promise<{ operations: string[]; targetNamespace: string }> {
    try {
      const res = await fetch(wsdlUrl, { signal: AbortSignal.timeout(30000) });
      const xml = await res.text();
      const operations: string[] = [];
      const opMatches = xml.matchAll(/<(?:wsdl:)?operation\s+name="([^"]+)"/g);
      for (const m of opMatches) operations.push(m[1]);
      const nsMatch = xml.match(/targetNamespace="([^"]+)"/);
      return { operations: [...new Set(operations)], targetNamespace: nsMatch?.[1] || "" };
    } catch (e: any) {
      return { operations: [], targetNamespace: "" };
    }
  }
}

export const deepAPIExecutor = new DeepAPIExecutor();
