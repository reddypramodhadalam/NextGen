import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BaxterLogo } from "@/components/brand/baxter-logo";
import {
  BookOpen,
  Rocket,
  Layers,
  Code2,
  TestTube2,
  Bot,
  GitBranch,
  HelpCircle,
  Settings,
  Shield,
  Zap,
  ArrowLeft,
  ChevronRight,
  Terminal,
  Database,
  Users,
  FileText,
  Play,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";

type Section = {
  id: string;
  title: string;
  icon: React.ReactNode;
  subsections?: { id: string; title: string }[];
};

const sections: Section[] = [
  {
    id: "overview",
    title: "Overview",
    icon: <BookOpen className="h-4 w-4" />,
    subsections: [
      { id: "what-is-aitas", title: "What is AITAS?" },
      { id: "key-features", title: "Key Features" },
      { id: "architecture", title: "Architecture" },
    ],
  },
  {
    id: "getting-started",
    title: "Getting Started",
    icon: <Rocket className="h-4 w-4" />,
    subsections: [
      { id: "first-login", title: "First Login" },
      { id: "creating-project", title: "Creating a Project" },
      { id: "adding-team", title: "Adding Team Members" },
    ],
  },
  {
    id: "test-cases",
    title: "Test Cases",
    icon: <TestTube2 className="h-4 w-4" />,
    subsections: [
      { id: "ai-generation", title: "AI Test Generation" },
      { id: "manual-creation", title: "Manual Creation" },
      { id: "test-suites", title: "Test Suites" },
      { id: "import-export", title: "Import & Export" },
    ],
  },
  {
    id: "writing-steps",
    title: "Writing Test Steps",
    icon: <FileText className="h-4 w-4" />,
    subsections: [
      { id: "step-basics", title: "Step Basics" },
      { id: "navigation-actions", title: "Navigation" },
      { id: "click-actions", title: "Clicks & Interactions" },
      { id: "form-actions", title: "Form Inputs" },
      { id: "dropdown-actions", title: "Dropdowns & Selects" },
      { id: "checkbox-actions", title: "Checkboxes & Radio Buttons" },
      { id: "window-actions", title: "Windows & Popups" },
      { id: "iframe-actions", title: "Iframes" },
      { id: "verification-actions", title: "Verifications" },
      { id: "advanced-actions", title: "Advanced Actions" },
      { id: "test-data-params", title: "Using Test Data" },
    ],
  },
  {
    id: "script-generation",
    title: "Script Generation",
    icon: <Code2 className="h-4 w-4" />,
    subsections: [
      { id: "frameworks", title: "Supported Frameworks" },
      { id: "generating-scripts", title: "Generating Scripts" },
      { id: "customization", title: "Customization" },
    ],
  },
  {
    id: "test-execution",
    title: "Test Execution",
    icon: <Play className="h-4 w-4" />,
    subsections: [
      { id: "running-tests", title: "Running Tests" },
      { id: "test-data", title: "Test Data Parameters" },
      { id: "viewing-results", title: "Viewing Results" },
    ],
  },
  {
    id: "agents",
    title: "Autonomous Agents",
    icon: <Bot className="h-4 w-4" />,
    subsections: [
      { id: "agent-config", title: "Agent Configuration" },
      { id: "autonomous-mode", title: "Autonomous Mode" },
      { id: "self-healing", title: "Self-Healing Tests" },
    ],
  },
  {
    id: "environments",
    title: "Environments",
    icon: <Layers className="h-4 w-4" />,
    subsections: [
      { id: "env-setup", title: "Environment Setup" },
      { id: "variables", title: "Environment Variables" },
    ],
  },
  {
    id: "cicd",
    title: "CI/CD Integration",
    icon: <GitBranch className="h-4 w-4" />,
    subsections: [
      { id: "github-actions", title: "GitHub Actions" },
      { id: "gitlab-ci", title: "GitLab CI" },
      { id: "jenkins", title: "Jenkins" },
      { id: "webhooks", title: "Webhooks" },
    ],
  },
  {
    id: "reports",
    title: "Reports & Analytics",
    icon: <FileText className="h-4 w-4" />,
    subsections: [
      { id: "report-types", title: "Report Types" },
      { id: "exporting", title: "Exporting Reports" },
    ],
  },
  {
    id: "administration",
    title: "Administration",
    icon: <Settings className="h-4 w-4" />,
    subsections: [
      { id: "user-management", title: "User Management" },
      { id: "roles-permissions", title: "Roles & Permissions" },
      { id: "ai-settings", title: "AI Settings" },
    ],
  },
  {
    id: "api-reference",
    title: "API Reference",
    icon: <Terminal className="h-4 w-4" />,
    subsections: [
      { id: "authentication-api", title: "Authentication" },
      { id: "test-cases-api", title: "Test Cases API" },
      { id: "executions-api", title: "Executions API" },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    icon: <HelpCircle className="h-4 w-4" />,
    subsections: [
      { id: "common-issues", title: "Common Issues" },
      { id: "faq", title: "FAQ" },
    ],
  },
];

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg bg-zinc-950 dark:bg-zinc-900 border border-border overflow-hidden my-4">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 dark:bg-zinc-800 border-b border-border">
        <span className="text-xs text-muted-foreground font-mono">{language}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          data-testid="button-copy-code"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm">
        <code className="text-zinc-100 font-mono">{code}</code>
      </pre>
    </div>
  );
}

function SectionContent({ sectionId }: { sectionId: string }) {
  switch (sectionId) {
    case "overview":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="what-is-aitas">What is AITAS?</h1>
            <p className="text-muted-foreground leading-relaxed mb-4">
              AITAS (AI Test Automation System) is a production-ready, AI-driven test automation platform 
              designed for enterprise teams. It combines the power of artificial intelligence with 
              comprehensive test management capabilities to streamline your testing workflow.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Whether you're a small team or a large enterprise, AITAS provides the tools you need 
              to generate, manage, and execute automated tests with unprecedented efficiency.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="key-features">Key Features</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex gap-3 p-4 rounded-lg border bg-card">
                <Zap className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1">AI-Powered Test Generation</h3>
                  <p className="text-sm text-muted-foreground">Generate comprehensive test cases from natural language requirements using GPT-4o or custom LLMs.</p>
                </div>
              </div>
              <div className="flex gap-3 p-4 rounded-lg border bg-card">
                <Code2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1">Multi-Framework Support</h3>
                  <p className="text-sm text-muted-foreground">Generate scripts for Playwright, Cypress, Selenium, and Puppeteer from a single test case.</p>
                </div>
              </div>
              <div className="flex gap-3 p-4 rounded-lg border bg-card">
                <Bot className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1">Autonomous Agents</h3>
                  <p className="text-sm text-muted-foreground">Run tests continuously with self-healing capabilities powered by AI.</p>
                </div>
              </div>
              <div className="flex gap-3 p-4 rounded-lg border bg-card">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1">Enterprise Security</h3>
                  <p className="text-sm text-muted-foreground">Role-based access control, team management, and secure authentication.</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="architecture">Architecture</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              AITAS is built on a modern, scalable architecture:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span><strong>Frontend:</strong> React with TypeScript, TanStack Query, and Tailwind CSS</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span><strong>Backend:</strong> Express.js with comprehensive REST API</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span><strong>Database:</strong> PostgreSQL with Drizzle ORM</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span><strong>AI Integration:</strong> OpenAI GPT-4o or AWS Bedrock (custom LLM)</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span><strong>Test Execution:</strong> Playwright, Puppeteer, and Selenium WebDriver</span>
              </li>
            </ul>
          </div>
        </div>
      );

    case "getting-started":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="first-login">First Login</h1>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you receive your AITAS account, you'll be provided with a temporary password. 
              Follow these steps to get started:
            </p>
            <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
              <li>Navigate to the login page and enter your email and temporary password</li>
              <li>You'll be prompted to change your password on first login</li>
              <li>Create a strong password (minimum 8 characters)</li>
              <li>After changing your password, you'll be redirected to the dashboard</li>
            </ol>
            <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="font-medium text-amber-500">Important</p>
                  <p className="text-sm text-muted-foreground">For security, always change your temporary password immediately upon first login.</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="creating-project">Creating a Project</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Projects help organize your test cases and team members. To create a project:
            </p>
            <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
              <li>Navigate to the <strong>Projects</strong> page from the sidebar</li>
              <li>Click the <strong>Create Project</strong> button</li>
              <li>Enter a project name and optional description</li>
              <li>Click <strong>Create</strong> to save</li>
            </ol>
            <p className="text-muted-foreground mt-4">
              You'll automatically be added as the project owner with full administrative access.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="adding-team">Adding Team Members</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Add team members to collaborate on your projects:
            </p>
            <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
              <li>Open your project and click <strong>Add Member</strong></li>
              <li>Enter the member's email, first name, and last name</li>
              <li>Set a temporary password for them</li>
              <li>Select their role (Admin, Tester, or Viewer)</li>
              <li>The new member will receive their credentials and can log in</li>
            </ol>
          </div>
        </div>
      );

    case "test-cases":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="ai-generation">AI Test Generation</h1>
            <p className="text-muted-foreground leading-relaxed mb-4">
              AITAS can automatically generate comprehensive test cases from natural language requirements 
              using AI. This dramatically speeds up test creation and ensures thorough coverage.
            </p>
            <h3 className="text-lg font-medium mb-2">How to Generate Tests with AI:</h3>
            <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
              <li>Navigate to <strong>AI Test Generator</strong> from the sidebar</li>
              <li>Enter your requirements in natural language (e.g., "User should be able to log in with email and password")</li>
              <li>Optionally specify a target URL and test suite</li>
              <li>Click <strong>Generate Tests</strong></li>
              <li>Review the generated test cases and save them to your repository</li>
            </ol>
            <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="font-medium text-green-500">Pro Tip</p>
                  <p className="text-sm text-muted-foreground">Be specific in your requirements for better test coverage. Include edge cases and error scenarios.</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="manual-creation">Manual Creation</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You can also create test cases manually for complete control:
            </p>
            <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
              <li>Go to <strong>Test Repository</strong></li>
              <li>Click <strong>Create Test Case</strong></li>
              <li>Fill in the title, description, and preconditions</li>
              <li>Add test steps with expected results</li>
              <li>Set priority and tags for organization</li>
              <li>Save to your repository</li>
            </ol>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="test-suites">Test Suites</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Group related test cases into suites for better organization and batch execution.
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Create suites like "Smoke Tests", "Regression Tests", or "Authentication Tests"</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Assign test cases to suites during creation or editing</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Execute entire suites at once with a single click</span>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="import-export">Import & Export</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              AITAS supports importing and exporting test cases in JSON format for easy migration and backup.
            </p>
            <CodeBlock
              language="json"
              code={`{
  "testCases": [
    {
      "title": "User Login Test",
      "description": "Verify user can log in",
      "steps": [
        { "step": "Navigate to login", "expected": "Login form displayed" },
        { "step": "Enter credentials", "expected": "Fields accept input" },
        { "step": "Click submit", "expected": "User logged in" }
      ],
      "priority": "high",
      "tags": ["auth", "smoke"]
    }
  ]
}`}
            />
          </div>
        </div>
      );

    case "writing-steps":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="step-basics">Step Basics</h1>
            <p className="text-muted-foreground leading-relaxed mb-4">
              AITAS uses AI to interpret natural language test steps and convert them into browser automation commands.
              Each test step has two parts:
            </p>
            <ul className="space-y-2 text-muted-foreground mb-4">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span><strong>Action:</strong> What to do (e.g., "click Login button", "enter email in username field")</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span><strong>Expected Result:</strong> What should happen (e.g., "verify dashboard is displayed", "verify success message appears")</span>
              </li>
            </ul>
            <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="font-medium text-green-500">Best Practice</p>
                  <p className="text-sm text-muted-foreground">Write steps in simple, clear language. Include identifying information like button text, field labels, or element IDs.</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="navigation-actions">Navigation</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Navigate to URLs or pages:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border-b">Action</th>
                    <th className="px-4 py-2 text-left border-b">Expected Result</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>Navigate to https://example.com</code></td>
                    <td className="px-4 py-2"><code>verify "Welcome" is displayed</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>Go to the login page</code></td>
                    <td className="px-4 py-2"><code>verify login form is visible</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>Open https://myapp.com/dashboard</code></td>
                    <td className="px-4 py-2"><code>verify dashboard loads successfully</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="click-actions">Clicks & Interactions</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Click buttons, links, and interactive elements:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border-b">Action</th>
                    <th className="px-4 py-2 text-left border-b">Expected Result</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>click Login button</code></td>
                    <td className="px-4 py-2"><code>verify user is logged in</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>click on "Submit" button</code></td>
                    <td className="px-4 py-2"><code>verify form is submitted</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>double-click on the image</code></td>
                    <td className="px-4 py-2"><code>verify image preview opens</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>right-click on the file</code></td>
                    <td className="px-4 py-2"><code>verify context menu appears</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>hover over the profile icon</code></td>
                    <td className="px-4 py-2"><code>verify dropdown menu shows</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="form-actions">Form Inputs</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Enter text into input fields:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border-b">Action</th>
                    <th className="px-4 py-2 text-left border-b">Expected Result</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>enter "john@test.com" in Email field</code></td>
                    <td className="px-4 py-2"><code>verify email is entered</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>type "password123" in password field</code></td>
                    <td className="px-4 py-2"><code>verify password field is filled</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>fill username with "testuser"</code></td>
                    <td className="px-4 py-2"><code>verify username contains "testuser"</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>clear the search field</code></td>
                    <td className="px-4 py-2"><code>verify search field is empty</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>press Enter key</code></td>
                    <td className="px-4 py-2"><code>verify form submits</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="font-medium text-amber-500">Tip</p>
                  <p className="text-sm text-muted-foreground">Use field labels or placeholder text to identify input fields (e.g., "Email", "Password", "Search").</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="dropdown-actions">Dropdowns & Selects</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Select options from dropdown menus:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border-b">Action</th>
                    <th className="px-4 py-2 text-left border-b">Expected Result</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>select "California" from State dropdown</code></td>
                    <td className="px-4 py-2"><code>verify California is selected</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>choose "Monthly" in billing frequency</code></td>
                    <td className="px-4 py-2"><code>verify Monthly is selected</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>select option "Premium" from plan dropdown</code></td>
                    <td className="px-4 py-2"><code>verify Premium plan is selected</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="checkbox-actions">Checkboxes & Radio Buttons</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Interact with checkboxes and radio buttons:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border-b">Action</th>
                    <th className="px-4 py-2 text-left border-b">Expected Result</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>check the "I agree to terms" checkbox</code></td>
                    <td className="px-4 py-2"><code>verify checkbox is checked</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>uncheck "Subscribe to newsletter"</code></td>
                    <td className="px-4 py-2"><code>verify checkbox is unchecked</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>select "Male" radio button</code></td>
                    <td className="px-4 py-2"><code>verify Male is selected</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>click on "Credit Card" radio option</code></td>
                    <td className="px-4 py-2"><code>verify Credit Card is selected</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="window-actions">Windows & Popups</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Handle browser windows, popups, and tabs:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border-b">Action</th>
                    <th className="px-4 py-2 text-left border-b">Expected Result</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>switch to new window</code></td>
                    <td className="px-4 py-2"><code>verify new window is active</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>switch to popup window</code></td>
                    <td className="px-4 py-2"><code>verify popup content is displayed</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>switch to window with title "Payment"</code></td>
                    <td className="px-4 py-2"><code>verify on payment window</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>switch to main window</code></td>
                    <td className="px-4 py-2"><code>verify browser is on main window</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>switch to original window</code></td>
                    <td className="px-4 py-2"><code>verify original window is active</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>close popup and return to main</code></td>
                    <td className="px-4 py-2"><code>verify popup is closed</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="iframe-actions">Iframes</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Work with embedded iframes:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border-b">Action</th>
                    <th className="px-4 py-2 text-left border-b">Expected Result</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>switch to iframe with title "KYC Form"</code></td>
                    <td className="px-4 py-2"><code>verify browser context is switched to iframe</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>switch to iframe named "payment-frame"</code></td>
                    <td className="px-4 py-2"><code>verify in payment frame context</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>switch to the checkout iframe</code></td>
                    <td className="px-4 py-2"><code>verify checkout iframe is active</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>switch to default content</code></td>
                    <td className="px-4 py-2"><code>verify browser context is switched to main page</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>switch back to main page</code></td>
                    <td className="px-4 py-2"><code>verify main page content is visible</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="font-medium text-green-500">Pro Tip</p>
                  <p className="text-sm text-muted-foreground">Use iframe title, name, or ID for reliable switching. The AI will find the iframe using multiple strategies.</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="verification-actions">Verifications</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Verify page content and element states:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border-b">Expected Result Examples</th>
                    <th className="px-4 py-2 text-left border-b">What It Verifies</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>verify "Welcome" is displayed</code></td>
                    <td className="px-4 py-2">Text "Welcome" exists on page</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>verify login form is visible</code></td>
                    <td className="px-4 py-2">Login form element is visible</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>verify new window opens</code></td>
                    <td className="px-4 py-2">New browser window/tab opened</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>verify browser is on main window</code></td>
                    <td className="px-4 py-2">Browser switched to main window</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>verify context switched to iframe</code></td>
                    <td className="px-4 py-2">Browser is in iframe context</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>verify form submitted successfully</code></td>
                    <td className="px-4 py-2">Success message or redirect</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="advanced-actions">Advanced Actions</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Additional advanced interactions:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border-b">Action</th>
                    <th className="px-4 py-2 text-left border-b">Expected Result</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>scroll to bottom of page</code></td>
                    <td className="px-4 py-2"><code>verify footer is visible</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>scroll to top</code></td>
                    <td className="px-4 py-2"><code>verify header is visible</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>wait 3 seconds</code></td>
                    <td className="px-4 py-2"><code>verify page is loaded</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>drag item to cart</code></td>
                    <td className="px-4 py-2"><code>verify item added to cart</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>focus on the search field</code></td>
                    <td className="px-4 py-2"><code>verify search field is focused</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>accept the dialog</code></td>
                    <td className="px-4 py-2"><code>verify dialog is closed</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>dismiss the alert</code></td>
                    <td className="px-4 py-2"><code>verify alert is dismissed</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="test-data-params">Using Test Data Parameters</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Use placeholders in test steps for dynamic data:
            </p>
            <CodeBlock
              language="text"
              code={`Action: enter {{username}} in email field
Expected: verify email is entered

Action: type {{password}} in password field
Expected: verify password is filled

Action: navigate to {{baseUrl}}/login
Expected: verify login page loads`}
            />
            <p className="text-muted-foreground leading-relaxed mt-4 mb-4">
              When starting execution, provide values for each placeholder:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border-b">Key</th>
                    <th className="px-4 py-2 text-left border-b">Value</th>
                    <th className="px-4 py-2 text-left border-b">Type</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>username</code></td>
                    <td className="px-4 py-2">john@example.com</td>
                    <td className="px-4 py-2">Email</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>password</code></td>
                    <td className="px-4 py-2">MySecurePass123</td>
                    <td className="px-4 py-2">Password</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2"><code>baseUrl</code></td>
                    <td className="px-4 py-2">https://staging.myapp.com</td>
                    <td className="px-4 py-2">URL</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="font-medium text-green-500">Best Practice</p>
                  <p className="text-sm text-muted-foreground">Use test data parameters for sensitive data like passwords, environment-specific URLs, and data that changes between test runs.</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4">Complete Example Test Case</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Here's a complete KYC form test case demonstrating various step types:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border-b">#</th>
                    <th className="px-4 py-2 text-left border-b">Action</th>
                    <th className="px-4 py-2 text-left border-b">Expected Result</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2">1</td>
                    <td className="px-4 py-2"><code>Navigate to {"{{baseUrl}}"}</code></td>
                    <td className="px-4 py-2"><code>verify "Welcome" is displayed</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">2</td>
                    <td className="px-4 py-2"><code>click Continue button</code></td>
                    <td className="px-4 py-2"><code>verify new window opens</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">3</td>
                    <td className="px-4 py-2"><code>switch to new window</code></td>
                    <td className="px-4 py-2"><code>verify browser switched to new window</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">4</td>
                    <td className="px-4 py-2"><code>switch to iframe with title "KYC Form"</code></td>
                    <td className="px-4 py-2"><code>verify context is switched to iframe</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">5</td>
                    <td className="px-4 py-2"><code>enter {"{{fullName}}"} in Full Name</code></td>
                    <td className="px-4 py-2"><code>verify name is entered</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">6</td>
                    <td className="px-4 py-2"><code>select "Male" radio button</code></td>
                    <td className="px-4 py-2"><code>verify Male is selected</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">7</td>
                    <td className="px-4 py-2"><code>type {"{{email}}"} in Email Address</code></td>
                    <td className="px-4 py-2"><code>verify email is entered</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">8</td>
                    <td className="px-4 py-2"><code>select {"{{state}}"} in State dropdown</code></td>
                    <td className="px-4 py-2"><code>verify state is selected</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">9</td>
                    <td className="px-4 py-2"><code>switch to default content</code></td>
                    <td className="px-4 py-2"><code>verify context switched to main page</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">10</td>
                    <td className="px-4 py-2"><code>click Submit button</code></td>
                    <td className="px-4 py-2"><code>verify form submitted successfully</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">11</td>
                    <td className="px-4 py-2"><code>switch to main window</code></td>
                    <td className="px-4 py-2"><code>verify browser is on main window</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );

    case "script-generation":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="frameworks">Supported Frameworks</h1>
            <p className="text-muted-foreground leading-relaxed mb-4">
              AITAS generates automation scripts for the most popular testing frameworks:
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">Playwright</h3>
                <p className="text-sm text-muted-foreground">Modern, fast, and reliable. Supports multiple browsers and auto-waiting.</p>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">Cypress</h3>
                <p className="text-sm text-muted-foreground">Developer-friendly with excellent debugging and time-travel features.</p>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">Selenium</h3>
                <p className="text-sm text-muted-foreground">Industry standard with wide language and browser support.</p>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">Puppeteer</h3>
                <p className="text-sm text-muted-foreground">Chrome-focused with powerful DevTools integration.</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="generating-scripts">Generating Scripts</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Convert your test cases into executable automation scripts:
            </p>
            <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
              <li>Navigate to <strong>Script Generator</strong></li>
              <li>Select a test case from your repository</li>
              <li>Choose your preferred framework (Playwright, Cypress, etc.)</li>
              <li>Click <strong>Generate Script</strong></li>
              <li>Copy or download the generated code</li>
            </ol>
            <h3 className="text-lg font-medium mt-6 mb-2">Example Playwright Script:</h3>
            <CodeBlock
              language="typescript"
              code={`import { test, expect } from '@playwright/test';

test('User can log in with valid credentials', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('form')).toBeVisible();
  
  await page.fill('[name="email"]', 'user@example.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL('/dashboard');
});`}
            />
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="customization">Customization</h2>
            <p className="text-muted-foreground leading-relaxed">
              Generated scripts can be customized to match your project's needs. You can modify 
              selectors, add custom assertions, or integrate with your existing test utilities.
            </p>
          </div>
        </div>
      );

    case "test-execution":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="running-tests">Running Tests</h1>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Execute your test cases against a target application:
            </p>
            <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
              <li>Go to <strong>Test Repository</strong> and select test cases</li>
              <li>Click <strong>Run Tests</strong></li>
              <li>Enter the target URL (e.g., https://your-app.com)</li>
              <li>Select the execution framework (Playwright, Puppeteer, or Selenium)</li>
              <li>Optionally add test data parameters</li>
              <li>Click <strong>Start Execution</strong></li>
            </ol>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="test-data">Test Data Parameters</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Supply dynamic values at execution time using test data parameters:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Add parameters like <code className="text-sm bg-muted px-1 rounded">{"{{username}}"}</code> and <code className="text-sm bg-muted px-1 rounded">{"{{password}}"}</code> in your test steps</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Provide values when starting the execution</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Supports text, password, email, URL, and number types</span>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="viewing-results">Viewing Results</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Monitor and analyze your test execution results:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Real-time progress updates with auto-refresh</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Detailed logs and screenshots for each step</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Pass/fail status with error messages</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Execution history and trends</span>
              </li>
            </ul>
          </div>
        </div>
      );

    case "agents":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="agent-config">Agent Configuration</h1>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Test agents are execution environments that run your automated tests. AITAS provides 
              three types of agents:
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">Browser Agent</h3>
                <p className="text-sm text-muted-foreground">Headless Chrome for UI testing with screenshot and video capabilities.</p>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">API Agent</h3>
                <p className="text-sm text-muted-foreground">REST/GraphQL testing with performance metrics and network logging.</p>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">Mobile Agent</h3>
                <p className="text-sm text-muted-foreground">iOS/Android app testing through Appium integration.</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="autonomous-mode">Autonomous Mode</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Enable autonomous mode for continuous, scheduled test execution:
            </p>
            <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
              <li>Navigate to <strong>Agents</strong> and select an agent</li>
              <li>Enable <strong>Autonomous Mode</strong></li>
              <li>Configure the target URL and test suite</li>
              <li>Set the schedule interval (1, 5, 15, 30, or 60 minutes)</li>
              <li>Click <strong>Start</strong> to begin autonomous execution</li>
            </ol>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="self-healing">Self-Healing Tests</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When tests fail due to UI changes, AITAS can automatically attempt to fix them using AI:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>AI analyzes the failure and suggests alternative selectors</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Configure maximum retry attempts (1-10)</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Receive notifications when self-healing is applied</span>
              </li>
            </ul>
          </div>
        </div>
      );

    case "environments":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="env-setup">Environment Setup</h1>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Manage multiple testing environments (development, staging, production) with different configurations:
            </p>
            <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
              <li>Navigate to <strong>Environments</strong></li>
              <li>Click <strong>Create Environment</strong></li>
              <li>Enter a name, display name, and base URL</li>
              <li>Set as default if needed (only one environment can be default)</li>
              <li>Add environment-specific variables and headers</li>
            </ol>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="variables">Environment Variables</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Store configuration values specific to each environment:
            </p>
            <CodeBlock
              language="json"
              code={`{
  "variables": {
    "API_URL": "https://staging-api.example.com",
    "TIMEOUT": "30000",
    "DEBUG": "true"
  },
  "headers": {
    "X-API-Key": "your-api-key",
    "X-Environment": "staging"
  }
}`}
            />
          </div>
        </div>
      );

    case "cicd":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="github-actions">GitHub Actions</h1>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Integrate AITAS into your GitHub Actions workflow:
            </p>
            <CodeBlock
              language="yaml"
              code={`name: Run AITAS Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger AITAS Tests
        run: |
          curl -X POST \\
            -H "Authorization: Bearer \${{ secrets.AITAS_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{"suiteId": "your-suite-id"}' \\
            https://your-aitas-instance/api/webhooks/trigger`}
            />
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="gitlab-ci">GitLab CI</h2>
            <CodeBlock
              language="yaml"
              code={`stages:
  - test

aitas_tests:
  stage: test
  script:
    - |
      curl -X POST \\
        -H "Authorization: Bearer $AITAS_API_KEY" \\
        -H "Content-Type: application/json" \\
        -d '{"suiteId": "your-suite-id"}' \\
        https://your-aitas-instance/api/webhooks/trigger`}
            />
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="jenkins">Jenkins</h2>
            <CodeBlock
              language="groovy"
              code={`pipeline {
    agent any
    stages {
        stage('Run AITAS Tests') {
            steps {
                script {
                    def response = httpRequest(
                        url: 'https://your-aitas-instance/api/webhooks/trigger',
                        httpMode: 'POST',
                        customHeaders: [[name: 'Authorization', value: "Bearer \${AITAS_API_KEY}"]],
                        requestBody: '{"suiteId": "your-suite-id"}'
                    )
                }
            }
        }
    }
}`}
            />
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="webhooks">Webhooks</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Trigger test executions via webhook:
            </p>
            <CodeBlock
              language="bash"
              code={`curl -X POST https://your-aitas-instance/api/webhooks/trigger \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "suiteId": "suite-uuid",
    "targetUrl": "https://your-app.com",
    "framework": "playwright"
  }'`}
            />
          </div>
        </div>
      );

    case "reports":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="report-types">Report Types</h1>
            <p className="text-muted-foreground leading-relaxed mb-4">
              AITAS provides comprehensive reporting capabilities:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span><strong>Execution Summary:</strong> Overview of pass/fail rates and trends</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span><strong>Detailed Results:</strong> Step-by-step logs and screenshots</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span><strong>Trend Analysis:</strong> Historical data and performance metrics</span>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="exporting">Exporting Reports</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Export reports in multiple formats:
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">HTML</h3>
                <p className="text-sm text-muted-foreground">Professional styled reports for sharing with stakeholders.</p>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">JSON</h3>
                <p className="text-sm text-muted-foreground">Machine-readable format for data analysis and integration.</p>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">JUnit XML</h3>
                <p className="text-sm text-muted-foreground">Standard format for CI/CD tool integration.</p>
              </div>
            </div>
          </div>
        </div>
      );

    case "administration":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="user-management">User Management</h1>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Administrators can manage user accounts and access:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Create new users with temporary passwords</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Users must change password on first login</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Activate or deactivate user accounts</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span>Super admins have access to all projects</span>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="roles-permissions">Roles & Permissions</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Built-in roles for access control:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Role</th>
                    <th className="text-left py-3 px-4 font-medium">Permissions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-3 px-4">Administrator</td>
                    <td className="py-3 px-4 text-muted-foreground">Full access: view, create, edit, delete, execute, admin</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 px-4">Tester</td>
                    <td className="py-3 px-4 text-muted-foreground">View, create, and execute tests</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 px-4">Viewer</td>
                    <td className="py-3 px-4 text-muted-foreground">Read-only access to tests and reports</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="ai-settings">AI Settings</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Configure AI integration for test generation:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span><strong>OpenAI (Default):</strong> Uses GPT-4o via Replit integration</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                <span><strong>Custom LLM:</strong> Configure your own endpoint (AWS Bedrock, etc.)</span>
              </li>
            </ul>
            <p className="text-muted-foreground mt-4">
              To use a custom LLM, enable it in Settings and provide your API endpoint URL, access key, and model ID.
            </p>
          </div>
        </div>
      );

    case "api-reference":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="authentication-api">Authentication</h1>
            <p className="text-muted-foreground leading-relaxed mb-4">
              API authentication uses session-based cookies. All API requests require authentication.
            </p>
            <h3 className="text-lg font-medium mb-2">Login</h3>
            <CodeBlock
              language="bash"
              code={`POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}`}
            />
            <h3 className="text-lg font-medium mb-2 mt-6">Get Current User</h3>
            <CodeBlock
              language="bash"
              code={`GET /api/auth/user

Response:
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "isSuperAdmin": false,
  "mustChangePassword": false
}`}
            />
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="test-cases-api">Test Cases API</h2>
            <h3 className="text-lg font-medium mb-2">List Test Cases</h3>
            <CodeBlock
              language="bash"
              code={`GET /api/test-cases

Response: Array of test case objects`}
            />
            <h3 className="text-lg font-medium mb-2 mt-6">Create Test Case</h3>
            <CodeBlock
              language="bash"
              code={`POST /api/test-cases
Content-Type: application/json

{
  "title": "Login Test",
  "description": "Verify user login",
  "steps": [
    {"step": "Navigate to login", "expected": "Form displayed"}
  ],
  "priority": "high",
  "tags": ["auth"]
}`}
            />
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="executions-api">Executions API</h2>
            <h3 className="text-lg font-medium mb-2">Start Execution</h3>
            <CodeBlock
              language="bash"
              code={`POST /api/executions
Content-Type: application/json

{
  "testCaseIds": ["uuid1", "uuid2"],
  "targetUrl": "https://example.com",
  "framework": "playwright"
}`}
            />
            <h3 className="text-lg font-medium mb-2 mt-6">Get Execution Results</h3>
            <CodeBlock
              language="bash"
              code={`GET /api/executions/:id/results

Response: Array of test result objects with status, logs, and screenshots`}
            />
          </div>
        </div>
      );

    case "troubleshooting":
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4" id="common-issues">Common Issues</h1>
            
            <div className="space-y-6">
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">Tests fail to start</h3>
                <p className="text-sm text-muted-foreground mb-2">Possible causes:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>Target URL is unreachable</li>
                  <li>Agent is offline or unavailable</li>
                  <li>Invalid test case configuration</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">AI generation returns errors</h3>
                <p className="text-sm text-muted-foreground mb-2">Solutions:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>Check AI settings configuration</li>
                  <li>Verify API keys are valid</li>
                  <li>Ensure requirements are clear and specific</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-2">Login fails</h3>
                <p className="text-sm text-muted-foreground mb-2">Solutions:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>Verify email and password are correct</li>
                  <li>Contact administrator if account is locked</li>
                  <li>Clear browser cookies and try again</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4" id="faq">FAQ</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-1">Can I use my own LLM instead of OpenAI?</h3>
                <p className="text-sm text-muted-foreground">Yes, AITAS supports custom LLM integration. Go to Settings and enable "Use Custom LLM", then configure your endpoint URL, access key, and model ID.</p>
              </div>
              
              <div>
                <h3 className="font-medium mb-1">How do I reset my password?</h3>
                <p className="text-sm text-muted-foreground">Contact your administrator to receive a new temporary password. You'll be prompted to change it on your next login.</p>
              </div>
              
              <div>
                <h3 className="font-medium mb-1">Can tests run in parallel?</h3>
                <p className="text-sm text-muted-foreground">Yes, multiple test executions can run simultaneously on different agents.</p>
              </div>
              
              <div>
                <h3 className="font-medium mb-1">What browsers are supported for test execution?</h3>
                <p className="text-sm text-muted-foreground">AITAS supports Chromium, Firefox, and WebKit through Playwright, and Chrome through Puppeteer and Selenium.</p>
              </div>
            </div>
          </div>
        </div>
      );

    default:
      return (
        <div>
          <h1 className="text-3xl font-bold mb-4">Documentation</h1>
          <p className="text-muted-foreground">Select a topic from the sidebar to get started.</p>
        </div>
      );
  }
}

export default function Documentation() {
  const [activeSection, setActiveSection] = useState("overview");
  const [expandedSections, setExpandedSections] = useState<string[]>(["overview"]);

  const toggleSection = (sectionId: string) => {
    if (expandedSections.includes(sectionId)) {
      setExpandedSections(expandedSections.filter((id) => id !== sectionId));
    } else {
      setExpandedSections([...expandedSections, sectionId]);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: "var(--baxter-surface)",
        color: "var(--baxter-ink)",
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <header
        className="sticky top-0 z-50 backdrop-blur"
        style={{
          backgroundColor: "rgba(255,255,255,0.88)",
          borderBottom: "1px solid var(--baxter-line)",
        }}
      >
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                data-testid="button-back-home"
                style={{ color: "var(--baxter-ink-soft)" }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Button>
            </Link>
            <span
              aria-hidden="true"
              className="hidden sm:block h-6 w-px"
              style={{ backgroundColor: "var(--baxter-line)" }}
            />
            <div className="hidden sm:flex items-center gap-2.5">
              <BaxterLogo height={26} />
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: "var(--baxter-light)",
                  color: "var(--baxter-primary)",
                  border: "1px solid rgba(0,84,159,0.14)",
                }}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Documentation
              </span>
            </div>
          </div>
          <Link href="/login">
            <Button
              size="sm"
              data-testid="button-login-docs"
              className="font-semibold text-white shadow-sm transition-all hover:translate-y-[-1px] hover:shadow-md"
              style={{ backgroundColor: "var(--baxter-primary)" }}
            >
              Sign In
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </header>

      <div className="container flex">
        <aside
          className="hidden md:block w-64 shrink-0"
          style={{ borderRight: "1px solid var(--baxter-line)" }}
        >
          <ScrollArea className="h-[calc(100vh-4rem)] py-6 pr-4">
            <nav className="space-y-1">
              {sections.map((section) => {
                const isActive = activeSection === section.id;
                return (
                  <div key={section.id}>
                    <button
                      onClick={() => {
                        setActiveSection(section.id);
                        toggleSection(section.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors"
                      style={
                        isActive
                          ? {
                              backgroundColor: "var(--baxter-light)",
                              color: "var(--baxter-primary)",
                              fontWeight: 600,
                            }
                          : { color: "var(--baxter-ink-soft)" }
                      }
                      data-testid={`nav-${section.id}`}
                    >
                      {section.icon}
                      <span>{section.title}</span>
                      {section.subsections && (
                        <ChevronRight
                          className={`h-4 w-4 ml-auto transition-transform ${
                            expandedSections.includes(section.id) ? "rotate-90" : ""
                          }`}
                        />
                      )}
                    </button>
                    {section.subsections && expandedSections.includes(section.id) && (
                      <div
                        className="ml-6 mt-1 space-y-1"
                        style={{ borderLeft: "1px solid var(--baxter-line)" }}
                      >
                        {section.subsections.map((sub) => (
                          <a
                            key={sub.id}
                            href={`#${sub.id}`}
                            onClick={() => setActiveSection(section.id)}
                            className="block px-3 py-1.5 text-sm transition-colors hover:underline"
                            style={{ color: "var(--baxter-ink-mute)" }}
                            data-testid={`nav-${sub.id}`}
                          >
                            {sub.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </ScrollArea>
        </aside>

        <main className="flex-1 py-8 px-6 md:px-12 max-w-4xl">
          <SectionContent sectionId={activeSection} />
        </main>
      </div>
    </div>
  );
}
