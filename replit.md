# replit.md

## Overview

This is an AI-powered test management platform that enables users to generate, manage, and execute automated test cases. The application provides AI-assisted test case generation from natural language requirements, script generation for multiple testing frameworks (Playwright, Cypress, Selenium, Puppeteer), and comprehensive test execution tracking with reporting capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Build Tool**: Vite with HMR support

The frontend follows a page-based architecture with shared components. Pages include Dashboard, AI Test Generator, Test Repository, Script Generator, Executions, Reports, Agents, and Settings. Custom components extend shadcn/ui for domain-specific needs (StatusBadge, PriorityBadge, StatCard, CodeBlock, EmptyState).

### Backend Architecture
- **Framework**: Express.js 5 with TypeScript
- **HTTP Server**: Node.js HTTP server with potential WebSocket support
- **API Design**: RESTful JSON API with `/api` prefix
- **Validation**: Comprehensive Zod schema validation on all POST/PATCH routes
  - Insert schemas for creating resources
  - Partial schemas for updating resources
  - Custom schemas for AI generation endpoints with enum validation
- **AI Integration**: OpenAI SDK (GPT-4o) configured via Replit AI Integrations environment variables

The server uses a modular route registration pattern. Storage is abstracted through an `IStorage` interface supporting in-memory or database implementations. All endpoints validate input with proper error messages.

### Data Storage
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between frontend and backend)
- **Migrations**: Drizzle Kit with `db:push` command for schema synchronization

Core entities:
- Users (authentication)
- Test Suites (grouping test cases)
- Test Cases (with steps, priority, status, tags)
- Test Agents (execution environments)
- Test Executions (run tracking)
- Test Results (individual test outcomes)
- Generated Scripts (AI-generated automation code)
- Test Reports (execution summaries)
- Requirements (source for test generation)

### Build System
- **Client Build**: Vite outputs to `dist/public`
- **Server Build**: esbuild bundles server to `dist/index.cjs`
- **Production**: Single `npm start` command serves static files and API

## External Dependencies

### AI Services
- **OpenAI API**: Used for test case generation and script generation
  - Configured via `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` environment variables
  - Supports text completion and potentially image generation (gpt-image-1)

### Database
- **PostgreSQL**: Primary database accessed via `DATABASE_URL` environment variable
- **Session Storage**: connect-pg-simple for Express sessions (optional)

### Replit Integrations
Pre-built integration modules in `server/replit_integrations/`:
- **Audio**: Voice chat with speech-to-text/text-to-speech capabilities
- **Image**: Image generation using OpenAI
- **Chat**: Conversation persistence and streaming
- **Batch**: Rate-limited batch processing utilities

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `@tanstack/react-query`: Data fetching and caching
- `zod`: Schema validation
- `wouter`: Client-side routing
- `playwright`: Real browser automation for test execution
- Radix UI primitives: Accessible UI components
- `lucide-react`: Icon library

## Recent Changes

### Replit Authentication & Multi-Project Team Collaboration (Latest)
- Integrated Replit Auth supporting Google, GitHub, Apple, and email/password login
- Landing page for logged-out users with feature showcase at /
- Authenticated users see the dashboard with sidebar navigation
- User profile dropdown in sidebar with logout functionality
- Multi-project support with Projects and TeamMemberships schemas
- Super admin flag (isSuperAdmin) for master admin access across all projects
- Projects page at /projects with:
  - Create/delete projects
  - Add team members with role assignments
  - Owner badge and super admin badge indicators
- Team memberships with flexible per-project role assignments
- Auth routes: /api/login, /api/logout, /api/auth/user
- Project API endpoints: GET/POST /api/projects, DELETE /api/projects/:id
- Team membership API: POST /api/projects/:id/members
- Auth schema in shared/models/auth.ts with users and sessions tables

### Autonomous Agentic AI Testing
- Added autonomous agent mode for continuous background testing
- Agents can be configured with:
  - Target URL for testing
  - Test Suite to execute
  - Schedule interval (1, 5, 15, 30, 60 minutes)
  - Self-healing capability using GPT-4o
  - Max retries for self-healing attempts
- Start/Stop controls in agent cards for running autonomous agents
- Agents run in background and execute tests on schedule
- Self-healing uses AI to suggest alternative steps when tests fail
- API endpoints: POST /api/agents/:id/start, POST /api/agents/:id/stop, GET /api/agents/:id/status
- New schema fields: isAutonomous, targetUrl, suiteId, scheduleInterval, maxRetries, selfHealingEnabled

### Test Data Parameters & Selenium Support
- Added test data parameters feature for supplying execution-time values
- Users can add key-value pairs (username, password, etc.) when starting tests
- Test data supports types: text, password, email, url, number
- Placeholders like {{username}} in test steps are replaced with actual values
- Added Selenium WebDriver as third framework option (alongside Playwright/Puppeteer)
- All three frameworks support test data parameter substitution

### Multi-Framework Test Execution
- Added Puppeteer and Selenium as alternatives to Playwright for browser automation
- Users can select framework (Playwright, Puppeteer, or Selenium) when starting test execution
- Framework selection persisted in test executions and displayed in execution history
- All frameworks support: navigation, clicks, form input, screenshots, and result capture
- TestExecutor manages framework executors via interface-based design pattern

### Test Case Import/Export
- Added JSON import functionality: POST /api/test-cases/import
- Added JSON export functionality: GET /api/test-cases/export  
- Repository page has Import/Export buttons with dialog UI
- Supports importing to specific test suites or unassigned

### Real Browser Test Execution
- Integrated Playwright and Puppeteer for real browser automation
- Test executions require target URL where tests will run
- TestExecutor service interprets test steps and executes them in headless browser
- Captures screenshots, logs, and actual pass/fail results
- Real-time execution monitoring with 3-second auto-refresh

### Enterprise Features (Latest)

#### Multi-Environment Support
- Environments page at /environments with full CRUD operations
- Pre-seeded environments: development, staging (default), production
- Each environment has: name, displayName, baseUrl, variables, headers
- Single default environment enforced at storage level
- Environment variables can be configured per environment
- API: GET/POST /api/environments, GET/PATCH/DELETE /api/environments/:id

#### Platform Settings with Database Persistence
- Settings page at /settings with real-time persistence
- Settings organized by category: notifications, execution, reporting
- Category/key/value structure with optional JSON for complex values
- Settings applied to all test executions
- Unsaved changes indicator and save confirmation
- API: GET /api/settings, POST /api/settings/bulk

#### Report Export
- Export reports in HTML, JSON, or JUnit XML formats
- HTML reports have professional styling with pass rate visualization
- JSON exports include execution summaries and detailed data
- JUnit XML for CI/CD integration

#### Role-Based Access Control (RBAC)
- Pre-seeded roles: admin (full access), tester (view/create/execute), viewer (read-only)
- Roles have permissions array: view, create, edit, delete, execute, admin
- System roles marked as isSystem=true
- API: GET/POST /api/roles, GET/PATCH/DELETE /api/roles/:id

#### CI/CD Integration
- Webhook endpoints for triggering test runs
- Configuration generators for GitHub Actions, GitLab CI, Jenkins
- API: GET /api/cicd/config/:provider, POST /api/webhooks/trigger

#### Additional Enterprise Schemas
- Test Data Pools: Reusable data sets for parameterized testing
- Visual Baselines/Comparisons: Screenshot comparison for visual regression
- Performance Metrics: Load time, memory, network metrics tracking
- API Mocks: Service virtualization with request/response patterns
- Mobile Devices: Appium device configuration management

### API Endpoints
Key endpoints include:
- POST /api/generate-tests - AI test case generation from requirements
- POST /api/generate-script - AI script generation for Playwright/Cypress/Selenium/Puppeteer
- POST /api/executions - Start test execution with target URL
- GET /api/executions/:id/results - Get individual test results
- GET/POST /api/environments - Multi-environment management
- POST /api/settings/bulk - Bulk save platform settings
- GET/POST /api/roles - RBAC role management
- GET /api/cicd/config/:provider - CI/CD config generation