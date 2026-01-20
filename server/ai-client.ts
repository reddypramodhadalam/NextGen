import OpenAI from "openai";
import { db } from "./db";
import { platformSettings } from "@shared/schema";
import { eq, and } from "drizzle-orm";

type AiSettings = {
  useCustomLlm: boolean;
  bedrockEndpointUrl: string;
  bedrockAccessKey: string;
  bedrockSecretKey: string;
  bedrockRegion: string;
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
    bedrockSecretKey: "",
    bedrockRegion: "us-east-1",
    bedrockModelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  };

  for (const setting of settings) {
    if (setting.key === "useCustomLlm") {
      result.useCustomLlm = setting.value === "true";
    } else if (setting.key === "bedrockEndpointUrl") {
      result.bedrockEndpointUrl = setting.value || "";
    } else if (setting.key === "bedrockAccessKey") {
      result.bedrockAccessKey = setting.value || "";
    } else if (setting.key === "bedrockSecretKey") {
      result.bedrockSecretKey = setting.value || "";
    } else if (setting.key === "bedrockRegion") {
      result.bedrockRegion = setting.value || "us-east-1";
    } else if (setting.key === "bedrockModelId") {
      result.bedrockModelId = setting.value || "anthropic.claude-3-sonnet-20240229-v1:0";
    }
  }

  return result;
}

async function createBedrockSignature(
  method: string,
  url: URL,
  body: string,
  accessKey: string,
  secretKey: string,
  region: string
): Promise<Record<string, string>> {
  const crypto = await import("crypto");
  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const service = "bedrock";

  const canonicalUri = url.pathname;
  const canonicalQuerystring = "";
  const host = url.host;

  const payloadHash = crypto.createHash("sha256").update(body).digest("hex");

  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n`;

  const signedHeaders = "content-type;host;x-amz-date";

  const canonicalRequest =
    `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const stringToSign =
    `${algorithm}\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;

  const getSignatureKey = (
    key: string,
    dateStamp: string,
    regionName: string,
    serviceName: string
  ) => {
    const kDate = crypto
      .createHmac("sha256", `AWS4${key}`)
      .update(dateStamp)
      .digest();
    const kRegion = crypto.createHmac("sha256", kDate).update(regionName).digest();
    const kService = crypto.createHmac("sha256", kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
    return kSigning;
  };

  const signingKey = getSignatureKey(secretKey, dateStamp, region, service);
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  const authorizationHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    Authorization: authorizationHeader,
  };
}

async function callBedrock(
  settings: AiSettings,
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string
): Promise<string> {
  const modelId = settings.bedrockModelId;
  const region = settings.bedrockRegion;

  let endpoint = settings.bedrockEndpointUrl;
  if (!endpoint) {
    endpoint = `https://bedrock-runtime.${region}.amazonaws.com`;
  }

  const url = new URL(`${endpoint}/model/${encodeURIComponent(modelId)}/invoke`);

  const anthropicMessages = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  const requestBody = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 4096,
    system: systemPrompt || "You are a helpful AI assistant.",
    messages: anthropicMessages,
  });

  const headers = await createBedrockSignature(
    "POST",
    url,
    requestBody,
    settings.bedrockAccessKey,
    settings.bedrockSecretKey,
    region
  );

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

class BedrockClient implements AiClient {
  private settings: AiSettings;

  constructor(settings: AiSettings) {
    this.settings = settings;
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    const filteredMessages = messages.filter((m) => m.role !== "system");
    return callBedrock(this.settings, filteredMessages, systemPrompt);
  }

  isUsingCustomLlm(): boolean {
    return true;
  }
}

export async function getAiClient(): Promise<AiClient> {
  const settings = await getAiSettings();

  if (
    settings.useCustomLlm &&
    settings.bedrockAccessKey &&
    settings.bedrockSecretKey
  ) {
    return new BedrockClient(settings);
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
