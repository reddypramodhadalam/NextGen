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

### Test Case Import/Export (Latest)
- Added JSON import functionality: POST /api/test-cases/import
- Added JSON export functionality: GET /api/test-cases/export  
- Repository page has Import/Export buttons with dialog UI
- Supports importing to specific test suites or unassigned

### Real Browser Test Execution
- Integrated Playwright for real browser automation
- Test executions require target URL where tests will run
- TestExecutor service interprets test steps and executes them in Chromium
- Captures screenshots, logs, and actual pass/fail results
- Real-time execution monitoring with 3-second auto-refresh

### API Endpoints
Key endpoints include:
- POST /api/generate-tests - AI test case generation from requirements
- POST /api/generate-script - AI script generation for Playwright/Cypress/Selenium/Puppeteer
- POST /api/executions - Start test execution with target URL
- GET /api/executions/:id/results - Get individual test results