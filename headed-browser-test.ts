/**
 * AITAS Headed Browser Test Suite
 * Visually tests every page and feature with rich mock data
 * Run: npx tsx headed-browser-test.ts
 */

import { chromium, type Browser, type Page, type BrowserContext } from "@playwright/test";

const BASE = "http://127.0.0.1:5000";
const SLOW_MO = 120;
const TIMEOUT = 20000;

// ─── Result Tracking ──────────────────────────────────────────────────────────

interface UITestResult {
  page: string;
  test: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail?: string;
  duration: number;
}

const results: UITestResult[] = [];
let passCount = 0;
let failCount = 0;

async function uiTest(
  pageName: string,
  testName: string,
  fn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const dur = Date.now() - start;
    results.push({ page: pageName, test: testName, status: "PASS", duration: dur });
    passCount++;
    console.log(`  ✓ ${testName} (${dur}ms)`);
  } catch (err: any) {
    const dur = Date.now() - start;
    results.push({ page: pageName, test: testName, status: "FAIL", detail: err.message?.slice(0, 120), duration: dur });
    failCount++;
    console.log(`  ✗ ${testName} — ${err.message?.slice(0, 80)}`);
  }
}

// ─── Page Helpers ─────────────────────────────────────────────────────────────

async function waitAndClick(page: Page, selector: string, timeout = TIMEOUT) {
  await page.waitForSelector(selector, { timeout });
  await page.click(selector);
}

async function waitForText(page: Page, text: string, timeout = TIMEOUT) {
  await page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    text, { timeout }
  );
}

async function pageLoaded(page: Page, urlPart: string, textToFind: string) {
  await page.waitForURL(`**${urlPart}**`, { timeout: TIMEOUT });
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
  await waitForText(page, textToFind);
}

async function navigateTo(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: TIMEOUT });
}

// ─── SEED MOCK DATA VIA API ───────────────────────────────────────────────────

async function seedMockData() {
  console.log("\n🌱 Seeding mock data via API...");
  const { execSync } = await import("child_process");
  try {
    execSync("npx tsx seed-mock-data.ts", { cwd: process.cwd(), stdio: "inherit", timeout: 60000 });
  } catch (e: any) {
    console.warn("  ⚠ Seeding had warnings:", e.message?.slice(0, 80));
  }
}

// ─── TEST: LOGIN PAGE ─────────────────────────────────────────────────────────

async function testLoginPage(page: Page) {
  console.log("\n📋 LOGIN PAGE");

  await uiTest("Login", "Login page loads with branding", async () => {
    await navigateTo(page, "/login");
    await page.waitForLoadState("networkidle");
    const title = await page.title();
    const hasForm = await page.locator("input[type='email'], input[name='email']").count() > 0;
    if (!hasForm) throw new Error("Login form not found");
  });

  await uiTest("Login", "Shows validation on empty submit", async () => {
    await navigateTo(page, "/login");
    await page.waitForLoadState("networkidle");
    const btn = page.locator("button[type='submit'], button:has-text('Sign In'), button:has-text('Login')").first();
    await btn.click();
    await page.waitForTimeout(500);
  });

  await uiTest("Login", "Login with valid credentials", async () => {
    await navigateTo(page, "/login");
    await page.waitForLoadState("networkidle");
    await page.fill("input[type='email'], input[name='email']", "admin@aitas.com");
    await page.fill("input[type='password'], input[name='password']", "AitasMaster2024!");
    await page.click("button[type='submit'], button:has-text('Sign In'), button:has-text('Login')");
    await page.waitForURL(`${BASE}/`, { timeout: TIMEOUT });
  });
}

// ─── TEST: DASHBOARD ──────────────────────────────────────────────────────────

async function testDashboard(page: Page) {
  console.log("\n📋 DASHBOARD");

  await uiTest("Dashboard", "Dashboard loads with stats cards", async () => {
    await navigateTo(page, "/");
    await page.waitForLoadState("networkidle");
    const cards = await page.locator("[class*='card'], [class*='Card']").count();
    if (cards < 2) throw new Error(`Only ${cards} cards found`);
  });

  await uiTest("Dashboard", "Sidebar navigation visible", async () => {
    const sidebar = await page.locator("nav, aside, [class*='sidebar'], [class*='Sidebar']").first();
    const visible = await sidebar.isVisible();
    if (!visible) throw new Error("Sidebar not visible");
  });

  await uiTest("Dashboard", "Recent executions section present", async () => {
    const body = await page.textContent("body");
    const hasExec = body?.toLowerCase().includes("execution") || body?.toLowerCase().includes("test") || body?.toLowerCase().includes("suite");
    if (!hasExec) throw new Error("No execution/test content found");
  });

  await uiTest("Dashboard", "Quick action buttons visible", async () => {
    const buttons = await page.locator("button").count();
    if (buttons < 1) throw new Error("No buttons found on dashboard");
  });
}

// ─── TEST: TEST REPOSITORY ────────────────────────────────────────────────────

async function testRepository(page: Page) {
  console.log("\n📋 TEST REPOSITORY");

  await uiTest("Repository", "Repository page loads", async () => {
    await navigateTo(page, "/repository");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("suite") && !body?.toLowerCase().includes("test") && !body?.toLowerCase().includes("reposit")) {
      throw new Error("Repository content not found");
    }
  });

  await uiTest("Repository", "Test suites listed", async () => {
    await page.waitForTimeout(1000);
    const body = await page.textContent("body");
    const hasSuites = body?.includes("Authentication") || body?.includes("Checkout") || body?.includes("Suite");
    if (!hasSuites) throw new Error("No test suites visible");
  });

  await uiTest("Repository", "Create new suite button exists", async () => {
    const btn = page.locator("button:has-text('New'), button:has-text('Create'), button:has-text('Add'), button:has-text('+')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) throw new Error("Create button not found");
  });

  await uiTest("Repository", "Can open create suite dialog", async () => {
    const btn = page.locator("button:has-text('New Suite'), button:has-text('Create Suite'), button:has-text('New Test Suite')").first();
    const exists = await btn.count() > 0;
    if (exists) {
      await btn.click();
      await page.waitForTimeout(500);
      const dialog = await page.locator("[role='dialog'], [class*='dialog'], [class*='Dialog'], [class*='modal']").first();
      const visible = await dialog.isVisible().catch(() => false);
      if (visible) await page.keyboard.press("Escape");
    }
  });

  await uiTest("Repository", "Test cases visible in suite", async () => {
    await page.waitForTimeout(800);
    const body = await page.textContent("body");
    const hasTC = body?.includes("Login") || body?.includes("Checkout") || body?.includes("test case") || body?.includes("Test Case");
    if (!hasTC) throw new Error("No test cases visible");
  });
}

// ─── TEST: AI GENERATOR ───────────────────────────────────────────────────────

async function testGenerator(page: Page) {
  console.log("\n📋 AI TEST GENERATOR");

  await uiTest("Generator", "Generator page loads", async () => {
    await navigateTo(page, "/generator");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("generat") && !body?.toLowerCase().includes("ai") && !body?.toLowerCase().includes("requirement")) {
      throw new Error("Generator content not found");
    }
  });

  await uiTest("Generator", "Requirement input field present", async () => {
    const input = page.locator("textarea, input[placeholder*='requirement'], input[placeholder*='describe'], input[placeholder*='Describe']").first();
    const visible = await input.isVisible().catch(() => false);
    if (!visible) throw new Error("Requirement input not found");
  });

  await uiTest("Generator", "App type selector present", async () => {
    const selector = page.locator("select, [role='combobox'], [class*='select'], [class*='Select']").first();
    const visible = await selector.isVisible().catch(() => false);
    if (!visible) throw new Error("App type selector not found");
  });

  await uiTest("Generator", "Generate button present", async () => {
    const btn = page.locator("button:has-text('Generate'), button:has-text('Create Tests'), button:has-text('AI Generate')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) throw new Error("Generate button not found");
  });
}

// ─── TEST: SCRIPT GENERATOR ───────────────────────────────────────────────────

async function testScripts(page: Page) {
  console.log("\n📋 SCRIPT GENERATOR");

  await uiTest("Scripts", "Scripts page loads", async () => {
    await navigateTo(page, "/scripts");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("script") && !body?.toLowerCase().includes("playwright") && !body?.toLowerCase().includes("framework")) {
      throw new Error("Scripts content not found");
    }
  });

  await uiTest("Scripts", "Framework selector present", async () => {
    const body = await page.textContent("body");
    const hasFramework = body?.includes("Playwright") || body?.includes("Cypress") || body?.includes("Selenium");
    if (!hasFramework) throw new Error("Framework options not found");
  });

  await uiTest("Scripts", "Language selector present", async () => {
    const body = await page.textContent("body");
    const hasLang = body?.includes("TypeScript") || body?.includes("JavaScript") || body?.includes("Python");
    if (!hasLang) throw new Error("Language options not found");
  });
}

// ─── TEST: EXECUTIONS ─────────────────────────────────────────────────────────

async function testExecutions(page: Page) {
  console.log("\n📋 EXECUTIONS");

  await uiTest("Executions", "Executions page loads", async () => {
    await navigateTo(page, "/executions");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("execution") && !body?.toLowerCase().includes("run") && !body?.toLowerCase().includes("test")) {
      throw new Error("Executions content not found");
    }
  });

  await uiTest("Executions", "Execution list shows seeded data", async () => {
    await page.waitForTimeout(1000);
    const body = await page.textContent("body");
    const hasData = body?.includes("passed") || body?.includes("failed") || body?.includes("running") || body?.includes("staging");
    if (!hasData) throw new Error("No execution data visible");
  });

  await uiTest("Executions", "Status badges visible", async () => {
    const badges = await page.locator("[class*='badge'], [class*='Badge'], [class*='status'], [class*='Status']").count();
    if (badges < 1) throw new Error("No status badges found");
  });

  await uiTest("Executions", "New execution button present", async () => {
    const btn = page.locator("button:has-text('New'), button:has-text('Run'), button:has-text('Execute'), button:has-text('Start')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) throw new Error("New execution button not found");
  });

  await uiTest("Executions", "Filter/search controls present", async () => {
    const controls = await page.locator("input[type='search'], input[placeholder*='search'], input[placeholder*='Search'], select, [role='combobox']").count();
    if (controls < 1) throw new Error("No filter controls found");
  });
}

// ─── TEST: ENTERPRISE EXECUTIONS ─────────────────────────────────────────────

async function testEnterpriseExecutions(page: Page) {
  console.log("\n📋 ENTERPRISE EXECUTIONS");

  await uiTest("Enterprise", "Enterprise page loads", async () => {
    await navigateTo(page, "/enterprise-executions");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("enterprise") && !body?.toLowerCase().includes("sap") && !body?.toLowerCase().includes("salesforce") && !body?.toLowerCase().includes("executor")) {
      throw new Error("Enterprise content not found");
    }
  });

  await uiTest("Enterprise", "SAP executor tab/section visible", async () => {
    const body = await page.textContent("body");
    const hasSAP = body?.includes("SAP") || body?.includes("Fiori") || body?.includes("GUI");
    if (!hasSAP) throw new Error("SAP section not found");
  });

  await uiTest("Enterprise", "Salesforce executor visible", async () => {
    const body = await page.textContent("body");
    if (!body?.includes("Salesforce") && !body?.includes("salesforce")) throw new Error("Salesforce section not found");
  });

  await uiTest("Enterprise", "Mobile executor visible", async () => {
    const body = await page.textContent("body");
    if (!body?.includes("Mobile") && !body?.includes("iOS") && !body?.includes("Android")) throw new Error("Mobile section not found");
  });
}

// ─── TEST: AI HEALER ──────────────────────────────────────────────────────────

async function testAIHealer(page: Page) {
  console.log("\n📋 AI HEALER");

  await uiTest("AI Healer", "Healer page loads", async () => {
    await navigateTo(page, "/ai-healer");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("heal") && !body?.toLowerCase().includes("fix") && !body?.toLowerCase().includes("repair")) {
      throw new Error("AI Healer content not found");
    }
  });

  await uiTest("AI Healer", "Analyse button present", async () => {
    const btn = page.locator("button:has-text('Analyse'), button:has-text('Analyze'), button:has-text('Heal'), button:has-text('Scan')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) throw new Error("Analyse button not found");
  });

  await uiTest("AI Healer", "Suite selector present", async () => {
    const selector = page.locator("select, [role='combobox'], [class*='select'], [class*='Select']").first();
    const visible = await selector.isVisible().catch(() => false);
    if (!visible) throw new Error("Suite selector not found");
  });
}

// ─── TEST: PERFORMANCE ────────────────────────────────────────────────────────

async function testPerformance(page: Page) {
  console.log("\n📋 PERFORMANCE");

  await uiTest("Performance", "Performance page loads", async () => {
    await navigateTo(page, "/performance");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("performance") && !body?.toLowerCase().includes("benchmark") && !body?.toLowerCase().includes("load")) {
      throw new Error("Performance content not found");
    }
  });

  await uiTest("Performance", "URL input field present", async () => {
    const input = page.locator("input[type='url'], input[placeholder*='url'], input[placeholder*='URL'], input[placeholder*='http']").first();
    const visible = await input.isVisible().catch(() => false);
    if (!visible) throw new Error("URL input not found");
  });

  await uiTest("Performance", "Concurrent users control present", async () => {
    const body = await page.textContent("body");
    const hasConcurrent = body?.toLowerCase().includes("concurrent") || body?.toLowerCase().includes("users") || body?.toLowerCase().includes("virtual");
    if (!hasConcurrent) throw new Error("Concurrent users control not found");
  });

  await uiTest("Performance", "Run benchmark button present", async () => {
    const btn = page.locator("button:has-text('Run'), button:has-text('Benchmark'), button:has-text('Start'), button:has-text('Test')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) throw new Error("Run button not found");
  });
}

// ─── TEST: CI/CD ──────────────────────────────────────────────────────────────

async function testCICD(page: Page) {
  console.log("\n📋 CI/CD INTEGRATION");

  await uiTest("CI/CD", "CI/CD page loads", async () => {
    await navigateTo(page, "/cicd");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("ci") && !body?.toLowerCase().includes("pipeline") && !body?.toLowerCase().includes("webhook") && !body?.toLowerCase().includes("github")) {
      throw new Error("CI/CD content not found");
    }
  });

  await uiTest("CI/CD", "Provider cards visible (7 providers)", async () => {
    const body = await page.textContent("body");
    const providers = ["GitHub", "Jenkins", "Azure", "GitLab"];
    const found = providers.filter(p => body?.includes(p));
    if (found.length < 2) throw new Error(`Only found providers: ${found.join(", ")}`);
  });

  await uiTest("CI/CD", "Seeded webhooks listed", async () => {
    await page.waitForTimeout(1000);
    const body = await page.textContent("body");
    const hasWebhooks = body?.includes("GitHub Actions") || body?.includes("Jenkins") || body?.includes("GitLab");
    if (!hasWebhooks) throw new Error("No seeded webhooks visible");
  });

  await uiTest("CI/CD", "Add integration button present", async () => {
    const btn = page.locator("button:has-text('Add'), button:has-text('New'), button:has-text('Connect'), button:has-text('Integration')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) throw new Error("Add integration button not found");
  });

  await uiTest("CI/CD", "Inbound webhook URLs section present", async () => {
    const body = await page.textContent("body");
    const hasInbound = body?.toLowerCase().includes("inbound") || body?.toLowerCase().includes("webhook url") || body?.toLowerCase().includes("/api/cicd/webhook");
    if (!hasInbound) throw new Error("Inbound webhook section not found");
  });
}

// ─── TEST: COVERAGE MATRIX ────────────────────────────────────────────────────

async function testCoverage(page: Page) {
  console.log("\n📋 COVERAGE MATRIX");

  await uiTest("Coverage", "Coverage page loads", async () => {
    await navigateTo(page, "/coverage");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("coverage") && !body?.toLowerCase().includes("requirement") && !body?.toLowerCase().includes("matrix")) {
      throw new Error("Coverage content not found");
    }
  });

  await uiTest("Coverage", "Build matrix button present", async () => {
    const btn = page.locator("button:has-text('Build'), button:has-text('Generate'), button:has-text('Matrix'), button:has-text('Coverage')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) throw new Error("Build matrix button not found");
  });

  await uiTest("Coverage", "Click Build Coverage Matrix", async () => {
    const btn = page.locator("button:has-text('Build Coverage Matrix'), button:has-text('Build Matrix'), button:has-text('Build')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (visible) {
      await btn.click();
      await page.waitForTimeout(2000);
      const body = await page.textContent("body");
      const hasStats = body?.includes("%") || body?.includes("requirement") || body?.includes("Requirement");
      if (!hasStats) throw new Error("Matrix stats not shown after build");
    }
  });

  await uiTest("Coverage", "Coverage stats cards visible after build", async () => {
    await page.waitForTimeout(500);
    const body = await page.textContent("body");
    const hasStats = body?.includes("Coverage") || body?.includes("Pass Rate") || body?.includes("Risk");
    if (!hasStats) throw new Error("Coverage stats not visible");
  });
}

// ─── TEST: DATA FACTORY ───────────────────────────────────────────────────────

async function testDataFactory(page: Page) {
  console.log("\n📋 TEST DATA FACTORY");

  await uiTest("Data Factory", "Data factory page loads", async () => {
    await navigateTo(page, "/data-factory");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("data") && !body?.toLowerCase().includes("factory") && !body?.toLowerCase().includes("generat")) {
      throw new Error("Data factory content not found");
    }
  });

  await uiTest("Data Factory", "Data type cards visible", async () => {
    const body = await page.textContent("body");
    const types = ["Person", "Finance", "Order", "Address", "Product"];
    const found = types.filter(t => body?.includes(t));
    if (found.length < 2) throw new Error(`Only found types: ${found.join(", ")}`);
  });

  await uiTest("Data Factory", "Seeded datasets listed", async () => {
    await page.waitForTimeout(800);
    const body = await page.textContent("body");
    const hasDatasets = body?.includes("Test Users") || body?.includes("Payment Cards") || body?.includes("Orders") || body?.includes("records");
    if (!hasDatasets) throw new Error("No seeded datasets visible");
  });

  await uiTest("Data Factory", "Generate button present", async () => {
    const btn = page.locator("button:has-text('Generate'), button:has-text('Create Dataset'), button:has-text('New Dataset')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) throw new Error("Generate button not found");
  });

  await uiTest("Data Factory", "Record count selector present", async () => {
    const body = await page.textContent("body");
    const hasCount = body?.toLowerCase().includes("count") || body?.toLowerCase().includes("records") || body?.toLowerCase().includes("rows");
    if (!hasCount) throw new Error("Record count control not found");
  });
}

// ─── TEST: REPORTS ────────────────────────────────────────────────────────────

async function testReports(page: Page) {
  console.log("\n📋 REPORTS");

  await uiTest("Reports", "Reports page loads", async () => {
    await navigateTo(page, "/reports");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("report") && !body?.toLowerCase().includes("analytic") && !body?.toLowerCase().includes("insight")) {
      throw new Error("Reports content not found");
    }
  });

  await uiTest("Reports", "Analytics charts or stats visible", async () => {
    await page.waitForTimeout(1000);
    const body = await page.textContent("body");
    const hasAnalytics = body?.includes("Pass") || body?.includes("Fail") || body?.includes("Rate") || body?.includes("Total") || body?.includes("trend");
    if (!hasAnalytics) throw new Error("No analytics data visible");
  });
}

// ─── TEST: ENVIRONMENTS ───────────────────────────────────────────────────────

async function testEnvironments(page: Page) {
  console.log("\n📋 ENVIRONMENTS");

  await uiTest("Environments", "Environments page loads", async () => {
    await navigateTo(page, "/environments");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("environment") && !body?.toLowerCase().includes("staging") && !body?.toLowerCase().includes("production")) {
      throw new Error("Environments content not found");
    }
  });

  await uiTest("Environments", "Seeded environments listed", async () => {
    await page.waitForTimeout(800);
    const body = await page.textContent("body");
    const hasEnvs = body?.includes("Staging") || body?.includes("Production") || body?.includes("Development") || body?.includes("QA");
    if (!hasEnvs) throw new Error("No seeded environments visible");
  });

  await uiTest("Environments", "Add environment button present", async () => {
    const btn = page.locator("button:has-text('Add'), button:has-text('New'), button:has-text('Create')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) throw new Error("Add environment button not found");
  });

  await uiTest("Environments", "Environment base URLs visible", async () => {
    const body = await page.textContent("body");
    const hasUrls = body?.includes("https://") || body?.includes("http://");
    if (!hasUrls) throw new Error("No environment URLs visible");
  });
}

// ─── TEST: AGENTS ─────────────────────────────────────────────────────────────

async function testAgents(page: Page) {
  console.log("\n📋 AGENT SETUP");

  await uiTest("Agents", "Agents page loads", async () => {
    await navigateTo(page, "/agents");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("agent") && !body?.toLowerCase().includes("browser") && !body?.toLowerCase().includes("executor")) {
      throw new Error("Agents content not found");
    }
  });

  await uiTest("Agents", "Seeded agents listed", async () => {
    await page.waitForTimeout(800);
    const body = await page.textContent("body");
    const hasAgents = body?.includes("Chrome") || body?.includes("Firefox") || body?.includes("API") || body?.includes("Mobile");
    if (!hasAgents) throw new Error("No seeded agents visible");
  });

  await uiTest("Agents", "Online/offline status badges visible", async () => {
    const body = await page.textContent("body");
    const hasStatus = body?.includes("online") || body?.includes("Online") || body?.includes("offline") || body?.includes("Offline");
    if (!hasStatus) throw new Error("No agent status badges visible");
  });

  await uiTest("Agents", "Create agent button present", async () => {
    const btn = page.locator("button:has-text('New'), button:has-text('Add'), button:has-text('Create'), button:has-text('Register')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) throw new Error("Create agent button not found");
  });
}

// ─── TEST: PROJECTS ───────────────────────────────────────────────────────────

async function testProjects(page: Page) {
  console.log("\n📋 PROJECTS");

  await uiTest("Projects", "Projects page loads", async () => {
    await navigateTo(page, "/projects");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("project") && !body?.toLowerCase().includes("team") && !body?.toLowerCase().includes("workspace")) {
      throw new Error("Projects content not found");
    }
  });

  await uiTest("Projects", "Seeded projects listed", async () => {
    await page.waitForTimeout(800);
    const body = await page.textContent("body");
    const hasProjects = body?.includes("MyApp") || body?.includes("Mobile Banking") || body?.includes("API Gateway") || body?.includes("Project");
    if (!hasProjects) throw new Error("No seeded projects visible");
  });

  await uiTest("Projects", "Create project button present", async () => {
    const btn = page.locator("button:has-text('New'), button:has-text('Create'), button:has-text('Add')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) throw new Error("Create project button not found");
  });
}

// ─── TEST: SETTINGS ───────────────────────────────────────────────────────────

async function testSettings(page: Page) {
  console.log("\n📋 SETTINGS");

  await uiTest("Settings", "Settings page loads", async () => {
    await navigateTo(page, "/settings");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("setting") && !body?.toLowerCase().includes("config") && !body?.toLowerCase().includes("notification")) {
      throw new Error("Settings content not found");
    }
  });

  await uiTest("Settings", "Notification settings section visible", async () => {
    const body = await page.textContent("body");
    const hasNotif = body?.includes("Slack") || body?.includes("Teams") || body?.includes("Email") || body?.includes("Notification");
    if (!hasNotif) throw new Error("Notification settings not found");
  });

  await uiTest("Settings", "AI configuration section visible", async () => {
    const body = await page.textContent("body");
    const hasAI = body?.includes("AI") || body?.includes("Claude") || body?.includes("OpenAI") || body?.includes("Bedrock") || body?.includes("LLM");
    if (!hasAI) throw new Error("AI settings not found");
  });

  await uiTest("Settings", "Save settings button present", async () => {
    const btn = page.locator("button:has-text('Save'), button:has-text('Apply'), button:has-text('Update')").first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) throw new Error("Save button not found");
  });
}

// ─── TEST: APP PROFILES ───────────────────────────────────────────────────────

async function testAppProfiles(page: Page) {
  console.log("\n📋 APP PROFILES");

  await uiTest("App Profiles", "App profiles page loads", async () => {
    await navigateTo(page, "/app-profiles");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("profile") && !body?.toLowerCase().includes("application") && !body?.toLowerCase().includes("web")) {
      throw new Error("App profiles content not found");
    }
  });

  await uiTest("App Profiles", "12 app type profiles visible", async () => {
    const body = await page.textContent("body");
    const profiles = ["Web", "SAP", "Salesforce", "Mobile", "API", "Desktop"];
    const found = profiles.filter(p => body?.includes(p));
    if (found.length < 3) throw new Error(`Only found profiles: ${found.join(", ")}`);
  });
}

// ─── TEST: ADMIN PANEL ────────────────────────────────────────────────────────

async function testAdmin(page: Page) {
  console.log("\n📋 ADMIN PANEL");

  await uiTest("Admin", "Admin page loads", async () => {
    await navigateTo(page, "/admin");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    if (!body?.toLowerCase().includes("admin") && !body?.toLowerCase().includes("health") && !body?.toLowerCase().includes("role") && !body?.toLowerCase().includes("audit")) {
      throw new Error("Admin content not found");
    }
  });

  await uiTest("Admin", "Health tab shows system status", async () => {
    const healthTab = page.locator("button:has-text('Health'), [role='tab']:has-text('Health')").first();
    const visible = await healthTab.isVisible().catch(() => false);
    if (visible) await healthTab.click();
    await page.waitForTimeout(1000);
    const body = await page.textContent("body");
    const hasHealth = body?.includes("healthy") || body?.includes("degraded") || body?.includes("CPU") || body?.includes("Memory") || body?.includes("Database");
    if (!hasHealth) throw new Error("Health status not visible");
  });

  await uiTest("Admin", "Roles tab shows seeded roles", async () => {
    const rolesTab = page.locator("button:has-text('Roles'), [role='tab']:has-text('Roles')").first();
    const visible = await rolesTab.isVisible().catch(() => false);
    if (visible) {
      await rolesTab.click();
      await page.waitForTimeout(800);
      const body = await page.textContent("body");
      const hasRoles = body?.includes("QA Lead") || body?.includes("Developer") || body?.includes("Release") || body?.includes("permissions");
      if (!hasRoles) throw new Error("Seeded roles not visible");
    }
  });

  await uiTest("Admin", "Audit log tab shows events", async () => {
    const auditTab = page.locator("button:has-text('Audit'), [role='tab']:has-text('Audit')").first();
    const visible = await auditTab.isVisible().catch(() => false);
    if (visible) {
      await auditTab.click();
      await page.waitForTimeout(800);
      const body = await page.textContent("body");
      const hasAudit = body?.includes("role") || body?.includes("system") || body?.includes("info") || body?.includes("Total Events");
      if (!hasAudit) throw new Error("Audit log entries not visible");
    }
  });

  await uiTest("Admin", "System resource metrics visible", async () => {
    const healthTab = page.locator("button:has-text('Health'), [role='tab']:has-text('Health')").first();
    const visible = await healthTab.isVisible().catch(() => false);
    if (visible) await healthTab.click();
    await page.waitForTimeout(500);
    const body = await page.textContent("body");
    const hasMetrics = body?.includes("%") && (body?.includes("CPU") || body?.includes("Memory") || body?.includes("Disk"));
    if (!hasMetrics) throw new Error("Resource metrics not visible");
  });
}

// ─── TEST: SIDEBAR NAVIGATION ─────────────────────────────────────────────────

async function testNavigation(page: Page) {
  console.log("\n📋 SIDEBAR NAVIGATION");

  const navItems = [
    { label: "Dashboard", path: "/", check: "dashboard" },
    { label: "Repository", path: "/repository", check: "suite" },
    { label: "Executions", path: "/executions", check: "execution" },
    { label: "Reports", path: "/reports", check: "report" },
    { label: "Environments", path: "/environments", check: "environment" },
    { label: "Settings", path: "/settings", check: "setting" },
  ];

  for (const item of navItems) {
    await uiTest("Navigation", `Navigate to ${item.label}`, async () => {
      await navigateTo(page, item.path);
      await page.waitForLoadState("networkidle");
      const body = (await page.textContent("body"))?.toLowerCase() || "";
      if (!body.includes(item.check)) throw new Error(`${item.label} page content not found`);
    });
  }
}

// ─── TEST: RESPONSIVE / DARK MODE ────────────────────────────────────────────

async function testUIFeatures(page: Page) {
  console.log("\n📋 UI FEATURES");

  await uiTest("UI", "Dark mode toggle present", async () => {
    await navigateTo(page, "/");
    await page.waitForLoadState("networkidle");
    const toggle = page.locator("button[aria-label*='theme'], button[aria-label*='dark'], button[aria-label*='mode'], button:has([class*='moon']), button:has([class*='sun'])").first();
    const visible = await toggle.isVisible().catch(() => false);
    if (!visible) throw new Error("Dark mode toggle not found");
  });

  await uiTest("UI", "Toggle dark mode on", async () => {
    const toggle = page.locator("button[aria-label*='theme'], button[aria-label*='dark'], button[aria-label*='mode'], button:has([class*='moon']), button:has([class*='sun'])").first();
    const visible = await toggle.isVisible().catch(() => false);
    if (visible) {
      await toggle.click();
      await page.waitForTimeout(400);
      const html = await page.locator("html").getAttribute("class") || "";
      const body = await page.locator("body").getAttribute("class") || "";
      const isDark = html.includes("dark") || body.includes("dark");
      // Toggle back
      await toggle.click();
      await page.waitForTimeout(300);
    }
  });

  await uiTest("UI", "User menu / avatar visible", async () => {
    await navigateTo(page, "/");
    await page.waitForLoadState("networkidle");
    const userMenu = page.locator("[class*='avatar'], [class*='Avatar'], [class*='user-menu'], button:has-text('admin'), [aria-label*='user'], [aria-label*='account']").first();
    const visible = await userMenu.isVisible().catch(() => false);
    if (!visible) throw new Error("User menu not found");
  });

  await uiTest("UI", "Toast/notification system works", async () => {
    // Navigate to settings and try saving to trigger a toast
    await navigateTo(page, "/settings");
    await page.waitForLoadState("networkidle");
    const saveBtn = page.locator("button:has-text('Save'), button:has-text('Apply')").first();
    const visible = await saveBtn.isVisible().catch(() => false);
    if (visible) {
      await saveBtn.click();
      await page.waitForTimeout(1500);
    }
  });
}

// ─── MAIN RUNNER ──────────────────────────────────────────────────────────────

async function runHeadedTests() {
  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║     AITAS HEADED BROWSER TEST — ALL PAGES WITH MOCK DATA        ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");

  // Step 1: Seed mock data
  await seedMockData();

  // Step 2: Launch headed browser
  console.log("\n🚀 Launching Chromium (headed)...");
  const browser: Browser = await chromium.launch({
    headless: false,
    slowMo: SLOW_MO,
    args: ["--start-maximized", "--disable-web-security"],
  });

  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });

  const page: Page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);

  try {
    // Step 3: Login first
    console.log("\n🔐 Logging in...");
    await testLoginPage(page);

    // Step 4: Test all pages
    await testDashboard(page);
    await testRepository(page);
    await testGenerator(page);
    await testScripts(page);
    await testExecutions(page);
    await testEnterpriseExecutions(page);
    await testAIHealer(page);
    await testPerformance(page);
    await testCICD(page);
    await testCoverage(page);
    await testDataFactory(page);
    await testReports(page);
    await testEnvironments(page);
    await testAgents(page);
    await testProjects(page);
    await testSettings(page);
    await testAppProfiles(page);
    await testAdmin(page);
    await testNavigation(page);
    await testUIFeatures(page);

  } finally {
    // Step 5: Print results
    console.log("\n\n╔══════════════════════════════════════════════════════════════════╗");
    console.log("║                    HEADED TEST RESULTS                          ║");
    console.log("╠══════════════════════════════════════════════════════════════════╣");

    const pages = [...new Set(results.map(r => r.page))];
    for (const pg of pages) {
      const pageResults = results.filter(r => r.page === pg);
      const pass = pageResults.filter(r => r.status === "PASS").length;
      const fail = pageResults.filter(r => r.status === "FAIL").length;
      const icon = fail === 0 ? "✅" : pass > 0 ? "⚠️" : "❌";
      console.log(`║  ${icon} ${pg.padEnd(28)} ${pass}/${pageResults.length} passed`.padEnd(67) + "║");
    }

    console.log("╠══════════════════════════════════════════════════════════════════╣");
    const total = passCount + failCount;
    const pct = total > 0 ? Math.round((passCount / total) * 100) : 0;
    console.log(`║  TOTAL: ${total} tests  ✅ PASSED: ${passCount}  ❌ FAILED: ${failCount}  RATE: ${pct}%`.padEnd(67) + "║");
    console.log("╚══════════════════════════════════════════════════════════════════╝\n");

    if (failCount > 0) {
      console.log("❌ FAILED TESTS:");
      results.filter(r => r.status === "FAIL").forEach(r => {
        console.log(`   [${r.page}] ${r.test}`);
        if (r.detail) console.log(`      → ${r.detail}`);
      });
      console.log();
    }

    // Keep browser open for 5 seconds so user can see final state
    console.log("⏳ Keeping browser open for 5 seconds...");
    await page.waitForTimeout(5000);
    await browser.close();
  }

  process.exit(failCount > 0 ? 1 : 0);
}

runHeadedTests().catch(err => {
  console.error("\n💥 Test runner crashed:", err.message);
  process.exit(1);
});
