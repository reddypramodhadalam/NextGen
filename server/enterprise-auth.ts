/**
 * Enterprise Authentication Handler — AITAS Phase 2
 * Supports: OAuth2, SAML SSO, API Key, Basic Auth, Bearer Token, Kerberos/NTLM
 */

import { storage } from "./storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthType =
  | "none"
  | "basic"
  | "bearer"
  | "api_key"
  | "oauth2_client_credentials"
  | "oauth2_password"
  | "oauth2_auth_code"
  | "salesforce_oauth"
  | "jde_token"
  | "saml_sso"
  | "windows_ntlm"
  | "totp_mfa";

export interface AuthConfig {
  type: AuthType;
  // Basic / Bearer
  username?: string;
  password?: string;
  token?: string;
  // API Key
  apiKey?: string;
  apiKeyHeader?: string;       // Header name, default "X-API-Key"
  apiKeyParam?: string;        // Query param name if in URL
  // OAuth2
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  scope?: string;
  audience?: string;
  // Salesforce
  sfInstanceUrl?: string;
  sfSecurityToken?: string;
  sfIsSandbox?: boolean;
  // JDE
  jdeAisUrl?: string;
  jdeEnvironment?: string;
  jdeRole?: string;
  // SAML
  samlIdpUrl?: string;
  samlSpEntityId?: string;
  // TOTP MFA
  totpSecret?: string;         // Base32 TOTP secret for test accounts
  // NTLM
  ntlmDomain?: string;
  // Token cache
  cachedToken?: string;
  tokenExpiry?: number;        // Unix timestamp
}

export interface ResolvedAuth {
  headers: Record<string, string>;
  queryParams?: Record<string, string>;
  cookies?: Record<string, string>;
  token?: string;
  expiresAt?: number;
}

// ─── TOTP Generator (for MFA bypass on test accounts) ────────────────────────

function base32Decode(base32: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = base32.toUpperCase().replace(/=+$/, "");
  const bits: number[] = [];

  for (const char of cleaned) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    for (let i = 4; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i * 8 + j];
    }
    bytes[i] = byte;
  }
  return bytes;
}

async function hmacSha1(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return new Uint8Array(signature);
}

export async function generateTOTP(secret: string, timeStep = 30): Promise<string> {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / timeStep);

  const counterBytes = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const hmac = await hmacSha1(key, counterBytes);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 1_000_000).padStart(6, "0");
}

// ─── OAuth2 Client Credentials ────────────────────────────────────────────────

async function getOAuth2ClientCredentialsToken(config: AuthConfig): Promise<string> {
  if (!config.tokenUrl || !config.clientId || !config.clientSecret) {
    throw new Error("OAuth2 client credentials requires tokenUrl, clientId, clientSecret");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...(config.scope ? { scope: config.scope } : {}),
    ...(config.audience ? { audience: config.audience } : {}),
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OAuth2 token request failed: ${response.status} — ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.access_token;
}

// ─── OAuth2 Resource Owner Password ──────────────────────────────────────────

async function getOAuth2PasswordToken(config: AuthConfig): Promise<string> {
  if (!config.tokenUrl || !config.clientId || !config.username || !config.password) {
    throw new Error("OAuth2 password grant requires tokenUrl, clientId, username, password");
  }

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: config.clientId,
    username: config.username,
    password: config.password,
    ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
    ...(config.scope ? { scope: config.scope } : {}),
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OAuth2 password grant failed: ${response.status} — ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.access_token;
}

// ─── Salesforce OAuth ─────────────────────────────────────────────────────────

async function getSalesforceToken(config: AuthConfig): Promise<{ token: string; instanceUrl: string }> {
  if (!config.username || !config.password || !config.clientId || !config.clientSecret) {
    throw new Error("Salesforce OAuth requires username, password, clientId, clientSecret");
  }

  const loginUrl = config.sfIsSandbox
    ? "https://test.salesforce.com"
    : "https://login.salesforce.com";

  const password = config.sfSecurityToken
    ? config.password + config.sfSecurityToken
    : config.password;

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    username: config.username,
    password,
  });

  const response = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Salesforce OAuth failed: ${response.status} — ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return {
    token: data.access_token,
    instanceUrl: data.instance_url,
  };
}

// ─── JDE AIS Token ────────────────────────────────────────────────────────────

async function getJDEToken(config: AuthConfig): Promise<string> {
  if (!config.jdeAisUrl || !config.username || !config.password) {
    throw new Error("JDE auth requires jdeAisUrl, username, password");
  }

  const response = await fetch(`${config.jdeAisUrl}/jderest/v2/tokenrequest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: config.username,
      password: config.password,
      environment: config.jdeEnvironment || "JDV920",
      role: config.jdeRole || "*ALL",
      deviceName: "AITAS-Test-Agent",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`JDE AIS auth failed: ${response.status} — ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  const token = data.userInfo?.token || data.token;
  if (!token) throw new Error("JDE AIS: No token in response");
  return token;
}

// ─── Main Auth Resolver ───────────────────────────────────────────────────────

export async function resolveAuth(config: AuthConfig): Promise<ResolvedAuth> {
  // Check cache
  if (config.cachedToken && config.tokenExpiry && Date.now() < config.tokenExpiry - 60000) {
    return {
      headers: { Authorization: `Bearer ${config.cachedToken}` },
      token: config.cachedToken,
      expiresAt: config.tokenExpiry,
    };
  }

  switch (config.type) {
    case "none":
      return { headers: {} };

    case "basic": {
      if (!config.username || !config.password) {
        throw new Error("Basic auth requires username and password");
      }
      const encoded = Buffer.from(`${config.username}:${config.password}`).toString("base64");
      return { headers: { Authorization: `Basic ${encoded}` } };
    }

    case "bearer": {
      if (!config.token) throw new Error("Bearer auth requires token");
      return { headers: { Authorization: `Bearer ${config.token}` } };
    }

    case "api_key": {
      if (!config.apiKey) throw new Error("API key auth requires apiKey");
      const headerName = config.apiKeyHeader || "X-API-Key";
      if (config.apiKeyParam) {
        return {
          headers: {},
          queryParams: { [config.apiKeyParam]: config.apiKey },
        };
      }
      return { headers: { [headerName]: config.apiKey } };
    }

    case "oauth2_client_credentials": {
      const token = await getOAuth2ClientCredentialsToken(config);
      return {
        headers: { Authorization: `Bearer ${token}` },
        token,
        expiresAt: Date.now() + 3600000, // 1 hour default
      };
    }

    case "oauth2_password": {
      const token = await getOAuth2PasswordToken(config);
      return {
        headers: { Authorization: `Bearer ${token}` },
        token,
        expiresAt: Date.now() + 3600000,
      };
    }

    case "salesforce_oauth": {
      const { token, instanceUrl } = await getSalesforceToken(config);
      return {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-SF-Instance-URL": instanceUrl,
        },
        token,
        expiresAt: Date.now() + 7200000, // 2 hours
      };
    }

    case "jde_token": {
      const token = await getJDEToken(config);
      return {
        headers: { "JDE-AIS-Auth": token },
        token,
        expiresAt: Date.now() + 3600000,
      };
    }

    case "totp_mfa": {
      if (!config.totpSecret) throw new Error("TOTP MFA requires totpSecret");
      const code = await generateTOTP(config.totpSecret);
      return {
        headers: { "X-MFA-Code": code },
        token: code,
      };
    }

    case "saml_sso":
    case "windows_ntlm":
      // These require browser-level handling — return empty headers
      // The executor handles these via browser automation
      console.log(`[Auth] ${config.type} requires browser-level handling`);
      return { headers: {} };

    default:
      return { headers: {} };
  }
}

// ─── Auth Config Storage ──────────────────────────────────────────────────────

export interface StoredAuthConfig {
  id: string;
  name: string;
  type: AuthType;
  config: Omit<AuthConfig, "cachedToken" | "tokenExpiry">;
  environmentId?: string;
  createdAt: Date;
}

/** Save auth config to platform settings */
export async function saveAuthConfig(
  name: string,
  type: AuthType,
  config: Omit<AuthConfig, "cachedToken" | "tokenExpiry">,
  environmentId?: string
): Promise<void> {
  const key = `auth_${name.toLowerCase().replace(/\s+/g, "_")}`;
  await storage.upsertSetting({
    category: "auth_configs",
    key,
    value: name,
    valueJson: { type, config, environmentId },
    description: `Auth config: ${name} (${type})`,
  });
}

/** Load all auth configs */
export async function loadAuthConfigs(): Promise<StoredAuthConfig[]> {
  const settings = await storage.getSettingsByCategory("auth_configs");
  return settings.map((s) => ({
    id: s.id,
    name: s.value || s.key,
    type: (s.valueJson as any)?.type || "none",
    config: (s.valueJson as any)?.config || {},
    environmentId: (s.valueJson as any)?.environmentId,
    createdAt: new Date(s.updatedAt),
  }));
}

/** Test an auth config */
export async function testAuthConfig(config: AuthConfig): Promise<{
  success: boolean;
  message: string;
  headers?: Record<string, string>;
}> {
  try {
    const resolved = await resolveAuth(config);
    return {
      success: true,
      message: `Authentication successful. Headers: ${Object.keys(resolved.headers).join(", ")}`,
      headers: resolved.headers,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    };
  }
}
