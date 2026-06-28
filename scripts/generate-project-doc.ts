/**
 * AITAS Project — Word Documentation Generator
 * ---------------------------------------------------------------------------
 * Generates `AITAS_Project_Documentation.docx`, a comprehensive product and
 * technical documentation of the AITAS platform.
 *
 * Run with:
 *   npx tsx scripts/generate-project-doc.ts
 *
 * Output:
 *   docs/AITAS_Project_Documentation.docx
 * ---------------------------------------------------------------------------
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageNumber,
  Header,
  Footer,
  TableOfContents,
  StyleLevel,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  LevelFormat,
  convertInchesToTwip,
  PageOrientation,
  ImageRun,
} from "docx";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Brand tokens
// ---------------------------------------------------------------------------
const BAXTER_BLUE = "00549F";
const BAXTER_BLUE_LIGHT = "E8F1FA";
const BAXTER_INK = "0F1F35";
const BAXTER_INK_SOFT = "3D4D63";
const BAXTER_INK_MUTE = "6B7A8C";
const BAXTER_LINE = "D6E1ED";
const BAXTER_SUCCESS = "2E7D32";
const BAXTER_WARNING = "ED6C02";

// ---------------------------------------------------------------------------
// Reusable paragraph helpers
// ---------------------------------------------------------------------------
function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 36,
        color: BAXTER_BLUE,
        font: "Calibri",
      }),
    ],
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 28,
        color: BAXTER_BLUE,
        font: "Calibri",
      }),
    ],
  });
}

function h3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
        color: BAXTER_INK,
        font: "Calibri",
      }),
    ],
  });
}

function h4(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_4,
    spacing: { before: 200, after: 100 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 22,
        color: BAXTER_INK_SOFT,
        font: "Calibri",
      }),
    ],
  });
}

function p(text: string, opts?: { bold?: boolean; italic?: boolean; size?: number; color?: string }): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: 300 },
    alignment: AlignmentType.JUSTIFIED,
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        italics: opts?.italic,
        size: opts?.size ?? 22,
        color: opts?.color ?? BAXTER_INK,
        font: "Calibri",
      }),
    ],
  });
}

function bullet(text: string, level = 0): Paragraph {
  return new Paragraph({
    numbering: { reference: "bullet-style", level },
    spacing: { after: 80, line: 280 },
    children: [
      new TextRun({
        text,
        size: 22,
        color: BAXTER_INK,
        font: "Calibri",
      }),
    ],
  });
}

function boldLabelLine(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80, line: 280 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22, color: BAXTER_BLUE, font: "Calibri" }),
      new TextRun({ text: value, size: 22, color: BAXTER_INK, font: "Calibri" }),
    ],
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

// Build a two-column table (label / value) — used for tech stack, etc.
function infoTable(rows: Array<[string, string]>): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: BAXTER_LINE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BAXTER_LINE },
      left: { style: BorderStyle.SINGLE, size: 4, color: BAXTER_LINE },
      right: { style: BorderStyle.SINGLE, size: 4, color: BAXTER_LINE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: BAXTER_LINE },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: BAXTER_LINE },
    },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 32, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: BAXTER_BLUE_LIGHT, color: "auto" },
              margins: { top: 100, bottom: 100, left: 150, right: 150 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: label,
                      bold: true,
                      size: 21,
                      color: BAXTER_BLUE,
                      font: "Calibri",
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 68, type: WidthType.PERCENTAGE },
              margins: { top: 100, bottom: 100, left: 150, right: 150 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: value, size: 21, color: BAXTER_INK, font: "Calibri" }),
                  ],
                }),
              ],
            }),
          ],
        })
    ),
  });
}

// Build a feature table — Name | Description | URL/Endpoint
function moduleTable(
  header: [string, string, string],
  rows: Array<[string, string, string]>
): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: header.map(
      (text) =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: BAXTER_BLUE, color: "auto" },
          margins: { top: 120, bottom: 120, left: 150, right: 150 },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text, bold: true, size: 21, color: "FFFFFF", font: "Calibri" }),
              ],
            }),
          ],
        })
    ),
  });

  const bodyRows = rows.map(
    (cells, idx) =>
      new TableRow({
        children: cells.map(
          (text) =>
            new TableCell({
              shading:
                idx % 2 === 0
                  ? { type: ShadingType.CLEAR, fill: "FFFFFF", color: "auto" }
                  : { type: ShadingType.CLEAR, fill: "F7FAFD", color: "auto" },
              margins: { top: 100, bottom: 100, left: 150, right: 150 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text, size: 20, color: BAXTER_INK, font: "Calibri" }),
                  ],
                }),
              ],
            })
        ),
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: BAXTER_LINE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BAXTER_LINE },
      left: { style: BorderStyle.SINGLE, size: 4, color: BAXTER_LINE },
      right: { style: BorderStyle.SINGLE, size: 4, color: BAXTER_LINE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: BAXTER_LINE },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: BAXTER_LINE },
    },
    rows: [headerRow, ...bodyRows],
  });
}

// Callout box (info / warning / success)
function callout(title: string, body: string, kind: "info" | "warning" | "success" = "info"): Table {
  const colors = {
    info: { fill: BAXTER_BLUE_LIGHT, accent: BAXTER_BLUE, text: "1A3A5C" },
    warning: { fill: "FFF4E5", accent: BAXTER_WARNING, text: "5C3A00" },
    success: { fill: "E8F5E9", accent: BAXTER_SUCCESS, text: "1B5E20" },
  }[kind];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: colors.accent },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: colors.accent },
      left: { style: BorderStyle.SINGLE, size: 16, color: colors.accent },
      right: { style: BorderStyle.SINGLE, size: 4, color: colors.accent },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: colors.fill, color: "auto" },
            margins: { top: 150, bottom: 150, left: 200, right: 200 },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: title,
                    bold: true,
                    size: 22,
                    color: colors.text,
                    font: "Calibri",
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: body,
                    size: 21,
                    color: colors.text,
                    font: "Calibri",
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// COVER PAGE
// ---------------------------------------------------------------------------
function buildCoverPage(): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 2400 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "BAXTER",
          bold: true,
          size: 64,
          color: BAXTER_BLUE,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 1200 },
      children: [
        new TextRun({
          text: "Enterprise Quality Engineering",
          size: 24,
          color: BAXTER_INK_MUTE,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "AITAS",
          bold: true,
          size: 96,
          color: BAXTER_BLUE,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: "AI Test Automation System",
          bold: true,
          size: 32,
          color: BAXTER_INK,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 1200 },
      children: [
        new TextRun({
          text: "Project Documentation",
          size: 28,
          color: BAXTER_INK_SOFT,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: "Version 1.0 Enterprise",
          size: 24,
          color: BAXTER_INK_SOFT,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          size: 22,
          color: BAXTER_INK_MUTE,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400 },
      children: [
        new TextRun({
          text: "SECURE  ·  AUDITABLE  ·  COMPLIANT",
          bold: true,
          size: 18,
          color: BAXTER_BLUE,
          font: "Calibri",
          characterSpacing: 80,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: "Confidential — Internal Use Only",
          italics: true,
          size: 18,
          color: BAXTER_INK_MUTE,
          font: "Calibri",
        }),
      ],
    }),
    pageBreak(),
  ];
}

// ---------------------------------------------------------------------------
// DOCUMENT CONTROL
// ---------------------------------------------------------------------------
function buildDocControl(): (Paragraph | Table)[] {
  return [
    h1("Document Control"),
    p(
      "This document is maintained by the AITAS Quality Engineering team. All changes are versioned and tracked. The latest authoritative version is stored within the AITAS source repository."
    ),
    h3("Document Information"),
    infoTable([
      ["Document Title", "AITAS Project Documentation"],
      ["Document Owner", "AITAS Quality Engineering Team"],
      ["Document Version", "1.0"],
      ["Status", "Released"],
      ["Classification", "Confidential — Internal Use Only"],
      ["Last Updated", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
      ["Distribution", "AITAS Stakeholders, QE Leadership, Compliance"],
    ]),
    h3("Revision History"),
    moduleTable(
      ["Version", "Date", "Summary of Changes"],
      [
        ["0.1", "Initial", "Architecture draft and platform scaffolding"],
        ["0.5", "Mid-cycle", "Core modules: generator, executor, agents, KB"],
        ["0.9", "Pre-release", "Governance, compliance, audit logging, healer"],
        [
          "1.0",
          new Date().toLocaleDateString("en-US"),
          "Initial released documentation — full platform coverage, Baxter rebrand of pre-login experience, 58/58 integration audit passing",
        ],
      ]
    ),
    pageBreak(),
  ];
}

// ---------------------------------------------------------------------------
// TABLE OF CONTENTS
// ---------------------------------------------------------------------------
function buildToc(): (Paragraph | TableOfContents)[] {
  return [
    h1("Table of Contents"),
    new TableOfContents("Contents", {
      hyperlink: true,
      headingStyleRange: "1-4",
      stylesWithLevels: [
        new StyleLevel("Heading1", 1),
        new StyleLevel("Heading2", 2),
        new StyleLevel("Heading3", 3),
        new StyleLevel("Heading4", 4),
      ],
    }),
    new Paragraph({
      spacing: { before: 300 },
      children: [
        new TextRun({
          text: "Note: After opening this document in Microsoft Word, right-click the Table of Contents and choose 'Update Field' to populate page numbers.",
          italics: true,
          size: 18,
          color: BAXTER_INK_MUTE,
          font: "Calibri",
        }),
      ],
    }),
    pageBreak(),
  ];
}

// ---------------------------------------------------------------------------
// SECTION 1 — EXECUTIVE OVERVIEW
// ---------------------------------------------------------------------------
function buildOverview(): (Paragraph | Table)[] {
  return [
    h1("1. Executive Overview"),

    h2("1.1 Purpose of This Document"),
    p(
      "This document provides a complete, end-to-end description of AITAS (AI Test Automation System) — its purpose, architecture, features, technologies, and operating procedures. It is intended to be the single authoritative reference for anyone using, evaluating, supporting, or extending the platform."
    ),
    p(
      "By reading this document, a new user should be able to log in, understand every available module, execute key workflows (test case generation, review, execution, reporting), interpret results, and operate AITAS in a compliance-aware manner."
    ),

    h2("1.2 What is AITAS?"),
    p(
      "AITAS is an enterprise-grade test automation platform purpose-built for regulated and compliance-driven environments. It combines AI-assisted authoring with mandatory human review, role-based access controls, and complete audit traceability — enabling quality engineering teams to deliver software with confidence in industries such as healthcare, life sciences, and finance."
    ),
    p(
      "AITAS does not replace test engineers. It accelerates their work while preserving full human accountability for every artifact that enters a validated lifecycle."
    ),

    h2("1.3 Business Value"),
    bullet("Reduces test-authoring time by automating the first-draft creation of test cases from validated requirements."),
    bullet("Improves compliance posture through built-in audit trails, content hashing, and human-in-the-loop review gates."),
    bullet("Standardises test execution across web, API, JD Edwards, SAP, Salesforce, and other enterprise applications."),
    bullet("Surfaces failure root causes with AI-assisted analysis, while keeping engineers as the decision authority."),
    bullet("Provides a single governance plane for quality engineering across multiple projects, teams, and environments."),

    h2("1.4 Compliance Posture"),
    p(
      "AITAS is designed to support workflows aligned with GxP, 21 CFR Part 11, and SOX. Every AI-generated artifact is flagged as a DRAFT and cannot be used in any controlled activity until a qualified reviewer approves it. Every action — creation, review decision, execution — is recorded with the responsible user, a timestamp, and a content hash."
    ),

    callout(
      "Important Notice",
      "AITAS provides AI-assisted automation to support test engineering activities. All AI-generated artifacts — including test cases, scripts, and failure analyses — are advisory in nature and require review and approval by a qualified team member before they may be used in any controlled, validated, or regulated activity. Final decisions and accountability remain with the authorized user.",
      "warning"
    ),

    h2("1.5 Audience"),
    bullet("Quality Engineers and Test Architects authoring and executing tests."),
    bullet("Quality Assurance Reviewers approving AI-generated artifacts."),
    bullet("DevOps and SRE teams integrating AITAS into CI/CD pipelines."),
    bullet("Compliance and Audit officers verifying traceability."),
    bullet("Platform Administrators managing users, roles, and environments."),

    pageBreak(),
  ];
}

// ---------------------------------------------------------------------------
// SECTION 2 — KEY FEATURES
// ---------------------------------------------------------------------------
function buildFeatures(): (Paragraph | Table)[] {
  return [
    h1("2. Key Features"),
    p(
      "AITAS bundles a complete set of capabilities for the modern, regulated quality engineering organisation. The following sections summarise the headline features; each is described in greater operational depth in Section 5."
    ),

    h2("2.1 AI-Assisted Test Case Generation"),
    p(
      "Generate draft test cases directly from validated requirements, user stories, or compliance scenarios. AITAS interprets natural-language input, drafts structured test cases (steps, expected results, data, preconditions), and flags every output for mandatory human review before it may be executed."
    ),

    h2("2.2 Human-in-the-Loop Governance"),
    p(
      "Every AI-generated artifact is stamped with a DRAFT review status, a content hash, and provenance metadata. A qualified reviewer must explicitly approve, request changes, or reject the draft before the test case becomes executable. Review decisions are themselves audit-logged."
    ),

    h2("2.3 Multi-Platform Test Execution"),
    p(
      "AITAS executes tests across a wide range of enterprise application surfaces through a single unified execution adapter:"
    ),
    bullet("Web applications via Playwright, Puppeteer, and Selenium."),
    bullet("REST and SOAP APIs via the deep API executor."),
    bullet("JD Edwards (JDE) screens and forms with rule-based and AI-assisted generation."),
    bullet("SAP GUI and SAP Fiori through specialised executors."),
    bullet("Salesforce Lightning and Classic surfaces."),
    bullet("Desktop applications (.NET WinForms / WPF, and Java Swing/JavaFX)."),
    bullet("Mobile platforms (Android and iOS) through Appium-style integration."),

    h2("2.4 Self-Healing Test Maintenance"),
    p(
      "When a test fails because the application has changed (a selector moved, a label was renamed, a workflow shifted), the AITAS AI Healer proposes a fix with confidence scoring. Engineers review and apply (or reject) suggested heals. Approved heals contribute to a learning database that improves future suggestions."
    ),

    h2("2.5 Secure, Distributed Execution Agents"),
    p(
      "Tests run through hardened agents that respect network isolation, credential vaulting, and per-environment access controls. Agents register themselves, send periodic heartbeats, and are health-monitored automatically. The platform supports both standalone local agents and enterprise agent fleets."
    ),

    h2("2.6 Comprehensive Audit & Compliance Logging"),
    p(
      "Every action — login, test creation, review decision, execution start, execution complete, healer apply, configuration change — is written to a structured audit log with the responsible user, timestamp, IP address (where applicable), and a content hash for the affected artifact. The audit trail is queryable, exportable, and tamper-evident."
    ),

    h2("2.7 Coverage Analytics and Test Data Factory"),
    p(
      "AITAS extracts requirements from supplied documentation and computes a coverage matrix mapping each requirement to one or more test cases. Gaps are surfaced for triage. A built-in Test Data Factory generates and seeds compliant test data for each environment."
    ),

    h2("2.8 Knowledge Base and Retrieval"),
    p(
      "A vector-indexed knowledge base captures domain context (e.g. JDE process knowledge, internal style guides, compliance policies) and is used to ground AI-assisted generation. The knowledge base is curated by administrators and accessible through the Knowledge Base module."
    ),

    h2("2.9 CI/CD Integration"),
    p(
      "AITAS exposes a webhook-driven CI/CD integration to launch test runs from GitHub Actions, GitLab CI, Jenkins, or Azure DevOps. Test results return to the originating pipeline with structured pass/fail and links to the AITAS execution record."
    ),

    h2("2.10 Role-Based Access Control"),
    p(
      "AITAS enforces granular RBAC across all features. Standard roles include Administrator, QA Lead, Test Author, Reviewer, and Read-Only. Permissions are evaluated on every API call and reflected throughout the user interface."
    ),

    pageBreak(),
  ];
}

// ---------------------------------------------------------------------------
// SECTION 3 — TECHNOLOGY STACK
// ---------------------------------------------------------------------------
function buildTechStack(): (Paragraph | Table)[] {
  return [
    h1("3. Technology Stack"),
    p(
      "AITAS is built on modern, well-supported open-source technologies that are widely used in the enterprise. The following table summarises the major components of the stack."
    ),

    h2("3.1 Frontend"),
    infoTable([
      ["Language", "TypeScript 5.x"],
      ["Framework", "React 18.3"],
      ["Routing", "Wouter (lightweight client-side router)"],
      ["State / Data Fetching", "TanStack Query (React Query) v5"],
      ["UI Primitives", "shadcn/ui on top of Radix UI"],
      ["Styling", "Tailwind CSS with custom Baxter brand tokens"],
      ["Forms & Validation", "React Hook Form + Zod"],
      ["Charts", "Recharts and Chart.js"],
      ["Build Tool", "Vite 8 with Rolldown"],
      ["Iconography", "Lucide React"],
      ["Typography", "Inter (UI), Manrope (brand), JetBrains Mono (code)"],
    ]),

    h2("3.2 Backend"),
    infoTable([
      ["Runtime", "Node.js 20 LTS"],
      ["Language", "TypeScript 5.x (compiled with tsx and bundled with esbuild)"],
      ["Web Framework", "Express 5"],
      ["Authentication", "Passport (local strategy) with express-session"],
      ["Validation", "Zod"],
      ["Database (Primary)", "PostgreSQL via Neon Serverless"],
      ["Database (Local / Embedded)", "SQLite via better-sqlite3"],
      ["ORM", "Drizzle ORM with drizzle-kit migrations"],
      ["Job Queue", "Bull on Redis (for asynchronous execution workers)"],
      ["Cache / Pub-Sub", "Redis"],
      ["File Parsing", "Mammoth (Word), pdf-parse (PDF), xlsx (Excel), tesseract.js (OCR)"],
    ]),

    h2("3.3 Test Execution Engines"),
    infoTable([
      ["Web — Modern", "Playwright"],
      ["Web — Alternative", "Puppeteer"],
      ["Web — Legacy", "Selenium WebDriver"],
      ["API", "Custom deep API executor with schema validation"],
      ["JDE", "Rule-based engine with AI-assisted fallback"],
      ["SAP GUI", "Native SAP GUI scripting bridge"],
      ["SAP Fiori", "Playwright with SAP-specific selectors"],
      ["Salesforce", "Lightning / Classic specialised executor"],
      ["Desktop", ".NET (WinForms / WPF) and Java (Swing / JavaFX)"],
      ["Mobile", "Appium-compatible adapter"],
    ]),

    h2("3.4 AI and Knowledge"),
    infoTable([
      ["LLM Gateway", "Internal Baxter AI Hub LLM Gateway (Anthropic Claude family)"],
      ["LLM Client SDK", "Custom HTTP client with retry, timeout, and provenance capture"],
      ["Knowledge Index", "In-memory vector index with disk persistence"],
      ["RAG Pipeline", "Retrieval-Augmented Generation for grounded test authoring"],
      ["Provider Switching", "Configurable LLM_PROVIDER (Claude / Copilot)"],
    ]),

    h2("3.5 Operations and DevOps"),
    infoTable([
      ["Package Manager", "npm"],
      ["Process Supervisor", "cross-env for cross-platform environment variables"],
      ["Logging", "Custom structured logger with severity levels"],
      ["Health Monitoring", "Built-in /api/health and /api/ready endpoints"],
      ["Agent Health Monitor", "Background service polling registered agents"],
      ["Containerisation", "Docker-ready (with provided Dockerfiles)"],
      ["Deployment", "Replit, Docker, or bare-metal Node hosting"],
    ]),

    pageBreak(),
  ];
}

// ---------------------------------------------------------------------------
// SECTION 4 — ARCHITECTURE
// ---------------------------------------------------------------------------
function buildArchitecture(): (Paragraph | Table)[] {
  return [
    h1("4. System Architecture"),

    h2("4.1 High-Level Architecture"),
    p(
      "AITAS follows a layered, modular architecture. The presentation layer (React SPA) communicates with a stateless Express API server, which in turn orchestrates a set of well-defined domain services: governance, knowledge, execution, healing, coverage, and audit. Persistence is provided by PostgreSQL (or SQLite for embedded deployments), with Redis backing job queues and cache."
    ),

    h2("4.2 Layer Breakdown"),

    h3("4.2.1 Presentation Layer (Client)"),
    p(
      "A React Single-Page Application served by Vite. Routes are defined declaratively in client/src/App.tsx using Wouter. Data is fetched and cached via TanStack Query, with optimistic updates and cache invalidation on mutations. Authentication state is held in a useAuth hook that consumes the /api/auth/user endpoint."
    ),

    h3("4.2.2 API Layer (Express)"),
    p(
      "All public endpoints are mounted under /api. The main router is server/routes.ts (over 4,000 lines), with domain-specific extensions for governance (/api/governance/*), knowledge (/api/knowledge/*), enterprise modules (/api/enterprise/*), and compliance (/api/compliance/*). Every endpoint is protected by Passport-backed authentication and RBAC middleware where required."
    ),

    h3("4.2.3 Domain Services"),
    p(
      "Cross-cutting business logic lives in server/services and server/domain. Services include the Test Case Validator, NLP Parser, Coverage Matrix, Test Data Factory, and Test Generation Rules. Each service is unit-testable in isolation."
    ),

    h3("4.2.4 Governance Subsystem"),
    p(
      "Located in server/governance/, this subsystem comprises three modules:"
    ),
    bullet("rules-engine.ts — defines what counts as AI-generated, when review is required, and validity rules for previously approved content."),
    bullet("review-service.ts — orchestrates the review workflow: single reviews, bulk decisions, and re-review on content change."),
    bullet("enforcement.ts — gates execution endpoints; requests for AI-generated tests are rejected with 409 REVIEW_REQUIRED until approved."),

    h3("4.2.5 Execution Subsystem"),
    p(
      "The Unified Execution Adapter (server/unified-execution-adapter.ts) routes each test to the appropriate executor based on its declared platform. Long-running jobs are dispatched to a Bull queue on Redis; results are persisted to the test_results table and stream-updated to the UI via polling."
    ),

    h3("4.2.6 Storage Layer"),
    p(
      "Two interchangeable storage backends are provided: PostgreSQL (production, via Drizzle ORM and Neon Serverless) and SQLite (developer / embedded, via better-sqlite3). Both implement the same Storage interface defined in server/storage.ts."
    ),

    h2("4.3 Data Flow — End-to-End Test Case Creation"),
    bullet("User opens the Generator page and submits a requirement."),
    bullet("Frontend POSTs the requirement to /api/generator with the active project context."),
    bullet("The LLM Test Engine calls the configured LLM gateway with a system prompt grounded by Knowledge Base retrieval."),
    bullet("The returned draft is persisted via the Storage layer with reviewStatus=DRAFT, a contentHash, and aiProvenance metadata."),
    bullet("The frontend shows the new test in the Repository as 'Review Required'."),
    bullet("A reviewer opens the Governance Review queue, inspects, and approves the draft."),
    bullet("The Audit Log records both the creation and the review decision."),
    bullet("The test is now executable via the Executions page or the unified execution API."),

    h2("4.4 Authentication & Session Flow"),
    p(
      "AITAS uses a session-cookie authentication model. On POST /api/auth/login, credentials are validated against the users table (passwords hashed with bcrypt). A session is established server-side and a secure HTTP-only cookie is returned. On every subsequent request, the session is rehydrated and req.user is populated. Logout invalidates the session."
    ),
    p(
      "First-time logins (and admin-issued password resets) carry a mustChangePassword flag, which causes the frontend to redirect to /change-password."
    ),

    h2("4.5 Audit Trail Architecture"),
    p(
      "Every state-changing API call writes a record to the audit_log table with the following fields: timestamp, userId, action, resourceType, resourceId, contentHash, ipAddress, and arbitrary structured details. The audit trail is queryable via /api/enterprise/audit and is the canonical source of truth for regulatory reviews."
    ),

    pageBreak(),
  ];
}

// ---------------------------------------------------------------------------
// SECTION 5 — MODULE-BY-MODULE FUNCTIONALITY
// ---------------------------------------------------------------------------
function buildModules(): (Paragraph | Table)[] {
  const ParaOrTable: (Paragraph | Table)[] = [];

  ParaOrTable.push(h1("5. Module-by-Module Functionality"));
  ParaOrTable.push(
    p(
      "This section walks through every functional module in AITAS. For each module you will find: a description of its purpose, how to navigate to it, the key user actions, and notes on the underlying behaviour."
    )
  );
  ParaOrTable.push(
    callout(
      "How to Read This Section",
      "Each module is presented with a 'Navigation' line that tells you exactly which sidebar entry to click after signing in. 'Key Actions' describes the most common workflows step-by-step. 'Behaviour Notes' provides operational detail.",
      "info"
    )
  );

  // 5.1 Authentication
  ParaOrTable.push(h2("5.1 Authentication & Onboarding"));
  ParaOrTable.push(boldLabelLine("Navigation", "/login (pre-login landing at /)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Establishes the user session and enforces compliance acknowledgement."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Enter your enterprise email and password."));
  ParaOrTable.push(bullet("Read and tick the acknowledgement: 'I acknowledge that AI-generated outputs require human review.'"));
  ParaOrTable.push(bullet("Click Sign In. If this is your first login, you will be redirected to Change Password."));
  ParaOrTable.push(h4("Behaviour Notes"));
  ParaOrTable.push(bullet("Authentication uses session cookies (HTTP-only, secure)."));
  ParaOrTable.push(bullet("All login attempts (success and failure) are written to the audit log."));
  ParaOrTable.push(bullet("Locked accounts are automatically detected; contact your administrator to unlock."));

  // 5.2 Dashboard
  ParaOrTable.push(h2("5.2 Dashboard"));
  ParaOrTable.push(boldLabelLine("Navigation", "/  (Sidebar → Dashboard)"));
  ParaOrTable.push(boldLabelLine("Purpose", "At-a-glance overview of quality engineering health."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Review headline KPIs: total tests, pass rate, AI drafts pending review, recent executions."));
  ParaOrTable.push(bullet("Inspect the 14-day execution trend chart."));
  ParaOrTable.push(bullet("Click any KPI to drill through to the underlying records."));
  ParaOrTable.push(h4("Behaviour Notes"));
  ParaOrTable.push(bullet("Dashboard data is fetched live on every page load via /api/dashboard."));
  ParaOrTable.push(bullet("Counts are scoped to the user's permitted projects."));

  // 5.3 Generator
  ParaOrTable.push(h2("5.3 AI Test Case Generator"));
  ParaOrTable.push(boldLabelLine("Navigation", "/generator  (Sidebar → Generator)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Draft test cases from natural-language requirements using AI."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Select the target project and application profile (Web, API, JDE, SAP, etc.)."));
  ParaOrTable.push(bullet("Paste or type the requirement, user story, or acceptance criteria."));
  ParaOrTable.push(bullet("Optionally upload supporting documentation (PDF, Word, Excel)."));
  ParaOrTable.push(bullet("Click Generate. The AI returns one or more draft test cases with steps and expected results."));
  ParaOrTable.push(bullet("Inspect each draft, edit if needed, and Save. Saved drafts enter the review queue."));
  ParaOrTable.push(h4("Behaviour Notes"));
  ParaOrTable.push(bullet("Every generated test is marked reviewStatus=DRAFT and is non-executable until approved."));
  ParaOrTable.push(bullet("A contentHash is computed; if the test is later edited, re-review is required."));
  ParaOrTable.push(bullet("Provenance metadata (model, prompt template, timestamp) is captured for audit."));

  // 5.4 Repository
  ParaOrTable.push(h2("5.4 Test Case Repository"));
  ParaOrTable.push(boldLabelLine("Navigation", "/repository  (Sidebar → Repository)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Single library of all test cases across projects, with filtering and tagging."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Search and filter by project, status, priority, tag, or review state."));
  ParaOrTable.push(bullet("Open any test case to view steps, history, and execution results."));
  ParaOrTable.push(bullet("Edit (subject to review re-triggering), clone, archive, or delete."));
  ParaOrTable.push(bullet("Use the Enhanced Test Case Editor for step-by-step authoring with the Step Editor."));
  ParaOrTable.push(h4("Behaviour Notes"));
  ParaOrTable.push(bullet("All test cases display a Review Required badge if their current version has not been approved."));
  ParaOrTable.push(bullet("Editing an approved test case resets its review status to DRAFT and bumps the review version."));

  // 5.5 Scripts
  ParaOrTable.push(h2("5.5 Generated Scripts"));
  ParaOrTable.push(boldLabelLine("Navigation", "/scripts  (Sidebar → Scripts)"));
  ParaOrTable.push(boldLabelLine("Purpose", "View, manage, and export the executable scripts produced from test cases."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Browse generated scripts grouped by test case and framework (Playwright, Selenium, Puppeteer)."));
  ParaOrTable.push(bullet("Open a script in the read-only code viewer."));
  ParaOrTable.push(bullet("Download a script as a self-contained file."));
  ParaOrTable.push(bullet("Re-generate a script from the current test case definition."));

  // 5.6 Executions
  ParaOrTable.push(h2("5.6 Test Executions"));
  ParaOrTable.push(boldLabelLine("Navigation", "/executions  (Sidebar → Executions)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Launch, monitor, and review test runs across all platforms."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Click New Execution. Select one or more approved test cases, an environment, and an agent."));
  ParaOrTable.push(bullet("Click Run. The platform routes each test to the appropriate executor."));
  ParaOrTable.push(bullet("Watch the live status (queued → running → passed / failed) and elapsed time."));
  ParaOrTable.push(bullet("Open a completed execution to review steps, screenshots, logs, and assertion outcomes."));
  ParaOrTable.push(bullet("Delete obsolete executions individually or by date range (admin only)."));
  ParaOrTable.push(h4("Behaviour Notes"));
  ParaOrTable.push(bullet("Attempting to execute a DRAFT test case returns 409 REVIEW_REQUIRED."));
  ParaOrTable.push(bullet("Each execution is recorded with the responsible user, agent, environment, and final disposition."));
  ParaOrTable.push(bullet("Long-running executions run asynchronously via the Bull queue worker."));

  // 5.7 Reports
  ParaOrTable.push(h2("5.7 Reports"));
  ParaOrTable.push(boldLabelLine("Navigation", "/reports  (Sidebar → Reports)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Aggregate execution data into shareable, exportable reports."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Select a date range, project, and platform filter."));
  ParaOrTable.push(bullet("Review pass / fail breakdowns, trend charts, and top failure clusters."));
  ParaOrTable.push(bullet("Export as HTML, JSON, or JUnit XML for downstream integration."));

  // 5.8 Coverage
  ParaOrTable.push(h2("5.8 Coverage Matrix"));
  ParaOrTable.push(boldLabelLine("Navigation", "/coverage  (Sidebar → Coverage)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Map requirements to test cases and surface coverage gaps."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Upload or paste requirements; AITAS extracts discrete requirement IDs."));
  ParaOrTable.push(bullet("Inspect the coverage matrix: each requirement, the linked test cases, and the latest execution status."));
  ParaOrTable.push(bullet("View Gaps to see requirements not yet covered by any approved test."));
  ParaOrTable.push(bullet("Drill into a process or application type to see object-level coverage (forms, screens, endpoints)."));

  // 5.9 Compliance
  ParaOrTable.push(h2("5.9 Compliance Centre"));
  ParaOrTable.push(boldLabelLine("Navigation", "/compliance  (Sidebar → Compliance)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Run, review, and export compliance-aligned reports."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Review approval-workflow status for regulated change sets."));
  ParaOrTable.push(bullet("Export compliance evidence packages for audit submissions."));
  ParaOrTable.push(bullet("Inspect flaky-test detection results."));
  ParaOrTable.push(bullet("Review cost forecasts for the next reporting period."));

  // 5.10 Agents
  ParaOrTable.push(h2("5.10 Agents"));
  ParaOrTable.push(boldLabelLine("Navigation", "/agents  (Sidebar → Agents)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Register, monitor, and manage the execution agent fleet."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("View the list of registered agents with status (Online, Offline, Busy)."));
  ParaOrTable.push(bullet("Drill into an agent for last-heartbeat, capacity, OS, and recent executions."));
  ParaOrTable.push(bullet("Set up a new local agent via the guided installer at /agents/setup."));
  ParaOrTable.push(bullet("Manage enterprise agent groups at /agents/enterprise."));

  // 5.11 Healer
  ParaOrTable.push(h2("5.11 AI Healer"));
  ParaOrTable.push(boldLabelLine("Navigation", "/healer  (Sidebar → AI Healer)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Diagnose and propose fixes for failed test steps."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Open a failed execution from Executions and click Analyse."));
  ParaOrTable.push(bullet("Review the AI's diagnosis: probable cause, affected step, suggested fix, confidence score."));
  ParaOrTable.push(bullet("Choose Apply, Edit & Apply, or Reject."));
  ParaOrTable.push(bullet("Applied heals contribute to the learning store and are audit-logged."));
  ParaOrTable.push(boldLabelLine("Enterprise Mode", "Available at /healer/enterprise for session-based, multi-fix workflows."));

  // 5.12 Knowledge Base
  ParaOrTable.push(h2("5.12 Knowledge Base"));
  ParaOrTable.push(boldLabelLine("Navigation", "/knowledge  (Sidebar → Knowledge)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Curate domain knowledge used to ground AI test generation."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Add a knowledge item: title, body, tags, applicable project / application type."));
  ParaOrTable.push(bullet("Re-index after bulk imports to update the vector index."));
  ParaOrTable.push(bullet("Search the knowledge base; entries are returned with similarity scores."));

  // 5.13 Test Data Factory
  ParaOrTable.push(h2("5.13 Test Data Factory"));
  ParaOrTable.push(boldLabelLine("Navigation", "/data-factory  (Sidebar → Data Factory)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Generate and manage compliant test data per environment."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Define a data template (entity, fields, value rules)."));
  ParaOrTable.push(bullet("Generate a batch and download as CSV or JSON, or seed directly to the target environment."));

  // 5.14 CI/CD
  ParaOrTable.push(h2("5.14 CI/CD Integration"));
  ParaOrTable.push(boldLabelLine("Navigation", "/cicd  (Sidebar → CI/CD)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Connect AITAS to your continuous integration platform."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Create a webhook endpoint scoped to a project."));
  ParaOrTable.push(bullet("Copy the webhook URL and token into your CI provider (GitHub Actions, GitLab CI, Jenkins)."));
  ParaOrTable.push(bullet("Trigger executions automatically on push / pull-request / scheduled runs."));

  // 5.15 LLM Tests
  ParaOrTable.push(h2("5.15 LLM Tests"));
  ParaOrTable.push(boldLabelLine("Navigation", "/llm-tests  (Sidebar → LLM Tests)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Validate the configured LLM gateway and prompt templates."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Run a Prompt-only generation to check connectivity and response shape."));
  ParaOrTable.push(bullet("Run a RAG generation to check the knowledge base retrieval pipeline."));
  ParaOrTable.push(bullet("Review historical LLM call traces for diagnostics."));

  // 5.16 Performance
  ParaOrTable.push(h2("5.16 Performance Benchmarks"));
  ParaOrTable.push(boldLabelLine("Navigation", "/performance  (Sidebar → Performance)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Track end-to-end execution timings, throughput, and bottlenecks."));

  // 5.17 Environments
  ParaOrTable.push(h2("5.17 Environments"));
  ParaOrTable.push(boldLabelLine("Navigation", "/environments  (Sidebar → Environments)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Define logical environments (DEV, SIT, UAT, PROD) with their URLs and secrets."));

  // 5.18 Projects
  ParaOrTable.push(h2("5.18 Projects"));
  ParaOrTable.push(boldLabelLine("Navigation", "/projects  (Sidebar → Projects)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Group test cases, executions, and members under a logical project."));

  // 5.19 Application Profiles
  ParaOrTable.push(h2("5.19 Application Profiles"));
  ParaOrTable.push(boldLabelLine("Navigation", "/app-profiles  (Sidebar → App Profiles)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Encapsulate per-application execution settings (selectors, timeouts, login flows)."));

  // 5.20 Admin
  ParaOrTable.push(h2("5.20 Administration"));
  ParaOrTable.push(boldLabelLine("Navigation", "/admin  (Sidebar → Admin)"));
  ParaOrTable.push(boldLabelLine("Purpose", "User, role, and platform configuration (administrators only)."));
  ParaOrTable.push(h4("Key Actions"));
  ParaOrTable.push(bullet("Create users, assign roles, reset passwords."));
  ParaOrTable.push(bullet("Configure system-wide settings."));
  ParaOrTable.push(bullet("View the global audit trail and export."));

  // 5.21 Settings
  ParaOrTable.push(h2("5.21 Settings"));
  ParaOrTable.push(boldLabelLine("Navigation", "/settings  (Sidebar → Settings)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Per-user preferences such as theme, notifications, and default project."));

  // 5.22 Documentation
  ParaOrTable.push(h2("5.22 In-App Documentation"));
  ParaOrTable.push(boldLabelLine("Navigation", "/docs  (Sidebar → Documentation)"));
  ParaOrTable.push(boldLabelLine("Purpose", "Browse the in-app version of this documentation, the API reference, and walkthroughs."));

  ParaOrTable.push(pageBreak());
  return ParaOrTable;
}

// ---------------------------------------------------------------------------
// SECTION 6 — END-TO-END USER WORKFLOWS
// ---------------------------------------------------------------------------
function buildWorkflows(): (Paragraph | Table)[] {
  return [
    h1("6. End-to-End User Workflows"),
    p(
      "The following workflows describe the most common journeys through AITAS. Each is presented as a numbered sequence of user actions and platform responses."
    ),

    h2("6.1 Workflow A — Author and Execute a New Test Case"),
    bullet("Sign in at /login. Acknowledge the AI advisory checkbox."),
    bullet("Navigate to Generator (sidebar)."),
    bullet("Select the project and application profile."),
    bullet("Enter the requirement and click Generate."),
    bullet("Review the AI draft. Edit step text if needed. Click Save."),
    bullet("The test now appears in Repository with a 'Review Required' badge."),
    bullet("A reviewer (or you, if authorised) opens the Governance Review queue and approves the draft."),
    bullet("Navigate to Executions. Click New Execution and select the approved test."),
    bullet("Choose the environment and target agent. Click Run."),
    bullet("Monitor live status. On completion, open the execution to inspect results and evidence."),

    h2("6.2 Workflow B — Review an AI-Generated Test Case"),
    bullet("Open the Governance Review queue (accessible from the sidebar or from any AI-flagged test)."),
    bullet("Click the test case to open the review pane."),
    bullet("Inspect the diff: title, description, steps, data, expected results."),
    bullet("Choose Approve, Request Changes, or Reject. Add a comment."),
    bullet("Submit. The decision is logged with your user id, timestamp, and the content hash."),
    bullet("The test status flips to APPROVED (or REJECTED / NEEDS_CHANGES) and becomes executable / non-executable accordingly."),

    h2("6.3 Workflow C — Diagnose and Heal a Failed Test"),
    bullet("Open the failed execution in Executions."),
    bullet("Click Analyse on the failing step."),
    bullet("Wait for the AI Healer to return a diagnosis: probable cause + suggested fix + confidence."),
    bullet("Review the suggested selector / step change. Optionally view alternative suggestions."),
    bullet("Apply, Edit & Apply, or Reject. Applied fixes update the test case and trigger re-review."),
    bullet("Re-run the test to confirm the heal resolved the failure."),

    h2("6.4 Workflow D — Trigger an Execution from CI/CD"),
    bullet("In CI/CD, copy the webhook URL and token for your target project."),
    bullet("Add a step in your pipeline that POSTs to /api/cicd/trigger with the project, environment, and test selection."),
    bullet("AITAS enqueues the requested executions and returns a runId."),
    bullet("On completion, your pipeline polls /api/cicd/runs/{runId} (or receives a callback) for the final disposition."),

    h2("6.5 Workflow E — Set Up a New Local Execution Agent"),
    bullet("Navigate to /agents/setup."),
    bullet("Follow the guided installer to download the agent binary for your OS."),
    bullet("Run the agent with the provided registration token."),
    bullet("The agent appears in /agents within a few seconds, status Online."),
    bullet("Assign the agent to an environment via Application Profiles."),

    h2("6.6 Workflow F — Export Compliance Evidence"),
    bullet("Open Compliance Centre at /compliance."),
    bullet("Select a date range, project, and the categories of evidence (executions, reviews, audit log)."),
    bullet("Click Generate Package. AITAS assembles a ZIP containing structured exports."),
    bullet("Download the package and submit it to your audit / compliance workflow."),

    pageBreak(),
  ];
}

// ---------------------------------------------------------------------------
// SECTION 7 — TESTING AND VALIDATION
// ---------------------------------------------------------------------------
function buildTesting(): (Paragraph | Table)[] {
  return [
    h1("7. Testing and Validation"),

    h2("7.1 Integration Audit"),
    p(
      "AITAS ships with a comprehensive integration audit script (integration-audit.cjs) that exercises every public API and verifies feature wiring end-to-end. The audit covers 13 feature areas and 58 individual checks."
    ),
    p("To run the audit:"),
    bullet("Ensure the AITAS server is running on port 5000."),
    bullet("Open a terminal at the project root."),
    bullet("Run: node integration-audit.cjs"),
    bullet("The script exits 0 on success and prints a per-area pass / fail summary."),
    callout(
      "Latest Audit Result",
      "All 58 checks pass (auth, governance, knowledge base, test cases, executions, agents, healer, coverage, compliance, LLM tests, projects, environments, and the VALIDATED-mode AI review round-trip).",
      "success"
    ),

    h2("7.2 Validation of AI-Generated Content"),
    p(
      "AITAS enforces a hard policy: AI-generated artifacts cannot be used in any controlled activity until a qualified human reviewer approves them. This is enforced at three layers:"
    ),
    bullet("Frontend — UI badges, banners, and disabled actions for non-approved content."),
    bullet("API — endpoints check reviewStatus and return 409 REVIEW_REQUIRED when execution is attempted on a DRAFT."),
    bullet("Database — content hashes detect tampering or post-approval edits and automatically revoke approval."),

    h2("7.3 Browser-Based Smoke Testing"),
    p(
      "A recommended smoke checklist for any deployment:"
    ),
    bullet("Sign in successfully and reach the dashboard."),
    bullet("Generate a test case from a simple requirement."),
    bullet("Approve the generated test in the review queue."),
    bullet("Execute the approved test against a known-good environment."),
    bullet("Inspect the execution in Reports and confirm the audit log entries are present."),
    bullet("Sign out and confirm protected routes redirect to /login."),

    h2("7.4 Known Failure Modes and Diagnostics"),
    moduleTable(
      ["Symptom", "Likely Cause", "Resolution"],
      [
        ["409 REVIEW_REQUIRED on execute", "Attempt to run a DRAFT or NEEDS_CHANGES test case", "Approve in the review queue first"],
        ["Agent shows Offline", "Heartbeat missed > threshold", "Restart the local agent; verify firewall and token"],
        ["LLM call timeout", "LLM gateway unreachable or overloaded", "Check LLM_API_URL and LLM_BEARER_TOKEN; retry"],
        ["Knowledge base returns 0 hits", "Vector index not rebuilt after import", "Trigger Re-index from /knowledge"],
        ["Session expires unexpectedly", "Server restart or session TTL elapsed", "Sign in again; persistent session store is configurable"],
      ]
    ),

    pageBreak(),
  ];
}

// ---------------------------------------------------------------------------
// SECTION 8 — SECURITY AND COMPLIANCE
// ---------------------------------------------------------------------------
function buildSecurity(): (Paragraph | Table)[] {
  return [
    h1("8. Security and Compliance"),

    h2("8.1 Authentication and Authorisation"),
    bullet("Passwords are hashed with bcrypt (cost factor configurable; default 10)."),
    bullet("Sessions are stored server-side; cookies are HTTP-only and (in production) Secure + SameSite."),
    bullet("Role-Based Access Control is enforced on every API endpoint via dedicated middleware."),
    bullet("First-time and admin-issued passwords force a change on next sign-in."),

    h2("8.2 Data Protection"),
    bullet("Database credentials, LLM tokens, and session secrets are loaded from environment variables (.env), never committed to source."),
    bullet("All HTTP traffic should be terminated by a TLS-capable reverse proxy (nginx / cloud load balancer) in production."),
    bullet("Sensitive fields in audit logs (e.g. password change events) record only the action, never the value."),

    h2("8.3 Audit and Traceability"),
    p(
      "Every state-changing action is recorded with: timestamp, user id, action verb, resource type, resource id, content hash, and structured details. The audit_log table is append-only at the application layer; deletion requires administrator action and is itself audited."
    ),

    h2("8.4 Compliance-Aligned Workflows"),
    bullet("21 CFR Part 11 — electronic records and signatures: user attribution, timestamps, content hashing, and the mandatory review gate together satisfy the core 'attributable, legible, contemporaneous, original, accurate' (ALCOA) principles."),
    bullet("GxP — Good Practice: AI outputs are advisory and require human approval before use in validated activities."),
    bullet("SOX — Sarbanes-Oxley: change management workflows are auditable and exportable."),

    h2("8.5 Acceptable Use"),
    p(
      "AITAS is intended for use within Baxter and authorised partner organisations. Use must comply with the relevant Baxter acceptable-use, data-handling, and quality-management policies."
    ),

    pageBreak(),
  ];
}

// ---------------------------------------------------------------------------
// SECTION 9 — OPERATIONS
// ---------------------------------------------------------------------------
function buildOps(): (Paragraph | Table)[] {
  return [
    h1("9. Operations and Maintenance"),

    h2("9.1 Local Development"),
    bullet("Clone the AITAS repository."),
    bullet("Copy .env.example to .env and populate DATABASE_URL, SESSION_SECRET, LLM_API_URL, LLM_BEARER_TOKEN, REDIS_URL."),
    bullet("Run npm install."),
    bullet("Run npm run dev. The server starts on http://localhost:5000."),

    h2("9.2 Production Build"),
    bullet("Run npm run build. Output is emitted to dist/."),
    bullet("Run npm start to launch the production server."),

    h2("9.3 Database Setup"),
    p(
      "AITAS supports two interchangeable database backends. PostgreSQL is recommended for production; SQLite is convenient for development and single-tenant deployments."
    ),
    bullet("PostgreSQL — set DATABASE_URL to a valid connection string. Migrations apply automatically on first run."),
    bullet("SQLite — set USE_SQLITE=true (or omit DATABASE_URL) to use the embedded aitas.db file."),
    bullet("Run npm run db:push to apply schema changes."),

    h2("9.4 Required Environment Variables"),
    infoTable([
      ["DATABASE_URL", "PostgreSQL connection string (production)"],
      ["SESSION_SECRET", "Random 64+ character string for signing session cookies"],
      ["LLM_API_URL", "Base URL of the LLM gateway (e.g. Baxter AI Hub)"],
      ["LLM_BEARER_TOKEN", "API key for the LLM gateway"],
      ["LLM_MODEL_ID", "Default model identifier (e.g. claude-sonnet-4.6)"],
      ["LLM_PROVIDER", "Provider switch ('claude' or 'copilot')"],
      ["REDIS_URL", "Redis connection string (e.g. redis://localhost:6379)"],
      ["NODE_ENV", "'development' or 'production'"],
    ]),

    h2("9.5 Backup and Recovery"),
    bullet("PostgreSQL — schedule pg_dump or a managed-service snapshot policy."),
    bullet("SQLite — back up the aitas.db file along with its -shm and -wal companions."),
    bullet("Knowledge index — persisted to disk and rebuildable on demand from the underlying knowledge rows."),

    h2("9.6 Health and Monitoring"),
    bullet("GET /api/health — returns 200 if the server is running."),
    bullet("GET /api/ready — returns 200 only if the server can reach its database and required dependencies."),
    bullet("Agent Health Monitor — background service that polls registered agents every 30 seconds and flags unresponsive agents."),
    bullet("System Health Monitor — captures CPU, memory, and queue depth metrics."),

    h2("9.7 Updating AITAS"),
    bullet("Pull the latest version of the source repository."),
    bullet("Run npm install to apply dependency updates."),
    bullet("Run npm run db:push to apply any new schema migrations."),
    bullet("Restart the server (npm run dev or npm start)."),
    bullet("Run node integration-audit.cjs to verify the upgrade."),

    pageBreak(),
  ];
}

// ---------------------------------------------------------------------------
// APPENDIX
// ---------------------------------------------------------------------------
function buildAppendix(): (Paragraph | Table)[] {
  return [
    h1("Appendix"),

    h2("Appendix A — Glossary"),
    moduleTable(
      ["Term", "Meaning", "Notes"],
      [
        ["AITAS", "AI Test Automation System", "The platform described by this document"],
        ["AI Draft", "An AI-generated artifact pending human review", "Cannot be executed until approved"],
        ["Content Hash", "Deterministic fingerprint of a test case", "Used to detect tampering and trigger re-review"],
        ["DRAFT", "Initial review status for AI-generated content", "Editor-saved AI output enters this state"],
        ["APPROVED", "Review status indicating a qualified reviewer has accepted the artifact", "Required for execution"],
        ["GxP", "Good Practice — collective term for regulated quality guidelines", "Pharma / medical-device standards"],
        ["21 CFR Part 11", "US FDA regulation on electronic records and signatures", "AITAS supports ALCOA principles"],
        ["RBAC", "Role-Based Access Control", "Enforced on every API call"],
        ["RAG", "Retrieval-Augmented Generation", "Grounds AI generation with knowledge base hits"],
        ["Bull", "Redis-backed job queue", "Used for asynchronous test execution"],
      ]
    ),

    h2("Appendix B — Route Map (Frontend)"),
    moduleTable(
      ["Path", "Page", "Purpose"],
      [
        ["/", "Dashboard (auth) / Landing (no-auth)", "Entry point"],
        ["/login", "Login", "Sign-in form"],
        ["/change-password", "Change Password", "First-time / forced password change"],
        ["/generator", "Generator", "AI test case authoring"],
        ["/repository", "Repository", "All test cases"],
        ["/scripts", "Scripts", "Generated executable scripts"],
        ["/executions", "Executions", "Run and monitor tests"],
        ["/reports", "Reports", "Aggregated reporting"],
        ["/coverage", "Coverage", "Requirement-to-test traceability"],
        ["/compliance", "Compliance Centre", "Approval workflows and evidence export"],
        ["/agents", "Agents", "Execution agent fleet"],
        ["/agents/setup", "Local Agent Setup", "Guided agent installation"],
        ["/agents/enterprise", "Enterprise Agents", "Enterprise agent groups"],
        ["/healer", "AI Healer", "Failure diagnosis"],
        ["/healer/enterprise", "Enterprise AI Healer", "Session-based healer"],
        ["/knowledge", "Knowledge Base", "Domain knowledge curation"],
        ["/data-factory", "Test Data Factory", "Test data generation"],
        ["/cicd", "CI/CD", "Pipeline integration"],
        ["/llm-tests", "LLM Tests", "LLM gateway validation"],
        ["/performance", "Performance", "Performance benchmarks"],
        ["/environments", "Environments", "Environment definitions"],
        ["/projects", "Projects", "Project administration"],
        ["/app-profiles", "Application Profiles", "Per-application execution settings"],
        ["/admin", "Admin", "User and platform administration"],
        ["/settings", "Settings", "User preferences"],
        ["/docs", "Documentation", "In-app documentation"],
        ["/upload", "Upload Test Cases", "Bulk test case import"],
        ["/multi-agent", "Multi-Agent", "Multi-agent orchestration"],
      ]
    ),

    h2("Appendix C — Selected API Endpoints"),
    moduleTable(
      ["Method", "Path", "Purpose"],
      [
        ["GET", "/api/health", "Liveness probe"],
        ["GET", "/api/ready", "Readiness probe (DB + deps)"],
        ["POST", "/api/auth/login", "Sign in (email, password)"],
        ["POST", "/api/auth/logout", "Sign out"],
        ["GET", "/api/auth/user", "Current user info"],
        ["POST", "/api/auth/change-password", "Change password"],
        ["GET", "/api/test-cases", "List test cases"],
        ["POST", "/api/test-cases", "Create a test case"],
        ["GET", "/api/test-cases/:id", "Get a test case"],
        ["PUT", "/api/test-cases/:id", "Update a test case"],
        ["DELETE", "/api/test-cases/:id", "Delete a test case"],
        ["POST", "/api/execute/unified", "Launch a unified execution"],
        ["GET", "/api/execute/adapters", "List execution adapters"],
        ["GET", "/api/governance/reviews", "List items awaiting review"],
        ["POST", "/api/governance/reviews/bulk", "Bulk approve / reject"],
        ["POST", "/api/healer/analyse", "Analyse a failure"],
        ["POST", "/api/healer/apply", "Apply a suggested heal"],
        ["GET", "/api/coverage/matrix", "Coverage matrix"],
        ["GET", "/api/coverage/gaps", "Coverage gaps"],
        ["POST", "/api/coverage/extract", "Extract requirements from documents"],
        ["GET", "/api/enterprise/audit", "Query audit log"],
        ["GET", "/api/enterprise/audit/stats", "Audit summary"],
        ["GET", "/api/llm-tests/dashboard", "LLM test summary"],
        ["GET", "/api/knowledge", "List knowledge entries"],
        ["POST", "/api/knowledge", "Create a knowledge entry"],
      ]
    ),

    h2("Appendix D — Keyboard Shortcuts (where applicable)"),
    moduleTable(
      ["Shortcut", "Action", "Context"],
      [
        ["Ctrl / Cmd + K", "Open command palette", "Global"],
        ["Ctrl / Cmd + S", "Save current draft", "Editors"],
        ["Esc", "Close current dialog", "Modals"],
        ["?", "Open in-page help", "Where available"],
      ]
    ),

    h2("Appendix E — Document Conventions"),
    bullet("Paths beginning with / are frontend routes (e.g. /generator)."),
    bullet("Paths beginning with /api/ are server endpoints."),
    bullet("Commands shown in monospaced text are intended to be run from a terminal at the project root."),
    bullet("UI elements (buttons, fields) are written in bold-style proper nouns (e.g. Sign In, Generate)."),

    h2("Appendix F — Support"),
    p(
      "For questions about AITAS, please contact the AITAS Quality Engineering team via the internal support channel. For urgent production issues, follow the on-call escalation procedure published on the team's runbook."
    ),

    h2("Appendix G — Disclaimer"),
    callout(
      "AI Output Advisory",
      "AITAS includes AI-assisted features. AI outputs are advisory and require human review before use in any validated, regulated, or production activity. The user is responsible for the final accuracy, completeness, and compliance of any artifact derived from AI suggestions.",
      "warning"
    ),
  ];
}

// ---------------------------------------------------------------------------
// MAIN BUILD
// ---------------------------------------------------------------------------
async function main() {
  const sections: (Paragraph | Table | TableOfContents)[] = [
    ...buildCoverPage(),
    ...buildDocControl(),
    ...buildToc(),
    ...buildOverview(),
    ...buildFeatures(),
    ...buildTechStack(),
    ...buildArchitecture(),
    ...buildModules(),
    ...buildWorkflows(),
    ...buildTesting(),
    ...buildSecurity(),
    ...buildOps(),
    ...buildAppendix(),
  ];

  const doc = new Document({
    creator: "AITAS Quality Engineering",
    title: "AITAS Project Documentation",
    description: "Comprehensive documentation of the AITAS platform",
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
            size: 22,
            color: BAXTER_INK,
          },
        },
        heading1: {
          run: { font: "Calibri", size: 36, bold: true, color: BAXTER_BLUE },
          paragraph: { spacing: { before: 400, after: 200 } },
        },
        heading2: {
          run: { font: "Calibri", size: 28, bold: true, color: BAXTER_BLUE },
          paragraph: { spacing: { before: 320, after: 160 } },
        },
        heading3: {
          run: { font: "Calibri", size: 24, bold: true, color: BAXTER_INK },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        heading4: {
          run: { font: "Calibri", size: 22, bold: true, color: BAXTER_INK_SOFT },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "bullet-style",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(0.3), hanging: convertInchesToTwip(0.2) },
                },
              },
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: "\u25E6",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(0.6), hanging: convertInchesToTwip(0.2) },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.PORTRAIT,
              width: convertInchesToTwip(8.5),
              height: convertInchesToTwip(11),
            },
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: {
                  bottom: { style: BorderStyle.SINGLE, size: 6, color: BAXTER_LINE, space: 6 },
                },
                children: [
                  new TextRun({
                    text: "BAXTER  ·  AITAS Project Documentation",
                    bold: true,
                    size: 18,
                    color: BAXTER_BLUE,
                    font: "Calibri",
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: {
                  top: { style: BorderStyle.SINGLE, size: 6, color: BAXTER_LINE, space: 6 },
                },
                children: [
                  new TextRun({
                    text: "Confidential — Internal Use Only  ·  Page ",
                    size: 18,
                    color: BAXTER_INK_MUTE,
                    font: "Calibri",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    color: BAXTER_INK_MUTE,
                    font: "Calibri",
                  }),
                  new TextRun({
                    text: " of ",
                    size: 18,
                    color: BAXTER_INK_MUTE,
                    font: "Calibri",
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                    color: BAXTER_INK_MUTE,
                    font: "Calibri",
                  }),
                ],
              }),
            ],
          }),
        },
        children: sections as any,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outDir = path.join(process.cwd(), "docs");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, "AITAS_Project_Documentation.docx");
  fs.writeFileSync(outPath, buffer);

  const sizeKb = Math.round(buffer.length / 1024);
  console.log(`\n  AITAS Project Documentation generated`);
  console.log(`  ${outPath}`);
  console.log(`  Size: ${sizeKb} KB\n`);
  console.log(`  Open in Microsoft Word and run Update Field on the Table of Contents`);
  console.log(`  to populate page numbers.\n`);
}

main().catch((err) => {
  console.error("Failed to generate documentation:", err);
  process.exit(1);
});
