/**
 * Test Data Factory — AITAS Phase 6
 * AI-powered synthetic data generation, pool management, and data masking
 */

import { getAiClient } from "./ai-client";
import { storage } from "./storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DataType =
  | "person" | "address" | "company" | "finance" | "product"
  | "order" | "user_account" | "medical" | "vehicle" | "custom";

export interface DataSchema {
  type: DataType;
  count?: number;                 // Records to generate, default 10
  locale?: string;                // e.g. "en-US", "de-DE", "ja-JP"
  constraints?: Record<string, any>;  // Field-level constraints
  customFields?: Array<{
    name: string;
    type: "string" | "number" | "boolean" | "date" | "email" | "phone" | "uuid" | "enum";
    options?: string[];           // For enum type
    min?: number; max?: number;   // For number/date
    pattern?: string;             // Regex pattern for string
    nullable?: boolean;
  }>;
  maskFields?: string[];          // Fields to mask in output
  seedValue?: number;             // For reproducible generation
}

export interface GeneratedDataSet {
  id: string;
  name: string;
  schema: DataSchema;
  records: Record<string, any>[];
  generatedAt: Date;
  recordCount: number;
}

export interface DataPoolEntry {
  key: string;
  value: string;
  type: string;
  used: boolean;
  usedAt?: Date;
}

// ─── Built-in Data Generators ─────────────────────────────────────────────────

const FIRST_NAMES = ["James","Mary","John","Patricia","Robert","Jennifer","Michael","Linda","William","Barbara","David","Susan","Richard","Jessica","Joseph","Sarah","Thomas","Karen","Charles","Lisa"];
const LAST_NAMES = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin"];
const DOMAINS = ["gmail.com","yahoo.com","outlook.com","company.com","enterprise.org","business.net"];
const STREETS = ["Main St","Oak Ave","Maple Dr","Cedar Ln","Pine Rd","Elm St","Washington Blvd","Park Ave","Lake Dr","River Rd"];
const CITIES = ["New York","Los Angeles","Chicago","Houston","Phoenix","Philadelphia","San Antonio","San Diego","Dallas","San Jose"];
const STATES = ["NY","CA","IL","TX","AZ","PA","TX","CA","TX","CA"];
const COMPANIES = ["Acme Corp","TechVision Inc","Global Solutions","Nexus Systems","Apex Industries","Summit Group","Pinnacle LLC","Horizon Tech","Vertex Corp","Catalyst Inc"];
const PRODUCTS = ["Widget Pro","DataSync","CloudManager","SecureVault","FlowEngine","SmartDash","AutoPilot","NexusCore","VisionAI","StreamLine"];

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}
function randDate(start: Date, end: Date): string {
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString().split("T")[0];
}
function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function maskValue(value: string, type: string): string {
  if (type === "email") return value.replace(/(.{2}).*@/, "$1***@");
  if (type === "phone") return value.replace(/\d(?=\d{4})/g, "*");
  if (type === "ssn" || type === "credit_card") return value.replace(/\d(?=\d{4})/g, "*");
  return value.substring(0, 2) + "***" + value.substring(value.length - 2);
}

function generatePerson(locale = "en-US"): Record<string, any> {
  const firstName = rand(FIRST_NAMES);
  const lastName = rand(LAST_NAMES);
  const domain = rand(DOMAINS);
  return {
    id: uuid(),
    firstName, lastName,
    fullName: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randInt(1, 999)}@${domain}`,
    phone: `+1-${randInt(200, 999)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    dateOfBirth: randDate(new Date("1950-01-01"), new Date("2000-12-31")),
    gender: rand(["Male", "Female", "Non-binary"]),
    ssn: `${randInt(100, 999)}-${randInt(10, 99)}-${randInt(1000, 9999)}`,
  };
}

function generateAddress(): Record<string, any> {
  const stateIdx = randInt(0, STATES.length - 1);
  return {
    id: uuid(),
    street: `${randInt(100, 9999)} ${rand(STREETS)}`,
    city: CITIES[stateIdx] || rand(CITIES),
    state: STATES[stateIdx] || rand(STATES),
    zipCode: String(randInt(10000, 99999)),
    country: "US",
    latitude: randFloat(25, 48, 6),
    longitude: randFloat(-124, -67, 6),
  };
}

function generateCompany(): Record<string, any> {
  const name = rand(COMPANIES);
  return {
    id: uuid(),
    name,
    legalName: `${name} LLC`,
    taxId: `${randInt(10, 99)}-${randInt(1000000, 9999999)}`,
    industry: rand(["Technology", "Finance", "Healthcare", "Retail", "Manufacturing", "Education"]),
    employees: randInt(10, 50000),
    revenue: randFloat(100000, 10000000, 0),
    founded: randInt(1950, 2020),
    website: `https://www.${name.toLowerCase().replace(/\s+/g, "")}.com`,
    phone: `+1-${randInt(200, 999)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
  };
}

function generateFinance(): Record<string, any> {
  return {
    id: uuid(),
    accountNumber: String(randInt(1000000000, 9999999999)),
    routingNumber: String(randInt(100000000, 999999999)),
    creditCard: `${randInt(4000, 4999)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
    cvv: String(randInt(100, 999)),
    expiryDate: `${String(randInt(1, 12)).padStart(2, "0")}/${randInt(25, 30)}`,
    balance: randFloat(0, 100000, 2),
    currency: rand(["USD", "EUR", "GBP", "JPY", "CAD"]),
    iban: `US${randInt(10, 99)}${randInt(1000000000, 9999999999)}`,
  };
}

function generateProduct(): Record<string, any> {
  const name = rand(PRODUCTS);
  return {
    id: uuid(),
    sku: `SKU-${randInt(10000, 99999)}`,
    name,
    description: `${name} - Enterprise grade solution for modern businesses`,
    price: randFloat(9.99, 9999.99, 2),
    currency: "USD",
    category: rand(["Software", "Hardware", "Service", "Subscription", "License"]),
    stock: randInt(0, 10000),
    weight: randFloat(0.1, 50, 2),
    dimensions: `${randInt(5, 100)}x${randInt(5, 100)}x${randInt(5, 100)}cm`,
    active: Math.random() > 0.1,
  };
}

function generateOrder(): Record<string, any> {
  return {
    id: uuid(),
    orderNumber: `ORD-${randInt(100000, 999999)}`,
    status: rand(["pending", "processing", "shipped", "delivered", "cancelled"]),
    total: randFloat(10, 5000, 2),
    tax: randFloat(1, 500, 2),
    shipping: randFloat(0, 50, 2),
    currency: "USD",
    paymentMethod: rand(["credit_card", "paypal", "bank_transfer", "crypto"]),
    createdAt: randDate(new Date("2023-01-01"), new Date()),
    shippedAt: Math.random() > 0.3 ? randDate(new Date("2023-01-01"), new Date()) : null,
    items: randInt(1, 10),
  };
}

function generateUserAccount(): Record<string, any> {
  const person = generatePerson();
  return {
    id: uuid(),
    username: `${person.firstName.toLowerCase()}${person.lastName.toLowerCase()}${randInt(1, 999)}`,
    email: person.email,
    passwordHash: `$2b$10$${Math.random().toString(36).substring(2, 52)}`,
    role: rand(["admin", "user", "moderator", "viewer", "editor"]),
    status: rand(["active", "inactive", "suspended", "pending"]),
    createdAt: randDate(new Date("2020-01-01"), new Date()),
    lastLoginAt: randDate(new Date("2023-01-01"), new Date()),
    emailVerified: Math.random() > 0.2,
    twoFactorEnabled: Math.random() > 0.5,
    preferences: { theme: rand(["light", "dark"]), language: rand(["en", "de", "fr", "es"]) },
  };
}

const GENERATORS: Record<DataType, () => Record<string, any>> = {
  person: generatePerson,
  address: generateAddress,
  company: generateCompany,
  finance: generateFinance,
  product: generateProduct,
  order: generateOrder,
  user_account: generateUserAccount,
  medical: () => ({ id: uuid(), patientId: `PAT-${randInt(10000, 99999)}`, diagnosis: rand(["Hypertension", "Diabetes", "Asthma", "Arthritis"]), bloodType: rand(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]), allergies: rand(["None", "Penicillin", "Aspirin", "Latex"]), weight: randFloat(50, 120, 1), height: randFloat(150, 200, 1) }),
  vehicle: () => ({ id: uuid(), vin: `1HGBH41JXMN${randInt(100000, 999999)}`, make: rand(["Toyota", "Honda", "Ford", "BMW", "Mercedes"]), model: rand(["Sedan", "SUV", "Truck", "Coupe", "Van"]), year: randInt(2010, 2024), color: rand(["Black", "White", "Silver", "Blue", "Red"]), mileage: randInt(0, 200000), licensePlate: `${rand(["ABC", "XYZ", "DEF"])}${randInt(1000, 9999)}` }),
  custom: () => ({ id: uuid(), value: Math.random() }),
};

// ─── AI Custom Data Generator ─────────────────────────────────────────────────

async function generateCustomWithAI(
  schema: DataSchema,
  count: number
): Promise<Record<string, any>[]> {
  const aiClient = await getAiClient();

  const systemPrompt = `You are a test data generator. Generate realistic synthetic data records.
Return ONLY a JSON array of ${count} records matching the schema.
Make data realistic and varied. Use proper formats for emails, phones, dates, etc.`;

  const userPrompt = `Generate ${count} records for type: ${schema.type}
Locale: ${schema.locale || "en-US"}
Custom fields: ${JSON.stringify(schema.customFields || [])}
Constraints: ${JSON.stringify(schema.constraints || {})}

Return only the JSON array.`;

  try {
    const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch (e: any) {
    console.error("[DataFactory] AI generation failed:", e.message);
  }
  return [];
}

// ─── Main Test Data Factory ───────────────────────────────────────────────────

export class TestDataFactory {
  private datasets = new Map<string, GeneratedDataSet>();

  /** Generate a dataset from a schema */
  async generate(name: string, schema: DataSchema): Promise<GeneratedDataSet> {
    const count = schema.count || 10;
    let records: Record<string, any>[] = [];

    if (schema.type === "custom" && schema.customFields && schema.customFields.length > 0) {
      // Use AI for custom schemas
      records = await generateCustomWithAI(schema, count);
      if (records.length === 0) {
        // Fallback: generate from field definitions
        records = Array.from({ length: count }, () => {
          const rec: Record<string, any> = { id: uuid() };
          for (const field of schema.customFields!) {
            switch (field.type) {
              case "string":   rec[field.name] = field.pattern ? `value_${randInt(1, 999)}` : `${field.name}_${randInt(1, 999)}`; break;
              case "number":   rec[field.name] = randFloat(field.min || 0, field.max || 1000, 2); break;
              case "boolean":  rec[field.name] = Math.random() > 0.5; break;
              case "date":     rec[field.name] = randDate(new Date("2020-01-01"), new Date()); break;
              case "email":    rec[field.name] = `user${randInt(1, 999)}@example.com`; break;
              case "phone":    rec[field.name] = `+1-${randInt(200, 999)}-${randInt(100, 999)}-${randInt(1000, 9999)}`; break;
              case "uuid":     rec[field.name] = uuid(); break;
              case "enum":     rec[field.name] = field.options ? rand(field.options) : "value"; break;
            }
            if (field.nullable && Math.random() < 0.1) rec[field.name] = null;
          }
          return rec;
        });
      }
    } else {
      const generator = GENERATORS[schema.type] || GENERATORS.custom;
      records = Array.from({ length: count }, () => generator());
    }

    // Apply masking
    if (schema.maskFields && schema.maskFields.length > 0) {
      records = records.map((rec) => {
        const masked = { ...rec };
        for (const field of schema.maskFields!) {
          if (masked[field] !== undefined && masked[field] !== null) {
            masked[field] = maskValue(String(masked[field]), field);
          }
        }
        return masked;
      });
    }

    const dataset: GeneratedDataSet = {
      id: uuid(),
      name,
      schema,
      records,
      generatedAt: new Date(),
      recordCount: records.length,
    };

    this.datasets.set(dataset.id, dataset);

    // Persist to test data pools
    try {
      await storage.createTestDataPool({
        name,
        description: `Generated ${schema.type} data (${count} records)`,
        dataType: schema.type,
        data: records,
        isShared: true,
        autoCleanup: false,
      });
    } catch {}

    return dataset;
  }

  /** Get a dataset by ID */
  getDataset(id: string): GeneratedDataSet | undefined {
    return this.datasets.get(id);
  }

  /** Get all in-memory datasets */
  getAllDatasets(): GeneratedDataSet[] {
    return Array.from(this.datasets.values());
  }

  /** Get a single record from a dataset (round-robin) */
  getRecord(datasetId: string, index?: number): Record<string, any> | null {
    const ds = this.datasets.get(datasetId);
    if (!ds || ds.records.length === 0) return null;
    const idx = index !== undefined ? index % ds.records.length : Math.floor(Math.random() * ds.records.length);
    return ds.records[idx];
  }

  /** Convert dataset to test data params for execution */
  toTestDataParams(record: Record<string, any>): Array<{ key: string; value: string; type: string }> {
    return Object.entries(record).map(([key, value]) => ({
      key,
      value: value === null || value === undefined ? "" : String(typeof value === "object" ? JSON.stringify(value) : value),
      type: typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string",
    }));
  }

  /** Get available data types */
  getDataTypes(): Array<{ value: DataType; label: string; description: string }> {
    return [
      { value: "person",       label: "Person",        description: "Name, email, phone, DOB, SSN" },
      { value: "address",      label: "Address",       description: "Street, city, state, zip, coordinates" },
      { value: "company",      label: "Company",       description: "Name, tax ID, industry, revenue" },
      { value: "finance",      label: "Finance",       description: "Account, credit card, IBAN, balance" },
      { value: "product",      label: "Product",       description: "SKU, name, price, stock, category" },
      { value: "order",        label: "Order",         description: "Order number, status, total, items" },
      { value: "user_account", label: "User Account",  description: "Username, email, role, status, preferences" },
      { value: "medical",      label: "Medical",       description: "Patient ID, diagnosis, blood type, allergies" },
      { value: "vehicle",      label: "Vehicle",       description: "VIN, make, model, year, mileage" },
      { value: "custom",       label: "Custom (AI)",   description: "Define your own fields with AI generation" },
    ];
  }
}

export const testDataFactory = new TestDataFactory();
