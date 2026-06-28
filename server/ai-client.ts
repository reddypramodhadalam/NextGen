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
  systemPrompt?: string
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
    // 32K accommodates 25-35 detailed, knowledge-driven test cases without the
    // response being truncated mid-JSON (which forces a fall back to generic
    // rule-based steps). Most modern LLMs (GPT-4o, Claude 3.5, Llama 3.1 70B+)
    // support 8K-128K output. If your provider caps lower, override with the
    // LLM_MAX_TOKENS env var.
    max_tokens: parseInt(process.env.LLM_MAX_TOKENS || "32768", 10),
    temperature: 0.7,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessKey}`,
  };

  // Configurable timeout. Generating 15-20 detailed test cases can take 90-180s
  // on smaller models. Default 180s; override with LLM_TIMEOUT_MS.
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || "180000", 10);
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

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export interface AiClient {
  chat(messages: ChatMessage[], systemPrompt?: string): Promise<string>;
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

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
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
      // Match the custom LLM client - large enough for 25-35 detailed test cases
      // so the JSON response isn't truncated mid-stream.
      max_tokens: parseInt(process.env.LLM_MAX_TOKENS || "32768", 10),
    });

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

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    const filteredMessages = messages.filter((m) => m.role !== "system");
    return callCustomLlm(this.settings, filteredMessages, systemPrompt);
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
