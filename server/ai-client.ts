import OpenAI from "openai";
import { sqliteConnection } from "./db-sqlite";

type AiSettings = {
  useCustomLlm: boolean;
  bedrockEndpointUrl: string;
  bedrockAccessKey: string;
  bedrockModelId: string;
};

async function getAiSettings(): Promise<AiSettings> {
  const settings = sqliteConnection.prepare(
    "SELECT * FROM platform_settings WHERE category = ?"
  ).all("ai") as any[];

  const result: AiSettings = {
    useCustomLlm: false,
    bedrockEndpointUrl: "",
    bedrockAccessKey: "",
    bedrockModelId: "",
  };

  for (const setting of settings) {
    if (setting.key === "useCustomLlm") {
      result.useCustomLlm = setting.value === "true";
    } else if (setting.key === "bedrockEndpointUrl") {
      result.bedrockEndpointUrl = setting.value || "";
    } else if (setting.key === "bedrockAccessKey") {
      result.bedrockAccessKey = setting.value || "";
    } else if (setting.key === "bedrockModelId") {
      result.bedrockModelId = setting.value || "";
    }
  }

  return result;
}

async function callCustomLlm(
  settings: AiSettings,
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string,
  opts?: { timeoutMs?: number; maxAttempts?: number; maxTokens?: number }
): Promise<string> {
  const modelId = settings.bedrockModelId || "gpt-4";
  const endpoint = settings.bedrockEndpointUrl;
  const accessKey = settings.bedrockAccessKey;

  if (!endpoint) {
    throw new Error("API endpoint URL is required");
  }

  if (!accessKey) {
    throw new Error("Access key is required");
  }

  // Build the URL for OpenAI-compatible chat completions endpoint
  const url = `${endpoint.replace(/\/$/, "")}/chat/completions`;

  // Build OpenAI-compatible messages format
  const openaiMessages: Array<{ role: string; content: string }> = [];
  
  if (systemPrompt) {
    openaiMessages.push({ role: "system", content: systemPrompt });
  }
  
  for (const m of messages) {
    openaiMessages.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    });
  }

  const requestBody = JSON.stringify({
    model: modelId,
    messages: openaiMessages,
    // Output length is the #1 driver of latency (~50 tok/s on the Baxter test
    // gateway), so a per-call `opts.maxTokens` (used by the fail-fast, per-section
    // test generator) takes precedence over the large global default. 32K is only
    // for non-interactive/global flows that must not truncate a big JSON dump.
    max_tokens: opts?.maxTokens ?? parseInt(process.env.LLM_MAX_TOKENS || "32768", 10),
    temperature: 0.7,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessKey}`,
  };

  // Configurable timeout. Generating 15-20 detailed test cases can take 90-180s
  // on smaller models. Default 180s; override with LLM_TIMEOUT_MS. A per-call
  // `opts.timeoutMs` (used by the fail-fast test generator) takes precedence so
  // interactive generation drops a hung gateway call quickly instead of waiting
  // the full 5-minute healing/global budget.
  const timeoutMs = opts?.timeoutMs ?? parseInt(process.env.LLM_TIMEOUT_MS || "180000", 10);

  // Transient gateway failures (502/503/504), rate limits (429) and network
  // timeouts are common on hosted LLM gateways and usually succeed on retry.
  // Retrying with exponential backoff keeps map-reduce sections and single-shot
  // calls from collapsing to the generic rule-based fallback on a momentary blip
  // (observed: intermittent 504 Gateway Time-out even on tiny requests).
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? parseInt(process.env.LLM_MAX_RETRIES || "3", 10));
  const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
  const backoffFor = (attempt: number) => Math.min(8000, 500 * 2 ** (attempt - 1));

  let lastErr: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: requestBody,
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      // Network error or timeout abort — retryable.
      clearTimeout(timeout);
      lastErr =
        fetchErr?.name === "AbortError"
          ? new Error(`LLM request timed out after ${timeoutMs}ms`)
          : fetchErr;
      if (attempt < maxAttempts) {
        const backoff = backoffFor(attempt);
        console.warn(`[AI] LLM call failed (attempt ${attempt}/${maxAttempts}): ${lastErr.message}. Retrying in ${backoff}ms...`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw lastErr;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      let errorText = await response.text();
      // Sanitize error: if the remote API returned a JSON error, extract the message
      try {
        const errJson = JSON.parse(errorText);
        // Prefer common fields, otherwise stringify object
        if (errJson.message) {
          errorText = errJson.message;
        } else if (errJson.error) {
          errorText = typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson.error);
        } else if (errJson.errors) {
          if (Array.isArray(errJson.errors)) {
            errorText = errJson.errors.map((e: any) => (e.message || JSON.stringify(e))).join('; ');
          } else {
            errorText = JSON.stringify(errJson.errors);
          }
        } else {
          // Fallback: stringify entire JSON so it's readable
          errorText = JSON.stringify(errJson);
        }
      } catch {
        // errorText is plain text — use as-is but truncate if very long
        if (errorText && errorText.length > 300) errorText = errorText.substring(0, 300) + "...";
      }

      // Retry transient gateway/rate-limit statuses; fail fast on 4xx auth/validation.
      if (RETRYABLE_STATUS.has(response.status) && attempt < maxAttempts) {
        const backoff = backoffFor(attempt);
        console.warn(`[AI] LLM gateway ${response.status} (attempt ${attempt}/${maxAttempts}). Retrying in ${backoff}ms...`);
        lastErr = new Error(`LLM API error: ${response.status} - ${errorText}`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Handle OpenAI-compatible response format
    if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
      return data.choices[0]?.message?.content || "";
    }

    // Fallback for Anthropic-style response
    if (data.content && Array.isArray(data.content) && data.content.length > 0) {
      return data.content[0].text || "";
    }

    return "";
  }

  // Exhausted all retry attempts.
  throw lastErr || new Error("LLM API error: exhausted retries");
}

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

/** Per-call overrides so interactive flows (e.g. test generation) can fail fast
 *  on a slow/flaky gateway instead of inheriting the long global healing budget. */
export type ChatOptions = {
  /** Abort a single attempt after this many ms. */
  timeoutMs?: number;
  /** Total attempts including the first (transient errors are retried). */
  maxAttempts?: number;
  /** Cap the model's output tokens for THIS call. Output length is the single
   *  biggest driver of latency (~50 tok/s on the Baxter gateway), so interactive
   *  generation caps this low (right-sized per section) to finish well under the
   *  per-call timeout instead of trying to emit a 20K-token exhaustive dump. */
  maxTokens?: number;
};

export interface AiClient {
  chat(messages: ChatMessage[], systemPrompt?: string, opts?: ChatOptions): Promise<string>;
  isUsingCustomLlm(): boolean;
}

class OpenAiClient implements AiClient {
  private client: OpenAI;
  private hasApiKey: boolean;

  constructor() {
    // Check all common OpenAI key env var names
    const apiKey =
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.OPENAI_KEY;

    this.hasApiKey = !!apiKey;
    this.client = new OpenAI({
      apiKey: apiKey || "sk-missing", // Placeholder to avoid errors in constructor
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
    });
  }

  async chat(messages: ChatMessage[], systemPrompt?: string, opts?: ChatOptions): Promise<string> {
    // If no API key, reject immediately so fallback kicks in
    if (!this.hasApiKey) {
      throw new Error("Missing credentials: OPENAI_API_KEY not configured");
    }

    const openaiMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];

    if (systemPrompt) {
      openaiMessages.push({ role: "system", content: systemPrompt });
    }

    for (const msg of messages) {
      openaiMessages.push({ role: msg.role, content: msg.content });
    }

    const response = await this.client.chat.completions.create({
      model: "gpt-4o",
      messages: openaiMessages,
      temperature: 0.7,
      // A per-call cap (interactive generation) takes precedence; otherwise the
      // large global default avoids truncating a big JSON dump.
      max_tokens: opts?.maxTokens ?? parseInt(process.env.LLM_MAX_TOKENS || "32768", 10),
    }, opts?.timeoutMs ? { timeout: opts.timeoutMs } : undefined);

    return response.choices[0]?.message?.content || "";
  }

  isUsingCustomLlm(): boolean {
    return false;
  }
}

class CustomLlmClient implements AiClient {
  private settings: AiSettings;

  constructor(settings: AiSettings) {
    this.settings = settings;
  }

  async chat(messages: ChatMessage[], systemPrompt?: string, opts?: ChatOptions): Promise<string> {
    const filteredMessages = messages.filter((m) => m.role !== "system");
    return callCustomLlm(this.settings, filteredMessages, systemPrompt, opts);
  }

  isUsingCustomLlm(): boolean {
    return true;
  }
}

export async function getAiClient(): Promise<AiClient> {
  const settings = await getAiSettings();

  // 1. DB-configured custom LLM (set via Settings UI)
  if (
    settings.useCustomLlm &&
    settings.bedrockEndpointUrl &&
    settings.bedrockAccessKey
  ) {
    return new CustomLlmClient(settings);
  }

  // 2. Environment-variable custom LLM (LLM_API_URL + LLM_BEARER_TOKEN)
  const envLlmUrl   = process.env.LLM_API_URL;
  const envLlmToken = process.env.LLM_BEARER_TOKEN;
  const envLlmModel = process.env.LLM_MODEL_ID || process.env.LLM_APP_NAME || process.env.LLM_APPLICATION;
  if (envLlmUrl && envLlmToken) {
    if (!envLlmModel) {
      console.warn("[AI] LLM_API_URL and LLM_BEARER_TOKEN are set but LLM_MODEL_ID is missing. Add LLM_MODEL_ID=<your-app-name> to .env");
    }
    return new CustomLlmClient({
      useCustomLlm:       true,
      bedrockEndpointUrl: envLlmUrl,
      bedrockAccessKey:   envLlmToken,
      bedrockModelId:     envLlmModel || "gpt-4o",
    });
  }

  // 3. Standard OpenAI key from env (OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY)
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  
  // If no API key is configured, log it and return a client that will timeout quickly
  if (!apiKey) {
    console.warn("[AI] No OPENAI_API_KEY configured. AI features will use rule-based fallback.");
  }
  
  return new OpenAiClient();
}

export async function generateAiResponse(
  userPrompt: string,
  systemPrompt?: string
): Promise<string> {
  const client = await getAiClient();
  return client.chat([{ role: "user", content: userPrompt }], systemPrompt);
}
