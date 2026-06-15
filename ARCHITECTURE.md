# AITAS — AI-Powered Test Automation System
## Architecture Design Document

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Backend Architecture](#4-backend-architecture)
5. [Data Layer Architecture](#5-data-layer-architecture)
6. [AI & Execution Engine](#6-ai--execution-engine)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Enterprise Integrations](#8-enterprise-integrations)
9. [CI/CD & DevOps Architecture](#9-cicd--devops-architecture)
10. [Deployment Architecture](#10-deployment-architecture)
11. [Data Flow Diagrams](#11-data-flow-diagrams)
12. [Component Dependency Map](#12-component-dependency-map)
13. [API Surface Summary](#13-api-surface-summary)
14. [Security Architecture](#14-security-architecture)
15. [Scalability & Extension Points](#15-scalability--extension-points)

---

## 1. System Overview

**AITAS** (AI-powered Test Automation System) is a full-stack enterprise test management platform that enables teams to:

- **Generate** test cases from natural language requirements using AI (GPT-4o)
- **Manage** test suites, cases, scripts, and environments in a central repository
- **Execute** tests across multiple frameworks (Playwright, Puppeteer, Selenium, Appium, API, SAP, Salesforce, JDE)
- **Heal** broken tests automatically using AI self-healing
- **Report** results with performance metrics, visual regression, network logs, and video
- **Integrate** with CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins, Azure DevOps)
- **Collaborate** across teams with multi-project RBAC and audit logging

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT BROWSER                                  │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │              React 18 SPA  (Vite + TypeScript)                   │  │
│   │                                                                  │  │
│   │  Pages: Dashboard │ Generator │ Repository │ Executions │        │  │
│   │         Reports   │ Agents    │ CI/CD      │ Settings   │        │  │
│   │         Admin     │ Projects  │ AI Healer  │ Performance│        │  │
│   │                                                                  │  │
│   │  State: TanStack React Query  │  Routing: Wouter                │  │
│   │  UI: shadcn/ui + Radix UI     │  Styling: Tailwind CSS          │  │
│   └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  HTTPS / REST JSON API
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        EXPRESS.JS SERVER  (Node.js)                      │
│                                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │  Auth Layer │  │  REST Routes │  │  Middleware  │  │  Static     │  │
│  │  (Sessions) │  │  /api/*      │  │  (Zod Valid) │  │  Serving    │  │
│  └─────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     SERVICE LAYER                                │   │
│  │                                                                  │   │
│  │  AI Test Executor  │  AI Test Healer  │  Test Scheduler          │   │
│  │  API Executor      │  Visual Regression│  Performance Benchmark  │   │
│  │  Autonomous Agent  │  Coverage Matrix  │  CI/CD Engine           │   │
│  │  Test Data Factory │  Audit Logger     │  Health Monitor         │   │
│  │  Notifications     │  Enterprise Auth  │  Report Analytics       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                   EXECUTOR ADAPTERS                              │   │
│  │                                                                  │   │
│  │  Playwright  │  Puppeteer  │  Selenium  │  Appium (iOS/Android)  │   │
│  │  SAP Fiori   │  SAP GUI    │  Salesforce│  JDE (Oracle)          │   │
│  │  .NET Desktop│  Java Desktop│  REST API │  GraphQL │  SOAP       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     DATA LAYER                                   │   │
│  │                                                                  │   │
│  │  Drizzle ORM  ──►  PostgreSQL (prod)  /  SQLite (dev/local)     │   │
│  │  IStorage Interface  (abstracted, swappable)                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
       ┌────────────┐   ┌─────────────┐   ┌────────────────┐
       │  OpenAI /  │   │  PostgreSQL │   │  CI/CD Systems │
       │  Azure LLM │   │  Database   │   │  GitHub/GitLab │
       │  (GPT-4o)  │   │             │   │  Jenkins/Azure │
       └────────────┘   └─────────────┘   └────────────────┘
```

---

## 3. Frontend Architecture

### 3.1 Technology Stack

| Layer            | Technology                          |
|------------------|-------------------------------------|
| Framework        | React 18 + TypeScript               |
| Build Tool       | Vite 5 with HMR                     |
| Routing          | Wouter (lightweight, ~2KB)          |
| Server State     | TanStack React Query v5             |
| UI Components    | shadcn/ui + Radix UI primitives     |
| Styling          | Tailwind CSS v3 + CSS variables     |
| Forms            | React Hook Form + Zod resolvers     |
| Charts           | Recharts + Chart.js                 |
| Icons            | Lucide React + React Icons          |
| Animations       | Framer Motion                       |
| Theme            | next-themes (light/dark mode)       |

### 3.2 Page Structure

```
client/src/
├── main.tsx                    # App entry point
├── App.tsx                     # Router + auth guard
├── index.css                   # Global styles + CSS variables
│
├── pages/
│   ├── landing.tsx             # Public landing page (/)
│   ├── login.tsx               # Authentication (/login)
│   ├── change-password.tsx     # First-login password change
│   ├── dashboard.tsx           # Main dashboard with stats
│   ├── generator.tsx           # AI test case generator
│   ├── repository.tsx          # Test suite & case management
│   ├── scripts.tsx             # Script generator (multi-framework)
│   ├── executions.tsx          # Test execution management
│   ├── enterprise-executions.tsx # Advanced execution (SAP/SF/JDE)
│   ├── reports.tsx             # Reports & analytics
│   ├── agents.tsx              # Autonomous agent management
│   ├── ai-healer.tsx           # AI self-healing dashboard
│   ├── environments.tsx        # Multi-environment config
│   ├── cicd.tsx                # CI/CD pipeline integration
│   ├── coverage.tsx            # Test coverage matrix
│   ├── performance.tsx         # Performance benchmarking
│   ├── test-data-factory.tsx   # Test data generation
│   ├── settings.tsx            # Platform settings
│   ├── admin.tsx               # Admin panel (RBAC, users)
│   ├── projects.tsx            # Multi-project management
│   ├── app-profiles.tsx        # Application type profiles
│   ├── documentation.tsx       # In-app documentation
│   └── not-found.tsx           # 404 page
│
├── components/
│   ├── app-sidebar.tsx         # Navigation sidebar
│   ├── code-block.tsx          # Syntax-highlighted code display
│   ├── empty-state.tsx         # Empty state placeholder
│   ├── priority-badge.tsx      # Priority indicator badge
│   ├── stat-card.tsx           # Dashboard metric card
│   ├── status-badge.tsx        # Status indicator badge
│   ├── theme-toggle.tsx        # Light/dark mode toggle
│   └── ui/                     # shadcn/ui component library
│       ├── button, card, dialog, form, input, select ...
│       ├── table, tabs, badge, alert, toast ...
│       └── chart, calendar, carousel, progress ...
│
├── hooks/
│   ├── use-auth.ts             # Authentication state hook
│   ├── use-mobile.tsx          # Responsive breakpoint hook
│   └── use-toast.ts            # Toast notification hook
│
└── lib/
    ├── auth-utils.ts           # Auth helper functions
    ├── cardColor.ts            # Dynamic card color utilities
    ├── queryClient.ts          # React Query client config
    └── utils.ts                # General utility functions
```

### 3.3 Authentication Flow (Frontend)

```
User visits app
      │
      ▼
  App.tsx checks useAuth()
      │
  ┌───┴────────────────────┐
  │ Not authenticated?      │ Yes ──► Redirect to /login
  └────────────────────────┘
      │ Authenticated
      ▼
  mustChangePassword?
      │ Yes ──► Redirect to /change-password
      │
      ▼
  Render sidebar + page content
```

### 3.4 State Management Pattern

```
Component
    │
    ├── useQuery(key, fetchFn)     ──► GET /api/...  (cached, auto-refetch)
    ├── useMutation(mutateFn)      ──► POST/PATCH/DELETE /api/...
    └── queryClient.invalidate()   ──► Refresh related queries on mutation
```

---

## 4. Backend Architecture

### 4.1 Technology Stack

| Layer            | Technology                          |
|------------------|-------------------------------------|
| Runtime          | Node.js (ESM modules)               |
| Framework        | Express.js v5                       |
| Language         | TypeScript (tsx for dev, esbuild for prod) |
| Validation       | Zod schemas on all endpoints        |
| Sessions         | express-session + memorystore/pg    |
| Auth             | Passport.js (local strategy)        |
| ORM              | Drizzle ORM                         |
| AI Client        | OpenAI SDK (GPT-4o)                 |
| Browser Automation | Playwright, Puppeteer, Selenium   |

### 4.2 Server Module Map

```
server/
├── index.ts                    # HTTP server bootstrap, port binding
├── vite.ts                     # Vite dev middleware integration
├── static.ts                   # Static file serving (prod)
├── routes.ts                   # All REST API route registrations (~1500 lines)
├── storage.ts                  # IStorage interface + active implementation
│
├── auth/
│   ├── index.ts                # Auth setup, session config, Passport init
│   └── password.ts             # PBKDF2 hashing (100k iterations)
│
├── db.ts                       # PostgreSQL Drizzle connection
├── db-sqlite.ts                # SQLite Drizzle connection (dev/local)
├── database-storage.ts         # PostgreSQL IStorage implementation
├── sqlite-storage.ts           # SQLite IStorage implementation
├── sqlite-storage-new.ts       # Enhanced SQLite storage
│
├── ai-client.ts                # OpenAI / Azure LLM client factory
├── ai-test-executor.ts         # AI-powered test execution orchestrator
├── ai-test-healer.ts           # AI self-healing engine
├── test-executor.ts            # Base test executor interface
│
├── api-test-executor.ts        # REST API test executor
├── deep-api-executor.ts        # GraphQL + SOAP executor
├── salesforce-executor.ts      # Salesforce platform executor
├── jde-executor.ts             # Oracle JDE executor + AIS client
├── sap-fiori-executor.ts       # SAP Fiori (web) executor
├── sap-gui-executor.ts         # SAP GUI (desktop) executor
├── dotnet-desktop-executor.ts  # .NET WinAppDriver executor
├── mobile-executor.ts          # Appium iOS/Android executor
├── java-desktop-executor.ts    # Java desktop (JAB/Sikuli) executor
│
├── autonomous-agent.ts         # Background autonomous test runner
├── test-scheduler.ts           # Cron-based test scheduling
├── visual-regression-engine.ts # Screenshot comparison engine
├── performance-benchmark.ts    # Load & performance testing
├── coverage-matrix.ts          # Requirement-to-test coverage
├── test-data-factory.ts        # Synthetic test data generation
├── cicd-engine.ts              # CI/CD pipeline integration
│
├── enterprise-auth.ts          # SAML/OAuth/TOTP auth configs
├── notifications.ts            # Slack/Teams/Email notifications
├── audit-log.ts                # Security audit trail
├── health-monitor.ts           # System health monitoring
├── reportAnalytics.ts          # Predictive analytics & insights
├── app-profiles.ts             # Application type intelligence
│
└── replit_integrations/
    ├── audio/                  # Voice/speech integration
    ├── image/                  # Image generation
    ├── chat/                   # Conversation persistence
    └── batch/                  # Rate-limited batch processing
```

### 4.3 Request Lifecycle

```
HTTP Request
     │
     ▼
Express Middleware Stack
     │
     ├── express.json()          # Body parsing
     ├── express-session()       # Session management
     ├── passport.initialize()   # Auth initialization
     ├── passport.session()      # Session deserialization
     │
     ▼
Route Handler (routes.ts)
     │
     ├── isAuthenticated()       # Auth guard (where required)
     ├── validateBody(schema)    # Zod schema validation
     │
     ▼
Service Layer
     │
     ├── storage.*()             # Database operations via IStorage
     ├── aiTestExecutor.*()      # AI execution services
     ├── [executor].*()          # Platform-specific executors
     │
     ▼
HTTP Response (JSON)
```

---

## 5. Data Layer Architecture

### 5.1 Storage Abstraction

```
IStorage Interface
       │
       ├── DatabaseStorage      ──► PostgreSQL (Drizzle ORM + Neon serverless)
       └── SQLiteStorage        ──► SQLite (better-sqlite3, local/dev)
```

The `storage.ts` module exports a single `storage` instance. Switching between PostgreSQL and SQLite requires only changing the implementation assigned to `storage`.

### 5.2 Database Schema (Entity Relationship)

```
users ──────────────────────────────────────────────────────────────────┐
  │ id, email, passwordHash, firstName, lastName,                       │
  │ mustChangePassword, isActive, isSuperAdmin                          │
  │                                                                     │
  ├──< sessions (express-session persistence)                           │
  ├──< userRoles >── roles                                              │
  └──< teamMemberships >── projects                                     │
                                                                        │
projects                                                                │
  │ id, name, slug, description, ownerId ──────────────────────────────┘
  └──< teamMemberships (userId, projectId, roleId, isOwner)

roles
  │ id, name, displayName, permissions[], isSystem
  └──< userRoles, teamMemberships

testSuites
  │ id, name, description, tags[]
  ├──< testCases
  │      │ id, suiteId, title, description, preconditions,
  │      │ targetUrl, steps[{step, expected}], priority,
  │      │ status, tags[], generatedByAI
  │      ├──< generatedScripts (framework, language, code)
  │      ├──< visualBaselines (baselineImage, threshold, viewport)
  │      └──< performanceMetrics (LCP, FID, CLS, FCP, TTFB...)
  │
  ├──< testExecutions
  │      │ id, suiteId, agentId, targetUrl, framework,
  │      │ testData[], status, environment, totalTests,
  │      │ passedTests, failedTests, duration
  │      ├──< testResults
  │      │      │ id, executionId, testCaseId, status, duration,
  │      │      │ errorMessage, screenshot, stepScreenshots[],
  │      │      │ video, networkLogs[], performanceMetrics{}
  │      │      └── logs[]
  │      ├──< testReports (name, summary, passRate, insights[])
  │      └──< visualComparisons (actualImage, diffImage, diffPercentage)
  │
  └──< testAgents
         │ id, name, type, status, capabilities[],
         │ isAutonomous, targetUrl, suiteId,
         │ scheduleInterval, maxRetries, selfHealingEnabled

environments
  │ id, name, displayName, baseUrl, variables{}, headers{}, isDefault

platformSettings
  │ id, category, key, value, valueJson

testDataPools
  │ id, name, dataType, data[], isShared, autoCleanup

apiMocks
  │ id, name, method, urlPattern, responseStatus, responseBody, delay

cicdWebhooks
  │ id, name, provider, webhookUrl, secretToken, suiteId, triggerOn[]

requirements
  │ id, title, description, acceptanceCriteria[], status

mobileDevices
  │ id, name, platform, deviceName, udid, appPath, capabilities{}
```

### 5.3 Dual Database Support

| Feature              | PostgreSQL                    | SQLite                        |
|----------------------|-------------------------------|-------------------------------|
| Environment          | Production / Cloud            | Development / Self-hosted     |
| Connection           | `DATABASE_URL` env var        | `aitas.db` file               |
| ORM Dialect          | `drizzle-orm/pg-core`         | `drizzle-orm/sqlite-core`     |
| UUID Generation      | `gen_random_uuid()`           | `nanoid()` / manual           |
| Session Storage      | `connect-pg-simple`           | `memorystore`                 |
| Schema File          | `shared/schema.ts`            | `shared/schema-sqlite.ts`     |

---

## 6. AI & Execution Engine

### 6.1 AI Client Architecture

```
getAiClient()
     │
     ├── OPENAI_API_KEY set?          ──► OpenAI SDK (GPT-4o)
     ├── LLM_API_URL + LLM_BEARER_TOKEN ──► Azure OpenAI / Custom LLM
     └── Neither set?                 ──► Rule-based fallback generator
```

### 6.2 Test Execution Pipeline

```
POST /api/executions
     │
     ▼
createExecution() ──► DB: status = "pending"
     │
     ▼ (async, non-blocking)
aiTestExecutor.runExecution(executionId, testCases, targetUrl, framework)
     │
     ├── Update status = "running"
     │
     ├── For each testCase:
     │    │
     │    ├── [Playwright]  playwrightExecutor.run(testCase, url)
     │    ├── [Puppeteer]   puppeteerExecutor.run(testCase, url)
     │    ├── [Selenium]    seleniumExecutor.run(testCase, url)
     │    │
     │    ├── Capture: screenshot, stepScreenshots[], video
     │    ├── Capture: networkLogs[], performanceMetrics{}
     │    │
     │    ├── selfHealing ON + test failed?
     │    │    └── aiTestHealer.suggest(failedStep, error)
     │    │         └── Retry with healed steps (up to maxRetries)
     │    │
     │    └── storage.createTestResult(result)
     │
     ├── Update execution: passedTests, failedTests, duration
     └── Update status = "passed" | "failed"
```

### 6.3 Executor Adapter Pattern

```typescript
interface TestExecutorAdapter {
  run(testCase: TestCase, config: ExecutorConfig): Promise<TestResult>
  generateScript?(testCase: TestCase, config: any): Promise<string>
}

// Implementations:
// PlaywrightExecutor, PuppeteerExecutor, SeleniumExecutor
// APITestExecutor, GraphQLExecutor, SOAPExecutor
// SalesforceExecutor, JDEExecutor
// SAPFioriExecutor, SAPGUIExecutor
// DotNetDesktopExecutor, MobileExecutor, JavaDesktopExecutor
```

### 6.4 AI Self-Healing Flow

```
Test Step Fails
     │
     ▼
aiTestHealer.analyseTestCase(testCaseId)
     │
     ├── Fetch recent execution failures
     ├── Build AI prompt with: step, error, DOM context
     │
     ▼
GPT-4o Analysis
     │
     ├── Identify: selector change, timing issue, flow change
     ├── Suggest: new selector, wait strategy, step reorder
     │
     ▼
HealSuggestion { stepIndex, oldStep, newStep, confidence, reason }
     │
     ├── autoHeal=true?  ──► aiTestHealer.applyHeal(testCaseId, suggestion)
     └── autoHeal=false? ──► Return suggestion to UI for manual review
```

### 6.5 Autonomous Agent Loop

```
Agent.isAutonomous = true + Agent.start()
     │
     ▼
autonomousRunner.startAgent(agentId)
     │
     ├── Load agent config (targetUrl, suiteId, scheduleInterval)
     │
     └── setInterval(scheduleInterval minutes):
          │
          ├── Fetch test cases for suiteId
          ├── Create execution
          ├── Run aiTestExecutor (with selfHealing)
          ├── Update agent.lastRunAt, agent.nextRunAt
          └── Send notification on failure (if notifyOnFailure)
```

---

## 7. Authentication & Authorization

### 7.1 Authentication Architecture

```
POST /api/auth/login
     │
     ├── Passport LocalStrategy
     ├── getUserByEmail(email)
     ├── verifyPassword(password, passwordHash)  ──► PBKDF2 (100k iterations)
     │
     ├── Success: req.session.userId = user.id
     └── Response: { user, mustChangePassword }

Session Storage:
  Development  ──► memorystore (in-memory)
  Production   ──► connect-pg-simple (PostgreSQL sessions table)
```

### 7.2 RBAC Model

```
User
 └──< UserRoles >── Role
                     │ permissions: ["view","create","edit","delete","execute","admin"]
                     │
                     ├── admin   : all permissions
                     ├── tester  : view, create, execute
                     └── viewer  : view only

TeamMembership (per-project roles)
 │ userId + projectId + roleId + isOwner
 └── Overrides global role within project scope

isSuperAdmin flag ──► Bypasses all permission checks
```

### 7.3 First-Login Flow

```
Admin creates user via POST /api/projects/:id/members
     │ { email, firstName, lastName, temporaryPassword, role }
     │
     ▼
User created with mustChangePassword = true
     │
     ▼
User logs in ──► mustChangePassword check ──► Redirect /change-password
     │
     ▼
POST /api/auth/change-password
     │ { currentPassword, newPassword }
     │
     ▼
mustChangePassword = false ──► Normal access granted
```

---

## 8. Enterprise Integrations

### 8.1 Supported Platforms

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXECUTOR ADAPTERS                            │
├──────────────────┬──────────────────┬───────────────────────────┤
│  WEB BROWSERS    │  ENTERPRISE ERP  │  MOBILE                   │
│                  │                  │                           │
│  • Playwright    │  • SAP Fiori     │  • Appium (iOS)           │
│  • Puppeteer     │  • SAP GUI       │  • Appium (Android)       │
│  • Selenium      │  • Salesforce    │                           │
│                  │  • Oracle JDE    │  DESKTOP                  │
│  API TESTING     │                  │                           │
│                  │  AUTHENTICATION  │  • WinAppDriver (.NET)    │
│  • REST API      │                  │  • Java Desktop (JAB)     │
│  • GraphQL       │  • SAML 2.0      │  • Sikuli (image-based)   │
│  • SOAP/WSDL     │  • OAuth 2.0     │                           │
│                  │  • TOTP/MFA      │                           │
└──────────────────┴──────────────────┴───────────────────────────┘
```

### 8.2 Notification Channels

```
sendTestNotification(channel, config)
     │
     ├── "slack"   ──► Slack Incoming Webhook (POST JSON)
     ├── "teams"   ──► Microsoft Teams Webhook (Adaptive Card)
     └── "email"   ──► SMTP / SendGrid (HTML email)
```

### 8.3 Enterprise Auth Config

```
POST /api/auth/enterprise/save
     │ { name, type: "saml"|"oauth"|"ldap"|"totp", config, environmentId }
     │
     └── Stored as encrypted config per environment

POST /api/auth/enterprise/test
     └── Validates connectivity before saving

POST /api/auth/enterprise/totp
     └── Generates live TOTP code from secret (for MFA automation)
```

---

## 9. CI/CD & DevOps Architecture

### 9.1 Inbound Webhook Flow

```
External CI/CD System
     │
     ├── POST /api/cicd/webhook/github   (X-Hub-Signature-256 verified)
     ├── POST /api/cicd/webhook/gitlab   (X-GitLab-Token verified)
     ├── POST /api/cicd/webhook/jenkins
     ├── POST /api/cicd/webhook/azure
     └── POST /api/cicd/webhook/generic
          │
          ▼
     cicdEngine.processInboundEvent(provider, event, body, signature)
          │
          ├── Parse event (push, PR, build complete, etc.)
          ├── Find matching webhook config
          ├── Create test execution
          └── Return { executionId, status }
```

### 9.2 Outbound CI/CD Trigger

```
POST /api/cicd/trigger
     │ { provider, name, apiUrl, token, pipelineId, ... }
     │
     └── cicdEngine.triggerConfig(config)
          │
          ├── "github_actions"  ──► POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches
          ├── "gitlab_ci"       ──► POST /projects/{id}/pipeline
          ├── "jenkins"         ──► POST /job/{name}/build
          └── "azure_devops"    ──► POST /{org}/{project}/_apis/pipelines/{id}/runs
```

### 9.3 Test Scheduler

```
testScheduler.addSchedule({ name, suiteId, frequency, cronExpression })
     │
     └── Frequencies: every_5min, every_15min, hourly, daily, weekly, custom
          │
          └── setInterval / cron-based timer
               │
               └── testScheduler.runNow(scheduleId)
                    │
                    └── Creates execution ──► aiTestExecutor.runExecution()
```

---

## 10. Deployment Architecture

### 10.1 Docker Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    docker-compose.yml                        │
│                                                             │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │   aitas-app      │    │   postgres        │              │
│  │                  │    │                  │              │
│  │  Node.js 20      │───►│  PostgreSQL 15   │              │
│  │  Port: 5000      │    │  Port: 5432      │              │
│  │  Playwright      │    │  Volume: pgdata  │              │
│  │  browsers        │    └──────────────────┘              │
│  └──────────────────┘                                       │
│                                                             │
│  Optional: Selenium Grid Profile                            │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │  selenium-hub    │    │  chrome-node     │              │
│  │  Port: 4444      │    │  firefox-node    │              │
│  └──────────────────┘    └──────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Build Pipeline

```
npm run build
     │
     ├── Vite build ──► dist/public/  (React SPA, static assets)
     └── esbuild    ──► dist/index.cjs (Express server bundle)

npm start
     └── NODE_ENV=production node dist/index.cjs
          │
          ├── Serves dist/public/ as static files
          └── Handles /api/* routes
```

### 10.3 Environment Configuration

```
.env
├── DATABASE_URL              # PostgreSQL connection string
├── SESSION_SECRET            # Express session secret
│
├── OPENAI_API_KEY            # OpenAI API key (optional)
├── LLM_API_URL               # Azure/Custom LLM base URL (optional)
├── LLM_BEARER_TOKEN          # Bearer token for custom LLM (optional)
│
├── PORT                      # Server port (default: 5000)
└── NODE_ENV                  # development | production
```

### 10.4 Health Endpoints

| Endpoint       | Purpose                              | Auth Required |
|----------------|--------------------------------------|---------------|
| `GET /api/health` | Liveness probe (app running)      | No            |
| `GET /api/ready`  | Readiness probe (DB connected)    | No            |

---

## 11. Data Flow Diagrams

### 11.1 AI Test Generation Flow

```
User Input (requirement text)
     │
     ▼
POST /api/generate-tests
     │ { title, description, appType, appHints }
     │
     ▼
AI Client (GPT-4o)
     │ System: "Generate test cases in JSON format..."
     │ User:   requirement description
     │
     ▼
Parse JSON response
     │ { testCases: [{ title, steps[], priority }] }
     │
     ▼
Return to UI ──► User reviews & saves to repository
     │
     ▼
POST /api/test-cases (for each case)
     └── Stored in DB with generatedByAI = true
```

### 11.2 Script Generation Flow

```
User selects: testCase + framework + language
     │
     ▼
POST /api/generate-script
     │ { testCaseId, framework, language }
     │
     ▼
Fetch testCase from DB
     │
     ▼
AI Client (GPT-4o)
     │ System: framework + language specific instructions
     │ User:   test case title, description, steps
     │
     ▼
Generated code string
     │
     ├── storage.createScript({ testCaseId, framework, language, code })
     └── Return { code, script, generatedBy: "ai" | "rule-based" }
```

### 11.3 Visual Regression Flow

```
Test Execution (Playwright)
     │
     ├── Capture screenshot at each step
     │
     ▼
POST /api/visual/compare
     │ { testCaseId, name, imageBase64 }
     │
     ▼
visualRegressionEngine.compare()
     │
     ├── Load baseline image from DB
     ├── Pixel-diff comparison
     ├── Calculate diffPercentage
     │
     ├── diffPercentage > threshold?
     │    └── FAIL: store diff image, mark comparison failed
     └── diffPercentage <= threshold?
          └── PASS: comparison passed
```

### 11.4 Coverage Matrix Flow

```
GET /api/coverage/matrix?suiteId=...
     │
     ▼
coverageMatrix.buildMatrix(suiteId)
     │
     ├── Fetch all requirements
     ├── Fetch all test cases (filtered by suite)
     ├── Match test cases to requirements (by tags, title keywords)
     │
     ▼
CoverageMatrix {
  requirements: [...],
  testCases: [...],
  coverage: { requirementId: testCaseId[] },
  uncoveredRequirements: [...],
  coveragePercentage: number
}
```

---

## 12. Component Dependency Map

```
routes.ts
  ├── storage (IStorage)
  │    ├── database-storage.ts  ──► db.ts (PostgreSQL)
  │    └── sqlite-storage.ts    ──► db-sqlite.ts (SQLite)
  │
  ├── ai-client.ts              ──► OpenAI SDK
  ├── ai-test-executor.ts       ──► ai-client, storage, test-executor
  ├── ai-test-healer.ts         ──► ai-client, storage
  ├── api-test-executor.ts      ──► storage
  ├── deep-api-executor.ts      ──► storage
  ├── salesforce-executor.ts    ──► storage, playwright
  ├── jde-executor.ts           ──► storage, selenium
  ├── sap-fiori-executor.ts     ──► storage, playwright
  ├── sap-gui-executor.ts       ──► storage (VBScript generation)
  ├── dotnet-desktop-executor.ts──► storage, winappdriver
  ├── mobile-executor.ts        ──► storage, appium
  ├── java-desktop-executor.ts  ──► storage, appium/jab
  ├── autonomous-agent.ts       ──► storage, ai-test-executor
  ├── test-scheduler.ts         ──► storage, ai-test-executor
  ├── visual-regression-engine.ts──► storage
  ├── performance-benchmark.ts  ──► (standalone HTTP client)
  ├── coverage-matrix.ts        ──► storage
  ├── test-data-factory.ts      ──► (standalone, faker-like)
  ├── cicd-engine.ts            ──► storage, HTTP clients
  ├── enterprise-auth.ts        ──► storage, SAML/OAuth libs
  ├── notifications.ts          ──► HTTP (Slack/Teams/SMTP)
  ├── audit-log.ts              ──► storage
  ├── health-monitor.ts         ──► storage, system metrics
  ├── reportAnalytics.ts        ──► storage
  └── app-profiles.ts           ──► (static config)
```

---

## 13. API Surface Summary

### Core Resources

| Resource          | Endpoints                                      |
|-------------------|------------------------------------------------|
| Test Suites       | `GET/POST /api/test-suites`, `GET/PATCH/DELETE /api/test-suites/:id` |
| Test Cases        | `GET/POST /api/test-cases`, `GET/PATCH/DELETE /api/test-cases/:id` |
| Test Agents       | `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/:id` |
| Executions        | `GET/POST /api/executions`, `GET /api/executions/:id`, `POST /api/executions/:id/cancel` |
| Test Results      | `GET /api/executions/:id/results` |
| Reports           | `GET/POST /api/reports`, `GET /api/reports/:id` |
| Scripts           | `GET /api/scripts`, `POST /api/scripts/generate` |
| Requirements      | `GET/POST /api/requirements`, `GET/PATCH/DELETE /api/requirements/:id` |

### Enterprise Resources

| Resource          | Endpoints                                      |
|-------------------|------------------------------------------------|
| Environments      | `GET/POST /api/environments`, `GET/PATCH/DELETE /api/environments/:id` |
| Settings          | `GET /api/settings`, `POST /api/settings/bulk` |
| Roles             | `GET/POST /api/roles`, `PATCH/DELETE /api/roles/:id` |
| Projects          | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` |
| Team Members      | `GET/POST /api/projects/:id/members` |
| Mobile Devices    | `GET/POST /api/mobile-devices`, `GET/PATCH/DELETE /api/mobile-devices/:id` |
| API Mocks         | `GET/POST /api/mocks`, `GET/PATCH/DELETE /api/mocks/:id` |
| CI/CD Webhooks    | `GET/POST /api/webhooks`, `GET/PATCH/DELETE /api/webhooks/:id` |
| Schedules         | `GET/POST /api/schedules`, `PATCH/DELETE /api/schedules/:id`, `POST /api/schedules/:id/run-now` |

### AI & Execution

| Feature           | Endpoints                                      |
|-------------------|------------------------------------------------|
| AI Generation     | `POST /api/generate-tests`, `POST /api/generate-script` |
| Autonomous Agents | `POST /api/agents/:id/start`, `POST /api/agents/:id/stop`, `GET /api/agents/:id/status` |
| AI Healer         | `POST /api/healer/analyse`, `POST /api/healer/apply`, `GET /api/healer/history/:id` |
| Visual Regression | `POST /api/visual/baseline`, `POST /api/visual/compare`, `GET /api/visual/baselines/:id` |
| Performance       | `POST /api/performance/benchmark`, `POST /api/performance/quick-check` |
| Coverage Matrix   | `GET /api/coverage/matrix`, `GET /api/coverage/requirement/:id` |
| Test Data Factory | `GET /api/data-factory/types`, `POST /api/data-factory/generate` |

### Specialized Executors

| Executor          | Endpoint                                       |
|-------------------|------------------------------------------------|
| API (REST)        | `POST /api/executions/api`                     |
| GraphQL           | `POST /api/executions/graphql`                 |
| SOAP              | `POST /api/executions/soap`                    |
| Salesforce        | `POST /api/executions/salesforce`              |
| Oracle JDE        | `POST /api/executions/jde`                     |
| SAP Fiori         | `POST /api/executions/sap-fiori`               |
| SAP GUI           | `POST /api/executions/sap-gui`                 |
| .NET Desktop      | `POST /api/executions/dotnet`                  |
| Mobile (iOS/Android) | `POST /api/executions/mobile`              |
| Java Desktop      | `POST /api/executions/java`                    |

### Auth & Admin

| Feature           | Endpoints                                      |
|-------------------|------------------------------------------------|
| Auth              | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/user`, `POST /api/auth/change-password` |
| Enterprise Auth   | `POST /api/auth/enterprise/test`, `POST /api/auth/enterprise/save`, `GET /api/auth/enterprise/configs` |
| Admin Users       | `GET /api/admin/users`, `PATCH /api/admin/users/:id` |
| Audit Log         | `GET /api/admin/audit-log`                     |
| Health            | `GET /api/health`, `GET /api/ready`            |

---

## 14. Security Architecture

### 14.1 Password Security

```
Password Hashing: PBKDF2
  ├── Algorithm: SHA-256
  ├── Iterations: 100,000
  ├── Salt: 32 bytes (crypto.randomBytes)
  └── Output: hex-encoded hash stored in DB
```

### 14.2 Session Security

```
express-session configuration:
  ├── secret: SESSION_SECRET env var
  ├── resave: false
  ├── saveUninitialized: false
  ├── cookie.httpOnly: true
  ├── cookie.secure: true (production)
  └── cookie.sameSite: "lax"
```

### 14.3 Webhook Signature Verification

```
GitHub:  HMAC-SHA256 of body with secret ──► X-Hub-Signature-256
GitLab:  Token comparison ──► X-GitLab-Token
Jenkins: No signature (IP allowlist recommended)
Azure:   Basic auth or token
```

### 14.4 Audit Trail

```
logAudit({ action, severity, resourceType, resourceId, userId, success })
     │
     └── Stored in audit_log table
          │
          └── GET /api/admin/audit-log  (admin only)
```

---

## 15. Scalability & Extension Points

### 15.1 Adding a New Executor

1. Create `server/my-executor.ts` implementing the executor interface
2. Add execution schema in `routes.ts`
3. Register `POST /api/executions/my-platform` route
4. Add UI form in `client/src/pages/enterprise-executions.tsx`

### 15.2 Adding a New AI Provider

1. Update `server/ai-client.ts` to detect new env vars
2. Implement the `AiClient` interface methods (`chat`, `complete`)
3. No other changes needed — all services use `getAiClient()`

### 15.3 Adding a New CI/CD Provider

1. Add provider config to `server/cicd-engine.ts`
2. Register inbound webhook: `POST /api/cicd/webhook/my-provider`
3. Add outbound trigger logic in `cicdEngine.triggerConfig()`

### 15.4 Horizontal Scaling Considerations

| Concern              | Current State              | Scale-Out Approach                    |
|----------------------|----------------------------|---------------------------------------|
| Session Storage      | memorystore / pg-session   | Redis session store                   |
| Test Execution       | In-process async           | Worker queue (Bull/BullMQ + Redis)    |
| Autonomous Agents    | In-process setInterval     | Distributed scheduler (Agenda/Cron)   |
| File Storage         | Base64 in DB               | S3/GCS for screenshots & videos       |
| Database             | Single PostgreSQL           | Read replicas + connection pooling    |
| WebSocket            | ws (single node)            | Socket.io with Redis adapter          |

### 15.5 Key Design Patterns Used

| Pattern              | Where Used                                      |
|----------------------|-------------------------------------------------|
| Repository Pattern   | `IStorage` interface + multiple implementations |
| Adapter Pattern      | All executor adapters (Playwright, Selenium...) |
| Strategy Pattern     | AI client selection (OpenAI vs Azure vs fallback) |
| Factory Pattern      | `getAiClient()`, `testDataFactory`              |
| Observer Pattern     | Autonomous agent event loop                     |
| Facade Pattern       | `routes.ts` as unified API surface              |
| Singleton Pattern    | `storage`, `aiTestExecutor`, `testScheduler`    |

---

*Document generated from AITAS codebase analysis — Version 1.0*
