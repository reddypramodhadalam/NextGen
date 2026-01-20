import OpenAI from "openai";
import { db } from "./db";
import { platformSettings } from "@shared/schema";
import { eq, and } from "drizzle-orm";

type AiSettings = {
  useCustomLlm: boolean;
  bedrockEndpointUrl: string;
  bedrockAccessKey: string;
  bedrockModelId: string;
};

async function getAiSettings(): Promise<AiSettings> {
  const settings = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.category, "ai"));

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
  const modelId = settings.bedrockModelId;
  const endpoint = settings.bedrockEndpointUrl;
  const accessKey = settings.bedrockAccessKey;

  if (!endpoint) {
    throw new Error("API endpoint URL is required");
  }

  if (!accessKey) {
    throw new Error("Access key is required");
  }

  // Build the URL - append model path if model ID is provided
  let url: string;
  if (modelId) {
    url = `${endpoint.replace(/\/$/, "")}/model/${encodeURIComponent(modelId)}/invoke`;
  } else {
    url = endpoint;
  }

  const anthropicMessages = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: m.content }],
  }));

  const requestBody = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 4096,
    system: systemPrompt || "You are a helpful AI assistant.",
    messages: anthropicMessages,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessKey}`,
  };

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bedrock API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

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

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
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

  if (
    settings.useCustomLlm &&
    settings.bedrockEndpointUrl &&
    settings.bedrockAccessKey
  ) {
    return new CustomLlmClient(settings);
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
