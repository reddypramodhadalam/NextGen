import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, Header, Footer,
  SimpleField, NumberFormat, ShadingType, VerticalAlign,
  UnderlineType } from 'docx';
import fs from 'fs';

// ── COLOR PALETTE ────────────────────────────────────────────────────────────
const BAXTER_RED   = 'CC0000';
const BAXTER_DARK  = '1A1A2E';
const ACCENT_BLUE  = '0066CC';
const ACCENT_TEAL  = '006666';
const LIGHT_GRAY   = 'F5F7FA';
const MID_GRAY     = 'D0D8E4';
const DARK_GRAY    = '444444';
const TEXT_COLOR   = '1A1A2E';
const WHITE        = 'FFFFFF';

// ── PAGE MARGIN (twips: 1440 = 1 inch) ───────────────────────────────────────
const MARGIN = { top: 1080, right: 1080, bottom: 1080, left: 1080, header: 400, footer: 400 };

// ── FONT ─────────────────────────────────────────────────────────────────────
const FONT = 'Calibri';
const FONT_MONO = 'Courier New';

// ── HELPERS ──────────────────────────────────────────────────────────────────
const em = (txt,opts={})=> new TextRun({ text:txt, font:FONT, color:TEXT_COLOR, size:22, ...opts });
const bold = (txt,opts={})=> em(txt,{bold:true,...opts});
const colored = (txt,c,opts={})=> em(txt,{color:c,...opts});

function P(children, opts={}) {
  const runs = typeof children==='string' ? [em(children)] :
               Array.isArray(children) ? children : [children];
  return new Paragraph({ children:runs, spacing:{after:120,before:60}, ...opts });
}
function H1(text) {
  return new Paragraph({
    children:[new TextRun({text,font:FONT,bold:true,size:40,color:BAXTER_RED})],
    heading:HeadingLevel.HEADING_1,
    spacing:{before:480,after:200},
    border:{bottom:{style:BorderStyle.SINGLE,size:6,color:BAXTER_RED,space:4}},
  });
}
function H2(text) {
  return new Paragraph({
    children:[new TextRun({text,font:FONT,bold:true,size:32,color:ACCENT_BLUE})],
    heading:HeadingLevel.HEADING_2,
    spacing:{before:360,after:160},
    border:{bottom:{style:BorderStyle.SINGLE,size:2,color:MID_GRAY,space:2}},
  });
}
function H3(text) {
  return new Paragraph({
    children:[new TextRun({text,font:FONT,bold:true,size:26,color:ACCENT_TEAL})],
    heading:HeadingLevel.HEADING_3,
    spacing:{before:240,after:100},
  });
}
function H4(text) {
  return new Paragraph({
    children:[new TextRun({text,font:FONT,bold:true,size:24,color:DARK_GRAY})],
    heading:HeadingLevel.HEADING_4,
    spacing:{before:180,after:80},
  });
}
function BODY(text,opts={}) {
  return new Paragraph({
    children:[new TextRun({text,font:FONT,size:22,color:TEXT_COLOR})],
    spacing:{after:120,before:60},
    ...opts,
  });
}
function BULLET(text,level=0) {
  return new Paragraph({
    children:[new TextRun({text,font:FONT,size:22,color:TEXT_COLOR})],
    bullet:{level},
    spacing:{after:80,before:40},
  });
}
function NBULLET(text,level=0) {
  return new Paragraph({
    children:[new TextRun({text,font:FONT,size:22,color:TEXT_COLOR})],
    numbering:{reference:'main-numbering',level},
    spacing:{after:80,before:40},
  });
}
function CODE(text) {
  return new Paragraph({
    children:[new TextRun({text,font:FONT_MONO,size:18,color:'003366'})],
    spacing:{after:40,before:40},
    indent:{left:560},
    shading:{type:ShadingType.SOLID,color:'F0F4FF',fill:'F0F4FF'},
    border:{
      top:{style:BorderStyle.SINGLE,size:2,color:ACCENT_BLUE,space:4},
      bottom:{style:BorderStyle.SINGLE,size:2,color:ACCENT_BLUE,space:4},
      left:{style:BorderStyle.THICK,size:8,color:BAXTER_RED,space:4},
      right:{style:BorderStyle.SINGLE,size:2,color:MID_GRAY,space:4},
    },
  });
}
function NOTE(text,type='NOTE') {
  const col = type==='WARNING'?'CC4400':type==='IMPORTANT'?BAXTER_RED:ACCENT_TEAL;
  return new Paragraph({
    children:[
      new TextRun({text:`${type}: `,font:FONT,bold:true,size:20,color:col}),
      new TextRun({text,font:FONT,size:20,color:TEXT_COLOR,italics:true}),
    ],
    spacing:{after:120,before:120},
    indent:{left:400},
    shading:{type:ShadingType.SOLID,color:type==='WARNING'?'FFF8F0':'F0F8FF',fill:type==='WARNING'?'FFF8F0':'F0F8FF'},
    border:{left:{style:BorderStyle.THICK,size:8,color:col,space:4}},
  });
}
function DIVIDER() {
  return new Paragraph({
    children:[new TextRun({text:'',font:FONT})],
    border:{bottom:{style:BorderStyle.SINGLE,size:2,color:MID_GRAY,space:4}},
    spacing:{after:200,before:200},
  });
}
function PAGEBREAK() {
  return new Paragraph({
    children:[new TextRun({text:'',break:undefined})],
    pageBreakBefore:true,
  });
}
function SPACER(n=1) {
  return [...Array(n)].map(()=>new Paragraph({children:[new TextRun('')],spacing:{after:120}}));
}

function makeTable(headers, rows, colWidths) {
  const widths = colWidths || headers.map(()=>Math.floor(9000/headers.length));
  const hdrRow = new TableRow({
    children: headers.map((h,i)=>new TableCell({
      children:[new Paragraph({
        children:[new TextRun({text:h,font:FONT,bold:true,size:20,color:WHITE})],
        alignment:AlignmentType.CENTER,spacing:{after:60,before:60},
      })],
      shading:{type:ShadingType.SOLID,color:BAXTER_RED,fill:BAXTER_RED},
      width:{size:widths[i],type:WidthType.DXA},
      verticalAlign:VerticalAlign.CENTER,
    })),
    tableHeader:true,
  });
  const bodyRows = rows.map((row,ri)=>new TableRow({
    children:row.map((cell,ci)=>new TableCell({
      children:[new Paragraph({
      children:[new TextRun({text:String(cell),font:FONT,size:20,color:TEXT_COLOR})],
      spacing:{after:60,before:60},
      })],
      shading:{type:ShadingType.SOLID,color:ri%2===0?LIGHT_GRAY:WHITE,fill:ri%2===0?LIGHT_GRAY:WHITE},
      width:{size:widths[ci],type:WidthType.DXA},
      verticalAlign:VerticalAlign.CENTER,
    })),
  }));
  return new Table({
    columnWidths: widths,
    rows:[hdrRow,...bodyRows],
    width:{size:9000,type:WidthType.DXA},
    margins:{top:80,bottom:80,left:120,right:120},
    borders:{
      top:{style:BorderStyle.SINGLE,size:4,color:BAXTER_RED},
      bottom:{style:BorderStyle.SINGLE,size:4,color:BAXTER_RED},
      left:{style:BorderStyle.SINGLE,size:4,color:BAXTER_RED},
      right:{style:BorderStyle.SINGLE,size:4,color:BAXTER_RED},
      insideH:{style:BorderStyle.SINGLE,size:2,color:MID_GRAY},
      insideV:{style:BorderStyle.SINGLE,size:2,color:MID_GRAY},
    },
  });
}

// ── HEADER ───────────────────────────────────────────────────────────────────
function makeHeader(docTitle) {
  return new Header({
    children:[
      new Table({
        columnWidths:[5500,3500],
        rows:[new TableRow({
          children:[
            new TableCell({
              children:[new Paragraph({
                children:[
                  new TextRun({text:'BAXTER',font:FONT,bold:true,size:28,color:BAXTER_RED}),
                  new TextRun({text:'  |  ',font:FONT,size:22,color:MID_GRAY}),
                  new TextRun({text:'AITAS Platform',font:FONT,size:22,color:ACCENT_BLUE,bold:true}),
                ],
              })],
              width:{size:5500,type:WidthType.DXA},
              borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}},
            }),
            new TableCell({
              children:[new Paragraph({
                children:[new TextRun({text:docTitle,font:FONT,size:18,color:DARK_GRAY,italics:true})],
                alignment:AlignmentType.RIGHT,
              })],
              width:{size:3500,type:WidthType.DXA},
              borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}},
            }),
          ],
        })],
        width:{size:9000,type:WidthType.DXA},
        borders:{
          top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.SINGLE,size:4,color:BAXTER_RED},
          left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},
          insideH:{style:BorderStyle.NONE},insideV:{style:BorderStyle.NONE},
        },
      }),
    ],
  });
}

// ── FOOTER ───────────────────────────────────────────────────────────────────
function makeFooter(docVersion) {
  return new Footer({
    children:[
      new Table({
        columnWidths:[3500,2000,3500],
        rows:[new TableRow({
          children:[
            new TableCell({
              children:[new Paragraph({
                children:[new TextRun({text:'CONFIDENTIAL — For Internal Use Only',font:FONT,size:16,color:BAXTER_RED,bold:true})],
              })],
              width:{size:3500,type:WidthType.DXA},
              borders:{top:{style:BorderStyle.SINGLE,size:4,color:BAXTER_RED},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}},
            }),
            new TableCell({
              children:[new Paragraph({
                children:[new TextRun({text:`Version ${docVersion}  |  Baxter International  |  2025`,font:FONT,size:16,color:DARK_GRAY})],
                alignment:AlignmentType.CENTER,
              })],
              width:{size:2000,type:WidthType.DXA},
              borders:{top:{style:BorderStyle.SINGLE,size:4,color:BAXTER_RED},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}},
            }),
            new TableCell({
              children:[new Paragraph({
                children:[
                  new TextRun({text:'Page ',font:FONT,size:16,color:DARK_GRAY}),
                  new SimpleField({instruction:'PAGE',cachedValue:'1'}),
                ],
                alignment:AlignmentType.RIGHT,
              })],
              width:{size:3500,type:WidthType.DXA},
              borders:{top:{style:BorderStyle.SINGLE,size:4,color:BAXTER_RED},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}},
            }),
          ],
        })],
        width:{size:9000,type:WidthType.DXA},
        borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},insideH:{style:BorderStyle.NONE},insideV:{style:BorderStyle.NONE}},
      }),
    ],
  });
}

// ═══════════════════════════════════════════════════════════════════
//  COVER PAGE + DOC CONTROL + TOC
// ═══════════════════════════════════════════════════════════════════
const coverPage = [
  new Paragraph({
    children:[new TextRun({text:'',font:FONT})],spacing:{before:2000,after:100},
  }),
  new Paragraph({
    children:[new TextRun({text:'BAXTER',font:FONT,bold:true,size:72,color:BAXTER_RED})],
    alignment:AlignmentType.CENTER,spacing:{after:80},
  }),
  new Paragraph({
    children:[new TextRun({text:'International Inc.',font:FONT,size:32,color:DARK_GRAY})],
    alignment:AlignmentType.CENTER,spacing:{after:400},
  }),
  new Paragraph({
    children:[new TextRun({text:'AITAS',font:FONT,bold:true,size:96,color:BAXTER_DARK})],
    alignment:AlignmentType.CENTER,spacing:{after:100},
  }),
  new Paragraph({
    children:[new TextRun({text:'AI-Powered Test Automation System',font:FONT,bold:true,size:40,color:ACCENT_BLUE})],
    alignment:AlignmentType.CENTER,spacing:{after:80},
  }),
  new Paragraph({
    children:[new TextRun({text:'Technical Architecture & Product Documentation',font:FONT,size:28,color:DARK_GRAY,italics:true})],
    alignment:AlignmentType.CENTER,spacing:{after:800},
  }),
  new Paragraph({
    border:{
      top:{style:BorderStyle.SINGLE,size:4,color:BAXTER_RED,space:4},
      bottom:{style:BorderStyle.SINGLE,size:4,color:BAXTER_RED,space:4},
    },
    children:[
      new TextRun({text:'  Classification: ',font:FONT,bold:true,size:22,color:BAXTER_RED}),
      new TextRun({text:'CONFIDENTIAL',font:FONT,bold:true,size:22,color:BAXTER_RED}),
      new TextRun({text:'   |   Version: ',font:FONT,size:22,color:DARK_GRAY}),
      new TextRun({text:'1.0',font:FONT,bold:true,size:22,color:ACCENT_BLUE}),
      new TextRun({text:'   |   Date: ',font:FONT,size:22,color:DARK_GRAY}),
      new TextRun({text:'June 2025',font:FONT,bold:true,size:22,color:DARK_GRAY}),
      new TextRun({text:'   |   Owner: ',font:FONT,size:22,color:DARK_GRAY}),
      new TextRun({text:'Baxter QA Engineering  ',font:FONT,bold:true,size:22,color:ACCENT_BLUE}),
    ],
    alignment:AlignmentType.CENTER,spacing:{before:200,after:200},
  }),
];

const docControl = [
  PAGEBREAK(),H1('Document Control'),
  H2('Document Information'),
  makeTable(
    ['Field','Details'],
    [
      ['Document Title','AITAS — AI-Powered Test Automation System: Technical Documentation'],
      ['Document ID','AITAS-TECHDOC-001'],
      ['Version','1.0'],
      ['Status','APPROVED'],
      ['Classification','CONFIDENTIAL'],
      ['Owner','Baxter QA Engineering Team'],
      ['Last Updated','June 2025'],
      ['Review Cycle','Quarterly'],
    ],
    [2500,6500]
  ),
  ...SPACER(1),H2('Version History'),
  makeTable(
    ['Version','Date','Author','Changes','Status'],
    [
      ['0.1','Jan 2025','QA Lead','Initial draft — architecture overview','DRAFT'],
      ['0.5','Mar 2025','Dev Team','Added AI Knowledge Hub, Governance sections','DRAFT'],
      ['0.9','May 2025','Tech Writer','Added SOP, API reference, deployment guide','REVIEW'],
      ['1.0','Jun 2025','QA Director','Final review, approved for distribution','APPROVED'],
    ],
    [1000,1500,1800,4200,1500]
  ),
  ...SPACER(1),H2('Reviewers & Approvers'),
  makeTable(
    ['Name','Role','Action','Date','Signature'],
    [
      ['[Name]','QA Director','Approved','June 2025','___________'],
      ['[Name]','IT Architecture Lead','Reviewed','June 2025','___________'],
      ['[Name]','Compliance Officer','Reviewed','June 2025','___________'],
      ['[Name]','InfoSec Manager','Reviewed','June 2025','___________'],
    ],
    [2000,2200,1400,1400,2000]
  ),
  ...SPACER(1),NOTE('This document is classified CONFIDENTIAL and intended solely for authorized Baxter personnel. Unauthorized distribution is strictly prohibited.','WARNING'),
];

const toc = [
  PAGEBREAK(),H1('Table of Contents'),
  ...[
    ['1','Executive Summary','4'],
    ['2','Product Overview','5'],
    ['3','System Architecture','7'],
    ['3.1','High-Level Architecture','7'],
    ['3.2','Frontend Architecture','9'],
    ['3.3','Backend Architecture','11'],
    ['3.4','Data Architecture','13'],
    ['4','AI Intelligence Engine','15'],
    ['4.1','AI Knowledge Hub','15'],
    ['4.2','Content Extractors','18'],
    ['4.3','AI Structurer & Validator','20'],
    ['4.4','Vector Index & RAG Retrieval','22'],
    ['5','Core Platform Features','24'],
    ['5.1','AI Test Case Generation','24'],
    ['5.2','Multi-Framework Execution','26'],
    ['5.3','AI Self-Healing Engine','28'],
    ['5.4','Autonomous Agents','30'],
    ['5.5','Visual Regression Testing','32'],
    ['5.6','Performance Benchmarking','33'],
    ['5.7','Test Data Factory','34'],
    ['5.8','Coverage Matrix & Analytics','35'],
    ['6','Enterprise Integrations','36'],
    ['7','CI/CD & DevOps Integration','38'],
    ['8','Governance & Compliance','40'],
    ['9','Security Architecture','43'],
    ['10','Deployment Architecture','45'],
    ['11','API Reference','48'],
    ['12','Glossary','51'],
  ].map(([num,title,pg])=>new Paragraph({
    children:[
      new TextRun({text:`${num}  ${title}`,font:FONT,size:22,color:TEXT_COLOR}),
      new TextRun({text:'  ........................................  ',font:FONT,size:22,color:MID_GRAY}),
      new TextRun({text:pg,font:FONT,size:22,color:ACCENT_BLUE,bold:true}),
    ],
    spacing:{after:80,before:40},
    indent:{left:num.includes('.')?400:0},
  })),
];

// ── SECTION 1 & 2 ────────────────────────────────────────────────────────────
const sec1 = [
  PAGEBREAK(),H1('1. Executive Summary'),
  BODY('AITAS (AI-Powered Test Automation System) is a next-generation enterprise quality assurance platform developed to transform how Baxter International approaches software testing. Built on a foundation of artificial intelligence, AITAS eliminates the manual effort traditionally required for test case creation, script maintenance, and defect analysis.'),
  BODY('In regulated pharmaceutical and medical device environments, the cost of software failures extends beyond financial impact — it affects patient safety, regulatory compliance, and brand reputation. AITAS was engineered specifically to address these high-stakes demands by combining the power of GPT-4o AI with enterprise-grade governance controls, including full 21 CFR Part 11 compliance.'),
  H2('Key Value Propositions'),
  BULLET('80% reduction in manual test case writing time — AI generates complete test suites from plain-English requirements in seconds.'),
  BULLET('10x faster test generation compared to traditional manual authoring workflows.'),
  BULLET('Automatic self-healing of broken test scripts using AI diagnosis — no human intervention required for selector failures.'),
  BULLET('Complete enterprise coverage: SAP (Fiori + GUI), Salesforce, Oracle JDE, web browsers, REST/GraphQL/SOAP APIs, and mobile (iOS/Android).'),
  BULLET('21 CFR Part 11 and EU Annex 11 compliant — electronic signatures, immutable audit trails, human review gates.'),
  BULLET('Native CI/CD integration with GitHub Actions, GitLab CI, Jenkins, and Azure DevOps.'),
  H2('Business Impact'),
  makeTable(
    ['Metric','Before AITAS','After AITAS','Improvement'],
    [
      ['Test case creation','3–5 days per suite','< 5 minutes','99% faster'],
      ['Script maintenance','40% of QA time','< 5% of QA time','87% reduction'],
      ['Test coverage','~60% requirements','95%+ requirements','35% increase'],
      ['Compliance readiness','Manual audit prep (weeks)','Automated audit trail','Always audit-ready'],
      ['Release cycle','Monthly (testing bottleneck)','Weekly or continuous','3–4x faster'],
    ],
    [2500,2000,2000,2500]
  ),
  PAGEBREAK(),H1('2. Product Overview'),
  H2('2.1 What is AITAS?'),
  BODY('AITAS is a full-stack enterprise test management and automation platform built on React 18 (frontend) and Node.js/Express (backend), powered by OpenAI GPT-4o. It provides a unified web interface for the complete software testing lifecycle — from requirement ingestion to test execution, reporting, and compliance documentation.'),
  BODY('The platform is designed to serve multiple stakeholder groups simultaneously:'),
  BULLET('QA Engineers — who need fast, reliable test automation without deep coding expertise.'),
  BULLET('Development Teams — who need tests integrated into their CI/CD pipelines.'),
  BULLET('QA Managers — who need coverage visibility, analytics, and compliance reports.'),
  BULLET('Compliance Officers — who need immutable audit trails, e-signatures, and regulatory documentation.'),
  BULLET('IT Leadership — who need a single platform to replace fragmented testing toolchains.'),
  H2('2.2 Core Capabilities at a Glance'),
  makeTable(
    ['Capability','Description','Supported Technologies'],
    [
      ['AI Test Generation','Generates test cases from natural language requirements','GPT-4o, Azure OpenAI, Rule-based fallback'],
      ['Multi-Framework Execution','Executes tests across all major automation frameworks','Playwright, Puppeteer, Selenium, Appium, WinAppDriver'],
      ['Enterprise ERP Testing','Purpose-built executors for complex ERP applications','SAP Fiori, SAP GUI, Salesforce, Oracle JDE'],
      ['API Testing','Full API contract and functional testing','REST, GraphQL, SOAP/WSDL'],
      ['AI Self-Healing','Automatically repairs broken test selectors and steps','GPT-4o diagnosis + auto-apply'],
      ['Autonomous Agents','Background agents run tests continuously 24/7','Configurable schedule, self-healing, notifications'],
      ['AI Knowledge Hub','Upload documents → extract enterprise knowledge → power test gen','PPTX, PDF, DOCX, Images, URLs'],
      ['Visual Regression','Pixel-level screenshot comparison across releases','Configurable threshold, baseline management'],
      ['Performance Benchmarking','Core Web Vitals and load time tracking','LCP, FID, CLS, FCP, TTFB'],
      ['Governance & Compliance','Human review gates, e-signatures, audit trails','21 CFR Part 11, EU Annex 11, GxP, SOX'],
      ['CI/CD Integration','Bidirectional integration with major DevOps pipelines','GitHub, GitLab, Jenkins, Azure DevOps'],
    ],
    [2200,3500,3300]
  ),
  H2('2.3 Supported Platforms'),
  BODY('AITAS supports the following application types and testing platforms out of the box:'),
  H3('Web Applications'),
  BULLET('Modern SPAs (React, Angular, Vue, Svelte)'),BULLET('Legacy server-rendered applications'),BULLET('Progressive Web Apps (PWAs)'),
  H3('Enterprise ERP Systems'),
  BULLET('SAP Fiori (web-based SAPUI5/Fiori Elements)'),BULLET('SAP GUI (desktop client via VBScript automation)'),
  BULLET('Salesforce CRM (Lightning + Classic experience)'),BULLET('Oracle JDE EnterpriseOne (AIS + E1 Pages)'),
  H3('API & Integration Testing'),
  BULLET('RESTful HTTP APIs (GET, POST, PUT, PATCH, DELETE)'),BULLET('GraphQL (queries, mutations, subscriptions)'),
  BULLET('SOAP/WSDL web services with XML parsing'),
  H3('Mobile Applications'),
  BULLET('iOS native apps (XCUITest driver via Appium)'),BULLET('Android native apps (UiAutomator2 via Appium)'),
  BULLET('Real devices and simulators/emulators'),
  H3('Desktop Applications'),
  BULLET('.NET Windows desktop apps (WinAppDriver/UIAutomation)'),BULLET('Java desktop applications (Java Accessibility Bridge)'),
  BULLET('Image-based automation (Sikuli for legacy apps)'),
];

// ── SECTION 3 — ARCHITECTURE ─────────────────────────────────────────────────
const sec3 = [
  PAGEBREAK(),H1('3. System Architecture'),
  H2('3.1 High-Level Architecture'),
  BODY('AITAS follows a classic three-tier architecture with five distinct functional layers. Every layer is independently deployable and communicates through well-defined interfaces, enabling future scaling without code changes.'),
  makeTable(
    ['Layer','Name','Technology','Purpose'],
    [
      ['A','Client Browser','React 18 SPA + Vite + TypeScript','Delivers the full user interface — 14 pages covering all platform features.'],
      ['B','API Server','Express.js v5 + Node.js 24 + TypeScript','Handles all business logic, AI orchestration, execution dispatch, and governance.'],
      ['C-Left','Executor Adapters','12 execution adapters (Playwright, SAP, etc.)','Runs tests across all supported platforms and frameworks.'],
      ['C-Right','KB Pipeline','IngestionEngine + GPT-4o + VectorIndex','Transforms raw documents into structured, searchable enterprise knowledge.'],
      ['D','Data Layer','Drizzle ORM + PostgreSQL/SQLite','Persists all entities, results, governance records, and knowledge items.'],
      ['E','External Services','OpenAI, CI/CD systems, Notifications, Auth','Third-party services consumed via API integrations.'],
    ],
    [800,1800,2600,3800]
  ),
  ...SPACER(1),NOTE('The IStorage interface in Layer D abstracts all database operations. Switching from PostgreSQL to SQLite requires changing a single environment variable — no code changes.'),
  H2('3.2 Frontend Architecture'),
  H3('Technology Stack'),
  BULLET('React 18 — Component-based UI with Concurrent Mode and Suspense'),
  BULLET('Vite 5 — Ultra-fast HMR build tool with ESM-native bundling'),
  BULLET('TypeScript — Full type safety across all components and API calls'),
  BULLET('Wouter 3 — Lightweight client-side router (2KB vs React Router 50KB)'),
  BULLET('TanStack React Query v5 — Server state management with intelligent caching'),
  BULLET('shadcn/ui + Radix UI — Accessible, unstyled component primitives'),
  BULLET('Tailwind CSS v3 — Utility-first CSS with dark mode support'),
  BULLET('Framer Motion — Production-grade animation library'),
  BULLET('Recharts + Chart.js — Analytics dashboards and data visualization'),
  BULLET('React Hook Form + Zod — Form management with runtime validation'),
  H3('Application Pages'),
  makeTable(
    ['Page','Route','Purpose'],
    [
      ['Dashboard','/','Real-time KPI cards, execution status, agent health, activity feed'],
      ['AI Generator','/generate','Generate test cases from requirements with AI model selection'],
      ['Repository','/repository','Browse, edit, review, and manage all test cases and suites'],
      ['Executions','/executions','Trigger runs, monitor progress, view live logs'],
      ['AI Healer','/healer','Review and apply AI-suggested test fixes'],
      ['Agents','/agents','Configure and monitor autonomous test agents'],
      ['CI/CD','/cicd','Manage webhook triggers and pipeline integrations'],
      ['Knowledge Hub','/knowledge','Upload documents and manage enterprise knowledge base'],
      ['Coverage Matrix','/coverage','Visualize requirement-to-test coverage'],
      ['Reports','/reports','View, filter, and export execution reports'],
      ['Performance','/performance','Core Web Vitals trending and benchmarks'],
      ['Governance','/governance','Human review queues, e-signatures, audit logs'],
      ['Admin','/admin','User management, roles, platform settings'],
      ['Settings','/settings','Environment config, notifications, integrations'],
    ],
    [1800,1800,5400]
  ),
  H2('3.3 Backend Architecture'),
  H3('Core Server Modules'),
  BODY('The Express.js API server is organized into focused modules, each with a clear single responsibility:'),
  makeTable(
    ['Module','File','Responsibility'],
    [
      ['Auth Layer','auth/','Passport.js local strategy, PBKDF2 hashing, session management'],
      ['REST Routes','routes.ts','All 60+ API endpoints — organized by domain'],
      ['Zod Validation','(inline)','Request body validation on all POST/PATCH endpoints'],
      ['AI Client','ai-client.ts','Unified client factory: OpenAI / Azure / Custom LLM / fallback'],
      ['AI Test Executor','ai-test-executor.ts','Orchestrates AI test generation across all generators'],
      ['AI Self Healer','unified-ai-healer.ts','GPT-4o based broken test diagnosis and repair'],
      ['Test Scheduler','test-scheduler.ts','Cron-based and interval-based autonomous test scheduling'],
      ['CI/CD Engine','cicd-engine.ts','Webhook processing, GitHub/GitLab/Jenkins/Azure integration'],
      ['Knowledge Pipeline','knowledge/','Full RAG ingestion pipeline — extractors, structurer, vector index'],
      ['Execution Router','unified-execution-adapter.ts','Routes test runs to the correct executor adapter'],
      ['Governance','governance/','Review gates, e-signature validation, audit logging'],
      ['Coverage Matrix','coverage-matrix.ts','Maps requirements to test cases, gap analysis'],
      ['Performance','performance-benchmark.ts','Core Web Vitals collection and trending'],
      ['Visual Regression','visual-regression-engine.ts','Screenshot baseline management and pixel diff'],
      ['Notifications','notifications.ts','Slack, Teams, and email notification dispatch'],
    ],
    [2000,2500,4500]
  ),
  H2('3.4 Data Architecture'),
  H3('Database Schema Overview'),
  BODY('AITAS uses Drizzle ORM to manage a fully type-safe database schema. The schema is defined once in TypeScript and works identically against PostgreSQL (production) and SQLite (development/self-hosted).'),
  makeTable(
    ['Table','Primary Purpose','Key Fields'],
    [
      ['users','User accounts and authentication','id, email, passwordHash, isActive, isSuperAdmin'],
      ['sessions','Express session persistence','sid, sess, expire'],
      ['roles','RBAC role definitions','id, name, permissions[], isSystem'],
      ['user_roles','User-to-role assignments','userId, roleId, assignedAt'],
      ['projects','Multi-project support','id, name, slug, ownerId, settings{}'],
      ['team_memberships','Project team membership','userId, projectId, roleId, isOwner'],
      ['test_suites','Test suite containers','id, name, description, tags[]'],
      ['test_cases','Individual test cases','id, suiteId, title, steps[], priority, reviewStatus, aiProvenance{}'],
      ['test_executions','Execution run records','id, suiteId, framework, status, passedTests, duration'],
      ['test_results','Per-test-case results','id, executionId, testCaseId, status, screenshot, video, networkLogs, performanceMetrics'],
      ['test_agents','Autonomous agent configs','id, name, isAutonomous, targetUrl, scheduleInterval, selfHealingEnabled'],
      ['environments','Target environment configs','id, name, baseUrl, variables{}, headers{}'],
      ['test_data_pools','Reusable test data sets','id, name, dataType, data[], isShared'],
      ['generated_scripts','Auto-generated test scripts','id, testCaseId, framework, language, code, version'],
      ['visual_baselines','Screenshot baseline images','id, testCaseId, baselineImage, threshold, viewport{}'],
      ['visual_comparisons','Regression comparison results','id, baselineId, executionId, diffPercentage, passed'],
      ['performance_metrics','Core Web Vitals data','id, executionId, lcp, fid, cls, fcp, ttfb'],
      ['requirements','Business requirements for AI gen','id, title, description, acceptanceCriteria[], generatedTestCount'],
      ['api_mocks','Service virtualization mocks','id, method, urlPattern, responseBody{}, delay'],
      ['cicd_webhooks','CI/CD integration configs','id, provider, suiteId, triggerOn[], isActive'],
      ['governance_audit_log','Immutable compliance audit trail','id, eventType, severity, actorId, signature (SHA-256)'],
      ['review_records','Human approval records','id, resourceId, decision, reviewerName, contentHashAtReview, signature'],
      ['evidence_reviews','Screenshot/artifact review','id, evidenceType, attestedCorrectness, uploadedToAqm'],
      ['platform_settings','System-wide configuration','id, category, key, value, valueJson{}'],
      ['knowledge_sources','KB source file registry','id, name, sourceType, status, application, documentCount'],
      ['structured_knowledge','Canonical knowledge items','id, sourceId, application, module, objectName, knowledgeType, facts{}'],
    ],
    [2500,2500,4000]
  ),
];

// ── SECTION 4 — AI KNOWLEDGE HUB ─────────────────────────────────────────────
const sec4 = [
  PAGEBREAK(),H1('4. AI Intelligence Engine — Knowledge Hub'),
  H2('4.1 Overview'),
  BODY('The AI Knowledge Hub is AITAS\'s most powerful differentiator. It is a document intelligence pipeline that ingests any enterprise document — PowerPoint presentations, PDFs, Word files, images, or live URLs — and transforms them into structured, queryable knowledge. This knowledge is then used to ground AI test generation in real application context, dramatically improving the accuracy and relevance of generated test cases.'),
  BODY('The problem it solves: Without a knowledge hub, AI test generators hallucinate field names, business process steps, and validation rules. With the Knowledge Hub, every generated test case is grounded in real, enterprise-specific documentation.'),
  H2('4.2 The 6-Stage Ingestion Pipeline'),
  NOTE('The ingestion pipeline is fully asynchronous. The UI polls the source status (PENDING → INGESTING → CLASSIFYING → EXTRACTING → EMBEDDING → READY) to show real-time progress.'),
  makeTable(
    ['Stage','Name','What Happens','Output'],
    [
      ['1','Upload & Detect','File buffer or URL received. MIME type and file extension detected. Correct extractor identified.','Routing decision to extractor'],
      ['2','Content Extraction','Dedicated extractor parses the file. Text, tables, bullets, images, and notes extracted per page/slide.','ExtractedUnit[] array'],
      ['3','AI Structuring','GPT-4o reads extracted content in chunks. Strict rules prevent hallucination. Outputs structured knowledge items.','CanonicalKnowledge[] array'],
      ['4','Validation','Anti-hallucination engine cross-checks every AI-extracted fact against the source text. Rejects unsupported claims.','Valid + Rejected item lists'],
      ['5','Database Storage','Validated knowledge items saved to the structured_knowledge table, linked to source and confidence-scored.','DB rows with IDs'],
      ['6','Vector Indexing','OpenAI text-embedding-3-small generates float[] embeddings per chunk. TF-IDF term frequency computed for hybrid search.','VectorEntry[] in-memory + disk'],
    ],
    [600,1800,3200,2400]
  ),
  H2('4.3 Content Extractors'),
  BODY('Five production-grade extractors handle every supported input format. Each implements the IContentExtractor interface and outputs standardized ExtractedUnit objects.'),
  H3('PPTX Extractor'),
  BULLET('Parses PowerPoint files using JSZip + XML parsing'),
  BULLET('Extracts: slide title, body text, bullet points, speaker notes'),
  BULLET('Detects embedded tables and structured data'),
  BULLET('Identifies diagram shapes (flowcharts, decision boxes, arrows)'),
  BULLET('Output unit type: SLIDE'),
  H3('PDF Extractor'),
  BULLET('Full text extraction per page using pdf-parse'),
  BULLET('Multi-column layout detection and linearization'),
  BULLET('Table structure preservation with header detection'),
  BULLET('Document metadata extraction (author, title, creation date)'),
  BULLET('Output unit type: PAGE'),
  H3('DOCX Extractor'),
  BULLET('Word document parsing using mammoth.js'),
  BULLET('Heading hierarchy detection for section segmentation'),
  BULLET('Paragraph, list, and embedded table extraction'),
  BULLET('Output unit type: SECTION'),
  H3('Image Extractor (OCR)'),
  BULLET('Tesseract.js-powered optical character recognition'),
  BULLET('UI element detection: buttons, input fields, labels, dropdowns'),
  BULLET('Form layout analysis for ERP screen captures'),
  BULLET('OCR confidence scoring per detected element'),
  BULLET('Output unit type: IMAGE_REGION'),
  H3('URL / SharePoint Extractor'),
  BULLET('Live web page content extraction via HTTP'),
  BULLET('SharePoint document library support'),
  BULLET('HTML structure parsing — headings, paragraphs, tables'),
  BULLET('Output unit type: SECTION'),
  H2('4.4 AI Knowledge Structurer'),
  BODY('The Knowledge Structurer uses GPT-4o with a strict system prompt to convert raw ExtractedUnit content into CanonicalKnowledge objects. The system prompt enforces eight non-negotiable rules to prevent hallucination:'),
  BULLET('Only extract facts EXPLICITLY present in the source content.'),
  BULLET('NEVER hallucinate object IDs, table names, field names, or T-codes.'),
  BULLET('NEVER invent business process steps not described in the document.'),
  BULLET('If uncertain about a value, OMIT the field rather than guess.'),
  BULLET('Confidence score must reflect actual evidence strength in the content.'),
  BULLET('Do NOT generate UI selectors (CSS/XPath) — those are runtime artifacts.'),
  BULLET('Do NOT generate test scripts — only extract business knowledge facts.'),
  BULLET('Output must be valid JSON array — no markdown, no commentary.'),
  H3('8 Knowledge Types Extracted'),
  makeTable(
    ['Knowledge Type','Description','Example Objects'],
    [
      ['PROCESS','Step-by-step business workflows','P4310 Purchase Order Entry, ME21N SAP PO creation'],
      ['CONFIGURATION','System configuration parameters','Number series, approval thresholds, UOM defaults'],
      ['INTEGRATION','Inter-system connection points','JDE F4311 → F0401 Address Book integration'],
      ['TABLE_SCHEMA','Database table structures','JDE F-files, SAP EKKO/EKPO, Salesforce sObjects'],
      ['BUSINESS_RULE','Validation rules and constraints','Approval required for POs > $5,000'],
      ['WORKFLOW','Approval and routing workflows','3-level approval for capital expenditure'],
      ['REPORT','Report definitions and outputs','Supplier performance, open PO aging'],
      ['UI_FLOW','Screen navigation and UI interactions','JDE menu path, SAP easy access, SF Lightning nav'],
    ],
    [2000,3500,3500]
  ),
  H2('4.5 Vector Index & RAG Retrieval'),
  H3('Indexing Strategy'),
  BODY('Each CanonicalKnowledge item is converted to a text chunk embedding:'),
  CODE('[APP] Module > ObjectName (KnowledgeType)\nDescription...\nProcess: Step1 -> Step2 -> Step3\nFields: Supplier No, Item No, Qty\nValidations: Approval required > $5000\nActions: Create, Approve, Cancel'),
  BODY('OpenAI\'s text-embedding-3-small model generates a 1536-dimensional float[] vector for each chunk. Term frequency (TF-IDF) is also pre-computed for keyword fallback.'),
  H3('Hybrid Retrieval Formula'),
  CODE('Hybrid Score = 0.7 x cosine_similarity(queryEmbedding, chunkEmbedding)\n             + 0.3 x keyword_overlap(queryTermFreq, chunkTermFreq)'),
  NOTE('Semantic search dominates when OpenAI API is available. If the API key is not configured, the system falls back to pure keyword search — ensuring the platform always works.'),
  H3('RAG Injection into Test Generation'),
  BODY('Every AI test generator calls buildRAGContextBlock() before sending the prompt to GPT-4o. This function:'),
  BULLET('Takes the user\'s requirement text as the query'),
  BULLET('Embeds the query using text-embedding-3-small'),
  BULLET('Retrieves top-6 most relevant knowledge items (configurable)'),
  BULLET('Formats them into a structured === KNOWLEDGE BASE CONTEXT === block'),
  BULLET('Appends the block to the GPT-4o system prompt'),
  BULLET('Result: AI-generated tests grounded in real enterprise knowledge'),
];

const sec5 = [
  PAGEBREAK(),H1('5. Core Platform Features'),
  H2('5.1 AI Test Case Generation'),
  BODY('AITAS generates complete, structured test cases from plain-English business requirements. The generation pipeline follows five stages: RAG retrieval, AI structuring, NLP step parsing, validation, and storage.'),
  H3('How It Works'),
  NBULLET('User pastes or uploads a business requirement into the Generator page.'),
  NBULLET('AITAS retrieves relevant knowledge from the KB using RAG (if documents uploaded).'),
  NBULLET('GPT-4o receives the requirement + KB context and generates structured test cases as JSON.'),
  NBULLET('Each test case includes: title, description, preconditions, step-by-step actions, expected results.'),
  NBULLET('Generated test cases are validated against the Zod schema and saved to the database.'),
  NBULLET('If in VALIDATED mode, test cases are stamped DRAFT and queued for human review.'),
  H3('Script Generation'),
  BODY('From any test case, AITAS generates executable automation scripts in 4 frameworks x 5 languages:'),
  makeTable(
    ['Framework','TypeScript','JavaScript','Python','Java','C#'],
    [
      ['Playwright','Yes','Yes','Yes','Yes','Yes'],
      ['Selenium WebDriver','Yes','Yes','Yes','Yes','Yes'],
      ['Puppeteer','Yes','Yes','N/A','N/A','N/A'],
      ['Cypress','Yes','Yes','N/A','N/A','N/A'],
    ],
    [2000,1400,1400,1400,1400,1400]
  ),
  H2('5.2 AI Self-Healing Engine'),
  BODY('When automated tests fail due to UI changes — changed CSS selectors, moved elements, timing issues — AITAS\'s self-healing engine automatically diagnoses and fixes the problem without human intervention.'),
  H3('Healing Process'),
  makeTable(
    ['Step','Action','Technology'],
    [
      ['1. Failure Detected','Test step fails — error captured with full context (DOM, error message, screenshot)','Playwright/Selenium error capture'],
      ['2. AI Diagnosis','GPT-4o analyses the failure context, DOM snapshot, and original step definition','GPT-4o with structured prompt'],
      ['3. Fix Suggested','AI proposes new selector, updated timing, or revised step logic','Structured JSON response'],
      ['4. Auto-Applied','Fix is applied to the test case in the database','Drizzle ORM update'],
      ['5. Re-execution','Test re-runs with the healed step (up to maxRetries attempts)','Executor retry loop'],
      ['6. Audit Logged','Healing event recorded in governance_audit_log with AI_HEALER_FIX_APPLIED event type','SHA-256 signed audit entry'],
    ],
    [600,2500,3600,2300]
  ),
  H3('What the Healer Fixes'),
  BULLET('Stale CSS selectors and XPath expressions after DOM changes'),
  BULLET('Timing and synchronization issues (increased waits, better retry logic)'),
  BULLET('Changed page flows and navigation redirects'),
  BULLET('Dynamic element IDs and class names that change per session'),
  BULLET('Missing or repositioned UI components after redesigns'),
  H2('5.3 Autonomous Test Agents'),
  BODY('Autonomous agents are background workers that execute test suites on a schedule — continuously and without human intervention. Each agent is independently configurable and self-healing.'),
  H3('Agent Configuration Parameters'),
  makeTable(
    ['Parameter','Type','Description','Example'],
    [
      ['name','string','Human-readable agent identifier','Agent-01-Login-Tests'],
      ['targetUrl','string','Application URL to test','https://app.example.com'],
      ['suiteId','UUID','Test suite to execute','uuid of authentication suite'],
      ['scheduleInterval','integer (minutes)','How often to run (null = continuous)','15'],
      ['maxRetries','integer','Self-healing retry attempts','3'],
      ['selfHealingEnabled','boolean','Enable AI auto-repair on failure','true'],
      ['notifyOnFailure','boolean','Send Slack/Teams/email on failure','true'],
      ['framework','string','Execution framework to use','playwright'],
    ],
    [2000,1600,3200,2200]
  ),
];

const sec5b = [
  H2('5.4 Enterprise ERP Integrations'),
  makeTable(
    ['Platform','Approach','Key Capabilities'],
    [
      ['SAP Fiori (Web)','Playwright-based browser automation','SAPUI5/Fiori Elements, login, navigation, transaction testing, table assertions'],
      ['SAP GUI (Desktop)','VBScript SAP GUI scripting generation','T-code execution, screen field interaction, SAP table data validation'],
      ['Salesforce','Playwright on Lightning/Classic UI','Standard objects, custom objects, flows, SOQL validation, Apex triggers'],
      ['Oracle JDE','AIS REST API + Selenium for E1 Pages','Business function calls, form automation, orchestrator testing, batch jobs'],
    ],
    [2000,2500,4500]
  ),
  H2('5.5 Visual Regression Testing'),
  BODY('AITAS captures a baseline screenshot for each test case and compares it pixel-by-pixel on every subsequent run. Differences above a configurable threshold automatically fail the test.'),
  makeTable(
    ['Feature','Description'],
    [
      ['Baseline Capture','Full-page or element-level screenshot captured and stored as base64'],
      ['Pixel Diff Engine','Compares actual vs baseline, generates a diff image highlighting changes'],
      ['Threshold Control','Configurable % difference allowed (default 5%)'],
      ['Viewport Config','Test at specific viewport sizes (desktop, tablet, mobile)'],
      ['Environment Isolation','Separate baselines per environment (staging vs production)'],
      ['Version Control','Baseline versioning — update baseline intentionally when UI changes are approved'],
    ],
    [2500,6500]
  ),
  H2('5.6 Coverage Matrix & Analytics'),
  BODY('AITAS automatically maps test cases to requirements via tag and keyword matching, then calculates coverage percentages per requirement. This provides instant visibility into testing gaps.'),
  BODY('The analytics engine provides:'),
  BULLET('Real-time coverage percentage per requirement and overall'),
  BULLET('List of uncovered requirements with zero test coverage'),
  BULLET('AI-generated insights summarizing execution results in plain English'),
  BULLET('Pass-rate trends over the last 30 days'),
  BULLET('Flaky test detection — tests that alternate pass/fail'),
  BULLET('Failure pattern analysis grouped by error type, framework, and environment'),
  H2('5.7 Test Data Factory'),
  BODY('The Test Data Factory generates synthetic, realistic test data on demand — eliminating the need for real production data in test environments.'),
  makeTable(
    ['Data Type','Generated Fields','Use Case'],
    [
      ['User Data','firstName, lastName, email, username, phone, dateOfBirth, role','Login, profile, user management tests'],
      ['Product Data','productName, SKU, price, category, stockQty, supplier','E-commerce, inventory, catalog tests'],
      ['Payment Data','card number (masked), expiry, bank account, currency, amount','Checkout, payment processing tests'],
      ['Address Data','street, city, state, postalCode, country, GPS coordinates','Shipping, address validation tests'],
      ['Date & Time','ISO dates, past/future ranges, business days, fiscal periods','Date picker, scheduling, expiry tests'],
      ['Custom Pools','User-defined data sets, CSV/JSON import, shared across suites','Domain-specific test data'],
    ],
    [1800,3000,4200]
  ),
  BODY('Test data is injected using placeholder syntax: {{username}}, {{email}}, {{price}}. Placeholders are substituted at execution time.'),
];

const sec6 = [
  PAGEBREAK(),H1('6. Governance & Compliance'),
  H2('6.1 Overview'),
  BODY('AITAS is purpose-built for regulated industries including pharmaceutical, medical device, and financial services. It implements all controls required by 21 CFR Part 11, EU Annex 11, and GxP validation standards.'),
  H2('6.2 Validated vs Non-Validated Mode'),
  makeTable(
    ['Aspect','VALIDATED Mode','NON-VALIDATED Mode'],
    [
      ['AI-generated content','DRAFT — blocked until reviewed','Active immediately'],
      ['Execution gate','Requires APPROVED status','No approval required'],
      ['E-signature','Mandatory for all approvals','Not required'],
      ['Audit logging','Every action logged with SHA-256 signature','Actions logged without signature'],
      ['AI healing','Blocked — human must review fix','Applied automatically'],
      ['Evidence upload','Requires attestation review','Direct upload allowed'],
    ],
    [2500,3250,3250]
  ),
  H2('6.3 Human-in-the-Loop Review Gate'),
  BODY('In VALIDATED mode, every AI-generated test case must pass through a formal review gate before it can be executed. The gate cannot be bypassed — not even by system administrators.'),
  H3('Review Workflow'),
  NBULLET('AI generates test case → status set to DRAFT automatically.'),
  NBULLET('Reviewer opens the Review Gate dialog in the AITAS UI.'),
  NBULLET('Reviewer reads the test case content and confirms accuracy.'),
  NBULLET('Reviewer types their legal name as an electronic signature (21 CFR Part 11 compliant).'),
  NBULLET('Backend validates: name must match account exactly (case-insensitive).'),
  NBULLET('A SHA-256 signed review_records row is created and stored immutably.'),
  NBULLET('Test case status changes to APPROVED — execution gate cleared.'),
  NBULLET('Any subsequent edit to the test case resets it to DRAFT — re-review required.'),
  H2('6.4 Immutable Audit Trail'),
  BODY('Every governance-relevant action in AITAS generates an append-only audit log entry in the governance_audit_log table. Entries are cryptographically signed with SHA-256 and can be independently verified.'),
  makeTable(
    ['Event Type','Trigger','Severity'],
    [
      ['AI_TEST_CASE_GENERATED','AI generates any test case','INFO'],
      ['HUMAN_REVIEW_APPROVED','Reviewer approves with e-signature','INFO'],
      ['HUMAN_REVIEW_REJECTED','Reviewer rejects with comment','WARNING'],
      ['AI_HEALER_FIX_APPLIED','Self-healer applies a fix to a test case','WARNING'],
      ['EXECUTION_BLOCKED_NO_REVIEW','Attempt to run unapproved test in VALIDATED mode','CRITICAL'],
      ['SYSTEM_TYPE_CHANGED','System switches between VALIDATED/NON-VALIDATED','CRITICAL'],
      ['REVIEW_BYPASS_DENIED','Attempt to bypass the review gate','CRITICAL'],
      ['EVIDENCE_UPLOADED','Screenshot uploaded to AQM system','INFO'],
    ],
    [3000,3500,2500]
  ),
  H2('6.5 Evidence Attestation'),
  BODY('Before any screenshot or test artifact can be uploaded to an external quality management system (AQM) in VALIDATED mode, a reviewer must attest to three conditions:'),
  BULLET('The evidence contains no sensitive personal data (PII).'),
  BULLET('The evidence is correct and accurately represents the test outcome.'),
  BULLET('The evidence matches the specific test step it is associated with.'),
  NOTE('All three attestation checkboxes must be checked. The system rejects partial attestations. This is enforced in both the frontend UI and the backend API.','IMPORTANT'),
];

const sec7 = [
  PAGEBREAK(),H1('7. Security Architecture'),
  H2('7.1 Defense-in-Depth Security Model'),
  BODY('AITAS implements security as six independent, verifiable layers. Each layer is independently effective — compromise of one layer does not defeat the others.'),
  makeTable(
    ['Layer','Name','Implementation','Standard'],
    [
      ['1','Password Security','PBKDF2-SHA256 with 100,000 iterations and 32-byte cryptographically random salt','NIST SP 800-132'],
      ['2','Input Validation','Zod schema validation on all POST/PATCH endpoints. Sanitized error messages.','OWASP Input Validation'],
      ['3','Session Security','httpOnly, secure, sameSite=lax cookies. SESSION_SECRET via env var. PostgreSQL-backed sessions.','OWASP Session Management'],
      ['4','Access Control','Role-Based Access Control (RBAC). Admin/Tester/Viewer roles. Per-project team membership. isSuperAdmin flag.','NIST RBAC (AC-3)'],
      ['5','Webhook Security','GitHub: HMAC-SHA256 (X-Hub-Signature-256). GitLab: token comparison. Azure: Bearer token.','HMAC RFC 2104'],
      ['6','Compliance Audit','SHA-256 signed, append-only audit log. Tamper detection via /api/governance/audit/verify/:id.','21 CFR Part 11'],
    ],
    [600,1800,2800,1800,3000]
  ),
];

const sec8 = [
  PAGEBREAK(),H1('8. Deployment Architecture'),
  H2('8.1 Docker Compose (Standard)'),
  BODY('The recommended production deployment uses Docker Compose with three services:'),
  CODE('services:\n  aitas-app:\n    image: aitas:latest\n    ports: ["5000:5000"]\n    environment:\n      - DATABASE_URL=postgresql://...\n      - SESSION_SECRET=<strong-secret>\n      - OPENAI_API_KEY=<key>\n    depends_on: [postgres]\n\n  postgres:\n    image: postgres:15\n    volumes: [pgdata:/var/lib/postgresql/data]\n\n  selenium-hub: (optional)\n    image: selenium/hub:4.x'),
  H2('8.2 Environment Variables'),
  makeTable(
    ['Variable','Required','Description','Example'],
    [
      ['DATABASE_URL','Yes (prod)','PostgreSQL connection string','postgresql://user:pass@host:5432/aitas'],
      ['SESSION_SECRET','Yes','Strong random string for session signing','64+ char random string'],
      ['OPENAI_API_KEY','Recommended','OpenAI API key for GPT-4o','sk-...'],
      ['AZURE_OPENAI_API_KEY','Optional','Azure OpenAI alternative','key from Azure portal'],
      ['LLM_API_URL','Optional','Custom LLM endpoint URL','https://your-llm.example.com/v1'],
      ['NODE_ENV','Yes','Runtime environment','production'],
      ['PORT','No','Server port (default 5000)','5000'],
    ],
    [2500,1000,3500,3000]
  ),
  H2('8.3 Health Endpoints'),
  makeTable(
    ['Endpoint','Method','Purpose','Response'],
    [
      ['GET /api/health','GET','Liveness probe — is the server running?','{"status":"ok"}'],
      ['GET /api/ready','GET','Readiness probe — is the DB connected?','{"status":"ready","db":"connected"}'],
    ],
    [2500,1000,3500,3000]
  ),
];

const sec9 = [
  PAGEBREAK(),H1('9. API Reference Summary'),
  H2('9.1 Authentication'),
  BODY('All API endpoints (except /api/health and /api/ready) require an active session cookie. Send credentials to POST /api/auth/login to establish a session.'),
  makeTable(
    ['Endpoint','Method','Body','Description'],
    [
      ['/api/auth/login','POST','{"username","password"}','Authenticate and create session'],
      ['/api/auth/logout','POST','(none)','Destroy current session'],
      ['/api/auth/user','GET','(none)','Get current authenticated user'],
      ['/api/auth/change-password','POST','{"currentPassword","newPassword"}','Change account password'],
    ],
    [2500,1000,3000,3500]
  ),
  H2('9.2 Core Test Management Endpoints'),
  makeTable(
    ['Endpoint','Method','Description'],
    [
      ['/api/test-suites','GET','List all test suites'],
      ['/api/test-suites','POST','Create a new test suite'],
      ['/api/test-suites/:id','GET / PATCH / DELETE','Get, update, or delete a test suite'],
      ['/api/test-cases','GET / POST','List all test cases or create new'],
      ['/api/test-cases/:id','GET / PATCH / DELETE','Manage individual test case'],
      ['/api/generate-tests','POST','Generate test cases from requirement using AI'],
      ['/api/generate-script','POST','Generate automation script for a test case'],
      ['/api/executions','GET / POST','List executions or trigger a new run'],
      ['/api/executions/:id','GET','Get execution details and status'],
      ['/api/executions/:id/results','GET','Get all test results for an execution'],
      ['/api/knowledge/upload','POST','Upload a document to the Knowledge Hub'],
      ['/api/knowledge/sources','GET','List all knowledge sources'],
      ['/api/governance/reviews/bulk','POST','Submit multiple review decisions'],
      ['/api/governance/audit/verify/:id','GET','Verify audit log entry signature'],
    ],
    [3500,1200,5300]
  ),
];

const glossary = [
  PAGEBREAK(),H1('10. Glossary'),
  makeTable(
    ['Term','Definition'],
    [
      ['AI Self-Healing','The automated process by which AITAS uses GPT-4o to detect broken test steps and repair them without human intervention.'],
      ['AQM','Application Quality Management — an external system for storing validated test evidence and compliance documentation.'],
      ['Autonomous Agent','A configured background worker in AITAS that runs test suites on a schedule continuously, 24 hours a day.'],
      ['CanonicalKnowledge','The structured data format AITAS uses to represent enterprise knowledge extracted from documents. Contains facts, processes, tables, fields, and test points.'],
      ['contentHash','A SHA-256 hash of a test case\'s title, steps, and preconditions, captured at review time. Any subsequent edit invalidates this hash and triggers re-review.'],
      ['E-Signature','An electronic signature in AITAS consisting of the reviewer typing their legal name. Required for all approvals in VALIDATED mode under 21 CFR Part 11.'],
      ['ExtractedUnit','The low-level data unit produced by a content extractor. Contains raw text, bullets, tables, and notes from a single slide, page, or section.'],
      ['GPT-4o','OpenAI\'s most capable multimodal model, used by AITAS for test generation, self-healing, and knowledge structuring.'],
      ['Human-in-the-Loop','A governance control pattern where AI-generated content cannot be acted upon until a human reviewer formally approves it.'],
      ['PBKDF2','Password-Based Key Derivation Function 2. The password hashing algorithm used by AITAS — 100,000 iterations with SHA-256 and a random salt.'],
      ['RAG','Retrieval-Augmented Generation. A technique that retrieves relevant knowledge context before asking the AI to generate content, grounding the output in real facts.'],
      ['RBAC','Role-Based Access Control. AITAS uses three built-in roles (Admin, Tester, Viewer) plus custom roles, with per-project membership.'],
      ['Selector','A CSS or XPath expression used to identify a UI element for automation. AITAS\'s self-healer automatically repairs broken selectors.'],
      ['TF-IDF','Term Frequency–Inverse Document Frequency. A text similarity algorithm used as a fallback for semantic search when embeddings are unavailable.'],
      ['21 CFR Part 11','US FDA regulation requiring electronic records and signatures to be trustworthy, reliable, and equivalent to paper records. AITAS is fully compliant.'],
      ['VALIDATED Mode','An AITAS operating mode where all AI-generated content must pass human review, e-signature, and SHA-256 audit logging before execution.'],
      ['Vector Index','AITAS\'s in-memory + disk-persisted index of knowledge embeddings, used for semantic similarity search during RAG retrieval.'],
    ],
    [2500,6500]
  ),
];

// ── BUILD & SAVE DOCUMENT ─────────────────────────────────────────────────────
const allChildren = [
  ...coverPage,
  ...docControl,
  ...toc,
  ...sec1,
  ...sec3,
  ...sec4,
  ...sec5,
  ...sec5b,
  ...sec6,
  ...sec7,
  ...sec8,
  ...sec9,
  ...glossary,
];

const doc = new Document({
  creator:'Baxter International — QA Engineering',
  title:'AITAS Technical Documentation v1.0',
  description:'Complete Architecture & Product Documentation for the AITAS Platform',
  numbering:{
    config:[{
      reference:'main-numbering',
      levels:[
        {level:0,format:'decimal',text:'%1.',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:360,hanging:360}}}},
        {level:1,format:'lowerLetter',text:'%2.',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:720,hanging:360}}}},
      ],
    }],
  },
  sections:[{
    properties:{
      page:{
        margin:{top:MARGIN.top,right:MARGIN.right,bottom:MARGIN.bottom,left:MARGIN.left},
        pageNumbers:{start:1,formatType:NumberFormat.DECIMAL},
      },
    },
    headers:{default:makeHeader('AITAS Technical Documentation v1.0')},
    footers:{default:makeFooter('1.0')},
    children:allChildren,
  }],
});

Packer.toBuffer(doc).then(buf=>{
  fs.writeFileSync('AITAS_Technical_Documentation.docx',buf);
  console.log('SUCCESS: AITAS_Technical_Documentation.docx generated!');
}).catch(err=>console.error('ERROR:',err));
